import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIssues, useMe, useVoyages } from '../../ssps/api';
import { dayNum, fmt, md, mdCn, mdh, wk } from '../../ssps/format';
import { usePortName } from '../../ssps/hooks';
import { Info, StatusTag } from '../../ssps/ui';
import type { VoyageListItem } from '@shared/api.interface';
import './p01.css';

const ICON: Record<string, ReactNode> = {
  p0: <path d="M12 3v10M7 8l5 5 5-5M4 19h16" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  p1: <><circle cx="12" cy="12" r="8.5" fill="none" strokeWidth="2.2" /><path d="M12 7.5V12l3 2" fill="none" strokeWidth="2.2" strokeLinecap="round" /></>,
  p2: <><rect x="4" y="5" width="16" height="15" rx="2" fill="none" strokeWidth="2.2" /><path d="M4 10h16M9 3v4M15 3v4" fill="none" strokeWidth="2.2" strokeLinecap="round" /></>,
  p3: <><path d="M12 4l9 16H3z" fill="none" strokeWidth="2.2" strokeLinejoin="round" /><path d="M12 10v4M12 17v.5" fill="none" strokeWidth="2.2" strokeLinecap="round" /></>,
};
const Icon = ({ k, col }: { k: string; col: string }) => <svg viewBox="0 0 24 24" stroke={col}>{ICON[k]}</svg>;
const FINISHED = ['已结束', '已结束（取消）'];

export default function WorkbenchPage() {
  const { data: me } = useMe(), zh = usePortName();
  const { data: vs } = useVoyages({ mine: 1, pageSize: 200 });
  const { data: issues } = useIssues({ owner: me?.name ?? '' });
  if (!me) return null;

  const mine = vs?.items ?? [], today = dayNum(me.today), dow = new Date(today * 86400000).getUTCDay(), weekEnd = today + ((7 - dow) % 7);
  const missing = mine.filter((v) => v.missingDeparture), stale = mine.filter((v) => v.etaStale);
  const arrDate = (v: VoyageListItem) => (v.localAct || FINISHED.includes(v.status) ? null : v.eta || v.localPlan);
  const week = mine.filter((v) => { const d = arrDate(v); if (!d) return false; const n = dayNum(d); return n >= today && n <= weekEnd; }).sort((a, b) => arrDate(a)!.localeCompare(arrDate(b)!));
  const dq = (issues ?? []).filter((x) => x.status !== '已关闭');
  const byId = new Map(mine.map((v) => [v.id, v]));
  const route = (v: VoyageListItem) => zh(v.load) + ' → ' + zh(v.disch);
  const name = (v: VoyageListItem) => <><b>{v.vessel || '待宣船'}</b><span style={{ color: 'var(--muted)' }}>{v.id.slice(-4)}</span><StatusTag s={v.status} /></>;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const sum = (cls: string, n: number, label: string, tip: string, target: string, note: string) => (
    <div className={'card sm ' + cls} onClick={() => go(target)}>
      <span className="ico"><Icon k={target} col={cls === 'warn' ? '#cf1322' : cls === 'ok' ? '#389e0d' : '#1677ff'} /></span>
      <div className="tx"><span className="lb">{label}<Info text={tip} /></span><b>{n}</b><div className="nt">{note}</div></div>
    </div>
  );
  const panel = (id: string, title: string, n: number, hot: boolean, tip: string, empty: string, body: ReactNode) => (
    <section className={'card pn' + (hot && n ? ' hotp' : '')} id={id}>
      <div className="card-h"><h2><span style={{ width: 18, height: 18, display: 'inline-grid' }}><Icon k={id} col={hot && n ? '#cf1322' : '#1677ff'} /></span>{title}<span className={'cnt' + (hot && n ? ' hot' : '')}>{n}</span><Info text={tip} /></h2></div>
      {n ? <ul className="todo">{body}</ul> : <div className="nothing">{empty}</div>}
    </section>
  );
  const li = (key: string, href: string, main: ReactNode, desc: ReactNode, btn?: [string, string]) => (
    <li key={key}><Link className="main" to={href}><div className="t">{main}</div><div className="d">{desc}</div></Link>{btn && <Link className="btn" to={btn[1]} style={{ textDecoration: 'none' }}>{btn[0]}</Link>}</li>
  );

  return (
    <div className="pg-p01">
      <div className="card hello">
        <div className="ht"><div className="av"><svg width="30" height="30" viewBox="0 0 40 40"><path d="M6 26h28l-4 7H10z" fill="#1677ff" /><path d="M11 25V15h14l4 10z" fill="#69b1ff" /><rect x="14" y="9" width="7" height="6" rx="1" fill="#0958d9" /></svg></div>
          <div><h1>你好，{me.name}</h1><p>{me.dept ? me.dept + ' · ' : ''}{me.role} · 今天 {mdCn(me.today)} {wk(me.today)}</p></div></div>
        <div className="go"><Link className="btn primary" to="/ask">智能提问</Link><Link className="btn" to="/voyages">全部航次</Link></div>
      </div>

      <div className="sumrow">
        {sum(missing.length ? 'warn' : 'ok', missing.length, '待补节点', '已有「实际抵卸港」但「实际离装港」为空的航次。离装港时间是学习航程的关键样本，请尽快补录。', 'p0', missing.length ? '补录后才进入航程样本' : '没有待补')}
        {sum(stale.length ? 'warn' : 'ok', stale.length, 'ETA 超期未更新', '航行中的航次，预计到达时间超过 3 天没有更新。这个天数是暂定值，待确认。', 'p1', '超过 3 天未更新')}
        {sum('', week.length, '本周到港', '从今天到本周日，预计抵达本港（或装港）的航次。', 'p2', '今天到本周日')}
        {sum(dq.length ? 'warn' : 'ok', dq.length, '数据质量问题', '分配给你、尚未关闭的数据质量问题。', 'p3', dq.length ? '需要你处理' : '没有待处理')}
      </div>

      <div className="panels">
        {panel('p0', '待补节点', missing.length, true, '补录后状态会自动更新，这条航次才会进入航程样本。', '没有待补节点，真棒。',
          missing.map((v) => li(v.id, '/voyages/' + v.id, name(v), <>{route(v)} · 已于 {mdh(v.localAct)} 抵卸港，缺「实际离装港」</>, ['补录', `/voyages/${v.id}?act=node`])))}
        {panel('p1', 'ETA 超期未更新', stale.length, true, '点「修订 ETA」填写新的预计到达时间和依据（船讯网 / 船代 / 电话），每次修订都会留痕。', 'ETA 都是新的。',
          stale.map((v) => li(v.id, '/voyages/' + v.id, name(v), <>{route(v)} · 当前预计 {mdh(v.eta)} 到 · 上次更新 {md(v.etaUpdated)}（{today - dayNum(v.etaUpdated!)} 天前）</>, ['修订 ETA', `/voyages/${v.id}?act=eta`])))}
        {panel('p2', '本周到港', week.length, false, '按预计抵达时间排序；已抵达或已结束的不再列出。', '本周没有预计到港的航次。',
          week.map((v) => li(v.id, '/voyages/' + v.id, name(v), <>{md(arrDate(v))} {wk(arrDate(v)!)} {v.side === '装' ? '抵装港' : '抵本港'} · {route(v)} · {fmt(v.tons)} 吨</>)))}
        {panel('p3', '数据质量问题', dq.length, true, '点击跳到对应航次的相关字段；关闭问题需要责任人本人操作。', '没有待处理的问题。',
          dq.map((x) => { const v = byId.get(x.object); const href = /^VY-/.test(x.object) ? `/voyages/${x.object}${x.field ? '?focus=' + x.field : ''}` : '/data-quality';
            return li(x.id, href, <><b>{x.type}</b>{v && <span style={{ color: 'var(--muted)' }}>{v.vessel || '待宣船'} {x.object.slice(-4)}</span>}</>, x.note, ['去处理', href]); }))}
      </div>
    </div>
  );
}
