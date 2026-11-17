# 03 安全审计（第一批：身份、角色与对象权限）

日期：2026-11-06（Asia/Shanghai）。状态：分批审计进行中；本文件不是全量安全审计完成声明。目前没有功能上线。

## 1. 范围与证据

- 代码根：`C:\Users\董金\ssps-miaoda`，分支 `sprint/default`，本批 HEAD：`0c9c7843b4bae01f340cc89ec993086f5c0ef11a`。本批读取时工作树干净；与准备阶段相比已有角色守卫和身份目录更新，本批以重新读取的当前文件为准。
- 规格根：`C:\Users\董金\WorkBuddy\SSPS`。下文 `server/…:行号`、`scripts/…:行号` 相对代码根，`docs/…:行号` 相对规格根。
- 已逐条读取当前注册的 51 个业务 HTTP 路由，追踪登录声明、全局角色守卫、操作权限、航次对象权限、金额裁剪及数据质量问题修改链路；补读相关仓储与矩阵生成器。平台 SDK 注入的路由与鉴权实现尚未独立审完。
- 本批仅静态检查，没有执行漏洞请求、创建测试数据或连接真实环境。下述“实际”指由代码分支确定的行为，均附最小复现输入；真实 HTTP 状态码、平台返回形状不冒充实测。
- 未运行 npm test/type:check/eslint/smoke。smoke 会构建并写入代码仓 dist，且模块按环境装配，不能仅凭脚本注释保证隔离；未在全程只读约束下执行。未运行矩阵生成器，它会写代码仓测试夹具。未读取 .env.local，未执行任何 git 或平台写操作。本批唯一写入是此审计文档。
- 分类：缺陷＝代码可确定违反规格；风险＝列明条件后会发生；疑似＝尚缺外部证据，不计为确认缺陷。P0/P1/P2 使用用户指定标准，越权归 P0，不代表已在线上被利用。

## 2. P0

### SEC-01｜P0 风险：生产配置遗漏仍启用演示仓储与兜底身份

**位置**：`server/modules/ports/ports.module.ts:34`、`:36`、`:47`、`:49`；`server/adapters/memory/memory-directory.ts:6`、`:9`；`server/common/guards/ssps-role.guard.ts:27`。

**代码事实**：只有 SSPS_STORE 严格等于 real 才选择真实实现；空值、memory、拼写错误均选择内存仓储与 MemoryDirectory。后者把未知用户映射为业务员、大宗采购部，没有 userId 时还使用 dev-user。全局守卫调用这个目录，因此不会拒绝无 SSPS 角色的账号。已读启动配置和装配链路没有 NODE_ENV=production 的模式阻断；真实模式缺配置的启动报错只在 real 分支生效。

**依据**：本轮明确要求核查生产兜底硬阻断；`docs/handoff/claude-code-handoff.md` §4.2 将内存身份限定为演示用途；`docs/handoff/permission-matrix.md:31` 要求真实使用中无 SSPS 角色拒绝。内存模式自身不违反该矩阵括注，本项针对生产误配置可正常提供演示业务结果的发布风险。

**触发／最短利用路径**：部署 NODE_ENV=production，漏设 SSPS_STORE；一个能通过平台登录、但 roles=[] 的账号请求 GET /api/me、GET /api/ports → 目录返回“大宗采购部业务员”，API继续提供演示数据；该账号还可尝试 POST /api/voyages → canCreateVoyage 放行，写入内存。期望：生产启动失败，或业务请求明确拒绝演示模式，不能伪装成可用的正式系统。

**影响边界**：这不会自动读到真实航次库；风险是身份边界失效、演示结果被当作业务结果、用户录入随进程丢失，构成上线阻断项。平台登录守卫仍可能要求先登录，未声称互联网匿名者可直接访问。

**建议**：生产环境硬性要求 real，并显式校验其他取值；演示模式使用明确的独立配置与界面标识。需本机受控配置验证，当前未做部署试验。

### SEC-02｜P0 缺陷：数据质量问题按姓名授权，重名账号可处理他人问题

**位置**：`server/modules/voyage/voyage.service.ts:98`、`:378`、`:384`、`:389`、`:393`；`server/adapters/drizzle/drizzle-voyage-store.ts:296`。

**代码事实**：问题 owner 保存 v.owner（姓名）；开始处理及关闭均只比较 i.owner 与 a.name，不比较 userId、部门或对应航次负责人 ID。真实角色目录的姓名也不保证唯一。问题列表面向全体有效角色，攻击者可从列表取得问题 ID。

**依据**：`docs/handoff/permission-matrix.md:29`：“责任人本人或系统管理员”；K11 对个人身份的授权语义。`docs/schema/D-app-db.md:20` 只写责任人，没有规定可按重名视作同一人，因此字段规格不足需补充，不能据此将跨账号授权视作正确。

**可复现输入（全为虚构）**：甲账号 userId=u-A、姓名“测试同名”，大宗采购部；乙账号 userId=u-B、姓名也为“测试同名”，商务海运部。某问题 owner=“测试同名”，真实责任人为甲，status=待处理。乙 GET /api/data-issues 获得 ID，再 PATCH /api/data-issues/{id}，body={"status":"已关闭"} → 姓名相等，调用 store.closeIssue，问题被关闭。改为“处理中”也会放行。期望：乙返回403，只有u-A或系统管理员可改。

**最短利用路径**：有效 SSPS 角色的重名账号 → 问题列表 → 修改该问题状态。不需要伪造平台角色或修改请求中的 userId。

**建议**：责任人使用稳定平台用户 ID；历史无法解析的姓名不能直接授予个人写权限，应进入映射确认或由管理员处理。同步修订 D08 责任人字段约定。

### SEC-03｜P0 风险：问题 ID 截断且按前缀更新，碰撞会跨问题、跨责任人写入

**位置**：`server/adapters/drizzle/drizzle-voyage-store.ts:297`、`:299`、`:300`、`:301`；授权入口 `server/modules/voyage/voyage.service.ts:381`、`:384`、`:390`、`:393`。

**代码事实**：issueOf 只返回 DQ-加 UUID 前8个字符；服务用该短 ID 找第一条问题做责任人判断；仓储更新使用 id::text LIKE '前缀%'，会更新所有具有此前缀的行。没有在更新语句中绑定被授权对象的完整 UUID或责任人。

**依据**：`docs/handoff/permission-matrix.md:29` 仅允许责任人处理自己的问题；更新一个对象不应修改其他对象，属于数据正确性与对象权限要求。

**触发场景（合成输入）**：D08 两条 UUID 为 12345678-0000-4000-8000-000000000001 与 12345678-0000-4000-8000-000000000002，分别属于甲乙，均待处理。让甲的问题在 issues() 顺序中靠前。甲 PATCH /api/data-issues/DQ-12345678，body={"status":"已关闭"} → 第一条通过甲的权限检查；SQL 匹配两行，甲乙问题均关闭，closedBy都写甲。期望：仅甲的问题变化，乙的问题保持原状；对乙对象应403。

**最短利用路径**：有权处理其中一条的用户正常点击关闭 → 同前缀的他人问题也被关闭。攻击者无需知道完整UUID；不声称用户能主动选择数据库生成的UUID。碰撞是明确的数据条件，故归风险，尚未查询实际数据判断是否已有碰撞。

**建议**：接口返回完整唯一标识；按完整主键等值更新，并使权限检查和更新作用于同一对象。内存仓储用短ID精确查找，不会复现真实库的多行 LIKE 更新，是本地替身与真实库差异。

## 3. P1 疑似与权限边界待验证

### SEC-S01｜P1 疑似：空结算补丁跳过两组操作权限，仍调用真实写链路

**位置**：`server/modules/voyage/voyage.service.ts:313`、`:315`、`:316`、`:327`；`server/adapters/drizzle/drizzle-voyage-store.ts:266`、`:269`。

**事实及场景**：商务海运部普通业务员对一条无 T06 扩展、非历史只读的大宗航次 PATCH /api/voyages/{id}/bulk-settlement，body={}。keys为空，两项 some 都为false，跳过作业及费用权限；代码仍调用 saveSettlement，后者尝试创建只有航次关联的 T06 记录。期望：无操作权限账号403，或空补丁被422拒绝，不能发起无权的写操作。依据是权限矩阵的卸船作业/费用结算行。

**最短利用路径**：普通业务员 → 已知航次ID → 空JSON补丁。

**证据缺口**：尚未核对真实T06必填/平台写入限制是否接受这种空扩展创建，因此“实际持久化成功”暂列疑似。如果平台接受，应按用户的越权标准升级P0；若平台拒绝，仍应在发起外部写操作前完成权限和空补丁校验。本项不宣称可读到金额，返回端已有金额裁剪。

## 4. 权限矩阵 vs 当前路由代码

所有下表业务路由都有控制器级 @NeedLogin()，并由 PortsModule 的 APP_GUARD 注册 SspsRoleGuard：HTTP 且控制器前缀为 api 时调用 DirectoryPort.resolve。真实模式无 userId →401，无有效ssps角色/业务员及主管查不到部门 →403。下表“全”指通过此基础角色检查的四类角色，不指匿名或任意飞书登录账号。

缩写：业＝业务员；主＝部门主管；物＝物流管理员；系＝系统管理员；G＝上述登录声明＋全局角色检查。每一行的守卫均为G，写入再叠加表中操作条件。表中行号是控制器方法声明。

权限函数依据：`server/domain/permissions.ts:10`（个人/部门写）、`:21`（创建）、`:23`（作业）、`:30`（费用）、`:35`（销售）、`:40`（看金额）。本人有ownerId时按ID，无ID时按姓名回退；主管允许本人或同部门，历史只读所有角色都拒绝修改。姓名回退在非历史且缺ownerId数据上的风险仍需结合真实镜像形状续审。

| A编号 | 方法 | 路径 | 控制器:行 | 守卫 | 允许角色/数据范围与矩阵对照 |
|---|---|---|---|---|---|
| A01 | GET | /api/me | master/master.controller.ts:14 | G | 全；返回当前身份 |
| A02 | GET | /api/ports | master/master.controller.ts:16 | G | 全；主数据全局可读 |
| A03 | POST | /api/ports | master/master.controller.ts:17 | G | 物、系 |
| A03 | PATCH | /api/ports/:en | master/master.controller.ts:18 | G | 物、系 |
| A02 | GET | /api/berths | master/master.controller.ts:20 | G | 全 |
| A03 | POST | /api/berths | master/master.controller.ts:21 | G | 物、系 |
| A03 | PATCH | /api/berths/:code | master/master.controller.ts:22 | G | 物、系 |
| A02 | GET | /api/vessels | master/master.controller.ts:24 | G | 全 |
| A03 | POST | /api/vessels | master/master.controller.ts:25 | G | 业、主、物、系 |
| A03 | PATCH | /api/vessels/:id | master/master.controller.ts:26 | G | 物、系 |
| A04 | GET | /api/route-rules | master/master.controller.ts:28 | G | 全 |
| A05 | POST | /api/route-rules | master/master.controller.ts:29 | G | 主、系；未按部门划分规则，矩阵亦无此要求 |
| A05 | PATCH | /api/route-rules/:id | master/master.controller.ts:30 | G | 主、系 |
| A06 | POST | /api/route-rules/recompute | master/master.controller.ts:32 | G | 系 |
| A07 | GET | /api/voyages | voyage/voyage.controller.ts:18 | G | 全部航次可读，owner/mine/dept筛选不是安全隔离 |
| A08 | GET | /api/voyages/:id | voyage/voyage.controller.ts:19 | G | 全部航次；金额仅大宗采购部或系可见 |
| A09 | POST | /api/voyages | voyage/voyage.controller.ts:20 | G | 业、主、系；ownerId及部门取解析后身份 |
| A10 | PATCH | /api/voyages/:id | voyage/voyage.controller.ts:21 | G | 业本人、主本人/本部门、系；历史只读拒绝 |
| A11 | POST | /api/voyages/:id/milestones | voyage/voyage.controller.ts:22 | G | 同A10 |
| A12 | POST | /api/voyages/:id/eta | voyage/voyage.controller.ts:23 | G | 同A10 |
| A16 | POST | /api/voyages/:id/flags | voyage/voyage.controller.ts:24 | G | 同A10 |
| A13 | POST | /api/voyages/:id/cargo-lines | voyage/voyage.controller.ts:26 | G | 同A10 |
| A13 | PATCH | /api/voyages/:id/cargo-lines/:no | voyage/voyage.controller.ts:27 | G | 同A10；再校验货物属于该航次 |
| A13 | DELETE | /api/voyages/:id/cargo-lines/:no | voyage/voyage.controller.ts:28 | G | 同A10；再校验货物归属 |
| A14 | PATCH | /api/voyages/:id/bulk-settlement | voyage/voyage.controller.ts:30 | G | 作业：大宗本人/主管、仓储业主、系；费用：大宗本人/主管、系；空补丁见SEC-S01 |
| A15 | PATCH | /api/voyages/:id/sales-ext | voyage/voyage.controller.ts:31 | G | 商务海运部本人/主管、系；仅成品，拒绝历史只读 |
| 扩展 | POST | /api/data-issues/scan | voyage/voyage.controller.ts:39 | G | 系 |
| A25 | GET | /api/data-issues | voyage/voyage.controller.ts:40 | G | 全；可读全部问题，符合矩阵 |
| A25 | PATCH | /api/data-issues/:id | voyage/voyage.controller.ts:41 | G | 代码按责任人姓名或系；与本人权限存在SEC-02/03偏差 |
| A21 | POST | /api/predictions | prediction/prediction.controller.ts:12 | G | 全；预测不按部门限制 |
| 扩展 | POST | /api/predictions/stock-plan | prediction/prediction.controller.ts:13 | G | 全；库存测算 |
| A29 | POST | /api/predictions/parse | prediction/prediction.controller.ts:14 | G | 全；文本解析 |
| A22 | GET | /api/predictions/:runNo | prediction/prediction.controller.ts:15 | G | 全；共享预测详情符合“全”口径 |
| A23 | POST | /api/predictions/:runNo/adopt | prediction/prediction.controller.ts:16 | G | 经航次服务：业、主、系；已有航次走needEdit；状态/航线及幂等需续审 |
| A24替代路径 | POST | /api/predictions/:runNo/announcement | prediction/prediction.controller.ts:17 | G | 全；仅由保存方案生成；与原接口路径差异见§6 |
| A20 | GET | /api/capacity/calendar | capacity/capacity.controller.ts:12 | G | 全 |
| 扩展 | GET | /api/capacity/day | capacity/capacity.controller.ts:13 | G | 全 |
| A17 | POST | /api/berth-plans/import | imports/imports.controller.ts:34 | G | 物、系 |
| A17扩展 | POST | /api/berth-plans/import-file | imports/imports.controller.ts:35 | G | 物、系；文件先解析再进导入角色检查，资源风险续审 |
| A18 | POST | /api/berth-plans/pull | imports/imports.controller.ts:37 | G | 系；控制器先校验，再调用内部null身份 |
| A19 | GET | /api/berth-plans/batches | imports/imports.controller.ts:42 | G | 全 |
| A19 | GET | /api/berth-plans/batches/:batchNo/rows | imports/imports.controller.ts:43 | G | 全 |
| A30 | GET | /api/inventory | imports/imports.controller.ts:50 | G | 全 |
| A30扩展 | GET | /api/inventory/batches | imports/imports.controller.ts:51 | G | 全 |
| 扩展 | POST | /api/inventory/trend | imports/imports.controller.ts:52 | G | 全；库存趋势查询，不因POST就要求导入权限 |
| A30扩展 | POST | /api/inventory/import-file | imports/imports.controller.ts:53 | G | 物、系；文件解析顺序续审 |
| A30 | POST | /api/inventory/import | imports/imports.controller.ts:54 | G | 物、系 |
| A28 | GET | /api/admin/sync-logs | admin/admin.controller.ts:11 | G | 系 |
| A28 | GET | /api/health | admin/admin.controller.ts:12 | G | 系 |
| 扩展 | POST | /api/admin/replay | admin/admin.controller.ts:14 | G | 系 |
| A26 | POST | /api/admin/compat/refresh | admin/admin.controller.ts:16 | G | 系 |

控制器路径均补 `server/modules/`。本批未发现当前这51个业务方法完全没有登录声明，或真实模式下只检查登录而不检查SSPS角色。此前文档“部分GET缺角色检查”的旧问题，当前APP_GUARD已有覆盖，不重复列为缺陷。守卫和平台身份中间件执行顺序、SDK是否正确填入userContext仍待隔离/真实环境证据。

## 5. 内部入口与金额检查的边界

- `server/modules/view/view.controller.ts:4`、`:7`：GET /及通配页面渲染没有NeedLogin，不在角色守卫的api控制器范围；返回页面模板与平台上下文，不直接调用业务仓储。不能把“无守卫页面兜底”直接定为业务数据越权，平台上下文注入的安全性尚待下一批查SDK。
- `server/modules/hello`未在AppModule注册，其注释示例不是可调用API。
- 六个定时任务在`server/modules/admin/jobs.automation.ts`内部传null表示系统身份，HTTP管理路由均先解析身份并检查系统管理员，不允许普通业务员通过请求体把actor改成null。平台自动化回调的公网可达性、签名与防重放尚未核查，不宣称安全。
- `server/modules/voyage/voyage.service.ts:159`、`:331`分别裁剪详情和结算写响应的金额；`:330`调用diff时传MONEY_SET，`:107`在写变更日志时将金额新旧值置null。当前常规服务写入路径未发现从changeLog泄露金额；尚未排除其他日志写入来源、历史记录与幂等返回路径。
- K11允许跨部门看全部航次。当前部门隔离主要作用于修改与费用权限，不应把全局航次查询本身列成IDOR。普通业务员改其他有明确ownerId的航次会在needEdit被拒绝；货物更新删除先查航次编辑权，再查货物归属。

## 6. 规格差异和矩阵工具局限

1. `docs/implementation-plan.md:402`的A27 POST /api/admin/migrate在当前控制器没有实现。交接手册已将正式迁移列为未做；这是计划中接口缺口，不是漏设守卫的已暴露管理接口。
2. `docs/implementation-plan.md:399`写A24 POST /api/announcements（航次或方案），当前实现为方案下的announcement子路由。交接手册采用后一形式。建议统一接口基线，并明确是否仍要求“直接由航次生成”；本批不将不存在的接口误报为未鉴权。
3. 采纳已有航次：交接手册§6写“本人航次”，但VoyageService.adoptPlan:362调用needEdit，允许主管修改本部门他人的航次。open-questions同项尚待确认。建议明确采纳是否比普通编辑更严格；在裁决前列为规格歧义，不直接定越权。
4. `scripts/gen-permission-matrix.ts:6`写固定测试夹具，`:7`按脚本目录的../../docs/handoff找文档；在当前分仓目录下不会定位到WorkBuddy/SSPS/docs/handoff。`server/test/permission-matrix.spec.ts:10`只读取代码仓夹具。该一致性测试无法证明独立文档仓是最新，更无法证明各控制器调用权限函数。权限矩阵中的“其余规则”也是生成器静态文字，不是逐路由证明。建议审计与发布时独立比对两仓矩阵并保留路由拒绝测试。尚未运行生成器，避免写入代码仓。

## 7. 剩余清单

- 输入校验：真实平台ValidationPipe的whitelist/forbidNonWhitelisted；全部DTO、Record补丁、长度/范围、SQL原生模板与拼接。
- 导入：解析前授权、全文件解压和行列资源上限、公式注入、编码、批次事务及失败后状态。
- 身份：平台SDK中间件与守卫顺序、请求头信任边界、角色缓存/撤权、部门映射、真实user_profile形状与ownerId缺失行为。
- 写链路：幂等键是否绑定操作者/资源/载荷、跨端点复用、并发重放、补偿权限和结果裁剪。
- 凭证：当前文件及Git历史脱敏扫描、旧Secret残留、env模板、构建产物、Vite注入、忽略规则与提交钩子、运行日志。
- 平台：事件/自动化回调校验、防重放，CORS/Cookie/CSRF、限流及错误响应。
- 依赖：lockfile来源、锁定情况、安装脚本；npm audit不在四项本地验证命令白名单内，本轮未执行，不能声称已查完高危依赖。
- 实测：仅在确认命令不连接真实平台、不写代码仓后执行允许的验证；新增漏洞复现若需要文件/数据写入，保留合成复现说明，不自行放宽只读要求。

本批没有给出“全量安全通过”结论；下批先做输入、导入与幂等返回路径，再补凭证和平台安全。

