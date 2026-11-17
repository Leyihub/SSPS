**SSPS 测试专项只读审计（06-tests）**

审计日期：2026-11-06（Asia/Shanghai）。审计代码为 C:/Users/董金/ssps-miaoda，分支 sprint/default，提交 bcdc8b53368838e5c175bb2af6699b89e9667a19。规格仓为 C:/Users/董金/WorkBuddy/SSPS；冻结的 app/ 不作为审计对象。当前没有功能上线，本报告不将本地推断写成真实环境故障。

本轮覆盖全部 29 个顶层 spec、helpers、fixtures、冒烟脚本、lint 脚本、提交钩子和部署脚本的质量门；为解释覆盖缺口，追踪了相关业务调用点。确认 6 项缺陷（1 项 P0、5 项 P1），另列 4 项 P1 风险。P0 是默认业务日期造成 15 天分流错误。未修改业务代码或测试。

**1．执行结果与复现环境。** 原始命令与补充验证须分开看：Windows 默认 npm 脚本环境下，测试出现假绿、冒烟启动失败；指定本机 Git Bash 后，源码不变，测试和冒烟均可运行。

| 命令 | 条件 | 退出码 | 实际结果 |
|---|---|---:|---|
| npm test | Windows 默认 npm 脚本解释器 | 0 | tests 0、pass 0、skipped 0；不是测试通过 |
| npm run type:check | Windows 默认 npm 脚本解释器 | 0 | 服务端、客户端检查均通过 |
| npx eslint server client/src --quiet | Windows 默认环境；离线使用已安装依赖 | 0 | 无错误输出 |
| npm run smoke | Windows 默认 npm 脚本解释器 | 1 | NODE_ENV 不被识别，尚未执行 Nest 构建与 HTTP 冒烟 |
| npm test，第 1 遍 | npm_config_script_shell 指向 C:/Program Files/Git/bin/bash.exe | 0 | tests 192、pass 186、skipped 6、fail 0；约 16.99 秒 |
| npm test，第 2 遍 | 同上，不改源码、不改系统时间 | 0 | tests 192、pass 186、skipped 6、fail 0；约 16.87 秒 |
| npm run smoke | 同上 | 0 | SWC 编译 145 个文件；HTTP 主线通过；51 个接口无角色全部 403、未登录全部 401 |

与预期“168 通过 + 6 跳过”不同。当前有效执行结果是“186 通过 + 6 跳过”，不是失败 18 条，也不是擅自取消跳过。最近提交涉及角色守卫、配置清洗、身份目录和自动编号测试；交接材料的计数不能继续充当当前测试基线。六条跳过均为 [fixtures-in-sync.spec.ts:8](C:/Users/董金/ssps-miaoda/server/test/fixtures-in-sync.spec.ts:8) 中的夹具与源文件一致性检查，原因与原要求一致。

为保持代码仓只读，验证副本位于 C:/Users/董金/AppData/Local/Temp/ssps-audit-20261106-3055c966。复制了 399 个受审源码、夹具、配置文件；未复制 .env、.env.local、.npmrc、平台元数据或原始 Excel，未安装依赖；node_modules 仅以目录联接供读取。构建产物、TypeScript 缓存和日志写入副本。子进程移除了飞书、Base、平台数据库、SSPS 模式等相关环境配置，设置 SSPS_STORE=memory、npm_config_offline=true。未执行 lark-cli、开发服务、部署脚本、提交钩子、git 写操作或任何真实业务接口。

环境为 Node v24.18.0、npm 11.16.0、已安装 PGlite 0.2.17。仓库 engines 允许 Node >=22；本次不声称已在 Node 22 或平台运行时验证。安全检查依据为测试中的注入请求、[testDb:11](C:/Users/董金/ssps-miaoda/server/test/helpers/pg.ts:11)、[smoke:11](C:/Users/董金/ssps-miaoda/scripts/smoke.cjs:11) 与 [LarkModule:25](C:/Users/董金/ssps-miaoda/server/lark/lark.module.ts:25)。冒烟只请求本机临时端口。

执行证据保存在上述副本的 audit-test-1.log、audit-types.log、audit-eslint.log、audit-smoke.log、audit-test-bash-1.log、audit-test-bash-2.log、audit-smoke-bash.log。日志不是新的业务测试或代码修改。

收尾核对：399 个受审文件的 SHA-256 与执行前清单全部一致，代码仓 git status --porcelain 为空；报告 156 个本地链接均可定位，29 个 spec 均已登记。

**2．确认的缺陷。** “静态推演”表示输入和输出由已读代码确定，本轮没有为此新增测试、修改时钟或执行禁止命令。

**D01｜P0｜默认“今天”取 UTC 日期，导致 IMIP 凌晨的 15 天分流错误；现有固定日期测试绕过此路径。**

- 位置：[LiveSnapshot:17](C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts:17)、[实际装配:54](C:/Users/董金/ssps-miaoda/server/modules/ports/ports.module.ts:54)、[分流判断:44](C:/Users/董金/ssps-miaoda/server/engine/capacity.ts:44)；相关测试为 [master-service:31](C:/Users/董金/ssps-miaoda/server/test/master-service.spec.ts:31)、[rules:38](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:38)。[当前用户接口:47](C:/Users/董金/ssps-miaoda/server/modules/master/master.service.ts:47) 也直接取 UTC 日期。
- 代码事实：默认 today 是 new Date().toISOString().slice(0, 10)；装配时没有传业务时区日期函数；分流直接比较目标日与该日期的日数差。测试给 LiveSnapshot 传固定日期，或直接向引擎传 today，未覆盖默认业务时钟。
- 冲突：规则 4（按目标到港日距今分流）、规则 9 的日期边界要求；[交接手册:160](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:160) 明确 IMIP 当地时间为 WITA、UTC+8。
- 触发场景（静态推演）：实际瞬间为 2026-11-05T16:30:00Z，即 WITA 2026-11-06 00:30；目标到港日为 2026-11-21。
- 实际：快照 today=2026-11-05，日差 16，返回 density 路径。
- 期望：业务 today=2026-11-06，日差 15，返回 cmr 路径。同一组数据会被错误地选择数据源和排序口径，足以产生错误业务结论。
- 建议：以明确的 IMIP 业务日期统一快照与 /api/me，并增加默认时钟到服务接口的边界测试。Asia/Jakarta 与 WITA 不是同一时区；不要把所有“印尼时间”统一替换为 Jakarta。

**D02｜P1｜Windows 默认 npm test 执行零条测试却返回成功。**

- 位置：[package.json:32](C:/Users/董金/ssps-miaoda/package.json:32)、[质量门调用:242](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:242)、[只检查退出码:264](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:264)。
- 代码事实：测试 glob 被单引号包住；当前 Windows 默认脚本环境没有按预期匹配它。执行结果为 tests 0、退出码 0。部署质量门只判断退出码，不检查测试是否被发现。
- 冲突：[交接手册:102](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:102) 的测试质量门，以及用户要求的有效测试执行基线。
- 复现：本次 Windows 环境中对未改动副本运行 npm test。
- 实际：0 条测试，质量门可据退出码记为成功。
- 期望：发现全部目标 spec 并执行；零测试必须失败。指定 Git Bash 后执行到 192 条，证实差异在命令入口，不是文件不存在。
- 建议：采用跨平台的测试文件发现入口，并使“未发现测试”返回非零；不要只把当前通过计数硬编码为唯一判据。

**D03｜P1｜标准 npm run smoke 在 Windows 默认环境无法启动。**

- 位置：[package.json:18](C:/Users/董金/ssps-miaoda/package.json:18)、[smoke 脚本入口:31](C:/Users/董金/ssps-miaoda/package.json:31)。
- 代码事实：build:server 用 POSIX 风格的 NODE_ENV=production 前缀赋值。
- 冲突：[交接手册命令速查:226](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:226) 与本轮要求的本机冒烟验证。
- 复现：Windows 默认 npm 脚本解释器下执行 npm run smoke。
- 实际：退出码 1，报 NODE_ENV 不被识别；没有执行 HTTP 主线。
- 期望：在规定的本机环境完成构建和冒烟，业务断言失败时再返回非零。
- 限定：部署脚本第六门采用 PowerShell 设置环境变量后直接调用 nest build，因此不能据此声称“部署脚本第六门也必然同样失败”。

**D04｜P1｜冒烟依赖真实日期，固定的 2026-12-01 预测窗口会自然过期。**

- 位置：[smoke:27](C:/Users/董金/ssps-miaoda/scripts/smoke.cjs:27)、[smoke:32](C:/Users/董金/ssps-miaoda/scripts/smoke.cjs:32)、[真实默认日期:17](C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts:17)、[过期窗口校验:59](C:/Users/董金/ssps-miaoda/server/engine/recommend.ts:59)、[服务转为 422:39](C:/Users/董金/ssps-miaoda/server/modules/prediction/prediction.service.ts:39)。
- 代码事实：冒烟使用默认 LiveSnapshot，预测输入却固定 winStart=2026-12-01，并断言返回 status=ok。
- 冲突：测试专项的日期稳定性要求，以及 [交接手册:102](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:102) 的可重复质量门。
- 触发场景（静态推演）：默认快照日期到达 2026-12-02，代码与数据均不变，执行冒烟。
- 实际：预测被“窗口始不得早于今天”拒绝，随后 status=ok 的断言失败。
- 期望：测试以受控业务时钟构造一致的输入，不因日历推进而从绿变红。
- 本轮两遍单元测试均在同一天执行，不能用它们证明未来日期下冒烟稳定；未修改系统时间。

**D05｜P1｜稀疏 Plan B 的 30% 门槛用例无法检出门槛回归。**

- 位置：[rules.spec.ts:84](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:84)、[配置窗口长度:5](C:/Users/董金/ssps-miaoda/server/config.ts:5)、[B 不重叠约束:126](C:/Users/董金/ssps-miaoda/server/engine/recommend.ts:126)。
- 代码事实：用例的查询区间为 d(10)–d(14)，共 5 天；候选窗口长 3 天，起点只能是 10、11、12；两个候选起点差最大为 2，始终不能满足不重叠所需的差值 3。
- 冲突：规则 5；测试标题声称保护“稀疏候选仍要求有数据的天余量 >=30%”。
- 触发场景（静态推演）：假设稀疏 B 选取路径遗漏资格门槛，其他逻辑不变，仍运行当前 tight 用例。
- 实际：B 仍是 null，断言继续通过，原因是没有不重叠窗口，未触及 30% 判断。
- 期望：构造至少两个可分离候选；让 B 已知天最小余量分别为 29% 和 30%，断言前者无 B、后者有低可信 B。门槛被删除时，29% 用例必须失败。
- 未执行代码变异；这是对现有输入几何约束的确定推导。

**D06｜P1｜假飞书批量写入不具备规格所述的整批原子性。**

- 位置：[FakeBase.create:42](C:/Users/董金/ssps-miaoda/server/test/helpers/fake-base.ts:42)、[FakeBase.update:58](C:/Users/董金/ssps-miaoda/server/test/helpers/fake-base.ts:58)。
- 代码事实：create 在 records.map 中逐条校验并立即写 Map；update 同样逐条、逐字段直接修改现有记录。后面的记录/字段报错时，前面的修改已经保留。
- 冲突：[实施计划:60](C:/Users/董金/WorkBuddy/SSPS/docs/implementation-plan.md:60) 规定的批量增删改每次 <=500、整批成功或失败；[交接手册:242](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:242) 要求假飞书复现真实行为。
- 触发场景（静态推演）：同一 create 批次先传一条合法记录，再传一条含不存在字段的记录；或同一 update 批次先合法更新 A，再更新不存在的 B。
- 实际：方法抛错，但第一条记录已经创建/修改；重试可能在测试中形成真实整批失败时不会发生的状态。
- 期望：校验整批后再提交；任一记录非法时表数据和编号状态按所模拟的接口契约处理，不能留下前半批业务记录。
- 限定：这是测试替身缺陷，不是已经证明真实飞书存在半批提交。

**3．已确认的覆盖风险及证据边界。** 下列风险不等同于已经复现的数据泄露、重复写入或部署故障。

**R01｜P1 风险｜数据库权限、真实角色与完整 DDL 没有被 PGlite 用例验证。**

证据：[pg.ts:13](C:/Users/董金/ssps-miaoda/server/test/helpers/pg.ts:13) 自建简化复合类型；[pg.ts:14](C:/Users/董金/ssps-miaoda/server/test/helpers/pg.ts:14) 删除 RLS/policy；[pg.ts:21](C:/Users/董金/ssps-miaoda/server/test/helpers/pg.ts:21) 只追加 004；[pg.ts:24](C:/Users/董金/ssps-miaoda/server/test/helpers/pg.ts:24) 自行拼镜像 DDL。002/003 分别见 [自有表匿名收紧](C:/Users/董金/ssps-miaoda/db/002-restrict-anon-read.sql:1)、[镜像匿名收紧](C:/Users/董金/ssps-miaoda/db/003-restrict-anon-read-mirror.sql:1)。

对照 [交接手册:85](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:85) 的 001–004 及匿名权限要求，测试存在确定缺口：输入“001/004 正确，但 002/003 未应用或某条 policy 回归”时，当前 suite 不读取这两个文件，测试结果不会因该权限变化而改变；期望是匿名访问/越权访问对应测试失败。是否存在真实权限错误尚缺隔离 PostgreSQL 中的角色、session user_id、完整迁移链与非 owner 连接实测，本轮不连接真实库。

**R02｜P1 风险｜“Drizzle 已测”没有覆盖完整的预测采纳写链路、多实例幂等和跨 chunk 回滚。**

- [drizzle-stores:18](C:/Users/董金/ssps-miaoda/server/test/drizzle-stores.spec.ts:18) 的预测存储是 Drizzle，但 VoyageService 使用 MemoryVoyageStore；[master-service:27](C:/Users/董金/ssps-miaoda/server/test/master-service.spec.ts:27) 的 drizzle 模式只切主数据，航次和预测仍是内存。因此“采纳会写真实航次仓储”没有由这些用例证明。
- [幂等服务测试:178](C:/Users/董金/ssps-miaoda/server/test/voyage-service.spec.ts:178) 是先 await 第一次，再 await 第二次；[持久队列测试:141](C:/Users/董金/ssps-miaoda/server/test/drizzle-stores.spec.ts:141) 只建一个 outbox。没有两个 outbox/两个连接同时争用同一键的行为测试。
- [drizzle-stores:85](C:/Users/董金/ssps-miaoda/server/test/drizzle-stores.spec.ts:85) 标题为“写到一半失败”，实际复制旧批次号并在第一条批次 INSERT 就失败；[实际写入顺序:26](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:26) 证明此时尚未进入明细 chunk。它验证重复号拒绝后旧数据不变，未验证第 501 行失败时前 500 行回滚。
- 对照 K09 的唯一入口、[交接写链路:151](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:151) 和 [写接口测试要求:241](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:241)：输入“第二 chunk 失败”“两个实例同时提交同键”“飞书已提交而响应丢失”，现有测试没有相应行为判据；期望分别为全批回滚、只产生一份业务写入、重试可核对已写结果。
- 这些生产后果属疑似影响，缺多连接竞争、提交后丢响应和完整真实适配器组合的故障注入证据；不能仅凭缺测试断言当前实现一定重复写。

**R03｜P1 风险｜本机提交钩子未安装，且现有钩子即使安装也不是完整 push 质量门。**

证据：[pre-commit:2](C:/Users/董金/ssps-miaoda/.githooks/pre-commit:2) 支持 SKIP_GIT_HOOKS=1；[run-precommit:22](C:/Users/董金/ssps-miaoda/scripts/hooks/run-precommit.js:22) 只调用 npm run lint；[lint:98](C:/Users/董金/ssps-miaoda/scripts/lint.js:98) 只有 eslint、type:check 及条件 stylelint；[部署绕过开关:240](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:240) 可跳过全部七门。

只读检查结果：git config --get core.hooksPath 无值、退出码 1；.git/hooks 中只有 sample，没有生效的 pre-commit/pre-push。对照 [交接手册:102](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md:102)，输入“仅单元测试失败、类型与 lint 正常，走普通提交/直接 push 而不调用部署脚本”时，本仓库可见的本机机制不会运行单元测试。期望受保护的推送必须有完整质量门结果。未执行提交或 push，也未核实远端分支保护，因此不能断言服务器端一定接受该推送。

**R04｜P1 风险｜七项检查先于 pull --rebase，最终推送的代码可能没有经过这些检查。**

证据：[部署检查顺序:280](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:280)、[随后 rebase:296](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:296)、[直接 push:301](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:301)。失败时退出的分支本身存在，问题是成功检查绑定的源码版本。

对照提交前全绿标准：输入“本地版本 L 全绿，远端新增 R，R 与 L rebase 无冲突但组合后破坏接口类型或业务断言”。静态控制流输出为先检查 L，再形成 L+R，之后直接 push；期望检查最终待推送的 L+R。是否出现实际组合失败还缺双工作副本的隔离复现；本轮禁止执行 pull/rebase/push，未模拟该 Git 流程。

**4．测试真实性与适配器覆盖。** 下表登记全部 spec；“Drizzle”均指 PGlite 加本地替身，不代表平台 PostgreSQL 或真实飞书。

| 测试文件 | 覆盖内容与实际依赖 |
|---|---|
| [domain](C:/Users/董金/ssps-miaoda/server/test/domain.spec.ts:8)、[rules](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:17)、[real-berths](C:/Users/董金/ssps-miaoda/server/test/real-berths.spec.ts:12) | 独立手算断言：状态、日期、航程规则、CMR、边界分流、Plan A/B、库存；真实泊位元数据夹具。 |
| [parity](C:/Users/董金/ssps-miaoda/server/test/parity.spec.ts:39)、[provenance](C:/Users/董金/ssps-miaoda/server/test/provenance.spec.ts:15) | 原型 VM 对照、序列化及 S1 与引擎的关系断言；无数据库。 |
| [nlp](C:/Users/董金/ssps-miaoda/server/test/nlp.spec.ts:21) | 原型样例对照、独立货量/航线/跨年断言。 |
| [prediction-service](C:/Users/董金/ssps-miaoda/server/test/prediction-service.spec.ts:26) | 预测、文案、采纳、日历、库存接口服务；全部内存。 |
| [voyage-service](C:/Users/董金/ssps-miaoda/server/test/voyage-service.spec.ts:29) | 同套用例跑 memory 与 Drizzle 航次仓储；身份目录仍为内存。 |
| [master-service](C:/Users/董金/ssps-miaoda/server/test/master-service.spec.ts:25) | 主数据两种适配器；航次与预测存储仍为内存。 |
| [drizzle-stores](C:/Users/董金/ssps-miaoda/server/test/drizzle-stores.spec.ts:16) | Drizzle 预测、导入、日志、自检、outbox 的专项验证；相关业务依赖混用内存。 |
| [drizzle-voyage](C:/Users/董金/ssps-miaoda/server/test/drizzle-voyage.spec.ts:26) | Drizzle 航次+主数据、字段映射、失败重试、回写故障与先同步后回写；假飞书。 |
| [imports-service](C:/Users/董金/ssps-miaoda/server/test/imports-service.spec.ts:19)、[importers](C:/Users/董金/ssps-miaoda/server/test/importers.spec.ts:11) | 内存服务联动、靠船计划/库存清洗和迁移规则；部分仓储场景另由 drizzle-stores 覆盖。 |
| [compat](C:/Users/董金/ssps-miaoda/server/test/compat.spec.ts:17) | 内存航次/主数据、FakeBase；整表刷新、dirty、列格式与权限。 |
| [issue-scan](C:/Users/董金/ssps-miaoda/server/test/issue-scan.spec.ts:16) | memory/Drizzle 两种航次与主数据组合；身份为直接构造 actor/桩。 |
| [lark](C:/Users/董金/ssps-miaoda/server/test/lark.spec.ts:10)、[drive-pull](C:/Users/董金/ssps-miaoda/server/test/drive-pull.spec.ts:17) | 注入假 fetch，测试认证缓存、队列、部分 HTTP 错误、分页与云空间；拉取服务使用内存仓储。 |
| [autonumber](C:/Users/董金/ssps-miaoda/server/test/autonumber.spec.ts:16)、[lark-config](C:/Users/董金/ssps-miaoda/server/test/lark-config.spec.ts:8) | 自动编号延迟/失败读回、配置格式与错误脱敏；假网关与虚构凭证。 |
| [permissions](C:/Users/董金/ssps-miaoda/server/test/permissions.spec.ts:10)、[permission-matrix](C:/Users/董金/ssps-miaoda/server/test/permission-matrix.spec.ts:7) | 独立权限行为断言，以及由权限实现生成的矩阵一致性。 |
| [platform-directory](C:/Users/董金/ssps-miaoda/server/test/platform-directory.spec.ts:11)、[role-guard](C:/Users/董金/ssps-miaoda/server/test/role-guard.spec.ts:28) | 假平台搜索分页/身份缓存/拒绝；守卫及人工登记模块的路由元数据。 |
| [admin-service](C:/Users/董金/ssps-miaoda/server/test/admin-service.spec.ts:16)、[jobs-automation](C:/Users/董金/ssps-miaoda/server/test/jobs-automation.spec.ts:18) | 内存日志/自检/补偿入口；装饰器注册元数据和服务调用桩。 |
| [migrate-plan](C:/Users/董金/ssps-miaoda/server/test/migrate-plan.spec.ts:30)、[xlsx](C:/Users/董金/ssps-miaoda/server/test/xlsx.spec.ts:15)、[security](C:/Users/董金/ssps-miaoda/server/test/security.spec.ts:10) | 虚构迁移数据、内存生成 XLSX、CSV 注入/压缩炸弹/异常响应；无原始企微 Excel。 |
| [fixtures-in-sync](C:/Users/董金/ssps-miaoda/server/test/fixtures-in-sync.spec.ts:8) | 六对源文件检查在当前平台仓跳过；本轮另做只读源文件比较。 |

严格说，主数据、航次、数据问题扫描已有两种适配器测试，不能统称“全都只测内存”。但预测服务整套异常/库存/S1 场景、容量服务、兼容表服务、云空间拉取到业务落库以及管理服务，没有整套真实适配器等价运行。当前也没有通过真实 AppModule/PlatformModule 的完整身份与数据库装配测试；冒烟自行构造 Root，只导入业务模块。

PGlite 是 WASM PostgreSQL，并非仅仅用数组模拟 SQL；当前往返、唯一约束、事务测试有价值。限制主要来自本项目的夹具裁剪和运行形态：

| 维度 | 当前做法 | 尚不能证明的行为 |
|---|---|---|
| RLS / 数据库角色 | 删除 RLS、policy；不跑 002/003 | anon/authenticated/service_role 权限、会话用户、owner 绕过与真实连接角色。 |
| 平台类型 / 扩展 | 手建简化 user_profile/file_attachment，普通 UUID 默认能运行 | 平台复合类型字段、权限与扩展安装条件；不能把本地函数存在当作平台扩展已配置。 |
| 镜像约束 | 从 schema.ts 拼列，只额外处理 id、base_record_id、审计时间 | 同步建表后的完整默认值、NOT NULL、外键、索引、RLS 和列编码。 |
| 驱动 / 并发 | drizzle-orm/pglite；一个用例通常一个内存实例 | 平台驱动参数/返回、连接池会话变量、多连接锁竞争、进程重启。Promise.all 不等同于两个平台连接。 |
| 时区 | 字面值与 +08 往返样例；未切换 session TimeZone | 业务“今天”、UTC 换日、跨年默认时钟，以及 PostgreSQL session 时区与驱动组合。 |
| 排序规则 | 未显式配置/断言 collation | 平台 locale 下中文、大小写、重音、NULL 和相同排序键的稳定分页。 |

**5．原型对照、夹具与断言质量。** 对照不是字面上的“同一个函数调用两遍”，但也不是独立业务验收。

[parity:8](C:/Users/董金/ssps-miaoda/server/test/parity.spec.ts:8) 导入生产引擎，另在 VM 加载 [夹具 engine.js](C:/Users/董金/ssps-miaoda/server/test/fixtures/prototype/engine.js:6)，两条执行路径是分开的。它能检出只改后端而未改基准造成的回归。12 个显式场景之外，还有 4 种货量×3 种缓冲、5 档日历、45 天日明细、库存曲线与文案对照；不能只按“5 条 parity test”理解其输入数。

本轮将六份夹具与文档仓现有源文件逐一读取比较，字节与统一换行后的文本均一致。当前未发现夹具已经落后源文件；平台仓六条跳过也不等于“夹具错误”。但是原型与后端容量/推荐算法结构相近、使用同一份虚构数据，且说明要求有意改动同时改两边，两边共有的业务误解仍会通过；规则正确性应由 [rules](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:1)、[domain](C:/Users/董金/ssps-miaoda/server/test/domain.spec.ts:14) 等独立期望值补充。

原型数据固定在 2026-11-04，NLP 原型还含以 11/12 月为基准的日期规则。生产 NLP 有独立跨年断言，因此不能把原型日期假设自动当成生产缺陷。对照基准也包含 docs/open-questions 中的暂定值，不能用“与原型一致”把它们升级为已确认业务规则。

断言质量的具体情况：

| 位置 | 事实 | 判断 |
|---|---|---|
| [nlp:27](C:/Users/董金/ssps-miaoda/server/test/nlp.spec.ts:27) | alt.length >= 0 | 恒真，不能保证歧义时存在候选；应在业务确定应有候选的输入上断言内容。P2 改进。 |
| [drizzle-stores:85](C:/Users/董金/ssps-miaoda/server/test/drizzle-stores.spec.ts:85) | 重复批次号在首条 INSERT 失败 | 不是“半批失败”证据，见 R02。 |
| [drizzle-voyage:86](C:/Users/董金/ssps-miaoda/server/test/drizzle-voyage.spec.ts:86) | 标题含“销售扩展”，主体检验 T06、货物隔离，没有 T07 断言 | T07 在 voyage-service 中另有正向用例；不能把此条当成销售扩展失败重试覆盖。 |
| [prediction-service:138](C:/Users/董金/ssps-miaoda/server/test/prediction-service.spec.ts:138) | p80 > 0，latest 只在 so 非空时校验 | 验证关系而非精确航程/断料期望；应增加独立输入的精确值。P2 改进。 |
| [parity clean:20](C:/Users/董金/ssps-miaoda/server/test/parity.spec.ts:20) | 刻意删除运行编号、运行人、时间 | 合理排除原型占位值；这些字段须由服务/持久化测试另验，不是完整记录等价。 |
| [permission-matrix:12](C:/Users/董金/ssps-miaoda/server/test/permission-matrix.spec.ts:12) | 权限文档由同一实现生成后比较 | 证明文档与实现一致，不独立证明权限规则正确；permissions、voyage-service 的拒绝断言才是业务约束。 |
| [lark:79](C:/Users/董金/ssps-miaoda/server/test/lark.spec.ts:79) | 测试 shouldApplySync 比较器 | 全仓仅找到定义与测试引用，无生产调用；不能据该绿灯声称 streaming 已防覆盖。交接手册也明确暂不做同步防覆盖，不将此设计取舍直接判为缺陷。 |
| [jobs:18](C:/Users/董金/ssps-miaoda/server/test/jobs-automation.spec.ts:18) | 只检查本进程注册元数据、cron 五段和服务桩 | 不证明平台成功注册、调用鉴权、真实 cron 时区或去重执行。 |
| [smoke:12](C:/Users/董金/ssps-miaoda/scripts/smoke.cjs:12)、[role-guard:48](C:/Users/董金/ssps-miaoda/server/test/role-guard.spec.ts:48) | 手工枚举业务模块 | 当前 51 个已登记接口均已检查；未来新模块若只加到 AppModule，可能不被枚举。属于覆盖维护风险，未发现当前已有遗漏接口。 |

没有发现 Jest/node:test 快照文件、快照更新命令或“自动接受新快照”机制；JSON.stringify 比较与内存快照不是自动更新快照。六份复制夹具有当前一致性证据，但未来更新是否绕过业务审阅，无法仅凭现有代码判断，未作此指控。

**6．飞书 mock 的真实性。** 分页、限流和字段格式并非完全没人测试，但覆盖范围明显小于真实接口契约。

- [lark:38](C:/Users/董金/ssps-miaoda/server/test/lark.spec.ts:38) 覆盖读 500/500/120、写 1200 条、HTTP 429、字段业务错误；[queue:22](C:/Users/董金/ssps-miaoda/server/test/lark.spec.ts:22) 覆盖串行与 2/4/8/16 秒重试上限。分页桩按调用次数返回页，不依据 page_token 校验请求，断言只确认存在 p2；不能证明每一页游标和记录唯一性都正确，也未逐批精确断言大小。
- 该 Bitable 用例标题含“限流码重试”，实际注入的是 HTTP 429，没有对三种配置错误码分别注入。云空间测试另覆盖了一种限流码，不等于 Bitable 对所有代码的重试已经验证。
- [FakeBase:11](C:/Users/董金/ssps-miaoda/server/test/helpers/fake-base.ts:11) 认真校验字段名、毫秒日期、关联数组、人员形状和部分枚举，且新增不返回自动编号；[autonumber](C:/Users/董金/ssps-miaoda/server/test/autonumber.spec.ts:28) 有延迟及读回失败用例。这些保护是真实存在的。
- FakeBase 实现的是 BaseGateway，绕过 HTTP、鉴权、请求体/响应封装、分页和限流；关联只检验 rec 前缀，人员只检验 id 为字符串，没有验证真实目标记录/用户存在。网关到 HTTP 的集成仍缺保护。
- 未见提交成功后连接断开、HTTP 5xx/非 JSON、读分页限流恢复、认证失效刷新、限流头等待策略等组合测试；未证明一定有实现缺陷。
- [platform-directory](C:/Users/董金/ssps-miaoda/server/test/platform-directory.spec.ts:48) 已测三页搜索、重名精确 ID 匹配、缓存及并发合并；它仍是自行构造的 SDK 返回值，不是平台注入/搜索权限的实测证据。

**7．规则 1–12 到测试的映射。** “部分覆盖”不表示整条规则没有测试；明确区分独立断言、原型对照、存储往返和界面显示。

| 规则 | 具体测试 | 已有保护 | 未被保护或仅间接保护的部分 |
|---|---|---|---|
| 1．容量只用 CMR | [rules:17](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:17)、[provenance:15](C:/Users/董金/ssps-miaoda/server/test/provenance.spec.ts:15) | 公式、池大小、CMR 数值 | 没有接口字段/页面文字的排他性测试，不能阻止新加其他容量口径。 |
| 2．23 泊位、LN16、表外排除 | [real-berths:12](C:/Users/董金/ssps-miaoda/server/test/real-berths.spec.ts:12)、[rules:35](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:35)、[importers:23](C:/Users/董金/ssps-miaoda/server/test/importers.spec.ts:23) | 数量、码头分组、LN16=10000、若干表外编码、inPool=false | 没有“主数据注入表外启用泊位后仍拒绝计入”与“历史大船不能改容量”的端到端反例。 |
| 3．吨级分母、默认 5 万吨 | [real-berths:18](C:/Users/董金/ssps-miaoda/server/test/real-berths.spec.ts:18)、[rules:20](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:20)、[prediction-service:123](C:/Users/董金/ssps-miaoda/server/test/prediction-service.spec.ts:123) | 多个精确吨级分母 | 边界 n±1、停用前后变化不系统；服务日历测试显式传 50000，冒烟只断言默认请求 HTTP 200，未验证默认吨位数值。 |
| 4．15 天分流、占用闭区间、竞争船 | [rules:24](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:24)、[rules:38](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:38)、[parity:53](C:/Users/董金/ssps-miaoda/server/test/parity.spec.ts:53) | 15/16、结束日占用、取消排除；日历原型对照 | 未覆盖默认业务时钟换日（D01）；不同吨级船混合时的精确远期竞争计数没有独立断言；数据空/非空反转时不换路径未独立成组。 |
| 5．只 A/B、30%、稀疏低可信 | [rules:44](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:44)、[rules:84](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:84)、[prediction-service:99](C:/Users/董金/ssps-miaoda/server/test/prediction-service.spec.ts:99) | A/B 数量、完整候选门槛、低可信 A、拒绝 C | 稀疏 B 门槛用例无辨别力（D05），缺低可信 B 正向及精确 30% 边界；远期 B 门槛本身待确认。 |
| 6．无数据不变 0、灰斜线 | [rules:27](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:27)、[imports-service:82](C:/Users/董金/ssps-miaoda/server/test/imports-service.spec.ts:82)、[provenance:36](C:/Users/董金/ssps-miaoda/server/test/provenance.spec.ts:36) | nodata 状态、接口无比率、远期 cmr_min=null | 没有近路径缺失指标的数据库往返到页面灰斜线的完整测试；前端浏览器未在这些命令中运行。 |
| 7．近 CMR_min、远重叠船数，无综合分 | [rules:44](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:44)、[parity:39](C:/Users/董金/ssps-miaoda/server/test/parity.spec.ts:39) | 近路径独立最优窗口；远期原型对照 | 无独立远期“峰值/均值产生相反排序”的反例，无接口/页面综合评分禁止测试。 |
| 8．三类船规则 | [domain:48](C:/Users/董金/ssps-miaoda/server/test/domain.spec.ts:48)、[rules:67](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:67)、[nlp:29](C:/Users/董金/ssps-miaoda/server/test/nlp.spec.ts:29)、[parity:27](C:/Users/董金/ssps-miaoda/server/test/parity.spec.ts:27) | 物资借用顺序、成品装港侧与截止日、客户 ETA 存在 | 客户 ETA 的精确反向近似和“仅供参考”展示主要靠原型对照；产品规则缺失时的完整输出未独立断言。 |
| 9．日期不比较时刻 | [domain:8](C:/Users/董金/ssps-miaoda/server/test/domain.spec.ts:8)、[domain:35](C:/Users/董金/ssps-miaoda/server/test/domain.spec.ts:35)、[compat:31](C:/Users/董金/ssps-miaoda/server/test/compat.spec.ts:31)、[drizzle-voyage:31](C:/Users/董金/ssps-miaoda/server/test/drizzle-voyage.spec.ts:31) | 同日时刻、纯日期节点、在港样例、+08 时间戳 | 没有 WITA/UTC 换日和默认 today 路径，也没有跨年默认时钟。 |
| 10．数值不被模型改写、文案引用、S1 | [provenance:15](C:/Users/董金/ssps-miaoda/server/test/provenance.spec.ts:15)、[prediction-service:59](C:/Users/董金/ssps-miaoda/server/test/prediction-service.spec.ts:59)、[prediction-service:114](C:/Users/董金/ssps-miaoda/server/test/prediction-service.spec.ts:114) | 数值关系、保存后源数据变化文案不变、解析与预测分工 | S1 前端展示没有测试；引擎到 Drizzle 到文案只覆盖部分组合。未见生成式模型接入用例，不据此虚构“模型已改数”。 |
| 11．移除功能不应存在/生效 | [rules:55](C:/Users/董金/ssps-miaoda/server/test/rules.spec.ts:55)、[prediction-service:99](C:/Users/董金/ssps-miaoda/server/test/prediction-service.spec.ts:99) | Plan C/D 有直接拒绝/数量保护 | DWRS、风险标记体系、成本决策、开放问答、天气、微信转发均无显式防回归测试。不能把正常航次异常标记误认为被移除的风险评分体系。 |
| 12．schema 字段、状态推导 | [domain:14](C:/Users/董金/ssps-miaoda/server/test/domain.spec.ts:14)、[voyage-service:66](C:/Users/董金/ssps-miaoda/server/test/voyage-service.spec.ts:66)、[drizzle-voyage:19](C:/Users/董金/ssps-miaoda/server/test/drizzle-voyage.spec.ts:19)、[compat:26](C:/Users/董金/ssps-miaoda/server/test/compat.spec.ts:26) | 状态分支、禁止手改、写字段与 Base 夹具、兼容表列 | 未逐一核验完整输入/响应/前端字段与权威 schema；夹具同步六条正常跳过；部分状态分支是未确认假设。 |

按整条规则计，没有哪一条完全没有关联测试；按具体子要求计，规则 1 的排他性、规则 11 除 Plan C/D 外的禁用项、规则 6 的真实页面灰斜线等没有自动化行为保护。不能把“12 条都能找到测试文件”写成“12 条已全部覆盖”。

**8．日期、顺序、共享状态与随机性。** 两次同日全量执行稳定；不同日期与不同调度只作代码推断。

| 项目 | 阅读与执行证据 | 结论 |
|---|---|---|
| 固定业务时钟 | rules 固定 2026-11-05；原型固定 2026-11-04；多数服务覆盖 clock | 多数核心计算可重复，默认时钟缺陷会被注入时钟掩盖。 |
| 真实 Date / 数据库 now | [预测元数据:44](C:/Users/董金/ssps-miaoda/server/modules/prediction/prediction.service.ts:44)、[LiveSnapshot:17](C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts:17)、[helper 审计时间:30](C:/Users/董金/ssps-miaoda/server/test/helpers/pg.ts:30) | 并未完全冻结时间；当前测试多不要求这些时间精确相等。 |
| ETA 扫描 | [issue-scan:42](C:/Users/董金/ssps-miaoda/server/test/issue-scan.spec.ts:42) 从实际创建日推算；[voyage-service:109](C:/Users/董金/ssps-miaoda/server/test/voyage-service.spec.ts:109) 对 Drizzle 只验时间格式 | 避免了固定日期导致的日常漂移，但不能验证真实创建时间的业务时区或精确更新语义。 |
| 未来日期 | D04 的 2026-12-02；D01 的当地凌晨 | 冒烟未来会失败；默认日期换日会错路。没有改系统时间来跑这些场景。 |
| 执行顺序 | 大部分 mk 每次新建仓储；PGlite 每次新建；after 统一关闭 | 没发现必须依赖前一条测试创建业务记录的证据。 |
| 共享全局 | [jobs:7](C:/Users/董金/ssps-miaoda/server/test/jobs-automation.spec.ts:7) 共享 calls、[security:33](C:/Users/董金/ssps-miaoda/server/test/security.spec.ts:33) 临时改 NODE_ENV/Logger；原型 M、E 在文件内共享 | 当前默认串行文件内执行和 try/finally 有保护；改成文件内并发后需重新验证，未据此断言目前随机失败。 |
| 随机性 | 生产适配器有 randomUUID，测试主要断言关系/格式；未见随机生成业务输入 | 两遍通过没有证明所有随机/竞争序列，但目前没有随机 seed 不一致证据。 |
| 毫秒等待 | [lark:26](C:/Users/董金/ssps-miaoda/server/test/lark.spec.ts:26)、[platform-directory:64](C:/Users/董金/ssps-miaoda/server/test/platform-directory.spec.ts:64) 使用短 setTimeout | 主断言是顺序、并发数、调用次数，而非精确耗时，避免了常见计时脆弱性。 |

**9．七项质量门是否阻断 push。** 结论是：部署脚本常规路径会在某一门非零时 Die，然而不能保证所有 push 都经过七门，也不能保证检查的是最终推送版本。

[Invoke-Tool:64](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:64) 读取子命令 LASTEXITCODE；[Invoke-QualityGates:239](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:239) 逐门执行并在非零时退出；[Invoke-Push:280](C:/Users/董金/WorkBuddy/SSPS/scripts/miaoda-deploy.ps1:280) 在提交和 push 前调用。这些是静态控制流确认，本轮没有执行该部署脚本。

| 门 | 脚本实际命令 | 阻断边界 |
|---|---|---|
| 1 | npm test | 非零会阻断；D02 的零测试退出 0 会被当作通过。 |
| 2 | npm run type:check:server | 非零会阻断；[tsconfig.node:17](C:/Users/董金/ssps-miaoda/tsconfig.node.json:17) 排除 spec，不能声称测试源码已被 tsc 完整检查。 |
| 3 | npx tsc --noEmit --project tsconfig.app.json | 非零会阻断；类型检查不执行前端交互。 |
| 4 | npx eslint server --quiet | 非零会阻断；quiet 不将所有 warning 升级为失败。 |
| 5 | npx eslint client/src --quiet | 同上；本轮实际执行的合并命令无错误。 |
| 6 | 设置 NODE_ENV=production；npx nest build | 非零会阻断；SWC 构建本身不是类型检查，也不包含 Vite 前端生产打包。 |
| 7 | node scripts/smoke.cjs | 非零会阻断；受 D04 日期及内存/假身份边界影响。 |

可见绕过路径包括：-SkipChecks；未安装/主动跳过 pre-commit；普通 git push 不调用部署脚本；即使安装钩子也仅做 lint，没有单元测试和冒烟；检查后 rebase 引入的代码没有再次过门。远端保护或平台额外校验不在本轮已验证范围，不能补写成存在。

scripts/lint.js 对非零子进程退出有转交逻辑；另有 [lint:21](C:/Users/董金/ssps-miaoda/scripts/lint.js:21) 将 close 回调中的空退出码折算为 0 的代码。若子进程因信号终止且 code=null，会丢失信号失败信息。这是静态可见的边界风险，未通过额外进程故障注入验证，不计入本报告确认缺陷数量。Windows 下 spawn .cmd 配合 shell:false、run-precommit 直接 spawnSync('npm') 的兼容性也未执行验证；用户本轮允许命令不包含 npm run lint/precommit，不把推断写成已复现报错。

七门没有前端 Vite 生产构建，因此无法证明线上前端资源打包成功；这是质量门覆盖边界，不代表当前前端打包已失败。

**10．建议补充的前 15 项测试。** 下列仅给输入与期望，不提供或写入实现代码。优先级是补测顺序；未确认规格不先写死验收值。

| 顺序 | 优先级与目标 | 输入 | 期望输出/行为 |
|---:|---|---|---|
| 1 | P0：默认业务日期与 15 天分流 | 受控瞬间 2026-11-05T16:30Z；默认装配快照；目标 2026-11-21 | /api/me 与快照 today 均为 WITA 2026-11-06；目标走 cmr；跨 UTC、WITA、Shanghai、Jakarta 展示/日期转换有明确一致口径。 |
| 2 | P0：完整 DDL 与非 owner RLS | 隔离 PostgreSQL 应用 001–004；模拟 anon/authenticated/service_role、不同会话 user_id，使用虚构数据 | anon 读不到自有表/镜像；service_role 与 authenticated 按确认权限工作；未授权接口无法泄露金额；审计列正确。 |
| 3 | P1：测试入口不能零测试假绿 | Windows 默认环境与 Git Bash 分别执行；另设空匹配输入 | 正常均发现全部 spec；空匹配返回非零并明确报错，不靠固定总数掩盖遗漏。 |
| 4 | P1：原生 Windows 冒烟与日期独立 | Windows 默认脚本环境；业务时钟分别设 2026-11-06、2026-12-02、2027-01-01 | 构建可启动；同一受控相对场景保持通过，不因硬编码日期过期。 |
| 5 | P1：稀疏 B 的精确门槛 | A=[d10,d12] 完整且充裕；B=[d13,d15] 只有前两天有数；有数天最小 CMR 分别 29%、30%；无其他可分离完整 B | 29% 不出 B；30% 出 B 且低可信；缺失天保持无数据，不纳入最小值或补 0。 |
| 6 | P1：完整适配器采纳闭环 | Drizzle 预测、主数据、航次、导入组合 + 假飞书；近/远/成品/库存四类方案 | 采纳写对 T04/T05 及镜像；窗口在正确本港侧；D05/D06 关联与只采纳一次一致；失败不留下重复业务记录。 |
| 7 | P1：两实例同键竞争 | 两个 outbox、两个独立连接，同时 10 次提交同一键；重启后再重试 | 一份有效业务写入、关联明细无重复；其他调用拿同结果或明确冲突；持久状态可恢复。 |
| 8 | P1：提交成功但响应丢失 | 假传输先保存飞书记录，再模拟连接中断；用原键重试 | 可识别已提交结果并避免重复；若现有契约无法做到，应明确失败/待核对状态和恢复方法。 |
| 9 | P1：跨 500 行真实回滚 | 501 条明细，第 501 条触发约束失败；靠船计划与库存分别运行 | 本次批次、前 500 行均回滚，旧 current 不变；不是只测重复批次号。 |
| 10 | P1：假飞书整批原子性 | 批次第一条合法、第二条非法；create/update 各一组 | 整批失败且表内容不变；替身与已确认 API 原子性一致。 |
| 11 | P1：分页/切批/限流完整契约 | 1120 条读、1200 条写；桩严格校验连续游标；各限流码、429、5xx、非 JSON 分别注入 | 页无丢失/重复；写体大小精确 500/500/200；错误分类与重试上限按已确认策略，不重放已完成批次。 |
| 12 | P1：全链路空数据与页面 | 无批次、覆盖期外、近路径缺日、远路径；引擎→Drizzle→HTTP→前端 | 缺失比率保持 null/缺省；不转 0/NaN；灰色斜线可见；真实 0% 仍显示真实拥挤值。 |
| 13 | P1：权威泊位池与竞争计数 | 23 泊位种子混入 F6、停用泊位；查询容量边界±1；混合大小船与取消航次 | 表外/停用不计；分母吨级匹配；取消排除；远期竞争关系先确认口径，再给精确计数。 |
| 14 | P1：独立远期排序与成品/物资 | 两候选峰值船数与均值排序相反；物资自有规则与借用规则同时存在；成品有/无反向规则 | 远期按峰值重叠船数排序；物资优先自有；成品截止为最晚装船日，客户 ETA 精确且标仅供参考；不引入综合评分。 |
| 15 | P1：最终版本质量门与移除功能契约 | 隔离工作副本模拟各门非零、测试零发现、rebase 后变化；扫描实际注册路由/DTO/页面与禁用功能清单 | 任一门失败不得进入 push；检查绑定最终版本；CMR 口径唯一；除正常航次异常标记外，不开放规则 11 移除的功能；C/D 拒绝。 |

**11．规格冲突、暂定值与处理建议。** 本报告没有将下列事项自行裁决为实现错误。

- [状态规则:8](C:/Users/董金/WorkBuddy/SSPS/docs/schema/status-rules.md:8) 把成品卸港靠泊作为结束，文末同时注明待确认；[domain:18](C:/Users/董金/ssps-miaoda/server/test/domain.spec.ts:18) 已把该假设写成固定断言。建议确认后统一规格和测试，当前标注“暂定口径已被测试锁定”。
- [open-questions:20](C:/Users/董金/WorkBuddy/SSPS/docs/open-questions.md:20) 的远期 Plan B 等效门槛、目标日选择、三天窗口、覆盖终点、竞争船定义仍未确认。相关原型一致性证明的是暂定实现一致，不是业务已确认。建议将已锁定 30% 要求与远期无 CMR 的替代资格分别记录。
- [AGENTS.md](C:/Users/董金/ssps-miaoda/AGENTS.md) 仍写“空骨架”，与本次实际业务模块不符；本轮以实际源码和用户范围为准，没有据此省略测试模块。
- 交接手册、提交说明、测试注释中存在“未联调”和“按真实行为调整”的不同时间描述。本轮只确认当前代码和本地执行结果，不将注释视为真实平台验证记录，也不重述为已上线。

报告中的补测建议不构成发布通过结论。修复顺序应先处理 D01 的日期分流，再修测试入口与关键用例的辨别力，之后补齐真实 PostgreSQL 权限和完整写链路的隔离验证。

