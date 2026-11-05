import type { CargoLine, SalesExt, Settlement, Voyage } from '../../domain/voyage';
import type { ChangeEntry, DataIssue, EtaRevision, NewCargo, NewVoyage, VoyageStorePort } from '../../ports/voyage-store.port';

/** 内存实现：本地开发和测试用；同一幂等键重复提交只执行一次 */
export class MemoryVoyageStore implements VoyageStorePort {
  private voyages = new Map<string, Voyage>();
  private lines = new Map<string, CargoLine[]>();
  private settle = new Map<string, Settlement>();
  private sales = new Map<string, SalesExt>();
  private eta: EtaRevision[] = [];
  private log: ChangeEntry[] = [];
  private issueList: Array<DataIssue & { id: string; status: string; closedBy?: string | null; closedAt?: string | null }> = [];
  private done = new Map<string, unknown>();
  private seq = 0;

  constructor(seed: Voyage[] = []) { seed.forEach((v) => { this.voyages.set(v.id, v); this.seq = Math.max(this.seq, Number(v.id.slice(-4)) || 0); }); }
  /** 演示数据一次性灌入（只给本地演示服务用，不走幂等和日志） */
  seed(d: { voyages: Voyage[]; cargo?: CargoLine[]; settlement?: Record<string, Settlement>; sales?: Record<string, SalesExt>; eta?: EtaRevision[]; log?: ChangeEntry[]; issues?: DataIssue[] }) {
    for (const v of d.voyages) { this.voyages.set(v.id, v); this.seq = Math.max(this.seq, Number(v.id.slice(-4)) || 0); }
    for (const c of d.cargo || []) this.lines.set(c.voyage, [...(this.lines.get(c.voyage) || []), c]);
    for (const [k, v] of Object.entries(d.settlement || {})) this.settle.set(k, v);
    for (const [k, v] of Object.entries(d.sales || {})) this.sales.set(k, v);
    this.eta.push(...(d.eta || [])); this.log.push(...(d.log || []));
    for (const i of d.issues || []) this.issueList.push({ ...i, id: (i as any).id || 'DQ-' + String(this.issueList.length + 1).padStart(4, '0'), status: (i as any).status || '待处理' });
  }
  private once<T>(key: string | undefined, fn: () => T): T {
    if (key && this.done.has(key)) return this.done.get(key) as T;
    const r = fn(); if (key) this.done.set(key, r); return r;
  }
  private need(id: string) { const v = this.voyages.get(id); if (!v) throw new Error('航次不存在：' + id); return v; }

  async list() { return [...this.voyages.values()]; }
  async get(id: string) { return this.voyages.get(id) || null; }
  async create(v: NewVoyage, cargo: NewCargo[], key?: string) {
    return this.once(key, () => {
      const id = 'VY-2026-' + String(++this.seq).padStart(4, '0'), voyage = { ...v, id } as Voyage;
      this.voyages.set(id, voyage);
      const ls = cargo.map((c, i) => ({ ...c, voyage: id, no: 'CL-' + String(i + 1).padStart(4, '0') }));
      this.lines.set(id, ls);
      return { voyage, cargo: ls };
    });
  }
  async update(id: string, patch: Partial<Voyage>, key?: string) {
    return this.once(key, () => { const v = { ...this.need(id), ...patch, id }; this.voyages.set(id, v); return v; });
  }
  async cargo(id: string) { return this.lines.get(id) || []; }
  async addCargo(id: string, line: NewCargo, key?: string) {
    return this.once(key, () => { const ls = this.lines.get(id) || [], c = { ...line, voyage: id, no: 'CL-' + String(ls.length + 1).padStart(4, '0') }; this.lines.set(id, [...ls, c]); return c; });
  }
  async updateCargo(id: string, no: string, patch: Partial<CargoLine>, key?: string) {
    return this.once(key, () => { const ls = this.lines.get(id) || [], i = ls.findIndex((c) => c.no === no); if (i < 0) throw new Error('货物明细不存在：' + no); ls[i] = { ...ls[i], ...patch, no, voyage: id }; return ls[i]; });
  }
  async deleteCargo(id: string, no: string, key?: string) { this.once(key, () => { this.lines.set(id, (this.lines.get(id) || []).filter((c) => c.no !== no)); return true; }); }
  async settlement(id: string) { return this.settle.get(id) || null; }
  async saveSettlement(id: string, patch: Settlement, key?: string) { return this.once(key, () => { const s = { ...(this.settle.get(id) || {}), ...patch }; this.settle.set(id, s); return s; }); }
  async salesExt(id: string) { return this.sales.get(id) || null; }
  async saveSalesExt(id: string, patch: Partial<SalesExt>, key?: string) { return this.once(key, () => { const s = { way: null, contract: null, ...(this.sales.get(id) || {}), ...patch } as SalesExt; this.sales.set(id, s); return s; }); }
  async etaRevisions(id: string) { return this.eta.filter((r) => r.voyage === id); }
  async addEtaRevision(r: EtaRevision) { this.eta.push(r); }
  async changeLog(id: string) { return this.log.filter((e) => e.voyage === id); }
  async addChangeLog(entries: ChangeEntry[]) { this.log.push(...entries); }
  async addIssues(issues: DataIssue[]) {
    for (const i of issues) {
      if (this.issueList.some((x) => x.object === i.object && x.type === i.type && (x.field || '') === (i.field || '') && x.status !== '已关闭')) continue;
      this.issueList.push({ ...i, id: 'DQ-' + String(this.issueList.length + 1).padStart(4, '0'), status: '待处理' });
    }
  }
  async issues() { return this.issueList; }
  async closeIssue(id: string, by: string, at: string) { const i = this.issueList.find((x) => x.id === id); if (i) { i.status = '已关闭'; i.closedBy = by; i.closedAt = at; } }
}
