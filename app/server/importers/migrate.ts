// 一次性迁移的清洗规则（docs/schema/migration-rules.md）。全部是纯函数：脚本在 Leyinet 本机读真实 Excel，
// 调用这些函数，产出「写入清单」和「待人工确认清单」；无法自动判定的记录进清单，不进表。
import { dn } from '../lib/dates';

/** 1. 港口归一：去掉括号内备注、首尾空格和多余空白后，匹配 T01 英文标准名、中文名和别名。未匹配返回 code=null，进待确认清单 */
export function normalizePort(raw, ports) {
  const cleaned = String(raw ?? '').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { raw, cleaned, code: null };
  const key = cleaned.toLowerCase();
  const hit = ports.find((p) => [p.en, p.cn.replace(/（.*?）/g, ''), ...(p.alias || [])].some((n) => String(n).toLowerCase() === key));
  return { raw, cleaned, code: hit ? hit.en : null };
}

/** 2. 多卸港：「JAKARTA+SURABAYA」拆为卸港 + 第二卸港 */
export function splitDischargePorts(raw, ports) {
  const parts = String(raw ?? '').split(/[+＋/、,，]/).map((s) => s.trim()).filter(Boolean).map((s) => normalizePort(s, ports));
  return { disch: parts[0] || null, disch2: parts[1] || null, extra: parts.slice(2) };
}

/** 3. 船名拆分：「承运方/船名 VOY. xxx」按斜杠和 VOY 关键字拆成承运方、标准船名、船方航次号 */
export function splitVesselName(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim(), carrier = '', voyage = '';
  const vm = s.match(/\s*\bVOY\.?\s*([A-Z0-9-]+)\s*$/i);
  if (vm) { voyage = vm[1]; s = s.slice(0, vm.index).trim(); }
  const slash = s.indexOf('/');
  if (slash > 0) { carrier = s.slice(0, slash).trim(); s = s.slice(slash + 1).trim(); }
  return { carrier, vessel: s.toUpperCase().replace(/\s+/g, ' '), voyage };
}

/** 5. 航次归并（大宗）：按「标准船名 + 实际到达（无则计划到达始）」归并为一个航次；
 *  同船名、到港日相差不超过 windowDays（默认 7）的不同组不自动合并，列入确认清单（跨零点录入、部分行漏填实际到港都会造成这种拆分）。 */
export function groupBulkRows(rows, windowDays = 7) {
  const keyed = rows.map((r) => ({ r, vessel: r.vessel, date: String(r.arrival || '').slice(0, 10) })).filter((x) => x.vessel && x.date);
  const groups = new Map();
  keyed.forEach((x) => { const k = x.vessel + '|' + x.date; (groups.get(k) || groups.set(k, { vessel: x.vessel, date: x.date, rows: [] }).get(k)).rows.push(x.r); });
  const list = [...groups.values()], byVessel = new Map();
  list.forEach((g) => (byVessel.get(g.vessel) || byVessel.set(g.vessel, []).get(g.vessel)).push(g));
  const suspects = [];
  byVessel.forEach((gs, vessel) => {
    gs.sort((a, b) => dn(a.date) - dn(b.date));
    for (let i = 1; i < gs.length; i++) if (dn(gs[i].date) - dn(gs[i - 1].date) <= windowDays) suspects.push({ vessel, dates: [gs[i - 1].date, gs[i].date], rows: gs[i - 1].rows.length + gs[i].rows.length });
  });
  return { voyages: list, suspects, unkeyed: rows.length - keyed.length };
}

/** 12. 去重：历史副本与现表重叠，按「合同号 + 标准船名」判重（不含到港日：副本拍快照时可能还是计划日期），保留现表；
 *  合同号为空的行不自动判重，进确认清单。 */
export function dedupeHistory(current, history) {
  const k = (r) => (r.contract ? String(r.contract).trim() + '|' + r.vessel : null);
  const seen = new Set(current.map(k).filter(Boolean)), kept = [], dropped = [], review = [];
  history.forEach((r) => { const key = k(r); if (!key) review.push(r); else if (seen.has(key)) dropped.push(r); else kept.push(r); });
  return { kept, dropped, review };
}

/** 9. 疑似占位时间：同一合同下多行的到港、靠港、离港时间戳完全相同，且行数占该合同大多数 → 迁移但不进统计样本 */
export function markPlaceholderTimes(rows, minSame = 5) {
  const by = new Map();
  rows.forEach((r) => { if (!r.contract) return; const sig = [r.actDischArr, r.dischBerth, r.dischDep].join('|'); const k = r.contract + '|' + sig; (by.get(k) || by.set(k, []).get(k)).push(r); });
  let n = 0;
  by.forEach((g) => { if (g.length >= minSame) g.forEach((r) => { r.placeholderTime = true; n++; }); });
  return n;
}
