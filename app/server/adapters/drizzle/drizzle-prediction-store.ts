import { and, desc, eq, like } from 'drizzle-orm';
import { announcement, berthPlanBatch, inventoryBatch, predictionPlan, predictionRun } from '../../database/schema';
import type { PredictionStorePort, StoredRun } from '../../ports/prediction-store.port';
import type { Db } from './db';
import { num } from './db';

/** 预测结果的持久化：D05 prediction_run / D06 prediction_plan / D07 announcement */
export class DrizzlePredictionStore implements PredictionStorePort {
  constructor(private readonly db: Db) {}

  /** 运行编号按日递增且并发安全：先占位（run_no 唯一），save 时再补全内容 */
  async nextRunNo(dateIso: string): Promise<string> {
    const d = dateIso.replace(/-/g, ''), prefix = 'PR-' + d + '-';
    for (let tries = 0; tries < 20; tries++) {
      const [last] = await this.db.select({ n: predictionRun.runNo }).from(predictionRun).where(like(predictionRun.runNo, prefix + '%')).orderBy(desc(predictionRun.runNo)).limit(1);
      const next = prefix + String((last ? Number(last.n.slice(prefix.length)) : 0) + 1 + tries).padStart(4, '0');
      const got = await this.db.insert(predictionRun).values({ runNo: next, input: {}, runBy: '（占位）' }).onConflictDoNothing().returning({ id: predictionRun.id });
      if (got.length) return next;
    }
    throw new Error('生成运行编号失败，请重试');
  }

  async save(r: Pick<StoredRun, 'runNo' | 'run' | 'plans'>) {
    const run = r.run as any;
    await this.db.transaction(async (tx) => {
      const [inv] = run.inventory_batch_no ? await tx.select({ id: inventoryBatch.id }).from(inventoryBatch).where(eq(inventoryBatch.batchNo, run.inventory_batch_no)) : [];
      const [bp] = run.berth_plan_batch_no ? await tx.select({ id: berthPlanBatch.id }).from(berthPlanBatch).where(eq(berthPlanBatch.batchNo, run.berth_plan_batch_no)) : [];
      const fields = { input: run.input, itemName: run.item_name ?? null, inventoryBatchId: inv?.id ?? null, berthPlanBatchId: bp?.id ?? null, runMode: run.run_mode ?? null, routeRuleId: run.route_rule_id ?? null, ruleBasis: run.rule_basis ?? null, borrowedRule: !!run.borrowed_rule, runBy: run.run_by ?? '', runAt: new Date() };
      const upd = await tx.update(predictionRun).set(fields).where(eq(predictionRun.runNo, r.runNo)).returning({ id: predictionRun.id });
      const runId = upd.length ? upd[0].id : (await tx.insert(predictionRun).values({ runNo: r.runNo, ...fields }).returning({ id: predictionRun.id }))[0].id;
      for (const p of r.plans as any[]) {
        await tx.insert(predictionPlan).values({ runId, label: p.label, departDate: p.depart_date ?? null, windowFrom: p.window_from, windowTo: p.window_to, path: p.path, cmrMin: p.cmr_min == null ? null : String(p.cmr_min), maxShips: p.max_ships ?? null, trust: p.trust, stockState: p.stock_state ?? null, stockoutDate: p.stockout_date ?? null, provenance: p.provenance, adopted: false, adoptedVoyage: null });
      }
    });
  }

  async get(runNo: string): Promise<StoredRun | null> {
    const [run] = await this.db.select().from(predictionRun).where(eq(predictionRun.runNo, runNo));
    if (!run || run.runBy === '（占位）') return null;
    const [inv] = run.inventoryBatchId ? await this.db.select({ n: inventoryBatch.batchNo }).from(inventoryBatch).where(eq(inventoryBatch.id, run.inventoryBatchId)) : [];
    const [bp] = run.berthPlanBatchId ? await this.db.select({ n: berthPlanBatch.batchNo }).from(berthPlanBatch).where(eq(berthPlanBatch.id, run.berthPlanBatchId)) : [];
    const plans = await this.db.select().from(predictionPlan).where(eq(predictionPlan.runId, run.id)).orderBy(predictionPlan.label);
    const anns = await this.db.select({ label: predictionPlan.label, content: announcement.content, text: announcement.text, by: announcement.generatedBy, at: announcement.generatedAt })
      .from(announcement).innerJoin(predictionPlan, eq(announcement.planId, predictionPlan.id)).where(eq(predictionPlan.runId, run.id)).orderBy(announcement.generatedAt);
    return {
      runNo,
      run: { run_no: runNo, input: run.input, item_name: run.itemName, inventory_batch_no: inv?.n ?? null, berth_plan_batch_no: bp?.n ?? null, run_mode: run.runMode, route_rule_id: run.routeRuleId, rule_basis: run.ruleBasis, borrowed_rule: run.borrowedRule, run_by: run.runBy },
      plans: plans.map((p) => ({ run_no: runNo, label: p.label, depart_date: p.departDate, window_from: p.windowFrom, window_to: p.windowTo, path: p.path, cmr_min: num(p.cmrMin), max_ships: p.maxShips, trust: p.trust, stock_state: p.stockState, stockout_date: p.stockoutDate, provenance: p.provenance, adopted: p.adopted, adopted_voyage: p.adoptedVoyage })),
      announcements: anns.map((a) => ({ label: a.label, parts: a.content as any, text: a.text, by: a.by, at: a.at.toISOString() })),
    };
  }

  async adopt(runNo: string, label: 'A' | 'B', voyageNo: string | null) {
    const [run] = await this.db.select({ id: predictionRun.id }).from(predictionRun).where(eq(predictionRun.runNo, runNo));
    if (run) await this.db.update(predictionPlan).set({ adopted: true, adoptedVoyage: voyageNo }).where(and(eq(predictionPlan.runId, run.id), eq(predictionPlan.label, label)));
  }

  async saveAnnouncement(runNo: string, a: StoredRun['announcements'][number]) {
    const [p] = await this.db.select({ id: predictionPlan.id }).from(predictionPlan).innerJoin(predictionRun, eq(predictionPlan.runId, predictionRun.id)).where(and(eq(predictionRun.runNo, runNo), eq(predictionPlan.label, a.label)));
    if (!p) throw new Error('找不到方案：' + runNo + ' ' + a.label);
    await this.db.insert(announcement).values({ planId: p.id, content: a.parts as any, text: a.text, generatedBy: a.by || '系统', generatedAt: new Date(a.at) });
  }
}
