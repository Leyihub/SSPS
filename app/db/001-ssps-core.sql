-- SSPS 应用库自有表 D01–D12。由 scripts/build-ddl.mjs 生成，不要手改（改生成脚本）。
-- 规范：妙搭平台 app/AGENTS.md「数据库规范」。可重复执行。
-- 执行：lark-cli apps +db-execute（在你本机），然后 npm run gen:db-schema。
-- 镜像表 m_*（T01–T08 的只读镜像）由 streaming 同步任务（+db-sync-create）创建，不在这里建。

-- ---------- D01 ETA 修订留痕（K13，ETA 风险的学习样本） ----------
CREATE TABLE IF NOT EXISTS eta_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voyage_no text NOT NULL,
  node_name text NOT NULL,
  old_value timestamptz,
  new_value timestamptz NOT NULL,
  basis text NOT NULL CHECK (basis IN ('船讯网', '船代', '电话')),
  revised_by text NOT NULL,
  revised_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE eta_revision IS 'D01 ETA 修订留痕（K13，ETA 风险的学习样本）';
COMMENT ON COLUMN eta_revision.voyage_no IS '航次编号，如 VY-2026-0001';
COMMENT ON COLUMN eta_revision.node_name IS '节点名，如「当前 ETA（卸港）」';
COMMENT ON COLUMN eta_revision.old_value IS '修订前';
COMMENT ON COLUMN eta_revision.new_value IS '修订后';
COMMENT ON COLUMN eta_revision.basis IS '修订依据';
COMMENT ON COLUMN eta_revision.revised_by IS '修订人';
COMMENT ON COLUMN eta_revision.revised_at IS '修订时间';
CREATE INDEX IF NOT EXISTS idx_eta_revision_voyage ON eta_revision (voyage_no, revised_at DESC);
ALTER TABLE eta_revision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON eta_revision;
CREATE POLICY service_role_bypass_policy ON eta_revision TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON eta_revision;
CREATE POLICY "修改全部数据" ON eta_revision AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON eta_revision;
CREATE POLICY "查看全部数据" ON eta_revision AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON eta_revision;
CREATE POLICY "修改本人数据" ON eta_revision AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D02 时间节点变更日志（金额类字段只记「已修改」，不记明文） ----------
CREATE TABLE IF NOT EXISTS milestone_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voyage_no text NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  masked boolean NOT NULL DEFAULT false,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE milestone_log IS 'D02 时间节点变更日志（金额类字段只记「已修改」，不记明文）';
COMMENT ON COLUMN milestone_log.voyage_no IS '航次编号';
COMMENT ON COLUMN milestone_log.field IS '字段名';
COMMENT ON COLUMN milestone_log.old_value IS '旧值';
COMMENT ON COLUMN milestone_log.new_value IS '新值';
COMMENT ON COLUMN milestone_log.masked IS 'true 表示敏感字段，值已隐去';
COMMENT ON COLUMN milestone_log.changed_by IS '修改人';
COMMENT ON COLUMN milestone_log.changed_at IS '修改时间';
CREATE INDEX IF NOT EXISTS idx_milestone_log_voyage ON milestone_log (voyage_no, changed_at DESC);
ALTER TABLE milestone_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON milestone_log;
CREATE POLICY service_role_bypass_policy ON milestone_log TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON milestone_log;
CREATE POLICY "修改全部数据" ON milestone_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON milestone_log;
CREATE POLICY "查看全部数据" ON milestone_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON milestone_log;
CREATE POLICY "修改本人数据" ON milestone_log AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D03 IMIP 靠船计划导入批次（新批次写完、校验通过后再切换当前批次） ----------
CREATE TABLE IF NOT EXISTS berth_plan_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no text NOT NULL UNIQUE,
  plan_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('飞书云空间', '手动上传')),
  file_name text NOT NULL,
  drive_file_token text,
  total_rows integer NOT NULL DEFAULT 0,
  active_rows integer NOT NULL DEFAULT 0,
  history_rows integer NOT NULL DEFAULT 0,
  anomaly_rows integer NOT NULL DEFAULT 0,
  cover_to date,
  validation text,
  status text NOT NULL CHECK (status IN ('导入中', '成功', '部分失败', '失败')),
  is_current boolean NOT NULL DEFAULT false,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE berth_plan_batch IS 'D03 IMIP 靠船计划导入批次（新批次写完、校验通过后再切换当前批次）';
COMMENT ON COLUMN berth_plan_batch.batch_no IS '批次号，如 BP-20261104-01';
COMMENT ON COLUMN berth_plan_batch.plan_date IS '计划日期（导入日）';
COMMENT ON COLUMN berth_plan_batch.source IS '来源';
COMMENT ON COLUMN berth_plan_batch.file_name IS '文件名';
COMMENT ON COLUMN berth_plan_batch.drive_file_token IS '云空间文件 token，用于去重';
COMMENT ON COLUMN berth_plan_batch.total_rows IS '原始行数';
COMMENT ON COLUMN berth_plan_batch.active_rows IS '进入 T10 的行数';
COMMENT ON COLUMN berth_plan_batch.history_rows IS '已卸完的历史行数';
COMMENT ON COLUMN berth_plan_batch.anomaly_rows IS '日期异常行数';
COMMENT ON COLUMN berth_plan_batch.cover_to IS '覆盖到的最后一条预计靠泊日';
COMMENT ON COLUMN berth_plan_batch.validation IS '校验结果';
COMMENT ON COLUMN berth_plan_batch.status IS '状态';
COMMENT ON COLUMN berth_plan_batch.is_current IS '当前生效批次指针：预测只读这一批';
CREATE UNIQUE INDEX IF NOT EXISTS uq_berth_plan_batch_current ON berth_plan_batch ((is_current)) WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS uq_berth_plan_batch_file ON berth_plan_batch (drive_file_token) WHERE drive_file_token IS NOT NULL;
ALTER TABLE berth_plan_batch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON berth_plan_batch;
CREATE POLICY service_role_bypass_policy ON berth_plan_batch TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON berth_plan_batch;
CREATE POLICY "修改全部数据" ON berth_plan_batch AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON berth_plan_batch;
CREATE POLICY "查看全部数据" ON berth_plan_batch AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON berth_plan_batch;
CREATE POLICY "修改本人数据" ON berth_plan_batch AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D04 靠船计划历史快照（IMIP 全部原始列照存，每年约 16 万行） ----------
CREATE TABLE IF NOT EXISTS berth_plan_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES berth_plan_batch (id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  raw jsonb NOT NULL,
  berth_raw text,
  berth text,
  in_pool boolean NOT NULL DEFAULT false,
  eta timestamptz,
  etb timestamptz,
  etd timestamptz,
  vessel text,
  ship_type text,
  cargo text,
  tons numeric,
  owner_unit text,
  row_status text NOT NULL CHECK (row_status IN ('active', 'history', 'anomaly')),
  match_voyage text,
  issue_code text,
  issue_text text,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE berth_plan_row IS 'D04 靠船计划历史快照（IMIP 全部原始列照存，每年约 16 万行）';
COMMENT ON COLUMN berth_plan_row.batch_id IS '所属批次';
COMMENT ON COLUMN berth_plan_row.line_no IS '原始行号';
COMMENT ON COLUMN berth_plan_row.raw IS 'IMIP 原始行（列名 → 值）';
COMMENT ON COLUMN berth_plan_row.berth_raw IS '泊位原文';
COMMENT ON COLUMN berth_plan_row.berth IS '规范泊位编码，表外泊位为空';
COMMENT ON COLUMN berth_plan_row.in_pool IS '是否 23 个德信池泊位';
COMMENT ON COLUMN berth_plan_row.eta IS '预计到港';
COMMENT ON COLUMN berth_plan_row.etb IS '预计靠泊';
COMMENT ON COLUMN berth_plan_row.etd IS '预计卸完';
COMMENT ON COLUMN berth_plan_row.vessel IS '船名';
COMMENT ON COLUMN berth_plan_row.ship_type IS '船舶类型（已按 T04 枚举归一）';
COMMENT ON COLUMN berth_plan_row.cargo IS '物资';
COMMENT ON COLUMN berth_plan_row.tons IS '吨位';
COMMENT ON COLUMN berth_plan_row.owner_unit IS '从属单位';
COMMENT ON COLUMN berth_plan_row.row_status IS 'active 进 T10 / history 已卸完 / anomaly 日期异常';
COMMENT ON COLUMN berth_plan_row.match_voyage IS '匹配的航次编号';
COMMENT ON COLUMN berth_plan_row.issue_code IS '解析告警代码';
COMMENT ON COLUMN berth_plan_row.issue_text IS '解析告警说明';
CREATE INDEX IF NOT EXISTS idx_berth_plan_row_batch ON berth_plan_row (batch_id, row_status);
ALTER TABLE berth_plan_row ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON berth_plan_row;
CREATE POLICY service_role_bypass_policy ON berth_plan_row TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON berth_plan_row;
CREATE POLICY "修改全部数据" ON berth_plan_row AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON berth_plan_row;
CREATE POLICY "查看全部数据" ON berth_plan_row AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON berth_plan_row;
CREATE POLICY "修改本人数据" ON berth_plan_row AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D11 库存消耗模拟表导入批次 ----------
CREATE TABLE IF NOT EXISTS inventory_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no text NOT NULL UNIQUE,
  import_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('飞书云空间', '手动上传')),
  file_name text NOT NULL,
  drive_file_token text,
  total_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  validation text,
  status text NOT NULL CHECK (status IN ('导入中', '成功', '部分失败', '失败')),
  is_current boolean NOT NULL DEFAULT false,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE inventory_batch IS 'D11 库存消耗模拟表导入批次';
COMMENT ON COLUMN inventory_batch.batch_no IS '批次号，如 IV-20261104-01';
COMMENT ON COLUMN inventory_batch.import_date IS '导入日期';
COMMENT ON COLUMN inventory_batch.source IS '来源';
COMMENT ON COLUMN inventory_batch.file_name IS '文件名';
COMMENT ON COLUMN inventory_batch.drive_file_token IS '云空间文件 token';
COMMENT ON COLUMN inventory_batch.total_rows IS '行数';
COMMENT ON COLUMN inventory_batch.error_rows IS '「库存」列为错误值的行数';
COMMENT ON COLUMN inventory_batch.validation IS '校验结果';
COMMENT ON COLUMN inventory_batch.status IS '状态';
COMMENT ON COLUMN inventory_batch.is_current IS '当前生效批次指针';
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_batch_current ON inventory_batch ((is_current)) WHERE is_current;
ALTER TABLE inventory_batch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON inventory_batch;
CREATE POLICY service_role_bypass_policy ON inventory_batch TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON inventory_batch;
CREATE POLICY "修改全部数据" ON inventory_batch AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON inventory_batch;
CREATE POLICY "查看全部数据" ON inventory_batch AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON inventory_batch;
CREATE POLICY "修改本人数据" ON inventory_batch AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D12 库存消耗模拟逐日明细（来自企微「物料消耗明细」） ----------
CREATE TABLE IF NOT EXISTS inventory_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES inventory_batch (id) ON DELETE CASCADE,
  stock_date date NOT NULL,
  item_name text NOT NULL,
  item_type text NOT NULL,
  daily_use numeric,
  stock numeric,
  avail_days numeric,
  is_error boolean NOT NULL DEFAULT false,
  raw_stock text,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE inventory_row IS 'D12 库存消耗模拟逐日明细（来自企微「物料消耗明细」）';
COMMENT ON COLUMN inventory_row.batch_id IS '所属批次';
COMMENT ON COLUMN inventory_row.stock_date IS '库存日期';
COMMENT ON COLUMN inventory_row.item_name IS '品名';
COMMENT ON COLUMN inventory_row.item_type IS '物料类型';
COMMENT ON COLUMN inventory_row.daily_use IS '日耗（吨）';
COMMENT ON COLUMN inventory_row.stock IS '库存（吨）';
COMMENT ON COLUMN inventory_row.avail_days IS '原表「可用天数」';
COMMENT ON COLUMN inventory_row.is_error IS '只看「库存」列是否为有效数字';
COMMENT ON COLUMN inventory_row.raw_stock IS '错误值原文，如 #VALUE!';
CREATE INDEX IF NOT EXISTS idx_inventory_row_item ON inventory_row (batch_id, item_name, stock_date);
ALTER TABLE inventory_row ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON inventory_row;
CREATE POLICY service_role_bypass_policy ON inventory_row TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON inventory_row;
CREATE POLICY "修改全部数据" ON inventory_row AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON inventory_row;
CREATE POLICY "查看全部数据" ON inventory_row AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON inventory_row;
CREATE POLICY "修改本人数据" ON inventory_row AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D05 每次预测请求 ----------
CREATE TABLE IF NOT EXISTS prediction_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_no text NOT NULL UNIQUE,
  input jsonb NOT NULL,
  item_name text,
  inventory_batch_id uuid REFERENCES inventory_batch (id),
  berth_plan_batch_id uuid REFERENCES berth_plan_batch (id),
  run_mode text CHECK (run_mode IN ('近', '远', '混合')),
  route_rule_id text,
  rule_basis text CHECK (rule_basis IN ('统计值', '经验值')),
  borrowed_rule boolean NOT NULL DEFAULT false,
  run_by text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE prediction_run IS 'D05 每次预测请求';
COMMENT ON COLUMN prediction_run.run_no IS '运行编号，如 PR-20261104-0007';
COMMENT ON COLUMN prediction_run.input IS '输入参数';
COMMENT ON COLUMN prediction_run.item_name IS '物料品名（库存提问）';
COMMENT ON COLUMN prediction_run.inventory_batch_id IS '用到的库存批次';
COMMENT ON COLUMN prediction_run.berth_plan_batch_id IS '用到的靠船计划批次';
COMMENT ON COLUMN prediction_run.run_mode IS '整体口径；每个方案各自的路径见 prediction_plan.path';
COMMENT ON COLUMN prediction_run.route_rule_id IS '用到的航程规则';
COMMENT ON COLUMN prediction_run.rule_basis IS '航程口径';
COMMENT ON COLUMN prediction_run.borrowed_rule IS '物资备件船是否借用大宗规则';
COMMENT ON COLUMN prediction_run.run_by IS '运行人';
COMMENT ON COLUMN prediction_run.run_at IS '运行时间';
ALTER TABLE prediction_run ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON prediction_run;
CREATE POLICY service_role_bypass_policy ON prediction_run TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON prediction_run;
CREATE POLICY "修改全部数据" ON prediction_run AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON prediction_run;
CREATE POLICY "查看全部数据" ON prediction_run AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON prediction_run;
CREATE POLICY "修改本人数据" ON prediction_run AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D06 Plan A / Plan B 结果（只出 A / B） ----------
CREATE TABLE IF NOT EXISTS prediction_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES prediction_run (id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('A', 'B')),
  depart_date date,
  window_from date NOT NULL,
  window_to date NOT NULL,
  path text NOT NULL CHECK (path IN ('近', '远')),
  cmr_min numeric,
  max_ships integer,
  trust text NOT NULL CHECK (trust IN ('正常', '低可信')),
  stock_state text CHECK (stock_state IN ('safe', 'tight', 'out')),
  stockout_date date,
  provenance jsonb NOT NULL,
  adopted boolean NOT NULL DEFAULT false,
  adopted_voyage text,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  UNIQUE (run_id, label),
  CHECK (window_to >= window_from)
);
COMMENT ON TABLE prediction_plan IS 'D06 Plan A / Plan B 结果（只出 A / B）';
COMMENT ON COLUMN prediction_plan.run_id IS '所属预测';
COMMENT ON COLUMN prediction_plan.label IS '方案';
COMMENT ON COLUMN prediction_plan.depart_date IS '推荐发船日（成品销售船为空）';
COMMENT ON COLUMN prediction_plan.window_from IS '到港窗口始（成品为建议装船窗口）';
COMMENT ON COLUMN prediction_plan.window_to IS '到港窗口止';
COMMENT ON COLUMN prediction_plan.path IS '本方案走的路径：近 = ≤15 天靠船计划，远 = ＞15 天航次表';
COMMENT ON COLUMN prediction_plan.cmr_min IS '近路径：窗口内最低泊位余量（0–1）';
COMMENT ON COLUMN prediction_plan.max_ships IS '远路径：同期最多船数';
COMMENT ON COLUMN prediction_plan.trust IS '可信度';
COMMENT ON COLUMN prediction_plan.stock_state IS '库存状态';
COMMENT ON COLUMN prediction_plan.stockout_date IS '断料日';
COMMENT ON COLUMN prediction_plan.provenance IS 'S1 参数匹配溯源';
COMMENT ON COLUMN prediction_plan.adopted IS '是否采纳';
COMMENT ON COLUMN prediction_plan.adopted_voyage IS '采纳后的航次编号';
ALTER TABLE prediction_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON prediction_plan;
CREATE POLICY service_role_bypass_policy ON prediction_plan TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON prediction_plan;
CREATE POLICY "修改全部数据" ON prediction_plan AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON prediction_plan;
CREATE POLICY "查看全部数据" ON prediction_plan AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON prediction_plan;
CREATE POLICY "修改本人数据" ON prediction_plan AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D07 宣船文案 ----------
CREATE TABLE IF NOT EXISTS announcement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voyage_no text,
  plan_id uuid REFERENCES prediction_plan (id),
  content jsonb NOT NULL,
  text text NOT NULL,
  generated_by text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  CHECK (voyage_no IS NOT NULL OR plan_id IS NOT NULL)
);
COMMENT ON TABLE announcement IS 'D07 宣船文案';
COMMENT ON COLUMN announcement.voyage_no IS '航次编号';
COMMENT ON COLUMN announcement.plan_id IS '方案';
COMMENT ON COLUMN announcement.content IS '片段数组 { t, v }，v=true 为引擎数值';
COMMENT ON COLUMN announcement.text IS '文案全文';
COMMENT ON COLUMN announcement.generated_by IS '生成人';
COMMENT ON COLUMN announcement.generated_at IS '生成时间';
ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON announcement;
CREATE POLICY service_role_bypass_policy ON announcement TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON announcement;
CREATE POLICY "修改全部数据" ON announcement AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON announcement;
CREATE POLICY "查看全部数据" ON announcement AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON announcement;
CREATE POLICY "修改本人数据" ON announcement AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D08 数据质量问题清单 ----------
CREATE TABLE IF NOT EXISTS data_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_ref text NOT NULL,
  issue_type text NOT NULL,
  field text,
  note text,
  owner text,
  status text NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '处理中', '已关闭')),
  closed_by text,
  closed_at timestamptz,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE data_issue IS 'D08 数据质量问题清单';
COMMENT ON COLUMN data_issue.object_ref IS '对象，如航次编号、靠船计划行';
COMMENT ON COLUMN data_issue.issue_type IS '缺 MMSI / 缺离装港时间 / 港口未匹配 / 节点时序倒置 / 日期异常 / 疑似占位时间…';
COMMENT ON COLUMN data_issue.field IS '相关字段';
COMMENT ON COLUMN data_issue.note IS '说明';
COMMENT ON COLUMN data_issue.owner IS '责任人';
COMMENT ON COLUMN data_issue.status IS '状态';
COMMENT ON COLUMN data_issue.closed_by IS '关闭人';
COMMENT ON COLUMN data_issue.closed_at IS '关闭时间';
CREATE INDEX IF NOT EXISTS idx_data_issue_open ON data_issue (owner, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_issue_open ON data_issue (object_ref, issue_type, COALESCE(field, '')) WHERE status <> '已关闭';
ALTER TABLE data_issue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON data_issue;
CREATE POLICY service_role_bypass_policy ON data_issue TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON data_issue;
CREATE POLICY "修改全部数据" ON data_issue AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON data_issue;
CREATE POLICY "查看全部数据" ON data_issue AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON data_issue;
CREATE POLICY "修改本人数据" ON data_issue AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D09 运行日志（写飞书、生成兼容表、拉云空间）；错误信息不得含密钥、令牌或金额明细 ----------
CREATE TABLE IF NOT EXISTS sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamptz,
  rows_affected integer,
  result text CHECK (result IN ('成功', '部分失败', '失败')),
  error text,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE sync_log IS 'D09 运行日志（写飞书、生成兼容表、拉云空间）；错误信息不得含密钥、令牌或金额明细';
COMMENT ON COLUMN sync_log.task IS '任务：pullBerthPlan / refreshCompat / recomputeRouteRules / migrate …';
COMMENT ON COLUMN sync_log.started_at IS '开始';
COMMENT ON COLUMN sync_log.finished_at IS '结束';
COMMENT ON COLUMN sync_log.rows_affected IS '条数';
COMMENT ON COLUMN sync_log.result IS '结果';
COMMENT ON COLUMN sync_log.error IS '错误';
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON sync_log;
CREATE POLICY service_role_bypass_policy ON sync_log TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON sync_log;
CREATE POLICY "修改全部数据" ON sync_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON sync_log;
CREATE POLICY "查看全部数据" ON sync_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON sync_log;
CREATE POLICY "修改本人数据" ON sync_log AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

-- ---------- D10 写飞书队列与幂等（同一 Base 不并发写；同一幂等键只执行一次） ----------
CREATE TABLE IF NOT EXISTS write_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  target_table text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'written', 'done', 'failed')),
  result jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)
);
COMMENT ON TABLE write_queue IS 'D10 写飞书队列与幂等（同一 Base 不并发写；同一幂等键只执行一次）';
COMMENT ON COLUMN write_queue.idempotency_key IS '前端生成的 UUID';
COMMENT ON COLUMN write_queue.kind IS '类型，如 voyage.create';
COMMENT ON COLUMN write_queue.target_table IS '目标表，如 T04';
COMMENT ON COLUMN write_queue.operation IS '操作';
COMMENT ON COLUMN write_queue.payload IS '载荷';
COMMENT ON COLUMN write_queue.status IS 'pending 已登记 / written 飞书已写成功 / done 后续步骤完成 / failed';
COMMENT ON COLUMN write_queue.result IS '飞书写成功后的结果（如新记录 ID），补偿时复用，不再写飞书';
COMMENT ON COLUMN write_queue.attempts IS '尝试次数';
COMMENT ON COLUMN write_queue.last_error IS '最近错误';
CREATE INDEX IF NOT EXISTS idx_write_queue_open ON write_queue (status) WHERE status <> 'done';
ALTER TABLE write_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON write_queue;
CREATE POLICY service_role_bypass_policy ON write_queue TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON write_queue;
CREATE POLICY "修改全部数据" ON write_queue AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON write_queue;
CREATE POLICY "查看全部数据" ON write_queue AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON write_queue;
CREATE POLICY "修改本人数据" ON write_queue AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

