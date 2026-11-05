import { Global, Module } from '@nestjs/common';
import { LARK_DRIVE, LARK_TOKEN } from '../ports/tokens';
import { createTokenProvider } from './token';
import { createDrive } from './drive';

/**
 * 飞书客户端的装配：凭证只从环境变量读（LARK_APP_ID、LARK_APP_SECRET），没配置时提供 null，调用方据此给出「未配置」的提示，不会崩。
 * 多维表格客户端要等镜像样本确认字段写法后再接（见 docs/handoff/task-book.md W11、W12）。
 */
@Global()
@Module({
  providers: [
    { provide: LARK_TOKEN, useFactory: () => (process.env.LARK_APP_ID && process.env.LARK_APP_SECRET ? createTokenProvider({ appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET }) : null) },
    { provide: LARK_DRIVE, inject: [LARK_TOKEN], useFactory: (t: (() => Promise<string>) | null) => (t ? createDrive({ getToken: t }) : null) },
  ],
  exports: [LARK_TOKEN, LARK_DRIVE],
})
export class LarkModule {}
