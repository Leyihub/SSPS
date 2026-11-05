# 镜像表列名对照表（Base T01–T08 ↔ 应用库 m_*）

> 任务 W03 交付物。由飞书妙搭 Streaming 数据同步任务自动维护，只读镜像。
> 供 W11、W12 及业务适配层开发时查询列名与类型映射。

---

## 1. 同步机制与字段映射规则

1. **同步方式**：飞书多维表格（Base）到妙搭 PostgreSQL 应用库的单向 Streaming 实时同步。
2. **主键与记录对应**：
   - 应用库主键列：`id`（`uuid`，系统自动生成）。
   - **Base 记录 ID 列**：`base_record_id`（`varchar`，唯一约束），每张镜像表均包含该列，保存飞书多维表格记录的 `record_id`（如 `reczz...`），用于反查与反向写回。
3. **类型映射特例**：
   - **查找引用（Lookup）**：在应用库中映射为 `jsonb` 类型（如 T04 的 `船名`、`MMSI`、`装港是否本港`、`总货量（吨）`）。
   - **关联列（Link）**：在应用库中映射为 `jsonb` 类型（如 `goods_detail`、`voyage`、`planned_berth` 等）。
   - **公式字段（Formula）**：在应用库中映射为 `text` 类型（如 `actual_voyage_days`、`loading_port_overdue`、`shared_ship` 等）。
   - **单选 / 多选**：在应用库中统一映射为 `text` 类型。
   - **人员列**：映射为平台自定义类型 `user_profile`。
   - **审计列**：每张镜像表均带有 `_created_at`、`_created_by`、`_updated_at`、`_updated_by`。

---

## 2. 逐表列名对照

### 2.1 m_port 港口主档（对应 T01 港口主档，table ID: `tblRx4wUYE8UifCy`）

| 应用库列名 (pg_field) | 应用库类型 | Base 字段名 (base_field) | Base 字段类型 | 备注说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 表唯一 ID | 系统自增 | 主键 |
| `base_record_id` | varchar | Base 表记录 ID | 文本 | **Base 记录 ID**（唯一索引） |
| `port_code` | text | 港口编码 | 文本 | 业务主键，如 BAHODOPI |
| `chinese_name` | text | 中文名称 | 文本 | 港口中文名称 |
| `english_standard_name` | text | 英文标准名 | 文本 | 英文规范名 |
| `alias` | text | 别名 | 文本 | 别名清单，逗号分隔 |
| `country` | text | 国家 | 单选 | 选项：印度尼西亚/中国/菲律宾/越南/其他 |
| `region` | text | 地区 | 文本 | 所属地区 |
| `nature` | text | 性质 | 单选 | 选项：内港/外港 |
| `is_local_port` | bool | 是否本港 | 复选框 | 布尔值（true/false） |
| `status` | text | 状态 | 单选 | 选项：启用/停用 |
| `_created_at` | timestamptz | 创建时间 | 日期时间 | 平台审计列 |
| `_created_by` | user_profile | 创建人 | 人员 | 平台审计列 |
| `_updated_at` | timestamptz | 更新时间 | 日期时间 | 平台审计列 |
| `_updated_by` | user_profile | 更新人 | 人员 | 平台审计列 |

---

### 2.2 m_berth 泊位主档（对应 T02 泊位主档，table ID: `tblybRaIbNjZMuCm`）

| 应用库列名 (pg_field) | 应用库类型 | Base 字段名 (base_field) | Base 字段类型 | 备注说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 表唯一 ID | 系统自增 | 主键 |
| `base_record_id` | varchar | Base 表记录 ID | 文本 | **Base 记录 ID**（唯一索引） |
| `berth_code` | text | 泊位编码 | 文本 | 规范泊位编码，如 1# |
| `wharf` | text | 码头 | 单选 | 选项：北区码头/拉博塔码头 |
| `capacity_tonnage` | int8 | 容量吨级（吨） | 数字 | 整数吨位，如 50000 |
| `berth_category` | text | 泊位类别 | 单选 | 选项：海船泊位/驳船泊位 |
| `status` | text | 状态 | 单选 | 选项：启用/停用 |
| `basis_version` | text | 依据版本 | 文本 | 规则版本 |
| `effective_date` | date | 生效日期 | 日期 | 生效日 |
| `remark` | text | 备注 | 文本 | 备注说明 |
| `_created_at` | timestamptz | 创建时间 | 日期时间 | 平台审计列 |
| `_created_by` | user_profile | 创建人 | 人员 | 平台审计列 |
| `_updated_at` | timestamptz | 更新时间 | 日期时间 | 平台审计列 |
| `_updated_by` | user_profile | 更新人 | 人员 | 平台审计列 |

---

### 2.3 m_vessel 船舶主档（对应 T03 船舶主档，table ID: `tbltxO3SNKjVlGh5`）

| 应用库列名 (pg_field) | 应用库类型 | Base 字段名 (base_field) | Base 字段类型 | 备注说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 表唯一 ID | 系统自增 | 主键 |
| `base_record_id` | varchar | Base 表记录 ID | 文本 | **Base 记录 ID**（唯一索引） |
| `ship_no` | int8 | 船舶编号 | 自动编号 | 船舶自增主键 |
| `app_mmsi` | text | MMSI | 文本 | 9 位船舶识别码 |
| `app_imo` | text | IMO | 文本 | 7 位 IMO 编号 |
| `standard_ship_name` | text | 标准船名 | 文本 | 标准英文大写船名 |
| `ship_name_alias` | text | 船名别名 | 文本 | 历史船名或中文别名 |
| `ship_type` | text | 船型 | 单选 | 散货船/拖驳组合/集装箱船/杂货船/其他 |
| `dwt` | int8 | 载重吨 DWT | 数字 | 载重吨 |
| `ship_length_m` | numeric | 船长（米） | 数字 | 船长 |
| `tonnage_class` | text | 吨级档 | 单选 | 选项：5 万吨 等 |
| `_created_at` | timestamptz | 创建时间 | 日期时间 | 平台审计列 |
| `_created_by` | user_profile | 创建人 | 人员 | 平台审计列 |
| `_updated_at` | timestamptz | 更新时间 | 日期时间 | 平台审计列 |
| `_updated_by` | user_profile | 更新人 | 人员 | 平台审计列 |

---

### 2.4 m_voyage 航次主表（对应 T04 航次主表，table ID: `tbl5POTzcu79CO66`）

| 应用库列名 (pg_field) | 应用库类型 | Base 字段名 (base_field) | Base 字段类型 | 备注说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 表唯一 ID | 系统自增 | 主键 |
| `base_record_id` | varchar | Base 表记录 ID | 文本 | **Base 记录 ID**（唯一索引） |
| `voyage_no_1` | int8 | 航次编号 | 自动编号 | 自增编号 |
| `vessel_name` | jsonb | 船名 | 查找引用 | **查找引用**（来自 T03 标准船名） |
| `total_cargo_ton` | jsonb | 总货量（吨） | 查找引用 | **查找引用**（来自 T05 预计装船重量求和） |
| `load_port_local` | jsonb | 装港是否本港 | 查找引用 | **查找引用**（来自 T01 是否本港） |
| `mmsi` | jsonb | MMSI | 查找引用 | **查找引用**（来自 T03 MMSI） |
| `business_type` | text | 业务类型 | 单选 | 大宗采购船/成品销售船/物资备件船 |
| `business_attribute` | text | 业务属性 | 单选 | 内贸/外贸/雅加达物资/国内物资/本地/国际 |
| `voyage_no` | text | 船次号 | 文本 | 业务编号，如 VY-2026-0001 |
| `vessel` | text | 船舶 | 单向关联 | 关联 T03 |
| `carrier` | text | 承运方 | 文本 | 承运单位 |
| `vessel_voyage_no` | text | 船方航次号 | 文本 | 船东或船代内部航次号 |
| `load_port` | text | 装港 | 单向关联 | 关联 T01 |
| `discharge_port` | text | 卸港 | 单向关联 | 关联 T01 |
| `second_discharge_port` | text | 第二卸港 | 单向关联 | 关联 T01 |
| `final_destination` | text | 最终目的港 | 文本 | 目的港 |
| `local_side` | text | 本港侧 | 公式 | **公式**：`IF([装港是否本港], "装", "卸")` |
| `laycan_start` | timestamptz | 受载期始 | 日期时间 | 受载期窗口起始 |
| `laycan_end` | timestamptz | 受载期止 | 日期时间 | 受载期窗口截止 |
| `eta_load_port` | timestamptz | 计划抵装港 | 日期时间 | 时间节点 |
| `ata_load_port` | timestamptz | 实际抵装港 | 日期时间 | 时间节点 |
| `load_port_berth` | timestamptz | 装港靠泊 | 日期时间 | 时间节点 |
| `plan_depart_load_port` | timestamptz | 计划离装港 | 日期时间 | 时间节点 |
| `actual_depart_load_port` | timestamptz | 实际离装港 | 日期时间 | 时间节点 |
| `plan_arrive_discharge_window_start` | timestamptz | 计划抵卸港窗口始 | 日期时间 | 抵卸港窗口起始 |
| `plan_arrive_discharge_window_end` | timestamptz | 计划抵卸港窗口止 | 日期时间 | 抵卸港窗口截止 |
| `current_eta_discharge_port` | timestamptz | 当前 ETA（卸港） | 日期时间 | 动态预估到港时间 |
| `actual_arrive_discharge_port` | timestamptz | 实际抵卸港 | 日期时间 | 时间节点 |
| `discharge_port_berth` | timestamptz | 卸港靠泊 | 日期时间 | 时间节点 |
| `discharge_port_departure` | timestamptz | 卸港离港 | 日期时间 | 时间节点 |
| `vessel_status` | text | 船舶状态 | 单选 | 8 种状态（在途、靠泊中、已离港等） |
| `abnormal_mark` | text | 异常标记 | 单选 | 正常/时序倒置/滞期风险等 |
| `loading_port_overdue` | text | 装港逾期 | 公式 | **公式**：实际抵装港晚于受载期止则为「是」 |
| `actual_voyage_days` | text | 实际航程（天） | 公式 | **公式**：实际抵卸港 − 实际离装港，保留 2 位 |
| `berth_wait_days` | text | 本港等泊（天） | 公式 | **公式**：本港靠泊 − 抵港时间，保留 2 位 |
| `port_operation_days` | text | 本港作业（天） | 公式 | **公式**：本港离港 − 靠泊时间，保留 2 位 |
| `planned_berth` | jsonb | 计划泊位 | 单向关联 | 关联 T02 |
| `actual_berth` | jsonb | 实际泊位 | 单向关联 | 关联 T02 |
| `responsible_salesman` | user_profile | 负责业务员 | 人员 | 负责业务员（飞书用户） |
| `department` | text | 所属部门 | 单选 | 大宗原料采购部/商务海运部/成品销售部 |
| `key_attention` | bool | 重点关注 | 复选框 | 布尔值 |
| `audit_status` | text | 审核状态 | 单选 | 待审核/已审核 |
| `data_source` | text | 数据来源 | 单选 | 飞书录入/企微历史/集成同步/算法生成 |
| `app_record_key` | text | 原记录键 | 文本 | 历史迁移映射键 |
| `history_readonly` | bool | 历史只读 | 复选框 | 布尔值 |
| `remark` | text | 备注 | 文本 | 备注 |
| `goods_detail` | jsonb | 货物明细 | 双向关联 | **关联 T05** 货物明细反向字段 |
| `shared_ship` | text | 拼船 | 公式 | **公式**：`IF(COUNTA([货物明细]) >= 2, "是", "否")` |
| `bulk_unload_settlement` | jsonb | 大宗卸船结算 | 双向关联 | **关联 T06** 结算扩展反向字段 |
| `product_sales_extend` | jsonb | 成品销售扩展 | 双向关联 | **关联 T07** 销售扩展反向字段 |
| `_created_at` | timestamptz | 创建时间 | 日期时间 | 平台审计列 |
| `_created_by` | user_profile | 创建人 | 人员 | 平台审计列 |
| `_updated_at` | timestamptz | 更新时间 | 日期时间 | 平台审计列 |
| `_updated_by` | user_profile | 更新人 | 人员 | 平台审计列 |

---

### 2.5 m_cargo 航次货物明细（对应 T05 航次货物明细，table ID: `tbl9zBKBRwp0x3vT`）

| 应用库列名 (pg_field) | 应用库类型 | Base 字段名 (base_field) | Base 字段类型 | 备注说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 表唯一 ID | 系统自增 | 主键 |
| `base_record_id` | varchar | Base 表记录 ID | 文本 | **Base 记录 ID**（唯一索引） |
| `app_detail_id` | int8 | 明细编号 | 自动编号 | 自增编号 |
| `voyage` | jsonb | 航次 | 双向关联 | 关联 T04 航次主表 |
| `contract_no` | text | 合同号 | 文本 | 合同编号 |
| `ea_purchase_order_no` | text | EA 采购订单号 | 文本 | 订单号 |
| `material_category` | text | 物资大类 | 单选 | 原料/燃料/辅料/成品/工程辅料 |
| `goods_name` | text | 货物名称 | 文本 | 品名 |
| `material_alias` | text | 物资别名 | 文本 | 别名 |
| `user_unit` | text | 使用单位 | 单选 | DSI/DCI/DXI/金瑞 |
| `supplier_customer` | text | 供应商/客户 | 文本 | 对方单位 |
| `estimated_shipping_weight_ton` | numeric | 预计装船重量（吨） | 数字 | 预计装船吨位 |
| `port_loading_weight_ton` | numeric | 装港重量（吨） | 数字 | 装港实装吨位 |
| `dry_base_conversion_ton` | numeric | 干基折算（吨） | 数字 | 折干吨位 |
| `over_short_shipment_percent` | numeric | 溢短装（%） | 数字 | 溢短装百分比 |
| `contract_executor` | user_profile | 合同执行人员 | 人员 | 经办人 |
| `_created_at` | timestamptz | 创建时间 | 日期时间 | 平台审计列 |
| `_created_by` | user_profile | 创建人 | 人员 | 平台审计列 |
| `_updated_at` | timestamptz | 更新时间 | 日期时间 | 平台审计列 |
| `_updated_by` | user_profile | 更新人 | 人员 | 平台审计列 |

---

### 2.6 m_bulk_settle 大宗卸船结算扩展（对应 T06，table ID: `tblfEANLeDe5XTRg`）

| 应用库列名 (pg_field) | 应用库类型 | Base 字段名 (base_field) | Base 字段类型 | 备注说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 表唯一 ID | 系统自增 | 主键 |
| `base_record_id` | varchar | Base 表记录 ID | 文本 | **Base 记录 ID**（唯一索引） |
| `settlement_no` | int8 | 结算编号 | 自动编号 | 自增编号 |
| `voyage` | jsonb | 航次 | 双向关联 | 关联 T04 航次主表 |
| `discharge_clause` | text | 卸货条款 | 文本 | 卸货条款文本 |
| `discharge_rate_ton_per_day` | int8 | 卸率（吨/天） | 数字 | 卸货速率 |
| `allowable_discharge_days` | numeric | 允许卸货天数 | 数字 | 允许天数 |
| `turn_time_hour` | int8 | TURN TIME（小时） | 数字 | 周转等待小时数 |
| `demurrage_rate` | numeric | 滞期费率 | 数字 | 费率标准 |
| `currency` | text | 币种 | 单选 | IDR/USD |
| `demurrage_despatch_usd` | numeric | 滞期费 / 速遣费（USD） | 数字 | 结算金额 |
| `discharge_port_draft_ton` | numeric | 卸港水尺吨位 | 数字 | 水尺数 |
| `water_gauge_1_min` | int8 | 水尺 1（分钟） | 数字 | 水尺耗时 |
| `water_gauge_2_min` | int8 | 水尺 2（分钟） | 数字 | 水尺耗时 |
| `water_gauge_3_min` | int8 | 水尺 3（分钟） | 数字 | 水尺耗时 |
| `exchange_rate` | numeric | 汇率 | 数字 | 结算汇率 |
| `port_fee_unit_price` | numeric | 港务费单价 | 数字 | 单价 |
| `port_fee_usd` | numeric | 港务费（USD） | 数字 | 港务费合计 |
| `handling_fee_usd` | numeric | 装卸费（USD） | 数字 | 装卸费合计 |
| `trucking_volume_ton` | numeric | 汽运量（吨） | 数字 | 汽运实吨 |
| `pipe_conveyor_volume_ton` | numeric | 管带机运量（吨） | 数字 | 管带机实吨 |
| `weighbridge_weight_ton` | numeric | 过磅重量（吨） | 数字 | 过磅重量 |
| `other_dept_volume_ton` | numeric | 其他部门运量（吨） | 数字 | 其他运量 |
| `transfer_car_count` | int8 | 倒运车数 | 数字 | 车数 |
| `x1_belt_conveyor_count` | int8 | X1 管带机车数 | 数字 | 车数 |
| `cross_month_ship_road_ton` | numeric | 跨月船汽运预估（吨） | 数字 | 预估数 |
| `cross_month_ship_belt_ton` | numeric | 跨月船管带机预估（吨） | 数字 | 预估数 |
| `3_belt_conveyor_idle_hour` | numeric | 3# 管带机未运行（小时） | 数字 | 停机工时 |
| `4_belt_conveyor_idle_hour` | numeric | 4# 管带机未运行（小时） | 数字 | 停机工时 |
| `handover_send_date` | date | 交接发出日 | 日期 | 交接日期 |
| `handover_return_date` | date | 交接签回日 | 日期 | 签回日期 |
| `detian_no_handover` | bool | 德天不用交接 | 复选框 | 布尔值 |
| `light_rain_bond` | bool | 小雨保函 | 复选框 | 布尔值 |
| `ship_unload_factor_abnormal_feedback` | text | 影响卸船因素/异常反馈 | 文本 | 反馈说明 |
| `_created_at` | timestamptz | 创建时间 | 日期时间 | 平台审计列 |
| `_created_by` | user_profile | 创建人 | 人员 | 平台审计列 |
| `_updated_at` | timestamptz | 更新时间 | 日期时间 | 平台审计列 |
| `_updated_by` | user_profile | 更新人 | 人员 | 平台审计列 |

---

### 2.7 m_sales_ext 成品销售扩展（对应 T07，table ID: `tbloA2UW3mthVoEW`）

| 应用库列名 (pg_field) | 应用库类型 | Base 字段名 (base_field) | Base 字段类型 | 备注说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 表唯一 ID | 系统自增 | 主键 |
| `base_record_id` | varchar | Base 表记录 ID | 文本 | **Base 记录 ID**（唯一索引） |
| `extension_no` | int8 | 扩展编号 | 自动编号 | 自增编号 |
| `voyage` | jsonb | 航次 | 双向关联 | 关联 T04 航次主表 |
| `charter_type` | text | 租船方式 | 单选 | 选项：CFR/FOB |
| `sea_shipping_contract_no` | text | 海运合同号 | 文本 | 合同编号 |
| `_created_at` | timestamptz | 创建时间 | 日期时间 | 平台审计列 |
| `_created_by` | user_profile | 创建人 | 人员 | 平台审计列 |
| `_updated_at` | timestamptz | 更新时间 | 日期时间 | 平台审计列 |
| `_updated_by` | user_profile | 更新人 | 人员 | 平台审计列 |

---

### 2.8 m_route_rule 航程规则（对应 T08 航程规则，table ID: `tblrTGUbdXAjb325`）

| 应用库列名 (pg_field) | 应用库类型 | Base 字段名 (base_field) | Base 字段类型 | 备注说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 表唯一 ID | 系统自增 | 主键 |
| `base_record_id` | varchar | Base 表记录 ID | 文本 | **Base 记录 ID**（唯一索引） |
| `rule_no` | int8 | 规则编号 | 自动编号 | 自增编号 |
| `load_port` | text | 装港 | 文本 | 规则装港，如 巴厘巴板 |
| `discharge_port` | text | 卸港 | 文本 | 规则卸港，如 BAHODOPI |
| `applicable_business_type` | text | 适用业务类型 | 多选 | 大宗采购船/成品销售船/物资备件船 |
| `tonnage_grade` | text | 吨级档 | 单选 | 选项：5 万吨 等 |
| `experience_voyage_day` | numeric | 经验航程（天） | 数字 | 专家经验天数 |
| `experience_voyage_max_day` | numeric | 经验航程上限（天） | 数字 | 专家上限天数 |
| `experience_maintainer` | user_profile | 经验值维护人 | 人员 | 维护责任人 |
| `sample_count` | int8 | 样本数 | 数字 | 统计有效样本量 |
| `stat_p50_day` | numeric | 统计 P50（天） | 数字 | 历史中位数航程 |
| `stat_p80_day` | numeric | 统计 P80（天） | 数字 | 历史 80 分位数航程 |
| `adopt_caliber` | text | 采用口径 | 公式 | **公式**：`IF([样本数] >= 5, "统计值", "经验值")` |
| `effective_voyage_p50_day` | text | 生效航程 P50（天） | 公式 | **公式**：按口径切换的 P50 天数 |
| `effective_voyage_p80_day` | text | 生效航程 P80（天） | 公式 | **公式**：按口径切换的 P80 天数 |
| `recent_recalc_time` | timestamptz | 最近重算时间 | 日期时间 | 规则最后重算时间 |
| `app_status` | text | 状态 | 单选 | 选项：启用/停用 |
| `_created_at` | timestamptz | 创建时间 | 日期时间 | 平台审计列 |
| `_created_by` | user_profile | 创建人 | 人员 | 平台审计列 |
| `_updated_at` | timestamptz | 更新时间 | 日期时间 | 平台审计列 |
| `_updated_by` | user_profile | 更新人 | 人员 | 平台审计列 |

---

## 3. 同步核对与延迟实测基准

### 3.1 初始数据行数核对（2026-11-05）

| 表名 | 对应 Base 表 | Base 记录数 | 应用库镜像行数 | 核对状态 |
| --- | --- | --- | --- | --- |
| `m_port` | T01 港口主档 | 10 | 10 | 一致 |
| `m_berth` | T02 泊位主档 | 23 | 23 | 一致 |
| `m_vessel` | T03 船舶主档 | 0 | 0 | 一致 |
| `m_voyage` | T04 航次主表 | 0 | 0 | 一致 |
| `m_cargo` | T05 航次货物明细 | 0 | 0 | 一致 |
| `m_bulk_settle` | T06 大宗卸船结算扩展 | 0 | 0 | 一致 |
| `m_sales_ext` | T07 成品销售扩展 | 0 | 0 | 一致 |
| `m_route_rule` | T08 航程规则 | 10 | 10 | 一致 |

### 3.2 端到端同步延迟实测（T01 ↔ m_port）

采用自动化探针脚本，在 Base 中写入测试记录 `TMP-SYNC`，高频轮询应用库直至变更落地：
- **新增同步延迟（Create Latency）**：6.44 秒
- **更新同步延迟（Update Latency）**：6.23 秒
- **删除同步延迟（Delete Latency）**：6.13 秒
- **测试后清理**：测试行已从 Base 与应用库彻底删除，残留 0 行。
