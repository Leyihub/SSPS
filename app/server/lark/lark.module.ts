import { Global, Logger, Module } from '@nestjs/common';
import { AuthorizationSDK } from '@lark-apaas/fullstack-nestjs-core';
import { BASE_GATEWAY, LARK_DRIVE, LARK_TOKEN, USER_LOOKUP, USER_SOURCE } from '../ports/tokens';
import { MemoryUserLookup } from '../adapters/memory/memory-user-lookup';
import { createRoleMemberSource } from '../adapters/platform/role-members';
import { DEFAULT_ROLE_MAP, PlatformUserLookup, parseMap } from '../adapters/platform/platform-directory';
import { createTokenProvider } from './token';
import { createDrive } from './drive';
import { createBitable } from './bitable';
import { createWriteQueue } from './queue';
import { createBitableGateway } from './gateway';

/**
 * 飞书客户端的装配：凭证只从环境变量读，没配置时对应客户端是 null，调用方给出「未配置」的提示，不会崩。
 *   LARK_APP_ID、LARK_APP_SECRET          飞书应用凭证
 *   BITABLE_APP_TOKEN、BITABLE_TABLE_IDS  多维表格 Base 的 app_token；表 ID 对照 {"T01":"tbl…",…}
 * 写多维表格走单线程队列（同一个 Base 不并发写）。
 */
const log = new Logger('LarkModule');
const tableIds = (): Record<string, string> => { try { return JSON.parse(process.env.BITABLE_TABLE_IDS || '{}'); } catch { throw new Error('BITABLE_TABLE_IDS 不是有效的 JSON'); } };

@Global()
@Module({
  providers: [
    { provide: LARK_TOKEN, useFactory: () => (process.env.LARK_APP_ID && process.env.LARK_APP_SECRET ? createTokenProvider({ appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET }) : null) },
    { provide: LARK_DRIVE, inject: [LARK_TOKEN], useFactory: (t: (() => Promise<string>) | null) => (t ? createDrive({ getToken: t }) : null) },
    {
      provide: BASE_GATEWAY, inject: [LARK_TOKEN],
      useFactory: (t: (() => Promise<string>) | null) => {
        const ids = tableIds();
        if (!t || !process.env.BITABLE_APP_TOKEN || !Object.keys(ids).length) return null;
        return createBitableGateway(createBitable({ getToken: t, appToken: process.env.BITABLE_APP_TOKEN, tableIds: ids, queue: createWriteQueue() }));
      },
    },
    // 平台用户目录：真实模式下读 SSPS 平台角色的成员（姓名、飞书企业内 user_id、部门），角色 bizID 见 ROLE_MAP；否则为 null
    {
      provide: USER_SOURCE, inject: [{ token: AuthorizationSDK, optional: true }],
      useFactory: (sdk: any) => {
        if (process.env.SSPS_STORE !== 'real') return null;
        if (!sdk) throw new Error('SSPS_STORE=real 需要平台的 AuthorizationSDK（部署在妙搭上才有）');
        return createRoleMemberSource(sdk, Object.keys(parseMap(process.env.ROLE_MAP, DEFAULT_ROLE_MAP, 'ROLE_MAP')));
      },
    },
    { provide: USER_LOOKUP, inject: [USER_SOURCE], useFactory: (src: any) => (src ? new PlatformUserLookup(src) : new MemoryUserLookup()) },
  ],
  exports: [LARK_TOKEN, LARK_DRIVE, BASE_GATEWAY, USER_LOOKUP, USER_SOURCE],
})
export class LarkModule {}
