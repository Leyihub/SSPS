# 评审包 2：原型说明与核心代码

本文件由 `scripts/build-review-pack.mjs` 自动生成。原型的计算逻辑跑在浏览器里，仅用于让业务方评审，不是后端实现；评审时请区分「原型简化」和「规格问题」。数据全部虚构。

---

# 1. 原型说明

原型是 11 个可点击的 HTML 页面（原生 HTML / CSS / JS，不连飞书，示例数据全部虚构）。它的作用是让业务方评审页面和规则，不是后端实现。**原型里的计算逻辑跑在浏览器里，真实系统要重写成后端模块。**

如果你能打开网页：仓库配置了 GitHub Pages，会把 `prototype/` 发布为静态站点（是否公开可访问由仓库设置决定）。打不开的话请看 `prototype/screenshots/` 里的截图。

## 1. 页面清单

- **P11 智能提问**（预测入口）：文字或语音描述需求，关键词识别船型、物料、货量、航线、到港截止日；右侧展示库存可用天数分析；展示库存消耗曲线和断料日，再一键进入预测。
- **P02 智能发船预测**：输入业务类型、货量、装卸港、时间窗口、可选物料；输出推荐方案和备选方案卡片，含建议发船日、到港窗口、最低泊位余量或同期最多船数、航程口径（经验估算 / 历史统计）、可信度、库存保障；下方 30 天容量日历和 23 个泊位一览。
- **P03 预测详情**：参数匹配溯源（每个数字来自哪张表、哪个批次、哪条规则）、逐日计算过程、可用泊位视图、宣船文案。
- **P01 工作台**：待补节点、ETA 超期未更新、本周到港、数据质量问题。
- **P04 航次列表、P05 航次详情/编辑**：状态色标、时间轴、登记节点（时序校验）、修订 ETA（依据必填、留痕）、货物明细、卸船结算（作业数据与费用分权限）、销售扩展、变更日志。
- **P06 港口容量日历**：按货量档切换；近 15 天泊位余量，15 天后同期船数；点某天看在港船和 23 个泊位状态。
- **P07 靠船计划**：批次、最新一期明细、非德信池与未匹配告警、手动上传与校验。
- **P08 主数据**：港口（含别名）、泊位、船舶、航程规则。
- **P09 数据质量**、**P10 系统管理**（同步日志、兼容表刷新、迁移 dry-run、连通性自检）。

页面里可以用「模拟身份」切换角色体验权限。新建和修改只保存在浏览器标签页的会话存储里。

## 2. 预测引擎怎么算（对应附录里的 engine.js）

1. 输入：业务类型、货量、装港、卸港、期望窗口（成品为受载期）、可选的库存物料。
2. 能装下的泊位：容量不小于货量的启用泊位，数量就是分母。
3. 候选窗口：把期望窗口切成每 3 天一档，每次挪一天。
4. 每个候选日期按距今天数分流：不超过 15 天，用靠船计划算每天的泊位余量率，取窗口内最低值；超过 15 天，用航次表数同期船数，取窗口内最大值。数据覆盖不到的日子是「无数据」，该候选为「数据不全」。
5. 发船日：到港窗口最后一天减较长航程（P80）取整，且不得早于今天。航程来自航程规则：样本不足 5 条用经验估算，否则用历史统计。
6. 选方案：推荐方案是指标最优的数据完整候选（同分取更早）；备选方案要求余量不低于 30%（航次表路径用等效余量）且与推荐方案的窗口不重叠；没有完整数据候选时才从数据不全的候选里选并标「低可信」。
7. 库存断料约束：选了物料时，先排除到港窗口最后一天晚于「断料日减缓冲天数」的候选；都被排除时进入「最快到港」模式，按到港早晚排序并提示断料天数。窗口跨过 15 天界线时，两条路径各自排序，推荐方案取近 15 天路径中数据完整的最优，没有则取 15 天后路径的最优。
8. 到港时库存：到港窗口最后一天的模拟库存加本船货量，除以当天日耗，得到可用天数。

## 3. 其他关键逻辑

- **船舶状态推导**（`docs/schema/status-rules.md`）：按已填的最靠后一个时间节点从上往下判定，命中即止；取消优先；大宗船有实际抵装港即视为装港装货（大宗常不记录装港靠泊）；成品船卸港靠泊即视为已结束（这是一个未确认的假设）。
- **节点时序校验**：实际抵装港 ≤ 装港靠泊 ≤ 实际离装港 ≤ 实际抵卸港 ≤ 卸港靠泊 ≤ 卸港离港，后一节点早于前一节点拒绝保存。
- **自然语言解析**：关键词规则，不是生成式模型；识别不出就让用户点选。

## 4. 原型里的已知简化和假设（评审时请区分「原型简化」和「规格问题」）

- 泊位容量吨级是示例值，不是《泊位容量表》原值（只有 LN16 = 1 万吨来自规则）。
- 库存数据是虚构数值，真实文件含业务数据不入库；页面支持在本机浏览器导入真实文件（只在本地解析）。
- 靠船计划只有一个批次、约 55 行，覆盖到 11 月 16 日；航次表计划覆盖到 12 月 1 日，用来演示「无数据」。
- 候选窗口 3 天一档、备选方案与推荐方案窗口不重叠、缓冲 3 天、危险线 15 天，都是原型暂定值，已登记在待确认事项里。
- 没有鉴权，没有真实的写入队列、同步延迟、并发冲突。

## 5. 截图索引（`prototype/screenshots/`）

`P02-prediction.png`（默认场景）、`P02-prediction-s2-gt15.png`（15 天后）、`P02-prediction-s3-lowtrust.png`（低可信）、`P02-prediction-s4-product.png`（成品船）、`P02-prediction-s6-nodata.png`（完全无数据）、`P02-prediction-stock-safe.png`（库存充裕）、`P02-prediction-stock-urgent.png`（库存告急）、`P03-prediction-detail.png`、`P03-prediction-detail-stock.png`、`P11-ask.png`、`P11-ask-mobile.png`、`P01-workbench.png`、`P04-voyage-list.png`、`P05-voyage-detail.png`、`P05-voyage-detail-settle.png`、`P06-capacity-calendar.png`、`P07-berth-plan.png`、`P08-master-data.png`、`P09-data-quality.png`、`P10-admin.png`、`P10-admin-migration.png`。



---

# 2. 核心代码（附录）

以下四个文件是原型里与业务规则最相关的部分：预测引擎与库存断料约束、状态推导与时序校验、自然语言解析、库存曲线。页面的 HTML 和样式不在这里。

## prototype/engine.js

```js
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
  // 断料日（2026-11-05 确认）：首次降到 0 的缺口若按最快航程已赶不上、且之后被已排定到货补回，
  // 只提示这个短缺口，排船目标改用补回后的下一次断料日。minLead = 缓冲天数 + P80 航程。
  function stockoutPlan(it, minLead) {
    const s = it.series, i = s.findIndex((q) => q[1] <= 0);
    if (i < 0) return { so: null };
    const so1 = s[i][0];
    if (so1 - minLead >= TODAY) return { so: so1 };
    const j = s.findIndex((q, k) => k > i && q[1] > 0);
    if (j < 0) return { so: so1 };
    const k = s.findIndex((q, n) => n > j && q[1] <= 0);
    return { so: k < 0 ? null : s[k][0], gap: { from: so1, to: s[j][0] - 1 } };
  }
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

  // 物资备件船先用自己的规则，没有才借用同航线大宗规则（2026-11-05 确认）
  const ruleFor = (load, disch, biz) => findRule(load, disch, biz) || (biz === '物资备件船' ? findRule(load, disch, '大宗采购船') : null);
  // 有效断料日：按该航线最快航程（P80）判断首个缺口能否赶上
  function effStockout(item, buffer, load, disch, biz) {
    const r = ruleFor(load, disch, biz);
    return stockoutPlan(item, buffer + (r && biz !== '成品销售船' ? Math.ceil(r.effP80) : 0));
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
    const rule0 = ruleFor(inp.load, inp.disch, biz);
    const sp0 = item ? effStockout(item, buffer, inp.load, inp.disch, biz) : null;
    const so = sp0 ? sp0.so : null, latest = so != null ? so - buffer : Infinity;
    res.stock = item ? { item, so, latest: isFinite(latest) ? latest : null, buffer, gap: sp0.gap || null } : null;
    const target = inp.pathBy === 'end' ? Math.max(TODAY, Math.min(we, isFinite(latest) ? latest : we)) : ws;  // 目标到港日：默认窗口始；按截止日提问时取截止日
    const dist = target - TODAY;
    const mode = dist <= PATH_LIMIT ? 'cmr' : 'density'; // 只按日期分流，不看有没有数据
    const modeRun = mode;
    const side = biz === '成品销售船' ? '装' : '卸';
    const rule = rule0; // 物资备件船先用自己的规则，没有才借用同航线大宗规则（2026-11-05 确认）
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
      // 2026-11-05 确认：先找余量达标（≥30%）的；15 天内都不达标而 15 天后有达标的，推荐取 15 天后的。两条路径的数值不互相比较。
      const okA = (g) => g.comp.find((c) => qualify(c.mode, c.metric, P.n));
      A = okA(near) || okA(far) || near.comp[0] || far.comp[0] || near.sp[0] || far.sp[0] || null;   // 优先数据完整的候选，没有才用数据不全的
      if (A) {
        const apart = (c) => Math.abs(c.s - A.s) >= A.len;
        const okB = (g) => g.comp.find((c) => c !== A && apart(c) && qualify(c.mode, c.metric, P.n));
        const grpA = A.mode === 'cmr' ? near : far, grpO = A.mode === 'cmr' ? far : near;
        B = okB(grpO) || okB(grpA) || null;
        const okSp = (c) => c !== A && apart(c) && qualify(c.mode, c.metric, P.n);   // 稀疏候选也要求有数据的天里余量 ≥30%（2026-11-05 确认）
        if (!B) { B = grpO.sp.find(okSp) || grpA.sp.find(okSp) || null; bFallback = !!B; }
      }
    } else {
      const g = best(usable, mode); A = g.top;
      if (A) {
        const apart = (c) => Math.abs(c.s - A.s) >= A.len;               // B 与 A 窗口不重叠
        B = g.comp.find((c) => c !== A && apart(c) && qualify(mode, c.metric, P.n)) || null;
        if (!B) { B = g.sp.find((c) => c !== A && apart(c) && qualify(mode, c.metric, P.n)) || null; bFallback = !!B; }  // 没有完整数据候选 → 稀疏候选（同样要求 ≥30%），低可信
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
    planCoverTo, voyHorizon, predict, calendar, dayDetail, announce, modeOf, findRule, ruleFor, effStockout, stockoutPlan, qualify, cancelledVoy, rows, voyages };
})();
```

## prototype/assets/common.js

```js
/*
 * 共用脚本：状态推导（严格按 docs/schema/status-rules.md）、节点时序校验、格式化、浮窗、提示。
 * 只在原型里使用；真实实现在后端 server/domain/status.js、validate.js。
 */
(function () {
  const M = window.MOCK, E = window.ENGINE, C = {};
  const DAY = 86400000;
  C.fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'));
  C.pct = (x) => Math.round(x * 1000) / 10 + '%';
  C.dayNum = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  C.iso = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  C.TODAY = C.dayNum(M.today);
  C.md = (s) => (s ? s.slice(5, 10).replace('-', '/') : '—');                          // 11/08
  C.mdh = (s) => (s ? s.slice(5, 10).replace('-', '/') + (s.length > 10 && s.slice(11, 16) !== '00:00' ? ' ' + s.slice(11, 16) : '') : '—');
  C.mdCn = (s) => { if (!s) return '—'; const p = s.slice(0, 10).split('-'); return Number(p[1]) + '月' + Number(p[2]) + '日'; };
  C.wk = (s) => '周' + '日一二三四五六'[new Date(C.dayNum(s) * DAY).getUTCDay()];
  C.zh = (en) => { const p = M.ports.find((q) => q.en === en); return p ? p.cn.replace(/（.*?）/g, '') : (en || '—'); };
  C.esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  C.qs = new URLSearchParams(location.search);
  C.me = M.user;

  // ---------- 船舶状态（8 个互斥状态 + 取消） ----------
  C.STATUS = ['待宣船', '未到装港', '装港等泊', '装港装货', '航行中', '卸港等泊', '卸港卸货', '已结束'];
  C.statusOf = (v) => {
    const prodSale = v.biz === '成品销售船';
    if ((v.flags || []).includes('取消')) return '已结束（取消）';                                // 1
    if (v.dischDep || (prodSale && v.dischBerth)) return '已结束';                                // 2
    if (v.dischBerth) return '卸港卸货';                                                         // 3
    if (v.actDischArr) return '卸港等泊';                                                        // 4
    if (v.actLoadDep) return '航行中';                                                           // 5
    if (v.loadBerth || (v.biz === '大宗采购船' && v.actLoadArr)) return '装港装货';              // 6（大宗常不记录装港靠泊）
    if (v.actLoadArr) return '装港等泊';                                                         // 7
    if (v.vessel) return '未到装港';                                                             // 8
    return '待宣船';                                                                             // 9
  };
  C.stCls = (s) => (s === '已结束（取消）' ? 'sx' : 's' + C.STATUS.indexOf(s));
  C.stTag = (s) => '<span class="st ' + C.stCls(s) + '">' + s + '</span>';
  // 本港侧：装港为本港 = 装，否则 = 卸
  C.side = (v) => (v.load === 'BAHODOPI' ? '装' : '卸');
  C.localDate = (v) => { const s = C.side(v); return s === '装' ? { plan: v.laycanS, act: v.actLoadArr } : { plan: v.planDischS, act: v.actDischArr }; };
  C.total = (v) => M.cargoLines.filter((c) => c.voyage === v.id).reduce((a, c) => a + c.tons, 0) || v.tons;
  C.cargoOf = (v) => M.cargoLines.filter((c) => c.voyage === v.id);
  // 公式字段
  C.days = (a, b) => (a && b ? Math.round((new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'))) / DAY * 100) / 100 : null);
  C.derive = (v) => ({
    status: C.statusOf(v), side: C.side(v), total: C.total(v), pooled: C.cargoOf(v).length >= 2,
    overdue: v.laycanE && v.actLoadArr ? v.actLoadArr > v.laycanE : false,
    voyageDays: C.days(v.actLoadDep, v.actDischArr),
    waitDays: C.side(v) === '卸' ? C.days(v.actDischArr, v.dischBerth) : C.days(v.actLoadArr, v.loadBerth),
    workDays: C.side(v) === '卸' ? C.days(v.dischBerth, v.dischDep) : C.days(v.loadBerth, v.actLoadDep),
  });
  // 实际时间节点链：后一节点早于前一节点即拒绝保存
  C.CHAIN = [['actLoadArr', '实际抵装港'], ['loadBerth', '装港靠泊'], ['actLoadDep', '实际离装港'], ['actDischArr', '实际抵卸港'], ['dischBerth', '卸港靠泊'], ['dischDep', '卸港离港']];
  C.validate = (v) => {
    let prev = null;
    for (const [k, label] of C.CHAIN) {
      if (!v[k]) continue;
      if (prev && v[k] < v[prev[0]]) return '「' + label + '」（' + v[k] + '）不能早于「' + prev[1] + '」（' + v[prev[0]] + '）';
      prev = [k, label];
    }
    return null;
  };
  // 工作台待办 / 数据质量用：待补节点（实际抵卸港有值而实际离装港为空）
  C.missingDep = (v) => !!(v.actDischArr && !v.actLoadDep && !(v.flags || []).includes('取消'));
  C.ETA_STALE_DAYS = 3;                       // 暂定阈值（待确认）
  C.etaStale = (v) => !!(v.eta && !v.actDischArr && v.etaUpdated && C.TODAY - C.dayNum(v.etaUpdated) > C.ETA_STALE_DAYS);
  C.role = () => M.people[C.me.name].role;
  C.canEdit = (v) => !v.readonly && (['物流管理员', '系统管理员'].includes(C.role()) || v.owner === C.me.name || (C.role() === '部门主管' && v.dept === C.me.dept));

  // ---------- 浮窗与提示 ----------
  const TIPS = [];
  C.ic = (text) => '<span class="i" data-k="' + (TIPS.push(text) - 1) + '">i</span>';
  C.tipAttr = (text) => ' data-tip="' + C.esc(text) + '"';
  let tb = document.getElementById('tipbox');
  if (!tb) { tb = document.createElement('div'); tb.id = 'tipbox'; document.body.appendChild(tb); }
  const show = (el) => {
    const t = el.dataset.k !== undefined ? TIPS[+el.dataset.k] : el.dataset.tip; if (!t) return;
    tb.innerHTML = String(t).replace(/\\n|\n/g, '<br>'); tb.style.display = 'block';
    const r = el.getBoundingClientRect(), w = tb.offsetWidth, h = tb.offsetHeight;
    let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8), y = r.bottom + 8;
    if (y + h > innerHeight - 8) y = r.top - h - 8;
    tb.style.left = x + 'px'; tb.style.top = y + 'px';
  };
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('.i,[data-tip]'); if (el) show(el); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('.i,[data-tip]')) tb.style.display = 'none'; });
  document.addEventListener('click', (e) => { const el = e.target.closest('.i'); if (el) show(el); else tb.style.display = 'none'; });
  C.toast = (t) => {
    let el = document.getElementById('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(C.toast.t); C.toast.t = setTimeout(() => el.classList.remove('on'), 2600);
  };
  // 弹窗：C.modal({title, body, ok, onOk})
  C.modal = (o) => {
    let m = document.getElementById('cmodal'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'cmodal'; m.className = 'mask on';
    m.innerHTML = '<div class="modal" style="width:' + (o.width || 560) + 'px"><div class="modal-h"><span>' + o.title + '</span><button data-x>×</button></div><div class="modal-b">' + o.body + '</div><div class="modal-f">' +
      (o.hideCancel ? '' : '<button class="btn" data-x>取消</button>') + (o.ok === false ? '' : '<button class="btn primary" id="cmOk">' + (o.ok || '确定') + '</button>') + '</div></div>';
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelectorAll('[data-x]').forEach((b) => b.onclick = close);
    const ok = m.querySelector('#cmOk'); if (ok) ok.onclick = () => { if (!o.onOk || o.onOk(m) !== false) close(); };
    if (o.onOpen) o.onOpen(m);
    return m;
  };
  C.download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); };
  // ---------- 会话内持久化（原型：只存在于本浏览器标签页，刷新不丢，关闭即清） ----------
  const KEY = 'ssps-proto-v1', KEYS = ['voyageList', 'etaRevisions', 'changeLog', 'issues', 'cargoLines', 'batches', 'syncLogs', 'routeRules', 'vessels', 'ports', 'bulkSettle', 'salesExt'];
  try { const raw = sessionStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); KEYS.forEach((k) => { if (d[k]) M[k] = d[k]; }); } } catch (e) { /* 无存储时忽略 */ }
  C.persist = () => { try { const o = {}; KEYS.forEach((k) => { o[k] = M[k]; }); sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
  C.resetData = () => { try { sessionStorage.removeItem(KEY); sessionStorage.removeItem('ssps-inventory'); } catch (e) { /* ignore */ } };
  window.C = C;
})();
```

## prototype/assets/nlp.js

```js
/*
 * 自然语言提问解析（原型版，关键词规则）：识别船型（大宗 / 成品 / 物资备件）、物料（对应库存品名）、货量、航线、截止日期。
 * 真实系统里由后端 A29 解析，数值全部由规则引擎计算，不经过生成式模型改写。
 */
(function () {
  const M = window.MOCK, E = window.ENGINE, N = {};
  const T = E.TODAY, HORIZON = T + 60, LOCAL = 'BAHODOPI';
  const pad = (n) => String(n).padStart(2, '0');
  const CN = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const cn2n = (s) => { if (/^[\d.]+$/.test(s)) return parseFloat(s); if (s === '十') return 10; const m = s.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/); if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0); return s.length === 1 && CN[s] !== undefined ? CN[s] : NaN; };
  const KW = {
    '大宗采购船': ['大宗', '矿', '煤', '焦', '石灰石', '灰石', '精粉', '粉矿', '块矿', '喷吹', '废钢', '生铁', '铁皮', '原料', '燃料', '辅料', '采购', '散货', '塔精', '巴混', '凌美'],
    '成品销售船': ['成品', '线材', '热卷', '方坯', '板坯', '钢卷', '出口', '销售', '装船', '外贸', '发货', '客户', '螺纹'],
    '物资备件船': ['备件', '物资', '设备', '配件', '备品', '工程', '杂货'],
  };
  // 物料：优先按品名匹配（取最长命中）；只说了类型（铁矿 / 焦煤 / 辅料）时用该类型的「总库存」
  function detectItem(t) {
    const items = (M.inventory && M.inventory.items) || [];
    const hit = items.filter((i) => t.includes(i.name.replace('总库存', '')) && !i.name.endsWith('总库存')).sort((a, b) => b.name.length - a.name.length);
    if (hit.length) return { item: hit[0], alt: [] };
    const alts = items.filter((i) => !i.name.endsWith('总库存') && ['石灰石', '精粉', '喷吹煤', '气煤', '主焦煤', '块'].some((k) => t.includes(k) && i.name.includes(k)));
    if (alts.length) return { item: alts[0], alt: alts.slice(1, 5), ambiguous: true };
    for (const ty of ['铁矿', '焦煤']) if (t.includes(ty)) { const tot = items.find((i) => i.type === ty && i.name.endsWith('总库存')); if (tot) return { item: tot, alt: [] }; }
    if (t.includes('辅料')) return { item: null, alt: items.filter((i) => i.type === '辅料'), ambiguous: true };
    return { item: null, alt: [] };
  }
  function detectBiz(t, itemFound) {
    const score = {}; let best = null, top = 0, tie = false;
    Object.keys(KW).forEach((k) => { score[k] = KW[k].filter((w) => t.includes(w)).length; });
    if (itemFound) score['大宗采购船'] += 2;
    Object.keys(score).forEach((k) => { if (score[k] > top) { top = score[k]; best = k; tie = false; } else if (score[k] === top && top > 0) tie = true; });
    return tie ? null : best;
  }
  function detectTons(t) {
    let m = t.match(/([\d.]+|[一二两三四五六七八九十]+)\s*万\s*([一二三四五六七八九])?\s*(?:吨|t|T)?/);
    if (m) { const b = cn2n(m[1]); if (!isNaN(b)) return Math.round((b + (m[2] ? CN[m[2]] / 10 : 0)) * 10000); }
    m = t.match(/(\d+(?:\.\d+)?)\s*千\s*吨/); if (m) return Math.round(parseFloat(m[1]) * 1000);
    m = t.match(/(\d{3,6})\s*(?:吨|t\b|T\b|mt|MT)/); if (m) return parseInt(m[1], 10);
    return null;
  }
  const ALIAS = [];
  M.ports.forEach((p) => { const names = [p.en.toLowerCase(), p.cn.replace(/（.*?）/g, '')].concat((p.alias || []).map((a) => a.toLowerCase())); if (p.isLocal) names.push('imip', '本港', '园区', '德信'); names.forEach((n) => ALIAS.push([n, p.en])); });
  function detectPorts(t) {
    const low = t.toLowerCase(), hits = [];
    ALIAS.forEach(([n, en]) => { const i = low.indexOf(n); if (i >= 0 && !hits.find((h) => h.en === en)) hits.push({ en, i }); });
    return hits.sort((a, b) => a.i - b.i).map((h) => h.en);
  }
  const dnOf = (m, d) => E.dn((m < 11 ? 2027 : 2026) + '-' + pad(m) + '-' + pad(d));
  const monthEnd = (m) => dnOf(m === 12 ? 1 : m + 1, 1) - 1;
  function detectWindow(t) {
    const fwd = (s) => /^\s*(前|之前|以前|以内|内|到港|到|截止)/.test(s);
    let m;
    m = t.match(/(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*[日号]?\s*(?:到|至|-|~|—|–)\s*(?:(\d{1,2})\s*[月\/])?\s*(\d{1,2})\s*[日号]?/);
    if (m) { const m1 = +m[1], m2 = m[3] ? +m[3] : m1; return { a: dnOf(m1, +m[2]), b: dnOf(m2, +m[4]), range: true }; }
    let mon = null, part = null;
    m = t.match(/(\d{1,2})月(上旬|中旬|下旬|初|中|底)/); if (m) { mon = +m[1]; part = m[2]; }
    else if ((m = t.match(/(下个?月|本月|这个月|月)(初|中|底)/))) { mon = /下/.test(m[1]) ? 12 : 11; part = m[2]; }
    if (mon) { const r = { 初: [1, 7], 上旬: [1, 10], 中: [12, 18], 中旬: [11, 20], 底: [25, 31], 下旬: [21, 31] }[part]; return { a: dnOf(mon, r[0]), b: Math.min(dnOf(mon, r[1]), monthEnd(mon)), range: true }; }
    m = t.match(/(下下|下|本|这)?\s*(?:个)?(?:周|星期|礼拜)([一二三四五六日天])\s*(前|之前|以前)?/);
    if (m) { const dow = new Date(T * 86400000).getUTCDay(), mon0 = T - ((dow + 6) % 7), k = '一二三四五六日天'.indexOf(m[2]), kk = k >= 6 ? 7 : k + 1; let d = mon0 + (m[1] === '下' ? 7 : m[1] === '下下' ? 14 : 0) + kk - 1; if (!m[1] && d < T) d += 7; return m[3] ? { a: T, b: d, deadline: true } : { a: d - 1, b: d + 1, d }; }
    m = t.match(/(下下|下|本|这)(?:个)?(?:周|星期)(?![一二三四五六日天])/);
    if (m) { const dow = new Date(T * 86400000).getUTCDay(), mon1 = T - ((dow + 6) % 7) + (m[1] === '下' ? 7 : m[1] === '下下' ? 14 : 0); return { a: Math.max(mon1, T), b: mon1 + 6, range: true }; }
    m = t.match(/(\d+|[一二两三四五六七八九十]+)\s*天\s*(后|内|之内|以内)/);
    if (m) { const n = cn2n(m[1]); if (!isNaN(n)) return m[2] === '后' ? { a: T + n - 1, b: T + n + 1 } : { a: T, b: T + n, deadline: true }; }
    m = t.match(/(?:(\d{4})\s*年)?\s*(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*[日号]?/);
    if (m) { const d = dnOf(+m[2], +m[3]); const tail = t.slice(t.indexOf(m[0]) + m[0].length); return fwd(tail) || /截止|最晚|之前|前/.test(t) ? { a: T, b: d, deadline: true } : { a: d - 1, b: d + 1, d }; }
    m = t.match(/(\d{1,2})\s*[日号]/);
    if (m) { let d = dnOf(11, +m[1]); if (d < T) d = dnOf(12, +m[1]); return fwd(t.slice(t.indexOf(m[0]) + m[0].length)) || /截止|最晚|前/.test(t) ? { a: T, b: d, deadline: true } : { a: d - 1, b: d + 1, d }; }
    return null;
  }
  N.parse = function (text, ov) {
    ov = ov || {};
    const t = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)).replace(/[→＞>]|到德信|至/g, (x) => x);
    const f = detectItem(t); const r = { text, item: ov.item !== undefined ? ov.item : f.item, alt: f.alt || [], ambiguous: !!f.ambiguous && ov.item === undefined, notes: [] };
    r.biz = ov.biz || detectBiz(t, !!r.item);
    r.tons = ov.tons || detectTons(t);
    const ports = detectPorts(t), others = ports.filter((p) => p !== LOCAL);
    if (r.biz === '成品销售船') { r.load = LOCAL; r.disch = others[0] || null; } else { r.load = others[0] || null; r.disch = LOCAL; }
    let w = detectWindow(t);
    if (w && r.item && w.d !== undefined) w = { a: T, b: w.d, deadline: true };       // 问库存物料时，单个日期理解为「到港截止日」
    r.hasWin = !!w; r.userDeadline = !!(w && (w.deadline || w.b));
    if (w) { r.a = Math.max(w.a, T); r.b = Math.min(w.b, HORIZON); r.outside = r.b < r.a; } else { r.a = T; r.b = null; }
    return r;
  };
  window.NLP = N;
})();
```

## prototype/assets/stock-chart.js

```js
/* 库存消耗模拟曲线（SVG）：库存按日耗下降，已排定到货回升；标出危险线、断料日、最晚到港日，以及加入方案后的库存走势。 */
(function () {
  const E = window.ENGINE, T = E.TODAY, md = (n) => E.md(n);
  const fmtW = (n) => (n >= 10000 ? Math.round(n / 1000) / 10 + ' 万' : String(Math.round(n)));
  window.StockChart = {
    // opts: { latest, buffer, marks:[{d,tons,label,color}], until, warnDays }
    html(item, opts) {
      opts = opts || {};
      const W = Math.round(opts.width || 760), H = opts.height || 240, L = 52, R = 16, Tp = 22, B = 32, so = opts.so !== undefined ? opts.so : E.stockout(item), gap = opts.gap || null;
      const marks = (opts.marks || []).filter((m) => m && m.d != null);
      let until = T + 45;
      [so, opts.latest, ...marks.map((m) => m.d + 14)].forEach((x) => { if (x != null && x + 14 > until) until = x + 14; });
      until = Math.min(until, T + 100);
      const base = E.project(item, [], until);
      const lines = marks.slice(0, 2).map((m) => ({ m, pts: E.project(item, [{ d: m.d, tons: m.tons }], until) }));
      const ymax = Math.max(...base.map((p) => p[1]), ...lines.flatMap((l) => l.pts.map((p) => p[1])), item.daily * (opts.warnDays || 15) * 1.4, 1) * 1.08;
      const x = (d) => L + (d - T) / (until - T) * (W - L - R), y = (v) => Tp + (1 - v / ymax) * (H - Tp - B);
      const path = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
      const warn = item.daily * (opts.warnDays || 15);
      let g = '';
      // y 轴刻度
      for (let k = 0; k <= 4; k++) { const v = ymax / 1.08 * k / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#eef0f3"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="#98a4b3">' + fmtW(v) + '</text>'; }
      // x 轴刻度（每 10 天）
      for (let d = T; d <= until; d += 10) g += '<text x="' + x(d) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#98a4b3">' + md(d) + '</text>';
      // 断料期着色
      if (so != null) { const end = marks.length ? Math.min(...marks.map((m) => m.d)) : until; if (end > so) g += '<rect x="' + x(so) + '" y="' + Tp + '" width="' + Math.max(0, x(Math.min(end, until)) - x(so)) + '" height="' + (H - Tp - B) + '" fill="#fff1f0" opacity=".75"/>'; }
      // 危险线
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(warn) + '" y2="' + y(warn) + '" stroke="#fa8c16" stroke-dasharray="5 4"/><text x="' + (W - R - 4) + '" y="' + (y(warn) - 5) + '" text-anchor="end" font-size="11" fill="#d46b08">危险线（' + (opts.warnDays || 15) + ' 天用量）</text>';
      // 基础库存线
      g += '<path d="' + path(base) + ' L' + x(until) + ' ' + y(0) + ' L' + x(T) + ' ' + y(0) + ' Z" fill="#e6f4ff" opacity=".8"/><path d="' + path(base) + '" fill="none" stroke="#1677ff" stroke-width="2.2"/>';
      // 加入方案后的库存线
      lines.forEach((l) => { g += '<path d="' + path(l.pts.filter((p) => p[0] >= l.m.d - 1)) + '" fill="none" stroke="' + l.m.color + '" stroke-width="2.4" stroke-dasharray="6 4"/>'; });
      // 竖线：今天 / 最晚到港 / 断料日 / 方案到港
      const vline = (d, color, label, dy, dash, left) => '<line x1="' + x(d) + '" x2="' + x(d) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="' + color + '" stroke-width="1.6"' + (dash ? ' stroke-dasharray="4 3"' : '') + '/><text x="' + (x(d) + (left ? -4 : 4)) + '" y="' + (Tp + 10 + dy) + '" text-anchor="' + (left ? 'end' : 'start') + '" font-size="11.5" font-weight="600" fill="' + color + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + label + '</text>';
      g += vline(T, '#8c8c8c', '今天', 0, true);
      if (opts.latest != null && so != null) g += vline(opts.latest, '#fa8c16', '最晚到港 ' + md(opts.latest), 16, true, opts.latest >= T + 8);
      if (gap) g += vline(gap.from, '#fa8c16', '短缺口 ' + md(gap.from), 0, false);
      if (so != null) g += vline(so, '#cf1322', '断料日 ' + md(so), 0, false);
      marks.forEach((m, i) => { g += '<line x1="' + x(m.d) + '" x2="' + x(m.d) + '" y1="' + (H - B - 40) + '" y2="' + (H - B) + '" stroke="' + m.color + '" stroke-width="2.4"/><circle cx="' + x(m.d) + '" cy="' + (H - B - 40) + '" r="9" fill="' + m.color + '"/><text x="' + x(m.d) + '" y="' + (H - B - 36) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + m.label + '</text>'; });
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;max-width:100%;height:auto" role="img" aria-label="库存消耗模拟曲线">' + g + '</svg>';
    },
  };
})();
```
