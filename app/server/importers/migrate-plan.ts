// 迁移 dry-run（W40 / A27）：把企微导出的三张表（商务海运船舶动态、大宗到船计划、大宗历史副本）按 docs/schema/migration-rules.md 清洗，
// 只产出「统计报告」和「待人工确认清单」，不写任何东西。纯函数，在 Leyinet 本机用 scripts/migrate-dryrun.ts 驱动。
// 报告只含统计、行号和规则编号；待确认清单里为了让人能判断，带上需要确认的原始写法（港口名、船名），写到单独文件，不要提交。
import { dedupeHistory, groupBulkRows, markPlaceholderTimes, normalizePort, splitDischargePorts, splitVesselName } from './migrate';
import { parseDateTime, parseNumber } from './common';

type Row = Record<string, unknown>;
export interface PortLite { en: string; cn: string; alias?: string[] }
export interface MigrateInput { ship: Row[]; bulk: Row[]; history: Row[]; ports: PortLite[] }
export interface ConfirmItem { rule: number; sheet: '商务海运' | '大宗' | '大宗历史副本'; row: number; value: string; note: string }

const BIZ_MAP: Record<string, string> = { 成品船: '成品销售船', 物资船: '物资备件船', 大宗船: '大宗采购船' };
const S = {
  type: '业务类型', vesselNo: '船次号', vesselName: '供应商/船名', load: '装港', disch: '卸港', tons: '货量（吨）', contract: '销售合同号', mmsi: 'MMSI',
  planLoad: '预计抵达装港日期', actLoad: '实际到港日期', dischArr: '实际卸港到达时间', planDisch: '预计卸港到达时间',
};
const B = {
  contract: '合同号Nomor.kontrak', vessel: '船名Nama.kapal', mmsi: 'MMSI', load: '装货港Loading Port', tons: '预计装船重量Perkiraan.berat.kapal', planS: '计划到达（始）Rencana.Mulai',
  actArr: '实际到达ETA.Aktual', berth: '靠港时间Sandar', dep: '离港时间Berangkat',
};
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const tonsOf = (v: unknown) => parseNumber(v)?.value ?? 0;
const day = (t: string | null) => (t ? t.slice(0, 10) : '');
const norm = (n: string) => n.toUpperCase().replace(/\s+/g, ' ').trim();
const monthOf = (d: string) => (d ? d.slice(0, 7) : '（无日期）');

export function planMigration(inp: MigrateInput) {
  const confirm: ConfirmItem[] = [];
  const add = (rule: number, sheet: ConfirmItem['sheet'], row: number, value: string, note: string) => confirm.push({ rule, sheet, row, value, note });
  const portsSeen = new Map<string, string | null>();                                    // 原始写法 → 英文标准名 / null
  const port = (raw: unknown, sheet: ConfirmItem['sheet'], row: number) => {
    const key = txt(raw); if (!key) return null;
    if (!portsSeen.has(key)) portsSeen.set(key, normalizePort(key, inp.ports).code);
    const code = portsSeen.get(key)!;
    if (!code) add(1, sheet, row, key, '港口写法没有匹配到港口主档或别名，请指定标准港口');
    return code;
  };

  // ---- 大宗（现表 + 历史副本）：先转成统一结构 ----
  const bulkRow = (r: Row, i: number, sheet: ConfirmItem['sheet']) => {
    const planS = parseDateTime(r[B.planS]), act = parseDateTime(r[B.actArr]);
    port(r[B.load], sheet, i + 1);
    return { line: i + 1, vessel: norm(txt(r[B.vessel])), contract: txt(r[B.contract]), mmsi: txt(r[B.mmsi]), tons: tonsOf(r[B.tons]), arrival: act || planS || '', actDischArr: act, dischBerth: parseDateTime(r[B.berth]), dischDep: parseDateTime(r[B.dep]) };
  };
  const cur = inp.bulk.map((r, i) => bulkRow(r, i, '大宗')), hist = inp.history.map((r, i) => bulkRow(r, i, '大宗历史副本'));
  const dd = dedupeHistory(cur, hist);
  dd.review.forEach((r) => add(12, '大宗历史副本', r.line, r.vessel, '合同号为空，无法判重：保留还是丢弃？'));
  const bulkAll = [...cur, ...dd.kept];
  const grouped = groupBulkRows(bulkAll);
  grouped.suspects.forEach((s) => add(5, '大宗', 0, s.vessel, `同船名到港日 ${s.dates.join(' / ')} 相差不超过 7 天，是同一航次还是两个航次？（${s.rows} 行）`));
  const placeholder = markPlaceholderTimes(bulkAll.map((r: any) => r));
  const phRows = bulkAll.filter((r: any) => r.placeholderTime);
  if (phRows.length) add(9, '大宗', 0, '（' + new Set(phRows.map((r: any) => r.contract)).size + ' 个合同）', `${phRows.length} 行到港/靠港/离港时间完全相同，疑似占位时间：迁移但不进统计样本`);
  bulkAll.filter((r) => !r.vessel).forEach((r) => add(5, '大宗', r.line, '', '船名为空，无法归并航次'));

  // ---- 商务海运 ----
  const shipRows = inp.ship.map((r, i) => {
    const biz = BIZ_MAP[txt(r[S.type])] ?? null, line = i + 1;
    if (!biz) add(0, '商务海运', line, txt(r[S.type]), '业务类型不是 成品船 / 物资船 / 大宗船');
    const nm = splitVesselName(txt(r[S.vesselName]));
    const load = port(r[S.load], '商务海运', line), dp = splitDischargePorts(txt(r[S.disch]), inp.ports);
    for (const p of [dp.disch, dp.disch2, ...dp.extra]) if (p) { if (!portsSeen.has(p.cleaned)) portsSeen.set(p.cleaned, p.code); if (!p.code) add(1, '商务海运', line, p.cleaned, '卸港写法没有匹配到港口主档或别名'); }
    if (dp.extra.length) add(2, '商务海运', line, txt(r[S.disch]), '卸港超过 2 个，只能存两个，请确认取舍');
    const contracts = txt(r[S.contract]).split(/[/、,，;；]/).map((s) => s.trim()).filter(Boolean);
    const arrival = parseDateTime(r[S.dischArr]) || parseDateTime(r[S.planDisch]) || parseDateTime(r[S.actLoad]) || parseDateTime(r[S.planLoad]) || '';
    return { line, biz, no: txt(r[S.vesselNo]), vessel: nm.vessel, carrier: nm.carrier, hadSplit: !!(nm.carrier || nm.voyage), mmsi: txt(r[S.mmsi]), load, tons: tonsOf(r[S.tons]), contracts, arrival, actDischArr: parseDateTime(r[S.dischArr]) };
  });
  shipRows.filter((r) => r.hadSplit && !r.vessel).forEach((r) => add(3, '商务海运', r.line, '', '船名拆分后为空'));
  // 同「船次号」归并；同船次号同合同重复行只算一次（CN643 这类重复）
  const ships = new Map<string, typeof shipRows>(), unkeyed: typeof shipRows = [];
  for (const r of shipRows) { if (!r.biz) continue; if (!r.no) { unkeyed.push(r); continue; } (ships.get(r.no) || ships.set(r.no, []).get(r.no)!).push(r); }
  unkeyed.forEach((r) => add(5, '商务海运', r.line, r.vessel, '船次号为空，无法归并航次：按单独航次处理还是补船次号？'));
  type V = { biz: string; arrival: string; lines: number; tons: number };
  const shipVoyages: V[] = []; let duplicateRows = 0, multiContractRows = 0, extraLines = 0, bigShipMatched = 0;
  const bulkMmsiDay = new Set(bulkAll.filter((r) => r.mmsi && r.arrival).map((r) => r.mmsi + '|' + day(r.arrival)));
  for (const [no, rows] of ships) {
    const seen = new Set<string>(), lineKeys: Array<{ c: string; tons: number }> = [];
    for (const r of rows) {
      const cs = r.contracts.length ? r.contracts : [''];
      if (r.contracts.length > 1) { multiContractRows++; extraLines += r.contracts.length - 1; add(6, '商务海运', r.line, no, `销售合同号拼接了 ${r.contracts.length} 份，货量 ${r.tons || '空'} 无法拆分时记在第一行`); }
      cs.forEach((c, k) => { const key = c || '#' + r.line; if (seen.has(key)) { duplicateRows++; return; } seen.add(key); lineKeys.push({ c, tons: k === 0 ? r.tons : 0 }); });
    }
    const first = rows[0];
    if (first.biz === '大宗采购船') {                                    // 商务海运表里的大宗船要对到大宗航次
      if (first.mmsi && first.arrival && bulkMmsiDay.has(first.mmsi + '|' + day(first.arrival))) { bigShipMatched++; continue; }
      add(5, '商务海运', first.line, no, '大宗船在大宗表里对不上（MMSI + 到港日）：新建航次还是补数据？');
    }
    shipVoyages.push({ biz: first.biz!, arrival: first.arrival, lines: lineKeys.length, tons: lineKeys.reduce((s, l) => s + l.tons, 0) });
  }
  const bigShipTotal = [...ships.values()].filter((rs) => rs[0].biz === '大宗采购船').length;

  // ---- 汇总 ----
  const byMonth = new Map<string, { voyages: number; lines: number; tons: number }>();
  const bump = (biz: string, arrival: string, lines: number, tons: number) => { const k = biz + '|' + monthOf(day(arrival)); const x = byMonth.get(k) || byMonth.set(k, { voyages: 0, lines: 0, tons: 0 }).get(k)!; x.voyages++; x.lines += lines; x.tons += tons; };
  grouped.voyages.forEach((g: any) => bump('大宗采购船', g.date, g.rows.length, g.rows.reduce((s: number, r: any) => s + r.tons, 0)));
  shipVoyages.forEach((v) => bump(v.biz, v.arrival, v.lines, v.tons));
  const rules: Record<number, number> = {}; confirm.forEach((c) => { rules[c.rule] = (rules[c.rule] || 0) + 1; });
  const unmatchedPorts = [...portsSeen].filter(([, v]) => !v).map(([k]) => k);
  const report = {
    sources: { 商务海运: inp.ship.length, 大宗: inp.bulk.length, 大宗历史副本: inp.history.length },
    ports: { 不同写法: portsSeen.size, 已匹配: portsSeen.size - unmatchedPorts.length, 未匹配: unmatchedPorts.length },
    history: { 保留: dd.kept.length, 与现表重叠丢弃: dd.dropped.length, 合同号为空待确认: dd.review.length },
    bulk: { 航次: grouped.voyages.length, 货物明细行: bulkAll.length - grouped.unkeyed, 无法归并的行: grouped.unkeyed, 疑似同航次拆分: grouped.suspects.length, 疑似占位时间行: placeholder },
    ship: { 航次: shipVoyages.length, 重复行已合并: duplicateRows, 多合同拆行: multiContractRows, 多出的明细行: extraLines, 无船次号: unkeyed.length, 大宗船总数: bigShipTotal, 大宗船已对上大宗航次: bigShipMatched },
    byMonth: [...byMonth].map(([k, v]) => { const [biz, month] = k.split('|'); return { 业务类型: biz, 月份: month, ...v, tons: Math.round(v.tons * 100) / 100 }; }).sort((a, b) => (a.业务类型 + a.月份).localeCompare(b.业务类型 + b.月份)),
    confirmByRule: rules,
  };
  return { report, confirm, unmatchedPorts };
}
