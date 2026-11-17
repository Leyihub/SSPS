# 08 · 构建、部署与运行审计

**上线前必须先解决的阻断项清单：D08-01 生产环境可静默落入内存及兜底身份；D08-02 内存业务存储可连接真实 Base 并清空兼容表；D08-03 请求与响应业务明细进入平台日志；D08-04 release/push 忽略 DryRun；D08-05 提交入口未阻止原始业务文件进入远端。以上为 5 项 P0，其中包括条件性数据损坏／泄漏风险，均需在首次业务发布前处理。另有 S08-01 启动入口冲突、S08-02 构建工具依赖缺失两项疑似阻断，须取得平台构建／运行契约或隔离构建证据后裁定。**

## 1. 结论、对象与证据边界

- 日期：2026-11-06，Asia/Shanghai。
- 本轮最终范围：用户明确选择“直接完成部署专项审计并写入 08-deploy.md”。模块盘点保留在第 3–5 节；全量业务规则审计的后续安排见第 13 节。
- 代码仓：C:\Users\董金\ssps-miaoda；分支 sprint/default；检查期间 HEAD 为 3eddf0a0dcd10f50e572142a2038efb0c7caf1b3。
- 文档仓：C:\Users\董金\WorkBuddy\SSPS。该仓 app/ 是冻结备份，不作为本次代码审计对象。
- 共列 12 项发现：5 项 P0、7 项 P1；其中 5 项归为缺陷、7 项归为风险。另列 2 项疑似问题，未计入已确认发现。严重度沿用用户定义，P0 风险不表示已经发生事故。
- 尚无业务功能上线。本报告没有将历史本地验证、静态推导或单元测试表述为生产环境实测。
- 所有代码事实来自本次读取。每个发现提供触发条件、实际分支与期望行为；涉及 push、release、真实 Base 写入和日志上报的触发场景均只作静态推导，未执行危险操作。
- 代码仓没有本审计产生的文件写入；唯一写入为本文档。未执行 Git 写操作、部署／同步脚本、平台 CLI、应用 dev 启动、安装或构建。
- 未读取 .env.local；只读取了已跟踪、无密钥的 .env 模板。没有读取原始 Excel 或真实业务文件内容，也没有查询真实飞书、妙搭或数据库。
- 代码仓首次盘点时有 7 个修改文件，中途工作区清洁，测试结束后观察到 6 个并发修改，末次状态快照增至 8 个文件：client/src/pages/Capacity/CapacityPage.tsx、client/src/pages/Capacity/p06.css、server/adapters/drizzle/drizzle-import-store.ts、server/adapters/memory/live-snapshot.ts、server/adapters/memory/memory-import-store.ts、server/modules/imports/imports.service.ts、server/ports/import-store.port.ts、server/test/drizzle-stores.spec.ts。本审计没有发起这些修改。单元测试结果不能证明这些文件的最终未提交版本通过；部署专项核心脚本及发现涉及的关键装配文件另作内容哈希复核。
- 路径约定：下文 server/、client/、scripts/、package.json 等代码位置相对于代码仓；明确标注“文档仓”的路径相对于文档仓。行号以本次读取版本为准。

## 2. 规格阅读与冲突处理

已完整阅读 CLAUDE.md、docs/schema/status-rules.md、docs/handoff/claude-code-handoff.md，已读 docs/implementation-plan.md 开头决策表（实际有 K01–K14）。部署专项另核对 docs/handoff/deploy-flow.md、local-env.md、task-book.md 的相关条款，并浏览 docs/open-questions.md；未确认业务事项不自行补齐。

| 依据差异 | 处理方式 |
| --- | --- |
| 代码仓 AGENTS.md 开头仍称“空骨架”，实际存在业务模块和 P01–P11。 | 平台约束继续适用，模块地图按当前入口与依赖确认。 |
| 用户任务背景及交接手册 :5 说从未连接真实环境；local-env.md :54、:101、:119、:128、:160 的章节记录了部分真实环境验证。 | 分开记录两种记载，建议按能力、版本、环境、日期维护验证台账；不据此推断任何业务已上线。 |
| 交接手册 :205 仍说本地用 .env；deploy-flow.md :64 明确 .env 为跟踪模板，密钥放 .env.local。 | 遵守用户当前约束和部署分仓规则，不读取后者、不向模板写密钥。 |
| 实施计划 :3 自述在线版优先，本次任务却指定本地文档作为依据。 | 本轮以用户锁定规则及指定本地规格审计；未访问在线实施计划。 |
| W51 要求当次人工授权，脚本只检查 Reason，见 D08-06。 | 区分流程要求与脚本实际保护，不把传入发布理由视作已取得授权的证据。 |

## 3. 后端模块清单与职责

以下路径相对于代码仓。职责来自实际入口、导入、构造器和接口声明；不表示功能已在真实环境验证。

### 3.1 应用入口及业务模块

根装配依据：`server/app.module.ts:16`。

| 模块／路径 | 一句话职责 | 主要依赖 |
| --- | --- | --- |
| `server/main.ts`、`server/app.module.ts` | 启动平台 Nest 应用，注册业务模块、全局异常过滤和最后的页面兜底模块。 | 平台 `PlatformModule`、下列业务模块 |
| `server/modules/ports/` | 注册数据与身份端口的具体实现，并挂载全局业务角色守卫。 | `lark/`、memory/drizzle/platform adapters；`ports.module.ts:34`、`:45` |
| `server/modules/prediction/` | 提供预测、库存倒推、限定自然语言解析、预测详情、采纳及宣船文案接口。 | `SNAPSHOT_PORT`、`PREDICTION_STORE`、引擎、解析器、`VoyageService`；`prediction.service.ts:20` |
| `server/modules/capacity/` | 基于统一快照提供港口日历与单日容量详情。 | `SNAPSHOT_PORT`、`createCapacity`、结果序列化；`capacity.service.ts:11` |
| `server/modules/voyage/` | 管理航次、货物、时间节点、ETA 修订、扩展字段及数据质量问题扫描。 | 航次与身份端口、领域权限／状态／时序规则；`voyage.service.ts:38` |
| `server/modules/master/` | 管理当前用户、港口、泊位、船舶及航程规则和样本重算。 | 主数据、航次、身份、运行日志端口；`master.service.ts:34` |
| `server/modules/imports/` | 处理靠船计划与库存导入、批次查询、库存趋势及云空间拉取服务。 | 导入／主数据／航次／身份端口、xlsx 与清洗器、库存算法；`imports.service.ts:37` |
| `server/modules/admin/` | 提供日志、自检、补偿重放、兼容表刷新，并装配六个自动化任务。 | Voyage、Imports、Master 模块，健康／日志端口、Outbox、飞书网关；`admin.module.ts:10` |
| `server/modules/view/` | 承接平台页面与静态前端的兜底路由。 | 平台页面运行机制；在 `app.module.ts:34` 最后注册 |
| `server/modules/hello/` | 保存脚手架示例代码。 | 当前 `hello.module.ts:1` 起是注释示例，未在根模块注册 |

管理模块内部的三条关系：

- `AdminService` → 日志／健康端口 + Outbox + 主数据与航次重放处理器（`admin.service.ts:15`）。
- `CompatService` → 航次／主数据端口 + BaseGateway，并订阅 `VoyageService.onSaved`（`compat.service.ts:22`）。
- `JobsAutomation` → Imports、Master、IssueScan、Admin、Compat 服务，另注入云空间客户端（`jobs.automation.ts:19`）。

### 3.2 领域、基础设施与测试

| 模块／路径 | 一句话职责 |
| --- | --- |
| `server/config.ts` | 集中保存业务算法采用的阈值与暂定口径。 |
| `server/domain/` | 定义航次与主数据模型，推导状态、验证节点时序、计算航程统计、判断权限并生成兼容表行。 |
| `server/engine/` | 计算泊位 CMR／远期重叠船数、库存断料和 Plan A/B，生成 S1 溯源、存储记录、接口结果及宣船文案。 |
| `server/nlp/` | 将有限业务问法解析为预测或库存查询参数。 |
| `server/importers/` | 清洗靠船计划和库存输入，并处理历史航次的归并、去重、别名与迁移确认项。 |
| `server/lib/` | 提供日期工具和 xlsx 读取能力。 |
| `server/ports/` | 定义航次、主数据、导入、预测、快照、目录、用户映射、健康和日志接口及注入令牌。 |
| `server/adapters/memory/` | 提供本地内存存储、身份、用户映射和演示种子，并放置组合快照类 `LiveSnapshot`。 |
| `server/adapters/drizzle/` | 使用平台数据库读写自有表和镜像，配合飞书网关、幂等及补偿实现真实仓储。 |
| `server/adapters/platform/` | 适配平台角色成员查询、登录用户解析、姓名／部门／飞书用户映射。 |
| `server/lark/` | 装配飞书凭证提供者、Base 与 Drive 客户端、分页和批量操作、写队列、字段映射、自动编号及 Outbox。 |
| `server/common/` | 提供全局业务角色守卫、异常过滤、响应码与公共响应接口。 |
| `server/database/` | 保存由平台工具生成的 Drizzle 表定义。 |
| `server/test/` | 保存领域、引擎、服务、仓储、权限等测试，以及 PGlite、假飞书和原型对照夹具。 |

`LiveSnapshot` 虽位于 `adapters/memory/`，根装配中会组合所选的主数据、航次与导入端口（`server/modules/ports/ports.module.ts:54`）；不能仅按目录名称认定它只参与演示。

## 4. 前端模块清单与职责

业务路由依据：`client/src/app.tsx:20`；导航依据：`client/src/components/Layout.tsx:8`。

| 页面／模块 | 路由 | 一句话职责及后端连接 |
| --- | --- | --- |
| P01 `pages/Workbench/` | `/` | 汇总工作台航次、待办质量问题与用户信息，读取 voyage、data-issues 和 me。 |
| P11 `pages/Ask/` | `/ask` | 提供智能提问和库存预测入口，使用解析、库存、预测相关接口。 |
| P02 `pages/Predict/PredictPage.tsx` | `/predict` | 录入预测条件、呈现 A/B 方案、日历与库存信息，并衔接采纳和宣船。 |
| P03 `pages/Predict/PredictionDetailPage.tsx` | `/predictions/:runNo` | 展示已保存预测、S1 溯源、库存与泊位详情和宣船内容。 |
| P04 `pages/Voyages/VoyageListPage.tsx` | `/voyages` | 查询、筛选、导出和新建航次。 |
| P05 `pages/Voyages/VoyageDetailPage.tsx` | `/voyages/:id` | 查看或维护航次节点、ETA、货物、结算和销售扩展。 |
| P06 `pages/Capacity/` | `/calendar` | 展示查询吨级下的容量日历和单日明细。 |
| P07 `pages/BerthPlan/` | `/berth-plans` | 上传、查看靠船计划批次及清洗结果。 |
| P08 `pages/Master/` | `/master` | 维护港口、泊位、船舶和航程规则并触发航程重算。 |
| P09 `pages/Quality/` | `/data-quality` | 查询数据质量问题、更新处理状态并进入相关航次。 |
| P10 `pages/Admin/` | `/admin` | 查询运行日志与自检结果，手动刷新兼容表。 |
| `pages/NotFound/` | `*` | 提供平台未匹配路由页面。 |
| `pages/Home/`、`pages/ExamplePage/` | 当前未注册 | 保留脚手架首页与示例页面，不能据目录存在认定可从当前业务路由进入。 |
| `ssps/api.ts` | 页面共用 | 使用平台 `axiosForBackend`、React Query 和写入幂等键封装业务接口；当前业务请求主入口见 `:4`、`:9`、`:10`。 |
| `ssps/hooks.ts`、`format.ts`、`cmr.ts` | 页面共用 | 提供港口名称映射、格式化、容量显示分类等辅助能力。 |
| `ssps/ui.tsx`、`StockChart.tsx`、样式文件 | 页面共用 | 提供业务弹窗、状态标签、空／错误提示、库存图与样式。 |
| `components/Layout.tsx` | 业务路由外壳 | 提供侧边导航、当前页框架与用户信息入口。 |
| `components/ui/` | 通用组件 | 提供 shadcn 风格基础 UI、图标和交互组件。 |
| `components/business-ui/` | 平台组件 | 提供人员、部门、群聊选择与展示、表单及相关平台查询封装。 |
| `api/index.ts` | 模板扩展点 | 保留平台请求示例；已读内容为注释示例，业务请求实际集中在 `ssps/api.ts`。 |
| `hooks/`、`lib/`、`types/`、`utils/` | 公共辅助 | 提供通用 hooks、工具、错误信息提取、类型和资源占位信息。 |
| `index.tsx` 与全局 CSS | 前端入口 | 承载平台客户端入口与基础样式；后续部署审计会核对其平台装配关系。 |

## 5. 模块调用关系

1. **业务请求**：React 页面 → `ssps/api.ts` → 平台 axios → Nest 业务控制器 → 全局 `SspsRoleGuard`／身份目录 → 业务服务 → ports → 选定适配器。
2. **预测读取**：Prediction／Capacity 服务 → `SNAPSHOT_PORT` → `LiveSnapshot` → 主数据、航次、导入端口 → 领域转换与 engine → 结果序列化 → 前端。
3. **预测保存与采纳**：Prediction 服务 → 预测存储端口保存预测及方案；采纳流程再调用 `VoyageService` → 航次存储端口。
4. **真实写入架构**：航次／主数据服务 → Drizzle 仓储 → Outbox → BaseGateway → 飞书客户端与写队列；仓储同时承担镜像回写和自有表日志。正式审计将逐段验证提交顺序、异常、幂等和平台 streaming 交错，当前不宣称其正确。
5. **导入**：上传控制器或云空间定时任务 → Imports 服务 → xlsx／importers → 导入端口 → 批次与行；快照及库存预测再读取这些结果。
6. **定时任务**：平台自动化入口 → JobsAutomation → 拉取导入／补偿／兼容表／航程重算／质量扫描；管理接口可调用相应服务。
7. **兼容输出**：航次与主数据端口 → Compat 服务 → `domain/compat.ts` → BaseGateway → T09；航次保存回调标记待刷新。
8. **共享契约**：前后端共同引用 `shared/api.interface.ts`；前端展示链与引擎输出链应在正式审计中逐字段对齐。

以上是代码静态关系图；平台网关、自动化回调、RLS、streaming 的实际行为仍需独立证据。

## 6. 已确认发现

“实际行为”如标注为静态推导，表示已沿当前代码分支确认因果关系，但未执行对应真实操作。场景中的标识、记录与数值均为合成示例。

### D08-01 · P0 · 缺陷：生产模式缺省与非法值均落入内存和兜底身份

- 位置：server/modules/ports/ports.module.ts:34、:47、:49；server/adapters/memory/memory-directory.ts:6、:9；server/common/guards/ssps-role.guard.ts:27；scripts/run.sh:8。
- 事实：只有 SSPS_STORE 精确等于 real 才选择真实适配器；没有检查 NODE_ENV，也没有拒绝其他字符串。生产启动脚本只设置 NODE_ENV。MemoryDirectory 对未登记用户直接返回业务员、大宗采购部身份，全局角色守卫依赖这个目录的 resolve 结果。
- 冲突：K01/K09/K11；文档仓 docs/handoff/deploy-flow.md:63 要求生产使用真实存储及四角色。代码未落实安全缺省。
- 触发：NODE_ENV=production，SSPS_STORE 未设、memory、REAL 或 real 后带空格；平台已登录用户上下文 userId=audit-user、roles=[]，请求 /api/me。
- 实际行为（静态推导）：进入 MemoryDirectory，用户被赋业务员身份，SSPS 角色守卫不拒绝；航次写入进入内存，重启不保留。
- 期望：生产环境仅接受明确、有效的真实模式；未设置、非法值或演示模式应在提供业务接口前拒绝启动，不把无 SSPS 角色用户授为业务员。
- 建议：在统一启动配置处校验模式和环境，保留明确的本地演示入口。

### D08-02 · P0 · 风险：memory 数据可驱动真实 T09 删除

- 位置：server/lark/lark.module.ts:26、:30；server/modules/ports/ports.module.ts:47、:48；server/modules/admin/jobs.automation.ts:39；server/modules/admin/compat.service.ts:60、:69、:75、:79；server/adapters/memory/memory-voyage-store.ts:6、:16。
- 事实：BaseGateway 只按凭证和表配置装配，没有按模式隔离。memory 航次初始为空；自动化全量兼容刷新调用 refresh(null,false)，把空输入转成零行，然后删除已有的全部多余记录。
- 冲突：K08、文档仓 docs/handoff/deploy-flow.md:63 的真实模式前置条件，以及演示与真实数据隔离要求。这里的损坏路径独立于“普通页面显示演示数据”。
- 触发：SSPS_STORE=memory（缺省或误拼同样成立），同时配置可写真实 Base 的飞书凭证和 T09a/T09b；两表各已有合成记录；平台执行 cronCompatFull。
- 实际行为（静态推导）：内存 list()=[] → a=[]、b=[] → keep=0 → gw.remove(table,所有现有ID)，两张真实兼容表被清空。若内存中有演示航次，则会覆盖为演示内容。
- 期望：memory 模式不能创建任何真实写客户端，也不能注册／执行真实外部写任务。
- 证据限制：没有触发平台任务或删除真实记录；触发器是否在当前应用注册未作平台查询。风险发生条件是任务已注册且凭证具有写权限。

### D08-03 · P0 · 风险：平台日志链记录业务正文，关闭两个日志开关仍不足以防止生产上报

- 位置：.env:3、:4；server/app.module.ts:19；package-lock.json:2387（锁定 nestjs-logger 1.0.22）；本地该依赖 dist/index.cjs:9610、:9637、:9685、:9688、:9445、:9910。
- 事实：模板默认 LOG_REQUEST_BODY=true、LOG_RESPONSE_BODY=true；PlatformModule 装配全局 LoggingInterceptor。其 sanitizeAndTruncate 只做长度处理，sanitizeValue 只递归转换类型，未做业务字段脱敏。更关键的是，生产分支另外把 req.body 和处理结果 data 放进 reportData，并直接交给 appLogger.log；这条路径不受上述两个开关控制。AppLogger 在 :9321 将带 platformModule 的信息交给 observableService.log。
- 冲突：文档仓 docs/handoff/task-book.md:433 明确“日志里没有密钥和业务明细”；金额／业务数据不能通过日志形成另一份未受业务读取权限控制的副本。
- 触发：有权用户提交一个仅含虚构费用 demUsd=123.45 的结算请求，或读取含虚构费用的详情；生产 LoggerModule 正常启用。开发环境下默认两个 true 开关也会保留正文。
- 实际行为（静态推导）：请求／响应业务字段进入日志序列化对象；生产成功请求也会将完整正文交给平台可观测日志接口。仅把两个开关设 false 不能消除生产 reportData 路径。
- 期望：日志只含请求关联信息、操作、状态、耗时和必要统计，不记录费用、货物／库存明细及敏感输入。
- 建议：向平台依赖维护方核实并修复／替换该拦截路径，使用允许字段清单；本应用不能只靠配置开关宣称问题已解决。
- 证据限制：核对了本地安装且与锁文件一致的依赖源码；没有读取日志内容或向平台发送该虚构请求，未确认下游平台日志的实际保留与访问策略。

### D08-04 · P0 · 缺陷：push/release 的 DryRun 不生效

- 位置：文档仓 scripts/miaoda-deploy.ps1:30、:271、:284、:288、:301、:312、:318、:412、:450。
- 事实：DryRun 仅用于 sync/backup 分支；push 和 release 最终分派未检查它，release 还先调用 Invoke-Push。
- 冲突：文档仓 docs/handoff/deploy-flow.md:59 将 DryRun 描述为只读演练；local-env.md:43 记录过同一历史问题，当前代码仍存在。
- 触发：在有效平台仓库调用脚本，参数为 Mode=release、DryRun=true、Reason=合成发布理由，其他前置条件满足；push 模式同理。
- 实际行为（静态推导）：仍暂存、提交、拉取、推送，并调用 release-create；没有“演练”分支。历史记录也佐证 push 曾实际发生，本轮未执行。
- 期望：DryRun 阻止全部 Git／平台写操作；若该模式不支持演练，应在任何副作用前拒绝参数组合。

### D08-05 · P0 · 风险：git add -A 可把原始业务文件或整包文档推上平台

- 位置：文档仓 scripts/miaoda-deploy.ps1:206、:218、:279、:284；代码仓 .gitignore:1 起的完整规则。
- 事实：安全检查只处理状态列表中的 .env 类路径，随后对整个 Repo 执行 git add -A；当前忽略规则没有排除 xlsx/xls/xlsm/csv/tsv，也没有限制本次提交文件清单。只读 git check-ignore 使用不存在的合成路径验证：xlsx、csv、docs 下 md 均不被忽略。
- 冲突：用户硬约束“原始 Excel 不入仓”；文档仓 docs/handoff/task-book.md:60、deploy-flow.md:16。文档仓 CLAUDE.md 所述 Excel 已排除不能代替代码仓实际规则。
- 触发：把合成文件 data/audit-synthetic.xlsx 或 docs/audit-synthetic.md 放入 Repo，随后执行 push，且质量门通过（或显式 SkipChecks）。
- 实际行为（静态推导）：这些路径不属于 env 检查范围，被 git add -A 暂存并随提交推送。若操作者误放真实导出，路径相同且不会被该检查拦住。无需把整个文档仓选为 Repo 才能触发。
- 期望：提交前拒绝原始业务文件及不属于发布代码的整包文档，提供可复核的明确文件清单。
- 现状：本次按文件名扫描工作区（含忽略文件，排除 .git 和 node_modules）没有发现上述数据文件；跟踪清单中也没有。没有发生本审计能证明的数据泄漏。
- 相关边界：Assert-EnvSafe 不是通用密钥扫描器；新文件被提前暂存后会出现在 ls-files 中，目录折叠及 .env.example 豁免也不能用来证明凭证安全。

### D08-06 · P1 · 风险：release 的技术门槛只有 Reason，没有当次人工确认

- 位置：文档仓 scripts/miaoda-deploy.ps1:27、:312、:316、:318。
- 事实：Reason 非空后立即进入 push 和 release-create；参数中没有当次确认机制，代码没有人工输入或授权凭据校验。
- 冲突：文档仓 docs/handoff/deploy-flow.md:53、docs/handoff/task-book.md:429 要求每次发布明确授权。
- 触发：定时脚本／代理复用一条带旧 Reason 的 release 调用，本次未取得人工批准，其他检查通过。
- 实际行为（静态推导）：脚本仍提交发布申请，不区分本次批准与历史理由。
- 期望：在所有写操作前具备可检查的当次批准门槛。若产品决定授权只由调用者会话保证，应明确文档边界，并禁止把 Reason 当成确认实现。
- 区别：本次用户授权的是审计，不是发布；本审计未调用该脚本。

### D08-07 · P1 · 风险：质量门检查的代码可能不是最后推送／发布的代码

- 位置：文档仓 scripts/miaoda-deploy.ps1:280、:296、:301、:316。
- 事实：质量门在 pull --rebase 之前运行；拉取并重放后不再验证最终树，release 随后发布该分支。
- 冲突：文档仓 docs/handoff/deploy-flow.md:38 的质量门要求、docs/handoff/task-book.md:429 的发布前全绿要求。
- 触发：本地版本测试通过；运行脚本期间远端有一个能干净合并、但破坏接口类型或测试的新提交；pull --rebase 成功。
- 实际行为（静态推导）：最终推送树含未经本次质量门验证的改动，仍继续发布。
- 期望：对最终树重新检查，或固定并验证发布提交、发现远端变化就中止。

### D08-08 · P1 · 风险：sync 默认保护清单未覆盖已声明受保护的平台文件

- 位置：文档仓 scripts/miaoda-deploy.ps1:94、:170、:184、:425；代码仓 CLAUDE.md:22。
- 事实：默认 SyncProtect 没有 scripts/build.sh、run.sh、lint.js、prune-smart.js、scripts/hooks/、server/modules/view/ 等受保护路径。命中这些相对路径时，默认 sync 即可覆盖，不需要 ForceProtected。
- 冲突：代码仓 CLAUDE.md:22、文档仓 docs/handoff/claude-code-handoff.md:243 的平台文件边界；deploy-flow.md:29 声称会跳过平台维护文件。
- 触发：某个合法 Source 中含与目标不同的 scripts/run.sh，执行默认 sync，未带 ForceProtected。
- 实际行为（静态推导）：Test-Protected=false，Copy-Item -Force 覆盖目标文件。
- 期望：默认完整保护约定的平台路径，覆盖必须走明确的例外入口。
- 边界：ForceProtected 确有警告，并继续保护 .spark、.spark_project、.gitignore、.npmrc、package 与锁文件；它不是无限制解除保护。本轮未读取冻结 app/ 内容或执行同步。

### D08-09 · P1 · 缺陷：BITABLE_TABLE_IDS 非空即可通过启动装配，缺表到业务操作时才失败

- 位置：server/lark/lark.module.ts:21、:31、:32；server/modules/ports/ports.module.ts:35；server/lark/bitable.ts:12。
- 事实：启动时只解析 JSON 并检查 Object.keys(ids).length，没有校验必需表集合、对象结构和各 table_id 值；need(gateway) 只检查网关对象存在。
- 冲突：文档仓 docs/handoff/claude-code-handoff.md:136、:377 声称 real 缺配置启动即报错；deploy-flow.md:63 的完整表配置前置条件。
- 触发：real 模式、其他注入和格式合格的合成凭证均齐全，BITABLE_TABLE_IDS 只提供 T01，缺 T04/T05/T09 等。
- 实际行为（静态推导）：网关被创建，未在装配时拒绝；首次调用缺失表时才抛“没有配置表 T04 的 table_id”等错误。
- 期望：启动时列出缺失键并拒绝提供写服务；不得直到录入航次或定时任务才发现。云空间文件夹可作为可选能力，但必须与核心 Base 配置区分。

### D08-10 · P1 · 缺陷：health 把变量存在当作连通性检查

- 位置：server/adapters/drizzle/drizzle-health.ts:17、:18、:19、:20；server/modules/admin/admin.controller.ts:12。
- 事实：应用库执行 select 1，镜像表计数；飞书凭证、Base、Drive 部分只检查字符串是否非空，未查询有效期、可达性、协作权限或文件夹可读性。
- 冲突：文档仓 docs/handoff/task-book.md:354 的 A28 连通性自检范围；local-env.md:94、:99 也明确记录此限制。
- 触发：数据库可连，环境变量非空，但飞书 Secret 已撤销，或 Base／云空间访问权限被收回。
- 实际行为（静态推导）：对应检查仍返回“正常／环境变量已配置”；凭证项虽注明“有效性未检测”，仍不能满足规定的连通性检查。
- 期望：将“配置存在”与“真实探测成功”分开呈现；使用安全的只读探测，并把无法证明的写权限标为未验证，不以有变量宣称可读写。
- 边界：该接口是管理员自检，非匿名存活探针；本发现不建议为探针放开业务数据权限。

### D08-11 · P1 · 缺陷：原生 Windows 的 Node 子进程没有正确启动 npm/npx 的 cmd shim

- 位置：scripts/lint.js:9、:15、:18、:106；scripts/dev-local.js:39、:48、:103；scripts/hooks/run-precommit.js:22。
- 事实：lint 在 Windows 把名称改为 npx.cmd/npm.cmd，却显式 shell=false；dev-local 和 precommit 直接 spawn npm/npx/lark-cli，未选择可执行入口或相应 shell。dev-local 的 command -v 探测又是在 Windows 默认 shell 下执行。
- 标准：Node 官方说明 Windows 的 bat/cmd 不能作为普通可执行文件直接启动，需要 shell、显式 cmd.exe 或可执行 JS 入口；参见 [Node child_process 官方文档](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows)。文档仓 local-env.md:33 的 npm_config_script_shell 只解决 npm 展开 package scripts 的 shell，不能改变子脚本里的 shell=false。
- 触发：原生 Windows Node，PATH 上的 npm/npx 为正常安装的 cmd shim，没有同名 exe；执行 lint 或默认本地 dev 链路。
- 实际行为（按代码与 Node 契约推导，未运行这些入口）：lint 无法直接创建该子进程，校验不会正常开始；dev 可能在探测／拉环境／最终启动阶段失效；实际错误码依 Node 版本和入口而异，不在此编造固定错误文本。
- 期望：这些入口在原生 Windows 正确选择受支持的进程启动方式。WSL/Linux 路径另行定义。
- 已做验证：本次直接从 PowerShell 执行允许的 npx eslint 命令成功；这与 Node 脚本内部直接 spawn cmd 文件是不同的调用路径，不能据此判定本问题不存在。

### D08-12 · P1 · 风险：check 与失败尾日志可能回显凭证

- 位置：文档仓 scripts/miaoda-deploy.ps1:382、:265、:298、:305、:308。
- 事实：check 原样输出 git remote get-url origin；失败路径原样显示外部命令尾部，没有统一脱敏。
- 冲突：脚本 :16 自述不打印密钥；文档仓 docs/handoff/task-book.md:60 要求凭证不进日志和回复。
- 触发：origin 使用含用户名／模拟密码的 HTTPS URL，执行 check；或外部工具的错误文本含敏感 URL／凭证，触发 Tail 输出。
- 实际行为（静态推导）：凭证随完整 URL 或错误尾部输出。
- 期望：显示前移除 URL userinfo 和敏感参数，对外部输出统一脱敏，保留定位所需的错误码与阶段。
- 现状：本次没有读取凭证存储或输出实际 origin，没有发现并复述任何真实密钥；此项是可复现的条件性打印风险。

## 7. 两项疑似阻断及缺少的证据

### S08-01 · 疑似 P0：声明的生产入口与构建产物不一致

- 位置：.spark_project:10 声明 npm run start；package.json:20 是 NODE_ENV=production node main.js；nest-cli.json:12、:13 保留 server 路径；scripts/run.sh:8 则正确指向 server/main.js；scripts/prune-smart.js:333 生成的 dist/package.json 不含 scripts。
- 场景：按 .spark_project 的部署 run 约定启动当前构建产物。若在源根执行，main.js 不存在；若在 dist 执行，生成的 package 不含 start。与实际编译输出 dist/server/main.js 均不一致。
- 期望：平台声明与实际产物有唯一可达启动入口，cwd 约定一致。
- 为什么仍为疑似：构建脚本另复制 run.sh，妙搭真实发布器可能优先使用它并忽略旧 .spark_project。未访问发布平台，也未执行构建，不能把配置矛盾直接写成实际发布必然失败。
- 需要：平台实际采用的启动命令、cwd 与最终产物清单。若明确只采用 run.sh，应清理／注释过时声明；本轮不猜测优先级。

### S08-02 · 疑似 P0：全量构建依赖没有被锁文件承载

- 位置：scripts/build.sh:24、:49、:53、:188；scripts/prune-smart.js:4；package.json:34、:57；package-lock.json 全量依赖索引。
- 事实：prune 顶层 require @vercel/nft；根依赖、锁文件与当前 node_modules 均没有它。fullstack-cli、generate-api-routes、generate-page-routes 同样未由本仓依赖图提供；build.sh 第一步使用未显式限定作用域／版本的 npx fullstack-cli。
- 场景：干净隔离的 Node 环境，仅按当前 lock 安装项目依赖，不预装平台工具、不提供 NODE_PATH；进入 prune 时无法解析 @vercel/nft；更早的 npx 工具也可能依赖临时解析或安装。
- 期望：完整构建所需工具由可重现的依赖或明确、固定的构建镜像契约提供。
- 为什么仍为疑似：妙搭构建镜像可能预装这些工具或在插件初始化阶段注入依赖；当前仓文件未证明这种保证。本机缺包不等于平台必缺。
- 需要：构建镜像工具／模块清单、版本及解析路径，或禁止真实服务访问的隔离全量构建记录。本轮未运行 build、npx 工具安装或 plugin init。

## 8. 演示模式、环境变量与配置契约

### 8.1 所有 SSPS_STORE 读取点与行为

业务代码只有两处直接比较读取：

| 读取位置 | real | 缺省、memory、空字符串、其他字符串 |
| --- | --- | --- |
| server/modules/ports/ports.module.ts:34（其工厂调用 real()） | Drizzle 仓储、平台身份、持久化 Outbox；数据库或网关缺失时抛错。 | memory 仓储、内置主数据、兜底身份、无持久化 Outbox。NODE_ENV 不改变选择。 |
| server/lark/lark.module.ts:41 | 要求 AuthorizationSDK，创建真实用户查询源。 | USER_SOURCE=null，用户查找回落 MemoryUserLookup。LARK_TOKEN/DRIVE/BASE_GATEWAY 不受该比较约束，仍可为真实客户端。 |

其他 SSPS_STORE 命中为注释、提示或文档。scripts、client/src、preview 没有另行读取来防止误用；smoke.cjs、demo-server.cjs 也不强制覆盖进程已有的 SSPS_STORE。故不能把它们“只用内存”的注释当作在任意调用环境下的安全保证。

生产构建没有把该值写死为 real，run.sh 也没有校验；缺省不安全，见 D08-01/02。

### 8.2 第一方环境变量全量对照

下表覆盖第一方 process.env 直接／间接读取和相关脚本环境入口；import.meta.env 在第一方代码中未发现使用。平台依赖内部变量另外列示，未把整个 node_modules 当作业务代码枚举。

| 变量 | 读取位置 | 缺省／校验与来源对照 |
| --- | --- | --- |
| SSPS_STORE | ports.module.ts:34；lark.module.ts:41 | 缺省及非法值变 memory；模板无；deploy-flow :63 要求线上设 real。D08-01/02。 |
| LARK_APP_ID | lark/config.ts:26 | 无；与 Secret 成对，基本格式校验；模板无；deploy-flow :63/手册 :210 要线上配。 |
| LARK_APP_SECRET | lark/config.ts:26 | 无；防空白和多余引号；模板无；文档要求重置后的新值，未读取实际值。 |
| BITABLE_APP_TOKEN | lark.module.ts:31；lark/config.ts:19 | 无；20–40 位字母数字及空白／引号校验；模板无；线上必须配置。 |
| BITABLE_TABLE_IDS | lark.module.ts:21 | 缺省 {}；JSON 解析但缺完整表键校验；模板无；线上必须配置，D08-09。 |
| DRIVE_FOLDER_TOKEN_BERTH_PLAN | imports.service.ts:115；drizzle-health.ts:20 | 无；拉取时才判缺失；模板无；手册 :213 要求提供，deploy-flow :63 仅用“等”带过。是云空间拉取能力的前置配置。 |
| ROLE_MAP | ports.module.ts:49 | 可选；有四角色映射缺省，校验 JSON 对象；模板无；手册 :214 有说明，无需强制线上设置。 |
| DEPT_MAP | ports.module.ts:49 | 可选；有三部门关键字缺省，校验 JSON 对象；模板无；手册 :214 有说明。 |
| NODE_ENV | main.ts:12；exception.filter.ts:65；package scripts/run.sh | 启动／构建命令设置；影响错误堆栈和平台行为；直接调用产物必须明确为 production。 |
| SERVER_HOST | main.ts:18 | localhost，无启动配置校验；模板无，部署文档未列；真实平台是否同网络空间代理需确认，不能直接断言应改为某地址。 |
| SERVER_PORT | main.ts:19；dev.js:39 | 3000；Number 转换无端口范围校验；模板无，平台／外部可注入。 |
| CLIENT_BASE_PATH | client/src/index.tsx:14 | /；构建预设及平台运行时处理应用前缀；模板无，local-env :60 有前缀说明，必须与平台配置对齐。 |
| LOG_DIR | dev.js:33；平台 logger | logs；模板 :2 为 ./logs；不是飞书凭证配置。 |
| LOG_REQUEST_BODY | 平台 logger，由模板提供 | 模板 :3 为 true；线上设置文档未要求覆盖，见 D08-03。 |
| LOG_RESPONSE_BODY | 平台 logger，由模板提供 | 模板 :4 为 true；同上。 |
| MAX_RESTART_COUNT | dev.js:34 | 空时无限；parseInt，无数值合法性校验；模板／部署文档无，沙箱监督器配置。 |
| RESTART_DELAY | dev.js:37 | 解析失败或 0 时 2 秒；无正数校验；模板／部署文档无。 |
| CLIENT_DEV_PORT | dev.js:40 | 8080；供 dev 清理端口；模板／部署文档无。 |
| MIAODA_APP_TYPE | dev-local.js:34 | 脚本未设时写入 3；也被 Vite 平台预设消费；平台运行上下文变量。 |
| MIAODA_LOCAL_DEV | dev-local.js:35 | 该入口写入 1；无模板项，属于开发入口标记。 |
| SUDA_WEBUSER | dev-local.js:86 | 无；JSON 解析与一次 unescape 兜底；由平台 env-pull 下发，local-env :58/:60 说明；失败警告在 :96 会截取原串，不应输出真实身份原文。 |
| MIAODA_RUNTIME_ENTRIES | prune-smart.js:40 | 空；额外动态入口逗号列表；不存在的路径警告后忽略；模板／部署文档无；当前第一方未发现需要声明的动态运行模块。 |
| PORT | demo-server.cjs:58 | argv 优先，其次 PORT，最后 3100；仅演示，与真实 SERVER_PORT 不是同一变量。 |
| app_id（小写） | gen-db-schema-local.mjs:20 | 回落为脚本硬编码应用 ID；与部署脚本 MIAODA_APP_ID 命名不同，迁移到别的应用时不能假设通用；未执行该脚本。 |
| MIAODA_DEP_CACHE_DIR、SANDBOX_ID | dev.sh:15 | 任一非空即进入 dev.js；无模板项，平台注入／沙箱判定。 |
| NODE_OPTIONS | build.sh:85 | 未设置时注入 8GB heap；外部配置优先；不是业务配置。 |
| only_frontend_change（小写） | build.sh:88/:158/:182 | false；只接受 true，跳过后端和依赖产物；由平台构建链约定，仓内未校验本次是否真为纯前端改动。 |
| SKIP_GIT_HOOKS、PATH | .githooks/pre-commit:2/:3 | 可跳过钩子／为其增加本地 bin；继承环境。钩子不是不可绕过的发布质量门。 |
| MIAODA_REPO_DIR、MIAODA_APP_ID | 文档仓 miaoda-deploy.ps1:23/:25 | Repo 需传参或环境；AppId 可从 .spark/meta.json 回落；模板不适用，脚本参数已有说明。 |
| ProgramFiles、ProgramFiles(x86)、LOCALAPPDATA、USERPROFILE | 同脚本 :51/:56 | 操作系统安装路径查找；不属于应用线上环境变量。 |

模板现状：代码仓只有已跟踪 .env，内容为日志配置；没有 .env.example。部署说明给出了核心线上变量，但不是覆盖所有配置入口的统一清单。业务凭证不应为了补齐清单而写进已跟踪 .env；应提供无真实值的示例／变量文档，并遵守部署脚本的模板规则。

平台依赖补充：DRIZZLE_DATABASE、AuthorizationSDK 是注入令牌，不是要求用户配置的同名环境变量。已读核心 SDK 通过平台 SUDA_DATABASE_URL 装配数据库；本机记录亦说明 env-pull 下发该类配置。本轮未读取值。Vite 预设还消费 MIAODA_APP_TYPE、ASSETS_CDN_PATH、RELEASE_ID、FORCE_* 等平台变量，源码 define 清单未见把 LARK_APP_SECRET 或 Base token 整体注入前端。Logger 内部还有 LOGGER_LEVEL、LOG_MAX_BODY_LENGTH、日志轮转等变量；配置正文长度限制不能替代脱敏，且不能解决 D08-03 的独立生产上报路径。

## 9. 构建产物、依赖裁剪与供应链核对

### 9.1 构建与发布产物

| 核查点 | 当前代码能证明的结果／限制 |
| --- | --- |
| 生产入口 | .spark_project:9 → npm run build → build.sh；启动声明与 run.sh 的分歧见 S08-01。 |
| 全量清理 | build.sh:38 先清 dist，再生成路由，并发构建前后端；该全量路径不会保留先前 dist/preview。 |
| test 目录清理 | package.json:18 在 nest 成功后删除 dist/server/test；配置的 filenames=[server,shared]、stripLeadingPaths=false 与该路径一致。tsconfig 的 spec exclude 本身不能证明 SWC 不编译测试；实际清理依赖这个尾步骤。 |
| 绕过清理的入口 | 文档仓部署质量门 :247 使用裸 npx nest build，而不是 build:server，故不执行 test 删除；dev:server 同理。现存 dist 盘点见 38 个 test 路径，属于本机历史产物；未因此断言正式全量发布泄漏。 |
| dist 是否跟踪 | git ls-files 全量核对：0 个 dist 路径、0 个 map 路径；当前发布代码仓未跟踪 dist。 |
| demo-server.cjs | 不被正式脚本引用，不在 Nest 的 server/shared 编译输入中；build.sh:171 还移除 dist/scripts。没有证据表明它被正式全量路径打包执行。 |
| client/preview 与 vite.preview.config.ts | 只有 preview:build 使用，输出 dist/preview；正式 build:client 指向 vite.config.ts，平台预设入口为 client/index.html。默认全量构建不调用 preview。 |
| 内存适配器及内置种子 | PortsModule 静态导入它们，生产 server 中仍会存在；这是 D08-01 能在生产发生的基础。它们与整套原型 mock 不是同一物。 |
| fixtures／原型 mock | 正式 build:server 删除整个 dist/server/test，覆盖该目录中的 helpers、编译后的原型 JS；SWC copyFiles=false，额外 assets 只声明 capabilities/**/*.json。未发现将测试 JSON／Markdown 另行复制进应用产物的步骤。完整产物未生成，不能给出实物“零夹具”保证。 |
| Markdown | 第一方源码根的文档没有通用复制步骤；prune 复制整个依赖包目录，会携带依赖自己的 README/LICENSE、map 等。不能把“产物完全没有 md”作为当前事实。代码仓跟踪的 35 个 Markdown 不等于它们都会进入运行产物。 |
| source map | 服务端当前 SWC 默认结合 tsconfig 未启用 sourceMap；前端预设生产默认 hidden map，fullstack 分支会归集到 dist/sourcemaps。hidden 不表示无源码；未有完整前端产物，未读取 .env.local，未证明 map 含真实密钥，也未证明其对外访问隔离。 |
| 纯前端发布 | only_frontend_change=true 跳过后端、run.sh/.env、prune。平台如何合并上一版后端产物、如何确认本次仅改前端，仓内没有完整证明，需平台契约。 |
| public 资源 | build.sh:150 把 client/public 复制到服务端视图目录，构建 HTML 随后覆盖同名 public HTML；未见把整个代码根或文档仓复制进去的逻辑。 |

本轮没有运行 build 或改动已有 dist；以上区分了静态可达性、现有本地产物和未验证的最终发布包。

### 9.2 prune-smart.js 实际做了什么

1. 从已跟踪 .env 和继承环境读取配置，以 dist/server/main.js 加可选额外入口进行 nft 跟踪。
2. 按跟踪路径提取包名，并从已发现包的 dependencies/optionalDependencies 递归补充；另补 actionPlugins 及其 peer 依赖。
3. 先删除 dist/node_modules，再以硬链接优先方式复制所选包的整个目录；跨文件系统时回落复制。
4. 生成精简 dist/package.json，仅有 name、version、private、dependencies、engines，不保留 scripts。
5. 不删除源 node_modules，也不筛除依赖包中的文档、测试或 map；其“裁剪”主要是按包选择，不是按单文件裁剪。

当前可确认的限制：

- @vercel/nft 解析前置条件没有由锁文件证明，见 S08-02。
- 关闭了 glob／文件引用推导，动态加载需要显式入口；当前第一方运行代码未找到需额外声明的动态模块，不能凭此直接宣称已误删某个真实运行依赖。
- 复制失败只累加 failed 并继续打印“完成”（:145/:161/:316/:362），没有以 failed 数量决定非零退出码。这是产物完整性风险：例如已选中的必需包遇到读取权限错误，可能留下不完整产物。尚未制造该故障，也未有实际失败包证据，作为风险核查提示，不额外定为已复现缺陷。
- 没有在最终产物中做离开源 node_modules 后的启动验证。是否误删运行时依赖须通过隔离产物启动证明，不能用开发态单元测试替代。

### 9.3 锁文件、registry 与生命周期

- package-lock 为 v3；根 dependencies 和 devDependencies 与 package.json 逐键对照，没有版本声明差异。早期一次 PowerShell JSON 解析因空键失败已更换为哈希表解析复核，结论以成功复核为准。
- .npmrc:1 指向 registry.npmmirror.com，仅含 registry 项；没有认证键。锁文件 resolved 来源有 npmmirror.com 与 npmjs.org 两个主机；扫描 resolved URL 没有发现 userinfo 或敏感认证参数。
- 根 package.json 没有 preinstall/install/postinstall/prepare，也没有本轮验证命令的 pre/post 生命周期脚本。
- 锁文件标记安装脚本的包包括 @nestjs/core、@swc/core、core-js、esbuild、fsevents、protobufjs；其中有原生二进制安装与可选平台依赖。安装／完整构建不等于只读验证，本轮没有执行。
- dev.sh:26、dev-local.js:62/:72、package.json:14/:28 含 latest 工具解析；dev 会同步平台文件、技能并可能改依赖。构建又使用锁文件外的工具入口，不能只因 package-lock 一致就认定整个链路可重现。
- 未查询漏洞数据库，未执行 npm audit 或安装，也不对全部传递依赖作“无供应链风险”结论。字面量筛查命中的是测试占位值，未认定为实际密钥；没有输出其完整值。

## 10. 发布脚本、审批、跨平台和可观测性核对

### 10.1 发布模式与安全边界

| 模式／参数 | 当前行为 |
| --- | --- |
| check | 主要做本地读取与状态展示；不执行 push/release，但完整 origin 输出有 D08-12 风险。 |
| sync | Source → Repo，只复制新增／不同文件；不删除目标、不自动提交；默认保护遗漏见 D08-08。 |
| backup | Repo → 文档仓 app 的单向复制；不自动提交。代码没有删除目标多余文件，称“full mirror”容易让人误以为是精确镜像。 |
| gates | 七项检查；包含裸 nest build，会写 dist，不符合本次只读执行条件；不是本次允许运行的验证入口。 |
| push | 检查分支及 origin 存在 → env 检查 → 质量门 → add -A／commit → pull --rebase → push；不会自动上线。 |
| release | 检查 Reason → 执行 push → release-create → 尝试解析 release_id → 最长轮询 5 分钟。没有预检生产变量和角色的代码保证；不能作为 D08-01 的替代保护。 |
| ForceProtected | 只在 sync 起作用，有警告且仍保护若干核心元数据／包文件；默认保护本身不完整。 |
| SkipChecks | 可跳过质量门；env 检查仍执行，但其覆盖仅限 env 路径。 |
| DryRun | 只对 sync/backup 生效，push/release 不生效，见 D08-04。 |

审批 PENDING：脚本 :338 显式匹配 current_status=PENDING 时停止轮询，:341 对 status=pending 也停止；没有自动批准逻辑。finished／failed 有对应分支。**只能确认这些形状下会停，未拿真实 release-get 响应验证字段层级。** 解析 release_id 失败、审批等待或超时均可正常 return，进程 0 不能用作“发布已完成”的判断；调用者必须看明确状态。这是运行约定上的限制，不据此声称审批被绕过。

脚本没有 force-push；其 ForceProtected 是文件复制开关，不是 Git 强推。Repo 仅解析绝对路径并验证目录，push 仅验证当前分支与 origin 存在，没有核对 Repo 顶层／预期远端主机和 AppId 的绑定；若错传另一个同分支仓库，保护不足。此处建议与 D08-05 的文件清单一并强化，不额外重复计数。

### 10.2 跨平台

- package scripts 的 NODE_ENV= 前缀、单引号 glob 与 sh 入口依赖 POSIX shell；Windows 默认 npm shell 不满足。local-env.md:33 已记录并给出每会话设置 Git Bash 的操作。本次 npm test 明确采用该临时设置，未修改全局 npm 配置。
- build.sh/run.sh 使用 Bash、rm/find/mv/cp、/tmp，dev.js 使用进程组负 PID、lsof；这些是 POSIX／沙箱路径。dev.sh 只有沙箱变量存在时才选 dev.js，不应把它认作通用原生 Windows 监督器。
- Windows 的 Node 内部 spawn cmd shim 问题另见 D08-11；外层配置 Git Bash 无法覆盖 Node 代码显式 shell=false。
- PowerShell 发布脚本使用环境路径、git.exe／lark-cli.cmd 查找，并将正文设计为 ASCII，以兼容 Windows PowerShell 5.1；本轮没有执行任何模式。
- lint.js:21 用 code || 0 将信号结束产生的 null 当 0，是退出码完整性提示；尚未构造信号场景，未额外列作已复现缺陷。

### 10.3 回滚、请求关联与健康检查

- **回滚尚无可复核的实施记录**：本地规格 W51 只写“平台发布回退”和迁移批次标记；部署脚本没有 rollback 模式。文档仓 docs/handoff/release-log.md 不存在，deploy-flow.md/local-env.md 未给出目标版本、操作入口、数据库兼容及回滚验收的完整步骤。首次发布前应补齐并演练；本轮不能替平台猜一个回滚命令。
- **请求 ID 已有平台实现**：根业务源码没有自己生成，但引入的 LoggerContextMiddleware 从 x-tt-log-id 或随机 UUID 建立 requestId，并回写 x-log-trace-id；日志 payload 带 trace_id（本地 nestjs-logger dist/index.cjs:9826、:9830、:9219、:9249）。不能因为只搜索第一方 requestId 无结果就报“没有请求 ID”。未在真实请求中验证这些头是否完整透传。
- **错误可追踪但脱敏不充分**：未知生产错误由 exception.filter.ts:65/:66 写服务端日志，响应隐藏堆栈；configureApp 使用平台 AppLogger，具备请求关联基础。业务异常、HTTP 异常的 details 及 SDK 日志仍须结合 D08-03 审查，不将隐藏响应堆栈等同于日志安全。
- **任务日志**：JobsAutomation :25/:27 记录任务名、结果与截断错误，HTTP 请求之外的 cron 不一定有请求上下文；D09 提供业务任务状态。是否具有平台 trigger trace 需要真实自动化证据，当前不报“必然无 trace”。
- **健康接口存在**：/api/health 受 NeedLogin 和系统管理员检查保护；数据库失败也仍是一个检查项状态，HTTP 成功不代表全部依赖健康。SDK 可能另提供平台探针，当前未查询平台配置；不将管理员端点改成匿名探针。连通性不足见 D08-10。

## 11. 验证执行与只读边界

| 命令／检查 | 结果与限制 |
| --- | --- |
| npm test | 实际执行，退出码 0；203 项，197 通过、6 跳过、0 失败，约 33.5 秒。测试使用无 dataDir 的 PGlite、假 Base／注入 fetchFn，未导入运行 AppModule 连接真实服务。临时设置 npm_config_script_shell 为 Git Bash、TSX_DISABLE_CACHE=1；未改仓内配置。 |
| npx eslint server client/src --quiet | 确认本地 eslint 可执行文件存在后执行；退出码 0，无输出；未使用 fix 或 cache 选项。 |
| npm run type:check | 未执行：客户端增量选项及服务端继承配置会维护 tsbuildinfo，与本次不写代码仓约束冲突。 |
| npm run smoke | 未执行：package.json:31 先运行 build:server，会生成／删除 dist。脚本本身还继承 SSPS_STORE，不能只凭注释断言任意环境下无真实连接。 |
| build/dev/install/deploy/platform CLI | 均未执行；完整产物、真实平台契约和故障注入因此存在明确证据缺口。 |
| 数据文件名盘点 | 工作区与 Git 跟踪清单均未发现 xlsx/xls/xlsm/csv/tsv；未读业务文件内容。 |
| 只读版本检查 | 检查 HEAD、status、跟踪清单、忽略规则与必要文件哈希；无 commit/push/pull/checkout/reset。报告写入前后对比 30 个关键代码／配置／部署脚本的 SHA-256，无变化；末次状态快照有其他操作产生的 8 个未提交修改，见第 1 节。 |

这两个实际通过的检查只说明测试运行时所读代码与静态 lint 结果；没有覆盖发布脚本副作用、正式产物启动、真实自动化和平台日志传输。并发修改使其不能被表述为最终工作区的全绿验收。

## 12. 后续需要的证据与有限改进建议

必须补的证据：

1. 当前构建镜像的工具与模块解析路径、最终启动命令及 cwd，裁定 S08-01/02。
2. 不带真实凭证的隔离完整构建与“仅最终产物”启动；核对缺失依赖、全部 app fixtures／mock、maps 的交付及访问边界。
3. 四角色及无角色用户的真实平台读／拒绝矩阵；memory 必须不能产生真实外部写。
4. Logger 依赖的修复版本或隔离方案，并证明正文不会经另一条生产日志路径上报。
5. 可人工审核的发布文件清单、当次确认记录、审批状态响应形状，以及代码／数据回滚演练记录。

仅列少量改进建议，不与前面的缺陷风险重复计数：

- 部署脚本：用结构化 JSON 解析 release 状态并区分“已完成／待审批／超时／失败”的机器可读退出结果；对最终发布提交记录质量门证据；精确区分 backup 的复制与镜像语义。
- 构建脚本：裁剪复制失败时失败退出；生成产物清单并进行隔离启动检查；将构建镜像提供的工具契约版本化。
- 配置与运行：统一维护无真实值的变量清单；将管理员自检与基础设施探针分开定义；停止输出 SUDA_WEBUSER 原串片段。
- 文档：按版本与环境整理验证记录，补齐首次发布和回退的可执行步骤；保留未确认业务口径的明确状态。

## 13. 原准备要求：后续全量审计批次与五个优先位置

本轮完成第 8 批部署专项，没有据此宣称整个业务项目已经全量审计。

| 批次 | 下一步对象与重点 |
| --- | --- |
| 1 | 领域／引擎：规则 1–12，CMR 吨级、15 天边界、A/B、稀疏门槛、无数据、日期及 S1。 |
| 2 | 数据模型／SQL／导入：T/D 字段、状态、审计列、RLS、批次切换、历史只读、迁移清洗和时区。 |
| 3 | 飞书／平台适配：字段格式、分页、单 Base 写队列、限流、幂等、Outbox、镜像回写与 streaming 竞争。 |
| 4 | 后端服务／任务：鉴权和金额裁剪、采纳、兼容表、自动化身份及多实例并发。 |
| 5 | React：P01–P11 的请求与展示，空／错误状态、灰色斜线、S1、引擎数值不被前端或模型改写。 |
| 6 | 测试可信度：假服务与真实平台差异、夹具来源与覆盖缺口。 |
| 7 | 安全复核：接口／角色／RLS、上传导出、数据和凭证进入日志及产物的路径。 |
| 8 | 构建部署：本报告；待补真实平台与隔离产物证据。 |

准备阶段判断的五个优先位置及本轮落点：

1. PortsModule 与 LarkModule 的模式、身份和客户端装配 → D08-01/02。
2. package → build/prune/run 的完整产物链 → 第 9 节及 S08-01/02。
3. miaoda-deploy.ps1 的 push/release、提交范围与授权 → D08-04/05/06/07/08/12。
4. dev/lint/hooks 的 Windows 调用与依赖入口 → D08-11 和第 9.3／10.2 节。
5. 平台 axios／页面入口与服务端日志／自检接缝 → D08-03/10 和第 10.3 节；真实前端页面联调不在本部署专项中冒充已完成。
