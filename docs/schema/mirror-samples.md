# 镜像样本与飞书写入格式验证报告

本报告记录 SSPS 项目应用库 8 张镜像表（`m_*`）与飞书多维表格 Base（T01–T08）之间的数据取样核对、底层字段存储结构、6 个重点问题调研、飞书 API 写入格式规范以及测试探针数据清理验证。

---

## 一、已有数据取样（步骤 2）

对多维表格已内置基础主档数据的 `m_port`（港口）、`m_berth`（泊位）、`m_route_rule`（航程规则）三张镜像表进行结构取样（每表取 2 行，通过应用库 `lark-cli apps +db-execute` 执行 `SELECT *` 并通过 `to_jsonb` 输出）。

### 1. `m_port`（港口主档）

- **PG 列与类型**：
  - `id`: `uuid`
  - `base_record_id`: `varchar`
  - `port_code`: `text`（港口编码）
  - `chinese_name`: `text`（中文名）
  - `english_standard_name`: `text`（英文标准名）
  - `alias`: `text`（港口别名，换行多别名）
  - `country`: `text`（国家）
  - `region`: `text`（航线区域）
  - `nature`: `text`（港口性质，如内港/外港）
  - `is_local_port`: `bool`（是否本港）
  - `status`: `text`（状态）
  - `_created_at`, `_updated_at`: `timestamptz`
  - `_created_by`, `_updated_by`: `user_profile`
- **真实数据样本**：
  ```json
  [
    {
      "id": "24a11443-ebd1-4b9f-89ce-08ebd2099f63",
      "base_record_id": "reczz28Vslvs0m3X",
      "port_code": "001",
      "chinese_name": "IMIP港口",
      "english_standard_name": "BAHODOPI",
      "alias": "巴浩多比\n莫罗瓦利\nIMIP\n德信本港",
      "country": "印度尼西亚",
      "region": null,
      "nature": "内港",
      "is_local_port": true,
      "status": "启用",
      "_created_at": "2026-11-05T20:37:23.740267+08:00",
      "_created_by": { "user_id": "1876912250050631" },
      "_updated_at": "2026-11-05T20:37:23.740267+08:00",
      "_updated_by": { "user_id": "1876912250050631" }
    },
    {
      "id": "b02773bc-f7b3-45a1-bdbc-5ff97b8c948c",
      "base_record_id": "reczz28VuC1e8vnV",
      "port_code": "002",
      "chinese_name": "苏里高",
      "english_standard_name": "SURIGAO",
      "alias": null,
      "country": "菲律宾",
      "region": null,
      "nature": "外港",
      "is_local_port": false,
      "status": "启用",
      "_created_at": "2026-11-05T20:37:23.740267+08:00",
      "_created_by": { "user_id": "1876912250050631" },
      "_updated_at": "2026-11-05T20:37:23.740267+08:00",
      "_updated_by": { "user_id": "1876912250050631" }
    }
  ]
  ```

---

### 2. `m_berth`（泊位主档）

- **PG 列与类型**：
  - `id`: `uuid`
  - `base_record_id`: `varchar`
  - `berth_code`: `text`（泊位编号）
  - `wharf`: `text`（所属码头）
  - `capacity_tonnage`: `int8`（靠泊能力吨位）
  - `berth_category`: `text`（泊位类别）
  - `status`: `text`（启用状态）
  - `basis_version`: `text`（依据版本）
  - `effective_date`: `date`（生效日期）
  - `remark`: `text`（备注）
  - 系统审计字段：`_created_at`, `_updated_at`, `_created_by`, `_updated_by`
- **真实数据样本**：
  ```json
  [
    {
      "id": "109b7c2f-c5f4-4cd6-b68e-0e702ac4539c",
      "base_record_id": "reczz28VuCYmVDEK",
      "berth_code": "F1",
      "wharf": "北区码头",
      "capacity_tonnage": 180000,
      "berth_category": null,
      "status": "启用",
      "basis_version": "泊位容量表 2026-10-08",
      "effective_date": "2026-10-08",
      "remark": null,
      "_created_at": "2026-11-05T20:38:39.966473+08:00",
      "_created_by": { "user_id": "1876912250050631" },
      "_updated_at": "2026-11-05T20:38:39.966473+08:00",
      "_updated_by": { "user_id": "1876912250050631" }
    },
    {
      "id": "e86b618e-23b1-4dc8-9b69-8bedb64671c9",
      "base_record_id": "reczz28VuCdTPe1Y",
      "berth_code": "F2",
      "wharf": "北区码头",
      "capacity_tonnage": 100000,
      "berth_category": null,
      "status": "启用",
      "basis_version": "泊位容量表 2026-10-08",
      "effective_date": "2026-10-08",
      "remark": null,
      "_created_at": "2026-11-05T20:38:39.966473+08:00",
      "_created_by": { "user_id": "1876912250050631" },
      "_updated_at": "2026-11-05T20:38:39.966473+08:00",
      "_updated_by": { "user_id": "1876912250050631" }
    }
  ]
  ```

---

### 3. `m_route_rule`（航程规则）

- **PG 列与类型**：
  - `id`: `uuid`
  - `base_record_id`: `varchar`
  - `rule_no`: `int8`（规则编号）
  - `load_port`: `text`（装港）
  - `discharge_port`: `text`（卸港）
  - `applicable_business_type`: `_text`（数组 `text[]`）
  - `tonnage_grade`: `text`（吨位等级）
  - `experience_voyage_day`: `numeric`（经验航程天数）
  - `experience_voyage_max_day`: `numeric`（经验航程上限天数）
  - `sample_count`: `int8`（样本量）
  - `stat_p50_day`: `numeric`（统计P50天数）
  - `stat_p80_day`: `numeric`（统计P80天数）
  - `adopt_caliber`: `text`（采纳口径）
  - `effective_voyage_p50_day`: `text`（生效航程P50天数）
  - `effective_voyage_p80_day`: `text`（生效航程P80天数）
  - `recent_recalc_time`: `timestamptz`（最近重算时间）
  - `app_status`: `text`（启用状态）
  - 系统审计字段
- **真实数据样本**：
  ```json
  [
    {
      "id": "f159cb56-3fa7-4c47-a011-c0008ca9c2b5",
      "base_record_id": "reczz28VuE33IPOq",
      "rule_no": 1,
      "load_port": "reczz28VuC1e8vnV",
      "discharge_port": "reczz28Vslvs0m3X",
      "applicable_business_type": ["大宗采购船"],
      "tonnage_grade": null,
      "experience_voyage_day": 5,
      "experience_voyage_max_day": 7,
      "sample_count": null,
      "stat_p50_day": null,
      "stat_p80_day": null,
      "adopt_caliber": "经验值",
      "effective_voyage_p50_day": "5",
      "effective_voyage_p80_day": "7",
      "recent_recalc_time": null,
      "app_status": "启用",
      "_created_at": "2026-11-05T20:42:43.333627+08:00",
      "_created_by": { "user_id": "1876912250050631" },
      "_updated_at": "2026-11-05T20:42:43.333627+08:00",
      "_updated_by": { "user_id": "1876912250050631" }
    },
    {
      "id": "ccf8c926-58cb-4a31-8c2b-89fd113dc2e7",
      "base_record_id": "reczz28VuE6pwZGn",
      "rule_no": 2,
      "load_port": "reczz28VuC4XJBqH",
      "discharge_port": "reczz28Vslvs0m3X",
      "applicable_business_type": ["大宗采购船"],
      "tonnage_grade": null,
      "experience_voyage_day": 5,
      "experience_voyage_max_day": 7,
      "sample_count": null,
      "stat_p50_day": null,
      "stat_p80_day": null,
      "adopt_caliber": "经验值",
      "effective_voyage_p50_day": "5",
      "effective_voyage_p80_day": "7",
      "recent_recalc_time": null,
      "app_status": "启用",
      "_created_at": "2026-11-05T20:42:43.333627+08:00",
      "_created_by": { "user_id": "1876912250050631" },
      "_updated_at": "2026-11-05T20:42:43.333627+08:00",
      "_updated_by": { "user_id": "1876912250050631" }
    }
  ]
  ```

> [!IMPORTANT]
> **关键发现：`m_route_rule` 的 `load_port` / `discharge_port` 实际存储内容**
> 存的是 **Base 关联记录的 Record ID 纯文本**（例如 `"reczz28VuC1e8vnV"` 对应 SURIGAO，`"reczz28Vslvs0m3X"` 对应 BAHODOPI）。
> **不是** 英文标准名（如 `SURIGAO`），**不是** 港口编码（如 `002`），也 **不是** 中文名。
> 因此：如果需要将业务航次与航程规则做匹配关联，必须使用关联表的 `base_record_id` 进行关联查找，或者通过关联视图进行多表 JOIN。

---

## 二、测试航次造数与重点问题解答（步骤 3）

在多维表格中构造一套完整探针数据：
1. T03 船舶：`PROBE VESSEL`, MMSI `999999999`（`reczz28W0sxThjBD`）
2. T04 大宗航次：关联到上述船舶、SURIGAO、BAHODOPI，计划泊位 F1+F2，负责业务员设为当前用户，异常标记=延期+移泊，重点关注=true（`reczz28W0t0TjEus`）
3. T05 货物明细 2 行：30000吨 + 20000吨，关联至大宗航次（`reczz28W0t35CPZ1`, `reczz28W0t63AlWY`）
4. T06 大宗卸船结算 1 行：关联至大宗航次（`reczz28W0t8BkXMu`）
5. T04 成品销售航次 1 行（`reczz28W0tAyNQG5`）
6. T07 成品销售扩展 1 行：关联至成品航次（`reczz28W0tDGhEPY`）

同步至应用库后，针对 6 个关键问题取得确切结论与证据：

### 问题 1：`voyage_no_1`（航次编号）存的是纯整数还是带前缀的字符串？Bitable API 读回是什么？
- **确切结论**：
  - 应用库 PG 中存储为 **纯整数**（数据类型为 `int8`，样本值为 `12`、`13`）。
  - Bitable API 读回为 **纯数字字符串**（如 `"12"`，自动编号在底层即纯整数序号，`VY-` 前缀仅为飞书表格视图显示层格式化参数）。
- **证据片段**：
  ```sql
  -- PG 列信息：
  column_name: "voyage_no_1", data_type: "bigint", udt_name: "int8"
  -- PG 样本行数据：
  "voyage_no_1": 12
  -- Bitable API 读回：
  "fields": { "航次编号": "12" }
  ```

---

### 问题 2：`m_voyage` 的 `vessel`、`load_port`、`discharge_port` 这类单选关联，在 PG 存的是记录 ID 文本还是对象？
- **确切结论**：
  - 在 PG 中存的是 **记录 ID 纯文本字符串**（`text` 类型，如 `"reczz28W0sxThjBD"`），**不是** JSON 对象，也不是数组。
- **证据片段**：
  ```sql
  -- PG 列信息：
  column_name: "vessel", data_type: "text", udt_name: "text"
  -- PG 样本行数据：
  "vessel": "reczz28W0sxThjBD",
  "load_port": "reczz28VuC1e8vnV",
  "discharge_port": "reczz28Vslvs0m3X"
  ```

---

### 问题 3：`m_voyage` 的 `planned_berth`、`goods_detail`、`bulk_unload_settlement` 这类 jsonb 字段，存的 JSON 完整形状是什么？空值存什么？
- **确切结论**：
  - 完整形状为包含 `link_record_ids` 数组的对象：`{ "link_record_ids": ["reczz...", ...] }`。
  - 当字段为空时，存储形状为：`{ "link_record_ids": null }`（**不是** `null`，也不是 `{}` 或 `[]`）。
- **证据片段**：
  ```json
  // 多选关联计划泊位（F1 + F2）：
  "planned_berth": {
    "link_record_ids": ["reczz28VuCYmVDEK", "reczz28VuCdTPe1Y"]
  },
  // 货物明细（两条明细）：
  "goods_detail": {
    "link_record_ids": ["reczz28W0t35CPZ1", "reczz28W0t63AlWY"]
  },
  // 大宗结算扩展（单选关联）：
  "bulk_unload_settlement": {
    "link_record_ids": ["reczz28W0t8BkXMu"]
  },
  // 空值字段（如 actual_berth、product_sales_extend）：
  "actual_berth": {
    "link_record_ids": null
  },
  "product_sales_extend": {
    "link_record_ids": null
  }
  ```

---

### 问题 4：`responsible_salesman`（负责业务员）在 PG 里的列类型与完整 JSON 是什么？
- **确切结论**：
  - 列类型为平台自定义复合类型 `user_profile`（`USER-DEFINED`）。
  - 存储形状为包含 `user_id` 的单键 JSON 对象：`{ "user_id": "1876912250050631" }`。
- **证据片段**：
  ```sql
  column_name: "responsible_salesman", data_type: "USER-DEFINED", udt_name: "user_profile"
  -- 样本行值：
  "responsible_salesman": {
    "user_id": "1876912250050631"
  }
  ```

---

### 问题 5：`abnormal_mark`（异常标记）在 PG 里的列类型与值是什么？
- **确切结论**：
  - 列类型为 PG 原生字符串数组 `text[]`（`data_type: "ARRAY"`, `udt_name: "_text"`）。
  - 存储值为标准 JSON 字符串数组，如 `["延期", "移泊"]`。
- **证据片段**：
  ```sql
  column_name: "abnormal_mark", data_type: "ARRAY", udt_name: "_text"
  -- 样本行值：
  "abnormal_mark": ["延期", "移泊"]
  ```

---

### 问题 6：时区与时间偏移（飞书写入 vs PG 读回）
- **确切结论**：
  - 应用库 Postgres 会话时区为 `Asia/Shanghai`（`SHOW timezone` 返回 `Asia/Shanghai`）。
  - 飞书中写入北京时间 `2026-11-20 08:00:00+08:00`（时间戳 `1795132800000`）。
  - PG 中 `timestamptz` 列读回为 `2026-11-20T08:00:00+08:00`。
  - **两者完全一致，相差 0 小时**，不存在任何 8 小时时区漂移现象。

---

### 额外验证：公式与查找引用字段在镜像库的表现
- **查找引用（`vessel_name`）**：同步为复杂对象 `{ "type": 1, "value": [{ "text": "PROBE VESSEL", "type": "text" }] }`。
- **求和 Rollup（`total_cargo_ton`）**：同步为数值数组对象 `{ "type": 2, "value": [50000] }`（自动将 30000+20000 聚合求和）。
- **拼船公式（`shared_ship`）**：多维表格根据货物明细数量自动算得并同步为 `"是"`。
- **实际航程公式（`actual_voyage_days`）**：根据离装港与抵卸港计算并同步为 `"6.06"`。

---

## 三、飞书 API 写入格式验证（步骤 4）

使用 Node.js 脚本直接调用飞书开放平台 Bitable OpenAPI（`POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records` 与 `PATCH`），对全部 7 类字段写入与只读字段保护进行实操验证。

### 1. 成功写入的最小 Payload 示例

#### 1) 关联字段（单选或多选关联）
- **规则**：必须传入记录 ID 的字符串数组 `["reczz..."]`。
```json
{
  "fields": {
    "装港": ["reczz28VuC1e8vnV"]
  }
}
```
- **读回格式**：
  ```json
  [
    {
      "record_ids": ["reczz28VuC1e8vnV"],
      "table_id": "tblRx4wUYE8UifCy",
      "text": "002",
      "text_arr": ["002"],
      "type": "text"
    }
  ]
  ```

#### 2) 日期时间字段
- **规则**：**必须传入 13 位毫秒级 Unix 时间戳（整数）**。
```json
{
  "fields": {
    "计划抵卸港窗口始": 1795305600000
  }
}
```
> [!CAUTION]
> **字符串格式被严格拒绝**：若传入字符串 `"2026-11-20 08:00"`，飞书 API 立即返回报错：
> ```json
> {
>   "code": 1254064,
>   "msg": "DatetimeFieldConvFail",
>   "error": {
>     "message": "Invalid request parameter: 'fields.计划抵卸港窗口始.fieldValue.2026-11-20 08:00.fieldName.计划抵卸港窗口始'. Correct format : the value of 'Date' must be a unix timestamp. Please check and modify accordingly."
>   }
> }
> ```

#### 3) 人员字段
- **规则**：必须传入包含 `id` 的对象数组，`id` 为用户的 `open_id`（如 `ou_xxx`）。
```json
{
  "fields": {
    "负责业务员": [
      {
        "id": "ou_4639e53bc150e3cf0ac53f4e65440d01"
      }
    ]
  }
}
```
- **读回格式**：飞书 API 会自动展开用户信息为 `[{ "id": "ou_...", "name": "董金", "en_name": "董金", "email": "..." }]`。

#### 4) 多选字段
- **规则**：传入多选选项名称的字符串数组。
```json
{
  "fields": {
    "异常标记": ["延期", "移泊"]
  }
}
```

#### 5) 复选框、数字、单选（币种等）
- **复选框**：直接传布尔值 `true` 或 `false`。
  ```json
  { "fields": { "重点关注": true } }
  ```
- **数字**：直接传浮点数或整数。
  ```json
  { "fields": { "预计装船重量（吨）": 12345.67 } }
  ```
- **单选**：直接传选项文本字符串。
  ```json
  { "fields": { "币种": "USD" } }
  ```

#### 6) 单字段更新行为（PATCH）
- **规则**：调用 PATCH 接口仅更新单个字段时，**其余字段完好保留**，不会被清空或覆盖。
```json
// PATCH /records/:record_id
{
  "fields": {
    "备注": "UPDATED_NOTE_ONLY"
  }
}
```
- **验证结果**：更新前记录的所有关联、单选、复选框、系统计算值等字段完整保留。

---

### 2. 尝试写入只读/公式/查找引用字段的报错与行为

我们分别尝试向记录创建接口中传入只读字段：
1. **自动编号**：`"航次编号": 9999`
2. **公式字段**：`"本港侧": "卸"`
3. **查找引用**：`"船名": "FAKE VESSEL"`

- **行为表现**：
  - 飞书 Bitable API **不会返回 400 报错**，而是返回 `code: 0, msg: "success"`；
  - **但在实际处理中被静默剔除（Ignored）**，返回与读回的 `record.fields` 中完全不包含所传的只读字段值，多维表格依然由系统内部逻辑自动生成/计算。

---

## 四、测试数据彻底清理核对（步骤 5）

所有测试探针记录均带有统一标记 `_SSPS_PROBE_`。
测试完成后，运行清理程序逐一删除探针记录，并在 Base 和应用库进行完整行数对比：

### 1. 清理执行统计
- 步骤 3 航次全流程测试记录：7 条（T03×1, T04×2, T05×2, T06×1, T07×1）全部删除成功（`code: 0`）。
- 步骤 4 写入格式验证记录：12 条（T04×10, T05×1, T06×1）全部删除成功（`code: 0`）。
- 残留探针深度扫描：扫描 T01–T08 全表，确认无任何 `_SSPS_PROBE_` 或 `PROBE VESSEL` 残留。

### 2. 前后行数核对总览

| 表序号 | 表名 / 镜像表名 | 初始行数 | 步骤3测试造数后 | 步骤4写入测试后 | 最终清理后（Base） | 最终清理后（应用库） | 验证结果 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| T01 | 港口主档 (`m_port`) | 10 | 10 | 10 | **10** | **10** | 一致已恢复 |
| T02 | 泊位主档 (`m_berth`) | 23 | 23 | 23 | **23** | **23** | 一致已恢复 |
| T03 | 船舶主档 (`m_vessel`) | 0 | 1 | 1 | **0** | **0** | 一致已恢复 |
| T04 | 航次主表 (`m_voyage`) | 0 | 2 | 12 | **0** | **0** | 一致已恢复 |
| T05 | 货物明细 (`m_cargo`) | 0 | 2 | 3 | **0** | **0** | 一致已恢复 |
| T06 | 大宗结算 (`m_bulk_settle`) | 0 | 1 | 2 | **0** | **0** | 一致已恢复 |
| T07 | 成品扩展 (`m_sales_ext`) | 0 | 1 | 1 | **0** | **0** | 一致已恢复 |
| T08 | 航程规则 (`m_route_rule`) | 10 | 10 | 10 | **10** | **10** | 一致已恢复 |

核对结论：多维表格 Base 与应用库镜像表的行数完全恢复至测试前的初始状态，零脏数据残留。
