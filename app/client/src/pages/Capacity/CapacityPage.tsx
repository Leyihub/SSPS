import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBerths, useCalendar, useDayDetail, useMe } from '../../ssps/api';
import { cmrCls, cmrLab, denCls, denLab, nIso, nMd, nMdCn, nWk, wan } from '../../ssps/cmr';
import { dayNum, fmt } from '../../ssps/format';
import { usePortName } from '../../ssps/hooks';
import { Info } from '../../ssps/ui';
import './p06.css';

type R = any;
const TONS: Array<[number, string]> = [[10000, '1 万吨'], [20000, '2 万吨'], [30000, '3 万吨'], [50000, '5 万吨'], [70000, '7 万吨']];
const RANGES: Array<[number, string]> = [[15, '近 15 天'], [30, '近 30 天'], [60, '近 60 天']];
const PATH_LIMIT = 15;
const kc = (v: number) => cmrCls(v).replace('c', 'k');

export default function CapacityPage() {
  const { data: me } = useMe(), zh = usePortName(), { data: berths } = useBerths();
  const today = me ? dayNum(me.today) : 0;
  const [tons, setTons] = useState(50000), [range, setRange] = useState(30), [selRaw, setSel] = useState<number | null>(null), [closed, setClosed] = useState<Record<string, boolean>>({});
  const { data: cal } = useCalendar(tons, 60);
  const sel = selRaw ?? today, last = today + range - 1;
  const { data: todayDet } = useDayDetail(me ? nIso(today) : null, tons), { data: selDet } = useDayDetail(me ? nIso(sel) : null, tons);
  if (!me || !cal || !berths) return null;

  const days: R[] = cal.days, byD = new Map<number, R>(days.map((d) => [d.d, d])), P = cal.pool;
  const info = (d: number) => (d < today ? { state: 'past' } : d > last ? { state: 'out' } : !P.n ? { state: 'nodata', mode: byD.get(d)?.mode } : byD.get(d) ?? { state: 'out' });
  const near = days.filter((x) => x.i <= PATH_LIMIT && x.state === 'ok' && x.mode === 'cmr');
  const mn = near.length ? near.reduce((a, b) => (b.cmr < a.cmr ? b : a)) : null;
  const t = byD.get(today), tOk = t?.state === 'ok';

  const cell = (k: string, v: React.ReactNode, n: string, tip?: string) => <div><div className="k">{k}{tip && <Info text={tip} />}</div><div className="v">{v}</div><div className="n">{n}</div></div>;

  // —— 日历网格（周一开头） ——
  const dow0 = (new Date(today * 86400000).getUTCDay() + 6) % 7, start = today - dow0, weeks = Math.ceil((dow0 + range) / 7), firstFar = today + PATH_LIMIT + 1;
  const grid = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = start + i, x: R = info(d), label = new Date(d * 86400000).getUTCDate() === 1 ? nMd(d) : String(Number(nIso(d).slice(8)));
    const head = <div className="dt"><b>{label}</b>{d === today && <span className="td">今天</span>}</div>;
    let cls = 'dc', body: React.ReactNode;
    if (x.state === 'past' || x.state === 'out') { cls += ' ' + x.state; body = head; }
    else {
      const far = x.mode === 'density'; if (far) cls += ' far' + (d === firstFar ? ' firstfar' : '');
      if (d === today) cls += ' today';
      if (x.state !== 'ok') { cls += ' nd'; body = <>{head}<div className="big">—</div><span className="sm">无数据</span></>; }
      else if (x.mode === 'cmr') { cls += ' ' + cmrCls(x.cmr); body = <>{head}<div className="big">{Math.round(x.cmr * 100)}%</div><span className="sm">空闲 {x.n - x.occ} | 占用 {x.occ}</span></>; }
      else { cls += ' ' + denCls(x.count, x.n); body = <>{head}<div className="big">{x.count} 艘</div><span className="sm">估算 · {denLab(x.count, x.n)}</span></>; }
    }
    if (d === sel) cls += ' sel';
    const dis = x.state === 'past' || x.state === 'out';
    return <button key={d} className={cls} disabled={dis} onClick={() => setSel(d)}>{body}{d === firstFar && !dis && <span className="mtag">15 天后</span>}</button>;
  });

  // —— 侧栏：选中那天的泊位分布和船 ——
  const det: R = selDet?.detail, le = (byD.get(sel)?.mode ?? 'cmr') === 'cmr', nodata = !det || det.state !== 'ok';
  const items = ((selDet?.berths ?? []) as R[]).map((b) => {
    const state = b.state === 'nd' ? 'nd2' : b.state as string;
    const L = [`${b.code} · ${b.terminal}`, `容量 ${wan(b.capacity)} · ${b.category ?? '海船泊位'} · ${b.status}`, `依据：${b.basis ?? '—'}${b.note ? '（' + b.note + '）' : ''}`, `货量 ${fmt(tons)} 吨：${b.state === 'off' ? '装不下，不计入余量基数' : '能装下，计入余量基数'}`];
    if (!le) L.push(nMdCn(sel) + '：15 天后没有逐泊位数据'); else if (nodata) L.push(nMdCn(sel) + '：靠船计划暂无数据'); else if (b.vessel) L.push(`${nMdCn(sel)} 占用：${b.vessel}`, `${b.cargo ?? ''} ${fmt(b.tons)} 吨`, `预计靠泊 ${nMd(b.from)} · 在港至 ${nMd(b.to)}`); else if (b.state !== 'off') L.push(nMdCn(sel) + '：空闲');
    return { b, state, tip: L.join('\n') };
  });
  const label: Record<string, string> = { free: '空闲', occ: '占用', off: '装不下', cap: '能装下', nd2: '无数据' };
  const grp = (name: string) => {
    const g = items.filter((x) => x.b.terminal === name), c = (s: string) => g.filter((x) => x.state === s).length;
    const sum = !le ? '能装下 ' + (g.length - c('off')) : nodata ? '无数据' : `占用 ${c('occ')} | 空闲 ${c('free')}`;
    return <div key={name} className={'tg' + (closed[name] ? ' closed' : '')}><div className="tg-h" onClick={() => setClosed({ ...closed, [name]: !closed[name] })}><span className="ar">▾</span>{name}（{g.length} 个）<span className="sp" /><small>{sum}</small></div>
      <div className="bm-r">{g.map((x) => <div key={x.b.code} className={'bt ' + x.state} title={x.tip}><b>{x.b.code}</b><small>{label[x.state]}</small></div>)}</div></div>;
  };
  const n = items.filter((x) => x.state !== 'off').length, free = items.filter((x) => x.state === 'free').length;
  const list: R[] = det?.list ?? [];

  return (
    <div className="pg-p06">
      <div className="card hero">
        <div className="ht"><div className="av"><svg width="28" height="28" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2.5" fill="none" stroke="#1677ff" strokeWidth="2" /><path d="M3 10h18M8 3v4M16 3v4" stroke="#1677ff" strokeWidth="2" strokeLinecap="round" /></svg></div>
          <div><h1>港口容量日历</h1><p>全员可看。近 15 天看每日泊位余量，15 天后看同期船数；点任意一天看当天的泊位分布和在港、预抵的船。</p></div></div>
        <div className="ctl"><span className="lab">货量档<Info text={<>按这个货量算「能装下的泊位」作为基数，默认 5 万吨。<br />吨级档的划分还没有确认，先按泊位容量档位列出。</>} /></span>
          <div className="seg">{TONS.map(([n2, l]) => <button key={n2} className={n2 === tons ? 'on' : ''} onClick={() => setTons(n2)}>{l}</button>)}</div>
          <span className="lab">显示范围</span><div className="seg">{RANGES.map(([n2, l]) => <button key={n2} className={n2 === range ? 'on' : ''} onClick={() => { setRange(n2); if (sel > today + n2 - 1) setSel(today); }}>{l}</button>)}</div></div>
      </div>

      <section className="card kpi">
        {cell('能装下的泊位', <>{P.n}<small>/ {berths.length} 个</small></>, `货量 ${fmt(tons)} 吨 · 容量 ≥ 货量的启用泊位`, '泊位余量率的基数：只计容量不小于货量的启用泊位，随货量档变化。')}
        {cell('今日空闲泊位', tOk ? <>{t.n - t.occ}<small>个</small></> : '—', tOk ? `占用 ${t.occ} 个` : '靠船计划暂无数据')}
        {cell('今日在港船舶', tOk && todayDet ? <>{todayDet.detail.list.length}<small>艘</small></> : '—', '只计占用能装下泊位的船')}
        {cell('今日泊位余量', tOk ? <span className={kc(t.cmr)}>{Math.round(t.cmr * 100)}%</span> : '—', tOk ? cmrLab(t.cmr) + ' · 空闲 ÷ 能装下的泊位' : '无数据（不是 0%）', '唯一的容量口径：泊位余量率 = 空闲泊位 ÷ 能装下的泊位，越高越宽松。')}
        {cell('近 15 天最低泊位余量', mn ? <span className={kc(mn.cmr)}>{Math.round(mn.cmr * 100)}%</span> : '—', mn ? `出现在 ${nMdCn(mn.d)} ${nWk(mn.d)}${near.length < PATH_LIMIT + 1 ? ` · 有数据 ${near.length} 天` : ''}` : '无数据', '预测排序用的就是窗口内的最低泊位余量；这里看近 15 天里最紧的一天。')}
      </section>

      <div className="layout">
        <section className="card">
          <div className="calh"><h2>{nMdCn(today)} – {nMdCn(last)} · 能装下的泊位 {P.n} / {berths.length} 个</h2>
            <div className="phase"><span><i />近 15 天：泊位余量（靠船计划）</span><span><i style={{ borderStyle: 'dashed', borderColor: '#b37feb', background: '#f4ebff' }} />15 天后：同期船数（航次计划，估算）</span></div></div>
          <div className="cal">{['一', '二', '三', '四', '五', '六', '日'].map((x, i) => <div key={x} className={'wd' + (i > 4 ? ' we' : '')}>周{x}</div>)}{grid}</div>
          <div className="legend">
            <div className="g"><b style={{ color: 'var(--text)' }}>近 15 天泊位余量</b><span className="sw c1">≥50%</span>充裕<span className="sw c2">30–50%</span>适中<span className="sw c3">10–30%</span>偏紧<span className="sw c4">&lt;10%</span>紧张</div>
            <div className="g"><b style={{ color: 'var(--text)' }}>15 天后同期船数</b><span className="sw c1">≤50%</span><span className="sw c2">≤70%</span><span className="sw c3">≤90%</span><span className="sw c4">&gt;90%</span>占能装下的泊位数</div>
            <div className="g"><span className="sw nd">&nbsp;&nbsp;</span><b style={{ color: 'var(--text)' }}>无数据</b>灰色斜线，不是 0</div>
          </div>
        </section>

        <aside className="side card">
          <div className="dh"><h2>{nMdCn(sel)}（{nWk(sel)}）{le ? <span className="tag blue">近 15 天 · 靠船计划</span> : <span className="tag" style={{ background: '#f9f0ff', color: '#531dab', borderColor: '#d3adf7' }}>15 天后 · 航次计划</span>}</h2></div>
          <div className="st3">{le
            ? <><div><div className="k">在港船舶</div><div className="v">{nodata ? '—' : list.length}<small>艘</small></div></div><div><div className="k">空闲泊位</div><div className="v">{nodata ? '—' : free}<small>/ {n} 个</small></div></div>
                <div><div className="k">泊位余量</div><div className="v">{nodata ? <span style={{ color: 'var(--muted)' }}>无数据</span> : <span style={{ color: det.cmr >= 0.5 ? '#237804' : det.cmr >= 0.3 ? '#ad6800' : det.cmr >= 0.1 ? '#d4380d' : '#a8071a' }}>{Math.round(det.cmr * 100)}%</span>}</div></div></>
            : <><div><div className="k">同期船数</div><div className="v">{nodata ? '—' : det.count}<small>艘</small></div></div><div><div className="k">能装下的泊位</div><div className="v">{n}<small>个</small></div></div><div><div className="k">拥挤程度</div><div className="v" style={{ fontSize: 18 }}>{nodata ? '无数据' : denLab(det.count, P.n)}</div></div></>}</div>
          <div className="sec">泊位分布<Info text={`23 个德信泊位。货量档 ${fmt(tons)} 吨：灰色表示装不下，不计入余量基数。${le ? '' : '15 天后没有逐泊位数据，只判断能否装下。'}`} /></div>
          {grp('北区码头')}{grp('拉博塔码头')}
          <div className="bl"><span className="g"><span className="sw c1">空闲</span></span><span className="g"><span className="sw c3">占用</span></span><span className="g"><span className="sw" style={{ background: '#eef0f3', color: '#a7b0bc', borderColor: '#dfe3e8' }}>装不下</span>不计入基数</span><span className="g"><span className="sw nd">&nbsp;&nbsp;</span>无数据</span></div>
          <div className="ships"><div className="sec" style={{ margin: '12px 0 0' }}>{le ? '当日在港和预抵的船' : '当日同期的船'}（{nodata ? 0 : list.length} 艘）<Info text="只列出会占用同吨级泊位的船。" /></div>
            {nodata ? <div className="none">这一天还没有数据（灰色斜线，不是 0 艘）。{le ? `靠船计划目前只到 ${cal.planCoverTo != null ? nMd(cal.planCoverTo) : '—'}。` : `航次计划目前只到 ${cal.voyHorizon != null ? nMd(cal.voyHorizon) : '—'}。`}</div>
              : !list.length ? <div className="none">这一天没有占用同吨级泊位的船。</div>
              : le ? <table className="stb"><thead><tr><th>船名</th><th>泊位</th><th>货种</th><th className="r">货量</th><th>预计卸完</th></tr></thead><tbody>
                  {list.map((s, k) => <tr key={k}><td>{s.matchVoyage ? <Link to={'/voyages/' + s.matchVoyage}>{s.vessel}</Link> : s.vessel}{s.arriving ? <span className="t arr">今日预抵</span> : s.berthing ? <span className="t arr">今日靠泊</span> : null}</td><td>{s.berth}</td><td>{s.cargo}</td><td className="r">{fmt(s.tons)} 吨</td><td>{nMd(s.end)}</td></tr>)}</tbody></table>
              : <table className="stb"><thead><tr><th>船名</th><th>航线</th><th className="r">货量</th><th>计划窗口</th></tr></thead><tbody>
                  {list.map((s, k) => <tr key={k}><td><Link to={'/voyages/' + s.id}>{s.vessel || '待宣船'}</Link>{s.arriving && <span className="t arr">计划到达</span>}</td><td>{zh(s.load)} → {zh(s.disch)}</td><td className="r">{fmt(s.tons)} 吨</td><td>{nMd(s.start)} – {nMd(s.end)}</td></tr>)}</tbody></table>}
          </div>
        </aside>
      </div>
    </div>
  );
}
