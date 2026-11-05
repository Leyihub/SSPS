/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const writeQueue = pgTable("write_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  kind: text("kind").notNull(),
  targetTable: text("target_table").notNull(),
  operation: text("operation").notNull(),
  /**
   * 载荷
   */
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default('pending'),
  /**
   * 飞书写成功后的结果（如新记录 ID），补偿时复用，不再写飞书
   */
  result: jsonb("result"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  uniqueIndex("write_queue_idempotency_key_key").on(table.idempotencyKey),
  index("idx_write_queue_open").on(table.status),
]);

export const syncLog = pgTable("sync_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  task: text("task").notNull(),
  startedAt: customTimestamptz("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: customTimestamptz("finished_at"),
  rowsAffected: integer("rows_affected"),
  result: text("result"),
  error: text("error"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
});

export const dataIssue = pgTable("data_issue", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectRef: text("object_ref").notNull(),
  issueType: text("issue_type").notNull(),
  field: text("field"),
  note: text("note"),
  owner: text("owner"),
  status: text("status").notNull().default('待处理'),
  closedBy: text("closed_by"),
  closedAt: customTimestamptz("closed_at"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  index("idx_data_issue_open").on(table.owner, table.status),
  // Complex index: CREATE UNIQUE INDEX uq_data_issue_open ON data_issue USING btree (object_ref, issue_type, COALESCE(field, ''::text)) WHERE (status <> '已关闭'::text),
]);

export const announcement = pgTable("announcement", {
  id: uuid("id").primaryKey().defaultRandom(),
  voyageNo: text("voyage_no"),
  planId: uuid("plan_id"),
  /**
   * 片段数组 { t, v }，v=true 为引擎数值
   */
  content: jsonb("content").notNull(),
  text: text("text").notNull(),
  generatedBy: text("generated_by").notNull(),
  generatedAt: customTimestamptz("generated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  foreignKey({
    columns: [table.planId],
    foreignColumns: [predictionPlan.id],
    name: "announcement_plan_id_fkey",
  }).onDelete("no action").onUpdate("no action"),
]);

export const predictionPlan = pgTable("prediction_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull(),
  label: text("label").notNull(),
  departDate: date("depart_date"),
  windowFrom: date("window_from").notNull(),
  windowTo: date("window_to").notNull(),
  path: text("path").notNull(),
  cmrMin: numeric("cmr_min"),
  maxShips: integer("max_ships"),
  trust: text("trust").notNull(),
  stockState: text("stock_state"),
  stockoutDate: date("stockout_date"),
  /**
   * S1 参数匹配溯源
   */
  provenance: jsonb("provenance").notNull(),
  adopted: boolean("adopted").notNull().default(false),
  adoptedVoyage: text("adopted_voyage"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  uniqueIndex("prediction_plan_run_id_label_key").on(table.runId, table.label),
  foreignKey({
    columns: [table.runId],
    foreignColumns: [predictionRun.id],
    name: "prediction_plan_run_id_fkey",
  }).onDelete("no action").onUpdate("no action"),
]);

export const predictionRun = pgTable("prediction_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  runNo: text("run_no").notNull().unique(),
  /**
   * 输入参数
   */
  input: jsonb("input").notNull(),
  itemName: text("item_name"),
  inventoryBatchId: uuid("inventory_batch_id"),
  berthPlanBatchId: uuid("berth_plan_batch_id"),
  runMode: text("run_mode"),
  routeRuleId: text("route_rule_id"),
  ruleBasis: text("rule_basis"),
  borrowedRule: boolean("borrowed_rule").notNull().default(false),
  runBy: text("run_by").notNull(),
  runAt: customTimestamptz("run_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  uniqueIndex("prediction_run_run_no_key").on(table.runNo),
  foreignKey({
    columns: [table.inventoryBatchId],
    foreignColumns: [inventoryBatch.id],
    name: "prediction_run_inventory_batch_id_fkey",
  }).onDelete("no action").onUpdate("no action"),
  foreignKey({
    columns: [table.berthPlanBatchId],
    foreignColumns: [berthPlanBatch.id],
    name: "prediction_run_berth_plan_batch_id_fkey",
  }).onDelete("no action").onUpdate("no action"),
]);

export const inventoryRow = pgTable("inventory_row", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull(),
  stockDate: date("stock_date").notNull(),
  itemName: text("item_name").notNull(),
  itemType: text("item_type").notNull(),
  dailyUse: numeric("daily_use"),
  stock: numeric("stock"),
  availDays: numeric("avail_days"),
  isError: boolean("is_error").notNull().default(false),
  rawStock: text("raw_stock"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  index("idx_inventory_row_item").on(table.batchId, table.itemName, table.stockDate),
  foreignKey({
    columns: [table.batchId],
    foreignColumns: [inventoryBatch.id],
    name: "inventory_row_batch_id_fkey",
  }).onDelete("no action").onUpdate("no action"),
]);

export const inventoryBatch = pgTable("inventory_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchNo: text("batch_no").notNull().unique(),
  importDate: date("import_date").notNull(),
  source: text("source").notNull(),
  fileName: text("file_name").notNull(),
  driveFileToken: text("drive_file_token"),
  totalRows: integer("total_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  validation: text("validation"),
  status: text("status").notNull(),
  isCurrent: boolean("is_current").notNull().unique().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  uniqueIndex("inventory_batch_batch_no_key").on(table.batchNo),
  uniqueIndex("uq_inventory_batch_current").on(table.isCurrent),
]);

export const berthPlanRow = pgTable("berth_plan_row", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull(),
  lineNo: integer("line_no").notNull(),
  /**
   * IMIP 原始行（列名 → 值）
   */
  raw: jsonb("raw").notNull(),
  berthRaw: text("berth_raw"),
  berth: text("berth"),
  inPool: boolean("in_pool").notNull().default(false),
  eta: customTimestamptz("eta"),
  etb: customTimestamptz("etb"),
  etd: customTimestamptz("etd"),
  vessel: text("vessel"),
  shipType: text("ship_type"),
  cargo: text("cargo"),
  tons: numeric("tons"),
  ownerUnit: text("owner_unit"),
  rowStatus: text("row_status").notNull(),
  matchVoyage: text("match_voyage"),
  issueCode: text("issue_code"),
  issueText: text("issue_text"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  index("idx_berth_plan_row_batch").on(table.batchId, table.rowStatus),
  foreignKey({
    columns: [table.batchId],
    foreignColumns: [berthPlanBatch.id],
    name: "berth_plan_row_batch_id_fkey",
  }).onDelete("no action").onUpdate("no action"),
]);

export const berthPlanBatch = pgTable("berth_plan_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchNo: text("batch_no").notNull().unique(),
  planDate: date("plan_date").notNull(),
  source: text("source").notNull(),
  fileName: text("file_name").notNull(),
  driveFileToken: text("drive_file_token").unique(),
  totalRows: integer("total_rows").notNull().default(0),
  activeRows: integer("active_rows").notNull().default(0),
  historyRows: integer("history_rows").notNull().default(0),
  anomalyRows: integer("anomaly_rows").notNull().default(0),
  coverTo: date("cover_to"),
  validation: text("validation"),
  status: text("status").notNull(),
  isCurrent: boolean("is_current").notNull().unique().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  uniqueIndex("berth_plan_batch_batch_no_key").on(table.batchNo),
  uniqueIndex("uq_berth_plan_batch_current").on(table.isCurrent),
  uniqueIndex("uq_berth_plan_batch_file").on(table.driveFileToken),
]);

export const milestoneLog = pgTable("milestone_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  voyageNo: text("voyage_no").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  masked: boolean("masked").notNull().default(false),
  changedBy: text("changed_by").notNull(),
  changedAt: customTimestamptz("changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  index("idx_milestone_log_voyage").on(table.voyageNo, table.changedAt),
]);

export const etaRevision = pgTable("eta_revision", {
  id: uuid("id").primaryKey().defaultRandom(),
  voyageNo: text("voyage_no").notNull(),
  nodeName: text("node_name").notNull(),
  oldValue: customTimestamptz("old_value"),
  newValue: customTimestamptz("new_value").notNull(),
  basis: text("basis").notNull(),
  revisedBy: text("revised_by").notNull(),
  revisedAt: customTimestamptz("revised_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`ROW((current_setting('app.user_id'::text, true))::character varying)`),
}, (table) => [
  index("idx_eta_revision_voyage").on(table.voyageNo, table.revisedAt),
]);

// table aliases
export const announcementTable = announcement;
export const berthPlanBatchTable = berthPlanBatch;
export const berthPlanRowTable = berthPlanRow;
export const dataIssueTable = dataIssue;
export const etaRevisionTable = etaRevision;
export const inventoryBatchTable = inventoryBatch;
export const inventoryRowTable = inventoryRow;
export const milestoneLogTable = milestoneLog;
export const predictionPlanTable = predictionPlan;
export const predictionRunTable = predictionRun;
export const syncLogTable = syncLog;
export const writeQueueTable = writeQueue;
