// 云端预览入口：不经过飞书妙搭的 AppContainer（它依赖平台接口），只挂路由和数据查询，用来在没有平台的环境里渲染页面、截图。
// 只在 npm run preview:build 里使用，不进正式构建。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import RoutesComponent from '../src/app';
import '../src/index.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}><BrowserRouter><RoutesComponent /><Toaster /></BrowserRouter></QueryClientProvider>,
);
