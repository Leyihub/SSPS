# SSPS 引擎审计 01

审计日期：2026-11-06（Asia/Shanghai）。本报告审计代码，不表示任何功能已经上线。

代码仓：`C:\Users\董金\ssps-miaoda`，分支 `sprint/default`。文档仓：`C:\Users\董金\WorkBuddy\SSPS`。下文代码路径相对于代码仓，规格路径相对于文档仓；均附行号。范围是 `server/engine`、`server/domain` 的预测相关逻辑、`server/modules/prediction`、`server/modules/capacity`、`server/nlp` 及对应测试；为核对输入输出，追踪了快照、相关仓储/导入器、预测及容量前端。不是全项目安全审计完成声明，冻结的 `app/` 未作为审计对象。

执行边界：未修改代码仓文件，未读取 `.env.local`，未调用真实飞书、妙搭或数据库；新增实验脚本仅放系统临时目录。报告及复现附录写入文档仓。实验数据全部为人工构造；泊位容量使用规格种子。

版本说明：首次完整测试在 `b27bd134f71ad2f911507cc2824110c19b5baaf4` 执行；审计期间其他工作将 HEAD 更新到 `04825bde4030b274221959f52f761500da4ae4dd`，随后更新到结束核验时的 `2463526f69b3dfc06ac41cbd8430cf08ab823ebe`。本报告核对了变更清单，并对引擎、领域、预测/容量服务、NLP及相关前端建立SHA-256清单；结束核验变化数为0。Drizzle 主数据适配器新增一个 import，相关引用行号已更新。测试结果分版本记录，不把首次完整测试结果视为最终整个工作树通过；其他工作产生的改动未被本次审计覆盖或回退。

## 1. 结论表（规则 × 状态）

结论：存在影响上线判断的 P0 缺陷及风险。原型对照一致可以证明移植一致，不能证明锁定规则正确。先处理下文 D01–D05、R01–R02，再进行真实环境验收。

| 规则 | 状态 | 代码事实与证据 |
| --- | --- | --- |
| 1 只用 CMR 容量口径 | 符合（本轮范围） | 近路径使用 `(n-occ)/n`，远路径保留船数，未发现生效的另一容量综合指标。`server/engine/capacity.ts:36`、`:41`；`server/engine/provenance.ts:21`。远期按船数显示是规则4明确允许的路径。 |
| 2 固定23泊位、容量来源、LN16=1万吨 | 不符合 | 种子23泊位及 LN16 正确：`server/adapters/memory/seed.ts:6`；运行时只筛启用状态，主数据接口允许新增 L1、改变 LN16 容量：`server/engine/capacity.ts:17`、`server/modules/master/master.service.ts:89`、`:98`、`:104`。见 D03。未发现按历史靠泊记录学习或调整容量的逻辑。 |
| 3 按查询货量匹配分母，日历默认5万吨 | 符合（有效货量） | `capacity >= tons` 为包含等号的匹配；默认50000：`server/engine/capacity.ts:22`、`server/modules/capacity/capacity.controller.ts:6`。0、负数和缺失预测货量被拒；无匹配单日明细另有 D06。 |
| 4 按目标日距今分流、远期只计竞争船 | 部分符合 | `server/engine/capacity.ts:44`、`server/engine/recommend.ts:73` 按日期分流，不按数据有无回退。但生产快照“今天”用 UTC，见 D02；竞争吨级公式与跨路径口径仍待确认，见歧义 A02/A03。 |
| 5 仅A/B，B≥30%，稀疏也达标且低可信 | 不符合 | 常规和混合分支落实门槛及标签：`server/engine/recommend.ts:117`、`:120`、`:127`、`:128`、`:139`。告急分支直接取下个窗口，B可为0%：`:108`。见 D01。 |
| 6 无数据全链路不等于0 | 不符合 | 正常日历及逐日明细使用 `state=nodata`，持久化保留 null；零匹配单日明细产生 NaN→null→0%，见 D06。航程缺值也被算成0天，见 R01；未知货量被归为0，见 R04。 |
| 7 近路径按CMR_min、远期按船数，无综合评分 | 部分符合 | `server/engine/recommend.ts:24`、`:34`、`:106` 正常按主指标排序，并列取早日。告急分支仅按日期排：`:109`；是否允许例外与本次锁定规则冲突，见 D01/A01。 |
| 8 销售装港反推、截止最晚装船、备件优先自用、客户ETA参考 | 部分符合 | 销售侧/截止日/ETA计算：`server/engine/recommend.ts:76`、`:154`、`:156`；“仅供参考”：`server/engine/announce.ts:55`。备件按自有规则存在与否选择：`server/domain/routeRules.ts:50`，但自有规则不可计算时不回退，见 R01；样本不足的规格有冲突。销售统计规则仍被部分页面标经验估算，见 D11。 |
| 9 在港只比日期，时区边界正确 | 部分符合 | 占用判断使用日序号且含两端：`server/engine/capacity.ts:35`；`server/domain/compat.ts:46` 只取日期。UTC时钟使业务日及路径错误，见 D02。带时区字符串进入 `dn` 时仅取字面日期，不能当作通用时区转换器。 |
| 10 模型不改数值、宣船引用引擎、S1真实 | 部分符合 | NLP是关键词规则，没有模型调用或 prompt；宣船引用已存溯源：`server/modules/prediction/prediction.service.ts:72`。S1短缺口被覆盖、混合路径目标说明失真：D09/D10。 |
| 11 首版移除模块不得生效 | 符合（本轮范围） | `server/nlp/parse.ts:102` 只解析槽位，`server/engine/recommend.ts:160` 只输出A/B。定向检索未发现生效的 DWRS、成本决策、C/D、开放问答、天气、微信转发实现。注释中提及移除模块不算功能存在。 |
| 12 字段和状态以schema为准、状态由节点推导 | 部分符合 | `server/domain/status.ts:13` 按节点推导8阶段及取消展示；数据库方案字段与 D05/D06 对应。取消航次仍会通过靠船计划影响CMR，违背状态规格第1行，见 D04。销售结束条件及大宗无装港靠泊的假设需保留待确认性。 |

## 2. 缺陷清单（P0 / P1 / P2）

### D01 · P0 · 告急模式绕过 Plan B 的30%门槛，并改变排序口径

- 位置：`server/engine/recommend.ts:108`、`:109`、`:110`；资格计算在 `:141`，只是给结果加 `qualifies=false`，并不阻止返回或采纳。前端也明确写“不再要求港口余量”：`client/src/pages/Predict/parts.tsx:164`。
- 事实：告急模式按最早开始日取 A，再取与 A 不重叠的 B，未调用 `qualify`。常规分支才执行门槛过滤。
- 冲突：本次规则5、7；`CLAUDE.md:35`、`:37`。告急例外尚列于 `docs/open-questions.md:74`，不能覆盖此次明确规则。
- 复现（案例14）：人工启用10个可接5万吨的合法泊位，全部占用；今天11月6日，航程P50/P80=1/2天，库存11月7日断料，缓冲3天。实际 A=11月6–8日、B=11月9–11日，二者CMR_min=0、B.qualifies=false，B仍返回且标“正常”。期望：不得返回这个B；若告急允许不同排序，必须先明确修改规格，不能默默例外。

### D02 · P0 · “今天”取UTC日期，本港凌晨会走错15天路径

- 位置：`server/adapters/memory/live-snapshot.ts:17`（真实模式也使用该类，装配于 `server/modules/ports/ports.module.ts`）；`server/modules/master/master.service.ts:47` 同样返回UTC日期。
- 事实：`new Date().toISOString().slice(0,10)` 取 UTC 日，不是 WITA 业务日；用户前端的 me.today 同样偏移。
- 冲突：规则4、9；`docs/handoff/claude-code-handoff.md:160` 规定 IMIP WITA UTC+8；`server/lib/dates.ts:1` 自己也声明当地日期。
- 复现（案例31）：时钟固定 `2026-11-05T16:30:00Z`，IMIP为11月6日00:30；查询11月21日。实际 today=11月5日、相距16天，走density；期望 today=11月6日、相距15天，走CMR。当天窗口也可能被错判为仍未过期。

### D03 · P0 · 业务接口可扩充固定泊位池并改变LN16容量

- 位置：`server/modules/master/master.service.ts:89`、`:98`、`:104`；`server/engine/capacity.ts:17`、`:22`。
- 事实：泊位维护只校验编码格式、码头、正容量和状态；引擎信任所有启用主档，没有固定编码白名单或容量版本约束。
- 冲突：规则2；`docs/schema/T02-berth.md:5`、`:7`、`:12`、`:14`。
- 复现（案例39，调用实际 MasterService+MemoryMasterStore）：系统管理员新增 L1/5万吨，再把 LN16 改为5万吨。两次保存均成功；总泊位24个，查询5万吨分母由11增至13，LN16=50000。期望：L1不得进入池；LN16维持10000，变更不得通过普通维护绕过固定依据。这里是本地内存调用，没有写真实主档。

### D04 · P0 · 取消航次仅从密度过滤，仍通过靠船计划计入CMR

- 位置：`server/engine/capacity.ts:28`、`:29` 过滤取消航次，但 `:35`、`:62` 使用的靠船计划行没有排除匹配的取消航次；输入结构已有 `matchVoyage`（`server/domain/types.ts:5`）。
- 冲突：规则12及 `docs/schema/status-rules.md:7`：“取消，不进密度和CMR”。这与“池内非德信船也占用”不是同一个条件。
- 复现（案例15）：F3计划行覆盖11月6–11日，matchVoyage=AUDIT-V；对应航次flags含取消；另有覆盖记录延长数据期。查询11月6日5万吨，实际occ=1、CMR=10/11；期望按状态规则排除该匹配取消航次，occ=0、CMR=1。原型也有同样问题。若业务坚持外部计划优先于应用取消，必须修订状态规格后才能按该例外验收。

### D05 · P0 · NLP货量正则截取数字后缀、忽略负号，改变输入吨位

- 位置：`server/nlp/parse.ts:57`、`:60`；解析结果直接用于后续预测参数，见 `client/src/pages/Ask/AskPage.tsx` 的解析流程。
- 事实：吨位正则允许3–6位数字，缺少数字边界和符号处理，会从较长整数中匹配后缀。
- 冲突：规则3、10及解析槽位必须保留用户输入含义的正确性要求；`docs/handoff/claude-code-handoff.md:66` 的引擎数值防线不能修复一个已被错解析的货量。
- 复现（案例42）：`detectTons('1050000吨')` 实际=50000；`detectTons('-50000吨')` 实际=50000。期望分别保留1050000供后续报告“无匹配泊位”，以及拒绝负货量；不得变成合法5万吨查询。用户能手动改参数，不消除默认解析错误。

### D06 · P1 · 无匹配泊位时，单日接口把无数据变成0%

- 位置：`server/engine/capacity.ts:51` 对日历检查P.n，`:58` 的单日明细未检查；`:36` 出现0/0；`server/engine/serialize.ts:5` JSON序列化将NaN变为null；`client/src/pages/Capacity/CapacityPage.tsx:104` 只检查state，执行 `Math.round(det.cmr*100)`；`client/src/ssps/format.ts:4` 同样把null格式化成0%。
- 冲突：规则6；`CLAUDE.md:36`。
- 复现（案例16/33/43）：有靠船计划覆盖，货量180001吨（或该吨级全部停用）。日历返回nodata；单日服务实际 `state=ok, P.n=0, cmr=null`，实际格式化函数输出“0%”。期望统一返回无匹配/无数据标记，前端灰斜线、禁止百分比计算。

### D07 · P1 · 日期DTO只验字符串形状，不存在的日期被静默滚动

- 位置：`server/modules/prediction/prediction.dto.ts:5`、`:12`、`:13`；`server/modules/capacity/capacity.dto.ts:9`；`server/lib/dates.ts:9`。
- 事实：正则接受2月30日，`Date.UTC`自动归一成3月2日，输入保留原字符串而候选使用另一个日期。
- 冲突：规则4、9以及接口日期正确性；`docs/schema/T04-voyage.md` 将窗口定义为日期，未授权对非法日期滚动纠错。
- 复现（案例19/32）：today=2026-02-27，窗口2026-02-30至2026-03-04。DTO实际校验错误列表为空，引擎推荐3月2–4日；期望拒绝不存在的日期，避免用户窗口与计算窗口不一致。

### D08 · P1 · NLP忽略显式年份，远期需求被当作近期需求

- 位置：`server/nlp/parse.ts:94` 捕获年份，`:95` 却仅把月日传入dnOf；dnOf使用当前推定年份，见`:35`。
- 冲突：规则4、9及意图/日期槽位解析正确性。
- 复现（案例34）：today=2026-11-06，输入“2027年11月10日前到港”。实际截止日2026-11-10，outside=false；期望保留2027-11-10，并提示超过60天解析范围，不应代换成当前年份。

### D09 · P1 · S1短缺口日期对象被“断料天数”同名字段覆盖

- 位置：`server/engine/provenance.ts:25`，先写 `gap:{from,to}`，随后 `...plan.stock` 覆盖gap；`server/engine/recommend.ts:145` 中 plan.stock.gap 是数字；`client/src/pages/Predict/PredictionDetailPage.tsx:93` 又把它当对象读。
- 冲突：规则10；S1必须忠实保存引擎使用的参数及解释。
- 复现（案例40）：模拟11月7–9日短缺、11月10日补回、以后再断料。引擎 `res.stock.gap={from:20764,to:20766}`；实际S1的stock.gap=0。期望保留短缺口日期，同时独立保存本方案断料天数；当前详情会丢失短缺口，告急时还可能把数字当对象展示“—”。

### D10 · P1 · 混合预测S1用整体截止日解释近路径方案，溯源自相矛盾

- 位置：`server/engine/recommend.ts:73` 保存整体target，`:29` 按候选起日分流；`server/engine/provenance.ts:14` 每个方案却保存整体target/dist；`client/src/pages/Predict/PredictionDetailPage.tsx:98` 据此解释该方案路径。
- 冲突：规则10；即使跨路径业务策略待确认，S1也应记录实际分流依据。
- 复现（案例46/49）：today=11月6日，库存输入截止12月1日，近远路径均有数据。实际A窗口11月6–8日，planMode=cmr，却保存target=12月1日、dist=25，并说明“≤15天靠船计划、>15天航次表”。期望A记录实际候选起日11月6日及dist=0，整体截止日另列，避免显示“25天却走近路径”。

### D11 · P2 · 销售船统计航程被方案卡写成经验估算

- 位置：`client/src/pages/Predict/parts.tsx:37`、`:81`；对比`:26` 的非销售船展示和 `server/engine/provenance.ts:23`。
- 事实：销售船提示固定写“航程：经验估算”，客户港ETA提示也固定“按经验估算”，没有检查rule.basis。
- 冲突：航程经验/统计标签要求；K06（`docs/implementation-plan.md:16`）。
- 可复现输入（静态可确定，未渲染浏览器）：销售航线规则samples=5、p50=9、p80=12，经buildRule得到basis=统计值。后端及S1均是统计值，方案卡上述两个提示仍为“经验估算”；期望跟随实际basis及样本数。数值未被重算，因此定P2。

### D12 · P1 · Windows下默认npm test可0测试成功退出

- 位置：`package.json:32` 的scripts.test（执行前读取的原始定义为单引号包裹 `server/test/*.spec.ts`）；`server/test/fixtures-in-sync.spec.ts:14` 另外会跳过缺源文件的同步检查。
- 事实与复现：在本机PowerShell执行原样 `npm test`，实际tests=0、exit=0；显式传入测试文件后实际177项中171通过、6跳过。期望质量门在测试发现为0时失败，且跨仓同步应显式验证。本轮已用SHA-256补做跨仓核对。
- 标准：`docs/handoff/claude-code-handoff.md:102` 将npm test作为质量门；“0失败”不能证明测试执行。

### 2.1 真实环境/并发风险（与现存直接触发的缺陷分列）

#### R01 · P0风险 · 真实镜像航程缺值会成为0天航程，备件不回退

- 位置：`server/database/schema.ts:128`、`:129` 的经验航程列可空；`server/adapters/drizzle/drizzle-master-store.ts:99` 保留null；`server/domain/routeRules.ts:19`、`:22`、`:23`、`:52`；`server/engine/recommend.ts:83`、`:149`、`:150` 中 `Math.ceil(null)=0`。
- 触发：真实镜像存在启用规则但样本<5、经验P50/P80为空，例如冷启动不完整行或同步缺值。应用主数据写入会拒绝空经验值（`server/modules/master/master.service.ts:163`），所以不把正常录入路径说成会直接生成该行；风险来自读取可空镜像时没有防线。
- 实验17/29/48：实际PredictionService接受备件自有空规则，返回status=ok、rule=OWN、effP80=null；A发船日与ETA同为11月8日，等效0天，不借用有效同航线大宗规则。期望有效规则缺失时拒绝/显式未知；按 `docs/schema/T08-route-rule.md:7` 自有无经验且样本不足时应借用。规则8摘要与T08措辞差异列入A04，但无论是否借用，都不能编出0天。

#### R02 · P0风险 · 同一方案并发采纳可生成两条航次，关联仅剩后一条

- 位置：`server/modules/prediction/prediction.service.ts:58`、`:60`、`:62`、`:63`，先查adopted再创建航次最后标采纳；`server/adapters/drizzle/drizzle-prediction-store.ts:53` 无条件更新，没有比较并设置；实际创建入口 `server/modules/voyage/voyage.service.ts:356`。
- 标准：A23/服务注释“同一方案只能采纳一次”；`docs/implementation-plan.md:525` 写入一致性要求。
- 复现（案例47，实际PredictionService、VoyageService及内存仓储）：同一未采纳A，同时两个请求、不同幂等键。实际两个请求fulfilled、生成2条航次，方案只关联第二条。期望只有一个成功，另一请求返回已有结果或409。客户端单次点击锁定不能保护两个标签页或多个实例。
- 边界：同一键的飞书写幂等不能替代(runNo,label)业务唯一性；本轮未连接真实飞书，真实并发写的外部效果仍待隔离环境验证。

#### R03 · P1风险 · 当前批次与计划行分次读取，切批时可把新行归给旧批次

- 位置：`server/adapters/memory/live-snapshot.ts:23` 先读批次，再于`:26`读当前计划行；真实适配器 `server/adapters/drizzle/drizzle-import-store.ts:46`、`:48` 分别查询当前指针；两次读取不共享快照或固定batchId。
- 冲突：规则10的S1批次真实性；`docs/implementation-plan.md:525` 对完整切批的要求。
- 触发：第一次读完OLD批次后，导入事务将当前指针切换NEW，第二次取得NEW行。实际快照batchNo=OLD、vessel=NEW_BATCH_ROW（案例36用确定性假端口模拟这个交错）；期望行与元数据属于同一批次。导入事务本身原子，不代表两个独立读取原子。真实DB并发未执行，故列风险。

#### R04 · P1风险/部分待定 · 未知货量被转为0并从远期竞争船中漏掉

- 位置：`server/domain/voyageLite.ts:12` 的 `Number(c.tons)||0`、`server/domain/status.ts:32`；`server/engine/capacity.ts:19`、`:40` 把0货量分到最小吨级；超过最大泊位的货量则tier=null，也被比较运算排除。
- 复现（案例35）：有明确第16–20天窗口的航次，货物tons=null。实际totalTons=0，查询5万吨时count=0。期望至少保留“吨级未知”的不完整性，不能把未知当作确定无竞争。是否计入保守上界需业务确认；当前漏计行为已复现，具体替代算法不自行设定。
- 当前新增录入有货物必填校验；历史/镜像空货量仍可出现。不得将此写为真实环境已发生。

### 2.2 疑似/需补证事项（不计入已确认缺陷数）

1. **ETA区间可能超出被评价的候选窗口**：`server/engine/recommend.ts:149`–`:151` 用窗口末日减P80，再加P50/P80；案例44中航程14/18天，A窗口11月22–24日，实际ETA=11月20–24日，早到两天未纳入该候选CMR。`client/src/pages/Predict/PredictionDetailPage.tsx:107` 却说“落在到港窗口内”。算术及文案不一致确定；是否要求容量覆盖完整ETA范围、或允许窗口外等待，规格尚缺明确约束。建议明确评价区间后再决定引擎修正，不把某种方案自行当标准。
2. **重复计划行的在港船数展示**：`server/engine/capacity.ts:35` 对泊位正确去重；`:62` 明细列表不去重。案例05同艘船同泊位同日重复行，CMR正确但list.length=2；容量页`:103` 按list.length显示“在港船舶”。是否需以船舶、航次或计划行计数需明确；不能因此声称CMR重复占用。
3. **库存null算术与真实读库**：`server/engine/stock.ts:8`可返回null，`server/engine/recommend.ts:143` 的null+货量、null/日耗变成0基数；案例37得到before=null、daysBefore=0、after=50000。标准导入会排除错误行（案例38仅验证日期异常；库存过滤另有现有测试），尚缺“合法当前库存序列中出现该null”的真实输入证据，故不列无条件可达缺陷。读库另有 `server/adapters/drizzle/drizzle-import-store.ts:86` 的Number(null)风险。
4. **结束航次仍有未来计划窗口**：`capacity.ts:29` 只排取消、不排其他结束状态。是否应在density中剔除，需先明确“计划窗口”与实际离港哪个优先；现有状态规则仅明确取消剔除，不能据印象判错。

## 3. 自补边界测试及实际结果

### 3.1 执行与可信范围

- 原样 `npm test`：exit0，0项测试。
- 同一允许入口显式传入全部spec：177项，171通过、6跳过、0失败；这是首次完整测试时的版本结果。跳过项是跨仓夹具同步。
- 自补脚本：49个实验执行项，49项执行完成、0项脚本失败。**这不是“49个业务用例符合规格”**：多数实验记录原型/后端实际输出，缺陷判定按本报告的期望值进行；只有少数项用断言锁定实际观察值。32项为相同人工数据输入的原型/后端对照。
- `npx eslint server client/src --quiet`：exit0，无错误输出。无 `--fix`、无缓存参数。这是审计结束前该次执行的结果，不代表其他工作随后提交的新版本自动通过。
- 未运行 `npm run smoke`：它先执行build并删除构建目录内文件，违反本次代码仓零写入；未运行原样类型检查：`tsconfig.app.json:11`启用incremental，可能写入tsbuildinfo。不把这两项写为通过。
- 无真实环境HTTP、平台RLS、真实Base、浏览器视觉验收结果。PGlite测试明确移除了平台RLS/角色（`server/test/helpers/pg.ts:14`），不能以其通过证明真实鉴权或数据库权限。

跨仓SHA-256核对均一致：

| 文件 | SHA-256 |
| --- | --- |
| prototype/engine.js ↔ fixture | C3BFD2D2B438B733AEC5B15A6977B573F3048585CDD540DFD6447252E96775A3 |
| prototype/mock-data.js ↔ fixture | 1EF0D1726FB7C516F3D938358CFF1A6A334A6BB55A3DAF5837CDD3D6C20B4615 |
| prototype/assets/nlp.js ↔ fixture | FE188490F17D17DFC95F1BF017001C8F47ABC50F9407EEFB1139CC7B3675B600 |
| docs/schema/seed/T02-berths.json ↔ fixture | 1A4D7BB14EBD5D84618B9B2F62A2936087E7958C45375D61C50DC8FA5DB5BD9D |

### 3.2 边界案例结果表

公共基准：今天2026-11-06，T=20763。除特别说明外使用真实23泊位种子、人工靠船计划/航次；“覆盖行”是表外L1的一条inPool=false计划，仅为了将现行算法的覆盖终点延长，不表示认可该覆盖口径。航程规则为人工1/2天。原型在隔离VM中重新装入同一份数据，未使用真实业务数据。完整输入与调用见附录脚本。

| 案例 | 输入/检查 | 实际结果 | 与原型/期望判断 |
| --- | --- | --- | --- |
| 01 | 空计划、空航次 | noCandidate，A/B均空 | 两端一致；无数据处理符合 |
| 02 | 匹配泊位全满 | A的CMR=0，B空 | 两端一致；A允许拥挤、B门槛有效 |
| 03 | 已覆盖、匹配泊位全空 | A=11/6–8，B=11/9–11，CMR=1 | 两端一致；A/B不重叠 |
| 04 | 单F3，11/6–8占用 | 首末日occ=1，11/9=0 | 两端一致；闭区间正确 |
| 05 | 同船同泊位重复两行 | occ=1，列表2行 | CMR两端正确；展示计数待定 |
| 06 | 货量0/-1/缺失/10000/10001/15000/15001/50000/50001/180000/180001 | 分母23/23/0/23/15/15/14/11/8/1/0 | 两端一致；底层poolFor不校验非法货量，不能绕过DTO直接当业务接口 |
| 07 | 预测货量0/-1/缺失/180001 | 前三者货量错误，后者无匹配泊位 | 两端一致；符合 |
| 08 | 日期偏移-1/0/15/16 | cmr/cmr/cmr/density | 两端一致；服务另拒绝过去日期 |
| 09 | 12/31至次年1/2占用 | occ跨年为1，1/3为0 | 两端一致 |
| 10 | 10个合法匹配泊位占7个 | B恰30%仍入选 | 两端一致；≥边界正确 |
| 11 | 10个匹配泊位占8个 | CMR20%，B空 | 两端一致 |
| 12 | 覆盖至第3天、B仅1天有数据且30% | B返回，低可信 | 两端一致；稀疏达标有效 |
| 13 | 同上，已知天仅20% | B空 | 两端一致；稀疏不达标拒绝 |
| 14 | 告急且全满 | B返回、CMR0、qualifies=false | 两端都错，D01 |
| 15 | 计划行关联取消航次 | 仍占F3，occ=1 | 两端都与状态规格冲突，D04 |
| 16 | 180001吨、覆盖有效 | 日历nodata；明细ok、cmr=null | 两端都错，D06 |
| 17 | 启用规则经验值全null | 正常输出同日发船/ETA | 两端同风险，R01 |
| 18 | 备件自有规则停用，大宗启用 | 后端选BULK借用；原型选OFF | 后端对：遵守T08停用状态 |
| 19 | 今天2/27，输入2/30至3/4 | 候选3/2–4 | 两端都静默归一，D07 |
| 20 | 靠船计划缺end | 后端明确日期错误；原型split异常 | 异常文本不同；导入层阻断，不能算业务可达缺陷 |
| 21 | end早于start | 直接喂引擎时该行不占用 | 两端一致；标准导入会标异常而排除 |
| 22 | 第16天只有1万吨船、查询5万吨 | count=0 | 两端一致；是否竞争按暂定口径，A03 |
| 23 | 第16天5万、50001、180001吨三船 | count=2，超最大容量船未计 | 两端一致；超限和竞争边界需确认 |
| 24 | 主档增加启用L1 | 5万吨分母12 | 两端都缺固定池防线，D03 |
| 25 | 缺winStart | 后端返回完整窗口错误；原型抛split异常 | 后端对，原型先解析再校验的缺陷 |
| 26 | 库存首点null、次点正数 | 后端stockout=null；原型=T | 后端对：null不能当0 |
| 27 | strict=true且仅稀疏候选 | 后端给低可信A；原型不给方案 | 按本次规则5后端对；strict是原型v2冲突开关，不在后端DTO中 |
| 28 | 同输入连续10次 | 两端均稳定 | 未发现引擎内部随机结果 |
| 29 | 备件自有空规则+可借大宗规则 | 仍选OWN、等效0天 | 两端同风险，R01及A04 |
| 30 | 窗口始=第15天、止=第17天 | 整窗走cmr | 两端一致；这是按起日分流的暂定解释，A02 |
| 31 | UTC11/5 16:30、本港11/6 00:30 | today错一天，11/21走density | 后端时钟错误，D02 |
| 32 | DTO日期2/30 | 校验0错误，dn归一3/2 | D07接口可达性确认 |
| 33 | CapacityService查询超最大容量 | calendar nodata，day ok/null | D06服务层确认 |
| 34 | “2027年11月10日前” | 解析成2026-11-10，outside=false | D08 |
| 35 | 航次货量null，第16天 | totalTons=0，count=0 | R04 |
| 36 | 读批次后切换，再读行 | batch=OLD，行来自NEW | 确定性交错模拟，R03；非真实数据库并发 |
| 37 | 直接输入库存null点 | before=null，daysBefore=0，after=货量 | 算术已复现，标准入口可达性待补证 |
| 38 | 标准导入缺卸完/卸完早于靠泊 | 分别DATE_MISSING/DATE_INVERTED，anomaly | 过滤有效，不把20/21的直接入引擎行为冒充标准接口漏洞 |
| 39 | 实际主数据服务新增L1、改LN16 | total=24，5万吨分母13，LN16=5万 | D03业务入口确认 |
| 40 | 短缺后补回的库存 | engine gap为日期对象，saved gap=0 | D09 |
| 41 | 桩航次服务并发采纳 | 两请求成功、创建2次 | 初步R02；47用实际航次服务复核 |
| 42 | 1050000吨、-50000吨、50000吨 | 三者均解析50000 | D05 |
| 43 | 将单日null传实际pct函数 | state=ok、cmr=null，显示0% | D06完整数值链确认；未运行浏览器 |
| 44 | 航程14/18天，候选3天 | A11/22–24，ETA11/20–24 | 两端一致；ETA评价范围疑似问题 |
| 45 | 建引擎后原地修改输入泊位容量 | 分母11变10 | 引擎闭包保留对象引用；同一不变输入仍确定。生产读取返回新对象时不必然触发，建议而非P0 |
| 46 | 库存截止第25天，近远均有数据 | A近/B远，整体target=25天 | 两端一致；混合策略待确认，S1解释问题见49 |
| 47 | 实际预测/航次服务并发采纳 | 两请求fulfilled，2条航次，只关联第2条 | R02复现 |
| 48 | 实际预测服务读取备件空规则 | status=ok、effP80=null、发船与ETA同日 | R01服务层确认 |
| 49 | 对混合A构建实际S1 | A近路径，但target=12/1、dist=25 | D10 |

### 3.3 无数据：数据库→适配器→引擎→DTO/接口→前端

| 层/位置 | 转换或保护 | 判断 |
| --- | --- | --- |
| `db/001-ssps-core.sql:305`；`server/database/schema.ts:531` | cmr_min/max_ships可空，没有默认0 | 正确；近远指标分别存，不把另一条路径设0 |
| `server/adapters/drizzle/db.ts:5` | null/undefined先返回null，否则Number | null保护有效；空字符串会转0，仍需数据类型约束 |
| `server/adapters/drizzle/drizzle-prediction-store.ts:32`、`:48` | 保存cmr先判空，读取经num；maxShips用??null | 正常缺失指标保留null |
| `server/adapters/drizzle/drizzle-master-store.ts:65` | `Number(capacityTonnage ?? 0)`，缺状态默认启用 | 缺容量变0，而非未知；会改变分母/吨级集合，需真实镜像完整性校验 |
| 同文件`:99` | exp/p50/p80先判null；samples缺失变0 | 航程值保留null，随后引擎运算出问题（R01）；样本数0是有意降级 |
| `server/adapters/drizzle/drizzle-import-store.ts:42`、`:50` | 计划货量用num；日期缺失变空字符串 | 数值null保留；空日期直接入引擎会抛错，但正常导入先过滤 |
| 同文件`:86` | `Number(r.stock)`、`Number(r.dailyUse)` | 非错误行若库值null，转0；错误行在`:85`先排除，不能不加条件定为必现 |
| `server/domain/voyageLite.ts:12` | `Number(c.tons)||0` 后求和 | 缺失/空字符串/NaN都变0，影响远期竞争（R04） |
| `server/domain/status.ts:32` | 求和后 `|| v.tons || 0` | 0和缺失混在一起，不能用于证明货量完整性；兼容层总吨位同类转换在`server/domain/compat.ts:43` |
| `server/domain/routeRules.ts:19`、`:22` | 样本不足选经验值，但未校验经验值完整 | null保持至Math.ceil后变0（R01） |
| `server/engine/capacity.ts:33`、`:39` | 超覆盖返回nodata，无数字字段 | 正常保护有效；覆盖定义尚待确认 |
| 同文件`:35`、`:36` | Set按泊位去重；正常除法 | 分母非0正确；dayDetail漏P.n保护导致NaN（D06） |
| 同文件`:40` | 比较 `v.tier >= P.tier` | tier=null会参与数值比较；不可直接解释为已确认无竞争 |
| `server/engine/recommend.ts:31`、`:34` | 仅state=ok参与min/max；没有ok日metric=null | 正常无数据不进最小值/最大值 |
| 同文件`:22` | CMR比较≥0.3-1e-9；远期≤floor(n×0.7) | 23泊位整数占用下恰30%测试通过；不是先四舍五入再比30% |
| 同文件`:149`、`:150`、`:156` | Math.ceil航程 | null会变0，NaN可传播；R01 |
| `server/engine/stock.ts:18` | `v || it.daily || 1` | 0/未知日耗可退到1，属于可能自造数据的风险；正常导入的可达性需单列验证 |
| 同文件`:22`、`:31`、`:35`、`:37` | 断料检查均显式排除null | 后端优于原型，null点不直接判断料 |
| `server/engine/recommend.ts:143`、`:145` | before+tons、before/daily、Math.floor | 库存before=null变0参与运算，见疑似项3 |
| `server/engine/serialize.ts:5` | JSON序列化 | undefined字段省略；NaN/±Infinity变null。不能靠此区分合法null和算术错误 |
| `server/engine/provenance.ts:5`、`:18`、`:26` | 无效日序/无数据日/无候选指标显式null或nodata | 正常保护有效；gap字段覆盖另见D09 |
| `prediction.dto.ts:9`、`capacity.dto.ts:5`、`:10` | Type(Number)+Min(1) | null/空→0后被Min拒绝；缺失预测货量被拒；日历缺货量在controller默认50000 |
| `server/nlp/parse.ts:8`、`:58`–`:60`、`:107` | 解析数字；`ov.tons || detectTons` | 正则截断见D05；手工覆盖0会回退到原文值，属于0与未填混用 |
| `client/src/pages/Predict/parts.tsx:13` | `x.occ || 0` 后Math.max | 缺数据日以0进入“峰值占用”；至少1天有效的常规方案下不改变最大值，但丢失缺失语义 |
| 同文件`:18`、`:108`、`:204` | 逐日/候选/日历先看state、none、pool.n | 正常灰斜线保护有效 |
| `client/src/ssps/format.ts:3`、`:4` | fmt先判空；pct不判空 | fmt(null)=—，pct(null)=0%，D06 |
| `client/src/pages/Capacity/CapacityPage.tsx:104`、`:109` | 百分比只看state；无数据船数标题仍写0艘 | 百分比D06确定；0艘标题虽下方说明“不是0艘”，仍建议统一未知显示 |
| `client/src/pages/Predict/PredictPage.tsx:18`、`:74` | 表单Number(...)||0 | 提交时后端DTO会拒绝0；不能作为无数据指标显示的兜底 |
| `client/src/pages/Ask/AskPage.tsx:52`、`client/src/pages/Predict/parts.tsx:124` | so/latest用||0只计算图表展示上限 | 不直接修改引擎断料日，不误报成CMR=0漏洞 |

无数据灰斜线CSS存在于 `client/src/ssps/ssps.css:12`、`:71`，容量页 `.dc.nd` 在 `client/src/pages/Capacity/p06.css:39`。这里只核对代码分支和样式定义，未声称完成浏览器截图验收。

### 3.4 确定性、模型及S1边界

引擎不调用Date.now、Math.random，也没有异步预测计算。NLP的 `new Date(T*DAY)`、日期格式化的 `new Date(n*DAY)` 均由输入决定；时间依赖位于LiveSnapshot及服务记录元数据。createEngine可传today，LiveSnapshot可注入today函数。相同不变输入重复10次稳定（案例28）。

严格说工厂闭包未深拷贝输入，调用方原地修改泊位对象可改变结果（案例45）。规则选择用数组find，同一路线出现重复启用规则时依赖数组次序；服务校验通常防止重复，真实适配器按ruleNo排序。日明细同日并列保持输入顺序；这影响展示顺序，不等同推荐非确定。

NLP只有关键词/正则/日期槽位解析，没有模型SDK、提示词构造或向模型发送用户文本，因此本轮没有“用户文本直接拼接prompt”的注入面。关键词打分是船型识别，不是移除的DWRS或综合推荐评分。宣船由 `announceFromProvenance`固定模板引用保存值，未发现生成式模型改数值路径。用户输入及主数据文本仍须由React正常转义，这不构成已证实的LLM注入。

S1的大部分容量/航程/逐日数字直接来自该次引擎结果，宣船随后不会重新算；但D09/D10及R03会让解释或来源失真。详情页另展示当前库存，`PredictionDetailPage.tsx:88`已有“与预测当时批次可能不同”的提示；这部分不是冻结快照，不应拿它与该次预测值混合验算。

## 4. 规格歧义与建议

| 编号 | 冲突或缺口 | 建议处理 |
| --- | --- | --- |
| A01 | 告急例外允许不比较余量仍待确认（open-questions:74），锁定规则5/7却要求B达标、固定排序 | 本次按锁定规则判D01；若要保留告急优先，明确A排序可否例外，并单独说明B仍必须达标或取消B。 |
| A02 | 普通窗口按起日统一分流、库存按候选起日分流、跨15天窗口内每天是否切换，仍列待确认（open-questions:22、:75） | 定义目标日到底指整个输入、候选起日还是逐日；保留案例30/46为业务验收样例。 |
| A03 | 竞争船判断为needTier(v)≥needTier(query)尚未确认（open-questions:26）；小船也可能用大泊位；超最大容量tier=null | 明确“竞争”集合以及未知/超限货量处理；未确认前标远期低可信，不能声称当前公式唯一正确。 |
| A04 | 本次规则8“没有自己的规则才借用”，T08:7“没有或样本不足且无经验值时借用”，open-questions:115又写“不足5条再借用” | 给出自有统计、自有经验、借用大宗三者优先级；不论选择哪条规则，都必须拒绝空值算0天。 |
| A05 | 覆盖终点用最后靠泊日还是最后卸完日未确认（open-questions:24、:126） | 现代码/原型都取最后靠泊日；即使之后仍有占用也nodata。不能擅改成最大卸完日；用长占用单船与历史批次场景确认覆盖起止与过期策略。 |
| A06 | 远期B用count≤floor(n×70%)是暂定替代口径（open-questions:20），远期没有真实CMR | 明确它是船数阈值，不把该近似声明为实测CMR；正式验收前确认。 |
| A07 | 原型v2提出移除低可信/S1、strict不降级（open-questions:31、:32），与此次规则相反 | 以此次锁定规则验收；不要为消除strict差异把后端改成原型v2。 |
| A08 | 销售卸港靠泊即结束仍待确认（status-rules:17）；大宗不记录装港靠泊的条件未有独立字段 | 保留当前假设，要求业务以具体节点样例确认；不自行新增字段或状态。 |
| A09 | P50/P80插值、90天样本上限、吨级档及海船/驳船区分未锁定（open-questions:93、:125、:127） | 目前只能确认代码采用线性插值和集中配置，不能由算法常识代替业务批准。 |
| A10 | 经验航程标签要求与销售卡固定文案冲突；客户ETA是否复用反向航线样本缺完整口径 | 修正标签不改变数值；单独确认外贸参考ETA的航线方向与样本来源，继续保留“仅供参考”。 |

建议处理顺序：先阻断错误货量、错日期和不合格B，锁住固定泊位依据与取消排除；再补真实镜像缺值保护、采纳业务唯一性、批次一致读取；最后修复S1及展示问题。以上仅为修复方向，本次未实施代码修改。

剩余验证边界：真实平台类型/镜像值形状、真实并发事务、业务样例验收及浏览器视觉均未执行；受本次只读/不连接真实服务约束，这些属于明确保留项。当前报告不覆盖完整Lark写链路、RLS、安全、导入迁移及全前端审计，不能据此批准全项目上线。

## 附录：可复现实验脚本与实际输出

以下脚本只使用人工数据、内存仓储及本地原型文件。保存到代码仓之外的临时目录后，可在代码仓通过允许的 `npm test -- <脚本绝对路径>` 执行；不要把脚本写入代码仓。TSX_DISABLE_CACHE=1用于避免转换缓存。脚本路径中两个仓库位置需按本机实际位置调整。
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createEngine, stock, toApiResult, buildProvenance } from 'C:/Users/董金/ssps-miaoda/server/engine/index.ts';
import { buildRule } from 'C:/Users/董金/ssps-miaoda/server/domain/routeRules.ts';
import { dn, iso } from 'C:/Users/董金/ssps-miaoda/server/lib/dates.ts';
import { createParser } from 'C:/Users/董金/ssps-miaoda/server/nlp/parse.ts';
import { LiveSnapshot } from 'C:/Users/董金/ssps-miaoda/server/adapters/memory/live-snapshot.ts';
import { CapacityService } from 'C:/Users/董金/ssps-miaoda/server/modules/capacity/capacity.service.ts';
import { PredictDto } from 'C:/Users/董金/ssps-miaoda/server/modules/prediction/prediction.dto.ts';
import { toLite } from 'C:/Users/董金/ssps-miaoda/server/domain/voyageLite.ts';
import { normalizeBerthPlan } from 'C:/Users/董金/ssps-miaoda/server/importers/imipPlan.ts';
const req=createRequire('C:/Users/董金/ssps-miaoda/package.json');
const {validateSync}=req('class-validator'); const {plainToInstance}=req('class-transformer');
const root='C:/Users/董金/ssps-miaoda', doc='C:/Users/董金/WorkBuddy/SSPS';
const source=fs.readFileSync(doc+'/prototype/engine.js','utf8');
const seed=JSON.parse(fs.readFileSync(root+'/server/test/fixtures/T02-berths.json','utf8')).map(b=>({code:b['泊位编码'],terminal:b['码头'],capacity:b['容量吨级（吨）'],status:b['状态']}));
const TODAY='2026-11-06',T=dn(TODAY),d=n=>iso(T+n),BULK='大宗采购船',PROD='成品销售船',SPARE='物资备件船';
const rr=(patch={})=>buildRule({id:'R-AUDIT',load:'AUDIT_LOAD',disch:'BAHODOPI',biz:[BULK,SPARE],exp:1,expMax:2,samples:0,status:'启用',...patch});
const row=(code,s,e,patch={})=>({berth:code,inPool:true,start:d(s),end:d(e),eta:d(s),vessel:'SYNTHETIC',cargo:'AUDIT',tons:50000,...patch});
const cover=n=>row('L1',n,n,{inPool:false});
const voy=(s,e,tons,patch={})=>({id:'AUDIT-V',flags:[],winStart:d(s),winEnd:d(e),totalTons:tons,vessel:'SYNTHETIC',load:'AUDIT_LOAD',disch:'BAHODOPI',biz:BULK,localSide:'卸',status:'航行中',...patch});
const base=(patch={})=>({today:TODAY,berths:structuredClone(seed),planRows:[],voyages:[],routeRules:[rr()],batchNo:'BP-AUDIT',...patch});
const input=(patch={})=>({biz:PROD,tons:50000,load:'BAHODOPI',disch:'AUDIT_CLIENT',winStart:d(0),winEnd:d(8),...patch});
const proto=data=>{const window={MOCK:{...structuredClone(data),berthPlanRows:structuredClone(data.planRows),batch:{batchNo:data.batchNo},user:{name:'AUDIT'},ports:[],inventory:{items:[]}}};const ctx=vm.createContext({window});vm.runInContext(source,ctx);return window.ENGINE;};
const plain=x=>JSON.parse(JSON.stringify(x,(_k,v)=>Object.prototype.toString.call(v)==='[object Set]'?[...v]:v));
const snap=r=>({errors:r.errors,noRule:!!r.noRule,noCandidate:!!r.noCandidate,mode:r.run?.mode,rule:r.run?.rule?.id,borrowed:r.run?.borrowed===true,urgent:!!r.urgent,plans:r.plans?.map(p=>p?{label:p.label,from:iso(p.c.s),to:iso(p.c.e),metric:p.c.metric,mode:p.mode,trust:p.trust,qualifies:p.qualifies,depart:p.depart==null?null:iso(p.depart),eta:p.etaFrom==null?null:[iso(p.etaFrom),iso(p.etaTo)],stock:p.stock}:null)});
const take=f=>{try{return plain(f())}catch(e){return {throws:e.message}}};
function pair(id,data,f){test(id,()=>{const backend=take(()=>f(createEngine(data))),prototype=take(()=>f(proto(data)));console.log('AUDIT '+JSON.stringify({id,backend,prototype,equal:JSON.stringify(backend)===JSON.stringify(prototype)}));});}
const ten=seed.filter(b=>b.capacity>=50000).slice(0,10), occupied=(n,s=0,e=20)=>ten.slice(0,n).map(b=>row(b.code,s,e));
pair('01_empty',base(),E=>snap(E.predict(input())));
pair('02_full',base({planRows:[...seed.map(b=>row(b.code,0,20)),cover(20)]}),E=>snap(E.predict(input())));
pair('03_free',base({planRows:[cover(20)]}),E=>snap(E.predict(input())));
pair('04_single_closed',base({berths:[seed.find(b=>b.code==='F3')],planRows:[row('F3',0,2),cover(3)]}),E=>[0,2,3].map(k=>E.dayDetail(T+k,50000)));
pair('05_duplicate',base({berths:[seed.find(b=>b.code==='F3')],planRows:[row('F3',0,2),row('F3',0,2),cover(3)]}),E=>E.dayDetail(T,50000));
pair('06_tonnage_boundaries',base(),E=>[0,-1,undefined,10000,10001,15000,15001,50000,50001,180000,180001].map(tons=>({tons:tons??'missing',n:E.poolFor(tons).n,tier:E.poolFor(tons).tier})));
pair('07_invalid_tons_predict',base(),E=>[0,-1,undefined,180001].map(tons=>snap(E.predict(input({tons})))));
pair('08_day_offsets',base({planRows:[cover(30)],voyages:[voy(16,30,50000)]}),E=>[-1,0,15,16].map(k=>({k,mode:E.modeOf(T+k),detail:E.dayDetail(T+k,50000)})));
pair('09_cross_year',base({today:'2026-12-30',planRows:[{...row('F3',0,0),start:'2026-12-31',end:'2027-01-02',eta:'2026-12-31'},{...cover(0),start:'2027-01-03',end:'2027-01-03',eta:'2027-01-03'}]}),E=>['2026-12-31','2027-01-01','2027-01-02','2027-01-03'].map(x=>E.dayDetail(dn(x),50000).occ));
pair('10_B_exact_30',base({berths:ten,planRows:[...occupied(7),cover(20)]}),E=>snap(E.predict(input())));
pair('11_B_below_30',base({berths:ten,planRows:[...occupied(8),cover(20)]}),E=>snap(E.predict(input())));
pair('12_sparse_B_30',base({berths:ten,planRows:[...occupied(7),cover(3)]}),E=>snap(E.predict(input({winEnd:d(5)}))));
pair('13_sparse_B_20',base({berths:ten,planRows:[...occupied(8),cover(3)]}),E=>snap(E.predict(input({winEnd:d(5)}))));
const item={name:'AUDIT_STOCK',type:'AUDIT',stock:100,daily:100,series:Array.from({length:41},(_,k)=>[T+k,Math.max(0,100-k*100),100])};
pair('14_urgent_B_zero',base({berths:ten,planRows:[...occupied(10),cover(20)]}),E=>snap(E.predict(input({biz:BULK,load:'AUDIT_LOAD',disch:'BAHODOPI',item,buffer:3,pathBy:'end'}))));
pair('15_cancelled_CMR',base({planRows:[row('F3',0,5,{matchVoyage:'AUDIT-V'}),cover(10)],voyages:[voy(0,5,50000,{flags:['取消']})]}),E=>E.dayDetail(T,50000));
pair('16_no_capacity_detail',base({planRows:[cover(20)]}),E=>({calendar:E.calendar(180001).days[0],detail:E.dayDetail(T,180001)}));
pair('17_missing_rule_values',base({planRows:[cover(20)],routeRules:[rr({exp:null,expMax:null})]}),E=>snap(E.predict(input({biz:BULK,load:'AUDIT_LOAD',disch:'BAHODOPI'}))));
pair('18_disabled_own_rule',base({planRows:[cover(20)],routeRules:[rr({biz:[SPARE],status:'停用',id:'OFF'}),rr({biz:[BULK],id:'BULK'})]}),E=>snap(E.predict(input({biz:SPARE,load:'AUDIT_LOAD',disch:'BAHODOPI'}))));
pair('19_invalid_calendar_date',base({today:'2026-02-27',planRows:[{...cover(0),start:'2026-03-10',end:'2026-03-10',eta:'2026-03-10'}]}),E=>snap(E.predict(input({winStart:'2026-02-30',winEnd:'2026-03-04'}))));
pair('20_missing_end',base({planRows:[row('F3',0,3,{end:null})]}),E=>E.calendar(50000));
pair('21_inverted_interval',base({planRows:[row('F3',3,1),cover(5)]}),E=>E.dayDetail(T+2,50000));
pair('22_small_vessel_competition',base({voyages:[voy(16,20,10000)]}),E=>E.dayDetail(T+16,50000));
pair('23_exact_tier_competition',base({voyages:[voy(16,20,50000,{id:'V1'}),voy(16,20,50001,{id:'V2'}),voy(16,20,180001,{id:'V3'})]}),E=>E.dayDetail(T+16,50000));
pair('24_offpool_enabled_master',base({berths:[...seed,{code:'L1',capacity:50000,status:'启用'}],planRows:[cover(20)]}),E=>E.poolFor(50000).n);
pair('25_missing_window',base(),E=>snap(E.predict(input({winStart:undefined}))));
pair('26_null_stock_point',base(),E=>({stockout:E.stockout?E.stockout({series:[[T,null,100],[T+1,1000,100]]}):stock.stockout({series:[[T,null,100],[T+1,1000,100]]})}));
pair('27_strict_sparse',base({planRows:[cover(1)]}),E=>snap(E.predict(input({strict:true,winEnd:d(4)}))));
pair('28_repeat_stability',base({planRows:[cover(20)]}),E=>{const vals=Array.from({length:10},()=>JSON.stringify(snap(E.predict(input()))));return {stable:new Set(vals).size===1};});
pair('29_missing_experience_spare',base({planRows:[cover(20)],routeRules:[rr({id:'OWN',biz:[SPARE],exp:null,expMax:null}),rr({id:'BORROW',biz:[BULK]})]}),E=>snap(E.predict(input({biz:SPARE,load:'AUDIT_LOAD',disch:'BAHODOPI'}))));
pair('30_cross_day15_window',base({planRows:[cover(30)],voyages:[voy(16,30,50000)]}),E=>snap(E.predict(input({winStart:d(15),winEnd:d(17)}))));
test('31_UTC_today',async()=>{const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-05T16:30:00Z']))}} as any;try{const s=new LiveSnapshot({ports:async()=>[],berths:async()=>[],routeRules:async()=>[]} as any,{list:async()=>[]} as any);const data=await s.load();console.log('AUDIT '+JSON.stringify({id:'31_UTC_today',backend:{today:data.today,target:'2026-11-21',mode:createEngine(data).modeOf(dn('2026-11-21'))},expected:{today:'2026-11-06',mode:'cmr'}}));}finally{globalThis.Date=RealDate;}});
test('32_DTO_invalid_date',()=>{const dto=plainToInstance(PredictDto,input({winStart:'2026-02-30',winEnd:'2026-03-04'}));console.log('AUDIT '+JSON.stringify({id:'32_DTO_invalid_date',errors:validateSync(dto).map(e=>e.property),normalized:iso(dn(dto.winStart))}));});
test('33_capacity_service_no_match',async()=>{const data=base({planRows:[cover(20)]});const svc=new CapacityService({load:async()=>data} as any);console.log('AUDIT '+JSON.stringify({id:'33_capacity_service_no_match',calendar:(await svc.calendar(180001,1)).days[0],detail:(await svc.day(TODAY,180001)).detail}));});
test('34_NLP_explicit_year',()=>{const p=createParser({today:TODAY,ports:[],items:[]});const r=p.parse('2027年11月10日前到港');console.log('AUDIT '+JSON.stringify({id:'34_NLP_explicit_year',actual:iso(r.b),outside:r.outside,expected:'2027-11-10 or outside horizon'}));});
test('35_unknown_cargo_density',()=>{const v={id:'U',load:'AUDIT_LOAD',disch:'BAHODOPI',planDischS:d(16),planDischE:d(20),biz:BULK,flags:[],vessel:'SYNTHETIC'};const lite=toLite(v as any,[{tons:null}] as any);const E=createEngine(base({voyages:[lite]}));console.log('AUDIT '+JSON.stringify({id:'35_unknown_cargo_density',tons:lite.totalTons,detail:E.dayDetail(T+16,50000)}));});
test('36_batch_race_provenance',async()=>{const imports={currentBerthBatch:async()=>({batchNo:'OLD',planDate:TODAY}),currentInventory:async()=>({items:[],batch:null}),currentPlanRows:async()=>[row('F3',0,2,{vessel:'NEW_BATCH_ROW'}),cover(20)]};const master={ports:async()=>[],berths:async()=>seed,routeRules:async()=>[rr()]};const s=await new LiveSnapshot(master as any,{list:async()=>[]} as any,imports as any,()=>TODAY).load();console.log('AUDIT '+JSON.stringify({id:'36_batch_race_provenance',batch:s.berthPlanBatch.batchNo,vessel:s.planRows[0].vessel}));});
test('37_null_stock_math',()=>{const E=createEngine(base({planRows:[cover(20)]}));const r=E.predict(input({item:{name:'AUDIT_NULL',stock:null,daily:100,series:[[T,null,100]]}}));console.log('AUDIT '+JSON.stringify({id:'37_null_stock_math',stock:r.plans[0].stock}));});
test('38_import_invalid_dates',()=>{for(const patch of [{end:null},{start:d(3),end:d(1)}]){const r={...row('F3',0,2),...patch};const out=normalizeBerthPlan([{'泊位':r.berth,'船名':'SYNTHETIC','预计到港':r.eta,'预计靠泊':r.start,'预计卸完':r.end}],{importDate:TODAY,poolCodes:seed.map(b=>b.code)});console.log('AUDIT '+JSON.stringify({id:'38_import_invalid_dates',input:patch,status:out.rows[0].status,issue:out.rows[0].issue.code}));}});
import { MasterService } from 'C:/Users/董金/ssps-miaoda/server/modules/master/master.service.ts';
import { MemoryMasterStore } from 'C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-master-store.ts';
import { seedMaster } from 'C:/Users/董金/ssps-miaoda/server/adapters/memory/seed.ts';
import { PredictionService } from 'C:/Users/董金/ssps-miaoda/server/modules/prediction/prediction.service.ts';
import { MemoryPredictionStore } from 'C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-prediction-store.ts';
import { pct } from 'C:/Users/董金/ssps-miaoda/client/src/ssps/format.ts';
test('39_live_master_outside_pool',async()=>{const store=new MemoryMasterStore(seedMaster()),svc=new MasterService(store,null as any,null as any);const actor={userId:'AUDIT',name:'AUDIT',role:'系统管理员',dept:null} as any;await svc.addBerth({code:'L1',terminal:'拉博塔码头',capacity:50000,status:'启用'},actor);await svc.patchBerth('LN16',{capacity:50000},actor);const E=createEngine(base({berths:await store.berths()}));console.log('AUDIT '+JSON.stringify({id:'39_live_master_outside_pool',total:(await store.berths()).length,query50000:E.poolFor(50000).n,LN16:(await store.berths()).find(b=>b.code==='LN16').capacity}));});
test('40_saved_gap_overwrite',()=>{const it={...item,series:Array.from({length:41},(_,k)=>[T+k,k===0?100:k<4?0:k<20?1000:0,100])};const E=createEngine(base({planRows:[cover(25)]}));const r=E.predict(input({biz:BULK,load:'AUDIT_LOAD',disch:'BAHODOPI',item:it,buffer:3,pathBy:'end'}));const p=buildProvenance(r,r.plans[0]);console.log('AUDIT '+JSON.stringify({id:'40_saved_gap_overwrite',engineGap:r.stock.gap,savedGap:p.stock.gap,planGap:r.plans[0].stock.gap}));});
test('41_adopt_race',async()=>{const store=new MemoryPredictionStore();await store.save({runNo:'AUDIT',run:{input:input()},plans:[{label:'A',window_from:d(3),window_to:d(5),adopted:false}]});let n=0;const vs={actor:async()=>({userId:'AUDIT'}),adoptPlan:async()=>({created:true,voyage:{id:'AUDIT-V'+(++n)}})};const svc=new PredictionService(null as any,store,vs as any);const results=await Promise.allSettled([svc.adopt('AUDIT','A',{userId:'AUDIT'},undefined,'K1'),svc.adopt('AUDIT','A',{userId:'AUDIT'},undefined,'K2')]);console.log('AUDIT '+JSON.stringify({id:'41_adopt_race',statuses:results.map(r=>r.status),voyagesCreated:n,savedVoyage:(await store.get('AUDIT')).plans[0].adopted_voyage}));});
test('42_NLP_quantity',()=>{const p=createParser({today:TODAY,ports:[],items:[]});console.log('AUDIT '+JSON.stringify({id:'42_NLP_quantity',cases:['1050000吨','-50000吨','50000吨'].map(text=>({text,tons:p.detectTons(text)}))}));});
test('43_frontend_null_pct',async()=>{const svc=new CapacityService({load:async()=>base({planRows:[cover(20)]})} as any);const r=await svc.day(TODAY,180001);assert.equal(r.detail.cmr,null);console.log('AUDIT '+JSON.stringify({id:'43_frontend_null_pct',state:r.detail.state,value:r.detail.cmr,formatted:pct(r.detail.cmr)}));});
pair('44_eta_outside_window',base({planRows:[cover(30)],routeRules:[rr({exp:14,expMax:18})]}),E=>snap(E.predict(input({biz:BULK,load:'AUDIT_LOAD',disch:'BAHODOPI',winStart:d(10),winEnd:d(25)}))));
test('45_snapshot_mutation',()=>{const data=base({planRows:[cover(20)]}),E=createEngine(data);const before=E.poolFor(50000).n;data.berths.find(b=>b.code==='F3').capacity=10000;const after=E.poolFor(50000).n;console.log('AUDIT '+JSON.stringify({id:'45_snapshot_mutation',before,after,tier:E.needTier(50000)}));});
pair('46_mixed_path_S1',base({planRows:[cover(30)],voyages:[voy(16,35,50000)]}),E=>{const r=E.predict(input({winStart:d(0),winEnd:d(25),pathBy:'end',item:{...item,series:Array.from({length:41},(_,k)=>[T+k,100000,100])}}));return {run:{mode:r.run.mode,target:iso(r.run.target),dist:r.run.dist},plans:r.plans.map(p=>p&&{label:p.label,mode:p.mode,start:iso(p.c.s)})};});
import { VoyageService } from 'C:/Users/董金/ssps-miaoda/server/modules/voyage/voyage.service.ts';
import { MemoryVoyageStore } from 'C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-voyage-store.ts';
import { MemoryDirectory } from 'C:/Users/董金/ssps-miaoda/server/adapters/memory/memory-directory.ts';
test('47_adopt_race_real_service',async()=>{const store=new MemoryPredictionStore(),vstore=new MemoryVoyageStore(),vs=new VoyageService(vstore,new MemoryDirectory());await store.save({runNo:'AUDIT-RACE',run:{input:input({biz:BULK,load:'SURIGAO',disch:'BAHODOPI'})},plans:[{label:'A',window_from:d(3),window_to:d(5),adopted:false}]});const svc=new PredictionService(null as any,store,vs);const results=await Promise.allSettled([svc.adopt('AUDIT-RACE','A',{userId:'AUDIT',userName:'AUDIT'},undefined,'AUDIT-K1'),svc.adopt('AUDIT-RACE','A',{userId:'AUDIT',userName:'AUDIT'},undefined,'AUDIT-K2')]);const list=await vstore.list();console.log('AUDIT '+JSON.stringify({id:'47_adopt_race_real_service',statuses:results.map(r=>r.status),voyagesCreated:list.length,savedVoyage:(await store.get('AUDIT-RACE')).plans[0].adopted_voyage}));assert.equal(list.length,2);});
test('48_spare_null_rule_service',async()=>{const data={...base({planRows:[cover(20)],routeRules:[rr({id:'OWN',biz:[SPARE],exp:null,expMax:null}),rr({id:'BORROW',biz:[BULK]})]}),ports:[],berthPlanBatch:{batchNo:'BP-AUDIT'},inventory:{batchNo:null,items:[]}};const svc=new PredictionService({load:async()=>data} as any,new MemoryPredictionStore(),null as any);const r=await svc.predict(input({biz:SPARE,load:'AUDIT_LOAD',disch:'BAHODOPI'}) as any,{userId:'AUDIT'});console.log('AUDIT '+JSON.stringify({id:'48_spare_null_rule_service',status:r.status,rule:r.result.run.rule.id,effP80:r.result.run.rule.effP80,depart:iso(r.result.plans[0].depart),eta:iso(r.result.plans[0].etaTo)}));});
test('49_mixed_provenance_target',()=>{const E=createEngine(base({planRows:[cover(30)],voyages:[voy(16,35,50000)]}));const r=E.predict(input({winEnd:d(25),pathBy:'end',item:{...item,series:Array.from({length:41},(_,k)=>[T+k,100000,100])}}));const pv=buildProvenance(r,r.plans[0]);console.log('AUDIT '+JSON.stringify({id:'49_mixed_provenance_target',path:pv.path,window:pv.window}));});

```

<details><summary>展开49项实验的实际输出（含32项原型对照）</summary>

```text
AUDIT {"id":"01_empty","backend":{"errors":[],"noRule":false,"noCandidate":true,"mode":"cmr","borrowed":false,"urgent":false,"plans":[null,null]},"prototype":{"errors":[],"noRule":false,"noCandidate":true,"mode":"cmr","borrowed":false,"urgent":false,"plans":[null,null]},"equal":true}
AUDIT {"id":"02_full","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0,"mode":"cmr","trust":"正常","qualifies":false,"depart":null,"eta":null},null]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0,"mode":"cmr","trust":"正常","qualifies":false,"depart":null,"eta":null},null]},"equal":true}
AUDIT {"id":"03_free","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null}]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null}]},"equal":true}
AUDIT {"id":"04_single_closed","backend":[{"d":20763,"mode":"cmr","state":"ok","P":{"list":[{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"}],"ids":["F3"],"n":1,"tier":50000},"list":[{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20765,"arriving":true,"berthing":true}],"cmr":0,"occ":1},{"d":20765,"mode":"cmr","state":"ok","P":{"list":[{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"}],"ids":["F3"],"n":1,"tier":50000},"list":[{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20765,"arriving":false,"berthing":false}],"cmr":0,"occ":1},{"d":20766,"mode":"cmr","state":"ok","P":{"list":[{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"}],"ids":["F3"],"n":1,"tier":50000},"list":[],"cmr":1,"occ":0}],"prototype":[{"d":20763,"mode":"cmr","state":"ok","P":{"list":[{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"}],"ids":["F3"],"n":1,"tier":50000},"list":[{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20765,"arriving":true,"berthing":true}],"cmr":0,"occ":1},{"d":20765,"mode":"cmr","state":"ok","P":{"list":[{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"}],"ids":["F3"],"n":1,"tier":50000},"list":[{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20765,"arriving":false,"berthing":false}],"cmr":0,"occ":1},{"d":20766,"mode":"cmr","state":"ok","P":{"list":[{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"}],"ids":["F3"],"n":1,"tier":50000},"list":[],"cmr":1,"occ":0}],"equal":true}
AUDIT {"id":"05_duplicate","backend":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"}],"ids":["F3"],"n":1,"tier":50000},"list":[{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20765,"arriving":true,"berthing":true},{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20765,"arriving":true,"berthing":true}],"cmr":0,"occ":1},"prototype":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"}],"ids":["F3"],"n":1,"tier":50000},"list":[{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20765,"arriving":true,"berthing":true},{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20765,"arriving":true,"berthing":true}],"cmr":0,"occ":1},"equal":true}
AUDIT {"id":"06_tonnage_boundaries","backend":[{"tons":0,"n":23,"tier":10000},{"tons":-1,"n":23,"tier":10000},{"tons":"missing","n":0,"tier":null},{"tons":10000,"n":23,"tier":10000},{"tons":10001,"n":15,"tier":15000},{"tons":15000,"n":15,"tier":15000},{"tons":15001,"n":14,"tier":25000},{"tons":50000,"n":11,"tier":50000},{"tons":50001,"n":8,"tier":60000},{"tons":180000,"n":1,"tier":180000},{"tons":180001,"n":0,"tier":null}],"prototype":[{"tons":0,"n":23,"tier":10000},{"tons":-1,"n":23,"tier":10000},{"tons":"missing","n":0,"tier":null},{"tons":10000,"n":23,"tier":10000},{"tons":10001,"n":15,"tier":15000},{"tons":15000,"n":15,"tier":15000},{"tons":15001,"n":14,"tier":25000},{"tons":50000,"n":11,"tier":50000},{"tons":50001,"n":8,"tier":60000},{"tons":180000,"n":1,"tier":180000},{"tons":180001,"n":0,"tier":null}],"equal":true}
AUDIT {"id":"07_invalid_tons_predict","backend":[{"errors":["请填写货量（吨）"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false},{"errors":["请填写货量（吨）"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false},{"errors":["请填写货量（吨）"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false},{"errors":["货量 180,001 吨超过 23 个泊位中的最大容量，无匹配泊位"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false}],"prototype":[{"errors":["请填写货量（吨）"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false},{"errors":["请填写货量（吨）"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false},{"errors":["请填写货量（吨）"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false},{"errors":["货量 180,001 吨超过 23 个泊位中的最大容量，无匹配泊位"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false}],"equal":true}
AUDIT {"id":"08_day_offsets","backend":[{"k":-1,"mode":"cmr","detail":{"d":20762,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"cmr":1,"occ":0}},{"k":0,"mode":"cmr","detail":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"cmr":1,"occ":0}},{"k":15,"mode":"cmr","detail":{"d":20778,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"cmr":1,"occ":0}},{"k":16,"mode":"density","detail":{"d":20779,"mode":"density","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[{"vessel":"SYNTHETIC","id":"AUDIT-V","load":"AUDIT_LOAD","disch":"BAHODOPI","biz":"大宗采购船","tons":50000,"start":20779,"end":20793,"status":"航行中","side":"卸","arriving":true}],"count":1}}],"prototype":[{"k":-1,"mode":"cmr","detail":{"d":20762,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"cmr":1,"occ":0}},{"k":0,"mode":"cmr","detail":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"cmr":1,"occ":0}},{"k":15,"mode":"cmr","detail":{"d":20778,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"cmr":1,"occ":0}},{"k":16,"mode":"density","detail":{"d":20779,"mode":"density","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[{"vessel":"SYNTHETIC","id":"AUDIT-V","load":"AUDIT_LOAD","disch":"BAHODOPI","biz":"大宗采购船","tons":50000,"start":20779,"end":20793,"status":"航行中","side":"卸","arriving":true}],"count":1}}],"equal":true}
AUDIT {"id":"09_cross_year","backend":[1,1,1,0],"prototype":[1,1,1,0],"equal":true}
AUDIT {"id":"10_B_exact_30","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0.3,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":0.3,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null}]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0.3,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":0.3,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null}]},"equal":true}
AUDIT {"id":"11_B_below_30","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0.2,"mode":"cmr","trust":"正常","qualifies":false,"depart":null,"eta":null},null]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0.2,"mode":"cmr","trust":"正常","qualifies":false,"depart":null,"eta":null},null]},"equal":true}
AUDIT {"id":"12_sparse_B_30","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0.3,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":0.3,"mode":"cmr","trust":"低可信","qualifies":true,"depart":null,"eta":null}]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0.3,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":0.3,"mode":"cmr","trust":"低可信","qualifies":true,"depart":null,"eta":null}]},"equal":true}
AUDIT {"id":"13_sparse_B_20","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0.2,"mode":"cmr","trust":"正常","qualifies":false,"depart":null,"eta":null},null]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0.2,"mode":"cmr","trust":"正常","qualifies":false,"depart":null,"eta":null},null]},"equal":true}
AUDIT {"id":"14_urgent_B_zero","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"R-AUDIT","borrowed":false,"urgent":true,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0,"mode":"cmr","trust":"正常","qualifies":false,"depart":"2026-11-06","eta":["2026-11-07","2026-11-08"],"stock":{"before":0,"after":50000,"daysBefore":0,"daysAfter":500,"daily":100,"state":"out","gap":1,"level":"充裕"}},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":0,"mode":"cmr","trust":"正常","qualifies":false,"depart":"2026-11-09","eta":["2026-11-10","2026-11-11"],"stock":{"before":0,"after":50000,"daysBefore":0,"daysAfter":500,"daily":100,"state":"out","gap":4,"level":"充裕"}}]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"R-AUDIT","borrowed":false,"urgent":true,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":0,"mode":"cmr","trust":"正常","qualifies":false,"depart":"2026-11-06","eta":["2026-11-07","2026-11-08"],"stock":{"before":0,"after":50000,"daysBefore":0,"daysAfter":500,"daily":100,"state":"out","gap":1,"level":"充裕"}},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":0,"mode":"cmr","trust":"正常","qualifies":false,"depart":"2026-11-09","eta":["2026-11-10","2026-11-11"],"stock":{"before":0,"after":50000,"daysBefore":0,"daysAfter":500,"daily":100,"state":"out","gap":4,"level":"充裕"}}]},"equal":true}
AUDIT {"id":"15_cancelled_CMR","backend":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20768,"arriving":true,"berthing":true}],"cmr":0.9090909090909091,"occ":1},"prototype":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[{"vessel":"SYNTHETIC","berth":"F3","cargo":"AUDIT","tons":50000,"eta":20763,"start":20763,"end":20768,"arriving":true,"berthing":true}],"cmr":0.9090909090909091,"occ":1},"equal":true}
AUDIT {"id":"16_no_capacity_detail","backend":{"calendar":{"d":20763,"i":0,"mode":"cmr","dist":0,"state":"nodata"},"detail":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[],"ids":[],"n":0,"tier":null},"list":[],"cmr":null,"occ":0}},"prototype":{"calendar":{"d":20763,"i":0,"mode":"cmr","dist":0,"state":"nodata"},"detail":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[],"ids":[],"n":0,"tier":null},"list":[],"cmr":null,"occ":0}},"equal":true}
AUDIT {"id":"17_missing_rule_values","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"R-AUDIT","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-08","eta":["2026-11-08","2026-11-08"]},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-11","eta":["2026-11-11","2026-11-11"]}]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"R-AUDIT","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-08","eta":["2026-11-08","2026-11-08"]},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-11","eta":["2026-11-11","2026-11-11"]}]},"equal":true}
AUDIT {"id":"18_disabled_own_rule","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"BULK","borrowed":true,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-06","eta":["2026-11-07","2026-11-08"]},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-09","eta":["2026-11-10","2026-11-11"]}]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"OFF","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-06","eta":["2026-11-07","2026-11-08"]},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-09","eta":["2026-11-10","2026-11-11"]}]},"equal":false}
AUDIT {"id":"19_invalid_calendar_date","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-03-02","to":"2026-03-04","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},null]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-03-02","to":"2026-03-04","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},null]},"equal":true}
AUDIT {"id":"20_missing_end","backend":{"throws":"日期格式不对：null"},"prototype":{"throws":"Cannot read properties of null (reading 'split')"},"equal":false}
AUDIT {"id":"21_inverted_interval","backend":{"d":20765,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"cmr":1,"occ":0},"prototype":{"d":20765,"mode":"cmr","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"cmr":1,"occ":0},"equal":true}
AUDIT {"id":"22_small_vessel_competition","backend":{"d":20779,"mode":"density","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"count":0},"prototype":{"d":20779,"mode":"density","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[],"count":0},"equal":true}
AUDIT {"id":"23_exact_tier_competition","backend":{"d":20779,"mode":"density","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[{"vessel":"SYNTHETIC","id":"V1","load":"AUDIT_LOAD","disch":"BAHODOPI","biz":"大宗采购船","tons":50000,"start":20779,"end":20783,"status":"航行中","side":"卸","arriving":true},{"vessel":"SYNTHETIC","id":"V2","load":"AUDIT_LOAD","disch":"BAHODOPI","biz":"大宗采购船","tons":50001,"start":20779,"end":20783,"status":"航行中","side":"卸","arriving":true}],"count":2},"prototype":{"d":20779,"mode":"density","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":["F1","F2","F3","F4","F5","F9","F10","L4","L6","L7","L12"],"n":11,"tier":50000},"list":[{"vessel":"SYNTHETIC","id":"V1","load":"AUDIT_LOAD","disch":"BAHODOPI","biz":"大宗采购船","tons":50000,"start":20779,"end":20783,"status":"航行中","side":"卸","arriving":true},{"vessel":"SYNTHETIC","id":"V2","load":"AUDIT_LOAD","disch":"BAHODOPI","biz":"大宗采购船","tons":50001,"start":20779,"end":20783,"status":"航行中","side":"卸","arriving":true}],"count":2},"equal":true}
AUDIT {"id":"24_offpool_enabled_master","backend":12,"prototype":12,"equal":true}
AUDIT {"id":"25_missing_window","backend":{"errors":["请填写完整的时间窗口"],"noRule":false,"noCandidate":false,"borrowed":false,"urgent":false},"prototype":{"throws":"Cannot read properties of undefined (reading 'split')"},"equal":false}
AUDIT {"id":"26_null_stock_point","backend":{"stockout":null},"prototype":{"stockout":20763},"equal":false}
AUDIT {"id":"27_strict_sparse","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"低可信","qualifies":true,"depart":null,"eta":null},null]},"prototype":{"errors":[],"noRule":false,"noCandidate":true,"mode":"cmr","borrowed":false,"urgent":false,"plans":[null,null]},"equal":false}
AUDIT {"id":"28_repeat_stability","backend":{"stable":true},"prototype":{"stable":true},"equal":true}
AUDIT {"id":"29_missing_experience_spare","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"OWN","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-08","eta":["2026-11-08","2026-11-08"]},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-11","eta":["2026-11-11","2026-11-11"]}]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"OWN","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-06","to":"2026-11-08","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-08","eta":["2026-11-08","2026-11-08"]},{"label":"B","from":"2026-11-09","to":"2026-11-11","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-11","eta":["2026-11-11","2026-11-11"]}]},"equal":true}
AUDIT {"id":"30_cross_day15_window","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-21","to":"2026-11-23","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},null]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-21","to":"2026-11-23","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":null,"eta":null},null]},"equal":true}
AUDIT {"id":"31_UTC_today","backend":{"today":"2026-11-05","target":"2026-11-21","mode":"density"},"expected":{"today":"2026-11-06","mode":"cmr"}}
AUDIT {"id":"32_DTO_invalid_date","errors":[],"normalized":"2026-03-02"}
AUDIT {"id":"33_capacity_service_no_match","calendar":{"d":20763,"i":0,"mode":"cmr","dist":0,"state":"nodata"},"detail":{"d":20763,"mode":"cmr","state":"ok","P":{"list":[],"ids":[],"n":0,"tier":null},"list":[],"cmr":null,"occ":0}}
AUDIT {"id":"34_NLP_explicit_year","actual":"2026-11-10","outside":false,"expected":"2027-11-10 or outside horizon"}
AUDIT {"id":"35_unknown_cargo_density","tons":0,"detail":{"d":20779,"mode":"density","state":"ok","P":{"list":[{"code":"F1","terminal":"北区码头","capacity":180000,"status":"启用"},{"code":"F2","terminal":"北区码头","capacity":100000,"status":"启用"},{"code":"F3","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F4","terminal":"北区码头","capacity":70000,"status":"启用"},{"code":"F5","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F9","terminal":"北区码头","capacity":50000,"status":"启用"},{"code":"F10","terminal":"北区码头","capacity":60000,"status":"启用"},{"code":"L4","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L6","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L7","terminal":"拉博塔码头","capacity":75000,"status":"启用"},{"code":"L12","terminal":"拉博塔码头","capacity":100000,"status":"启用"}],"ids":{},"n":11,"tier":50000},"list":[],"count":0}}
AUDIT {"id":"36_batch_race_provenance","batch":"OLD","vessel":"NEW_BATCH_ROW"}
AUDIT {"id":"37_null_stock_math","stock":{"before":null,"after":50000,"daysBefore":0,"daysAfter":500,"daily":100,"state":"safe","gap":0,"level":"充裕"}}
AUDIT {"id":"38_import_invalid_dates","input":{"end":null},"status":"anomaly","issue":"DATE_MISSING"}
AUDIT {"id":"38_import_invalid_dates","input":{"start":"2026-11-09","end":"2026-11-07"},"status":"anomaly","issue":"DATE_INVERTED"}
AUDIT {"id":"39_live_master_outside_pool","total":24,"query50000":13,"LN16":50000}
AUDIT {"id":"40_saved_gap_overwrite","engineGap":{"from":20764,"to":20766},"savedGap":0,"planGap":0}
AUDIT {"id":"41_adopt_race","statuses":["fulfilled","fulfilled"],"voyagesCreated":2,"savedVoyage":"AUDIT-V2"}
AUDIT {"id":"42_NLP_quantity","cases":[{"text":"1050000吨","tons":50000},{"text":"-50000吨","tons":50000},{"text":"50000吨","tons":50000}]}
AUDIT {"id":"43_frontend_null_pct","state":"ok","value":null,"formatted":"0%"}
AUDIT {"id":"44_eta_outside_window","backend":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"R-AUDIT","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-22","to":"2026-11-24","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-06","eta":["2026-11-20","2026-11-24"]},{"label":"B","from":"2026-11-25","to":"2026-11-27","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-09","eta":["2026-11-23","2026-11-27"]}]},"prototype":{"errors":[],"noRule":false,"noCandidate":false,"mode":"cmr","rule":"R-AUDIT","borrowed":false,"urgent":false,"plans":[{"label":"A","from":"2026-11-22","to":"2026-11-24","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-06","eta":["2026-11-20","2026-11-24"]},{"label":"B","from":"2026-11-25","to":"2026-11-27","metric":1,"mode":"cmr","trust":"正常","qualifies":true,"depart":"2026-11-09","eta":["2026-11-23","2026-11-27"]}]},"equal":true}
AUDIT {"id":"45_snapshot_mutation","before":11,"after":10,"tier":50000}
AUDIT {"id":"46_mixed_path_S1","backend":{"run":{"mode":"mixed","target":"2026-12-01","dist":25},"plans":[{"label":"A","mode":"cmr","start":"2026-11-06"},{"label":"B","mode":"density","start":"2026-11-22"}]},"prototype":{"run":{"mode":"mixed","target":"2026-12-01","dist":25},"plans":[{"label":"A","mode":"cmr","start":"2026-11-06"},{"label":"B","mode":"density","start":"2026-11-22"}]},"equal":true}
AUDIT {"id":"47_adopt_race_real_service","statuses":["fulfilled","fulfilled"],"voyagesCreated":2,"savedVoyage":"VY-2026-0002"}
AUDIT {"id":"48_spare_null_rule_service","status":"ok","rule":"OWN","effP80":null,"depart":"2026-11-08","eta":"2026-11-08"}
AUDIT {"id":"49_mixed_provenance_target","path":{"runMode":"mixed","planMode":"cmr","target":"2026-12-01","dist":25,"rule":"只按目标到港日距今天数分流（≤15 天靠船计划，＞15 天航次表），不看有没有数据"},"window":{"from":"2026-11-06","to":"2026-11-08","complete":true,"missing":[]}}
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1426.1127
```

</details>
