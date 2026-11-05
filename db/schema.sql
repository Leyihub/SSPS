-- SSPS 应用库自有表 D01–D12（PostgreSQL）。docs/schema/D-app-db.md 是规格，这里是建表脚本。
-- 约定：
--   · 每张表带 4 个审计列 created_at / updated_at / created_by / updated_by，并启用行级安全（RLS）。
--   · 审计列名和 RLS 策略写法以脚手架里的「平台 SQL 规范」为准：脚手架生成后核对一遍，列名或语法不同就在这里统一替换。
--   · 镜像表 m_*（T01–T08 的只读镜像）由妙搭 streaming 同步任务创建和维护，不在这里建。
--   · 本脚本可重复执行。

-- 通用：自动维护 updated_at
CREATE OR REPLACE FUNCTION ssps_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- D01 ETA 修订留痕（K13，ETA 风险的学习样本） ----------
CREATE TABLE IF NOT EXISTS eta_revision (
  id            bigserial PRIMARY KEY,
  voyage_no     text        NOT NULL,                    -- 航次编号 VY-2026-0001
  node_name     text        NOT NULL,                    -- 节点名，如「当前 ETA（卸港）」
  old_value     timestamptz,
  new_value     timestamptz NOT NULL,
  basis         text        NOT NULL CHECK (basis IN ('船讯网', '船代', '电话')),
  revised_by    text        NOT NULL,
  revised_at    timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);
CREATE INDEX IF NOT EXISTS eta_revision_voyage ON eta_revision (voyage_no, revised_at DESC);

-- ---------- D02 时间节点变更日志 ----------
-- 注意：金额类字段（滞期费、港务费、装卸费等）的变更不明文写入 old_value / new_value，只记「已修改」（权限与隐私评审结论）。
CREATE TABLE IF NOT EXISTS milestone_log (
  id            bigserial PRIMARY KEY,
  voyage_no     text NOT NULL,
  field         text NOT NULL,
  old_value     text,
  new_value     text,
  masked        boolean NOT NULL DEFAULT false,          -- true：敏感字段，值已隐去
  changed_by    text NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);
CREATE INDEX IF NOT EXISTS milestone_log_voyage ON milestone_log (voyage_no, changed_at DESC);

-- ---------- D03 靠船计划导入批次（新批次完整写完、校验通过后再切换「当前批次」） ----------
CREATE TABLE IF NOT EXISTS berth_plan_batch (
  batch_no      text PRIMARY KEY,                        -- BP-20261104-01
  plan_date     date        NOT NULL,
  source        text        NOT NULL CHECK (source IN ('飞书云空间', '手动上传')),
  file_name     text        NOT NULL,
  drive_file_token text,                                 -- 云空间文件 token，用于去重
  total_rows    integer     NOT NULL DEFAULT 0,
  active_rows   integer     NOT NULL DEFAULT 0,          -- 进入 T10 的行数
  history_rows  integer     NOT NULL DEFAULT 0,
  anomaly_rows  integer     NOT NULL DEFAULT 0,
  cover_to      date,                                    -- 靠船计划覆盖到的最后一条预计靠泊日
  validation    text,
  status        text        NOT NULL CHECK (status IN ('导入中', '成功', '部分失败', '失败')),
  is_current    boolean     NOT NULL DEFAULT false,      -- 当前生效批次指针：预测只读这一批
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS berth_plan_batch_one_current ON berth_plan_batch ((is_current)) WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS berth_plan_batch_file ON berth_plan_batch (drive_file_token) WHERE drive_file_token IS NOT NULL;

-- ---------- D04 靠船计划历史快照（IMIP 全部原始列照存；每年约 16 万行） ----------
CREATE TABLE IF NOT EXISTS berth_plan_row (
  id            bigserial PRIMARY KEY,
  batch_no      text    NOT NULL REFERENCES berth_plan_batch (batch_no) ON DELETE CASCADE,
  line_no       integer NOT NULL,
  raw           jsonb   NOT NULL,                        -- IMIP 原始行（原始列名 → 值）
  berth_raw     text,
  berth         text,                                    -- 规范泊位编码，表外泊位为空
  in_pool       boolean NOT NULL DEFAULT false,          -- 是否 23 个德信池泊位
  eta           timestamptz, etb timestamptz, etd timestamptz,
  vessel        text, ship_type text, cargo text, tons numeric, owner_unit text,
  row_status    text    NOT NULL CHECK (row_status IN ('active', 'history', 'anomaly')),
  match_voyage  text,                                    -- 匹配的航次编号
  issue_code    text, issue_text text,                   -- 解析告警（日期异常等）
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);
CREATE INDEX IF NOT EXISTS berth_plan_row_batch ON berth_plan_row (batch_no, row_status);

-- ---------- D11 库存消耗模拟表导入批次 ----------
CREATE TABLE IF NOT EXISTS inventory_batch (
  batch_no      text PRIMARY KEY,                        -- IV-20261104-01
  import_date   date        NOT NULL,
  source        text        NOT NULL CHECK (source IN ('飞书云空间', '手动上传')),
  file_name     text        NOT NULL,
  drive_file_token text,
  total_rows    integer     NOT NULL DEFAULT 0,
  error_rows    integer     NOT NULL DEFAULT 0,          -- 「库存」列为错误值的行数
  validation    text,
  status        text        NOT NULL CHECK (status IN ('导入中', '成功', '部分失败', '失败')),
  is_current    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_batch_one_current ON inventory_batch ((is_current)) WHERE is_current;

-- ---------- D12 库存消耗模拟逐日明细 ----------
CREATE TABLE IF NOT EXISTS inventory_row (
  id            bigserial PRIMARY KEY,
  batch_no      text    NOT NULL REFERENCES inventory_batch (batch_no) ON DELETE CASCADE,
  stock_date    date    NOT NULL,
  item_name     text    NOT NULL,
  item_type     text    NOT NULL,
  daily_use     numeric,
  stock         numeric,
  avail_days    numeric,                                 -- 原表「可用天数」
  is_error      boolean NOT NULL DEFAULT false,          -- 只看「库存」列是否为有效数字
  raw_stock     text,                                    -- 错误值原文，如 #VALUE!
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);
CREATE INDEX IF NOT EXISTS inventory_row_item ON inventory_row (batch_no, item_name, stock_date);

-- ---------- D05 每次预测请求 ----------
CREATE TABLE IF NOT EXISTS prediction_run (
  run_no        text PRIMARY KEY,                        -- PR-20261104-0007
  input         jsonb       NOT NULL,                    -- 输入参数（业务类型、货量、装卸港、窗口、物料、缓冲）
  item_name     text,
  inventory_batch_no text REFERENCES inventory_batch (batch_no),
  berth_plan_batch_no text REFERENCES berth_plan_batch (batch_no),
  run_mode      text        CHECK (run_mode IN ('近', '远', '混合')),   -- 整体口径；每个方案各自记路径见 D06
  route_rule_id text,
  rule_basis    text        CHECK (rule_basis IN ('统计值', '经验值')),
  borrowed_rule boolean     NOT NULL DEFAULT false,
  run_by        text        NOT NULL,
  run_at        timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);

-- ---------- D06 Plan A / Plan B 结果 ----------
CREATE TABLE IF NOT EXISTS prediction_plan (
  id            bigserial PRIMARY KEY,
  run_no        text    NOT NULL REFERENCES prediction_run (run_no) ON DELETE CASCADE,
  label         text    NOT NULL CHECK (label IN ('A', 'B')),    -- 只出 A / B（锁定规则 5）
  depart_date   date,                                    -- 推荐发船日（成品销售船为空）
  window_from   date    NOT NULL, window_to date NOT NULL,       -- 到港窗口（成品为建议装船窗口）
  path          text    NOT NULL CHECK (path IN ('近', '远')),     -- 本方案走的路径（≤15 天 / ＞15 天）
  cmr_min       numeric,                                 -- 近路径：窗口内最低泊位余量（0–1）
  max_ships     integer,                                 -- 远路径：同期最多船数
  trust         text    NOT NULL CHECK (trust IN ('正常', '低可信')),
  stock_state   text    CHECK (stock_state IN ('safe', 'tight', 'out')),
  stockout_date date,
  provenance    jsonb   NOT NULL,                        -- S1 参数匹配溯源（每个数字来自哪张表、哪个批次、哪条规则）
  adopted       boolean NOT NULL DEFAULT false,
  adopted_voyage text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text,
  UNIQUE (run_no, label),
  CHECK (window_to >= window_from)
);

-- ---------- D07 宣船文案 ----------
CREATE TABLE IF NOT EXISTS announcement (
  id            bigserial PRIMARY KEY,
  voyage_no     text, plan_id bigint REFERENCES prediction_plan (id),
  content       jsonb   NOT NULL,                        -- 片段数组：{ t, v }，v=true 的片段是引擎数值
  text          text    NOT NULL,
  generated_by  text    NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text,
  CHECK (voyage_no IS NOT NULL OR plan_id IS NOT NULL)
);

-- ---------- D08 数据质量问题清单 ----------
CREATE TABLE IF NOT EXISTS data_issue (
  id            bigserial PRIMARY KEY,
  object_ref    text NOT NULL,                           -- 对象，如航次编号、靠船计划行
  issue_type    text NOT NULL,                           -- 缺 MMSI / 缺离装港时间 / 港口未匹配 / 节点时序倒置 / 日期异常 / 疑似占位时间…
  field         text,
  note          text,
  owner         text,
  status        text NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '处理中', '已关闭')),
  closed_by     text, closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);
CREATE INDEX IF NOT EXISTS data_issue_open ON data_issue (owner, status);
-- 同一对象的同类问题只保留一条未关闭的，重复导入不会堆积
CREATE UNIQUE INDEX IF NOT EXISTS data_issue_dedupe ON data_issue (object_ref, issue_type, COALESCE(field, '')) WHERE status <> '已关闭';

-- ---------- D09 运行日志（写飞书、生成兼容表、拉云空间） ----------
CREATE TABLE IF NOT EXISTS sync_log (
  id            bigserial PRIMARY KEY,
  task          text NOT NULL,                           -- pullBerthPlan / refreshCompat / recomputeRouteRules / migrate …
  started_at    timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  rows_affected integer,
  result        text CHECK (result IN ('成功', '部分失败', '失败')),
  error         text,                                    -- 不得包含密钥、令牌或金额明细
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);

-- ---------- D10 写飞书队列与幂等（同一 Base 不并发写；同一幂等键只执行一次） ----------
CREATE TABLE IF NOT EXISTS write_queue (
  id            bigserial PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,                  -- 前端生成的 UUID
  kind          text NOT NULL,                           -- voyage.create / voyage.milestone / …
  target_table  text NOT NULL,                           -- T04 等
  operation     text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'written', 'done', 'failed')),
  result        jsonb,                                   -- 飞书写成功后的结果（如新记录 ID），补偿时直接复用，不再写飞书
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by text, updated_by text
);
CREATE INDEX IF NOT EXISTS write_queue_open ON write_queue (status) WHERE status <> 'done';

-- ---------- 审计列自动维护 + 行级安全 ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eta_revision', 'milestone_log', 'berth_plan_batch', 'berth_plan_row', 'prediction_run', 'prediction_plan', 'announcement', 'data_issue', 'sync_log', 'write_queue', 'inventory_batch', 'inventory_row']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION ssps_touch_updated_at()', t || '_touch', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- TODO（等脚手架）：按平台 SQL 规范写 RLS 策略。应用服务角色可读写；业务角色不直连数据库，只经后端接口访问。
  END LOOP;
END $$;
