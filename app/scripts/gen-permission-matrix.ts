import fs from 'node:fs';
import path from 'node:path';
import { buildMatrix } from '../server/domain/permission-matrix';

// 权威副本放在 app 里（测试夹具，平台仓库也有）；在有 docs/ 的 GitHub 文档仓里同时更新 docs/handoff/ 下的那份。
const text = buildMatrix(), targets = [path.resolve(__dirname, '../server/test/fixtures/permission-matrix.md')];
const docs = path.resolve(__dirname, '../../docs/handoff');
if (fs.existsSync(docs)) targets.push(path.join(docs, 'permission-matrix.md'));
for (const t of targets) { fs.writeFileSync(t, text); console.log('已生成', t); }
