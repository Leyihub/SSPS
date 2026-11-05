// 安全加固（W52）：CSV 注入、压缩炸弹、500 错误不泄露堆栈
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { Logger } from '@nestjs/common';
import { csvCell } from '../../client/src/ssps/format';
import { readXlsx } from '../lib/xlsx';
import { GlobalExceptionFilter } from '../common/filters/exception.filter';

test('CSV 注入：= + - @ 开头的文本前面补单引号；数字（含负数）、普通文本、引号照常', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell('+1'), '"\'+1"'); assert.equal(csvCell('-cmd'), '"\'-cmd"'); assert.equal(csvCell('@SUM(A1)'), '"\'@SUM(A1)"');
  assert.equal(csvCell(-5), '"-5"'); assert.equal(csvCell('MV A'), '"MV A"'); assert.equal(csvCell(null), '""'); assert.equal(csvCell('他说"好"'), '"他说""好"""');
});

/** 构造一个只有一个超大条目的 zip：压缩后很小，解压后超过上限 */
function bomb(): Buffer {
  const data = zlib.deflateRawSync(Buffer.alloc(60 * 1024 * 1024, 0)), name = Buffer.from('xl/workbook.xml');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(data.length, 20); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, name, data]), dirOffset = body.length, dir = Buffer.concat([cen, name]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(dirOffset, 16);
  return Buffer.concat([body, dir, eocd]);
}
test('压缩炸弹：条目解压后超过 50MB 直接拒绝，不吃光内存', () => {
  const b = bomb(); assert.ok(b.length < 1024 * 1024, '压缩后很小');
  assert.throws(() => readXlsx(b), /maxOutputLength|larger than|Cannot create a Buffer/i);
});

test('未知异常：生产环境只返回「服务器内部错误」，不带堆栈和原因；开发环境保留堆栈', () => {
  const run = () => { let body: any, status = 0; const res = { headersSent: false, status(s: number) { status = s; return this; }, json(b: unknown) { body = b; } };
    new GlobalExceptionFilter().catch(new Error('relation "m_voyage" does not exist'), { switchToHttp: () => ({ getResponse: () => res }) } as any); return { status, body }; };
  const old = process.env.NODE_ENV; Logger.overrideLogger(false);
  try {
    process.env.NODE_ENV = 'production'; let r = run(); assert.equal(r.status, 500); assert.equal(r.body.error.message, '服务器内部错误'); assert.equal(r.body.error.stack, undefined); assert.equal(JSON.stringify(r.body).includes('m_voyage'), false);
    process.env.NODE_ENV = 'development'; r = run(); assert.match(r.body.error.stack, /m_voyage/);
  } finally { Logger.overrideLogger(['log', 'warn', 'error']); if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});
