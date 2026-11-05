import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, useBerths, useMe, usePorts, useVessels, useVoyage, useWrite } from '../../ssps/api';
import { daysBetween, fmt, md } from '../../ssps/format';
import { usePortName } from '../../ssps/hooks';
import { Empty, ErrorBox, Info, Loading, Modal, StatusTag } from '../../ssps/ui';
import { ETA_BASIS_LIST, FLAG_LIST, LOCAL_PORT, type CargoLineRow, type VoyageDetail, type VoyageFull } from '@shared/api.interface';
import './p05.css';

const CHAIN: Array<[keyof VoyageFull, string]> = [['actLoadArr', '实际抵装港'], ['loadBerth', '装港靠泊'], ['actLoadDep', '实际离装港'], ['actDischArr', '实际抵卸港'], ['dischBerth', '卸港靠泊'], ['dischDep', '卸港离港']];
const OPS: Array<[string, Array<[string, string, 'text' | 'num' | 'date' | 'bool' | 'textarea']>, string?]> = [
  ['条款与计划', [['terms', '卸货条款', 'text'], ['rate', '卸率（吨/天）', 'num'], ['allowDays', '允许卸货天数', 'num'], ['turn', 'TURN TIME（小时）', 'num']], '卸货条款为 CQD（按港口习惯尽快装卸）时没有固定卸率，卸率留空。'],
  ['水尺与运量', [['gauge', '卸港水尺吨位（吨）', 'num'], ['g1', '水尺 1（分钟）', 'num'], ['g2', '水尺 2（分钟）', 'num'], ['g3', '水尺 3（分钟）', 'num'], ['truck', '汽运量（吨）', 'num'], ['belt', '管带机运量（吨）', 'num'], ['weigh', '过磅重量（吨）', 'num'], ['other', '其他部门运量（吨）', 'num'], ['carTurn', '倒运车数（车）', 'num'], ['x1Cars', 'X1 管带机车数（车）', 'num'], ['crossTruck', '跨月船汽运预估（吨）', 'num'], ['crossBelt', '跨月船管带机预估（吨）', 'num']], '卸港水尺吨位是按船的吃水推算的实际载货量（吨）；水尺 1–3 记每次水尺测量的耗时（分钟）。'],
  ['管带机与交接', [['beltOff3', '3# 管带机未运行（小时）', 'num'], ['beltOff4', '4# 管带机未运行（小时）', 'num'], ['sendDay', '交接发出日', 'date'], ['backDay', '交接签回日', 'date'], ['noHandover', '德天不用交接', 'bool'], ['rain', '小雨保函', 'bool'], ['issue', '影响卸船因素 / 异常反馈', 'textarea']]],
];
const MONEY: Array<[string, string, 'num' | 'cur']> = [['demRate', '滞期费率', 'num'], ['demCur', '币种', 'cur'], ['demUsd', '滞期费 / 速遣费（USD）', 'num'], ['fx', '汇率', 'num'], ['portUnit', '港务费单价', 'num'], ['portFee', '港务费（USD）', 'num'], ['loadFee', '装卸费（USD）', 'num']];
const ATTRS = ['内贸', '外贸', '雅加达物资', '国内物资', '本地', '国际'];
const BIG = ['原料', '燃料', '辅料', '成品', '工程辅料'];
const UNITS = ['DSI', 'DCI', 'DXI', '金瑞'];

const toL = (s?: string | null) => (s ? s.replace(' ', 'T').slice(0, 16) : '');
const fromL = (s: string) => (s ? s.replace('T', ' ') : '');
const dts = (s?: string | null) => (s ? s.slice(5, 16).replace('-', '/') : '—');
const Dash = () => <span className="mut">—</span>;

/** 一格「标签 + 值」，focus 时高亮（P09 数据质量直达） */
const Item = ({ k, label, focus, children }: { k: string; label: ReactNode; focus: string; children: ReactNode }) => (
  <div className={'it' + (focus === k ? ' hl' : '')} data-f={k}><div className="k">{label}</div><div className="v">{children}</div></div>
);

export default function VoyageDetailPage() {
  const { id = '' } = useParams(), [sp] = useSearchParams();
  const { data, isLoading, error, refetch } = useVoyage(id);
  const { data: me } = useMe(), { data: vessels } = useVessels(), { data: berths } = useBerths(), { data: ports } = usePorts(), zh = usePortName();
  const [tab, setTab] = useState(sp.get('tab') || 'base');
  const [edit, setEdit] = useState({ base: false, ops: false, money: false, sales: false });
  const [modal, setModal] = useState<null | 'node' | 'eta' | 'flags' | 'gauge' | { cargo: CargoLineRow | null }>(null);
  const focus = sp.get('focus') || '';
  const refresh = [['voyage', id], ['voyages']];

  useEffect(() => {
    if (!data) return;
    const act = sp.get('act');
    if (act === 'node' && data.can.edit) setModal('node'); else if (act === 'eta' && data.can.edit) setModal('eta'); else if (act === 'gauge' && data.can.ops) setModal('gauge');
  }, [data?.voyage.id]);            // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focus) document.querySelector(`[data-f="${focus}"]`)?.scrollIntoView({ block: 'center' }); }, [focus, tab, data?.voyage.id]);

  const star = useWrite((on: boolean, key) => api.patchVoyage(id, { focus: on }, key), [refresh[0], refresh[1]]);
  if (isLoading) return <Loading />;
  if (error || !data) return <><Link className="back" to="/voyages">← 航次列表</Link><ErrorBox error={error ?? new Error('没有找到航次 ' + id)} onRetry={refetch} /></>;

  const { voyage: v, cargo, can } = data, bulk = v.biz === '大宗采购船', prod = v.biz === '成品销售船', spare = v.biz === '物资备件船';
  const side = v.load === LOCAL_PORT ? '装' : '卸', total = cargo.reduce((a, c) => a + (c.tons || 0), 0), pooled = cargo.length >= 2;
  const mmsi = v.vessel ? vessels?.find((x) => x.name === v.vessel)?.mmsi ?? '' : '';
  const today = me?.today ?? '';
  const staleDays = v.etaUpdated && today ? Math.round((Date.parse(today) - Date.parse(v.etaUpdated.slice(0, 10))) / 86400000) : 0;
  const etaStale = !!(v.eta && !v.actDischArr && v.etaUpdated && staleDays > 3);
  const missing = !!(v.actDischArr && !v.actLoadDep && !v.flags.includes('取消'));
  const noTip = v.readonly ? '历史副本是只读的，不能修改' : '只有负责业务员、本部门主管和系统管理员能修改这条航次';
  const arrived = ['卸港等泊', '卸港卸货', '已结束'].includes(v.status);
  const tabs: Array<[string, ReactNode]> = [['base', '基本信息'], ['cargo', <>货物明细 <small>{cargo.length}</small></>], ...(spare ? [] : [[('ext'), bulk ? '卸船结算' : '销售扩展'] as [string, ReactNode]]), ['eta', <>ETA 修订历史 <small>{data.etaRevisions.length}</small></>], ['log', <>变更日志 <small>{data.changeLog.length}</small></>]];
  const curTab = tabs.find((t) => t[0] === tab) ? tab : 'base';
  const leaveEdit = () => setEdit({ base: false, ops: false, money: false, sales: false });

  const act = (label: string, enabled: boolean, tip: string, fn: () => void, primary = false) => (
    <button className={'btn' + (primary ? ' primary' : '')} disabled={!enabled} title={enabled ? undefined : tip} onClick={fn}>{label}</button>
  );

  return (
    <div className="pg-p05">
      <Link className="back" to="/voyages">← 航次列表</Link>
      <section className="card vh">
        <div className="l1">
          <h1>{v.vessel || '待宣船'}</h1><StatusTag s={v.status} />
          {v.vessel && (mmsi ? <button className="ship" onClick={() => { navigator.clipboard?.writeText(mmsi); window.open('https://www.shipxy.com/', '_blank'); toast.success('已复制 MMSI ' + mmsi + '，到船讯网搜索船位'); }}>查看船位（船讯网）↗</button> : <span className="tag red">缺 MMSI</span>)}
          {v.flags.filter((f) => f !== '取消').map((f) => <span key={f} className="tag amber">{f}</span>)}
          {v.readonly && <span className="tag gray">历史只读</span>}
          <button className={'star' + (v.focus ? ' on' : '')} title="重点关注" onClick={() => (can.edit ? star.mutate(!v.focus) : toast.error('没有修改权限'))}>★</button>
        </div>
        <div className="l2">
          <span><em>航次</em>{v.id}</span><span><em>类型</em>{v.biz}{v.no ? ' · ' + v.no : ''}</span><span><em>航线</em>{zh(v.load)} → {zh(v.disch)}</span>
          <span><em>总货量</em>{fmt(total)} 吨{pooled ? '（拼船）' : ''}</span><span><em>业务员</em>{v.owner} · {v.dept}</span>
        </div>
        {v.readonly && <div className="banner info">这是从历史副本迁入的记录，应用内不能修改。</div>}
        {missing && <div className="banner err"><span>这条航次已抵卸港，但<b>缺「实际离装港」</b>，不能计入航程样本。</span>{can.edit && <button className="btn primary" onClick={() => setModal('node')}>去补录</button>}</div>}
        {etaStale && <div className="banner warn"><span>ETA 已 {staleDays} 天没有更新（超过 3 天），请核对船位后修订。</span>{can.edit && <button className="btn" onClick={() => setModal('eta')}>修订 ETA</button>}</div>}
        <div className="acts">
          {act('登记节点', can.edit, noTip, () => setModal('node'), true)}
          {act('修订 ETA', can.edit && !v.actDischArr && !!v.vessel, !can.edit ? noTip : '只有已关联船舶、尚未抵卸港的航次才需要修订 ETA', () => setModal('eta'))}
          {act('编辑基本信息', can.edit, noTip, () => { setTab('base'); setEdit({ ...edit, base: true }); })}
          {act('异常标记', can.edit, noTip, () => setModal('flags'))}
          {bulk && act('登记水尺', can.ops && arrived, !can.ops ? '没有修改作业数据的权限' : '船抵卸港后才能登记水尺', () => setModal('gauge'))}
          <span className="sp" />
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><h2>时间轴 <Info text="每个节点显示计划和实际时间；实际晚于计划标红。状态就是已填的最靠后一个节点所对应的阶段。" /></h2><span className="muted nw" style={{ fontSize: 12 }}>状态：{v.status}</span></div>
        <Timeline v={v} prod={prod} bulk={bulk} />
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="tabs2">{tabs.map(([k, label]) => <button key={k} className={k === curTab ? 'on' : ''} onClick={() => { setTab(k); leaveEdit(); }}>{label}</button>)}</div>
        <div>
          {curTab === 'base' && <BaseTab data={data} side={side} total={total} pooled={pooled} mmsi={mmsi} focus={focus} editing={edit.base} setEditing={(b) => setEdit({ ...edit, base: b })} vessels={(vessels ?? []).map((x) => x.name)} portList={(ports ?? []).map((p) => p.en)} berthCodes={(berths ?? []).map((b) => b.code)} zh={zh} etaStale={etaStale} />}
          {curTab === 'cargo' && <CargoTab data={data} bulk={bulk} prod={prod} onEdit={(c) => setModal({ cargo: c })} />}
          {curTab === 'ext' && (prod ? <SalesTab data={data} editing={edit.sales} setEditing={(b) => setEdit({ ...edit, sales: b })} focus={focus} /> : <SettleTab data={data} arrived={arrived} edit={edit} setEdit={setEdit} focus={focus} onGauge={() => setModal('gauge')} />)}
          {curTab === 'eta' && <EtaTab data={data} />}
          {curTab === 'log' && <LogTab data={data} />}
        </div>
      </section>

      <NodeModal open={modal === 'node'} onClose={() => setModal(null)} v={v} prod={prod} today={today} />
      <EtaModal open={modal === 'eta'} onClose={() => setModal(null)} v={v} today={today} />
      <FlagsModal open={modal === 'flags'} onClose={() => setModal(null)} v={v} />
      <GaugeModal open={modal === 'gauge'} onClose={() => setModal(null)} id={v.id} settle={data.settlement} />
      <CargoModal open={typeof modal === 'object' && modal !== null} cur={typeof modal === 'object' && modal ? modal.cargo : null} onClose={() => setModal(null)} id={v.id} bulk={bulk} prod={prod} />
    </div>
  );
}

// ---------------- 时间轴 ----------------
function Timeline({ v, prod, bulk }: { v: VoyageFull; prod: boolean; bulk: boolean }) {
  const late = (plan?: string | null, act?: string | null) => {
    const x = plan && act ? daysBetween(plan, act) : null;
    if (x == null) return null;
    return x > 0.04 ? <span className="late">晚 {Math.round(x * 10) / 10} 天</span> : x < -0.04 ? <span className="early">早 {Math.round(-x * 10) / 10} 天</span> : null;
  };
  const win = v.planDischS ? md(v.planDischS) + '–' + md(v.planDischE) : '—';
  type TNode = { lb: string; pl: string; ac?: string | null; lt?: ReactNode; done: boolean; skip?: boolean; skipTxt?: string; eta?: string | null };
  const N: TNode[] = [];
  if (prod) N.push({ lb: '受载期', pl: v.laycanS ? md(v.laycanS) + '–' + md(v.laycanE) : '—', ac: null, done: !!v.actLoadArr });
  N.push({ lb: '抵装港', pl: md(v.planLoadArr), ac: v.actLoadArr, lt: late(prod ? v.laycanE : v.planLoadArr, v.actLoadArr), done: !!v.actLoadArr });
  N.push({ lb: '装港靠泊', pl: '—', ac: v.loadBerth, done: !!v.loadBerth, skip: !v.loadBerth && bulk, skipTxt: '大宗不记录' });
  N.push({ lb: '离装港', pl: md(v.planLoadDep), ac: v.actLoadDep, lt: late(v.planLoadDep, v.actLoadDep), done: !!v.actLoadDep });
  N.push({ lb: '抵卸港', pl: win, ac: v.actDischArr, lt: late(v.planDischE, v.actDischArr), done: !!v.actDischArr, eta: v.eta && !v.actDischArr ? v.eta : null });
  N.push({ lb: '卸港靠泊', pl: '—', ac: v.dischBerth, done: !!v.dischBerth });
  N.push({ lb: '卸港离港', pl: '—', ac: v.dischDep, done: !!v.dischDep, skip: prod && !v.dischDep, skipTxt: '成品无此列' });
  let last = -1; N.forEach((n, i) => { if (n.done) last = i; });
  return (
    <div className="tlw"><div className="tl" style={{ gridTemplateColumns: `repeat(${N.length},minmax(0,1fr))` }}>
      {N.map((n, i) => (
        <div key={n.lb} className={'tn' + (n.done ? ' done' : '') + (i === last && v.status !== '已结束' ? ' cur' : '')}>
          <div className="dot">{n.done ? '✓' : i + 1}</div><div className="lb">{n.lb}</div><div className="pl">计划 {n.pl}</div>
          <div className="ac">{n.ac ? <>实际 <b>{dts(n.ac)}</b>{n.lt}</> : n.skip ? <span className="none">{n.skipTxt}</span> : n.eta ? <>预计 <b>{dts(n.eta)}</b></> : <span className="none">实际 —</span>}</div>
        </div>
      ))}
    </div></div>
  );
}

// ---------------- 基本信息 ----------------
function BaseTab({ data, side, total, pooled, mmsi, focus, editing, setEditing, vessels, portList, berthCodes, zh, etaStale }: {
  data: VoyageDetail; side: string; total: number; pooled: boolean; mmsi: string; focus: string; editing: boolean; setEditing: (b: boolean) => void;
  vessels: string[]; portList: string[]; berthCodes: string[]; zh: (e?: string | null) => string; etaStale: boolean;
}) {
  const v = data.voyage, prod = v.biz === '成品销售船', can = data.can.edit;
  const [d, setD] = useState<Record<string, any>>({});
  useEffect(() => { if (editing) setD({ attr: v.attr, no: v.no, carrier: v.carrier, shipVoy: v.shipVoy, disch2: v.disch2 ?? '', remark: v.remark, vessel: v.vessel ?? '', focus: v.focus, planBerths: v.planBerths.join('、'),
    laycanS: toL(v.laycanS), laycanE: toL(v.laycanE), planLoadArr: toL(v.planLoadArr), planLoadDep: toL(v.planLoadDep), planDischS: toL(v.planDischS), planDischE: toL(v.planDischE) }); }, [editing, v]);
  const save = useWrite((patch: Record<string, unknown>, key) => api.patchVoyage(v.id, patch, key), [['voyage', v.id], ['voyages']], '已保存，状态已按时间节点重新推导');
  const send = () => {
    const patch: Record<string, unknown> = {};
    for (const k of ['attr', 'no', 'carrier', 'shipVoy', 'remark']) if ((d[k] ?? '') !== (v as any)[k]) patch[k] = d[k];
    if ((d.disch2 || null) !== v.disch2) patch.disch2 = d.disch2 || null;
    if ((d.vessel || null) !== v.vessel) patch.vessel = d.vessel || null;
    if (d.focus !== v.focus) patch.focus = d.focus;
    for (const k of ['laycanS', 'laycanE', 'planLoadArr', 'planLoadDep', 'planDischS', 'planDischE']) if (d[k] !== toL((v as any)[k])) patch[k] = fromL(d[k]) || null;
    const pb: string[] = String(d.planBerths).split(/[、,，\s/]+/).filter(Boolean).map((x) => x.toUpperCase());
    if (pb.join('、') !== v.planBerths.join('、')) {
      const bad = pb.find((b) => !berthCodes.includes(b));
      if (bad) return toast.error('泊位「' + bad + '」不在 23 个德信泊位内，表外泊位不计入');
      patch.planBerths = pb;
    }
    if (d.planDischS && d.planDischE && d.planDischE < d.planDischS) return toast.error('窗口止不能早于窗口始');
    if (d.laycanS && d.laycanE && d.laycanE < d.laycanS) return toast.error('受载期止不能早于受载期始');
    if (!Object.keys(patch).length) { toast('没有修改'); return setEditing(false); }
    save.mutate(patch, { onSuccess: () => setEditing(false) });
  };
  const E = editing && can, set = (k: string, val: unknown) => setD({ ...d, [k]: val });
  const txt = (k: string) => <input className="inp" value={d[k] ?? ''} onChange={(e) => set(k, e.target.value)} />;
  const dtin = (k: string) => <input className="inp" type="datetime-local" value={d[k] ?? ''} onChange={(e) => set(k, e.target.value)} />;
  const days = (a?: string | null, b?: string | null) => { const x = daysBetween(a, b); return x != null ? x : '—'; };
  const fx = <span className="fx">公式</span>;
  const F = (k: string, label: ReactNode, view: ReactNode, ed?: ReactNode) => <Item k={k} label={label} focus={focus}>{E && ed ? ed : view}</Item>;
  const full = (s?: string | null) => s || '—';

  return (
    <>
      <div className="sec"><h3>标识与航线</h3><div className="kvg">
        {F('id', '航次编号', v.id)}{F('biz', '业务类型', v.biz)}
        {F('attr', <>业务属性<Info text="业务属性的枚举（内贸 / 外贸 / 雅加达物资 / 国内物资 / 本地 / 国际）是否合并为一套，待确认。" /></>, v.attr || <Dash />, <select className="inp" value={d.attr ?? ''} onChange={(e) => set('attr', e.target.value)}>{ATTRS.map((o) => <option key={o}>{o}</option>)}</select>)}
        {F('no', '船次号', v.no || <Dash />, txt('no'))}
        {F('vessel', '船舶', v.vessel ? <b>{v.vessel}</b> : <span className="mut">待宣船（可空）</span>, <select className="inp" value={d.vessel ?? ''} onChange={(e) => set('vessel', e.target.value)}><option value="">（待宣船）</option>{vessels.map((n) => <option key={n}>{n}</option>)}</select>)}
        {F('mmsi', <>MMSI<Info text="MMSI 为必填（一期手工更新 ETA，船讯网用 MMSI 定位）。缺 MMSI 会进入数据质量清单。" /></>, v.vessel ? (mmsi || <span className="lock" style={{ color: '#cf1322' }}>缺 MMSI，请到主数据补录</span>) : <Dash />)}
        {F('carrier', '承运方', v.carrier || <Dash />, txt('carrier'))}{F('shipVoy', '船方航次号', v.shipVoy || <Dash />, txt('shipVoy'))}
        {F('load', '装港', zh(v.load))}{F('disch', '卸港', zh(v.disch))}
        {F('disch2', '第二卸港', v.disch2 ? zh(v.disch2) : <Dash />, <select className="inp" value={d.disch2 ?? ''} onChange={(e) => set('disch2', e.target.value)}><option value="">（无）</option>{portList.map((p) => <option key={p} value={p}>{zh(p)}</option>)}</select>)}
        {F('finalPort', '最终目的港', v.finalPort ? zh(v.finalPort) : <Dash />)}
        {F('side', <>本港侧<Info text="装港是本港取「装」，否则取「卸」。决定泊位余量和同期船数取哪一端的时间。" /></>, <>{side}港 {fx}</>)}
      </div></div>

      <div className="sec"><h3>时间节点<Info text="计划类时间可以在「编辑」里改；实际时间节点只能用「登记节点」录入，预计到达只能用「修订 ETA」，都会留痕。" /></h3><div className="kvg">
        {prod && <>{F('laycanS', '受载期始', full(v.laycanS), dtin('laycanS'))}{F('laycanE', '受载期止', full(v.laycanE), dtin('laycanE'))}</>}
        {F('planLoadArr', '计划抵装港', full(v.planLoadArr), dtin('planLoadArr'))}{F('actLoadArr', '实际抵装港', full(v.actLoadArr))}{F('loadBerth', '装港靠泊', full(v.loadBerth))}
        {F('planLoadDep', '计划离装港', full(v.planLoadDep), dtin('planLoadDep'))}
        {F('actLoadDep', <>实际离装港<Info text="状态进入「航行中」即必填。这是学习航程的关键样本。" /></>, v.actLoadDep ? v.actLoadDep : v.actDischArr ? <span className="lock" style={{ color: '#cf1322' }}>缺失，待补</span> : '—')}
        {!prod && <>{F('planDischS', '计划抵卸港窗口始', full(v.planDischS), dtin('planDischS'))}{F('planDischE', '计划抵卸港窗口止', full(v.planDischE), dtin('planDischE'))}</>}
        {F('eta', '当前 ETA（卸港）', v.eta ? <>{v.eta}{etaStale && <> <span className="tag red">已超 3 天未更新</span></>}</> : '—')}
        {F('actDischArr', '实际抵卸港', full(v.actDischArr))}{F('dischBerth', '卸港靠泊', full(v.dischBerth))}{F('dischDep', '卸港离港', full(v.dischDep))}
      </div></div>

      <div className="sec"><h3>状态、统计与管理</h3><div className="kvg">
        {F('status', <>船舶状态<Info text="由时间节点自动推导，8 个状态互斥，不能手工改。人工只能打「异常标记」。" /></>, <StatusTag s={v.status} />)}
        {F('flags', '异常标记', v.flags.length ? v.flags.map((f) => <span key={f} className="tag amber" style={{ marginRight: 4 }}>{f}</span>) : <span className="mut">无</span>)}
        {F('overdue', '装港逾期', <>{prod ? (v.laycanE && v.actLoadArr && v.actLoadArr > v.laycanE ? <span className="tag red">逾期</span> : '否') : '—'} {fx}</>)}
        {F('voyageDays', <>实际航程（天）<Info text="实际抵卸港 − 实际离装港，是航程规则的学习样本。" /></>, <>{days(v.actLoadDep, v.actDischArr)} {fx}</>)}
        {F('waitDays', '本港等泊（天）', <>{side === '卸' ? days(v.actDischArr, v.dischBerth) : days(v.actLoadArr, v.loadBerth)} {fx}</>)}
        {F('workDays', '本港作业（天）', <>{side === '卸' ? days(v.dischBerth, v.dischDep) : days(v.loadBerth, v.actLoadDep)} {fx}</>)}
        {F('planBerths', '计划泊位', v.planBerths.join('、') || <Dash />, <input className="inp" value={d.planBerths ?? ''} placeholder="如 F1、L4" onChange={(e) => set('planBerths', e.target.value)} />)}
        {F('actBerths', '实际泊位', v.actBerths.join('、') || <Dash />)}
        {F('total', '总货量（吨）', <>{fmt(total)} <span className="fx">汇总明细</span></>)}{F('pooled', '拼船', <>{pooled ? '是' : '否'} {fx}</>)}
        {F('owner', '负责业务员', v.owner)}{F('dept', '所属部门', v.dept)}
        {F('focus', '重点关注', v.focus ? '是 ★' : '否', <label><input type="checkbox" checked={!!d.focus} onChange={(e) => set('focus', e.target.checked)} /> 重点关注</label>)}
        {F('review', '审核状态', v.review || <Dash />)}{F('source', '数据来源', v.source)}{F('readonly', '历史只读', v.readonly ? '是' : '否')}
        {F('remark', '备注', v.remark || <Dash />, <textarea className="inp" value={d.remark ?? ''} onChange={(e) => set('remark', e.target.value)} />)}
      </div></div>

      {can && (
        <div className="bar2"><span className="note2">{editing ? '编辑中：只能改计划类时间和基础信息。' : '要改计划时间、船舶关联、备注等，点「编辑」。'}</span>
          <span style={{ display: 'flex', gap: 8 }}>{editing ? <><button className="btn" onClick={() => setEditing(false)}>取消</button><button className="btn primary" disabled={save.isPending} onClick={send}>保存</button></> : <button className="btn" onClick={() => setEditing(true)}>编辑</button>}</span></div>
      )}
    </>
  );
}

// ---------------- 货物明细 ----------------
function CargoTab({ data, bulk, prod, onEdit }: { data: VoyageDetail; bulk: boolean; prod: boolean; onEdit: (c: CargoLineRow | null) => void }) {
  const { voyage: v, cargo: L, can } = data, tot = L.reduce((a, c) => a + c.tons, 0);
  const del = useWrite((no: string, key) => api.deleteCargo(v.id, no, key), [['voyage', v.id], ['voyages']], '已删除');
  const [ask, setAsk] = useState<CargoLineRow | null>(null);
  return (
    <>
      <Modal title="删除货物明细" open={!!ask} onClose={() => setAsk(null)} width={420} footer={<><button className="btn" onClick={() => setAsk(null)}>取消</button><button className="btn primary" onClick={() => { del.mutate(ask!.no); setAsk(null); }}>确认删除</button></>}>删除合同 {ask?.contract || '—'}（{fmt(ask?.tons)} 吨）这一行？删除会记入变更日志。</Modal>
      <div className="tb-wrap"><table className="tbl"><thead><tr><th>合同号</th><th>物资大类</th><th>物资类别</th><th>货物名称</th>{bulk && <><th>使用单位</th><th>归属事业部</th></>}<th>{prod ? '客户' : '供应商'}</th><th style={{ textAlign: 'right' }}>预计装船重量（吨）</th><th style={{ textAlign: 'right' }}>装港重量（吨）</th><th>溢短装</th><th>合同执行人员</th>{can.edit && <th>操作</th>}</tr></thead>
        <tbody>{L.length ? L.map((c) => (
          <tr key={c.no}><td className="nw"><b>{c.contract || '—'}</b>{c.ea && <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>EA {c.ea}</span>}</td>
            <td className="nw">{c.big || '—'}</td><td className="nw">{c.kind || '—'}</td><td className="nw">{c.name || '—'}</td>
            {bulk && <><td className="nw">{c.unit || '—'}</td><td className="nw">{c.dept2 || '—'}</td></>}
            <td className="nw">{c.party || '—'}</td><td style={{ textAlign: 'right' }}>{fmt(c.tons)}</td><td style={{ textAlign: 'right' }}>{fmt(c.loadTons)}</td><td className="nw">{c.over || '—'}</td><td className="nw">{c.exec || '—'}</td>
            {can.edit && <td className="nw"><button className="btn ghost" onClick={() => onEdit(c)}>编辑</button><button className="btn ghost" style={{ color: '#cf1322' }} onClick={() => { if (L.length <= 1) return toast.error('至少保留一行货物明细'); setAsk(c); }}>删除</button></td>}</tr>
        )) : <tr><td colSpan={11}><Empty>没有货物明细</Empty></td></tr>}</tbody></table></div>
      <div className="sumline"><span>共 <b>{L.length}</b> 行</span><span>总货量 <b>{fmt(tot)}</b> 吨</span><span>拼船：<b>{L.length >= 2 ? '是' : '否'}</b><Info text="货物明细有 2 行及以上就是拼船。" /></span></div>
      {can.edit && <div className="bar2"><span className="note2">一份合同或一类货物一行；多个合同的船要拆成多行。</span><button className="btn primary" onClick={() => onEdit(null)}>新增明细</button></div>}
    </>
  );
}

function CargoModal({ open, cur, onClose, id, bulk, prod }: { open: boolean; cur: CargoLineRow | null; onClose: () => void; id: string; bulk: boolean; prod: boolean }) {
  const [f, setF] = useState({ contract: '', big: BIG[0], name: '', party: '', tons: '', unit: UNITS[0] });
  useEffect(() => { if (open) setF({ contract: cur?.contract ?? '', big: cur?.big || BIG[0], name: cur?.name ?? '', party: cur?.party ?? '', tons: cur ? String(cur.tons) : '', unit: cur?.unit || UNITS[0] }); }, [open, cur]);
  const save = useWrite((b: Record<string, unknown>, key) => (cur ? api.patchCargo(id, cur.no, b, key) : api.addCargo(id, b, key)), [['voyage', id], ['voyages']], '已保存');
  const submit = () => {
    const t = Number(f.tons);
    if (!f.contract.trim()) return toast.error('合同号必填');
    if (!(t > 0)) return toast.error('预计装船重量必填');
    save.mutate({ contract: f.contract.trim(), big: f.big, name: f.name.trim(), kind: f.name.trim(), party: f.party.trim(), tons: t, ...(bulk ? { unit: f.unit } : {}) }, { onSuccess: onClose });
  };
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  return (
    <Modal title={cur ? '编辑货物明细' : '新增货物明细'} open={open} onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending} onClick={submit}>保存</button></>}>
      <div className="row2"><div className="field"><div className="f-lab2">合同号</div><input className="inp" value={f.contract} onChange={(e) => set('contract', e.target.value)} /></div>
        <div className="field"><div className="f-lab2">物资大类</div><select className="inp" value={f.big} onChange={(e) => set('big', e.target.value)}>{BIG.map((b) => <option key={b}>{b}</option>)}</select></div></div>
      <div className="row2"><div className="field"><div className="f-lab2">货物名称</div><input className="inp" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field"><div className="f-lab2">{prod ? '客户' : '供应商'}</div><input className="inp" value={f.party} onChange={(e) => set('party', e.target.value)} /></div></div>
      <div className="row2"><div className="field"><div className="f-lab2">预计装船重量（吨）</div><input className="inp" type="number" value={f.tons} onChange={(e) => set('tons', e.target.value)} /></div>
        {bulk && <div className="field"><div className="f-lab2">使用单位</div><select className="inp" value={f.unit} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>}</div>
    </Modal>
  );
}

// ---------------- 卸船结算（大宗） ----------------
type SKind = 'text' | 'num' | 'date' | 'bool' | 'textarea' | 'cur';
function SettleTab({ data, arrived, edit, setEdit, focus, onGauge }: { data: VoyageDetail; arrived: boolean; edit: { base: boolean; ops: boolean; money: boolean; sales: boolean }; setEdit: (e: any) => void; focus: string; onGauge: () => void }) {
  const v = data.voyage, x = data.settlement, { can } = data;
  const [d, setD] = useState<Record<string, any>>({});
  const save = useWrite((b: Record<string, unknown>, key) => api.settlement(v.id, b, key), [['voyage', v.id]], '已保存，已记入变更日志');
  const fv = (t: SKind, val: any) => (val == null || val === '' ? <Dash /> : t === 'bool' ? (val ? '是' : '否') : t === 'num' ? fmt(val) : String(val));
  const input = (t: SKind, k: string) => t === 'bool' ? <label><input type="checkbox" checked={!!d[k]} onChange={(e) => setD({ ...d, [k]: e.target.checked })} /> 是</label>
    : t === 'textarea' ? <textarea className="inp" value={d[k] ?? ''} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    : t === 'cur' ? <select className="inp" value={d[k] ?? 'IDR'} onChange={(e) => setD({ ...d, [k]: e.target.value })}><option>IDR</option><option>USD</option></select>
    : <input className="inp" type={t === 'num' ? 'number' : t === 'date' ? 'date' : 'text'} step="any" value={d[k] ?? ''} onChange={(e) => setD({ ...d, [k]: e.target.value })} />;
  const begin = (group: 'ops' | 'money') => {
    const keys = group === 'ops' ? OPS.flatMap((g) => g[1].map((f) => f[0])) : MONEY.map((f) => f[0]);
    setD(Object.fromEntries(keys.map((k) => [k, (x as any)?.[k] ?? (typeof (x as any)?.[k] === 'boolean' ? false : '')]))); setEdit({ ...edit, [group]: true });
  };
  const submit = (group: 'ops' | 'money') => {
    const fields: Array<[string, string, SKind]> = group === 'ops' ? OPS.flatMap((g) => g[1]) : MONEY;
    const patch: Record<string, unknown> = {};
    for (const [k, label, t] of fields) {
      const old = (x as any)?.[k], raw = d[k];
      let nw: unknown;
      if (t === 'bool') nw = !!raw; else if (t === 'num') { if (raw === '' || raw == null) nw = null; else { nw = Number(raw); if (!((nw as number) >= 0)) return toast.error('「' + label + '」不能为负数'); } } else nw = raw === '' || raw == null ? null : String(raw).trim();
      if (String(old ?? '') !== String(nw ?? '') && !(t === 'bool' && !old && !nw)) patch[k] = nw;
    }
    if (d.sendDay && d.backDay && d.backDay < d.sendDay) return toast.error('交接签回日不能早于发出日');
    if (!Object.keys(patch).length) { toast('没有修改'); return setEdit({ ...edit, [group]: false }); }
    save.mutate(patch, { onSuccess: () => setEdit({ ...edit, [group]: false }) });
  };
  if (!x && !edit.ops) {
    return <div className="empty">{arrived ? '这条航次还没有登记卸船作业数据。' : '船抵卸港后才开始登记卸船作业数据（水尺、运量等）。'}{arrived && can.ops && <><br /><button className="btn primary" style={{ marginTop: 10 }} onClick={() => begin('ops')}>开始登记</button></>}</div>;
  }
  const eo = edit.ops && can.ops, em = edit.money && can.money, cell = (k: string, label: ReactNode, view: ReactNode, ed: ReactNode | null) => <Item key={k} k={k} label={label} focus={focus}>{ed ?? view}</Item>;
  return (
    <>
      {OPS.map(([name, fields, tip]) => (
        <div className="sec" key={name}><h3>{name}{tip && <Info text={tip} />}</h3><div className="kvg">{fields.map(([k, label, t]) => cell('s_' + k, label, fv(t, (x as any)?.[k]), eo ? input(t, k) : null))}</div></div>
      ))}
      <div className="bar2"><span className="note2">{can.ops ? (eo ? '编辑中：改完点保存，会记入变更日志。' : '大宗采购部和仓储物流部可以登记和修改作业数据。') : '你没有修改作业数据的权限。'}</span>
        {can.ops && <span style={{ display: 'flex', gap: 8 }}>{eo ? <><button className="btn" onClick={() => setEdit({ ...edit, ops: false })}>取消</button><button className="btn primary" disabled={save.isPending} onClick={() => submit('ops')}>保存作业数据</button></> : <><button className="btn" onClick={onGauge}>登记水尺</button><button className="btn" onClick={() => begin('ops')}>编辑作业数据</button></>}</span>}</div>
      {!can.seeMoney ? (
        <div className="sec"><h3>费用与结算<Info text="金额类字段按部门隔离：只有大宗采购部（及系统管理员）能看。" /></h3><div className="kvg">{MONEY.map((f) => <div className="it" key={f[0]}><div className="k">{f[1]}</div><div className="v"><span className="lock">无权限查看</span></div></div>)}</div></div>
      ) : (
        <>
          <div className="sec"><h3>费用与结算<Info text="金额类字段按部门隔离：只有大宗采购部（及系统管理员）能看和改。" /></h3><div className="kvg">
            {MONEY.map(([k, label, t]) => cell('m_' + k, label, <>{fv(t, (x as any)?.[k])}{k === 'demRate' && (x as any)?.demCur ? ' ' + (x as any).demCur + ' / 天' : ''}</>, em ? input(t, k) : null))}
          </div></div>
          {can.money && <div className="bar2"><span className="note2">{em ? '编辑中：金额只有大宗采购部能改。' : '费用结算只有大宗采购部能改。'}</span><span style={{ display: 'flex', gap: 8 }}>{em ? <><button className="btn" onClick={() => setEdit({ ...edit, money: false })}>取消</button><button className="btn primary" disabled={save.isPending} onClick={() => submit('money')}>保存费用结算</button></> : <button className="btn" onClick={() => begin('money')}>编辑费用结算</button>}</span></div>}
        </>
      )}
    </>
  );
}

function GaugeModal({ open, onClose, id, settle }: { open: boolean; onClose: () => void; id: string; settle: VoyageDetail['settlement'] }) {
  const KEYS: Array<[string, string]> = [['gauge', '卸港水尺吨位（吨）'], ['g1', '水尺 1（分钟）'], ['g2', '水尺 2（分钟）'], ['g3', '水尺 3（分钟）']];
  const [d, setD] = useState<Record<string, string>>({});
  useEffect(() => { if (open) setD(Object.fromEntries(KEYS.map(([k]) => [k, settle?.[k] == null ? '' : String(settle[k])]))); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useWrite((b: Record<string, number>, key) => api.settlement(id, b, key), [['voyage', id]], '水尺已登记，已记入变更日志');
  const submit = () => {
    const patch: Record<string, number> = {};
    for (const [k] of KEYS) { if (d[k] === '') continue; const n = Number(d[k]); if (!(n >= 0)) return toast.error('水尺数值不能为负'); if (settle?.[k] !== n) patch[k] = n; }
    if (!Object.keys(patch).length) return toast.error('没有填写或没有修改');
    save.mutate(patch, { onSuccess: onClose });
  };
  return (
    <Modal title="登记水尺" open={open} onClose={onClose} width={480} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending} onClick={submit}>保存</button></>}>
      <div className="note2" style={{ margin: '0 0 10px' }}>卸港后登记：卸港水尺吨位是按吃水推算的实际载货量（吨）；水尺 1–3 记每次测量的耗时（分钟）。保存后记入变更日志。</div>
      {KEYS.map(([k, l]) => <div className="field" key={k}><div className="f-lab2">{l}</div><input className="inp" type="number" step="any" value={d[k] ?? ''} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></div>)}
    </Modal>
  );
}

// ---------------- 销售扩展（成品） ----------------
function SalesTab({ data, editing, setEditing, focus }: { data: VoyageDetail; editing: boolean; setEditing: (b: boolean) => void; focus: string }) {
  const v = data.voyage, x = data.salesExt ?? { way: null, contract: null }, can = data.can.sales, E = editing && can;
  const [d, setD] = useState({ way: '', contract: '' });
  useEffect(() => { if (editing) setD({ way: x.way ?? '', contract: x.contract ?? '' }); }, [editing]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useWrite((b: Record<string, unknown>, key) => api.salesExt(v.id, b, key), [['voyage', v.id]], '已保存');
  const submit = () => {
    const patch: Record<string, unknown> = {};
    if ((x.way ?? '') !== d.way) patch.way = d.way; if ((x.contract ?? '') !== d.contract.trim()) patch.contract = d.contract.trim();
    if (!Object.keys(patch).length) return setEditing(false);
    save.mutate(patch, { onSuccess: () => setEditing(false) });
  };
  return (
    <>
      <div className="sec"><div className="kvg">
        <Item k="way" label="租船方式" focus={focus}>{E ? <select className="inp" value={d.way} onChange={(e) => setD({ ...d, way: e.target.value })}><option value="">（未选）</option><option>CFR</option><option>FOB</option></select> : x.way || <Dash />}</Item>
        <Item k="sc" label="海运合同号" focus={focus}>{E ? <input className="inp" value={d.contract} onChange={(e) => setD({ ...d, contract: e.target.value })} /> : x.contract || <Dash />}</Item>
      </div></div>
      {can && <div className="bar2"><span className="note2">商务海运部的业务员和主管可以修改。</span><span style={{ display: 'flex', gap: 8 }}>{E ? <><button className="btn" onClick={() => setEditing(false)}>取消</button><button className="btn primary" disabled={save.isPending} onClick={submit}>保存</button></> : <button className="btn" onClick={() => setEditing(true)}>编辑</button>}</span></div>}
    </>
  );
}

// ---------------- ETA 修订历史 / 变更日志 ----------------
function EtaTab({ data }: { data: VoyageDetail }) {
  const L = [...data.etaRevisions].sort((a, b) => b.at.localeCompare(a.at));
  return <div className="tb-wrap"><table className="tbl"><thead><tr><th>节点</th><th>旧值</th><th>新值</th><th>依据</th><th>修改人</th><th>时间</th></tr></thead><tbody>
    {L.length ? L.map((r, i) => <tr key={i}><td className="nw">{r.node}</td><td className="nw mut">{dts(r.old)}</td><td className="nw"><b>{dts(r.nw)}</b></td><td className="nw"><span className="tag gray">{r.basis}</span></td><td className="nw">{r.by}</td><td className="nw mut">{r.at}</td></tr>) : <tr><td colSpan={6}><Empty>还没有 ETA 修订记录</Empty></td></tr>}</tbody></table></div>;
}
function LogTab({ data }: { data: VoyageDetail }) {
  const show = (s?: string | null) => (s ? (/^\d{4}-\d\d-\d\d \d/.test(s) ? dts(s) : s) : '—');
  const L = [...data.changeLog].sort((a, b) => b.at.localeCompare(a.at));
  return <div className="tb-wrap"><table className="tbl"><thead><tr><th>字段</th><th>旧值</th><th>新值</th><th>修改人</th><th>时间</th></tr></thead><tbody>
    {L.length ? L.map((r, i) => <tr key={i}><td className="nw">{r.field}</td><td className="mut">{r.masked ? <span className="lock">金额已隐藏</span> : show(r.old)}</td><td>{r.masked ? <span className="lock">金额已隐藏</span> : <b>{show(r.nw)}</b>}</td><td className="nw">{r.by}</td><td className="nw mut">{r.at}</td></tr>) : <tr><td colSpan={5}><Empty>还没有变更记录</Empty></td></tr>}</tbody></table></div>;
}

// ---------------- 弹窗：登记节点 / 修订 ETA / 异常标记 ----------------
function nowLocal(today: string) { const t = new Date(), p = (n: number) => String(n).padStart(2, '0'); return (today || t.toISOString().slice(0, 10)) + 'T' + p(t.getHours()) + ':' + p(t.getMinutes()); }

function NodeModal({ open, onClose, v, prod, today }: { open: boolean; onClose: () => void; v: VoyageFull; prod: boolean; today: string }) {
  const keys = useMemo(() => (prod ? CHAIN.filter((c) => c[0] !== 'dischDep') : CHAIN), [prod]);
  const [k, setK] = useState<string>(''), [t, setT] = useState('');
  // 大宗不记录装港靠泊，默认跳过
  useEffect(() => { if (open) { setK((v.actDischArr && !v.actLoadDep ? 'actLoadDep' : (keys.find((c) => !v[c[0]] && !(v.biz === '大宗采购船' && c[0] === 'loadBerth')) ?? keys[0])[0]) as string); setT(nowLocal(today)); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useWrite((b: { field: string; value: string }, key) => api.milestone(v.id, b.field, b.value, key), [['voyage', v.id], ['voyages']], '已保存，状态已按时间节点重新推导');
  return (
    <Modal title="登记时间节点" open={open} onClose={onClose} width={480} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending} onClick={() => (t ? save.mutate({ field: k, value: fromL(t) }, { onSuccess: onClose }) : toast.error('请填写时间'))}>保存</button></>}>
      <div className="field"><div className="f-lab2">节点</div><select className="inp" value={k} onChange={(e) => setK(e.target.value)}>{keys.map(([f, l]) => <option key={f as string} value={f as string}>{l}{v[f] ? `（已有 ${dts(v[f] as string)}，将覆盖）` : ''}</option>)}</select></div>
      <div className="field"><div className="f-lab2">时间（IMIP 当地时间）</div><input className="inp" type="datetime-local" value={t} onChange={(e) => setT(e.target.value)} /></div>
      <div className="note2">后一节点的时间不能早于前一节点，否则保存会被拒绝。保存后状态按时间节点自动推导，并记入变更日志。</div>
    </Modal>
  );
}

function EtaModal({ open, onClose, v, today }: { open: boolean; onClose: () => void; v: VoyageFull; today: string }) {
  const [eta, setEta] = useState(''), [basis, setBasis] = useState('');
  useEffect(() => { if (open) { setEta(toL(v.eta) || nowLocal(today)); setBasis(''); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useWrite((b: { eta: string; basis: string }, key) => api.eta(v.id, b.eta, b.basis, key), [['voyage', v.id], ['voyages']], 'ETA 已修订并留痕');
  const submit = () => { if (!eta) return toast.error('请填写新的预计到达时间'); if (!basis) return toast.error('请选择依据：船讯网 / 船代 / 电话'); save.mutate({ eta: fromL(eta), basis }, { onSuccess: onClose }); };
  return (
    <Modal title="修订 ETA（卸港预计到达）" open={open} onClose={onClose} width={480} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending} onClick={submit}>保存修订</button></>}>
      <div className="note2" style={{ margin: '0 0 10px' }}>当前 ETA：<b>{dts(v.eta)}</b></div>
      <div className="field"><div className="f-lab2">新的预计到达时间</div><input className="inp" type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} /></div>
      <div className="field"><div className="f-lab2">依据（必填）</div><select className="inp" value={basis} onChange={(e) => setBasis(e.target.value)}><option value="">请选择</option>{ETA_BASIS_LIST.map((b) => <option key={b}>{b}</option>)}</select></div>
      <div className="note2">每次修订都会留痕（节点、旧值、新值、依据、修改人、时间），以后用来分析 ETA 偏差。</div>
    </Modal>
  );
}

function FlagsModal({ open, onClose, v }: { open: boolean; onClose: () => void; v: VoyageFull }) {
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { if (open) setSel(v.flags); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useWrite(async (_: null, key) => { for (const f of FLAG_LIST) if (sel.includes(f) !== v.flags.includes(f)) await api.flag(v.id, f, sel.includes(f), key + ':' + f); }, [['voyage', v.id], ['voyages']], '已保存');
  return (
    <Modal title="异常标记" open={open} onClose={onClose} width={440} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending} onClick={() => save.mutate(null, { onSuccess: onClose })}>保存</button></>}>
      <div style={{ display: 'grid', gap: 8 }}>{FLAG_LIST.map((f) => (
        <label key={f} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={sel.includes(f)} onChange={(e) => setSel(e.target.checked ? [...sel, f] : sel.filter((x) => x !== f))} /> {f}{f === '取消' && <span className="note2" style={{ margin: 0 }}>（取消的航次状态变为「已结束（取消）」，不进同期船数和泊位余量）</span>}</label>
      ))}</div>
      <div className="note2" style={{ marginTop: 10 }}>异常标记由人工打，不影响其他状态的推导；船舶状态仍由时间节点决定（取消除外）。</div>
    </Modal>
  );
}

