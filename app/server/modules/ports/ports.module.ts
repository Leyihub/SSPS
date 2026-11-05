import { Global, Module } from '@nestjs/common';
import { SNAPSHOT_PORT, PREDICTION_STORE, VOYAGE_STORE, DIRECTORY_PORT } from '../../ports/tokens';
import { MemorySnapshot } from '../../adapters/memory/memory-snapshot';
import { MemoryPredictionStore } from '../../adapters/memory/memory-prediction-store';
import { MemoryVoyageStore } from '../../adapters/memory/memory-voyage-store';
import { MemoryDirectory } from '../../adapters/memory/memory-directory';
import { seedSnapshot } from '../../adapters/memory/seed';

/**
 * 数据端口的提供者。现在用内存实现（本地开发、测试）；
 * 建库并建好镜像同步后，这里换成 Drizzle 应用库 + 飞书多维表格的真实实现，服务层不用改。
 */
@Global()
@Module({
  providers: [
    { provide: SNAPSHOT_PORT, useFactory: () => new MemorySnapshot(seedSnapshot(new Date().toISOString().slice(0, 10))) },
    { provide: PREDICTION_STORE, useClass: MemoryPredictionStore },
    { provide: VOYAGE_STORE, useFactory: () => new MemoryVoyageStore() },
    { provide: DIRECTORY_PORT, useFactory: () => new MemoryDirectory() },
  ],
  exports: [SNAPSHOT_PORT, PREDICTION_STORE, VOYAGE_STORE, DIRECTORY_PORT],
})
export class PortsModule {}
