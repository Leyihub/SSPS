// 所有「暂定值」集中在这里；业务口径变化时只改这一处（见 docs/open-questions.md）。
export const CONFIG = Object.freeze({
  PATH_LIMIT: 15,            // 目标到港日距今 ≤15 天用靠船计划，＞15 天用航次表（锁定规则 4）
  PLAN_B_MIN_CMR: 0.3,       // Plan B 要求余量 ≥30%（锁定规则 5）
  WINDOW_LEN: 3,             // 候选到港窗口长度（天），暂定
  DEFAULT_BUFFER_DAYS: 3,    // 库存断料缓冲天数，暂定（2026-11-04 确认默认 3 天）
  SAMPLE_MIN: 5,             // 航程样本 ≥5 条切统计值
  SAMPLE_MAX_DAYS: 90,       // 航程样本合理上限（天），超过的不进统计，暂定
  ETA_STALE_DAYS: 3,         // ETA 超期未更新阈值（天），暂定
  IMPORT_WINDOW_DAYS: 90,    // 靠船计划导入：日期合理性窗口（2026-11-05 确认）
  STOCK_WARN_DAYS: 15,       // 库存分档：危险线
  STOCK_SAFE_DAYS: 25,       // 库存分档：充裕线
  CAL_DAYS: 30,              // 港口容量日历天数
});
