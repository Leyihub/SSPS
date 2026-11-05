# 妙搭脚手架接入（2026-11-05）

脚手架已由 Leyinet 用 `lark-cli apps +init` 生成，放在本机 `C:\Users\董金\ssps-app`。云端看不到这个目录，所以需要先把它放进 GitHub 仓库。

## 1. 从 AGENTS.md 和 package.json 得到的事实

- 技术栈：后端 NestJS 10 + TypeScript（`server/`），前端 React 19 + Vite + Tailwind + shadcn/ui（`client/`），数据库 PostgreSQL + Drizzle ORM（连接由平台注入，禁止自建），共享类型在 `shared/`。
- 代码落点：后端 `server/modules/<模块>/`（controller / service / dto / module），在 `server/app.module.ts` 的 `business-modules` 区间注册；前端 `client/src/pages/<页面>/`，在 `client/src/app.tsx` 注册路由。
- 数据库只能用 `lark-cli apps +db-execute` 执行 DDL，之后 `npm run gen:db-schema` 刷新 `server/database/schema.ts`（不许手改）。
- 建表规范：主键 `id uuid`；表名列名单数 snake_case；每张表 4 个审计列 `_created_at`、`_created_by`（`user_profile` 类型）、`_updated_at`、`_updated_by`；建表后必须启用行级安全，并带 4 条默认 policy（`service_role_bypass_policy`、「修改全部数据」「查看全部数据」「修改本人数据」）。
- 登录与身份：`@NeedLogin()`，`req.userContext.userId`；角色用平台的 `+role-*`。
- 没有测试框架；有 `npm run lint`、`npm run type:check`。

## 2. 对我们已写代码的影响

1. **领域层要改成 TypeScript，放进脚手架**：（已完成 2026-11-05）已改成 TS，放在 `app/server/{domain,engine,nlp,importers,lark,lib}`，测试在 `app/server/test/*.spec.ts`，用 `tsx` 运行（`cd app && npm test`）。
2. **建库 SQL 已按平台规范重写**（`app/db/001-ssps-core.sql`，由 `scripts/build-ddl.mjs` 生成）：主键改 uuid，审计列改名成 `_created_at` 等，加 4 条 policy；`bigserial`、通用触发器这些不适用。需要 `.agent/skills/lark-apps-db/SKILL.md`（建表 SQL 的完整写法）才能写对，见下面第 3 步。
3. **前端要用 React 重写**：现在的原型是原生 HTML，不能直接搬。页面按原型的布局和交互，用 shadcn/ui 组件和 Tailwind 重写，计算全部调后端接口。这是阶段 C 里工作量最大的一块，按页面逐个做。
4. 飞书多维表格的读写继续用我们写好的客户端（`lark/`），镜像表 m_* 的创建用妙搭自带的 streaming 同步（`+db-sync-create`）。

## 3. 需要 Leyinet 做的事（按顺序）

**第 1 步：补齐 `.agent` 目录（平台规范全文在里面）**
你贴的 AGENTS.md 里引用了 `.agent/skills/lark-apps-db/SKILL.md` 和 `.agent/skills/steering/nestjs-react-fullstack/skills/`，但 `C:\Users\董金\ssps-app` 里没有 `.agent`。它被脚手架的 `.gitignore` 排除了，复制时很可能漏了。办法二选一：
- 回到你运行 `lark-cli apps +init` 的原目录，找隐藏文件夹 `.agent`，整个复制进 `C:\Users\董金\ssps-app`；
- 找不到的话，在 `ssps-app` 里执行 `npm install`，再执行 `npm run upgrade`（平台的同步命令，会补齐平台文件），看看 `.agent` 有没有出现。

**第 2 步：把脚手架放进 GitHub 仓库的 `app/` 目录**
在 PowerShell 里执行（仓库在 `D:\AI Project\Project\SSPS`，在 main 分支上）：

```powershell
cd "D:\AI Project\Project\SSPS"
git pull
robocopy "C:\Users\董金\ssps-app" ".\app" /E /XD node_modules .git dist .swc /XF .env .env.local .env.*
git add app
git add -f app/.agent
git status
```

`git status` 里**不应该出现 `.env` 开头的文件**（脚手架的 `.gitignore` 没有排除 `.env`，所以上面的命令专门排除了它）。确认没有以后再：

```powershell
git commit -m "导入妙搭脚手架"
git push
```

`app/.agent` 里是平台的规范文档，不含密钥；如果 `git add -f` 提示目录不存在，说明第 1 步还没做完，先做第 1 步再回来。

**第 3 步：告诉我**。我拉到 `app/` 后会先看 tsconfig、nest 配置和平台规范，再开始写。

## 4. 之后我做什么（阶段 C）

1. 领域层改成 TS 放进脚手架，测试跟着迁过去，保证和现在的 43 个测试结果一致。
2. 按平台规范重写 D01–D12 的建表 SQL，你用 `+db-execute` 执行，再 `gen:db-schema`。
3. 写后端模块：航次、货物、主数据、靠船计划、预测、容量日历、库存、数据质量、系统管理（A01–A30）。
4. 写飞书仓储层（先写飞书再回写镜像，幂等键，写队列）和定时任务。
5. 前端逐页用 React 重写：先 P02/P11（预测入口），再 P04/P05、P01、P06、P07–P10、P03。
6. 每完成一批提交，你本机拉取、`npm run dev` 联调，把报错发给我。
