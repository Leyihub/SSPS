import type { Snapshot } from '../domain/types';

export interface SnapshotPort {
  /** 读取当前数据快照。预测与日历都用同一份，保证口径一致 */
  load(): Promise<Snapshot>;
}
