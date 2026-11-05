# SSPS 完整交接手册：本机 Claude Code 接手开发（2026-11-05）

这是给**在 Leyinet 本机运行的 Claude Code**的唯一入口手册。读完它你应该能：知道项目是什么、做到哪了、哪些东西没被验证过、本机怎么跑、接下来按什么顺序联调、碰到什么情况必须停下来问人。

> 先说最重要的一句：**目前没有任何功能上线。** 云端写完的所有代码，只在「内存数据」「内存 Postgres（PGlite）+ 假飞书多维表格」「假平台 SDK」上测过，**从来没有连过真实飞书、真实应用库、真实妙搭平台**。你的核心价值就是把这一步走通，并如实汇报。

---

## 0. 阅读顺序与文档地图

按顺序读，别跳：

1. `CLAUDE.md`——产品定位、**已锁定的业务规则**、工作约定（回复用中文；区分「已上线」和「计划中」）。
2. 本手册。
3. `app/AGENTS.md`——妙搭脚手架的平台规范（DDL 只能走 `lark-cli apps +db-execute`、`server/database/schema.ts` 禁止手改、平台文件勿改）。**同样要遵守。**
4. `docs/open-questions.md`——待 Leyinet 确认的事项。**未勾选的项不要自行假定**，要么停下来问，要么按文档里写明的暂定口径并在汇报里点出来。

需要时再查：

| 文档 | 用途 |
| --- | --- |
| `docs/implementation-plan.md` | 实施计划书 V1.0：决策 K01–K14、表结构、接口清单（第 8 节）、页面（第 9 节）、里程碑与验收门 G1–G3 |
| `docs/handoff/task-book.md` | 任务书（W00–W53）：每个任务的目标、步骤、验收、提示词；状态已更新 |
| `docs/handoff/README.md` | 上一版交接总览（给 Codex 写的，仓库地图和后端架构讲得更细） |
| `docs/handoff/permission-matrix.md` | 权限矩阵（**由代码生成**，别手改） |
| `docs/handoff/scheduled-jobs.md` | 6 个定时触发器清单 |
| `docs/handoff/security-review.md` / `performance-notes.md` | 安全、性能检查记录（云端部分） |
| `docs/schema/` | 多维表格 T01–T10、应用库 D01–D12、状态规则、迁移规则、`mirror-columns.md`（镜像表列对照）、`mirror-samples.md`（飞书写入格式实测）、`compat-mapping.md`（兼容表列对应） |
| `docs/local-tasks-prompts.md` | 已给本机 Codex 用过的提示词合集（提示词 7/8/9 是**还没执行**的） |
| `docs/development-workflow.md` | 开发流程与进度表 |

---

## 1. 人与分工

- **Leyinet**：产品负责人，**非程序员**。拍业务口径、提供数据、做验收。汇报要用**中文白话**，不要贴大段代码；先说结论，再说依据；严格区分「已上线 / 已写好未验证 / 计划中」。需要他做的事要写成他能照做的步骤（PowerShell 命令放独立代码块）。
- **你（本机 Claude Code）**：主力。能访问飞书（`lark-cli` 已登录）、能连妙搭、能跑 `npm run dev`、能读他本机的真实 Excel。负责联调、修 bug、补剩余功能、跑迁移。
- **云端 Claude**：不再参与代码开发（云端访问不到飞书，代码主线已改到本机平台仓库）；仅在你明确需要时帮忙写文档或不依赖飞书的纯代码，产物要手动搬进平台仓库。

**代码与文档分仓**（2026-11-05 定稿，详见 **`docs/handoff/deploy-flow.md`——开始前必读**）：**代码主线是本机妙搭平台工作副本 `C:\Users\董金\ssps-miaoda`（`sprint/default`，Claude 的工作目录）**；文档、原型、交接材料、部署脚本在文档仓 `C:\Users\董金\WorkBuddy\SSPS`（`main`，远端 GitHub `Leyihub/SSPS`），其中 `app/` 是冻结的历史备份，不再写代码。启动方式：`cd C:\Users\董金\ssps-miaoda; claude --add-dir "C:\Users\董金\WorkBuddy\SSPS"`。本手册里写的 `app/…` 路径，在平台仓库里对应**仓库根**（如 `app/server/…` = `server/…`）。

> 同步机制（已由本机 WorkBuddy 实地核对，详见 `deploy-flow.md`）：GitHub 与妙搭是**两条独立链路**；`scripts/miaoda-deploy.ps1` 提供 `check/gates/sync/backup/push/release`。注意：**`push` 到妙搭 `sprint/default` 不等于上线**，`release` 才上线，且必须 Leyinet 当次授权；首次发布前必须先配好环境变量与平台角色，否则线上会跑内存演示模式（见 deploy-flow §4.3）。

---

## 2. 产品是什么、不是什么

**SSPS · 智慧发船预测系统**：印尼德信（IMIP 园区）智慧航运 APS，部署在飞书妙搭。

- 核心是「**智能发船计划预测**」：帮业务员根据港口承载能力、航行周期、ETA 规律、港口拥堵规律，预测最佳发船日、最佳到港窗口、压港风险、ETA 风险。
- 核心用户是**业务员**（大宗采购部、商务海运部、仓储物流部），**不是港口调度员**。
- **不做**：港口实时调度塔台、数字孪生大屏、纯调度 Cockpit。
- 第一版已移除：DWRS 六维评分、风险标记体系、成本决策模块、Plan C/D、AI 开放问答、天气预报、微信转发。

### 已锁定业务规则（沿用德龙版，不重新讨论；完整版见 CLAUDE.md）

1. 容量指标**只用 CMR**（容量余量率，越高越充裕），任何界面不得出现其他容量口径。
2. 泊位池以《泊位容量表》（2026-10-08）为唯一依据：23 个德信可用泊位；表外泊位一律不计；LN16 按普通 1 万吨泊位处理。
3. CMR 分母按查询货量做吨级匹配，**分母随查询变化**；港口日历默认 5 万吨档。
4. **按目标到港日距今分流**（不按数据有无分流）：≤15 天用 IMIP 靠船计划做泊位级 CMR；＞15 天用航次表做重叠船数密度判断。
5. 只出 Plan A / Plan B。Plan B 要求 CMR 余量 ≥30%；没有完整数据候选时从稀疏候选中选并标「低可信」（稀疏候选同样要求有数据的天余量 ≥30%，达不到就不出 Plan B）。
6. 「无数据」显示为**灰色斜线**，绝不显示为 0%。
7. 排序指标：≤15 天用 CMR_min，＞15 天用重叠船数。**不使用综合评分。**
8. 成品销售船从装港侧反推；物资备件船先用自己的规则，没有才借用大宗航线航程样本；外贸客户港 ETA 用反向近似，仅供参考。
9. 在港判断**只比较日期，不比较时刻**。
10. **规则引擎输出的数值不得被任何生成式模型改写**；宣船文案只能引用引擎结果。S1 溯源是防止静默编造的第二道防线。

### 红线（出错代价最高）

- **密钥只放环境变量**，绝不写进仓库、提示词、日志、提交信息、回复。对话里出现过的 App ID `cli_aa2584bb95f89bef` 对应的 App Secret **视为已泄露，必须先在开放平台重置**（Leyinet 说那是联调用的 key，会换）。前端绝不出现 App ID / App Secret。
- **真实业务数据不提交**：企微导出的 Excel（`.gitignore` 已排除 `*.xlsx *.csv`）、库存表、迁移输出（`migration-out/`）。需要核对时只回传统计数。
- 不得自创字段或状态：字段以 `docs/schema/` 为准，状态以 `docs/schema/status-rules.md` 为准。
- 暂定口径（15 天分流、30% 门槛、样本数 5、ETA 超期 3 天等）**只改 `app/server/config.ts` 一处**，别在别处写死数字。

---

## 3. 现状总表

图例：✅ 已完成且验证过　🟡 已写好、云端测过、**未在真实环境验证**　⬜ 未做

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 产品原型 P01–P11 | ✅ | `prototype/`，Leyinet 已评审；虚构示例数据；是前端视觉与交互基线、引擎对照基准（`prototype/engine.js`） |
| 飞书多维表格 T01–T10（11 张表） | ✅ | 已建好并核对（`docs/schema/base-build-report-2026-11-05.md`）。**例外**：T04 有 4 个查找引用字段要在界面里手建；`实际航程（天）`公式读回无值（疑似用了飞书不支持的 `DATETIME_DIFF`）——不影响业务，后端自己算 |
| 应用库 D01–D12 + 镜像同步 | ✅（本机 Codex 执行） | 001/002/003/004 SQL 已执行；8 个 streaming 同步任务已建；匿名读权限已收紧；同步延迟约 6 秒；`server/database/schema.ts` 已生成（20 张表）。列对照见 `docs/schema/mirror-columns.md` |
| 领域层与预测引擎 | ✅ | 与原型引擎逐项对照一致（`server/test` 有对照测试） |
| 后端业务模块 A01–A30 | 🟡 | 内存版 + 真实仓储版都有；`SSPS_STORE=real` 切到应用库 + 飞书 |
| 真实仓储（预测、导入、日志、自检、写队列、主数据、航次） | 🟡 | Drizzle 适配器，PGlite + 假飞书测试；内存版与真实版跑**同一套**服务用例 |
| 写链路（先写飞书→回写镜像→日志）+ 幂等 + 补偿 | 🟡 | `lark/outbox.ts`、`POST /api/admin/replay` |
| 真实身份目录 | 🟡 | 平台角色 `ssps_*` + 飞书部门；假 SDK 测试；**平台 SDK 的真实返回形状未验证** |
| 定时任务 | 🟡 | 6 个平台自动化触发器（`@Automation/@BindTrigger`）；**没在真实平台注册过，cron 时区未知** |
| 兼容表 T09a/T09b 刷新（A26） | 🟡 | 整表就地重写；**旧表各列口径是按列名推断的，待 Leyinet 核对** |
| 数据质量扫描、库存过期提醒 | 🟡 | 缺 MMSI / ETA 超期自动生成与关闭；库存与货物的对应口径待确认 |
| 前端 React 11 页 | 🟡 | 云端用演示服务 + Playwright 截图验证；**没在妙搭 AppContainer 里跑过** |
| 迁移 dry-run | 🟡 | `scripts/migrate-dryrun.ts` 只出统计与待确认清单；**没用真实 Excel 跑过** |
| 迁移正式写入、港口信息表→T01、靠船计划首批次、人员映射 | ⬜ | 等 dry-run 结果和 Leyinet 的确认清单 |
| 同步防覆盖核对任务 | ⬜（有意不做） | 平台同步最终一致；联调若观察到不一致再做 |
| 航次导出后端流式 | ⬜ | 数据量大时再做 |
| 负责人转移 | ⬜（不要自行实现） | 规格没写转移规则，先问 Leyinet |
| 库存文件云空间拉取 | ⬜ | 库存目前只有手动上传 |

质量门（每次提交前全绿）：`npm test`（168 个）、`npm run type:check`、`npx eslint server client/src --quiet`、`npm run smoke`。

---

## 4. 架构（接真实数据前必须理解）

### 4.1 工程结构（`app/`）

```
server/
  config.ts           所有暂定口径集中在这里
  domain/             状态推导、时序校验、航程规则、权限、航次模型、兼容表行生成、权限矩阵
  engine/             容量(CMR/重叠船数)、库存断料、推荐 Plan A/B、宣船文案、S1 溯源
  nlp/ importers/ lib/   自然语言解析；靠船计划/库存/迁移清洗；日期、xlsx 读取器
  lark/               飞书客户端：token、bitable(分页读/500条批量写)、单线程写队列、outbox(幂等+补偿)、drive、gateway、fieldmap
  ports/              端口接口 + tokens.ts（依赖注入令牌）
  adapters/
    memory/           内存实现（本地演示、测试）
    drizzle/          应用库实现（读镜像 m_*、写飞书、回写镜像）
    platform/         平台角色成员目录、真实身份目录与用户对照
  modules/            prediction capacity voyage master imports admin ports view
  database/schema.ts  由 gen:db-schema 生成，禁止手改
  test/               node:test，*.spec.ts；helpers/ 有 PGlite、假飞书、xlsx 写入器
db/                   001–004 SQL（001–003 由根目录 scripts/build-ddl.mjs 生成）
client/src/           app.tsx 路由、ssps/(api format ui hooks css)、pages/、components/
client/preview/ + vite.preview.config.ts   不依赖平台的预览入口（只用于云端截图）
scripts/              dev/build（平台维护）、smoke.cjs、demo-server.cjs、gen-db-schema-local.mjs、migrate-dryrun.ts、gen-permission-matrix.ts
```

### 4.2 端口与适配器

服务层只依赖 `ports/*.port.ts`，用 `@Inject(令牌)` 注入。`modules/ports/ports.module.ts` 按 **`SSPS_STORE`** 选实现：

- 未设置 / `memory`：全部内存实现（演示、测试）。
- `real`：预测/导入/日志/自检用 Drizzle；`MASTER_STORE`/`VOYAGE_STORE` 读镜像、写飞书；`DIRECTORY_PORT` 用 `PlatformDirectory`；需要环境变量和平台注入的 `DRIZZLE_DATABASE`、`AuthorizationSDK`。缺配置时**启动即报错**（不要吞）。

| 令牌 | 真实实现 |
| --- | --- |
| `VOYAGE_STORE` | `DrizzleVoyageStore`：读 `m_voyage/m_cargo/m_bulk_settle/m_sales_ext`，写飞书 T04–T07，D01 eta_revision、D02 milestone_log、D08 data_issue |
| `MASTER_STORE` | `DrizzleMasterStore`：读 `m_port/m_berth/m_vessel/m_route_rule`，写 T01/T02/T03/T08 |
| `IMPORT_STORE` | D03/D04 靠船计划批次与行、D11/D12 库存批次与行；整批事务，当前批次指针事务切换 |
| `PREDICTION_STORE` | D05/D06/D07 |
| `SNAPSHOT_PORT` | `LiveSnapshot`：从上面几个存储组装预测/日历用的快照，预测与日历口径一致 |
| `DIRECTORY_PORT` | `PlatformDirectory`（真实）/ `MemoryDirectory`（演示，未知用户兜底「业务员·大宗采购部」，**仅限内存模式**） |
| `USER_LOOKUP` | `PlatformUserLookup`：平台用户 ID → 姓名、飞书企业内 user_id（用于写人员字段） |
| `BASE_GATEWAY`/`LARK_DRIVE`/`LARK_TOKEN` | `LarkModule`（全局）按环境变量装配；没配置时为 `null`，调用方报「未配置」 |

### 4.3 写链路（航次/主数据保存）

鉴权 → 合并旧值 → 时序校验 → 推导状态 → `Outbox.execute(幂等键)`：**登记 pending → 经单线程队列写飞书 → 记 written → 回写镜像行（按 base_record_id upsert）→ 记 done** → 写变更日志/数据质量问题。

- 同一幂等键重复提交只执行一次；飞书写成功但回写失败 → 记录停在 `written`，补偿重放只补镜像、**绝不再写飞书**。
- 飞书写失败 → `failed`，用同一键重试。
- 回写镜像是为了「读己所写」；平台的 streaming 同步（约 6 秒）最终会让镜像与飞书一致，所以不做同步防覆盖。
- `write_queue.operation` 有 CHECK（create/update/delete），幂等辅助 `once()` 用 `create`。

### 4.4 飞书写入格式（2026-11-05 已用真实 Base 实测，见 `docs/schema/mirror-samples.md`）

日期时间 = 13 位**毫秒时间戳整数**（字符串会被拒）；关联 = 记录 ID 字符串数组；人员 = `[{id}]`（用企业内 user_id 时请求加 `user_id_type=user_id`）；多选 = 字符串数组；`PATCH` 只改传入字段；**自动编号、公式、查找引用写了会被静默忽略**；单选传空字符串会报错（空要传 `null`，代码已处理）；IMIP 当地时间 WITA = UTC+8（`TZ_OFFSET_HOURS`）。批量写 ≤500 条/次、列表每页 ≤500 条、同一 Base 写入走单线程队列。

### 4.5 镜像表

`m_*` 是平台 streaming 同步出来的**只读**镜像，每张都有 `base_record_id`（唯一）。人员字段在库里是 `user_profile` 复合类型（值是平台用户 ID）。T09a/T09b/T10 不镜像。应用库里的自有表（D01–D12）是二期切换时不动的部分。

### 4.6 定时任务

用平台自动化触发器：`server/modules/admin/jobs.automation.ts` 里 `@Automation()` + `@BindTrigger('名称[cron]')`，应用启动自动向 trigger-server 注册，到点平台回调 `/innerapi/automation/invoke`。**不走前端 HTTP、不用令牌**（早期「令牌 + HTTP」方案会被控制器的 `@NeedLogin()` 拦住，已废弃）。6 个：

| 触发器 | 动作 | cron |
| --- | --- | --- |
| cronPullBerthPlan | 云空间拉靠船计划 | `*/30 * * * *` |
| cronReplay | 补偿重放 | `*/5 * * * *` |
| cronCompatDirty | 兼容表增量（仅「待刷新」时） | `*/10 * * * *` |
| cronCompatFull | 兼容表全量重写 | `50 15 * * *` |
| cronRecomputeRoutes | 航程规则重算 | `0 3 * * *` |
| cronIssueScan | 数据质量扫描 | `0 8 * * *` |

每个任务自己吞异常只记日志。系统管理员也可手动触发同样的接口。

### 4.7 身份与权限

- 角色：平台角色 bizID `ssps_salesman`（业务员）/`ssps_manager`（部门主管）/`ssps_logistics`（物流管理员）/`ssps_admin`（系统管理员）；多个取权限最高；**没有任何 SSPS 角色 → 403**；可用环境变量 `ROLE_MAP`（JSON）覆盖。
- 部门：业务员/主管取飞书组织架构里的部门名，含「大宗」「商务海运」「仓储物流」归对应部门，对不上 → 403；物流管理员固定仓储物流部；系统管理员无部门；`DEPT_MAP` 可覆盖。
- 用户目录来自 `AuthorizationSDK.members.list(角色bizID)`（所有 SSPS 用户必须在某个角色里），缓存 5 分钟，未知用户最短 30 秒才刷新一次。
- 规则全文见 `docs/handoff/permission-matrix.md`（代码生成）。金额字段对无权限者整体不返回。

### 4.8 接口一览（编号对照实施计划书第 8 节）

`GET /api/me`；`/api/ports`、`/api/berths`、`/api/vessels`（GET/POST/PATCH）；`/api/route-rules`（GET/POST/PATCH，`POST /recompute`）；`/api/voyages`（列表、详情、新建、改字段、`/:id/milestones`、`/:id/eta`、`/:id/flags`、`/:id/cargo-lines`、`/:id/bulk-settlement`、`/:id/sales-ext`）；`/api/data-issues`（GET、PATCH、`POST /scan`）；`/api/predictions`（预测、`/stock-plan`、`/parse`、`/:runNo`、`/:runNo/adopt`、`/:runNo/announcement`）；`/api/capacity/calendar|day`；`/api/berth-plans`（`/import`、`/import-file`、`/pull`、`/batches`、`/batches/:no/rows`）；`/api/inventory`（GET、`/batches`、`/trend`、`/import`、`/import-file`）；`/api/admin/sync-logs`、`/api/health`、`/api/admin/replay`、`/api/admin/compat/refresh`。

---

## 5. 本机环境

### 5.1 前置检查（第 1 阶段第一件事，结果写进 `docs/handoff/local-env.md`，不要写密钥）

- [ ] `node -v` 是 22；`git pull` 到最新 `main`；`cd app && npm ci`（国内网络没问题；受限网络用 `--registry=https://registry.npmjs.org/ --replace-registry-host=always`；**不要并发跑多个 npm install**）。
- [ ] `lark-cli` 已登录，能列出应用 `app_17heqwc44fd`（`lark-cli apps --help` 找命令，**不要猜参数**）。
- [ ] **一次性迁移**：文档仓 `git pull` 后，按 `deploy-flow.md` §2 把最新代码 `sync` 进平台仓库（先 `-DryRun`），核对 `package.json`，放 `CLAUDE.md`/`CLAUDE.local.md`（`docs/handoff/platform-repo/`），质量门全绿后 `-Mode push`；把 `scripts/miaoda-deploy.ps1` 提交进文档仓。之后所有代码只在平台仓库改。
- [ ] 应用库能连：`database.enabled=true`；8 个镜像同步任务在跑；`m_*` 表有行（T01 10、T02 23、T08 10，其余可能为 0）。
- [ ] `npm test`、`npm run type:check`、`npm run smoke` 在本机也全绿（说明环境没问题）。
- [ ] `origin/local/db-schema-2026-11-05` 分支有一个旧提交（schema.ts 刷新），main 上的 schema.ts 已经是后来的 20 张表版本，**可忽略这个分支**；但要核对 `server/database/schema.ts` 与线上库一致（不一致就 `npm run gen:db-schema:local` 重新生成）。

### 5.2 环境变量（见仓库根 `.env.example`；本地用 `app/.env`，**不提交**；线上用 `lark-cli apps +env-set`）

| 变量 | 作用 |
| --- | --- |
| `SSPS_STORE` | `real` 切真实仓储；空/`memory` 为内存演示 |
| `LARK_APP_ID` / `LARK_APP_SECRET` | 飞书应用凭证（Secret 必须是重置后的新值） |
| `BITABLE_APP_TOKEN` | 「德信智慧航运主数据」Base 的 app_token |
| `BITABLE_TABLE_IDS` | JSON：`{"T01":"tbl…",…,"T09a":…,"T09b":…,"T10":…}`，值见 `docs/schema/base-build-report-2026-11-05.md` |
| `DRIVE_FOLDER_TOKEN_BERTH_PLAN` | 存放 IMIP 靠船计划 Excel 的云空间文件夹 token（**Leyinet 尚未提供**） |
| `ROLE_MAP` / `DEPT_MAP` | 可选：覆盖平台角色→业务角色、部门名关键字→部门 |
| （无） | 时区偏移 `TZ_OFFSET_HOURS = 8` 是 `adapters/drizzle/db.ts` 里的常量，不是环境变量 |

`DRIZZLE_DATABASE`、`AuthorizationSDK` 由平台在运行时注入。**本机 `npm run dev` 能否拿到它们，是第 1 阶段要验证的事。**

### 5.3 命令速查

```bash
cd app
npm test                                   # 168 个后端测试（PGlite/假飞书，约 30 秒）
npm run type:check                         # 前后端类型检查
npx eslint server client/src --quiet
npm run smoke                              # 真起 Nest 走完整 HTTP 主线
npm run dev                                # 本机联调（需要 .env 与 lark-cli 登录）
npm run gen:db-schema:local                # 本机刷新 schema.ts（平台版 gen:db-schema 需要内网变量，本机不可用）
npx tsx --tsconfig tsconfig.node.json scripts/migrate-dryrun.ts --help   # 迁移 dry-run（见脚本开头注释）
npx tsx --tsconfig tsconfig.node.json scripts/gen-permission-matrix.ts    # 改了权限后重新生成矩阵

npm run build:server && npm run preview:build && node scripts/demo-server.cjs 3100   # 不依赖飞书的演示（原型示例数据，"今天"固定 2026-11-04；请求头 x-demo-user 切身份）
```

数据库 DDL 一律 `lark-cli apps +db-execute`（先 `--help`），**平台 SQL 解析器不支持 `DO $$` 块**，只用静态语句；执行后刷新 schema.ts。部分唯一索引（`is_current`、data_issue 未关闭）在生成的 schema.ts 里会变成普通 `.unique()`——这只是产物，数据库里的约束是对的。

---

## 6. 开发规矩（含已踩过的坑）

1. **每个写接口都要有测试**：权限拒绝、校验拒绝、幂等、飞书失败重试。风格参考 `server/test/voyage-service.spec.ts`、`drizzle-voyage.spec.ts`。`master-service.spec.ts`、`voyage-service.spec.ts` 对内存版与真实版各跑一遍，**新增行为要两边都过**。
2. **假飞书 `test/helpers/fake-base.ts` 会按 `docs/schema/base-plan.json` 校验写入**（字段名、毫秒时间戳、关联数组、人员格式、单选选项）。联调时如果真实飞书与假飞书行为不一致，**先修假飞书使其复现真实行为，再修代码**。
3. 平台文件勿改：`client/src/index.tsx`、`server/main.ts`、`server/modules/view/`、`scripts/` 里平台维护的脚本、`server/database/schema.ts`（只能生成）。
4. 前端移植原型：`node scripts/extract-page-css.cjs ../prototype/Pxx-*.html pg-pxx <输出.css>`；样式变量写在 `body{}` 而非 `:root`；页面根包 `<div className="pg-pxx">`。所有计算走后端接口，前端不重算。
5. 前端约束：eslint 不允许 `confirm`/`alert`（用 `Modal`）；React hooks 不能放在条件 return 之后。
6. 公式事实：飞书日期相减直接得天数；空日期按 1970 年算，要加 `!= ""` 保护；`DATETIME_DIFF` 不可用；查找引用字段不能通过 API 创建。
7. 接口出错的响应：生产环境不返回堆栈（已加固）；CSV 导出已防公式注入；xlsx 读取有 50MB 解压上限、上传 10MB 限制。
8. 历史迁移记录只读（`readonly=true`）；取消的航次不进重叠船数和 CMR。
9. 提交：**中文提交信息**，一批做完就提交；**代码提交到平台仓库，文档（任务书、open-questions、进度表、本手册）提交到文档仓**，涉及两边时分别提交；每次提交后在文档仓更新 `docs/development-workflow.md` 进度表；**每完成一个前端页面的联调，用 Playwright 截图存 `prototype/screenshots/` 或说明位置，等 Leyinet 反馈再改**（CLAUDE.md 工作约定第 7 条）。
10. 收到「继续」直接做下一步，不再确认；但**需要业务判断、会改变线上数据、会花钱/发消息/不可逆**的动作必须先问。

### 已替 Leyinet 做过的判断（别推翻，除非他改口）

- 物流管理员不能新建或修改航次；系统管理员全权。
- 卸船结算：作业数据可由大宗采购部（本人航次或主管）和仓储物流部改，费用结算只有大宗采购部；碰到无权限分组直接 403，不静默丢弃。
- 采纳预测方案：窗口写在本港侧（卸港是本港→计划抵卸港窗口；装港是本港→受载期），只能写回「待宣船」、装卸港一致的本人航次，否则新建待宣船航次。
- 销售扩展字段是「租船方式（CFR/FOB）」和「海运合同号」（T07）。
- 新增船舶 MMSI 必填、已有 MMSI 不能清空（K13）；历史缺 MMSI 的船舶不受限，由数据质量扫描提示补录。
- 新建航次时的初始 ETA 不写 ETA 修订历史（K13「每次修订留痕」，初始值不是修订）——未被明确确认，见 open-questions。
- 经验航程（T08 的 10 条）是**估算版**，只为让系统先能跑，不是业务数据，待大宗采购部校对。

---

## 7. 联调路线图（按顺序做；每阶段有通过标准；失败如实汇报）

### 阶段 1：环境自检与读通（预计半天）

1. 完成 §5.1 前置检查，写 `docs/handoff/local-env.md`。
2. 配好 `.env`，`SSPS_STORE=real npm run dev`。**先验证应用能启动**（缺配置会启动即报错，按报错补）。
3. 验证平台注入：`DRIZZLE_DATABASE`、`AuthorizationSDK` 在本机 dev 下是否可用？不可用就说明某些验证只能发布到妙搭后做，记录下来。
4. 只读验证：`GET /api/ports|berths|vessels|route-rules` 返回的行数与 Base 一致（10/23/?/10）；`GET /api/capacity/calendar` 在没有靠船计划时全部是灰色斜线「无数据」（不是 0%）。

通过标准：real 模式启动，读接口通，数字与 Base 对得上。

### 阶段 2：身份与权限（预计半天，需要 Leyinet 配合账号）

执行 `docs/local-tasks-prompts.md` 的**提示词 9** 的内容（现在由你直接做）：建 4 个平台角色、分配成员、核对：①`req.userContext.roles` 里放的是 bizID 还是角色名；②`members.list` 返回的 `userList` 字段（`name` 的 key 是不是 `zh_cn`、`employeeID` 是否为飞书企业内 user_id、`department.name` 与组织架构是否一致）。对不上就改 `ROLE_MAP`/`DEPT_MAP`，仍不行再改 `adapters/platform/role-members.ts` 的取值（那里的字段形状是按 SDK 类型定义猜的）。

通过标准：四个测试账号（W04，Leyinet 提供）逐项对照 `permission-matrix.md`：金额字段对非大宗采购部不可见、物流管理员不能改航次、无角色账号 403。

### 阶段 3：写通（主线）（预计 1 天）

按顺序真跑（每步到飞书里肉眼核对）：新增船舶（带 MMSI）→ 新建航次（带货物）→ 录节点 → 修订 ETA → 改货物 → 保存卸船结算/销售扩展 → 打异常标记。核对点：

- 飞书 T04/T05/T06/T07 里的记录字段正确；时间是 WITA（UTC+8）；负责业务员人员字段写上了（`user_id_type=user_id`）；航次编号来自飞书自动编号。
- 约 6 秒后镜像表 `m_*` 与飞书一致；回写镜像让页面立刻读到己方修改。
- 重复提交（同一幂等键）不产生重复记录；人为制造回写失败后 `POST /api/admin/replay` 能补齐。
- 假飞书与真实行为的差异 → 回头修 `fake-base.ts` 并加测试（规矩 2）。

通过标准：主线走通，D09 运行日志/D10 write_queue/D02 变更日志有记录，无重复数据。

### 阶段 4：导入与预测（预计 1 天，需要真实靠船计划/库存文件）

手动上传一份真实靠船计划（先用小样本；**文件不提交**）：批次、过滤规则（预计卸完≥导入日、日期±90 天合理性）、「泊位未匹配」问题、日历覆盖期内有数、覆盖期外仍是「无数据」。再导入库存表：错误值行标记不参与计算；库存过期提醒。然后跑预测：≤15 天/＞15 天两条路径、Plan A/B、S1 溯源、「低可信」标签、采纳写回航次、宣船文案数值与方案一致。把 **G2 的对照**（与德龙版 20+5 个用例）作为这一阶段的延伸，需要 Leyinet 提供用例。

通过标准：真实数据下预测结果可解释、无数据显示正确、数值没被改写。

### 阶段 5：定时任务（预计半天）

执行**提示词 8**（现在由你直接做）：发布后确认 6 个触发器已注册、**确认 cron 时区**（若是 UTC，把 `cronCompatFull` 等表达式整体调整）、各手动触发一次，看应用日志与「系统管理→同步日志」。云空间拉取需要 `DRIVE_FOLDER_TOKEN_BERTH_PLAN`——**缺就停下来向 Leyinet要，别编**。

### 阶段 6：兼容表（预计半天，需 Leyinet 核对）

先让 Leyinet 对着旧表核 `docs/schema/compat-mapping.md` 的列口径（尤其：逾期、供应商/船名、货物类型、滞期/速遣费正负号、交接状态、到港日、今日在港；物资备件船归 T09a 还是 T09b；创建人/时间留空是否可以）。核对后手动触发 `POST /api/admin/compat/refresh`，抽样 50 行与企微原表逐列比对（迁移验收 G1 的一部分）；评估整表重写的实际耗时（3000 航次约 6000 行×87 列，单线程 ≤500 条/批），必要时改成只更新有变化的行。

### 阶段 7：前端在妙搭里验证（W29，预计 1 天）

11 个页面逐个在真实平台（AppContainer、真实登录）里过一遍：路由、登录态、权限表现、空状态、错误提示、手机/窄屏。重点：P02/P03 预测与溯源、P05 详情（金额裁剪）、P06 日历（灰色斜线与 CMR 色阶）、P07、P09、P10、P11。发现问题就地修，截图给 Leyinet。

### 阶段 8：迁移（W40–W42，预计 3–5 天，强依赖 Leyinet）

1. **dry-run**：执行**提示词 7**（现在由你直接做）：用 `scripts/migrate-dryrun.ts` 读三份企微 Excel（放仓库目录之外）。若报找不到列/读出 0 行，核对表头行位置（商务海运表表头在第 2 行，代码用 `headerHint` 定位）。只把 `report.md`（统计）给 Leyinet；`confirm.csv` 含港口/船名原文，只留本机。
2. Leyinet 填待确认清单（港口别名、7 天拼船归并、船名拆分异常、占位时间疑似）；结果落成**配置文件**（别名表等），不要写进代码常量。
3. 补齐未做部分：港口信息表（211 行）→T01；靠船计划表（453 行）→首个批次（2026-08-03）；业务员姓名→飞书账号映射；正式写入脚本（走真实仓储 + outbox 幂等，分批 ≤500，可断点续跑）。M1 只迁在途 + 近 30 天，全量历史在 M2 结束前补。
4. **G1 对账**：按业务类型、月份对比新旧航次数与货量合计，差异只允许来自已确认的归并/剔除。

### 阶段 9：验收与发布（W43、W44、W51）

G2：预测与德龙版 20+5 用例对照；G3：并行运行 2 周后切换（综合物流平台把数据源换成兼容表）。发布与回滚用 `lark-cli apps +release-create`（**发布前必须得到 Leyinet 授权**），保留回滚方案。

---

## 8. 云端写的、但没被真实环境验证过的假设（联调时逐条核对）

这是最容易出事的清单。每核对完一条，在 `task-book.md` 或本手册里标记结果。

| # | 假设 | 在哪 | 怎么核对 |
| --- | --- | --- | --- |
| 1 | `req.userContext.roles` 里是角色 bizID | `adapters/platform/platform-directory.ts` | 打印一次（别提交） |
| 2 | `AuthorizationSDK.members.list(bizID,{type:'User',page,pageSize})` 返回 `members.userList[]`，`name` 的 key 含 `zh_cn`，`employeeID` 是飞书企业内 user_id，`department.name` 是组织架构部门名 | `adapters/platform/role-members.ts` | 提示词 9 第 4 步 |
| 3 | 触发器写法 `名称[cron]` 合法、会被自动注册；cron 时区 | `modules/admin/jobs.automation.ts` | 提示词 8 |
| 4 | 本机 dev 下 `DRIZZLE_DATABASE`/`AuthorizationSDK` 可注入 | `ports.module.ts`、`lark.module.ts` | 阶段 1 |
| 5 | 飞书限流错误码（99991400/1254290/1254291）+ HTTP 429 即「可重试」 | `lark/bitable.ts` | 压力下观察，对照官方文档 |
| 6 | 飞书列表接口返回 `items[].record_id`（兼容表整表重写用 `listAll`） | `lark/gateway.ts` `ids()` | 阶段 6 |
| 7 | 人员字段用 `user_id_type=user_id` + `[{id: employeeID}]` 可写 | `drizzle-voyage-store.ts` | 阶段 3 |
| 8 | 镜像表 `voyage_no1`、`app_detail_id`、`ship_no`、`rule_no` 等是飞书自动编号的同步列；`created_at` 反映 Base 创建时间，用于推 `VY-年-序号` 编号的年份 | `drizzle-voyage-store.ts` `idOf` | 阶段 3（注意跨年边界） |
| 9 | 镜像「关联」列存 `{link_record_ids:[…]}` JSON | `adapters/drizzle/dict.ts` | 已用样本核对，联调再确认 |
| 10 | 旧表时间是 WITA | 迁移 | open-questions |
| 11 | 兼容表各列口径（见 `compat-mapping.md`） | `domain/compat.ts` | 阶段 6，Leyinet 核对 |
| 12 | 库存品名与货物名「互相包含」即相关 | `modules/imports` `nameMatch` | open-questions |
| 13 | 平台 RLS：`app.user_id` 会话变量、`authenticated`/`anon` 角色名（schema `workspace_aadk4nbssueku`） | `db/00*.sql` | 用匿名连接实测读不到 |
| 14 | `实际航程（天）` 等 4 个飞书公式/查找引用有问题 | Base | 后端自己算，不阻塞；有空修 |

---

## 9. 需要 Leyinet 拍板/提供的事项（精选；完整见 `docs/open-questions.md`）

**会阻塞你的（要尽早催）：**

1. 云空间文件夹 token（`DRIVE_FOLDER_TOKEN_BERTH_PLAN`）与 DX_DataTB_WS 上传任务。
2. 四个测试账号（业务员/主管/物流管理员/系统管理员各一，业务员/主管要在三个部门里）。
3. 业务员姓名→飞书账号映射表（大宗约 33 人、商务海运约 9 人）。
4. 真实靠船计划 Excel、库存消耗模拟表（只在本机用，不提交）。
5. 三份企微导出 Excel（迁移 dry-run 用）。
6. 重置后的 App Secret。
7. 兼容表旧表列口径核对；平台角色约定确认。

**业务口径（有暂定值，不会阻塞，但要在汇报里点出来）：** 吨级档划分（仅 5 万吨是已锁定）、「业务属性」枚举、成品销售船是否以卸港靠泊为结束、旧表时间时区、ETA 超期阈值（暂 3 天）、Plan B 在＞15 天路径的资格门槛、库存物料与货物对应、航程样本上限（暂 90 天）、泊位类别（海船/驳船）、首版经验航程由谁校对（目前是 10 条估算版）。

---

## 10. 汇报与协作规范

- 中文，白话，先结论后依据；Leyinet 不是程序员，别贴大段代码和堆栈（需要时放附件/文件路径）。
- **严格区分**：已上线 / 已在真实环境验证 / 已写好未验证 / 计划中。没验证过就写「未验证」，别写「已完成」。
- 发现规格冲突或需要业务判断：直接指出并给出建议，写进 `docs/open-questions.md`，不要自行假定。
- 一批做完就提交推送；每个阶段结束写一段「做了什么 / 验证了什么 / 没验证什么 / 需要你做什么」。
- 联调中发现的真实事实（字段形状、限流、时区）**写回文档**（`docs/schema/mirror-samples.md` 或本手册 §8），下一个会话才不会再踩。
- 动线上数据、发布、删除、发消息等**不可逆或对外**动作，先问 Leyinet，授权只对当次有效。

---

## 11. 常见故障排查

| 现象 | 先看 |
| --- | --- |
| 启动即报「SSPS_STORE=real 需要…」 | 缺 `LARK_APP_ID/SECRET`、`BITABLE_APP_TOKEN`、`BITABLE_TABLE_IDS`，或平台没注入 `DRIZZLE_DATABASE`/`AuthorizationSDK` |
| 登录后所有接口 403 | 用户没有任何 `ssps_*` 角色；或 `roles` 里不是 bizID（调 `ROLE_MAP`）；或部门名对不上（调 `DEPT_MAP`） |
| 写飞书报 `FieldNameNotFound` | 字段名与 Base 不一致；对照 `docs/schema/base-plan.json` 与 `lark/fieldmap.ts` |
| 写飞书报日期无效 | 必须是毫秒时间戳整数，不是字符串 |
| 页面读不到刚保存的数据 | 回写镜像失败 → 查 `write_queue` 状态 `written`，跑 `POST /api/admin/replay` |
| 镜像与飞书不一致 | 先等 6 秒；仍不一致 → 查同步任务状态与 `mirror-columns.md` 列映射 |
| `gen:db-schema` 要 `app_id`/`FORCE_AUTHN_INNERAPI_DOMAIN` | 本机用 `npm run gen:db-schema:local` |
| DDL 报 `Node_DoStmt` 不支持 | 平台 SQL 解析器不支持 `DO $$`，改成静态语句 |
| 日历全是灰色斜线 | 没有当前靠船计划批次，或目标日在批次覆盖期外——这是正确行为，不是 bug |
| 触发器没跑 | 应用没发布 / 触发器没注册 / cron 时区；看应用日志里 `[Jobs]` 行 |
| 云端写的测试在本机失败 | 先 `git pull`；确认 Node 22；PGlite 测试不需要网络 |

---

## 12. 完成定义

一个功能算「完成」，必须同时满足：代码 + 测试 + 在真实环境（本机连飞书/妙搭）走通 + 文档更新 + 向 Leyinet 如实汇报了「验证到哪一步」。云端那种「测试全绿」只算「已写好」。
