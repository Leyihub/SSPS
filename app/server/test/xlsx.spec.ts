import test from 'node:test';
import assert from 'node:assert/strict';
import { readXlsx } from '../lib/xlsx';
import { buildXlsx } from './helpers/xlsx-writer';
import { parseDateTime } from '../importers/common';

const sheet = [
  ['船名', '吨位', '预计靠泊时间', '库存', '备注', '在港'],
  ['MV <A> & "B"', 50000, 46331.5, { err: '#VALUE!' }, { inline: '内联文本' }, true],
  [],
  ['MV C', 12000.5, 46332, { formula: 'B3*2', cached: 24001 }, null, false],
  [null, null, null, null, null, null],
];

test('读取 .xlsx：表头取第一个非空行；共享字符串、数字、错误值、内联、布尔、公式缓存值；空行跳过；XML 实体还原', () => {
  for (const deflate of [false, true]) {
    const r = readXlsx(buildXlsx({ 计划: sheet }, { deflate }));
    assert.deepEqual(r.header, ['船名', '吨位', '预计靠泊时间', '库存', '备注', '在港']);
    assert.equal(r.rows.length, 2);
    assert.deepEqual(r.rows[0], { 船名: 'MV <A> & "B"', 吨位: 50000, 预计靠泊时间: 46331.5, 库存: '#VALUE!', 备注: '内联文本', 在港: true });
    assert.deepEqual(r.rows[1], { 船名: 'MV C', 吨位: 12000.5, 预计靠泊时间: 46332, 库存: 24001, 在港: false });
  }
});

test('读取 .xlsx：日期序列号交给 parseDateTime（按字面值，不做时区换算）；按名称选工作表', () => {
  const buf = buildXlsx({ 说明: [['x'], ['y']], 数据: [['日期'], [46331.5]] });
  assert.equal(readXlsx(buf).name, '说明');
  const r = readXlsx(buf, '数据');
  assert.equal(parseDateTime(r.rows[0]['日期']), '2026-11-05 12:00');
  assert.throws(() => readXlsx(buf, '没有'), /找不到工作表/);
});

test('读取 .xlsx：非 xlsx 文件给出明确错误；列号超过 Z 也能对上', () => {
  assert.throws(() => readXlsx(Buffer.from('hello world, definitely not a zip file at all')), /不是有效的 .xlsx/);
  const wide = [Array.from({ length: 30 }, (_, i) => 'H' + i), Array.from({ length: 30 }, (_, i) => i)];
  const r = readXlsx(buildXlsx({ s: wide }));
  assert.deepEqual([r.rows[0].H0, r.rows[0].H25, r.rows[0].H26, r.rows[0].H29], [0, 25, 26, 29]);
});
