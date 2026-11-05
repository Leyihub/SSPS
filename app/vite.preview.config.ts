// 云端预览构建：把平台的 axios 换成裸 axios，入口换成不依赖平台的 client/preview。npm run preview:build → dist/preview
import path from 'path';
import { mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(base, {
  resolve: { alias: [
    { find: '@lark-apaas/client-toolkit/utils/getAxiosForBackend', replacement: path.resolve(__dirname, 'client/preview/axios-stub.ts') },
  ] },
  build: { outDir: 'dist/preview', emptyOutDir: true, rollupOptions: { input: path.resolve(__dirname, 'client/preview/index.html') } },
});
