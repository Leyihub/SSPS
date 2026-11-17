# Codex 任务书 · 船舶动态协作台 · 第一期：字段组授权后端（计划中，2026-11-17）

给 Codex 的完整任务。你在 `C:\Users\董金\ssps-miaoda-board`（平台仓库的 git 工作树，分支 `feat/vessel-board`）里工作。
规格和参考原型已复制到工作树的 `docs-spec/`（不入库，只读参考）。

## 0. 先读什么（按顺序）

1. `docs-spec/field-groups.md`：**唯一的规格依据**。13 个字段组、8 个岗位的默认授权、底线、写入动作分发、接力规则、视图。
2. `docs-spec/vessel-dynamics-rebuild-plan.md`：背景与目标，读第 0、4、5、6、9 节即可。
3. `docs-spec/T06-bulk-settlement.md`、`docs-spec/D-app-db.md`、`docs-spec/status-rules.md`：相关字段与表。
4. `docs-spec/P04-vessel-board.html`：可点击原型，里面的 `GRANT0`、`todos()`、`mine()`、`canWG()` 是第 3、6 节规则的**可运行参考实现**（JavaScript，Mock 数据）。把规则移植到 TypeScript，不要照搬它的数据结构。
5. 仓库现有代码：`server/domain/permissions.ts`、`server/domain/voyage.ts`、`server/modules/voyage/voyage.service.ts`、`server/test/permissions.spec.ts`、`permission-matrix.spec.ts`、`voyage-service.spec.ts`、`scripts/gen-permission-matrix.ts`、`db/001-ssps-core.sql`、`db/002-restrict-anon-read.sql`、`server/adapters/{memory,drizzle}/`、`server/ports/`。仿照它们的写法。

## 1. 硬性边界（违反任何一条都算失败）

- 不要读取、创建或修改任何 `.env*` 文件；不要联网；不要调用飞书、不要执行 `lark-cli`；不要执行任何 SQL（只**生成** SQL 文件）。
- 不要 `git commit`、`git push`、不要切换分支；改动留在工作树里，由主控审查后提交。
- 不要新增依赖，不要改 `package.json` 的依赖与脚本。
- 不新增业务字段、不新增船舶状态（`docs/schema/` 里没有的一律不加）。字段只用规格里已有的。
- 规则引擎输出（`server/engine/`）和预测相关代码一个字不改。CMR、无数据灰色斜线等业务规则不碰。
- 金额字段隔离不能退步：没有读权限的人，接口响应里**不能出现**该字段（不是置空、不是前端隐藏）。变更日志里金额只记「已修改」。
- 越权写入返回 403，**不静默丢弃**字段；校验不通过返回 **422**（本代码库一贯用 422 表示校验失败，`invalid()` 不要改，已有测试和客户端依赖它；DTO 层的入参校验仍是 400）。
- 代码风格：中文注释，沿用现有 NestJS + Drizzle 模式；内存适配器和 Drizzle 适配器行为必须一致（参考 `parity.spec.ts`、`drizzle-voyage.spec.ts`）。

## 2. 本期要做的事（后端，按顺序）

### 2.1 领域层：字段目录与字段组（纯函数，无 IO）

新增 `server/domain/field-groups.ts`：

1. 13 个字段组 G01–G13 的定义（编号、名称、适用业务类型范围、是否需要「船已抵卸港」）。
2. 字段目录：每个字段一条 `{ key, label, group, type, source }`。`key` 用现有 `Voyage` / 货物明细 / 卸船结算 / 销售扩展类型里已有的属性名；`group` 按规格第 2 节；实际节点六个字段按「本港侧」动态归 G04 或 G06（`groupOfField(key, voyage)`：本港侧 = 装 → 装港一端三个节点归 G06，卸港一端归 G04；本港侧 = 卸 → 反过来）。`source` 取 `user | system | engine`，G12 全是 `system` 或 `engine`。
3. 一个用于校验的函数 `assertCatalogComplete()`：目录里的 key 与领域类型里对应的可写属性一一对应，没有遗漏也没有重复；写成测试。

### 2.2 领域层：授权策略

新增 `server/domain/grants.ts`（可以复用 `permissions.ts` 里的小工具）：

1. 岗位：`postOf(actor)` → `p1..p8`（业务员 · 大宗采购部 / 商务海运部 / 仓储物流部，部门主管 · 三个部门，物流管理员，系统管理员），与规格第 3 节表头顺序一致；没有部门的业务员 / 主管视为无岗位。
2. 默认授权表 `DEFAULT_GRANTS`（规格第 3 节），格子取值：`''` 无、`own` 本人航次、`dept` 本部门、`any` 任意航次，可多个范围用 `|` 连接，范围可带业务类型限制（如 `any:大宗` = 仅大宗采购船）。
3. `canWriteGroup(actor, voyage, group, grants = DEFAULT_GRANTS)`：按规格第 3、4 节全部规则判定——G12 永远否；历史只读永远否；业务类型范围（G07–G09 仅大宗采购船、G10 仅成品销售船）；G07–G09 要求船已抵卸港；范围匹配（本人 / 本部门 / 任意）。
4. `canReadGroup(actor, group)`：规格第 3 节第 8 条（G08、G09 的读名单，其余全员）。
5. `validateGrantChange(group, post, scope)`：规格第 4 节第 13 条的底线（G12 不可授；G09 只能授给大宗采购部的两个岗位和系统管理员；G08 只能授给仓储物流部、大宗采购部的岗位和系统管理员；系统管理员对 G12 以外不可收回）。违反返回原因字符串。
6. 保留 `permissions.ts` 里仍被主数据、导入、航程规则使用的函数；`canEditVoyage / canEditOps / canEditMoney / canEditSales / canSeeMoney` 改为**内部调用新策略**（保持函数名，方便现有调用点），行为按新规格变化。

### 2.3 领域层：接力待办

新增 `server/domain/relay.ts`：把原型里的 `todos(v)`、`mine(t, v)` 移植过来，输入航次、货物明细、卸船结算、作业日志（本期还没有日志表，用一个 `hasLogToday: boolean` 参数代替）、当前时间，输出 `[{ who: 'own' | 'wh' | 'fin', keys: string[] }]`。规则以规格第 6 节两张表为准；规格里的三个暂定天数（3 / 7 / 30）做成常量放在 `server/config.ts` 或同类位置，注明「暂定」。

### 2.4 写入路径改造（A10–A16 与新增 A36）

1. `voyage.service.ts` 里 A10（改基础字段）、A11（登记节点）、A12（修订 ETA）、A13（货物明细）、A14（卸船结算）、A15（销售扩展）、A16（异常标记）的鉴权，全部改为「字段 → 字段组 → `canWriteGroup`」。A14 分成 G07 / G08 / G09 三组分别鉴权：一次请求里混着有权和无权的字段，整体 403。
2. 读路径：航次详情、列表、变更日志、导出、错误信息里，G08、G09 字段按 `canReadGroup` 裁剪，**对 G08 和 G09 分别判断**（以前是一个 `canSeeMoney`）。
3. 新增 **A36** `PATCH /api/voyages/:id/fields`：请求体 `{ changes: [{ key, value }], etaBasis? }`。流程：（a）逐项鉴权 → 403；（b）逐项取值校验、整体时间先后校验（复用 `validate.ts`）、改了 ETA 必须有 `etaBasis` → 422；（c）全部通过后，按字段组分发到现有的写入方法，复用写队列、状态推导、变更日志、`x-idempotency-key`；（d）任何一项不通过则**一项都不写**。响应：更新后的航次详情 + `{ before, after }` 状态 + `relay` 待办。
4. 现有的 A10–A16 的**对外接口形状不变**。

### 2.5 授权数据：D14 与 A34，字段目录 A31

1. 在 `db/` 下新增 `005-vessel-board.sql`：D13 `view_profile`、D14 `field_grant`、D15 `ops_log` 三张表，字段见 `docs-spec/D-app-db.md`；**完全仿照 `001-ssps-core.sql` 的写法**（4 个审计列、RLS、策略）并带上 `002` 的「去掉 anon 读」处理；只生成文件，不执行。D13、D15 本期只建表，不写代码。
2. 用 `npm run gen:db-schema:local` 重新生成 `server/database/schema.ts`；如果这个脚本跑不通，手写与现有风格一致的 Drizzle 定义，并在最终报告里说明。
3. 新增端口 `server/ports/field-grant-store.port.ts`，内存适配器和 Drizzle 适配器各一份：读当前生效的授权（没有记录时用 `DEFAULT_GRANTS`）、写一次修改（旧记录置失效、新记录生效，不删除）。仿照 `master-store.port.ts` 的注册方式。授权结果给 `canWriteGroup` 用：服务层取到授权后传入。
4. **A34** `GET /api/admin/field-grants`（返回字段组、岗位、当前格子、默认值、不可勾的格子）与 `PUT /api/admin/field-grants`（body `{ changes: [{ group, post, scope }] }`，仅系统管理员，经 `validateGrantChange` 校验，违反返回 422 并指明哪一项，修改人和时间留痕）。
5. **A31** `GET /api/ui/fields?voyageId=`：返回已按当前岗位裁剪的字段目录，每个字段 `{ key, label, group, groupName, type, source, write }`；没有读权限的组的字段**不出现在响应里**；带 `voyageId` 时 `write` 是对这条航次的实际可写性，不带则按岗位的一般可写性（范围含 `own` / `dept` 的算 `true`）。

### 2.6 权限矩阵文档

`docs/handoff/permission-matrix.md` 由 `scripts/gen-permission-matrix.ts` 从代码生成。把矩阵改成「8 个岗位 × 13 个字段组」（本人 / 本部门他人 / 别的部门三种航次归属 × 大宗 / 成品两种业务类型，用 `✓ / —` 表示），其余动作（新建航次、主数据、导入等）保持原样；让 `permission-matrix.spec.ts` 继续核对文档与代码一致；重新生成文档。

## 3. 测试（必须新增，必须有「反向验证」）

1. `field-groups.spec.ts`：目录完整性；实际节点按本港侧分组（装 / 卸各一）。
2. `grants.spec.ts`：**8 个岗位 × 13 个字段组 × {本人 / 本部门他人 / 别的部门} × {大宗 / 成品}** 的写权限矩阵，逐格断言（可用表驱动）；G12 永远否；历史只读永远否；G07–G09 未抵卸港为否；G08、G09 读名单；`validateGrantChange` 的每条底线至少一个违反用例。
3. `relay.spec.ts`：规格第 6 节两张表的每一行至少一个用例（含「轮到我 / 轮到别人」）。
4. `voyage-service.spec.ts` 里补：仓储业务员能登记**他人**大宗航次的卸港靠泊、不能改合同号；商务海运部业务员能登记**自己**成品船的装港靠泊、仓储物流部**不能**；仓储能写 G08 不能写 G09；大宗业务员能写 G09 不能写 G08；A36 混合有权和无权字段时整行不写（读回确认一项都没变）；A36 改 ETA 不带依据返回 422；越权字段返回 403 而不是被忽略。
5. 金额隔离测试：商务海运部业务员读航次详情，响应 JSON 里**不存在** G08、G09 的任何字段名；仓储业务员能看到 G08、看不到 G09；变更日志里金额只记「已修改」。
6. 授权存储：内存与 Drizzle（PGlite）两套适配器各一组用例（无记录时返回默认值；写入后读回；旧记录置失效且不删除）。
7. A31、A34 的控制器级用例，并确认没有 SSPS 角色的用户仍然 401 / 403（`role-guard.spec.ts` 的遍历测试要覆盖新增的路由）。
8. **反向验证**：写完后，临时把一个关键判断弄坏（例如让 `canReadGroup('G09')` 恒为真），确认至少有一个测试变红，再改回来；在最终报告里写明做了哪几个反向验证。

已有测试中编码了旧口径（例如「仓储物流部不能改别人航次的时间节点」「费用结算整组只有大宗采购部可见」）的断言，**只在规格 `field-groups.md` 明确改变了的地方**修改，并在最终报告里逐条列出「哪个测试、原来断言什么、现在断言什么、对应规格哪一条」。除此之外不要为了让测试通过而改断言。

## 4. 验收（全部必须通过，贴出真实输出的最后几行）

> Windows 提示：`npm test` 和 `npm run smoke` 在 cmd 下不能直接用（带引号的通配符、`NODE_ENV=` 前缀都不认）。改用：`node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.node.json --test --test-concurrency=3 --test-reporter=spec server/test/*.spec.ts`（并发别开太大，会把 esbuild 内存撑爆，出现大量「文件加载失败」的假象），冒烟用 bash 手动 `NODE_ENV=production npx nest build` 再 `node scripts/smoke.cjs`。主线基线里「缺 MMSI」一条本来就是红的。

```
npm test
npm run type:check
npx eslint server client/src --quiet
npm run smoke
```

基线是 168 通过 + 6 跳过；新增测试后通过数只增不减。`smoke` 里如果有遍历全部路由的检查，新增路由要纳入。

## 5. 最终报告（作为你的最后一条消息）

1. 改动和新增的文件清单（按目录分组，一句话说明）。
2. 每个规格条款对应落在哪里（至少列规格第 3 节第 5–9 条、第 4 节第 11–16 条、第 5 节、第 6 节）。
3. 与规格不一致或你做了判断的地方（要写清楚判断和理由）。
4. 改过的旧测试断言清单（见第 3 节）。
5. 反向验证做了哪几个。
6. 四条验收命令的真实结果。
7. 你没做完或需要主控决定的事。

## 6. 本期不做（留给后续期次）

视图配置 A32 与 D13 的存取、协作台取数 A33、作业日志 A35 与 D15 的存取、预警聚合、全部前端。D13、D15 只建表。
