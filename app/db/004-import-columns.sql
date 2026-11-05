-- 004：导入批次补列（真实仓储需要）。可重复执行。用 lark-cli apps +db-execute 执行，执行后 npm run gen:db-schema:local。
ALTER TABLE berth_plan_batch ADD COLUMN IF NOT EXISTS imported_by text;
COMMENT ON COLUMN berth_plan_batch.imported_by IS '导入人姓名（页面显示用；审计列 _created_by 只有用户 ID）';
ALTER TABLE inventory_batch ADD COLUMN IF NOT EXISTS imported_by text;
COMMENT ON COLUMN inventory_batch.imported_by IS '导入人姓名（页面显示用）';
ALTER TABLE inventory_batch ADD COLUMN IF NOT EXISTS items_summary jsonb;
COMMENT ON COLUMN inventory_batch.items_summary IS '各物料导入时的摘要 [{name,type,stock,daily,days,daysEstimated,validUntil,errorCount}]；当前库存和可用天数以导入时为准，序列在 inventory_row';
