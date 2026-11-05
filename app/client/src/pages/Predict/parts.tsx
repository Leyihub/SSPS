// P02 / P03 / P11 共用的预测展示组件：方案卡片、结果概览、库存保障、30 天日历、泊位一览、采纳与宣船文案弹窗。
// 引擎返回的数值原样展示，不在前端重算（锁定规则 10）。
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, useBerths, useDayDetail, useTrend, useVoyages, useWrite } from '../../ssps/api';
import { cmrCls, cmrLab, denCls, denLab, nDCn, nIso, nMd, nMdCn, nWk, stockLevel, wan } from '../../ssps/cmr';
import { fmt, pct } from '../../ssps/format';
import { usePortName } from '../../ssps/hooks';
import { StockChart } from '../../ssps/StockChart';
import { Info, Modal } from '../../ssps/ui';

type R = any;   // 引擎结果（形状见 server/engine，与原型引擎一致）
const peak = (p: R) => Math.max(...p.c.days.map((x: R) => x.occ || 0));

// ---------------- 方案卡片 ----------------
function dayChips(p: R) {
  return p.c.days.map((x: R, i: number) => {
    if (x.state !== 'ok') return <span key={i} className="day nd">{nMd(x.d)} 无数据</span>;
    return p.mode === 'cmr' ? <span key={i} className={'day ' + cmrCls(x.cmr)}>{nMd(x.d)} {pct(x.cmr)}</span> : <span key={i} className={'day ' + denCls(x.count, x.n)}>{nMd(x.d)} {x.count} 艘</span>;
  });
}
function RouteRows({ res }: { res: R }) {
  const i = res.input, r = res.run.rule;
  if (i.biz === '成品销售船') return null;
  if (!r) return <div className="r"><span className="k">航程口径</span><span className="tag gray">暂无</span><span className="muted">没有维护这条航线的航程</span></div>;
  const emp = r.basis === '经验值';
  return (
    <div className="r"><span className="k">航程口径</span>{emp ? <span className="tag amber">经验估算</span> : <span className="tag blue">历史统计</span>}{res.run.borrowed && <span className="tag gray">借用大宗航线</span>}
      <span>{emp ? <>经验航程 <b>{r.exp}</b> / 上限 <b>{r.expMax}</b> 天 <span className="muted">· 样本 {r.samples} 条（&lt;5，未切统计值）</span></> : <>P50 <b>{r.p50}</b> / P80 <b>{r.p80}</b> 天 <span className="muted">· 样本 {r.samples} 条</span></>}</span>
      <Info text={emp ? <>经验航程是常见天数，上限是最长大概多久，分别相当于统计里的 P50、P80。<br />这条航线实际航次只有 {r.samples} 条，不足 5 条，暂用经验估算；累计到 5 条后自动改用历史统计。</> : `P50：一半的船不超过这个天数；P80：八成的船不超过这个天数。统计自这条航线的 ${r.samples} 条历史航次。`} /></div>
  );
}
function basisTip(res: R, p: R, ctx: { batchPlanDate?: string | null; planCoverTo: number | null; voyHorizon: number | null; berthTotal: number }) {
  const r = res.run, P = res.pool, x = res.excluded, rule = r.rule, pm = p ? p.mode : r.mode, L: string[] = [];
  L.push(pm === 'cmr' ? '靠船计划：' + (ctx.batchPlanDate ? ctx.batchPlanDate.slice(5).replace('-', '月') + '日更新，' : '') + '覆盖到 ' + (ctx.planCoverTo != null ? nMdCn(ctx.planCoverTo) : '—') : '航次计划：覆盖到 ' + (ctx.voyHorizon != null ? nMdCn(ctx.voyHorizon) : '—'));
  L.push(`能装下 ${fmt(res.input.tons)} 吨的泊位：${P.n} / ${ctx.berthTotal} 个`);
  if (rule) L.push(res.input.biz === '成品销售船' ? '航程：经验估算（仅用于推算到客户港时间）' : '航程：' + (rule.basis === '经验值' ? '经验估算' : '历史统计 ' + rule.samples + ' 个航次'));
  if (res.stock) L.push('库存：' + res.stock.item.name + '，断料日 ' + (res.stock.so != null ? nMdCn(res.stock.so) : '模拟期内不断料') + '（库存消耗模拟表，已含排定到货）');
  L.push('不计入：' + (pm === 'cmr' ? '非德信泊位的 ' + x.offPool + ' 条靠船记录' : '已取消航次 ' + x.cancelled + ' 条'));
  return <>{L.map((t, i) => <div key={i}>{t}</div>)}</>;
}

export function PlanCard({ p, res, ctx, onAdopt, onAnnounce, onDetail, canAct }: { p: R | null; res: R; ctx: Parameters<typeof basisTip>[2]; onAdopt?: (l: string) => void; onAnnounce?: (l: string) => void; onDetail?: (l: string) => void; canAct?: boolean }) {
  const P = res.pool, i = res.input, prod = i.biz === '成品销售船';
  if (!p) return (
    <div className="card plan noplan B"><div className="plan-h"><h3 style={{ color: '#8a94a3' }}>备选方案</h3><span className="tag gray">暂无</span></div>
      <div className="emptymsg"><b>没有可用的备选方案</b>窗口内找不到与推荐方案错开、且符合条件的时间。</div></div>
  );
  const low = p.trust === '低可信', name = p.label === 'A' ? '推荐方案' : '备选方案';
  let m1: ReactNode, m2: ReactNode, m3: ReactNode;
  if (!prod) {
    m1 = <div className="m"><div className="lb">推荐发船日（离装港）<Info text="发船日就是船从装港出发的日期。系统用 P80（八成的船不超过的航程天数）从到港窗口的最后一天往前推，这样船大概率不会晚于窗口到港。" /></div><div className="v">{p.depart != null ? nMdCn(p.depart) : '—'}</div><div className="sub">{p.depart != null ? nWk(p.depart) + ' · 按 P80 反推最晚到港日' : '缺少航程，无法推算'}</div></div>;
    m2 = <div className="m"><div className="lb">到港窗口（卸港 · 本港侧）</div><div className="v">{nMdCn(p.c.s)} – {nDCn(p.c.e)}</div><div className="sub">{p.etaFrom != null ? `预计 ${nMd(p.etaFrom)} ~ ${nMd(p.etaTo)} 抵港` : `共 ${p.c.len} 天`}</div></div>;
  } else {
    m1 = <div className="m"><div className="lb">建议装船窗口（装港 · 本港侧）</div><div className="v">{nMdCn(p.c.s)} – {nDCn(p.c.e)}</div><div className="sub">{nWk(p.c.s)} 起 · 共 {p.c.len} 天</div></div>;
    m2 = <div className="m"><div className="lb">最晚装船日</div><div className="v">{nMdCn(p.deadline)}</div><div className="sub">窗口后还剩 {p.slack} 天余量</div></div>;
  }
  const c = p.c.metric;
  m3 = p.mode === 'cmr'
    ? <div className="m"><div className="lb">最低泊位余量<Info text={`窗口 ${p.c.len} 天里每天算一次泊位余量率（空闲泊位 ÷ 能装下的泊位总数），取最低的一天。只要有一天泊位紧张，船就要排队。`} /></div>
        <div className={'big ' + cmrCls(c)}><b>{pct(c)}</b><span>{cmrLab(c)}</span></div>
        <div className="sub">同期最多 {peak(p)} 艘船 · {p.qualifies ? <span style={{ color: '#237804' }}>✓ 不低于 30%</span> : <span style={{ color: '#ad2102' }}>✗ 低于 30%</span>}</div></div>
    : <div className="m"><div className="lb">同期最多船数<Info text="窗口内每天与你的货量竞争同吨级泊位的船数，取最多的一天，越少越宽松。15 天后没有逐泊位数据，所以不算泊位余量率。" /></div>
        <div className={'big ' + denCls(c, P.n)}><b>{c} 艘</b><span>{denLab(c, P.n)}</span></div>
        <div className="sub">{p.qualifies ? <span style={{ color: '#237804' }}>✓ 余量不低于 30%</span> : <span style={{ color: '#ad2102' }}>✗ 余量低于 30%</span>}</div></div>;
  const rule = res.run.rule;
  return (
    <div className={'card plan ' + p.label + (low ? ' low' : '')} data-plan={p.label}>
      <div className="plan-h"><h3>{name}</h3>
        {low ? <><span className="tag lowtrust">⚠ 低可信</span><Info text={p.reasons.join('；') + '。'} /></> : <span className="tag green">可信度 正常</span>}
        {p.stock && p.stock.state === 'out' && <span className="tag red">⚠ 断料 {p.stock.gap} 天</span>}{p.stock && p.stock.state === 'tight' && <span className="tag amber">缓冲不足</span>}
        {p.mode === 'cmr' ? <span className="tag blue">近 15 天</span> : <span className="tag" style={{ background: '#f9f0ff', color: '#531dab', borderColor: '#d3adf7' }}>15 天后</span>}
        <span className="sp" /><span className="muted">{p.label === 'A' ? '排序依据' : '备选条件'}<Info text={p.label === 'A' ? (p.mode === 'cmr' ? '按最低泊位余量从高到低排序，同分取更早的时间，不使用综合评分。' : '按同期最多船数从少到多排序，同分取更早的时间，不使用综合评分。') : '备选方案要求余量不低于 30%，并且与推荐方案的时间不重叠；没有完整数据的候选时从数据不全的时间里选，并标「低可信」。'} /></span></div>
      <div className="mgrid">{m1}{m2}{m3}</div>
      <div className="days">{dayChips(p)}</div>
      <div className="kvs">
        {p.stock && (() => { const st = p.stock; return (
          <div className="r"><span className="k">到港时库存</span>{st.state === 'safe' ? <span className="tag green">不断料</span> : st.state === 'tight' ? <span className="tag amber">缓冲不足</span> : <span className="tag red">断料 {st.gap} 天</span>}
            <span>{st.state === 'out' ? <>到港前库存已用完，到港后补 {fmt(i.tons)} 吨，可用 <b>{st.daysAfter}</b> 天</> : <>到港前库存 <b>{fmt(st.before)}</b> 吨（可用 {st.daysBefore} 天），到港后可用 <b>{st.daysAfter}</b> 天</>}</span>
            <Info text={`按库存消耗模拟表：到港窗口最后一天的库存，加上本船货量，再按当天日耗折算可用天数。「不断料」指到港日不晚于「断料日 − ${res.stock.buffer} 天缓冲」；「缓冲不足」指虽然没断料，但留的缓冲天数不够。`} /></div>); })()}
        {prod ? <div className="r"><span className="k">到客户港</span>{p.custEta ? <><b>{nMd(p.custEta[0])} – {nMd(p.custEta[1])}</b><span className="tag gray">仅供参考</span><Info text={`按经验估算的航程（约 ${Math.ceil(rule.effP50)}～${Math.ceil(rule.effP80)} 天）从装港反向推算。`} /></> : <span className="muted">暂无这条航线的航程</span>}</div> : <RouteRows res={res} />}
      </div>
      <div className="plan-f">
        {onAdopt && <button className="btn primary" disabled={!canAct} onClick={() => onAdopt(p.label)}>采纳此方案</button>}
        {onAnnounce && <button className="btn" disabled={!canAct} onClick={() => onAnnounce(p.label)}>生成宣船文案</button>}
        <span className="sp" /><span className="grey">数据依据<Info text={basisTip(res, p, ctx)} /></span>
        {onDetail && <button className="link" disabled={!canAct} onClick={() => onDetail(p.label)}>查看详情 →</button>}
      </div>
    </div>
  );
}

// ---------------- 结果概览（含候选窗口） ----------------
export function SummaryBar({ res }: { res: R }) {
  const [show, setShow] = useState(false), zh = usePortName();
  if (res.errors?.length || res.noRule) return null;
  const r = res.run, P = res.pool, le = r.mode === 'cmr', mixed = r.mode === 'mixed';
  return (
    <div className="sum"><div className="sum-t"><h2>预测结果</h2><span>{res.input.biz} · {fmt(res.input.tons)} 吨 · {zh(res.input.load)} → {zh(res.input.disch)}</span></div>
      <div className="sum-m"><span className="nw">目标到港日 {nMdCn(r.target)}（距今 {r.dist} 天）</span>
        <span className={'tag nw ' + (le || mixed ? 'blue' : '')} style={le || mixed ? undefined : { background: '#f9f0ff', color: '#531dab', borderColor: '#d3adf7' }}>{mixed ? '各候选日期分别计算' : le ? '按近 15 天靠船计划' : '按 15 天后航次计划'}</span>
        <span className="sp" /><button className="link" onClick={() => setShow(!show)}>系统比对过的 {(res.candidates || []).length} 个时间 {show ? '▴' : '▾'}</button>
        <Info text={`把期望窗口切成每 3 天一档、每次挪一天，逐档计算后挑出推荐和备选。框里是该档的${mixed ? '最低泊位余量（近 15 天）或同期最多船数（15 天后）' : le ? '最低泊位余量' : '同期最多船数'}；带星号表示窗口里有没数据的日子，只按有数据的天数算。`} /></div>
      {show && (
        <div className="cands"><div className="ct">候选窗口（3 天一档，{mixed ? '近 15 天按最低泊位余量、15 天后按同期最多船数，各自排序' : '按' + (le ? '最低泊位余量从高到低' : '同期最多船数从少到多')}，不使用综合评分）：</div>
          {(res.candidates || []).map((c: R, i: number) => {
            const mark = (res.plans || []).map((p: R) => (p && p.c.s === c.s && p.c.e === c.e ? p.label : '')).join(''), lc = c.mode ? c.mode === 'cmr' : le;
            const txt = c.none ? '无数据' : lc ? pct(c.metric) : c.metric + ' 艘', k = c.none ? 'nd' : lc ? cmrCls(c.metric) : denCls(c.metric, P.n);
            return <span key={i} className={'cand ' + k + (c.complete ? '' : ' sp')}>{mark && <i className={mark === 'B' ? 'b' : ''}>{mark === 'A' ? '推荐' : '备选'}</i>}{nMd(c.s)}–{nMd(c.e).slice(3)} {txt}{c.complete || c.none ? '' : '*'}</span>;
          })}
          {res.excluded.pastDepart ? <span className="muted nw">另有 {res.excluded.pastDepart} 个时间的发船日已早于今天，已排除</span> : null}</div>
      )}
    </div>
  );
}

// ---------------- 库存保障与趋势 ----------------
export function StockCard({ res, today, inventorySource }: { res: R; today: number; inventorySource?: string }) {
  const [view, setView] = useState<'trend' | 'detail'>('trend'), [range, setRange] = useState(0);
  const st = res.stock, A = res.plans?.[0], B = res.plans?.[1];
  const it = st?.item;
  const marks = useMemo(() => [A && { d: A.c.e, tons: res.input.tons, label: 'A', color: '#1677ff' }, B && { d: B.c.e, tons: res.input.tons, label: 'B', color: '#08979c' }].filter(Boolean) as Array<{ d: number; tons: number; label: string; color: string }>, [A, B, res]);
  const so = st?.so ?? null;
  const until = st ? (range ? today + range : Math.min(Math.max(today + 45, (so || 0) + 14, (st.latest || 0) + 14, ...marks.map((m) => m.d + 14)), today + 100)) : today + 45;
  const { data: trend } = useTrend(st ? it.name : null, marks.map((m) => ({ d: m.d, tons: m.tons })), until);
  if (!st) return null;
  const l = stockLevel(it.days);
  const sr = (k: string, v: ReactNode, cls?: string) => <div className={'sr ' + (cls || '')}><span className="k">{k}</span><span className="v">{v}</span></div>;
  const rows = (trend?.series ?? []) as Array<[number, number, number]>;
  let prev: number | null = null;
  return (
    <div className="card stk">
      <div className="card-h"><h2 className="nw">库存保障与趋势 · {it.name}<Info text="断料日来自库存消耗模拟表（已包含已排定的到货）。预测要求到港窗口的最后一天不晚于「断料日 − 缓冲天数」，否则判为断料。方案到港后库存按虚线回升。" /></h2><span className="muted nw">{inventorySource ?? '库存消耗模拟表'}</span></div>
      <div className="stk-b">
        <div className="stk-l">
          {sr('当前库存', <>{fmt(it.stock)}<small>吨</small></>)}{sr('日耗', <>{fmt(it.daily)}<small>吨/天</small></>)}
          {sr('可用天数', <>{it.days}<small>天</small><span className={'lvl ' + l[0]}>{l[1]}</span></>)}
          {sr('断料日', so != null ? <>{nMdCn(so)}<small>{so <= today ? '已断料' : '距今 ' + (so - today) + ' 天'}</small></> : <>不断料<small>模拟期内</small></>, so != null ? 'red' : 'grn')}
          {st.gap && sr('近期短缺口', <>{nMd(st.gap.from)}{st.gap.to > st.gap.from ? '–' + nMd(st.gap.to) : ''}<small>已被补回</small></>)}
          {sr('最晚到港日', <>{st.latest != null ? nMdCn(st.latest) : '—'}<small>{st.latest != null && st.latest < today ? '已错过' : '缓冲 ' + st.buffer + ' 天'}</small></>)}
        </div>
        <div className="stk-r">
          <div className="tabs2"><button className={'tb' + (view === 'trend' ? ' on' : '')} onClick={() => setView('trend')}>库存趋势预测</button><button className={'tb' + (view === 'detail' ? ' on' : '')} onClick={() => setView('detail')}>库存明细</button><span className="sp" />
            <span className="rseg">{([[7, '7天'], [15, '15天'], [30, '30天'], [0, '全部']] as Array<[number, string]>).map(([n, t]) => <button key={n} className={range === n ? 'on' : ''} onClick={() => setRange(n)}>{t}</button>)}</span>
            <Info text="只改变显示范围，不改变计算。断料日、最晚到港日或方案到港日超出所选范围时不画出来，选「全部」可以看到。" /></div>
          {view === 'trend' ? (
            <div>
              <div className="lgd"><span><i style={{ borderColor: '#1677ff' }} />模拟库存</span>{A && <span><i style={{ borderColor: '#1677ff', borderTopStyle: 'dashed' }} />加入推荐方案后</span>}{B && <span><i style={{ borderColor: '#08979c', borderTopStyle: 'dashed' }} />加入备选方案后</span>}<span><i style={{ borderColor: '#fa8c16', borderTopStyle: 'dashed' }} />危险线（15 天用量）</span></div>
              <div>{trend ? <StockChart trend={trend} daily={it.daily} latest={st.latest ?? null} gap={st.gap ?? null} marks={marks} /> : <div className="empty">加载中…</div>}</div>
            </div>
          ) : (
            <div className="dtw"><table className="dt"><thead><tr><th>日期</th><th>星期</th><th className="r">日耗（吨）</th><th className="r">模拟库存（吨）</th><th className="r">可用天数</th><th>标记</th></tr></thead><tbody>
              {rows.map(([d, s0, dl]) => {
                const tg: string[] = [];
                if (d === today) tg.push('今天'); if (st.gap && d === st.gap.from) tg.push('短缺口开始'); if (d === st.latest) tg.push('最晚到港'); if (d === so) tg.push('断料日');
                marks.forEach((m) => { if (m.d === d) tg.push((m.label === 'A' ? '推荐' : '备选') + '方案到港'); });
                if (prev != null && s0 > prev) tg.push('到货 +' + fmt(s0 - prev + dl)); prev = s0;
                return <tr key={d} className={d === so ? 'so' : tg.length ? 'k' : ''}><td>{nMd(d)}</td><td>{nWk(d)}</td><td className="r">{fmt(dl)}</td><td className="r">{fmt(s0)}</td><td className="r">{dl ? Math.floor(s0 / dl) : '—'}</td><td>{tg.join('、')}</td></tr>;
              })}</tbody></table></div>
          )}
        </div>
      </div>
      {st.gap && <div className="bn blu"><b>{nMdCn(st.gap.from)}{st.gap.to > st.gap.from ? '–' + nMdCn(st.gap.to) : ''} 有一个短缺口</b>，按最快航程已经赶不上，之后由已排定的到货补回。这次排船以补回后的下一次断料日为目标。</div>}
      {res.urgent ? <div className="bn red"><b>按最快航程也赶不上断料日。</b>{A ? <>最早 {nMdCn(A.c.e)} 到港{so != null ? <>，比断料日（{nMdCn(so)}）晚 {A.c.e - so} 天，预计断料约 {A.stock?.gap ?? 0} 天</> : null}。</> : null}已改为「最快到港」优先，不再要求港口余量；请同时联系供应商或调拨，别只等这一船。</div>
        : so == null ? <div className="bn blu">模拟期内这个物料不会断料，预测只按港口容量安排。</div>
        : <div className="bn blu">所有候选都已排除到港晚于 <b>{nMdCn(st.latest)}</b>（断料日 {nMdCn(so)} 前 {st.buffer} 天）的时间；在剩下的时间里，按港口容量选最宽松的。这是硬约束，不参与任何评分。</div>}
      <div style={{ height: 12 }} />
    </div>
  );
}

// ---------------- 30 天日历 + 泊位一览 ----------------
export function CalendarCard({ cal, res, tons, prodBiz, sel, onSel }: { cal: R; res?: R | null; tons: number; prodBiz: boolean; sel: number | null; onSel: (d: number) => void }) {
  const [tip, setTip] = useState<{ x: number; y: number; html: ReactNode } | null>(null);
  if (!cal) return null;
  const days: R[] = cal.days, le = days.filter((d) => d.mode === 'cmr').length, T = cal.today ? Math.round(Date.parse(cal.today) / 86400000) : days[0].d;
  const f = res?.input ?? null;
  const place = (cls: string, text: ReactNode, s: number, e: number, row: number, extra = '') => {
    const a = Math.max(0, s - T), b = Math.min(29, e - T);
    if (e < T || a > 29) return null;
    return <div key={cls + row + s} className={'mk ' + cls + extra} style={{ gridRow: row, gridColumn: `${a + 2} / ${b + 3}` }}>{text}</div>;
  };
  const inR = (d: number | null | undefined) => d != null && d >= T && d <= T + 29;
  const tipFor = (d: R) => {
    const head = <b>{nMd(d.d)} {nWk(d.d)} · 距今 {d.i} 天<br /></b>;
    if (!cal.pool.n) return <>{head}没有能装下这个货量的泊位</>;
    if (d.state !== 'ok') return <>{head}<b>暂无数据</b>（灰色斜线，不是 0%）<br />{d.mode === 'cmr' ? `靠船计划只到 ${cal.planCoverTo != null ? nMd(cal.planCoverTo) : '—'}。这一天仍按近 15 天处理，不会改用航次计划。` : `航次计划只到 ${cal.voyHorizon != null ? nMd(cal.voyHorizon) : '—'}。`}</>;
    if (d.mode === 'cmr') return <>{head}泊位余量 <b>{pct(d.cmr)}</b>（{cmrLab(d.cmr)}）<br />空闲 {d.n - d.occ} / 共 {d.n} 个泊位<br />占用：{d.occBerths.join('、') || '无'}</>;
    return <>{head}同期 <b>{d.count} 艘</b>船（能装下的泊位 {d.n} 个）<br />{d.ships.map((s: R) => <div key={s.id}>{s.id.slice(-4)} {s.vessel || '待宣船'}</div>)}{!d.ships.length && '无'}</>;
  };
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-h"><h2 className="nw">未来 30 天港口容量<Info text={<>泊位余量率是唯一的容量指标：空闲泊位 ÷ 能装下该货量的泊位总数，越高越宽松。<br />30% 是备选方案的底线；其余色阶分界为暂定值。<br />灰色斜线表示暂无数据，不是 0%。</>} /></h2><span className="muted nw">货量 {tons ? fmt(tons) + ' 吨' : '—'} · 能装下的泊位 {cal.pool.n} 个</span></div>
      <div className="cal">
        <div className="lab" style={{ gridRow: 1, gridColumn: 1 }} />
        <div className="band le" style={{ gridRow: 1, gridColumn: `2 / span ${le}` }}>近 15 天 · 靠船计划 · 泊位余量</div>
        {le < 30 && <div className="band gt" style={{ gridRow: 1, gridColumn: `${2 + le} / span ${30 - le}` }}>15 天后 · 航次计划 · 同期船数</div>}
        <div className="lab" style={{ gridRow: 2, gridColumn: 1 }}>日期</div>
        {days.map((d) => <div key={'h' + d.i} style={{ gridRow: 2 }} className={'dh' + (d.i === 0 ? ' today' : '') + ([0, 6].includes(new Date(d.d * 86400000).getUTCDay()) ? ' wkend' : '') + (d.i === le ? ' split' : '')}><b>{nMd(d.d).slice(3)}</b>{d.i === 0 ? '今天' : nWk(d.d)}</div>)}
        <div className="lab" style={{ gridRow: 3, gridColumn: 1 }}>容量</div>
        {days.map((d) => {
          const sp = (d.i === le ? ' split' : '') + (d.d === sel ? ' sel' : '');
          const ev = { onMouseMove: (e: React.MouseEvent) => setTip({ x: Math.min(e.clientX + 14, window.innerWidth - 340), y: e.clientY + 16, html: tipFor(d) }), onMouseLeave: () => setTip(null), onClick: () => onSel(d.d) };
          if (!cal.pool.n || d.state !== 'ok') return <div key={d.i} style={{ gridRow: 3 }} className={'cell nd' + sp} {...ev}><i>无数据</i></div>;
          if (d.mode === 'cmr') return <div key={d.i} style={{ gridRow: 3 }} className={'cell ' + cmrCls(d.cmr) + sp} {...ev}><b>{Math.round(d.cmr * 100)}%</b><span className="bar"><i style={{ width: d.cmr * 100 + '%' }} /></span></div>;
          const fl = Math.min(8, Math.round((d.count / d.n) * 8));
          return <div key={d.i} style={{ gridRow: 3 }} className={'cell ' + denCls(d.count, d.n) + sp} {...ev}><b>{d.count} 艘</b><span className="dg">{Array.from({ length: 8 }, (_, k) => <i key={k} className={k < fl ? 'on' : ''} />)}</span></div>;
        })}
        <div className="lab" style={{ gridRow: 4, gridColumn: 1 }}>{prodBiz ? '受载期' : '期望窗口'}</div>
        {f?.winStart && place('w', nMd(Math.round(Date.parse(f.winStart) / 86400000)) + ' ~ ' + nMd(Math.round(Date.parse(f.winEnd) / 86400000)), Math.round(Date.parse(f.winStart) / 86400000), Math.round(Date.parse(f.winEnd) / 86400000), 4)}
        {['A', 'B'].map((L, k) => { const p = res?.plans?.[k]; return <div key={L} style={{ display: 'contents' }}><div className="lab" style={{ gridRow: 5 + k, gridColumn: 1 }}>{L === 'A' ? '推荐' : '备选'}</div>{p && place(L === 'A' ? 'a' : 'b', <>{L === 'A' ? '推荐 ' : '备选 '}{nMd(p.c.s)}–{nMd(p.c.e).slice(3)}{p.trust === '低可信' && <span className="lt"> · 低可信</span>}</>, p.c.s, p.c.e, 5 + k, p.trust === '低可信' ? ' low' : '')}</div>; })}
        {res?.stock && (inR(res.stock.latest) || inR(res.stock.so)) && <><div className="lab" style={{ gridRow: 7, gridColumn: 1 }}>库存</div>{inR(res.stock.latest) && place('lt', '最晚', res.stock.latest, res.stock.latest, 7)}{inR(res.stock.so) && place('so', '断料', res.stock.so, res.stock.so, 7)}</>}
      </div>
      <div className="legend">
        <div className="g"><b style={{ color: 'var(--text)' }}>近 15 天泊位余量</b><span className="sw c1">≥50%</span>充裕<span className="sw c2">30–50%</span>适中<span className="sw c3">10–30%</span>偏紧<span className="sw c4">&lt;10%</span>紧张</div>
        <div className="g"><b style={{ color: 'var(--text)' }}>15 天后同期船数</b><span className="sw c1">≤50%</span><span className="sw c2">≤70%</span><span className="sw c3">≤90%</span><span className="sw c4">&gt;90%</span>占能装下的泊位数</div>
        <div className="g"><span className="sw nd">&nbsp;&nbsp;</span><b style={{ color: 'var(--text)' }}>无数据</b>不是 0%</div>
      </div>
      {sel != null && <BerthMap date={sel} tons={tons} />}
      {tip && <div id="tipbox" style={{ display: 'block', left: tip.x, top: tip.y }}>{tip.html}</div>}
    </section>
  );
}

export function BerthMap({ date, tons }: { date: number; tons: number }) {
  const { data } = useDayDetail(nIso(date), tons), { data: all } = useBerths();
  if (!data) return <div className="bm"><div className="empty">加载中…</div></div>;
  const mode = data.detail.mode, nodata = mode === 'cmr' && data.detail.state !== 'ok';
  const items = (data.berths as R[]).map((b) => {
    const L: string[] = [`${b.code} · ${b.terminal}`, `容量 ${wan(b.capacity)} · ${b.category ?? '海船泊位'} · ${b.status}`, `依据：${b.basis ?? '—'}${b.note ? '（' + b.note + '）' : ''}`,
      tons > 0 ? `本次货量 ${fmt(tons)} 吨：${b.state === 'off' ? '装不下，不计入余量基数' : '能装下，计入余量基数'}` : '尚未填写货量'];
    const dl = nMdCn(date);
    if (mode === 'density') L.push(dl + '：15 天后没有逐泊位数据，只能判断能否装下');
    else if (nodata) L.push(dl + '：靠船计划暂无数据，无法判断占用');
    else if (b.vessel) L.push(`${dl} 占用：${b.vessel}`, `${b.cargo ?? ''} ${fmt(b.tons)} 吨`, `预计靠泊 ${nMd(b.from)} · 在港至 ${nMd(b.to)}`);
    else if (b.state !== 'off') L.push(dl + '：空闲');
    return { b, state: b.state as string, tip: L.join('\n') };
  });
  const cnt = (s: string) => items.filter((x) => x.state === s).length, n = items.filter((x) => x.state !== 'off').length;
  const grp = (name: string) => { const g = items.filter((x) => x.b.terminal === name); return <div key={name}><div className="bm-t">{name} · {g.length} 个</div><div className="bm-r">{g.map((x) => <div key={x.b.code} className={'bt ' + x.state} title={x.tip}><b>{x.b.code}</b><small>{x.b.capacity / 10000}万</small></div>)}</div></div>; };
  return (
    <div className="bm">
      <div className="bm-h"><b>{all?.length ?? items.length} 个泊位 · {nMdCn(date)} {nWk(date)}</b>
        {!n ? <span className="tag red">没有能装下的泊位</span> : mode === 'density' ? <><span className="tag blue">能装下 {n} 个</span><span className="tag gray">15 天后无逐泊位数据</span></> : nodata ? <><span className="tag blue">能装下 {n} 个</span><span className="tag nodata">暂无数据</span></> : <><span className="tag blue">能装下 {n} 个</span><span className="tag green">空闲 {cnt('free')}</span><span className="tag amber">占用 {cnt('occ')}</span></>}
        <span className="sp" /><span className="faint">点击上方日历切换日期，鼠标悬停看泊位信息</span></div>
      <div className="bm-g">{grp('北区码头')}{grp('拉博塔码头')}</div>
      <div className="bm-l"><span className="g"><span className="sw c1">空闲</span>能装下且当天空着</span><span className="g"><span className="sw c3">占用</span>能装下但当天有船</span>
        <span className="g"><span className="sw" style={{ background: '#eef0f3', color: '#a7b0bc', borderColor: '#dfe3e8' }}>灰色</span>装不下本次货量，不计入基数</span><span className="g"><span className="sw nd">&nbsp;&nbsp;</span>无数据</span>
        <span className="g"><span className="sw" style={{ background: '#e6f4ff', color: '#0958d9', borderColor: '#91caff' }}>能装下</span>15 天后只判断能否装下</span></div>
    </div>
  );
}

// ---------------- 采纳 / 宣船文案 ----------------
export function AdoptModal({ open, onClose, runNo, label, res, onDone }: { open: boolean; onClose: () => void; runNo: string; label: string; res: R; onDone: (r: R) => void }) {
  const zh = usePortName(), i = res?.input;
  const { data } = useVoyages({ mine: 1, status: '待宣船', pageSize: 100 });
  const mine = (data?.items ?? []).filter((v) => v.load === i?.load && v.disch === i?.disch);
  const [mode, setMode] = useState<'exist' | 'new'>('exist'), [vid, setVid] = useState('');
  const sel = vid || mine[0]?.id || '';
  const p = res?.plans?.[label === 'A' ? 0 : 1];
  const save = useWrite((b: { voyageId?: string }, key) => api.adopt(runNo, label, b.voyageId, key), [['voyages'], ['prediction', runNo]]);
  return (
    <Modal title={`采纳${label === 'A' ? '推荐方案' : '备选方案'}${p ? `（${nMd(p.c.s)} ~ ${nMd(p.c.e)}）` : ''}`} open={open} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending || (mode === 'exist' && !sel)} onClick={() => save.mutate({ voyageId: mode === 'exist' ? sel : undefined }, { onSuccess: (r: R) => { toast.success(r.created ? '已新建待宣船航次 ' + r.voyage.id : '已写回航次 ' + r.voyage.id); onClose(); onDone(r); } })}>确认采纳</button></>}>
      <div className="mini" style={{ margin: '0 0 10px', whiteSpace: 'normal' }}>采纳后，方案的计划窗口会写回{i?.load === 'BAHODOPI' ? '航次的受载期' : '航次的计划抵卸港窗口'}。只能写回装卸港与本次预测一致的「待宣船」航次。</div>
      <label className={'radio' + (mode === 'exist' ? ' on' : '')} onClick={() => setMode('exist')}><input type="radio" readOnly checked={mode === 'exist'} /><div><b>写回已有航次</b><div style={{ marginTop: 4 }}>
        <select className="inp" value={sel} onChange={(e) => setVid(e.target.value)} disabled={!mine.length}>{mine.length ? mine.map((v) => <option key={v.id} value={v.id}>{v.id} · 待宣船 · {zh(v.load)} → {zh(v.disch)} · {fmt(v.tons)} 吨</option>) : <option>（没有装卸港一致的待宣船航次）</option>}</select></div></div></label>
      <label className={'radio' + (mode === 'new' ? ' on' : '')} onClick={() => setMode('new')}><input type="radio" readOnly checked={mode === 'new'} /><div><b>新建待宣船航次</b><div className="muted">按本次预测的船型、货量、装卸港创建，负责业务员是你。</div></div></label>
    </Modal>
  );
}

export function AnnounceModal({ open, onClose, runNo, label }: { open: boolean; onClose: () => void; runNo: string; label: string }) {
  const [out, setOut] = useState<{ parts: Array<{ t: string; v?: boolean }>; text: string } | null>(null);
  const gen = useWrite((_: null) => api.announce(runNo, label), []);
  useEffect(() => { if (open) { setOut(null); gen.mutate(null, { onSuccess: (r: R) => setOut(r) }); } }, [open, runNo, label]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={'宣船文案 · ' + (label === 'A' ? '推荐方案' : '备选方案')} open={open} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>关闭</button><button className="btn primary" disabled={!out} onClick={() => { navigator.clipboard?.writeText(out!.text).then(() => toast.success('已复制到剪贴板'), () => toast('复制失败，请手动选取')); }}>一键复制</button></>}>
      <div className="annc">{out ? out.parts.map((x, k) => (x.v ? <span key={k} className="v">{x.t}</span> : <span key={k}>{x.t}</span>)) : '生成中…'}</div>
      <div className="mini" style={{ marginTop: 8, whiteSpace: 'normal' }}>蓝色底的数字由规则计算得出，只读、不会被改写。</div>
    </Modal>
  );
}
