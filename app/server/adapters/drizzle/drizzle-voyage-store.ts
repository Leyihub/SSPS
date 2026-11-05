import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { dataIssue, etaRevision, mBulkSettle, mCargo, mSalesExt, mVoyage, milestoneLog } from '../../database/schema';
import type { CargoLine, SalesExt, Settlement, Voyage } from '../../domain/voyage';
import { DATE_KEYS, F, dayMs, pad } from '../../lark/fieldmap';
import type { BaseGateway } from '../../lark/gateway';
import type { ChangeEntry, DataIssue, EtaRevision, NewCargo, NewVoyage, VoyageStorePort } from '../../ports/voyage-store.port';
import type { UserLookupPort } from '../../ports/user-lookup.port';
import type { Db } from './db';
import { fromTs, num, toTs } from './db';
import { Dict, key as up, linkIds, linkJson, loadDict } from './dict';

type Outbox = { execute(key: string, o: { kind: string; payload: any; writeLark: (p: any) => Promise<any>; afterWrite?: (r: any, p: any) => Promise<unknown>; table?: string; operation?: 'create' | 'update' | 'delete' }): Promise<{ result: any; replayed: boolean }> };
type VRow = typeof mVoyage.$inferSelect;
const bad = (msg: string) => new BusinessException(ResponseCode.VALIDATION_ERROR, msg, HttpStatus.UNPROCESSABLE_ENTITY);
const nf = (msg: string) => new BusinessException(ResponseCode.NOT_FOUND, msg, HttpStatus.NOT_FOUND);
const blank = (v: unknown) => v === '' || v === undefined;

// 结算（T06）：领域键 → [飞书字段, 镜像列, 类型]。类型：t 文本 / n 数字 / d 日期 / b 复选框 / s 单选
const SETTLE: Record<string, [string, keyof typeof mBulkSettle.$inferInsert, 't' | 'n' | 'd' | 'b' | 's']> = {
  terms: [F.T06.terms, 'dischargeClause', 't'], rate: [F.T06.rate, 'dischargeRateTonPerDay', 'n'], allowDays: [F.T06.allowDays, 'allowableDischargeDays', 'n'], turn: [F.T06.turn, 'turnTimeHour', 'n'],
  demRate: [F.T06.demRate, 'demurrageRate', 'n'], demCur: [F.T06.demCur, 'currency', 's'], demUsd: [F.T06.demUsd, 'demurrageDespatchUsd', 'n'], gauge: [F.T06.gauge, 'dischargePortDraftTon', 'n'],
  g1: [F.T06.g1, 'waterGauge1Min', 'n'], g2: [F.T06.g2, 'waterGauge2Min', 'n'], g3: [F.T06.g3, 'waterGauge3Min', 'n'], fx: [F.T06.fx, 'exchangeRate', 'n'], portUnit: [F.T06.portUnit, 'portFeeUnitPrice', 'n'],
  portFee: [F.T06.portFee, 'portFeeUsd', 'n'], loadFee: [F.T06.loadFee, 'handlingFeeUsd', 'n'], truck: [F.T06.truck, 'truckingVolumeTon', 'n'], belt: [F.T06.belt, 'pipeConveyorVolumeTon', 'n'], weigh: [F.T06.weigh, 'weighbridgeWeightTon', 'n'],
  other: [F.T06.other, 'otherDeptVolumeTon', 'n'], carTurn: [F.T06.carTurn, 'transferCarCount', 'n'], x1Cars: [F.T06.x1Cars, 'x1BeltConveyorCount', 'n'], crossTruck: [F.T06.crossTruck, 'crossMonthShipRoadTon', 'n'], crossBelt: [F.T06.crossBelt, 'crossMonthShipBeltTon', 'n'],
  beltOff3: [F.T06.beltOff3, '_3BeltConveyorIdleHour', 'n'], beltOff4: [F.T06.beltOff4, '_4BeltConveyorIdleHour', 'n'], sendDay: [F.T06.sendDay, 'handoverSendDate', 'd'], backDay: [F.T06.backDay, 'handoverReturnDate', 'd'],
  noHandover: [F.T06.noHandover, 'detianNoHandover', 'b'], rain: [F.T06.rain, 'lightRainBond', 'b'], issue: [F.T06.issue, 'shipUnloadFactorAbnormalFeedback', 't'],
};
// 货物明细（T05）：领域键 → [飞书字段, 镜像列, 类型]
const CARGO: Record<string, [string, keyof typeof mCargo.$inferInsert, 't' | 'n' | 's']> = {
  contract: [F.T05.contract, 'contractNo', 't'], ea: [F.T05.ea, 'eaPurchaseOrderNo', 't'], big: [F.T05.big, 'materialCategory', 's'], name: [F.T05.name, 'goodsName', 't'], alias: [F.T05.alias, 'materialAlias', 't'],
  unit: [F.T05.unit, 'userUnit', 's'], party: [F.T05.party, 'supplierCustomer', 't'], tons: [F.T05.tons, 'estimatedShippingWeightTon', 'n'], loadTons: [F.T05.loadTons, 'portLoadingWeightTon', 'n'], dry: [F.T05.dry, 'dryBaseConversionTon', 'n'], over: [F.T05.over, 'overShortShipmentPercent', 'n'],
};
const SINGLE_VOYAGE = new Set(['biz', 'attr', 'dept', 'review', 'source', 'status']);

/**
 * 航次（T04）与货物明细（T05）、大宗卸船结算（T06）、成品销售扩展（T07）。
 * 读：应用库镜像表 m_*（关联字段存飞书记录 ID，读时翻成业务名）。写：先写飞书（经写队列、幂等键、补偿）→ 成功后回写镜像行。
 * 变更日志 D02、ETA 修订 D01、数据质量问题 D08 是应用库自有表，直接写。
 * 航次编号：飞书自动编号在镜像里只是整数，应用里的 ID = VY-{创建年}-{4 位序号}。
 */
export class DrizzleVoyageStore implements VoyageStorePort {
  constructor(private readonly db: Db, private readonly lark: BaseGateway, private readonly outbox: Outbox, private readonly users: UserLookupPort) {}

  // ---------------- 编号 ----------------
  private idOf(r: Pick<VRow, 'voyageNo1' | 'createdAt'>) { return 'VY-' + new Date(r.createdAt.getTime() + 8 * 3600000).getUTCFullYear() + '-' + pad(Number(r.voyageNo1 ?? 0)); }
  private async rowOf(id: string): Promise<VRow | null> {
    const m = /^VY-(\d{4})-(\d+)$/.exec(id); if (!m) return null;
    const rows = await this.db.select().from(mVoyage).where(eq(mVoyage.voyageNo1, Number(m[2])));
    return rows.find((r) => this.idOf(r) === id) ?? null;
  }
  private async need(id: string): Promise<VRow> { const r = await this.rowOf(id); if (!r) throw nf('找不到航次：' + id); return r; }

  private afterVoyageCreate = async (res, pl) => {
        const d2 = await loadDict(this.db), row = { baseRecordId: res.rid, voyageNo1: res.no, ...this.mirrorCols({ ...pl.v, ownerId: pl.v.ownerId } as any, d2) };
        await this.db.insert(mVoyage).values(row as any).onConflictDoUpdate({ target: mVoyage.baseRecordId, set: row as any });
        for (let i = 0; i < res.cargo.length; i++) {
          const cr = { baseRecordId: res.cargo[i].rid, appDetailId: res.cargo[i].no, voyage: linkJson([res.rid]), ...this.cargoCols(pl.cargo[i]) };
          await this.db.insert(mCargo).values(cr as any).onConflictDoUpdate({ target: mCargo.baseRecordId, set: cr as any });
        }
      };
  private afterVoyageUpdate = async (res, pl) => { const cols = this.mirrorCols(pl.patch, await loadDict(this.db)); if (Object.keys(cols).length) await this.db.update(mVoyage).set(cols as any).where(eq(mVoyage.baseRecordId, res.rid)); };
  private afterCargoCreate = async (res, pl) => { const cr = { baseRecordId: res.rid, appDetailId: res.no, voyage: linkJson([pl.vrid]), ...this.cargoCols(pl.line) }; await this.db.insert(mCargo).values(cr as any).onConflictDoUpdate({ target: mCargo.baseRecordId, set: cr as any }); };
  private afterCargoUpdate = async (res, pl) => { await this.db.update(mCargo).set(this.cargoCols(pl.patch) as any).where(eq(mCargo.baseRecordId, res.rid)); };
  private afterCargoDelete = async (res) => { await this.db.delete(mCargo).where(eq(mCargo.baseRecordId, res.rid)); };
  private afterSettle = async (res, pl) => { const row = { baseRecordId: res.rid, ...(res.no ? { settlementNo: res.no } : {}), voyage: linkJson([pl.vrid]), ...pl.cols }; await this.db.insert(mBulkSettle).values(row as any).onConflictDoUpdate({ target: mBulkSettle.baseRecordId, set: row as any }); };
  private afterSales = async (res, pl) => { const row = { baseRecordId: res.rid, ...(res.no ? { extensionNo: res.no } : {}), voyage: linkJson([pl.vrid]), ...pl.cols }; await this.db.insert(mSalesExt).values(row as any).onConflictDoUpdate({ target: mSalesExt.baseRecordId, set: row as any }); };

  /** 补偿用：飞书已写成功但回写镜像没做完的记录，按类型补完后续步骤（outbox.replayWritten 调用，不会再写飞书） */
  replayHandlers() {
    return { 'voyage.create': this.afterVoyageCreate, 'voyage.update': this.afterVoyageUpdate, 'cargo.create': this.afterCargoCreate, 'cargo.update': this.afterCargoUpdate, 'cargo.delete': this.afterCargoDelete, 'settle.save': this.afterSettle, 'sales.save': this.afterSales };
  }

  // ---------------- 读 ----------------
  private async latestEta(): Promise<Map<string, string>> {
    const rows = await this.db.select({ v: etaRevision.voyageNo, at: sql<Date>`max(${etaRevision.revisedAt})` }).from(etaRevision).groupBy(etaRevision.voyageNo);
    return new Map(rows.map((r) => [r.v, fromTs(r.at) ?? '']));
  }
  private toVoyage(r: VRow, d: Dict, names: Record<string, string>, etaAt: Map<string, string>): Voyage {
    const id = this.idOf(r), ownerId = r.responsibleSalesman ?? undefined;
    return {
      id, biz: r.businessType ?? '', attr: r.businessAttribute ?? '', no: r.voyageNo ?? '', vessel: r.vessel ? d.vesselByRid.get(r.vessel) ?? null : null, carrier: r.carrier ?? '', shipVoy: r.vesselVoyageNo ?? '',
      load: d.portByRid.get(r.loadPort ?? '') ?? '', disch: d.portByRid.get(r.dischargePort ?? '') ?? '', disch2: r.secondDischargePort ? d.portByRid.get(r.secondDischargePort) ?? null : null, finalPort: r.finalDestination ? d.portByRid.get(r.finalDestination) ?? r.finalDestination : null,
      laycanS: fromTs(r.laycanStart), laycanE: fromTs(r.laycanEnd), planLoadArr: fromTs(r.etaLoadPort), actLoadArr: fromTs(r.ataLoadPort), loadBerth: fromTs(r.loadPortBerth), planLoadDep: fromTs(r.planDepartLoadPort), actLoadDep: fromTs(r.actualDepartLoadPort),
      planDischS: fromTs(r.planArriveDischargeWindowStart), planDischE: fromTs(r.planArriveDischargeWindowEnd), eta: fromTs(r.currentEtaDischargePort), etaUpdated: etaAt.get(id) ?? (r.currentEtaDischargePort ? fromTs(r.createdAt) : null),
      actDischArr: fromTs(r.actualArriveDischargePort), dischBerth: fromTs(r.dischargePortBerth), dischDep: fromTs(r.dischargePortDeparture),
      planBerths: linkIds(r.plannedBerth).map((x) => d.berthByRid.get(x)).filter(Boolean) as string[], actBerths: linkIds(r.actualBerth).map((x) => d.berthByRid.get(x)).filter(Boolean) as string[], flags: r.abnormalMark ?? [],
      owner: ownerId ? names[ownerId] ?? ownerId : '', ownerId, dept: r.department ?? '', focus: !!r.keyAttention, review: r.auditStatus ?? '', source: r.dataSource ?? '', readonly: !!r.historyReadonly, remark: r.remark ?? '', status: r.vesselStatus ?? undefined,
    };
  }
  private async toVoyages(rows: VRow[]): Promise<Voyage[]> {
    const [d, etaAt] = await Promise.all([loadDict(this.db), this.latestEta()]), names = await this.users.names([...new Set(rows.map((r) => r.responsibleSalesman).filter(Boolean) as string[])]);
    return rows.map((r) => this.toVoyage(r, d, names, etaAt));
  }
  async list() { return this.toVoyages(await this.db.select().from(mVoyage).orderBy(mVoyage.voyageNo1)); }
  async get(id: string) { const r = await this.rowOf(id); return r ? (await this.toVoyages([r]))[0] : null; }

  private cargoOf(c: typeof mCargo.$inferSelect): CargoLine {
    return { no: 'CL-' + pad(Number(c.appDetailId ?? 0)), voyage: '', contract: c.contractNo ?? '', ea: c.eaPurchaseOrderNo ?? '', big: c.materialCategory ?? '', kind: '', name: c.goodsName ?? '', alias: c.materialAlias ?? '', unit: c.userUnit ?? '', dept2: '', party: c.supplierCustomer ?? '',
      tons: Number(c.estimatedShippingWeightTon ?? 0), loadTons: num(c.portLoadingWeightTon), dry: num(c.dryBaseConversionTon), over: c.overShortShipmentPercent == null ? '' : '±' + Number(c.overShortShipmentPercent) + '%', exec: '' };
  }
  private async cargoRows(rid: string) { return this.db.select().from(mCargo).where(sql`${mCargo.voyage} -> 'link_record_ids' @> ${JSON.stringify([rid])}::jsonb`).orderBy(mCargo.appDetailId); }
  async cargo(id: string): Promise<CargoLine[]> { const v = await this.rowOf(id); if (!v) return []; return (await this.cargoRows(v.baseRecordId!)).map((c) => ({ ...this.cargoOf(c), voyage: id })); }

  /** 飞书记录 ID → 航次编号（批量读用） */
  private async idByRid(): Promise<Map<string, string>> {
    const rows = await this.db.select({ rid: mVoyage.baseRecordId, voyageNo1: mVoyage.voyageNo1, createdAt: mVoyage.createdAt }).from(mVoyage);
    return new Map(rows.map((r) => [r.rid!, this.idOf(r)] as const));
  }
  async cargoByVoyage(): Promise<Map<string, CargoLine[]>> {
    const [ids, rows] = await Promise.all([this.idByRid(), this.db.select().from(mCargo).orderBy(mCargo.appDetailId)]), out = new Map<string, CargoLine[]>();
    for (const c of rows) { const id = ids.get(linkIds(c.voyage)[0]); if (id) (out.get(id) ?? out.set(id, []).get(id)!).push({ ...this.cargoOf(c), voyage: id }); }
    return out;
  }
  private settleOf(r: typeof mBulkSettle.$inferSelect): Settlement { const out: Settlement = {}; for (const [k, [, col, t]] of Object.entries(SETTLE)) { const x = (r as any)[col]; out[k] = x == null ? null : t === 'n' ? Number(x) : x; } return out; }
  async settlementByVoyage(): Promise<Map<string, Settlement>> {
    const [ids, rows] = await Promise.all([this.idByRid(), this.db.select().from(mBulkSettle)]), out = new Map<string, Settlement>();
    for (const r of rows) { const id = ids.get(linkIds(r.voyage)[0]); if (id && !out.has(id)) out.set(id, this.settleOf(r)); }
    return out;
  }
  async salesExtByVoyage(): Promise<Map<string, SalesExt>> {
    const [ids, rows] = await Promise.all([this.idByRid(), this.db.select().from(mSalesExt)]), out = new Map<string, SalesExt>();
    for (const r of rows) { const id = ids.get(linkIds(r.voyage)[0]); if (id && !out.has(id)) out.set(id, { way: r.charterType, contract: r.seaShippingContractNo }); }
    return out;
  }

  async settlement(id: string): Promise<Settlement | null> {
    const v = await this.rowOf(id); if (!v) return null;
    const [r] = await this.db.select().from(mBulkSettle).where(sql`${mBulkSettle.voyage} -> 'link_record_ids' @> ${JSON.stringify([v.baseRecordId])}::jsonb`);
    return r ? this.settleOf(r) : null;
  }
  async salesExt(id: string): Promise<SalesExt | null> {
    const v = await this.rowOf(id); if (!v) return null;
    const [r] = await this.db.select().from(mSalesExt).where(sql`${mSalesExt.voyage} -> 'link_record_ids' @> ${JSON.stringify([v.baseRecordId])}::jsonb`);
    return r ? { way: r.charterType, contract: r.seaShippingContractNo } : null;
  }

  // ---------------- 写：航次 ----------------
  /** 领域字段 → 飞书字段（只转 patch 里有的键）。关联字段翻成记录 ID，翻不到的报 422（不要写半截） */
  private async feishuFields(p: Partial<Voyage>, d: Dict): Promise<{ fields: Record<string, any>; userIdType?: 'user_id' }> {
    const f: Record<string, any> = {}; let userIdType: 'user_id' | undefined;
    const link = (map: Map<string, string>, name: string | null | undefined, what: string) => { if (!name) return []; const r = map.get(up(name)); if (!r) throw bad(`${what}「${name}」不在主数据里，请先到主数据维护`); return [r]; };
    for (const [k, v] of Object.entries(p) as Array<[keyof Voyage, any]>) {
      const name = (F.T04 as Record<string, string>)[k as string]; if (!name) continue;                       // id、ownerId、etaUpdated 等不写飞书
      if (DATE_KEYS.has(k as string)) f[name] = v ? toTs(v)!.getTime() : null;
      else if (k === 'vessel') f[name] = link(d.ridByVessel, v, '船舶');
      else if (k === 'load' || k === 'disch' || k === 'disch2' || k === 'finalPort') f[name] = link(d.ridByPort, v, k === 'load' ? '装港' : k === 'disch' ? '卸港' : k === 'disch2' ? '第二卸港' : '最终目的港');
      else if (k === 'planBerths' || k === 'actBerths') f[name] = (v as string[]).map((b) => link(d.ridByBerth, b, '泊位')[0]);
      else if (k === 'flags') f[name] = v ?? [];
      else if (k === 'owner') continue;                                                                       // 负责业务员按 ownerId 写，见 create
      else if (k === 'status') f[name] = blank(v) ? null : feishuStatus(v);
      else if (SINGLE_VOYAGE.has(k as string)) f[name] = blank(v) ? null : v;
      else f[name] = typeof v === 'boolean' ? v : blank(v) ? null : v;
    }
    if ((p as any).ownerId) { const fid = await this.users.feishuUserId((p as any).ownerId); if (fid) { f[F.T04.owner] = [{ id: fid }]; userIdType = 'user_id'; } }
    return { fields: f, userIdType };
  }
  /** 领域字段 → 镜像列 */
  private mirrorCols(p: Partial<Voyage>, d: Dict): Partial<typeof mVoyage.$inferInsert> {
    const c: Record<string, any> = {}, rid = (map: Map<string, string>, n: string | null | undefined) => (n ? map.get(up(n)) ?? null : null);
    const M: Record<string, string> = { biz: 'businessType', attr: 'businessAttribute', no: 'voyageNo', carrier: 'carrier', shipVoy: 'vesselVoyageNo', laycanS: 'laycanStart', laycanE: 'laycanEnd', planLoadArr: 'etaLoadPort', actLoadArr: 'ataLoadPort', loadBerth: 'loadPortBerth', planLoadDep: 'planDepartLoadPort', actLoadDep: 'actualDepartLoadPort', planDischS: 'planArriveDischargeWindowStart', planDischE: 'planArriveDischargeWindowEnd', eta: 'currentEtaDischargePort', actDischArr: 'actualArriveDischargePort', dischBerth: 'dischargePortBerth', dischDep: 'dischargePortDeparture', status: 'vesselStatus', flags: 'abnormalMark', dept: 'department', focus: 'keyAttention', review: 'auditStatus', source: 'dataSource', remark: 'remark', readonly: 'historyReadonly' };
    for (const [k, v] of Object.entries(p) as Array<[string, any]>) {
      if (DATE_KEYS.has(k)) c[M[k]] = toTs(v);
      else if (k === 'vessel') c.vessel = rid(d.ridByVessel, v);
      else if (k === 'load') c.loadPort = rid(d.ridByPort, v); else if (k === 'disch') c.dischargePort = rid(d.ridByPort, v); else if (k === 'disch2') c.secondDischargePort = rid(d.ridByPort, v); else if (k === 'finalPort') c.finalDestination = rid(d.ridByPort, v);
      else if (k === 'planBerths') c.plannedBerth = linkJson((v as string[]).map((b) => rid(d.ridByBerth, b)).filter(Boolean) as string[]);
      else if (k === 'actBerths') c.actualBerth = linkJson((v as string[]).map((b) => rid(d.ridByBerth, b)).filter(Boolean) as string[]);
      else if (k === 'ownerId') c.responsibleSalesman = v ?? null;
      else if (k === 'status') c.vesselStatus = blank(v) ? null : feishuStatus(v);
      else if (M[k]) c[M[k]] = blank(v) && SINGLE_VOYAGE.has(k) ? null : v;
    }
    return c;
  }

  async create(v: NewVoyage, cargo: NewCargo[], key?: string): Promise<{ voyage: Voyage; cargo: CargoLine[] }> {
    const d = await loadDict(this.db), { fields, userIdType } = await this.feishuFields(v as any, d);
    const cargoPlan = cargo.map((c) => this.cargoFields(c));
    const out = await this.outbox.execute(key ?? randomUUID(), {
      kind: 'voyage.create', table: 'T04', operation: 'create', payload: { v, cargo, fields: dropNull(fields), userIdType: userIdType ?? null, cargoFields: cargoPlan },
      writeLark: async (pl) => {
        const rec = (await this.lark.create('T04', [{ fields: pl.fields }], pl.userIdType ? { userIdType: pl.userIdType } : undefined))[0];
        const cargoRecs = pl.cargoFields.length ? await this.lark.create('T05', pl.cargoFields.map((cf: any) => ({ fields: { ...cf, [F.T05.voyage]: [rec.record_id] } }))) : [];
        return { rid: rec.record_id, no: Number(rec.fields['航次编号']), cargo: cargoRecs.map((c) => ({ rid: c.record_id, no: Number(c.fields['明细编号']) })) };
      },
      afterWrite: this.afterVoyageCreate,
    });
    const row = (await this.db.select().from(mVoyage).where(eq(mVoyage.baseRecordId, out.result.rid)))[0], voyage = (await this.toVoyages([row]))[0];
    return { voyage, cargo: (await this.cargoRows(out.result.rid)).map((c) => ({ ...this.cargoOf(c), voyage: voyage.id })) };
  }

  async update(id: string, patch: Partial<Voyage>, key?: string): Promise<Voyage> {
    const row = await this.need(id), d = await loadDict(this.db), { fields, userIdType } = await this.feishuFields(patch, d);
    if (Object.keys(fields).length) {
      await this.outbox.execute(key ?? randomUUID(), {
        kind: 'voyage.update', table: 'T04', operation: 'update', payload: { rid: row.baseRecordId, patch, fields, userIdType: userIdType ?? null },
        writeLark: async (pl) => { await this.lark.update('T04', [{ record_id: pl.rid, fields: pl.fields }], pl.userIdType ? { userIdType: pl.userIdType } : undefined); return { rid: pl.rid }; },
        afterWrite: this.afterVoyageUpdate,
      });
    }
    return (await this.get(id))!;
  }

  // ---------------- 写：货物明细 ----------------
  private cargoFields(c: Partial<NewCargo>) {
    const f: Record<string, any> = {};
    for (const [k, v] of Object.entries(c)) { const m = CARGO[k]; if (!m) continue; f[m[0]] = m[2] === 'n' ? (v === null || v === '' || v === undefined ? null : k === 'over' ? parseOver(v) : Number(v)) : blank(v) ? (m[2] === 's' ? null : '') : v; }
    return f;
  }
  private cargoCols(c: Partial<NewCargo>) {
    const o: Record<string, any> = {};
    for (const [k, v] of Object.entries(c)) { const m = CARGO[k]; if (!m) continue; o[m[1]] = m[2] === 'n' ? (v === null || v === '' || v === undefined ? null : String(k === 'over' ? parseOver(v) : Number(v))) : blank(v) ? null : v; }
    return o;
  }
  async addCargo(id: string, line: NewCargo, key?: string): Promise<CargoLine> {
    const v = await this.need(id), fields = this.cargoFields(line);
    const out = await this.outbox.execute(key ?? randomUUID(), {
      kind: 'cargo.create', table: 'T05', operation: 'create', payload: { vrid: v.baseRecordId, line, fields },
      writeLark: async (pl) => { const rec = (await this.lark.create('T05', [{ fields: { ...dropNull(pl.fields), [F.T05.voyage]: [pl.vrid] } }]))[0]; return { rid: rec.record_id, no: Number(rec.fields['明细编号']) }; },
      afterWrite: this.afterCargoCreate,
    });
    return { ...this.cargoOf((await this.db.select().from(mCargo).where(eq(mCargo.baseRecordId, out.result.rid)))[0]), voyage: id };
  }
  private async cargoRowOf(id: string, no: string) {
    const v = await this.need(id), n = Number(no.replace(/\D/g, '')), c = (await this.cargoRows(v.baseRecordId!)).find((x) => Number(x.appDetailId) === n);
    if (!c) throw nf('货物明细不存在：' + no); return c;
  }
  async updateCargo(id: string, no: string, patch: Partial<CargoLine>, key?: string): Promise<CargoLine> {
    const c = await this.cargoRowOf(id, no), fields = this.cargoFields(patch as any);
    if (Object.keys(fields).length) await this.outbox.execute(key ?? randomUUID(), {
      kind: 'cargo.update', table: 'T05', operation: 'update', payload: { rid: c.baseRecordId, patch, fields },
      writeLark: async (pl) => { await this.lark.update('T05', [{ record_id: pl.rid, fields: pl.fields }]); return { rid: pl.rid }; },
      afterWrite: this.afterCargoUpdate,
    });
    return { ...this.cargoOf((await this.db.select().from(mCargo).where(eq(mCargo.baseRecordId, c.baseRecordId!)))[0]), voyage: id };
  }
  async deleteCargo(id: string, no: string, key?: string) {
    const c = await this.cargoRowOf(id, no);
    await this.outbox.execute(key ?? randomUUID(), {
      kind: 'cargo.delete', table: 'T05', operation: 'delete', payload: { rid: c.baseRecordId },
      writeLark: async (pl) => { await this.lark.remove('T05', [pl.rid]); return { rid: pl.rid }; },
      afterWrite: this.afterCargoDelete,
    });
  }

  // ---------------- 写：结算 / 销售扩展（一条航次至多一行） ----------------
  async saveSettlement(id: string, patch: Settlement, key?: string): Promise<Settlement> {
    const v = await this.need(id), fields: Record<string, any> = {}, cols: Record<string, any> = {};
    for (const [k, val] of Object.entries(patch)) {
      const m = SETTLE[k]; if (!m) continue; const [fname, col, t] = m, empty = val === null || val === '' || val === undefined;
      fields[fname] = empty ? null : t === 'n' ? Number(val) : t === 'd' ? dayMs(String(val)) : val;
      cols[col] = empty ? null : t === 'n' ? String(val) : val;
    }
    const [cur] = await this.db.select({ r: mBulkSettle.baseRecordId }).from(mBulkSettle).where(sql`${mBulkSettle.voyage} -> 'link_record_ids' @> ${JSON.stringify([v.baseRecordId])}::jsonb`);
    await this.outbox.execute(key ?? randomUUID(), {
      kind: 'settle.save', table: 'T06', operation: cur ? 'update' : 'create', payload: { vrid: v.baseRecordId, rid: cur?.r ?? null, fields, cols },
      writeLark: async (pl) => { if (pl.rid) { await this.lark.update('T06', [{ record_id: pl.rid, fields: pl.fields }]); return { rid: pl.rid, no: null }; } const rec = (await this.lark.create('T06', [{ fields: { ...dropNull(pl.fields), [F.T06.voyage]: [pl.vrid] } }]))[0]; return { rid: rec.record_id, no: Number(rec.fields['结算编号']) }; },
      afterWrite: this.afterSettle,
    });
    return (await this.settlement(id))!;
  }
  async saveSalesExt(id: string, patch: Partial<SalesExt>, key?: string): Promise<SalesExt> {
    const v = await this.need(id), fields: Record<string, any> = {}, cols: Record<string, any> = {};
    if ('way' in patch) { fields[F.T07.way] = patch.way ?? null; cols.charterType = patch.way ?? null; }
    if ('contract' in patch) { fields[F.T07.contract] = patch.contract ?? null; cols.seaShippingContractNo = patch.contract ?? null; }
    const [cur] = await this.db.select({ r: mSalesExt.baseRecordId }).from(mSalesExt).where(sql`${mSalesExt.voyage} -> 'link_record_ids' @> ${JSON.stringify([v.baseRecordId])}::jsonb`);
    await this.outbox.execute(key ?? randomUUID(), {
      kind: 'sales.save', table: 'T07', operation: cur ? 'update' : 'create', payload: { vrid: v.baseRecordId, rid: cur?.r ?? null, fields, cols },
      writeLark: async (pl) => { if (pl.rid) { await this.lark.update('T07', [{ record_id: pl.rid, fields: pl.fields }]); return { rid: pl.rid, no: null }; } const rec = (await this.lark.create('T07', [{ fields: { ...dropNull(pl.fields), [F.T07.voyage]: [pl.vrid] } }]))[0]; return { rid: rec.record_id, no: Number(rec.fields['扩展编号']) }; },
      afterWrite: this.afterSales,
    });
    return (await this.salesExt(id))!;
  }

  // ---------------- 自有表：ETA 修订 D01、变更日志 D02、数据质量 D08 ----------------
  async etaRevisions(id: string): Promise<EtaRevision[]> {
    return (await this.db.select().from(etaRevision).where(eq(etaRevision.voyageNo, id)).orderBy(etaRevision.revisedAt)).map((r) => ({ voyage: id, node: r.nodeName, old: fromTs(r.oldValue), nw: fromTs(r.newValue) ?? '', basis: r.basis, by: r.revisedBy, at: fromTs(r.revisedAt) ?? '' }));
  }
  async addEtaRevision(r: EtaRevision) { await this.db.insert(etaRevision).values({ voyageNo: r.voyage, nodeName: r.node, oldValue: toTs(r.old), newValue: toTs(r.nw)!, basis: r.basis, revisedBy: r.by, revisedAt: toTs(r.at) ?? new Date() }); }
  async changeLog(id: string): Promise<ChangeEntry[]> {
    return (await this.db.select().from(milestoneLog).where(eq(milestoneLog.voyageNo, id)).orderBy(milestoneLog.changedAt, milestoneLog.createdAt)).map((r) => ({ voyage: id, field: r.field, old: r.oldValue, nw: r.newValue, by: r.changedBy, at: fromTs(r.changedAt) ?? '', ...(r.masked ? { masked: true } : {}) }));
  }
  async addChangeLog(entries: ChangeEntry[]) { if (entries.length) await this.db.insert(milestoneLog).values(entries.map((e) => ({ voyageNo: e.voyage, field: e.field, oldValue: e.old, newValue: e.nw, masked: !!e.masked, changedBy: e.by, changedAt: toTs(e.at) ?? new Date() }))); }
  async addIssues(issues: DataIssue[]) { if (issues.length) await this.db.insert(dataIssue).values(issues.map((i) => ({ objectRef: i.object, issueType: i.type, field: i.field ?? null, note: i.note, owner: i.owner }))).onConflictDoNothing(); }   // 同一对象同类问题只留一条未关闭的（部分唯一索引）
  private issueOf(r: typeof dataIssue.$inferSelect) { return { id: 'DQ-' + r.id.slice(0, 8), object: r.objectRef, type: r.issueType, field: r.field ?? undefined, note: r.note ?? '', owner: r.owner ?? '', status: r.status, closedBy: r.closedBy, closedAt: fromTs(r.closedAt) }; }
  async issues() { return (await this.db.select().from(dataIssue).orderBy(desc(dataIssue.createdAt), dataIssue.id)).map((r) => this.issueOf(r)); }
  async closeIssue(id: string, by: string, at: string) { await this.setIssueStatus(id, '已关闭', by, at); }
  async setIssueStatus(id: string, status: '处理中' | '已关闭', by: string, at: string) {
    await this.db.update(dataIssue).set(status === '已关闭' ? { status, closedBy: by, closedAt: toTs(at) ?? new Date() } : { status }).where(sql`${dataIssue.id}::text like ${id.replace(/^DQ-/, '') + '%'}`);
  }
}
/** 「已结束（取消）」不是飞书船舶状态的选项：写成「已结束」，取消由异常标记表达；应用里状态永远由时间节点和标记重新推导 */
const feishuStatus = (v: string) => (v === '已结束（取消）' ? '已结束' : v);
const dropNull = (f: Record<string, any>) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null && v !== undefined));
const parseOver = (v: unknown) => { const m = String(v).match(/-?[\d.]+/); return m ? Number(m[0]) : null; };
