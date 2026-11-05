import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getApiErrorMessage, useBerthBatches, useBerthRows, useMe } from '../../ssps/api';
import { fmt, md, mdh } from '../../ssps/format';
import { Empty, Info, Loading, Modal, Tip } from '../../ssps/ui';
import { useQueryClient } from '@tanstack/react-query';
import './p07.css';

type R = any;
const isDx = (r: R) => /德信/.test(r.owner || '');   // 「是否德信」不存进 T10，显示时按从属单位推导；关键词待确认

export default function BerthPlanPage() {
  const { data: me } = useMe(), { data: batches, isLoading } = useBerthBatches(), qc = useQueryClient();
  const [batch, setBatch] = useState<string | null>(null), [f, setF] = useState({ tm: '', kw: '', off: false, unm: false, dx: false, st: 'active' });
  const [up, setUp] = useState(false);
  const cur = batch ?? batches?.find((b) => b.isCurrent)?.batchNo ?? batches?.[0]?.batchNo;
  const { data: rows } = useBerthRows(cur), listRef = useRef<HTMLElement>(null);
  const canUp = me?.role === '物流管理员' || me?.role === '系统管理员';
  if (isLoading) return <Loading />;
  const b = batches?.find((x) => x.batchNo === cur), all = (rows ?? []) as R[], act = all.filter((r) => r.status === 'active');
  const off = act.filter((r) => !r.inPool).length, unm = act.filter((r) => r.inPool && isDx(r) && !r.matchVoyage).length, fail = (batches ?? []).filter((x) => x.status !== '成功').length;
  const list = all.filter((r) => (!f.st || r.status === f.st) && (!f.tm || r.terminal === f.tm) && (!f.kw || (r.vessel + r.berthRaw + (r.berth || '')).toLowerCase().includes(f.kw.toLowerCase())) && (!f.off || !r.inPool) && (!f.dx || isDx(r)) && (!f.unm || (r.inPool && isDx(r) && !r.matchVoyage)));
  const tile = (cls: string, n: number, t: string, tip: string, fn?: () => void) => <div className={'card al ' + cls} onClick={fn}><b>{n}</b><span>{t}<Info text={tip} /></span></div>;
  const jump = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const stTag = (s: string) => s === 'active' ? <span className="tag green">有效</span> : s === 'history' ? <span className="tag gray">已卸完</span> : <span className="tag red">日期异常</span>;

  return (
    <div className="pg-p07">
      <div className="ptitle"><div><h1>靠船计划</h1><p>IMIP 靠船计划按批次入库、保留历史快照；预测用的泊位占用来自最新一期。</p></div>
        <div className="btns"><Tip text="云空间自动拉取（A18）还没有接入；先用手动上传"><button className="btn" disabled>立即拉取云空间</button></Tip>
          <button className="btn primary" disabled={!canUp} title={canUp ? undefined : '只有物流管理员和系统管理员能上传靠船计划'} onClick={() => setUp(true)}>手动上传</button></div></div>

      <div className="alerts">
        {tile('', off, '非德信池泊位记录', '靠船计划里出现、但不在 23 个德信泊位内的记录（如 L5、L9、L10）。保留原文并标「非德信池」，不计入泊位余量。', () => { setF({ ...f, off: !f.off, unm: false }); jump(); })}
        {tile(unm ? 'warn' : 'ok', unm, '德信船未匹配航次', '是德信的船，但航次表里找不到对应航次。请业务员补录航次，否则这条船在航次相关的统计里是缺失的。', () => { setF({ ...f, unm: !f.unm, off: false, dx: true }); jump(); })}
        {tile('ok', act.filter((r) => r.inPool).length, '已匹配德信泊位', '预计靠泊的泊位能对上 23 个德信泊位的记录。')}
        {tile(fail ? 'err' : 'ok', fail, '部分失败 / 失败批次', '最近的批次里有解析失败的，请查看批次列表里的校验结果，必要时重新上传。')}
      </div>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-h"><h2>导入批次<Info text="每次导入整份保存为一个批次，保留历史快照。按云空间文件标识去重，不会重复入库。整批写完、校验通过后才切换为最新一期。" /></h2><span className="muted nw" style={{ fontSize: 12 }}>云空间自动拉取待接入，目前以手动上传为准</span></div>
        <div className="tbl-wrap"><table className="tbl bt2"><thead><tr><th>批次号</th><th>计划日期</th><th>来源</th><th>文件名</th><th style={{ textAlign: 'right' }}>行数</th><th style={{ textAlign: 'right' }}>有效</th><th>校验结果</th><th>状态</th><th>导入人 / 时间</th></tr></thead>
          <tbody>{batches?.length ? batches.map((x) => (
            <tr key={x.batchNo} className={'click' + (x.batchNo === cur ? ' sel' : '')} onClick={() => setBatch(x.batchNo)}>
              <td><b>{x.batchNo}</b>{x.isCurrent && <> <span className="tag blue">最新一期</span></>}</td><td>{x.planDate}</td><td>{x.source === '手动上传' ? <span className="tag amber">手动上传</span> : <span className="tag gray">飞书云空间</span>}</td><td>{x.fileName}</td>
              <td style={{ textAlign: 'right' }}>{x.total}</td><td style={{ textAlign: 'right' }}>{x.active}</td><td style={{ whiteSpace: 'normal', minWidth: 260 }}>{x.validation ?? '通过'}{x.coverTo && <span className="muted"> · 覆盖到 {md(x.coverTo)}</span>}</td>
              <td>{x.status === '成功' ? <span className="tag green">成功</span> : <span className="tag red">{x.status}</span>}</td><td className="nw">{x.importedBy} · {x.importedAt}</td></tr>
          )) : <tr><td colSpan={9}><Empty>还没有导入过靠船计划</Empty></td></tr>}</tbody></table></div>
      </section>

      <section className="card" ref={listRef}>
        <div className="card-h"><h2>{b?.isCurrent ? '最新一期明细' : '批次明细'} · {b?.batchNo ?? '—'}<Info text="只保留预测用到的列。表内泊位会映射到泊位主档；表外泊位保留原文，标「非德信池」。" /></h2>{b && <span className="muted nw" style={{ fontSize: 12 }}>计划日期 {b.planDate} · {b.total} 行</span>}</div>
        <div className="fbar">
          <select className="inp" value={f.st} onChange={(e) => setF({ ...f, st: e.target.value })}><option value="active">有效行（参与 CMR）</option><option value="history">已卸完的历史行</option><option value="anomaly">日期异常行</option><option value="">全部行</option></select>
          <select className="inp" value={f.tm} onChange={(e) => setF({ ...f, tm: e.target.value })}><option value="">全部码头</option><option>北区码头</option><option>拉博塔码头</option></select>
          <input className="inp" placeholder="船名 / 泊位" style={{ width: 200 }} value={f.kw} onChange={(e) => setF({ ...f, kw: e.target.value.trim() })} />
          <button className={'chipf' + (f.off ? ' on' : '')} onClick={() => setF({ ...f, off: !f.off })}>只看非德信池</button>
          <button className={'chipf' + (f.unm ? ' on' : '')} onClick={() => setF({ ...f, unm: !f.unm, dx: f.unm ? f.dx : true })}>只看德信船未匹配航次</button>
          <button className={'chipf' + (f.dx ? ' on' : '')} onClick={() => setF({ ...f, dx: !f.dx })}>只看德信船</button>
          <span className="muted nw" style={{ marginLeft: 'auto', fontSize: 12 }}>显示 {list.length} / {all.length} 行</span>
        </div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>码头</th><th>泊位（原文）</th><th>泊位（德信池）</th><th>船名</th><th style={{ textAlign: 'right' }}>船长（米）</th><th>船舶类型</th><th>物资</th><th style={{ textAlign: 'right' }}>吨位</th><th>预计到港</th><th>预计靠泊</th><th>预计卸完</th><th>从属单位</th>
          <th>是否德信<Info text="不是靠船计划原有的列，也不存进多维表格：按「从属单位」是否含「德信」推导，只用于显示和筛选，不影响泊位余量。" /></th><th>航次</th><th>状态</th></tr></thead>
          <tbody>{list.length ? list.map((r) => (
            <tr key={r.line} className={r.inPool ? '' : 'off'}><td>{r.terminal}</td><td>{r.berthRaw}</td>
              <td>{r.inPool ? <b>{r.berth}</b> : <Tip text="不在 23 个德信泊位内，保留原文，不计入泊位余量"><span className="tag gray">非德信池</span></Tip>}</td>
              <td className="vname">{r.vessel}</td><td style={{ textAlign: 'right' }}>{r.loa ?? '—'}</td><td>{r.shipType}</td><td>{r.cargo}</td><td style={{ textAlign: 'right' }}>{fmt(r.tons)}</td>
              <td>{mdh(r.eta)}</td><td>{mdh(r.start)}</td><td>{mdh(r.end)}</td><td>{r.owner}</td><td>{isDx(r) ? <span className="tag blue">德信</span> : <span className="muted">—</span>}</td>
              <td>{r.matchVoyage ? <Link to={'/voyages/' + r.matchVoyage}>{r.matchVoyage.slice(-4)}</Link> : isDx(r) && r.inPool && r.status === 'active' ? <span className="tag amber">未匹配</span> : <span className="muted">—</span>}</td>
              <td>{r.issue ? <Tip text={r.issue.text}>{stTag(r.status)}</Tip> : stTag(r.status)}</td></tr>
          )) : <tr><td colSpan={15}><Empty>没有符合条件的行</Empty></td></tr>}</tbody></table></div>
      </section>

      <UploadModal open={up} onClose={() => setUp(false)} onDone={(bn) => { setBatch(bn); qc.invalidateQueries({ queryKey: ['berth-batches'] }); qc.invalidateQueries({ queryKey: ['calendar'] }); }} />
    </div>
  );
}

function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (batchNo: string) => void }) {
  const [file, setFile] = useState<File | null>(null), [date, setDate] = useState(''), [busy, setBusy] = useState(false), [rep, setRep] = useState<R>(null);
  const close = () => { setFile(null); setDate(''); setRep(null); onClose(); };
  const submit = async () => {
    if (!file) return toast.error('请先选择 Excel 文件');
    setBusy(true);
    try { const r: R = await api.importBerthFile(file, date || undefined); setRep(r); onDone(r.batch.batchNo); toast.success('已导入批次 ' + r.batch.batchNo); }
    catch (e) { toast.error(getApiErrorMessage(e, '导入失败')); } finally { setBusy(false); }
  };
  const s = rep?.summary;
  return (
    <Modal title="手动上传靠船计划" open={open} onClose={close} width={600}
      footer={rep ? <button className="btn primary" onClick={close}>完成</button> : <><button className="btn" onClick={close}>取消</button><button className="btn primary" disabled={busy || !file} onClick={submit}>{busy ? '导入中…' : '校验并导入'}</button></>}>
      {!rep ? (
        <>
          <div className="field"><div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>选择 IMIP 靠船计划 Excel（.xlsx）</div><input type="file" accept=".xlsx" className="inp" style={{ height: 'auto', padding: 6 }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="field"><div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>计划日期（可选，默认今天；用来判断 90 天范围和已卸完）</div><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>系统会先校验表头和日期：缺列、空文件整批拒绝；日期异常的行进数据质量清单，不参与泊位余量。整批通过后才切换为最新一期。</div>
        </>
      ) : (
        <div className="rep">
          <div><span>批次</span><b>{rep.batch.batchNo}</b></div><div><span>文件</span><b>{rep.batch.fileName}</b></div><div><span>总行数</span><b>{s.total}</b></div>
          <div><span>有效（参与泊位余量）</span><b style={{ color: '#237804' }}>{s.active}</b></div><div><span>标「非德信池」</span><b>{s.offPool}</b></div><div><span>已卸完的历史行</span><b>{s.history}</b></div>
          <div><span>日期异常</span><b style={{ color: s.anomaly ? '#ad4e00' : undefined }}>{s.anomaly}</b></div><div><span>覆盖到</span><b>{rep.coverTo ?? '—'}</b></div>
          {s.anomalies?.slice(0, 8).map((a: R) => <div key={a.line}><span>第 {a.line} 行 {a.vessel}</span><b style={{ color: '#ad4e00' }}>{a.text}</b></div>)}
        </div>
      )}
    </Modal>
  );
}
