import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine, buildProvenance, toRunRecord, toPlanRecord, announce } from '../engine/index.js';
import { iso } from '../lib/dates.js';

const proto = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../prototype');
const ctx = { window: {}, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of ['mock-data.js']) vm.runInContext('var window=this.window;' + fs.readFileSync(path.join(proto, f), 'utf8'), ctx);
const M = ctx.window.MOCK;
const E = createEngine({ today: M.today, berths: M.berths, planRows: M.berthPlanRows, voyages: M.voyages, routeRules: M.routeRules, batchNo: M.batch.batchNo });

test('S1 溯源：每个数字与引擎结果逐项一致，不改写', () => {
  const r = E.predict({ biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-11-08', winEnd: '2026-11-18' });
  const [A, B] = r.plans;
  const s = buildProvenance(r, A, { batchNo: M.batch.batchNo, planCoverTo: E.planCoverTo });
  assert.equal(s.metric.value, A.c.metric); assert.equal(s.pool.n, r.pool.n);
  assert.deepEqual(s.pool.codes, r.pool.list.map((b) => b.code));
  assert.equal(s.depart, iso(A.depart)); assert.equal(s.rule.effP80, r.run.rule.effP80); assert.equal(s.source.batchNo, M.batch.batchNo);
  assert.equal(s.days.length, A.c.days.length);
  s.days.forEach((d, k) => { if (d.state === 'ok') assert.equal(d.cmr, A.c.days[k].cmr); });
  const rec = toPlanRecord(r, A, 'PR-1'), run = toRunRecord(r, 'PR-1', { runBy: 'u' });
  assert.deepEqual([rec.label, rec.path, rec.cmr_min, rec.max_ships, rec.trust, rec.window_from], ['A', '近', A.c.metric, null, '正常', iso(A.c.s)]);
  assert.deepEqual([run.run_mode, run.rule_basis, run.borrowed_rule, run.berth_plan_batch_no], ['近', '经验值', false, M.batch.batchNo]);
  assert.equal(toPlanRecord(r, B, 'PR-1').label, 'B');
  // 宣船文案里的数值片段都能在溯源里找到
  const txt = announce(r, A, (x) => x).filter((x) => x.v).map((x) => x.t).join(' ');
  assert.ok(txt.includes(iso(A.depart)) && txt.includes(String(r.pool.n)));
});

test('远路径与混合口径：D05/D06 记各自路径', () => {
  const far = E.predict({ biz: '大宗采购船', tons: 50000, load: 'TAGANITO', disch: 'BAHODOPI', winStart: '2026-11-24', winEnd: '2026-12-02' });
  const p = toPlanRecord(far, far.plans[0], 'PR-2');
  assert.deepEqual([p.path, p.cmr_min === null, typeof p.max_ships], ['远', true, 'number']);
  assert.equal(toRunRecord(far, 'PR-2').berth_plan_batch_no, null, '远路径不用靠船计划');
  const item = M.inventory.items.find((x) => x.name === '烧结石灰石');
  const mix = E.predict({ biz: '大宗采购船', tons: 50000, load: 'QINHUANGDAO', disch: 'BAHODOPI', winStart: '2026-11-04', winEnd: '2026-12-10', item, pathBy: 'end' });
  assert.equal(toRunRecord(mix, 'PR-3').run_mode, '混合');
  assert.deepEqual(mix.plans.filter(Boolean).map((pl) => toPlanRecord(mix, pl, 'PR-3').path), mix.plans.filter(Boolean).map((pl) => (pl.mode === 'cmr' ? '近' : '远')), '每个方案各记自己的路径');
  assert.ok(toPlanRecord(mix, mix.plans[0], 'PR-3').provenance.stock.item === '烧结石灰石');
});
