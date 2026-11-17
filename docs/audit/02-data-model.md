# 02 数据模型审计（第 1–2 批，未完成全量审计）

审计日期：2026-11-06（Asia/Shanghai）。代码仓：`C:\Users\董金\ssps-miaoda`，`sprint/default`。第 1 批基线为 `24051ff`；第 2 批固定读取 `04825bde4030b274221959f52f761500da4ae4dd` 的 Git 对象，不切分支。规格仓：`C:\Users\董金\WorkBuddy\SSPS`。目前没有功能上线；本文描述代码行为和上线前风险，不描述线上事故。

审计期间检测到外部提交 `b27bd13`、`550ad7f`、`04825bd`，分别涉及全局角色守卫、飞书配置清洗、自动编号读回。已读取受影响文件的差异；第 1 批九项缺陷及一项风险的相关逻辑未被这些提交修复。第 1–8 节代码行号按 `24051ff` 引用，后续章节按各自明确的提交引用；点击本地文件时需注意新提交引起的行号偏移。代码由外部更新，不是审计员修改。

## 1. 范围、方法与证据强度

第 1 批已核对 T01–T08 的领域字段、主要 API 输入/输出、飞书字段映射、镜像读写映射，以及航次状态函数、节点校验和主要保存路径。第 2 批补充 D01–D12 的存储映射、001–004 SQL、RLS 静态覆盖、审计列、唯一约束、外键和查询索引，见第 9–13 节。T09/T10 的完整发布路径、迁移清洗及全部适配器行为尚未审完。

代码仓保持只读；未读取 `.env.local`，未访问真实飞书、妙搭或业务数据库，未执行测试、构建、迁移或发布。仅在文档仓写本报告。文档仓的 `app/` 历史备份未作为审计对象。文中的输入均为构造样例，不使用真实业务明细。

证据分级：

- **静态确定**：完整读取相关调用路径后，能够给出确定的输入、分支与输出；本文的“实际行为”均为代码推演，未声称已运行复现。
- **风险**：代码存在明确的行为差异，但最终后果依赖 streaming、平台配置或并发时序；单列依赖条件和缺少的证据。
- **待核查/规格冲突**：不能从当前证据确定业务预期或运行结果，不计入已确认缺陷。

累计记录 **12 项缺陷（P0 ×6、P1 ×6）、3 项风险（P0 ×1、P1 ×2）**。第 2 批新增 DM-010–012、RM-002–003。风险不计入已确认缺陷；尤其 RM-002 是已有业务决策接受的权限边界及其待验证条件。这些不是全项目缺陷总数。P0 按用户定义，用于错误业务结论、数据损坏/丢失或越权；不是声称已经发生事故。

## 2. 已确认缺陷

### DM-001 / P0 / 缺陷：表外泊位可经主数据入口加入，并直接进入 CMR 分母

- **代码事实**：[master.service.ts:89](C:/Users/董金/ssps-miaoda/server/modules/master/master.service.ts:89) 的 `cleanBerth` 只校验编码格式、码头、容量为正和启停状态；第 98–102 行新增只检查重复编码，没有 23 泊位白名单。[drizzle-master-store.ts:66](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-master-store.ts:66) 将其写入 T02。[capacity.ts:17](C:/Users/董金/ssps-miaoda/server/engine/capacity.ts:17) 只按启用状态筛选，再于第 21–23 行按容量筛选，没有再次剔除表外泊位。
- **冲突依据**：锁定规则 2、3；[T02-berth.md:5](C:/Users/董金/WorkBuddy/SSPS/docs/schema/T02-berth.md:5)、[T02-berth.md:14](C:/Users/董金/WorkBuddy/SSPS/docs/schema/T02-berth.md:14) 明确表外泊位不建行、不计入 CMR。
- **复现场景**：本地构造合法 23 泊位数据，仅 F1 启用且容量 50000，其余停用；查询日 D 有 F1 占用且处于计划覆盖期。物流管理员提交 `POST /api/berths`，载荷 `{code:"F6",terminal:"北区码头",capacity:50000,status:"启用",basis:"审计构造"}`，然后查询 D 的 50000 吨容量。
- **实际行为（静态确定）**：新增通过；分母从 1 变为 2，F1 占用、F6 空闲，CMR 从 0 变为 0.5。
- **期望行为**：拒绝表外 F6；即使镜像中已有污染行，计算仍只取权威泊位池，CMR 保持 0。
- **建议方向**：统一权威泊位集合，保存端和计算端共同约束；不能仅依赖首次种子正确。

### DM-002 / P0 / 缺陷：UTC“今天”使 IMIP 凌晨的第 15 天走入远期路径

- **代码事实**：[live-snapshot.ts:17](C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts:17) 默认 `today` 为 `new Date().toISOString().slice(0,10)`；真实模式也使用这个快照，[ports.module.ts:50](C:/Users/董金/ssps-miaoda/server/modules/ports/ports.module.ts:50) 可见装配。[capacity.service.ts:15](C:/Users/董金/ssps-miaoda/server/modules/capacity/capacity.service.ts:15) 把该日期传给引擎，[capacity.ts:44](C:/Users/董金/ssps-miaoda/server/engine/capacity.ts:44) 按日期差是否 ≤15 决定路径。
- **冲突依据**：锁定规则 4、9；[migration-rules.md:25](C:/Users/董金/WorkBuddy/SSPS/docs/schema/migration-rules.md:25) 和 [dates.ts:1](C:/Users/董金/ssps-miaoda/server/lib/dates.ts:1) 采用 IMIP/WITA（UTC+8）日期口径。
- **复现场景**：冻结当前时刻为 `2026-11-05T17:00:00Z`，即 IMIP `2026-11-06 01:00`；查询目标日 `2026-11-21`。
- **实际行为（静态确定）**：快照 `today=2026-11-05`，日期差为 16，单日详情 `mode=density`，读取航次密度路径。
- **期望行为**：IMIP 当前日期为 11 月 6 日，目标日距今 15 天，应走 `mode=cmr` 的靠船计划路径。是否有计划数据不改变分流结论。
- **扩展影响**：[master.service.ts:47](C:/Users/董金/ssps-miaoda/server/modules/master/master.service.ts:47) 返回给前端的 `today` 同样取 UTC；[compat.service.ts:67](C:/Users/董金/ssps-miaoda/server/modules/admin/compat.service.ts:67) 也将 UTC 日期用于“今日在港”。在港区间本身按日比较，但比较的“今天”错误。例如 11 月 6 日当地 01:00，构造靠泊日为 11 月 6 日的航次，会按前一天判断不在港。
- **建议方向**：集中定义业务日期，并以 WITA 日期测试 UTC 日界线两侧；Jakarta/Shanghai 是输入或展示时区测试维度，不能替代 IMIP 的业务日期。

### DM-003 / P0 / 缺陷：四个合法货物字段被接受、记日志，却不写入真实主数据

- **代码事实**：[voyage.service.ts:23](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts:23) 允许 `kind/dept2/inspector/exec`，第 252–267 行清洗后保留这些值，第 282–289 行交给仓储并记录字段变化。真实仓储的 [CARGO 映射:33](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:33) 没有这四项；第 207–215 行遇到无映射键直接跳过；第 230–237 行即使没有可写字段也返回。第 102–103 行读取硬编码 `kind:''/dept2:''/exec:''`，不返回 `inspector`。[memory-voyage-store.ts:53](C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-voyage-store.ts:53) 则直接合并保存，因此内存行为不同。
- **冲突依据**：K01、K09 的主数据与唯一录入入口约定；[T05-cargo-line.md:10](C:/Users/董金/WorkBuddy/SSPS/docs/schema/T05-cargo-line.md:10)、第 14、20、21 行分别要求物资类别、归属事业部、检测公司、合同执行人员。
- **复现场景**：对本人可编辑航次的一条货物调用 `PATCH /api/voyages/{id}/cargo-lines/{no}`，提交 `{kind:"粉矿",dept2:"审计事业部",inspector:"审计检测机构",exec:"审计经办人"}`；此请求路径使用普通对象而非新建 DTO。
- **实际行为（静态确定）**：服务接受且记变更日志；`cargoFields` 得到空对象，不发 T05 更新；返回与后续查询仍是空 `kind/dept2/exec`，`inspector` 缺失。内存实现会保留提交值。
- **期望行为**：合法字段写入主数据且读回一致；人员字段需显式解析为人员标识。若相关能力未实现，应明确拒绝，不能成功响应并记成已修改。
- **补充证据**：[schema.ts:226](C:/Users/董金/ssps-miaoda/server/database/schema.ts:226) 的 m_cargo 缺前三项对应列；已有 `contract_executor`（第 245 行），适配器却未使用。不能把四个字段统称为数据库全都缺失。

### DM-004 / P1 / 缺陷：新建航次只在响应里推导状态，T04 与镜像没有持久化状态

- **代码事实**：[voyage-store.port.ts:8](C:/Users/董金/ssps-miaoda/server/ports/voyage-store.port.ts:8) 的 `NewVoyage` 排除了 `status`；[voyage.service.ts:178](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts:178) 构造 draft 时未加状态，第 187 行先存储，第 188 行仅给返回对象加 `deriveStatus`。[drizzle-voyage-store.ts:178](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:178) 直接映射该 draft；第 57–63 行回写镜像也不补状态。
- **冲突依据**：K10；[T04-voyage.md:41](C:/Users/董金/WorkBuddy/SSPS/docs/schema/T04-voyage.md:41) 的船舶状态为“单选，系统写入”；[status-rules.md:3](C:/Users/董金/WorkBuddy/SSPS/docs/schema/status-rules.md:3) 要求每次保存时推导。
- **复现场景**：主数据已有审计船舶和合法港口，以普通业务员创建已关联船舶、尚无实际节点的航次；读取响应、T04 请求载荷与 `store.get(id)`。
- **实际行为（静态确定）**：响应显示“未到装港”；飞书创建载荷缺“船舶状态”，回写镜像 `vessel_status` 为空，仓储读取得到 `undefined`。此状态甚至被现有测试 [drizzle-voyage.spec.ts:37](C:/Users/董金/ssps-miaoda/server/test/drizzle-voyage.spec.ts:37) 明确断言为 `undefined`，并非测试证明了业务一致性。
- **期望行为**：创建时即推导并写入“未到装港”；无船舶时写入“待宣船”。正常读接口重新推导只能掩盖差异，不能补齐主数据。

### DM-005 / P1 / 缺陷：系统生成的变更时间先截成 UTC 字面值，再被当作 UTC+8 写入，实际早了 8 小时

- **代码事实**：[voyage.service.ts:51](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts:51) 的 `now()` 丢弃 UTC 标记，返回 UTC 字面值；ETA 修订第 227–231 行使用该值。[drizzle-voyage-store.ts:281](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:281) 和第 285 行以 `toTs` 保存 D01/D02 时间；[db.ts:8](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/db.ts:8) 将输入按 UTC+8 解释，减去 8 小时。
- **冲突依据**：K13 修订留痕；[D-app-db.md:13](C:/Users/董金/WorkBuddy/SSPS/docs/schema/D-app-db.md:13) 的修改时间语义；迁移规则第 8 条和日期工具约定的当地时间口径。
- **复现场景**：冻结时钟为 `2026-11-06T02:00:00Z`（IMIP 10:00），修订一条尚未抵卸港航次的 ETA，依据为“电话”。
- **实际行为（静态确定）**：`now()` 产生 `2026-11-06 02:00`，D01 `revised_at` 被保存为 `2026-11-05T18:00:00Z`，比真实操作早 8 小时；读回显示当地 02:00。
- **期望行为**：保存真实瞬间 `2026-11-06T02:00:00Z`，显示当地 10:00。注意这不是用户输入节点的 `toTs/fromTs` 往返失败，而是系统时钟与该转换函数的输入约定不匹配。

### DM-006 / P1 / 缺陷：泊位生效日期存在于规格、字段映射和数据库，却无法通过应用维护或读回

- **代码事实**：[types.ts:4](C:/Users/董金/ssps-miaoda/server/domain/types.ts:4) 和 [api.interface.ts:53](C:/Users/董金/ssps-miaoda/shared/api.interface.ts:53) 的 Berth 没有生效日期。[master.service.ts:96](C:/Users/董金/ssps-miaoda/server/modules/master/master.service.ts:96) 清洗时不保留它，第 106 行更新白名单也没有。虽然 [fieldmap.ts:4](C:/Users/董金/ssps-miaoda/server/lark/fieldmap.ts:4) 定义 `effective`，[drizzle-master-store.ts:67](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-master-store.ts:67) 还查询旧 `effectiveDate`，但后续没有使用；第 64 行读回也遗漏该字段。
- **冲突依据**：[T02-berth.md:11](C:/Users/董金/WorkBuddy/SSPS/docs/schema/T02-berth.md:11) 生效日期必填；K09 应用为唯一录入入口。
- **复现场景**：以管理员对 F1 提交 `PATCH /api/berths/F1`，载荷 `{effective:"2026-10-08"}`。
- **实际行为（静态确定）**：返回 422“不能修改字段：effective”；GET 泊位列表也不暴露已有日期。新建路径即使带该键也会在清洗时丢弃。
- **期望行为**：存在一致的录入、校验、写入和读回路径；字段可以采用其他 API 名称，但当前没有任何可用映射。

### DM-007 / P1 / 缺陷：不存在的公历日期被当作有效节点接收

- **代码事实**：[common.ts:16](C:/Users/董金/ssps-miaoda/server/importers/common.ts:16) 的 `parseDateTime` 只检查月 1–12、日 1–31，不检查每月天数；[voyage.service.ts:74](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts:74) 将非空解析结果视为有效日期。[dates.ts:22](C:/Users/董金/ssps-miaoda/server/lib/dates.ts:22) 的 `Date.UTC` 会进位，因此时序校验也不能拒绝此类日期。
- **冲突依据**：时间节点正确性、[T04-voyage.md:21](C:/Users/董金/WorkBuddy/SSPS/docs/schema/T04-voyage.md:21)、状态规则配套校验。日期字段不能表达不存在的日期。
- **复现场景**：给没有其他实际节点的可编辑航次记录 `actDischArr="2026-02-30 10:00"`。
- **实际行为（静态确定）**：解析结果仍为 `2026-02-30 10:00`；无相邻节点倒置可拦截，内存仓储保存该值，状态进入“卸港等泊”。真实写入端继续用 `Date.parse` 转换，已不再能保证与原字面日期一致。
- **期望行为**：入口拒绝不存在的日期，航次与状态不改变。即使真实接口最终拒绝，也不能补足内存和服务层已接受非法日期的缺陷。

### DM-008 / P1 / 缺陷：货物 PATCH 跳过新增时的非负货量与必填校验

- **代码事实**：[voyage.service.ts:262](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts:262) 仅在 `requireAll=true` 时校验货名和 `tons>=0`；第 284 行更新固定传 `false`。[voyage.controller.ts:27](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.controller.ts:27) 更新体是普通对象，没有新增 DTO 的 `@Min(0)` 保护。负数经 `parseNumber` 后被两套仓储保存。
- **冲突依据**：[T05-cargo-line.md:11](C:/Users/董金/WorkBuddy/SSPS/docs/schema/T05-cargo-line.md:11)、第 16 行必填货名与货量，以及新增 DTO 明确的非负货量约束；锁定规则 3、4 依赖有效货量做竞争吨级判断。
- **复现场景**：一条货物原为 50000 吨，提交 `PATCH .../cargo-lines/{no}`，载荷 `{tons:-1,name:""}`。
- **实际行为（静态确定）**：清洗通过，保存负货量和空货名；列表合计变成 -1，`toLite` 原样汇总负货量（[voyageLite.ts:12](C:/Users/董金/ssps-miaoda/server/domain/voyageLite.ts:12)）。
- **期望行为**：以更新后的整行校验必填值和数值范围，返回 422 并保留原数据。部分更新不应要求每次传所有字段，但传入非法值仍须拒绝。

### DM-009 / P1 / 缺陷：节点倒置拒绝保存后，没有按规格写入 D08

- **代码事实**：[validate.ts:32](C:/Users/董金/ssps-miaoda/server/domain/validate.ts:32) 把本次变更导致的倒置放入 `errors`；[voyage.service.ts:94](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts:94) 立即抛异常。D08 写入在第 190 或 216 行，均位于成功保存之后，只处理 `warnings`，异常分支无法到达。
- **冲突依据**：[status-rules.md:17](C:/Users/董金/WorkBuddy/SSPS/docs/schema/status-rules.md:17) 明确“保存时拦截，写入 D08”。
- **复现场景**：已有 `actLoadDep="2026-11-06 10:00"`，记录 `actDischArr="2026-11-05 10:00"`。
- **实际行为（静态确定）**：返回 422，航次不变；`addIssues` 未调用，D08 不增加对应问题。
- **期望行为**：拒绝节点保存，同时记录倒置问题到 D08。若产品希望“被拒绝的输入不进入待办”，应先修改规格，而不是把当前实现视为符合规格。

## 3. 风险

### RM-001 / P1 / 风险：船舶吨级只回写镜像，飞书主数据不更新，streaming 后可能回退

- **代码事实**：[master.service.ts:123](C:/Users/董金/ssps-miaoda/server/modules/master/master.service.ts:123) 按 DWT 计算 `tier`；[drizzle-master-store.ts:35](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-master-store.ts:35) 将它写入镜像 `tonnage_class`，但第 86 行的飞书字段没有吨级档，[fieldmap.ts:5](C:/Users/董金/ssps-miaoda/server/lark/fieldmap.ts:5) 也没有这一项。
- **冲突依据**：K01 一期以飞书为主；[T03-vessel.md:13](C:/Users/董金/WorkBuddy/SSPS/docs/schema/T03-vessel.md:13) 的吨级档；[D-app-db.md:3](C:/Users/董金/WorkBuddy/SSPS/docs/schema/D-app-db.md:3) 的镜像同步约定。
- **触发场景**：构造一个飞书 T03 吨级档为空的船舶，将其 DWT 更新为 50000。应用即时回写镜像“5 万吨”，飞书该字段仍为空；随后 streaming 将主数据该字段覆盖到镜像。
- **实际差异（静态确定）**：即时镜像与飞书不一致。**后续回退为 null 是条件性风险**：取决于真实同步任务是否覆盖未变更/空字段，当前未实测。
- **期望行为**：主数据、即时回写和同步后读数一致。
- **缺少证据**：真实 streaming 更新事件的列范围、空值覆盖规则、同步先后顺序。吨级边界本身也在 open-questions 待确认，本条不裁定 5/10 万吨自动分档算法是否应采用。

## 4. 规格字段 ↔ 代码字段差异表

下表是第 1 批字段核对结果，包含正常映射以便定位遗漏。分组行按相同顺序对应；“有映射”仅表示找到字段链路，不代表权限、并发、精度、RLS 已通过。完整数据库列名/类型摘录在附录 A；D 表补充核对见第 11 节。

主要实现来源：[fieldmap.ts](C:/Users/董金/ssps-miaoda/server/lark/fieldmap.ts)、[主数据仓储](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-master-store.ts)、[航次仓储](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts)、[共享接口](C:/Users/董金/ssps-miaoda/shared/api.interface.ts)。

| 表／规格字段 | 领域／API 字段 | 镜像列／类型 | 本批核对结果 |
| --- | --- | --- | --- |
| T01 港口编码、中文名称、英文标准名 | code / cn / en | port_code / chinese_name / english_standard_name：text | 有映射；code 必填与唯一的完整约束待补查 |
| T01 别名 | alias：string[] | alias：text | 写入换行分隔，读回按换行拆；与 T01 规格一致 |
| T01 国家、地区、性质 | country / region / kind | country / region / nature：text | 有映射 |
| T01 是否本港、状态 | isLocal / status | is_local_port：bool；status：text | 有映射；本港侧计算使用固定英文名，主档标志一致性待补查 |
| T02 泊位编码、码头、容量吨级 | code / terminal / capacity | berth_code / wharf：text；capacity_tonnage：bigint | 有映射，但缺固定泊位池约束，DM-001 |
| T02 泊位类别、状态、依据版本、备注 | category / status / basis / note | berth_category / status / basis_version / remark：text | 有映射；类别是否必填存在规格冲突 |
| T02 生效日期（日期） | 缺；F.T02 定义了 effective | effective_date：date | 保存及响应遗漏，DM-006 |
| T03 船舶编号 | id：string | ship_no：bigint | 应用格式化为 V-xxxx；T03 文档例子为 VS-xxxx，编号格式待统一，不作关键业务缺陷 |
| T03 MMSI、IMO、标准船名 | mmsi / imo / name | app_mmsi / app_imo / standard_ship_name：text | 有映射；历史 MMSI 可空、新增必填的代码区分已读到 |
| T03 船名别名、船型 | alias / type | ship_name_alias / ship_type：text | 有映射 |
| T03 DWT、船长 | dwt / length | dwt：bigint；ship_length_m：numeric | 有映射；小数输入与整数列兼容性待适配器批次验证 |
| T03 吨级档 | tier | tonnage_class：text | API/镜像有值，飞书写映射缺失，RM-001 |
| T04 航次编号、船次号 | id / no | voyage_no_1：bigint；voyage_no：text | 两者不同，不能混为同一字段；id 拼接镜像审计创建年，跨年稳定性待查 |
| T04 业务类型、业务属性 | biz / attr | business_type / business_attribute：text | 有映射；PATCH 枚举校验与条件必填尚未穷尽 |
| T04 船舶、船名、MMSI | vessel（业务船名）；未提供独立 MMSI 字段 | vessel：text（关联记录标识）；vessel_name/mmsi：jsonb | vessel 通过字典转换；查找引用字段在详情契约中的覆盖待查 |
| T04 承运方、船方航次号 | carrier / shipVoy | carrier / vessel_voyage_no：text | 有映射 |
| T04 装港、卸港、第二卸港、最终目的港 | load / disch / disch2 / finalPort | load_port / discharge_port / second_discharge_port / final_destination：text | 应用按记录标识与港口英文名互转；最终目的港规格类型有文档冲突 |
| T04 本港侧（公式） | side（列表）；sideOfVoyage | local_side：text | 服务端自行推导，未直接使用镜像公式列；不是自动判定为遗漏 |
| T04 受载期始／止 | laycanS / laycanE | laycan_start / laycan_end：timestamptz | 有映射 |
| T04 计划／实际抵装港、装港靠泊 | planLoadArr / actLoadArr / loadBerth | eta_load_port / ata_load_port / load_port_berth：timestamptz | 有映射 |
| T04 计划／实际离装港 | planLoadDep / actLoadDep | plan_depart_load_port / actual_depart_load_port：timestamptz | 有映射 |
| T04 计划抵卸港窗口始／止 | planDischS / planDischE | plan_arrive_discharge_window_start / plan_arrive_discharge_window_end：timestamptz | 有映射 |
| T04 当前 ETA、实际抵卸港 | eta / actDischArr | current_eta_discharge_port / actual_arrive_discharge_port：timestamptz | 有映射；etaUpdated 来自 D01 或创建时间，不是自创 T04 持久化列 |
| T04 卸港靠泊／离港 | dischBerth / dischDep | discharge_port_berth / discharge_port_departure：timestamptz | 有映射；非法日期入口见 DM-007 |
| T04 船舶状态、异常标记 | status / flags：string[] | vessel_status：text；abnormal_mark：text[] | 状态读时重算；取消只在显示层附注；新建持久化缺口见 DM-004 |
| T04 装港逾期、航程、等泊、作业天数 | deriveFields 的 overdue / voyageDays / waitDays / workDays | loading_port_overdue / actual_voyage_days / berth_wait_days / port_operation_days：text | 领域有推导函数；共享详情 DTO 未显式包含，页面完整覆盖待前端批次 |
| T04 计划／实际泊位 | planBerths / actBerths | planned_berth / actual_berth：jsonb | 关联列表通过 link_record_ids 转换 |
| T04 总货量、拼船 | tons / pooled（列表）；total / pooled（deriveFields） | total_cargo_ton：jsonb；shared_ship：text | 从 T05 重算；空值与负值传播需关注 DM-008 |
| T04 负责业务员、所属部门 | owner / ownerId / dept | responsible_salesman：user_profile；department：text | 有映射；ownerId 是权限所需身份标识，非新增业务事实字段；用户映射失败路径待查 |
| T04 重点关注、审核状态、来源 | focus / review / source | key_attention：bool；audit_status / data_source：text | 有映射 |
| T04 原记录键 | Voyage、共享 DTO、F.T04 均缺 | app_record_key：text | 规格字段存在但通用仓储读写缺口；正式迁移未审，不据此声称已迁数据丢失 |
| T04 历史只读、备注 | readonly / remark | history_readonly：bool；remark：text | 有映射；已读到服务层只读拦截，所有旁路尚待穷尽 |
| T05 明细编号、航次 | no / voyage | app_detail_id：bigint；voyage：jsonb | 有映射 |
| T05 合同号、EA 订单、物资大类 | contract / ea / big | contract_no / ea_purchase_order_no / material_category：text | 有映射；新增 DTO 将合同号和大类标可选，与字段规格必填不一致，待区分待宣船草稿策略 |
| T05 物资类别、归属事业部、检测公司 | kind / dept2 / inspector | 当前 schema 缺对应列 | 写入被静默跳过，DM-003；共享 CargoLineRow 还缺 inspector |
| T05 货名、别名、使用单位、供应商/客户 | name / alias / unit / party | goods_name / material_alias / user_unit / supplier_customer：text | 有映射 |
| T05 预计货量、装港重量、干基折算 | tons / loadTons / dry | estimated_shipping_weight_ton / port_loading_weight_ton / dry_base_conversion_ton：numeric | 有映射；PATCH 非负校验遗漏，DM-008 |
| T05 溢短装（数字） | over：string | over_short_shipment_percent：numeric | 输入以正则取数字，输出强加“±…%”；有类型/符号语义差异，需下一批核对单向溢装/短装约定 |
| T05 合同执行人员 | exec：string | contract_executor：user_profile | 数据库有列，但实际读写缺失，DM-003 |
| T05 储运物料名／储运大类／本地国际 | 领域、API、F.T05 缺 | 当前 schema 缺对应列 | base-plan.json 有三字段；compat.ts:67 对储运 1–3 输出固定空串。迁移保留路径待补查 |
| T06 航次 | 由方法参数 id 定位 | voyage：jsonb | 有映射 |
| T06 卸货条款、卸率、允许天数、TURN TIME | terms / rate / allowDays / turn | discharge_clause：text；discharge_rate_ton_per_day：bigint；allowable_discharge_days：numeric；turn_time_hour：bigint | 有映射 |
| T06 滞期费率、币种、滞期/速遣费 | demRate / demCur / demUsd | demurrage_rate：numeric；currency：text；demurrage_despatch_usd：numeric | 有映射；本批不对金额权限作完整通过结论 |
| T06 卸港水尺吨位、水尺 1–3 | gauge / g1 / g2 / g3 | discharge_port_draft_ton：numeric；water_gauge_1_min / 2_min / 3_min：bigint | 有映射；水尺耗时按分钟命名，无擅自换算 |
| T06 汇率、港务费单价、港务费、装卸费 | fx / portUnit / portFee / loadFee | exchange_rate / port_fee_unit_price / port_fee_usd / handling_fee_usd：numeric | 有映射 |
| T06 汽运、管带机、过磅、其他部门运量 | truck / belt / weigh / other | trucking_volume_ton / pipe_conveyor_volume_ton / weighbridge_weight_ton / other_dept_volume_ton：numeric | 有映射 |
| T06 倒运车数、X1 车数 | carTurn / x1Cars | transfer_car_count / x1_belt_conveyor_count：bigint | 有映射 |
| T06 跨月汽运／管带机预估 | crossTruck / crossBelt | cross_month_ship_road_ton / cross_month_ship_belt_ton：numeric | 有映射 |
| T06 3#／4# 管带机未运行 | beltOff3 / beltOff4 | 3_belt_conveyor_idle_hour / 4_belt_conveyor_idle_hour：numeric | 有映射；领域键与 SQL 名称不同不等于遗漏 |
| T06 交接发出／签回日 | sendDay / backDay | handover_send_date / handover_return_date：date | 飞书毫秒、SQL date；真实日期合法性与失败顺序留待适配器批次 |
| T06 德天不用交接、小雨保函、异常反馈 | noHandover / rain / issue | detian_no_handover / light_rain_bond：bool；ship_unload_factor_abnormal_feedback：text | 有映射；独立复选框在 T06 说明中有来源，不算自创 |
| T07 航次、租船方式、海运合同号 | id 参数 / way / contract | voyage：jsonb；charter_type / sea_shipping_contract_no：text | 有映射，租船方式校验 CFR/FOB |
| T08 规则编号、装卸港、适用业务类型 | id / load / disch / biz：string[] | rule_no：bigint；load_port / discharge_port：text；applicable_business_type：text[] | 有映射 |
| T08 吨级档 | tier（读取） | tonnage_grade：text | 新增忽略输入、修改白名单拒绝；吨级口径待确认，不将全部相关限制直接定为缺陷 |
| T08 经验航程及上限 | exp / expMax | experience_voyage_day / experience_voyage_max_day：numeric | 有映射 |
| T08 经验值维护人 | 缺 | experience_maintainer：user_profile | 领域/API/写入映射缺口；不能以平台 created_by 自动替代此业务字段 |
| T08 样本数、统计 P50/P80 | samples / p50 / p80 | sample_count：bigint；stat_p50_day / stat_p80_day：numeric | 有映射，统计写入路径存在 |
| T08 采用口径、生效 P50/P80 | basis / effP50 / effP80（buildRule） | adopt_caliber / effective_voyage_p50_day / effective_voyage_p80_day：text | 公式镜像 text 与应用数值重算属于映射设计，不能直接判类型错误 |
| T08 最近重算时间 | 无领域/共享输出；统计任务内部写入 | recent_recalc_time：timestamptz | 存储有写路径，API 输出遗漏；无变化时是否需要更新时间待明确 |
| T08 状态 | status | app_status：text | 有映射 |

## 5. 状态与时间节点逐条核对

### 5.1 九条判定的静态覆盖

依据 [status-rules.md](C:/Users/董金/WorkBuddy/SSPS/docs/schema/status-rules.md)，实现 [status.ts:13](C:/Users/董金/ssps-miaoda/server/domain/status.ts:13)。以下场景均省略更高优先级节点，或明确给出冲突节点。

| 顺序 | 构造输入 | 代码结果 | 本批结论 |
| --- | --- | --- | --- |
| 1 | flags 含取消，同时有卸港离港 | 已结束（取消） | 取消优先级正确；写 T04 会转换为“已结束”并保留取消标记 |
| 2 | 有卸港离港；或成品船有卸港靠泊 | 已结束 | 实现覆盖；成品分支仍是规格待确认假设 |
| 3 | 非成品船有卸港靠泊，无离港 | 卸港卸货 | 实现覆盖 |
| 4 | 有实际抵卸港，无靠泊 | 卸港等泊 | 实现覆盖 |
| 5 | 有实际离装港，无抵卸港 | 航行中 | 实现覆盖；有无 ETA 的条件必填另需核查 |
| 6a | 任意类型有装港靠泊 | 装港装货 | 实现覆盖 |
| 6b | 大宗船仅有实际抵装港 | 装港装货 | 代码按业务类型代替“本航次不记录靠泊”条件；open-questions:49 已明确该简化待确认，暂不判缺陷 |
| 7 | 成品/物资船仅有实际抵装港 | 装港等泊 | 实现覆盖；大宗等待靠泊情形受 6b 的规格歧义影响 |
| 8 | 已关联船舶、没有实际节点 | 未到装港 | 推导覆盖，但创建持久化失败，DM-004 |
| 9 | 无船舶、无实际节点 | 待宣船 | 推导覆盖，但创建持久化失败，DM-004 |

`STATUS` 和共享 `STATUSES` 都是八个值：待宣船、未到装港、装港等泊、装港装货、航行中、卸港等泊、卸港卸货、已结束。`已结束（取消）` 为显示派生值，不是新增的飞书单选项；异常标记仍为取消、延期、移泊、改港。不能将合法的人工“异常标记”与已移除的“风险标记体系”混为一谈。

### 5.2 相邻节点、缺失与日期相等

- `validateChain` 先过滤未填节点，再比较已填节点中的相邻项。因此中间靠泊节点为空时，仍比较抵港与离港，不会因为原数组相邻项为空就完全跳过。
- 本次修改的端点产生倒置：返回 errors；历史已有倒置且仅改备注：返回 warnings。拒绝分支未写 D08 是 DM-009。
- `11-06 10:00 → 11-06 10:00` 不算倒置；`11-06 14:30 → 11-06 09:00` 算倒置；任一为 `11-06 00:00` 时按纯日期处理，不算同日倒置，符合当前迁移规则，但无法区分“真实午夜”与“迁移占位午夜”。这是模型表达边界，非本批确认缺陷。
- 有实际抵卸港但缺实际离装港：产生 `MISSING_NODE` 警告，正常创建/基础字段更新成功后写 D08。取消标记会排除此警告。所有其他保存入口是否必须重复扫描，留待全路径检查。
- 在港区间比较代码采用日期截断（compat.ts:46）；DM-002 说明“只比较日期”并不能保证日期来自正确时区。

### 5.3 是否能绕过状态推导

- 普通 HTTP 基础字段 PATCH 的白名单没有 `status`，显式传状态会被拒绝；不能据 `Voyage.status?: string` 就认定外部用户可直接写状态。
- 基础字段/节点变更会合并旧值、校验并推导，再把状态交给仓储；取消标记接口也会重推导。
- 新建只在响应中重推导，见 DM-004。ETA、货物、结算等独立路径不会统一重写 T04 状态；它们本身未直接改变节点，不据此独立报错。
- `VoyageStorePort.update(Partial<Voyage>)` 和两套仓储没有自行推导的防线，内部调用可直接提供任意状态。已有 HTTP 调用方受控，但未穷尽导入、迁移、所有任务和未来调用方；该事实不等于已证明外部越权路径。
- 真正的表格端只读权限、直连数据库角色和 RLS 是否允许旁路，尚未核验。

## 6. 枚举与规格冲突台账

### 6.1 已定位的状态及相关固定值

| 对象 | 代码/SQL 取值 | 本批判断 |
| --- | --- | --- |
| 航次状态、取消附注 | 上述八状态及派生附注 | 与主规格一致，持久化另见 DM-004 |
| 业务类型 | 大宗采购船、成品销售船、物资备件船 | domain/shared 一致 |
| 主数据状态 | 启用、停用 | 有规格来源 |
| 审核状态 | 规格待审核、已审核；代码类型是 string 且新建默认空 | 强校验及草稿策略待查，不把 string 类型本身当成已写入非法枚举 |
| ETA 依据 | 船讯网、船代、电话 | domain/shared/001 SQL 一致；船讯网作为人工依据不等于实现了二期自动接口 |
| D03/D11 SQL 批次状态 | 导入中、成功、部分失败、失败 | 导入中是 SQL 额外生命周期值，是否实际可达待核查 |
| 批次 port 状态 | BerthBatch：成功/部分失败/失败；InventoryBatch：成功/失败 | 与 SQL 值域不同，尚未证明有效数据会落入不支持的状态 |
| D04 行分类 | active、history、anomaly | 技术分类，需对应有效/历史/异常规则，不能当作新增航次状态 |
| D05/D06 路径、可信度 | 近/远/混合；正常/低可信 | 有规格来源；混合只出现在运行层 |
| D06 方案 | A、B | SQL 和 shared 均只定义 A/B |
| D06 库存状态 | safe、tight、out | 应与安全/吃紧/断料一一对应；转换与空值传播未完成核查 |
| D08 问题状态 | 待处理、处理中、已关闭 | SQL 与内存实现相同；open-questions 仍有未勾选条目，需统一文档 |
| D09 日志结果 | 成功、部分失败、失败 | SQL 与 port 相同 |
| D10 队列状态、操作 | pending、written、done、failed；create/update/delete | 技术执行状态，不是业务船舶状态；全生命周期留待补偿批次 |

### 6.2 不能自行裁定的文档差异

1. **镜像说明里的枚举与业务规格冲突。** [mirror-columns.md:126](C:/Users/董金/WorkBuddy/SSPS/docs/schema/mirror-columns.md:126) 把状态举例为“在途、靠泊中、已离港”，第 127 行把异常标记写成单选“正常/时序倒置/滞期风险”，第 135、138 行的部门、来源也与 T04 不同。当前主代码采用 T04/status-rules 的口径；不应为迁就旧镜像说明改成这些值。建议以经确认的 T04 和实际字段元数据重生成镜像说明。
2. **多选类型说明不准确。** mirror-columns.md:18 统称 text；生成 schema 的 abnormal_mark、applicable_business_type 实际声明为 text[]，代码按数组处理。建议分别记录单选 text、多选 text[]，并在真实库只读元数据检查时确认；本次未连接真实库。
3. **泊位类别必填与暂时留空冲突。** T02 第 8 行写必填；[open-questions.md:133](C:/Users/董金/WorkBuddy/SSPS/docs/open-questions.md:133) 明确暂时留空。建议将字段规格改为当前阶段可空；本批不将空类别单列为缺陷。
4. **状态第 6 条简化与成品结束条件未确认。** open-questions.md:49 与 status-rules.md:17 已明确这两处边界；建议分别明确是否需要“本航次不记录装港靠泊”的可表达条件，以及成品结束节点。
5. **吨级档边界和航程规则粒度未统一。** overview 写装港×卸港×吨级档；代码按航线×业务类型查重，吨级不能维护；open-questions.md:6/34 仍待确认边界。建议先确认一期是否启用分吨级航程，再处理字段与规则粒度，不能擅自采用代码中的 5/10 万吨阈值。
6. **镜像只读与主动回写并存。** D-app-db 和 mirror-columns 称镜像只读；handoff §4.3 与实际适配器采用写飞书后主动回写以实现读己所写。建议明确“禁止业务端直接把镜像当主数据”与“允许受控回写”的边界，并补充 streaming 冲突解决规则；下一批按真实失败时序核查。
7. **最终目的港类型不一致。** T04 定义为关联 T01；mirror-columns.md 的 final_destination 写文本，代码按关联数组写飞书、按文本记录 ID 存镜像。需区分 Base 类型与镜像存储表示，不能只按 text 判错。

## 7. 本地验证状态与测试盲区

没有执行 `npm test`、类型检查、ESLint 或 smoke，因此不报告测试通过或失败。现有测试文件只作为代码证据读取。

- 现有字段一致性测试只验证“F 中的字段在 base-plan 中存在”，没有反向验证“所有需维护的规格字段都在 F 中”，不能发现 DM-003 一类遗漏（drizzle-voyage.spec.ts:19）。
- 现有新建仓储测试将状态缺失写成预期，见 DM-004。
- 时间测试使用了部分日间 UTC 样例；本批发现需要补充当地凌晨、UTC 前一天、日期相等和不存在日期的场景，但没有新增测试文件。
- `npm run smoke` 在当前 package.json:31 会先调用 `build:server`；第 18 行构建并删除构建目录中的测试产物，不满足代码仓全程不写文件的约束，故不执行。其余命令若后续需要运行，仍须先检查初始化、环境加载、外联和文件副作用。

## 8. 剩余清单（未完成，不作通过结论）

1. **字段与迁移**：T09a/T09b 全部列、T10 发布、迁移清洗第 1–12 条的逐项映射；核查原记录键、储运 1–3、维护人、条件必填和未覆盖枚举。D01–D12 的表/字段/基础类型及主要存储映射已补充到第 11 节；完整业务调用闭包仍随适配器批次继续。
2. **SQL 与 RLS**：静态覆盖见第 12 节；尚缺真实平台的表授权、完整策略、RLS 开关、角色继承、审计触发器及查询计划证据。本次未访问真实库，不能作部署验收结论。
3. **适配器完整一致性**：逐 port 的排序、空值、分页、大小写、删除、事务；多表写入失败残留、两人同时编辑、用户标识转换。本文只证明了部分字段行为差异。
4. **飞书与 streaming**：批量/分页 500 条边界、同 Base 串行作用域、限流/网络失败、幂等重放、平台同步回写覆盖；不将云空间文件定时拉取误判为禁止的 Base 镜像轮询。
5. **无数据完整链路**：D06 cmr_min、序列化、远期 count、前端灰色斜线和非数值处理；本批只读取了用于验证日期/泊位影响的容量片段，未作全面结论。
6. **状态旁路**：导入、迁移、任务、直接仓储和数据库/表格权限路径的完整调用闭包；缺节点提醒是否真正送达业务员。
7. **安全与数据文件检查**：未进行全仓/历史秘密扫描或被忽略原始 Excel 清查，不能据本文声称没有泄密或真实数据文件。

下一批从逐 port 的适配器差异、飞书写队列与 streaming 边界开始，保留已有发现编号。若后续证据推翻某项，会注明撤回或调整原因。第 2 批完成情况见第 13 节。

## 附录 A：生成 schema 的表／字段／类型清单

以下由代码中的 `pgTable` 声明只读提取，包含 8 张镜像表和 12 张自有表，共 370 列；不是实际数据库元数据，也不代表全部业务路径审计完成。`customTimestamptz` 展示为 timestamptz，`userProfile` 展示为 user_profile。第 2 批已核对 001+004 与生成 schema：12 张自有表共 181 列，列名集合一致，基础 SQL 类型未发现差异；这不包括约束、索引、触发器与实际部署状态的一致性保证。

| 表名（代码位置） | 列数（含审计列） | SQL 列名：类型 |
| --- | --- | --- |
| [announcement](C:/Users/董金/ssps-miaoda/server/database/schema.ts:496) | 11 | `id`: uuid；`voyage_no`: text；`plan_id`: uuid；`content`: jsonb；`text`: text；`generated_by`: text；`generated_at`: timestamptz；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [berth_plan_batch](C:/Users/董金/ssps-miaoda/server/database/schema.ts:695) | 19 | `id`: uuid；`batch_no`: text；`plan_date`: date；`source`: text；`file_name`: text；`drive_file_token`: text；`total_rows`: integer；`active_rows`: integer；`history_rows`: integer；`anomaly_rows`: integer；`cover_to`: date；`validation`: text；`status`: text；`is_current`: bool；`imported_by`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [berth_plan_row](C:/Users/董金/ssps-miaoda/server/database/schema.ts:655) | 23 | `id`: uuid；`batch_id`: uuid；`line_no`: integer；`raw`: jsonb；`berth_raw`: text；`berth`: text；`in_pool`: bool；`eta`: timestamptz；`etb`: timestamptz；`etd`: timestamptz；`vessel`: text；`ship_type`: text；`cargo`: text；`tons`: numeric；`owner_unit`: text；`row_status`: text；`match_voyage`: text；`issue_code`: text；`issue_text`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [data_issue](C:/Users/董金/ssps-miaoda/server/database/schema.ts:473) | 13 | `id`: uuid；`object_ref`: text；`issue_type`: text；`field`: text；`note`: text；`owner`: text；`status`: text；`closed_by`: text；`closed_at`: timestamptz；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [eta_revision](C:/Users/董金/ssps-miaoda/server/database/schema.ts:746) | 12 | `id`: uuid；`voyage_no`: text；`node_name`: text；`old_value`: timestamptz；`new_value`: timestamptz；`basis`: text；`revised_by`: text；`revised_at`: timestamptz；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [inventory_batch](C:/Users/董金/ssps-miaoda/server/database/schema.ts:625) | 17 | `id`: uuid；`batch_no`: text；`import_date`: date；`source`: text；`file_name`: text；`drive_file_token`: text；`total_rows`: integer；`error_rows`: integer；`validation`: text；`status`: text；`is_current`: bool；`imported_by`: text；`items_summary`: jsonb；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [inventory_row](C:/Users/董金/ssps-miaoda/server/database/schema.ts:597) | 14 | `id`: uuid；`batch_id`: uuid；`stock_date`: date；`item_name`: text；`item_type`: text；`daily_use`: numeric；`stock`: numeric；`avail_days`: numeric；`is_error`: bool；`raw_stock`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [m_berth](C:/Users/董金/ssps-miaoda/server/database/schema.ts:376) | 14 | `id`: uuid；`base_record_id`: varchar；`berth_code`: text；`wharf`: text；`capacity_tonnage`: bigint；`berth_category`: text；`status`: text；`basis_version`: text；`effective_date`: date；`remark`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [m_bulk_settle](C:/Users/董金/ssps-miaoda/server/database/schema.ts:175) | 38 | `id`: uuid；`base_record_id`: varchar；`settlement_no`: bigint；`voyage`: jsonb；`discharge_clause`: text；`discharge_rate_ton_per_day`: bigint；`allowable_discharge_days`: numeric；`turn_time_hour`: bigint；`demurrage_rate`: numeric；`currency`: text；`demurrage_despatch_usd`: numeric；`discharge_port_draft_ton`: numeric；`water_gauge_1_min`: bigint；`water_gauge_2_min`: bigint；`water_gauge_3_min`: bigint；`exchange_rate`: numeric；`port_fee_unit_price`: numeric；`port_fee_usd`: numeric；`handling_fee_usd`: numeric；`trucking_volume_ton`: numeric；`pipe_conveyor_volume_ton`: numeric；`weighbridge_weight_ton`: numeric；`other_dept_volume_ton`: numeric；`transfer_car_count`: bigint；`x1_belt_conveyor_count`: bigint；`cross_month_ship_road_ton`: numeric；`cross_month_ship_belt_ton`: numeric；`3_belt_conveyor_idle_hour`: numeric；`4_belt_conveyor_idle_hour`: numeric；`handover_send_date`: date；`handover_return_date`: date；`detian_no_handover`: bool；`light_rain_bond`: bool；`ship_unload_factor_abnormal_feedback`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [m_cargo](C:/Users/董金/ssps-miaoda/server/database/schema.ts:226) | 20 | `id`: uuid；`base_record_id`: varchar；`app_detail_id`: bigint；`voyage`: jsonb；`contract_no`: text；`ea_purchase_order_no`: text；`material_category`: text；`goods_name`: text；`material_alias`: text；`user_unit`: text；`supplier_customer`: text；`estimated_shipping_weight_ton`: numeric；`port_loading_weight_ton`: numeric；`dry_base_conversion_ton`: numeric；`over_short_shipment_percent`: numeric；`contract_executor`: user_profile；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [m_port](C:/Users/董金/ssps-miaoda/server/database/schema.ts:400) | 15 | `id`: uuid；`base_record_id`: varchar；`port_code`: text；`chinese_name`: text；`english_standard_name`: text；`alias`: text；`country`: text；`region`: text；`nature`: text；`is_local_port`: bool；`status`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [m_route_rule](C:/Users/董金/ssps-miaoda/server/database/schema.ts:120) | 22 | `id`: uuid；`base_record_id`: varchar；`rule_no`: bigint；`load_port`: text；`discharge_port`: text；`applicable_business_type`: text[]；`tonnage_grade`: text；`experience_voyage_day`: numeric；`experience_voyage_max_day`: numeric；`experience_maintainer`: user_profile；`sample_count`: bigint；`stat_p50_day`: numeric；`stat_p80_day`: numeric；`adopt_caliber`: text；`effective_voyage_p50_day`: text；`effective_voyage_p80_day`: text；`recent_recalc_time`: timestamptz；`app_status`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [m_sales_ext](C:/Users/董金/ssps-miaoda/server/database/schema.ts:152) | 10 | `id`: uuid；`base_record_id`: varchar；`extension_no`: bigint；`voyage`: jsonb；`charter_type`: text；`sea_shipping_contract_no`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [m_vessel](C:/Users/董金/ssps-miaoda/server/database/schema.ts:351) | 15 | `id`: uuid；`base_record_id`: varchar；`ship_no`: bigint；`app_mmsi`: text；`app_imo`: text；`standard_ship_name`: text；`ship_name_alias`: text；`ship_type`: text；`dwt`: bigint；`ship_length_m`: numeric；`tonnage_class`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [m_voyage](C:/Users/董金/ssps-miaoda/server/database/schema.ts:259) | 55 | `id`: uuid；`base_record_id`: varchar；`voyage_no_1`: bigint；`vessel_name`: jsonb；`total_cargo_ton`: jsonb；`load_port_local`: jsonb；`mmsi`: jsonb；`business_type`: text；`business_attribute`: text；`voyage_no`: text；`vessel`: text；`carrier`: text；`vessel_voyage_no`: text；`load_port`: text；`discharge_port`: text；`second_discharge_port`: text；`final_destination`: text；`local_side`: text；`laycan_start`: timestamptz；`laycan_end`: timestamptz；`eta_load_port`: timestamptz；`ata_load_port`: timestamptz；`load_port_berth`: timestamptz；`plan_depart_load_port`: timestamptz；`actual_depart_load_port`: timestamptz；`plan_arrive_discharge_window_start`: timestamptz；`plan_arrive_discharge_window_end`: timestamptz；`current_eta_discharge_port`: timestamptz；`actual_arrive_discharge_port`: timestamptz；`discharge_port_berth`: timestamptz；`discharge_port_departure`: timestamptz；`vessel_status`: text；`abnormal_mark`: text[]；`loading_port_overdue`: text；`actual_voyage_days`: text；`berth_wait_days`: text；`port_operation_days`: text；`planned_berth`: jsonb；`actual_berth`: jsonb；`responsible_salesman`: user_profile；`department`: text；`key_attention`: bool；`audit_status`: text；`data_source`: text；`app_record_key`: text；`history_readonly`: bool；`remark`: text；`goods_detail`: jsonb；`shared_ship`: text；`bulk_unload_settlement`: jsonb；`product_sales_extend`: jsonb；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [milestone_log](C:/Users/董金/ssps-miaoda/server/database/schema.ts:725) | 12 | `id`: uuid；`voyage_no`: text；`field`: text；`old_value`: text；`new_value`: text；`masked`: bool；`changed_by`: text；`changed_at`: timestamptz；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [prediction_plan](C:/Users/董金/ssps-miaoda/server/database/schema.ts:523) | 19 | `id`: uuid；`run_id`: uuid；`label`: text；`depart_date`: date；`window_from`: date；`window_to`: date；`path`: text；`cmr_min`: numeric；`max_ships`: integer；`trust`: text；`stock_state`: text；`stockout_date`: date；`provenance`: jsonb；`adopted`: bool；`adopted_voyage`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [prediction_run](C:/Users/董金/ssps-miaoda/server/database/schema.ts:559) | 16 | `id`: uuid；`run_no`: text；`input`: jsonb；`item_name`: text；`inventory_batch_id`: uuid；`berth_plan_batch_id`: uuid；`run_mode`: text；`route_rule_id`: text；`rule_basis`: text；`borrowed_rule`: bool；`run_by`: text；`run_at`: timestamptz；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [sync_log](C:/Users/董金/ssps-miaoda/server/database/schema.ts:455) | 11 | `id`: uuid；`task`: text；`started_at`: timestamptz；`finished_at`: timestamptz；`rows_affected`: integer；`result`: text；`error`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |
| [write_queue](C:/Users/董金/ssps-miaoda/server/database/schema.ts:425) | 14 | `id`: uuid；`idempotency_key`: text；`kind`: text；`target_table`: text；`operation`: text；`payload`: jsonb；`status`: text；`result`: jsonb；`attempts`: integer；`last_error`: text；`_created_at`: timestamptz；`_created_by`: user_profile；`_updated_at`: timestamptz；`_updated_by`: user_profile |

## 9. 第 2 批新增缺陷（基线 04825bd）

以下均为静态推演，未执行请求、SQL 或测试。UUID、人员名、日期、物料与数值均为审计构造。

### DM-010 / P0 / 缺陷：数据质量问题的短 ID 碰撞可绕过逐条责任人授权

- **代码事实**：[drizzle-voyage-store.ts:290](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:290) 把完整 UUID 截为前 8 位，作为对外 DQ ID；第 294 行按“UUID 文本 LIKE 前缀%”更新所有匹配行。[voyage.service.ts:377](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts:377) 只对列表中第一条同 ID 问题检查责任人，第 381 行调用上述更新；第 368–372 行“开始处理”有相同问题。
- **冲突依据**：[permission-matrix.md:29](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/permission-matrix.md:29)：只有责任人本人或系统管理员可开始处理/关闭，其他人 403。D08 采用 UUID 主键，SQL 未保证 UUID 前 8 位唯一。
- **复现场景**：在隔离测试库构造两条待处理问题，完整 ID 分别为 1234abcd-0000-4000-8000-000000000001、1234abcd-0000-4000-8000-000000000002，对象不同，责任人分别为“审计甲”“审计乙”；甲的创建时间较新，列表排序后先出现。甲以普通业务员身份提交 PATCH /api/data-issues/DQ-1234abcd，正文为 {"status":"已关闭"}。路由见 [voyage.controller.ts:41](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.controller.ts:41)。
- **实际行为**：授权检查命中甲的问题并通过；UPDATE 同时命中两行，两行都变为已关闭，关闭人都记为甲。
- **期望行为**：甲只能关闭自己的问题；乙的问题保持待处理。单个资源标识必须唯一定位同一条被授权记录。
- **边界**：不声称可由 HTTP 任意指定 UUID，也不依赖 SQL 注入；碰撞条件可在库层构造，随机 UUID 的截断空间亦不保证唯一。建议保留完整主键，并将授权对象约束纳入更新条件。

### DM-011 / P0 / 缺陷：库存导入把合法零日耗改为非零，持久化后已不是原始值

- **代码事实**：[inventory.ts:25](C:/Users/董金/ssps-miaoda/server/importers/inventory.ts:25) 能解析并保留 dl=0，但第 29–30 行用 truthy 判断和 x.dl || last 替换零值；没有非零样本时用 1。第 33 行以替换值输出日耗并估算天数。[drizzle-import-store.ts:68](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:68) 将该序列写入 D12.daily_use。引擎 [stock.ts:18](C:/Users/董金/ssps-miaoda/server/engine/stock.ts:18) 也再次把零日耗当作缺失。
- **冲突依据**：[D-app-db.md:24](C:/Users/董金/WorkBuddy/SSPS/docs/schema/D-app-db.md:24) 定义 D12 为来源表的逐日明细，日耗是来源字段；没有授权把有效数字 0 改成上一天日耗或 1。锁定规则 12 禁止自行补业务口径。
- **复现场景**：设导入时今天为 2026-11-06，同一“审计物料”两行：11 月 5 日库存 100、日耗 10；11 月 6 日库存 100、日耗 0；可用天数均留空，其他必要表头齐全。
- **实际行为**：11 月 6 日序列的日耗变成 10，D12.daily_use 存 10；当前摘要 daily=10、days=10、daysEstimated=true。只有一行“库存 100、日耗 0”的输入则得到日耗 1、估算 100 天。
- **期望行为**：D12 与读回摘要的日耗保留 0；零日耗时如何展示可用天数需明确业务规则，不能先制造非零日耗再输出有限天数。本项不自行规定显示“无限”还是“无数据”。
- **影响边界**：存储值和摘要被改写可确定；不把所有断料日都判错，因为断料日还直接取库存序列首次 ≤0 的点。建议将缺失与零分开，另行确认缺失日耗的处理。

### DM-012 / P0 / 缺陷：D12 的逐日可用天数在导入时丢失，仅保留一个摘要值

- **代码事实**：[inventory.ts:25](C:/Users/董金/ssps-miaoda/server/importers/inventory.ts:25) 读取每行 av，第 30 行构造的 series 仅有日期/库存/日耗，第 33 行只保留选中日期的摘要 days；[drizzle-import-store.ts:68](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:68) 对全部有效明细显式写 availDays:null，第 70 行对错误库存行同样写 null。D12 没有保存整行 raw 的替代列。
- **冲突依据**：[D-app-db.md:24](C:/Users/董金/WorkBuddy/SSPS/docs/schema/D-app-db.md:24) 要求逐日明细包含可用天数；[001-ssps-core.sql:226](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:226) 已定义该 numeric 列。
- **复现场景**：今天为 2026-11-06，同一“审计物料”两行：11 月 6 日库存 100、日耗 10、可用天数 10；11 月 7 日库存 90、日耗 10、可用天数 9。
- **实际行为**：D12 两行的 avail_days 都是 NULL；D11.items_summary 仅留今天的 days=10，明天的来源值 9 在导入结果及落库中都没有保留。
- **期望行为**：D12 分别保留 10 和 9，NULL 只表示来源值缺失/无有效数字。即使可按库存和日耗重算，也不能替代需要留存的来源字段。
- **边界**：当前首页选中日期摘要并非总会错误。P0 按用户“数据损坏/丢失”定义归级，指明细不能从应用库完整还原，不声称原 Excel 被改动或删除。

## 10. 第 2 批风险与证据边界

### RM-002 / P0 / 风险（已有决策接受）：authenticated 全表访问使应用层成为唯一业务权限边界

- **代码事实**：[001-ssps-core.sql:34](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:34) 及其他 11 张自有表均有 FOR ALL TO authenticated USING (true) WITH CHECK (true)；同时存在“修改本人数据”，但均为 permissive，不会组成 AND 限制。多个 permissive policy 按 OR 合并；能否访问仍先受表级授权约束，见 [PostgreSQL 官方 RLS 说明](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)。
- **规格边界**：[open-questions.md:138](C:/Users/董金/WorkBuddy/SSPS/docs/open-questions.md:138) 已接受“登录用户之间不隔离，金额与权限靠应用层”；因此不作为擅自偏离规格的缺陷。业务保护要求见 [permission-matrix.md:28](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/permission-matrix.md:28)–30：金额隐藏、责任人修改、仅管理员看运行日志。
- **可复现条件**：仅装有这些策略的隔离库，平台另授予 authenticated 相关表 SELECT/UPDATE 权限，且普通用户存在绕过 NestJS 的数据库访问通道；以该角色更新另一责任人的 data_issue，或读取 write_queue.payload。
- **实际输出 vs 期望**：脚本中的 RLS 不拦截其他责任人的行、不隐藏载荷内的金额；业务期望仍是仅允许授权操作及字段。风险成立依赖“普通用户能走直接通道”，不能仅由 USING(true) 推断匿名或浏览器已能读取。
- **缺少证据**：真实 GRANT、角色继承、平台数据 API 可达性、额外 restrictive policy、连接角色。建议证明应用层不可绕过；若存在普通用户可达的直接通道，再升级为已确认越权。受控后端 service_role 放行本身不算越权。

### RM-003 / P1 / 风险：审计更新列依赖仓库未证明的平台代理机制

- **代码事实**：001 每表的 _updated_at/_updated_by 只有 INSERT 默认值，例如 [001-ssps-core.sql:388](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:388)；001–004 没有创建审计 UPDATE trigger。[drizzle-voyage-store.ts:294](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:294) 改 D08 状态不改两列，[drizzle-prediction-store.ts:55](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-prediction-store.ts:55) 采纳方案亦然。[outbox-store.ts:14](C:/Users/董金/ssps-miaoda/server/lark/outbox-store.ts:14) 显式改了 _updated_at，仍未改 _updated_by。
- **冲突依据**：用户提供 AGENTS.md 的“数据库规范”将两列定义为更新时间/更新人；[D-app-db.md:3](C:/Users/董金/WorkBuddy/SSPS/docs/schema/D-app-db.md:3) 要求平台审计规范。生成 schema 注释称 auto-filled，但注释不是运行机制证明。
- **复现场景**：只有 001–004 与必要平台类型/角色、没有额外审计触发器或 ORM 拦截器的隔离库；甲在 t0 创建问题，乙作为系统管理员在 t1 关闭。
- **实际输出 vs 期望**：status/closed_by 更新，_updated_at 仍 t0、_updated_by 仍创建时值；应反映 t1/乙。后台任务不提供 app.user_id 时，人员审计默认值还可能为空。
- **缺少证据**：平台触发器、注入数据库实例时的事务用户身份设置、后台任务的审计主体。真实平台若已自动处理，此风险可关闭；目前不能断言真实库审计一定失效。

## 11. D01–D12：规格字段 ↔ 代码字段补充表

基础字段与类型完整清单见附录 A。下表按 [D-app-db.md:13](C:/Users/董金/WorkBuddy/SSPS/docs/schema/D-app-db.md:13)–24 的全部关键字段分组对应。同组内按顺序映射。UUID 主键、审计列和索引辅助列不自动视为自创业务字段；规格未给物理类型的项目，不凭假定制造 text/numeric 不一致。

| 规格字段 | 代码/SQL 字段与类型 | 存储链路及结论 |
| --- | --- | --- |
| D01 航次编号、节点名、旧值、新值 | voyage_no/node_name:text；old_value/new_value:timestamptz | [仓储:281](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:281) 可读写；旧值可 NULL，新值必填 |
| D01 依据、修改人、时间 | basis/revised_by:text；revised_at:timestamptz | [SQL:13](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:13) 依据限定船讯网/船代/电话；时间有 DM-005 的二次偏移 |
| D02 航次编号、字段、旧值、新值、修改人、时间 | voyage_no/field/old_value/new_value/changed_by:text；changed_at:timestamptz | [仓储:285](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:285)；另有 masked:boolean，完整金额隐藏路径待下一批 |
| D03 批次号、计划日期、来源、文件名、文件标识 | batch_no:text UNIQUE；plan_date:date；source/file_name/drive_file_token:text | [SQL:75](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:75)、[仓储:26](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:26)；文件标识有非空部分唯一索引 |
| D03 行数、校验结果、状态 | total_rows/active_rows/history_rows/anomaly_rows:integer；validation/status:text | 仓储第 26 行；SQL 多“导入中”枚举，规格只列结果态，待补生命周期说明 |
| D03 当前批次、覆盖日期、导入人 | is_current:boolean；cover_to:date；imported_by:text | [仓储:20](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:20)；004 增补展示用导入人，属于实现元数据 |
| D04 批次号、全部 IMIP 原始列 | batch_id:uuid→D03；line_no:integer；raw:jsonb | [仓储:27](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:27) 逐原始行保存 raw；码头/船长可从 raw 还原，未单列不能据此判丢失 |
| D04 规范泊位、是否德信池、匹配航次、解析告警 | berth:text；in_pool:boolean；match_voyage/issue_code/issue_text:text | 同上；in_pool 指泊位是否在池内，不是已删除的“船是否德信” |
| D04 解析后的节点、货物、行分类 | eta/etb/etd:timestamptz；tons:numeric；vessel/ship_type/cargo/owner_unit/berth_raw/row_status:text | [SQL:122](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:122)；active/history/anomaly 由 [imipPlan.ts:27](C:/Users/董金/ssps-miaoda/server/importers/imipPlan.ts:27) 推导，不是航次状态 |
| D05 输入、物料、库存/靠船计划批次 | input:jsonb；item_name:text；inventory_batch_id/berth_plan_batch_id:uuid | [仓储:23](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-prediction-store.ts:23) 先按批次号解析 FK；不存在的批次号变 NULL，真实入口可达性待快照一致性审计 |
| D05 整体口径、航程规则口径 | run_mode:text 近/远/混合；route_rule_id/rule_basis:text；borrowed_rule:boolean | SQL/转换映射一致；规则依据限定统计值/经验值 |
| D05 运行人、时间、运行编号 | run_by:text；run_at:timestamptz；run_no:text UNIQUE | [仓储:28](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-prediction-store.ts:28) 存当前时刻；第 47 行 get().run 不返回 run_at，详情另有 provenance.at，暂不据此判页面丢时间 |
| D06 运行编号、方案、推荐日、窗口、路径 | run_id:uuid→D05；label:text A/B；depart_date/window_from/window_to:date；path:text 近/远 | [SQL:297](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:297)；有窗口倒置 CHECK；成品推荐发船日可 NULL；仅 A/B |
| D06 CMR_min 或重叠船数 | cmr_min:numeric NULL；max_ships:integer NULL | [仓储:32](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-prediction-store.ts:32) 用 ==null 分支；[db.ts:5](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/db.ts:5) 读回 NULL 保留 NULL，本层未补 0 |
| D06 库存状态、断料日、可信度、S1 | stock_state:text safe/tight/out；stockout_date:date；trust:text 正常/低可信；provenance:jsonb | [SQL:307](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:307)；英文状态为安全/吃紧/断料的内部编码；端到端显示待审 |
| D06 是否采纳、采纳航次 | adopted:boolean；adopted_voyage:text | 仓储第 55 行无条件覆盖，并发语义留待下一批 |
| D07 航次或方案、文案、生成人、时间 | voyage_no:text；plan_id:uuid；content:jsonb；text/generated_by:text；generated_at:timestamptz | [SQL:346](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:346) 要求至少关联其一；[仓储:58](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-prediction-store.ts:58) 保存方案文案，航次文案入口待审 |
| D08 对象、类型、责任人、状态 | object_ref/issue_type/owner/status:text；辅助 field/note/closed_by:text、closed_at:timestamptz | [仓储:289](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:289)；未关闭问题按对象+类型+字段唯一；短 ID 有 DM-010 |
| D09 任务、起止、条数、结果、错误 | task:text；started_at/finished_at:timestamptz；rows_affected:integer；result/error:text | [仓储:10](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-sync-log.ts:10)；结果限定成功/部分失败/失败。错误截断至 500 字不证明脱敏，来源待审 |
| D10 目标表、操作、载荷、次数、状态 | target_table/operation:text；payload:jsonb；attempts:integer；status:text | [outbox-store.ts:13](C:/Users/董金/ssps-miaoda/server/lark/outbox-store.ts:13)；create/update/delete，pending/written/done/failed 为队列协议，不等同航次状态 |
| D10 幂等与补偿元数据 | idempotency_key:text UNIQUE；kind:text；result:jsonb；last_error:text | 同上；有队列表并不证明跨实例串行或故障幂等 |
| D11 批次号、日期、来源、文件、行数 | batch_no:text UNIQUE；import_date:date；source/file_name:text；total_rows:integer | [仓储:66](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:66)；另有 drive_file_token:text，缺唯一约束 |
| D11 校验结果含错误行数、状态 | validation:text；error_rows:integer；status:text | 保存 error_rows，不写 validation；InventoryBatch port 亦未包含 validation。规格是否另需独立文本结果尚不明确，标待澄清 |
| D11 当前批次、导入人、摘要 | is_current:boolean；imported_by:text；items_summary:jsonb | 004 增补列与 schema 一致；单日摘要不能代替 D12 全日期值 |
| D12 批次、日期、品名、类型 | batch_id:uuid→D11；stock_date:date；item_name/item_type:text | [仓储:68](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:68)；解析器按品名分组，类型取该品名首行 |
| D12 日耗、库存、可用天数 | daily_use/stock/avail_days:numeric | 零日耗被改写 DM-011，逐日可用天数丢失 DM-012；SQL 列存在不代表链路完整 |
| D12 是否错误值、原错误 | is_error:boolean；raw_stock:text | [inventory.ts:24](C:/Users/董金/ssps-miaoda/server/importers/inventory.ts:24) 按库存有效性分行；库存=0、可用天数为错误文本仍有效，符合规格；错误行日耗/可用天数未保留 |

D03/D11 的“导入中”、D08 的“待处理/处理中/已关闭”、D10 的英文状态在代码有定义；D08 有权限文档对应，D10 是技术状态机，D03/D11 的过程态需补规格。不能将这些与 T04“不得手工写航次状态”混为同一规则。

## 12. SQL 与 RLS 核查

### 12.1 逐表覆盖

自有表 4 个审计列均在 001 中；镜像表 4 列均出现在生成 schema。列存在不等于自动正确更新，见 RM-003。

自有表每表相同的 4 策略是：service_role 放行、authenticated 全部修改、authenticated 全部查看、authenticated 创建人条件修改。放行策略使用 USING(true)。镜像由 streaming 平台建表，仓库没有其完整策略；003 仅 ALTER 指定读策略，不能证明其余策略或 RLS 开关。

| 表 | 审计列证据 | RLS/宽策略 | 匿名读限制 |
| --- | --- | --- | --- |
| D01 eta_revision | [001:16](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:16) | 001:30 启用，后续 4 策略 | 002:2 |
| D02 milestone_log | [001:50](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:50) | 001:64 启用，后续 4 策略 | 002:3 |
| D03 berth_plan_batch | [001:90](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:90) | 001:111 启用，后续 4 策略 | 002:4 |
| D04 berth_plan_row | [001:142](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:142) | 001:167 启用，后续 4 策略 | 002:5 |
| D05 prediction_run | [001:269](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:269) | 001:286 启用，后续 4 策略 | 002:8 |
| D06 prediction_plan | [001:313](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:313) | 001:335 启用，后续 4 策略 | 002:9 |
| D07 announcement | [001:354](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:354) | 001:367 启用，后续 4 策略 | 002:10 |
| D08 data_issue | [001:388](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:388) | 001:404 启用，后续 4 策略 | 002:11 |
| D09 sync_log | [001:423](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:423) | 001:435 启用，后续 4 策略 | 002:12 |
| D10 write_queue | [001:457](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:457) | 001:473 启用，后续 4 策略 | 002:13 |
| D11 inventory_batch | [001:190](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:190) | 001:207 启用，后续 4 策略 | 002:6 |
| D12 inventory_row | [001:229](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:229) | 001:245 启用，后续 4 策略 | 002:7 |
| m_port | [schema:400](C:/Users/董金/ssps-miaoda/server/database/schema.ts:400) 表内 4 列 | 平台完整策略未见 | 003:2 |
| m_berth | [schema:377](C:/Users/董金/ssps-miaoda/server/database/schema.ts:377) 表内 4 列 | 同上 | 003:3 |
| m_vessel | [schema:351](C:/Users/董金/ssps-miaoda/server/database/schema.ts:351) 表内 4 列 | 同上 | 003:4 |
| m_voyage | [schema:259](C:/Users/董金/ssps-miaoda/server/database/schema.ts:259) 表内 4 列 | 同上 | 003:5 |
| m_cargo | [schema:227](C:/Users/董金/ssps-miaoda/server/database/schema.ts:227) 表内 4 列 | 同上 | 003:6 |
| m_bulk_settle | [schema:175](C:/Users/董金/ssps-miaoda/server/database/schema.ts:175) 表内 4 列 | 同上 | 003:7 |
| m_sales_ext | [schema:152](C:/Users/董金/ssps-miaoda/server/database/schema.ts:152) 表内 4 列 | 同上 | 003:8 |
| m_route_rule | [schema:121](C:/Users/董金/ssps-miaoda/server/database/schema.ts:121) 表内 4 列 | 同上 | 003:9 |

002/003 分别指 [002-restrict-anon-read.sql](C:/Users/董金/ssps-miaoda/db/002-restrict-anon-read.sql:1) 与 [003-restrict-anon-read-mirror.sql](C:/Users/董金/ssps-miaoda/db/003-restrict-anon-read-mirror.sql:1)。

- **当前 20 张表没有被 002+003 名单遗漏的表**。004 只增列，没有新表。T09/T10 按规格不镜像，不应列为遗漏。
- **当前 SQL 未发现明确 TO anon 的有效授予**。001 已改为 authenticated；002/003 收回旧版同名策略中的 anon。
- **真实库匿名不可读尚未证明**：003 依赖同步任务先建表及同名 policy；新建/重建后需重新限制。[003:12](C:/Users/董金/ssps-miaoda/db/003-restrict-anon-read-mirror.sql:12) 仅列角色名以 anon 开头的策略，未检查 PUBLIC、角色继承或 RLS 关闭；返回行也不会主动使迁移失败。相关策略语义见 [PostgreSQL 官方说明](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)。这属于证据限制，未捏造当前平台存在这些配置。
- **规格操作说明冲突**：[open-questions.md:138](C:/Users/董金/WorkBuddy/SSPS/docs/open-questions.md:138) 称镜像建好再执行“002”，但 002 没有 m_*，实际应是 003。建议修正文档编号，部署记录分别确认自有表与镜像表。

### 12.2 幂等、破坏性语句与顺序

| 脚本 | 静态结论 | 条件与边界 |
| --- | --- | --- |
| [001](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:7) | CREATE TABLE/INDEX 均 IF NOT EXISTS；重复 DROP POLICY IF EXISTS 后 CREATE；无 DROP TABLE、TRUNCATE、数据 UPDATE/DELETE | 依赖 user_profile/平台角色；已有同名错误结构不会自动纠正；重跑会将同名 policy 改回默认，不能称“不改变现有权限” |
| [002](C:/Users/董金/ssps-miaoda/db/002-restrict-anon-read.sql:2) | 重复 ALTER 至同一角色集合，结果相同 | 依赖 001 表与同名 policy 先存在，非空库独立脚本 |
| [003](C:/Users/董金/ssps-miaoda/db/003-restrict-anon-read-mirror.sql:2) | 同上，覆盖 8 个已知镜像 | 依赖同步表与同名 policy；表未建齐会失败，不会自动保护后来新增表 |
| [004](C:/Users/董金/ssps-miaoda/db/004-import-columns.sql:2) | ADD COLUMN IF NOT EXISTS，可重复；只增列/注释 | 依赖 D03/D11，须先于使用新列的适配器运行 |

依赖顺序：平台类型/角色 → 001 → 002、004；8 个镜像任务建表及策略 → 003。001–004 自身没有统一 BEGIN/COMMIT，跨语句是否原子取决于平台执行方式，未验证。DROP POLICY 不删除业务数据，但重跑 001 会覆盖同名策略的人工收紧。

### 12.3 唯一键、重复导入与外键

| 对象 | 约束/实现 | 结论 |
| --- | --- | --- |
| 航次镜像 | UUID 主键、base_record_id 唯一；[schema:262](C:/Users/董金/ssps-miaoda/server/database/schema.ts:262) 业务编号无独立 UNIQUE | 飞书自动编号提供正常新建标识，不等于按船/日期/合同业务去重；不据此声称正常新建一定重复 |
| 合同号 | T05 可多明细、多航次共享 | K03 的业务模型不支持直接推导“合同号全局唯一”；不建议加错误的全局唯一约束 |
| D03 批次 | batch_no UNIQUE；[001:110](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:110) 非空文件标识 UNIQUE；is_current 仅 true 唯一 | 同一云空间文件标识有数据库防重；手动重传无标识文件可形成另一快照，规格未规定内容哈希去重，不一概判缺陷 |
| D04 快照行 | UUID 主键、batch_id FK；[001:166](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:166) 普通 batch_id/row_status 索引，无 UNIQUE(batch_id,line_no) | 解析器每原始行只映射一行，事务每次新建批次；尚未找到正常入口对同批次重复插入的完整触发链，列约束加固候选 |
| D11 库存批次 | batch_no UNIQUE；is_current 仅 true 唯一；文件标识无 UNIQUE/普通索引 | [imports.service.ts:146](C:/Users/董金/ssps-miaoda/server/modules/imports/imports.service.ts:146) 查后写；并发能否绕过且避开批次号冲突，下一批复核 |
| D12 逐日库存 | [001:244](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:244) batch_id/item_name/stock_date 普通索引 | 同品名同日输入两行均保留；规格未定义是错误重复还是不同子项，需先确认自然键，不能擅自吞行 |
| D05/D06 | run_no UNIQUE；[001:317](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:317) UNIQUE(run_id,label) | 同运行各只有一个 A/B；save 重复调用冲突，不等同接口已幂等 |
| D08 | [001:403](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:403) 未关闭问题 object_ref+issue_type+COALESCE(field,'') 唯一 | 可防同类未关闭问题重复；不保护短 ID |
| D10 | idempotency_key UNIQUE | 只保证键唯一，不证明飞书与数据库分布式原子性 |

外键：[001:124](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:124) D03→D04、[001:220](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:220) D11→D12、[001:299](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:299) D05→D06 为 CASCADE；D05 引用批次、D07 引用方案没有级联删除，默认阻止删除仍被引用记录。有文案引用时删运行会被阻止，已有预测引用时删批次会被阻止，符合保留溯源方向；无相反规格，不列缺陷。飞书逻辑标识的 text 关联不能机械要求全部加 PostgreSQL FK。

**生成 schema 限制**：[schema.ts:636](C:/Users/董金/ssps-miaoda/server/database/schema.ts:636) 及第 709 行的 is_current 为 .unique()，没有表示 SQL 的 WHERE is_current；D08 复杂索引只保留注释。当前部署依据是 SQL、ORM 声明用于查询，不能据声明推断真实库只允许一条 false 历史批次；以后若用 schema 反向生成 DDL，须防部分索引语义丢失。

### 12.4 查询索引：5 项改进候选，非已测性能故障

| 等级/对象 | 实际查询和现状 | 建议及验证 |
| --- | --- | --- |
| P2 / announcement.plan_id | [prediction-store:43](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-prediction-store.ts:43) 按运行的方案关联文案，D07 无 plan_id 索引 | 用合成大量文案查看本地 EXPLAIN，评估 plan_id 或 (plan_id,generated_at) |
| P2 / sync_log 时间 | [sync-log:15](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-sync-log.ts:15) 按 started_at、_created_at DESC 取 200，D09 无相应索引 | 评估排序复合索引及失败记录部分索引，不能由缺索引直接声称超时 |
| P2 / inventory_batch 文件/列表 | [import-store:54](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:54) 查文件标识，第 78 行按创建时间/批次号列全部批次 | 确认去重语义后评估标识索引；列表需分页与排序索引配合 |
| P2 / D08 列表 | [voyage-store:291](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:291) 全量排序，服务层过滤 owner/status/type；现有 owner/status 索引未供此 SQL 过滤 | 先下推过滤/分页，再按最终查询评估索引，单加索引不能消除全量搬运 |
| P2 / D10 待处理 | [outbox-store:16](C:/Users/董金/ssps-miaoda/server/lark/outbox-store.ts:16) status 筛选、_created_at 升序 LIMIT 200，仅有 status 非 done 部分索引 | 用合成积压验证 (status,_created_at) 非 done 部分索引 |

D04 当前批次+active 已有 (batch_id,row_status)，D12 已有批次/品名/日期，D01/D02 已有航次/时间索引，不误列缺失。镜像 JSON 关联及全部列表索引随下一批继续；实际 streaming 是否另建索引未验证。

## 13. 第 2 批完成情况与下一批入口

已完成：001–004 全文静态读取；12 张自有表 181 列的列名/基础类型核对；20 张表审计列和匿名读名单核查；D01–D12 全部规格关键字段的分组映射；主要唯一/FK/删除行为；5 项有调用依据的索引候选。D03/D04 和 D11/D12 的批次+明细+当前指针各自在同一 Drizzle transaction 中，D05/D06 也在同一事务中。这不涵盖飞书多表原子性，也不意味着导入后的 D08/日志等附属步骤整体原子。

剩余按第 8 节执行：逐 port 的 memory/drizzle/platform 行为，主表+明细+扩展表失败与并发，队列重试/跨实例串行，streaming 类型与回写，T09/T10 发布、迁移清洗，以及无数据的完整前后端链路。已见候选问题（例如幂等记录与业务事务分离）待补恢复路径后再编号。

本轮未运行 npm test/type:check/ESLint/smoke，未执行真实平台命令，未改代码仓。已确认行为均为静态推演；真实 RLS、审计自动填充和同步机制仍需独立环境证据。

