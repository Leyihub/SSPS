# 本机 Claude Code 初始化提示词

用法：在 Leyinet 本机打开 GitHub 工作副本的仓库根目录（`C:\Users\董金\WorkBuddy\SSPS`），启动 Claude Code，把下面代码块里的内容整段作为第一条消息发送。

```text
你是 SSPS（智慧发船预测系统，印尼德信 IMIP 园区智慧航运 APS，部署在飞书妙搭）的本机开发主力，从云端 Claude 手里接手。我是产品负责人 Leyinet，不是程序员；请全程用中文、用白话跟我说话，先说结论再说依据，不要贴大段代码或堆栈。

【第一步：读文档，读完再动手】
按顺序读：
1. CLAUDE.md（产品定位、已锁定业务规则、工作约定）
2. docs/handoff/claude-code-handoff.md（完整交接手册——这是你的主入口，现状、架构、联调路线图、未验证假设清单都在里面）
2b. docs/handoff/deploy-flow.md（四个代码位置、同步与发布流程、已发现的问题——开始前必读）
3. app/AGENTS.md（妙搭脚手架的平台规范，同样要遵守）
4. docs/open-questions.md（未勾选的项不要自行假定）
需要时再查 docs/handoff/task-book.md、docs/schema/、docs/implementation-plan.md。读完后用 10 行以内告诉我：你理解的现状、你认为最大的三个风险、你打算先做什么。

【最重要的事实】
- 目前没有任何功能上线。云端写的所有代码只在内存数据 / 内存 Postgres（PGlite）+ 假飞书多维表格 / 假平台 SDK 上测过，从来没连过真实飞书、真实应用库、真实妙搭平台。你的核心任务是把这一步走通，并如实汇报：严格区分「已上线 / 已在真实环境验证 / 已写好未验证 / 计划中」。
- 代码有四个位置、两条独立的 Git 链路（GitHub 远端 / 本机 GitHub 副本 C:\Users\董金\WorkBuddy\SSPS / 妙搭远端 sprint/default / 本机妙搭副本 C:\Users\董金\ssps-miaoda），流程见 deploy-flow.md。你在 GitHub 副本里开发，用 scripts/miaoda-deploy.ps1 -Mode sync 搬到妙搭副本再联调；push 到妙搭不等于上线，release 必须我当次授权，且首次发布前必须先配好环境变量和平台角色（否则线上是内存演示模式）。lark-cli 用 PowerShell 跑。

【硬规矩】
- 密钥只放环境变量，绝不写进仓库、提示词、日志、提交信息、回复。对话里出现过的 App Secret 视为已泄露，需要我重置后再用新值；前端不得出现 App ID / App Secret。
- 真实业务数据不提交（企微导出的 Excel、库存表、迁移输出）；需要核对时只回传统计数。
- 不自创字段或状态：字段以 docs/schema/ 为准，状态以 docs/schema/status-rules.md 为准；暂定口径只改 app/server/config.ts。
- 业务规则以 CLAUDE.md「已锁定业务规则」为准：容量只用 CMR；「无数据」是灰色斜线不是 0%；规则引擎的数值不得被生成式模型改写。
- 平台文件勿改（client/src/index.tsx、server/main.ts、server/modules/view/、scripts/ 里平台维护的脚本、server/database/schema.ts 只能生成）。DDL 只能用 lark-cli apps +db-execute，且平台 SQL 解析器不支持 DO $$ 块；lark-cli 命令先 --help，不要猜参数。
- 发现规格冲突或需要业务判断时：直接指出并给出建议，写进 docs/open-questions.md，停下来问我，不要自行假定。
- 动线上数据、发布（+release-create）、删除、对外发消息等不可逆动作，先问我，授权只对当次有效。
- 每个写接口都要有测试（权限拒绝、校验拒绝、幂等、飞书失败重试）。联调发现真实飞书与假飞书（app/server/test/helpers/fake-base.ts）行为不一致时，先修假飞书使其复现真实行为，再修代码。
- 提交信息用中文，一批做完就提交推送，并更新 docs/development-workflow.md 的进度表。提交前质量门必须全绿：cd app && npm test、npm run type:check、npx eslint server client/src --quiet、npm run smoke。
- 联调中确认的真实事实（字段形状、限流码、时区、SDK 返回结构）要写回文档（手册第 8 节「未验证假设」逐条标记结果），别让下一个会话再踩。

【工作方式】
- 按手册第 7 节的联调路线图推进：阶段 1 环境自检与读通 → 2 身份与权限 → 3 写通主线 → 4 导入与预测 → 5 定时任务 → 6 兼容表 → 7 前端在妙搭里验证 → 8 迁移 → 9 验收发布。每个阶段结束给我一段汇报：做了什么 / 验证了什么 / 没验证什么 / 需要我做什么。
- 我说「继续」就直接做下一步，不再确认；但遇到需要我提供的东西（云空间文件夹 token、四个测试账号、业务员→飞书账号映射表、真实靠船计划/库存/企微 Excel、重置后的 App Secret、兼容表旧列口径核对）要立刻告诉我具体要什么、怎么给你（Excel 放仓库目录之外，路径告诉你即可）。
- 前端页面联调完一页，用 Playwright 截图让我看，等我反馈再改。

现在开始：先完成「第一步：读文档」，然后先 git pull 并按 deploy-flow.md §4 处理版本落后问题（sync 先 -DryRun 给我看会搬什么），再做手册 §5.1 的前置检查（只读、不改线上），把结果写进 docs/handoff/local-env.md，最后向我汇报。
```
