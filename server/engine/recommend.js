// 推荐：Plan A / Plan B（锁定规则 5、7）。排序指标：≤15 天路径用 CMR_min，＞15 天路径用同期最多船数；不使用综合评分。
// 规则引擎输出的数值不得被任何生成式模型改写（锁定规则 10）。
import { CONFIG } from '../config.js';
import { dn, md } from '../lib/dates.js';
import { createCapacity } from './capacity.js';
import { stockAt, dailyAt, stockoutPlan, stockLevel } from './stock.js';
import { findRule } from '../domain/routeRules.js';
import { BIZ } from '../domain/status.js';

/**
 * 创建一个绑定了数据快照的引擎。
 * @param {object} data 见 createCapacity；另需 routeRules（已 buildRule）、batchNo、plannedRun? 
 */
export function createEngine(data) {
  const cap = createCapacity(data);
  const { today: TODAY, PATH_LIMIT, poolFor } = cap;
  const WINDOW_LEN = data.windowLen ?? CONFIG.WINDOW_LEN, MIN_CMR = data.planBMinCmr ?? CONFIG.PLAN_B_MIN_CMR;
  const rules = data.routeRules || [];
  const ruleFor = (load, disch, biz) => findRule(rules, load, disch, biz);

  // 指标/资格/排序
  const qualify = (mode, m, n) => (mode === 'cmr' ? m >= MIN_CMR - 1e-9 : m <= Math.floor(n * (1 - MIN_CMR)));
  const better = (mode, a, b) => (mode === 'cmr' ? a > b : a < b);
  const rankSort = (mode) => (a, b) => (a.metric === b.metric ? a.s - b.s : (better(mode, a.metric, b.metric) ? -1 : 1));

  function buildCandidates(ws, we, modeIn, P) {
    const len = Math.min(WINDOW_LEN, we - ws + 1), out = [];
    for (let s = ws; s + len - 1 <= we; s++) {
      const mode = modeIn === 'auto' ? (s - TODAY <= PATH_LIMIT ? 'cmr' : 'density') : modeIn;   // auto：窗口始距今 ≤15 天用靠船计划，否则用航次表
      const days = []; for (let d = s; d < s + len; d++) days.push(Object.assign({ d }, cap.dayFn(mode)(d, P)));
      const ok = days.filter((x) => x.state === 'ok');
      const vals = ok.map((x) => (mode === 'cmr' ? x.cmr : x.count));
      out.push({ s, e: s + len - 1, len, days, mode, okDays: ok.length, complete: ok.length === len, none: ok.length === 0,
        metric: ok.length ? (mode === 'cmr' ? Math.min(...vals) : Math.max(...vals)) : null,
        missing: days.filter((x) => x.state !== 'ok').map((x) => x.d) });
    }
    return out;
  }

  /** 有效断料日：按该航线最快航程（P80）判断首个缺口能否赶上 */
  function effStockout(item, buffer, load, disch, biz) {
    const r = ruleFor(load, disch, biz);
    return stockoutPlan(item, buffer + (r && biz !== BIZ.PRODUCT ? Math.ceil(r.effP80) : 0), TODAY);
  }

  /**
   * 预测（A21）。
   * @param {object} inp { biz, tons, load, disch, winStart, winEnd, item?, buffer?, pathBy? }
   *   item：库存物料项（带 series）；pathBy='end'：按截止日提问，候选日期各自按距今天数分流（库存流程）
   */
  function predict(inp) {
    const biz = inp.biz, tons = Number(inp.tons);
    const res = { input: inp, errors: [], today: TODAY };
    if (!(tons > 0)) res.errors.push('请填写货量（吨）');
    if (!inp.winStart || !inp.winEnd) res.errors.push('请填写完整的时间窗口');
    const ws = inp.winStart ? dn(inp.winStart) : NaN, we = inp.winEnd ? dn(inp.winEnd) : NaN;
    if (inp.winStart && inp.winEnd) {
      if (we < ws) res.errors.push('窗口止不得早于窗口始');
      else if (ws < TODAY) res.errors.push('窗口始不得早于今天（' + data.today + '）');
    }
    if (res.errors.length) return res;

    const P = poolFor(tons);
    res.pool = P;
    if (P.n === 0) { res.errors.push('货量 ' + tons.toLocaleString() + ' 吨超过 23 个泊位中的最大容量，无匹配泊位'); return res; }

    // 断料约束：到港窗口最晚一天必须早于「断料日 − 缓冲天数」，否则判为断料（硬约束，不是评分）
    const item = inp.item || null, buffer = inp.buffer != null ? inp.buffer : CONFIG.DEFAULT_BUFFER_DAYS;
    const rule = ruleFor(inp.load, inp.disch, biz);
    const sp0 = item ? effStockout(item, buffer, inp.load, inp.disch, biz) : null;
    const so = sp0 ? sp0.so : null, latest = so != null ? so - buffer : Infinity;
    res.stock = item ? { item, so, latest: isFinite(latest) ? latest : null, buffer, gap: sp0.gap || null } : null;
    const target = inp.pathBy === 'end' ? Math.max(TODAY, Math.min(we, isFinite(latest) ? latest : we)) : ws;   // 目标到港日
    const dist = target - TODAY;
    const mode = dist <= PATH_LIMIT ? 'cmr' : 'density';       // 只按日期分流，不看有没有数据
    const side = biz === BIZ.PRODUCT ? '装' : '卸';
    const borrowed = biz === BIZ.SPARE && !!rule && !rule.biz.includes(BIZ.SPARE);
    res.run = { mode, dist, target, side, ws, we, batchNo: mode === 'cmr' ? (data.batchNo || null) : null, rule, borrowed };

    if (biz !== BIZ.PRODUCT && !rule) { res.noRule = true; return res; }      // 缺航程规则：拦截，提示先补经验航程
    const auto = inp.pathBy === 'end';
    const all = buildCandidates(ws, we, auto ? 'auto' : mode, P);
    const feasible = (c) => biz === BIZ.PRODUCT || !rule || (c.e - Math.ceil(rule.effP80)) >= TODAY;   // 发船日不得早于今天
    let usable = all.filter((c) => !c.none && feasible(c));
    let urgent = false;
    if (item && isFinite(latest)) {
      const safe = usable.filter((c) => c.e <= latest);
      if (safe.length) usable = safe;
      else {                                                                  // 按最快航程也赶不上：改为「最快到港」，并如实提示断料天数
        urgent = true;
        const e0 = TODAY + (rule ? Math.ceil(rule.effP80) : 0);
        usable = buildCandidates(Math.max(ws, e0 - WINDOW_LEN + 1), Math.max(we, e0 + 8), auto ? 'auto' : mode, P).filter((c) => !c.none && feasible(c));
        res.candidates = usable;
      }
    }
    res.urgent = urgent; if (res.stock) res.stock.urgent = urgent;
    if (!urgent) res.candidates = all;
    res.excluded = {
      noData: all.filter((c) => c.none).length,
      pastDepart: all.filter((c) => !c.none && !feasible(c)).length,
      cancelled: cap.cancelledVoy.length,
      offPool: cap.rows.filter((r) => !r.inPool).length,
    };

    // 分组排序：数据完整的候选优先；数据不全的候选（稀疏）只在没有完整候选时使用，并标「低可信」
    const best = (list, m) => { const comp = list.filter((c) => c.complete).sort(rankSort(m)), sp = list.filter((c) => !c.complete).sort(rankSort(m)); return { comp, sp, top: comp[0] || sp[0] || null }; };
    let A = null, B = null, bFallback = false;
    if (urgent) {                                                             // 告急：不比拥挤程度，按到港早晚排；A 最早，B 为与 A 错开的下一个
      const byStart = usable.filter((c) => c.okDays > 0).sort((a, b) => a.s - b.s);
      A = byStart[0] || null; B = A ? (byStart.find((c) => c.s - A.s >= A.len) || null) : null;
    } else if (auto) {                                                        // 跨路径：每条路径内部各按自己的指标排序，不跨路径比数值
      const near = best(usable.filter((c) => c.mode === 'cmr'), 'cmr'), far = best(usable.filter((c) => c.mode === 'density'), 'density');
      const okA = (g) => g.comp.find((c) => qualify(c.mode, c.metric, P.n));  // 先找余量达标（≥30%）的（2026-11-05 确认）
      A = okA(near) || okA(far) || near.comp[0] || far.comp[0] || near.sp[0] || far.sp[0] || null;
      if (A) {
        const apart = (c) => Math.abs(c.s - A.s) >= A.len;
        const okB = (g) => g.comp.find((c) => c !== A && apart(c) && qualify(c.mode, c.metric, P.n));
        const grpA = A.mode === 'cmr' ? near : far, grpO = A.mode === 'cmr' ? far : near;
        B = okB(grpO) || okB(grpA) || null;
        const okSp = (c) => c !== A && apart(c) && qualify(c.mode, c.metric, P.n);   // 稀疏候选同样要求有数据的天余量 ≥30%
        if (!B) { B = grpO.sp.find(okSp) || grpA.sp.find(okSp) || null; bFallback = !!B; }
      }
    } else {
      const g = best(usable, mode); A = g.top;
      if (A) {
        const apart = (c) => Math.abs(c.s - A.s) >= A.len;                    // B 与 A 窗口不重叠
        B = g.comp.find((c) => c !== A && apart(c) && qualify(mode, c.metric, P.n)) || null;
        if (!B) { B = g.sp.find((c) => c !== A && apart(c) && qualify(mode, c.metric, P.n)) || null; bFallback = !!B; }
      }
    }
    if (auto && res.candidates && res.candidates.length) {
      const ms = new Set(res.candidates.map((c) => c.mode));
      res.run.mode = ms.size > 1 ? 'mixed' : [...ms][0]; res.run.batchNo = ms.has('cmr') ? (data.batchNo || null) : null;
    }
    res.noCandidate = !A;

    function mkPlan(label, c, fallback) {
      const pm = c.mode || mode, reasons = [];
      if (!c.complete) reasons.push('窗口内有 ' + c.missing.length + ' 天没有' + (pm === 'cmr' ? '靠船计划' : '航次计划') + '数据（' + c.missing.map(md).join('、') + '），只按有数据的 ' + c.okDays + ' 天计算');
      if (fallback && c.complete === false) reasons.push('没有数据完整且余量不低于 30% 的时间，已从数据不全的时间里选取');
      const p = { label, c, mode: pm, trust: reasons.length ? '低可信' : '正常', reasons, qualifies: c.metric !== null && qualify(pm, c.metric, P.n) };
      if (item) {                                                             // 到港时库存：到港前库存 + 本船货量，按到港日的日耗折算可用天数
        const before = stockAt(item, c.e), dl = dailyAt(item, c.e), after = before + tons;
        const state = c.e <= latest ? 'safe' : (so != null && c.e <= so ? 'tight' : 'out');
        p.stock = { before, after, daysBefore: Math.floor(before / dl), daysAfter: Math.floor(after / dl), daily: dl, state, gap: so != null && c.e > so ? c.e - so : 0, level: stockLevel(Math.floor(after / dl)) };
      }
      if (biz !== BIZ.PRODUCT) {
        if (rule) {
          p.depart = c.e - Math.ceil(rule.effP80);                            // 最晚到港日按 P80 反推发船日
          p.etaFrom = p.depart + Math.ceil(rule.effP50);                      // 按 P50 预计抵港
          p.etaTo = p.depart + Math.ceil(rule.effP80);                        // 按 P80 预计抵港
        }
      } else {
        p.deadline = we;                                                      // 截止日 = 最晚装船日 = 受载期止
        p.slack = we - c.e;
        p.custEta = rule ? [c.s + Math.ceil(rule.effP50), c.e + Math.ceil(rule.effP80)] : null;   // 外贸客户港 ETA：反向近似，仅供参考
      }
      return p;
    }
    res.plans = A ? [mkPlan('A', A, false), B ? mkPlan('B', B, bFallback) : null] : [null, null];
    res.bMissing = !!A && !B;
    return res;
  }

  return Object.assign({}, cap, { qualify, ruleFor, effStockout, predict, buildCandidates });
}
