import type { HealthCheck, HealthPort, SyncLogEntry, SyncLogPort } from '../../ports/sync-log.port';

export class MemorySyncLog implements SyncLogPort {
  private rows: SyncLogEntry[] = [];
  async add(e: SyncLogEntry) { this.rows.unshift(e); }
  async list(opt: { failOnly?: boolean; limit?: number } = {}) { return this.rows.filter((x) => !opt.failOnly || x.ok !== '成功').slice(0, opt.limit ?? 200); }
}

/** 内存模式的自检：如实说明没有连接真实飞书和数据库，不装作正常 */
export class MemoryHealth implements HealthPort {
  async checks(): Promise<HealthCheck[]> {
    return [
      { name: '数据存储', status: '提醒', detail: '当前使用内存实现（本地演示 / 测试），重启即清；还没有接应用数据库和飞书多维表格' },
      { name: '飞书应用凭证（租户令牌）', status: '提醒', detail: '未配置：内存模式不访问飞书' },
      { name: '航运主数据多维表格', status: '提醒', detail: '未连接' },
      { name: '云空间靠船计划文件夹', status: '提醒', detail: '未连接（云空间拉取待接入）' },
      { name: '兼容表 T09a / T09b', status: '提醒', detail: '尚未生成（兼容表刷新待接入）' },
    ];
  }
}
