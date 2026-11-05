import type { Snapshot } from '../../domain/types';
import { toLite } from '../../domain/voyageLite';
import type { SnapshotPort } from '../../ports/snapshot.port';
import type { MasterStorePort } from '../../ports/master-store.port';
import type { VoyageStorePort } from '../../ports/voyage-store.port';
import type { ImportStorePort } from '../../ports/import-store.port';

/**
 * 动态快照：主数据、航次来自各自的存储，所以航次或主数据一改，预测和日历马上用上新数据。
 * 靠船计划、库存来自导入存储的「当前批次」；没有导入存储时（只测主数据和航次）用 extras。
 */
export class LiveSnapshot implements SnapshotPort {
  constructor(
    private master: MasterStorePort,
    private voyages: VoyageStorePort,
    private imports?: ImportStorePort,
    private today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  async load(): Promise<Snapshot> {
    const [ports, berths, routeRules, vs] = await Promise.all([this.master.ports(), this.master.berths(), this.master.routeRules(), this.voyages.list()]);
    const lite = (await Promise.all(vs.map(async (v) => toLite(v, await this.voyages.cargo(v.id))))).filter((x): x is NonNullable<typeof x> => !!x);
    const batch = this.imports ? await this.imports.currentBerthBatch() : null, inv = this.imports ? await this.imports.currentInventory() : null;
    return {
      today: this.today(), berths, routeRules, voyages: lite, ports: ports.filter((p) => p.status === '启用').map((p) => ({ en: p.en, cn: p.cn, alias: p.alias, isLocal: p.isLocal })),
      planRows: this.imports ? await this.imports.currentPlanRows() : [],
      berthPlanBatch: batch ? { batchNo: batch.batchNo, planDate: batch.planDate, source: batch.source, coverTo: batch.coverTo } : null,
      inventory: { batchNo: inv?.batch?.batchNo ?? null, items: inv?.items ?? [] },
    };
  }
}
