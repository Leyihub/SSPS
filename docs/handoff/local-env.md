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

## 6. 尚未验证（留给阶段 1 后续步骤）

- 本机 `npm run dev` 下能否拿到平台注入的 `DRIZZLE_DATABASE`、`AuthorizationSDK`（手册 §8 第 4 条）。需要先有 `.env.local`（`+env-pull`），本次没做。
- real 模式启动、读接口行数与 Base 对照、日历全灰色斜线。
- 同步延迟（约 6 秒）和同步内容与 Base 是否逐行一致（只核对了任务状态和估算行数）。
- 建 4 个平台角色并分配成员（阶段 2）。

## 7. 需要 Leyinet 提供 / 决定

1. 批准把迁移结果提交并推送到 `sprint/default`（推送不等于上线）。
2. 重置后的 App Secret（旧值视为已泄露）。
3. `BITABLE_APP_TOKEN` 与 `BITABLE_TABLE_IDS`（表 ID 见 `docs/schema/base-build-report-2026-11-05.md`，app_token 需要确认）。
4. 是否永久设置 npm 的 `script-shell`（§4 第 1 条）。
5. 四个测试账号、云空间文件夹 token（阶段 2、5 才需要）。
