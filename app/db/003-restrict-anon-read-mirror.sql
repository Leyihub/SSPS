-- 收回匿名读取（镜像表 m_*）：「查看全部数据」策略只留 authenticated。由 scripts/build-ddl.mjs 生成，在建好 8 个同步任务后执行。
ALTER POLICY "查看全部数据" ON m_port TO authenticated;
ALTER POLICY "查看全部数据" ON m_berth TO authenticated;
ALTER POLICY "查看全部数据" ON m_vessel TO authenticated;
ALTER POLICY "查看全部数据" ON m_voyage TO authenticated;
ALTER POLICY "查看全部数据" ON m_cargo TO authenticated;
ALTER POLICY "查看全部数据" ON m_bulk_settle TO authenticated;
ALTER POLICY "查看全部数据" ON m_sales_ext TO authenticated;
ALTER POLICY "查看全部数据" ON m_route_rule TO authenticated;

-- 核对：不应再有任何包含 anon 的策略
SELECT tablename, policyname, roles FROM pg_policies
WHERE schemaname = current_schema() AND EXISTS (SELECT 1 FROM unnest(roles) r WHERE r::text LIKE 'anon%');
