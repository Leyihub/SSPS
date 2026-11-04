/*
 * SSPS 原型用的"迷你规则引擎"——只在浏览器里按 mock-data.js 计算，用来让原型可点击、数字自洽。
 * 它不是后端实现；真实引擎在 server/engine/（capacity.js / recommend.js / provenance.js）。
 * 对应锁定规则：CMR 口径、吨级匹配分母、≤15 天 / ＞15 天分流、Plan A/B、低可信降级、无数据三态。
 */
(function () {
  const M = window.MOCK;
  try { const raw = sessionStorage.getItem('ssps-inventory'); if (raw) { const inv = JSON.parse(raw); if (inv && inv.items) M.inventory = inv; } } catch (e) { /* 没有会话存储时用示例库存 */ }
  const DAY = 86400000;
  const dn = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  const iso = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const WK = ['日', '一', '二', '三', '四', '五', '六'];
  const wk = (n) => WK[new Date(n * DAY).getUTCDay()];
  const md = (n) => iso(n).slice(5).replace('-', '/');
  const TODAY = dn(M.today);
  const PATH_LIMIT = 15;          // 目标到港日距今 ≤15 天 → 靠船计划；＞15 天 → 航次表（只按日期分流）
  const PLAN_B_MIN_CMR = 0.3;     // Plan B 要求 CMR 余量 ≥30%
  const WINDOW_LEN = 3;           // 候选到港窗口长度（天）——原型取值

  // ---------- 库存消耗模拟（断料计划） ----------
  // 序列项为 [日序号, 库存吨, 日耗吨]；已包含已排定到货，所以断料日 = 模拟库存首次降到 0 的那一天
  const stockAt = (it, d) => { const S = it.series; if (!S.length) return it.stock; if (d <= S[0][0]) return S[0][1]; let v = S[0][1]; for (const x of S) { if (x[0] <= d) v = x[1]; else break; } return v; };
  const dailyAt = (it, d) => { const S = it.series; if (!S.length) return it.daily; let v = S[0][2]; for (const x of S) { if (x[0] <= d) v = x[2]; else break; } return v || it.daily || 1; };
  const stockout = (it) => { const x = it.series.find((q) => q[1] <= 0); return x ? x[0] : null; };
  // 把一船新货算进去后的库存曲线（原序列里的已排定到货按相邻日差回推，保留）
  function project(it, arrivals, until) {
    const S = it.series, out = []; let prev = S.length ? S[0][1] : it.stock;
    for (let d = TODAY; d <= until; d++) {
      const base = stockAt(it, d), basePrev = stockAt(it, d - 1), dl = dailyAt(it, d);
      const sched = d > TODAY ? Math.max(0, base - basePrev + (basePrev > 0 ? dl : 0)) : 0;   // 已排定到货
      let s = d === TODAY ? base : Math.max(0, prev - dl + sched);
      arrivals.forEach((a) => { if (a.d === d) s += a.tons; });
      out.push([d, s]); prev = s;
    }
    return out;
  }
  const stockLevel = (days) => (days >= 25 ? '充裕' : days >= 15 ? '偏紧' : '危险');   // 沿用德龙版：>25 天充裕、15–25 偏紧、<15 危险

  // ---------- 吨级匹配（分母） ----------
  const enabled = M.berths.filter((b) => b.status === '启用');
  const caps = [...new Set(enabled.map((b) => b.capacity))].sort((a, b) => a - b);
  const needTier = (tons) => caps.find((c) => c >= tons) || null;   // 装得下该货量的最小泊位吨级
  function poolFor(tons) {
    const list = enabled.filter((b) => b.capacity >= tons);          // 只计容量 ≥ 货量的启用泊位
    return { list, ids: new Set(list.map((b) => b.code)), n: list.length, tier: needTier(tons) };
  }

  // ---------- 数据覆盖 ----------
  const rows = M.berthPlanRows.map((r) => Object.assign({}, r, { s: dn(r.start), e: dn(r.end) }));
  const planCoverTo = Math.max(...rows.map((r) => r.s));            // 靠船计划覆盖到批次内最后一条预计靠泊日
  const liveVoy = M.voyages.filter((v) => !v.flags.includes('取消')); // 取消航次不进密度和 CMR
  const cancelledVoy = M.voyages.filter((v) => v.flags.includes('取消'));
  const voyages = liveVoy.map((v) => Object.assign({}, v, { s: dn(v.winStart), e: dn(v.winEnd), tier: needTier(v.totalTons) }));
  const voyHorizon = Math.max(...voyages.map((v) => v.e));           // 航次表计划覆盖到最晚窗口止

  // ---------- 单日指标 ----------
  function cmrDay(d, P) {
    if (d > planCoverTo) return { state: 'nodata' };                 // 无数据 ≠ 0%
    const occ = new Set();
    rows.forEach((r) => { if (r.inPool && P.ids.has(r.berth) && r.s <= d && d <= r.e) occ.add(r.berth); }); // 只比日期
    return { state: 'ok', occ: occ.size, n: P.n, cmr: (P.n - occ.size) / P.n, occBerths: [...occ] };
  }
  function densityDay(d, P) {
    if (d > voyHorizon) return { state: 'nodata' };
    const ships = voyages.filter((v) => v.tier >= P.tier && v.s <= d && d <= v.e); // 只计与该吨级泊位竞争的船
    return { state: 'ok', count: ships.length, n: P.n, ships };
  }
  const dayFn = (mode) => (mode === 'cmr' ? cmrDay : densityDay);
  const modeOf = (d) => (d - TODAY <= PATH_LIMIT ? 'cmr' : 'density');

  // ---------- 指标/资格/排序 ----------
  const qualify = (mode, m, n) => (mode === 'cmr' ? m >= PLAN_B_MIN_CMR - 1e-9 : m <= Math.floor(n * (1 - PLAN_B_MIN_CMR)));
  const better = (mode, a, b) => (mode === 'cmr' ? a > b : a < b);

  function buildCandidates(ws, we, modeIn, P) {
    const len = Math.min(WINDOW_LEN, we - ws + 1), out = [];
    for (let s = ws; s + len - 1 <= we; s++) {
      const mode = modeIn === 'auto' ? (s - TODAY <= PATH_LIMIT ? 'cmr' : 'density') : modeIn;   // auto：目标到港日（窗口始）距今 ≤15 天用靠船计划，否则用航次表
      const days = []; for (let d = s; d < s + len; d++) days.push(Object.assign({ d }, dayFn(mode)(d, P)));
      const ok = days.filter((x) => x.state === 'ok');
      const vals = ok.map((x) => (mode === 'cmr' ? x.cmr : x.count));
      out.push({ s, e: s + len - 1, len, days, mode, okDays: ok.length, complete: ok.length === len, none: ok.length === 0,
        metric: ok.length ? (mode === 'cmr' ? Math.min(...vals) : Math.max(...vals)) : null,
        missing: days.filter((x) => x.state !== 'ok').map((x) => x.d) });
    }
    return out;
  }
  const rankSort = (mode) => (a, b) => (a.metric === b.metric ? a.s - b.s : (better(mode, a.metric, b.metric) ? -1 : 1));

  function findRule(load, disch, biz) {
    return M.routeRules.find((r) => r.load === load && r.disch === disch && r.biz.includes(biz)) || null;
  }

  // ---------- 预测 ----------
  function predict(inp) {
    const biz = inp.biz, tons = Number(inp.tons);
    const ws = dn(inp.winStart), we = dn(inp.winEnd);
    const res = { input: inp, errors: [], today: TODAY };
    if (!(tons > 0)) res.errors.push('请填写货量（吨）');
    if (!inp.winStart || !inp.winEnd) res.errors.push('请填写完整的时间窗口');
    else if (we < ws) res.errors.push('窗口止不得早于窗口始');
    else if (ws < TODAY) res.errors.push('窗口始不得早于今天（' + M.today + '）');
    if (res.errors.length) return res;

    const P = poolFor(tons);
    res.pool = P;
    if (P.n === 0) { res.errors.push('货量 ' + tons.toLocaleString() + ' 吨超过 23 个泊位中的最大容量，无匹配泊位'); return res; }

    // 断料约束：到港窗口最晚一天必须早于「断料日 − 缓冲天数」，否则判为断料（硬约束，不是评分）
    const item = inp.item || null, buffer = inp.buffer != null ? inp.buffer : 3;
    const so = item ? stockout(item) : null, latest = so != null ? so - buffer : Infinity;
    res.stock = item ? { item, so, latest: isFinite(latest) ? latest : null, buffer } : null;
    const target = inp.pathBy === 'end' ? Math.max(TODAY, Math.min(we, isFinite(latest) ? latest : we)) : ws;  // 目标到港日：默认窗口始；按截止日提问时取截止日
    const dist = target - TODAY;
    const mode = dist <= PATH_LIMIT ? 'cmr' : 'density'; // 只按日期分流，不看有没有数据
    const modeRun = mode;
    const side = biz === '成品销售船' ? '装' : '卸';
    const rule = findRule(inp.load, inp.disch, biz) ||
                 (biz === '物资备件船' ? findRule(inp.load, inp.disch, '大宗采购船') : null); // 物资备件船借用大宗航线样本
    const borrowed = biz === '物资备件船' && rule && !rule.biz.includes('物资备件船');
    res.run = {
      id: 'PR-' + M.today.replace(/-/g, '') + '-0007', mode, dist, target, side, ws, we,
      batchNo: mode === 'cmr' ? M.batch.batchNo : null, rule, borrowed,
      runBy: M.user.name, at: M.today + ' 09:42',
    };

    if (!inp.strict && biz !== '成品销售船' && !rule) { res.noRule = true; return res; }  // v1：缺规则时拦截；v2（strict）只是不给发船日
    const auto = inp.pathBy === 'end';                             // 库存流程：候选日期各自按距今天数分流
    const all = buildCandidates(ws, we, auto ? 'auto' : mode, P);
    const feasible = (c) => biz === '成品销售船' || !rule || (c.e - Math.ceil(rule.effP80)) >= TODAY; // 发船日不得早于今天
    let usable = all.filter((c) => !c.none && feasible(c));
    let urgent = false;
    if (item && isFinite(latest)) {
      const safe = usable.filter((c) => c.e <= latest);
      if (safe.length) usable = safe;
      else {                                                         // 按最快航程也赶不上：改为「最快到港」，并如实提示断料天数
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
      cancelled: cancelledVoy.length,
      offPool: rows.filter((r) => !r.inPool).length,
    };
    const best = (list, m) => { const comp = list.filter((c) => c.complete).sort(rankSort(m)), sp = inp.strict ? [] : list.filter((c) => !c.complete).sort(rankSort(m)); return { comp, sp, top: comp[0] || sp[0] || null }; };
    let A = null, B = null, bFallback = false;
    if (urgent) {                                                    // 告急：不比拥挤程度，按到港早晚排；A 最早，B 为与 A 错开的下一个
      const byStart = usable.filter((c) => c.okDays > 0).sort((a, b) => a.s - b.s);
      A = byStart[0] || null; B = A ? (byStart.find((c) => c.s - A.s >= A.len) || null) : null;
    } else if (auto) {                                               // 跨路径：每条路径内部各按自己的指标排序，不跨路径比数值
      const near = best(usable.filter((c) => c.mode === 'cmr'), 'cmr'), far = best(usable.filter((c) => c.mode === 'density'), 'density');
      A = near.comp[0] || far.comp[0] || near.sp[0] || far.sp[0] || null;   // 优先数据完整的候选，没有才用数据不全的
      if (A) {
        const apart = (c) => Math.abs(c.s - A.s) >= A.len;
        const okB = (g) => g.comp.find((c) => c !== A && apart(c) && qualify(c.mode, c.metric, P.n));
        const grpA = A.mode === 'cmr' ? near : far, grpO = A.mode === 'cmr' ? far : near;
        B = okB(grpO) || okB(grpA) || null;
        if (!B) { B = grpO.sp.find((c) => c !== A && apart(c)) || grpA.sp.find((c) => c !== A && apart(c)) || null; bFallback = !!B; }
      }
    } else {
      const g = best(usable, mode); A = g.top;
      if (A) {
        const apart = (c) => Math.abs(c.s - A.s) >= A.len;               // B 与 A 窗口不重叠
        B = g.comp.find((c) => c !== A && apart(c) && qualify(mode, c.metric, P.n)) || null;
        if (!B) { B = g.sp.find((c) => c !== A && apart(c)) || null; bFallback = !!B; }  // 没有完整数据候选 → 稀疏候选，低可信
      }
    }
    if (auto && res.candidates && res.candidates.length) { const ms = new Set(res.candidates.map((c) => c.mode)); res.run.mode = ms.size > 1 ? 'mixed' : [...ms][0]; res.run.batchNo = ms.has('cmr') ? M.batch.batchNo : null; }
    res.noCandidate = !A;
    res.plans = A ? [mkPlan('A', A, false), B ? mkPlan('B', B, bFallback) : null] : [null, null];
    res.bMissing = A && !B;

    function mkPlan(label, c, fallback) {
      const mode = c.mode || modeRun, reasons = [];
      if (!c.complete) reasons.push('窗口内有 ' + c.missing.length + ' 天没有' + (mode === 'cmr' ? '靠船计划' : '航次计划') + '数据（' + c.missing.map(md).join('、') + '），只按有数据的 ' + c.okDays + ' 天计算');
      if (fallback && c.complete === false) reasons.push('没有数据完整且余量不低于 30% 的时间，已从数据不全的时间里选取');
      const low = reasons.length > 0;
      const p = { label, c, mode, trust: low ? '低可信' : '正常', reasons, qualifies: c.metric !== null && qualify(mode, c.metric, P.n) };
      if (item) {                                                     // 到港时库存：到港前库存 + 本船货量，按到港日的日耗折算可用天数
        const before = stockAt(item, c.e), dl = dailyAt(item, c.e), after = before + tons;
        const state = c.e <= latest ? 'safe' : (so != null && c.e <= so ? 'tight' : 'out');
        p.stock = { before, after, daysBefore: Math.floor(before / dl), daysAfter: Math.floor(after / dl), daily: dl, state, gap: so != null && c.e > so ? c.e - so : 0, level: stockLevel(Math.floor(after / dl)) };
      }
      if (biz !== '成品销售船') {
        if (rule) {
        p.depart = c.e - Math.ceil(rule.effP80);                          // 最晚到港日按 P80 反推
        p.etaFrom = p.depart + Math.ceil(rule.effP50);                    // 按 P50 预计抵港
        p.etaTo = p.depart + Math.ceil(rule.effP80);                      // 按 P80 预计抵港
        }
      } else {
        p.deadline = we;                                                  // 截止日 = 最晚装船日 = 受载期止
        p.slack = we - c.e;
        const r = rule;                                                   // 外贸客户港 ETA：反向近似，仅供参考
        p.custEta = r ? [c.s + Math.ceil(r.effP50), c.e + Math.ceil(r.effP80)] : null;
      }
      return p;
    }
    return res;
  }

  // ---------- 30 天容量日历（A20） ----------
  function calendar(tons, plans, window_) {
    const P = poolFor(tons), days = [];
    for (let i = 0; i < 30; i++) {
      const d = TODAY + i, mode = modeOf(d);
      days.push(Object.assign({ d, i, mode, dist: i }, P.n ? dayFn(mode)(d, P) : { state: 'nodata' }));
    }
    return { P, days };
  }

  // ---------- 某一天的船只明细（点击日历用） ----------
  function dayDetail(d, tons) {
    const P = poolFor(tons), mode = modeOf(d), info = dayFn(mode)(d, P);
    if (info.state !== 'ok') return { d, mode, state: 'nodata', P, list: [] };
    let list;
    if (mode === 'cmr') {
      list = rows.filter((r) => r.inPool && P.ids.has(r.berth) && r.s <= d && d <= r.e).map((r) => ({
        vessel: r.vessel, berth: r.berth, cargo: r.cargo, tons: r.tons, eta: dn(r.eta), start: r.s, end: r.e,
        arriving: dn(r.eta) === d, berthing: r.s === d }));
    } else {
      list = info.ships.map((v) => ({ vessel: v.vessel, id: v.id, load: v.load, disch: v.disch, biz: v.biz, tons: v.totalTons,
        start: v.s, end: v.e, status: v.status, side: v.localSide, arriving: v.s === d }));
    }
    list.sort((a, b) => (!!b.arriving - !!a.arriving) || (!!b.berthing - !!a.berthing) || (a.start - b.start));
    return Object.assign({ d, mode, state: 'ok', P, list }, mode === 'cmr' ? { cmr: info.cmr, occ: info.occ } : { count: info.count });
  }

  // ---------- 宣船文案（只引用引擎结果，不改写数值） ----------
  // 返回片段数组：v=true 的片段是引擎数值（页面高亮、只读）；其余是固定模板措辞。
  function announce(res, plan) {
    const i = res.input, P = res.pool, r = res.run, rule = r.rule, v = (t) => ({ t: String(t), v: true }), s = (t) => ({ t });
    const zh = (en) => { const x = M.ports.find((q) => q.en === en); return x ? x.cn.replace(/（.*?）/g, '') : (en || '未说明'); };
    const pct = (x) => Math.round(x * 1000) / 10 + '%';
    const out = [s('【宣船】' + i.biz + ' · '), v(Number(i.tons).toLocaleString() + ' 吨'), s(' · ' + zh(i.load) + ' → ' + zh(i.disch) + '。方案' + plan.label + '：')];
    if (i.biz !== '成品销售船') {
      if (plan.depart != null) out.push(s('建议发船日 '), v(iso(plan.depart)), s('（离开装港），'));
      out.push(s('计划到' + zh(i.disch) + '的窗口 '), v(md(plan.c.s) + ' ~ ' + md(plan.c.e)), s('；'));
    } else {
      out.push(s('建议装船窗口 '), v(md(plan.c.s) + ' ~ ' + md(plan.c.e)), s('，最晚装船日 '), v(iso(plan.deadline)), s('；'));
    }
    if (plan.mode === 'cmr') out.push(s('窗口内最低泊位余量 '), v(pct(plan.c.metric)), s('（能装下的泊位 '), v(P.n + ' 个'), s('）；'));
    else out.push(s('窗口内同期最多 '), v(plan.c.metric + ' 艘'), s(' 船（能装下的泊位 '), v(P.n + ' 个'), s('）；'));
    if (plan.stock && res.stock) { const st = res.stock; out.push(s('按库存消耗模拟，' + st.item.name + '断料日 '), v(st.so != null ? iso(st.so) : '模拟期内不断料'), s('，本方案到港时库存可用 '), v(plan.stock.daysAfter + ' 天'), s(plan.stock.state === 'out' ? '，到港前预计断料 ' : '；'), ...(plan.stock.state === 'out' ? [v(plan.stock.gap + ' 天'), s('；')] : [])); }
    if (rule && i.biz !== '成品销售船') out.push(s('航程按' + (rule.basis === '经验值' ? '经验估算' : '历史统计') + ' '), v(Math.ceil(rule.effP50) + '～' + Math.ceil(rule.effP80) + ' 天'), s('；'));
    if (plan.trust === '低可信') out.push(s('本方案数据不完整，请谨慎采用；'));
    if (i.biz === '成品销售船' && plan.custEta) out.push(s('到客户港预计 '), v(md(plan.custEta[0]) + ' ~ ' + md(plan.custEta[1])), s('（仅供参考）；'));
    out.push(s('以上数值由规则计算得出，文案未改写。'));
    return out;
  }

  window.ENGINE = { stockAt, dailyAt, stockout, project, stockLevel, dn, iso, wk, md, TODAY, PATH_LIMIT, PLAN_B_MIN_CMR, WINDOW_LEN, poolFor, needTier,
    planCoverTo, voyHorizon, predict, calendar, dayDetail, announce, modeOf, findRule, qualify, cancelledVoy, rows, voyages };
})();
