import { Global, Logger, Module } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import { SNAPSHOT_PORT, PREDICTION_STORE, VOYAGE_STORE, DIRECTORY_PORT, MASTER_STORE, IMPORT_STORE, SYNC_LOG, HEALTH_PORT } from '../../ports/tokens';
import { MemoryPredictionStore } from '../../adapters/memory/memory-prediction-store';
import { MemoryVoyageStore } from '../../adapters/memory/memory-voyage-store';
import { MemoryDirectory } from '../../adapters/memory/memory-directory';
import { MemoryMasterStore } from '../../adapters/memory/memory-master-store';
import { MemoryImportStore } from '../../adapters/memory/memory-import-store';
import { MemoryHealth, MemorySyncLog } from '../../adapters/memory/memory-sync-log';
import { LiveSnapshot } from '../../adapters/memory/live-snapshot';
import { seedMaster } from '../../adapters/memory/seed';
import { DrizzlePredictionStore } from '../../adapters/drizzle/drizzle-prediction-store';
import { DrizzleImportStore } from '../../adapters/drizzle/drizzle-import-store';
import { DrizzleSyncLog } from '../../adapters/drizzle/drizzle-sync-log';
import { DrizzleHealth } from '../../adapters/drizzle/drizzle-health';
import type { MasterStorePort } from '../../ports/master-store.port';
import type { VoyageStorePort } from '../../ports/voyage-store.port';
import type { ImportStorePort } from '../../ports/import-store.port';

/**
 * 数据端口的提供者。
 *   SSPS_STORE 未设置 / memory：全部用内存实现（本地演示、测试）；
 *   SSPS_STORE=real：用应用数据库（平台注入的 DRIZZLE_DATABASE）。目前真实实现已有：预测、靠船计划与库存导入、运行日志、自检；
 *   主数据、航次的真实实现（读镜像表、写飞书）还没有，仍是内存实现，启动时会打警告——此时「真实」模式只适合联调导入和预测，不能当正式环境用。
 */
const real = () => process.env.SSPS_STORE === 'real';
const log = new Logger('PortsModule');
const db = { provide: 'SSPS_DB', inject: [{ token: DRIZZLE_DATABASE, optional: true }], useFactory: (d: unknown) => { if (real() && !d) throw new Error('SSPS_STORE=real 需要平台注入的 DRIZZLE_DATABASE'); return d ?? null; } };
const pick = (token: symbol, mem: () => unknown, drz: (d: any) => unknown) => ({ provide: token, inject: ['SSPS_DB'], useFactory: (d: unknown) => (real() ? drz(d) : mem()) });

@Global()
@Module({
  providers: [
    db,
    { provide: MASTER_STORE, useFactory: () => { if (real()) log.warn('主数据仍是内存实现（读镜像表、写飞书的真实实现还没有）'); return new MemoryMasterStore(seedMaster()); } },
    { provide: VOYAGE_STORE, useFactory: () => { if (real()) log.warn('航次仍是内存实现（读镜像表、写飞书的真实实现还没有）'); return new MemoryVoyageStore(); } },
    { provide: DIRECTORY_PORT, useFactory: () => new MemoryDirectory() },
    pick(PREDICTION_STORE, () => new MemoryPredictionStore(), (d) => new DrizzlePredictionStore(d)),
    pick(IMPORT_STORE, () => new MemoryImportStore(), (d) => new DrizzleImportStore(d)),
    pick(SYNC_LOG, () => new MemorySyncLog(), (d) => new DrizzleSyncLog(d)),
    pick(HEALTH_PORT, () => new MemoryHealth(), (d) => new DrizzleHealth(d)),
    { provide: SNAPSHOT_PORT, inject: [MASTER_STORE, VOYAGE_STORE, IMPORT_STORE], useFactory: (m: MasterStorePort, v: VoyageStorePort, i: ImportStorePort) => new LiveSnapshot(m, v, i) },
  ],
  exports: [SNAPSHOT_PORT, PREDICTION_STORE, VOYAGE_STORE, DIRECTORY_PORT, MASTER_STORE, IMPORT_STORE, SYNC_LOG, HEALTH_PORT],
})
export class PortsModule {}
