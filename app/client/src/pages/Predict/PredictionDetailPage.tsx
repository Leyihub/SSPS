import { ReactNode, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, useDayDetail, useInventory, useMe, usePrediction, useWrite } from '../../ssps/api';
import { cmrCls, cmrLab, denCls, denLab, nMdCn, stockLevel, toDn } from '../../ssps/cmr';
import { dayNum, fmt, isoOf, pct } from '../../ssps/format';
import { usePortName } from '../../ssps/hooks';
import { ErrorBox, Info, Loading } from '../../ssps/ui';
import { BerthMap, StockCard } from './parts';
import './p02.css';
import './p03.css';

type R = any;
const md = (iso?: string | null) => (iso ? iso.slice(5).replace('-', '/') : '—');
const mdCn = (iso?: string | null) => (iso ? nMdCn(toDn(iso)) : '—');
const wk = (iso: string) => '周' + '日一二三四五六'[new Date(toDn(iso) * 86400000).getUTCDay()];

const Table = ({ rows }: { rows: Array<[ReactNode, ReactNode, ReactNode, boolean?]> }) => (
  <table className="kv"><tbody>{rows.map((r, i) => <tr key={i} className={r[3] ? 'hl' : ''}><td>{r[0]}</td><td>{r[1]}</td><td className="src">{r[2]}</td></tr>)}</tbody></table>
);
const Step = ({ no, title, tip, lead, children }: { no: number; title: string; tip?: string; lead?: ReactNode; children: ReactNode }) => (
  <div className="step"><span className="no">{no}</span><div className="bd"><h3>{title}{tip && <Info text={tip} />}</h3>{lead && <p className="lead">{lead}</p>}{children}</div></div>
);

export default function PredictionDetailPage() {
  const { runNo = '' } = useParams(), [sp, setSp] = useSearchParams(), zh = usePortName();
  const { data, isLoading, error, refetch } = usePrediction(runNo), { data: inv } = useInventory(), { data: me } = useMe();
  const which = sp.get('plan') === 'B' ? 'B' : 'A';
  const [day, setDay] = useState<string | null>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? new Error('找不到这次预测')} onRetry={refetch} />;

  const run = data.run as R, plans = data.plans as R[], plan = plans.find((p) => p.label === which) ?? plans[0];
  if (!plan) return <div className="card msg">这次预测没有可展示的方案。<Link to="/predict">返回智能发船预测</Link></div>;
  const pv = plan.provenance as R, i = pv.inputs, prod = i.biz === '成品销售船', le = pv.path.planMode === 'cmr', P = pv.pool;
  const today = me ? dayNum(me.today) : 0;
  const backUrl = '/predict?' + new URLSearchParams({ biz: i.biz, tons: String(i.tons), load: i.load, disch: i.disch, ws: i.winStart, we: i.winEnd, item: i.item ?? '' });
  const invItem = i.item ? inv?.items.find((x) => x.name === i.item) : null;
  const okDays = (pv.days as R[]).filter((d) => d.state === 'ok');
  const extreme = okDays.length ? (le ? Math.min(...okDays.map((d) => d.cmr)) : Math.max(...okDays.map((d) => d.count))) : null;
  const pick = okDays.find((d) => (le ? d.cmr : d.count) === extreme);
  const selDate = day ?? pick?.date ?? pv.days[0]?.date;
  const trust = plan.trust === '低可信';

  // —— 结论 ——
  const c = pv.metric.value, depDn = pv.depart ? toDn(pv.depart) : null;
  const m3 = le
    ? <div className="m"><div className="lb">最低泊位余量<Info text="窗口里每天算一次泊位余量率，取最低的一天。" /></div><div className={'big ' + cmrCls(c)}><b>{pct(c)}</b><span>{cmrLab(c)}</span></div><div className="sub">{c >= 0.3 ? <span style={{ color: '#237804' }}>✓ 不低于 30%</span> : <span style={{ color: '#ad2102' }}>✗ 低于 30%</span>}</div></div>
    : <div className="m"><div className="lb">同期最多船数<Info text="窗口内每天与你的货量竞争同吨级泊位的船数，取最多的一天。" /></div><div className={'big ' + denCls(c, P.n)}><b>{c} 艘</b><span>{denLab(c, P.n)}</span></div><div className="sub">{c <= P.n * 0.7 ? <span style={{ color: '#237804' }}>✓ 余量不低于 30%</span> : <span style={{ color: '#ad2102' }}>✗ 余量低于 30%</span>}</div></div>;
  const m1 = !prod
    ? <div className="m"><div className="lb">推荐发船日（离装港）<Info text="发船日就是船从装港出发的日期。系统用 P80（八成的船不超过的航程天数）从到港窗口的最后一天往前推。" /></div><div className="v">{pv.depart ? mdCn(pv.depart) : '—'}</div><div className="sub">{pv.depart ? wk(pv.depart) + ' · 按 P80 反推最晚到港日' : '缺少航程，无法推算'}</div></div>
    : <div className="m"><div className="lb">建议装船窗口（装港 · 本港侧）</div><div className="v">{mdCn(pv.window.from)} – {Number(pv.window.to.slice(8))}日</div><div className="sub">{wk(pv.window.from)} 起</div></div>;
  const m2 = !prod
    ? <div className="m"><div className="lb">到港窗口（卸港 · 本港侧）</div><div className="v">{mdCn(pv.window.from)} – {Number(pv.window.to.slice(8))}日</div><div className="sub">{pv.eta ? `预计 ${md(pv.eta[0])} ~ ${md(pv.eta[1])} 抵港` : '—'}</div></div>
    : <div className="m"><div className="lb">最晚装船日</div><div className="v">{mdCn(pv.deadline)}</div><div className="sub">窗口后还剩 {pv.slack ?? '—'} 天余量</div></div>;

  // —— 时间轴 ——
  const timeline = () => {
    const ws = toDn(i.winStart), we = toDn(i.winEnd), cs = toDn(pv.window.from), ce = toDn(pv.window.to);
    const eta = pv.eta ? [toDn(pv.eta[0]), toDn(pv.eta[1])] : null, cust = pv.custEta ? [toDn(pv.custEta[0]), toDn(pv.custEta[1])] : null;
    const from = !prod ? Math.min(depDn ?? cs, cs) - 1 : ws, to = !prod ? Math.max(ce, eta ? eta[1] : ce) + 1 : Math.max(we, cust ? cust[1] : we) + 1, n = to - from + 1, col = (d: number) => d - from + 2;
    const bar = (cls: string, text: string, a: number, b: number, row: number, tip?: string) => <div key={cls + row} className={'bar ' + cls} style={{ gridRow: row, gridColumn: `${col(a)} / ${col(b) + 1}` }} title={tip}>{text}</div>;
    const low = trust ? ' low' : '';
    return (
      <div className="tl" style={{ gridTemplateColumns: `96px repeat(${n},minmax(0,1fr))` }}>
        <div />
        {Array.from({ length: n }, (_, k) => from + k).map((d) => { const dow = new Date(d * 86400000).getUTCDay(); return <div key={d} className={'dt' + (dow === 0 || dow === 6 ? ' we' : '')}><b>{isoOf(d).slice(8)}</b>{'周' + '日一二三四五六'[dow]}</div>; })}
        {!prod ? <>
          <div className="lab" style={{ gridRow: 2 }}>航行</div><div className="lab" style={{ gridRow: 3 }}>到港窗口</div>
          {depDn != null && eta ? <>{bar('go', '发船 ' + md(pv.depart), depDn, eta[0], 2, `从装港出发：${mdCn(pv.depart)}；按较短航程最快 ${md(pv.eta[0])} 抵港。`)}{eta[1] > eta[0] && bar('go2', eta[1] - eta[0] >= 2 ? '最晚 ' + md(pv.eta[1]) : '最晚', eta[0] + 1, eta[1], 2, `按较长航程（P80）最晚 ${md(pv.eta[1])} 抵港，仍在窗口内。`)}</> : <div className="muted" style={{ gridRow: 2, gridColumn: '2 / -1', fontSize: 12 }}>缺少这条航线的航程，无法画出航行段</div>}
          {bar('win ' + plan.label + low, `到港窗口 ${md(pv.window.from)} – ${md(pv.window.to).slice(3)}`, cs, ce, 3)}
        </> : <>
          <div className="lab" style={{ gridRow: 2 }}>受载期</div><div className="lab" style={{ gridRow: 3 }}>建议装船窗口</div><div className="lab" style={{ gridRow: 4 }}>到客户港</div><div className="lab" style={{ gridRow: 5 }}>截止日</div>
          {bar('sub', `受载期 ${md(i.winStart)} – ${md(i.winEnd)}`, ws, we, 2)}{bar('win ' + plan.label + low, `${md(pv.window.from)} – ${md(pv.window.to).slice(3)}`, cs, ce, 3)}
          {cust ? bar('eta', `预计 ${md(pv.custEta[0])} – ${md(pv.custEta[1])}（仅供参考）`, cust[0], cust[1], 4) : <div className="muted" style={{ gridRow: 4, gridColumn: '2 / -1', fontSize: 12 }}>暂无这条航线的航程</div>}
          {bar('dead', '截止', we, we, 5, '最晚装船日：' + mdCn(i.winEnd))}
        </>}
      </div>
    );
  };

  // —— 数据依据 ——
  let no = 0; const nx = () => ++no;
  const st = pv.stock, rule = pv.rule;
  const stockRows: Array<[ReactNode, ReactNode, ReactNode, boolean?]> = [];
  if (st && invItem) {
    const lv = stockLevel(invItem.days)[1];
    stockRows.push(['物料', invItem.name + ' · ' + invItem.type, `库存消耗模拟表，批次 ${st.batchNo ?? '—'}`], ['当前库存 / 日耗', `${fmt(invItem.stock)} 吨 / ${fmt(invItem.daily)} 吨每天`, '同表（按当前批次显示，与预测当时的批次可能不同）'],
      ['可用天数', `${invItem.days} 天（${lv}）`, '当前库存 ÷ 日耗；沿用德龙版分档：25 天以上充裕、15–25 天偏紧、15 天以内危险']);
  }
  if (st) {
    stockRows.push(['断料日', st.stockout ? mdCn(st.stockout) + `（距今 ${toDn(st.stockout) - today} 天）` : '模拟期内不断料', '模拟库存降到 0 的那一天（已包含已排定的到货）；若近期有赶不上且会被补回的短缺口，取补回后的下一次']);
    if (st.gap) stockRows.push(['近期短缺口', mdCn(st.gap.from) + (st.gap.to > st.gap.from ? '–' + mdCn(st.gap.to) : ''), '首次降到 0 的缺口按最快航程已赶不上，且之后由已排定到货补回；只做提示，断料日取补回后的下一次']);
    stockRows.push(['缓冲天数', st.buffer + ' 天', '船到港后还要靠泊、卸货、入库，所以要提前留几天'], ['最晚到港日', st.latest ? mdCn(st.latest) : '—', '断料日 − 缓冲天数。到港窗口的最后一天必须不晚于它，这是硬约束，不参与评分']);
    if (st.state) stockRows.push(['本方案到港时', st.state === 'safe' ? '不断料' : st.state === 'tight' ? '缓冲不足' : `断料 ${st.gap ?? ''} 天`, `到港窗口最后一天 ${md(pv.window.to)}：到港前库存 ${fmt(st.before)} 吨（可用 ${st.daysBefore} 天）＋ 本船 ${fmt(i.tons)} 吨 ＝ 到港后 ${fmt(st.after)} 吨，可用 ${st.daysAfter} 天`, st.state !== 'safe']);
    if (pv.urgent) stockRows.push(['说明', '最快到港', '按最快航程也赶不上断料日：已改为「最快到港」优先，不再比较港口余量；请同时联系供应商或调拨', true]);
  }
  const src = pv.source, srcRows: Array<[ReactNode, ReactNode, ReactNode]> = [['计算路径', le ? '近 15 天' : '15 天后', `目标到港日 ${mdCn(pv.path.target)}，距今 ${pv.path.dist} 天。只按日期区分，不看有没有数据`]];
  if (le) srcRows.push(['数据来源', '靠船计划', <>批次 <span className="mono">{src.batchNo ?? '—'}</span> · 计划日 {src.planDate ? mdCn(src.planDate) : '—'} · 来源 {src.source ?? '—'}</>], ['覆盖到', src.coverTo ? mdCn(src.coverTo) : '—', '预计靠泊 ≤ 当天 ≤ 预计卸完，只比较日期、不比较时刻；非德信泊位（' + pv.excluded.offPool + ' 条）不计入']);
  else srcRows.push(['数据来源', '航次计划', '航次主表 · 计划覆盖到 ' + (src.coverTo ? mdCn(src.coverTo) : '—')], ['占用口径', '看同期船数', (prod ? '受载期' : '计划抵卸港窗口') + '起止之间都算在场；只计与该吨级泊位竞争的船'], ['不计入', `已取消航次 ${pv.excluded.cancelled} 条`, '已取消的航次不进同期船数']);
  const e50 = rule ? Math.ceil(rule.effP50) : 0, e80 = rule ? Math.ceil(rule.effP80) : 0;
  const rrows: Array<[ReactNode, ReactNode, ReactNode]> = rule
    ? [['航程规则', <span className="mono">{rule.id}</span>, '航程规则表（装港 × 卸港）' + (rule.borrowed ? '；物资备件船借用大宗采购船同一航线的样本' : '')],
        ['口径', rule.basis === '经验值' ? '经验估算' : '历史统计', rule.basis === '经验值' ? `实际样本 ${rule.samples} 条，不足 5 条，暂用经验估算（累计到 5 条后自动改用历史统计）` : `样本 ${rule.samples} 条，已达 5 条，使用历史统计`],
        ['生效航程', `${e50} ～ ${e80} 天`, `按整天向上取整：较短（P50）${e50} 天，较长（P80）${e80} 天`],
        ...(prod ? [['到客户港预计', pv.custEta ? `${md(pv.custEta[0])} – ${md(pv.custEta[1])}` : '—', '反向近似，仅供参考'], ['最晚装船日', mdCn(pv.deadline), `受载期最后一天；建议窗口末日距截止还剩 ${pv.slack ?? '—'} 天`]] as Array<[ReactNode, ReactNode, ReactNode]>
          : [['推荐发船日', pv.depart ? mdCn(pv.depart) : '—', `到港窗口最后一天 ${md(pv.window.to)} − ${e80} 天（不早于今天）`], ['预计抵港', pv.eta ? `${md(pv.eta[0])} ～ ${md(pv.eta[1])}` : '—', `发船日 + ${e50} ～ ${e80} 天，落在到港窗口 ${md(pv.window.from)} – ${md(pv.window.to)} 内`]] as Array<[ReactNode, ReactNode, ReactNode]>)]
    : [['航程规则', '暂无', `没有「${zh(i.load)} → ${zh(i.disch)}」的航程规则，只给到港日期，不推算发船日`]];
  const mixed = run.run_mode === '混合';
  const cands = (pv.candidates ?? []) as R[];

  const evidence = (
    <>
      {trust && <div className="lowbox" style={{ margin: '14px 16px 0' }}><b>为什么标「低可信」：</b>{pv.reasons.join('；')}。</div>}
      {st && <Step no={nx()} title="库存与断料" tip="预测先排除会断料的时间，再在剩下的时间里按港口容量选最宽松的。这是硬约束，不是评分。"><Table rows={stockRows} /><div className="fnote">曲线见上方「库存保障与趋势」。</div></Step>}
      <Step no={nx()} title="输入与可用泊位" tip="只统计容量不小于货量的启用泊位，它们是泊位余量率的基数。容量以《泊位容量表》为准，不按历史靠泊记录调整。">
        <Table rows={[['货量', fmt(i.tons) + ' 吨', '本次预测输入'], ['航线', zh(i.load) + ' → ' + zh(i.disch), '本次预测输入；本港侧 = ' + (prod ? '装港' : '卸港')], [prod ? '受载期' : '期望到港窗口', `${md(i.winStart)} – ${md(i.winEnd)}`, '本次预测输入' + (prod ? '；最晚装船日 = 受载期最后一天' : '')],
          ['能装下的泊位', `${P.n} 个`, `泊位主档 · ${P.basis ?? '泊位容量表'}（容量 ≥ ${fmt(i.tons)} 吨）：${P.codes.join('、')}`]]} /></Step>
      <Step no={nx()} title="计算路径与数据来源" tip="目标到港日距今不超过 15 天，用靠船计划逐个泊位算占用；超过 15 天没有逐泊位数据，改用航次计划统计同期船数。"><Table rows={srcRows} /></Step>
      <Step no={nx()} title={le ? '逐日算出最低泊位余量' : '逐日统计同期船数'} tip={le ? '泊位余量率 = 空闲泊位 ÷ 能装下该货量的泊位总数。只要窗口里有一天紧张，船就要排队，所以取最低的一天。' : '15 天后只能数同期船数，不算泊位余量率。取窗口内最多的一天，越少越宽松。'}
        lead={le ? <>窗口内逐日算一次，取最低的一天：<b>{pct(c)}</b>（空闲泊位 ÷ 能装下的泊位 {P.n} 个）</> : <>窗口内逐日统计，取最多的一天：<b>{c} 艘</b>（能装下的泊位 {P.n} 个）</>}>
        <table className="kv"><thead><tr><th>日期</th><th>{le ? '占用泊位' : '同期船数'}</th><th>{le ? '泊位余量' : '占能装下泊位'}</th><th>{le ? '占用的泊位' : '同期的船'}</th></tr></thead><tbody>
          {(pv.days as R[]).map((d) => d.state !== 'ok'
            ? <tr key={d.date}><td>{md(d.date)} {wk(d.date)}</td><td colSpan={3}><span className="day nd">无数据</span> <span className="muted">灰色斜线，不是 0；不参与计算</span></td></tr>
            : <tr key={d.date} className={d === pick ? 'hl' : ''}><td>{md(d.date)} {wk(d.date)}{d === pick && <> <span className="tag amber nw">取这一天</span></>}</td>
                {le ? <><td>{d.occ} / {d.n} 个</td><td><span className={'day ' + cmrCls(d.cmr)}>{pct(d.cmr)} {cmrLab(d.cmr)}</span></td><td>{(d.berths ?? []).join('、') || '无'}</td></>
                    : <><td>{d.count} 艘</td><td><span className={'day ' + denCls(d.count, d.n)}>{Math.round((d.count / d.n) * 100)}% {denLab(d.count, d.n)}</span></td><td>{(d.ships ?? []).join('、') || '无'}</td></>}</tr>)}
        </tbody></table></Step>
      <Step no={nx()} title={prod ? '航程与截止日' : '航程与发船日'} tip="发船日 = 到港窗口最后一天 − 较长航程（P80：八成的船不超过的天数），这样大概率不晚于窗口到港。"><Table rows={rrows} /></Step>
      {cands.length > 0 && (
        <Step no={nx()} title="为什么是这个方案" tip="把期望窗口切成每 3 天一档、每次挪一天，逐档计算。带星号的候选窗口里有没数据的日子，只按有数据的天数算。"
          lead={(pv.urgent ? '库存告急：不比拥挤程度，推荐方案是最早能到的一档，备选方案是与它错开的下一档。' : (st ? '先排除到港晚于最晚到港日的候选，再按港口容量排序。' : '') + (mixed ? '近 15 天与 15 天后各自按自己的指标排序，不跨路径比数值；' : '') + '推荐方案：' + (le ? '最低泊位余量最高' : '同期最多船数最少') + '的一档，同分取更早；') + '备选方案：要求余量不低于 30%，并与推荐方案错开；没有完整数据的候选时从数据不全的时间里选，并标「低可信」。'}>
          <div className="cands"><div className="ct">候选窗口（3 天一档，不使用综合评分）：</div>
            {cands.map((cd, k) => { const lc = cd.mode ? cd.mode === 'cmr' : le, cls = cd.none ? 'nd' : lc ? cmrCls(cd.metric) : denCls(cd.metric, P.n);
              return <span key={k} className={'cand ' + cls + (cd.complete ? '' : ' sp')}>{cd.mark && <i className={cd.mark === 'B' ? 'b' : ''}>{cd.mark === 'A' ? '推荐' : '备选'}</i>}{md(cd.s)}–{md(cd.e).slice(3)} {cd.none ? '无数据' : lc ? pct(cd.metric) : cd.metric + ' 艘'}{cd.complete || cd.none ? '' : '*'}</span>; })}</div>
          <div className="fnote" style={{ marginTop: 8 }}>已排除：无数据的候选 {pv.excluded.noData} 个{pv.excluded.pastDepart ? `；发船日早于今天的候选 ${pv.excluded.pastDepart} 个` : ''}。</div></Step>
      )}
    </>
  );

  // —— 库存卡：用存下来的断料信息还原成同一个组件的入参 ——
  const stockRes = (st && invItem ? {
    input: { tons: i.tons }, urgent: pv.urgent,
    stock: { item: { name: invItem.name, stock: invItem.stock, daily: invItem.daily, days: invItem.days }, so: st.stockout ? toDn(st.stockout) : null, latest: st.latest ? toDn(st.latest) : null, buffer: st.buffer, gap: st.gap ? { from: toDn(st.gap.from), to: toDn(st.gap.to) } : null },
    plans: plan.label === 'A' ? [{ c: { e: toDn(pv.window.to) }, stock: st }, null] : [null, { c: { e: toDn(pv.window.to) }, stock: st }],
  } : null);

  const ann = (data.announcements as R[]).filter((a) => a.label === plan.label).slice(-1)[0];
  return (
    <div className="pg-p03 pg-p02">
      <section className="card qbar">
        <div className="card-h"><h2 className="nw">预测详情</h2><Link className="back" to={backUrl}>← 返回智能发船预测</Link><span className="sp" />
          <div className="tabs"><button className={which === 'A' ? 'on' : ''} onClick={() => setSp({ plan: 'A' })}>推荐方案</button><button className={which === 'B' ? 'on' : ''} disabled={!plans.find((p) => p.label === 'B')} onClick={() => setSp({ plan: 'B' })}>备选方案</button></div></div>
        <div className="frow ro">
          {([['业务类型', i.biz], ['货量（吨）', fmt(i.tons)], ['物料库存', i.item ?? '不关联库存'], ['装港', (prod ? '🔒 ' : '') + zh(i.load)], ['卸港', (prod ? '' : '🔒 ') + zh(i.disch)], [prod ? '受载期' : '期望到港窗口', `${md(i.winStart)} – ${md(i.winEnd)}`], ['目标到港日', `${mdCn(pv.path.target)}（距今 ${pv.path.dist} 天）`], ['计算路径', mixed ? '各候选日期分别计算' : le ? '近 15 天 · 靠船计划' : '15 天后 · 航次计划']] as Array<[string, string]>).map(([k, v]) => <div className="ro" key={k}><div className="f-lab">{k}</div><div className="rv">{v}</div></div>)}
        </div>
      </section>
      <div className="work"><div className="stack">
        <section className={'card plan-sum ' + plan.label + (trust ? ' low' : '')}>
          <div className="card-h"><h2 className="nw">方案结论 · {plan.label === 'A' ? '推荐方案' : '备选方案'}</h2><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{trust ? <span className="tag lowtrust">⚠ 低可信</span> : <span className="tag green">可信度 正常</span>}<span className={'tag ' + (le ? 'blue' : '')} style={le ? undefined : { background: '#f9f0ff', color: '#531dab', borderColor: '#d3adf7' }}>{le ? '近 15 天' : '15 天后'}</span></span></div>
          <div className="concl">{m1}{m2}{m3}</div>{timeline()}
        </section>
        {stockRes && <StockCard res={stockRes} today={today} inventorySource={(inv?.batch as R)?.fileName} />}
        <section className="card"><div className="card-h"><h2>数据依据（参数匹配溯源）<Info text="每个数字来自哪张表、哪个批次、哪条航程规则。数值全部由规则计算得出，不经过任何生成式模型改写；德龙版称为 S1 溯源。" /></h2><span className="muted">每个数字都能对出来</span></div>
          <div className="ev">{evidence}</div>
          <div className="tech"><span>运行编号 <span className="mono">{data.runNo}</span></span><span>运行人 {pv.runBy ?? '—'}</span><span>运行时间 {pv.at?.slice(0, 16).replace('T', ' ') ?? '—'}</span>{src.batchNo ? <span>靠船计划批次 <span className="mono">{src.batchNo}</span></span> : <span>本次未使用靠船计划</span>}{rule && <span>航程规则 <span className="mono">{rule.id}</span></span>}</div></section>
        <section className="card"><div className="card-h"><h2>可用泊位视图<Info text="选一天看 23 个泊位的状态。默认选窗口里最紧的一天，也就是决定「最低泊位余量」的那一天。" /></h2><span className="muted">点击上方日期切换</span></div>
          <div className="dtabs">{(pv.days as R[]).map((d) => <button key={d.date} className={'dtab' + (d.date === selDate ? ' on' : '')} onClick={() => setDay(d.date)}><b>{md(d.date)} {wk(d.date)}</b><small>{d.state !== 'ok' ? '无数据' : le ? '余量 ' + pct(d.cmr) : d.count + ' 艘'}</small></button>)}</div>
          {selDate && <><BerthMap date={toDn(selDate)} tons={i.tons} /><Ships date={selDate} tons={i.tons} le={le} zh={zh} /></>}
        </section>
      </div>
      <aside className="side"><section className="card"><div className="card-h"><h2>宣船文案</h2><span className="muted">{plan.label === 'A' ? '推荐方案' : '备选方案'}</span></div><div className="card-b">
        <Announce runNo={data.runNo} label={plan.label} saved={ann} />
      </div></section></aside></div>
    </div>
  );
}

function Ships({ date, tons, le, zh }: { date: string; tons: number; le: boolean; zh: (e?: string | null) => string }) {
  const { data } = useDayDetail(date, tons);
  if (!data) return null;
  const det = data.detail as R, md2 = (n: number) => isoOf(n).slice(5).replace('-', '/');
  return (
    <div className="ships">
      {det.state !== 'ok' ? <div className="empty">这一天暂无数据（灰色斜线，不是 0 艘）。</div>
        : !det.list.length ? <div className="empty">这一天没有占用同吨级泊位的船，泊位全部空闲。</div>
        : le ? <table className="tb"><thead><tr><th>船名</th><th>泊位</th><th>货种</th><th>货量</th><th>预计到港</th><th>靠泊</th><th>在港至</th><th>当天</th></tr></thead><tbody>
            {det.list.map((s: R, k: number) => <tr key={k}><td><b>{s.vessel}</b></td><td>{s.berth}</td><td>{s.cargo}</td><td>{fmt(s.tons)} 吨</td><td>{md2(s.eta)}</td><td>{md2(s.start)}</td><td>{md2(s.end)}</td><td>{s.arriving ? <span className="tag blue">预抵</span> : s.berthing ? <span className="tag blue">靠泊</span> : <span className="tag gray">在泊</span>}</td></tr>)}</tbody></table>
        : <table className="tb"><thead><tr><th>船名</th><th>航线</th><th>货量</th><th>{det.list[0]?.side === '装' ? '受载期' : '计划到港窗口'}</th><th>状态</th><th>当天</th></tr></thead><tbody>
            {det.list.map((s: R, k: number) => <tr key={k}><td><b>{s.vessel || '待宣船'}</b></td><td>{zh(s.load)} → {zh(s.disch)}</td><td>{fmt(s.tons)} 吨</td><td>{md2(s.start)} – {md2(s.end)}</td><td>{s.status}</td><td>{s.arriving ? <span className="tag blue">计划到达</span> : <span className="tag gray">窗口内</span>}</td></tr>)}</tbody></table>}
    </div>
  );
}

function Announce({ runNo, label, saved }: { runNo: string; label: string; saved?: R }) {
  const [out, setOut] = useState<R>(null), cur = out?.label === label ? out : saved;
  const gen = useWrite((_: null) => api.announce(runNo, label), [['prediction', runNo]]);
  return cur ? (
    <>
      <div className="annc">{(cur.parts ?? []).map((x: R, k: number) => (x.v ? <span key={k} className="v">{x.t}</span> : <span key={k}>{x.t}</span>))}</div>
      <div className="fnote">蓝色底的数字由规则计算得出，只读、不会被改写；其余为固定模板措辞，模板文字待业务确认。</div>
      <button className="btn primary lg" style={{ width: '100%', marginTop: 12 }} onClick={() => navigator.clipboard?.writeText(cur.text).then(() => toast.success('已复制到剪贴板'), () => toast('复制失败，请手动选取'))}>一键复制</button>
    </>
  ) : <><div className="fnote" style={{ marginTop: 0 }}>文案只引用这次预测保存的数值，不会重新计算。</div><button className="btn primary lg" style={{ width: '100%', marginTop: 12 }} disabled={gen.isPending} onClick={() => gen.mutate(null, { onSuccess: (r: R) => setOut({ ...r, label }) })}>生成宣船文案</button></>;
}
