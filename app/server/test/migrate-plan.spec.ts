// 迁移 dry-run：清洗规则的组合结果（统计 + 待确认清单），全部用虚构的小样本；可重复运行、结果一致
import test from 'node:test';
import assert from 'node:assert/strict';
import { planMigration } from '../importers/migrate-plan';

const ports = [{ en: 'SURIGAO', cn: '苏里高', alias: ['SURIGAO CITY'] }, { en: 'BAHODOPI', cn: '巴侯多比' }, { en: 'JAKARTA', cn: '雅加达' }, { en: 'SURABAYA', cn: '泗水' }, { en: 'SINGAPORE', cn: '新加坡' }];
const bulk = (o: Record<string, unknown>) => ({ '合同号Nomor.kontrak': 'C1', '船名Nama.kapal': 'MV A', MMSI: '412000001', '装货港Loading Port': 'SURIGAO', '预计装船重量Perkiraan.berat.kapal': 1000, '计划到达（始）Rencana.Mulai': '2026-10-01', '实际到达ETA.Aktual': '2026-10-02 08:00', ...o });
const ship = (o: Record<string, unknown>) => ({ 业务类型: '成品船', 船次号: 'CN1', '供应商/船名': '甲航运/MV X VOY. 12', 装港: 'BAHODOPI', 卸港: 'JAKARTA+SURABAYA', '货量（吨）': 5000, 销售合同号: 'S1', MMSI: '', 实际卸港到达时间: '2026-10-20 08:00', ...o });

const input = () => ({
  ports,
  bulk: [
    bulk({}), bulk({ '合同号Nomor.kontrak': 'C2' }), bulk({ '合同号Nomor.kontrak': 'C3' }),                                                        // MV A 同一天三行 → 1 航次 3 明细
    bulk({ '船名Nama.kapal': 'MV B', '合同号Nomor.kontrak': 'B1', '实际到达ETA.Aktual': '2026-10-05 08:00', MMSI: '412000002' }),
    bulk({ '船名Nama.kapal': 'MV B', '合同号Nomor.kontrak': 'B2', '实际到达ETA.Aktual': '2026-10-09 08:00', MMSI: '412000002' }),                // 相差 4 天 → 疑似同航次
    ...[1, 2, 3, 4, 5].map((i) => bulk({ '船名Nama.kapal': 'MV C', '合同号Nomor.kontrak': 'G1', '实际到达ETA.Aktual': '2026-09-19 08:54', '靠港时间Sandar': '2026-09-19 08:54', '离港时间Berangkat': '2026-09-19 08:54', 'x': i })),
    bulk({ '船名Nama.kapal': 'MV D', '合同号Nomor.kontrak': 'D1', '装货港Loading Port': 'Nowhere Port' }),
  ],
  history: [bulk({}), bulk({ '合同号Nomor.kontrak': '', '船名Nama.kapal': 'MV E' }), bulk({ '合同号Nomor.kontrak': 'H9', '船名Nama.kapal': 'MV H', '实际到达ETA.Aktual': '2026-03-01' })],
  ship: [
    ship({}), ship({}),                                                                                                                               // 重复行
    ship({ 船次号: 'CN2', 销售合同号: 'S2/S3', '货量（吨）': 8000 }),                                                                                  // 多合同
    ship({ 业务类型: '物资船', 船次号: '', '供应商/船名': 'MV Y' }),
    ship({ 业务类型: '大宗船', 船次号: 'DZ1', MMSI: '412000001', 实际卸港到达时间: '2026-10-02 10:00', 卸港: 'BAHODOPI' }),                           // 对得上大宗航次
    ship({ 业务类型: '大宗船', 船次号: 'DZ2', MMSI: '999', 卸港: 'BAHODOPI' }),                                                                         // 对不上
    ship({ 业务类型: '怪', 船次号: 'X' }), ship({ 船次号: 'CN3', 卸港: 'MARS' }),
  ],
});

test('dry-run 报告：各规则的统计和待确认清单', () => {
  const { report: r, confirm, unmatchedPorts } = planMigration(input());
  assert.deepEqual(r.sources, { 商务海运: 8, 大宗: 11, 大宗历史副本: 3 });
  assert.deepEqual(r.history, { 保留: 1, 与现表重叠丢弃: 1, 合同号为空待确认: 1 });                           // H9 保留；C1+MV A 与现表重叠丢弃；空合同号待确认
  assert.equal(r.bulk.航次, 6, 'MV A、MV B×2、MV C、MV D、MV H'); assert.equal(r.bulk.疑似同航次拆分, 1); assert.equal(r.bulk.疑似占位时间行, 5);
  assert.equal(r.ship.重复行已合并, 1); assert.equal(r.ship.多合同拆行, 1); assert.equal(r.ship.多出的明细行, 1); assert.equal(r.ship.无船次号, 1);
  assert.deepEqual([r.ship.大宗船总数, r.ship.大宗船已对上大宗航次], [2, 1]);
  assert.deepEqual(unmatchedPorts.sort(), ['MARS', 'Nowhere Port']);
  assert.equal(r.ports.未匹配, 2);
  const has = (rule: number, re: RegExp) => confirm.some((c) => c.rule === rule && re.test(c.note + c.value));
  assert.ok(has(1, /Nowhere/)); assert.ok(has(1, /MARS/)); assert.ok(has(5, /相差不超过 7 天/)); assert.ok(has(5, /对不上/)); assert.ok(has(5, /船次号为空/));
  assert.ok(has(6, /拼接了 2 份/)); assert.ok(has(9, /占位/)); assert.ok(has(12, /合同号为空/)); assert.ok(has(0, /怪/));
});

test('按业务类型和月份汇总航次数、明细行数和货量（G1 对账用）', () => {
  const { report } = planMigration(input());
  const get = (biz: string, m: string) => report.byMonth.find((x) => x.业务类型 === biz && x.月份 === m);
  assert.deepEqual(get('大宗采购船', '2026-10'), { 业务类型: '大宗采购船', 月份: '2026-10', voyages: 5, lines: 7, tons: 11000 });     // MV A(3 行 3000)+MV B×2(2000)+MV D(1000)+对不上大宗表的大宗船 DZ2(5000，待确认后新建)
  assert.equal(get('成品销售船', '2026-10')!.voyages, 3);
});

test('可重复运行：同样的输入得到完全相同的报告和清单；输入不被修改', () => {
  const a = input(), snap = JSON.stringify(a);
  const r1 = planMigration(a), r2 = planMigration(input());
  assert.equal(JSON.stringify(r1), JSON.stringify(r2)); assert.equal(JSON.stringify(a), snap);
});
