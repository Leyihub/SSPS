// 真实身份目录与用户对照（W15）：用假的平台 SDK 验证角色映射、部门判断、缓存与拒绝规则
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoleMemberSource, type MembersSdk } from '../adapters/platform/role-members';
import { PlatformDirectory, PlatformUserLookup, parseMap, DEFAULT_ROLE_MAP } from '../adapters/platform/platform-directory';

const u = (id: string, zh: string, emp: string, dept: string) => ({ userID: id, name: { zh_cn: zh, en_us: zh + '-en' }, employeeID: emp, department: { name: { zh_cn: dept } } });
function fakeSdk(members: Record<string, any[]>, pageSize = 2) {
  const calls: Array<[string, number]> = [];
  const sdk: MembersSdk = { members: { async list(biz, p) {
    const all = members[biz] ?? [], page = p?.page ?? 1; calls.push([biz, page]);
    return { members: { userList: all.slice((page - 1) * pageSize, page * pageSize) }, total: all.length, hasMore: page * pageSize < all.length };
  } } };
  return { sdk, calls };
}
const forbidden = (e: any) => e.httpStatus === 403;

test('角色成员目录：翻页读全；姓名取中文；缓存期内不重复读；未知用户有最短刷新间隔', async () => {
  let t = 0;
  const { sdk, calls } = fakeSdk({ ssps_salesman: [u('u1', '林海川', 'e1', '大宗采购部'), u('u2', '吴一帆', 'e2', '商务海运部'), u('u3', '郑晓', 'e3', '仓储物流部')], ssps_admin: [u('a1', '管理员', 'ea', 'IT')] });
  const src = createRoleMemberSource(sdk, ['ssps_salesman', 'ssps_admin'], { now: () => t, ttlMs: 60_000, minRefreshMs: 10_000 });
  assert.deepEqual(await src.get('u3'), { userId: 'u3', name: '郑晓', employeeId: 'e3', deptName: '仓储物流部' });
  assert.deepEqual(calls.map((c) => c.join(':')), ['ssps_salesman:1', 'ssps_salesman:2', 'ssps_admin:1']);
  await src.get('u1'); assert.equal(calls.length, 3, '缓存命中不再读');
  t = 1000; assert.equal(await src.get('nobody'), null); assert.equal(calls.length, 3, '10 秒内未知用户不触发刷新');
  t = 20_000; assert.equal(await src.get('nobody'), null); assert.equal(calls.length, 6, '超过最短间隔才刷新');
  t = 100_000; await src.get('u1'); assert.equal(calls.length, 9, '缓存过期整体重读');
});

test('身份目录：平台角色 → 业务角色，多个取权限最高；部门来自组织架构；管理员无部门、物流管理员固定仓储物流部', async () => {
  const { sdk } = fakeSdk({ ssps_salesman: [u('u1', '林海川', 'e1', '大宗采购部（印尼）'), u('u2', '吴一帆', 'e2', '商务海运部')], ssps_manager: [u('m1', '主管', 'em', '商务海运部')], ssps_logistics: [u('l1', '物流', 'el', '随便')], ssps_admin: [u('a1', '管理员', 'ea', 'IT')] });
  const dir = new PlatformDirectory(createRoleMemberSource(sdk, Object.keys(DEFAULT_ROLE_MAP)));
  assert.deepEqual(await dir.resolve({ userId: 'u1', userName: '林海川', roles: ['ssps_salesman'] }), { userId: 'u1', name: '林海川', role: '业务员', dept: '大宗采购部' });
  assert.equal((await dir.resolve({ userId: 'm1', roles: ['ssps_salesman', 'ssps_manager'] })).role, '部门主管');
  assert.deepEqual(await dir.resolve({ userId: 'a1', roles: ['ssps_admin', 'ssps_salesman', 'other_app_role'] }), { userId: 'a1', name: '管理员', role: '系统管理员', dept: null });
  assert.deepEqual(await dir.resolve({ userId: 'l1', roles: ['ssps_logistics'] }), { userId: 'l1', name: '物流', role: '物流管理员', dept: '仓储物流部' });
});

test('身份目录拒绝：没登录 401；没有 SSPS 角色 403；业务员查不到或对不上部门 403（不给兜底身份）', async () => {
  const { sdk } = fakeSdk({ ssps_salesman: [u('x1', '外人', 'ex', '财务部')] });
  const dir = new PlatformDirectory(createRoleMemberSource(sdk, ['ssps_salesman']));
  await assert.rejects(dir.resolve({}), (e: any) => e.httpStatus === 401);
  await assert.rejects(dir.resolve({ userId: 'u9', roles: [] }), forbidden);
  await assert.rejects(dir.resolve({ userId: 'u9', roles: ['guest', 'viewer'] }), (e: any) => forbidden(e) && /使用角色/.test(e.message));
  await assert.rejects(dir.resolve({ userId: 'x1', roles: ['ssps_salesman'] }), (e: any) => forbidden(e) && /财务部/.test(e.message));
  await assert.rejects(dir.resolve({ userId: 'ghost', roles: ['ssps_salesman'] }), (e: any) => forbidden(e) && /查不到/.test(e.message));
});

test('用户对照：姓名与飞书企业内 user_id；查不到时姓名回退为用户 ID、飞书 ID 为 null', async () => {
  const { sdk } = fakeSdk({ ssps_salesman: [u('u1', '林海川', 'e1', '大宗采购部')] });
  const lk = new PlatformUserLookup(createRoleMemberSource(sdk, ['ssps_salesman']));
  assert.deepEqual(await lk.names(['u1', 'zz']), { u1: '林海川', zz: 'zz' }); assert.equal(await lk.feishuUserId('u1'), 'e1'); assert.equal(await lk.feishuUserId('zz'), null);
});

test('环境变量对照表：缺省用默认；有值必须是 JSON 对象', () => {
  assert.equal(parseMap(undefined, { a: 1 }, 'X').a, 1); assert.deepEqual(parseMap('{"b":2}', { a: 1 }, 'X'), { b: 2 });
  assert.throws(() => parseMap('[1]', {}, 'ROLE_MAP'), /ROLE_MAP/); assert.throws(() => parseMap('{', {}, 'DEPT_MAP'), /DEPT_MAP/);
});
