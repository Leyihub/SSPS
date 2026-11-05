import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { DIRECTORY_PORT, IMPORT_STORE, MASTER_STORE, VOYAGE_STORE } from '../../ports/tokens';
import type { DirectoryPort } from '../../ports/directory.port';
import type { ImportStorePort, BerthRow } from '../../ports/import-store.port';
import type { MasterStorePort } from '../../ports/master-store.port';
import type { VoyageStorePort } from '../../ports/voyage-store.port';
import type { Actor } from '../../domain/voyage';
import { canImport } from '../../domain/permissions';
import { HEADER_ALIASES, normalizeBerthPlan } from '../../importers/imipPlan';
import { buildInventory } from '../../importers/inventory';
import { readXlsx } from '../../lib/xlsx';
import { dn } from '../../lib/dates';
import { project, stockout } from '../../engine/stock';

type Source = '飞书云空间' | '手动上传';
export interface ImportInput { fileName: string; rows: Array<Record<string, unknown>>; planDate?: string; source?: Source; fileToken?: string }

const fail = (code: ResponseCode, msg: string, http: HttpStatus) => new BusinessException(code, msg, http);
const invalid = (msg: string) => fail(ResponseCode.VALIDATION_ERROR, msg, HttpStatus.UNPROCESSABLE_ENTITY);
const ymd = (s: string) => s.replace(/-/g, '');
const normName = (s: string | null | undefined) => String(s || '').toUpperCase().replace(/[\s\-_.]/g, '');
const REQUIRED_PLAN: Array<[keyof typeof HEADER_ALIASES, string]> = [['berth', '泊位'], ['vessel', '船名'], ['eta', '预计到港日期'], ['etb', '预计靠泊时间'], ['etd', '预计卸完时间']];
const REQUIRED_INV = ['品名', '库存日期', '库存', '日耗'];

@Injectable()
export class ImportsService {
  constructor(
    @Inject(IMPORT_STORE) private readonly store: ImportStorePort,
    @Inject(MASTER_STORE) private readonly master: MasterStorePort,
    @Inject(VOYAGE_STORE) private readonly voyages: VoyageStorePort,
    @Inject(DIRECTORY_PORT) private readonly dir: DirectoryPort,
  ) {}

  /** 测试里替换 */
  clock: () => Date = () => new Date();
  private now() { return this.clock().toISOString().slice(0, 16).replace('T', ' '); }
  private today() { return this.clock().toISOString().slice(0, 10); }
  actor(ctx: { userId?: string; userName?: string; roles?: string[] }) { return this.dir.resolve(ctx || {}); }

  private guard(a: Actor | null) { if (a && !canImport(a)) throw fail(ResponseCode.FORBIDDEN, '只有物流管理员和系统管理员可以导入', HttpStatus.FORBIDDEN); }
  private headersOf(rows: Array<Record<string, unknown>>) { const s = new Set<string>(); for (const r of rows.slice(0, 50)) Object.keys(r).forEach((k) => s.add(k.trim())); return s; }

  /** 上传的 .xlsx → 行。不是有效 Excel 时给 422，不让底层异常变成 500 */
  parseUpload(file: { originalname: string; buffer: Buffer } | undefined, sheetName?: string): { fileName: string; rows: Array<Record<string, unknown>> } {
    if (!file?.buffer?.length) throw invalid('请选择要上传的 Excel 文件');
    if (!/\.xlsx$/i.test(file.originalname)) throw invalid('只支持 .xlsx 文件（旧版 .xls 请先另存为 .xlsx）');
    try { return { fileName: file.originalname, rows: readXlsx(file.buffer, sheetName).rows }; } catch (e: any) { throw invalid('读取 Excel 失败：' + e.message); }
  }

  // ---------------- 靠船计划 ----------------

  /** A17：导入一份 IMIP 靠船计划。a 为 null 表示系统内部（A18 云空间拉取）。整批校验通过才切当前批次 */
  async importBerthPlan(inp: ImportInput, a: Actor | null, key?: string) {
    this.guard(a);
    if (!inp.rows?.length) throw invalid('文件里没有数据行');
    const have = this.headersOf(inp.rows), missing = REQUIRED_PLAN.filter(([k]) => !HEADER_ALIASES[k].some((h) => have.has(h))).map(([, label]) => label);
    if (missing.length) throw invalid('缺少必要的列：' + missing.join('、') + '（表头需与 IMIP 靠船计划一致）');
    if (inp.fileToken && (await this.store.hasFileToken(inp.fileToken))) throw fail(ResponseCode.CONFLICT, '这个文件已经导入过了', HttpStatus.CONFLICT);

    const planDate = inp.planDate || this.today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) throw invalid('计划日期必须是 YYYY-MM-DD');
    const berths = await this.master.berths(), poolCodes = berths.filter((b) => b.status === '启用').map((b) => b.code);
    const res = normalizeBerthPlan(inp.rows, { importDate: planDate, poolCodes }) as any;
    const byVessel = new Map<string, string>();
    for (const v of await this.voyages.list()) if (v.vessel && !(v.flags || []).includes('取消')) byVessel.set(normName(v.vessel), v.id);
    const rows: BerthRow[] = res.rows.map((r: any) => ({ line: r.line, status: r.status, terminal: r.terminal, berthRaw: r.berthRaw, berth: r.berth, inPool: r.inPool, vessel: r.vessel, loa: r.loa ?? null, shipType: r.shipType, cargo: r.cargo, tons: r.tons, owner: r.owner, eta: r.eta, start: r.start, end: r.end, matchVoyage: r.status === 'active' ? byVessel.get(normName(r.vessel)) ?? null : null, issue: r.issue, raw: r.raw }));

    const n = (await this.store.berthBatches()).filter((b) => b.planDate === planDate).length + 1, batchNo = 'BP-' + ymd(planDate) + '-' + String(n).padStart(2, '0');
    const by = a?.name || '系统', s = res.summary;
    const batch = await this.store.saveBerthBatch({
      batchNo, planDate, source: inp.source || '手动上传', fileName: inp.fileName, fileToken: inp.fileToken || null,
      total: s.total, active: s.active, history: s.history, anomaly: s.anomaly, coverTo: res.coverTo, validation: s.anomaly ? '有 ' + s.anomaly + ' 行日期异常，已进数据质量清单' : null,
      status: '成功', importedBy: by, importedAt: this.now(),
    }, rows, key);
    await this.voyages.addIssues(rows.filter((r) => r.status === 'anomaly').map((r) => ({ object: batchNo + '#' + r.line + ' ' + r.vessel, type: '靠船计划日期异常', note: r.issue!.text, owner: by })));
    return { batch, summary: s, coverTo: res.coverTo };
  }
  berthBatches() { return this.store.berthBatches(); }
  async berthBatchRows(batchNo: string, status?: string) {
    const rows = await this.store.berthRows(batchNo);
    if (!rows) throw fail(ResponseCode.NOT_FOUND, '找不到批次：' + batchNo, HttpStatus.NOT_FOUND);
    return rows.filter((r) => !status || r.status === status).map(({ raw, ...r }) => r);
  }

  // ---------------- 库存消耗模拟表 ----------------

  /** A30：导入一期库存。错误值行单独存，不参与断料计算 */
  async importInventory(inp: ImportInput, a: Actor | null, key?: string) {
    this.guard(a);
    if (!inp.rows?.length) throw invalid('文件里没有数据行');
    const have = this.headersOf(inp.rows), missing = REQUIRED_INV.filter((h) => !have.has(h));
    if (missing.length) throw invalid('缺少必要的列：' + missing.join('、'));
    if (inp.fileToken && (await this.store.hasFileToken(inp.fileToken))) throw fail(ResponseCode.CONFLICT, '这个文件已经导入过了', HttpStatus.CONFLICT);
    const res = buildInventory(inp.rows, { today: this.today() }) as any;
    if (!res.items.length) throw invalid('没有可用的库存行（品名、库存日期、库存都需要有效）');
    const importDate = res.summary.importDate || this.today(), n = (await this.store.inventoryBatches()).filter((b) => b.importDate === importDate).length + 1;
    const batch = await this.store.saveInventoryBatch({
      batchNo: 'IV-' + ymd(importDate) + '-' + String(n).padStart(2, '0'), importDate, source: inp.source || '手动上传', fileName: inp.fileName, fileToken: inp.fileToken || null,
      rows: res.summary.rows, items: res.summary.items, errorRows: res.summary.errorRows, status: '成功', importedBy: a?.name || '系统', importedAt: this.now(),
    }, res.items, res.errorRows, key);
    return { batch, summary: res.summary };
  }

  /** 当前库存：每个物料的可用天数摘要（不带整条序列） */
  async inventory() {
    const cur = await this.store.currentInventory();
    return {
      batch: cur.batch, errorRows: cur.errorRows,
      items: cur.items.map((i) => ({ name: i.name, type: i.type, stock: i.stock, daily: i.daily, days: i.days, daysEstimated: !!i.daysEstimated, validUntil: i.validUntil ?? null, errorCount: i.errorCount ?? 0 })),
    };
  }
  inventoryBatches() { return this.store.inventoryBatches(); }

  /**
   * 库存趋势（P02 的库存图和明细表用）：从今天到 until 的模拟库存，以及「加入某几船到货后」的走势。
   * 日期都用引擎的日序号（和预测结果里的 s、e、so 同一口径）。数值全部来自引擎的 project，前端不重算。
   */
  async inventoryTrend(name: string, marks: Array<{ d: number; tons: number }>, until?: number) {
    const cur = await this.store.currentInventory(), it = cur.items.find((x) => x.name === name);
    if (!it) throw fail(ResponseCode.NOT_FOUND, '库存里没有这个物料：' + name, HttpStatus.NOT_FOUND);
    const today = dn(this.today()), end = Math.min(until ?? today + 100, today + 100);
    const series = it.series.filter((x) => x[0] >= today && x[0] <= end);
    return {
      today, until: end, so: stockout(it), series,
      base: project(it, [], end, today),
      lines: (marks || []).slice(0, 2).map((m) => ({ d: m.d, tons: m.tons, pts: project(it, [{ d: m.d, tons: m.tons }], end, today) })),
    };
  }
}
