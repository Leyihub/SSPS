/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

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

export const mRouteRule = pgTable("m_route_rule", {
  id: uuid("id").primaryKey().unique().defaultRandom(),
  baseRecordId: varchar("base_record_id").unique(),
  ruleNo: bigint("rule_no", { mode: 'number' }),
  loadPort: text("load_port"),
  dischargePort: text("discharge_port"),
  applicableBusinessType: text("applicable_business_type").array(),
  tonnageGrade: text("tonnage_grade"),
  experienceVoyageDay: numeric("experience_voyage_day"),
  experienceVoyageMaxDay: numeric("experience_voyage_max_day"),
  experienceMaintainer: userProfile("experience_maintainer"),
  sampleCount: bigint("sample_count", { mode: 'number' }),
  statP50Day: numeric("stat_p50_day"),
  statP80Day: numeric("stat_p80_day"),
  adoptCaliber: text("adopt_caliber"),
  effectiveVoyageP50Day: text("effective_voyage_p50_day"),
  effectiveVoyageP80Day: text("effective_voyage_p80_day"),
  recentRecalcTime: customTimestamptz("recent_recalc_time"),
  appStatus: text("app_status"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`now()`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`now()`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("unq_1881013246044163").on(table.id),
  uniqueIndex("unq_1881013246044195").on(table.baseRecordId),
]);

export const mSalesExt = pgTable("m_sales_ext", {
  id: uuid("id").primaryKey().unique().defaultRandom(),
  baseRecordId: varchar("base_record_id").unique(),
  extensionNo: bigint("extension_no", { mode: 'number' }),
  /**
   * 航次
   */
  voyage: jsonb("voyage"),
  charterType: text("charter_type"),
  seaShippingContractNo: text("sea_shipping_contract_no"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`now()`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`now()`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("unq_1881013205313628").on(table.id),
  uniqueIndex("unq_1881013205313660").on(table.baseRecordId),
]);

export const mBulkSettle = pgTable("m_bulk_settle", {
  id: uuid("id").primaryKey().unique().defaultRandom(),
  baseRecordId: varchar("base_record_id").unique(),
  settlementNo: bigint("settlement_no", { mode: 'number' }),
  /**
   * 航次
   */
  voyage: jsonb("voyage"),
  dischargeClause: text("discharge_clause"),
  dischargeRateTonPerDay: bigint("discharge_rate_ton_per_day", { mode: 'number' }),
  allowableDischargeDays: numeric("allowable_discharge_days"),
  turnTimeHour: bigint("turn_time_hour", { mode: 'number' }),
  demurrageRate: numeric("demurrage_rate"),
  currency: text("currency"),
  demurrageDespatchUsd: numeric("demurrage_despatch_usd"),
  dischargePortDraftTon: numeric("discharge_port_draft_ton"),
  waterGauge1Min: bigint("water_gauge_1_min", { mode: 'number' }),
  waterGauge2Min: bigint("water_gauge_2_min", { mode: 'number' }),
  waterGauge3Min: bigint("water_gauge_3_min", { mode: 'number' }),
  exchangeRate: numeric("exchange_rate"),
  portFeeUnitPrice: numeric("port_fee_unit_price"),
  portFeeUsd: numeric("port_fee_usd"),
  handlingFeeUsd: numeric("handling_fee_usd"),
  truckingVolumeTon: numeric("trucking_volume_ton"),
  pipeConveyorVolumeTon: numeric("pipe_conveyor_volume_ton"),
  weighbridgeWeightTon: numeric("weighbridge_weight_ton"),
  otherDeptVolumeTon: numeric("other_dept_volume_ton"),
  transferCarCount: bigint("transfer_car_count", { mode: 'number' }),
  x1BeltConveyorCount: bigint("x1_belt_conveyor_count", { mode: 'number' }),
  crossMonthShipRoadTon: numeric("cross_month_ship_road_ton"),
  crossMonthShipBeltTon: numeric("cross_month_ship_belt_ton"),
  _3BeltConveyorIdleHour: numeric("3_belt_conveyor_idle_hour"),
  _4BeltConveyorIdleHour: numeric("4_belt_conveyor_idle_hour"),
  handoverSendDate: date("handover_send_date"),
  handoverReturnDate: date("handover_return_date"),
  detianNoHandover: boolean("detian_no_handover"),
  lightRainBond: boolean("light_rain_bond"),
  shipUnloadFactorAbnormalFeedback: text("ship_unload_factor_abnormal_feedback"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`now()`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`now()`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("unq_1881013467761720").on(table.id),
  uniqueIndex("unq_1881013467762712").on(table.baseRecordId),
]);

export const mCargo = pgTable("m_cargo", {
  id: uuid("id").primaryKey().unique().defaultRandom(),
  baseRecordId: varchar("base_record_id").unique(),
  appDetailId: bigint("app_detail_id", { mode: 'number' }),
  /**
   * 航次
   */
  voyage: jsonb("voyage"),
  contractNo: text("contract_no"),
  eaPurchaseOrderNo: text("ea_purchase_order_no"),
  materialCategory: text("material_category"),
  goodsName: text("goods_name"),
  materialAlias: text("material_alias"),
  userUnit: text("user_unit"),
  supplierCustomer: text("supplier_customer"),
  estimatedShippingWeightTon: numeric("estimated_shipping_weight_ton"),
  portLoadingWeightTon: numeric("port_loading_weight_ton"),
  dryBaseConversionTon: numeric("dry_base_conversion_ton"),
  overShortShipmentPercent: numeric("over_short_shipment_percent"),
  contractExecutor: userProfile("contract_executor"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`now()`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`now()`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("unq_1881013107479655").on(table.id),
  uniqueIndex("unq_1881013107480647").on(table.baseRecordId),
]);

export const mVoyage = pgTable("m_voyage", {
  id: uuid("id").primaryKey().unique().defaultRandom(),
  baseRecordId: varchar("base_record_id").unique(),
  voyageNo1: bigint("voyage_no_1", { mode: 'number' }),
  /**
   * 船名
   */
  vesselName: jsonb("vessel_name"),
  /**
   * 总货量（吨）
   */
  totalCargoTon: jsonb("total_cargo_ton"),
  /**
   * 装港是否本港
   */
  loadPortLocal: jsonb("load_port_local"),
  /**
   * MMSI
   */
  mmsi: jsonb("mmsi"),
  businessType: text("business_type"),
  businessAttribute: text("business_attribute"),
  voyageNo: text("voyage_no"),
  vessel: text("vessel"),
  carrier: text("carrier"),
  vesselVoyageNo: text("vessel_voyage_no"),
  loadPort: text("load_port"),
  dischargePort: text("discharge_port"),
  secondDischargePort: text("second_discharge_port"),
  finalDestination: text("final_destination"),
  localSide: text("local_side"),
  laycanStart: customTimestamptz("laycan_start"),
  laycanEnd: customTimestamptz("laycan_end"),
  etaLoadPort: customTimestamptz("eta_load_port"),
  ataLoadPort: customTimestamptz("ata_load_port"),
  loadPortBerth: customTimestamptz("load_port_berth"),
  planDepartLoadPort: customTimestamptz("plan_depart_load_port"),
  actualDepartLoadPort: customTimestamptz("actual_depart_load_port"),
  planArriveDischargeWindowStart: customTimestamptz("plan_arrive_discharge_window_start"),
  planArriveDischargeWindowEnd: customTimestamptz("plan_arrive_discharge_window_end"),
  currentEtaDischargePort: customTimestamptz("current_eta_discharge_port"),
  actualArriveDischargePort: customTimestamptz("actual_arrive_discharge_port"),
  dischargePortBerth: customTimestamptz("discharge_port_berth"),
  dischargePortDeparture: customTimestamptz("discharge_port_departure"),
  vesselStatus: text("vessel_status"),
  abnormalMark: text("abnormal_mark").array(),
  loadingPortOverdue: text("loading_port_overdue"),
  actualVoyageDays: text("actual_voyage_days"),
  berthWaitDays: text("berth_wait_days"),
  portOperationDays: text("port_operation_days"),
  /**
   * 计划泊位
   */
  plannedBerth: jsonb("planned_berth"),
  /**
   * 实际泊位
   */
  actualBerth: jsonb("actual_berth"),
  responsibleSalesman: userProfile("responsible_salesman"),
  department: text("department"),
  keyAttention: boolean("key_attention"),
  auditStatus: text("audit_status"),
  dataSource: text("data_source"),
  appRecordKey: text("app_record_key"),
  historyReadonly: boolean("history_readonly"),
  remark: text("remark"),
  /**
   * 货物明细
   */
  goodsDetail: jsonb("goods_detail"),
  sharedShip: text("shared_ship"),
  /**
   * 大宗卸船结算
   */
  bulkUnloadSettlement: jsonb("bulk_unload_settlement"),
  /**
   * 成品销售扩展
   */
  productSalesExtend: jsonb("product_sales_extend"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`now()`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`now()`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("unq_1881013165233316").on(table.id),
  uniqueIndex("unq_1881013165234372").on(table.baseRecordId),
]);

export const mVessel = pgTable("m_vessel", {
  id: uuid("id").primaryKey().unique().defaultRandom(),
  baseRecordId: varchar("base_record_id").unique(),
  shipNo: bigint("ship_no", { mode: 'number' }),
  appMmsi: text("app_mmsi"),
  appImo: text("app_imo"),
  standardShipName: text("standard_ship_name"),
  shipNameAlias: text("ship_name_alias"),
  shipType: text("ship_type"),
  dwt: bigint("dwt", { mode: 'number' }),
  shipLengthM: numeric("ship_length_m"),
  tonnageClass: text("tonnage_class"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`now()`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`now()`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("unq_1881013022885960").on(table.id),
  uniqueIndex("unq_1881013022887064").on(table.baseRecordId),
]);

export const mBerth = pgTable("m_berth", {
  id: uuid("id").primaryKey().unique().defaultRandom(),
  baseRecordId: varchar("base_record_id").unique(),
  berthCode: text("berth_code"),
  wharf: text("wharf"),
  capacityTonnage: bigint("capacity_tonnage", { mode: 'number' }),
  berthCategory: text("berth_category"),
  status: text("status"),
  basisVersion: text("basis_version"),
  effectiveDate: date("effective_date"),
  remark: text("remark"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`now()`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`now()`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("unq_1881013315481699").on(table.id),
  uniqueIndex("unq_1881013315482643").on(table.baseRecordId),
]);

export const mPort = pgTable("m_port", {
  id: uuid("id").primaryKey().unique().defaultRandom(),
  baseRecordId: varchar("base_record_id").unique(),
  portCode: text("port_code"),
  chineseName: text("chinese_name"),
  englishStandardName: text("english_standard_name"),
  alias: text("alias"),
  country: text("country"),
  region: text("region"),
  nature: text("nature"),
  isLocalPort: boolean("is_local_port"),
  status: text("status"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at").notNull().default(sql`now()`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at").notNull().default(sql`now()`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("unq_1881013248954451").on(table.id),
  uniqueIndex("unq_1881013248954483").on(table.baseRecordId),
]);

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
  importedBy: text("imported_by"),
  /**
   * 各物料导入时的摘要 [{name,type,stock,daily,days,daysEstimated,validUntil,errorCount}]；当前库存和可用天数以导入时为准，序列在 inventory_row
   */
  itemsSummary: jsonb("items_summary"),
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
  importedBy: text("imported_by"),
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
export const mBerthTable = mBerth;
export const mBulkSettleTable = mBulkSettle;
export const mCargoTable = mCargo;
export const mPortTable = mPort;
export const mRouteRuleTable = mRouteRule;
export const mSalesExtTable = mSalesExt;
export const mVesselTable = mVessel;
export const mVoyageTable = mVoyage;
export const milestoneLogTable = milestoneLog;
export const predictionPlanTable = predictionPlan;
export const predictionRunTable = predictionRun;
export const syncLogTable = syncLog;
export const writeQueueTable = writeQueue;
