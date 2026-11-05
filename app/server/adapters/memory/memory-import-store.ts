import type { InventoryItem, PlanRow } from '../../domain/types';
import type { BerthBatch, BerthRow, ImportStorePort, InventoryBatch } from '../../ports/import-store.port';

/** 内存实现：本地开发和测试用。保存是原子的——先整批放好，再切当前指针 */
export class MemoryImportStore implements ImportStorePort {
  private bb: BerthBatch[] = [];
  private br = new Map<string, BerthRow[]>();
  private ib: InventoryBatch[] = [];
  private inv = new Map<string, { items: InventoryItem[]; errorRows: Array<Record<string, unknown>> }>();
  private done = new Map<string, unknown>();
  private once<T>(key: string | undefined, fn: () => T): T {
    if (key && this.done.has(key)) return this.done.get(key) as T;
    const r = fn(); if (key) this.done.set(key, r); return r;
  }

  async saveBerthBatch(b: Omit<BerthBatch, 'isCurrent'>, rows: BerthRow[], key?: string) {
    return this.once(key, () => {
      if (this.bb.some((x) => x.batchNo === b.batchNo)) throw new Error('批次号已存在：' + b.batchNo);
      this.br.set(b.batchNo, rows);
      const rec = { ...b, isCurrent: b.status === '成功' } as BerthBatch;
      if (rec.isCurrent) this.bb = this.bb.map((x) => ({ ...x, isCurrent: false }));
      this.bb.push(rec);
      return rec;
    });
  }
  async berthBatches() { return [...this.bb].reverse(); }
  async berthRows(batchNo: string) { return this.br.get(batchNo) || null; }
  async currentBerthBatch() { return this.bb.find((x) => x.isCurrent) || null; }
  async currentPlanRows(): Promise<PlanRow[]> {
    const cur = await this.currentBerthBatch();
    if (!cur) return [];
    return (this.br.get(cur.batchNo) || []).filter((r) => r.status === 'active').map((r) => ({ berth: r.berth, inPool: r.inPool, start: r.start!.slice(0, 10), end: r.end!.slice(0, 10), eta: r.eta!.slice(0, 10), vessel: r.vessel, cargo: r.cargo, tons: r.tons, matchVoyage: r.matchVoyage }));
  }
  async hasFileToken(token: string) { return this.bb.some((x) => x.fileToken === token) || this.ib.some((x) => x.fileToken === token); }

  async saveInventoryBatch(b: Omit<InventoryBatch, 'isCurrent'>, items: InventoryItem[], errorRows: Array<Record<string, unknown>>, key?: string) {
    return this.once(key, () => {
      if (this.ib.some((x) => x.batchNo === b.batchNo)) throw new Error('批次号已存在：' + b.batchNo);
      this.inv.set(b.batchNo, { items, errorRows });
      const rec = { ...b, isCurrent: b.status === '成功' } as InventoryBatch;
      if (rec.isCurrent) this.ib = this.ib.map((x) => ({ ...x, isCurrent: false }));
      this.ib.push(rec);
      return rec;
    });
  }
  async inventoryBatches() { return [...this.ib].reverse(); }
  async currentInventory() {
    const batch = this.ib.find((x) => x.isCurrent) || null, d = batch ? this.inv.get(batch.batchNo)! : { items: [], errorRows: [] };
    return { batch, items: d.items, errorRows: d.errorRows };
  }
}
