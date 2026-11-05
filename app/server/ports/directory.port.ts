import type { Actor } from '../domain/voyage';

/** 把登录用户（平台的 req.userContext）解析成业务身份：角色和部门。真实实现读平台角色和组织架构 */
export interface DirectoryPort {
  resolve(ctx: { userId?: string; userName?: string; roles?: string[] }): Promise<Actor>;
}
