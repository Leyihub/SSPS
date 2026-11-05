# SSPS · 给 Codex（及其他编码代理）的入口

先读这三份，按顺序：

1. `CLAUDE.md`：产品定位、已锁定的业务规则、工作约定（回复用中文；区分「已上线」与「计划中」——**目前没有任何功能上线**）。
2. `docs/handoff/claude-code-handoff.md`：**完整交接手册（主入口，2026-11-05 起本机 Claude Code 使用）**；`docs/handoff/README.md` 是上一版总览，仓库地图和后端架构讲得更细：交接总览——现状、仓库地图、怎么跑、不能碰的东西、已知的坑。
3. `docs/handoff/task-book.md`：任务书——后续全部工作，按编号、依赖、验收标准排好；每个任务有可直接用的提示词。

工程在 `app/`（飞书妙搭 full_stack 脚手架：NestJS + React + Drizzle）。`app/AGENTS.md` 是平台自带的脚手架规范，**同样要遵守**（DDL 只能用 `lark-cli apps +db-execute`、`server/database/schema.ts` 禁止手改、`.agent`/平台文件勿改等）。

硬规矩（出错代价最高的几条）：

- 密钥只放环境变量，绝不写进仓库、提示词、日志、提交信息。对话里出现过的 App Secret 视为已泄露，必须先重置。
- 企微导出的原始 Excel 含真实业务数据，不提交、不回传明细，只回传统计数。
- 容量指标只用 CMR；规则引擎的数值不得被任何生成式模型改写；「无数据」显示为灰色斜线，绝不显示为 0%。
- 发现规格冲突直接指出并给出建议，不要自行假定；待确认项见 `docs/open-questions.md`。
