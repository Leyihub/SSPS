import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { BASE_GATEWAY, MASTER_STORE, SYNC_LOG, VOYAGE_STORE } from '../../ports/tokens';
import type { MasterStorePort } from '../../ports/master-store.port';
import type { SyncLogPort } from '../../ports/sync-log.port';
import type { VoyageStorePort } from '../../ports/voyage-store.port';
import type { BaseGateway, TableKey } from '../../lark/gateway';
import { COLS_A, COLS_B } from '../../domain/compat-columns';
import { COMPAT_A_BIZ, COMPAT_B_BIZ, compatRowsA, compatRowsB, type CompatInput, type CompatRow } from '../../domain/compat';
import { deriveStatus } from '../../domain/status';
import type { Actor } from '../../domain/voyage';
import { VoyageService } from '../voyage/voyage.service';

/**
 * A26：兼容表 T09a / T09b 的全量重写（每日 15:50 的定时任务触发；航次保存后只打「待刷新」标记，由下一次触发顺带刷新）。
 * 飞书多维表格没有「先写新表再切换」，所以采用对读取方干扰最小的做法：按现有行的顺序就地覆盖，多出来的行新增，少了的行删除——
 * 表里始终有数据，不会出现整表清空的空窗。写入经单线程队列、每批 ≤500 条（网关内部切批）。
 */
@Injectable()
export class CompatService {
  constructor(
    @Inject(VOYAGE_STORE) private readonly voyages: VoyageStorePort,
    @Inject(MASTER_STORE) private readonly master: MasterStorePort,
    @Inject(BASE_GATEWAY) private readonly gw: BaseGateway | null,
    voyageSvc: VoyageService,
    @Optional() @Inject(SYNC_LOG) private readonly log?: SyncLogPort,
  ) { voyageSvc.onSaved = () => { this.dirty = true; }; }

  clock: () => Date = () => new Date();
  /** 有航次保存过、还没刷新到兼容表。进程重启会丢，但每日全量刷新兜底 */
  dirty = false;
  private running: Promise<unknown> | null = null;

  private now() { return this.clock().toISOString().slice(0, 16).replace('T', ' '); }

  /** a 为 null = 定时任务；否则必须是系统管理员。onlyIfDirty：只在有待刷新标记时才刷（增量触发用） */
  async refresh(a: Actor | null, onlyIfDirty = false) {
    if (a && a.role !== '系统管理员') throw new BusinessException(ResponseCode.FORBIDDEN, '只有系统管理员或定时任务可以刷新兼容表', HttpStatus.FORBIDDEN);
    if (!this.gw) throw new BusinessException(ResponseCode.SERVICE_UNAVAILABLE, '飞书多维表格没有配置，无法刷新兼容表', HttpStatus.SERVICE_UNAVAILABLE);
    if (onlyIfDirty && !this.dirty) return { skipped: true as const, a: 0, b: 0 };
    if (this.running) await this.running.catch(() => undefined);                       // 同一时刻只跑一轮
    const start = this.now();
    const job = this.doRefresh();
    this.running = job;
    try {
      const r = await job;
      await this.log?.add({ type: '兼容表刷新', start, end: this.now(), n: r.a + r.b, ok: '成功', err: '' });
      return { skipped: false as const, ...r };
    } catch (e: any) {
      await this.log?.add({ type: '兼容表刷新', start, end: this.now(), n: 0, ok: '失败', err: String(e?.message ?? e).slice(0, 300) });
      throw e;
    } finally { this.running = null; }
  }

  private async doRefresh() {
    this.dirty = false;                                           // 先清标记：刷新过程中又有保存，会重新置位，留给下一次
    try {
      const vessels = new Map((await this.master.vessels()).map((v) => [v.name.toUpperCase(), v]));
      const all = (await this.voyages.list()).map((v) => ({ ...v, status: deriveStatus(v) }));
      all.sort((x, y) => x.id.localeCompare(y.id));
      const inputs: CompatInput[] = [];
      for (const v of all) {
        const ves = v.vessel ? vessels.get(v.vessel.toUpperCase()) : undefined;
        inputs.push({ voyage: v, cargo: await this.voyages.cargo(v.id), settlement: v.biz === '大宗采购船' ? await this.voyages.settlement(v.id) : null, sales: v.biz === '成品销售船' ? await this.voyages.salesExt(v.id) : null, mmsi: ves?.mmsi ?? null, imo: ves?.imo ?? null });
      }
      const today = this.clock().toISOString().slice(0, 10);
      const a = compatRowsA(inputs.filter((i) => COMPAT_A_BIZ.includes(i.voyage.biz))), b = compatRowsB(inputs.filter((i) => COMPAT_B_BIZ.includes(i.voyage.biz)), today);
      await this.rewrite('T09a', COLS_A, a); await this.rewrite('T09b', COLS_B, b);
      return { a: a.length, b: b.length };
    } catch (e) { this.dirty = true; throw e; }
  }

  private async rewrite(table: TableKey, cols: readonly string[], rows: CompatRow[]) {
    const gw = this.gw!, ids = await gw.ids(table), full = (r: CompatRow) => Object.fromEntries(cols.map((c) => [c, r[c] ?? '']));
    const keep = Math.min(ids.length, rows.length);
    if (keep) await gw.update(table, ids.slice(0, keep).map((id, i) => ({ record_id: id, fields: full(rows[i]) })));
    if (rows.length > keep) await gw.create(table, rows.slice(keep).map((r) => ({ fields: full(r) })));
    if (ids.length > keep) await gw.remove(table, ids.slice(keep));
  }
}
