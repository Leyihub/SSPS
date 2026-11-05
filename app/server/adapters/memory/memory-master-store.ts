import type { Berth, RouteRuleRow } from '../../domain/types';
import type { PortRow, VesselRow } from '../../domain/master';
import type { MasterStorePort, RouteStat } from '../../ports/master-store.port';

/** 内存实现：本地开发和测试用 */
export class MemoryMasterStore implements MasterStorePort {
  private p = new Map<string, PortRow>();
  private b = new Map<string, Berth>();
  private v = new Map<string, VesselRow>();
  private r = new Map<string, RouteRuleRow>();
  private done = new Map<string, unknown>();
  private vSeq = 0;
  private rSeq = 0;

  constructor(seed: { ports?: PortRow[]; berths?: Berth[]; vessels?: VesselRow[]; routeRules?: RouteRuleRow[] } = {}) {
    (seed.ports || []).forEach((x) => this.p.set(x.en, x));
    (seed.berths || []).forEach((x) => this.b.set(x.code, x));
    (seed.vessels || []).forEach((x) => { this.v.set(x.id, x); this.vSeq = Math.max(this.vSeq, Number(x.id.replace(/\D/g, '')) || 0); });
    (seed.routeRules || []).forEach((x) => { this.r.set(x.id, x); this.rSeq = Math.max(this.rSeq, Number(x.id.replace(/\D/g, '')) || 0); });
  }
  private once<T>(key: string | undefined, fn: () => T): T {
    if (key && this.done.has(key)) return this.done.get(key) as T;
    const r = fn(); if (key) this.done.set(key, r); return r;
  }

  async ports() { return [...this.p.values()]; }
  async savePort(x: PortRow, key?: string) { return this.once(key, () => { this.p.set(x.en, x); return x; }); }
  async berths() { return [...this.b.values()]; }
  async saveBerth(x: Berth, key?: string) { return this.once(key, () => { this.b.set(x.code, x); return x; }); }
  async vessels() { return [...this.v.values()]; }
  async saveVessel(x: Omit<VesselRow, 'id'> & { id?: string }, key?: string) {
    return this.once(key, () => { const row = { ...x, id: x.id || 'V-' + String(++this.vSeq).padStart(4, '0') } as VesselRow; this.v.set(row.id, row); return row; });
  }
  async routeRules() { return [...this.r.values()]; }
  async saveRouteRule(x: Omit<RouteRuleRow, 'id'> & { id?: string }, key?: string) {
    return this.once(key, () => { const row = { ...x, id: x.id || 'R-' + String(++this.rSeq).padStart(3, '0') } as RouteRuleRow; this.r.set(row.id, row); return row; });
  }
  async saveRouteStats(stats: RouteStat[]) { for (const s of stats) { const o = this.r.get(s.id); if (o) this.r.set(s.id, { ...o, samples: s.samples, p50: s.p50, p80: s.p80 }); } }
}
