import type { Snapshot } from '../../domain/types';
import type { SnapshotPort } from '../../ports/snapshot.port';

/** 内存实现：测试和本地开发用，数据由调用方提供 */
export class MemorySnapshot implements SnapshotPort {
  constructor(private data: Snapshot) {}
  set(data: Snapshot) { this.data = data; }
  async load() { return this.data; }
}
