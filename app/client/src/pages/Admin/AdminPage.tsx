import { useState } from 'react';
import { useMe, useHealth, useSyncLogs } from '../../ssps/api';
import { fmt, mdh } from '../../ssps/format';
import { Empty, Loading } from '../../ssps/ui';
import './p10.css';

const TABS: Array<[string, string]> = [['log', '同步日志'], ['compat', '兼容表'], ['mig', '迁移 dry-run'], ['health', '连通性自检']];
const tag = (r: string) => <span className={'tag ' + (r === '成功' || r === '正常' ? 'green' : r === '失败' || r === '异常' ? 'red' : 'amber')}>{r}</span>;

export default function AdminPage() {
  const { data: me } = useMe(), [tab, setTab] = useState('log'), [failOnly, setFailOnly] = useState(false);
  const admin = me?.role === '系统管理员';
  const logs = useSyncLogs(failOnly, admin && tab === 'log'), health = useHealth(admin && tab === 'health');
  if (!me) return <Loading />;
  return (
    <div className="pg-p10">
      <div className="ptitle"><div><h1>系统管理</h1><p>只有系统管理员能看到。同步运行情况、兼容表刷新、数据迁移和连通性自检。</p></div></div>
      <section className="card"><div className="tabs2">{TABS.map(([k, l]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        {!admin ? <div className="denied"><b style={{ fontSize: 16, color: 'var(--text)' }}>没有权限</b><br />系统管理页只对系统管理员开放。</div> : (
          <>
            {tab === 'log' && <>
              <div className="fbar"><button className={'chipf' + (failOnly ? ' on' : '')} onClick={() => setFailOnly(!failOnly)}>只看失败</button><span className="muted" style={{ fontSize: 12.5 }}>导入靠船计划和库存、航程重算的运行记录；写飞书、生成兼容表、拉取云空间接入后同样记在这里。</span></div>
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>任务类型</th><th>开始</th><th>结束</th><th style={{ textAlign: 'right' }}>条数</th><th>结果</th><th>说明</th></tr></thead><tbody>
                {logs.data?.length ? logs.data.map((x, i) => <tr key={i}><td><b>{x.type}</b></td><td>{mdh(x.start)}</td><td>{mdh(x.end)}</td><td style={{ textAlign: 'right' }}>{fmt(x.n)}</td><td>{tag(x.ok)}</td><td className="wrap">{x.err || <span style={{ color: 'var(--faint)' }}>—</span>}</td></tr>) : <tr><td colSpan={6}><Empty>{failOnly ? '没有失败记录' : '还没有运行记录'}</Empty></td></tr>}</tbody></table></div></>}

            {tab === 'compat' && <div className="pad"><div className="cols">
              {[['T09a', '兼容_商务海运船舶动态', '成品销售船，保留旧表原 33 列的列名和顺序'], ['T09b', '兼容_大宗到船计划', '大宗采购船，保留旧表原 87 列的列名和顺序，一合同一行']].map(([k, n, d]) => (
                <div className="card cc" key={k}><h3>{n}（{k}）</h3><div className="sub">给综合物流平台用的旧结构表。</div>
                  <div className="kv"><span>每行对应</span><span>一份货物明细（一合同一行）</span><span>列结构</span><span>{d}</span><span>定时</span><span>每日 15:50 全量重写 + 航次保存后增量</span><span>谁能改</span><span>任何人都不能改，只由后端生成</span><span>当前状态</span><b>未接入</b></div>
                  <button className="btn" disabled title="兼容表刷新（A26）依赖真实的飞书写入，尚未开发">手动刷新</button></div>))}</div>
              <div className="warnbox" style={{ margin: '14px 0 0' }}>兼容表刷新（A26）要等航次写入飞书之后才能做，目前<b>还没有开发</b>。综合物流平台先把数据源换成兼容表，并行比对 2 周，再正式切换，避免大屏断数。</div></div>}

            {tab === 'mig' && <div className="pad">
              <div className="warnbox" style={{ margin: '0 0 12px' }}>迁移在<b>本机</b>运行（要读企微导出的真实 Excel，原始文件不上传、不提交）。跑完 dry-run 后只回传统计数和待确认清单，确认后再正式写入；这里将显示最近一次 dry-run 的报告。迁移接口（A27）<b>还没有开发</b>。</div>
              <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>迁移步骤</h3>
              <table className="tbl"><tbody>{[['1', 'dry-run', '读 Excel、清洗、出报告：各业务类型航次数与货量合计、被归并或剔除的行及原因、待确认清单'], ['2', '人工确认', '物流管理员确认港口别名、船舶匹配、人员映射；清单清零后才能写入'], ['3', '正式写入', '经写队列写飞书，按批次标记，可续跑、可回滚'], ['4', 'G1 对账', '按业务类型、月份对比新旧航次数和货量，差异只允许来自已确认的归并/剔除']].map(([n, t, d]) => <tr key={n}><td className="mono"><b>{n}</b></td><td><b>{t}</b></td><td className="wrap">{d}</td></tr>)}</tbody></table></div>}

            {tab === 'health' && <>
              <div className="fbar"><button className="btn primary" disabled={health.isFetching} onClick={() => health.refetch()}>{health.isFetching ? '检测中…' : '重新检测'}</button><span className="muted" style={{ fontSize: 12.5 }}>检查飞书令牌、多维表格、云空间文件夹、应用数据库和兼容表。{health.data && ` 检测时间 ${health.data.at}`}</span></div>
              {health.data?.checks.map((h) => <div className="hc" key={h.name}>{tag(h.status)}<div className="n"><b>{h.name}</b><span>{h.detail}</span></div></div>)}</>}
          </>
        )}
      </section>
    </div>
  );
}
