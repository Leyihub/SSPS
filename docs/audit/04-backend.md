# 04 后端接口、导入与健壮性审计

日期：2026-11-06（Asia/Shanghai）。本报告为只读代码审计，不是上线验收，也不是修复记录。

## 1. 范围、基线和证据等级

- 代码根：`C:\Users\董金\ssps-miaoda`；规格根：`C:\Users\董金\WorkBuddy\SSPS`。下文 `server/...:行号`、`package.json:行号` 均相对代码根，`docs/...:行号` 均相对规格根。
- 主审范围：`server/modules/{admin,capacity,hello,imports,master,ports,prediction,view,voyage}`、`server/importers`、`server/common`、`server/lib`，共 43 个文件（包含本次期间新增的角色守卫）。为判断调用结果，追读了必要的 engine/domain/ports/adapters/lark、数据库约束、平台 SDK、现有测试；不宣称完成这些依赖目录的独立全量审计。
- 起始 HEAD：`24051ff31b8cfb38289268da5434716aa5ae5ca6`，分支 `sprint/default`。审计期间其他工作将 HEAD 推进到 `b27bd134f71ad2f911507cc2824110c19b5baaf4`；**本报告锁定后一版本为审计基线，行号和测试结果均对应该版本**。差异涉及角色守卫、PortsModule、相关测试和 smoke 脚本，已重新阅读。交付复查又见HEAD变为`2463526f69b3dfc06ac41cbd8430cf08ab823ebe`，其依赖层更新说明见§12，避免将不同时点的测试结果混用。
- 当前工作区检查为干净。审计没有修改代码仓文件，没有运行任何 git 写命令，没有读取 `.env.local`，没有调用真实飞书、妙搭或业务数据库。唯一交付写入为本报告。
- 规格：`docs/implementation-plan.md` §8 A01–A30、K01–K14及写入一致性补充；`docs/schema/migration-rules.md`、T02/T05/T09–T10、D-app-db、status-rules；`docs/handoff/scheduled-jobs.md`、permission-matrix、claude-code-handoff；本轮用户规则 1–12。
- **S（静态确定）**：沿已读代码可确定分支及结果，下面提供最小触发场景；未声称已向 HTTP 或真实服务执行该场景。**T（已有测试证据）**：实际执行的仓库用例证明对应行为，不等于新增缺陷场景已实测。**R（条件风险）**：给出失败／并发／部署条件及具体执行顺序。**疑似**：缺少外部事实或规格裁决，单列，不算已确认缺陷。
- 所有示例输入均为人工构造，未使用真实业务文件。本次文件名扫描未发现代码仓内的 `.xls/.xlsx`（排除 node_modules、.git）；这不是历史提交或所有数据格式的泄露审计。

### 1.1 实际验证及限制

| 检查 | 本次结果 | 限制 |
|---|---|---|
| 原样 `npm test` | 退出码 0，**tests=0** | Windows 默认 npm 脚本 shell 下没有发现测试，不能算通过 |
| 同一 `npm test`，仅进程环境指定 PowerShell 为 npm script shell，禁用 tsx 缓存 | tests=177，pass=171，fail=0，skipped=6 | 未改 package.json；PGlite/假飞书/假目录；不能证明真实平台兼容性 |
| `npx eslint server client/src --quiet` | 退出码 0，无错误输出 | 设置 npm 离线模式，使用本地已安装依赖；静态检查不证明业务正确 |
| `npm run type:check` | 未执行 | 前端配置开启 incremental；后端继承配置同时开启 incremental/composite，可能写 tsbuildinfo，不满足代码仓不写文件的约束 |
| `npm run smoke` | 未执行 | 会先 `build:server`，写 dist 并删除 dist/server/test，与只读约束冲突 |

运行前检查了测试脚本、测试入口与 helpers：数据库为 `new PGlite()`，飞书调用注入假 fetch/FakeBase，无真实配置加载。6 个跳过项是夹具与源文档／原型的同步比较，因为平台仓不含源目录。`server/test/helpers/pg.ts:14` 主动去掉 RLS/policy，测试通过不能证明真实 RLS。

**已排除旧问题：** 当前 `server/common/guards/ssps-role.guard.ts:23` 和 `server/modules/ports/ports.module.ts:45` 已给所有现有 `api/...` 控制器统一解析身份。不能再仅凭控制器没有 `actor()` 就报告“无角色可读取”。新增守卫单测已通过；真实平台鉴权中间件时序未由本次执行验证。

## 2. 实际路由与 A01–A30 对照

共有 **51 个业务 HTTP 方法／路径组合**；另有平台 ViewController 的 GET `/`、GET `*`。`ports` 仅依赖装配；`hello` 无生效路由。下表覆盖全部计划条目；§2.2补齐表外辅助路由。

表中权限描述均以“先通过全局 SSPS 身份守卫”为前提；系统管理员默认业务全权，历史只读仍受服务约束。

| 编号 | 实际路由与控制器行号 | 入参／出参与计划对照 |
|---|---|---|
| A01 | GET `/api/me`；master.controller.ts:14 | 返回 userId/name/role/dept/today；存在；today 有 UTC 问题 D02 |
| A02 | GET `/api/ports`、`/api/berths`、`/api/vessels`；master.controller.ts:16,20,24 | ports/vessels 支持 q 模糊匹配；berths 没有 q；均返回数组，无分页。计划“带别名模糊匹配”是否要求泊位也支持需澄清 |
| A03 | POST `/api/ports`、`/api/berths`、`/api/vessels`；PATCH 分别为 `/:en`、`/:code`、`/:id`；master.controller.ts:17–26 | Body 为对象，服务校验；返回保存行。PATCH 标识是计划路径的细化，不单独认定缺陷；泊位越界见 D01 |
| A04 | GET `/api/route-rules`；master.controller.ts:28 | 返回 `buildRule()` 的规则、采用口径及有效航程；存在 |
| A05 | POST `/api/route-rules`、PATCH `/api/route-rules/:id`；master.controller.ts:29–30 | 主管／系统管理员；patch 仅 exp/expMax/biz/status；返回 buildRule 结果。计划未定义完整 JSON 字段名 |
| A06 | POST `/api/route-rules/recompute`；master.controller.ts:32 | 无业务 Body；返回 rules/changed/switched；手动系统管理员，定时内部调用 |
| A07 | GET `/api/voyages`；voyage.controller.ts:18 | biz/status/from/to/owner/q/mine/focus/page/pageSize；返回 total/page/pageSize/items/counts/owners；分页和布尔问题见 §3、D11 |
| A08 | GET `/api/voyages/:id`；voyage.controller.ts:19 | 返回 voyage/cargo/settlement/salesExt/etaRevisions/changeLog/can，金额分组裁剪；存在 |
| A09 | POST `/api/voyages`；voyage.controller.ts:20 | biz/load/disch 等基础字段、可选 cargo；返回 voyage/cargo；必填规格差异见 D03、§8 |
| A10 | PATCH `/api/voyages/:id`；voyage.controller.ts:21 | 对象字段白名单，经 clean→validateChain→deriveStatus；返回航次。日期问题见 D05 |
| A11 | POST `/api/voyages/:id/milestones`；voyage.controller.ts:22 | `{field,value}`，field 枚举；返回航次，写 D02；日志补偿问题见 R01 |
| A12 | POST `/api/voyages/:id/eta`；voyage.controller.ts:23 | `{eta,basis}`，依据限定船讯网／船代／电话；返回航次，写 D01/D02；见 R01 |
| A13 | POST `/api/voyages/:id/cargo-lines`，PATCH/DELETE `/api/voyages/:id/cargo-lines/:no`；voyage.controller.ts:26–28 | 修改、删除用明细编号 :no，是计划细化；返回行或 `{deleted}`。PATCH 校验漏洞见 D03 |
| A14 | PATCH `/api/voyages/:id/bulk-settlement`；voyage.controller.ts:30 | 作业／费用分组鉴权，返回裁剪后的结算对象；存在 |
| A15 | PATCH `/api/voyages/:id/sales-ext`；voyage.controller.ts:31 | 仅 way/contract，way 限 CFR/FOB；返回销售扩展；合同类型校验不完整见 §3 |
| A16 | POST `/api/voyages/:id/flags`；voyage.controller.ts:24 | `{flag,on}`，返回推导状态的航次；这是 K10 允许的异常标记，不等同于已移除的风险评分体系 |
| A17 | POST `/api/berth-plans/import`；imports.controller.ts:32 | 实际接 JSON `{fileName,rows,planDate?}`；Excel multipart 在新增 `/import-file`；返回 batch/summary/coverTo。计划原路径描述为上传 Excel，契约不一致见 D09 |
| A18 | POST `/api/berth-plans/pull`；imports.controller.ts:35 | HTTP 手动系统管理员；定时直接调服务。返回 found/imported/skipped/failed；当前按文件标识去重 |
| A19 | GET `/api/berth-plans/batches`、`/api/berth-plans/batches/:batchNo/rows`；imports.controller.ts:40–41 | 返回数组；rows 可 status 筛选；计划 :id 实际是批次编号，属标识细化。明细去 raw，保留解析结果 |
| A20 | GET `/api/capacity/calendar`；capacity.controller.ts:12 | **实际 tons/days，计划 from/to/tonnage**；结果 today/tons/pool/planCoverTo/voyHorizon/days，日状态为 `nodata`，计划写 `no_data`；见 D09 |
| A21 | POST `/api/predictions`；prediction.controller.ts:12 | biz/tons/load/disch/winStart/winEnd/item?/buffer?；返回 status/runNo/result，status 为 ok/no_rule/no_candidate；无方案不保存 run。窗口校验见 D05、R08 |
| A22 | GET `/api/predictions/:runNo`；prediction.controller.ts:15 | 返回 runNo/run/plans/announcements，S1 在 plans.provenance；计划 :id 实际是运行编号。实时泊位视图由另一个 capacity/day 接口提供，并非详情响应直接内嵌 |
| A23 | POST `/api/predictions/:runNo/adopt`；prediction.controller.ts:16 | `{label, voyageId?}`，幂等头可选；返回 runNo/label/adopted/created/voyage；并发及失败重试见 R02 |
| A24 | **无 POST `/api/announcements`**；替代为 POST `/api/predictions/:runNo/announcement`；prediction.controller.ts:17 | 仅 `{label}` 从已存方案生成，返回 label/parts/text/by/at；没有“由航次直接生成”的分支，见 D09 |
| A25 | GET `/api/data-issues`、PATCH `/api/data-issues/:id`；voyage.controller.ts:40–43 | 查询 status/owner/type；修改 status 限处理中／已关闭；返回数组或问题行；需责任人姓名或系统管理员 |
| A26 | POST `/api/admin/compat/refresh`；admin.controller.ts:16 | 无业务 Body；返回 skipped/a/b；存在，多实例及重入风险见 R04 |
| A27 | **无 POST `/api/admin/migrate`** | 仅 `planMigration()` 与本地 dry-run 脚本；正式迁移写入尚未实现。交接手册明确未做，列为计划缺口 G01，不表述为已上线故障 |
| A28 | GET `/api/admin/sync-logs`、`/api/health`；admin.controller.ts:11–12 | logs: failOnly=`1/true`，返回日志数组；health: at/checks；系统管理员。真实日志仓储默认最多 200 条 |
| A29 | POST `/api/predictions/parse`；prediction.controller.ts:14 | text、overrides?；仅解析，不生成预测数值。overrides 结构无 DTO 校验，见 D12 |
| A30 | GET `/api/inventory`、POST `/api/inventory/import`；imports.controller.ts:48,52 | GET 返回 batch/errorRows/stale/items，items 没有断料日；断料信息在 trend/stock-plan。POST 原路径为 JSON，文件在 `/import-file`；见 D09 |

### 2.1 注册、路径和权限说明

控制器文件完整前缀为 `server/modules/<模块>/<模块>.controller.ts`。A25 与 A07–A16 共用 voyage.controller；A17–A19 与 A30 共用 imports.controller。

所有写接口返回 Promise 或 await 后返回，控制器层未发现“启动写入后不等待就返回成功”的确定路径。全局守卫只负责准入，业务服务仍承担角色、本人／部门、历史只读、费用权限。`view.controller.ts:7` 是平台兜底，不计算业务；未知 GET `/api/...` 有落入 HTML 兜底的可能，本次未启动 HTTP 服务，列为疑似响应契约问题，不能断言平台 configureApp 没有额外处理。

### 2.2 计划清单之外的有效业务路由（不是自动认定为“多余功能”）

| 路由 | 用途及位置 |
|---|---|
| GET `/api/capacity/day` | 日历点击明细，capacity.controller.ts:13 |
| POST `/api/predictions/stock-plan` | 库存断料与航程测算，prediction.controller.ts:13 |
| POST `/api/berth-plans/import-file` | 实际 Excel 上传，imports.controller.ts:33 |
| GET `/api/inventory/batches` | 库存批次，imports.controller.ts:49 |
| POST `/api/inventory/trend` | 库存趋势，imports.controller.ts:50 |
| POST `/api/inventory/import-file` | 库存 Excel 上传，imports.controller.ts:51 |
| POST `/api/data-issues/scan` | 手动质量扫描，voyage.controller.ts:39 |
| POST `/api/admin/replay` | 手动补偿，admin.controller.ts:14 |

这些辅助接口服务于已允许的一期范围，应补进接口规格。`hello` 的 controller/service/dto/module 全部为注释示例，且不在 AppModule 注册；不是可访问的测试后门。上线前删除属于 P2 清理建议，并非阻断项；本次未删除。

## 3. 响应、校验、分页与排序

1. **成功响应没有统一 envelope。** 控制器直接返回数组或业务对象，列表只有航次使用 `{total,page,pageSize,items,...}`。计划没有明确要求所有成功结果必须包 `{code,data}`，因此不能仅凭形式不同认定缺陷。未显式覆盖 HttpCode 的 POST 使用 Nest 默认成功状态，不能要求调用者只接受 HTTP 200。
2. **错误响应统一为 `{error:{code,message,details?,fieldErrors?,timestamp,...}}`。** 业务错误常用 403/404/409/422；平台 DTO ValidationPipe 一般是 400，与服务校验 422 并存。生产未知异常去掉响应 stack/cause；非 production 会保留。413 未映射见 D13。
3. **航次分页：默认 page=1、pageSize=50；最大 pageSize=200，并非 500。** `voyage.dto.ts:72–73` 限整数、最小 1；`voyage.service.ts:142` 先全量取数再 slice。超出末页返回空 items 和实际 total；页码没有最大值。pageSize=201 应被 DTO 拒绝。规格中的“500”是飞书批量／分页限制，不能据此认定应用页大小 200 错误。
4. **其他列表不支持统一分页。** 主数据、批次、批次行、问题清单返回全数组；日志真实适配器默认 200 条且 HTTP 不提供翻页。规模影响见 R08。
5. **没有用户可控排序字段。** 航次排序在 `voyage.service.ts:140–142` 固定为未结束优先、未结束本港日期升序、已结束降序；不是将任意 sort 字符串拼 SQL，未发现此类排序注入。接口没有 sort/order 白名单，也没有承诺支持用户排序；多余查询键可能被忽略。
6. **平台 DTO 自动转换必须纳入审计。** 本地 SDK `node_modules/@lark-apaas/fullstack-nestjs-core/dist/index.js:36514` 配置 transform+enableImplicitConversion，未设置 whitelist/forbidNonWhitelisted。不能认为所有额外字段都被丢弃；Record Body 由服务自行检查。布尔问题见 D11。
7. `StockPlanDto.biz` 仅 IsString，无业务枚举；`TrendDto.marks` 仅逐项 IsObject，没有 d/tons 约束，until 只有 IsOptional；`ParseDto.overrides` 没有嵌套校验。`patchSalesExt()` 只对 way 枚举校验，contract 可传对象（voyage.service.ts:334–339）。后者在不同仓储／外部类型校验下会接受、失败或产生 500，真实飞书响应未验证，不报告固定 HTTP 结果。

## 4. 已确认缺陷（S；注明的 T 只证明相关行为）

### D01 · P0 · 主数据维护可把表外泊位加入 CMR，且可改掉 LN16 锁定容量

- 位置：`server/modules/master/master.service.ts:89–109`；追踪 `server/adapters/memory/live-snapshot.ts:21–25`、`server/engine/capacity.ts:17–23`。
- 事实：泊位编码只要求字母+数字；只校验码头、正容量、状态。新增未检查23泊位白名单，修改容量未保护 LN16。引擎直接使用全部启用泊位。
- 冲突：用户规则2、3；`docs/schema/T02-berth.md` 明确表外泊位不建行，容量以指定容量表为唯一依据。
- 触发：物流管理员 POST `/api/berths`，Body=`{code:"F13",terminal:"北区码头",capacity:50000,status:"启用"}`；或 PATCH `/api/berths/LN16` `{capacity:50000}`。实际保存成功且下一次5万吨查询分母增1；期望拒绝表外泊位、保持LN16=10000，不改变锁定分母。若原来N个合格泊位全占用，前一种操作将0%变为`1/(N+1)`。
- 现有测试：`server/test/master-service.spec.ts:54–63` 甚至验证任意修改容量立即进入快照，但没有验证锁定容量表边界。建议把“维护权限”和“允许改变锁定业务事实”分开约束。

### D02 · P0 · UTC“今天”及 UTC 文本被当作 WITA，影响分流和过期提醒

- 位置：`server/modules/master/master.service.ts:47`、`voyage/voyage.service.ts:50–51`、`imports/imports.service.ts:54–55`、`voyage/issue-scan.service.ts:33`、`admin/compat.service.ts:67`；依赖 `server/adapters/memory/live-snapshot.ts:17`、`server/adapters/drizzle/db.ts:8–12`。
- 事实：多处直接 `toISOString().slice(...)` 得 UTC 日期／无时区文本；toTs 又把文本解释为 UTC+8。真实导入批次 createdAt 由数据库 now 生成、fromTs还原成UTC+8，二者不一致。
- 冲突：用户规则4、9；日期工具自述WITA；迁移规则8；实施计划库存过期提醒补充④。
- 触发A：固定时钟为 `2026-11-05T17:00:00Z`，本港已是11月6日01:00，目标11月21日。实际快照 today=11月5日，距今16天走密度；期望 today=11月6日，距今15天走CMR。
- 触发B：真实库08:00Z导入库存，batch.importedAt读回16:00；09:00Z修改相关航次，服务日志字符串为09:00，toTs按WITA写入后读回仍09:00。实际 `09:00 > 16:00` 为false，不提示库存过期；期望提示修改发生在导入之后。与宿主TZ设置无关，toISOString始终UTC。
- 测试盲区：内存测试两侧均使用同一UTC字符串，无法发现数据库createdAt与业务日志的8小时差。

### D03 · P0 · 货物 PATCH 绕过新增时的必填和非负校验

- 位置：`server/modules/voyage/voyage.controller.ts:27`、`voyage.service.ts:252–267,282–286`；依赖 `server/domain/voyageLite.ts:12`。
- 事实：PATCH用Record Body，`cleanCargo(body,false)`；非负货量和名称必填仅在 requireAll=true 时执行。
- 冲突：T05的货物名称、预计装船重量必填；规则3/4要求用正确货量做吨级匹配；新增 DTO 同字段已声明 Min(0)。
- 触发：本人航次的一条50000吨明细，PATCH `{tons:-50000,name:""}`。实际传给仓储并保存负数和空名称（内存路径确定；真实适配器也原样转数字字段，没有本地二次限制），航次合计随之为负，远期竞争吨级失真；期望422且原行不变。即便真实Base另有校验，也不能把它当作应用已实现的校验。
- 顺带的规格缺口：新建仅强制name/tons，T05合同、物资大类／类别及大宗单位／事业部未校验。采纳预测允许建“待补充”货物又与必填表冲突，此部分另列§8，不能擅自决定全部拒绝。

### D04 · P0 · “万吨”被静默当成“吨”，错误值也可能被截出数字

- 位置：`server/importers/common.ts:24–35`、`imipPlan.ts:37`、`inventory.ts:21–25`、`migrate-plan.ts:22`；航次PATCH也调用同一parseNumber。
- 事实：取第一个数字片段，千分位去逗号；单位检查只要含“吨”即标吨，没有万／千倍数，调用端仅取value。
- 冲突：迁移清洗规则7“数字+单位/币种”；T05重量单位吨；用户规则3货量吨级必须真实。
- 触发：`parseNumber("5万吨")` 实际 `{value:5,unit:"吨",currency:null}`；导入库存或PATCH货量后保存5，而非50000。期望换算为50000，或明确报无法解析并拒绝参与计算。`#NUM!` 解析为null但 `#NAME?` 等错误识别并不统一；不能将“提取到数字”等同完整合法数值。
- 现有测试仅覆盖普通千分位、币种、吨/天、百分数，不覆盖万吨、全角数字、单位不兼容等输入。

### D05 · P1 · 不存在的日历日期通过校验，并被日期工具自动滚动

- 位置：`server/importers/common.ts:16–20,39–44`、`server/lib/dates.ts:6–9`、`server/modules/prediction/prediction.dto.ts:12–13`、`capacity/capacity.dto.ts:9`。
- 事实：只检查月1–12、日1–31，DTO只检查YYYY-MM-DD形状；dn使用Date.UTC自动进位，parseDateTime正则还允许尾随未识别文本。
- 冲突：迁移日期清洗规则8、T10日期合理性要求、规则9的业务日期边界。
- 触发：`parseDateTime("2026-02-31")` 返回`2026-02-31 00:00`；`dn()`按3月3日计算。将该值作预测窗口或靠船节点，实际按另一天计算或后续库层失败；期望在入口报告无效日期。带`Z/+07:00`字符串会被截为无时区字面值，不转换也不拒绝；其是否支持应明确。

### D06 · P1 · 靠船计划导入没有更新飞书 T10

- 位置：`server/modules/imports/imports.service.ts:74–98`、`server/adapters/drizzle/drizzle-import-store.ts:24–33`；全server对T10调用搜索只有类型、注释和溯源文案，无网关写调用。
- 事实：只写D03/D04和D08；IMPORT_STORE没有网关依赖，ImportsService不注入BASE_GATEWAY。
- 冲突：K04、`docs/schema/T09-T10-compat-and-berth-plan.md:3–5` 要求最新一期合格行整表覆盖T10。
- 触发：成功导入一份有active行的人工构造计划。实际应用当前批次变化，飞书T10不会由这条链路更新；期望T10也更新到该批次，或失败能补偿。引擎直接读D04，不能把“应用日历更新了”当作T10写通的证据。S1仍标“T10 最新一期”（engine/provenance.ts:16），溯源描述亦应与实际来源一致。

### D07 · P1 · 导入幂等仅覆盖批次保存，重试生成不存在批次的数据问题

- 位置：`server/modules/imports/imports.service.ts:89–97`、`server/adapters/memory/memory-import-store.ts:11–13`、`server/adapters/drizzle/idempotency.ts:8–16`。
- 事实：先计算新batchNo，再在save内复用旧结果；后续addIssues仍使用本轮新算的batchNo，不用返回batch.batchNo。
- 冲突：实施计划写入一致性补充“同一键重复提交只执行一次”；A17校验报告应指向真实批次。
- 触发：同一天，以同一幂等键K手工导入含一行日期异常的文件两次。首次保存BP-日期-01；第二次计算02，save返回01，但又写对象`BP-日期-02#1 ...`的问题。实际只有01批次，却出现02的问题；期望复用首次整份结果且不新增副作用。
- 现有测试覆盖仓储幂等和文件标识去重，没有覆盖服务层save之后的幂等副作用。

### D08 · P1 · 校验报告丢失 Excel 原始行号，库存部分错误没有逐行原因

- 位置：`server/lib/xlsx.ts:57–81`、`server/importers/imipPlan.ts:35`、`inventory.ts:20,24,36`；持久化依赖 `drizzle-import-store.ts:70,85`。
- 事实：读取器忽略XML行号、过滤空行；清洗器重新用数组idx+1。库存缺品名／日期只增加skipped，既无逐行原因也不保存该原行；库存错误行存库时未保存line，查询回来也没有line。
- 冲突：A17校验报告、P07异常定位；迁移规则总则“无法自动判定的记录进清单”，以及本轮逐行报告要求。
- 触发A：Excel第1行为表头，第2行空，第3行缺预计卸完；实际报告line=1，而错误是工作表第3行。期望表名+原始行3+原因。
- 触发B：库存有一行有效、一行缺库存日期；实际summary.skipped=1但errorRows里没有该行及原因。期望列出缺日期行，不能只报计数。缺列判断又从前50条数据的键推断，整列空值时会把“有表头但值缺失”误报成缺表头。

### D09 · P1 · 对外契约与 A17/A20/A24/A30 不一致，部分能力缺失

- 位置：`server/modules/capacity/capacity.controller.ts:12`、`imports/imports.controller.ts:32–33,48–52`、`prediction/prediction.controller.ts:12–17`、`imports/imports.service.ts:158–163`。
- 冲突：实施计划A17、A20、A24、A30（§8）。后续交接手册记录了新路径，形成版本漂移，应裁决并更新唯一契约，不把前端已适配等同原计划仍有效。
- 触发A：按A20请求 `GET /api/capacity/calendar?from=2026-11-10&to=2026-11-12&tonnage=100000`。实际忽略这三个键，使用50000吨、从今天起30天；期望指定日期和10万吨分母。新前端使用tons/days不受这个旧契约调用影响。
- 触发B：按A17向`/import`发送multipart Excel。实际该路由不安装文件拦截器，ImportDto需要rows，不能按计划完成；应走`/import-file`或提供兼容入口。
- 触发C：已有航次但没有预测run，请求`POST /api/announcements`。实际没有路由，现有announcement要求runNo+label；期望A24允许“由航次或方案”生成。仅改路径文档仍不能补足航次分支。
- 触发D：某库存序列存在明确断料日，GET `/api/inventory`实际items没有该字段；期望A30描述的可用天数与断料日。可通过辅助接口取得是替代设计，需要规格同步。

### D10 · P1 · ETA过期判断重复实现且已发生口径漂移

- 位置：`server/modules/voyage/voyage.service.ts:148` 与 `server/modules/voyage/issue-scan.service.ts:38–41`。
- 事实：列表只看eta、未抵卸港、etaUpdated和天数；扫描还排除历史只读、已结束、取消。
- 冲突：K10取消已结束、状态规则；扫描自身定义及工作台ETA待办应使用同一有效航次范围。
- 触发：一条取消航次仍有ETA、无实际抵卸港、ETA更新时间距今4天。实际列表返回`etaStale:true`，扫描不生成且会关闭该类问题；期望列表与质量待办一致，已取消航次不继续提示需更新ETA。这是实际漂移，不只是“服务里有计算”的风格意见。

### D11 · P1 · 真实平台隐式布尔转换使 mine=false/focus=0 变为 true

- 位置：`server/modules/voyage/voyage.dto.ts:70–71`；平台ValidationPipe `node_modules/@lark-apaas/fullstack-nestjs-core/dist/index.js:36514`；`node_modules/class-transformer/cjs/TransformOperationExecutor.js:91–94,298–300`。
- 事实：先按反射类型执行Boolean(value)，再执行自定义Transform。Transform读取转换后的value而非原始obj[key]；非空字符串`false`、`0`都先变为true。
- 冲突：A07布尔快捷筛选的正确性；同DTO注释期望字符串1/true才开启。
- 触发：数据库有本人和他人的航次，GET `/api/voyages?mine=false`，真实构建有装饰器元数据时实际开启“只看我的”；期望false关闭筛选。`focus=0`同理。直接new ListQuery或tsx未生成类型元数据的单测不能覆盖该路径。
- 证据边界：SDK和转换器执行次序已读，HTTP实测未做；复核时需使用真正Nest构建及全局pipe，而不是绕过pipe调用服务。

### D12 · P1 · 嵌套输入未校验，用户输入能产生500或无意义的成功结果

- 位置：`server/modules/prediction/prediction.dto.ts:27–29`、`prediction.service.ts:91–94`；`server/modules/imports/imports.controller.ts:22–25`、`imports.service.ts:193–201`。
- 事实：overrides.b任意字符串直接进dn，非法格式抛普通Error；trend.until任意类型直接Math.min，NaN导致所有日期比较和循环不成立。
- 冲突：A29解析参数／A30库存测算输入正确性及统一参数错误语义。
- 触发A：POST `/api/predictions/parse` `{text:"测试",overrides:{b:"not-a-date"}}`，实际dn抛错→500 INTERNAL_ERROR；期望400/422指出日期无效。
- 触发B：已存在物料TEST，POST `/api/inventory/trend` `{name:"TEST",until:"bad"}`，实际until=NaN（JSON为null）、series/base为空仍成功；期望拒绝无效until。marks内部d/tons也应逐字段校验，而非只检查是对象。

### D13 · P2 · 上传超过10MB时统一错误响应缺少 code

- 位置：`server/modules/imports/imports.controller.ts:12`、`server/common/filters/exception.filter.ts:34–44`、`server/common/constants/api_response_code.ts:30–54`。
- 事实：Multer大小异常产生413，HTTP映射表没有413；error.code取undefined，JSON序列化后字段消失。
- 冲突：`server/common/interfaces/api_response.interface.ts:6` 声明code为必有字符串；本轮统一错误码要求。
- 触发：有权上传的账号提交10MB以上文件。实际413响应可没有error.code；期望保留稳定可识别的错误码及大小提示。不是要求为所有HTTP状态机械新增业务码，而是需要兜底。

## 5. 真实环境、并发和规模风险（R）

### R01 · P0 · 航次事实写入成功后，ETA修订／变更日志失败没有完整补偿

- 位置：`server/modules/voyage/voyage.service.ts:187–190,214–216,229–231`；`server/modules/admin/admin.service.ts:34`；依赖 `server/adapters/drizzle/drizzle-voyage-store.ts:65,73–74,281,285`、`server/lark/outbox.ts:30–32`。
- 事实：仓储Outbox在镜像回写完成后即done；D01/D02由服务随后另行写入，重放处理器仅补镜像，不含这些服务日志。
- 标准：K13每次ETA修订留痕；A11写D02；实施计划§10骨架3及一致性补充要求后台补偿回写和日志。
- 可复现故障序列：把本人航次ETA从11月10日改到11月11日；飞书及镜像已成功，随后D01插入失败或进程终止。实际Outbox已done但修订历史缺失；用户以同一键重试时`nw===prev.eta`被422拒绝，admin/replay也不会补D01。期望业务事实与修订历史可一致恢复。普通字段更新还有`entries.length===0`直接返回的问题，无法补齐先前丢失的D02。
- 本次未注入故障；是可由执行顺序确定的恢复缺口，不能因已有“镜像回写失败补偿”测试通过而排除。

### R02 · P0 · 方案采纳的检查、建航次与采纳标记之间没有原子性

- 位置：`server/modules/prediction/prediction.service.ts:57–64`；依赖 `server/adapters/drizzle/drizzle-prediction-store.ts:53–56`（adopt方法）。
- 事实：先get并判断adopted，再调用VoyageService写入，最后更新采纳标记；无原子抢占／compare-and-set／跨步骤恢复记录。幂等键是请求可选值，并非方案唯一键。
- 标准：服务承诺“同一方案只能采纳一次”；A23、实施计划写入一致性。
- 触发：两个并发请求对同一runNo+label、不同请求键，都读到adopted=false，再分别新建航次。实际可创建两条，最后标记只指向其中一条；期望仅一次采纳，另一请求得到同一结果或明确冲突。另一场景是建航次成功、store.adopt失败：重试依赖同键和全流程幂等，换键会重复建航次。
- 额外重试语义：已经成功后，同键重试先被adopted检查409拦截，不能拿到首次成功结果。这是幂等返回契约问题，不能把它当作并发防护。

### R03 · P0 · 多阶段／多批新增失败重试可能重复创建飞书记录

- 位置：服务入口 `server/modules/voyage/voyage.service.ts:187`、`server/modules/admin/compat.service.ts:78`；必要依赖 `server/adapters/drizzle/drizzle-voyage-store.ts:181–188`、`server/lark/bitable.ts:40–49`、`server/lark/queue.ts:9–14`。
- 事实A：航次Outbox的writeLark先创建T04，再创建T05；只有两步都成功才持久化包含新ID的结果。T05失败时，已成功的T04 ID不在可恢复结果里。
- 事实B：网关把整个切批循环包进一个队列任务；RetryableError重试从循环第一批开始，而非从失败批开始。
- 标准：实施计划§10写入一致性、K03挂靠粒度、每键仅执行一次；飞书≤500条只解决单批大小，不解决多批幂等。
- 触发A：T04成功，随后T05业务错误；Outbox记failed，同键重试再次执行T04创建。实际多出一条航次；期望复用已创建T04或补偿。
- 触发B：兼容表需新增600行，首500行成功，次100行收到429；队列重试整个循环，实际500行重复创建，最终1100行；期望600行。已有测试只模拟第一批先失败，没有覆盖“前批已成功、后批失败”。
- 本条是本范围写调用的依赖风险，相关lark实现不在本次独立全量审计范围，但已读到完整触发链。

### R04 · P1 · 兼容表刷新锁只在进程内，三个重入请求甚至可在单进程并发

- 位置：`server/modules/admin/compat.service.ts:28–33,38–57,74–79`、`jobs.automation.ts:36–40`。
- 事实：dirty/running为实例内存变量，无分布式锁；发现running后只await一次，不再次占锁。多个等待者被同时唤醒后各自开始doRefresh，finally还会互相清running。
- 标准：同Base写串行的平台约束、T09每货物明细一行、定时任务重入正确性。
- 触发A：请求A正在刷新，B/C均停在await A；A完成后B/C同时读同一旧IDs并分别新增差额。即使队列逐个执行写任务，两者各自的“读IDs→决定新增”仍可能重复。期望整轮刷新互斥。
- 触发B：两个应用实例各跑cron或手动刷新，各有队列和dirty标记，不能实现Base级全局串行；某实例保存后另实例增量任务仍看到dirty=false。可能重复行／混合版本或直到每日全量才更新。尚未验证平台是否保证只回调单实例，因此不声称实际部署必然重复调度；应用内缺少保护是确定事实。

### R05 · P1 · 快照版本按“最后导入”覆盖，批次编号并发冲突；过旧数据没有年龄提示

- 位置：`server/modules/imports/imports.service.ts:81,89–95,118–125`；依赖 `server/adapters/drizzle/drizzle-import-store.ts:25–32,46–50`、`server/adapters/memory/live-snapshot.ts:23–27`、`server/engine/capacity.ts:27–33`。
- 事实：任何status=成功的新导入都切current；不比较计划日期、源文件修改版本、内容摘要。batchNo用“当日已有批次数+1”，不是事务内序列。云空间按文件标识去重，修改同一文件内容并不再次导入。
- 标准：K04及T10“最新一期”、实施计划整批切换一致性。快照最大允许年龄尚无明确数值，不能自行设24小时等阈值。
- 触发A：已有11月6日计划，之后补传11月4日旧计划，明确planDate=11月4日。实际旧计划成为current，后续预测用旧计划；期望历史补存不静默替换较新计划，或显式要求版本选择。
- 触发B：两个同日导入同时读出数量n，生成同batchNo；真实唯一约束使一方失败（原始DB异常可能500），不能保证并发都成功。期望数据库生成版本或明确冲突结果。相同文件标识并发也只是由唯一约束兜底，不是两次均可成功复用结果。
- 触发C：数日前的批次仍有未来预计靠泊日，今天在其coverTo以内。实际CMR仍为ok，未因批次年龄降可信；覆盖期外则正确nodata。用户能在部分预测S1看到planDate，但日历没有batchAge/stale字段。是否应停用／只提醒需业务确认，列风险而非已确认违反某个TTL。
- 文件级幂等现状：手工同文件换键／无键会新增批次；同键复用仓储结果但有D07；云空间同文件标识跳过，文件换标识但同内容会再次导入。尚无内容hash与文件修订号策略。

### R06 · P0 · 生产环境漏配或拼错 SSPS_STORE 会静默运行内存演示与兜底身份

- 位置：`server/modules/ports/ports.module.ts:34–54`；依赖 `server/adapters/memory/memory-directory.ts:6–10`、`server/lark/lark.module.ts:25–41`。
- 事实：只有严格等于real才选真实实现；空值、REAL、拼错值均走内存，没有按NODE_ENV阻止。内存身份目录给未知用户兜底业务员，主数据使用seed；重启丢写入。
- 标准：K01/K09生产数据主权、权限矩阵准入、用户“阻断上线／错误业务结论”严重度；交接手册也明确警告该发布前置条件。
- 触发：生产部署NODE_ENV=production、未设置SSPS_STORE，其余启动条件满足。实际新角色守卫仍会调用MemoryDirectory放行兜底身份，用户看到演示主数据并可写入易失内存；期望生产必须显式选择合法存储模式，缺关键配置启动失败。开发环境使用memory本身不是缺陷。
- real模式正确之处：缺DRIZZLE_DATABASE／AuthorizationSDK／基本飞书配置时会报错，不是所有缺配置都回落。剩余缺口：BITABLE_TABLE_IDS只检查非空对象，不逐项检查T01–T10及值类型；缺T04可启动，首次写航次才失败。云空间folder缺失按任务规格运行时提示503，并非全应用必须启动失败。

### R07 · P1 · 大文件全量解压与解析，只有单条目上限，没有总预算

- 位置：`server/lib/xlsx.ts:7,23–28,44,55–81`、`server/modules/imports/imports.controller.ts:12`；必要依赖 `server/lark/drive.ts:27–31`、`server/adapters/drizzle/drizzle-import-store.ts:25–33,64–76`。
- 事实：上传先完整Buffer；readZip解压所有条目（含不用的工作表／资源），每个deflate条目限制50MB但总大小无限制；XML全文、grid、rows、清洗结果及JSON会并存。没有流式解析。云空间下载在完整arrayBuffer之后才检查20MB。
- 标准：本轮大文件健壮性；平台有限内存下请求应有明确资源预算，而不是无限扩张。
- 触发：一个压缩后小于10MB、含30个各解压40MB条目的人工构造xlsx；每条都通过50MB检查，实际仅解压Buffer就约1.2GB，可能造成进程OOM／阻塞其他用户。期望限制累计解压大小、条目数、行列数，下载在读取中止超限。本次没有构造或运行压缩炸弹。
- 数据库写入：Drizzle每500行顺序insert，但**整份文件是一个事务**；这保证原子切换，却不限制总事务大小。不能把“500行insert”写成“每500行独立事务”。大文件失败前仍可能长时间占用内存和连接。

### R08 · P1 · 查询／预测没有统一规模预算，全量读和未限窗口会放大资源消耗

- 位置：`server/modules/voyage/voyage.service.ts:120–142`、`imports/imports.service.ts:175–184`、`prediction/prediction.dto.ts:7–15`、`prediction.service.ts:38`；依赖 `server/adapters/memory/live-snapshot.ts:21–22`、`server/engine/recommend.ts:26–36,56–60`。
- 事实：列表先取全航次和货物再分页；库存过期检查逐航次读changeLog；快照逐航次cargo并发查询。普通预测窗口没有最大跨度，循环枚举到winEnd；日历days虽限90，预测没有相同预算。
- 标准：实施计划预计数千航次规模、本轮分页和规模健壮性。不能用飞书500限制推导应用必须每页500。
- 触发A：POST预测的biz/load/disch/tons合法且有航程规则，winStart为当前合法日、winEnd=`9999-12-31`。实际可能构造约数百万候选及逐日对象，阻塞事件循环或OOM；期望入口拒绝超出业务允许跨度的窗口。业务最大跨度需规格确认，应用资源上限则不能缺失。
- 触发B：数千航次，GET voyages?pageSize=1仍取全航次货物；GET inventory还逐条查日志。实际查询数和内存远大于一页规模；期望分页／聚合下推及批量日志读取。未跑真实库压测，不给出臆测的延迟毫秒数。

### R09 · P1 · 外部调用无应用超时；任务失败吞错后缺少可恢复状态与告警

- 位置：`server/modules/admin/jobs.automation.ts:25–27,30–46`、`master/master.service.ts:191–200`、`imports/imports.service.ts:112–130`；依赖 `server/lark/token.ts:10–17`、`drive.ts:16,27–31`、`bitable.ts:15–17`、`queue.ts:9–23`。
- 事实：fetch无AbortSignal／应用超时；写队列只重试RetryableError（2/4/8/16秒），普通网络错误不退避；读、取凭证、云空间调用没有同样重试。云空间429虽被转换为RetryableError，却没有调用queue.run的外层，下一次定时才有机会重试。无熔断。不能说Node底层网络完全没有自身超时，问题是应用没有可控的整次调用预算。
- 标准：本轮外部调用可靠性；scheduled-jobs.md规定吞错只记日志，因此吞错本身不是违背当前任务规格，但其恢复与可观察性有上线风险。
- 触发A：飞书端连接或响应体长期不结束，应用未到可控截止时间中止；一个写任务占据tail，后续同Base写操作一直排队。期望有应用超时与安全重试／人工恢复策略。
- 触发B：航程重算saveRouteStats失败，实际Jobs.run只warn并返回null；master只在成功后写D09，管理员同步日志未必能看见失败，平台调用也没有失败异常可据此重试。pull返回failed数组时run仍打印“完成”；告警系统未接入。期望按任务结果区分成功／部分失败，记录可查询失败及可重试状态。
- 未捕获Promise检查：本范围控制器／任务基本都有return或await，未发现forEach(async)等确定漏等写操作；`running.catch`是继续排队的显式处理，`logged()`失败还会尝试写失败日志，但日志自身失败可遮住原始异常。后者是次要诊断建议，不重复计严重问题。

## 6. 业务逻辑是否集中在 engine/domain

| 计算／推导位置 | 是否共用实现 | 审计判断 |
|---|---|---|
| PredictionService.build/predict（prediction.service.ts:26–45） | createEngine、buildRule、toRunRecord、toPlanRecord | 推荐数值由引擎产生，没有模型改写链路 |
| PredictionService.announce（:68–74） | announceFromProvenance | 使用保存的溯源，不重新预测；港名显示另从当前主数据取，不影响数值来源 |
| CapacityService.calendar（capacity.service.ts:19–22） | createCapacity.calendar | CMR/重叠船数由引擎计算 |
| CapacityService.day（:30–36） | 主数值调dayDetail，但逐泊位capable/occ/free再本地计算 | **部分重复**：status/容量筛选与引擎poolFor重复，row区间与引擎rows重复；未发现本轮固定口径不同，但未来易漂移。应使用det.P和引擎提供的占用映射 |
| VoyageService.need/list/create/apply/setFlag | deriveStatus、validateChain、missingDeparture | 状态大体统一，没有controller/view另写一套状态机 |
| IssueScanService、ImportsService.inventoryStale、CompatService | deriveStatus | 共用状态推导；ETA过期另有重复且已漂移，见D10 |
| MasterService.routeRules/recompute | buildRule、deriveFields、recomputeRules | 航程及节点派生值统一来自domain |
| PredictionService.stockPlan（:82–84） | effStockout/ruleFor来自engine，但latest=so-buffer、ceil(P80)在service再算 | **部分重复**；普通预测也做这些计算。当前默认buffer=3还写在service，未引用CONFIG.DEFAULT_BUFFER_DAYS；改配置可能漂移，列P2建议 |
| ImportsService.inventoryTrend（:193–201） | stockout/project | 趋势计算复用engine；日期范围裁剪在service |
| importers/inventory.ts:29–34 | 自己填补日耗、算stock/days/series | 数据清洗混入业务摘要计算，没调用统一domain；默认日耗1、0被前值替代，需要明确缺日耗语义，见§8 |
| importers/imipPlan.ts:50 与 engine/capacity.ts:27–28 | 各自算最后预计靠泊日为coverTo | **重复**，目前同口径；按最晚靠泊还是卸完仍是待确认项，不擅自改 |
| common日期、服务today/now、Drizzle时间转换 | lib/dates提供字面值日序号；“今天／现在”各服务重写 | 已出现UTC与WITA不一致，见D02 |
| ViewController | 只序列化平台渲染参数 | 未发现CMR、状态、剩余天数计算 |
| hello | 所有示例均注释 | 无运行计算，不纳入业务口径漂移 |

`CMR`相关代码搜索并不等于“所有计算都必须在engine”。输入格式转换、展示DTO组装合理地留在service；需要收敛的是重复业务判定、门槛和时区语义，而非把控制器所有常量机械搬家。

## 7. 迁移清洗规则逐条覆盖

下表的“有测试”表示读到了对应现有用例且本次测试整体通过，不表示所有边界都覆盖。当前`planMigration()`只返回统计／确认清单，不返回完整可执行T01–T07写入模型；不能声称完成正式迁移。

| 规则 | 实现位置 | 已有测试 | 缺口／结论 |
|---|---|---|---|
| 1 港口归一、备注日期保留 | migrate.ts:6–11；migrate-plan.ts:31–35 | importers.spec.ts:65；migrate-plan.spec.ts:30 | 大小写、首尾／重复空白、括号去除、别名匹配有；**括号内日期未提取写入计划节点**；中英重复未专门消解。未知港口进清单，但确认清单与汇总包含关系需说明 |
| 2 多卸港 | migrate.ts:15–17；migrate-plan.ts:61–63 | importers.spec.ts:65；migrate-plan.spec.ts | 加号含全角等分隔；超2港进确认；完整写入模型未实现 |
| 3 承运方／船名／VOY拆分 | migrate.ts:21–27；migrate-plan.ts:60,66 | importers.spec.ts:65 | ASCII斜杠、大小写VOY可用；全角斜杠／字母未归一；planMigration返回行时未保留nm.voyage，后续正式模型不可直接复用 |
| 4 MMSI优先去重与船名别名 | migrate-plan.ts:43,66,75–85仅用MMSI对大宗 | 没有迁移船舶主档归并专项测试 | **无完整船舶主档去重／别名生成／缺MMSI匹配后待确认实现**；运行时MasterService防重不能替代历史迁移规则 |
| 5 航次归并、7日邻近组确认、商务大宗对齐 | migrate.ts:32–43；migrate-plan.ts:45–50,69–88 | importers.spec.ts:73；migrate-plan.spec.ts:30,44 | 有分组与确认；缺日期但有船名的行只进unkeyed计数，未逐行入确认；邻近组确认row=0且来源统一写大宗，丢历史源定位 |
| 6 多合同拆行、首行记货量 | migrate-plan.ts:64,77–81 | migrate-plan.spec.ts:30 | 有统计／清单与分摊计数，**没有产出T05写入行**；不可把report当迁移产物 |
| 7 数值／币种／单位、用时重算 | common.ts:24–35；migrate-plan.ts:22 | importers.spec.ts:11 | 常见千分位与币种有；万吨静默缩小见D04；全角数字/全角逗号、DWT语义未支持；未有结算字段全量迁移映射 |
| 8 日期、WITA、无年份日期补全 | common.ts:8–20,39–44；lib/dates.ts | importers.spec.ts:11；xlsx.spec.ts:25 | 年/月/日字符串、Excel1900序列号有；parseShortDate仅定义和单测，未进入planMigration。5-Nov无年份如何补年未明确；1904日期系统未读取；无效日期见D05，UTC/WITA见D02 |
| 9 特定占位时间样本排除 | migrate.ts:56–60；migrate-plan.ts:51–53 | importers.spec.ts:73；migrate-plan.spec.ts:30 | 启发式按同合同+三节点签名≥5标记，不检查节点均非空／三者是否完全同刻／占多数。5条同合同全空节点也标占位；与锁定特定异常样本不是一回事。正式样本排除尚无迁移落库链路 |
| 10 泊位匹配、池外保留备注 | common.ts:48–62用于IMIP；migrate-plan无排靠泊位清洗 | importers.spec.ts:11仅工具测试 | F/L/LN、Labota写法部分支持；迁移流程未调用、未把池外原文写备注。全角泊位未归一；多泊位仅取第一编码进IMIP标准行，是否保守占用全部需明确 |
| 11 人员文本映射飞书用户 | 本范围无迁移映射输入／转换 | 无专项测试 | 交接手册明确等待映射表；运行时USER_LOOKUP不是迁移姓名对照。属于计划缺口，不可编造人员ID |
| 12 历史／现表合同+船名去重 | migrate.ts:48–52；migrate-plan.ts:45–47 | importers.spec.ts:73；migrate-plan.spec.ts:30 | 有优先现表和空合同进清单；空合同没有按同船≤7天提供候选；历史内部重复未去重。正式写入幂等未实现，不能靠dry-run重复结果一致证明迁移重跑不重复 |

### 7.1 清洗规则明确差异与最小触发场景

这些属于**已实现dry-run／工具与规格的差异，P1**，单列为G02，不把尚未实现的正式写入称为已造成数据丢失：

- `normalizePort("BAHODOPI（预计8月9日抵港）", ports)` 只返回raw/cleaned/code，且planMigration没有提取日期的下游。实际能匹配港口但没有“预计抵港日”的转换产物；期望按规则1保留为计划节点，或至少将无法确定年份的日期进确认清单。
- 一条大宗行船名MV TEST、实际到达和计划到达都空，`groupBulkRows()`计unkeyed，planMigration只对“船名为空”逐行加清单。实际无法归并行计数+1但没有规则5对应行号／原因；期望该行进待人工确认。
- 5条同合同、三个时间节点全空，`markPlaceholderTimes()`签名为`||`且长度达5，实际全标placeholderTime；期望缺节点清单，不按规则9的“完全相同占位时刻”自动归类。泛化识别阈值是否可替代特定异常样本需业务确认。
- `splitVesselName("承运方／MV TEST VOY. 12")` 不识别全角斜杠；`normalizeBerth("Ｆ１",["F1"])` 不识别全角字母数字。实际留下整串船名或未匹配泊位；期望先做兼容字符归一或明确逐行拒绝。原始真实文件是否含这些写法未验证，因此**影响真实数据的频率是疑似，工具不支持该输入是确定事实**。
- `parseDateTime("5-Nov")`返回null；Excel序列号按1899-12-30解释，不读workbook的date1904标志。1904工作簿同日数值会偏1462天，可能被错分历史／异常；这属于格式支持风险。不能无依据决定无年份5-Nov应补哪一年。

### 7.2 导入事务、快照与报告的实际边界

- 靠船计划每批全部原行存D04（日期异常／历史行均保留）；只有active供currentPlanRows，池外行不计占用。缺日期、卸完日期早于靠泊、超90天有分类与异常原因。历史先判定于90天范围检查，所以过旧行会先归history，是否还要进异常清单需要规格明确。
- Drizzle整批事务中先insert，再切current，行插入失败不产生半批，也不改旧current；现有PGlite用例验证了该路径。**成功写批次后**D08或D09失败不在此事务内，可能出现“接口失败但current已切换”，重试还需D07/R01式整体恢复。
- coverTo目前取最后预计靠泊日，不取最晚卸完；覆盖之外正确返回nodata，而不是0%。这个覆盖口径在open-questions里待确认，不能擅自判成必须取卸完日。
- 快照缺失：planRows为空，近路径nodata；引擎按日期分流，不会因为没有计划就自动改用远期密度。此行为符合规则4/6。完整／稀疏候选的低可信处理在engine，ImportsService不重新评分。
- 航次匹配：`imports.service.ts:85–87` 按简化船名Map保存最后一条未取消航次，没有日期窗口和“已结束”过滤。若同船多航次，可能关联错详情；需补按日期／挂靠匹配的规格与样例，暂列疑似（不据此断言CMR数值错误，CMR本身不使用matchVoyage计数）。

## 8. 计划缺口、规格冲突与疑似项

### G01 · A27与正式迁移仍为计划中

`server/modules/admin/admin.controller.ts:11–16` 没有migrate路由；`server/importers/migrate-plan.ts:108` 只返回report/confirm/unmatchedPorts。交接手册§3明确正式迁移、人员映射、初始历史批次未做。触发`POST /api/admin/migrate`无法完成A27；期望按一期计划提供经确认的正式流程，或正式修订范围为离线脚本。**这是验收缺口，不是运行中缺陷，更不是迁移已损坏数据。**

### G02 · 迁移清洗覆盖不足

见§7逐条表和§7.1触发场景。规则1/4/6/8/10/11没有完整正式转换写入链路；现有测试的“规则覆盖”主要是纯工具和统计，不足以声称12条规则已实现端到端。

### 尚需裁决的规格，不自行假定

1. **T05必填与采纳新建待补充冲突。** T05要求合同/类别/大宗单位等，`voyage.service.ts:356`采纳只给name/tons；`open-questions.md`记录待宣船采纳字段暂定。建议明确草稿必填与正式宣船必填两阶段，并给接口返回缺项；不能由审计擅自补字段值。
2. **T02字段定义与现实容量表差异。** 类别、生效日期等规格要求与现有表／暂留空决定未完全一致；白名单和LN16容量已锁定，不能以这些未决字段为由放开D01。建议区分锁定事实与可编辑说明。
3. **成品销售船卸港靠泊即结束**在status-rules表内，但同文件尾部和open-questions仍标假设。当前调用共用deriveStatus；不据此裁定应改成卸港离港。
4. **快照过旧阈值、coverTo、远期Plan B门槛**仍有待确认记录；实施计划补充又认可远期船数≤分母70%。建议给最新生效决策编号和日期，替换过期未勾选项。
5. **库存无日耗／日耗0。** inventory.ts:29–33将缺失／0替换为前一个真值或1吨/天。例：库存1000、日耗空、无可用天数，实际days=1000且仅标估算；期望是未知还是可按前值补齐需确认。在规则10“不编造引擎数值”的背景下不应隐藏该假设。当前不足以认定所有缺日耗行都应剔除，列疑似业务口径风险。
6. **多泊位文本。** LN17/LN18被解析为多个code，但imipPlan只用第一个；它代表二选一还是同时占用，规格未明确。不能直接把两个都算占用，也不能宣称第一泊位一定正确。
7. **文档运行状态。** 总说明仍称从未真实联调，open-questions已记录2026-11-06角色守卫真实复测；本次只认可代码与本地测试证据，不把其他会话记录冒充独立实测。冻结app/和老AGENTS“空骨架”不作为当前代码事实。

## 9. 定时任务逐项核对

| 任务 | 当前cron与动作 | 与scheduled-jobs对照／主要边界 |
|---|---|---|
| cronPullBerthPlan | `*/30 * * * *`，pullFromDrive(null) | 名称、周期一致；缺folder只警告；文件标识去重，顺序导入；版本/同文件修订见R05、超时见R09 |
| cronReplay | `*/5 * * * *`，admin.replay(null) | 一致；只补written镜像，不补D01/D02，见R01；失败单项继续但未记录具体失败结果 |
| cronCompatDirty | `*/10 * * * *`，refresh(null,true) | 一致；所谓增量是“dirty时全量重写”，非差量；标记内存丢失和互斥见R04 |
| cronCompatFull | `50 15 * * *`，refresh(null,false) | 一致；cron时区未由本次真实验证；可能与手动/dirty重入 |
| cronRecomputeRoutes | `0 3 * * *`，recomputeRouteRules(null) | 一致；成功才写D09，失败仅Jobs警告；多实例可重复统计写，虽通常同值但无版本保护 |
| cronIssueScan | `0 8 * * *`，scanner.scan(null) | 一致；addIssues有存储去重约束，重复扫描通常不重复问题；created计数由预读集合估算，并发时不保证等于实际插入数 |

六个任务均返回this.run的Promise，内部服务调用有等待。已有测试证明装饰器注册表和转调actor=null，以及失败返回null；**没有证明平台注册成功、cron时区、实例回调次数、故障重试和告警**。没有独立distributed lease／任务运行ID去重。上述缺少保护应按各任务副作用评估，不能把所有重复回调都定为数据损坏。

## 10. 改进建议（P2，限本次模块）

- capacity/prediction：收敛capable/occupied、latest/P80派生和buffer默认值到现有统一实现，避免规则配置修改后漂移。
- voyage：提取“ETA待办资格”供列表与扫描共用；问题责任人授权当前按姓名，跨同名人员的准确性需后续权限专项核查，建议使用稳定用户ID。
- imports/importers/lib：统一保留sheet与物理行号；header独立于数据值验证；对数字、日期和单位建立显式可接受输入契约，并用拒绝代替静默截取。
- admin：把日志失败与业务失败分开处理，避免日志异常遮住主异常；结果按成功／部分失败显示，按任务ID查询。
- common/hello：为未映射HTTP状态提供稳定错误码兜底；hello为注释脚手架可清理，但不用将删除它列为业务上线门禁。

## 11. 优先级与结论边界

本次主发现为**13条缺陷（D01–D13：P0 4条、P1 8条、P2 1条）**和**9条风险（R01–R09：P0 4条、P1 5条）**；另列G01/G02计划／清洗覆盖缺口及待裁决事项。G02不重复计入13条代码缺陷。

建议先处理D01–D04与R01–R03/R06：它们分别影响容量事实、业务日期、货量、留痕、采纳唯一性、飞书新增幂等与生产准入。随后统一接口契约、补齐T10写入和导入报告／版本机制。**171个现有测试通过不能抵消这些证据**，其中存在测试认可可编辑锁定容量、缺少HTTP转换路径、只测首批重试、只测仓储幂等等盲区。

没有功能已上线的证据；本报告没有将任何问题表述为线上事故。真实飞书／妙搭行为、真实Excel格式、平台RLS及规模压测没有由本次验证。后续复核应使用合成数据和受控故障场景，不需要把真实业务明细带进报告。

## 12. 交付复核的并发代码更新说明

报告落盘后，只读git复查发现HEAD又推进到`2463526f69b3dfc06ac41cbd8430cf08ab823ebe`，工作区仍干净。与审计基线b27相比，**本轮43个主审范围文件未变化**；变化在Drizzle适配器、平台目录、lark、相关测试：补自动编号读回、配置格式校验和身份目录查询等。这些均非审计员修改。

已查看变化文件清单，并复核影响报告的航次创建、Bitable切批、网关和LarkModule装配差异：T04→T05仍为两阶段，切批循环仍作为整个队列任务重试，因此R03触发顺序未被这些差异消除；real的模式选择仍在未改变的PortsModule，R06生产回落风险仍在。新配置校验加强了凭证外形检查，但未增加SSPS_STORE生产强制real或BITABLE_TABLE_IDS逐项完整性校验。

本报告不对新增自动编号／目录实现作完整专项审计，也不把b27的177个测试结果表述为246版的最新测试结果。若据此修复或验收，应明确以基线提交重现，或者在最新HEAD重新核验依赖行号及相关测试；主审模块行号仍可直接定位。

测试成功运行的环境调整仅作用于子进程：`TSX_DISABLE_CACHE=1`，`npm_config_script_shell`设为当前PowerShell可执行路径后执行`npm test`；ESLint设`npm_config_offline=true`后执行`npx eslint server client/src --quiet`。未改任何配置文件。原样npm test的0测试结果单独保留，不作为有效门禁。

