import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenProvider } from '../lark/token';
import { createWriteQueue, RetryableError } from '../lark/queue';
import { createBitable } from '../lark/bitable';
import { createOutbox, createMemoryStore, shouldApplySync } from '../lark/outbox';

const ok = (data) => ({ status: 200, json: async () => ({ code: 0, msg: 'ok', data }) });

test('令牌：缓存、提前 5 分钟刷新、并发共用一次请求；错误信息不含密钥', async () => {
  let calls = 0, t = 0;
  const fetchFn = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return { json: async () => ({ code: 0, tenant_access_token: 'tok' + calls, expire: 7200 }) }; };
  const get = createTokenProvider({ appId: 'id', appSecret: 'SECRET-XYZ', fetchFn, now: () => t });
  const [a, b] = await Promise.all([get(), get()]);
  assert.deepEqual([a, b, calls], ['tok1', 'tok1', 1]);
  t = 6000 * 1000; await get(); assert.equal(calls, 1, '未到刷新时间');
  t = 7000 * 1000; assert.equal(await get(), 'tok2', '到期前 5 分钟内重新获取');
  const bad = createTokenProvider({ appId: 'id', appSecret: 'SECRET-XYZ', fetchFn: async () => ({ json: async () => ({ code: 10003, msg: 'invalid param' }) }) });
  await assert.rejects(bad(), (e) => !e.message.includes('SECRET-XYZ') && /10003/.test(e.message));
});

test('写队列：严格串行、按入队顺序；限流按 2/4/8/16 秒退避重试，最多 4 次；一个任务失败不影响后面的', async () => {
  const sleeps = [], log = [];
  const q = createWriteQueue({ sleep: async (ms) => { sleeps.push(ms); }, minGapMs: 0 });
  let running = 0, maxRunning = 0;
  const job = (name, ms = 3) => async () => { running++; maxRunning = Math.max(maxRunning, running); await new Promise((r) => setTimeout(r, ms)); running--; log.push(name); return name; };
  const rs = await Promise.all([q.enqueue(job('a', 10)), q.enqueue(job('b', 1)), q.enqueue(job('c', 1))]);
  assert.deepEqual([rs, log, maxRunning], [['a', 'b', 'c'], ['a', 'b', 'c'], 1]);
  let n = 0; const flaky = async () => { if (++n < 3) throw new RetryableError('限流'); return 'ok'; };
  assert.equal(await q.enqueue(flaky), 'ok'); assert.deepEqual(sleeps, [2000, 4000]);
  sleeps.length = 0; let m = 0;
  await assert.rejects(q.enqueue(async () => { m++; throw new RetryableError('一直限流'); }), /一直限流/);
  assert.deepEqual([m, sleeps], [5, [2000, 4000, 8000, 16000]]);
  await assert.rejects(q.enqueue(async () => { throw new Error('业务错误'); }), /业务错误/);
  assert.equal(await q.enqueue(async () => 'still works'), 'still works');
});

test('多维表格：读按 500 分页读完；写按 500 切批；429 与限流码重试；业务错误不重试', async () => {
  const calls = []; let page = 0, fail429 = 1;
  const fetchFn = async (url, init) => {
    calls.push([init.method, url.replace(/^.*apps\/app1/, '')]);
    if (url.includes('records?page_size=500')) { page++; return ok({ items: Array.from({ length: page < 3 ? 500 : 120 }, (_, i) => ({ record_id: 'r' + page + '_' + i })), has_more: page < 3, page_token: 'p' + page }); }
    if (url.endsWith('batch_create')) { if (fail429-- > 0) return { status: 429, json: async () => ({}) }; const n = JSON.parse(init.body).records.length; return ok({ records: Array.from({ length: n }, (_, i) => ({ record_id: 'new' + i })) }); }
    return { status: 200, json: async () => ({ code: 1254043, msg: 'FieldNameNotFound' }) };
  };
  const q = createWriteQueue({ sleep: async () => {}, minGapMs: 0 });
  const bt = createBitable({ getToken: async () => 'T', appToken: 'app1', tableIds: { T04: 'tbl4' }, queue: q, fetchFn });
  assert.equal((await bt.listAll('T04')).length, 1120);
  assert.ok(calls.some((c) => c[1].includes('page_token=p2')));
  const ids = await bt.batchCreate('T04', Array.from({ length: 1200 }, () => ({ fields: {} })));
  assert.equal(ids.length, 1200);
  assert.equal(calls.filter((c) => c[1].endsWith('batch_create')).length, 4, '1200 条切成 500+500+200 共 3 批，加上第 1 批被限流重试 1 次');
  await assert.rejects(bt.batchUpdate('T04', [{ record_id: 'x', fields: { 错误字段: 1 } }]), /FieldNameNotFound/);
  await assert.rejects(bt.listAll('T99'), /table_id/);
});

test('幂等：同一幂等键重复提交只写一次飞书；飞书成功但后续步骤失败 → 补偿时不再写飞书', async () => {
  const store = createMemoryStore(), ob = createOutbox(store);
  let larkWrites = 0, mirror = 0, failAfter = true;
  const req = (key) => ob.execute(key, { kind: 'voyage.create', payload: { v: 1 }, writeLark: async () => { larkWrites++; return { recordId: 'rec1' }; },
    afterWrite: async () => { if (failAfter) throw new Error('回写镜像失败（数据库瞬断）'); mirror++; } });
  await assert.rejects(req('k1'), /回写镜像失败/);
  assert.deepEqual([larkWrites, mirror], [1, 0]);
  failAfter = false;
  const r = await req('k1');                                                   // 用户重试：不会在飞书里重复建一行
  assert.deepEqual([larkWrites, mirror, r.replayed], [1, 1, false]);
  const again = await req('k1');
  assert.deepEqual([larkWrites, mirror, again.replayed, again.result.recordId], [1, 1, true, 'rec1']);
  // 崩溃恢复：飞书已写成功、进程在后续步骤前挂了
  await store.put({ key: 'k2', kind: 'voyage.create', payload: { v: 2 }, status: 'written', result: { recordId: 'rec2' }, attempts: 1 });
  const done = []; assert.equal(await ob.replayWritten({ 'voyage.create': async (res) => done.push(res.recordId) }), 1);
  assert.deepEqual(done, ['rec2']); assert.equal((await store.get('k2')).status, 'done');
  // 飞书写失败：登记为 failed，可再次提交
  let n = 0; const bad = () => ob.execute('k3', { kind: 'x', payload: {}, writeLark: async () => { if (++n === 1) throw new Error('网络错误'); return { ok: 1 }; } });
  await assert.rejects(bad(), /网络错误/); assert.equal((await store.get('k3')).status, 'failed');
  assert.equal((await bad()).result.ok, 1);
});

test('同步事件版本防覆盖：晚到的旧事件不覆盖刚回写的新值', () => {
  const cur = { updatedAt: '2026-11-05T10:00:05Z' };
  assert.equal(shouldApplySync(cur, '2026-11-05T10:00:01Z'), false);
  assert.equal(shouldApplySync(cur, '2026-11-05T10:00:09Z'), true);
  assert.equal(shouldApplySync(null, '2026-11-05T10:00:01Z'), true);
});
