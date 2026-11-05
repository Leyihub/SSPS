import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { DIRECTORY_PORT, MASTER_STORE, VOYAGE_STORE } from '../../ports/tokens';
import type { DirectoryPort } from '../../ports/directory.port';
import type { MasterStorePort } from '../../ports/master-store.port';
import type { VoyageStorePort } from '../../ports/voyage-store.port';
import type { Berth, RouteRuleRow } from '../../domain/types';
import { COUNTRIES, PortRow, TERMINALS, VESSEL_TYPES, VesselRow, portMatches, vesselKeys, vesselMatches } from '../../domain/master';
import { Actor } from '../../domain/voyage';
import { BIZ, deriveFields } from '../../domain/status';
import { canAddVessel, canMaintainMaster, canMaintainRoutes } from '../../domain/permissions';
import { buildRule, recomputeRules } from '../../domain/routeRules';

type Bag = Record<string, unknown>;
const fail = (code: ResponseCode, msg: string, http: HttpStatus) => new BusinessException(code, msg, http);
const forbidden = (msg: string) => fail(ResponseCode.FORBIDDEN, msg, HttpStatus.FORBIDDEN);
const invalid = (msg: string) => fail(ResponseCode.VALIDATION_ERROR, msg, HttpStatus.UNPROCESSABLE_ENTITY);
const conflict = (msg: string) => fail(ResponseCode.CONFLICT, msg, HttpStatus.CONFLICT);
const notFound = (msg: string) => fail(ResponseCode.NOT_FOUND, msg, HttpStatus.NOT_FOUND);
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean) : text(v) ? text(v).split(/[,，、;；\n]/).map(text).filter(Boolean) : []);
const num = (v: unknown, label: string, errs: string[], opt = false): number | null => {
  if (v == null || v === '') { if (!opt) errs.push(label + '必填'); return null; }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) { errs.push(label + '必须是大于 0 的数字'); return null; }
  return n;
};
const only = (b: Bag, allowed: string[]) => { const bad = Object.keys(b || {}).filter((k) => !allowed.includes(k)); if (bad.length) throw invalid('不能修改字段：' + bad.join('、')); };

@Injectable()
export class MasterService {
  constructor(
    @Inject(MASTER_STORE) private readonly store: MasterStorePort,
    @Inject(VOYAGE_STORE) private readonly voyages: VoyageStorePort,
    @Inject(DIRECTORY_PORT) private readonly dir: DirectoryPort,
  ) {}

  actor(ctx: { userId?: string; userName?: string; roles?: string[] }) { return this.dir.resolve(ctx || {}); }

  /** 时钟：测试和演示里替换 */
  clock: () => Date = () => new Date();

  /** A01：当前用户；today 供前端判断「本周」「ETA 过期」，和服务端口径一致 */
  me(a: Actor) { return { userId: a.userId, name: a.name, role: a.role, dept: a.dept, today: this.clock().toISOString().slice(0, 10) }; }

  // ---------------- 港口 ----------------
  async ports(q?: string) { const all = await this.store.ports(); return q ? all.filter((p) => portMatches(p, q)) : all; }

  private cleanPort(b: Bag, base?: PortRow): PortRow {
    const errs: string[] = [];
    const en = text(b.en ?? base?.en).toUpperCase(), cn = text(b.cn ?? base?.cn);
    if (!/^[A-Z][A-Z0-9 ._-]*$/.test(en)) errs.push('英文标准名必填，只能是大写字母、数字、空格和 . _ -');
    if (!cn) errs.push('中文名称必填');
    const country = text(b.country ?? base?.country ?? '其他'), kind = text(b.kind ?? base?.kind ?? '外港');
    if (!COUNTRIES.includes(country)) errs.push('国家只能是：' + COUNTRIES.join('、'));
    if (!['内港', '外港'].includes(kind)) errs.push('性质只能是内港或外港');
    const status = text(b.status ?? base?.status ?? '启用');
    if (!['启用', '停用'].includes(status)) errs.push('状态只能是启用或停用');
    if (errs.length) throw invalid(errs.join('；'));
    return { code: text(b.code ?? base?.code), en, cn, alias: 'alias' in b ? list(b.alias) : base?.alias ?? [], country, region: text(b.region ?? base?.region), kind: kind as PortRow['kind'], isLocal: 'isLocal' in b ? b.isLocal === true : !!base?.isLocal, status: status as PortRow['status'] };
  }
  async addPort(b: Bag, a: Actor, key?: string) {
    if (!canMaintainMaster(a)) throw forbidden('只有物流管理员和系统管理员可以维护港口');
    const row = this.cleanPort(b), all = await this.store.ports();
    if (all.some((p) => p.en === row.en)) throw conflict('港口已存在：' + row.en);
    if (row.isLocal && all.some((p) => p.isLocal)) throw conflict('已经有本港了，只能有一个');
    const clash = this.aliasClash(row, all); if (clash) throw conflict(clash);
    return this.store.savePort(row, key);
  }
  async patchPort(en: string, b: Bag, a: Actor, key?: string) {
    if (!canMaintainMaster(a)) throw forbidden('只有物流管理员和系统管理员可以维护港口');
    only(b, ['code', 'cn', 'alias', 'country', 'region', 'kind', 'status']);        // 英文标准名和是否本港是港口身份，不允许改
    const all = await this.store.ports(), old = all.find((p) => p.en === en);
    if (!old) throw notFound('找不到港口：' + en);
    if (old.isLocal && b.status === '停用') throw invalid('本港不能停用');
    const row = this.cleanPort(b, old), clash = this.aliasClash(row, all.filter((p) => p.en !== en)); if (clash) throw conflict(clash);
    return this.store.savePort(row, key);
  }
  private aliasClash(row: PortRow, others: PortRow[]) {
    for (const o of others) for (const x of [row.cn, ...row.alias]) if (x && [o.cn, ...o.alias].includes(x)) return '「' + x + '」已被港口 ' + o.en + ' 使用，别名不能重复';
    return null;
  }

  // ---------------- 泊位 ----------------
  berths() { return this.store.berths(); }
  private cleanBerth(b: Bag, base?: Berth): Berth {
    const errs: string[] = [], code = text(b.code ?? base?.code).toUpperCase(), terminal = text(b.terminal ?? base?.terminal), status = text(b.status ?? base?.status ?? '启用');
    if (!/^[A-Z]{1,3}\d{1,3}$/.test(code)) errs.push('泊位编码格式不对（如 F1、LN16）');
    if (!TERMINALS.includes(terminal)) errs.push('码头只能是：' + TERMINALS.join('、'));
    const capacity = num('capacity' in b ? b.capacity : base?.capacity, '容量吨级', errs);
    if (!['启用', '停用'].includes(status)) errs.push('状态只能是启用或停用');
    if (errs.length) throw invalid(errs.join('；'));
    return { code, terminal, capacity: capacity as number, status: status as Berth['status'], category: text(b.category ?? base?.category) || undefined, basis: text(b.basis ?? base?.basis) || undefined, note: text(b.note ?? base?.note) || undefined };
  }
  async addBerth(b: Bag, a: Actor, key?: string) {
    if (!canMaintainMaster(a)) throw forbidden('只有物流管理员和系统管理员可以维护泊位');
    const row = this.cleanBerth(b);
    if ((await this.store.berths()).some((x) => x.code === row.code)) throw conflict('泊位已存在：' + row.code);
    return this.store.saveBerth(row, key);
  }
  async patchBerth(code: string, b: Bag, a: Actor, key?: string) {
    if (!canMaintainMaster(a)) throw forbidden('只有物流管理员和系统管理员可以维护泊位');
    only(b, ['terminal', 'capacity', 'category', 'status', 'basis', 'note']);
    const old = (await this.store.berths()).find((x) => x.code === code);
    if (!old) throw notFound('找不到泊位：' + code);
    return this.store.saveBerth(this.cleanBerth(b, old), key);
  }

  // ---------------- 船舶 ----------------
  async vessels(q?: string) { const all = await this.store.vessels(); return q ? all.filter((v) => vesselMatches(v, q)) : all; }
  private cleanVessel(b: Bag, base?: VesselRow): Omit<VesselRow, 'id'> {
    const errs: string[] = [], name = text(b.name ?? base?.name).toUpperCase(), type = text(b.type ?? base?.type ?? '散货船');
    if (!name) errs.push('标准船名必填');
    if (!VESSEL_TYPES.includes(type)) errs.push('船型只能是：' + VESSEL_TYPES.join('、'));
    const mmsi = text(b.mmsi ?? base?.mmsi) || null, imo = text(b.imo ?? base?.imo) || null;
    if (mmsi && !/^\d{9}$/.test(mmsi)) errs.push('MMSI 是 9 位数字');
    if (imo && !/^\d{7}$/.test(imo)) errs.push('IMO 是 7 位数字');
    const dwt = num('dwt' in b ? b.dwt : base?.dwt, '载重吨', errs, true), length = num('length' in b ? b.length : base?.length, '船长', errs, true);
    if (errs.length) throw invalid(errs.join('；'));
    return { name, alias: 'alias' in b ? list(b.alias) : base?.alias ?? [], mmsi, imo, type, dwt, length, tier: dwt ? (dwt >= 100000 ? '10 万吨' : dwt >= 50000 ? '5 万吨' : null) : null };
  }
  private async vesselClash(row: Pick<VesselRow, 'name' | 'alias' | 'imo' | 'mmsi'>, selfId?: string) {
    const others = (await this.store.vessels()).filter((v) => v.id !== selfId), mine = vesselKeys(row);
    for (const o of others) {
      if (vesselKeys(o).some((k) => mine.includes(k))) return '船名「' + row.name + '」与已有船舶 ' + o.name + ' 重复（含别名）';
      if (row.imo && o.imo === row.imo) return 'IMO ' + row.imo + ' 已属于船舶 ' + o.name;
      if (row.mmsi && o.mmsi === row.mmsi) return 'MMSI ' + row.mmsi + ' 已属于船舶 ' + o.name;
    }
    return null;
  }
  async addVessel(b: Bag, a: Actor, key?: string) {
    if (!canAddVessel(a)) throw forbidden('当前角色不能新增船舶');
    const row = this.cleanVessel(b), c = await this.vesselClash(row); if (c) throw conflict(c);
    return this.store.saveVessel(row, key);
  }
  async patchVessel(id: string, b: Bag, a: Actor, key?: string) {
    if (!canMaintainMaster(a)) throw forbidden('只有物流管理员和系统管理员可以修改船舶资料');
    only(b, ['name', 'alias', 'mmsi', 'imo', 'type', 'dwt', 'length']);
    const old = (await this.store.vessels()).find((v) => v.id === id);
    if (!old) throw notFound('找不到船舶：' + id);
    const row = this.cleanVessel(b, old), c = await this.vesselClash(row, id); if (c) throw conflict(c);
    return this.store.saveVessel({ ...row, id }, key);
  }

  // ---------------- 航程规则 ----------------
  /** A04：规则带采用口径和生效航程 */
  async routeRules() { return (await this.store.routeRules()).map((r) => buildRule(r)); }

  private async cleanRule(b: Bag, base?: RouteRuleRow): Promise<Omit<RouteRuleRow, 'id'>> {
    const errs: string[] = [], ports = await this.store.ports();
    const load = text(b.load ?? base?.load).toUpperCase(), disch = text(b.disch ?? base?.disch).toUpperCase();
    for (const [p, label] of [[load, '装港'], [disch, '卸港']] as const) if (!ports.some((x) => x.en === p && x.status === '启用')) errs.push(label + '「' + p + '」不是启用的标准港口');
    if (load && load === disch) errs.push('装港和卸港不能相同');
    const biz = ('biz' in b ? list(b.biz) : base?.biz ?? []) as RouteRuleRow['biz'];
    if (!biz.length || biz.some((x) => !Object.values(BIZ).includes(x))) errs.push('适用业务类型必填，只能是：' + Object.values(BIZ).join('、'));
    const exp = num('exp' in b ? b.exp : base?.exp, '经验航程', errs), expMax = num('expMax' in b ? b.expMax : base?.expMax, '经验航程上限', errs);
    if (exp != null && expMax != null && expMax < exp) errs.push('经验航程上限不能小于经验航程');
    const status = text(b.status ?? base?.status ?? '启用');
    if (!['启用', '停用'].includes(status)) errs.push('状态只能是启用或停用');
    if (errs.length) throw invalid(errs.join('；'));
    return { load, disch, biz, exp, expMax, samples: base?.samples ?? 0, p50: base?.p50 ?? null, p80: base?.p80 ?? null, tier: base?.tier ?? null, status };
  }
  /** 同一条航线的同一种业务类型只能有一条启用的规则 */
  private ruleClash(row: Omit<RouteRuleRow, 'id'>, others: RouteRuleRow[]) {
    if (row.status !== '启用') return null;
    const o = others.find((x) => x.status !== '停用' && x.load === row.load && x.disch === row.disch && x.biz.some((t) => row.biz.includes(t)));
    return o ? '航线 ' + row.load + ' → ' + row.disch + ' 的 ' + o.biz.filter((t) => row.biz.includes(t)).join('、') + ' 已有启用的规则 ' + o.id : null;
  }
  async addRouteRule(b: Bag, a: Actor, key?: string) {
    if (!canMaintainRoutes(a)) throw forbidden('只有部门主管和系统管理员可以维护经验航程');
    const row = await this.cleanRule(b), c = this.ruleClash(row, await this.store.routeRules()); if (c) throw conflict(c);
    return buildRule(await this.store.saveRouteRule(row, key));
  }
  async patchRouteRule(id: string, b: Bag, a: Actor, key?: string) {
    if (!canMaintainRoutes(a)) throw forbidden('只有部门主管和系统管理员可以维护经验航程');
    only(b, ['exp', 'expMax', 'biz', 'status']);                              // 航线（装卸港）是规则的身份；统计列只由重算写
    const all = await this.store.routeRules(), old = all.find((r) => r.id === id);
    if (!old) throw notFound('找不到航程规则：' + id);
    const row = await this.cleanRule(b, old), c = this.ruleClash(row, all.filter((r) => r.id !== id)); if (c) throw conflict(c);
    return buildRule(await this.store.saveRouteRule({ ...row, id }, key));
  }

  /** A06：用已完成航次重算样本数和 P50/P80。定时任务每日调用（job=true 不查权限） */
  async recomputeRouteRules(a: Actor | null) {
    if (a && a.role !== '系统管理员') throw forbidden('只有系统管理员可以手动重算航程规则');
    const rules = await this.store.routeRules(), vs = await this.voyages.list();
    const withDays = vs.map((v) => ({ ...v, voyageDays: (deriveFields(v) as any).voyageDays })) as any[];
    const next = recomputeRules(rules as any, withDays) as any[];
    const stats = next.map((r) => ({ id: r.id, samples: r.samples, p50: r.p50, p80: r.p80 }));
    const changed = stats.filter((s) => { const o = rules.find((x) => x.id === s.id)!; return o.samples !== s.samples || o.p50 !== s.p50 || o.p80 !== s.p80; });
    await this.store.saveRouteStats(stats);
    return { rules: next.length, changed: changed.length, switched: next.filter((r) => r.basis === '统计值').map((r) => r.id) };
  }
}
