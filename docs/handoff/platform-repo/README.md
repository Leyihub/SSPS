# 平台仓库的 CLAUDE.md 与 CLAUDE.local.md 怎么放

平台工作副本（`C:\Users\董金\ssps-miaoda`）根目录目前没有 `CLAUDE.md`，不会和脚手架自带的 `AGENTS.md` 冲突。把这里的两份模板放过去：

```powershell
cd C:\Users\董金\WorkBuddy\SSPS
git pull
Copy-Item docs\handoff\platform-repo\CLAUDE.md C:\Users\董金\ssps-miaoda\CLAUDE.md
Copy-Item docs\handoff\platform-repo\CLAUDE.local.md.template C:\Users\董金\ssps-miaoda\CLAUDE.local.md

# 让本机文件和迁移输出不被提交（平台仓库的 .gitignore 里追加）
cd C:\Users\董金\ssps-miaoda
Add-Content .gitignore "`nCLAUDE.local.md`nmigration-out/"
git status      # 确认 CLAUDE.md 是新增、CLAUDE.local.md 没出现在待提交里
```

- `CLAUDE.md` 提交进平台仓库（不含本机路径、不含密钥）；`CLAUDE.local.md` 只留在本机。
- 以后改了文档仓里的模板，要手动同步到平台仓库的 `CLAUDE.md`（它是副本，不是自动同步的）。
- 不要把文档仓的 `docs/`、`prototype/` 整包放进平台仓库。
