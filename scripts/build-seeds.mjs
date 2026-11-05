// 生成多维表格的初始录入数据：docs/schema/seed/{T01-ports,T02-berths,T08-routes}.json，供本机 agent 录入。
//   node scripts/build-seeds.mjs
// T02 的容量吨级取自《泊位容量表》（2026-10-08，Leyinet 提供，原件含业务数据不入库，这里只留 23 个德信池泊位的容量）。
// T08 是「估算版」：没有历史样本，按航距 ÷ 经济航速推算，仅用于让系统先能跑，必须由大宗采购部校对后替换。
import { writeFileSync } from 'node:fs';

// ---------- T02：23 个德信池泊位（容量单位：万吨） ----------
const CAP = { F1: 18, F2: 10, F3: 5, F4: 7, F5: 5, F7: 3, F8: 1.5, F9: 5, F10: 6, F11: 2.5,
  L4: 7.5, L6: 7.5, L7: 7.5, L8: 3, L11: 1, L12: 10, LN16: 1, LN17: 1, LN18: 1, LN19: 1, LN20: 1, LN21: 1, LN22: 1 };
const berths = Object.entries(CAP).map(([code, w]) => ({
  泊位编码: code, 码头: code.startsWith('F') ? '北区码头' : '拉博塔码头', '容量吨级（吨）': Math.round(w * 10000), 状态: '启用',
  依据版本: '泊位容量表 2026-10-08', 生效日期: '2026-10-08',
  备注: code === 'LN16' ? '危化品码头，按普通 1 万吨泊位处理' : '',
}));
// 泊位类别（海船 / 驳船）容量表里没有这一列，不假定，留空待确认

// ---------- T01：本港 + 经验航程用到的港口 ----------
const ports = [
  ['001', 'IMIP港口', 'BAHODOPI', ['巴浩多比', '莫罗瓦利', 'IMIP', '德信本港'], '印度尼西亚', '内港', true],
  ['002', '苏里高', 'SURIGAO', [], '菲律宾', '外港', false],
  ['003', '塔加尼托', 'TAGANITO', [], '菲律宾', '外港', false],
  ['004', '雅加达', 'JAKARTA', [], '印度尼西亚', '内港', false],
  ['005', '泗水', 'SURABAYA', [], '印度尼西亚', '内港', false],
  ['006', '新加坡', 'SINGAPORE', [], '其他', '外港', false],
  ['007', '秦皇岛', 'QINHUANGDAO', [], '中国', '外港', false],
  ['008', '唐山', 'TANGSHAN', ['京唐港'], '中国', '外港', false],
  ['009', '天津', 'TIANJIN', [], '中国', '外港', false],
  ['010', '海防', 'HAIPHONG', [], '越南', '外港', false],
].map(([c, cn, en, alias, country, nature, local]) => ({ 港口编码: c, 中文名称: cn, 英文标准名: en, 别名: alias.join('\n'), 国家: country, 性质: nature, 是否本港: local, 状态: '启用' }));

// ---------- T08：经验航程估算版 ----------
// 假设（可改）：经济航速 11 节 → 264 海里/天；经验航程 = ⌈航距 ÷ 264⌉ + 1 天（进出港、锚地）；上限 = ⌈经验航程 × 1.25⌉（相当于 P80 的粗略替代）。
// 航距为本港与各港之间的大致海里数，是估计值，不是航海图精确值。
const KNOTS = 11, PER_DAY = KNOTS * 24, PAD_DAYS = 1, UPPER = 1.25;
const R = [  // [装港, 卸港, 业务类型[], 航距 nm]
  ['SURIGAO', 'BAHODOPI', ['大宗采购船'], 800], ['TAGANITO', 'BAHODOPI', ['大宗采购船'], 800],
  ['JAKARTA', 'BAHODOPI', ['大宗采购船', '物资备件船'], 1300], ['SURABAYA', 'BAHODOPI', ['大宗采购船', '物资备件船'], 1000],
  ['SINGAPORE', 'BAHODOPI', ['物资备件船'], 1650],
  ['QINHUANGDAO', 'BAHODOPI', ['大宗采购船'], 3200], ['TANGSHAN', 'BAHODOPI', ['大宗采购船'], 3250], ['TIANJIN', 'BAHODOPI', ['大宗采购船'], 3300],
  ['BAHODOPI', 'HAIPHONG', ['成品销售船'], 2000], ['BAHODOPI', 'TIANJIN', ['成品销售船'], 3300],
];
const routes = R.map(([load, disch, biz, nm]) => {
  const exp = Math.ceil(nm / PER_DAY) + PAD_DAYS;
  return { 装港: load, 卸港: disch, 适用业务类型: biz, 吨级档: '', '经验航程（天）': exp, '经验航程上限（天）': Math.ceil(exp * UPPER), 状态: '启用',
    来源: '估算：航距约 ' + nm + ' 海里 ÷ ' + PER_DAY + ' 海里/天 + ' + PAD_DAYS + ' 天；待大宗采购部校对' };
});

const out = { 'T01-ports': ports, 'T02-berths': berths, 'T08-routes': routes };
for (const [k, v] of Object.entries(out)) writeFileSync('docs/schema/seed/' + k + '.json', JSON.stringify(v, null, 2) + '\n');
console.log('T01 ' + ports.length + ' 行；T02 ' + berths.length + ' 行；T08 ' + routes.length + ' 行（估算版）');
for (const r of routes) console.log(r.装港 + ' → ' + r.卸港, r['经验航程（天）'] + ' / ' + r['经验航程上限（天）'], r.适用业务类型.join('+'));
