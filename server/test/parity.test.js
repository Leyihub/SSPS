// 与原型引擎（prototype/engine.js）逐项对照：同一份示例数据，预测、日历、日明细、库存函数结果一致。
// 这是「后端引擎 = 评审过的原型」的证据；原型有意的改动（见 docs/open-questions.md）要同时改两边。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createEngine, announce, stock } from '../engine/index.js';
import { iso } from '../lib/dates.js';

const proto = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../prototype');
const ctx = { window: {}, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of ['mock-data.js', 'engine.js']) vm.runInContext('var window=this.window;' + fs.readFileSync(path.join(proto, f), 'utf8'), ctx);
const M = ctx.window.MOCK, P = ctx.window.ENGINE;

const E = createEngine({ today: M.today, berths: M.berths, planRows: M.berthPlanRows, voyages: M.voyages, routeRules: M.routeRules, batchNo: M.batch.batchNo });

// 去掉两边本来就不同的字段（原型里的运行编号、运行人、时间是占位）；Set 转数组，便于比较
const canon = (x) => JSON.parse(JSON.stringify(x, (k, v) => (Object.prototype.toString.call(v) === '[object Set]' ? [...v].sort() : v)));
const clean = (r) => { const c = canon(r); c.bMissing = !!c.bMissing; if (c.run) { delete c.run.id; delete c.run.runBy; delete c.run.at; } return c; };

const inv = (name) => M.inventory.items.find((x) => x.name === name);
const SCEN = [
  { biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-08', winEnd: '2026-11-18' },
  { biz: '大宗采购船', tons: 50000, load: 'TAGANITO', disch: 'BAHODOPI', winStart: '2026-11-24', winEnd: '2026-12-02' },
  { biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-12', winEnd: '2026-11-23' },
  { biz: '成品销售船', tons: 28000, load: 'BAHODOPI', disch: 'HAIPHONG', winStart: '2026-11-08', winEnd: '2026-11-20' },
  { biz: '物资备件船', tons: 8000, load: 'JAKARTA', disch: 'BAHODOPI', winStart: '2026-11-08', winEnd: '2026-11-18' },
  { biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-17', winEnd: '2026-11-19' },
  { biz: '大宗采购船', tons: 50000, load: 'QINHUANGDAO', disch: 'BAHODOPI', winStart: '2026-11-04', winEnd: '2026-12-10', item: '烧结石灰石', pathBy: 'end' },
  { biz: '大宗采购船', tons: 30000, load: 'TANGSHAN', disch: 'BAHODOPI', winStart: '2026-11-04', winEnd: '2026-11-30', item: '高硅块', pathBy: 'end' },
  { biz: '大宗采购船', tons: 30000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-04', winEnd: '2026-12-20', item: '低硫气煤', pathBy: 'end' },
  { biz: '大宗采购船', tons: 30000, load: 'SURABAYA', disch: 'BAHODOPI', winStart: '2026-11-10', winEnd: '2026-11-18' },   // 缺航程规则
  { biz: '大宗采购船', tons: 300000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-10', winEnd: '2026-11-18' },  // 超过最大泊位
  { biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-01', winEnd: '2026-11-18' },  // 窗口始早于今天
];
const withItem = (s) => (s.item ? Object.assign({}, s, { item: inv(s.item), buffer: 3 }) : s);

test('预测结果与原型一致（12 个场景）', () => {
  SCEN.forEach((s, i) => {
    const a = clean(E.predict(withItem(s))), b = clean(P.predict(withItem(s)));
    assert.deepEqual(a, b, '场景 ' + (i + 1) + ' 不一致');
  });
});

test('不同货量 × 不同缓冲天数下的预测与原型一致', () => {
  for (const tons of [10000, 20000, 30000, 70000]) for (const buffer of [0, 3, 7]) {
    const s = withItem({ biz: '大宗采购船', tons, load: 'QINHUANGDAO', disch: 'BAHODOPI', winStart: '2026-11-04', winEnd: '2026-12-20', item: '焦煤总库存', pathBy: 'end' }); s.buffer = buffer;
    assert.deepEqual(clean(E.predict(s)), clean(P.predict(s)), tons + '/' + buffer);
  }
});

test('30 天容量日历与每日明细与原型一致', () => {
  for (const tons of [10000, 20000, 30000, 50000, 70000]) {
    assert.deepEqual(canon(E.calendar(tons)), canon(P.calendar(tons)), '日历 ' + tons);
    for (let d = E.today; d < E.today + 45; d++) assert.deepEqual(canon(E.dayDetail(d, tons)), canon(P.dayDetail(d, tons)), '日明细 ' + tons + ' ' + iso(d));
  }
});

test('库存函数与原型一致：断料日、有效断料日、库存曲线', () => {
  for (const it of M.inventory.items) {
    assert.equal(stock.stockout(it), P.stockout(it), it.name);
    for (const lead of [0, 5, 13, 40]) assert.deepEqual(canon(stock.stockoutPlan(it, lead, E.today)), canon(P.stockoutPlan(it, lead)), it.name + ' ' + lead);
    for (const d of [E.today, E.today + 7, E.today + 60]) { assert.equal(stock.stockAt(it, d), P.stockAt(it, d)); assert.equal(stock.dailyAt(it, d), P.dailyAt(it, d)); }
    const arr = [{ d: E.today + 10, tons: 30000 }];
    assert.deepEqual(canon(stock.project(it, arr, E.today + 50, E.today)), canon(P.project(it, arr, E.today + 50)), it.name + ' 曲线');
  }
});

test('宣船文案与原型一致，且数值片段全部来自引擎结果', () => {
  const name = (en) => { const p = M.ports.find((q) => q.en === en); return p ? p.cn.replace(/（.*?）/g, '') : (en || '未说明'); };
  SCEN.slice(0, 9).forEach((s, i) => {
    const a = E.predict(withItem(s)), b = P.predict(withItem(s));
    (a.plans || []).forEach((pl, k) => { if (!pl) return; assert.deepEqual(canon(announce(a, pl, name)), canon(P.announce(b, b.plans[k])), '文案 ' + (i + 1) + pl.label); });
  });
});
