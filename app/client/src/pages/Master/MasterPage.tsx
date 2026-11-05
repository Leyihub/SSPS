import { ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, useBerths, useMe, usePorts, useRouteRules, useVessels, useWrite } from '../../ssps/api';
import { fmt } from '../../ssps/format';
import { usePortName } from '../../ssps/hooks';
import { Empty, Info, Modal, Tip } from '../../ssps/ui';
import { BIZ_TYPES, type PortRowDto, type RouteRuleDto, type VesselDto } from '@shared/api.interface';
import './p08.css';

const TABS: Array<[string, string]> = [['port', '港口'], ['berth', '泊位'], ['vessel', '船舶'], ['route', '航程规则']];
const COUNTRIES = ['印度尼西亚', '中国', '菲律宾', '越南', '其他'], TYPES = ['散货船', '拖驳组合', '集装箱船', '杂货船', '其他'];
const Note = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <div className="note" style={warn ? undefined : { background: '#f5f6f8', borderColor: '#d9dee5', color: '#5b6878', marginBottom: 14 }}>{children}</div>;

export default function MasterPage() {
  const { data: me } = useMe(), [sp] = useSearchParams(), [tab, setTab] = useState(sp.get('tab') || 'port'), [kw, setKw] = useState(''), [noMmsi, setNoMmsi] = useState(false);
  const { data: ports } = usePorts(), { data: berths } = useBerths(), { data: vessels } = useVessels(), { data: rules } = useRouteRules();
  const role = me?.role, can = { master: role === '物流管理员' || role === '系统管理员', vessel: role !== undefined, route: role === '部门主管' || role === '系统管理员' };
  const [port, setPort] = useState<PortRowDto | null | undefined>(undefined), [vessel, setVessel] = useState<VesselDto | null | undefined>(undefined), [rule, setRule] = useState<RouteRuleDto | null | undefined>(undefined);
  const count: Record<string, number | undefined> = { port: ports?.length, berth: berths?.length, vessel: vessels?.length, route: rules?.length };
  const zh = usePortName();
  const toggle = useWrite((b: { code: string; status: string }, key) => api.patchBerth(b.code, { status: b.status }), [['berths'], ['calendar']]);
  const recompute = useWrite((_: null) => api.recompute(), [['route-rules']]);
  const deny = (ok: boolean, tip: string) => (ok ? {} : { disabled: true, title: tip });
  const match = (s: string) => !kw || s.toLowerCase().includes(kw.toLowerCase());

  return (
    <div className="pg-p08">
      <div className="ptitle"><div><h1>主数据</h1><p>港口、泊位、船舶、航程规则。预测和导入匹配都以这里为准。</p></div></div>
      <section className="card">
        <div className="tabs2">{TABS.map(([k, l]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => { setTab(k); setKw(''); setNoMmsi(false); }}>{l}<small>{count[k] ?? ''}</small></button>)}</div>

        {tab === 'port' && <>
          <div className="fbar"><input className="inp" placeholder="港口名 / 别名" value={kw} onChange={(e) => setKw(e.target.value.trim())} style={{ width: 220 }} /><span className="muted nw" style={{ fontSize: 12 }}>别名用来匹配导入和旧表里的各种写法，一行一个。</span><span style={{ flex: 1 }} />
            <button className="btn primary" {...deny(can.master, '只有物流管理员和系统管理员能维护港口')} onClick={() => setPort(null)}>新增港口</button></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>港口编码</th><th>中文名称</th><th>英文标准名</th><th>别名</th><th>国家</th><th>地区</th><th>性质</th><th>本港</th><th>状态</th><th /></tr></thead><tbody>
            {(ports ?? []).filter((p) => match(p.cn + p.en + p.alias.join(''))).map((p) => <tr key={p.en}><td>{p.code || <span className="mut">—</span>}</td><td><b>{p.cn}</b></td><td>{p.en}</td>
              <td className="wrap"><div className="alias">{p.alias.length ? p.alias.map((a) => <span key={a}>{a}</span>) : <span className="mut">—</span>}</div></td><td>{p.country}</td><td>{p.region || '—'}</td><td>{p.kind}</td><td>{p.isLocal && <span className="tag blue">本港</span>}</td>
              <td><span className={'tag ' + (p.status === '启用' ? 'green' : 'gray')}>{p.status}</span></td><td><button className="btn ghost" {...deny(can.master, '没有修改权限')} onClick={() => setPort(p)}>编辑</button></td></tr>)}</tbody></table></div>
          <Note>原「物料信息」「标准航行周期」「船型」三列整列为空，已删除；航程是航线属性，放在「航程规则」页签。</Note></>}

        {tab === 'berth' && <>
          <Note warn>泊位池以《泊位容量表》（2026-10-08）为唯一依据：共 23 个德信可用泊位。表外泊位（L1、L2、L3、L5、L9、L10 等）不建行；容量不按历史靠泊记录调整。</Note>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>泊位编码</th><th>码头</th><th style={{ textAlign: 'right' }}>容量吨级（吨）</th><th>泊位类别</th><th>状态<Info text="停用的泊位退出泊位余量的基数。" /></th><th>依据版本</th><th>备注</th><th /></tr></thead><tbody>
            {(berths ?? []).map((b) => <tr key={b.code}><td><b>{b.code}</b></td><td>{b.terminal}</td><td style={{ textAlign: 'right' }}>{fmt(b.capacity)}</td><td>{b.category || <span className="mut">待确认</span>}</td><td><span className={'tag ' + (b.status === '启用' ? 'green' : 'gray')}>{b.status}</span></td><td>{b.basis || '—'}</td><td>{b.note || <span className="mut">—</span>}</td>
              <td><button className="btn ghost" {...deny(can.master, '只有物流管理员和系统管理员能维护泊位')} onClick={() => toggle.mutate({ code: b.code, status: b.status === '启用' ? '停用' : '启用' }, { onSuccess: () => toast.success(b.code + (b.status === '启用' ? ' 已停用，退出泊位余量的基数' : ' 已启用，重新计入泊位余量的基数')) })}>{b.status === '启用' ? '停用' : '启用'}</button></td></tr>)}</tbody></table></div></>}

        {tab === 'vessel' && <>
          <div className="fbar"><input className="inp" placeholder="船名 / MMSI" value={kw} onChange={(e) => setKw(e.target.value.trim())} style={{ width: 220 }} /><button className={'chipf' + (noMmsi ? ' on' : '')} onClick={() => setNoMmsi(!noMmsi)}>只看缺 MMSI（{(vessels ?? []).filter((v) => !v.mmsi).length}）</button><span style={{ flex: 1 }} />
            <button className="btn primary" onClick={() => setVessel(null)}>新增船舶</button></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>船舶编号</th><th>MMSI<Info text="MMSI 必填且唯一；拖驳组合取拖轮的 MMSI。" /></th><th>IMO</th><th>标准船名</th><th>船名别名</th><th>船型</th><th style={{ textAlign: 'right' }}>载重吨 DWT</th><th style={{ textAlign: 'right' }}>船长（米）</th><th>吨级档<Info text="吨级档的划分还没有确认，暂不填写。" /></th><th /></tr></thead><tbody>
            {(vessels ?? []).filter((v) => match(v.name + (v.mmsi ?? '') + v.alias.join('')) && (!noMmsi || !v.mmsi)).map((v) => <tr key={v.id}><td>{v.id}</td><td>{v.mmsi || <span className="tag red">缺 MMSI</span>}</td><td>{v.imo || <span className="mut">—</span>}</td><td><b>{v.name}</b></td><td>{v.alias.join('、') || <span className="mut">—</span>}</td><td>{v.type}</td><td style={{ textAlign: 'right' }}>{fmt(v.dwt)}</td><td style={{ textAlign: 'right' }}>{v.length ?? '—'}</td><td><span className="mut">待确认</span></td>
              <td><button className="btn ghost" {...deny(role === '物流管理员' || role === '系统管理员', '只有物流管理员和系统管理员能修改船舶资料')} onClick={() => setVessel(v)}>编辑</button></td></tr>)}</tbody></table></div>
          <Note>船舶不能删除，只能改资料；业务员可以新增船舶，修改资料由物流管理员和系统管理员负责。</Note></>}

        {tab === 'route' && <>
          <div className="fbar"><span className="muted" style={{ fontSize: 12.5 }}>同航线实际样本 ≥ 5 条后，自动从「经验估算」切换为「历史统计」；每日自动重算一次。</span><span style={{ flex: 1 }} />
            {role === '系统管理员' && <button className="btn" disabled={recompute.isPending} onClick={() => recompute.mutate(null, { onSuccess: (r: any) => toast.success(`已重算 ${r.rules} 条规则，${r.changed} 条有变化`) })}>立即重算 P50 / P80</button>}
            <button className="btn primary" {...deny(can.route, '只有部门主管和系统管理员能维护经验航程')} onClick={() => setRule(null)}>新增规则</button></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>规则编号</th><th>装港 → 卸港</th><th>适用业务类型<Info text="物资备件船借用大宗采购船同一航线的样本。" /></th><th>吨级档</th><th>经验航程 / 上限（天）</th><th>样本数</th><th>统计 P50 / P80（天）</th><th>采用口径</th><th>生效航程（天）</th><th>状态</th><th /></tr></thead><tbody>
            {(rules ?? []).length ? (rules ?? []).map((r) => { const hist = r.samples >= 5; return <tr key={r.id}><td className="mono"><b>{r.id}</b></td><td><b>{zh(r.load)} → {zh(r.disch)}</b></td><td>{r.biz.join('、')}</td><td><span className="mut">未分档</span></td><td>{r.exp} / {r.expMax}</td>
              <td><span className="prog">{r.samples}<i><b className={hist ? 'ok' : ''} style={{ width: Math.min(100, (r.samples / 5) * 100) + '%' }} /></i><span className="mut">/ 5</span></span></td><td>{r.p50 != null ? `${r.p50} / ${r.p80}` : <span className="mut">—</span>}</td>
              <td>{hist ? <span className="tag blue">历史统计</span> : <span className="tag amber">经验估算</span>}</td><td><b>{r.effP50} / {r.effP80}</b></td><td><span className={'tag ' + ((r.status ?? '启用') === '启用' ? 'green' : 'gray')}>{r.status ?? '启用'}</span></td>
              <td><button className="btn ghost" {...deny(can.route, '没有修改权限')} onClick={() => setRule(r)}>编辑</button></td></tr>; }) : <tr><td colSpan={11}><Empty>还没有航程规则</Empty></td></tr>}</tbody></table></div>
          <Note>经验值冷启动：业务员先填常用航线的经验航程和上限，对应统计里的 P50（一半的船不超过）和 P80（八成的船不超过）。「吨级档」的枚举还没有确认，先不强制。</Note></>}
      </section>

      <PortModal cur={port} onClose={() => setPort(undefined)} />
      <VesselModal cur={vessel} onClose={() => setVessel(undefined)} />
      <RuleModal cur={rule} onClose={() => setRule(undefined)} ports={ports ?? []} zh={zh} />
    </div>
  );
}

function PortModal({ cur, onClose }: { cur: PortRowDto | null | undefined; onClose: () => void }) {
  const open = cur !== undefined, [f, setF] = useState({ code: '', cn: '', en: '', alias: '', country: COUNTRIES[0], region: '', kind: '外港', status: '启用' });
  useEffect(() => { if (open) setF({ code: cur?.code ?? '', cn: cur?.cn ?? '', en: cur?.en ?? '', alias: (cur?.alias ?? []).join('\n'), country: cur?.country ?? COUNTRIES[0], region: cur?.region ?? '', kind: cur?.kind ?? '外港', status: cur?.status ?? '启用' }); }, [cur, open]);
  const save = useWrite((b: Record<string, unknown>) => (cur ? api.patchPort(cur.en, b) : api.addPort(b)), [['ports']], '已保存');
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const submit = () => {
    if (!f.cn.trim() || !f.en.trim()) return toast.error('中文名称、英文标准名必填');
    const body: Record<string, unknown> = { code: f.code.trim(), cn: f.cn.trim(), alias: f.alias.split('\n').map((x) => x.trim()).filter(Boolean), country: f.country, region: f.region.trim(), kind: f.kind, status: f.status };
    if (!cur) body.en = f.en.trim();
    save.mutate(body, { onSuccess: onClose });
  };
  return (
    <Modal title={cur ? '编辑港口 · ' + cur.cn : '新增港口'} open={open} onClose={onClose} width={560} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending} onClick={submit}>保存</button></>}>
      <div className="row2"><div className="field"><div className="f-lab2">港口编码</div><input className="inp" value={f.code} onChange={(e) => set('code', e.target.value)} /></div><div className="field"><div className="f-lab2">状态</div><select className="inp" value={f.status} onChange={(e) => set('status', e.target.value)}><option>启用</option><option>停用</option></select></div></div>
      <div className="row2"><div className="field"><div className="f-lab2">中文名称</div><input className="inp" value={f.cn} onChange={(e) => set('cn', e.target.value)} /></div><div className="field"><div className="f-lab2">英文标准名</div><input className="inp" value={f.en} disabled={!!cur} onChange={(e) => set('en', e.target.value)} /></div></div>
      <div className="field"><div className="f-lab2">别名（一行一个旧写法）</div><textarea className="inp" value={f.alias} onChange={(e) => set('alias', e.target.value)} /></div>
      <div className="row2"><div className="field"><div className="f-lab2">国家</div><select className="inp" value={f.country} onChange={(e) => set('country', e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></div><div className="field"><div className="f-lab2">性质</div><select className="inp" value={f.kind} onChange={(e) => set('kind', e.target.value)}><option>内港</option><option>外港</option></select></div></div>
      <div className="field"><div className="f-lab2">地区</div><input className="inp" value={f.region} onChange={(e) => set('region', e.target.value)} /></div>
    </Modal>
  );
}

function VesselModal({ cur, onClose }: { cur: VesselDto | null | undefined; onClose: () => void }) {
  const open = cur !== undefined, [f, setF] = useState({ name: '', mmsi: '', imo: '', type: TYPES[0], dwt: '', length: '', alias: '' });
  useEffect(() => { if (open) setF({ name: cur?.name ?? '', mmsi: cur?.mmsi ?? '', imo: cur?.imo ?? '', type: cur?.type ?? TYPES[0], dwt: cur?.dwt ? String(cur.dwt) : '', length: cur?.length ? String(cur.length) : '', alias: (cur?.alias ?? []).join('、') }); }, [cur, open]);
  const save = useWrite((b: Record<string, unknown>) => (cur ? api.patchVessel(cur.id, b) : api.addVessel(b)), [['vessels']], '已保存');
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const submit = () => {
    if (!f.name.trim()) return toast.error('标准船名必填');
    if (!f.mmsi.trim()) return toast.error('MMSI 必填（一期手工更新 ETA 需要它定位船位）');
    save.mutate({ name: f.name.trim(), mmsi: f.mmsi.trim(), imo: f.imo.trim(), type: f.type, dwt: f.dwt || undefined, length: f.length || undefined, alias: f.alias.split(/[、,，]/).map((x) => x.trim()).filter(Boolean) }, { onSuccess: onClose });
  };
  return (
    <Modal title={cur ? '编辑船舶 · ' + cur.name : '新增船舶'} open={open} onClose={onClose} width={540} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending} onClick={submit}>保存</button></>}>
      <div className="row2"><div className="field"><div className="f-lab2">标准船名</div><input className="inp" value={f.name} placeholder="如 MV BENUA 777（不含承运方、航次号）" onChange={(e) => set('name', e.target.value)} /></div><div className="field"><div className="f-lab2">MMSI（必填，9 位数字）</div><input className="inp" value={f.mmsi} onChange={(e) => set('mmsi', e.target.value)} /></div></div>
      <div className="row2"><div className="field"><div className="f-lab2">IMO（7 位数字）</div><input className="inp" value={f.imo} onChange={(e) => set('imo', e.target.value)} /></div><div className="field"><div className="f-lab2">船型</div><select className="inp" value={f.type} onChange={(e) => set('type', e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div></div>
      <div className="row2"><div className="field"><div className="f-lab2">载重吨 DWT</div><input className="inp" type="number" value={f.dwt} onChange={(e) => set('dwt', e.target.value)} /></div><div className="field"><div className="f-lab2">船长（米）</div><input className="inp" type="number" value={f.length} onChange={(e) => set('length', e.target.value)} /></div></div>
      <div className="field"><div className="f-lab2">船名别名（顿号分隔）</div><input className="inp" value={f.alias} onChange={(e) => set('alias', e.target.value)} /></div>
    </Modal>
  );
}

function RuleModal({ cur, onClose, ports, zh }: { cur: RouteRuleDto | null | undefined; onClose: () => void; ports: PortRowDto[]; zh: (e?: string | null) => string }) {
  const open = cur !== undefined, [f, setF] = useState({ load: '', disch: 'BAHODOPI', exp: '', expMax: '', biz: ['大宗采购船'] as string[], status: '启用' });
  useEffect(() => { if (open) setF({ load: cur?.load ?? ports.find((p) => !p.isLocal)?.en ?? '', disch: cur?.disch ?? 'BAHODOPI', exp: cur ? String(cur.exp) : '', expMax: cur ? String(cur.expMax) : '', biz: cur?.biz ?? ['大宗采购船'], status: cur?.status ?? '启用' }); }, [cur, open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = useWrite((b: Record<string, unknown>) => (cur ? api.patchRule(cur.id, b) : api.addRule(b)), [['route-rules']], '已保存');
  const submit = () => {
    const a = Number(f.exp), b = Number(f.expMax);
    if (!(a > 0) || !(b >= a)) return toast.error('经验航程必须大于 0，且上限不能小于经验航程');
    if (!f.biz.length) return toast.error('至少选一个业务类型');
    if (!cur && f.load === f.disch) return toast.error('装港和卸港不能相同');
    save.mutate(cur ? { exp: a, expMax: b, biz: f.biz, status: f.status } : { load: f.load, disch: f.disch, exp: a, expMax: b, biz: f.biz, status: f.status }, { onSuccess: onClose });
  };
  const opts = ports.filter((p) => p.status === '启用').map((p) => <option key={p.en} value={p.en}>{zh(p.en)}</option>);
  return (
    <Modal title={cur ? '编辑航程规则 · ' + cur.id : '新增航程规则'} open={open} onClose={onClose} width={540} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={save.isPending} onClick={submit}>保存</button></>}>
      <div className="row2"><div className="field"><div className="f-lab2">装港</div><select className="inp" disabled={!!cur} value={f.load} onChange={(e) => setF({ ...f, load: e.target.value })}>{opts}</select></div><div className="field"><div className="f-lab2">卸港</div><select className="inp" disabled={!!cur} value={f.disch} onChange={(e) => setF({ ...f, disch: e.target.value })}>{opts}</select></div></div>
      <div className="row2"><div className="field"><div className="f-lab2">经验航程（天）</div><input className="inp" type="number" step="0.5" value={f.exp} onChange={(e) => setF({ ...f, exp: e.target.value })} /></div><div className="field"><div className="f-lab2">经验航程上限（天）</div><input className="inp" type="number" step="0.5" value={f.expMax} onChange={(e) => setF({ ...f, expMax: e.target.value })} /></div></div>
      <div className="field"><div className="f-lab2">适用业务类型</div><div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{BIZ_TYPES.map((b) => <label key={b}><input type="checkbox" checked={f.biz.includes(b)} onChange={(e) => setF({ ...f, biz: e.target.checked ? [...f.biz, b] : f.biz.filter((x) => x !== b) })} /> {b}</label>)}</div></div>
      {cur && <div className="field"><div className="f-lab2">状态</div><select className="inp" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>启用</option><option>停用</option></select></div>}
      {cur && <div style={{ color: 'var(--muted)', fontSize: 12 }}>样本 {cur.samples} 条{cur.samples >= 5 ? '，已使用历史统计，经验值仅作参考' : '，不足 5 条，仍使用这里填的经验值'}。</div>}
      {cur && <Tip text="装卸港是规则的身份，不能修改；要换航线请新增规则、停用旧规则。"><span className="mut" style={{ fontSize: 12 }}>为什么不能改航线？</span></Tip>}
    </Modal>
  );
}
