// 容量：CMR（泊位余量率，≤15 天，靠船计划）与同期船数（＞15 天，航次表）。
// 锁定规则：只用 CMR；分母按货量吨级匹配（只计容量 ≥ 货量的启用泊位）；只比日期；无数据 ≠ 0%；取消航次不计。
import { CONFIG } from '../config.js';
import { dn } from '../lib/dates.js';

/**
 * @param {object} data
 *   today: 'YYYY-MM-DD'
 *   berths: [{ code, terminal, capacity, status, ... }]       T02（23 个德信池泊位）
 *   planRows: [{ berth, inPool, start, end, eta, vessel, cargo, tons, matchVoyage? }]   T10 最新一期（start/end 为日期字符串）
 *   voyages: [{ id, flags[], winStart, winEnd, totalTons, vessel, load, disch, biz, localSide, status }]   航次表（本港侧窗口）
 */
export function createCapacity(data) {
  const today = dn(data.today), PATH_LIMIT = data.pathLimit ?? CONFIG.PATH_LIMIT;
  const enabled = data.berths.filter((b) => b.status === '启用');
  const caps = [...new Set(enabled.map((b) => b.capacity))].sort((a, b) => a - b);
  const needTier = (tons) => caps.find((c) => c >= tons) || null;           // 装得下该货量的最小泊位吨级

  function poolFor(tons) {
    const list = enabled.filter((b) => b.capacity >= tons);                  // 只计容量 ≥ 货量的启用泊位
    return { list, ids: new Set(list.map((b) => b.code)), n: list.length, tier: needTier(tons) };
  }

  const rows = data.planRows.map((r) => Object.assign({}, r, { s: dn(r.start), e: dn(r.end) }));
  const planCoverTo = rows.length ? Math.max(...rows.map((r) => r.s)) : -Infinity;   // 靠船计划覆盖到批次内最后一条预计靠泊日
  const cancelledVoy = data.voyages.filter((v) => (v.flags || []).includes('取消'));
  const voyages = data.voyages.filter((v) => !(v.flags || []).includes('取消')).map((v) => Object.assign({}, v, { s: dn(v.winStart), e: dn(v.winEnd), tier: needTier(v.totalTons) }));
  const voyHorizon = voyages.length ? Math.max(...voyages.map((v) => v.e)) : -Infinity;   // 航次表计划覆盖到最晚窗口止

  function cmrDay(d, P) {
    if (d > planCoverTo) return { state: 'nodata' };                         // 无数据 ≠ 0%
    const occ = new Set();
    rows.forEach((r) => { if (r.inPool && P.ids.has(r.berth) && r.s <= d && d <= r.e) occ.add(r.berth); });
    return { state: 'ok', occ: occ.size, n: P.n, cmr: (P.n - occ.size) / P.n, occBerths: [...occ] };
  }
  function densityDay(d, P) {
    if (d > voyHorizon) return { state: 'nodata' };
    const ships = voyages.filter((v) => v.tier >= P.tier && v.s <= d && d <= v.e);   // 只计与该吨级泊位竞争的船
    return { state: 'ok', count: ships.length, n: P.n, ships };
  }
  const dayFn = (mode) => (mode === 'cmr' ? cmrDay : densityDay);
  const modeOf = (d) => (d - today <= PATH_LIMIT ? 'cmr' : 'density');       // 只按日期分流，不看有没有数据

  /** 港口容量日历（A20） */
  function calendar(tons, days = CONFIG.CAL_DAYS) {
    const P = poolFor(tons), out = [];
    for (let i = 0; i < days; i++) {
      const d = today + i, mode = modeOf(d);
      out.push(Object.assign({ d, i, mode, dist: i }, P.n ? dayFn(mode)(d, P) : { state: 'nodata' }));
    }
    return { P, days: out };
  }

  /** 某一天的船只明细（点击日历用） */
  function dayDetail(d, tons) {
    const P = poolFor(tons), mode = modeOf(d), info = dayFn(mode)(d, P);
    if (info.state !== 'ok') return { d, mode, state: 'nodata', P, list: [] };
    let list;
    if (mode === 'cmr') {
      list = rows.filter((r) => r.inPool && P.ids.has(r.berth) && r.s <= d && d <= r.e).map((r) => ({
        vessel: r.vessel, berth: r.berth, cargo: r.cargo, tons: r.tons, eta: dn(r.eta), start: r.s, end: r.e,
        arriving: dn(r.eta) === d, berthing: r.s === d }));
    } else {
      list = info.ships.map((v) => ({ vessel: v.vessel, id: v.id, load: v.load, disch: v.disch, biz: v.biz, tons: v.totalTons,
        start: v.s, end: v.e, status: v.status, side: v.localSide, arriving: v.s === d }));
    }
    list.sort((a, b) => (!!b.arriving - !!a.arriving) || (!!b.berthing - !!a.berthing) || (a.start - b.start));
    return Object.assign({ d, mode, state: 'ok', P, list }, mode === 'cmr' ? { cmr: info.cmr, occ: info.occ } : { count: info.count });
  }

  return { today, PATH_LIMIT, poolFor, needTier, cmrDay, densityDay, dayFn, modeOf, calendar, dayDetail, planCoverTo, voyHorizon, cancelledVoy, rows, voyages };
}
