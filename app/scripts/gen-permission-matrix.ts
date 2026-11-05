import fs from 'node:fs';
import path from 'node:path';
import { buildMatrix } from '../server/domain/permission-matrix';

const out = path.resolve(__dirname, '../../docs/handoff/permission-matrix.md');
fs.writeFileSync(out, buildMatrix());
console.log('已生成', out);
