import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildMatrix } from '../domain/permission-matrix';

test('fixtures/permission-matrix.md 和代码里的权限判断一致（不一致就重新生成）', () => {
  const doc = fs.readFileSync(path.join(__dirname, 'fixtures/permission-matrix.md'), 'utf8');
  assert.equal(doc, buildMatrix(), '运行：npx tsx --tsconfig tsconfig.node.json scripts/gen-permission-matrix.ts');
});
