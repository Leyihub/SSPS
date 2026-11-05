import { timingSafeEqual } from 'crypto';

/** 定时任务（妙搭自动化触发器）调用内部接口时带的令牌：请求头 x-internal-token，值等于环境变量 INTERNAL_JOB_TOKEN。没配置环境变量时一律不放行 */
export function isInternalCall(token: string | undefined): boolean {
  const expect = process.env.INTERNAL_JOB_TOKEN;
  return !!(expect && token && token.length === expect.length && timingSafeEqual(Buffer.from(token), Buffer.from(expect)));
}
