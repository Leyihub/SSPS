# 代码位置、同步与发布流程（2026-11-05 定稿：平台仓库为代码主线）

## 1. 四个位置与分工

| 位置 | 地址 / 路径 | 分支 | 角色 |
| --- | --- | --- | --- |
| **本机妙搭平台工作副本（代码主线）** | `C:\Users\董金\ssps-miaoda` | `sprint/default` | **Claude 的工作目录，所有代码在这里写、测、联调、推送、发布**。仓库根 = 工程根 |
| 妙搭远端 | `https://miaoda-git.feishu.cn/apaas4.0/-/t_5CmglBJv/code_n8sXJKxxYphM.git` | `sprint/default`（开发线）；`main` 是发布态快照 | 官方发布通道 |
| 本机文档仓 | `C:\Users\董金\WorkBuddy\SSPS` | `main` | 文档、原型、交接材料、部署脚本；其中 `app/` 是**冻结的历史备份**，不再写代码 |
| GitHub 远端 | `https://github.com/Leyihub/SSPS.git` | `main` | 文档仓的远端备份 |

应用 `app_id = app_17heqwc44fd`。**代码与文档分仓**：代码只在平台仓库提交；文档（任务书、open-questions、进度表、手册）只在文档仓提交。一次改动涉及两边时分别提交。

为什么代码主线必须是平台仓库：它是唯一能一键发布的仓库（正确的 origin、`sprint/default`、`.spark/meta.json`、`+git-credential-init` 装的凭证）；脚手架脚本（`npm run dev` 的 app sync / `+env-pull` / skills sync、`gen:db-schema`、`+db-execute`、`+release-create`）都按「当前目录就是应用仓库根」写。在别处改完再搬运，漏了就会「代码改了但没上线」。

**不要把文档仓整包放进平台仓库**：平台仓库的 `.gitignore` 不排除 `.md`、`docs/`、`*.png`，`-Mode push` 的 `git add -A` 会把它们全推上去，污染发布仓，也碰「原始业务数据不入库」的红线；两边 `AGENTS.md` 同名但内容不同，整包复制会覆盖平台规范；`npm run dev` 的同步还会重写部分根目录文件。

两条独立的 Git 链路：往 GitHub 推送不会让妙搭有任何变化；`push` 到妙搭 `sprint/default` 也**不等于上线**，必须再单独 `+release-create`。

## 2. 一次性迁移（把云端写的最新代码搬进平台仓库——这是最后一次「GitHub → 平台」）

文档仓 `git pull` 已完成的前提下（`app/` 里是最新代码，含自包含的测试夹具）：

```powershell
cd C:\Users\董金\WorkBuddy\SSPS
git pull
# 1) 先看会搬什么（只读）。应显示约 60+ 个文件待搬运，而不是 0 个
powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode sync -Repo C:\Users\董金\ssps-miaoda -DryRun
# 2) 真正搬运（跳过平台维护的 55 个文件；package.json 只补缺失项；不删目标端文件、不提交）
powershell -ExecutionPolicy Bypass -File .\scripts\miaoda-deploy.ps1 -Mode sync -Repo C:\Users\董金\ssps-miaoda
```

然后到 `ssps-miaoda` 里**逐项处理**：

1. `git diff` 看一遍搬了什么。
2. **手动核对 `package.json`**：`sync` 只补缺失项，不改已有的。`build:server` 必须是 `NODE_ENV=production nest build && node -e "require('fs').rmSync('dist/server/test',{recursive:true,force:true})"`；`smoke`、`test`、`preview:build`、`gen:db-schema:local` 四个脚本和依赖 `@electric-sql/pglite`、`tsx` 应已补上，缺了手动加；然后 `npm install`（别并发）。
3. 放 `CLAUDE.md` / `CLAUDE.local.md` 并更新 `.gitignore`，步骤见 `docs/handoff/platform-repo/README.md`。
4. 跑质量门，全绿才继续：`npm test`（应为 168 通过 + 6 跳过——跳过的是「夹具与源文件一致」那 6 条，平台仓库里没有源文件）、`npm run type:check`、`npx eslint server client/src --quiet`、`npm run smoke`。
5. `-Mode push`（质量门→提交→`pull --rebase`→推 `sprint/default`）。此时才算首次合并真正成为主线（平台里那个旧的首次合并提交 `77fc32e` 之上会叠上最新代码）。
6. 在文档仓提交 `scripts/miaoda-deploy.ps1`（本机工具，原本是未跟踪文件），`.workbuddy/` 先加进 `.gitignore`。
7. 迁移完成后，文档仓的 `app/` 视为冻结：以后只用 `-Mode backup`（平台 → 文档仓，单向）偶尔回灌一份备份，**不要双向写**。

## 3. 日常开发循环

```powershell
cd C:\Users\董金\ssps-miaoda
claude --add-dir "C:\Users\董金\WorkBuddy\SSPS"     # Claude 在平台仓库写代码，按绝对路径读写文档仓
# ……改代码、npm run dev 联调、跑质量门……
powershell -ExecutionPolicy Bypass -File C:\Users\董金\WorkBuddy\SSPS\scripts\miaoda-deploy.ps1 -Mode push -Repo C:\Users\董金\ssps-miaoda -Message "本次改动说明"
# 文档仓里更新进度表 / 任务书 / open-questions，并提交推 GitHub
```

发布（需要 Leyinet **当次**授权）：

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\董金\WorkBuddy\SSPS\scripts\miaoda-deploy.ps1 -Mode release -Repo C:\Users\董金\ssps-miaoda -Reason "发布说明"
```

脚本模式：`check`（只读自检）、`gates`（7 项质量门）、`sync`（文档仓 `app/` → 平台仓库，**只用于上面的一次性迁移**）、`backup`（平台 → 文档仓 `app/`，镜像备份）、`push`、`release`（审批 PENDING 会停下等）。`-DryRun` 只读演练，`-ForceProtected` 强制覆盖平台受保护文件（会警告，一般不用）。lark-cli 用 **PowerShell** 跑，别用 CMD；user token 到 2026-11-06 00:07:57 过期且无刷新令牌，过期后 `lark-cli.cmd auth login --recommend`。

## 4. 发布前的硬条件

1. **首次发布前必须先配环境，否则会把演示模式发上去。** 不设 `SSPS_STORE=real` 时线上跑的是**内存演示数据 + 兜底身份**（所有人都是「业务员 · 大宗采购部」，重启丢数据）；设了 `real` 但没建 `ssps_*` 平台角色，所有人都是 403。顺序：建 4 个平台角色并分配成员 → `lark-cli apps +env-set` 设 `SSPS_STORE=real`、`LARK_APP_ID/SECRET`（新 Secret）、`BITABLE_APP_TOKEN`、`BITABLE_TABLE_IDS` 等 → 本机联调通过 → 再 `release`。在这之前 `push` 到 `sprint/default` 是安全的，`release` 不是。
2. 平台仓库里的 `.env` 是已跟踪的无密钥模板；密钥只放本机 `.env.local`（已忽略）。脚本会拦截新增 env 文件与密钥类键名。旧 App Secret 仍按已泄露处理，先去开放平台重置。
3. 云端 Claude 不再参与代码开发；如果某次让它写纯代码，产物要手动搬进平台仓库（不要再用 `sync` 反复覆盖）。

## 5. 改动往哪走

```
[Claude 在这里写代码]  C:\Users\董金\ssps-miaoda (sprint/default)
      │ npm run dev / 质量门 / 联调
      │ miaoda-deploy.ps1 -Mode push
      ▼
妙搭远端 sprint/default ──(-Mode release，需授权)──► 妙搭发布态 main（上线）

[文档、原型、交接、脚本]  C:\Users\董金\WorkBuddy\SSPS (main) ── git push ──► GitHub Leyihub/SSPS
      ▲  -Mode backup（平台代码单向镜像到 app/，偶尔做）
```

## 6. 已知取舍

- 平台仓库只有一个合并提交的历史；GitHub 上 `app/` 有 90 多个提交的历史，以后 `git blame` 追不到更早的作者。接受即可，历史在文档仓的 `app/` 备份里可查。
- 文档与代码分仓意味着更新要两处提交；`CLAUDE.md`（平台仓库）是文档仓模板的副本，模板改了要手动同步。
- `server/test/fixtures/` 里的原型引擎、`base-plan.json` 等是文档仓源文件的副本；文档仓里的 `fixtures-in-sync` 测试会在源文件改动后提醒更新（平台仓库里该测试自动跳过，所以改源文件后要记得手动复制到平台仓库的夹具）。
