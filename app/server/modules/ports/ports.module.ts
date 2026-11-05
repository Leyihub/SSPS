import { Global, Module } from '@nestjs/common';
import { SNAPSHOT_PORT, PREDICTION_STORE, VOYAGE_STORE, DIRECTORY_PORT, MASTER_STORE, IMPORT_STORE, SYNC_LOG, HEALTH_PORT } from '../../ports/tokens';
import { MemoryPredictionStore } from '../../adapters/memory/memory-prediction-store';
import { MemoryVoyageStore } from '../../adapters/memory/memory-voyage-store';
import { MemoryDirectory } from '../../adapters/memory/memory-directory';
import { MemoryMasterStore } from '../../adapters/memory/memory-master-store';
import { MemoryImportStore } from '../../adapters/memory/memory-import-store';
import { MemoryHealth, MemorySyncLog } from '../../adapters/memory/memory-sync-log';
import { LiveSnapshot } from '../../adapters/memory/live-snapshot';
import { seedMaster } from '../../adapters/memory/seed';
import type { MasterStorePort } from '../../ports/master-store.port';
import type { ImportStorePort } from '../../ports/import-store.port';
import type { VoyageStorePort } from '../../ports/voyage-store.port';

/**
 * 数据端口的提供者。现在用内存实现（本地开发、测试）；
 * 建库并建好镜像同步后，这里换成 Drizzle 应用库 + 飞书多维表格的真实实现，服务层不用改。
 */
@Global()
@Module({
  providers: [
    { provide: MASTER_STORE, useFactory: () => new MemoryMasterStore(seedMaster()) },
    { provide: VOYAGE_STORE, useFactory: () => new MemoryVoyageStore() },
    { provide: IMPORT_STORE, useFactory: () => new MemoryImportStore() },
    { provide: SYNC_LOG, useFactory: () => new MemorySyncLog() },
    { provide: HEALTH_PORT, useClass: MemoryHealth },
    { provide: DIRECTORY_PORT, useFactory: () => new MemoryDirectory() },
    { provide: PREDICTION_STORE, useClass: MemoryPredictionStore },
    { provide: SNAPSHOT_PORT, inject: [MASTER_STORE, VOYAGE_STORE, IMPORT_STORE], useFactory: (m: MasterStorePort, v: VoyageStorePort, i: ImportStorePort) => new LiveSnapshot(m, v, i) },
  ],
  exports: [SNAPSHOT_PORT, PREDICTION_STORE, VOYAGE_STORE, DIRECTORY_PORT, MASTER_STORE, IMPORT_STORE, SYNC_LOG, HEALTH_PORT],
})
export class PortsModule {}
