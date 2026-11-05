import { Outlet } from 'react-router-dom';
import { Ship } from 'lucide-react';
import { useAppInfo } from '@lark-apaas/client-toolkit/hooks/useAppInfo';

const APP_NAME_FALLBACK = 'SSPS 智慧发船预测';

const Layout = () => {
  const { appName } = useAppInfo();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Ship className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">
          {appName || APP_NAME_FALLBACK}
        </span>
      </header>
      <main className="flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
