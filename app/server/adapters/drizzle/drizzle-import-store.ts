import { and, desc, eq } from 'drizzle-orm';
import { berthPlanBatch, berthPlanRow, inventoryBatch, inventoryRow } from '../../database/schema';
import type { InventoryItem, PlanRow } from '../../domain/types';
import { HEADER_ALIASES } from '../../importers/imipPlan';
import { parseNumber } from '../../importers/common';
import { dn, iso } from '../../lib/dates';
import type { BerthBatch, BerthRow, ImportStorePort, InventoryBatch } from '../../ports/import-store.port';
import type { Db } from './db';
import { fromTs, num, toTs } from './db';
import { once } from './idempotency';

const CHUNK = 500;
const pick = (raw: any, names: string[]) => { for (const n of names) if (raw?.[n] !== undefined && raw[n] !== null && raw[n] !== '') return raw[n]; return undefined; };
async function chunked<T>(rows: T[], fn: (part: T[]) => Promise<unknown>) { for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK)); }

/** 靠船计划（D03/D04）与库存（D11/D12）批次存储。整批在一个事务里写完，成功后才切「当前批次」指针 */
export class DrizzleImportStore implements ImportStorePort {
  constructor(private readonly db: Db) {}

  private batchOf(b: typeof berthPlanBatch.$inferSelect): BerthBatch {
    return { batchNo: b.batchNo, planDate: b.planDate, source: b.source as BerthBatch['source'], fileName: b.fileName, fileToken: b.driveFileToken, total: b.totalRows, active: b.activeRows, history: b.historyRows, anomaly: b.anomalyRows, coverTo: b.coverTo, validation: b.validation, status: b.status as BerthBatch['status'], isCurrent: b.isCurrent, importedBy: b.importedBy ?? '', importedAt: fromTs(b.createdAt) ?? '' };
  }

  saveBerthBatch(b: Omit<BerthBatch, 'isCurrent'>, rows: BerthRow[], key?: string): Promise<BerthBatch> {
    return once(this.db, key, 'berth_batch', 'berth_plan_batch', () => this.db.transaction(async (tx) => {
      const [rec] = await tx.insert(berthPlanBatch).values({ batchNo: b.batchNo, planDate: b.planDate, source: b.source, fileName: b.fileName, driveFileToken: b.fileToken, totalRows: b.total, activeRows: b.active, historyRows: b.history, anomalyRows: b.anomaly, coverTo: b.coverTo, validation: b.validation, status: b.status, isCurrent: false, importedBy: b.importedBy }).returning();
      await chunked(rows, (part) => tx.insert(berthPlanRow).values(part.map((r) => ({ batchId: rec.id, lineNo: r.line, raw: r.raw, berthRaw: r.berthRaw, berth: r.berth, inPool: r.inPool, eta: toTs(r.eta), etb: toTs(r.start), etd: toTs(r.end), vessel: r.vessel, shipType: r.shipType, cargo: r.cargo, tons: r.tons == null ? null : String(r.tons), ownerUnit: r.owner, rowStatus: r.status, matchVoyage: r.matchVoyage, issueCode: r.issue?.code ?? null, issueText: r.issue?.text ?? null }))));
      if (b.status === '成功') {
        await tx.update(berthPlanBatch).set({ isCurrent: false }).where(eq(berthPlanBatch.isCurrent, true));
        await tx.update(berthPlanBatch).set({ isCurrent: true }).where(eq(berthPlanBatch.id, rec.id));
      }
      return this.batchOf({ ...rec, isCurrent: b.status === '成功' });
    }));
  }
  async berthBatches() { return (await this.db.select().from(berthPlanBatch).orderBy(desc(berthPlanBatch.createdAt), desc(berthPlanBatch.batchNo))).map((x) => this.batchOf(x)); }
  async berthRows(batchNo: string): Promise<BerthRow[] | null> {
    const [b] = await this.db.select({ id: berthPlanBatch.id }).from(berthPlanBatch).where(eq(berthPlanBatch.batchNo, batchNo));
    if (!b) return null;
    const rows = await this.db.select().from(berthPlanRow).where(eq(berthPlanRow.batchId, b.id)).orderBy(berthPlanRow.lineNo);
    return rows.map((r) => ({
      line: r.lineNo, status: r.rowStatus as BerthRow['status'], terminal: String(pick(r.raw, HEADER_ALIASES.terminal) ?? ''), berthRaw: r.berthRaw ?? '', berth: r.berth, inPool: r.inPool, vessel: r.vessel ?? '',
      loa: parseNumber(pick(r.raw, HEADER_ALIASES.loa))?.value ?? null, shipType: r.shipType ?? '', cargo: r.cargo ?? '', tons: num(r.tons), owner: r.ownerUnit ?? '',
      eta: fromTs(r.eta), start: fromTs(r.etb), end: fromTs(r.etd), matchVoyage: r.matchVoyage, issue: r.issueCode ? { code: r.issueCode, text: r.issueText ?? '' } : undefined, raw: r.raw as Record<string, unknown>,
    }));
  }
  async currentBerthBatch() { const [b] = await this.db.select().from(berthPlanBatch).where(eq(berthPlanBatch.isCurrent, true)); return b ? this.batchOf(b) : null; }
  async currentPlanRows(): Promise<PlanRow[]> {
    const rows = await this.db.select({ r: berthPlanRow }).from(berthPlanRow).innerJoin(berthPlanBatch, eq(berthPlanRow.batchId, berthPlanBatch.id)).where(and(eq(berthPlanBatch.isCurrent, true), eq(berthPlanRow.rowStatus, 'active'))).orderBy(berthPlanRow.lineNo);
    const d = (t: Date | null) => (fromTs(t) ?? '').slice(0, 10);
    return rows.map(({ r }) => ({ berth: r.berth, inPool: r.inPool, start: d(r.etb), end: d(r.etd), eta: d(r.eta), vessel: r.vessel ?? '', cargo: r.cargo ?? '', tons: num(r.tons), matchVoyage: r.matchVoyage }));
  }
  async hasFileToken(token: string) {
    const a = await this.db.select({ id: berthPlanBatch.id }).from(berthPlanBatch).where(eq(berthPlanBatch.driveFileToken, token)).limit(1);
    const b = await this.db.select({ id: inventoryBatch.id }).from(inventoryBatch).where(eq(inventoryBatch.driveFileToken, token)).limit(1);
    return a.length + b.length > 0;
  }

  // ---------------- 库存 ----------------
  private invOf(b: typeof inventoryBatch.$inferSelect): InventoryBatch {
    const items = Array.isArray(b.itemsSummary) ? (b.itemsSummary as unknown[]).length : 0;
    return { batchNo: b.batchNo, importDate: b.importDate, source: b.source as InventoryBatch['source'], fileName: b.fileName, fileToken: b.driveFileToken, rows: b.totalRows, items, errorRows: b.errorRows, status: b.status as InventoryBatch['status'], isCurrent: b.isCurrent, importedBy: b.importedBy ?? '', importedAt: fromTs(b.createdAt) ?? '' };
  }
  saveInventoryBatch(b: Omit<InventoryBatch, 'isCurrent'>, items: InventoryItem[], errorRows: Array<Record<string, unknown>>, key?: string): Promise<InventoryBatch> {
    return once(this.db, key, 'inventory_batch', 'inventory_batch', () => this.db.transaction(async (tx) => {
      const summary = items.map(({ series, ...s }) => s);
      const [rec] = await tx.insert(inventoryBatch).values({ batchNo: b.batchNo, importDate: b.importDate, source: b.source, fileName: b.fileName, driveFileToken: b.fileToken, totalRows: b.rows, errorRows: b.errorRows, status: b.status, isCurrent: false, importedBy: b.importedBy, itemsSummary: summary }).returning();
      const typeOf = new Map(items.map((i) => [i.name, i.type]));
      const flat = items.flatMap((i) => i.series.map(([d, s, dl]) => ({ batchId: rec.id, stockDate: iso(d), itemName: i.name, itemType: i.type, dailyUse: dl == null ? null : String(dl), stock: String(s), availDays: null, isError: false, rawStock: null as string | null })));
      await chunked(flat, (part) => tx.insert(inventoryRow).values(part));
      await chunked(errorRows, (part) => tx.insert(inventoryRow).values(part.map((e: any) => ({ batchId: rec.id, stockDate: String(e.date), itemName: String(e.name), itemType: typeOf.get(e.name) ?? '其他', dailyUse: null, stock: null, availDays: null, isError: true, rawStock: String(e.raw ?? '') }))));
      if (b.status === '成功') {
        await tx.update(inventoryBatch).set({ isCurrent: false }).where(eq(inventoryBatch.isCurrent, true));
        await tx.update(inventoryBatch).set({ isCurrent: true }).where(eq(inventoryBatch.id, rec.id));
      }
      return this.invOf({ ...rec, isCurrent: b.status === '成功' });
    }));
  }
  async inventoryBatches() { return (await this.db.select().from(inventoryBatch).orderBy(desc(inventoryBatch.createdAt), desc(inventoryBatch.batchNo))).map((x) => this.invOf(x)); }
  async currentInventory() {
    const [b] = await this.db.select().from(inventoryBatch).where(eq(inventoryBatch.isCurrent, true));
    if (!b) return { batch: null, items: [], errorRows: [] };
    const rows = await this.db.select().from(inventoryRow).where(eq(inventoryRow.batchId, b.id)).orderBy(inventoryRow.itemName, inventoryRow.stockDate);
    const series = new Map<string, Array<[number, number, number]>>(), errs: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      if (r.isError) { errs.push({ name: r.itemName, date: r.stockDate, raw: r.rawStock }); continue; }
      (series.get(r.itemName) ?? series.set(r.itemName, []).get(r.itemName)!).push([dn(r.stockDate), Number(r.stock), Number(r.dailyUse)]);
    }
    const items = ((b.itemsSummary as any[]) ?? []).map((s) => ({ ...s, series: series.get(s.name) ?? [] })) as InventoryItem[];
    return { batch: this.invOf(b), items, errorRows: errs };
  }
}
