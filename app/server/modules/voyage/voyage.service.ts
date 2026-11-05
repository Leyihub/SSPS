import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { DIRECTORY_PORT, VOYAGE_STORE } from '../../ports/tokens';
import type { DirectoryPort } from '../../ports/directory.port';
import type { ChangeEntry, DataIssue, NewCargo, NewVoyage, VoyageStorePort } from '../../ports/voyage-store.port';
import { BIZ, STATUS, STATUS_CANCELLED, deriveStatus } from '../../domain/status';
import { validateChain, missingDeparture } from '../../domain/validate';
import { CONFIG } from '../../config';
import { dn } from '../../lib/dates';
import { parseDateTime, parseNumber } from '../../importers/common';
import {
  Actor, BOOL_KEYS, CargoLine, DATE_KEYS_SETTLE, ETA_BASIS, FLAGS, SALES_WAYS, MILESTONE_FIELDS, MONEY_KEYS, MONEY_LABEL, OPS_KEYS, TEXT_KEYS, VOYAGE_EDITABLE, Voyage, isBulk, isProduct, localDate,
} from '../../domain/voyage';
import { canCreateVoyage, canEditMoney, canEditOps, canEditSales, canEditVoyage, canSeeMoney } from '../../domain/permissions';
import type { CreateVoyageDto, ListQuery } from './voyage.dto';

export interface UserCtx { userId?: string; userName?: string; roles?: string[] }
type Bag = Record<string, unknown>;

const DATE_FIELDS = new Set(['laycanS', 'laycanE', 'planLoadArr', 'actLoadArr', 'loadBerth', 'planLoadDep', 'actLoadDep', 'planDischS', 'planDischE', 'eta', 'actDischArr', 'dischBerth', 'dischDep']);
const LIST_FIELDS = new Set(['planBerths', 'actBerths']);
const CARGO_EDITABLE = ['contract', 'ea', 'big', 'kind', 'name', 'alias', 'unit', 'dept2', 'party', 'tons', 'loadTons', 'dry', 'over', 'inspector', 'exec'];
const CARGO_NUMBER = new Set(['tons', 'loadTons', 'dry']);
const SALES_LABEL: Record<string, string> = { way: '租船方式', contract: '海运合同号' };
const MONEY_SET = new Set<string>(MONEY_KEYS);
const OPS_SET = new Set<string>(OPS_KEYS);
const ISSUE_TYPE: Record<string, string> = { MISSING_NODE: '缺离装港时间', CHAIN_INVERTED: '节点时序倒置' };

const fail = (code: ResponseCode, msg: string, http: HttpStatus) => new BusinessException(code, msg, http);
const forbidden = (msg: string) => fail(ResponseCode.FORBIDDEN, msg, HttpStatus.FORBIDDEN);
const invalid = (msg: string) => fail(ResponseCode.VALIDATION_ERROR, msg, HttpStatus.UNPROCESSABLE_ENTITY);
const show = (x: unknown) => (x == null || x === '' ? null : Array.isArray(x) ? x.join('、') : String(x));
const sub = (key: string | undefined, part: string) => (key ? key + ':' + part : undefined);

@Injectable()
export class VoyageService {
  constructor(
    @Inject(VOYAGE_STORE) private readonly store: VoyageStorePort,
    @Inject(DIRECTORY_PORT) private readonly dir: DirectoryPort,
  ) {}

  /** 时钟：测试里替换 */
  clock: () => Date = () => new Date();

  private today() { return this.clock().toISOString().slice(0, 10); }
  private now() { return this.clock().toISOString().slice(0, 16).replace('T', ' '); }
  actor(ctx: UserCtx): Promise<Actor> { return this.dir.resolve(ctx || {}); }

  private async need(id: string): Promise<Voyage> {
    const v = await this.store.get(id);
    if (!v) throw fail(ResponseCode.NOT_FOUND, '找不到航次：' + id, HttpStatus.NOT_FOUND);
    return { ...v, status: deriveStatus(v) };
  }
  private async needEdit(id: string, a: Actor) {
    const v = await this.need(id);
    if (v.readonly) throw forbidden('历史迁移记录为只读，不能修改');
    if (!canEditVoyage(a, v)) throw forbidden('只有该航次的负责业务员、本部门主管或系统管理员可以修改');
    return v;
  }

  /** 把一次修改整理成可保存的字段：白名单、类型、日期规范化。有问题的一次性全部报出 */
  private clean(patch: Bag, allow: Record<string, string>): Partial<Voyage> {
    const out: Bag = {}, errs: string[] = [];
    for (const [k, raw] of Object.entries(patch || {})) {
      if (!(k in allow)) { errs.push('不能修改字段：' + k); continue; }
      const label = allow[k];
      if (DATE_FIELDS.has(k)) {
        if (raw == null || raw === '') { out[k] = null; continue; }
        const d = parseDateTime(raw);
        if (!d) errs.push('「' + label + '」不是有效的日期时间：' + String(raw)); else out[k] = d;
      } else if (LIST_FIELDS.has(k)) {
        if (raw == null) out[k] = [];
        else if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) out[k] = raw.map((x) => x.trim()).filter(Boolean);
        else errs.push('「' + label + '」必须是文本列表');
      } else if (k === 'focus') {
        if (typeof raw === 'boolean') out[k] = raw; else errs.push('「' + label + '」必须是 true 或 false');
      } else {
        if (raw == null || raw === '') out[k] = k === 'remark' ? '' : null;
        else if (typeof raw === 'string') out[k] = raw.trim(); else errs.push('「' + label + '」必须是文本');
      }
    }
    if (errs.length) throw invalid(errs.join('；'));
    return out as Partial<Voyage>;
  }

  /** 校验时序并推导状态；错误拒绝保存，警告进数据质量问题 */
  private check(next: Voyage, prev: Voyage | null) {
    const r = validateChain(next as any, prev as any) as { errors: string[]; warnings: Array<{ code: string; text: string }> };
    if (r.errors.length) throw invalid(r.errors.join('；'));
    return r.warnings;
  }
  private issuesOf(v: Voyage, warnings: Array<{ code: string; text: string }>): DataIssue[] {
    return warnings.map((w) => ({ object: v.id, type: ISSUE_TYPE[w.code] || w.code, note: w.text, owner: v.owner }));
  }

  private diff(prev: Bag, next: Bag, labels: Record<string, string>, by: string, id: string, at: string, masked = new Set<string>()): ChangeEntry[] {
    const out: ChangeEntry[] = [];
    for (const k of Object.keys(labels)) {
      if (!(k in next)) continue;
      const o = show(prev[k]), n = show(next[k]);
      if (o === n) continue;
      out.push(masked.has(k) ? { voyage: id, field: labels[k], old: null, nw: null, by, at, masked: true } : { voyage: id, field: labels[k], old: o, nw: n, by, at });
    }
    return out;
  }

  // ---------------- 查询 ----------------

  /**
   * A07：航次列表。未结束的在前、按本港日期升序；已结束的在后、按本港日期降序。
   * status 可以逗号分隔多个；mine / focus 是快捷筛选。返回 counts：页签数按「除业务类型外的所有条件」算，
   * 状态数按「除状态外的所有条件」算（页面上的页签计数和指标卡用）。
   */
  async list(q: ListQuery, a?: Actor) {
    const all = (await this.store.list()).map((v) => ({ ...v, status: deriveStatus(v) }));
    const kw = (q.q || '').trim().toLowerCase(), sts = q.status ? q.status.split(',').filter(Boolean) : [];
    const day = (v: Voyage) => { const d = localDate(v); return ((d.act || d.plan || '') as string).slice(0, 10); };
    const contracts = new Map<string, string>();
    if (kw) for (const v of all) contracts.set(v.id, (await this.store.cargo(v.id)).map((c) => c.contract).join(' '));
    const match = (v: Voyage, skip: 'biz' | 'status' | null) => {
      if (skip !== 'biz' && q.biz && v.biz !== q.biz) return false;
      if (skip !== 'status' && sts.length && !sts.includes(v.status!)) return false;
      if (q.owner && v.owner !== q.owner) return false;
      if (q.mine && a && v.owner !== a.name) return false;
      if (q.focus && !v.focus) return false;
      if (q.from && (!day(v) || day(v) < q.from)) return false;
      if (q.to && (!day(v) || day(v) > q.to)) return false;
      if (kw && ![v.id, v.no, v.vessel || '待宣船', v.load, v.disch, v.owner, v.shipVoy, contracts.get(v.id)].some((s) => (s || '').toLowerCase().includes(kw))) return false;
      return true;
    };
    const count = (skip: 'biz' | 'status', key: (v: Voyage) => string, keys: string[]) => { const o: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0])); let n = 0; for (const v of all) if (match(v, skip)) { o[key(v)] = (o[key(v)] || 0) + 1; n++; } return { ...o, all: n }; };
    const counts = { biz: count('biz', (v) => v.biz, Object.values(BIZ)), status: count('status', (v) => v.status!, [...STATUS, STATUS_CANCELLED]) };
    // 指标卡的状态数要在「当前业务类型」下算，页签数不受自身影响——上面已按此口径跳过对应条件
    const fin = (v: Voyage) => v.status === '已结束' || v.status === '已结束（取消）';
    const rows = all.filter((v) => match(v, null)).sort((x, y) => (fin(x) !== fin(y) ? (fin(x) ? 1 : -1) : fin(x) ? day(y).localeCompare(day(x)) : day(x).localeCompare(day(y)) || x.id.localeCompare(y.id)));
    const page = q.page || 1, size = q.pageSize || 50, slice = rows.slice((page - 1) * size, page * size);
    const items = await Promise.all(slice.map(async (v) => {
      const cargo = await this.store.cargo(v.id), d = localDate(v);
      return { id: v.id, biz: v.biz, attr: v.attr, no: v.no, vessel: v.vessel, load: v.load, disch: v.disch, status: v.status, side: v.load === 'BAHODOPI' ? '装' : '卸',
        localPlan: d.plan, localAct: d.act, eta: v.eta, etaUpdated: v.etaUpdated, owner: v.owner, dept: v.dept, flags: v.flags, focus: v.focus, readonly: v.readonly,
        tons: cargo.reduce((s, c) => s + (Number(c.tons) || 0), 0), pooled: cargo.length >= 2,
        missingDeparture: missingDeparture(v), etaStale: !!(v.eta && !v.actDischArr && v.etaUpdated && dn(this.today()) - dn(v.etaUpdated) > CONFIG.ETA_STALE_DAYS) };
    }));
    return { total: rows.length, page, pageSize: size, items, counts, owners: [...new Set(all.map((v) => v.owner))].sort() };
  }

  /** A08：详情。金额字段对无权限的人整体不返回；同时给出当前用户在这条航次上能做什么 */
  async get(id: string, a: Actor) {
    const v = await this.need(id);
    const [cargo, settle, sales, eta, log] = await Promise.all([this.store.cargo(id), this.store.settlement(id), this.store.salesExt(id), this.store.etaRevisions(id), this.store.changeLog(id)]);
    const seeMoney = canSeeMoney(a);
    let settlement = settle;
    if (settle && !seeMoney) settlement = Object.fromEntries(Object.entries(settle).filter(([k]) => !MONEY_SET.has(k)));
    return {
      voyage: v, cargo, settlement: isBulk(v) ? settlement : null, salesExt: isProduct(v) ? sales : null,
      etaRevisions: eta, changeLog: log,
      can: { edit: canEditVoyage(a, v), ops: canEditOps(a, v), money: canEditMoney(a, v), sales: canEditSales(a, v), seeMoney },
    };
  }

  // ---------------- 写入 ----------------

  /** A09：新建航次（可带货物明细）。负责人 = 当前用户，部门取其所在部门 */
  async create(dto: CreateVoyageDto, a: Actor, key?: string) {
    if (!canCreateVoyage(a)) throw forbidden('当前角色不能新建航次');
    const { cargo = [], biz, ...rest } = dto as any;
    const errs: string[] = [];
    const attempt = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch (e: any) { errs.push(e.message); return fallback; } };
    const base = attempt(() => this.clean(rest, { ...VOYAGE_EDITABLE, eta: '预计抵卸港', load: '装港', disch: '卸港' }), {} as Partial<Voyage>);
    const lines = cargo.map((c: any, i: number) => attempt(() => this.cleanCargo(c, true, i + 1), null)) as NewCargo[];
    if (errs.length) throw invalid(errs.join('；'));
    const draft: NewVoyage = {
      attr: '', no: '', vessel: null, carrier: '', shipVoy: '', disch2: null, finalPort: null, laycanS: null, laycanE: null,
      planLoadArr: null, actLoadArr: null, loadBerth: null, planLoadDep: null, actLoadDep: null, planDischS: null, planDischE: null, eta: null, etaUpdated: null,
      actDischArr: null, dischBerth: null, dischDep: null, planBerths: [], actBerths: [], flags: [],
      focus: false, review: '', source: '应用录入', readonly: false, remark: '',
      ...(base as any), biz, owner: a.name, ownerId: a.userId, dept: a.dept || '',
    };
    if (draft.eta) draft.etaUpdated = this.now();
    const warnings = this.check({ ...draft, id: '' } as Voyage, null);
    const { voyage, cargo: saved } = await this.store.create(draft, lines, sub(key, 'create'));
    const v = { ...voyage, status: deriveStatus(voyage) };
    await this.store.addChangeLog([{ voyage: v.id, field: '新建航次', old: null, nw: v.biz + ' ' + v.load + '→' + v.disch, by: a.name, at: this.now() }]);
    await this.store.addIssues(this.issuesOf(v, warnings));
    return { voyage: v, cargo: saved };
  }

  /** A10：改基础字段 */
  async update(id: string, patch: Bag, a: Actor, key?: string) {
    const prev = await this.needEdit(id, a);
    return this.apply(prev, this.clean(patch, VOYAGE_EDITABLE), a, key);
  }

  /** A11：记录实际时间节点 */
  async milestone(id: string, field: string, value: string, a: Actor, key?: string) {
    if (!(MILESTONE_FIELDS as readonly string[]).includes(field)) throw invalid('不是可记录的实际节点：' + field);
    const prev = await this.needEdit(id, a);
    const v = await this.apply(prev, this.clean({ [field]: value }, VOYAGE_EDITABLE), a, key);
    return v;
  }

  private async apply(prev: Voyage, patch: Partial<Voyage>, a: Actor, key?: string) {
    const next = { ...prev, ...patch } as Voyage;
    const warnings = this.check(next, prev), status = deriveStatus(next), at = this.now();
    const entries = this.diff(prev as any, patch as any, VOYAGE_EDITABLE, a.name, prev.id, at);
    if (status !== prev.status) entries.push({ voyage: prev.id, field: '状态', old: prev.status || null, nw: status, by: a.name, at });
    if (!entries.length) return { ...prev, status };
    const saved = await this.store.update(prev.id, { ...patch, status }, sub(key, 'update'));
    await this.store.addChangeLog(entries);
    await this.store.addIssues(this.issuesOf(saved, warnings));
    return { ...saved, status };
  }

  /** A12：修订 ETA，必填依据；已抵卸港后不再修订 */
  async reviseEta(id: string, eta: string, basis: string, a: Actor, key?: string) {
    if (!(ETA_BASIS as readonly string[]).includes(basis)) throw invalid('ETA 修订必须填写依据（船讯网 / 船代 / 电话）');
    const prev = await this.needEdit(id, a);
    if (prev.actDischArr) throw invalid('该航次已有实际抵卸港时间，不再修订 ETA');
    const nw = parseDateTime(eta);
    if (!nw) throw invalid('ETA 不是有效的日期时间：' + eta);
    const at = this.now();
    if (nw === prev.eta) throw invalid('新的 ETA 与当前相同');
    const saved = await this.store.update(id, { eta: nw, etaUpdated: at }, sub(key, 'eta'));
    await this.store.addEtaRevision({ voyage: id, node: '预计抵卸港', old: prev.eta, nw, basis, by: a.name, at });
    await this.store.addChangeLog([{ voyage: id, field: 'ETA', old: show(prev.eta), nw, by: a.name, at }]);
    return { ...saved, status: deriveStatus(saved) };
  }

  /** A16：打或取消异常标记。打「取消」后状态为「已结束（取消）」 */
  async setFlag(id: string, flag: string, on: boolean, a: Actor, key?: string) {
    if (!(FLAGS as readonly string[]).includes(flag)) throw invalid('未知的异常标记：' + flag);
    const prev = await this.needEdit(id, a);
    const has = prev.flags.includes(flag);
    if (has === on) return { ...prev };
    const flags = on ? [...prev.flags, flag] : prev.flags.filter((f) => f !== flag);
    const status = deriveStatus({ ...prev, flags }), at = this.now();
    const saved = await this.store.update(id, { flags, status }, sub(key, 'flag'));
    const entries: ChangeEntry[] = [{ voyage: id, field: '异常标记', old: show(prev.flags), nw: show(flags), by: a.name, at }];
    if (status !== prev.status) entries.push({ voyage: id, field: '状态', old: prev.status || null, nw: status, by: a.name, at });
    await this.store.addChangeLog(entries);
    return { ...saved, status };
  }

  // ---------------- 货物明细 ----------------

  private cleanCargo(raw: Bag, requireAll: boolean, n?: number): NewCargo {
    const out: Bag = {}, errs: string[] = [];
    for (const [k, v] of Object.entries(raw || {})) {
      if (!CARGO_EDITABLE.includes(k)) { errs.push('不能修改货物字段：' + k); continue; }
      if (CARGO_NUMBER.has(k)) {
        if (v == null || v === '') { out[k] = k === 'tons' ? undefined : null; continue; }
        const p = parseNumber(v);
        if (!p) errs.push('货物字段「' + k + '」不是数字'); else out[k] = p.value;
      } else out[k] = v == null ? '' : String(v).trim();
    }
    if (requireAll) {
      if (!out.name) errs.push((n ? '第 ' + n + ' 行：' : '') + '货物名称必填');
      if (typeof out.tons !== 'number' || out.tons < 0) errs.push((n ? '第 ' + n + ' 行：' : '') + '货量必须是不小于 0 的数字');
    }
    if (errs.length) throw invalid(errs.join('；'));
    return { contract: '', ea: '', big: '', kind: '', alias: '', unit: '', dept2: '', party: '', over: '', exec: '', loadTons: null, dry: null, ...(out as any) } as NewCargo;
  }
  private async cargoIn(id: string, no: string) {
    const c = (await this.store.cargo(id)).find((x) => x.no === no);
    if (!c) throw fail(ResponseCode.NOT_FOUND, '找不到货物明细：' + no, HttpStatus.NOT_FOUND);
    return c;
  }

  /** A13：货物明细增改删 */
  async addCargo(id: string, body: Bag, a: Actor, key?: string) {
    await this.needEdit(id, a);
    const line = await this.store.addCargo(id, this.cleanCargo(body, true), sub(key, 'cargo'));
    await this.store.addChangeLog([{ voyage: id, field: '货物明细', old: null, nw: '新增 ' + line.name + ' ' + line.tons + ' 吨', by: a.name, at: this.now() }]);
    return line;
  }
  async updateCargo(id: string, no: string, body: Bag, a: Actor, key?: string) {
    await this.needEdit(id, a);
    const old = await this.cargoIn(id, no), patch = this.cleanCargo(body, false) as Bag;
    for (const k of Object.keys(patch)) if (!(k in (body || {}))) delete patch[k];          // 只保留请求里带的字段，不让默认值覆盖已有数据
    const line = await this.store.updateCargo(id, no, patch as Partial<CargoLine>, sub(key, 'cargo'));
    const labels = Object.fromEntries(CARGO_EDITABLE.map((k) => [k, '货物明细 ' + no + ' ' + k]));
    await this.store.addChangeLog(this.diff(old as any, patch, labels, a.name, id, this.now()));
    return line;
  }
  async deleteCargo(id: string, no: string, a: Actor, key?: string) {
    await this.needEdit(id, a);
    const old = await this.cargoIn(id, no);
    if ((await this.store.cargo(id)).length <= 1) throw invalid('至少保留一行货物明细');
    await this.store.deleteCargo(id, no, sub(key, 'cargo'));
    await this.store.addChangeLog([{ voyage: id, field: '货物明细', old: old.name + ' ' + old.tons + ' 吨', nw: '已删除', by: a.name, at: this.now() }]);
    return { deleted: no };
  }

  // ---------------- 扩展表 ----------------

  /** A14：大宗卸船结算。作业数据和费用结算分组鉴权；碰到无权限的分组直接拒绝，不静默丢弃 */
  async patchSettlement(id: string, body: Bag, a: Actor, key?: string) {
    const v = await this.need(id);
    if (!isBulk(v)) throw invalid('只有大宗采购船有卸船结算信息');
    if (v.readonly) throw forbidden('历史迁移记录为只读，不能修改');
    const keys = Object.keys(body || {}), bad = keys.filter((k) => !OPS_SET.has(k) && !MONEY_SET.has(k));
    if (bad.length) throw invalid('不能修改结算字段：' + bad.join('、'));
    if (keys.some((k) => OPS_SET.has(k)) && !canEditOps(a, v)) throw forbidden('没有修改作业数据的权限');
    if (keys.some((k) => MONEY_SET.has(k)) && !canEditMoney(a, v)) throw forbidden('费用结算只有大宗采购部的负责业务员或主管可以修改');
    const old = (await this.store.settlement(id)) || {}, patch: Record<string, string | number | boolean | null> = {}, errs: string[] = [];
    for (const k of keys) {
      const raw = (body as any)[k], label = MONEY_LABEL[k] || k;
      if (raw === '' || raw === null) { patch[k] = null; continue; }
      if (BOOL_KEYS.has(k)) { if (typeof raw === 'boolean') patch[k] = raw; else errs.push('「' + label + '」必须是 true 或 false'); }
      else if (DATE_KEYS_SETTLE.has(k)) { if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) patch[k] = raw; else errs.push('「' + label + '」必须是 YYYY-MM-DD'); }
      else if (TEXT_KEYS.has(k)) { if (typeof raw !== 'string') errs.push('「' + label + '」必须是文本'); else if (k === 'demCur' && !['IDR', 'USD'].includes(raw)) errs.push('币种只能是 IDR 或 USD'); else patch[k] = raw; }
      else { const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN; if (Number.isFinite(n)) patch[k] = n; else errs.push('「' + label + '」必须是数字'); }
    }
    if (errs.length) throw invalid(errs.join('；'));
    const saved = await this.store.saveSettlement(id, patch, sub(key, 'settle'));
    const at = this.now();
    const labels = { ...Object.fromEntries(OPS_KEYS.map((k) => [k, '结算 ' + k])), ...MONEY_LABEL };
    await this.store.addChangeLog(this.diff(old as Bag, patch, labels, a.name, id, at, MONEY_SET));
    return canSeeMoney(a) ? saved : Object.fromEntries(Object.entries(saved).filter(([k]) => !MONEY_SET.has(k)));
  }

  /** A15：成品销售扩展 */
  async patchSalesExt(id: string, body: Bag, a: Actor, key?: string) {
    const v = await this.need(id);
    if (!isProduct(v)) throw invalid('只有成品销售船有销售扩展信息');
    if (v.readonly) throw forbidden('历史迁移记录为只读，不能修改');
    if (!canEditSales(a, v)) throw forbidden('销售扩展只有商务海运部的负责业务员或主管可以修改');
    const bad = Object.keys(body || {}).filter((k) => !(k in SALES_LABEL));
    if (bad.length) throw invalid('不能修改销售扩展字段：' + bad.join('、'));
    const old = (await this.store.salesExt(id)) || {}, patch: Bag = {};
    for (const k of Object.keys(body)) patch[k] = (body as any)[k] === '' ? null : (body as any)[k];
    if (patch.way != null && !(SALES_WAYS as readonly string[]).includes(String(patch.way))) throw invalid('租船方式只能是 CFR 或 FOB');
    const saved = await this.store.saveSalesExt(id, patch as any, sub(key, 'sales'));
    await this.store.addChangeLog(this.diff(old as Bag, patch, SALES_LABEL, a.name, id, this.now()));
    return saved;
  }

  /**
   * A23 的航次侧：采纳预测方案。写回已有「待宣船」航次的计划窗口，或新建待宣船航次。
   * 窗口落在本港侧：卸港在本港 → 计划抵卸港窗口；装港在本港（成品销售船）→ 受载期。
   */
  async adoptPlan(input: { biz: string; load: string; disch: string; tons: number; item: string | null }, win: { from: string; to: string }, a: Actor, voyageId?: string, key?: string) {
    const local = input.load === 'BAHODOPI', patch: Bag = local ? { laycanS: win.from, laycanE: win.to } : { planDischS: win.from, planDischE: win.to };
    if (voyageId) {
      const prev = await this.needEdit(voyageId, a);
      if (prev.status !== '待宣船') throw invalid('只能写回「待宣船」状态的航次，当前是「' + prev.status + '」');
      if (prev.load !== input.load || prev.disch !== input.disch) throw invalid('航次的装卸港与这次预测不一致，请新建航次或换一条航次');
      return { created: false, voyage: await this.apply(prev, this.clean(patch, VOYAGE_EDITABLE), a, key) };
    }
    const r = await this.create({ biz: input.biz, load: input.load, disch: input.disch, ...(patch as any), cargo: [{ name: input.item || '（待补充）', tons: input.tons }] } as any, a, key);
    return { created: true, voyage: r.voyage };
  }

  /** A25：数据质量清单 */
  async issues(q: { status?: string; owner?: string; type?: string } = {}) {
    return (await this.store.issues()).filter((i) => (!q.status || i.status === q.status) && (!q.owner || i.owner === q.owner) && (!q.type || i.type === q.type));
  }
  /** 开始处理 / 关闭：需责任人本人或系统管理员 */
  async updateIssue(id: string, status: string, a: Actor) {
    if (status === '已关闭') return this.closeIssue(id, a);
    if (status !== '处理中') throw invalid('问题状态只能改为「处理中」或「已关闭」');
    const i = (await this.store.issues()).find((x) => x.id === id);
    if (!i) throw fail(ResponseCode.NOT_FOUND, '找不到问题：' + id, HttpStatus.NOT_FOUND);
    if (i.status === '已关闭') throw invalid('问题已经关闭');
    if (i.owner !== a.name && a.role !== '系统管理员') throw forbidden('只有责任人或系统管理员可以操作');
    await this.store.setIssueStatus(id, '处理中', a.name, this.now());
    return (await this.store.issues()).find((x) => x.id === id);
  }
  /** 关闭需责任人本人或系统管理员 */
  async closeIssue(id: string, a: Actor) {
    const i = (await this.store.issues()).find((x) => x.id === id);
    if (!i) throw fail(ResponseCode.NOT_FOUND, '找不到问题：' + id, HttpStatus.NOT_FOUND);
    if (i.status === '已关闭') return i;
    if (i.owner !== a.name && a.role !== '系统管理员') throw forbidden('只有责任人或系统管理员可以关闭');
    await this.store.closeIssue(id, a.name, this.now());
    return (await this.store.issues()).find((x) => x.id === id);
  }
}
