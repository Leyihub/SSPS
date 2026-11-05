import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMe } from '../ssps/api';
import { wk } from '../ssps/format';
import '../ssps/ssps.css';

/** 导航：顺序按业务员的工作顺序，P11 智能提问是预测入口，排在 P02 前面 */
export const NAV: Array<{ group: string; id: string; name: string; to: string; sub?: boolean }> = [
  { group: '工作', id: 'P01', name: '工作台', to: '/' },
  { group: '预测', id: 'P11', name: '智能提问', to: '/ask' },
  { group: '预测', id: 'P02', name: '智能发船预测', to: '/predict' },
  { group: '预测', id: 'P03', name: '预测详情', to: '/predictions', sub: true },
  { group: '预测', id: 'P06', name: '港口容量日历', to: '/calendar' },
  { group: '航次', id: 'P04', name: '航次列表', to: '/voyages' },
  { group: '航次', id: 'P05', name: '航次详情/编辑', to: '/voyage', sub: true },
  { group: '主数据', id: 'P07', name: '靠船计划', to: '/berth-plans' },
  { group: '主数据', id: 'P08', name: '主数据', to: '/master' },
  { group: '主数据', id: 'P09', name: '数据质量', to: '/data-quality' },
  { group: '系统', id: 'P10', name: '系统管理', to: '/admin' },
];
const SHOW = new Set(['P01', 'P11', 'P02', 'P06', 'P04', 'P07', 'P08', 'P09', 'P10']);   // P03、P05 从列表或预测结果里进入，不单独放在导航里

export default function Layout() {
  const { data: me } = useMe(), loc = useLocation(), [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  const cur = NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)));
  let last = '';
  return (
    <div className="app">
      <aside id="nav" className={open ? 'open' : ''}>
        <div className="nav-in">
          <div className="brand"><span className="logo">S</span><div><b>SSPS</b><small>智慧发船预测系统</small></div></div>
          {NAV.filter((n) => SHOW.has(n.id)).map((n) => {
            const head = n.group !== last ? <div className="nav-group">{n.group}</div> : null; last = n.group;
            return <div key={n.id}>{head}<NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><span className="code">{n.id}</span>{n.name}</NavLink></div>;
          })}
          <div className="nav-foot">一期 · 飞书多维表格为主数据<br />应用是唯一录入入口</div>
        </div>
      </aside>
      {open && <div className="navmask on" onClick={() => setOpen(false)} />}
      <div className="main">
        <header id="topbar">
          <div className="crumb"><button className="burger" onClick={() => setOpen(!open)} aria-label="菜单">☰</button><b>{cur?.name ?? ''}</b></div>
          <div className="top-right">
            {me && <span className="top-date">{me.today} {wk(me.today)}</span>}
            {me && <span className="user"><span className="avatar">{me.name.slice(0, 1)}</span><span>{me.name}<small>{me.dept ? me.dept + ' · ' : ''}{me.role}</small></span></span>}
          </div>
        </header>
        <main className="page"><Outlet /></main>
      </div>
    </div>
  );
}
