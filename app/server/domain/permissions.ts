// 权限规则（K11、docs/implementation-plan.md 第 8 节权限列）：
//   业务员 = 仅本人航次；部门主管 = 本部门航次；物流管理员 = 维护主数据、上传靠船计划和库存（不改航次）；系统管理员 = 全部。
//   全员可看全部航次；金额字段只有大宗采购部和系统管理员能看。
import type { Actor, Voyage } from './voyage';
import { isBulk, isProduct } from './voyage';

const isAdmin = (a: Actor) => a.role === '系统管理员';

/** 能否修改这条航次的基础信息（历史只读记录一律不能改） */
export function canEditVoyage(a: Actor, v: Pick<Voyage, 'owner' | 'ownerId' | 'dept' | 'readonly'>): boolean {
  if (v.readonly) return false;
  if (isAdmin(a)) return true;
  const mine = v.ownerId ? v.ownerId === a.userId : v.owner === a.name;
  if (a.role === '业务员') return mine;
  if (a.role === '部门主管') return mine || (!!a.dept && v.dept === a.dept);
  return false;
}
/** 新建航次：业务员、部门主管、系统管理员 */
export const canCreateVoyage = (a: Actor) => ['业务员', '部门主管', '系统管理员'].includes(a.role);
/** 大宗卸船结算：作业数据（大宗采购部本人航次或主管 + 仓储物流部 + 系统管理员） */
export function canEditOps(a: Actor, v: Voyage): boolean {
  if (!isBulk(v) || v.readonly) return false;
  if (isAdmin(a)) return true;
  if (a.dept === '仓储物流部' && (a.role === '业务员' || a.role === '部门主管')) return true;
  return a.dept === '大宗采购部' && canEditVoyage(a, v);
}
/** 费用结算：只有大宗采购部（本人航次或主管）和系统管理员 */
export function canEditMoney(a: Actor, v: Voyage): boolean {
  if (!isBulk(v) || v.readonly) return false;
  return isAdmin(a) || (a.dept === '大宗采购部' && canEditVoyage(a, v));
}
/** 成品销售扩展：商务海运部（本人航次或主管）和系统管理员 */
export function canEditSales(a: Actor, v: Voyage): boolean {
  if (!isProduct(v) || v.readonly) return false;
  return isAdmin(a) || (a.dept === '商务海运部' && canEditVoyage(a, v));
}
/** 能否看金额字段（任何航次的费用结算） */
export const canSeeMoney = (a: Actor) => isAdmin(a) || a.dept === '大宗采购部';
/** 主数据（港口、泊位、船舶）维护：物流管理员、系统管理员；船舶新增业务员也可以 */
export const canMaintainMaster = (a: Actor) => a.role === '物流管理员' || isAdmin(a);
export const canAddVessel = (a: Actor) => canMaintainMaster(a) || a.role === '业务员' || a.role === '部门主管';
/** 维护经验航程：部门主管、系统管理员 */
export const canMaintainRoutes = (a: Actor) => a.role === '部门主管' || isAdmin(a);
/** 上传靠船计划、库存表：物流管理员、系统管理员 */
export const canImport = (a: Actor) => a.role === '物流管理员' || isAdmin(a);
