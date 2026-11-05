import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useIssues, useMe, useVoyages, useWrite } from '../../ssps/api';
import { Empty, Info, Loading } from '../../ssps/ui';
import './p09.css';

const TYPES: Array<[string, string]> = [
  ['缺离装港时间', '已抵卸港但「实际离装港」为空，无法记入航程样本。'], ['ETA 超期未更新', '航行中的航次，预计到达时间超过 3 天没有更新（阈值暂定）。'], ['缺 MMSI', 'MMSI 必填；缺失的船无法接入船讯网定位。'],
  ['港口未匹配', '导入或录入的港口写法在港口主档（含别名）里找不到。'], ['节点时序倒置', '后一个时间节点早于前一个，保存被拦截；历史数据里已有的倒置也会记在这里。'], ['疑似占位时间', '多条记录的实际时间完全相同，疑似批量复制的占位时间，不进航程统计。'],
];
const FIELD: Record<string, string> = { '缺离装港时间': 'actLoadDep', '节点时序倒置': 'actDischArr', 'ETA 超期未更新': 'eta' };

export default function QualityPage() {
  const nav = useNavigate(), { data: me } = useMe(), { data: issues, isLoading } = useIssues();
  const { data: vs } = useVoyages({ pageSize: 200 });
  const [type, setType] = useState(''), [own, setOwn] = useState(''), [mine, setMine] = useState(false), [st, setSt] = useState<string[]>(['待处理', '处理中']);
  const set = useWrite((b: { id: string; to: '处理中' | '已关闭' }) => api.setIssue(b.id, b.to), [['issues']]);
  if (isLoading || !me) return <Loading />;
  const all = issues ?? [], vmap = new Map((vs?.items ?? []).map((v) => [v.id, v]));
  const open = (t: string) => all.filter((x) => x.type === t && x.status !== '已关闭').length;
  const types: Array<[string, string]> = [...TYPES, ...[...new Set(all.map((x) => x.type))].filter((t) => !TYPES.some((x) => x[0] === t)).map((t): [string, string] => [t, '系统在导入时发现的问题，见每一行的说明。'])];
  const list = all.filter((x) => (!type || x.type === type) && (!own || x.owner === own) && st.includes(x.status) && (!mine || x.owner === me.name));
  const target = (x: (typeof all)[number]) => { const v = vmap.get(x.object); return /^VY-/.test(x.object) ? { href: `/voyages/${x.object}${(x.field ?? FIELD[x.type]) ? '?focus=' + (x.field ?? FIELD[x.type]) : ''}`, label: v?.vessel || '待宣船', sub: x.object } : x.type.startsWith('靠船计划') ? { href: '/berth-plans', label: x.object, sub: '靠船计划批次' } : { href: '/master?tab=vessel', label: x.object, sub: '主数据' }; };

  return (
    <div className="pg-p09">
      <div className="ptitle"><div><h1>数据质量</h1><p>系统在保存和导入时发现的数据问题。点击一行直接跳到对应航次的字段；关闭问题需要责任人本人操作。</p></div></div>
      <div className="tiles">{types.map(([t, tip]) => <div key={t} className={'card tile' + (type === t ? ' on' : '') + (open(t) ? ' hot' : '')} onClick={() => setType(type === t ? '' : t)}><b>{open(t)}</b><span>{t}<Info text={tip} /></span></div>)}</div>
      <section className="card">
        <div className="fbar"><span className="lab">责任人</span><select className="inp" value={own} onChange={(e) => setOwn(e.target.value)}><option value="">全部责任人</option>{[...new Set(all.map((x) => x.owner))].map((o) => <option key={o}>{o}</option>)}</select>
          <span className="lab">状态</span><div className="grp">{['待处理', '处理中', '已关闭'].map((s) => <button key={s} className={'chipf' + (st.includes(s) ? ' on' : '')} onClick={() => setSt(st.includes(s) ? st.filter((x) => x !== s) : [...st, s])}>{s}</button>)}</div>
          <button className={'chipf' + (mine ? ' on' : '')} onClick={() => setMine(!mine)}>只看我的</button><span className="muted nw" style={{ marginLeft: 'auto', fontSize: 12 }}>共 {list.length} 条</span></div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>编号</th><th>问题类型</th><th>对象</th><th>责任人</th><th>状态</th><th>说明</th><th /></tr></thead><tbody>
          {list.length ? list.map((x) => { const t = target(x), isOwner = x.owner === me.name || me.role === '系统管理员'; return (
            <tr key={x.id} className="click" onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) nav(t.href); }}>
              <td style={{ color: 'var(--muted)' }}>{x.id}</td><td><b>{x.type}</b></td><td className="obj"><Link to={t.href}>{t.label}</Link><small>{t.sub}</small></td><td>{x.owner}</td>
              <td><span className={'tag ' + (x.status === '已关闭' ? 'gray' : x.status === '处理中' ? 'blue' : 'amber')}>{x.status}</span></td><td className="wrap">{x.note}</td>
              <td><Link className="btn" to={t.href} style={{ textDecoration: 'none', padding: '2px 12px' }}>去处理</Link>{' '}
                {x.status !== '已关闭' && <>{x.status === '待处理' && <button className="btn" disabled={!isOwner} title={isOwner ? undefined : '只有责任人 ' + x.owner + ' 能操作'} style={{ padding: '2px 12px' }} onClick={() => set.mutate({ id: x.id, to: '处理中' })}>开始处理</button>}{' '}
                  <button className="btn" disabled={!isOwner} title={isOwner ? undefined : '关闭需要责任人 ' + x.owner + ' 本人操作'} style={{ padding: '2px 12px' }} onClick={() => set.mutate({ id: x.id, to: '已关闭' })}>关闭</button></>}</td></tr>); })
            : <tr><td colSpan={7}><Empty>没有符合条件的问题</Empty></td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
