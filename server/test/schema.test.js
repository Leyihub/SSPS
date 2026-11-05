// 用 pglite（WASM 版 PostgreSQL）真实执行建表脚本，检查语法、约束和「当前批次只能有一个」等规则。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let PGlite = null;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { /* 没装依赖时跳过 */ }
const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../db/schema.sql'), 'utf8');
const T = { skip: PGlite ? false : '没有安装 @electric-sql/pglite（npm install 后运行）' };

test('建表脚本可执行，且可重复执行；12 张自有表齐全，每张都启用了行级安全', T, async () => {
  const db = new PGlite();
  await db.exec(sql); await db.exec(sql);
  const t = await db.query("select relname, relrowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace order by 1");
  assert.deepEqual(t.rows.map((r) => r.relname).sort(), ['announcement', 'berth_plan_batch', 'berth_plan_row', 'data_issue', 'eta_revision', 'inventory_batch', 'inventory_row', 'milestone_log', 'prediction_plan', 'prediction_run', 'sync_log', 'write_queue']);
  assert.ok(t.rows.every((r) => r.relrowsecurity));
  await db.close();
});

test('约束：当前批次只能有一个；只能出 A/B；幂等键唯一；同对象同类问题不堆积；updated_at 自动维护', T, async () => {
  const db = new PGlite(); await db.exec(sql);
  const batch = (no, cur) => db.query("insert into berth_plan_batch (batch_no, plan_date, source, file_name, status, is_current) values ($1, '2026-11-04', '手动上传', 'f.xlsx', '成功', $2)", [no, cur]);
  await batch('BP-1', true); await batch('BP-2', false);
  await assert.rejects(batch('BP-3', true), /unique/i);
  await db.query("update berth_plan_batch set is_current = false where batch_no = 'BP-1'"); await batch('BP-3', true);
  await db.query("insert into prediction_run (run_no, input, run_by) values ('PR-1', '{}', 'u')");
  const plan = (label) => db.query("insert into prediction_plan (run_no, label, window_from, window_to, path, trust, provenance) values ('PR-1', $1, '2026-11-10', '2026-11-12', '近', '正常', '{}')", [label]);
  await plan('A'); await plan('B');
  await assert.rejects(plan('C'), /check/i); await assert.rejects(plan('A'), /unique/i);
  const wq = () => db.query("insert into write_queue (idempotency_key, kind, target_table, operation, payload) values ('k1', 'voyage.create', 'T04', 'create', '{}')");
  await wq(); await assert.rejects(wq(), /unique/i);
  const di = (s) => db.query("insert into data_issue (object_ref, issue_type, field, status) values ('VY-1', '缺离装港时间', null, $1)", [s]);
  await di('待处理'); await assert.rejects(di('待处理'), /unique/i); await di('已关闭');
  const before = (await db.query("select updated_at from write_queue where idempotency_key = 'k1'")).rows[0].updated_at;
  await new Promise((r) => setTimeout(r, 20));
  await db.query("update write_queue set status = 'written' where idempotency_key = 'k1'");
  assert.ok((await db.query("select updated_at from write_queue where idempotency_key = 'k1'")).rows[0].updated_at > before);
  await db.close();
});
