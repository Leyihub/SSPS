# SSPS · 智慧发船预测系统（妙搭应用仓库）

印尼德信（IMIP 园区）智慧航运 APS，部署在飞书妙搭。产品负责人 Leyinet（非程序员，沟通用中文白话，先结论后依据）。**这个仓库是代码主线**（能 push、能发布）；产品文档、原型、交接材料在另一个**文档仓**，路径见同目录的 `CLAUDE.local.md`（本机文件，不提交）。

## 开工前先读（用文档仓的绝对路径）

1. 文档仓 `CLAUDE.md`——产品定位、**已锁定业务规则**、工作约定。
2. 文档仓 `docs/handoff/claude-code-handoff.md`——完整交接手册（现状、架构、联调路线图、未验证假设清单）。
3. 文档仓 `docs/handoff/deploy-flow.md`——两个仓库的分工、同步与发布流程。
4. 本仓库 `AGENTS.md`——**平台自带的脚手架规范，同样要遵守**（DDL 只能走 `lark-cli apps +db-execute`；`server/database/schema.ts` 禁止手改；平台文件勿改）。
5. 文档仓 `docs/open-questions.md`——未勾选项不要自行假定。

## 一句话现状

**目前没有任何功能上线。** 已写的代码只在内存数据 / 内存 Postgres（PGlite）/ 假飞书 / 假平台 SDK 上测过，没连过真实飞书、真实应用库、真实平台。你的任务是联调走通并如实汇报；严格区分「已上线 / 已在真实环境验证 / 已写好未验证 / 计划中」。

## 硬规矩

- **密钥只放环境变量**（本机 `.env.local`，已忽略；线上用 `lark-cli apps +env-set`），不进仓库、提示词、日志、提交信息、回复；前端绝不出现 App ID / App Secret。旧 App Secret 视为已泄露，须重置后使用新值。
- **真实业务数据不提交**：企微导出 Excel、库存表、迁移输出（`migration-out/`）；核对时只回传统计数。
- 业务规则以文档仓 `CLAUDE.md`「已锁定业务规则」为准：容量只用 CMR；「无数据」是灰色斜线不是 0%；在港判断只比日期；规则引擎数值不得被生成式模型改写。不自创字段或状态（字段看文档仓 `docs/schema/`，状态看 `status-rules.md`）；暂定口径只改 `server/config.ts`。
- **平台维护的文件不要手改**：`.spark/`、`skills/`、`client/src/index.tsx`、`server/main.ts`、`server/modules/view/`、`server/database/schema.ts`（只能 `npm run gen:db-schema:local` 生成）、`scripts/` 里平台脚本（`dev.sh`、`build.sh`、`run.sh`、`lint.js`、`prune-smart.js`、`hooks/`）、`vite.config.ts`、`package-lock.json`。我们自己的脚本：`scripts/{smoke.cjs,demo-server.cjs,gen-db-schema-local.mjs,migrate-dryrun.ts,gen-permission-matrix.ts,extract-page-css.cjs}`。
- `lark-cli` 在 **PowerShell** 里跑，命令先 `--help`，不要猜参数；平台 SQL 解析器不支持 `DO $$` 块。
- 不确定业务口径、需要业务判断、会改线上数据 / 发布 / 删除 / 对外发消息的动作：**先问 Leyinet**，授权只对当次有效。发现规格冲突直接指出并给建议，写进文档仓 `docs/open-questions.md`。

## 目录与质量门

后端 `server/`（`domain/ engine/ lark/ ports/ adapters/{memory,drizzle,platform}/ modules/ test/`），前端 `client/src/`，建库 SQL `db/`。测试夹具在 `server/test/fixtures/`（本仓库自包含，不依赖文档仓）。

提交前全绿：

```powershell
npm test                                  # 后端测试（PGlite + 假飞书，含与原型引擎的对照）
npm run type:check                        # 前后端类型检查
npx eslint server client/src --quiet
npm run smoke                             # 真起 Nest 走完 HTTP 主线
```

## 提交、推送与发布

- 提交信息用中文，一批做完就提交。**本仓库只提交代码**；文档、任务书、open-questions、进度表在文档仓提交——一次改动涉及两边时分别提交，并在文档仓 `docs/development-workflow.md` 更新进度。
- 推送与发布用文档仓里的脚本（`-Repo` 指向本仓库）：`-Mode check`（只读自检）、`-Mode gates`（质量门）、`-Mode push -Message "说明"`（质量门→提交→`pull --rebase`→推 `sprint/default`）、`-Mode release -Reason "说明"`（先 push 再发布并轮询；**必须 Leyinet 当次授权**）。`push` 不等于上线，`release` 才上线。
- **首次发布前**必须先：建 4 个平台角色（`ssps_salesman / ssps_manager / ssps_logistics / ssps_admin`）并分配成员；`+env-set` 配好 `SSPS_STORE=real`、`LARK_APP_ID/SECRET`（新 Secret）、`BITABLE_APP_TOKEN`、`BITABLE_TABLE_IDS`；本机联调通过。否则线上会跑内存演示模式（所有人都是「业务员·大宗采购部」、重启丢数据）或全员 403。
- 不直推 `main`，不 force push；不要把文档仓的 `docs/`、`prototype/` 整包放进本仓库。

## 汇报

每个阶段结束写一段：做了什么 / 验证了什么 / 没验证什么 / 需要你做什么。联调中确认的真实事实（字段形状、限流码、时区、SDK 返回结构）写回文档仓手册第 8 节「未验证假设」并标记结果。
