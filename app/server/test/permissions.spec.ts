import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditVoyage, canCreateVoyage, canEditOps, canEditMoney, canEditSales, canSeeMoney, canMaintainMaster, canAddVessel, canImport, canMaintainRoutes } from '../domain/permissions';
import { localDate } from '../domain/voyage';
import type { Actor, Voyage } from '../domain/voyage';

const A = (role: Actor['role'], dept: Actor['dept'], name = '甲'): Actor => ({ userId: 'u_' + name, name, role, dept });
const V = (o: Partial<Voyage> = {}): Voyage => ({ id: 'VY-1', biz: '大宗采购船', attr: '内贸', no: '', vessel: 'MV A', carrier: '', shipVoy: '', load: 'SURIGAO', disch: 'BAHODOPI', disch2: null, finalPort: null, laycanS: null, laycanE: null, planLoadArr: null, actLoadArr: null, loadBerth: null, planLoadDep: null, actLoadDep: null, planDischS: '2026-11-10', planDischE: null, eta: null, etaUpdated: null, actDischArr: null, dischBerth: null, dischDep: null, planBerths: [], actBerths: [], flags: [], owner: '甲', dept: '大宗采购部', focus: false, review: '待审核', source: '应用录入', readonly: false, remark: '', ...o });

test('改航次：业务员只能改本人的；主管能改本部门的；系统管理员全部；物流管理员不能改航次；历史只读谁都不能改', () => {
  const v = V();
  assert.equal(canEditVoyage(A('业务员', '大宗采购部', '甲'), v), true);
  assert.equal(canEditVoyage(A('业务员', '大宗采购部', '乙'), v), false);
  assert.equal(canEditVoyage(A('部门主管', '大宗采购部', '乙'), v), true);
  assert.equal(canEditVoyage(A('部门主管', '商务海运部', '乙'), v), false);
  assert.equal(canEditVoyage(A('系统管理员', null), v), true);
  assert.equal(canEditVoyage(A('物流管理员', '仓储物流部'), v), false);
  assert.equal(canEditVoyage(A('系统管理员', null), V({ readonly: true })), false);
  assert.equal(canEditVoyage(A('业务员', '大宗采购部', '丙'), V({ ownerId: 'u_丙', owner: '别名' })), true, '有 ownerId 时按账号判断');
});
test('新建航次：业务员、主管、系统管理员；物流管理员不行', () => {
  assert.deepEqual(['业务员', '部门主管', '系统管理员', '物流管理员'].map((r) => canCreateVoyage(A(r as any, null))), [true, true, true, false]);
});
test('卸船作业：大宗采购部本人航次或主管、仓储物流部、系统管理员可登记；费用只有大宗采购部本人/主管和系统管理员', () => {
  const v = V();
  assert.equal(canEditOps(A('业务员', '仓储物流部', '乙'), v), true);
  assert.equal(canEditOps(A('业务员', '大宗采购部', '乙'), v), false);                // 大宗部但不是本人航次
  assert.equal(canEditOps(A('业务员', '大宗采购部', '甲'), v), true);
  assert.equal(canEditOps(A('业务员', '商务海运部', '甲'), v), false);
  assert.equal(canEditMoney(A('业务员', '仓储物流部', '乙'), v), false);              // 仓储物流部不能改费用
  assert.equal(canEditMoney(A('业务员', '大宗采购部', '甲'), v), true);
  assert.equal(canEditMoney(A('部门主管', '大宗采购部', '乙'), v), true);
  assert.equal(canEditMoney(A('系统管理员', null), v), true);
  assert.equal(canEditOps(A('系统管理员', null), V({ biz: '成品销售船' })), false, '非大宗航次没有卸船结算');
});
test('成品销售扩展：商务海运部本人/主管和系统管理员', () => {
  const v = V({ biz: '成品销售船', dept: '商务海运部' });
  assert.deepEqual([A('业务员', '商务海运部', '甲'), A('业务员', '大宗采购部', '甲'), A('系统管理员', null)].map((a) => canEditSales(a, v)), [true, false, true]);
});
test('金额可见范围；主数据、航程、导入权限', () => {
  assert.deepEqual([A('业务员', '大宗采购部'), A('业务员', '仓储物流部'), A('业务员', '商务海运部'), A('系统管理员', null)].map(canSeeMoney), [true, false, false, true]);
  assert.deepEqual([A('物流管理员', null), A('业务员', null), A('系统管理员', null)].map(canMaintainMaster), [true, false, true]);
  assert.equal(canAddVessel(A('业务员', null)), true);
  assert.deepEqual([A('部门主管', null), A('业务员', null)].map(canMaintainRoutes), [true, false]);
  assert.deepEqual([A('物流管理员', null), A('业务员', null)].map(canImport), [true, false]);
});
test('本港侧日期：卸港侧取卸港，装港侧（装港是本港）取受载期和实际抵装港', () => {
  assert.deepEqual(localDate(V({ actDischArr: '2026-11-11 08:00' })), { plan: '2026-11-10', act: '2026-11-11 08:00' });
  assert.deepEqual(localDate(V({ load: 'BAHODOPI', biz: '成品销售船', laycanS: '2026-11-08', actLoadArr: '2026-11-09 10:00' })), { plan: '2026-11-08', act: '2026-11-09 10:00' });
});
