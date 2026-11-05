import { Database, FolderTree, Server } from 'lucide-react';

const ENTRY_POINTS = [
  {
    icon: Server,
    title: '后端接口',
    description:
      '在 server/modules 下新增模块，并在 server/app.module.ts 的业务模块插槽中注册。',
  },
  {
    icon: FolderTree,
    title: '前端页面',
    description:
      '在 client/src/pages 下新增页面，并在 client/src/app.tsx 中注册路由。',
  },
  {
    icon: Database,
    title: '数据表',
    description:
      '通过 lark-cli 执行建表语句，生成 server/database/schema.ts 后再编写读写逻辑。',
  },
];

const HomePage = () => {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          SSPS 智慧发船预测
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          应用骨架已就绪，当前不含任何业务功能。页面、接口与数据表可直接在此基础上开发。
        </p>
      </header>

      <section className="rounded-lg border border-dashed border-border bg-card p-6">
        <h2 className="text-sm font-semibold">开发入口</h2>
        <ul className="mt-4 flex flex-col gap-4">
          {ENTRY_POINTS.map(({ icon: Icon, title, description }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{title}</span>
                <span className="text-xs leading-5 text-muted-foreground">
                  {description}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default HomePage;
