-- 收回匿名读取（自有表 D01–D12）：「查看全部数据」策略只留 authenticated。由 scripts/build-ddl.mjs 生成。
ALTER POLICY "查看全部数据" ON eta_revision TO authenticated;
ALTER POLICY "查看全部数据" ON milestone_log TO authenticated;
ALTER POLICY "查看全部数据" ON berth_plan_batch TO authenticated;
ALTER POLICY "查看全部数据" ON berth_plan_row TO authenticated;
ALTER POLICY "查看全部数据" ON inventory_batch TO authenticated;
ALTER POLICY "查看全部数据" ON inventory_row TO authenticated;
ALTER POLICY "查看全部数据" ON prediction_run TO authenticated;
ALTER POLICY "查看全部数据" ON prediction_plan TO authenticated;
ALTER POLICY "查看全部数据" ON announcement TO authenticated;
ALTER POLICY "查看全部数据" ON data_issue TO authenticated;
ALTER POLICY "查看全部数据" ON sync_log TO authenticated;
ALTER POLICY "查看全部数据" ON write_queue TO authenticated;

-- 核对：不应再有任何包含 anon 的策略
SELECT tablename, policyname, roles FROM pg_policies
WHERE schemaname = current_schema() AND EXISTS (SELECT 1 FROM unnest(roles) r WHERE r::text LIKE 'anon%');
