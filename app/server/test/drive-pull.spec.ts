// 云空间客户端（假 fetch）与靠船计划拉取（A18）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrive } from '../lark/drive';
import { RetryableError } from '../lark/queue';
import { ImportsService } from '../modules/imports/imports.service';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import { MemoryImportStore } from '../adapters/memory/memory-import-store';
import { MemoryMasterStore } from '../adapters/memory/memory-master-store';
import { MemorySyncLog } from '../adapters/memory/memory-sync-log';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { seedMaster } from '../adapters/memory/seed';
import { buildXlsx } from './helpers/xlsx-writer';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

test('云空间客户端：翻页取全、跳过子文件夹、按修改时间从旧到新；令牌放在请求头；限流转成可重试', async () => {
  const calls: string[] = [];
  const pages: Record<string, any> = {
    '': { code: 0, data: { files: [{ token: 'f2', name: 'b.xlsx', type: 'file', modified_time: '1762300000' }, { token: 'd1', name: '旧', type: 'folder' }], has_more: true, next_page_token: 'p2' } },
    p2: { code: 0, data: { files: [{ token: 'f1', name: 'a.xlsx', type: 'file', modified_time: '1762200000' }], has_more: false } },
  };
  const fetchFn = (async (url: string, init: any) => { calls.push(url + ' ' + init.headers.Authorization); const pt = new URL(url).searchParams.get('page_token') ?? ''; return json(pages[pt]); }) as any;
  const drive = createDrive({ getToken: async () => 'TKN', fetchFn });
  const list = await drive.listFolder('fld1');
  assert.deepEqual(list.map((f) => f.token), ['f1', 'f2']); assert.equal(calls.length, 2); assert.ok(calls.every((c) => c.endsWith('Bearer TKN')));
  const limited = createDrive({ getToken: async () => 't', fetchFn: (async () => json({ code: 99991400, msg: 'rate' })) as any });
  await assert.rejects(limited.listFolder('x'), (e: any) => e instanceof RetryableError);
  const bad = createDrive({ getToken: async () => 't', fetchFn: (async () => json({ code: 1061004, msg: 'forbidden' })) as any });
  await assert.rejects(bad.listFolder('x'), /读取云空间文件夹失败 1061004/);
});

test('云空间下载：成功返回内容；失败给明确原因；超大文件拒绝', async () => {
  const ok = createDrive({ getToken: async () => 't', fetchFn: (async () => new Response(Buffer.from('hello'))) as any });
  assert.equal((await ok.download('f')).toString(), 'hello');
  const denied = createDrive({ getToken: async () => 't', fetchFn: (async () => json({ code: 1061004, msg: 'no permission' }, 403)) as any });
  await assert.rejects(denied.download('f'), /下载云空间文件失败 1061004/);
  await assert.rejects(ok.download('f', 3), /超过 20MB/);
});

const row = (o: any = {}) => ({ 码头: '北区码头', 泊位: 'F1', 船名: 'MV A', 船长: 190, 船舶类型: '散货船', 物资名称: '镍矿', 吨位: 50000, 从属单位: '德信', 预计到港日期: '2026-11-06 08:00', 预计靠泊时间: '2026-11-07 08:00', 预计卸完时间: '2026-11-10 08:00', ...o });
const xlsx = (rows: any[]) => { const head = Object.keys(rows[0]); return buildXlsx({ 计划: [head, ...rows.map((r) => head.map((h) => r[h]))] as any }); };

test('拉取靠船计划（A18）：只导入新文件、从旧到新；已导入的按 token 去重；坏文件不影响其他并记日志', async () => {
  const log = new MemorySyncLog(), store = new MemoryImportStore();
  const svc = new ImportsService(store, new MemoryMasterStore(seedMaster()), new MemoryVoyageStore(), new MemoryDirectory(), log); svc.clock = () => new Date('2026-11-05T08:30:00Z');
  const files: Record<string, Buffer> = { f1: xlsx([row({ 船名: 'MV ONE' })]), f2: xlsx([row({ 船名: 'MV TWO' })]), f3: Buffer.from('这不是 Excel'), f4: xlsx([{ 船名: '缺列' }]) };
  const drive = {
    async listFolder() { return [{ token: 'f1', name: '1.xlsx', type: 'file', modifiedTime: '2026-11-01T00:00:00Z' }, { token: 'f2', name: '2.xlsx', type: 'file', modifiedTime: '2026-11-02T00:00:00Z' }, { token: 'f3', name: '3.xlsx', type: 'file', modifiedTime: '2026-11-03T00:00:00Z' }, { token: 'f4', name: '4.xlsx', type: 'file', modifiedTime: '2026-11-04T00:00:00Z' }, { token: 'x', name: '说明.docx', type: 'file', modifiedTime: null }]; },
    async download(t: string) { return files[t]; },
  };
  const r1 = await svc.pullBerthPlans(drive as any, 'fld', null);
  assert.deepEqual([r1.found, r1.imported.length, r1.skipped, r1.failed.map((f) => f.name)], [4, 2, 0, ['3.xlsx', '4.xlsx']], 'docx 不算；两个好文件导入，两个坏文件失败');
  assert.equal((await store.currentBerthBatch())!.fileName, '2.xlsx', '最后导入的最新文件成为当前批次');
  const r2 = await svc.pullBerthPlans(drive as any, 'fld', null);
  assert.deepEqual([r2.imported.length, r2.skipped], [0, 2], '再拉一次：已导入的跳过（坏文件会再试）');
  const failures = (await log.list({ failOnly: true })).filter((x) => x.type.includes('云空间'));
  assert.ok(failures.length >= 2 && failures.every((x) => x.err.length > 0));
});
