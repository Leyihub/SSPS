# 代码位置、同步与发布流程（2026-11-05，据本机 WorkBuddy 的实地核对）

## 1. 四个位置

| 位置 | 地址 / 路径 | 分支 | 作用 |
| --- | --- | --- | --- |
| GitHub 远端 | `https://github.com/Leyihub/SSPS.git` | `main`（以 `git fetch` 后的 `origin/main` 为准） | 文档、原型、代码备份；云端 Claude 在这里工作 |
| 本机 GitHub 工作副本 | `C:\\Users\\董金\\WorkBuddy\\SSPS` | `main` | 交接仓：`CLAUDE.md`、`docs/`、`prototype/` 都在这里，业务代码在 `app/` |
| 妙搭远端 | `https://miaoda-git.feishu.cn/apaas4.0/-/t_5CmglBJv/code_n8sXJKxxYphM.git` | **`sprint/default`**（开发线）；`main` 是发布态快照 | 官方发布通道 |
| 本机妙搭工作副本 | `C:\\Users\\董金\\ssps-miaoda` | `sprint/default` | 唯一能 `push`/`release` 的工作区；仓库根 = 工程根（没有 `docs/`） |

应用 `app_id = app_17heqwc44fd`。**这是两条独立的 Git 链路**：往 GitHub 推送不会让妙搭有任何变化；`push` 到妙搭的 `sprint/default` 也**不等于上线**，必须再单独 `+release-create`。

## 2. 谁是事实来源（建议）

**以 GitHub 工作副本为唯一事实来源**：在 `C:\\Users\\董金\\WorkBuddy\\SSPS` 里改代码、改文档、提交、推 GitHub；`ssps-miaoda` 只是「构建 / 本机联调 / 发布」的目标，改动用 `sync` 搬过去。理由：妙搭副本里没有 `CLAUDE.md`、`docs/`、`prototype/`，在那里改代码会让文档和代码分开两处；而 `sync` 只搬变化的文件，开销很小。

例外：需要改平台维护的文件（见 §3）时，直接在 `ssps-miaoda` 改，并把同样的改动手动带回 GitHub 副本，别靠 `backup` 覆盖。联调时 `npm run dev` 在 `ssps-miaoda` 跑（有平台文件与 `.spark/meta.json`）；每次改完代码先 `sync` 再跑。

## 3. 脚本 `scripts/miaoda-deploy.ps1`（本机 WorkBuddy 写的）

> 这个脚本和 `.workbuddy/` 在 GitHub 副本里**还是未跟踪文件**，换机器就没了。第一件事：`git add scripts/miaoda-deploy.ps1` 提交推送；`.workbuddy/` 先加进 `.gitignore`，看过内容没有密钥后再决定要不要提交。

| 模式 | 作用 |
| --- | --- |
| `check` | 只读自检 |
| `gates` | 只跑 7 项质量门 |
| `sync` | GitHub 副本 `app/` → 妙搭副本：按 SHA256 只复制变化的文件，**跳过平台维护的 55 个文件**（`.spark/`、`skills/`、`index.tsx`、`main.ts`、`schema.ts`、`dev*.js`、`vite.config.ts`、`package*` 等）；`package.json` 只补缺失的 scripts/依赖；不删目标端文件、不提交；`-DryRun` 只读演练；`-ForceProtected` 强制覆盖受保护文件（会警告） |
| `backup` | 反向：妙搭副本 → GitHub 副本（镜像用），同样支持 `-DryRun` |
| `push` | 质量门 → commit → `pull --rebase` → `push origin sprint/default`（认证失败自动刷一次凭证） |
| `release` | 先 push，再 `+release-create`，再轮询 `+release-get`（审批 PENDING 会停下等）；`-Reason` 必填 |

```powershell
cd C:\Users\董金\WorkBuddy\SSPS
git pull                                   # 先拉到最新 main！（见 §4 的版本落后问题）
powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode sync -Repo C:\Users\董金\ssps-miaoda -DryRun
powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode sync -Repo C:\Users\董金\ssps-miaoda
# 到 ssps-miaoda 里 git diff 看一遍，再：
powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode push -Repo C:\Users\董金\ssps-miaoda -Message "本次改动说明"
# 发布要 Leyinet 当次授权：
powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode release -Repo C:\Users\董金\ssps-miaoda -Reason "发布说明"
```

lark-cli 用 **PowerShell** 跑，别用 CMD；user token 到 2026-11-06 00:07:57 过期且无刷新令牌，过期后 `lark-cli.cmd auth login --recommend`。

## 4. 已发现的问题（必须先处理）

1. **GitHub 副本落后了。** 该副本报告 `main = f83861a`，但 GitHub 上最新 `main` 已经比它多 17 个提交（真实主数据/航次仓储、补偿重放、兼容表、定时触发器、真实身份目录、安全加固、批量读性能优化、权限矩阵、交接手册等）。「346 个业务文件完全一致、0 个待搬运」只说明**旧版本**两边一致。所以：**先在 GitHub 副本 `git pull`，再 `sync`**，否则妙搭里压着的那个首次合并提交是旧代码。拉完后 `sync -DryRun` 应该显示约 60 个文件待搬运。
2. **`package.json` 的改动 `sync` 不会带过去。** `sync` 只补缺失的 scripts，而我们改过一个已有的：`build:server`（构建后删掉 `dist/server/test`，现已改成跨平台写法，不再用 `rm -rf`）。同步后请到 `ssps-miaoda/package.json` 手动核对 `build:server` 是否是 `NODE_ENV=production nest build && node -e "require('fs').rmSync('dist/server/test',{recursive:true,force:true})"`；`smoke`、`test`、`preview:build`、`gen:db-schema:local` 和依赖 `@electric-sql/pglite`、`tsx` 属于「新增」，应能被补上，但也请核对。
3. **首次发布前必须先配环境，否则会把演示模式发上去。** 不设 `SSPS_STORE=real` 时应用跑的是**内存演示数据 + 兜底身份**（所有人都是「业务员 · 大宗采购部」，重启丢数据）；设了 `real` 但没建 `ssps_*` 平台角色，所有人都是 403。所以发布顺序是：建 4 个平台角色并分配成员 → `lark-cli apps +env-set` 设 `SSPS_STORE=real`、`LARK_APP_ID/SECRET`（新 Secret）、`BITABLE_APP_TOKEN`、`BITABLE_TABLE_IDS` 等 → 本机联调通过 → 再 `release`。在这之前 `push` 到 `sprint/default` 是安全的，`release` 不是。
4. 妙搭仓库里 `.env` 是已跟踪的无密钥模板；本机密钥只放 `.env.local`（已忽略）。脚本会拦截新增 env 文件与密钥类键名；旧 App Secret 仍按已泄露处理，先去开放平台重置。
5. 两个工作副本不要同时改同一处；要镜像用 `backup`，别手动双向复制。

## 5. 改动往哪走（一张图）

```
[改代码/文档]  C:\Users\董金\WorkBuddy\SSPS (main)
      │ git commit / push ───────────────► GitHub  Leyihub/SSPS (main)   备份、云端 Claude 接力
      │ miaoda-deploy.ps1 -Mode sync
      ▼
C:\Users\董金\ssps-miaoda (sprint/default)   ← npm run dev / 联调 / 质量门在这里
      │ -Mode push
      ▼
妙搭远端 sprint/default ──(-Mode release，需授权)──► 妙搭发布态 main（上线）
```
