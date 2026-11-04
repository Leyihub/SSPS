# SSPS · 智慧发船预测系统

印尼德信智慧航运 APS 系统（飞书妙搭部署）。当前阶段：一期设计已完成，等待妙搭脚手架初始化后开始开发。

- 项目规则与背景：[CLAUDE.md](CLAUDE.md)
- 实施计划书：[docs/implementation-plan.md](docs/implementation-plan.md)
- 数据结构规格：[docs/schema/](docs/schema/)
- 待确认事项：[docs/open-questions.md](docs/open-questions.md)

## 开发方式

1. 在本机执行 `lark-cli apps +create --app-type full_stack` 和 `+init`，把生成的脚手架作为首个代码提交推送到本仓库。
2. 日常开发在本仓库进行（可由 Claude 云端会话完成）。
3. 发布时在本机拉取最新代码，推送到妙搭远端 `sprint/default`，再执行 `lark-cli apps +release-create --apply-reason "..."`。
