import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getApiErrorMessage, useMe, usePorts, useVoyages, useWrite } from '../../ssps/api';
import { bizShort, downloadCsv, fmt, md, mdh } from '../../ssps/format';
import { usePortName } from '../../ssps/hooks';
import { Empty, ErrorBox, Info, Loading, Modal, Pager, StatusTag, STATUS_FILTERS, Tabs, Tip } from '../../ssps/ui';
import { BIZ_TYPES, type VoyageListItem } from '@shared/api.interface';
import './p04.css';

const TABS: Array<[string, string | null]> = [['大宗', '大宗采购船'], ['成品', '成品销售船'], ['物资', '物资备件船'], ['全部', null]];
const GROUPS: Array<{ k: string; label: string; sts: string[]; col: string; bg: string }> = [
  { k: 'all', label: '当前页签航次', sts: [], col: '#1677ff', bg: '#e6f4ff' },
  { k: 'sail', label: '航行中', sts: ['航行中'], col: '#0958d9', bg: '#e6f4ff' },
  { k: 'port', label: '在港（等泊 / 作业）', sts: ['装港等泊', '装港装货', '卸港等泊', '卸港卸货'], col: '#d46b08', bg: '#fff7e6' },
  { k: 'done', label: '已结束', sts: ['已结束', '已结束（取消）'], col: '#389e0d', bg: '#f6ffed' },
];
const PAGE = 15;

export default function VoyageListPage() {
  const nav = useNavigate(), { data: me } = useMe(), zh = usePortName();
  const [tab, setTab] = useState<string | null>(null);
  const [sts, setSts] = useState<string[]>([]);
  const [f, setF] = useState({ from: '', to: '', owner: '', q: '', mine: false, focus: false });
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);

  const defTab = me?.dept === '大宗采购部' ? '大宗' : me?.dept === '商务海运部' ? '成品' : '全部';
  const curTab = tab ?? defTab, biz = TABS.find((t) => t[0] === curTab)?.[1] ?? '';
  const query = { biz, status: sts.join(','), ...f, mine: f.mine ? 1 : '', focus: f.focus ? 1 : '', page, pageSize: PAGE };
  const { data, isLoading, error, refetch } = useVoyages(query);
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  const exportAll = async () => {
    try {
      const rows: VoyageListItem[] = []; let p = 1, total = 0;
      do { const r = await api.listAll({ ...query, page: p, pageSize: 200 }); rows.push(...r.items); total = r.total; p++; } while (rows.length < total);
      downloadCsv('航次列表.csv', [['航次编号', '业务类型', '船次号', '船名', '装港', '卸港', '总货量（吨）', '本港侧日期', '预计到达', '状态', '业务员', '所属部门'],
        ...rows.map((v) => [v.id, v.biz, v.no, v.vessel || '待宣船', zh(v.load), zh(v.disch), v.tons, v.localAct || v.localPlan || '', v.eta && !v.localAct ? v.eta : '', v.status, v.owner, v.dept])]);
      toast.success('已导出 ' + rows.length + ' 条（CSV，Excel 可直接打开）');
    } catch (e) { toast.error(getApiErrorMessage(e, '导出失败')); }
  };

  const route = (v: VoyageListItem) => zh(v.load) + ' → ' + zh(v.disch);
  const marks = (v: VoyageListItem) => (
    <span className="mk">
      {v.focus && <span className="star" title="重点关注">★</span>}
      {v.flags.filter((x) => x !== '取消').map((x) => <span key={x} className="tag amber">{x}</span>)}
      {v.readonly && <Tip text="历史副本：只读，应用内不可修改"><span className="tag gray">只读</span></Tip>}
      {v.missingDeparture && <Tip text="已抵卸港但缺实际离装港，待补节点"><span className="tag red">待补</span></Tip>}
      {v.etaStale && <Tip text="ETA 超过 3 天未更新"><span className="tag red">ETA 过期</span></Tip>}
    </span>
  );

  return (
    <div className="pg-p04">
      <div className="card hero">
        <div className="ht">
          <div className="av"><svg width="28" height="28" viewBox="0 0 40 40"><path d="M6 26h28l-4 7H10z" fill="#1677ff" /><path d="M11 25V15h14l4 10z" fill="#69b1ff" /><rect x="14" y="9" width="7" height="6" rx="1" fill="#0958d9" /></svg></div>
          <div><h1>航次列表</h1><p>全员可看全部航次；金额类字段按部门隔离，列表里不显示。</p></div>
        </div>
        <div className="btns"><button className="btn" onClick={exportAll}>导出 Excel</button>{me?.role !== '物流管理员' && <button className="btn primary" onClick={() => setShowNew(true)}>＋ 新建航次</button>}</div>
      </div>

      <div className="sumrow">
        {GROUPS.map((g) => {
          const n = g.sts.length ? g.sts.reduce((a, s) => a + (data?.counts.status[s] ?? 0), 0) : data?.counts.status.all ?? 0;
          const on = g.sts.length ? sameSet(sts, g.sts) : !sts.length;
          return (
            <div key={g.k} className={'card sm' + (on ? ' on' : '')} onClick={() => { setSts(g.sts); setPage(1); }}>
              <span className="ico" style={{ background: g.bg }}><span style={{ width: 14, height: 14, borderRadius: 4, background: g.col }} /></span>
              <div style={{ minWidth: 0 }}><span className="lb">{g.label}</span><b style={{ color: g.col }}>{n}</b><div className="nt">{g.sts.length ? g.sts.join(' / ') : '随筛选条件变化'}</div></div>
            </div>
          );
        })}
      </div>

      <section className="card fcard">
        <div className="ch">筛选条件<span className="sp" /><button className="btn" style={{ padding: '2px 12px' }} onClick={() => { setSts([]); setF({ from: '', to: '', owner: '', q: '', mine: false, focus: false }); setPage(1); }}>↻ 清除筛选</button></div>
        <div className="fbox">
          <div className="flt"><span className="lab">状态</span>
            <div className="grp">{STATUS_FILTERS.map((s) => <button key={s} className={'chipf' + (sts.includes(s) ? ' on' : '')} onClick={() => { setSts(sts.includes(s) ? sts.filter((x) => x !== s) : [...sts, s]); setPage(1); }}>{s}</button>)}</div>
          </div>
          <div className="flt">
            <span className="lab">本港日期</span>
            <div className="dr"><input className="inp" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /><span>至</span><input className="inp" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
            <span className="lab">业务员</span>
            <select className="inp" value={f.owner} onChange={(e) => set({ owner: e.target.value })}><option value="">全部业务员</option>{data?.owners.map((o) => <option key={o}>{o}</option>)}</select>
            <input className="inp" placeholder="船名 / 航次号 / 船次号 / 合同号" style={{ minWidth: 230 }} value={f.q} onChange={(e) => set({ q: e.target.value.trim() })} />
            <div className="grp"><button className={'chipf' + (f.mine ? ' on' : '')} onClick={() => set({ mine: !f.mine })}>只看我的</button><button className={'chipf' + (f.focus ? ' on' : '')} onClick={() => set({ focus: !f.focus })}>重点关注</button></div>
          </div>
        </div>
      </section>

      <section className="card list">
        <div className="ch">航次明细<span className="cnt">{data?.total ?? 0} 条</span><span className="sp" /></div>
        <Tabs value={curTab} onChange={(t) => { setTab(t); setPage(1); }} items={TABS.map(([k, , ]) => [k, k, k === '全部' ? data?.counts.biz.all : data?.counts.biz[TABS.find((t) => t[0] === k)![1]!]] as [string, string, number | undefined])} />
        {isLoading ? <Loading /> : error ? <ErrorBox error={error} onRetry={refetch} /> : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>航次编号</th><th>业务类型</th><th>船名</th><th>航线</th><th style={{ textAlign: 'right' }}>总货量（吨）</th>
                  <th>本港侧日期 <Info text="本港侧：装港为本港取装港时间，否则取卸港时间。有实际时间显示实际，否则显示计划。" /></th>
                  <th>预计到达 <Info text="当前 ETA（卸港）。已抵卸港后不再显示。" /></th><th>状态</th><th>业务员</th><th>标记</th></tr></thead>
                <tbody>
                  {data?.items.length ? data.items.map((v) => (
                    <tr key={v.id} className="click" onClick={() => nav('/voyages/' + v.id)}>
                      <td className="nw"><b>{v.id}</b>{v.no && <span className="sub2">船次号 {v.no}</span>}</td>
                      <td className="nw">{bizShort(v.biz)}</td>
                      <td className="nw"><span className="who">{v.vessel || '待宣船'}</span></td>
                      <td className="nw">{route(v)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(v.tons)}{v.pooled && <span className="sub2">拼船</span>}</td>
                      <td><span className="nw">{v.localAct ? <><b>{mdh(v.localAct)}</b> <span className="mut">实际</span></> : <>{md(v.localPlan)} <span className="mut">计划</span></>}</span><span className="sub2">{v.side === '装' ? '装港侧' : '卸港侧'}</span></td>
                      <td className="nw">{v.eta && !v.localAct && v.side === '卸' ? mdh(v.eta) : '—'}</td>
                      <td><StatusTag s={v.status} /></td>
                      <td className="nw"><span className="who" style={{ fontWeight: 400 }}>{v.owner}</span><span className="sub2">{v.dept}</span></td>
                      <td>{marks(v)}</td>
                    </tr>
                  )) : <tr><td colSpan={10}><Empty>没有符合条件的航次</Empty></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="cards">
              {data?.items.map((v) => (
                <a key={v.id} className="vc" onClick={() => nav('/voyages/' + v.id)}>
                  <div className="r1"><b>{v.vessel || '待宣船'}</b><StatusTag s={v.status} /></div>
                  <div className="r2">{route(v)} · {fmt(v.tons)} 吨</div>
                  <div className="r3"><span>{v.id}</span><span>{v.owner}</span><span>{v.localAct ? '实际 ' + mdh(v.localAct) : '计划 ' + md(v.localPlan)}</span></div>
                </a>
              ))}
            </div>
            <Pager page={data?.page ?? 1} total={data?.total ?? 0} size={PAGE} onPage={setPage} />
          </>
        )}
      </section>

      <NewVoyage open={showNew} onClose={() => setShowNew(false)} onDone={(id) => nav('/voyages/' + id)} />
    </div>
  );
}

function NewVoyage({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const { data: ports } = usePorts(), zh = usePortName();
  const local = ports?.find((p) => p.isLocal)?.en ?? 'BAHODOPI';
  const [biz, setBiz] = useState<string>(BIZ_TYPES[0]), [load, setLoad] = useState(''), [disch, setDisch] = useState(''), [tons, setTons] = useState('50000');
  const prod = biz === '成品销售船';
  const ld = load || (prod ? local : ports?.find((p) => !p.isLocal)?.en ?? ''), ds = disch || (prod ? ports?.find((p) => !p.isLocal)?.en ?? '' : local);
  const create = useWrite((b: { biz: string; load: string; disch: string; tons: number }, key) =>
    api.createVoyage({ biz: b.biz, load: b.load, disch: b.disch, cargo: [{ name: '（待补充）', tons: b.tons }] }, key), [['voyages']]);
  const options = useMemo(() => (ports ?? []).filter((p) => p.status === '启用'), [ports]);
  const submit = () => {
    if (ld === ds) return toast.error('装港和卸港不能相同');
    if (!(Number(tons) > 0)) return toast.error('请填写预计货量');
    create.mutate({ biz, load: ld, disch: ds, tons: Number(tons) }, { onSuccess: (r: any) => { onClose(); onDone(r.voyage.id); } });
  };
  return (
    <Modal title="新建航次" open={open} onClose={onClose} width={520}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={create.isPending} onClick={submit}>创建并进入详情</button></>}>
      <div className="field"><label>业务类型</label><div className="seg">{BIZ_TYPES.map((b) => <button key={b} className={b === biz ? 'on' : ''} onClick={() => { setBiz(b); setLoad(''); setDisch(''); }}>{b}</button>)}</div></div>
      <div className="row2">
        <div className="field"><label>装港</label><select className="inp" value={ld} onChange={(e) => setLoad(e.target.value)}>{options.map((p) => <option key={p.en} value={p.en}>{zh(p.en)}</option>)}</select></div>
        <div className="field"><label>卸港</label><select className="inp" value={ds} onChange={(e) => setDisch(e.target.value)}>{options.map((p) => <option key={p.en} value={p.en}>{zh(p.en)}</option>)}</select></div>
      </div>
      <div className="field"><label>预计货量（吨）</label><input className="inp" type="number" value={tons} onChange={(e) => setTons(e.target.value)} /></div>
      <div className="hint">船舶可以先空着，宣船后再关联；创建后在详情页补货物明细和时间节点。负责业务员默认是你。</div>
    </Modal>
  );
}
