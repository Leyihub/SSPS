// 宣船文案：只引用引擎结果，不改写数值（锁定规则 10）。
// 返回片段数组：v=true 的片段是引擎数值（页面高亮、只读）；其余是固定模板措辞（待业务确认）。
import { iso, md } from '../lib/dates.js';

/** @param {(en:string)=>string} portName 港口英文名 → 中文简称 */
export function announce(res, plan, portName = (x) => x || '未说明') {
  const i = res.input, P = res.pool, rule = res.run.rule, v = (t) => ({ t: String(t), v: true }), s = (t) => ({ t });
  const pct = (x) => Math.round(x * 1000) / 10 + '%';
  const out = [s('【宣船】' + i.biz + ' · '), v(Number(i.tons).toLocaleString('en-US') + ' 吨'), s(' · ' + portName(i.load) + ' → ' + portName(i.disch) + '。方案' + plan.label + '：')];
  if (i.biz !== '成品销售船') {
    if (plan.depart != null) out.push(s('建议发船日 '), v(iso(plan.depart)), s('（离开装港），'));
    out.push(s('计划到' + portName(i.disch) + '的窗口 '), v(md(plan.c.s) + ' ~ ' + md(plan.c.e)), s('；'));
  } else {
    out.push(s('建议装船窗口 '), v(md(plan.c.s) + ' ~ ' + md(plan.c.e)), s('，最晚装船日 '), v(iso(plan.deadline)), s('；'));
  }
  if (plan.mode === 'cmr') out.push(s('窗口内最低泊位余量 '), v(pct(plan.c.metric)), s('（能装下的泊位 '), v(P.n + ' 个'), s('）；'));
  else out.push(s('窗口内同期最多 '), v(plan.c.metric + ' 艘'), s(' 船（能装下的泊位 '), v(P.n + ' 个'), s('）；'));
  if (plan.stock && res.stock) {
    const st = res.stock;
    out.push(s('按库存消耗模拟，' + st.item.name + '断料日 '), v(st.so != null ? iso(st.so) : '模拟期内不断料'), s('，本方案到港时库存可用 '), v(plan.stock.daysAfter + ' 天'), s(plan.stock.state === 'out' ? '，到港前预计断料 ' : '；'), ...(plan.stock.state === 'out' ? [v(plan.stock.gap + ' 天'), s('；')] : []));
  }
  if (rule && i.biz !== '成品销售船') out.push(s('航程按' + (rule.basis === '经验值' ? '经验估算' : '历史统计') + ' '), v(Math.ceil(rule.effP50) + '～' + Math.ceil(rule.effP80) + ' 天'), s('；'));
  if (plan.trust === '低可信') out.push(s('本方案数据不完整，请谨慎采用；'));
  if (i.biz === '成品销售船' && plan.custEta) out.push(s('到客户港预计 '), v(md(plan.custEta[0]) + ' ~ ' + md(plan.custEta[1])), s('（仅供参考）；'));
  out.push(s('以上数值由规则计算得出，文案未改写。'));
  return out;
}
