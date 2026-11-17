# 07｜性能、I/O 与资源边界审计

审计日期：2026-11-06（Asia/Shanghai）。目前没有功能上线。本文描述现有代码行为与上线风险，不表示已在生产出现。

## 1. 范围、证据与结论

代码仓：C:/Users/董金/ssps-miaoda，分支 sprint/default。本次正式审计开始时 HEAD 为 3eddf0a0dcd10f50e572142a2038efb0c7caf1b3，工作树干净。最终复核时，工作树出现 8 个未提交修改，本次没有对代码执行任何写操作。已读取这些差异并按更新后的可见代码修订本报告：库存摘要已支持不读完整序列；快照各组读取已并行，但逐航次货物读取和独立批次读取仍存在；另两项仅给 P06 货种单元格增加限宽展示。准备阶段的 HEAD 和 7 个未提交修改不再作为本篇基线。本文覆盖该 HEAD 加最终复核的 8 项修改，不覆盖之后的新改动。

范围：engine、adapters、modules/view、modules/prediction、importers、client 数据请求；为核对调用链，追踪 capacity、imports、voyage、ports、lark、兼容表服务及 db/001–004。文档仓 app/ 冻结备份未作为代码审计对象。

本次仅阅读代码、规格、已有构建文件元数据，并执行经过检查的本地测试和不带修复参数的 ESLint。没有读取 .env.local，没有连接真实飞书、妙搭或数据库，没有执行发布、DDL、环境变量、Git 写操作。唯一主动写入的文件是本报告。仓库文件名检查未发现排除依赖、Git 元数据和构建目录之外的 xlsx/xls/csv 文件；这不是对文件内容和 Git 全历史的敏感数据审计。

**结果：1 项 P0 缺陷，1 项 P0 配置风险，11 项 P1 风险；另有 3 项 P2 改进建议。** 最大问题是快照每次产生约 2N 次额外查询；限流重试还存在重复新增的正确性缺陷。没有真实库 EXPLAIN、P95、CPU、RSS、浏览器性能或限流实测，因此不声称某接口已经超时，也不声称某查询在真实库必定不走索引。

下文“实际”指从源码可确定的调用、分配和控制流；复现场景均为合成输入或故障时序，除第 9 节已有测试外，本次没有执行这些 HTTP 请求、导入、服务启动或故障注入。需要真实环境才能确定的延迟、内存阈值和执行计划均单列为证据缺口，不以假飞书耗时替代。

## 2. 规模与评估口径

| 维度 | 资料依据 | 本次采用 |
| --- | --- | --- |
| 航次 N | [实施计划:60](C:/Users/董金/WorkBuddy/SSPS/docs/implementation-plan.md:60) 估计迁移后 3,600、每年新增 1,500；[任务书:437](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/task-book.md:437) 用 2,000；性能记录用 3,000 | 基线 3,000–3,600；边界 50,000。三者是不同用途的数字，不视为同一验收规模 |
| 货物明细 C | [性能记录:3](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/performance-notes.md:3) 用 6,000 明细 / 3,000 航次 | 示例按 C=2N；复杂度保留 C 独立变量 |
| 泊位 B | 用户锁定规则 2、CLAUDE.md：固定德信池 23 个 | 总数 23；查询分母由货量及启用状态决定，不固定成 23 |
| 靠船计划 R | [实施计划:310](C:/Users/董金/WorkBuddy/SSPS/docs/implementation-plan.md:310)、[D04 规格:16](C:/Users/董金/WorkBuddy/SSPS/docs/schema/D-app-db.md:16)：累计历史约 160,000 行/年 | 单批次压力边界 100,000 行为本次估算；累计快照至少按 160,000 行分析。不能把年累计量当成单批有效量 |
| 日历 D | [容量 DTO:6](C:/Users/董金/ssps-miaoda/server/modules/capacity/capacity.dto.ts:6) 最大 90 天；前端 P06 固定请求 60 天 | 30 / 60 / 90 天，重点检查今日起第 15、16 天边界；包含今天的近路径最多 16 个日期 |
| 并发 U | [任务书:230](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/task-book.md:230) 有 20 个并发预测的编号唯一性验收，未找到生产并发上限 | 生产压力假设 U≤50；20 个请求的编号测试不是吞吐验收 |
| 库存 I、S | [任务书:437](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/task-book.md:437) 按 37 品名逐日行估计，未给每物料序列长度上限 | I=37 为基线，S 表示每物料序列长度；趋势输出最多 101 个日期 |

本文其余符号：W=候选窗口个数，L=每窗口天数（默认 3），H=某日竞争船数，M=匹配库存物料且未结束的航次数，E=其变更日志总量，F=云空间文件数，Q=队列积压任务数。

[性能记录:7](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/performance-notes.md:7) 的列表约 0.25 秒、合同搜索约 0.27 秒、兼容刷新约 0.7 秒均来自进程内 PGlite / 假飞书。该文档已明确不能推算真实网络耗时。W53 的“列表 P95＜1 秒、预测＜3 秒”仍注明待业务方确定，只作目标参考。

## 3. 主要发现

### PERF-01｜P0｜缺陷：多批新增在中途限流后会重复写入已成功批次

- **位置与代码事实**：[bitable.ts:46](C:/Users/董金/ssps-miaoda/server/lark/bitable.ts:46)、[bitable.ts:52](C:/Users/董金/ssps-miaoda/server/lark/bitable.ts:52) 把整个切批循环作为一个队列任务；[queue.ts:9](C:/Users/董金/ssps-miaoda/server/lark/queue.ts:9) 重试时重新调用整个任务。前面成功的批次没有保存进度，新增请求未携带批次级幂等标识。兼容表新增通过 [compat.service.ts:78](C:/Users/董金/ssps-miaoda/server/modules/admin/compat.service.ts:78) 可实际到达此路径。
- **冲突依据**：[交接手册 §4.3](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md) 的幂等、失败补偿约定；K08 下游兼容表应保持正确行数。外层 outbox 的逻辑幂等不能撤销同一次调用内部已重复提交的新增。
- **当前复杂度 / I/O**：正常为 ceil(K/500) 个新增 API；最多 4 次重试会重复发送前面成功的批次，最坏接近 5 倍调用和写入量。
- **复现与触发规模**：空目标表新增 1,200 条合成记录；第 1 批 500 成功、第 2 批返回一次 429，随后全部成功。实际调用批大小依次为 500成功、500限流、500成功、500成功、200成功；服务端共新增 1,700 行，函数只返回重试这轮的 1,200 个结果。期望服务端恰有 1,200 行，重试从失败批次继续。
- **影响**：真实限流时发生重复数据和额外配额消耗，不只是变慢。[现有测试:38](C:/Users/董金/ssps-miaoda/server/test/lark.spec.ts:38) 仅让第一批先限流，没有覆盖“已有一批成功”。
- **建议**：以单个批次作为重试与幂等单元，保留已成功批次结果；新增结果不确定时先对账再重放。不要只增大退避时间。
- **验证边界**：控制流可确定上述重复发送；本次没有新建测试或操作真实表。

### PERF-02｜P0｜风险：生产缺失或拼错存储模式时静默进入内存，数据持续占用堆且重启丢失

- **位置与代码事实**：[ports.module.ts:34](C:/Users/董金/ssps-miaoda/server/modules/ports/ports.module.ts:34) 仅严格等于 real 才选真实实现；其他值均进入内存，无生产模式拦截。[memory-import-store.ts:6](C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-import-store.ts:6) 长期保存全部批次、原始行、库存和幂等结果；[memory-prediction-store.ts:5](C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-prediction-store.ts:5) 保存全部运行与文案；[memory-voyage-store.ts:6](C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-voyage-store.ts:6) 保存全部航次、日志、修订和幂等结果，没有淘汰。
- **冲突依据**：K01/K09 的一期主数据与写入边界；[交接手册 §1、§4.2](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md) 明确上线前应配置真实模式，内存仅用于演示、测试。本项是缺少防误配措施的风险，不声称实际部署已误配。
- **当前复杂度**：常驻内存随累计导入行、预测、日志和幂等键线性增长；没有容量上限或落盘。
- **复现与触发规模**：生产启动环境省略 SSPS_STORE，或误写为 REAL；导入两批合成计划并创建航次。实际选择内存、接口可返回保存成功；累计导入越多常驻对象越多，重启后这些业务记录消失。期望生产启动拒绝非显式真实模式，避免接受会丢失的业务写入。
- **影响**：数据丢失风险，以及多实例各有不同数据、进程内存持续增长。没有核实生产配置，也没有实测 OOM 阈值。
- **建议**：生产启动只接受显式 real，其他值失败退出；演示模式显式开启并标明。仅给内存容器加淘汰不能解决业务写入丢失。

### PERF-03｜P1｜风险：每次快照产生 2N 次明细查询，并向数据库无界扇出

- **位置与代码事实**：[live-snapshot.ts:22](C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts:22) 并行加载各组数据，其中包含全量航次；[第 26 行](C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts:26) 对全部航次 Promise.all 调 cargo(id)。真实 [cargo:114](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:114) 先 rowOf 再 cargoRows，每航次 2 条 SQL。明细读完后才 toLite，不会先跳过无窗口航次。快照用于日历、单日详情，以及 [prediction.service.ts:35](C:/Users/董金/ssps-miaoda/server/modules/prediction/prediction.service.ts:35)、第 73/82/91 行的预测、宣船、库存测算、提问解析。
- **依据**：[性能记录:3–5](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/performance-notes.md:3)、W53 真实 I/O 成本；现有批量端口在这里未被使用。不是声称性能记录已经承诺修复所有快照路径。
- **当前复杂度 / I/O**：N 个有效仓储航次时，额外 2N 条 SQL；在存在库存当前批次、忽略事务控制及平台目录调用时，完整快照约为 2N+15 条 SELECT：港口 1、泊位 1、规则 4、航次列表及其字典/ETA 聚合 5、每航次货物 2N、计划批次 1、库存 2、计划有效行 1。若真实库只有仓库声明的镜像索引，逐个编号查询与 JSONB 明细过滤还可能形成 O(N²+NC) 扫描成本；真实计划未知。
- **复现与触发规模**：3,000 航次，各 2 明细，发一次日历请求 → 源码路径约 6,015 条 SELECT；50,000 航次 → 100,015 条。P06 首次加载日历和当日详情各取一次快照，达到约 200,030 条；两个同日详情钩子按查询键去重，不再算第三次快照。期望查询数不随 N 逐条增长，且不以无限 Promise.all 作为并发控制。
- **影响**：即使连接池限制了实际并行，仍会排队执行全部查询；单请求持有大量 Promise 和数据。50 个独立日历请求可安排约 500 万条 SELECT，不能用 PGlite 小样本耗时证明可上线。
- **建议**：快照使用批量明细或数据库聚合；按本港窗口和必要字段加载。解析、宣船仅取所需港口/库存/规则，不应为中文港口名组装全部容量快照。按请求或一致版本复用读结果并限制并发。

### PERF-04｜P1｜风险：列表每页全量读取，导出把全量扫描重复 ceil(N/200) 次

- **位置与代码事实**：[VoyageService.list:120](C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts:120) 全量航次、状态推导；第 123 行全量货物；第 141–142 行内存排序后 slice。[list:106](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:106) 是未过滤的 select 全列，包含备注和多个 JSONB/查找引用列；[cargoByVoyage:122](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:122) 再读全部编号映射和全部明细。前端 [exportAll:38](C:/Users/董金/ssps-miaoda/client/src/pages/Voyages/VoyageListPage.tsx:38) 每 200 条串行请求下一页。
- **依据**：[性能记录:12](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/performance-notes.md:12) 已承认列表全量读，本项保留为已知风险；导出放大未在其本地列表耗时中验证。
- **当前复杂度 / I/O**：每页约 7 条 SELECT，CPU O(N log N+C)，应用内存 O(N+C)；属于内存 offset 式切片，既非数据库 OFFSET，也非 keyset。全部导出约 ceil(N/200)×7 条 SELECT，总读取量 O((N+C)ceil(N/200))。
- **复现与触发规模**：50,000 航次、100,000 明细，导出不筛选的全部航次 → 250 个串行 HTTP 请求、约 1,750 条 SELECT；航次主表和货物表各重复全读 250 次，仅这两部分就传回约 3,750 万行，另有编号映射、字典和 ETA 聚合。期望一个受控导出读过程，普通列表在数据库侧限制页内数据。
- **影响**：导出时长、数据库传输和重复排序放大；并发编辑下各页没有固定快照，还可能重复或遗漏记录。未实测耗时。
- **建议**：筛选、排序、聚合计数下推；稳定排序后按游标读取；导出使用固定版本/快照及有界批次或流式输出。保持状态推导规则，不能为分页改成错误的人工状态筛选。

### PERF-05｜P1｜风险：库存摘要仍逐航次串行读取全部历史日志

- **位置与代码事实**：[inventoryStale:178](C:/Users/董金/ssps-miaoda/server/modules/imports/imports.service.ts:178) 已批量读货物，但第 185 行在航次循环内 await changeLog；[changeLog:293](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:293) 仅按航次过滤，读全列和全部历史日志，再在 JS 判断字段及导入时间。
- **依据**：[性能记录:5](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/performance-notes.md:5) 只解决货物明细查询；库存过期提醒规则见 [imports.service.ts:170](C:/Users/董金/ssps-miaoda/server/modules/imports/imports.service.ts:170)。摘要只需导入后相关到港变更，不需要所有历史节点。
- **当前复杂度 / I/O**：有当前库存时，基础约 9 条 SELECT，再加 M 条串行日志查询；物料匹配约 O(I·C)，日志读取 O(E)。单次数据库往返为 t 时，仅这部分串行等待近似 M·t，不以任何具体 t 充当实测。
- **复现与触发规模**：3,000 个未结束航次均匹配某库存物料，每航次有历史日志 → GET /api/inventory 依次查询 3,000 次日志，即使全部早于本次导入、最终 stale=false 也如此。期望数据库批量过滤到港字段和导入后时间，只返回有关变更。
- **影响**：P02、P03、P11 都会读库存摘要，库存卡片使这些页面承担与摘要体积不成比例的延迟。
- **建议**：增加按航次集合、到港字段、导入时间的批量日志查询；物料相关性规则仍按待确认口径处理，不用性能修改暗中改变业务匹配。

### PERF-06｜P1｜风险：远路径日历和候选返回完整 ships 数组，重复序列化同一批船

- **位置与代码事实**：[densityDay:40](C:/Users/董金/ssps-miaoda/server/engine/capacity.ts:40) 返回 count 及完整 ships；[calendar:51](C:/Users/董金/ssps-miaoda/server/engine/capacity.ts:51) 原样放入每天；[buildCandidates:30](C:/Users/董金/ssps-miaoda/server/engine/recommend.ts:30) 每个重叠窗口重复调用并保留每天数组；[serialize.ts:5](C:/Users/董金/ssps-miaoda/server/engine/serialize.ts:5) stringify 后再 parse，生成响应对象副本。
- **依据**：W53 规模目标，A20 日历与单日详情分开提供；[P02 悬停:189](C:/Users/董金/ssps-miaoda/client/src/pages/Predict/parts.tsx:189) 当前确实用船名列表，不能直接删字段而不调整交互。
- **当前复杂度**：日历计算近路径 O(D近·R)、远路径 O(D远·N)，返回规模 O(D远·H)；预测计算 O(W·L·(R或N)+W log W)，返回中 ships 项数 O(W·L·H)。序列化时重复内容实际展开，不能因 JS 对象共享引用就按一份估算网络和 JSON 内存。
- **复现与触发规模**：合成 50,000 条同吨级、窗口均覆盖今天+16 至 +59 的航次，查询 60 天日历 → 44 天各含 50,000 船，共 220 万个船对象位置。若 30 天远路径预测有 28 个三日候选且每天覆盖这批船，候选明细可达 420 万个船对象位置。期望汇总结果有界，船名按需、分页或通过共享索引获取。
- **影响**：Node JSON 分配、传输、浏览器解析和 React Query 缓存显著放大，即使 SQL 已优化也存在。
- **建议**：引擎每日指标按日期/吨级/模式复用，候选只引用每日统计；日历摘要与分页船舶明细分离，P02 悬停改按需加载或显示有限条并提示总数。

### PERF-07｜P1｜风险：预测窗口没有跨度上限，合法格式即可触发数百万候选

- **位置与代码事实**：[PredictDto:12](C:/Users/董金/ssps-miaoda/server/modules/prediction/prediction.dto.ts:12) 只验证日期形状；[recommend.ts:56](C:/Users/董金/ssps-miaoda/server/engine/recommend.ts:56) 只检查先后和不早于今天；第 28–35 行逐日创建全部候选，没有最大跨度或“无数据终点之后停止”。
- **依据**：W53 的有界资源目标；这里没有已锁定的“最大预测天数”，因此不把日历的 90 天上限冒充预测业务规则。
- **当前复杂度**：O(W·L·(R或N)+W log W) CPU、至少 O(W·L) 候选对象；无数据日期仍分配对象。
- **复现与触发规模**：已有匹配泊位，提交成品销售船、50,000 吨、本港装港、窗口 2026-11-06 至 9999-12-31。实际通过现有日期形状和先后校验，尝试构造约 291 万个候选；即使没有任何容量数据也不是立即拒绝。期望在进入引擎前明确拒绝超出约定资源/业务范围的请求。
- **影响**：单次请求即可长时间占用事件循环并消耗大量堆；具体 OOM 点取决于运行时内存，未实测。
- **建议**：由业务确认预测最大跨度，并加服务端硬限；候选生成、序列化和返回条数另设资源上限。不能把覆盖期后的“无数据”改成 0 或擅自切换路径。

### PERF-08｜P1｜风险：单日明细用逐行 find 回查，可退化为 O(R²)

- **位置与代码事实**：[CapacityService.day:31](C:/Users/董金/ssps-miaoda/server/modules/capacity/capacity.service.ts:31) 每泊位 find 计划行；第 40 行对每条当日明细再从 s.planRows 头部 find 匹配航次。
- **依据**：A20 单日明细和 W53 快速日历；靠船计划原始行必须保留，但展示关联不要求逐行全量搜索。
- **当前复杂度 / I/O**：在快照成本之外，近路径约 O(R+B·R+H·R+H log H)。H 不是最多 23：同泊位日期重叠的多行没有在此聚合成一条。
- **复现与触发规模**：10,000 条不同船名、均为当天有效的池内计划行，分配到 23 个泊位。实际 dayDetail 返回 10,000 行，第 40 行的 find 平均检查约一半计划行，约 5,000 万次比较；期望预建关联索引一次，再线性映射。此规模是异常密集批次压力场景，不是日常同时在港船数的业务估计。
- **影响**：点击一个日期造成同步 CPU 热点，与展示的 23 个泊位数量无关。
- **建议**：在同一批次按稳定行标识或明确的关联键建 Map，并直接携带 matchVoyage。若同船同泊位可重复，先定义关联键，不能用缓存掩盖歧义。

### PERF-09｜P1｜风险：靠船计划查询读 raw 全列、无分页，前端逐行全部渲染

- **位置与代码事实**：[berthRows:39](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:39) 按批次 select 全列；[currentPlanRows:48](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:48) 选择完整 berthPlanRow，包括原始 JSONB raw，再在第 50 行丢弃不需要的字段。接口 [berthBatchRows:104](C:/Users/董金/ssps-miaoda/server/modules/imports/imports.service.ts:104) 内存过滤状态，才去除 raw；[P07:18](C:/Users/董金/ssps-miaoda/client/src/pages/BerthPlan/BerthPlanPage.tsx:18) 取全批，[P07:65](C:/Users/董金/ssps-miaoda/client/src/pages/BerthPlan/BerthPlanPage.tsx:65) 对全部过滤后行生成表格，未分页或虚拟化。
- **依据**：D04 原始快照保留规则要求“存”，不要求每次日历都“读原始 JSON”；W13/W53 要求当前计划读取快。
- **当前复杂度 / I/O**：批次明细 2 条查询但读取 O(R·行宽)；当前计划 1 条查询读取全部 active 行和 raw；前端每次筛选 O(R)，DOM 为 O(命中行数×列数)。状态参数没有下推；不存在 keyset 或数据库分页。
- **复现与触发规模**：单批 100,000 条 active 合成行，raw 每行含额外说明列；打开 P07 → 全批载入，全部命中行建 DOM；再输入一个字符重新扫描并协调表格。访问日历也会从数据库传输 raw，虽然 API 不返回该字段。期望按用途投影、服务端筛选与有界分页。
- **影响**：数据库到 Node 传输、堆峰值、页面解析及输入响应同时受影响；不能把“仅 1 条 SQL”视为读取便宜。
- **建议**：快照只投影引擎字段；批次列表与明细按筛选游标分页，原始行另按需查看；前端有界渲染。复用后仍以批次 ID 保证一致性。

### PERF-10｜P1｜风险：XLSX 仅限单条目解压量，且下载在完整缓冲后才检查大小

- **位置与代码事实**：[xlsx.ts:7](C:/Users/董金/ssps-miaoda/server/lib/xlsx.ts:7) 的 50MB 是单压缩条目上限；第 24–28 行同步解压所有条目并留在 Map，即使只读第一工作表。第 64–90 行又构建共享字符串、grid 和行对象。[上传:13](C:/Users/董金/ssps-miaoda/server/modules/imports/imports.controller.ts:13) 仅限制压缩文件 10MB；[drive.ts:30](C:/Users/董金/ssps-miaoda/server/lark/drive.ts:30) 完整 arrayBuffer 后才检查 20MB。
- **依据**：W52 上传资源限制与 W53 内存评估；[交接手册 §6.7](C:/Users/董金/WorkBuddy/SSPS/docs/handoff/claude-code-handoff.md) 的“50MB 解压上限”容易被误读成整个工作簿限制，实际实现不是。
- **当前复杂度**：O(所有条目解压后总大小+单元格数) 时间/内存；同步解压与解析占用主线程。导入还同时保留输入行、规范化行、raw 引用及写库对象；分批写 500 行没有把整个导入变成流式。
- **复现与触发规模**：合成多工作表 XLSX，压缩后小于 10MB、20 个条目各解压约 40MB。每条都小于 50MB，实际可累计解压约 800MB 后才解析选中的表；期望达到整个工作簿资源预算时提前拒绝、不解压未使用工作表。另让云空间返回远大于 20MB 的流 → 实际先完整分配再报“大于 20MB”，期望读取过程中终止。
- **影响**：在普通导入入口形成事件循环阻塞与堆/Buffer 峰值。未生成此工作簿，未测进程崩溃阈值。
- **建议**：检查累计解压字节、条目数、单元格数与行数，只解压必要条目；下载时按流累计并及时终止。把大导入置于有并发上限的后台任务或 Node worker，保留现有校验语义。

### PERF-11｜P1｜风险：大批兼容刷新与交互写共享队列，且任务无应用级截止时间

- **位置与代码事实**：[lark.module.ts:33](C:/Users/董金/ssps-miaoda/server/lark/lark.module.ts:33) 为同一网关创建一个写队列；[queue.ts:22](C:/Users/董金/ssps-miaoda/server/lark/queue.ts:22) 的 300ms 间隔在整个入队任务结束后；[bitable.ts:54](C:/Users/董金/ssps-miaoda/server/lark/bitable.ts:54)、第 59 行在同一任务内部连续发送多个批次，批次间没有该间隔。[bitable.ts:15](C:/Users/董金/ssps-miaoda/server/lark/bitable.ts:15)、[token.ts:10](C:/Users/董金/ssps-miaoda/server/lark/token.ts:10) 未设置 AbortSignal/应用级截止时间；队列没有长度上限或优先级。
- **依据**：CLAUDE.md 同 Base 串行约束；W53 和性能记录对兼容表真实耗时、限流的待验证项。串行要求不意味着必须让后台整表任务长期独占交互队列。
- **当前复杂度 / I/O**：前台写等待 O(Q+前方任务所有批次)；一次可重试任务退避最多累计 30 秒，另加 API 等待；请求多久由底层默认/网络决定，不能声称“永不超时”。3,000 航次约 6,000 兼容行时，记录数稳定的一轮通常约 12 次列表 API+12 次写 API，表分布造成取整差异。
- **复现与触发规模**：将某表 6,000 行更新先入队，随后入队一条交互保存；前台保存实际等全部 12 个更新批次及其退避，而不是最多等一个批次。让其中一次 fetch 长时间不完成，会继续阻塞后面任务。期望受控任务截止时间、背压及后台/前台公平调度。
- **影响**：后台任务将网络抖动传播到业务员保存；300ms 不能被当成“每个 API 已限速”。多实例各创建独立队列，跨实例是否串行仍需部署证据。
- **建议**：批次级调度与可恢复进度、应用级超时、积压上限和监控；保持同 Base 的全局串行边界，核实平台实例数。不要为提速直接并行写同一个 Base。

### PERF-12｜P1｜风险：当前批次元数据与计划行分开读取，切批时可形成混合快照

- **位置与代码事实**：[live-snapshot.ts:22](C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts:22) 在 Promise.all 中独立发 currentBerthBatch 与 currentPlanRows（第 24 行）。后者 [drizzle-import-store.ts:48](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:48) 按其语句执行时的 is_current 查行，不按一个已确定的批次 ID。写端第 25–30 行事务切批，不能让不同读语句自动获得同一版本。审计期间可见修改将原串行读取改成并行，缩小了部分等待时间，但没有提供读版本绑定。
- **冲突依据**：用户规则 10、[D05/D06 规格:17](C:/Users/董金/WorkBuddy/SSPS/docs/schema/D-app-db.md:17) 要求结果与 S1 对应实际使用的数据批次；W13 整批切换。
- **当前复杂度 / I/O**：两次独立当前批次读取；Promise.all 不提供数据库快照隔离。优化缓存或并发查询若不绑定版本，会继续保留此问题。
- **复现与触发规模**：任意规模即可；请求读到 A 元数据 → 导入事务把 B 切为 current → 请求读有效行，得到 B 行。实际计算用 B 占用，但 [prediction.service.ts:44](C:/Users/董金/ssps-miaoda/server/modules/prediction/prediction.service.ts:44) 及持久化溯源标 A。期望元数据、行、覆盖期来自同一个明确批次。
- **影响**：S1 失去对数值来源的可靠解释；并发导入越频繁，长查询链越容易遇到切批窗口。没有在真实库进行此时序注入。
- **建议**：先取批次 ID，所有计划行按该 ID 读取；或使用能保证同一读版本的组合查询/事务。计算缓存键同时包含计划、航次、泊位版本和业务日期。

### PERF-13｜P1｜风险：常驻预测页重新计算后，日历和当日详情可能继续使用旧 CMR

- **位置与代码事实**：[api.ts:28](C:/Users/董金/ssps-miaoda/client/src/ssps/api.ts:28) 的日历键只有货量/天数，单日键只有日期/货量，没有批次版本、轮询；[PredictPage.tsx:68](C:/Users/董金/ssps-miaoda/client/src/pages/Predict/PredictPage.tsx:68) 重跑仅 setOut，不刷新这些查询。已挂载的 PredictionView 不因相同货量下的新 out 而重新挂载查询。前端实际平台 [QueryProvider:10](C:/Users/董金/ssps-miaoda/node_modules/@lark-apaas/client-toolkit/lib/components/QueryProvider/index.js:10) 设置 refetchOnWindowFocus=false。本结论按当前本地 SDK 实现，不能只套 React Query 默认行为。
- **依据**：用户要求检查缓存是否返回过期 CMR；K01/K04 最新主数据/最新计划及规则 10 的可解释性。历史预测保存原数值是正确的，问题是同页“当前日历”没有跟随新请求刷新。
- **当前复杂度 / I/O**：命中已有活跃查询时 0 次日历重读；“stale”状态本身不等于定时发请求，也不保证数据在 60 秒内更新。后端没有容量计算结果缓存，问题在前端。
- **复现与触发规模**：P02 已展示 A 批次结果与日历；后台导入 B，使某日占用改变；用户保持当前页面、货量不变，再点预测。实际预测 POST 读 B，已有日历/单日查询仍可显示 A；切回窗口也不会因该 SDK 配置自动刷新。期望新结果关联的当前日历同步刷新或明确标出不同数据版本。
- **影响**：同屏出现来自不同批次的容量判断。泊位维护只失效 berths/calendar、靠船计划导入只失效 berth-batches/calendar，均未覆盖 cal-day，见 [Master:22](C:/Users/董金/ssps-miaoda/client/src/pages/Master/MasterPage.tsx:22)、[P07:75](C:/Users/董金/ssps-miaoda/client/src/pages/BerthPlan/BerthPlanPage.tsx:75)。
- **建议**：写入/导入完成后统一刷新关联查询；新预测返回并携带版本，日历与单日详情按版本读取/校验；常驻页面定义明确刷新策略。历史方案仍展示自己的保存快照，不用最新值覆盖历史数值。

## 4. 热点复杂度与 I/O 总表

以下均不包含平台请求中间件内部调用；具体 SELECT 数以存在当前库存、普通非空数据为示例。

| 热点 | 当前 CPU / 数据规模 | 数据库与外部 I/O | 核心判断 |
| --- | --- | --- | --- |
| 快照 | O(N+C+R+库存行+字典)，数据库无相关索引时逐条扫描成本更高 | 约 2N+15 SELECT；不读业务 Base API | 主要瓶颈见 PERF-03 |
| 港口日历 | 预处理 O(N·吨级数+R+B log B)；日期计算 O(D近·R+D远·N) | 每请求重取快照 | **不是 O(泊位×日期×船)**；pool 用 Set 判断，泊位不在日期内层循环 |
| 单日详情 | 快照外 O(BR+HR+H log H) | 每点击重取完整快照 | H 可接近 R，见 PERF-08 |
| 预测 | O(WL(R或N)+W log W)，库存另 O(S) | 快照；运行编号通常 2 SQL，冲突最多 20 轮；保存另有固定事务/方案写入 | 每个候选重复算重叠日期；没有每日指标缓存 |
| 提问解析 / 库存测算 / 宣船 | 实际所需很少，仍先加载完整快照 | 每调用都承担约 2N+15 SELECT；宣船另读保存结果、写文案 | 应缩小数据端口，不改变引擎结果 |
| 航次列表 | O(N log N+C) / 页 | 约 7 SELECT，全量表传输 | 内存切片；导出重复成本 |
| 库存摘要 | O(IC+E) | 约 9+M SELECT，其中 M 串行 | 货物批量化不等于日志批量化 |
| 库存趋势 | 至多 101 日期，每日数次线性扫描 S，最多 3 条曲线，约 O(101S) | 当前库存 2 SELECT，全部品名序列先读回 | 有输出天数/方案数界限，但没有按指定物料下推查询 |
| 靠船计划清洗 | O(RB)，B≤23；摘要额外若干次 O(R) 扫描 | 读泊位、全量航次、全量批次；事务内 ceil(R/500) 个行插入 | 写库分批正确，但输入与清洗结果仍整体驻留 |
| 库存清洗 | O(各品名行数排序之和) | 库存逐日行每 500 批量插入，同一事务 | 先生成全部 flat 行，不是流式 |
| 云空间定时拉取 | 文件排序 O(F log F)，逐文件处理 | ceil(F/200) 列表 API；每文件两表去重查询，已知文件也重复检查；新文件再下载 | 页面普通读取不触发下载；手动 pull 才在请求内同步执行 |
| 兼容刷新 | 全量读取、排序、逐合同生成行 | 列表页按 500，写入按 500；与交互写共享队列 | “dirty 增量触发”仍是整表重写，不是仅更新变化行 |
| View 页面入口 | JSON.stringify 平台上下文，随后模板渲染 | 控制器自身 0 业务查询、0 飞书业务 API | 未发现启动预载或循环 I/O；平台中间件成本未测 |

## 5. 静态成本最高的五类 SQL

排序依据“调用频率×可能读取行数×行宽”，不是实测慢查询榜。以下为等价查询形状，未向真实库发送。镜像真实索引可能被平台或其他操作增补；仓库 schema/SQL 不能证明真实库当前目录。

| 排名 | 查询形状与位置 | 已声明索引评估 | 复杂度 / 触发规模 / 影响 / 建议 |
| --- | --- | --- | --- |
| 1 | m_voyage 按 voyage_no_1 查全部列，[rowOf:60](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:60) | [schema:346](C:/Users/董金/ssps-miaoda/server/database/schema.ts:346) 只列 id、base_record_id 唯一索引；未见 voyage_no_1 索引 | 快照 N 次；仅这些索引时预计每次扫描 N，合计 O(N²)。先消除 N 次查询，再根据真实计划评估编号索引 |
| 2 | m_cargo 的 voyage→link_record_ids 包含指定记录 ID，按 app_detail_id 排序，[cargoRows:113](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:113) | [schema:254](C:/Users/董金/ssps-miaoda/server/database/schema.ts:254) 未声明该 JSONB 表达式 GIN 或排序索引；id/base_record_id 索引不直接服务此条件 | 快照 N 次，可能 O(NC) 过滤及结果排序；用聚合/批量关联读，若保留单条接口，再核实表达式索引是否必要 |
| 3 | m_voyage 全列按 voyage_no_1 排序，[list:106](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:106) | 同上；即使增排序索引也不能减少无 WHERE/LIMIT 的全部结果传输 | 单次 N 行并可能排序；50,000 行导出重复 250 次。过滤、投影、稳定排序和分页下推 |
| 4 | berth_plan_row 关联 current 批次，active 全列按 line_no 排序，[currentPlanRows:48](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts:48) | [001 SQL:166](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:166) 的 (batch_id,row_status) 可用于定位；[001 SQL:109](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:109) 有 current 部分唯一索引；该组合不直接提供 line_no 顺序 | 累计 160,000 行不必全扫，取决于计划；但单批 active=100,000 仍读全部 raw 并可能排序。缩小投影，按实际执行计划考虑覆盖排序索引 |
| 5 | milestone_log 按 voyage_no 读全列，按 changed_at、_created_at 排序，[changeLog:293](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:293) | [001 SQL:63](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:63) 有 (voyage_no,changed_at DESC)，可筛航次；第二排序键及完整排序能否消除需看计划 | M 次串行往返，回读旧值/新值等与摘要无关内容；按物料相关航次集合、changed_at 下限、字段白名单批量查 |

其他已核实路径：inventory_row 有 (batch_id,item_name,stock_date) 索引（[001 SQL:244](C:/Users/董金/ssps-miaoda/db/001-ssps-core.sql:244)）。更新后的库存摘要调用 currentInventory({series:false})，只读错误行及批次摘要；快照与趋势仍用默认完整读取，加载该批次全部物料序列。latestEta 每次对整张 eta_revision 按航次求 max（[voyage-store:87](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-voyage-store.ts:87)），连单条 get 也调用；批次列表无分页；运行日志已限 200 条（[sync-log:15](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-sync-log.ts:15)）。

本次没有执行真实库 EXPLAIN/目录查询，不能把“可能可用”写成“实际走了索引”。当前也没有发现业务列表采用 keyset；航次列表是内存切片，靠船计划、主数据和问题列表是整体返回。

## 6. 页面请求、飞书调用与前端

### 6.1 首屏业务请求数

统计前提：新 QueryClient、有效 SSPS 用户、无请求失败、数据非空，计算至首屏所需数据稳定；不包括平台初始化、鉴权中间件、遥测、外部脚本、静态资源和操作后的请求。相同 queryKey 同期共享的请求只算一次。实际网络数还受缓存、挂载时间和重试影响，下面不是浏览器 HAR 实测。

| 页面 | 首屏业务 HTTP | 依赖与重复点 |
| --- | --- | --- |
| P01 工作台 | 4 个初始查询；用户姓名确定后通常再 1 个 issues | [Workbench:20](C:/Users/董金/ssps-miaoda/client/src/pages/Workbench/WorkbenchPage.tsx:20)：me、ports、voyages、issues(owner空)；me 完成后 issues(owner本人) 换键 |
| P02 预测输入 | 4 | [Predict:50](C:/Users/董金/ssps-miaoda/client/src/pages/Predict/PredictPage.tsx:50)：me、ports、inventory、berths；usePortName 共享 ports。结果出现后再有预测 POST、日历、选中日、可选趋势及可能的 stale 库存重取 |
| P03 预测详情 | 4 个基础查询，随后 berths/day，共约 6；有库存图约 7 | [Detail:27](C:/Users/董金/ssps-miaoda/client/src/pages/Predict/PredictionDetailPage.tsx:27)、[Detail:169](C:/Users/董金/ssps-miaoda/client/src/pages/Predict/PredictionDetailPage.tsx:169)：先等保存结果确定日期；BerthMap 与 Ships 同日期共享 day 查询 |
| P04 航次列表 | 3；按部门改变默认业务筛选时可为 4 | [VoyageList:28](C:/Users/董金/ssps-miaoda/client/src/pages/Voyages/VoyageListPage.tsx:28)：me 未返回先按全部查，返回后业务类型换键再查 |
| P05 航次详情 | 5 | [VoyageDetail:34](C:/Users/董金/ssps-miaoda/client/src/pages/Voyages/VoyageDetailPage.tsx:34)：me、voyage、vessels、berths、ports，即使暂不编辑也加载下拉字典 |
| P06 容量日历 | 5 | [Capacity:17](C:/Users/董金/ssps-miaoda/client/src/pages/Capacity/CapacityPage.tsx:17)：me、ports、berths、60天日历；me 返回后发当天 day。初始两个同日钩子去重；选另一日追加 1 个 |
| P07 靠船计划 | 3 | [BerthPlan:14](C:/Users/董金/ssps-miaoda/client/src/pages/BerthPlan/BerthPlanPage.tsx:14)：me、batches → 当前批次 rows，存在必要的批次依赖 |
| P08 主数据 | 5 | [Master:16](C:/Users/董金/ssps-miaoda/client/src/pages/Master/MasterPage.tsx:16)：me 和四类主数据，不按当前页签延迟加载 |
| P09 数据质量 | 3 | [Quality:14](C:/Users/董金/ssps-miaoda/client/src/pages/Quality/QualityPage.tsx:14)：me、issues、voyages |
| P10 系统管理 | 管理员 2，非管理员 1 | [Admin:14](C:/Users/董金/ssps-miaoda/client/src/pages/Admin/AdminPage.tsx:14)：me 完成后才启用 logs；health 仅切页签后启用 |
| P11 智能提问 | 3 | [Ask:17](C:/Users/董金/ssps-miaoda/client/src/pages/Ask/AskPage.tsx:17)：me、inventory、ports；解析后追加 parse，带物料再触发 stock-plan 和 trend；stock-plan 改变 until 时 trend 可换键再请求 |

P01/P04 的先查后换键会重复承担整个列表/问题读成本。P02/P03/P06 的一次页面加载可以触发多次完整快照，这是比简单“首屏几个 HTTP”更重要的服务器放大量。列表搜索输入直接改查询键，未见去抖或传入 AbortSignal，快速输入也可能产生多次全量列表请求（[VoyageList:32](C:/Users/董金/ssps-miaoda/client/src/pages/Voyages/VoyageListPage.tsx:32)、[api:17](C:/Users/董金/ssps-miaoda/client/src/ssps/api.ts:17)）。

### 6.2 飞书调用数与限流边界

- 普通业务读页面的主数据、航次、日历、预测详情和库存读应用库镜像/自有表，**没有查业务 Base**；不能笼统写成“每次页面加载都读飞书全表”。预测、parse、stock-plan 也没有生成式模型调用。
- 每个 API 仍过角色目录。当前 [role-members.ts:45](C:/Users/董金/ssps-miaoda/server/adapters/platform/role-members.ts:45) 是按用户缓存 10 分钟、负缓存 30 秒、同用户 inflight 合并；第一次需要姓名搜索最多 3 页、每页 20。普通页面业务调用链通常额外 0 次（目录热）或合计 1–3 次平台 SDK 搜索（冷），不是每个请求都查全部角色。50 个不同用户冷启动最坏可安排 150 次 SDK 搜索，未见跨用户节流；实际 SDK 内部请求数和限额未验证。
- 写航次、主数据按一期设计在请求链路同步写飞书，这是 K09 的写路径；“应走镜像”用于业务读取，不能误判所有同步飞书写入都违反规格。自动编号回读还会追加批次读取及有上限的轮询，见 [autonumber.ts](C:/Users/董金/ssps-miaoda/server/lark/autonumber.ts)。
- 兼容表稳定 6,000 行约 12 页读、12 批写，网关 ids 实际调用 listAll 并取回完整记录，非仅服务器端 ID 投影（[gateway:26](C:/Users/董金/ssps-miaoda/server/lark/gateway.ts:26)）。云空间列表每页 200；普通 P07 页面不拉云空间。
- 当前代码写每批≤500、读列表每页≤500；但批次内节流、跨实例串行、失败批次重试仍存在 PERF-01/11 问题。没有真实配额和限流响应证据，不能断言“50 并发必然撞某官方 QPS 上限”。
- health 实现为数据库读取与配置存在性检查，不做真实凭证有效性请求，不能把点击“检测”统计成飞书全链路联通验证。

### 6.3 包体积与渲染

本次没有构建。读取的已有 dist/client 产物文件时间为 2026-11-06 20:37:26；没有提交对应关系或哈希清单证明其等同本次 HEAD，故只作现存产物观察：

| 文件 | 磁盘未压缩字节 |
| --- | ---: |
| [主 JS](C:/Users/董金/ssps-miaoda/dist/client/assets/index-CeLTPRWr.js) | 1,350,724 |
| [Radix JS](C:/Users/董金/ssps-miaoda/dist/client/assets/radix-Cv86-gy3.js) | 74,524 |
| [runtime JS](C:/Users/董金/ssps-miaoda/dist/client/assets/rolldown-runtime-hePW80VL.js) | 716 |
| [polyfills](C:/Users/董金/ssps-miaoda/dist/client/assets/polyfills.js) | 54,501 |
| [CSS](C:/Users/董金/ssps-miaoda/dist/client/assets/index-Bju_Z26z.css) | 276,636 |

[已有 index.html:111](C:/Users/董金/ssps-miaoda/dist/client/index.html:111) 引用主 JS、预加载 Radix/runtime 和 CSS；polyfills 由第 12 行脚本条件注入。前三个 JS 合计 1,425,964 字节；加入 polyfills 后 1,480,465 字节。未测 gzip/Brotli、缓存命中、CDN响应、解析耗时与平台自身脚本大小，不把磁盘字节当真实网络下载量。

当前 [app.tsx:5](C:/Users/董金/ssps-miaoda/client/src/app.tsx:5) 静态导入全部业务页面，未见路由 lazy。各页面 CSS 随静态依赖进入；仅靠 package.json 有 echarts/gsap 等依赖不能推断它们都进入业务首屏。业务 StockChart 是 SVG 实现，没有据此确认图表大包进入首屏。P07/P08/P09 都有全量过滤及行渲染；有明确大规模风险证据的是 PERF-09，其他页面没有 React Profiler 数据，不泛称“所有页面过度渲染”。

## 7. 缓存、启动与内存结论

1. 服务启动业务装配没有主动预加载全部真实航次或计划；real 适配器构造器主要保存依赖。内存模式 seedMaster 仅预置主数据，不能写成“启动预加载 5 万航次”。平台初始化及自动化注册耗时未实测。
2. 后端容量、快照和 loadDict 没有结果缓存；每次请求重读。loadDict 每次 3 个投影查询，快照中规则和航次各调用一次，合计重读两份字典；新建缓存必须覆盖平台 streaming 同步带来的变化，不只本应用写入失效。
3. 前端 me/ports/berths/vessels 的 staleTime 为 60 秒；容量类未显式设置周期刷新。staleTime 是新鲜度判断，不是“到点自动请求”的计时器。当前 SDK 关闭窗口聚焦刷新，见 PERF-13。
4. 不建议直接用“全局缓存几十秒”遮盖 N+1。计算缓存至少区分货量/吨级、日期/业务时区、泊位启用和容量版本、航次版本、计划批次、库存批次；跨实例同步与失效机制目前未证实。
5. 真实模式请求峰值包括：原始 ORM 行、领域对象、Promise、引擎候选、ships 数组、JSON 字符串及 parse 副本。没有测量对象大小，本文只给对象/行数量，不编造“固定占几 GB”。内存误配的常驻增长另见 PERF-02。

## 8. P2 改进建议（不计入缺陷／风险数量）

| 模块 | 当前复杂度 / 触发规模 | 影响与建议 |
| --- | --- | --- |
| 前端路由 | 所有页面静态依赖；只打开工作台也进入共同模块图 | 在有可追溯构建和压缩体积数据后拆分页面、重编辑组件与 CSS；不要根据依赖清单直接删包 |
| 前端请求 | P01/P04 在 me 尚未就绪时发不完整条件的查询；P08 进入一个页签加载四类字典 | 等必要身份条件就绪后查询；按页签启用大字典；搜索去抖并真正传递取消信号。保留有用的 queryKey 去重 |
| 库存趋势端口 | 每次取全部品名的完整序列，再选一个物料；输出范围已≤101天 | 按物料/日期投影读取，或者按不可变库存批次缓存序列；保持错误值和覆盖期语义 |

## 9. 本地验证与未验证事项

执行前已检查 package.json 生命周期、测试文件中的环境/网络/文件写入入口，以及 PGlite、假 Base、假 SDK、XLSX 内存辅助代码；未发现本次选中测试调用真实服务或读取 .env.local 的路径。

| 检查 | 结果 |
| --- | --- |
| npm test（原脚本） | 退出 0，但 tests=0，不能视为测试通过；当前 Windows 命令链的原 glob 没有选中测试，具体 shell 根因未进一步验证 |
| npm test，并以 PowerShell Get-ChildItem 显式附加全部 30 个 spec 文件路径 | 初次及复核变更后的重跑均为 tests=203，pass=197，fail=0，skipped=6；最终重跑约 27.9 秒。这是现有功能测试，不是新增性能基准或对本报告所有场景的复测 |
| 6 个跳过项 | 平台仓不含文档/原型源文件，夹具同步检查自动跳过；没有据此声称夹具与最新文档一致 |
| npx eslint server client/src --quiet | 退出 0，无错误输出，未带 fix/cache 参数 |
| npm run type:check | 未执行：前后端配置启用了 incremental，服务端还继承 composite，noEmit 不保证不写 tsbuildinfo；本次优先遵守代码仓不创建任何文件 |
| npm run smoke | 未执行：脚本先 build:server，写入 dist 并清理测试产物，违反完全只读约束 |
| 真实数据库 EXPLAIN、索引目录、网络 RTT、P95、连接池排队、限流 | 未执行，按授权边界保留缺口 |
| 新构建、浏览器 HAR/Profiler、CPU/RSS 压测 | 未执行；已有产物大小仅见 §6.3 |

最终复核的未提交文件如下，SHA-256 前 16 位用于辨认这次可见快照（不是密钥）：

| 文件（代码仓内） | SHA-256 前 16 位 |
| --- | --- |
| [live-snapshot.ts](C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts) | DEBADE8B4A2D70B3 |
| [drizzle-import-store.ts](C:/Users/董金/ssps-miaoda/server/adapters/drizzle/drizzle-import-store.ts) | 33498A379B8568E4 |
| [memory-import-store.ts](C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-import-store.ts) | 4B42DAD2E3A3892F |
| [imports.service.ts](C:/Users/董金/ssps-miaoda/server/modules/imports/imports.service.ts) | 7A975B6C4E6211B3 |
| [import-store.port.ts](C:/Users/董金/ssps-miaoda/server/ports/import-store.port.ts) | 25BAC5ED353C4688 |
| [drizzle-stores.spec.ts](C:/Users/董金/ssps-miaoda/server/test/drizzle-stores.spec.ts) | 2F757B953B877484 |
| [CapacityPage.tsx](C:/Users/董金/ssps-miaoda/client/src/pages/Capacity/CapacityPage.tsx) | E9567D0A1759EAB8 |
| [p06.css](C:/Users/董金/ssps-miaoda/client/src/pages/Capacity/p06.css) | DF19CECEF81241BA |

缺口与规格差异：

- 性能记录覆盖的是列表/兼容表/库存货物批量读，不能外推到快照和库存日志。该记录没有量化预测、日历的真实 I/O。
- 文档仓 open-questions.md 已有 2026-11-06 部分真实联调记录，与任务背景“从未真实联调”不同；本文只将其视为文档记载，不复述业务内容，不将其作为本次实测证据；没有功能上线的口径保持不变。
- 当前部署实例数、真实索引、飞书配额、最大预测跨度和正式 P95 目标尚缺证据或确认；本文给出解决方向，没有替业务方锁定这些参数。
- 交接手册“50MB 解压上限”与实现“每条目 50MB”应澄清为工作簿累计预算，见 PERF-10。
- 本报告不修改或裁定未确认的业务口径，例如远路径 Plan B 等效门槛、计划覆盖终点、库存品名映射、旧表时区；这些不作为本篇性能缺陷凑数。

## 10. 建议处理顺序

1. 上线前先解决 PERF-01 多批新增重试及 PERF-02 生产内存模式误配防线。
2. 优先处理 PERF-03 快照、PERF-05 库存日志、PERF-04 列表/导出，减少真实网络下不可接受的查询放大。
3. 再限制 PERF-06/07/09/10 的响应、候选、渲染及导入资源，消除单请求资源峰值。
4. 同时用 PERF-12/13 的版本一致性约束指导缓存与查询优化，避免提速后产生过期或混合来源的 CMR。
5. 在另行授权的隔离验证环境补齐 3,600/50,000 航次、累计 160,000 计划快照、50 并发下的 SQL 计数、P95、RSS 与批次中途限流场景；达成目标后再判断是否需要新增索引和进一步缓存。本次未执行这些操作。
