// 夹具与源文件一致（只在有 docs/、prototype/ 的 GitHub 文档仓里检查；平台仓库里没有源文件，自动跳过）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..'), fx = path.join(__dirname, 'fixtures');
const pairs: Array<[string, string]> = [
  ['prototype/engine.js', 'prototype/engine.js'], ['prototype/mock-data.js', 'prototype/mock-data.js'], ['prototype/assets/nlp.js', 'prototype/assets/nlp.js'],
  ['docs/schema/base-plan.json', 'base-plan.json'], ['docs/schema/seed/T02-berths.json', 'T02-berths.json'], ['docs/handoff/permission-matrix.md', 'permission-matrix.md'],
];
for (const [src, dst] of pairs) {
  const s = path.join(root, src);
  test(`夹具 ${dst} 与 ${src} 一致`, { skip: !fs.existsSync(s) && '没有源文件（平台仓库）' }, () => {
    assert.equal(fs.readFileSync(path.join(fx, dst), 'utf8'), fs.readFileSync(s, 'utf8'), `夹具过期了：重新复制 ${src} 到 app/server/test/fixtures/${dst}`);
  });
}
