# 交接总览：从云端 Claude 交给本地 Codex（2026-11-05）

状态说明：**目前没有任何功能上线。** 下面的「已完成」都指代码已写好、在云端用内存数据和假飞书验证通过；没有连过真实飞书，也没有连过真实数据库。

## 1. 为什么交接、分工怎么变

云端环境访问不到飞书（open.feishu.cn、miaoda.feishu.cn 都不通），所以云端只能写代码、写测试、写文档，不能联调。后续最关键的几步——执行建库 SQL、建同步任务、接真实飞书、联调、迁移——都必须在能访问飞书的本机完成，所以由本地 Codex 接手。

接手后：

- **本地 Codex**：主力。写真实仓储、剩余前端页面、联调修 bug、迁移脚本跑 dry-run。能用 `lark-cli`，能连真实飞书。
- **Leyinet**（产品负责人，非程序员）：拍板业务口径、提供数据、做验收。只通过聊天和 Git 与代码打交道，所以给他的汇报要用中文白话，不要贴大段代码。
- **云端 Claude**：仍可开会话接力写不需要飞书的代码和文档，通过 Git 交接。

## 2. 进度汇报（截至本次提交）

整体：设计、原型、多维表格、领域层、后端业务模块（内存版）已完成；前端 React 重写刚开始；真实数据接入尚未开始。

| 块 | 状态 | 说明 |
| --- | --- | --- |
| 产品原型 P01–P11 | 已完成并评审 | `prototype/`，示例数据全部虚构；是前端重写的视觉和交互基线 |
| 飞书多维表格（T01–T10 共 11 张表） | 已建好并验证 | 报告见 `docs/schema/base-build-report-2026-11-05.md`；T01/T02/T08 初始数据已录入（T08 经验航程是估算版，只有 10 条，待大宗采购部校对） |
| 脚手架 | 已入库 `app/` | NestJS 10 + React 19 + Vite + Tailwind + shadcn/ui + Drizzle |
| 领域层 | 已完成 | `app/server/{domain,engine,nlp,importers,lib,lark}`：状态推导、时序校验、航程规则、CMR 与重叠船数、库存断料、Plan A/B、宣船文案、S1 溯源、自然语言解析、靠船计划与库存导入规则、迁移清洗规则、飞书客户端（token、分页读、500 条批量写、单线程写队列、幂等、补偿）。与原型引擎逐项对照一致 |
| 后端业务模块（内存版） | 已完成 | A01–A17、A19–A25、A29、A30，见第 4 节；服务层只依赖「端口」接口，现在接的是内存实现 |
| 建库 SQL | 已生成，**未执行** | `app/db/001-ssps-core.sql`（D01–D12 共 12 张表，含审计列和 RLS）；规则只来自 `app/AGENTS.md` 的文字描述，需在真实库上验证 |
| 前端 React 重写 | 进行中 | 已完成底座（样式、接口钩子、通用组件、导航外壳）和 P04 航次列表；P05 已抽出样式、页面未写；其余 P01–P03、P06–P11 未开始 |
| 真实仓储（Drizzle + 飞书多维表格） | 未开始 | 被「执行建库 SQL + 建同步任务」阻塞 |
| 定时任务、A18 云空间拉取、A26–A28 系统管理 | 未开始 | 依赖真实仓储和飞书权限 |
| 迁移脚本（读企微 Excel） | 清洗规则和 xlsx 读取器已有；脚本未写 | 只能在本机读真实 Excel |

质量门（每次提交前都要全绿）：

- `cd app && npm test`：91 个测试通过
- `npx tsc --noEmit --project tsconfig.node.json`（后端）和 `tsconfig.app.json`（前端）：0 错误
- `npx eslint server client/src --quiet`：0 错误
- `npm run smoke`：真起一个 Nest，走完 HTTP 主线（新建航次 → 修订 ETA → 预测 → 采纳 → 宣船文案 → 日历）

## 3. 仓库地图

```
CLAUDE.md                     产品定位、已锁定规则、约定（必读）
AGENTS.md                     给编码代理的入口
docs/
  implementation-plan.md      实施计划书 V1.0（接口清单第 8 节、页面第 9 节、骨架代码第 10 节、里程碑第 11 节）
  development-workflow.md     开发流程与进度表（每次提交后更新）
  open-questions.md           待 Leyinet 确认的事项（未勾选项不要自行假定）
  schema/                     多维表格 T01–T10、应用库 D01–D12、状态推导规则、迁移清洗规则、建表与录入提示词、seed/
  handoff/                    本目录：交接总览 + 任务书
prototype/                    P01–P11 可点击原型（视觉与交互基线）、mock-data.js、engine.js（对照基准）
app/                          工程（飞书妙搭脚手架）
  server/
    config.ts                 所有暂定口径集中在这一处（15 天分流、30% 门槛、样本数 5 等）
    domain/                   状态推导、时序校验、航程规则、权限、航次领域模型
    engine/                   容量、库存断料、推荐、宣船文案、溯源
    nlp/  importers/  lib/    自然语言解析；靠船计划/库存/迁移清洗；日期与 xlsx 读取器
    lark/                     飞书客户端（token、bitable、写队列、outbox）
    ports/                    端口接口（数据读写的抽象）+ tokens.ts（依赖注入令牌）
    adapters/memory/          端口的内存实现 + seed.ts（真实 23 泊位容量、10 条估算航程）
    modules/                  prediction capacity voyage master imports ports（NestJS 模块：controller + service + dto）
    test/                     node:test 测试（*.spec.ts）
  db/001-ssps-core.sql        由 ../scripts/build-ddl.mjs 生成，不要手改
  client/src/                 前端：app.tsx 路由、components/Layout.tsx 外壳、ssps/（api/format/ui/hooks/样式）、pages/
  client/preview/ + vite.preview.config.ts   不依赖平台的预览入口（只用于截图）
  scripts/demo-server.cjs     演示服务：内存后端 + 原型示例数据
  scripts/smoke.cjs           冒烟
  scripts/extract-page-css.cjs  从原型页面抽内联样式并加前缀
  shared/api.interface.ts     前后端共享的取值和响应类型
scripts/                      根目录脚本：生成建表计划、种子数据、建库 SQL
```

## 4. 后端架构要点（接真实数据前必须理解）

**端口与适配器。** 服务层（`modules/*/*.service.ts`）只依赖 `ports/*.port.ts` 里的接口，用 `@Inject(令牌)` 注入。现在 `modules/ports/ports.module.ts` 把每个令牌绑到 `adapters/memory/` 的内存实现。接真实数据就是写新的适配器、改这一个文件里的绑定，服务层不改。

| 令牌 | 接口 | 要接的真实数据 |
| --- | --- | --- |
| `VOYAGE_STORE` | `voyage-store.port.ts` | 读镜像表 `m_voyage`/`m_cargo`/`m_bulk_settle`/`m_sales_ext`；写飞书 T04–T07；D01 `eta_revision`、D02 `milestone_log`（变更日志）、D08 `data_issue`；D09 `sync_log`、D10 `write_queue` 由写队列和定时任务用 |
| `MASTER_STORE` | `master-store.port.ts` | 读镜像 `m_port`/`m_berth`/`m_vessel`/`m_route_rule`；写飞书 T01/T02/T03/T08 |
| `IMPORT_STORE` | `import-store.port.ts` | D03/D04 `berth_plan_batch/row`、D11/D12 `inventory_batch/row`（错误值行带标记）；靠船计划有效行同时写飞书 T10 |
| `PREDICTION_STORE` | `prediction-store.port.ts` | D05/D06/D07 `prediction_run/plan/announcement` |
| `SNAPSHOT_PORT` | `snapshot.port.ts` | 预测和日历用的数据快照；`adapters/memory/live-snapshot.ts` 已实现为「从上面几个存储组装」，真实适配器接好后它基本不用改 |
| `DIRECTORY_PORT` | `directory.port.ts` | 把平台 `req.userContext` 解析成「角色 + 部门」；真实实现读平台角色和组织架构，并要有业务员姓名 → 飞书账号映射（待 Leyinet 提供） |

**写入链路（航次保存的骨架，实施计划书第 10 节骨架 3）。** 鉴权 → 合并旧值与修改 → 时序校验 → 推导状态 → 经单线程队列写飞书 → 成功后立即回写应用库镜像行 → 写变更日志和数据质量问题 → 飞书写失败则整体失败、镜像不动。每个写请求带前端生成的幂等键（请求头 `x-idempotency-key`），同一键只执行一次；飞书写成功而回写失败时记待补偿任务，后台重放。回写镜像要记版本，晚到的同步事件不得覆盖更新的回写值（`lark/outbox.ts` 的 `shouldApplySync`）。靠船计划和库存按批次写：整批写完、校验通过后再切「当前批次」指针。

**接口清单状态**（编号对照实施计划书第 8 节）：

| 接口 | 状态 |
| --- | --- |
| A01 当前用户（含服务端「今天」） | 已写（内存版） |
| A02–A05 主数据查询与维护、航程规则 | 已写（内存版） |
| A06 重算 P50/P80 | 已写；定时触发待接 |
| A07–A16 航次列表/详情/新建/修改/节点/ETA/货物/结算/销售扩展/异常标记 | 已写（内存版） |
| A17、A19 靠船计划导入（.xlsx 上传或行 JSON）、批次查询 | 已写（内存版） |
| **A18 云空间拉取靠船计划** | **未写**（要飞书云空间客户端） |
| A20–A24、A29 日历、预测、详情、采纳（写回航次）、宣船文案、自然语言解析 | 已写（内存版） |
| A25 数据质量清单与关闭 | 已写（内存版） |
| **A26 兼容表刷新、A27 迁移、A28 同步日志与自检** | **未写** |
| A30 库存查询与导入 | 已写（内存版） |

## 5. 怎么跑

前提：Node 22。**不要并发跑多个 `npm install`。** 脚手架的 `package-lock.json` 里有些包解析到了 `registry.npmmirror.com`；国内网络没问题，网络受限的环境用：

```bash
cd app && npm ci --registry=https://registry.npmjs.org/ --replace-registry-host=always
```

```bash
cd app
npm test                        # 后端测试
npm run type:check:server       # 后端类型检查
npx tsc --noEmit --project tsconfig.app.json   # 前端类型检查
npx eslint server client/src --quiet
npm run smoke                   # 冒烟（会先 build:server）
```

看页面（不需要飞书、不需要平台登录）：

```bash
cd app
npm run build:server && npm run preview:build
node scripts/demo-server.cjs 3100     # 打开 http://localhost:3100/voyages
```

演示服务用原型的虚构示例数据，「今天」固定为 2026-11-04；请求头 `x-demo-user: 周晓棠` 可以切换身份（人员见 `prototype/mock-data.js` 的 `people`）。云端是用 Playwright 对着 3100 端口截图验证页面的。

真实联调（本机）：`npm run dev`，需要 `lark-cli` 已登录、`.env` 里有环境变量（见仓库根目录 `.env.example`，按 `docs/scaffold-integration.md` 建）。

## 6. 做事规矩与已知的坑

1. **口径只改一处。** 所有暂定值在 `app/server/config.ts`；业务规则在 `CLAUDE.md`「已锁定业务规则」。不要在别处写死数字。
2. **不得自创字段或状态。** 字段以 `docs/schema/` 为准，状态以 `docs/schema/status-rules.md` 为准。
3. **每个写接口都要有测试**，包括权限拒绝、校验拒绝、幂等。测试风格参考 `server/test/voyage-service.spec.ts`。
4. **前端移植原型的方法**：先 `node scripts/extract-page-css.cjs ../prototype/Pxx-*.html pg-pxx client/src/pages/…/pxx.css` 抽出页面样式（自动加 `.pg-pxx` 前缀避免同名类冲突），页面根节点包一层 `<div className="pg-pxx">`；共用样式在 `client/src/ssps/ssps.css`（它把变量定义在 `body{}` 而不是 `:root`，是为了压过 shadcn 主题里同名的 `--muted`、`--primary` 等，**不要改回 `:root`**）。接口一律走 `client/src/ssps/api.ts`（平台的 `axiosForBackend`；读用 `useQuery`，写用 `useWrite`，写请求自动带幂等键）。弹窗是 portal 到 body 的，所以弹窗样式必须放全局。
5. **预览入口的限制**：`preview:build` 用裸 axios 替换了平台 axios，并且不挂平台的 `AppContainer`（它依赖平台接口，云端渲染不出来）。它只用于截图，正式构建 `npm run build` 不受影响。
6. **平台文件勿改**：`client/src/index.tsx`、`server/main.ts`、`server/modules/view/`、`scripts/` 里平台维护的脚本、`server/database/schema.ts`（只能 `gen:db-schema` 生成）。
7. **飞书公式事实**：日期相减直接得天数；空日期按 1970 年算，要加 `!= ""` 保护；`DATETIME_DIFF` 不可用；查找引用字段（类型 19）不能通过 API 创建。
8. **飞书接口限制**：批量写每次 ≤500 条；列表每页 ≤500 条；同一个 Base 的写入走单线程队列。限流错误码要在联调时对照文档核对（`docs/open-questions.md` 有记录）。
9. **历史迁移记录只读**（`readonly=true`）；取消的航次不进重叠船数和 CMR。
10. 提交信息中文，一批做完就提交推送；每次提交后更新 `docs/development-workflow.md` 的进度表。

## 7. 已经替 Leyinet 做过的判断（接手后不要推翻，除非他改口）

- 物流管理员不能新建或修改航次（接口表只给业务员、部门主管，系统管理员全权）——见 `docs/open-questions.md`。
- 卸船结算：作业数据可由大宗采购部（本人航次或主管）和仓储物流部改，费用结算只有大宗采购部；碰到无权限的分组直接 403，不静默丢弃。
- 采纳预测方案：窗口写在本港侧（卸港是本港 → 计划抵卸港窗口；装港是本港 → 受载期），只能写回「待宣船」、装卸港一致的本人航次，否则新建待宣船航次。
- 销售扩展字段是「租船方式（CFR/FOB）」和「海运合同号」（T07），后端已对齐。
- 估算版经验航程只是为了让系统先能跑，不是业务数据。

## 8. 密钥与数据

- 对话里出现过一次 App ID `cli_aa2584bb95f89bef` 对应的 App Secret，**视为已泄露，必须先在开放平台重置**，新值只放本机环境变量。
- `.env*` 不提交；日志和回传给云端的报错要去掉密钥和业务数据。
- 企微导出的 Excel 只在本机运行；需要核对时只回传统计数。
