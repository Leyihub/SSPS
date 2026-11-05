# SSPS 智慧发船预测

企业内部全栈应用（NestJS + React）。当前仓库为**空骨架**：不含业务表、业务接口与业务页面，业务代码由开发者自行补充。

## 技术栈

- 前端：React 19 + TypeScript + Vite + React Router + Tailwind CSS + shadcn/ui（`client/src/components/ui`）
- 后端：NestJS 10 + TypeScript（`server/`）
- 数据库：PostgreSQL + Drizzle ORM（实例由平台注入 `DRIZZLE_DATABASE`，禁止自建连接）
- 路径别名：`@client/` `@server/` `@shared/`

## 目录结构（3 层）

```
client/
  index.html
  public/
  src/
    api/            # 前端请求出口（axiosForBackend）
    components/     # Layout、ui/（shadcn）、business-ui/（平台人员组件）
    hooks/
    lib/
    pages/          # 业务页面
    types/
    utils/
    app.tsx         # 路由注册
    index.tsx       # 前端入口（平台文件，勿改）
server/
  main.ts           # 后端入口（平台文件，勿改）
  app.module.ts     # 根模块 + 业务模块注册插槽
  common/           # filters / constants / interfaces
  database/         # schema.ts（DDL 后自动/手动生成，禁止手改）
  modules/          # 后端业务模块（view/ 为平台兜底路由，勿改）
shared/
  api.interface.ts  # 前后端共享类型
scripts/            # dev / build 脚本（平台维护）
```

代码落点：

- 后端代码：`server/modules/<模块名>/`（controller / service / dto / module），在 `server/app.module.ts` 的 `@route-section: business-modules` 区间注册
- 前端代码：`client/src/pages/<页面名>/`，在 `client/src/app.tsx` 注册路由
- 环境变量：本地为项目根目录 `.env`（仅本地开发，已在 .gitignore 外，禁止写入密钥）；线上环境变量用 `lark-cli apps +env-set` 管理，当前为空
- 数据库脚本：本模板无 migrations 目录，DDL 一律通过 `lark-cli apps +db-execute` 执行，执行后用 `npm run gen:db-schema` 刷新 `server/database/schema.ts`
- 共享接口类型：`shared/api.interface.ts`

## 数据库规范

- 首次用库前确认能力已开通：`lark-cli apps +features --app-id "$app_id"`，`database.enabled` 必须为 `true`
- 建表语句参考 `.agent/skills/lark-apps-db/SKILL.md`，一次调用内包含建表、RLS、policy、注释与索引
- 每张业务表必须包含 4 个审计列：
  - `_created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`
  - `_created_by user_profile`（默认取 `current_setting('app.user_id', TRUE)`）
  - `_updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`
  - `_updated_by user_profile`（默认取 `current_setting('app.user_id', TRUE)`）
- 行级安全：建表后必须 `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`，并创建 4 条默认 policy：
  - `service_role_bypass_policy`：`TO service_role USING (true)`
  - `"修改全部数据"`：`AS PERMISSIVE FOR ALL TO authenticated USING (true)`
  - `"查看全部数据"`：`AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true)`
  - `"修改本人数据"`：`AS PERMISSIVE FOR ALL TO authenticated USING (...)`，按 `(_created_by).user_id` 限制
- 主键统一 `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`；表名/列名单数 snake_case；`user_profile` 列读取与过滤只用 `(col).user_id`
- 平台规范全文见 `.agent/skills/steering/nestjs-react-fullstack/skills/`（coding-guide 全栈编码约定、lark-apps-db 建表与 RLS、authz-guide 鉴权、plugin-guide 插件）

## 设计基线

- 字号层级：页面标题 `text-2xl font-semibold tracking-tight`；区块标题 `text-sm font-semibold`；正文 `text-sm`；辅助说明 `text-xs text-muted-foreground`
- 间距：页面容器 `px-6 py-8`；卡片内边距 `p-6`；并列元素 `gap-4`；区块之间 `gap-6`
- 颜色只用语义化 token（`bg-background` / `text-foreground` / `border-border` / `bg-muted`），不写字面色值
- 用户与部门展示用 `client/src/components/business-ui`，不自行拼头像

## 本地开发与发布

- 启动调试：`npm run dev`（同时起前后端，改代码热重载）
- 检查：`npm run lint`、`npm run type:check`
- 构建：`npm run build`
- 发布：`lark-cli apps +release-create --app-id "$app_id" --apply-reason "<发布理由>"`，再用 `+release-get` 轮询直至 `finished`
