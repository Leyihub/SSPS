-- 收回匿名读取：「查看全部数据」策略只留 authenticated。由 scripts/build-ddl.mjs 生成，可重复执行。
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eta_revision', 'milestone_log', 'berth_plan_batch', 'berth_plan_row', 'inventory_batch', 'inventory_row', 'prediction_run', 'prediction_plan', 'announcement', 'data_issue', 'sync_log', 'write_queue', 'm_port', 'm_berth', 'm_vessel', 'm_voyage', 'm_cargo', 'm_bulk_settle', 'm_sales_ext', 'm_route_rule'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = '查看全部数据') THEN
        EXECUTE format('ALTER POLICY "查看全部数据" ON %I TO authenticated', t);
      ELSE
        EXECUTE format('CREATE POLICY "查看全部数据" ON %I AS PERMISSIVE FOR SELECT TO authenticated USING (true)', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 核对：不应再有任何包含 anon 的策略
SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname = 'public' AND 'anon' = ANY(roles);
