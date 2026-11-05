// 生成应用库自有表 D01–D12 的建表 SQL（按妙搭平台规范：app/AGENTS.md「数据库规范」）：
//   node scripts/build-ddl.mjs   → app/db/001-ssps-core.sql
// 规范要点：主键 id uuid；表名列名单数 snake_case；4 个审计列；建表后启用 RLS 并建 4 条默认 policy；带注释与索引。
// 执行：Leyinet 在本机用 lark-cli apps +db-execute 执行，再 npm run gen:db-schema 刷新 server/database/schema.ts。
// 注意：.agent/skills/lark-apps-db/SKILL.md（平台建表模板全文）没有拿到，policy 写法按 AGENTS.md 的描述；执行时如果数据库报错，以报错为准修改这里。
import { writeFileSync, mkdirSync } from 'node:fs';

const AUDIT = `  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile),
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (ROW(current_setting('app.user_id', TRUE))::user_profile)`;

// 每张表：name、comment、columns（含注释）、constraints、indexes
const T = [
  { name: 'eta_revision', comment: 'D01 ETA 修订留痕（K13，ETA 风险的学习样本）', cols: [
    ['voyage_no', 'text NOT NULL', '航次编号，如 VY-2026-0001'], ['node_name', 'text NOT NULL', '节点名，如「当前 ETA（卸港）」'],
    ['old_value', 'timestamptz', '修订前'], ['new_value', 'timestamptz NOT NULL', '修订后'],
    ['basis', "text NOT NULL CHECK (basis IN ('船讯网', '船代', '电话'))", '修订依据'], ['revised_by', 'text NOT NULL', '修订人'],
    ['revised_at', 'timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP', '修订时间'] ],
    idx: ['CREATE INDEX IF NOT EXISTS idx_eta_revision_voyage ON eta_revision (voyage_no, revised_at DESC)'] },
  { name: 'milestone_log', comment: 'D02 时间节点变更日志（金额类字段只记「已修改」，不记明文）', cols: [
    ['voyage_no', 'text NOT NULL', '航次编号'], ['field', 'text NOT NULL', '字段名'], ['old_value', 'text', '旧值'], ['new_value', 'text', '新值'],
    ['masked', 'boolean NOT NULL DEFAULT false', 'true 表示敏感字段，值已隐去'], ['changed_by', 'text NOT NULL', '修改人'],
    ['changed_at', 'timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP', '修改时间'] ],
    idx: ['CREATE INDEX IF NOT EXISTS idx_milestone_log_voyage ON milestone_log (voyage_no, changed_at DESC)'] },
  { name: 'berth_plan_batch', comment: 'D03 IMIP 靠船计划导入批次（新批次写完、校验通过后再切换当前批次）', cols: [
    ['batch_no', 'text NOT NULL UNIQUE', '批次号，如 BP-20261104-01'], ['plan_date', 'date NOT NULL', '计划日期（导入日）'],
    ['source', "text NOT NULL CHECK (source IN ('飞书云空间', '手动上传'))", '来源'], ['file_name', 'text NOT NULL', '文件名'],
    ['drive_file_token', 'text', '云空间文件 token，用于去重'], ['total_rows', 'integer NOT NULL DEFAULT 0', '原始行数'],
    ['active_rows', 'integer NOT NULL DEFAULT 0', '进入 T10 的行数'], ['history_rows', 'integer NOT NULL DEFAULT 0', '已卸完的历史行数'],
    ['anomaly_rows', 'integer NOT NULL DEFAULT 0', '日期异常行数'], ['cover_to', 'date', '覆盖到的最后一条预计靠泊日'], ['validation', 'text', '校验结果'],
    ['status', "text NOT NULL CHECK (status IN ('导入中', '成功', '部分失败', '失败'))", '状态'],
    ['is_current', 'boolean NOT NULL DEFAULT false', '当前生效批次指针：预测只读这一批'] ],
    idx: ['CREATE UNIQUE INDEX IF NOT EXISTS uq_berth_plan_batch_current ON berth_plan_batch ((is_current)) WHERE is_current',
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_berth_plan_batch_file ON berth_plan_batch (drive_file_token) WHERE drive_file_token IS NOT NULL'] },
  { name: 'berth_plan_row', comment: 'D04 靠船计划历史快照（IMIP 全部原始列照存，每年约 16 万行）', cols: [
    ['batch_id', 'uuid NOT NULL REFERENCES berth_plan_batch (id) ON DELETE CASCADE', '所属批次'], ['line_no', 'integer NOT NULL', '原始行号'],
    ['raw', 'jsonb NOT NULL', 'IMIP 原始行（列名 → 值）'], ['berth_raw', 'text', '泊位原文'], ['berth', 'text', '规范泊位编码，表外泊位为空'],
    ['in_pool', 'boolean NOT NULL DEFAULT false', '是否 23 个德信池泊位'], ['eta', 'timestamptz', '预计到港'], ['etb', 'timestamptz', '预计靠泊'], ['etd', 'timestamptz', '预计卸完'],
    ['vessel', 'text', '船名'], ['ship_type', 'text', '船舶类型（已按 T04 枚举归一）'], ['cargo', 'text', '物资'], ['tons', 'numeric', '吨位'], ['owner_unit', 'text', '从属单位'],
    ['row_status', "text NOT NULL CHECK (row_status IN ('active', 'history', 'anomaly'))", 'active 进 T10 / history 已卸完 / anomaly 日期异常'],
    ['match_voyage', 'text', '匹配的航次编号'], ['issue_code', 'text', '解析告警代码'], ['issue_text', 'text', '解析告警说明'] ],
    idx: ['CREATE INDEX IF NOT EXISTS idx_berth_plan_row_batch ON berth_plan_row (batch_id, row_status)'] },
  { name: 'inventory_batch', comment: 'D11 库存消耗模拟表导入批次', cols: [
    ['batch_no', 'text NOT NULL UNIQUE', '批次号，如 IV-20261104-01'], ['import_date', 'date NOT NULL', '导入日期'],
    ['source', "text NOT NULL CHECK (source IN ('飞书云空间', '手动上传'))", '来源'], ['file_name', 'text NOT NULL', '文件名'], ['drive_file_token', 'text', '云空间文件 token'],
    ['total_rows', 'integer NOT NULL DEFAULT 0', '行数'], ['error_rows', 'integer NOT NULL DEFAULT 0', '「库存」列为错误值的行数'], ['validation', 'text', '校验结果'],
    ['status', "text NOT NULL CHECK (status IN ('导入中', '成功', '部分失败', '失败'))", '状态'], ['is_current', 'boolean NOT NULL DEFAULT false', '当前生效批次指针'] ],
    idx: ['CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_batch_current ON inventory_batch ((is_current)) WHERE is_current'] },
  { name: 'inventory_row', comment: 'D12 库存消耗模拟逐日明细（来自企微「物料消耗明细」）', cols: [
    ['batch_id', 'uuid NOT NULL REFERENCES inventory_batch (id) ON DELETE CASCADE', '所属批次'], ['stock_date', 'date NOT NULL', '库存日期'],
    ['item_name', 'text NOT NULL', '品名'], ['item_type', 'text NOT NULL', '物料类型'], ['daily_use', 'numeric', '日耗（吨）'], ['stock', 'numeric', '库存（吨）'],
    ['avail_days', 'numeric', '原表「可用天数」'], ['is_error', 'boolean NOT NULL DEFAULT false', '只看「库存」列是否为有效数字'], ['raw_stock', 'text', '错误值原文，如 #VALUE!'] ],
    idx: ['CREATE INDEX IF NOT EXISTS idx_inventory_row_item ON inventory_row (batch_id, item_name, stock_date)'] },
  { name: 'prediction_run', comment: 'D05 每次预测请求', cols: [
    ['run_no', 'text NOT NULL UNIQUE', '运行编号，如 PR-20261104-0007'], ['input', 'jsonb NOT NULL', '输入参数'], ['item_name', 'text', '物料品名（库存提问）'],
    ['inventory_batch_id', 'uuid REFERENCES inventory_batch (id)', '用到的库存批次'], ['berth_plan_batch_id', 'uuid REFERENCES berth_plan_batch (id)', '用到的靠船计划批次'],
    ['run_mode', "text CHECK (run_mode IN ('近', '远', '混合'))", '整体口径；每个方案各自的路径见 prediction_plan.path'], ['route_rule_id', 'text', '用到的航程规则'],
    ['rule_basis', "text CHECK (rule_basis IN ('统计值', '经验值'))", '航程口径'], ['borrowed_rule', 'boolean NOT NULL DEFAULT false', '物资备件船是否借用大宗规则'],
    ['run_by', 'text NOT NULL', '运行人'], ['run_at', 'timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP', '运行时间'] ], idx: [] },
  { name: 'prediction_plan', comment: 'D06 Plan A / Plan B 结果（只出 A / B）', cols: [
    ['run_id', 'uuid NOT NULL REFERENCES prediction_run (id) ON DELETE CASCADE', '所属预测'], ['label', "text NOT NULL CHECK (label IN ('A', 'B'))", '方案'],
    ['depart_date', 'date', '推荐发船日（成品销售船为空）'], ['window_from', 'date NOT NULL', '到港窗口始（成品为建议装船窗口）'], ['window_to', 'date NOT NULL', '到港窗口止'],
    ['path', "text NOT NULL CHECK (path IN ('近', '远'))", '本方案走的路径：近 = ≤15 天靠船计划，远 = ＞15 天航次表'], ['cmr_min', 'numeric', '近路径：窗口内最低泊位余量（0–1）'],
    ['max_ships', 'integer', '远路径：同期最多船数'], ['trust', "text NOT NULL CHECK (trust IN ('正常', '低可信'))", '可信度'],
    ['stock_state', "text CHECK (stock_state IN ('safe', 'tight', 'out'))", '库存状态'], ['stockout_date', 'date', '断料日'], ['provenance', 'jsonb NOT NULL', 'S1 参数匹配溯源'],
    ['adopted', 'boolean NOT NULL DEFAULT false', '是否采纳'], ['adopted_voyage', 'text', '采纳后的航次编号'] ],
    constraints: ['UNIQUE (run_id, label)', 'CHECK (window_to >= window_from)'], idx: [] },
  { name: 'announcement', comment: 'D07 宣船文案', cols: [
    ['voyage_no', 'text', '航次编号'], ['plan_id', 'uuid REFERENCES prediction_plan (id)', '方案'], ['content', 'jsonb NOT NULL', '片段数组 { t, v }，v=true 为引擎数值'],
    ['text', 'text NOT NULL', '文案全文'], ['generated_by', 'text NOT NULL', '生成人'], ['generated_at', 'timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP', '生成时间'] ],
    constraints: ['CHECK (voyage_no IS NOT NULL OR plan_id IS NOT NULL)'], idx: [] },
  { name: 'data_issue', comment: 'D08 数据质量问题清单', cols: [
    ['object_ref', 'text NOT NULL', '对象，如航次编号、靠船计划行'], ['issue_type', 'text NOT NULL', '缺 MMSI / 缺离装港时间 / 港口未匹配 / 节点时序倒置 / 日期异常 / 疑似占位时间…'],
    ['field', 'text', '相关字段'], ['note', 'text', '说明'], ['owner', 'text', '责任人'],
    ['status', "text NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '处理中', '已关闭'))", '状态'], ['closed_by', 'text', '关闭人'], ['closed_at', 'timestamptz', '关闭时间'] ],
    idx: ['CREATE INDEX IF NOT EXISTS idx_data_issue_open ON data_issue (owner, status)',
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_data_issue_open ON data_issue (object_ref, issue_type, COALESCE(field, '')) WHERE status <> '已关闭'"] },
  { name: 'sync_log', comment: 'D09 运行日志（写飞书、生成兼容表、拉云空间）；错误信息不得含密钥、令牌或金额明细', cols: [
    ['task', 'text NOT NULL', '任务：pullBerthPlan / refreshCompat / recomputeRouteRules / migrate …'], ['started_at', 'timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP', '开始'],
    ['finished_at', 'timestamptz', '结束'], ['rows_affected', 'integer', '条数'], ['result', "text CHECK (result IN ('成功', '部分失败', '失败'))", '结果'], ['error', 'text', '错误'] ], idx: [] },
  { name: 'write_queue', comment: 'D10 写飞书队列与幂等（同一 Base 不并发写；同一幂等键只执行一次）', cols: [
    ['idempotency_key', 'text NOT NULL UNIQUE', '前端生成的 UUID'], ['kind', 'text NOT NULL', '类型，如 voyage.create'], ['target_table', 'text NOT NULL', '目标表，如 T04'],
    ['operation', "text NOT NULL CHECK (operation IN ('create', 'update', 'delete'))", '操作'], ['payload', 'jsonb NOT NULL', '载荷'],
    ['status', "text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'written', 'done', 'failed'))", 'pending 已登记 / written 飞书已写成功 / done 后续步骤完成 / failed'],
    ['result', 'jsonb', '飞书写成功后的结果（如新记录 ID），补偿时复用，不再写飞书'], ['attempts', 'integer NOT NULL DEFAULT 0', '尝试次数'], ['last_error', 'text', '最近错误'] ],
    idx: ["CREATE INDEX IF NOT EXISTS idx_write_queue_open ON write_queue (status) WHERE status <> 'done'"] },
];

const q = (s) => "'" + s.replace(/'/g, "''") + "'";
let out = `-- SSPS 应用库自有表 D01–D12。由 scripts/build-ddl.mjs 生成，不要手改（改生成脚本）。
-- 规范：妙搭平台 app/AGENTS.md「数据库规范」。可重复执行。
-- 执行：lark-cli apps +db-execute（在你本机），然后 npm run gen:db-schema。
-- 镜像表 m_*（T01–T08 的只读镜像）由 streaming 同步任务（+db-sync-create）创建，不在这里建。

`;
for (const t of T) {
  out += `-- ---------- ${t.comment} ----------\nCREATE TABLE IF NOT EXISTS ${t.name} (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n`;
  out += t.cols.map(([c, def]) => `  ${c} ${def}`).join(',\n') + ',\n' + AUDIT + (t.constraints ? ',\n' + t.constraints.map((c) => '  ' + c).join(',\n') : '') + '\n);\n';
  out += `COMMENT ON TABLE ${t.name} IS ${q(t.comment)};\n`;
  for (const [c, , note] of t.cols) out += `COMMENT ON COLUMN ${t.name}.${c} IS ${q(note)};\n`;
  for (const i of t.idx) out += i + ';\n';
  out += `ALTER TABLE ${t.name} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_bypass_policy ON ${t.name};
CREATE POLICY service_role_bypass_policy ON ${t.name} TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "修改全部数据" ON ${t.name};
CREATE POLICY "修改全部数据" ON ${t.name} AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "查看全部数据" ON ${t.name};
CREATE POLICY "查看全部数据" ON ${t.name} AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "修改本人数据" ON ${t.name};
CREATE POLICY "修改本人数据" ON ${t.name} AS PERMISSIVE FOR ALL TO authenticated USING ((_created_by).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((_created_by).user_id = current_setting('app.user_id', TRUE));

`;
}
mkdirSync('app/db', { recursive: true });
writeFileSync('app/db/001-ssps-core.sql', out);
console.log('app/db/001-ssps-core.sql：' + T.length + ' 张表');

// 002：已经按旧版 001 建好的库，用它把「查看全部数据」策略收回到仅登录用户（去掉 anon，2026-11-05 Leyinet 决定）。
// 同时覆盖 8 张镜像表 m_*（由同步任务建表，默认策略带 anon）：表还不存在就跳过，同步任务建好后再执行一次即可。可重复执行。
const MIRROR = ['m_port', 'm_berth', 'm_vessel', 'm_voyage', 'm_cargo', 'm_bulk_settle', 'm_sales_ext', 'm_route_rule'];
const all = [...T.map((t) => t.name), ...MIRROR];
const mig = `-- 收回匿名读取：「查看全部数据」策略只留 authenticated。由 scripts/build-ddl.mjs 生成，可重复执行。
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[${all.map((n) => "'" + n + "'").join(', ')}] LOOP
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
`;
writeFileSync('app/db/002-restrict-anon-read.sql', mig);
console.log('app/db/002-restrict-anon-read.sql：' + all.length + ' 张表（含 8 张镜像表，不存在则跳过）');
