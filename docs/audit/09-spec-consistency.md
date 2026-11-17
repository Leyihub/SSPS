# 09 · 规格一致性专项审计

审计日期：2026-11-06（Asia/Shanghai）。本轮完成准备工作及用户追加确认的五项专项核查；不代表整个系统已完成运行审计或具备上线条件。

## 0. 快照、范围与证据边界

- **C（代码仓）**：`C:/Users/董金/ssps-miaoda`，分支 `sprint/default`，开始HEAD `3eddf0a0dcd10f50e572142a2038efb0c7caf1b3`；结束复核HEAD `0c9c7843b4bae01f340cc89ec993086f5c0ef11a`。审计读取的是工作区，包含开始时未提交修改。
- **D（文档仓）**：`C:/Users/董金/WorkBuddy/SSPS`，开始HEAD `5f6178f0ff04ba6682ddf99103d1c14d60395743`；结束复核HEAD `f89efd5e6f5d427022cdf05e376a260773c76cf3`。
- 下文 `C/路径:行`、`D/路径:行` 分别展开为上述绝对路径；`O:n` 专指 `D/docs/open-questions.md:n`。
- 规格覆盖：D/CLAUDE.md、implementation-plan.md、schema/ 全部26个文件、handoff/ 全部15个文件、open-questions.md、development-workflow.md，共46个文件；另查 prototype/ 对照材料及代码仓业务目录、SQL、共享类型和脚本。未将现有 audit/ 报告作为本轮结论的证据。
- D/app/ 是冻结备份，未用于业务代码判断。Git 历史泄露检查覆盖两个仓库所有可达引用，包含历史路径，但不把历史实现当作当前实现。
- **当前状态以用户本轮确认的“没有功能上线；仅内存/PGlite/假飞书验证”为基线。** 文档中声称真实复测的记录另列证据冲突，不替用户选择其真实性。
- 全程未运行真实飞书、妙搭或数据库命令，未读取 `.env.local`，未修改代码仓文件。本轮未运行 npm test、type:check、eslint 或 smoke；不引用旧测试数量为本轮通过结果。尤其 smoke 包含构建及清理 dist，不能在本轮“代码仓任何文件不得改动”的约束下直接执行。
- 所有输入场景均为合成场景；“实际”是源码路径的静态推导，**未动态执行**。业务含义尚未确认的事项写“风险/待确认”，不自行给出正确业务数值。文档缺陷的触发是依两份材料实施/验收时产生相反要求，不等同于断言代码已出错。
- P0：错误业务结论、损坏/泄露、越权或上线阻断；P1：特定条件错误或明显偏离规格；P2：次要一致性或维护问题。疑似表示缺少形成确定结论的证据。不存在“因为没上线所以不是缺陷”的豁免。

审计开始时已有8个修改文件：C/client/src/pages/Capacity/CapacityPage.tsx、p06.css；C/server/adapters/drizzle/drizzle-import-store.ts；C/server/adapters/memory/live-snapshot.ts、memory-import-store.ts；C/server/modules/imports/imports.service.ts；C/server/ports/import-store.port.ts；C/server/test/drizzle-stores.spec.ts。未覆盖或回退这些修改。

**并发变化说明**：审计期间外部操作产生了提交，结束时上述工作区已干净；本审计没有执行任何Git写操作。代码第一次内容清单与结束复核的451个非env文件SHA-256聚合均为 `2366da0afd7417874f5d6530481fd706ed0a313f32eaa311a37f604a16598614`。该清单建立于审计中途，不能证明最初每个文件从未被外部更新；关键发现已对结束版本逐项复核定位。文档外部变化涉及local-env.md追加前端验证段、open-questions.md新增3项；本报告已补读并纳入，未将新增验证声明当作事实认可。报告是可追溯的工作区静态核查，不伪称整个过程处于被锁定的单一Git快照。

## 1. 模块清单与调用关系（准备工作）

### 1.1 后端

| 模块/目录 | 一句话职责 | 主要调用关系 |
| --- | --- | --- |
| C/server/app.module.ts、main.ts、config.ts | 装配平台与业务模块、启动服务并集中部分规则常量。 | AppModule → Ports/Lark/Prediction/Capacity/Voyage/Master/Imports/Admin，最后注册 View。 |
| modules/prediction | 运行预测、保存结果与溯源、采纳方案、生成宣船文案、解析需求和库存测算。 | SnapshotPort → engine/domain/nlp → PredictionStore；采纳 → VoyageService。 |
| modules/capacity | 提供按货量查询的日历和单日船舶明细。 | SnapshotPort → engine/capacity → serialize。 |
| modules/voyage | 航次及货物、节点、ETA、异常标记、扩展结算、数据质量与预测采纳落库。 | DirectoryPort + domain 权限/校验/状态 → VoyageStore/MasterStore。IssueScanService 扫描缺MMSI/ETA。 |
| modules/master | 主数据查询维护、当前身份和航程规则重算。 | DirectoryPort + domain → MasterStore/VoyageStore。 |
| modules/imports | 手动/云空间接入靠船计划与库存，解析校验、批次切换、库存过期提醒和趋势查询。 | lib/xlsx → importers → ImportStore；另依赖主数据/航次/日志端口、engine/stock。 |
| modules/admin | 同步日志、自检、补偿重放、兼容表刷新及六项自动化任务。 | AdminService/CompatService/JobsAutomation → Imports/Master/IssueScan/Outbox/Gateway。 |
| modules/ports | 全局依赖注入、身份守卫和 memory/real 实现选择。 | real → Drizzle/Platform/Lark；memory → Memory；两者均装配 LiveSnapshot。 |
| modules/view | 平台维护的页面兜底路由。 | 业务路由之后处理剩余请求。 |
| domain | 航次模型、节点状态、校验、权限、航程统计、兼容行映射与兼容模型转换。 | 被各 Service、engine 和适配器引用。 |
| engine | CMR/重叠数、库存推演、Plan A/B、S1、序列化和固定宣船模板。 | recommend → capacity/stock/routeRules；provenance/serialize 将结果持久化或返回前端。 |
| nlp | 用关键词和规则提取船型、货量、港口、物料和日期。 | PredictionService → createParser；无生成式模型调用。 |
| ports | 定义快照、仓储、身份、用户查询、日志及健康检查边界。 | 服务依赖接口，PortsModule 注入实现。 |
| adapters/memory | 内存仓储、演示身份与主数据种子；LiveSnapshot 负责统一组装业务快照。 | LiveSnapshot 从注入的仓储读取，real 模式也使用它，目录名不代表只支持内存。 |
| adapters/drizzle | 读取平台镜像与应用表、写飞书并回写镜像、持久化预测/导入/日志/幂等。 | 平台注入 DRIZZLE_DATABASE；主数据/航次写链路 → Lark Gateway/Outbox。 |
| adapters/platform | 平台角色/部门解析，姓名搜索后按用户ID匹配并缓存目录。 | AuthorizationSDK → UserSource → PlatformDirectory/PlatformUserLookup。 |
| lark | 凭证提供器、多维表格/云空间HTTP、字段映射、分页批量、单线程队列和outbox补偿。 | 环境变量装配客户端；Gateway → bitable → queue；OutboxStore → 应用库。 |
| importers | 靠船计划规范化、库存序列构造、迁移清洗与dry-run计划。 | ImportsService/迁移脚本 → common/imipPlan/inventory/migrate/migrate-plan。 |
| lib | 日期字面值/业务时钟、文件名修复及受限xlsx读取。 | 被领域、引擎、导入、适配器调用。 |
| common | 全局身份守卫、异常过滤、响应码和共享异常接口。 | HTTP入口 → SspsRoleGuard；异常 → GlobalExceptionFilter。 |
| database/schema.ts | 平台生成的Drizzle表/镜像映射。 | Drizzle适配器读取；本轮未手改或重新生成。 |
| test | 领域/引擎/服务/权限/适配器测试及PGlite、假飞书、原型夹具。 | 仅作为实现和预期存在性的证据，未将测试存在视为验证通过。 |

### 1.2 前端

以下11个业务页面均由 C/client/src/app.tsx:22 注册；相同页面目录下的CSS负责原型样式。

| 模块/页面 | 一句话职责 | 主要接口依赖 |
| --- | --- | --- |
| P01 pages/Workbench，`/` | 本人待补节点、ETA超期、本周到港和质量待办。 | me/voyages/data-issues。 |
| P02 pages/Predict/PredictPage，`/predict` | 输入预测条件、查看A/B与日历、采纳和宣船。 | predictions/stock-plan/inventory/trend/capacity。 |
| P03 pages/Predict/PredictionDetailPage，`/predictions/:runNo` | 展示保存结果、库存保障、S1和宣船文案。 | prediction详情/announcement/trend。 |
| P04 pages/Voyages/VoyageListPage，`/voyages` | 航次筛选分页、查看与新建。 | voyages及主数据。 |
| P05 pages/Voyages/VoyageDetailPage，`/voyages/:id` | 节点、ETA、货物、扩展作业结算与日志。 | voyage详情/写接口及主数据。 |
| P06 pages/Capacity，`/calendar` | 按货量查看近远期日历与单日占用。 | capacity/calendar、capacity/day。 |
| P07 pages/BerthPlan，`/berth-plans` | 手动上传、批次和靠船明细/显示筛选。 | berth-plans/import-file、batches、rows。 |
| P08 pages/Master，`/master` | 港口、泊位、船舶与经验航程维护。 | ports/berths/vessels/route-rules。 |
| P09 pages/Quality，`/data-quality` | 数据质量筛选和处理/关闭。 | data-issues。 |
| P10 pages/Admin，`/admin` | 同步日志、兼容刷新、自检与迁移说明。 | admin/sync-logs、compat/refresh、health；迁移仍为说明。 |
| P11 pages/Ask，`/ask` | 四阶段需求解析、库存测算和生成方案。 | predictions/parse、stock-plan、predict及库存。 |
| pages/Home、ExamplePage、NotFound | 模板页面与未匹配路由页面。 | Home/Example未注册为业务页；NotFound处理`*`。 |
| ssps/ | 封装React Query、写入幂等键、业务格式化、CMR图例、通用UI和库存图。 | axiosForBackend → `/api/*`；类型来自 shared/api.interface.ts。 |
| components/Layout、ui、business-ui | 导航框架、基础控件与平台人员/部门等组件。 | Layout渲染Outlet；业务页组合控件。 |
| api、hooks、lib、types、utils及样式入口 | 平台请求辅助、hooks、错误处理、类型与资源样式。 | index.tsx平台入口 → app.tsx → Layout/业务页。 |

端到端主线：页面 → ssps/api → Controller/全局身份守卫 → Service → 领域/引擎 → ports → memory或Drizzle。真实写入是 Drizzle → Outbox → 单线程飞书队列 → 飞书成功标记 → 镜像回写；平台streaming另行刷新镜像。预测与日历共享 LiveSnapshot，不从原型mock直接构造真实模式结论。

### 1.3 后续全量审计分批方案及最可能出问题的五处

| 批次 | 范围与要验证的结论 | 本轮状态 |
| --- | --- | --- |
| 1 | 规格冲突、待确认决策、进度真实性、虚构数据红线与裁剪残留。 | 本报告；静态核查。 |
| 2 | engine/domain：23泊位边界、货量分母、15天跨界、无数据全链路、A/B资格/排序、销售/备件与S1。 | 待做全量逐函数审计；本轮仅记录直接关联的确定问题。 |
| 3 | Drizzle/Lark：真实字段类型、关联/人员/自动编号、写队列/幂等/并发/失败恢复、streaming回写覆盖。 | 待做；本轮确认实现是否存在。 |
| 4 | 身份/权限/安全：角色与部门、金额裁剪、所有入口、RLS与匿名/直接数据库边界。 | 待做；需隔离的本地验证，真实平台结论另需授权验证。 |
| 5 | 导入/迁移/兼容/cron：Excel日期、历史清洗、批次覆盖、数据量、定时重入、下游语义。 | 待做全量；本轮检查规格落点。 |
| 6 | 前端/接口/测试：P01–P11边界状态、数值不重算、灰斜线、来源溯源、错误恢复、假环境覆盖盲点。 | 待做；本轮完成模块地图和入口核查。 |

优先关注五处：① C/server/engine/recommend.ts 与 capacity.ts、LiveSnapshot 的候选/资格/覆盖边界（本轮已发现告急B绕门槛）；② C/server/adapters/drizzle 与 lark/outbox.ts、gateway.ts 的真实字段、编号和补偿；③ C/server/adapters/platform、common/guards 与 db/001–003 的身份/部门/金额权限边界；④ C/server/importers、modules/imports 与 lib/dates.ts 的日期、覆盖终点和库存映射；⑤ C/server/modules/admin/compat.service.ts、jobs.automation.ts 及 domain/compat.ts 的推断列语义、整表重写、并发和平台cron时区。这里的优先级是审计假设，不等同于五处均已证实有运行缺陷。

## 2. 直接关联本专项的代码缺陷与风险

| 冲突项 | 位置 | 影响 | 建议解决方式 |
| --- | --- | --- | --- |
| **F01 · P0 缺陷：库存告急时Plan B绕过资格** | C/server/engine/recommend.ts:108、:110、:141；对照同文件:117、:127；D/CLAUDE.md:35、:37；O:121；用户规则5、7。 | 代码在urgent分支直接取第二个不重叠窗口，未调用qualify；mkPlan只写qualifies=false，仍输出。合成输入：今天2026-11-06，5万吨，使用23泊位种子，11个匹配泊位在11-06至11-26均占用，另有同泊位11-21起行使覆盖达15天；规则有效P50=3/P80=5；库存序列今天100、次日0且不回升，缓冲3，查询11-11至11-18。静态结果：进入urgent，A为11-11至13，B为11-14至16，二者CMR_min=0，B.qualifies=false仍返回。期望：余量不足30%不出B；urgent没有豁免条款。未动态运行。 | 所有选B分支共用资格检查；完整/稀疏候选都检查已知日≥30%。另确认告急排序是否可覆盖规则7，未确认前不得默默改为纯日期排序。 |
| **F02 · P1 缺陷/一致性风险：前端称不填吨级，后端静默生成** | O:6、:34；C/client/src/pages/Master/MasterPage.tsx:51；C/server/modules/master/master.service.ts:127；C/server/adapters/drizzle/drizzle-master-store.ts:36、:93。 | 输入合成新船dwt=60000 → cleanVessel返回tier=5万吨；前端称档位未确认暂不填写。生成值又写镜像tonnageClass，而飞书写字段不含tier，后续streaming可能覆盖。期望：未确认的档边界不被自动当作业务事实。 | 先确认档位、来源与存储主权；确认前不得静默推导。同步前后端文案和飞书/镜像映射。 |
| **F03 · P1 风险：T08吨级维度未实现** | D/docs/implementation-plan.md:106；D/docs/schema/T08-route-rule.md:8；O:93；C/server/domain/routeRules.ts:44、:50；C/server/modules/master/master.service.ts:172、:177、:188。 | 学习只按装卸港/业务筛样本，查规则取首条，新增清洗不接收tier且同线同业务其他启用规则会409。合成输入：试图建立同线同业务、不同吨级两规则 → 第二条被视作重复；若镜像已有两条，查询不传吨级而取首条，样本亦混合。与“装港×卸港×吨级档”不一致，但O93承认原型简化、吨级边界尚未确认，不能断言当前真实数据已产生错误航程。 | 将简化明确为待确认上线约束；先定吨级规则，再贯通唯一性、查询及学习维度。不可声称当前已按吨级匹配航程。 |
| **F04 · P1 风险：库存提醒只取首个匹配物料** | O:72、:73、:148；C/server/modules/imports/imports.service.ts:34、:184、:186。 | itemNames.find只返回首项。合成库存项[测试物料总库存,测试物料]，航次货名“测试物料”，导入后改ETA → changes只记录首项；交换库存顺序提醒对象变化。O148称汇总与分项“同时命中”，与实际相反。全局stale仍会置true，不能夸大成整张库存完全没有提醒。 | 先确认汇总/分项资格及权威映射；如多项应关联，返回全部匹配项，避免依赖数组顺序。 |
| **F05 · P1 风险：ETA阈值配置分裂** | O:13；C/server/config.ts:1、:9；D/docs/handoff/claude-code-handoff.md:73；C/client/src/pages/Voyages/VoyageDetailPage.tsx:58、:87、:210；Workbench/WorkbenchPage.tsx:61；Quality/QualityPage.tsx:8。 | 后端阈值来自config，详情判断与多处说明固定3天。合成配置阈值5、ETA4天未更新 → 后端列表/扫描不超期，详情仍显示超期；当前默认3时尚无这个分歧。与“只改config一处”冲突。 | 将业务阈值及超期结果由后端统一提供，前端引用同一结果/阈值；确认阈值后同步文案。 |
| **F06 · P1 功能缺口：T10最新计划未同步** | D/docs/implementation-plan.md:14、:109；D/docs/handoff/README.md:85；D/docs/handoff/task-book.md:212；C/server/modules/imports/imports.service.ts:92；C/server/adapters/drizzle/drizzle-import-store.ts:18、:25。 | 合成合法计划批次导入 → saveBerthBatch仅应用库事务，没有Gateway/T10写链路；期望K04要求飞书保留最新一期。任务书承认未做，README却声称同时写T10。不是memory-only问题，real适配器也缺该步骤。 | 将缺口和完成度如实登记；补设计同步失败/重试与批次切换一致性后再验收，不在本轮修改。 |
| **F07 · P2 文档缺陷：初始ETA假设漏登记** | D/docs/handoff/claude-code-handoff.md:259；O全文无该事项；D/docs/implementation-plan.md:23；C/server/modules/voyage/voyage.service.ts:185、:188、:233。 | 新建附ETA → 设置etaUpdated、写新建日志，不写D01；后续首次修订才写D01。交接称这未经明确确认且“见open-questions”，实际没有条目。K13只说每次修订留痕，不能直接断言初始值必须算修订。 | 把“初始值是否写D01及依据”登记待确认，并明确K13边界；本报告不自行决定必须补初始修订。 |

## 3. 文档之间的冲突（逐处定位）

| 冲突项 | 位置 | 影响 | 建议解决方式 |
| --- | --- | --- | --- |
| **S01 · P1 文档缺陷：另一套状态枚举** | D/docs/schema/mirror-columns.md:126 ↔ D/docs/schema/T04-voyage.md:41、D/docs/schema/status-rules.md:5。 | 映射举“在途/靠泊中/已离港”，正式是待宣船等8状态。按字典为航行阶段填“在途”会与正式单选不符。当前domain/status按正式8状态推导，不能据此说代码已改成另一套状态。 | 以status-rules及T04为准，字典逐项引用正式枚举。取消为“已结束+异常标记”的显示变体，不自创新第9状态。 |
| **S02 · P1 文档缺陷：异常标记类型/选项错误** | D/docs/schema/mirror-columns.md:127 ↔ D/docs/schema/T04-voyage.md:42；C/server/domain/voyage.ts:8；用户规则11、12。 | 映射写单选“正常/时序倒置/滞期风险”，正式为多选“取消/延期/移泊/改港”。按映射输入滞期风险 → VoyageService拒绝未知标记；同时多项不能以单选表达。 | 以T04多选为准；删除误造风险枚举，不删除合法人工异常标记。 |
| **S03 · P1 文档缺陷：部门枚举错误** | D/docs/schema/mirror-columns.md:135 ↔ D/docs/schema/T04-voyage.md:51、D/docs/handoff/permission-matrix.md:6。 | 映射出现另一套采购部名称/成品销售部且缺仓储物流部；按该表配置时仓储用户没有合法部门，可能误配金额权限。 | 以T04三部门及权限矩阵为准；不按字典臆建组织架构。 |
| **S04 · P1 文档缺陷：来源枚举错误** | D/docs/schema/mirror-columns.md:138 ↔ D/docs/schema/T04-voyage.md:54、D/docs/schema/base-plan.json:486。 | 映射的“飞书录入/企微历史/集成同步/算法生成”与正式四来源不同；同一历史记录按两份材料会被赋予不同且可能非法的来源值。 | 以T04及base-plan为准；保留原表/历史副本的来源区分。 |
| **S05 · P1 文档缺陷：多选数据库类型错误** | D/docs/schema/mirror-columns.md:18、:127、:251 ↔ D/docs/schema/mirror-samples.md:131、:293。 | 前者把多选写text，后者记录text[]。双异常标记或多个适用业务类型按前者读为字符串，无法按数组正确解释。当前代码类型应另以生成schema核对，不能从错文档推断已写错适配器。 | 类型以平台生成schema和经脱敏确认的实测形状为依据；修正文档通则及每个字段。 |
| **S06 · P1 文档风险：T05映射漏字段** | D/docs/schema/mirror-columns.md:155–176 ↔ D/docs/schema/T05-cargo-line.md:10、:14、:20、:22。 | 映射漏物资类别、归属事业部、检测公司、储运物料名/大类、本地国际；据此单独实施会没有这些正式字段落点。该行不等同于认定当前代码未存这些字段。 | 以T05/base-plan完整清单逐字段核实镜像；未同步要显式标注，不把遗漏当删除需求。 |
| **S07 · P1 文档缺陷：状态被任务书当公式只读** | D/docs/handoff/task-book.md:198 ↔ D/docs/schema/T04-voyage.md:41、D/docs/schema/base-build-checklist.md:144。 | 依W12“状态只在后端算供展示”实施，与正式“单选、系统写入”冲突，可能不回写飞书状态。 | 以T04为准：后端节点推导，再写系统单选；公式列和系统写入列分开列明。 |
| **S08 · P1 文档缺陷：编号生成方冲突** | D/docs/handoff/task-book.md:199 ↔ D/docs/schema/T04-voyage.md:7、D/docs/handoff/claude-code-handoff.md:285。 | W12要求应用生成并发安全航次号，另两处要求飞书自动编号。照两者实施会有双编号源。 | 以T04及后续自动编号约定为准；明确展示前缀/年份，删除另建序列指令。 |
| **S09 · P1 规格冲突：防旧同步覆盖验收与实现约定相反** | D/docs/implementation-plan.md:525、D/docs/handoff/task-book.md:246 ↔ D/docs/handoff/claude-code-handoff.md:155、D/docs/handoff/task-book.md:244。 | 新ETA镜像回写后旧streaming事件晚到 → 交接接受暂时旧值并等最终纠正，原验收要求旧事件不得覆盖。按不同文档验收结论相反；静态代码不能证明平台实际事件顺序。 | 明确是禁止暂时回退还是接受最终一致，量化窗口/用户提示，再统一验收。不得自行把原要求降级。 |
| **S10 · P1 文档缺陷：G1时序冲突** | D/docs/implementation-plan.md:542、:551 ↔ 同文件:565；O:117。 | 总则要求不过门不进下一里程碑、甘特图G1在M1末；已确认缩围把全量/G1推至M2末。按旧依赖M2不能开始。 | 以已确认M1仅在途+近30天决策为准；拆M1阶段门与M2完整G1，统一图表和依赖。 |
| **S11 · P1 文档风险：W42缩减G1验收** | D/docs/handoff/task-book.md:399 ↔ D/docs/implementation-plan.md:572。 | 只做差异解释签字，按W42可过；正式G1还有无孤儿、分层抽样、重复迁移不变、连续自动导入和业务员真实录入等条件。 | W42引用完整G1，或明确只是迁移对账子门；不能将子门通过写成全门通过。 |
| **S12 · P2 文档缺陷：K14未回填应用库总表** | D/docs/implementation-plan.md:311–316 ↔ D/docs/schema/D-app-db.md:17–24；实施计划:24。 | 第5节仍只列D01–D10、D05/D06缺库存及混合路径字段，schema已有D11/D12。按计划总表独立建模会漏库存持久化。 | 以已确认K14及D-app-db为准补齐；标明导出快照哪些章节已失效。 |
| **S13 · P2 文档缺陷：A29/A30复用/对调** | D/docs/handoff/task-book.md:238、D/docs/implementation-plan.md:570、:580、D/docs/development-workflow.md:82 ↔ D/docs/implementation-plan.md:404、:405。 | replay被叫A29，库存/智能提问条目编号对调；正式接口表A29解析、A30库存。按编号派工会验收错误接口。 | 以第8节接口表为准；补偿单独登记，不复用A29；库存A30、解析A29。 |
| **S14 · P2 文档缺陷：页面总数10与清单11** | D/docs/implementation-plan.md:415 ↔ 同文件:429、D/CLAUDE.md:71。 | 按总数编清单可能漏P11；实际P01–P11路由已存在。 | 以页面清单及K14为准统一11页。 |
| **S15 · P2 文档缺陷：船次号举例混入系统航次号** | D/docs/schema/mirror-columns.md:104 ↔ D/docs/schema/T04-voyage.md:7、:10。 | 把系统VY格式当业务船次号示例；照填会混淆三个不同标识。 | 分清系统航次编号、业务船次号、船方航次号；以T04字段说明为准。 |
| **S16 · P2 文档缺陷：库存Plan A顺序旧问题未回填** | O:75 ↔ O:113、D/docs/implementation-plan.md:409。 | 旧条固定近端A/远端B，已确认条允许近端不达标而远端达标时用远端A；合成近端12%场景会选不同A。 | 以O113已确认结论为准，将O75标为被替代。 |
| **S17 · P1 规格歧义：备件借用大宗的条件有三种说法** | O:115 ↔ D/CLAUDE.md:38、D/docs/schema/T08-route-rule.md:7；C/server/domain/routeRules.ts:50。 | O115说自己的样本不足5就借；T08说没有、或样本不足5且无经验值才借；锁定摘要说先自己规则，没有才借。合成自有规则2样本但有经验值、大宗6样本 → 前者借大宗，后两者应先自有经验；代码实际按“有自有规则就返回”处理。 | 以用户本轮规则8“先自己规则，没有才借”为最高依据，统一已确认记录；另明确空规则/无可用经验值是否算“没有”。不能默默改成样本不足即借。 |
| **S18 · P1 证据冲突：真实环境验证记录与当前基线相反** | D/CLAUDE.md:75、D/docs/development-workflow.md:68、D/docs/handoff/claude-code-handoff.md:5 ↔ D/docs/handoff/local-env.md:54、:70、:101、:119、:125、:128、:130、:160、:171；O:142、:146、:161；C/server/adapters/platform/role-members.ts:3。 | 一组断言从未接真实环境，另一组称真实复测/导入/目录验证。源码只能证实实现，无法判定验证发生在哪个应用/版本/环境。直接引用后者会违背用户当前基线，直接删除也可能抹去历史证据。未发现正面宣称业务功能“已上线”的有效现状文本。 | 本报告保持用户本轮基线；请负责人核实记录归属及版本后更正摘要，标日期、环境和证据。真实联调与已上线须分别记载。 |
| **S19 · P2 文档状态失配：配置“集中一处”不实** | D/docs/handoff/claude-code-handoff.md:73、O:70、:126 ↔ C/server/config.ts:6、C/server/modules/prediction/prediction.service.ts:84、C/server/engine/capacity.ts:27、C/server/importers/imipPlan.ts:52。 | 缓冲默认在Service另写3；覆盖终点在导入和引擎各算一次。按文档仅改一处可能得到接口间不同默认值/覆盖信息。ETA另见F05。 | 清点全部规则副本并定义权威输出；先统一规格，再改实现。本轮不做重构。 |

## 4. 未确认事项是否已经被代码决定（76/76逐项）

“已编码暂定”表示实现存在但业务期望仍待确认，并非认定暂定值已经获授权或已经在真实环境生效。“已有上位依据”表示锁定规则/后续已确认条目已覆盖该问题；“条件草图”不适用当前v1。下表不将每项待确认都重复计为独立缺陷；确定问题归并到F/S项。所有需决定的业务问题，期望输出均为“待业务确认”，不以本报告替代决策。

| 冲突项 | 位置 | 影响 | 建议解决方式 |
| --- | --- | --- | --- |
| O:5 开放平台权限/协作者：外部待验证 | O:5；C/server/lark/gateway.ts:20；C/server/modules/imports/imports.service.ts:115。 | 调用写表/下载依赖真实授权；静态代码不能证明已经开通或遗漏。 | 逐权限及资源验证；不以一条成功链路代表全部权限齐全。 |
| O:6 吨级档：已静默假定 | O:6；C/server/modules/master/master.service.ts:127。 | 6万吨DWT→自动5万吨档，与前端未填声明不符，见F02。 | 确认边界前不自动当作事实。 |
| O:7 业务属性：已编码暂定 | O:7；C/client/src/pages/Voyages/VoyageDetailPage.tsx:18、:193；C/server/domain/voyage.ts:12。 | UI合并六项；后端是普通string，API还可传其他字符串。 | 确认统一还是分业务枚举，再定义后端约束。 |
| O:8 成品结束节点：已编码假设 | O:8；D/docs/schema/status-rules.md:8、:17；C/server/domain/status.ts:16。 | 成品有卸港靠泊、无卸港离港→已结束。与当前假设规格一致，但结束节点未经确认。 | 明确成品跟踪终点；不自行当作已确认业务规则。 |
| O:9 某合同集中时间戳含义：迁移隔离假设 | O:9；C/server/importers/migrate.ts:55；C/server/importers/migrate-plan.ts:51；C/server/domain/routeRules.ts:31。 | 合成同合同同时间组≥5行→标疑似占位并排除学习；正式迁移未做。阈值可能扩大隔离，真实含义未知。 | 以待确认清单询问业务；不复述原始合同标识，不自动删除记录。 |
| O:10 旧表时区：已编码假设 | O:10；C/server/lib/dates.ts:1、:40；C/server/adapters/drizzle/db.ts:9。 | 旧表字面08:00会被解释为UTC+8；若源表为其他时区则偏移。不能由IMIP所在地反推所有历史来源时区。 | 分来源确认时区和日期/时刻语义。 |
| O:11 历史人员映射：待提供/未实现 | O:11；C/server/adapters/platform/role-members.ts:62；C/server/importers/migrate-plan.ts:27。 | 当前登录姓名搜索不等于历史负责人账号映射；迁移计划不生成该映射。 | 提供映射及重名处理，不以当前用户缓存替代。 |
| O:12 经验航程负责人/交期：部分被确认替代 | O:12 ↔ O:116、:134；C/server/domain/routeRules.ts:18；C/server/modules/prediction/prediction.service.ts:40。 | 后续要求开工前交；现规则样本不足直接用exp，缺规则才停止。无法证明真实T08已校对。 | 更新交期状态，保留估算版待校对条件。 |
| O:13 ETA阈值：可配置但分裂 | O:13；C/server/config.ts:9；C/client/src/pages/Voyages/VoyageDetailPage.tsx:58。 | 后端改5、前端仍3会不一致，见F05。 | 先确认阈值，再贯通配置及输出。 |
| O:19 CMR色阶：已编码暂定 | O:19；C/client/src/ssps/cmr.ts:4。 | .4→适中；50/30/10界线写在前端。 | 确认图例，区分显示色阶与B资格30%规则。 |
| O:20 远期B资格：已编码暂定 | O:20；C/server/engine/recommend.ts:22。 | 合成n=10、重叠7→合格，8→不合格；将船数与泊位数换算为门槛仍待确认。urgent还绕过检查，见F01。 | 单独确认远期门槛含义，不将其包装成实测CMR。 |
| O:21 成品推荐发船日：已编码假设 | O:21；C/server/engine/recommend.ts:153。 | 成品只输出装港窗口、deadline、slack及参考客户ETA，无depart。 | 确认是否需要装货时长和离装港日。 |
| O:22 目标到港日：已编码假设 | O:22；C/server/engine/recommend.ts:29、:73、:82；C/server/modules/prediction/prediction.service.ts:38。 | 普通窗口day14–20→整次CMR；加库存item→候选各按始日分流，可能mixed。不是按数据有无切换，但普通跨界窗口仍受取目标日定义影响。 | 明确单日/窗口及普通/库存的分流定义，再固化验收边界。 |
| O:23 窗口长度/间隔：可配置暂定 | O:23；C/server/config.ts:5；C/server/engine/recommend.ts:27、:126。 | 默认3天每日滑动；A1–3可紧接B4–6，无额外空档。 | 确认窗口长与最小间隔。 |
| O:24 无数据覆盖：已编码假设 | O:24；C/server/engine/capacity.ts:27、:30、:33。 | 唯一计划day5靠泊、day10卸完→day6起nodata；航次覆盖取最晚窗口止。不是0%，但已知占用仍被覆盖截断。 | 与O126统一确认覆盖定义；不自行改为最晚卸完。 |
| O:25 远期重叠区间：已编码假设 | O:25；C/server/domain/voyageLite.ts:8；C/server/engine/capacity.ts:40。 | 用本港侧计划窗口，缺失可回退实际/ETA单日；无作业延伸。 | 确认窗口是否等同泊位竞争期间，是否需额外字段。 |
| O:26 竞争船定义：已编码假设 | O:26；C/server/engine/capacity.ts:19、:29、:40。 | 最小所需泊位吨级较小的船被排除，即使物理上能占大泊位；这是待确认竞争模型。 | 给出竞争判定案例与池关系，不凭代码证明模型正确。 |
| O:27 真实泊位容量未到：旧条状态失配 | O:27 ↔ O:132；C/server/adapters/memory/seed.ts:7；C/server/adapters/drizzle/drizzle-master-store.ts:69。 | 后续已记录表已提供；内存种子已是真实规范容量，real读T02。原型mock仍示例且有声明。 | 关闭待提供旧条，保持原型/真实容量来源区别。 |
| O:31 v2删除S1等：条件草图，未实施 | O:31；C/client/src/pages/Predict/PredictionDetailPage.tsx:114、:164；parts.tsx:84。 | 当前保留低可信、S1、采纳，符合v1锁定清单。 | 保留未采用标识，不作为当前缺陷或变更依据。 |
| O:32 v2无完整候选不推荐：条件草图，未实施 | O:32；C/server/engine/recommend.ts:106、:128。 | 当前仍允许合格稀疏降级，符合规则5。 | 不按v2草图删除降级。 |
| O:33 v2关键词/默认15天：部分暂定 | O:33；C/server/nlp/parse.ts:14、:29、:113。 | 关键词固定；缺时间返回缺槽位，并非默认15天；v2未启用，不能按草图报错误。 | 业务补词表，时间默认若要启用须单独确认。 |
| O:34 v2四船型档：未实施/重复吨级问题 | O:34；C/client/src/pages/Capacity/CapacityPage.tsx:11；C/server/modules/master/master.service.ts:127。 | 实际日历1/2/3/5/7万，船舶后端另推5/10万。 | 与O6合并确认；保留v2草图条件。 |
| O:35 日历明细/从属单位：部分实现 | O:35；C/server/engine/capacity.ts:62。 | 近端明细含船/泊位/货物/日期，远端含航次；无owner字段。 | 确认展示字段，不凭此修改容量计算。 |
| O:39 中文术语：已编码暂定 | O:39；C/client/src/pages/Predict/parts.tsx:84；PredictionDetailPage.tsx:164；C/client/src/ssps/cmr.ts:5。 | 用推荐/备选、数据依据、泊位余量等称呼。 | 确认术语表并与规格统一；非算法问题。 |
| O:43 技术编号只放页底：已编码但不完全一致 | O:43；C/client/src/pages/Predict/PredictionDetailPage.tsx:103、:166。 | 页底有编号，依据表也出现规则ID；“只在页底”并未严格实现。 | 确认编号可见范围，再统一呈现。 |
| O:44 P03采纳入口：按暂定实现 | O:44；C/client/src/pages/Predict/PredictionDetailPage.tsx:149；parts.tsx:84。 | 详情有文案无采纳；P02有采纳。 | 业务确认是否需要详情采纳，不自行补入口。 |
| O:45 文案模板：已编码暂定 | O:45；C/server/engine/announce.ts:34；C/server/modules/prediction/prediction.service.ts:70。 | 单固定模板，由保存溯源生成，不重算数值；措辞/版式未确认。 | 审核文案；保留规则结果引用约束。 |
| O:49 大宗装港状态：已扩大为业务类型假设 | O:49；D/docs/schema/status-rules.md:12；C/server/domain/status.ts:20。 | 规格是“不记录靠泊的本航次”；代码对所有大宗有actLoadArr即装港装货，不区分本航次是否记录靠泊。 | 确认是否所有大宗均适用；当前不能将假设当已定状态规则。 |
| O:50 本周到港：已编码暂定 | O:50；C/client/src/pages/Workbench/WorkbenchPage.tsx:21、:25。 | 今天至周日、本人未到未结束、ETA优先、排序；仅读pageSize200，规模边界另需后续审计。 | 确认统计口径并纳入分页规模用例。 |
| O:51 质量类型/关闭权限：已编码且文档分歧 | O:51；C/server/modules/voyage/issue-scan.service.ts:13、:41；voyage.service.ts:378。 | 扫缺MMSI/ETA，关闭允许责任人或admin；旧条称只允许本人。迁移疑似占位主要在确认清单，不等于已进D08。 | 以权限矩阵核定admin例外，补完整问题类型清单。 |
| O:52 金额隔离：已有上位依据 | O:52 ↔ O:61、:114；D/docs/implementation-plan.md:21；C/server/domain/permissions.ts:38；voyage.service.ts:331。 | 金额仅大宗/admin可见，响应删除钱列；并非无依据新增。 | 收敛旧未勾项，实际平台/Base隔离仍需验收。 |
| O:53 主数据权限：已有接口规格依据 | O:53；C/server/domain/permissions.ts:40。 | 港泊物流/admin，船新增业务员/主管，航程主管/admin；已有代码。 | 按接口表统一，区分权限设计与真实账户验证。 |
| O:54 日历货量档：已编码暂定 | O:54；C/client/src/pages/Capacity/CapacityPage.tsx:11、:75。 | 固定1/2/3/5/7万，默认5万，页面提示待确认。 | 与O6统一确认；5万默认不能推出其他档已确认。 |
| O:55 最新批次/不解析：仅原型旧限制 | O:55；C/server/modules/imports/imports.service.ts:63、:104；C/client/src/pages/BerthPlan/BerthPlanPage.tsx:53。 | 现真实解析xlsx，并可按批次查询；已超越浏览器演示限制。 | 将原型说明与应用当前实现分开写。 |
| O:56 dry-run预估数字：当前页面不冒充执行结果 | O:56；C/client/src/pages/Admin/AdminPage.tsx:35；C/server/importers/migrate-plan.ts:99。 | 页面明确A27未开发；本地脚本按输入生成统计。 | 保留正式迁移未实现边界，不拿原型估算当结果。 |
| O:57 会话保存/重置：仅原型说明 | O:57；C/server/modules/ports/ports.module.ts:34、:46。 | memory为内存，real是真实仓储，不是浏览器标签页会话。 | 标明适用原型，勿用于真实应用操作承诺。 |
| O:62 卸船统计页：未实现，符合当前裁剪 | O:62；C/client/src/app.tsx:22。 | 无独立统计页路由；现一期明确不重建。 | 若新增须确认范围，不视作现有漏做。 |
| O:63 水尺换算：已被后续单位确认部分替代 | O:63 ↔ O:91；C/server/adapters/drizzle/drizzle-voyage-store.ts:27；voyage.service.ts:324。 | 水尺1–3为分钟，代码普通数值录入无吨位换算。 | 关闭旧“吨位换算”疑问，若仍需换算另提真实需求。 |
| O:68 库存接入/责任/频率：部分自行选定 | O:68；C/server/modules/imports/imports.service.ts:144；C/server/modules/admin/jobs.automation.ts:30。 | 仅手动导入库存，无库存云空间任务；错误行留批次，不自动进D08；责任/频率未定。 | 确认接入与责任及错误清单位置。 |
| O:69 断料日：已编码，后续部分确认 | O:69 ↔ O:112；C/server/engine/stock.ts:21、:30。 | 首次≤0，赶不上且回升则找下一次；“原序列已含排定到货”仍依赖数据含义。 | 收敛确认范围，验证序列是否确已含到货。 |
| O:70 缓冲与分档：暂定/文档矛盾 | O:70；C/server/config.ts:6、:11；C/server/modules/prediction/prediction.service.ts:84；C/server/engine/stock.ts:56。 | 默认3/15/25；config注释说3天已确认，O仍全部待确认，Service又写死3。 | 明确哪些已确认及边界≥；统一默认值来源，见S19。 |
| O:71 到港库存/多物料：已编码假设 | O:71；C/server/engine/recommend.ts:142；C/server/modules/prediction/prediction.service.ts:36。 | 窗口末日库存+整船tons除当日日耗；单item，多物料无分吨模型。 | 定义入库延迟与拼船分配，未定前不得暗示覆盖多物料保障。 |
| O:72 过期匹配：已编码暂定 | O:72；C/server/modules/imports/imports.service.ts:32、:34、:184。 | 双向包含、忽略空格大小写、至少2字；ETA/计划窗口变更触发，只取首匹配。 | 确认映射，见F04。 |
| O:73 品名/货物对应：映射未做，用包含替代 | O:73；C/server/modules/imports/imports.service.ts:184；prediction/prediction.service.ts:36。 | 提醒用包含，预测按单库存品名精确选；无权威映射表。 | 定义物料/别名/汇总项映射及版本。 |
| O:74 告急模式：已编码，连带确定缺陷 | O:74；C/server/engine/recommend.ts:89、:108；C/client/src/pages/Predict/PredictionDetailPage.tsx:96。 | 扩窗口找最快到港并显示调拨提示；模式未确认，B绕30%见F01。 | 确认模式和措辞；任何模式都先遵守锁定B门槛。 |
| O:75 跨路径：旧描述被后续确认替代 | O:75 ↔ O:113；C/server/engine/recommend.ts:29、:111。 | 每候选窗口始分流；当前先达标近端，再达标远端，非永远近端A。 | 以O113为准更新O75，见S16。 |
| O:76 NLP与开放问答：已实施限定解析 | O:76；C/server/nlp/parse.ts:1、:14；C/server/modules/prediction/prediction.service.ts:90。 | 规则词表与槽位解析，无生成模型自由回答，符合裁剪。 | 确认词表，不把P11名称当开放问答残留。 |
| O:77 语音：已选浏览器方案，平台未验证 | O:77；C/client/src/pages/Ask/AskPage.tsx:69。 | SpeechRecognition；不支持时提示文字，不自动演示；移动飞书可用性未知。 | 实机验证并确认降级，勿声称平台语音已通过。 |
| O:78 原始文件不入库：规则成立但防护缺口 | O:78；C/.gitignore:12、:67–71；D/.gitignore:7–9。 | 文档仓排Excel/CSV，代码仓未排；当前未发现文件，不能说已经泄露。 | 见数据红线表R01；不要读取真实文件内容。 |
| O:88 错误值行：已编码假设 | O:88；C/server/importers/inventory.ts:24；C/server/modules/imports/imports.service.ts:153；C/server/engine/stock.ts:9。 | 错误行留errorRows、排除series，不回填/不进D08；该日查询可能沿用前有效值。 | 确认跳过是否允许，以及展示/质量提示，勿将错误日当有效观测。 |
| O:89 长序列：未做特判 | O:89；C/server/importers/inventory.ts:27；C/server/modules/imports/imports.service.ts:199。 | 接收全部有效序列；趋势显示上限不代表导入截断。真实长序列是否误填未知。 | 等业务核实，不自行裁剪。 |
| O:90 可用天数公式：已被确认替代 | O:90 ↔ O:120；C/server/importers/inventory.ts:32；C/server/engine/recommend.ts:145。 | 当前值优先原表，可用天数到港后由系统算，与O120一致。 | 将O90标记被替代，保留两种口径标签。 |
| O:93 海船/驳船与航程吨级：已做简化 | O:93；C/server/engine/capacity.ts:17、:22；C/server/domain/routeRules.ts:44。 | 分母仅启用/容量，不看类别；航程也不按tier，见F03。 | 确认分池/分样本需求，不以已知简化替代规格确认。 |
| O:95 真实附件：外部交付不可静态证明 | O:95 ↔ O:132、:146；C/server/modules/imports/imports.service.ts:63。 | 后续文档声称部分已交，但与用户基线冲突；代码能解析不代表收齐。 | 核实交付范围及验证记录，不打开仓外真实附件。 |
| O:99 是否德信：已编码显示假设 | O:99；C/client/src/pages/BerthPlan/BerthPlanPage.tsx:11；C/server/engine/capacity.ts:35。 | owner不含“德信”则筛为否；某别名是否应算未知。CMR不读owner，不影响容量计算。 | 提供显示分类清单；保持筛选与容量资格分离。 |
| O:125 P50/P80算法：已编码暂定 | O:125；C/server/domain/routeRules.ts:6、:45。 | 线性插值并舍入两位；合成[1,2,3,4,10]的P80=5.2，最近秩法为4。 | 与德龙/业务确认算法及舍入，不自行选一种为正确值。 |
| O:126 覆盖终点：已编码暂定且两处重复 | O:126；C/server/engine/capacity.ts:27；C/server/importers/imipPlan.ts:52。 | 最晚靠泊，不是最晚卸完；文档“只改一处”不实，见O24/S19。 | 确认覆盖定义并统一输出来源。 |
| O:127 航程90天：可配置暂定 | O:127；C/server/config.ts:8；C/server/domain/routeRules.ts:33。 | 90天保留、90.01天剔除。与已确认导入日期±90天不是同一个规则。 | 单独确认样本上限，不借用导入确认。 |
| O:128 限流码：已编码技术假设 | O:128；C/server/lark/bitable.ts:6、:18；queue.ts:13。 | HTTP429及三个固定码转可重试异常；其他码不按此重试。 | 查官方码表/脱敏错误样本后验证；本轮未联网核实，不判码表已经错误。 |
| O:133 泊位类别：数据待提供且不参与 | O:133；C/server/adapters/drizzle/drizzle-master-store.ts:71；C/server/engine/capacity.ts:17。 | 适配器可读category；引擎不用，同容量不同类别全进分母。 | 明确是否保持容量-only，类别未提供不造值。 |
| O:134 估算航程：直接可生效，未见审核门 | O:134；C/server/domain/routeRules.ts:18；C/server/modules/prediction/prediction.service.ts:27。 | 只要T08启用且样本不足，就用经验值；不检查是否业务审核。真实T08是否已校对未知。 | 业务校对后才纳入上线验收，区分估算来源和业务经验。 |
| O:135 物流管理员改航次：按接口依据禁止 | O:135；C/server/domain/permissions.ts:14、:24；D/docs/handoff/claude-code-handoff.md:254。 | 物流管理员不能创建/改基础航次；当前有接口/交接依据，非漏授权的确定缺陷。 | 代录需求如变更需明确批准，更新未勾状态。 |
| O:136 仓储作业范围：已编码范围假设 | O:136；C/server/domain/permissions.ts:24。 | 仓储业务员/主管能改非本人任意大宗作业数据，金额仍不可改。 | 确认是否限经办人；未定前标权限范围风险，不能自行判定必须收窄。 |
| O:137 采纳写回：已编码并有范围差异 | O:137；C/server/modules/voyage/voyage.service.ts:359。 | 本港装侧写laycan，否则planDisch；待宣船且港口匹配；新建货名可待补。已有航次走needEdit，主管/admin不严格限“本人”。 | 明确采纳是否继承主管/admin编辑例外；统一“本人”措辞及占位货名规则。 |
| O:147 覆盖不足15天：外部数据问题 | O:147；C/server/engine/capacity.ts:33；recommend.ts:128、:139。 | 超覆盖为nodata，合格稀疏B可低可信；不切到航次填补近端。 | 记录数据覆盖，不自行补0或跨路径兜底；真实日期本轮未查库。 |
| O:148 汇总/分项：未定映射且描述不实 | O:148；C/server/modules/imports/imports.service.ts:184；C/server/nlp/parse.ts:41。 | 提醒只首项，非同时命中；NLP具体品名优先、类型总库存兜底有O87确认。 | 见F04；“汇总不参与”只是建议，不能当已决定。 |
| O:149 同泊位重叠质检：未实现，按要求等待 | O:149；C/server/engine/capacity.ts:34；C/server/modules/imports/imports.service.ts:98。 | 占用Set去重，不双算泊位；无同泊位重叠问题登记。 | 等业务决定是否加质检，不能称当前重复计容量。 |
| O:150 池外泊位：按锁定规则排除 | O:150；C/server/engine/capacity.ts:35。 | 池外不满足inPool/P.ids，不入CMR；符合规则2。 | 泊位池变更先改权威容量表，不从历史船记录自动扩池。 |
| O:154 兼容列：已编码推断 | O:154；C/server/domain/compat.ts:27、:58、:60、:68；C/server/modules/admin/compat.service.ts:69。 | 逾期、船名/供应商、货物类型、费用正负、交接、X1、到港日及今日在港均有推断映射且可写T09。合成不同旧语义会产生不同报表，期望待确认。 | 对照权威旧列说明与脱敏用例验收；不以能写入即正确。 |
| O:155 T09业务归属：已编码暂定 | O:155；C/server/domain/compat.ts:19；C/server/modules/admin/compat.service.ts:69。 | 物资备件只进T09a；T09b仅大宗。 | 确认归属，防下游漏船/重复。 |
| O:156 兼容元数据：已决定留空 | O:156；C/server/domain/compat.ts:33、:66；C/server/modules/admin/compat.service.ts:76。 | 创建/编辑信息写空字符串；整行覆盖会清空原已有值。 | 确认是否映射Base元数据及是否允许覆盖留空。 |
| O:157 T09b金额读取：外部授权待确认 | O:157；C/server/domain/compat.ts:57；C/server/modules/admin/compat.service.ts:66。 | 兼容表写完整费用，应用响应裁剪不保护直接读Base的下游账号。 | 核实Base和下游读取主体权限；静态代码不能证明已有泄露。 |
| O:171 部门推导：可配置暂定 | O:171；C/server/adapters/platform/platform-directory.ts:12、:34、:36；C/server/modules/ports/ports.module.ts:49。 | 合成“商务海运大宗联合部”先匹配大宗；无关键字403；物流固定仓储。可能影响金额权限，真实部门名未验证。 | 用实际组织映射确认跨部门及优先顺序，DEPT_MAP不是决策已确认的证据。 |
| O:175 业务时区与cron：业务时钟已有实现，cron待验证 | O:175；C/server/lib/dates.ts:40–41；C/server/adapters/drizzle/db.ts:8；C/server/modules/admin/jobs.automation.ts:39–45。 | 业务时钟固定UTC+8，避免直接取服务器UTC日；cron表达式未含时区声明。业务时钟正确不证明平台任务按同区触发。 | 与H3合并确认cron时区；仍需各入口日期边界验证，不能把时钟函数存在当全链路通过。 |
| O:176 页面慢原因：外部记录/待验证，未确定归因 | O:176；D/docs/handoff/local-env.md:190、:200；C/server/adapters/memory/live-snapshot.ts:13；C/server/modules/imports/imports.service.ts:161、:175。 | 文档声称本机链路慢并建议将来缓存，尚无本轮环境/测量证据。快照及库存查询确有多次仓储读取；不能据此断定上线一定快或慢。 | 分离网络往返、SQL数量/耗时、前端等待后再决定缓存；不自行改代码，不把推测写成性能验收。 |
| O:177 显示名：已实现姓名线索依赖，真实网关待验证 | O:177；C/server/adapters/platform/role-members.ts:62–66；platform-directory.ts:33；D/docs/handoff/local-env.md:204。 | 无姓名线索且缓存空时只返回null，名称可能回退用户ID；现搜索依赖姓名，不能靠“按ID搜索”当然解决。 | 核实真实网关userName来源与平台支持的查询；身份目录扩展如需新表应先更新schema，不能自行造字段。 |

另有14条平台联调假设（D/docs/handoff/claude-code-handoff.md:327–342），并非全部都是未确认业务事项：

| 冲突项 | 位置 | 影响 | 建议解决方式 |
| --- | --- | --- | --- |
| H1 roles为bizID | D/docs/handoff/claude-code-handoff.md:329；C/server/adapters/platform/platform-directory.ts:30；O:170。 | 角色名称约定已确认，实际请求roles形状仍未由本轮验证。 | 核实请求字段，不将精确映射代码当平台证据。 |
| H2 members.list包含姓名/部门：已过时 | 同文:330、:185 ↔ O:161；C/server/adapters/platform/role-members.ts:44、:52。 | 当前改为按姓名search再ID匹配、默认10分钟缓存，非旧members.list/5分钟全量目录。 | 更新交接目录算法和缓存，标明真实验证记录的证据冲突。 |
| H3 自动化注册/时区 | 同文:331；C/server/modules/admin/jobs.automation.ts:30。 | 六触发器声明不证明平台注册成功、cron按哪个时区。 | 发布验证单独留证；固定UTC+8业务时钟不能证明cron同区。 |
| H4 dev注入SDK/DB | 同文:332；C/server/modules/ports/ports.module.ts:36；C/server/lark/lark.module.ts:36。 | real缺注入会抛错；代码不能证明本地dev可注入。 | 真实启动测试另行安排，本轮未启动。 |
| H5 限流码 | 同文:333；O:128；C/server/lark/bitable.ts:6。 | 已按固定码分类重试。 | 与O128合并技术验证。 |
| H6 record_id形状 | 同文:334；C/server/lark/gateway.ts:26；compat.service.ts:76。 | 整表重写依赖listAll返回record_id。 | 确认分页返回和ID形状。 |
| H7 人员写法 | 同文:335；C/server/adapters/drizzle/drizzle-voyage-store.ts:166、:209。 | feishuUserId→人员数组，指定user_id；查不到ID时不写负责人。 | 验证空ID/未登录负责人及真实镜像复合类型。 |
| H8 编号/createdAt | 同文:336；C/server/adapters/drizzle/drizzle-voyage-store.ts:96、:193。 | 编号依赖自动编号同步列；createdAt也被当初始ETA更新时间兜底。 | 验证跨年、异步回写及createdAt来源。 |
| H9 关联JSON | 同文:337；C/server/adapters/drizzle/dict.ts:23。 | 识别link_record_ids结构，其他形状可变空关联。 | 用脱敏真实形状验证null/空/多关联。 |
| H10 旧表时区 | 同文:338；O:10。 | 固定WITA解释来源时间。 | 分来源确认，与O10合并。 |
| H11 兼容列 | 同文:339；O:154–156；C/server/domain/compat.ts:27。 | 列含义推断已进入可写代码。 | 逐列签认，不能以假飞书通过作为语义验收。 |
| H12 库存映射 | 同文:340；O:72、:148；C/server/modules/imports/imports.service.ts:184。 | 包含匹配且首项返回。 | 合并F04和映射决策。 |
| H13 RLS/会话 | 同文:341；C/db/002-restrict-anon-read.sql、003-restrict-anon-read-mirror.sql。 | SQL存在不证明实际角色/会话/策略已部署生效；PGlite助手不验证平台RLS。 | 核验部署及匿名/登录身份结果，勿把本报告当RLS验收。 |
| H14 飞书公式异常 | 同文:342、:94 ↔ O:131；C/server/domain/status.ts:30。 | 部分后续记录称已修，旧交接仍称异常；后端另算不证明Base正确。 | 四项逐项记状态、版本与验证，不能概括全部正常或全部异常。 |

## 5. 进度表与代码实际状态

所有“实现存在”均仅指当前源码存在及已装配，不证明本轮测试通过、真实联调通过或上线。未找到一整行标完成却仅有memory适配的情况；更主要问题是旧占位描述未清理、概括全接口完成，以及T10/正式迁移缺口。

| 冲突项 | 位置 | 影响 | 建议解决方式 |
| --- | --- | --- | --- |
| **P1 文档缺陷：A01–A30/全部写完概括过度** | D/docs/handoff/README.md:19、:28 ↔ 同文:32；D/docs/implementation-plan.md:402；C/server/modules/admin/admin.controller.ts:9；C/client/src/pages/Admin/AdminPage.tsx:35。 | 依完成声明请求POST /api/admin/migrate → 无对应业务路由；仅本地dry-run，正式迁移尚未实现。T10同步缺口另见F06。 | 完成状态逐接口列，明确A27及T10例外；不把“全部服务测试”扩大成全部范围完成。 |
| **P2 文档缺陷：旧运行位置误导** | D/docs/development-workflow.md:72–89、:91；D/docs/handoff/claude-code-handoff.md:39、:198、:222；D/docs/handoff/deploy-flow.md。 | 交接主段说明代码已分仓，执行段仍让cd app/拉main；当前代码仓并无app目录。另workflow:76指向当前scripts不存在的build-ddl.mjs。照抄会走错仓库或找不到脚本。 | 当前命令写代码仓绝对路径；冻结app仅标历史映射；明确DDL生成器属于文档仓还是已不再使用。 |
| 第72行 脚手架：代码存在 | D/docs/development-workflow.md:72；C/server/app.module.ts:17；C/client/src/app.tsx:20。 | Nest/React/Drizzle及路由存在；不是仅空骨架。目录旧说法需映射。 | 状态分“代码存在/环境验证”，不照仓库旧背景称没有业务代码。 |
| 第73行 领域层：实现存在，旧测试非本轮证据 | D/docs/development-workflow.md:73；C/server/domain/status.ts:13；C/server/engine/recommend.ts:160；C/server/nlp/parse.ts:102。 | 领域/引擎/NLP为正式源码，不只测试夹具；旧“测试通过”不等于当前通过。 | 为测试结果标commit与日期；规则问题见F项。 |
| **P2：第74行预测“采纳仅标记”已过时** | D/docs/development-workflow.md:74 ↔ :78；C/server/modules/prediction/prediction.service.ts:57；C/server/modules/voyage/voyage.service.ts:360。 | 合法采纳会新建航次或写窗口再标采纳，副作用超过“仅标记”。 | 更新采纳状态，说明写入及幂等边界。 |
| **P1：第75行真实数据端口仍写待接入** | D/docs/development-workflow.md:75 ↔ :79、:83；C/server/modules/ports/ports.module.ts:46–52。 | real已装配主数据/航次/导入/预测/目录等实现；按旧行会重复开发。 | 改“适配器已写好，真实环境未验证”；非memory-only。 |
| 第76行 建库：SQL有，执行状态不可推断 | D/docs/development-workflow.md:76；C/db/001-ssps-core.sql:7、:446；C/db/004-import-columns.sql。 | D01–D12 DDL存在；不能从文件推出真实库已执行。生成脚本位置问题另列。 | 区分脚本完成和数据库部署/策略验收。 |
| **P1：第77行航次仓储待接入已过时** | D/docs/development-workflow.md:77 ↔ :83；C/server/modules/voyage/voyage.controller.ts:18；C/server/adapters/drizzle/drizzle-voyage-store.ts:46。 | 正式控制器、服务和Drizzle写链路存在；列“待真实仓储”与后文相反。 | 保留真实验证待做，删除实现不存在的描述。 |
| 第78行 主数据/质量/采纳：有实现 | D/docs/development-workflow.md:78；C/server/modules/master/master.service.ts:34、:196；C/server/modules/voyage/voyage.service.ts:389；C/server/adapters/memory/live-snapshot.ts:13。 | CRUD、重算、关闭问题、采纳和动态快照有正式代码；LiveSnapshot也装配于real。 | 不因memory目录名判成仅内存功能。 |
| **P1：第79行目录仍称占位** | D/docs/development-workflow.md:79 ↔ :86；C/server/adapters/platform/platform-directory.ts:25、:43；role-members.ts:44。 | 身份目录/搜索/匹配/缓存已有实现；预测导入日志等也有Drizzle。 | 统一“已有实现，平台形状及授权仍待验证”，不把目录说占位。 |
| 第80行 A18云空间：代码存在 | D/docs/development-workflow.md:80；C/server/lark/drive.ts:9；C/server/modules/imports/imports.service.ts:115。 | 有HTTP客户端及pull路径；缺配置503；不代表真实云空间权限可用。 | 保留未真实验证限定。 |
| 第81行 导入：代码存在但不含T10同步 | D/docs/development-workflow.md:81；C/server/lib/xlsx.ts:52；C/server/importers/imipPlan.ts:27；inventory.ts:15；C/server/adapters/drizzle/drizzle-import-store.ts:25。 | 上传、解析、校验和事务切批次均有；real仍只落应用库，见F06。 | 完成范围限定到实际步骤。 |
| **P2：第82行系统管理编号范围过宽** | D/docs/development-workflow.md:82；C/server/modules/admin/admin.controller.ts:11–16；D/docs/implementation-plan.md:402、:404。 | 日志/自检/补偿/兼容存在；A27不在，A29实际为解析。 | 按实际端点列举，见S13。 |
| 第83行 飞书仓储：real实现存在 | D/docs/development-workflow.md:83；C/server/adapters/drizzle/drizzle-master-store.ts:22；drizzle-voyage-store.ts:190；C/server/lark/outbox.ts。 | 主数据/航次→Gateway/Outbox→镜像回写，非内存占位；假飞书测试不能替代真实API行为。 | 与75/77行收敛，保留验证边界。 |
| 第84行 定时任务：声明存在，注册未知 | D/docs/development-workflow.md:84；C/server/modules/admin/jobs.automation.ts:30–46。 | 六BindTrigger有实现，不能证明已注册、按正确时区运行或多实例不重入。 | 写“已声明，平台注册/调度未验证”。 |
| 第85行 扫描/库存过期：有实现且映射未定 | D/docs/development-workflow.md:85；C/server/modules/voyage/issue-scan.service.ts:31；C/server/modules/imports/imports.service.ts:175。 | MMSI/ETA扫描和stale有正式逻辑；首匹配和映射风险见F04。 | 不将接口存在写成业务映射已通过。 |
| 第86行 身份：非占位 | D/docs/development-workflow.md:86；C/server/adapters/platform/platform-directory.ts:25；role-members.ts:44。 | 无角色拒绝、部门映射、用户ID匹配均存在；当前搜索实现与旧交接members.list不同。 | 与79行及H2统一。 |
| 第87行 迁移dry-run：存在，正式写入无 | D/docs/development-workflow.md:87；C/server/importers/migrate-plan.ts:27；C/scripts/migrate-dryrun.ts。 | 清洗/统计/确认清单可用源码；未实现正式批量写入/断点续跑/账号映射。 | 保持dry-run与正式迁移分项。 |
| 第88行 安全性能：局部代码有，不等于验收 | D/docs/development-workflow.md:88；C/server/common/filters/exception.filter.ts:65；C/server/lib/xlsx.ts:7、:28。 | 堆栈隐藏/解压上限等存在；无本轮真实规模/平台RLS验收。 | 将局部检查与整体安全/性能完成分开。 |
| **P1：第89行11页完成概括与待开发描述失配** | D/docs/development-workflow.md:89 ↔ :80、:82；C/client/src/app.tsx:22–32；C/client/src/pages/Admin/AdminPage.tsx:13、:31、:35；C/server/modules/imports/imports.controller.ts:37。 | 页面路由都有，但P10迁移仍说明占位；A26前后端已接，不应说后端未开发；A18后端已有，P07仍无云空间拉取入口。 | 分页面功能记录；将A26/A18实现存在与未联调区分，A27继续未开发。 |

本轮未发现有效文档正面宣称业务功能“已上线”。“Base/库已建设”“真实环境已复测”即使最终属实，也不等于应用功能上线；其中真实性仍按S18处理。

## 6. 虚构数据与原始文件红线

本节仅报告位置、类型及统计，不复述船名、合同号、人名、联系方式或原始数据内容。没有找到可证实泄露的原始Excel，**因此不虚报P0泄露事件**。

| 冲突项 | 位置 | 影响 | 建议解决方式 |
| --- | --- | --- | --- |
| **R01 · P1 风险：文档称已防误提交，代码仓未排Excel/CSV及裸.env** | D/CLAUDE.md:53–54；D/docs/handoff/claude-code-handoff.md:75–76；O:78；D/.gitignore:2、:7–9 ↔ C/.gitignore:12、:67–71。 | C仅排.env.local/.env.*及migration-out，未排*.xlsx/*.xls/*.csv，也未排裸.env。只读git check-ignore对合成路径.env、audit-probe.xlsx/.xls/.csv均未匹配。若把真实导出/含密钥.env放根目录后宽泛暂存，可被提交。当前未发现这些数据文件，且未读取任何env内容，不能宣称已泄露。 | 将文档仓红线同步到真正开发仓的忽略/提交检查；密钥仍不得写入裸.env或其他可提交文件。本轮只报告不修改。 |
| 原型身份数据：未发现可证实真实身份混入，真实性仍有证据边界 | D/prototype/mock-data.js:2–3、:173、:401；C/server/test/fixtures/prototype/mock-data.js同位置。 | 文件声明手工构造及身份虚构；两份逐字节一致，未命中联系方式样式。声明和一致性不能独立证明每个名称均虚构；没有原始导出/生成来源作真实性核验，本轮不作“100%无真实身份”保证。 | 保留虚构声明及生成来源；如需真实性保证，仅由有权人员与源数据在本机比对，报告只回位置/类型。 |
| 种子：未发现船/合同/人员联系字段 | D/docs/schema/seed/T01-ports.json:1；T02-berths.json:1；T08-routes.json:1；C/server/adapters/memory/seed.ts:1、:24。 | 结构为10港口/23泊位/10估算航程，没有船名、合同、人名、手机或邮箱字段。真实泊位容量属于用户指定权威规范，不等于真实航次泄露。 | 不将允许的港口/泊位规范误报成真实船/合同数据；估算航程审核风险另见O134。 |
| 测试夹具/种子一致性：本轮核对一致 | C/server/test/fixtures/README.md:3、:7–12；fixtures/prototype/；fixtures/base-plan.json；fixtures/T02-berths.json。 | 原型engine/mock-data/nlp、base-plan、T02种子与文档源文件5组均逐字节一致；测试/helpers及内存种子未命中联系方式样式。只能证明一致及未命中，不能证明业务真实性或测试通过。 | 后续修改保留源与夹具核对；不要把假飞书认可的字段值当真实API验收。 |
| 当前非依赖文件检查：未发现原始表格或压缩包 | C代码工作区非依赖623文件；D非冻结文档/原型等159文件。 | 包含未跟踪与被忽略的可枚举文件；跳过.git、node_modules、.venv和D/app冻结代码，未读取env。未发现xls/xlsx/xlsm/xlsb/csv/zip/7z后缀文件。未对仓外原始文件做读取。 | 如未来发现原始业务Excel入仓，按用户定义列P0，仅报位置/类型，不回传内容。 |
| 可达Git历史：未发现Excel/CSV/压缩包路径 | 结束复核C所有可达引用853对象；D所有可达引用2069对象；只读git rev-list --objects --all。 | 未发现上述扩展名路径。审计过程中另扫描520个代码仓及950个文档仓历史文本blob的凭证形状，排除所有env对象；未找到可确认凭证命中。文本扫描与结束路径复核是不同时间的快照，不声称逐blob扫描覆盖后来新增的所有提交。未读取.env.local。 | 这是可达历史和指定模式扫描；不覆盖未取回远端、不可达对象、加密/改名容器及所有可能的自定义凭证格式，不写成完整无泄露证明。 |

## 7. 已移除功能残留逐项核查

本轮未发现七项被移除功能的生效业务实现、生成式自由回答、有效功能路由或启用开关。唯一明确错误是S02字段字典的风险标记语义；保留“风险”一词、费用事实或否定测试不能据此认定功能复活。

| 冲突项 | 位置 | 影响 | 建议解决方式 |
| --- | --- | --- | --- |
| DWRS/六维/综合评分：无生效实现 | D/CLAUDE.md:41；D/docs/implementation-plan.md:44；D/docs/handoff/claude-code-handoff.md:53；C/server/engine/recommend.ts:1、:22、:24。 | 范围文本明确移除；推荐用CMR或船数，非六维评分。urgent偏离排序的问题另见F01，不因没有DWRS就免审。 | 保留禁止条款；不把NLP关键词计数当DWRS。 |
| 关键词score：非DWRS残留 | C/server/nlp/parse.ts:50–53；C/server/test/fixtures/prototype/assets/nlp.js:28–31；D/prototype/assets/nlp.js:28–31；D/prototype/P02-prediction-v2.html:197–199。 | score只选船型关键词，不给发船方案综合打分；v2又是未采用草图。 | 无需删除；标清计数用途即可。 |
| 风险标记：错误字典存在，体系未生效 | D/docs/schema/mirror-columns.md:127；C/server/domain/voyage.ts:8；C/server/modules/voyage/voyage.service.ts:240。 | 错字典的滞期风险会被合法异常枚举拒绝；取消/延期/移泊/改港是保留业务。 | 修S02字典，不删除合法异常标记或取消排除规则。 |
| 库存“按风险”：非被裁剪体系 | C/client/src/pages/Ask/AskPage.tsx:20、:190；D/prototype/P11-ask.html:207、:220；C/server/engine/stock.ts:56。 | 按库存可用天数分档，不写风险实体或DWRS。 | 保留；是否改称紧张程度属于可选文案建议，非缺陷。 |
| ETA风险说明：仅修订历史用途注释 | C/db/001-ssps-core.sql:6、:21；D/docs/schema/D-app-db.md:13；D/docs/implementation-plan.md:307。 | D01存ETA修订，不生成风险标记等级，也不参与综合评分。 | 如要消歧可改称ETA修订/学习样本；不因注释删D01。 |
| 成本决策：无决策模块，费用事实合法 | C/server/domain/voyage.ts:40–47；C/client/src/pages/Voyages/VoyageDetailPage.tsx:15、:17、:323；D/docs/schema/T06-bulk-settlement.md:20、:30。 | 滞期/速遣/港务/装卸费为结算事实，未用于预测成本优化；金额隔离仍须审计。 | 保留T06；不把事实字段当裁剪模块残留。 |
| Plan C/D：只有禁止或拒绝用例 | C/server/engine/recommend.ts:160；C/server/modules/prediction/prediction.dto.ts:19、:24；C/server/test/rules.spec.ts:55；prediction-service.spec.ts:99。 | 生成只A/B；合成label=C会被DTO/服务拒绝，没有第三第四方案。测试中的C是负例。 | 保留拒绝测试及移除说明。 |
| AI开放问答：ask为限定解析入口 | C/client/src/app.tsx:28；C/client/src/pages/Ask/AskPage.tsx:36、:126；C/server/modules/prediction/prediction.controller.ts:14；prediction.service.ts:90；C/server/nlp/parse.ts:2、:102；O:76。 | 合成“明天天气如何”只进入槽位解析/缺失项，不调用模型自由回答或天气API；P11不等于AI开放问答。 | 保留符合K14的预测入口；继续约束文案数值只能引用引擎。 |
| 天气：无预报实现；小雨保函不是天气 | C/server/domain/voyage.ts:40；C/client/src/pages/Voyages/VoyageDetailPage.tsx:323；D/docs/schema/T06-bulk-settlement.md:10、:11。 | 小雨保函是责任文件字段，无天气预报数据源。 | 不误删业务字段。 |
| 微信转发：无发送链路 | D/docs/implementation-plan.md:69；D/docs/schema/base-build-agent-prompt.md:90；D/CLAUDE.md:41。 | 微信群下载描述上游文件来源；保密提示提到微信不构成转发功能；未见有效微信发送路由/客户端。 | 保留来源描述及禁止说明。 |
| 已移除清单/审计提示本身：非残留功能 | D/CLAUDE.md:41；D/docs/implementation-plan.md:44；D/docs/handoff/claude-code-handoff.md:53；D/docs/handoff/codex-audit-prompts.md:32、:74、:199、:287；O:76。 | 这些命中是禁止要求和核查提问，非实现证据。 | 保留，避免关键词命中式误报。 |
| 原型和详情“不评分”说明：非评分模块 | D/prototype/index.html:46；D/prototype/engine.js:129；C/server/test/fixtures/prototype/engine.js:129；D/prototype/P02-prediction.html:432、:448、:496；P03-prediction-detail.html:262、:266、:327、:328；C/client/src/pages/Predict/PredictionDetailPage.tsx:94。 | 文案说明硬约束不参与评分，并非重新引入权重。 | 保留解释；数值与路径仍需后续批次逐层核查。 |

## 8. 规格优先级与尚需裁决的边界

建议本轮问题处理顺序：F01先修；F02/F06和状态/类型字典、完成度误写其次；所有会影响预测数值、兼容金额或权限的未确认事项在上线前逐项定案。此顺序是审计建议，没有修改实现或替业务批准任何暂定规则。

建议文档权威链：用户本轮锁定规则 → 明确已确认且已同步的决策 → 对应schema/status-rules/接口清单 → 实施/交接说明。平台真实数据形状以可归属的脱敏实测和生成schema为技术证据，不能覆盖业务规则。实施计划声明在线版为准，本轮仅审本地快照，没有读取在线版；如线上规格另有修改，需提供可归属版本后复核，不能推定一致。

尚不能消解：普通与库存跨15天窗口的目标日定义、远期B资格含义、竞争船模型、覆盖终点、销售结束节点、大宗抵装港状态、备件空规则借用条件、旧表时区、兼容列和元数据、物料映射/汇总项、多物料吨数、部门/跨部门及下游金额授权。代码已有选择不等于业务已确认。

明确排除的误报：T09拆a/b所以T01–T10为11张实体表不是编号缺陷；“已结束（取消）”不是自创第9个单选状态；D13只在未采用的用户目录备选方案出现，不是已建业务表；原型泊位容量声明示例，不能拿截图分母直接推翻T02真实规范；P02-v2为未采用草图，不按其删S1/低可信条款验收当前v1。

本报告没有提供一般可读性/重构建议清单；建议均服务于已定位的冲突或上线风险。后续全量审计仍按第1.3节进行，真实飞书/妙搭、并发压力及RLS行为未被本轮验证。


