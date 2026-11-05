import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import type { DirectoryPort } from '../../ports/directory.port';
import type { UserLookupPort } from '../../ports/user-lookup.port';
import type { Actor, Dept, Role } from '../../domain/voyage';
import type { UserSource } from './role-members';

/** 平台角色（bizID）→ 业务角色的默认对照。可用环境变量 ROLE_MAP（JSON）覆盖；这四个平台角色要在妙搭里建好并分配成员 */
export const DEFAULT_ROLE_MAP: Record<string, Role> = { ssps_salesman: '业务员', ssps_manager: '部门主管', ssps_logistics: '物流管理员', ssps_admin: '系统管理员' };
/** 飞书部门名称包含这些关键字就归到对应部门。可用环境变量 DEPT_MAP（JSON：关键字 → 部门）覆盖 */
export const DEFAULT_DEPT_MAP: Record<string, Dept> = { 大宗: '大宗采购部', 商务海运: '商务海运部', 仓储物流: '仓储物流部' };
const PRIORITY: Role[] = ['系统管理员', '物流管理员', '部门主管', '业务员'];

const forbid = (m: string) => new BusinessException(ResponseCode.FORBIDDEN, m, HttpStatus.FORBIDDEN);
export const parseMap = <T,>(raw: string | undefined, dflt: Record<string, T>, name: string): Record<string, T> => {
  if (!raw) return dflt;
  try { const v = JSON.parse(raw); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(); return v; } catch { throw new Error(`${name} 不是有效的 JSON 对象`); }
};

/**
 * 真实身份目录：角色来自请求上下文里的平台角色（ctx.roles）按对照表换成业务角色，多个角色取权限最高的；
 * 部门来自平台用户目录（飞书组织架构）。没有任何 SSPS 角色的用户、业务员和部门主管查不到部门的，一律拒绝（不再给兜底身份）。
 */
export class PlatformDirectory implements DirectoryPort {
  constructor(private readonly source: UserSource, private readonly roleMap: Record<string, Role> = DEFAULT_ROLE_MAP, private readonly deptMap: Record<string, Dept> = DEFAULT_DEPT_MAP) {}

  async resolve(ctx: { userId?: string; userName?: string; roles?: string[] }): Promise<Actor> {
    if (!ctx.userId) throw new BusinessException(ResponseCode.UNAUTHORIZED, '请先登录', HttpStatus.UNAUTHORIZED);
    const mapped = (ctx.roles ?? []).map((r) => this.roleMap[r]).filter(Boolean) as Role[];
    const role = PRIORITY.find((r) => mapped.includes(r));
    if (!role) throw forbid('你还没有 SSPS 的使用角色，请联系系统管理员分配（业务员 / 部门主管 / 物流管理员 / 系统管理员）');
    const u = await this.source.get(ctx.userId), name = ctx.userName || u?.name || ctx.userId;
    if (role === '系统管理员') return { userId: ctx.userId, name, role, dept: null };
    if (role === '物流管理员') return { userId: ctx.userId, name, role, dept: '仓储物流部' };
    const hit = u?.deptName ? Object.entries(this.deptMap).find(([k]) => u.deptName!.includes(k)) : undefined;
    if (!hit) throw forbid(`无法确定你所属的部门（组织架构里的部门是「${u?.deptName ?? '查不到'}」），请联系系统管理员`);
    return { userId: ctx.userId, name, role, dept: hit[1] };
  }
}

/** 航次负责人姓名与飞书用户 ID：来自平台用户目录。查不到姓名时显示用户 ID；查不到飞书 ID 时返回 null（调用方不写人员字段） */
export class PlatformUserLookup implements UserLookupPort {
  constructor(private readonly source: UserSource) {}
  async names(userIds: string[]) {
    const out: Record<string, string> = {};
    for (const id of userIds) out[id] = (await this.source.get(id))?.name ?? id;
    return out;
  }
  async feishuUserId(userId: string) { return (await this.source.get(userId))?.employeeId ?? null; }
}
