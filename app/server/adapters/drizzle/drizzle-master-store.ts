import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { mBerth, mPort, mRouteRule, mVessel } from '../../database/schema';
import type { Berth, RouteRuleRow } from '../../domain/types';
import type { PortRow, VesselRow } from '../../domain/master';
import { F, pad } from '../../lark/fieldmap';
import type { BaseGateway } from '../../lark/gateway';
import type { MasterStorePort, RouteStat } from '../../ports/master-store.port';
import { toTs } from './db';
import type { Db } from './db';
import { key as up, loadDict } from './dict';

type Outbox = { execute(key: string, o: { kind: string; payload: any; writeLark: (p: any) => Promise<any>; afterWrite?: (r: any, p: any) => Promise<unknown>; table?: string; operation?: 'create' | 'update' | 'delete' }): Promise<{ result: any; replayed: boolean }> };
const nul = <T,>(v: T | '' | undefined | null) => (v === '' || v === undefined ? null : v);
const refMissing = (what: string, name: string) => new BusinessException(ResponseCode.VALIDATION_ERROR, `${what}「${name}」不在主数据里，请先到主数据维护`, HttpStatus.UNPROCESSABLE_ENTITY);

/** 主数据（T01 港口、T02 泊位、T03 船舶、T08 航程规则）：读镜像表；写 = 先写飞书（经写队列和幂等键）→ 成功后回写镜像行 */
export class DrizzleMasterStore implements MasterStorePort {
  constructor(private readonly db: Db, private readonly lark: BaseGateway, private readonly outbox: Outbox) {}

  /** 写飞书成功后回写镜像行。写成功但回写失败时由补偿任务（replayHandlers）重放，必须可重复执行 */
  private after = {
    'port.save': async (res: any, pl: any) => {
      const v = { baseRecordId: res.rid, portCode: nul(pl.p.code), chineseName: pl.p.cn, englishStandardName: pl.p.en, alias: pl.p.alias.join('\n') || null, country: pl.p.country, region: nul(pl.p.region), nature: pl.p.kind, isLocalPort: pl.p.isLocal, status: pl.p.status };
      await this.db.insert(mPort).values(v).onConflictDoUpdate({ target: mPort.baseRecordId, set: v });
    },
    'berth.save': async (res: any, pl: any) => {
      const v = { baseRecordId: res.rid, berthCode: pl.b.code, wharf: pl.b.terminal, capacityTonnage: pl.b.capacity, berthCategory: nul(pl.b.category), status: pl.b.status, basisVersion: nul(pl.b.basis), remark: nul(pl.b.note) };
      await this.db.insert(mBerth).values(v).onConflictDoUpdate({ target: mBerth.baseRecordId, set: v });
    },
    'vessel.save': async (res: any, pl: any) => {
      const x = { baseRecordId: res.rid, shipNo: res.no, appMmsi: nul(pl.v.mmsi), appImo: nul(pl.v.imo), standardShipName: pl.v.name, shipNameAlias: pl.v.alias.join('\n') || null, shipType: pl.v.type, dwt: pl.v.dwt, shipLengthM: pl.v.length == null ? null : String(pl.v.length), tonnageClass: pl.v.tier };
      await this.db.insert(mVessel).values(x).onConflictDoUpdate({ target: mVessel.baseRecordId, set: x });
    },
    'route.save': async (res: any, pl: any) => {
      const x = { baseRecordId: res.rid, ruleNo: res.no, loadPort: pl.lr, dischargePort: pl.dr, applicableBusinessType: pl.r.biz as string[], experienceVoyageDay: pl.r.exp == null ? null : String(pl.r.exp), experienceVoyageMaxDay: pl.r.expMax == null ? null : String(pl.r.expMax), appStatus: pl.r.status ?? '启用' };
      await this.db.insert(mRouteRule).values(x).onConflictDoUpdate({ target: mRouteRule.baseRecordId, set: x });
    },
  };
  replayHandlers() { return this.after; }

  // ---------------- 港口 ----------------
  async ports(): Promise<PortRow[]> {
    const rows = await this.db.select().from(mPort).orderBy(mPort.portCode, mPort.englishStandardName);
    return rows.map((r) => ({ code: r.portCode ?? '', en: r.englishStandardName ?? '', cn: r.chineseName ?? '', alias: (r.alias ?? '').split(/\n/).map((x) => x.trim()).filter(Boolean), country: r.country ?? '其他', region: r.region ?? '', kind: (r.nature ?? '外港') as PortRow['kind'], isLocal: !!r.isLocalPort, status: (r.status ?? '启用') as PortRow['status'] }));
  }
  async savePort(p: PortRow, key?: string): Promise<PortRow> {
    const [cur] = await this.db.select({ r: mPort.baseRecordId }).from(mPort).where(eq(mPort.englishStandardName, p.en));
    const fields = { [F.T01.code]: nul(p.code), [F.T01.cn]: p.cn, [F.T01.en]: p.en, [F.T01.alias]: p.alias.join('\n'), [F.T01.country]: p.country, [F.T01.region]: nul(p.region), [F.T01.kind]: p.kind, [F.T01.isLocal]: p.isLocal, [F.T01.status]: p.status };
    await this.outbox.execute(key ?? randomUUID(), {
      kind: 'port.save', table: 'T01', operation: cur ? 'update' : 'create', payload: { p, rid: cur?.r ?? null, fields: stripNull(fields, !cur) },
      writeLark: async (pl) => (pl.rid ? (await this.lark.update('T01', [{ record_id: pl.rid, fields: pl.fields }]), { rid: pl.rid }) : { rid: (await this.lark.create('T01', [{ fields: pl.fields }]))[0].record_id }),
      afterWrite: this.after['port.save'],
    });
    return (await this.ports()).find((x) => x.en === p.en)!;
  }

  // ---------------- 泊位 ----------------
  async berths(): Promise<Berth[]> {
    const rows = await this.db.select().from(mBerth).orderBy(mBerth.berthCode);
    return rows.map((r) => ({ code: r.berthCode ?? '', terminal: r.wharf ?? '', capacity: Number(r.capacityTonnage ?? 0), status: (r.status ?? '启用') as Berth['status'], category: r.berthCategory ?? undefined, basis: r.basisVersion ?? undefined, note: r.remark ?? undefined }));
  }
  async saveBerth(b: Berth, key?: string): Promise<Berth> {
    const [cur] = await this.db.select({ r: mBerth.baseRecordId, eff: mBerth.effectiveDate }).from(mBerth).where(eq(mBerth.berthCode, b.code));
    const fields = { [F.T02.code]: b.code, [F.T02.terminal]: b.terminal, [F.T02.capacity]: b.capacity, [F.T02.category]: nul(b.category), [F.T02.status]: b.status, [F.T02.basis]: nul(b.basis), [F.T02.note]: nul(b.note) };
    await this.outbox.execute(key ?? randomUUID(), {
      kind: 'berth.save', table: 'T02', operation: cur ? 'update' : 'create', payload: { b, rid: cur?.r ?? null, fields: stripNull(fields, !cur) },
      writeLark: async (pl) => (pl.rid ? (await this.lark.update('T02', [{ record_id: pl.rid, fields: pl.fields }]), { rid: pl.rid }) : { rid: (await this.lark.create('T02', [{ fields: pl.fields }]))[0].record_id }),
      afterWrite: this.after['berth.save'],
    });
    return (await this.berths()).find((x) => x.code === b.code)!;
  }

  // ---------------- 船舶 ----------------
  private vesselOf(r: typeof mVessel.$inferSelect): VesselRow {
    return { id: 'V-' + pad(Number(r.shipNo ?? 0)), name: r.standardShipName ?? '', alias: (r.shipNameAlias ?? '').split(/\n/).map((x) => x.trim()).filter(Boolean), mmsi: r.appMmsi, imo: r.appImo, type: r.shipType ?? '其他', dwt: r.dwt == null ? null : Number(r.dwt), length: r.shipLengthM == null ? null : Number(r.shipLengthM), tier: r.tonnageClass };
  }
  async vessels(): Promise<VesselRow[]> { return (await this.db.select().from(mVessel).orderBy(mVessel.shipNo)).map((r) => this.vesselOf(r)); }
  async saveVessel(v: Omit<VesselRow, 'id'> & { id?: string }, key?: string): Promise<VesselRow> {
    const no = v.id ? Number(v.id.replace(/\D/g, '')) : null;
    const [cur] = no == null ? [] : await this.db.select({ r: mVessel.baseRecordId }).from(mVessel).where(eq(mVessel.shipNo, no));
    if (v.id && !cur) throw new BusinessException(ResponseCode.NOT_FOUND, '找不到船舶：' + v.id, HttpStatus.NOT_FOUND);
    const fields = { [F.T03.mmsi]: nul(v.mmsi), [F.T03.imo]: nul(v.imo), [F.T03.name]: v.name, [F.T03.alias]: v.alias.join('\n'), [F.T03.type]: v.type, [F.T03.dwt]: v.dwt, [F.T03.length]: v.length };
    const r = await this.outbox.execute(key ?? randomUUID(), {
      kind: 'vessel.save', table: 'T03', operation: cur ? 'update' : 'create', payload: { v, rid: cur?.r ?? null, fields: stripNull(fields, !cur) },
      writeLark: async (pl) => { if (pl.rid) { await this.lark.update('T03', [{ record_id: pl.rid, fields: pl.fields }]); return { rid: pl.rid, no }; } const rec = (await this.lark.create('T03', [{ fields: pl.fields }]))[0]; return { rid: rec.record_id, no: Number(rec.fields['船舶编号']) }; },
      afterWrite: this.after['vessel.save'],
    });
    return (await this.vessels()).find((x) => x.id === 'V-' + pad(r.result.no))!;
  }

  // ---------------- 航程规则 ----------------
  async routeRules(): Promise<RouteRuleRow[]> {
    const [rows, d] = await Promise.all([this.db.select().from(mRouteRule).orderBy(mRouteRule.ruleNo), loadDict(this.db)]);
    return rows.map((r) => ({ id: 'R-' + pad(Number(r.ruleNo ?? 0), 3), load: d.portByRid.get(r.loadPort ?? '') ?? r.loadPort ?? '', disch: d.portByRid.get(r.dischargePort ?? '') ?? r.dischargePort ?? '', biz: (r.applicableBusinessType ?? []) as RouteRuleRow['biz'], exp: r.experienceVoyageDay == null ? null : Number(r.experienceVoyageDay), expMax: r.experienceVoyageMaxDay == null ? null : Number(r.experienceVoyageMaxDay), samples: Number(r.sampleCount ?? 0), p50: r.statP50Day == null ? null : Number(r.statP50Day), p80: r.statP80Day == null ? null : Number(r.statP80Day), tier: r.tonnageGrade, status: r.appStatus ?? '启用' }));
  }
  async saveRouteRule(r: Omit<RouteRuleRow, 'id'> & { id?: string }, key?: string): Promise<RouteRuleRow> {
    const d = await loadDict(this.db), no = r.id ? Number(r.id.replace(/\D/g, '')) : null;
    const lr = d.ridByPort.get(up(r.load)), dr = d.ridByPort.get(up(r.disch));
    if (!lr) throw refMissing('装港', r.load); if (!dr) throw refMissing('卸港', r.disch);
    const [cur] = no == null ? [] : await this.db.select({ r: mRouteRule.baseRecordId }).from(mRouteRule).where(eq(mRouteRule.ruleNo, no));
    if (r.id && !cur) throw new BusinessException(ResponseCode.NOT_FOUND, '找不到航程规则：' + r.id, HttpStatus.NOT_FOUND);
    const fields = { [F.T08.load]: [lr], [F.T08.disch]: [dr], [F.T08.biz]: r.biz, [F.T08.exp]: r.exp, [F.T08.expMax]: r.expMax, [F.T08.status]: r.status ?? '启用' };
    const out = await this.outbox.execute(key ?? randomUUID(), {
      kind: 'route.save', table: 'T08', operation: cur ? 'update' : 'create', payload: { r, lr, dr, rid: cur?.r ?? null, fields },
      writeLark: async (pl) => { if (pl.rid) { await this.lark.update('T08', [{ record_id: pl.rid, fields: pl.fields }]); return { rid: pl.rid, no }; } const rec = (await this.lark.create('T08', [{ fields: pl.fields }]))[0]; return { rid: rec.record_id, no: Number(rec.fields['规则编号']) }; },
      afterWrite: this.after['route.save'],
    });
    return (await this.routeRules()).find((x) => x.id === 'R-' + pad(out.result.no, 3))!;
  }
  /** 每日重算只写统计列（样本数、P50、P80、最近重算时间），覆盖式、可重复执行，不经幂等键 */
  async saveRouteStats(stats: RouteStat[]) {
    const now = new Date();
    for (const s of stats) {
      const no = Number(s.id.replace(/\D/g, '')), [cur] = await this.db.select({ r: mRouteRule.baseRecordId, n: mRouteRule.sampleCount, a: mRouteRule.statP50Day, b: mRouteRule.statP80Day }).from(mRouteRule).where(eq(mRouteRule.ruleNo, no));
      if (!cur || (Number(cur.n ?? 0) === s.samples && num(cur.a) === s.p50 && num(cur.b) === s.p80)) continue;          // 没变化不写飞书，省限流
      await this.lark.update('T08', [{ record_id: cur.r!, fields: { [F.T08.samples]: s.samples, [F.T08.p50]: s.p50, [F.T08.p80]: s.p80, [F.T08.recalc]: now.getTime() } }]);
      await this.db.update(mRouteRule).set({ sampleCount: s.samples, statP50Day: s.p50 == null ? null : String(s.p50), statP80Day: s.p80 == null ? null : String(s.p80), recentRecalcTime: now }).where(eq(mRouteRule.baseRecordId, cur.r!));
    }
  }
}
const num = (v: string | null) => (v == null ? null : Number(v));
/** 新增记录时，值为 null 的字段不传（飞书对空值字段的处理不一致）；更新时保留 null 用来清空 */
function stripNull(fields: Record<string, any>, creating: boolean) { return creating ? Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)) : fields; }
