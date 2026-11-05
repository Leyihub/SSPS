// S1 参数匹配溯源（锁定规则 10 的第二道防线）：每个数字来自哪张表、哪个批次、哪条规则，随方案一起存进 D06。
// 这里只收集引擎已经算出的值，不做任何改写；展示页和宣船文案都从这份 JSON 取数。
import { iso } from '../lib/dates';

const dstr = (n) => (n == null || !Number.isFinite(n) ? null : iso(n));

/** @param meta { batchNo, batchSource, planDate, planCoverTo, voyHorizon, inventoryBatchNo, runBy, now } */
export function buildProvenance(res: any, plan: any, meta: any = {}) {
  const i = res.input, R = res.run, P = res.pool, rule = R.rule;
  return {
    label: plan.label,
    inputs: { biz: i.biz, tons: Number(i.tons), load: i.load, disch: i.disch, winStart: i.winStart, winEnd: i.winEnd, item: i.item ? i.item.name : null, buffer: i.buffer ?? null, pathBy: i.pathBy || null },
    pool: { n: P.n, codes: P.list.map((b) => b.code), basis: P.list[0] ? P.list[0].basis ?? null : null },
    path: { runMode: R.mode, planMode: plan.mode, target: dstr(R.target), dist: R.dist, rule: '只按目标到港日距今天数分流（≤15 天靠船计划，＞15 天航次表），不看有没有数据' },
    source: plan.mode === 'cmr'
      ? { table: '靠船计划（T10 最新一期）', batchNo: meta.batchNo ?? R.batchNo ?? null, planDate: meta.planDate ?? null, source: meta.batchSource ?? null, coverTo: dstr(meta.planCoverTo) }
      : { table: '航次主表（T04）', coverTo: dstr(meta.voyHorizon) },
    days: plan.c.days.map((d) => (d.state !== 'ok' ? { date: dstr(d.d), state: 'nodata' } : plan.mode === 'cmr'
      ? { date: dstr(d.d), state: 'ok', occ: d.occ, n: d.n, cmr: d.cmr, berths: d.occBerths }
      : { date: dstr(d.d), state: 'ok', count: d.count, n: d.n, ships: d.ships.map((s) => s.id || s.vessel) })),
    metric: plan.mode === 'cmr' ? { name: 'CMR_min', value: plan.c.metric } : { name: '同期最多船数', value: plan.c.metric },
    window: { from: dstr(plan.c.s), to: dstr(plan.c.e), complete: plan.c.complete, missing: plan.c.missing.map(dstr) },
    rule: rule ? { id: rule.id, basis: rule.basis, samples: rule.samples, effP50: rule.effP50, effP80: rule.effP80, borrowed: R.borrowed } : null,
    depart: dstr(plan.depart), eta: plan.etaFrom != null ? [dstr(plan.etaFrom), dstr(plan.etaTo)] : null, deadline: dstr(plan.deadline), custEta: plan.custEta ? plan.custEta.map(dstr) : null,
    stock: plan.stock && res.stock ? { item: res.stock.item.name, stockout: dstr(res.stock.so), latest: dstr(res.stock.latest), buffer: res.stock.buffer, gap: res.stock.gap ? { from: dstr(res.stock.gap.from), to: dstr(res.stock.gap.to) } : null, urgent: !!res.urgent, batchNo: meta.inventoryBatchNo ?? null, ...plan.stock } : null,
    excluded: res.excluded, trust: plan.trust, reasons: plan.reasons,
    runBy: meta.runBy ?? null, at: meta.now ?? null,
  };
}

/** 引擎结果 → D05 prediction_run 记录 */
export function toRunRecord(res: any, runNo: string, meta: any = {}) {
  const R = res.run;
  return { run_no: runNo, input: buildProvenance(res, res.plans.find(Boolean), meta).inputs, item_name: res.input.item ? res.input.item.name : null,
    inventory_batch_no: meta.inventoryBatchNo ?? null, berth_plan_batch_no: R.mode === 'density' ? null : (meta.batchNo ?? R.batchNo ?? null),
    run_mode: { cmr: '近', density: '远', mixed: '混合' }[R.mode], route_rule_id: R.rule ? R.rule.id : null, rule_basis: R.rule ? R.rule.basis : null, borrowed_rule: !!R.borrowed, run_by: meta.runBy ?? null };
}

/** 引擎结果的一个方案 → D06 prediction_plan 记录 */
export function toPlanRecord(res: any, plan: any, runNo: string, meta: any = {}) {
  return { run_no: runNo, label: plan.label, depart_date: dstr(plan.depart), window_from: dstr(plan.c.s), window_to: dstr(plan.c.e), path: plan.mode === 'cmr' ? '近' : '远',
    cmr_min: plan.mode === 'cmr' ? plan.c.metric : null, max_ships: plan.mode === 'cmr' ? null : plan.c.metric, trust: plan.trust,
    stock_state: plan.stock ? plan.stock.state : null, stockout_date: res.stock ? dstr(res.stock.so) : null, provenance: buildProvenance(res, plan, meta), adopted: false, adopted_voyage: null };
}
