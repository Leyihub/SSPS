# SSPS · 智慧发船预测系统（Smart Shipping Planning System）

印尼德信（IMIP 园区）智慧航运 APS 系统，部署在飞书妙搭。产品负责人：Leyinet（需求方，非程序员背景）。

## 系统定位（不可偏离）

- 核心是「智能发船计划预测」：帮业务员根据港口承载能力、航行周期、ETA 规律、港口拥堵规律，预测最佳发船日、最佳到港窗口、压港风险、ETA 风险。
- 核心用户是业务员（大宗采购部、商务海运部、仓储物流部），不是港口调度员。
- 不做港口实时调度塔台、数字孪生大屏、纯调度 Cockpit。

## 工作约定

1. 只有 Leyinet 明确说「开始写」或同等指令时才写业务代码；设计阶段只出文档。（2026-11-05 Leyinet 已下达「开始完成所有代码的开发」，开发阶段见 `docs/development-workflow.md`。）
2. 收到「继续」直接做下一步，不再确认。
3. 规格文档用编号结构；给领导看的材料用段落文字而不是表格。
4. 汇报时严格区分「已上线」与「计划中」。
5. 发现规格冲突时直接指出并给出建议的解决方式。
6. 回复用中文。

## 当前阶段：妙搭开发（2026-11-05 起；产品原型 P01–P11 已完成并评审）

原型已由 Leyinet 评审确认，业务代码已合并进妙搭平台仓库，现在是**在本机用真实飞书和妙搭联调、补齐剩余功能、迁移、验收、发布**的阶段。原型仍是前端的视觉与交互基线、预测引擎的对照基准，下面几条继续有效：

1. 原型位置：`prototype/`（原生 HTML/CSS/JS，每页一个文件，`prototype/index.html` 导航）；页面范围以 `docs/implementation-plan.md` 第 9 节为准，字段以 `docs/schema/` 为准，状态以 `docs/schema/status-rules.md` 为准，不得自创字段或状态。示例数据（`prototype/mock-data.js`）里的船名、合同号、人名一律虚构，不使用真实业务数据。
2. 视觉基线：1920px 宽的密集 ERP 布局；导航 #26394f（渐变到 #203348）；主色 #1677ff；卡片圆角 8–12px、轻阴影；参考 SAP Fiori / Oracle TMS 的风格。
3. 必须体现：无数据灰色斜线、CMR 口径与色阶、≤15 天 / ＞15 天两条路径的不同显示、Plan A/B 卡片、S1 溯源区块、航程「经验值 / 统计值」标签、「低可信」标签。
4. 前端页面在真实平台联调完一页，用 Playwright 截图交给 Leyinet 看，等反馈后再改（截图可放 `prototype/screenshots/`）。

## 已锁定业务规则（沿用德龙版，不重新讨论）

1. 容量指标只用 CMR（容量余量率，越高越充裕），任何界面不得使用其他容量口径。
2. 泊位池以《泊位容量表》（2026-10-08）为唯一依据：23 个德信可用泊位，北区码头 F1–F5、F7–F11；拉博塔码头 L4、L6、L7、L8、L11、L12、LN16–LN22。表外泊位一律不计；容量不按历史靠泊记录调整；LN16 按普通 1 万吨泊位处理。
3. CMR 分母按查询货量做吨级匹配：只计容量 ≥ 货量的启用泊位，因此分母随查询变化；港口日历默认 5 万吨档。
4. 按目标到港日距今分流（不按数据有无分流）：≤15 天用 IMIP 靠船计划做泊位级 CMR（占用区间 = 预计靠泊 ≤ 日期 ≤ 预计卸完）；＞15 天用航次表做重叠船数密度判断，只计与该吨级泊位竞争的船。
5. 只出 Plan A / Plan B。Plan B 要求 CMR 余量 ≥30%；没有完整数据的候选时从稀疏候选中选取并标「低可信」（稀疏候选同样要求有数据的天余量 ≥30%，达不到就不出 Plan B，2026-11-05 确认）。
6. 「无数据」显示为灰色斜线，绝不显示为 0%。
7. 排序指标：≤15 天路径用 CMR_min，＞15 天路径用重叠船数。不使用综合评分。
8. 成品销售船从装港侧（本港装货）反推，截止日 = 最晚装船日；物资备件船借用大宗航线航程样本（先用自己的规则，没有才借用，2026-11-05 确认）；外贸客户港 ETA 用反向近似，仅供参考。
9. 在港判断只比较日期，不比较时刻。
10. 规则引擎输出的数值不得被任何生成式模型改写；宣船文案只能引用引擎结果。详情页 S1（参数匹配溯源）是防止模型静默编造的第二道防线。
11. 第一版已移除：DWRS 六维评分、风险标记体系、成本决策模块、Plan C/D、AI 开放问答、天气预报、微信转发。

## 本项目访谈决策 K01–K13（2026-11-04）

见 `docs/implementation-plan.md` 开头的决策表。要点：一期飞书多维表格为主数据、应用为唯一录入入口；航次主表 + 货物明细 + 扩展表；状态由时间节点推导；IMIP 靠船计划快照存应用库；二期应用库转为主数据，多维表格下线。

## 环境与平台约束

- **开发与平台操作全部在 Leyinet 本机完成**：代码主线是本机妙搭平台工作副本（`+init` 拉下来的那个仓库，能 push、能发布），`lark-cli` 的所有操作（+db-execute / npm run dev / +env-set / +release-create）和真实飞书联调都在这里。GitHub 仓库只作文档、交接与代码备份，**不再承载代码开发**。云端环境（访问不到飞书）不再参与开发；历史上云端写的代码只在内存数据 / PGlite / 假飞书上测过。
- 工程结构以 `lark-cli apps +init` 生成的 full_stack 脚手架为准。运行时代码用脚手架规定的 SDK（见脚手架里的 `.agents/skills/`）。后端只用 Node.js。
- 妙搭应用库是 PostgreSQL，建表必须带审计列和 RLS（见平台 SQL 规范）。飞书多维表格到应用库的镜像用妙搭自带的 streaming 同步（`+db-sync-create`），后端不自己轮询多维表格。
- 多维表格接口：批量写每次 ≤500 条；列表每页 ≤500 条；同一个 Base 的写入通过单线程队列串行。
- 密钥只放环境变量（见 `.env.example`），前端绝不出现 App ID / App Secret。
- 企微导出的原始 Excel 含业务数据，不提交到仓库；需要时在会话中以附件提供。

## 文档地图

- `docs/implementation-plan.md`：实施计划书 V1.0 的导出快照。在线版：https://claude.ai/artifact/VM4TLGJqdbd2FJvQAibNfJ
- `docs/schema/`：多维表格 T01–T10、应用库 D01–D12、状态推导规则、迁移清洗规则
- `docs/schema/base-build-checklist.md`：多维表格建设清单（Leyinet 在飞书里照着逐项建表、勾选）
- `docs/schema/base-plan.json`：建表清单的机器可读版（`node scripts/build-base-plan.mjs` 生成）；`docs/schema/base-build-agent-prompt.md`：本机 agent 建表的步骤与提示词
- `docs/development-workflow.md`：开发阶段的流程、环节衔接、Leyinet 需要推进的前置条件、开发进度表
- `docs/scaffold-integration.md`：妙搭脚手架（NestJS + React + Drizzle）接入说明与 Leyinet 的操作步骤；`docs/schema/seed/` 与 `base-seed-agent-prompt.md`：T01/T02/T08 初始数据及录入提示词
- `docs/handoff/`：交接手册（`claude-code-handoff.md`）、代码位置与发布流程（`deploy-flow.md`）、任务书、权限矩阵、定时任务、安全与性能记录
- `docs/local-tasks-prompts.md`：需要 Leyinet 本机 AI 完成的事的完整提示词合集（按顺序）
- `docs/open-questions.md`：待 Leyinet 确认的事项，未确认项不要自行假定
- `docs/data-profile/`：企微导出的列结构与填充统计（不含业务数据）

## 编号约定

K01–K14 是访谈决策；T01–T10 是飞书表；D01–D12 是应用库自有表（D11–D12 是库存断料）；A01–A30 是后端接口；P01–P11 是页面（P11 智能提问是预测入口，导航里排在 P02 前面）；M1–M3 / G1–G3 是里程碑和验收门。

## 本机 Claude Code 接手（2026-11-05）

开发主力是 Leyinet 本机的 Claude Code。**先读 `docs/handoff/claude-code-handoff.md`（完整交接手册）和 `docs/handoff/deploy-flow.md`（两个仓库的分工、同步与发布流程）**；初始化提示词在 `docs/handoff/claude-code-init-prompt.md`。**代码与文档分仓**：代码在平台工作副本 `C:\Users\董金\ssps-miaoda`（Claude 的工作目录）；文档、原型、交接材料在本仓库（`C:\Users\董金\WorkBuddy\SSPS`），本仓库的 `app/` 是冻结的历史备份，不再在里面写代码。目前**没有任何功能上线**，已写的代码只在内存数据 / PGlite / 假飞书上测过。
