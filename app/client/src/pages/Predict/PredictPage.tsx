import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getApiErrorMessage, useBerths, useCalendar, useInventory, useMe, usePorts } from '../../ssps/api';
import { stockLevel, nMdCn } from '../../ssps/cmr';
import { dayNum, fmt, isoOf } from '../../ssps/format';
import { usePortName } from '../../ssps/hooks';
import { Info } from '../../ssps/ui';
import { BIZ_TYPES, LOCAL_PORT } from '@shared/api.interface';
import { AdoptModal, AnnounceModal, CalendarCard, PlanCard, StockCard, SummaryBar } from './parts';
import './p02.css';

type R = any;
export interface Form { biz: string; tons: string; load: string; disch: string; winStart: string; winEnd: string; item: string }

/** 预测的完整展示：结果概览、方案、库存保障、日历。P02 和 P11 共用 */
export function PredictionView({ out, form, today }: { out: R; form: Form; today: number }) {
  const nav = useNavigate(), tons = Number(form.tons) || 0, res = out.result, runNo: string | null = out.runNo;
  const { data: cal } = useCalendar(tons || 50000), { data: berths } = useBerths(), { data: inv } = useInventory();
  const [sel, setSel] = useState<number | null>(res?.plans?.[0]?.c.s ?? today);
  const [adopt, setAdopt] = useState<string | null>(null), [annc, setAnnc] = useState<string | null>(null);
  useEffect(() => { setSel(res?.plans?.[0]?.c.s ?? today); }, [out]);   // eslint-disable-line react-hooks/exhaustive-deps
  const zh = usePortName();
  const ctx = { batchPlanDate: (inv?.batch as R)?.planDate ?? null, planCoverTo: cal?.planCoverTo ?? null, voyHorizon: cal?.voyHorizon ?? null, berthTotal: berths?.length ?? 23 };
  let body;
  if (res.errors?.length) body = <div className="card banner err"><div className="ico">!</div><div><h3>暂时无法预测</h3><p>{res.errors.join('；')}</p></div></div>;
  else if (res.noRule) body = <div className="card banner err"><div className="ico">!</div><div><h3>没有找到「{zh(res.input.load)} → {zh(res.input.disch)}」的航程</h3><p>没有航程就推不出发船日。请先在主数据里补一条这条航线的估算航程；同航线实际航次累计到 5 个后，系统会改用历史统计。</p></div></div>;
  else if (res.noCandidate) body = <div className="card banner"><div className="ico" /><div><h3>窗口内没有可以推荐的时间</h3><p>{res.run.mode === 'cmr' ? `靠船计划只到 ${ctx.planCoverTo != null ? nMdCn(ctx.planCoverTo) : '—'}` : `航次计划只到 ${ctx.voyHorizon != null ? nMdCn(ctx.voyHorizon) : '—'}`}，这个窗口全部没有数据（灰色斜线，不是 0%）。系统不会因为没有数据而改用另一条计算路径，建议把窗口提前，或等下一期靠船计划。</p></div></div>;
  else body = (
    <div className="card pcard"><div className="card-h"><h2 className="nw">发船方案建议</h2></div>
      <div className="plans">
        <PlanCard p={res.plans[0]} res={res} ctx={ctx} canAct={!!runNo} onAdopt={setAdopt} onAnnounce={setAnnc} onDetail={(l) => nav(`/predictions/${runNo}?plan=${l}`)} />
        <PlanCard p={res.plans[1] ?? null} res={res} ctx={ctx} canAct={!!runNo} onAdopt={setAdopt} onAnnounce={setAnnc} onDetail={(l) => nav(`/predictions/${runNo}?plan=${l}`)} />
      </div>
    </div>
  );
  return (
    <>
      <section>{body}{!res.errors?.length && !res.noRule && <StockCard res={res} today={today} inventorySource={(inv?.batch as R)?.fileName} />}</section>
      <CalendarCard cal={cal} res={res} tons={tons} prodBiz={form.biz === '成品销售船'} sel={sel} onSel={setSel} />
      {runNo && adopt && <AdoptModal open runNo={runNo} label={adopt} res={res} onClose={() => setAdopt(null)} onDone={(r) => nav('/voyages/' + r.voyage.id)} />}
      {runNo && annc && <AnnounceModal open runNo={runNo} label={annc} onClose={() => setAnnc(null)} />}
    </>
  );
}

export function SummaryHead({ out, children }: { out: R; children?: React.ReactNode }) { return out?.result ? <div id="sumbar"><SummaryBar res={out.result} />{children}</div> : null; }

export default function PredictPage() {
  const { data: me } = useMe(), { data: ports } = usePorts(), { data: inv } = useInventory(), { data: berths } = useBerths(), zh = usePortName();
  const [sp] = useSearchParams(), today = me ? dayNum(me.today) : 0;
  const [f, setF] = useState<Form | null>(null), [out, setOut] = useState<R>(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [buffer] = useState(3), ran = useRef(false);
  const set = (p: Partial<Form>) => setF((x) => (x ? { ...x, ...p } : x));

  useEffect(() => {
    if (!me || !ports || f) return;
    const foreign = ports.find((p) => !p.isLocal && p.status === '启用')?.en ?? '';
    const q = (k: string) => sp.get(k) ?? '';
    setF({ biz: q('biz') || BIZ_TYPES[0], tons: q('tons') || '50000', load: q('load') || foreign, disch: q('disch') || LOCAL_PORT, winStart: q('ws') || isoOf(today + 4), winEnd: q('we') || isoOf(today + 14), item: q('item') });
  }, [me, ports, f]);   // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (form = f) => {
    if (!form) return;
    setErr(''); setBusy(true);
    try {
      const prod = form.biz === '成品销售船';
      setOut(await api.predict({ biz: form.biz, tons: Number(form.tons), load: prod ? LOCAL_PORT : form.load, disch: prod ? form.disch : LOCAL_PORT, winStart: form.winStart, winEnd: form.winEnd, item: form.biz === '大宗采购船' && form.item ? form.item : undefined, buffer: form.item ? buffer : undefined }));
    } catch (e) { setErr(getApiErrorMessage(e, '预测失败')); toast.error(getApiErrorMessage(e, '预测失败')); } finally { setBusy(false); }
  };
  useEffect(() => { if (f && sp.get('biz') && !ran.current) { ran.current = true; run(f); } }, [f]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;

  const prod = f.biz === '成品销售船', tons = Number(f.tons) || 0, maxCap = Math.max(0, ...(berths ?? []).map((b) => b.capacity));
  const poolN = (berths ?? []).filter((b) => b.status === '启用' && tons > 0 && b.capacity >= tons).length;
  const it = f.item ? inv?.items.find((x) => x.name === f.item) : null;
  const dist = f.winStart ? dayNum(f.winStart) - today : null, le = dist != null && dist <= 15;
  const portSel = (v: string, onChange: (x: string) => void, exclude: string) => <select className="inp" value={v} onChange={(e) => onChange(e.target.value)}>{(ports ?? []).filter((p) => p.en !== exclude && p.status === '启用').map((p) => <option key={p.en} value={p.en}>{zh(p.en)}</option>)}</select>;
  const locked = <div className="lockedv"><span>🔒</span>{zh(LOCAL_PORT)}<span className="faint">（本港）</span></div>;
  const lv = it ? stockLevel(it.days) : null;

  return (
    <div className="pg-p02">
      <div className="page-head"><div><h1>智能发船预测</h1><p>回答三件事：几号发船、哪几天到港、到港时泊位够不够。每次给出一个推荐方案和一个备选方案。</p></div></div>
      <section className="card inbar">
        <div className="card-h"><h2 className="nw">预测输入</h2></div>
        <div className="frow">
          <div className="fc"><div className="f-lab">业务类型</div><div className="seg">{BIZ_TYPES.map((b) => <button key={b} className={'nw' + (b === f.biz ? ' on' : '')} onClick={() => set({ biz: b, item: b === '大宗采购船' ? f.item : '', load: b === '成品销售船' ? LOCAL_PORT : f.load === LOCAL_PORT ? ports?.find((p) => !p.isLocal)?.en ?? '' : f.load, disch: b === '成品销售船' ? (f.disch === LOCAL_PORT ? ports?.find((p) => !p.isLocal)?.en ?? '' : f.disch) : LOCAL_PORT })}>{b}</button>)}</div></div>
          <div className="fc" style={{ width: 130 }}><div className="f-lab">货量（吨）</div><input className="inp" type="number" min={1000} step={1000} value={f.tons} onChange={(e) => set({ tons: e.target.value })} /></div>
          <div className="fc" style={{ width: 240 }}><div className="f-lab">物料库存<Info text={<>选一个物料，预测会按库存消耗模拟表保证不断料：到港窗口必须早于「断料日 − 缓冲天数」。<br />只对大宗采购船有效；选「不关联库存」就只按港口容量预测。</>} /></div>
            <select className="inp" disabled={f.biz !== '大宗采购船'} value={f.item} onChange={(e) => set({ item: e.target.value })}><option value="">不关联库存（只按港口容量）</option>
              {['铁矿', '焦煤', '辅料', ...new Set((inv?.items ?? []).map((x) => x.type))].filter((t, i, a) => a.indexOf(t) === i).map((t) => <optgroup key={t} label={t}>{inv?.items.filter((x) => x.type === t).map((x) => <option key={x.name} value={x.name}>{x.name}（{x.days} 天）</option>)}</optgroup>)}</select></div>
          <div className="fc" style={{ width: 160 }}><div className="f-lab">装港</div>{prod ? locked : portSel(f.load, (x) => set({ load: x }), LOCAL_PORT)}</div>
          <div className="fc" style={{ width: 160 }}><div className="f-lab">卸港</div>{prod ? portSel(f.disch, (x) => set({ disch: x }), LOCAL_PORT) : locked}</div>
          <div className="fc"><div className="f-lab">{prod ? '受载期（最早 / 最晚）' : '期望到港窗口（最早 / 最晚）'}<Info text={prod ? '成品船从本港装货。受载期的最晚一天就是最晚装船日，推荐方案不会超过它。' : '船到本港卸货的期望日期范围。'} /></div>
            <div className="win"><input className="inp" type="date" value={f.winStart} onChange={(e) => set({ winStart: e.target.value })} /><span>–</span><input className="inp" type="date" value={f.winEnd} onChange={(e) => set({ winEnd: e.target.value })} /></div></div>
          <div className="fc fbtn"><button className="btn primary" disabled={busy} onClick={() => run()}>▶ 预测</button><button className="btn" onClick={() => { setF(null); setOut(null); }}>↻ 重置</button></div>
        </div>
        <div className="hints">
          <span className="mini">{tons > 0 ? (poolN ? <>能装下的泊位 <b style={{ color: 'var(--text)', margin: '0 3px' }}>{poolN}</b> 个（共 {berths?.length ?? 23} 个）<Info text="只统计容量不小于货量的启用泊位，它们是计算泊位余量率的基数。" /></> : <span className="err" style={{ margin: 0 }}>超过最大泊位 {fmt(maxCap)} 吨，没有能装下的泊位</span>) : ''}</span>
          <span className="mini">{it && lv ? <>可用 {it.days} 天<span className={'lvl ' + lv[0]} style={{ marginLeft: 6 }}>{lv[1]}</span></> : ''}</span>
          {dist != null && (it ? <span className="pathbox le">各候选日期分别按距今天数分流<Info text={<>选了库存物料后，窗口里每个候选日期各按自己距今的天数分流：不超过 15 天用靠船计划（泊位余量），超过 15 天用航次计划（同期船数）。<br />两条路径各自排序，不跨路径比较数值。</>} /></span>
            : <span className={'pathbox ' + (le ? 'le' : 'gt')}>距今 {dist} 天 · {le ? '按近 15 天靠船计划' : '按 15 天后航次计划'}<Info text={<>{le ? '目标到港日距今不超过 15 天：用靠船计划逐个泊位算占用，得到泊位余量率。' : '目标到港日距今超过 15 天：没有逐泊位的靠船计划，改用航次计划统计同期的船数。'}<br />只按日期区分，不看有没有数据。</>} /></span>)}
          {err && <span className="err">{err}</span>}
        </div>
        {out && <SummaryHead out={out} />}
      </section>
      {out ? <PredictionView out={out} form={f} today={today} /> : <div className="card empty" style={{ marginTop: 16 }}>填好上面的条件，点「预测」。</div>}
    </div>
  );
}
