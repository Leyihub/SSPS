import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatus, deriveFields, STATUS_CANCELLED } from '../domain/status';
import { validateChain, inverted } from '../domain/validate';
import { percentile, buildRule, recomputeRules, findRule, isValidSample } from '../domain/routeRules';
import { daysBetween, dn, iso } from '../lib/dates';

test('日期：日序号互转、只比日期', () => {
  assert.equal(iso(dn('2026-11-05')), '2026-11-05');
  assert.equal(dn('2026-11-05 23:59'), dn('2026-11-05 00:00'));
  assert.equal(daysBetween('2026-10-24 15:00', '2026-10-30 09:30'), 5.77);
});

test('状态推导：9 条规则，命中即止', () => {
  const bulk = { biz: '大宗采购船' }, prod = { biz: '成品销售船' };
  assert.equal(deriveStatus({ ...bulk, flags: ['取消'], dischDep: '2026-01-01' }), STATUS_CANCELLED);          // 1
  assert.equal(deriveStatus({ ...bulk, dischDep: '2026-01-01 10:00' }), '已结束');                               // 2
  assert.equal(deriveStatus({ ...prod, dischBerth: '2026-01-01 10:00' }), '已结束');                             // 2：成品船卸港靠泊即结束
  assert.equal(deriveStatus({ ...bulk, dischBerth: '2026-01-01 10:00' }), '卸港卸货');                           // 3
  assert.equal(deriveStatus({ ...bulk, actDischArr: '2026-01-01 10:00' }), '卸港等泊');                          // 4
  assert.equal(deriveStatus({ ...bulk, actLoadDep: '2026-01-01 10:00' }), '航行中');                             // 5
  assert.equal(deriveStatus({ ...bulk, actLoadArr: '2026-01-01 10:00' }), '装港装货');                           // 6：大宗不记装港靠泊
  assert.equal(deriveStatus({ ...prod, actLoadArr: '2026-01-01 10:00' }), '装港等泊');                           // 7
  assert.equal(deriveStatus({ ...prod, loadBerth: '2026-01-01 10:00' }), '装港装货');                            // 6
  assert.equal(deriveStatus({ ...bulk, vessel: 'MV X' }), '未到装港');                                           // 8
  assert.equal(deriveStatus({ ...bulk }), '待宣船');                                                             // 9
});

test('公式字段：实际航程 5.77、本港等泊 0.90、本港作业 3.52（建表自检样例）', () => {
  const v = { biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', actLoadDep: '2026-10-24 15:00', actDischArr: '2026-10-30 09:30', dischBerth: '2026-10-31 07:00', dischDep: '2026-11-03 19:30' };
  const f = deriveFields(v, [{ tons: 30000 }, { tons: 20000 }]);
  assert.deepEqual([f.side, f.voyageDays, f.waitDays, f.workDays, f.total, f.pooled], ['卸', 5.77, 0.9, 3.52, 50000, true]);
});

test('时序校验：改动的节点倒置 → 拒绝；历史倒置不拦截无关保存；同一天纯日期不算倒置', () => {
  const ok = { actLoadArr: '2026-10-01 08:00', actLoadDep: '2026-10-03 08:00', actDischArr: '2026-10-09 08:00' };
  assert.deepEqual(validateChain(ok, ok).errors, []);
  const bad = { ...ok, actDischArr: '2026-10-02 08:00' };
  assert.equal(validateChain(bad, ok).errors.length, 1);                                  // 本次改了抵卸港，且早于离装港
  const old = { actLoadDep: '2026-10-04 00:00', dischBerth: '2026-09-04 00:00', remark: 'x' };
  const r = validateChain({ ...old, remark: 'y' }, old);                                  // 只改备注，历史倒置不拦截
  assert.deepEqual(r.errors, []); assert.equal(r.warnings[0].code, 'CHAIN_INVERTED');
  assert.equal(inverted('2026-10-10 14:30', '2026-10-10 00:00'), false);                  // 同一天，后者是纯日期占位
  assert.equal(inverted('2026-10-10 14:30', '2026-10-10 09:00'), true);                   // 同一天都有时刻，真倒置
  assert.equal(validateChain({ actDischArr: '2026-10-09 08:00' }, null).warnings[0].code, 'MISSING_NODE');   // 缺离装港 → 待补
});

test('航程规则：分位数、样本 ≥5 切统计值、重算、物资船借用顺序', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([10, 12, 14, 16, 18], 0.8), 16.4);
  assert.equal(percentile([], 0.5), null);
  const raw = { id: 'R1', load: 'A', disch: 'BAHODOPI', biz: ['大宗采购船'], exp: 9, expMax: 11, samples: 4, p50: 7, p80: 8 };
  assert.deepEqual([buildRule(raw).basis, buildRule(raw).effP50, buildRule(raw).effP80], ['经验值', 9, 11]);
  assert.deepEqual([buildRule({ ...raw, samples: 5 }).basis, buildRule({ ...raw, samples: 5 }).effP80], ['统计值', 8]);
  const vs = [6, 7, 8, 9, 10, 200, null].map((d, i) => ({ load: 'A', disch: 'BAHODOPI', biz: '大宗采购船', actLoadDep: 'x', actDischArr: 'y', voyageDays: d, flags: [] }));
  vs.push({ load: 'A', disch: 'BAHODOPI', biz: '大宗采购船', actLoadDep: 'x', actDischArr: 'y', voyageDays: 5, flags: ['取消'] });
  vs.push({ load: 'A', disch: 'BAHODOPI', biz: '大宗采购船', actLoadDep: 'x', actDischArr: 'y', voyageDays: 5, flags: [], placeholderTime: true });
  const [rr] = recomputeRules([raw], vs);
  assert.deepEqual([rr.samples, rr.p50, rr.basis, rr.effP50], [5, 8, '统计值', 8]);        // 超上限、空值、取消、占位时间都不进样本
  assert.equal(isValidSample(vs[5]), false);
  const rules = [buildRule({ ...raw, biz: ['大宗采购船'] }), buildRule({ id: 'R2', load: 'B', disch: 'BAHODOPI', biz: ['大宗采购船', '物资备件船'], exp: 3, expMax: 4, samples: 0 }), buildRule({ id: 'R3', load: 'B', disch: 'BAHODOPI', biz: ['物资备件船'], exp: 2, expMax: 3, samples: 0 })];
  assert.equal(findRule(rules, 'A', 'BAHODOPI', '物资备件船').id, 'R1');                    // 自己没有 → 借用大宗
  assert.equal(findRule(rules, 'B', 'BAHODOPI', '物资备件船').id, 'R2');                    // 先匹配到自己的（多选里含物资船）
  assert.equal(findRule(rules, 'Z', 'BAHODOPI', '大宗采购船'), null);
});
