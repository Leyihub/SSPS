// 权限矩阵：用 permissions.ts 的真实判断函数逐角色逐动作算出来，生成 docs/handoff/permission-matrix.md。
// 测试（permission-matrix.spec.ts）核对文档和代码一致；改了权限规则要重新生成：npx tsx --tsconfig tsconfig.node.json scripts/gen-permission-matrix.ts
import { canAddVessel, canCreateVoyage, canEditMoney, canEditOps, canEditSales, canEditVoyage, canImport, canMaintainMaster, canMaintainRoutes, canSeeMoney } from './permissions';
import type { Actor, Dept, Role, Voyage } from './voyage';

const who: Array<[string, Role, Dept | null]> = [
  ['业务员 · 大宗采购部', '业务员', '大宗采购部'], ['业务员 · 商务海运部', '业务员', '商务海运部'], ['业务员 · 仓储物流部', '业务员', '仓储物流部'],
  ['部门主管 · 大宗采购部', '部门主管', '大宗采购部'], ['部门主管 · 商务海运部', '部门主管', '商务海运部'], ['部门主管 · 仓储物流部', '部门主管', '仓储物流部'],
  ['物流管理员', '物流管理员', '仓储物流部'], ['系统管理员', '系统管理员', null],
];
const me = (role: Role, dept: Dept | null): Actor => ({ userId: 'me', name: '我', role, dept });
const voyage = (biz: string, dept: Dept, own: boolean, readonly = false): Voyage => ({ id: 'VY', biz, attr: '', no: '', vessel: 'MV', carrier: '', shipVoy: '', load: 'SURIGAO', disch: 'BAHODOPI', disch2: null, finalPort: null, laycanS: null, laycanE: null, planLoadArr: null, actLoadArr: null, loadBerth: null, planLoadDep: null, actLoadDep: null, planDischS: null, planDischE: null, eta: null, etaUpdated: null, actDischArr: null, dischBerth: null, dischDep: null, planBerths: [], actBerths: [], flags: [], owner: own ? '我' : '别人', ownerId: own ? 'me' : 'other', dept, focus: false, review: '', source: '', readonly, remark: '' });

type Col = [string, (a: Actor) => boolean];
const cols: Col[] = [
  ['新建航次', canCreateVoyage],
  ['改航次 · 本人的', (a) => canEditVoyage(a, voyage('大宗采购船', a.dept ?? '大宗采购部', true))],
  ['改航次 · 本部门他人的', (a) => canEditVoyage(a, voyage('大宗采购船', a.dept ?? '大宗采购部', false))],
  ['改航次 · 别的部门的', (a) => canEditVoyage(a, voyage('大宗采购船', a.dept === '大宗采购部' ? '商务海运部' : '大宗采购部', false))],
  ['改历史只读航次', (a) => canEditVoyage(a, voyage('大宗采购船', a.dept ?? '大宗采购部', true, true))],
  ['卸船作业 · 大宗本人航次', (a) => canEditOps(a, voyage('大宗采购船', '大宗采购部', true))],
  ['卸船作业 · 大宗他人航次', (a) => canEditOps(a, voyage('大宗采购船', '大宗采购部', false))],
  ['费用结算 · 大宗本人航次', (a) => canEditMoney(a, voyage('大宗采购船', '大宗采购部', true))],
  ['费用结算 · 大宗他人航次', (a) => canEditMoney(a, voyage('大宗采购船', '大宗采购部', false))],
  ['成品销售扩展 · 本人航次', (a) => canEditSales(a, voyage('成品销售船', '商务海运部', true))],
  ['成品销售扩展 · 他人航次', (a) => canEditSales(a, voyage('成品销售船', '商务海运部', false))],
  ['看金额', canSeeMoney],
  ['维护港口/泊位/船舶资料', canMaintainMaster],
  ['新增船舶', canAddVessel],
  ['维护经验航程', canMaintainRoutes],
  ['导入靠船计划/库存', canImport],
];

export function buildMatrix(): string {
  const head = '| 动作 | ' + who.map((w) => w[0]).join(' | ') + ' |', sep = '| --- |' + who.map(() => ' --- |').join('');
  const rows = cols.map(([name, f]) => `| ${name} | ` + who.map(([, r, d]) => (f(me(r, d)) ? '✓' : '—')).join(' | ') + ' |');
  return [
    '# 权限矩阵（由代码生成，不要手改）', '',
    '生成自 `app/server/domain/permissions.ts` 的真实判断函数；改了权限规则后运行 `npx tsx --tsconfig tsconfig.node.json scripts/gen-permission-matrix.ts` 重新生成，测试会核对文档和代码一致。',
    '✓ = 允许，— = 拒绝（接口返回 403）。「本人的」= 航次负责人是当前用户；「本部门他人的」= 同部门但负责人是别人；大宗/成品指航次的业务类型。', '',
    head, sep, ...rows, '',
    '## 其余规则', '',
    '- 所有登录用户都能：看全部航次、看容量日历/靠船计划/库存/港口/泊位/船舶/航程规则、跑预测、看预测详情、查数据质量清单。',
    '- 金额字段（费用结算）：没有「看金额」权限的用户，接口整体不返回金额字段，变更日志里金额变更也只显示「已修改」，不显示新旧值。',
    '- 数据质量问题：责任人本人或系统管理员可以「开始处理 / 关闭」；其他人 403。',
    '- 只有系统管理员能：看运行日志、连通性自检、手动重算航程规则、手动触发云空间拉取/补偿重放/兼容表刷新/数据质量扫描。',
    '- 没有任何 SSPS 平台角色的用户（真实模式）：所有接口 403；业务员/部门主管在组织架构里查不到所属部门的：403。',
    '- 定时任务由平台自动化触发器在后端内部执行，不经过登录鉴权，也没有对外暴露的令牌接口。', '',
  ].join('\n');
}
