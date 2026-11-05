import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getApiErrorMessage, useInventory, useMe, usePorts, useTrend } from '../../ssps/api';
import { nMd, nMdCn, nWk, stockLevel } from '../../ssps/cmr';
import { dayNum, fmt, isoOf } from '../../ssps/format';
import { StockChart } from '../../ssps/StockChart';
import { Info, StaleNotice } from '../../ssps/ui';
import { BIZ_TYPES, LOCAL_PORT } from '@shared/api.interface';
import './p11.css';

type R = any;
const DEF_LOAD = 'QINHUANGDAO', DEF_CUST = 'HAIPHONG';
const lvl = stockLevel;

export default function AskPage() {
  const nav = useNavigate(), { data: me } = useMe(), { data: inv, refetch: refetchInv } = useInventory(), { data: ports } = usePorts();
  const today = me ? dayNum(me.today) : 0, canImport = me?.role === '物流管理员' || me?.role === '系统管理员';
  const [text, setText] = useState(''), [ov, setOv] = useState<R>({}), [parsed, setParsed] = useState<R>(null), [stale, setStale] = useState(false), [gen, setGen] = useState(false);
  const [buf, setBuf] = useState(3), [invTab, setInvTab] = useState<'mat' | 'risk'>('mat'), [closed, setClosed] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'trend' | 'detail'>('trend'), [range, setRange] = useState(0), [listening, setListening] = useState(false);
  const [plan, setPlan] = useState<R>(null), lastText = useRef(''), file = useRef<HTMLInputElement>(null), rec = useRef<R>(null);
  const items = inv?.items ?? [];

  const prod = parsed?.biz === '成品销售船';
  const missing = !parsed ? ['需求'] : [!parsed.biz && '船型', !parsed.tons && '货量'].filter(Boolean) as string[];
  const ready = !!(parsed && !stale && !missing.length && !parsed.outside);
  const route = parsed ? (prod ? { load: LOCAL_PORT, disch: parsed.disch || DEF_CUST } : { load: parsed.load || DEF_LOAD, disch: LOCAL_PORT }) : null;
  const stage = !parsed || stale ? 1 : !ready ? 2 : 4;

  const run = async (keep = false, t = text, o = ov) => {
    const q = t.trim();
    if (!q) { toast('先输入需求，或点右侧的物料'); return; }
    const next = keep ? o : {};
    try {
      const r = await api.parse(q, Object.keys(next).length ? next : undefined);
      setOv(next); lastText.current = q; setParsed(r); setStale(false); setGen(false);
      if (!keep) toast(r.biz && r.tons && !r.outside ? '已解析，可以直接修改字段后重新计算' : '已解析，还缺少：' + ([!r.biz && '船型', !r.tons && '货量'].filter(Boolean).join('、') || '时间范围'));
    } catch (e) { toast.error(getApiErrorMessage(e, '解析失败')); }
  };
  const edit = (patch: R) => { const base = { ...ov }; if (!base.biz && parsed?.biz) base.biz = parsed.biz; const next = { ...base, ...patch }; Object.keys(next).forEach((k) => (next[k] === undefined) && delete next[k]); run(true, text, next); };

  // 库存测算：有物料时由后端引擎给出有效断料日、最晚到港日、P80 航程
  const itemName: string | null = parsed?.item?.name ?? null;
  useEffect(() => {
    if (!itemName || !route || !parsed?.biz) { setPlan(null); return; }
    let live = true;
    api.stockPlan({ item: itemName, biz: parsed.biz, load: route.load, disch: route.disch, buffer: buf }).then((r) => live && setPlan(r)).catch(() => live && setPlan(null));
    return () => { live = false; };
  }, [itemName, buf, route?.load, route?.disch, parsed?.biz]);   // eslint-disable-line react-hooks/exhaustive-deps
  const so: number | null = plan?.so ?? null, latest: number | null = plan?.latest ?? null;
  const until = range ? today + range : Math.min(Math.max(today + 45, (so || 0) + 14, (latest || 0) + 14), today + 100);
  const { data: trend } = useTrend(itemName, [], until);

  const go = () => {
    if (!ready || gen || !route) return;
    setGen(true);
    const it = parsed.item, we = parsed.userDeadline && parsed.b ? parsed.b : it ? (latest != null ? Math.max(latest, today) : today + 30) : today + 15;
    let ws = parsed.a; if (we < ws) ws = Math.min(ws, today);
    const q: Record<string, string> = { biz: parsed.biz, tons: String(parsed.tons), load: route.load, disch: route.disch, ws: isoOf(ws), we: isoOf(we) };
    if (it) { q.item = it.name; q.buf = String(buf); }
    setTimeout(() => nav('/predict?' + new URLSearchParams(q)), 350);
  };

  const onText = (v: string) => { setText(v); const st = !!(parsed && v.trim() !== lastText.current); if (st !== stale) setStale(st); };
  const clear = () => { setText(''); setOv({}); setParsed(null); setStale(false); setGen(false); setPlan(null); lastText.current = ''; };

  const mic = () => {
    const SR = (window as R).SpeechRecognition || (window as R).webkitSpeechRecognition;
    if (listening) { try { rec.current?.stop(); } catch { /* ignore */ } setListening(false); if (text.trim()) run(); return; }
    if (!SR) return toast.error('这个浏览器不支持语音识别，请直接输入文字');
    try {
      const r = new SR(); r.lang = 'zh-CN'; r.interimResults = true; r.continuous = false; rec.current = r;
      r.onresult = (e: R) => setText([...e.results].map((x: R) => x[0].transcript).join(''));
      r.onerror = () => { setListening(false); toast.error('没有拿到麦克风权限或网络'); };
      r.onend = () => setListening(false);
      r.start(); setListening(true);
    } catch { toast.error('语音识别启动失败'); }
  };
  const doImport = async (f: File) => {
    try { toast('正在导入…'); const r: R = await api.importInventoryFile(f); toast.success(`已导入 ${r.summary.items} 个物料` + (r.summary.errorRows ? `，${r.summary.errorRows} 行错误值未参与计算` : '')); refetchInv(); } catch (e) { toast.error(getApiErrorMessage(e, '导入失败')); }
  };

  const examples = (() => {
    const d = isoOf(today + 20), md = Number(d.slice(5, 7)) + '月' + Number(d.slice(8)) + '日';
    const first = items.filter((x) => !x.name.endsWith('总库存')).slice(0, 2).map((x) => `${x.name} 秦皇岛→德信 3万吨 ${md}前`);
    return [...first, `成品线材2.8万吨，${Number(isoOf(today + 4).slice(5, 7))}月${Number(isoOf(today + 4).slice(8))}日到${Number(isoOf(today + 16).slice(8))}日装船，发海防`, '备件船8000吨从雅加达来，下周到港'];
  })();

  // —— 右侧库存分析 ——
  const row = (i: R, showType: boolean) => { const l = lvl(i.days); return (
    <div key={i.name} className={'ir ' + l[0] + (i.name === itemName ? ' sel' : '')} title={`${i.name}\n当前库存 ${fmt(i.stock)} 吨 · 日耗 ${fmt(i.daily)} 吨\n点击带入提问`}
      onClick={() => { const v = i.name.replace('总库存', '') + ' ' + (i.type === '辅料' ? '新村港' : '秦皇岛') + '→德信 5万吨'; setText(v); run(false, v, {}); }}><i /><span>{i.name}</span>{showType && <em>{i.type}</em>}<b>{i.days}天</b></div>); };
  const grp = (key: string, title: string, list: R[], showType: boolean) => (
    <div key={key} className={'ig' + (closed[key] ? ' closed' : '')}><div className="ig-h" onClick={() => setClosed({ ...closed, [key]: !closed[key] })}><span className="ar">▾</span>{title}（{list.length}）</div>
      <div className="ig-b">{list.length ? list.map((i) => row(i, showType)) : <div className="ir" style={{ cursor: 'default', color: 'var(--faint)' }}>没有</div>}</div></div>);
  const types = [...new Set(items.map((i) => i.type))];

  // —— 解析字段 ——
  const foreign = (ports ?? []).filter((p) => !p.isLocal && p.status === '启用'), pn = (p: R) => p.cn.replace(/（.*?）/g, '');
  const dh = parsed ? (parsed.userDeadline && parsed.b ? (parsed.a > today ? `窗口 ${nMd(parsed.a)} – ${nMd(parsed.b)}` : '你约定的截止日') : parsed.item ? '未说明，按库存自动推算' : '未说明，默认看未来 15 天') : '';
  const ih = parsed?.item ? (parsed.item.name.endsWith('总库存') ? `只说了类型，按${parsed.item.type}总库存判断` : '按这个品名判断断料') : parsed?.biz === '大宗采购船' ? '未识别，只按港口容量预测' : '';
  const noItem = parsed && !stale && !parsed.item;
  const names = ['输入需求', '智能解析', noItem && stage === 4 ? '库存测算（未指定物料）' : '库存测算', gen ? '正在生成方案' : '生成方案'];
  const lv = parsed?.item ? lvl(parsed.item.days) : null;
  const why = gen ? '正在生成…' : stale ? '需求文字已修改，请先点「解析需求」' : missing.length ? '还缺少：' + missing.join('、') : parsed?.outside ? '时间超出范围，只能看未来 60 天' : '下一页给出推荐方案和备选方案' + (parsed?.item ? '，并保证不断料' : '');
  const mc = (k: string, v: React.ReactNode, n?: string, cls?: string) => <div className={'mc ' + (cls || '')}><div className="k">{k}</div><div className="v">{v}</div>{n && <div className="n">{n}</div>}</div>;

  return (
    <div className="pg-p11"><div className="p11">
      <section>
        <div className="card hd"><div className="hd-t"><div className="hd-ico"><svg viewBox="0 0 40 40"><path d="M6 26h28l-4 7H10z" fill="#1677ff" /><path d="M11 25V15h14l4 10z" fill="#69b1ff" /><rect x="14" y="9" width="7" height="6" rx="1" fill="#0958d9" /></svg></div>
          <div><h1>智能发船助手<small>智慧发船预测系统</small></h1><p>基于库存消耗、港口容量与航程规则的发船方案助手</p></div></div>
          <div className="steps">{names.map((n, i) => { const k = i + 1; let c = k < stage ? 'done' : k === stage ? 'cur' : ''; if (k === 3 && noItem && stage === 4) c = 'skip'; return <div key={k} className={'st ' + c}><b>{c === 'done' ? '✓' : k}</b><span>{n}</span></div>; })}</div></div>

        <div className="card ask">
          <div className="ask-in"><span className="ai"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 4h16v12H8l-4 4z" fill="none" stroke="#1677ff" strokeWidth="2" strokeLinejoin="round" /><path d="M8 9h8M8 12h5" stroke="#1677ff" strokeWidth="2" strokeLinecap="round" /></svg></span>
            <textarea value={text} placeholder="像说话一样描述需求，比如：烧结石灰石 秦皇岛→德信 5万吨 12月10日前到港" onChange={(e) => onText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (text.trim()) run(); } }} /></div>
          <div className="ask-bar"><span className="hint">{listening ? '正在听，请直接说出需求…再点一次麦克风结束' : '按 Enter 解析，Shift+Enter 换行'}</span>
            <button className={'mic' + (listening ? ' on' : '')} onClick={mic} aria-label="语音输入" title="语音输入"><svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2z" /></svg></button>
            <button className="btn bt" disabled={!text.trim() && !parsed} onClick={clear}>清空</button>
            <button className="btn primary bt" disabled={!text.trim()} onClick={() => run()}>解析需求</button></div>
        </div>

        {parsed && (
          <div className="card"><div className="sh"><h2>智能解析结果<Info text="系统按关键词识别船型、物料、货量、航线和截止日。识别不准可以直接改，改完自动重新计算。数值由规则引擎计算，不经过生成式模型改写。" /></h2><span className="sub">可编辑后重新计算</span><span className="sp" /><button className="btn" title="放弃手工修改，按输入框里的文字重新解析" onClick={() => run(false)}>↻ 重新解析</button></div>
            {stale && <div className="stale">需求文字已修改，下面还是上一次的解析结果。点「解析需求」按新文字重新解析。</div>}
            <div className="pf">
              <div className={parsed.biz ? '' : 'miss'}><label>船型</label><select className="inp" value={parsed.biz ?? ''} onChange={(e) => edit({ biz: e.target.value || undefined })}><option value="">待确认</option>{BIZ_TYPES.map((b) => <option key={b}>{b}</option>)}</select>{!parsed.biz && <div className="fh">请选择</div>}</div>
              <div><label>物料</label><select className="inp" value={parsed.item?.name ?? ''} onChange={(e) => edit({ item: e.target.value || null })}><option value="">不指定（只按港口容量）</option>{types.map((ty) => <optgroup key={ty} label={ty}>{items.filter((i) => i.type === ty).map((i) => <option key={i.name} value={i.name}>{i.name}（{i.days} 天）</option>)}</optgroup>)}</select>{ih && <div className="fh">{ih}</div>}</div>
              <div className={parsed.tons ? '' : 'miss'}><label>货量</label><div className="suf"><input className="inp" type="number" min={0} step={1000} defaultValue={parsed.tons || ''} key={'t' + parsed.tons} placeholder="待补充" onBlur={(e) => edit({ tons: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} /><em>吨</em></div>{!parsed.tons && <div className="fh">请填写</div>}</div>
              <div className="wide"><label>航线</label>{prod
                ? <div className="rt"><span>德信 →</span><select className="inp" value={parsed.disch ?? ''} onChange={(e) => edit({ disch: e.target.value || undefined })}><option value="">未识别（默认海防）</option>{foreign.map((p) => <option key={p.en} value={p.en}>{pn(p)}</option>)}</select></div>
                : <div className="rt"><select className="inp" value={parsed.load ?? ''} onChange={(e) => edit({ load: e.target.value || undefined })}><option value="">未识别（默认秦皇岛）</option>{foreign.map((p) => <option key={p.en} value={p.en}>{pn(p)}</option>)}</select><span>→ 德信</span></div>}</div>
              <div className={parsed.outside ? 'miss' : ''}><label>{prod ? '装船截止日' : '到港截止日'}</label><input className="inp" type="date" value={parsed.userDeadline && parsed.b ? isoOf(parsed.b) : ''} min={isoOf(today)} max={isoOf(today + 60)} onChange={(e) => edit({ b: e.target.value || undefined })} /><div className="fh">{dh}</div></div>
            </div>
            {parsed.biz && !parsed.tons && <div className="alts">常用货量：{[20000, 30000, 50000, 70000].map((n) => <button key={n} className="chipf" onClick={() => edit({ tons: n })}>{n / 10000} 万吨</button>)}</div>}
            {parsed.ambiguous && parsed.alt?.length > 0 && <div className="alts">也可能是：{parsed.alt.map((i: R) => <button key={i.name} className="chipf" onClick={() => edit({ item: i.name })}>{i.name}</button>)}</div>}
            {parsed.outside && <div className="concl red" style={{ marginTop: 0 }}>时间超出范围，只能看未来 60 天。</div>}
          </div>
        )}

        {parsed && (
          <div className="card">
            {parsed.item && lv ? (
              <>
                <div className="sh"><h2>库存保障 · {parsed.item.name}</h2><span className={'lvl ' + lv[0]}>{lv[1]}</span><Info text="库存曲线按日耗下降，已排定的到货会让它回升；降到 0 的那一天是断料日。新到的船必须在「断料日 − 缓冲天数」之前到港。" /><span className="sp" />
                  <span className="sub">到港后缓冲<Info text="船到港后还要靠泊、卸货、入库，所以要提前留几天。默认 3 天，待确认。" /></span>
                  <select className="inp" style={{ width: 84, height: 30, padding: '0 6px', fontWeight: 600 }} value={buf} onChange={(e) => setBuf(Number(e.target.value))}>{[0, 1, 2, 3, 4, 5, 7].map((n) => <option key={n} value={n}>{n} 天</option>)}</select></div>
                <div className="mcs">
                  {mc('当前库存', <>{fmt(parsed.item.stock)}<small>吨</small></>)}{mc('日耗', <>{fmt(parsed.item.daily)}<small>吨/天</small></>)}{mc('可用天数', <>{parsed.item.days}<small>天</small></>, lv[1], lv[0] === 'bad' ? 'red' : lv[0] === 'mid' ? 'amb' : '')}
                  {mc('最晚到港日', latest != null ? nMdCn(latest) : '—', latest != null ? (latest < today ? '已错过' : '距今 ' + (latest - today) + ' 天') : '不断料，无限制')}
                  {mc('约定的截止日', parsed.userDeadline && parsed.b ? nMdCn(parsed.b) : '未约定', parsed.userDeadline && parsed.b ? '距今 ' + (parsed.b - today) + ' 天' : '按库存自动推算')}
                  {mc('断料日', so != null ? nMdCn(so) : '不断料', so != null ? (so <= today ? '已断料' : '距今 ' + (so - today) + ' 天') + (plan?.gap ? ' · 另有短缺口 ' + nMd(plan.gap.from) : '') : '模拟期内', so != null ? 'red' : 'grn')}
                </div>
                <div className="tabs2"><button className={'tb' + (view === 'trend' ? ' on' : '')} onClick={() => setView('trend')}>库存趋势预测</button><button className={'tb' + (view === 'detail' ? ' on' : '')} onClick={() => setView('detail')}>库存明细</button><span className="sp" />
                  <span className="seg">{([[7, '7天'], [15, '15天'], [30, '30天'], [0, '全部']] as Array<[number, string]>).map(([n, t]) => <button key={n} className={range === n ? 'on' : ''} onClick={() => setRange(n)}>{t}</button>)}</span></div>
                {view === 'trend'
                  ? <div className="chartbox">{trend ? <StockChart trend={trend} daily={parsed.item.daily} latest={latest} gap={plan?.gap ?? null} marks={[]} /> : <div className="empty">加载中…</div>}</div>
                  : <div className="dtw"><table className="dt"><thead><tr><th>日期</th><th>星期</th><th className="r">日耗（吨）</th><th className="r">模拟库存（吨）</th><th className="r">可用天数</th><th>标记</th></tr></thead><tbody>
                    {(() => { let prev: number | null = null; return (trend?.series ?? []).map(([d, s, dl]: [number, number, number]) => { const tg: string[] = []; if (d === today) tg.push('今天'); if (plan?.gap && d === plan.gap.from) tg.push('短缺口开始'); if (d === latest) tg.push('最晚到港'); if (d === so) tg.push('断料日'); if (prev != null && s > prev) tg.push('到货 +' + fmt(s - prev + dl)); prev = s;
                      return <tr key={d} className={d === so ? 'so' : tg.length ? 'k' : ''}><td>{nMd(d)}</td><td>{nWk(d)}</td><td className="r">{fmt(dl)}</td><td className="r">{fmt(s)}</td><td className="r">{dl ? Math.floor(s / dl) : '—'}</td><td>{tg.join('、')}</td></tr>; }); })()}</tbody></table></div>}
                {(() => {
                  let cls = '', txt: React.ReactNode;
                  if (so == null) txt = '模拟期内这个物料不会断料，预测只按港口容量安排。';
                  else if (so <= today) { cls = 'red'; txt = '这个物料已经断料。生成方案时会切换为「最快到港」，并如实提示断料天数；同时请联系供应商或调拨。'; }
                  else {
                    txt = <>为保障生产连续，到港窗口最后一天不晚于 <b>{nMdCn(latest!)}</b>（距今 {latest! - today} 天，断料日 {nMdCn(so)} 前 {buf} 天），在此范围内选港口最宽松的时间。
                      {parsed.userDeadline && parsed.b && parsed.b !== latest ? (parsed.b < latest! ? `你约定的截止日 ${nMdCn(parsed.b)} 更早，以它为准。` : `你约定的截止日 ${nMdCn(parsed.b)} 晚于最晚到港日，仍以最晚到港日为准（不能断料）。`) : ''}
                      {plan?.p80 != null && latest! - today < plan.p80 && (() => { cls = 'amb'; return <>按这条航线的航程（约 {plan.p80} 天）<b>可能已经赶不上</b>，生成方案后会给出最快能到的日期和断料天数。</>; })()}</>;
                  }
                  return <div className={'concl ' + cls}><b className="t">预测结论：</b>{plan?.gap && <><b>{nMdCn(plan.gap.from)} 起有一个短缺口</b>，按这条航线的最快航程已经赶不上，之后由已排定的到货补回；本次以补回后的下一次断料日为目标。</>}{txt}</div>;
                })()}
              </>
            ) : (
              <><div className="sh"><h2>库存测算</h2><span className="sub">未指定物料</span></div><div className="skipc">{parsed.biz === '大宗采购船' ? <>没有识别到物料，本次预测<b>只按港口容量</b>，不考虑断料。可以在上面「物料」里选择，或从右侧点选物料。</> : '未指定物料，本次只按港口容量和航程预测，不做库存测算。'}</div></>
            )}
            <div className="acts"><button className="btn primary bt" disabled={!ready || gen} onClick={go}>{gen ? '正在生成方案…' : '生成发船方案'}</button><span className={'why' + (ready && !gen ? '' : ' err')}>{why}</span></div>
          </div>
        )}

        <div className="card"><div className="quick"><h3>快捷提问</h3>{examples.map((x) => <button key={x} className="chipf" onClick={() => { setText(x); run(false, x, {}); }}>{x}</button>)}</div></div>
      </section>

      <aside className="card inv">
        <div className="grp"><h2>库存可用天数分析<Info text="按库存消耗模拟表计算：可用天数 = 当前库存 ÷ 日耗。模拟库存已经包含已排定的到货，降到 0 的那一天就是断料日。点击某个物料可以带入提问。" /></h2>
          <div className="lg"><span><i style={{ background: '#52c41a' }} />充裕（&gt;25天）</span><span><i style={{ background: '#fa8c16' }} />偏紧（15–25天）</span><span><i style={{ background: '#ff4d4f' }} />危险（&lt;15天）</span></div></div>
        <div className="up"><span>{inv?.batch ? `批次 ${(inv.batch as R).batchNo}` : '还没有导入库存表'}</span>{inv?.batch && <span className="sample" style={{ background: '#f6ffed', borderColor: '#b7eb8f', color: '#237804' }}>已导入：{(inv.batch as R).fileName}</span>}</div>
        <StaleNotice stale={inv?.stale} />
        <div className="itabs"><button className={invTab === 'mat' ? 'on' : ''} onClick={() => setInvTab('mat')}>按物料</button><button className={invTab === 'risk' ? 'on' : ''} onClick={() => setInvTab('risk')}>按风险</button></div>
        {invTab === 'mat' ? types.map((ty) => grp('t:' + ty, ty, items.filter((i) => i.type === ty).sort((a, b) => a.days - b.days), false))
          : ([['bad', '危险（15 天以内）'], ['mid', '偏紧（15–25 天）'], ['ok', '充裕（25 天以上）']] as Array<[string, string]>).map(([k, t]) => grp('r:' + k, t, items.filter((i) => lvl(i.days)[0] === k).sort((a, b) => a.days - b.days), true))}
        <div className="imp">{canImport ? <><button className="btn" onClick={() => file.current?.click()}>导入库存消耗模拟表</button><input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => { if (e.target.files?.[0]) doImport(e.target.files[0]); e.target.value = ''; }} /><span>支持 .xlsx；错误值行单独记录，不参与断料计算。</span></> : <span>库存消耗模拟表由物流管理员导入。</span>}</div>
      </aside>
    </div></div>
  );
}
