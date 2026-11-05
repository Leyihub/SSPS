import type { PredictionStorePort, StoredRun } from '../../ports/prediction-store.port';

/** 内存实现：本地开发和测试用；真实实现写 D05/D06/D07（Drizzle） */
export class MemoryPredictionStore implements PredictionStorePort {
  private runs = new Map<string, StoredRun>();
  private seq = new Map<string, number>();

  async nextRunNo(dateIso: string): Promise<string> {
    const d = dateIso.replace(/-/g, ''); const n = (this.seq.get(d) || 0) + 1; this.seq.set(d, n);
    return 'PR-' + d + '-' + String(n).padStart(4, '0');
  }
  async save(r: Pick<StoredRun, 'runNo' | 'run' | 'plans'>) { this.runs.set(r.runNo, { ...r, announcements: [] }); }
  async get(runNo: string) { return this.runs.get(runNo) || null; }
  async adopt(runNo: string, label: 'A' | 'B', voyageNo: string | null) {
    const r = this.runs.get(runNo); if (!r) return;
    r.plans = r.plans.map((p) => (p.label === label ? { ...p, adopted: true, adopted_voyage: voyageNo } : p));
  }
  async saveAnnouncement(runNo: string, a: StoredRun['announcements'][number]) { this.runs.get(runNo)?.announcements.push(a); }
}
