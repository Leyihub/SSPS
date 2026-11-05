// 定时任务（W31）：6 个触发器都注册了、名字不重复；每个任务失败时只记日志不抛错；任务调用的是内部（无登录用户）路径
import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegisteredTriggers } from '@lark-apaas/fullstack-nestjs-core';
import { JobsAutomation } from '../modules/admin/jobs.automation';

const calls: string[] = [];
const rec = (n: string, ...a: unknown[]) => { calls.push(n + ':' + a.map((x) => String(x)).join(',')); return Promise.resolve({ ok: n }); };
const mk = (over: Partial<Record<string, () => Promise<unknown>>> = {}) => new JobsAutomation(
  { pullFromDrive: (d: unknown, a: unknown) => over.pull?.() ?? rec('pull', d === null ? 'nodrive' : 'drive', a) } as any,
  { recomputeRouteRules: (a: unknown) => over.recompute?.() ?? rec('recompute', a) } as any,
  { scan: (a: unknown) => over.scan?.() ?? rec('scan', a) } as any,
  { replay: (a: unknown) => over.replay?.() ?? rec('replay', a) } as any,
  { refresh: (a: unknown, dirty: unknown) => over.refresh?.() ?? rec('compat', a, dirty) } as any,
  { listFolder: async () => [], download: async () => Buffer.alloc(0) },
);

test('6 个触发器都已注册，名称唯一，cron 表达式 5 段', () => {
  const t = [...getRegisteredTriggers()].filter(([, v]) => v.className === 'JobsAutomation');
  assert.equal(t.length, 6);
  for (const [k] of t) assert.match(k, /^[A-Za-z0-9]+\[[^\]]+\]$/);
  for (const [k] of t) assert.equal(k.slice(k.indexOf('[') + 1, -1).split(' ').length, 5, k);
  assert.deepEqual(t.map(([k]) => k.split('[')[0]).sort(), ['cronCompatDirty', 'cronCompatFull', 'cronIssueScan', 'cronPullBerthPlan', 'cronRecomputeRoutes', 'cronReplay']);
});

test('每个任务以系统身份（actor=null）调用对应服务；增量刷新带 onlyIfDirty，全量不带', async () => {
  calls.length = 0; const j = mk();
  await j.pullBerthPlan(); await j.replay(); await j.compatIncremental(); await j.compatFull(); await j.recomputeRoutes(); await j.issueScan();
  assert.deepEqual(calls, ['pull:drive,null', 'replay:null', 'compat:null,true', 'compat:null,false', 'recompute:null', 'scan:null']);
});

test('任务失败只记日志不抛错（云空间没配置、飞书报错都不能让触发器崩）', async () => {
  const boom = () => Promise.reject(new Error('飞书错误 1254001'));
  const j = mk({ pull: boom, replay: boom, refresh: boom, recompute: boom, scan: boom });
  for (const f of [j.pullBerthPlan, j.replay, j.compatIncremental, j.compatFull, j.recomputeRoutes, j.issueScan]) assert.equal(await f.call(j), null);
});
