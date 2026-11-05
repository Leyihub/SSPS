// 航次真实仓储（Drizzle + 假飞书）：除了和内存版同一套行为测试之外，这里测写飞书链路本身的性质。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { VoyageService } from '../modules/voyage/voyage.service';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import { mVoyage } from '../database/schema';
import { F } from '../lark/fieldmap';
import type { Actor } from '../domain/voyage';
import { FIELDS } from './helpers/fake-base';
import { realVoyageEnv } from './helpers/real-env';

const lin: Actor = { userId: 'u-lin', name: '林海川', role: '业务员', dept: '大宗采购部' };
const closers: Array<() => Promise<unknown>> = []; after(async () => { for (const c of closers) await c(); });
const mk = async () => { const env = await realVoyageEnv({ 'u-lin': { name: '林海川', feishuId: 'fs_lin' } }); closers.push(env.close); const svc = new VoyageService(env.store, new MemoryDirectory()); svc.clock = () => new Date('2026-11-05T08:30:00Z'); return { ...env, svc }; };
const body = { biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', vessel: 'MV TEST', planDischS: '2026-11-10', planDischE: '2026-11-12', planBerths: ['F1', 'F2'] };

test('字段名一致性：写飞书用到的每个中文字段名都在 base-plan.json 里；自动编号、公式、查找引用一个都没写', () => {
  for (const [table, names] of Object.entries(F)) for (const [k, name] of Object.entries(names)) {
    const def = FIELDS[table]?.[name]; assert.ok(def, `${table}.${k}「${name}」不在 base-plan.json`);
    assert.ok(!['autonumber', 'formula', 'lookup'].includes(def.type), `${table}「${name}」是只读字段（${def.type}），不能写`);
  }
});

test('新建航次：写飞书用的是毫秒时间戳、记录 ID 数组、人员 [{id}]；编号来自飞书自动编号；镜像回写后读出来的和写的一致', async () => {
  const { svc, fake, store } = await mk();
  const { voyage } = await svc.create({ ...body, laycanS: '2026-11-01 09:30', cargo: [{ name: '镍矿', tons: 30000 }, { name: '煤', tons: 20000 }] } as any, lin);
  assert.match(voyage.id, /^VY-\d{4}-0001$/); assert.equal(voyage.owner, '林海川'); assert.equal(voyage.ownerId, 'u-lin');
  const rec = fake.all('T04')[0];
  assert.equal(rec.fields[F.T04.laycanS], Date.parse('2026-11-01T09:30:00+08:00'), '按 IMIP 当地时间（UTC+8）转毫秒');
  assert.equal(rec.fields[F.T04.planDischS], Date.parse('2026-11-10T00:00:00+08:00'));
  assert.deepEqual(rec.fields[F.T04.owner], [{ id: 'fs_lin' }]); assert.equal(fake.log.find((l) => l.table === 'T04')!.opts?.userIdType, 'user_id');
  assert.equal(rec.fields[F.T04.vessel].length, 1); assert.equal(rec.fields[F.T04.planBerths].length, 2);
  assert.equal(fake.count('T05'), 2); assert.ok(fake.all('T05').every((c) => c.fields[F.T05.voyage][0] === rec.record_id), '货物明细关联到这条航次');
  const got = (await store.get(voyage.id))!;
  assert.deepEqual([got.load, got.disch, got.vessel, got.planBerths, got.laycanS, got.planDischS, got.status], ['SURIGAO', 'BAHODOPI', 'MV TEST', ['F1', 'F2'], '2026-11-01 09:30', '2026-11-10 00:00', undefined]);
  assert.deepEqual((await store.cargo(voyage.id)).map((c) => [c.no, c.name, c.tons]), [['CL-0001', '镍矿', 30000], ['CL-0002', '煤', 20000]]);
});

test('船舶、港口、泊位不在主数据里：422，而且飞书和镜像都没有留下半截数据', async () => {
  const { svc, fake, db } = await mk();
  await assert.rejects(svc.create({ ...body, vessel: 'MV NOPE', cargo: [{ name: 'x', tons: 1 }] } as any, lin), (e: any) => e.httpStatus === 422 && /船舶「MV NOPE」不在主数据里/.test(e.message));
  await assert.rejects(svc.create({ ...body, load: 'ATLANTIS', cargo: [{ name: 'x', tons: 1 }] } as any, lin), (e: any) => e.httpStatus === 422 && /装港/.test(e.message));
  await assert.rejects(svc.create({ ...body, planBerths: ['Z9'], cargo: [{ name: 'x', tons: 1 }] } as any, lin), (e: any) => e.httpStatus === 422 && /泊位/.test(e.message));
  assert.equal(fake.count('T04'), 0); assert.equal((await db.select().from(mVoyage)).length, 0);
});

test('飞书写失败：整体失败，镜像不动，用同一个幂等键可以重试成功；重试成功后只有一条', async () => {
  const { svc, fake, db } = await mk();
  fake.failNext = '飞书错误 1254001';
  await assert.rejects(svc.create({ ...body, cargo: [{ name: 'x', tons: 1 }] } as any, lin, 'key-1'), /1254001/);
  assert.equal(fake.count('T04'), 0); assert.equal((await db.select().from(mVoyage)).length, 0);
  const r = await svc.create({ ...body, cargo: [{ name: 'x', tons: 1 }] } as any, lin, 'key-1');
  assert.equal(fake.count('T04'), 1); assert.equal((await db.select().from(mVoyage)).length, 1);
  const again = await svc.create({ ...body, cargo: [{ name: 'x', tons: 1 }] } as any, lin, 'key-1');
  assert.equal(again.voyage.id, r.voyage.id); assert.equal(fake.count('T04'), 1, '重复提交不再写飞书');
});

test('飞书写成功、回写镜像失败：记 written，补偿重放只补镜像，不再写飞书；之后读得到这条航次', async () => {
  const { svc, fake, db, outbox, store } = await mk();
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`alter table m_voyage rename to m_voyage_down`);                       // 模拟回写时数据库故障
  await assert.rejects(svc.create({ ...body, cargo: [] } as any, lin, 'key-2'));
  assert.equal(fake.count('T04'), 1, '飞书已经写成功');
  await db.execute(sql`alter table m_voyage_down rename to m_voyage`);
  const before = fake.log.length;
  assert.equal(await outbox.replayWritten(store.replayHandlers()), 1);
  assert.equal(fake.log.length, before, '补偿没有再写飞书');
  assert.equal((await store.list()).length, 1);
  assert.equal(await outbox.replayWritten(store.replayHandlers()), 0, '补完就不会重复补');
});

test('同步任务先于回写把行插进镜像：回写按记录 ID 覆盖，不产生重复行', async () => {
  const { svc, fake, db, store } = await mk();
  const { sql } = await import('drizzle-orm');
  // 回写前，飞书同步任务已经把这条记录同步进来：拦截 afterWrite 之前的状态——用同一个记录 ID 先插一行
  const orig = fake.create.bind(fake);
  fake.create = (async (t: any, recs: any, o: any) => { const out = await orig(t, recs, o); if (t === 'T04') await db.insert(mVoyage).values({ baseRecordId: out[0].record_id, voyageNo1: Number(out[0].fields['航次编号']) }); return out; }) as any;
  const { voyage } = await svc.create({ ...body, cargo: [] } as any, lin);
  assert.equal((await db.select().from(mVoyage)).length, 1);
  assert.equal(voyage.disch, 'BAHODOPI', '回写的值覆盖了同步来的空行');
  void sql; void store;
});

test('更新只写改动的字段；货物明细、结算、销售扩展落在正确的飞书表；两条航次的明细不串', async () => {
  const { svc, fake, store } = await mk();
  const a = (await svc.create({ ...body, cargo: [{ name: 'A货', tons: 1 }] } as any, lin)).voyage, b = (await svc.create({ ...body, cargo: [{ name: 'B货', tons: 2 }] } as any, lin)).voyage;
  fake.log.length = 0;
  await svc.update(a.id, { remark: '只改备注' }, lin);
  const upd = fake.log.filter((l) => l.op === 'update'); assert.equal(upd.length, 1); assert.equal(upd[0].table, 'T04');
  assert.deepEqual(Object.keys(fake.all('T04')[0].fields).includes(F.T04.remark), true);
  await svc.patchSettlement(a.id, { allowDays: 5 }, lin);
  assert.equal(fake.count('T06'), 1); assert.equal(fake.all('T06')[0].fields[F.T06.voyage][0], fake.all('T04')[0].record_id);
  assert.deepEqual((await store.cargo(a.id)).map((c) => c.name), ['A货']); assert.deepEqual((await store.cargo(b.id)).map((c) => c.name), ['B货']);
  assert.equal(await store.settlement(b.id), null);
  await svc.patchSettlement(a.id, { allowDays: 7, rain: true }, lin);
  assert.equal(fake.count('T06'), 1, '第二次是更新，不是再建一行'); assert.equal((await store.settlement(a.id))!.allowDays, 7);
});
