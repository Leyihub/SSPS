// 运行日志（D09 sync_log）与连通性自检。真实实现：日志写应用库；自检检查飞书令牌、多维表格、云空间文件夹、应用数据库。
export interface SyncLogEntry { type: string; start: string; end: string; n: number; ok: '成功' | '失败' | '部分失败'; err: string }
export interface SyncLogPort {
  add(e: SyncLogEntry): Promise<void>;
  list(opt?: { failOnly?: boolean; limit?: number }): Promise<SyncLogEntry[]>;       // 新的在前
}
export interface HealthCheck { name: string; status: '正常' | '提醒' | '异常'; detail: string }
export interface HealthPort { checks(): Promise<HealthCheck[]> }
