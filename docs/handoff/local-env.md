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

## 5D. 阶段 3 前置检查：多维表格连通（2026-11-06）——**已解决：配置多了一个引号**

> **结论（另一个 AI 排查 + 我本机复核，已修复）**：`.env.local` 里 `BITABLE_APP_TOKEN=` 的值开头多了一个双引号（长度 28、首字符是 `"`、无结尾引号），dotenv 只剥成对引号，所以程序把带引号的脏值拼进接口地址，飞书回 91402 NOTEXIST。去掉引号后：应用身份 `GET bitable/v1/apps/{token}` 200，列数据表 28 张（T01–T10 共 11 张的表 ID 与配置逐一对得上，另有 17 张企微历史表），T04 字段 49 个。**应用权限、L3 密级、令牌本身都没问题**，下面的「不通」记录是排查过程，保留作经验。
> 我之前量令牌长度时先用代码削掉了引号，所以第一轮没发现；教训：检查配置值要看**原始文件内容**，不要先清洗再量。
> 修复：已删掉那个引号（只改这一行）。代码侧加了 `server/lark/config.ts`：启动时去空白和成对引号，剩下的单个引号 / 格式不对直接报中文错误（不带值），5 项测试，已提交到平台仓库（本机，未推送）。
> **线上环境变量目前是空的**（5 节第 2 条）；以后用 `+env-set` 设置时值**不要带引号**，设置后用只读方式核对长度。
> 另：另一个 AI 说当前 CLI 里没有 `+env-set`；我这边 `lark-cli apps --help` 能看到 `+env-delete`，`+env-set` 待设置时再核实。

（以下为排查过程记录）

- 本机起 real 模式后端，`/api/health`（管理员）：应用数据库正常，镜像表 m_port 10 / m_berth 23 / m_route_rule 10 正常，m_voyage 0 行（提醒），`DRIVE_FOLDER_TOKEN_BERTH_PLAN` 未配置（提醒）。注意健康检查对飞书凭证只说「环境变量已配置（有效性未检测）」，并没有真连。
- 直接用 `.env.local` 的应用凭证调飞书 OpenAPI（只读）：**取 tenant_access_token 成功**（App ID / Secret 有效）；但 `GET bitable/v1/apps/{BITABLE_APP_TOKEN}` 和 `.../tables` 都返回 **91402 NOTEXIST**；把它当知识库节点查返回 131005 not found。令牌是 27 位、无空格引号，形状正常。
- **Leyinet 核对后（同日）**：Base 地址是 `/base/` 格式，令牌与 `.env.local` 逐字一致；URL 里的表 `tbl5POTzcu79CO66` 就是 T04；文档应用里「德信智慧海运」（= `cli_aa2584bb95f89bef`，与 `.env.local` 的 LARK_APP_ID 一致）**已授予「可管理」权限**。所以「没加应用 / 令牌错」都被排除，原来的猜测作废。仍返回 NOTEXIST 的原因未明；线索：Base 带 **L3 密级标签**，且挂在「刘浩阳」名下目录，2026-11-05 21:36 有过修改。排查提示词见 `docs/handoff/base-connect-diagnose-prompt.md`（交给另一个 AI 只读排查）。
- 原先列的可能原因（已排除 ① 没加应用 ② 令牌抄错）：③ Base 建在别的租户（待排除）。
- 没有往多维表格写任何东西。读接口走镜像库不受影响；**所有写接口（新建航次、修订 ETA 等）在真实模式下会因此失败或进入重试队列**。
- 经验：不要只看 health 的「通过」，凭证和 Base 要用探测脚本真连一次。后续可把「真连一次 Base」加进 health 检查（待办）。

## 5E. 阶段 3 第一次真实写入（2026-11-06）

**做了什么**：本机 real 模式后端 + 管理员身份（请求头手填 `roles=["ssps_admin"]`），新建 1 条航次（合同号 `TEST-联调-001`，备注「【SSPS 联调测试数据，可删除】」，1 行货物「镍矿 1000 吨」）。飞书回读：T04 1 行、T05 1 行，无重复；业务类型、装港 SURIGAO（T01 记录对得上）、卸港 BAHODOPI、总货量、计划抵卸港窗口（按 WITA 写入，2026-12-01～12-03）、备注、数据来源「应用录入」均正确；货物明细关联到该航次。

**测试数据留在哪**（我不自行删除，请 Leyinet 确认后手动清理）：飞书 T04 那 1 行（航次编号 24）、T05 那 1 行（明细编号 8）；开发库 `m_voyage` / `m_cargo` / `write_queue` 各 1 行；线上库会由 8 个 streaming 同步任务同步进来这两行。

**发现并已修复的问题（代码已提交到平台仓库，未推送）**：
1. **飞书新增记录的返回里没有自动编号**（航次/明细/船舶/规则编号）。代码把空值转 `NaN`，首次插镜像库失败 → 接口 500（此时飞书记录已写成功）；同一幂等键重发走队列里存的结果（编号为空），航次 ID 变成 `VY-2026-0000`。修复：新增 `BaseGateway.read`（`records/batch_get`，每批 ≤100）与 `autoNumbers`（返回里没有就读回，读不到返回 null 且**不抛错**——记录已写成功，抛错会让队列重试而重复创建）；航次、货物明细、**新增船舶**、航程规则四处创建都改用。假飞书改为如实模拟，新增 7 项测试；已在真实飞书上验证读回（24 / 8 / 不存在返回 null）。
2. 教训：假飞书想当然带了自动编号，所以 174 项测试全绿却掩盖了真实差异。**以后凡是假飞书的行为，要对照真实飞书验证过再写**。

**发现、尚未修复的问题（需要 Leyinet 决定，见 open-questions）**：
3. **`AuthorizationSDK.members.list` 只返回用户 ID**（字段只有 `avatar, accountKind, userID`），**没有姓名、飞书 user_id（employeeID）、部门**。`role-members.ts` 当初按类型定义猜了这些字段，猜错了。后果：① 飞书「负责业务员」人员字段写不进去（本次那条该字段为空）；② 镜像里负责人显示成平台用户 ID（`1876912250050631`）而不是姓名；③ **业务员 / 部门主管查不到部门 → 全部被拒绝登录**（管理员、物流管理员不受影响）。
4. SDK 的 `search.search({query})` 按**姓名**能查到完整信息（姓名、部门、employeeID、userID），按用户 ID 查不到；按姓名会搜出重名/外部用户，必须再用 userID 精确匹配。Leyinet 的组织架构部门是「系统软件科」（不含大宗/商务海运/仓储物流，所以他如果当业务员会被拒——设计如此，他是管理员所以没影响）。
5. SDK 的应用 ID 取自**请求上下文**，请求之外调用会拼出 `/v1/app//permission/...` 而 404——只能在真实请求里验证，本机探针要挂在请求内（做法：node -r 预加载脚本给 `members.list` 套日志包装，再向本机后端发真实请求）。
6. `members.list` 在有用户身份而平台返回空数据时**静默返回空列表**，不报错。

**本机验证 `AuthorizationSDK` 的结论（回答手册 §8 第 2 条）**：SDK 可用，`members.list(bizID)` 用我们建的角色 ID（`ssps_admin` 等）可以查到成员，`bizID` 就是 `--role-id`；**但返回形状与代码假设不符**（见 3）。`roles` 在请求头里放的是 ID 还是名称仍未确认（本机请求头是手填的）。

## 5F. 用户目录改为「登录时按姓名搜」（2026-11-06，Leyinet 选方案 A，已实现并在真实平台验证）

- 实现：`server/adapters/platform/role-members.ts` 的 `createUserSource`：登录（每个请求的身份解析）时用平台请求头里的姓名调 `AuthorizationSDK.search.search`，**按用户 ID（`userID`/`miaodaUserID`）精确匹配**（排除重名、外部用户），取姓名、部门、飞书企业内 user_id（`employeeID`）并缓存（命中 10 分钟，没查到/失败负缓存 30 秒，同一用户并发只搜一次，重名最多翻 3 页）。没有姓名线索只读缓存；查询失败返回 null 并记 warn 日志，不抛 500，刷新失败时退回旧缓存。`PlatformUserLookup`（显示姓名、写飞书人员字段用的 user_id）只读缓存。
- 真实平台验证（本机后端 + 真实平台，请求头手填 roles）：管理员 `/me` 200、姓名「董金」、`/voyages` 里负责人由数字 ID 变为「董金」；业务员默认部门对照下 403，提示里的部门是真实读到的「系统软件科」；临时把「系统软件科」对照成大宗采购部后，业务员 / 部门主管 `/me` 都 200、部门「大宗采购部」；物流管理员 200、仓储物流部；无角色 403。
- 已知限制（方案 A 的代价）：**别人的姓名要等对方登录过才显示**（重启后缓存清空，需要对方再请求一次）；没登录过的人显示用户 ID，且不能把他设为新航次负责人（查不到他的飞书 user_id 就不写人员字段）。如果以后觉得不够用，升级方案 B（加一张用户目录表，见 open-questions）。
- **第 2 次真实写入（同日，已验证）**：新建航次 `TEST-联调-002`（2 行货物：镍矿 1500、煤 500）。接口 201，返回航次 ID `VY-2026-0025`（与飞书自动编号 25 一致，不再是 0000），负责人显示「董金」；飞书 T04 +1 行、T05 +2 行；**「负责业务员」人员字段已写入**（用 `user_id_type=user_id` 读回是企业内 user_id，姓名「董金」）；两行明细编号 9、10 都读回成功；总货量 2000；计划抵卸港窗口 2026-12-05～07 按 WITA 写入。管理员无部门，所以「所属部门」为空（符合设计）。顺带观察：两行货物时「拼船」自动为「是」（一行货物时是「否」），推测是按货物行数推出，**规则未与 docs/schema 核对**。
- 至此**自动编号读回、用户目录（姓名/部门/飞书 user_id）、人员字段写入**都在真实飞书 + 真实平台上验证过。
- 测试：`platform-directory.spec.ts` 重写为 8 项，用如实模拟真实搜索行为的假 SDK（模糊搜、重名、没有 userID 的外部用户、分页、失败）。全量 192 项，186 通过、0 失败、6 跳过。

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
