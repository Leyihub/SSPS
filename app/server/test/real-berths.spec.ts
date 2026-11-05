// 用真实《泊位容量表》（2026-10-08）的 23 个泊位验证吨级匹配：分母只计容量 ≥ 货量的启用泊位。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createEngine } from '../engine';

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/T02-berths.json'), 'utf8'));
const berths = seed.map((b) => ({ code: b['泊位编码'], terminal: b['码头'], capacity: b['容量吨级（吨）'], status: b['状态'] }));
const E = createEngine({ today: '2026-11-05', berths, planRows: [], voyages: [], routeRules: [] });

test('23 个泊位：北区 10、拉博塔 13；LN16 按 1 万吨处理', () => {
  assert.equal(berths.length, 23);
  assert.deepEqual([berths.filter((b) => b.terminal === '北区码头').length, berths.filter((b) => b.terminal === '拉博塔码头').length], [10, 13]);
  assert.equal(berths.find((b) => b.code === 'LN16').capacity, 10000);
  for (const code of ['L1', 'L2', 'L3', 'L5', 'L9', 'L10', 'F6', 'F12']) assert.equal(berths.some((b) => b.code === code), false, code + ' 是表外泊位，不计');
});
test('吨级匹配：能装下的泊位数随货量变化', () => {
  const n = (t) => E.poolFor(t).n;
  assert.deepEqual([10000, 15000, 25000, 30000, 50000, 70000, 100000, 180000, 180001].map(n), [23, 15, 14, 13, 11, 7, 3, 1, 0]);
  assert.deepEqual(E.poolFor(100000).list.map((b) => b.code).sort(), ['F1', 'F2', 'L12']);
});
