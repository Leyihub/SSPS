import { Global, Logger, Module } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import { SNAPSHOT_PORT, PREDICTION_STORE, VOYAGE_STORE, DIRECTORY_PORT, MASTER_STORE, IMPORT_STORE, SYNC_LOG, HEALTH_PORT, BASE_GATEWAY, USER_LOOKUP } from '../../ports/tokens';
import { LarkModule } from '../../lark/lark.module';
import { createOutbox } from '../../lark/outbox';
import { createDrizzleOutboxStore } from '../../lark/outbox-store';
import { DrizzleMasterStore } from '../../adapters/drizzle/drizzle-master-store';
import { DrizzleVoyageStore } from '../../adapters/drizzle/drizzle-voyage-store';
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
 *   SSPS_STORE=real：用应用数据库（平台注入的 DRIZZLE_DATABASE）和飞书多维表格（需要 LARK_APP_ID、LARK_APP_SECRET、BITABLE_APP_TOKEN、BITABLE_TABLE_IDS）。
 *   真实模式下身份目录（平台角色 → 业务角色）还是占位实现，见 docs/handoff/task-book.md W15——正式使用前必须先做。
 */
const real = () => process.env.SSPS_STORE === 'real';
const log = new Logger('PortsModule');
const need = (g: unknown) => { if (!g) throw new Error('SSPS_STORE=real 需要飞书多维表格配置：LARK_APP_ID、LARK_APP_SECRET、BITABLE_APP_TOKEN、BITABLE_TABLE_IDS'); return g as any; };
const db = { provide: 'SSPS_DB', inject: [{ token: DRIZZLE_DATABASE, optional: true }], useFactory: (d: unknown) => { if (real() && !d) throw new Error('SSPS_STORE=real 需要平台注入的 DRIZZLE_DATABASE'); return d ?? null; } };
const pick = (token: symbol, mem: () => unknown, drz: (d: any) => unknown) => ({ provide: token, inject: ['SSPS_DB'], useFactory: (d: unknown) => (real() ? drz(d) : mem()) });

@Global()
@Module({
  imports: [LarkModule],
  providers: [
    db,
    { provide: 'SSPS_OUTBOX', inject: ['SSPS_DB'], useFactory: (d: any) => (real() ? createOutbox(createDrizzleOutboxStore(d)) : null) },
    { provide: MASTER_STORE, inject: ['SSPS_DB', BASE_GATEWAY, 'SSPS_OUTBOX'], useFactory: (d: any, g: any, o: any) => (real() ? new DrizzleMasterStore(d, need(g), o) : new MemoryMasterStore(seedMaster())) },
    { provide: VOYAGE_STORE, inject: ['SSPS_DB', BASE_GATEWAY, 'SSPS_OUTBOX', USER_LOOKUP], useFactory: (d: any, g: any, o: any, u: any) => (real() ? new DrizzleVoyageStore(d, need(g), o, u) : new MemoryVoyageStore()) },
    { provide: DIRECTORY_PORT, useFactory: () => { if (real()) log.warn('身份目录还是占位实现：任何登录用户都会被当作「业务员 · 大宗采购部」（任务 W15）'); return new MemoryDirectory(); } },
    pick(PREDICTION_STORE, () => new MemoryPredictionStore(), (d) => new DrizzlePredictionStore(d)),
    pick(IMPORT_STORE, () => new MemoryImportStore(), (d) => new DrizzleImportStore(d)),
    pick(SYNC_LOG, () => new MemorySyncLog(), (d) => new DrizzleSyncLog(d)),
    pick(HEALTH_PORT, () => new MemoryHealth(), (d) => new DrizzleHealth(d)),
    { provide: SNAPSHOT_PORT, inject: [MASTER_STORE, VOYAGE_STORE, IMPORT_STORE], useFactory: (m: MasterStorePort, v: VoyageStorePort, i: ImportStorePort) => new LiveSnapshot(m, v, i) },
  ],
  exports: [SNAPSHOT_PORT, PREDICTION_STORE, VOYAGE_STORE, DIRECTORY_PORT, MASTER_STORE, IMPORT_STORE, SYNC_LOG, HEALTH_PORT],
})
export class PortsModule {}
