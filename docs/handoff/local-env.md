# 本机环境自检记录（2026-11-05，阶段 1 前置检查）

范围：手册 §5.1 的只读检查。没有改线上数据、没有推送、没有发布。不含任何密钥。

## 1. 代码仓现状

- 工作目录：`C:\Users\董金\ssps-miaoda`，分支 `sprint/default`。
- 一次性迁移的「搬运」已完成：60+ 个文件、夹具（`server/test/fixtures/`）、`CLAUDE.md`、`CLAUDE.local.md`、`.gitignore` 增补都已就位；**但全部还是未提交状态**，本地有 1 个领先远端的提交（`77fc32e` 首次合并），远端 `origin/sprint/default` 仍停在 `079300b`（空骨架）。
- **更新（Leyinet 授权后已推送）**：迁移结果已提交为 `24051ff`（79 个文件）并推送到妙搭远端 `sprint/default`，本地与远端一致。推送前 7 项质量门全绿；提交内容已核对无密钥、无 Excel、无 `CLAUDE.local.md`。
- **线上仍是空骨架**：推送不等于发布，`main` 仍是 `f493be7`，没有做 release。
- 迁移收尾时补了两处修正（见 §4）。

## 2. 工具版本

| 项 | 结果 |
| --- | --- |
| Node | v24.18.0（手册要求 22；测试全绿，暂不影响，但线上运行时以平台为准） |
| npm | 11.16.0 |
| lark-cli | 1.0.99，已登录（用户身份），user token 到 **2026-11-06 00:07:57** 过期，无刷新令牌 |
| Git Bash | `C:\Program Files\Git\bin\bash.exe`（用来跑 npm 脚本，见 §4） |

## 3. 质量门（修正后）

| 检查 | 结果 |
| --- | --- |
| `npm test` | 174 项：168 通过、0 失败、6 跳过（跳过的是「夹具与源文件一致」那 6 条，符合预期） |
| `npm run type:check` | 通过 |
| `npx eslint server client/src --quiet` | 通过 |
| `npm run smoke` | 通过（真起 Nest 走完 12 步 HTTP 主线，内存模式） |

## 4. 本次发现并处理的问题

1. **Windows 上 `npm test` 假绿（跑 0 个测试）**。npm 在 Windows 默认用 `cmd.exe` 跑脚本，而平台脚手架的脚本按 bash 写（单引号通配符 `'server/test/*.spec.ts'`、`NODE_ENV=production nest build`），所以通配符没匹配上、`build:server` 也会失败。处理：不改平台脚本，改成**让 npm 用 Git Bash**。每个 PowerShell 会话里先执行：

   ```powershell
   $env:npm_config_script_shell = 'C:\Program Files\Git\bin\bash.exe'
   ```

   或一次性永久设置：`npm config set script-shell "C:\Program Files\Git\bin\bash.exe"`（会影响本机所有项目，所以暂未设置，等 Leyinet 决定）。
2. `package.json` 的 `build:server` 缺 deploy-flow §2 要求的收尾（删除 `dist/server/test`）。已补上。
3. `server/test/permission-matrix.spec.ts` 在 Windows 上因 git 把 LF 转成 CRLF 而失败。已让比较前统一换行符。**文档仓 `app/` 的同名测试没改（冻结备份）**。

4. **`miaoda-deploy.ps1 -Mode push` 忽略了 `-DryRun`**：我用 `-DryRun` 想预览，结果真的提交并推送了（恰好是已获授权的动作，无损失）。以后要预览请先用 `git status` / `git diff --stat`，**不要依赖 push 模式的 `-DryRun`**；该脚本在文档仓里尚未提交，待修。

## 5. 妙搭平台状态（lark-cli 只读查询）

- 应用 `app_17heqwc44fd`（SSPS 智慧发船预测），类型 full_stack，`database` 功能已开通。
- **发布历史：只有 1 次，状态 finished，时间 2026-11-05 约 14:13（北京时间），对应远端 `main` 的 `f493be7`，内容是 `079300b` 空骨架。** 所以「没有任何业务功能上线」属实，但应用本身有一个空壳在线。
- **线上（online）与开发（dev）环境变量均为空**：`SSPS_STORE`、`LARK_APP_ID/SECRET`、`BITABLE_APP_TOKEN`、`BITABLE_TABLE_IDS` 都没设。此时若发布，线上会跑内存演示模式（见 deploy-flow §4）。
- 应用库表：`m_route_rule` 10 行、`m_berth` 23 行、`m_port` 10 行（与手册预期的 T01 10 / T02 23 / T08 10 一致）；`m_vessel`、`m_voyage`、`m_cargo`、`m_bulk_settle`、`m_sales_ext` 均为 0 行；`write_queue`、`sync_log`、`data_issue` 等自有表为 0 行。（行数是平台估算值。）
- 镜像同步：8 个 streaming 任务（T01–T08 → `m_port/m_berth/m_vessel/m_voyage/m_cargo/m_bulk_settle/m_sales_ext/m_route_rule`）状态全部 `active`。
- 平台角色：`+role-list` 返回 0 个，**`ssps_*` 四个角色还没建**。

## 5A. 阶段 1 进展（2026-11-06，已在真实平台验证）

1. **应用库拆成了开发库 + 线上库**（Leyinet 授权，不可逆，`--sync-data`）。原因：单库应用没有 dev 分支，`+env-pull` 报「Multi-environment database is not initialized」，本机拿不到数据库连接。拆分后两库的 `m_port` 10 / `m_berth` 23 / `m_route_rule` 10 / `m_vessel` 0 / `m_voyage` 0 行一致（`+db-table-list` 的 estimated_row_count 是旧估算值，会显示 0，要用 `SELECT count(*)` 核对）。之后改表结构必须先在 dev 库做，再 `+db-env-migrate` 到线上。
2. **开发库里的镜像表是拆分那一刻的快照**，现有 8 个同步任务只写线上库；要在 dev 看到实时数据需另建 dev 环境的同步任务（未做）。
3. `+env-pull` 是**合并写入** `.env.local`：不会冲掉手填的键，会新增 `SUDA_DATABASE_URL`、`SUDA_WEBUSER`、`CLIENT_BASE_PATH`、`FORCE_*`、`MIAODA_*` 等。`SUDA_DATABASE_URL` 会过期（本次的到期时间约 11 月 10 日），过期后重跑 `+env-pull`。
4. **本机能拿到平台注入的数据库连接**（手册 §8 第 4 条，`DRIZZLE_DATABASE` 部分：已验证）。`AuthorizationSDK` 部分未验证（我的账号没有角色，在读成员列表之前就被拒了）。
5. **接口路径要带前缀**：平台把所有路由挂在 `CLIENT_BASE_PATH`（本应用是 `/app/app_17heqwc44fd`）下，即 `/app/app_17heqwc44fd/api/...`；另有 CSRF 双提交校验（cookie `suda-csrf-token` = 请求头 `x-suda-csrf-token`）；身份来自网关注入的请求头 `x-larkgw-suda-webuser`（URL 编码的 JSON，字段 `user_id/tenant_id/app_id/env/roles/user_type/user_name`，本机由 Vite 开发代理按 `SUDA_WEBUSER` 注入）。`roles` 是数组，未分配时为 `[]`（手册 §8 第 1 条：数组形状已确认，元素是 bizID 还是角色名**仍待建角色后确认**）。
6. **`npm run dev` 会改仓库文件**：启动前会联网执行 `miaoda app sync`、`action-plugin init`、`skills sync`，可能改写 `package.json` 脚本。阶段 1 只验证后端，用的是临时启动器（加载 `.env.local` 后直接 `nest start`），没有跑官方 dev 脚本。起前端联调（阶段 7）之前要先想好怎么处理这些同步。
7. **`SSPS_STORE=real` 后端读通**（对开发库，账号无角色）：`/ports` 10 条、`/berths` 23 条、`/route-rules` 10 条、`/vessels` 0 条，与 Base 一致；`/capacity/calendar` 30 天**全部是 `nodata`**（无一天带数值，不会显示成 0%），5 万吨档泊位池 11 / 共 23，与锁定规则一致。
8. **发现一处与设计不一致**（详见 open-questions）：没有任何 `ssps_*` 角色的账号，`/voyages`、`/admin/*`、`/health`、`/me` 正确返回 403，但 `/ports /berths /vessels /route-rules`、`/capacity/calendar`、`/data-issues`、`/berth-plans/batches`、`/inventory`、`/inventory/batches` 返回 200。现在这些表是空的所以暂无泄露，导入真实库存和靠船计划后就会暴露。

## 5B. 角色漏洞修复（2026-11-06，Leyinet 确认先修）

- 新增 `server/common/guards/ssps-role.guard.ts`，在 `PortsModule` 注册为全局守卫：控制器路径以 `api` 开头的接口一律先过身份目录（没登录 401，没有 SSPS 角色 403）；页面路由和平台内部路由不受影响。新增接口默认就被保护，不靠每个控制器自己记得。
- 测试：`server/test/role-guard.spec.ts`（守卫逻辑、控制器路径检查，3 项）；`scripts/smoke.cjs` 新增遍历全部 51 个接口的检查（真起 Nest）。**tsx 不生成装饰器元数据，所以真起 Nest 的测试只能放在冒烟里，不能放在 `npm test` 里。**
- 反向验证：关掉守卫，28 个接口漏网；打开后 51 个接口「没角色」全 403、「没登录」全 401。
- 真实环境复测（开发库，无角色账号）：之前漏网的 `ports/berths/vessels/route-rules`、`capacity/calendar`、`capacity/day`、`data-issues`、`berth-plans/batches`、`inventory`、`inventory/batches` 全部 403。
- 顺带修了一个与本改动无关、但今天零点后才暴露的测试：`issue-scan.spec.ts` 里「ETA 超期未更新」的真实仓储版把「建航次那天」写死成 2026-11-05（真实仓储取行创建时间 = 运行当天），换一天跑就红。已改成从航次实际日期往后推。**以后写测试不要依赖系统当天日期。**
- 质量门：`npm test` 177 项（171 通过、0 失败、6 跳过）、类型检查、eslint、冒烟全绿。**代码改动还没提交、没推送。**
- 页面路由在本机返回 500，是因为 `dist/client/index.html` 还没构建（前端未构建），与守卫无关（守卫拦的话是 403）；阶段 7 处理。

## 5C. 平台角色已建（2026-11-06）

- 在 `app_17heqwc44fd` 用 `lark-cli apps +role-create --role-id ... --name ...` 建了 4 个角色：`ssps_salesman`（业务员）、`ssps_manager`（部门主管）、`ssps_logistics`（物流管理员）、`ssps_admin`（系统管理员）。`role_id` 直接用代码约定的 ID，名称用中文；`+role-list` 回读 total=4。**还没分配任何成员**。
- Leyinet 确认：业务线不建角色，靠飞书组织架构部门识别；物资备件的业务员属于商务海运部。
- Leyinet 的账号已加入 `ssps_admin`（`+role-member-list` 回读确认）。**异常：`+role-match-list` 显示该账号同时命中 `ssps_salesman`，但 `ssps_salesman` 的成员列表是空的**，原因未明（可能是应用所有者/创建者的隐含命中，也可能是任意账号都会命中），需要用另一个无角色账号对照。若是任意账号都命中，「没有角色就 403」的保护会失效，必须查清。
- 本机模拟验证（连开发库，请求头里手填 roles）：`["ssps_admin"]` → `/me` 200，角色「系统管理员」，`/ports` `/voyages` `/health` 均 200；`[]` → 403「没有 SSPS 角色」；`["系统管理员"]`（中文名）→ 403，说明代码只认角色 ID；`["ssps_salesman"]` → 403「无法确定所属部门」（因为该角色没有成员，符合预期）。**网关真实传的是 ID 还是中文名仍未确认**——本机 `SUDA_WEBUSER` 里的 roles 是拉取时的静态样本（分配后重新 `+env-pull` 仍是 `[]`），只有线上请求才能看到真实值。
- 注意：用管理员 PowerShell（路径 `C:\Windows\system32`）跑 lark-cli 会报 `dpop_key_missing`——登录密钥存在普通账号的密钥库里，管理员窗口读不到。请在普通窗口运行。
- 未验证：角色是否 dev / 线上共用（`+role-*` 命令没有环境参数，推测共用，分配成员后用线上身份验证）。

## 5D. 阶段 3 前置检查：多维表格连通（2026-11-06）——**不通，阻塞写入**

- 本机起 real 模式后端，`/api/health`（管理员）：应用数据库正常，镜像表 m_port 10 / m_berth 23 / m_route_rule 10 正常，m_voyage 0 行（提醒），`DRIVE_FOLDER_TOKEN_BERTH_PLAN` 未配置（提醒）。注意健康检查对飞书凭证只说「环境变量已配置（有效性未检测）」，并没有真连。
- 直接用 `.env.local` 的应用凭证调飞书 OpenAPI（只读）：**取 tenant_access_token 成功**（App ID / Secret 有效）；但 `GET bitable/v1/apps/{BITABLE_APP_TOKEN}` 和 `.../tables` 都返回 **91402 NOTEXIST**；把它当知识库节点查返回 131005 not found。令牌是 27 位、无空格引号，形状正常。
- **Leyinet 核对后（同日）**：Base 地址是 `/base/` 格式，令牌与 `.env.local` 逐字一致；URL 里的表 `tbl5POTzcu79CO66` 就是 T04；文档应用里「德信智慧海运」（= `cli_aa2584bb95f89bef`，与 `.env.local` 的 LARK_APP_ID 一致）**已授予「可管理」权限**。所以「没加应用 / 令牌错」都被排除，原来的猜测作废。仍返回 NOTEXIST 的原因未明；线索：Base 带 **L3 密级标签**，且挂在「刘浩阳」名下目录，2026-11-05 21:36 有过修改。排查提示词见 `docs/handoff/base-connect-diagnose-prompt.md`（交给另一个 AI 只读排查）。
- 原先列的可能原因（已排除 ① 没加应用 ② 令牌抄错）：③ Base 建在别的租户（待排除）。
- 没有往多维表格写任何东西。读接口走镜像库不受影响；**所有写接口（新建航次、修订 ETA 等）在真实模式下会因此失败或进入重试队列**。
- 经验：不要只看 health 的「通过」，凭证和 Base 要用探测脚本真连一次。后续可把「真连一次 Base」加进 health 检查（待办）。

## 6. 尚未验证（留给阶段 1 后续步骤）

- `AuthorizationSDK` 是否可用、`members.list` 返回形状（手册 §8 第 2 条）：要先建角色并分配成员。
- 前端页面在妙搭 AppContainer 里的表现（阶段 7）。
- 同步延迟（约 6 秒）和同步内容与 Base 是否逐行一致（只核对了任务状态和估算行数）。
- 建 4 个平台角色并分配成员（阶段 2）。

## 7. 需要 Leyinet 提供 / 决定

1. 批准把迁移结果提交并推送到 `sprint/default`（推送不等于上线）。
2. 重置后的 App Secret（旧值视为已泄露）。
3. `BITABLE_APP_TOKEN` 与 `BITABLE_TABLE_IDS`（表 ID 见 `docs/schema/base-build-report-2026-11-05.md`，app_token 需要确认）。
4. 是否永久设置 npm 的 `script-shell`（§4 第 1 条）。
5. 四个测试账号、云空间文件夹 token（阶段 2、5 才需要）。
