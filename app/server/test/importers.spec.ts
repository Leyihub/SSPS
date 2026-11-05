import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDateTime, parseNumber, parseShortDate, normalizeBerth } from '../importers/common';
import { normalizeBerthPlan, toEngineRows } from '../importers/imipPlan';
import { buildInventory } from '../importers/inventory';
import { normalizePort, splitDischargePorts, splitVesselName, groupBulkRows, dedupeHistory, markPlaceholderTimes } from '../importers/migrate';
import { createEngine } from '../engine';

const POOL = ['F1', 'F2', 'F3', 'L4', 'L12', 'LN17'];

test('清洗小工具：日期、数值、无年份日期、泊位写法', () => {
  assert.equal(parseDateTime('2026/11/04 07:30'), '2026-11-04 07:30');
  assert.equal(parseDateTime(new Date(Date.UTC(2026, 10, 4, 7, 30))), '2026-11-04 07:30');
  assert.equal(parseDateTime(46330.5), '2026-11-04 12:00');
  assert.equal(parseDateTime('/'), null); assert.equal(parseDateTime(''), null); assert.equal(parseDateTime(12), null);
  assert.deepEqual(parseNumber('$8,010.11'), { value: 8010.11, unit: null, currency: 'USD' });
  assert.deepEqual(parseNumber('Rp35,000,000/天'), { value: 35000000, unit: '/天', currency: 'IDR' });
  assert.equal(parseNumber('12000吨/天').unit, '吨/天'); assert.equal(parseNumber('180车').value, 180); assert.equal(parseNumber('10%').unit, '%');
  for (const x of ['计算错误', '/', '-', '#VALUE!', null]) assert.equal(parseNumber(x), null);
  assert.equal(parseShortDate('3.17日发出', 2026), '2026-03-17');
  assert.deepEqual(normalizeBerth('LN17/LN18', POOL), { raw: 'LN17/LN18', codes: ['LN17'], inPool: true });
  assert.deepEqual(normalizeBerth('LabotaT 4号码头', POOL).codes, ['L4']);
  assert.deepEqual(normalizeBerth('F13', POOL), { raw: 'F13', codes: ['F13'], inPool: false });          // 表外泊位：保留，不计入池
  assert.equal(normalizeBerth('L12A', POOL).codes[0], 'L12');
  assert.equal(normalizeBerth('', POOL).inPool, false);
});

const TODAY = '2026-11-04';
const R = (o) => ({ 码头: '北区码头', 泊位: 'F1', 船名: 'MV T', 船舶类型: '散货船', 物资名称: '煤', 吨位: 50000, 从属单位: '德信', 预计到港日期: '2026-11-05', 预计靠泊时间: '2026-11-06 08:00', 预计卸完时间: '2026-11-09 18:00', ...o });
test('靠船计划导入：已卸完、日期异常、越界、池外分别归类；覆盖到最后一条预计靠泊日', () => {
  const rows = [R({}), R({ 泊位: 'L4', 预计靠泊时间: '2026-11-20 08:00', 预计卸完时间: '2026-11-25 08:00', 预计到港日期: '2026-11-19' }),
    R({ 预计到港日期: '2026-08-01', 预计靠泊时间: '2026-08-02', 预计卸完时间: '2026-08-06' }),            // 已卸完的历史行
    R({ 预计到港日期: '2029-10-25', 预计靠泊时间: '2026-11-06', 预计卸完时间: '2026-11-09' }),            // 越界
    R({ 预计靠泊时间: '2026-11-09 08:00', 预计卸完时间: '2026-11-07' }),                                  // 卸完早于靠泊
    R({ 预计卸完时间: '' }),                                                                              // 缺日期
    R({ 泊位: 'L1', 船舶类型: '销售成品船' })];                                                           // 池外泊位
  const res = normalizeBerthPlan(rows, { importDate: TODAY, poolCodes: POOL });
  assert.deepEqual(res.rows.map((r) => r.status), ['active', 'active', 'history', 'anomaly', 'anomaly', 'anomaly', 'active']);
  assert.deepEqual(res.summary.anomalies.map((a) => a.code), ['DATE_OUT_OF_RANGE', 'DATE_INVERTED', 'DATE_MISSING']);
  assert.deepEqual([res.summary.total, res.summary.active, res.summary.history, res.summary.offPool], [7, 3, 1, 1]);
  assert.equal(res.coverTo, '2026-11-20');
  assert.equal(res.rows[6].shipType, '成品销售船', '销售成品船按 T04 枚举归一');
  assert.equal(toEngineRows(res).length, 3);
});
test('靠船计划：导入的行可直接喂给引擎，池内非德信船照样计入占用', () => {
  const res = normalizeBerthPlan([R({ 从属单位: '外部单位', 预计靠泊时间: '2026-11-06', 预计卸完时间: '2026-11-08' }), R({ 泊位: 'F2', 预计靠泊时间: '2026-11-12', 预计卸完时间: '2026-11-13' })], { importDate: TODAY, poolCodes: POOL });
  const berths = POOL.map((code) => ({ code, terminal: '北区码头', capacity: 50000, status: '启用' }));
  const E = createEngine({ today: TODAY, berths, planRows: toEngineRows(res), voyages: [], routeRules: [] });
  assert.equal(E.cmrDay(E.today + 3, E.poolFor(50000)).occ, 1);
});

test('库存表导入：错误值行不进序列；可用天数取原表值；覆盖期单独记录', () => {
  const mk = (d, s, dl, av) => ({ 导入日期: '2026/11/04', 库存日期: d, 品名: '铁矿总库存', 物料类型: '铁矿', 日耗: dl, 库存: s, 可用天数: av });
  const rows = [mk('2026/11/03', 958635, 15491, 37), mk('2026/11/04', 930000, 25790, 36), mk('2026/11/05', 904210, 25790, 35), mk('2026/11/06', '#VALUE!', 25790, '#VALUE!'), { ...mk('2026/11/04', 100, 10, 5), 品名: '焦炭', 物料类型: '焦煤' }];
  const r = buildInventory(rows, { today: TODAY });
  const fe = r.items.find((i) => i.name === '铁矿总库存');
  assert.deepEqual([fe.stock, fe.days, fe.daysEstimated, fe.series.length, fe.errorCount], [930000, 36, false, 3, 1]);
  assert.equal(fe.validUntil - fe.series[0][0], 2);
  assert.deepEqual([r.summary.rows, r.summary.errorRows, r.summary.importDate], [5, 1, '2026-11-04']);
  const hang = buildInventory([{ 导入日期: '2026/11/04', 库存日期: '2026/11/04', 品名: 'X', 物料类型: '辅料', 日耗: 100, 库存: 1000, 可用天数: null }], { today: TODAY }).items[0];
  assert.deepEqual([hang.days, hang.daysEstimated], [10, true], '原表没有可用天数时用库存÷日耗，并标注为估算');
});

const PORTS = [{ en: 'JAKARTA', cn: '雅加达', alias: ['Jakarta Port'] }, { en: 'SURABAYA', cn: '泗水' }, { en: 'BAHODOPI', cn: '巴浩多比（IMIP）', alias: ['IMIP'] }];
test('迁移规则：港口归一、多卸港、船名拆分', () => {
  assert.equal(normalizePort('BAHODOPI（预计8月9日抵港）', PORTS).code, 'BAHODOPI');
  assert.equal(normalizePort('  jakarta   port ', PORTS).code, 'JAKARTA');
  assert.equal(normalizePort('NOWHERE', PORTS).code, null);
  const s = splitDischargePorts('JAKARTA+SURABAYA', PORTS); assert.deepEqual([s.disch.code, s.disch2.code], ['JAKARTA', 'SURABAYA']);
  assert.deepEqual(splitVesselName('PT ABC / km. benua 777  VOY. 12A'), { carrier: 'PT ABC', vessel: 'KM. BENUA 777', voyage: '12A' });
  assert.deepEqual(splitVesselName('MV OCEAN LARK'), { carrier: '', vessel: 'MV OCEAN LARK', voyage: '' });
});
test('迁移规则：航次归并（7 天内的相邻组进确认清单）、历史副本去重、占位时间', () => {
  const rows = [{ vessel: 'MV A', arrival: '2026-08-10 23:50' }, { vessel: 'MV A', arrival: '2026-08-10 23:50' }, { vessel: 'MV A', arrival: '2026-08-11 00:10' },
    { vessel: 'MV B', arrival: '2026-08-10' }, { vessel: 'MV B', arrival: '2026-09-30' }, { vessel: 'MV C', arrival: '' }];
  const g = groupBulkRows(rows);
  assert.equal(g.voyages.length, 4); assert.equal(g.unkeyed, 1);
  assert.deepEqual(g.suspects.map((x) => x.vessel), ['MV A']);                 // A 的 8/10 与 8/11 相差 1 天，不自动合并；B 相差 50 天，正常分开
  const d = dedupeHistory([{ contract: 'C1', vessel: 'MV A' }], [{ contract: 'C1', vessel: 'MV A' }, { contract: 'C2', vessel: 'MV A' }, { contract: '', vessel: 'MV A' }]);
  assert.deepEqual([d.kept.length, d.dropped.length, d.review.length], [1, 1, 1]);
  const same = Array.from({ length: 6 }, () => ({ contract: 'X', actDischArr: '2026-05-19 08:54', dischBerth: '2026-05-19 08:54', dischDep: '2026-05-19 08:54' }));
  same.push({ contract: 'X', actDischArr: '2026-05-20', dischBerth: '2026-05-21', dischDep: '2026-05-22' });
  assert.equal(markPlaceholderTimes(same), 6); assert.equal(same[6].placeholderTime, undefined);
});
