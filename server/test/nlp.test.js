import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createParser } from '../nlp/parse.js';
import { dn, iso } from '../lib/dates.js';

const proto = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../prototype');
const ctx = { window: {}, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of ['mock-data.js', 'engine.js', 'assets/nlp.js']) vm.runInContext('var window=this.window;' + fs.readFileSync(path.join(proto, f), 'utf8'), ctx);
const M = ctx.window.MOCK, N0 = ctx.window.NLP;
const P = createParser({ today: M.today, ports: M.ports, items: M.inventory.items });
const slim = (r) => ({ biz: r.biz, item: r.item && r.item.name, tons: r.tons, load: r.load, disch: r.disch, a: r.a, b: r.b, userDeadline: r.userDeadline, outside: r.outside, ambiguous: r.ambiguous });

const SAMPLES = [
  '烧结石灰石 秦皇岛→德信 5万吨 2026年12月10日前', '废钢 新村港→德信 1万吨 11月28日前', '高硅块 唐山→德信 3万吨 11月30日前',
  '成品线材2.8万吨，11月8日到20日装船，发海防', '备件船8000吨从雅加达来，下周到港', '1/3焦煤 5万吨 京唐港 12月5日前', '焦煤 7万吨', '铁矿 苏里高 九万吨',
  '石灰石 5万吨', '辅料 3万吨 下周三前', '热卷 三万五千吨 发天津 11月中旬', '煤 5万吨 10天内', '废钢 8000吨 本周五前',
];
test('与原型的解析结果一致（今天 = 原型示例日）', () => {
  for (const s of SAMPLES) assert.deepEqual(slim(P.parse(s)), slim(N0.parse(s)), s);
});
test('最长品名优先：「1/3焦煤」不被「焦煤」截胡；只说类型取总库存；含糊时给候选', () => {
  assert.equal(P.parse('1/3焦煤 5万吨').item.name, '1/3焦煤');
  assert.equal(P.parse('焦煤 5万吨').item.name, '焦煤总库存');
  const r = P.parse('石灰石 5万吨'); assert.equal(r.ambiguous, true); assert.ok(r.alt.length >= 0);
});
test('货量与航线：万吨、千吨、中文数字；成品船本港为装港', () => {
  assert.equal(P.detectTons('2.8万吨'), 28000); assert.equal(P.detectTons('5万吨'), 50000); assert.equal(P.detectTons('8000吨'), 8000); assert.equal(P.detectTons('三万吨'), 30000);
  const r = P.parse('成品线材2.8万吨 发海防'); assert.deepEqual([r.biz, r.load, r.disch], ['成品销售船', 'BAHODOPI', 'HAIPHONG']);
});
test('跨年：今天在 12 月时，「1月5日」是明年，不是已过去的日子', () => {
  const Dec = createParser({ today: '2026-12-20', ports: M.ports, items: M.inventory.items });
  const r = Dec.parse('主焦煤 7.5万吨 1月10日前到港');
  assert.equal(iso(r.b), '2027-01-10'); assert.equal(r.outside, false);
  const next = Dec.parse('备件 8000吨 下月初到港');
  assert.equal(iso(next.a).slice(0, 7), '2027-01');
});
test('手工修改的字段优先于文字解析；超出 60 天范围标记', () => {
  const r = P.parse('废钢 新村港→德信 1万吨 11月28日前', { tons: 20000, biz: '大宗采购船', b: dn('2026-12-01') });
  assert.equal(r.tons, 20000); assert.equal(iso(r.b), '2026-12-01');
  assert.equal(P.parse('废钢 1万吨 新村港 2027年5月1日前').outside, true);
});
