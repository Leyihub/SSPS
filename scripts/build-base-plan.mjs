// 生成 docs/schema/base-plan.json：把《多维表格建设清单》整理成机器可读的建表计划，供本机 agent 照着建表。
// 字段名、类型、选项以 docs/schema/base-build-checklist.md 为准；改清单后请同步改这里并重新运行：
//   node scripts/build-base-plan.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const CHECKLIST = 'docs/schema/base-build-checklist.md';
const md = readFileSync(CHECKLIST, 'utf8');

// 类型：text 文本 / number 数字 / single 单选 / multi 多选 / datetime 日期含时间 / date 日期 / checkbox 复选框 /
// person 人员 / autonumber 自动编号 / link 单向关联 / duplex 双向关联 / lookup 查找引用 / formula 公式
const t = (name, note) => ({ name, type: 'text', ...(note ? { note } : {}) });
const num = (name, decimals = 2, note) => ({ name, type: 'number', decimals, ...(note ? { note } : {}) });
const single = (name, options = [], note) => ({ name, type: 'single', options, ...(note ? { note } : {}) });
const multi = (name, options = [], note) => ({ name, type: 'multi', options, ...(note ? { note } : {}) });
const dt = (name) => ({ name, type: 'datetime', format: 'yyyy/MM/dd HH:mm' });
const d = (name) => ({ name, type: 'date', format: 'yyyy/MM/dd' });
const cb = (name, note) => ({ name, type: 'checkbox', ...(note ? { note } : {}) });
const person = (name, multiple = false) => ({ name, type: 'person', multiple });
const auto = (name, example) => ({ name, type: 'autonumber', example });
const link = (name, target, multiple = false, note) => ({ name, type: 'link', target, multiple, ...(note ? { note } : {}) });
const duplex = (name, target, backName, note) => ({ name, type: 'duplex', target, back_field_name: backName, ...(note ? { note } : {}) });
const lookup = (name, via, targetField, agg = 'none', note) => ({ name, type: 'lookup', via, target_field: targetField, aggregate: agg, ...(note ? { note } : {}) });
const formula = (name, logic, result, note) => ({ name, type: 'formula', logic, result, ...(note ? { note } : {}) });
const sys = (f) => Object.assign(f, { system_written: true });

const tables = [
  { key: 'T01', name: 'T01 港口主档', fields: [
    t('港口编码', '唯一；沿用原「编码」001…'), t('中文名称'), t('英文标准名', '航次里显示的名称，如 BAHODOPI'),
    t('别名', '一行一个旧写法'), single('国家', ['印度尼西亚', '中国', '菲律宾', '越南', '其他'], '待确认，迁移时再补'),
    t('地区'), single('性质', ['内港', '外港']), cb('是否本港', '只有 BAHODOPI 勾选'), single('状态', ['启用', '停用']),
  ], seed: [{ 中文名称: '巴浩多比', 英文标准名: 'BAHODOPI', 是否本港: true, 状态: '启用' }] },

  { key: 'T02', name: 'T02 泊位主档', fields: [
    t('泊位编码', '唯一；北区 F1–F5、F7–F11；拉博塔 L4、L6、L7、L8、L11、L12、LN16–LN22'),
    single('码头', ['北区码头', '拉博塔码头']), num('容量吨级（吨）', 0, '只取自《泊位容量表》2026-10-08'),
    single('泊位类别', ['海船泊位', '驳船泊位']), single('状态', ['启用', '停用']), t('依据版本'), d('生效日期'), t('备注'),
  ], seed: [], seed_note: '23 行泊位等《泊位容量表》原件到位后再录入，本次不建行' },

  { key: 'T03', name: 'T03 船舶主档', fields: [
    auto('船舶编号', 'VS-0001'), t('MMSI', '唯一'), t('IMO'), t('标准船名'), t('船名别名'),
    single('船型', ['散货船', '拖驳组合', '集装箱船', '杂货船', '其他']), num('载重吨 DWT', 0), num('船长（米）', 1),
    single('吨级档', ['5 万吨'], '待确认，先只建「5 万吨」'),
  ] },

  { key: 'T04', name: 'T04 航次主表', fields: [
    auto('航次编号', 'VY-2026-0001'),
    single('业务类型', ['大宗采购船', '成品销售船', '物资备件船']),
    single('业务属性', ['内贸', '外贸', '雅加达物资', '国内物资', '本地', '国际']),
    t('船次号'), link('船舶', 'T03'),
    lookup('船名', '船舶', '标准船名'), lookup('MMSI', '船舶', 'MMSI'),
    t('承运方'), t('船方航次号'),
    link('装港', 'T01'), link('卸港', 'T01'), link('第二卸港', 'T01'), link('最终目的港', 'T01'),
    lookup('装港是否本港', '装港', '是否本港', 'none', '辅助字段，供「本港侧」公式使用'),
    formula('本港侧', '装港是否本港 为真 → "装"，否则 → "卸"', 'text'),
    dt('受载期始'), dt('受载期止'), dt('计划抵装港'), dt('实际抵装港'), dt('装港靠泊'), dt('计划离装港'), dt('实际离装港'),
    dt('计划抵卸港窗口始'), dt('计划抵卸港窗口止'), sys(dt('当前 ETA（卸港）')), dt('实际抵卸港'), dt('卸港靠泊'), dt('卸港离港'),
    sys(single('船舶状态', ['待宣船', '未到装港', '装港等泊', '装港装货', '航行中', '卸港等泊', '卸港卸货', '已结束'])),
    multi('异常标记', ['取消', '延期', '移泊', '改港']),
    formula('装港逾期', '实际抵装港 和 受载期止 都有值，且 实际抵装港 晚于 受载期止 → "是"，否则为空', 'text'),
    formula('实际航程（天）', '两者都有值时：实际抵卸港 − 实际离装港，单位天，保留 2 位小数；否则为空', 'number'),
    formula('本港等泊（天）', '本港侧 = "卸"：卸港靠泊 − 实际抵卸港；本港侧 = "装"：装港靠泊 − 实际抵装港；单位天，2 位小数，缺值为空', 'number'),
    formula('本港作业（天）', '本港侧 = "卸"：卸港离港 − 卸港靠泊；本港侧 = "装"：实际离装港 − 装港靠泊；单位天，2 位小数，缺值为空', 'number'),
    link('计划泊位', 'T02', true), link('实际泊位', 'T02', true),
    person('负责业务员'), single('所属部门', ['大宗采购部', '商务海运部', '仓储物流部']), cb('重点关注'),
    single('审核状态', ['待审核', '已审核']),
    sys(single('数据来源', ['企微商务海运表', '企微大宗到船表', '历史副本', '应用录入'])),
    sys(t('原记录键')), sys(cb('历史只读')), t('备注'),
  ], later: ['总货量（吨）', '拼船'] },

  { key: 'T05', name: 'T05 航次货物明细', fields: [
    auto('明细编号', 'CL-000001'), duplex('航次', 'T04', '货物明细', '在 T04 自动生成反向字段「货物明细」'),
    t('合同号'), t('EA 采购订单号'), single('物资大类', ['原料', '燃料', '辅料', '成品', '工程辅料']),
    single('物资类别', [], '选项由迁移脚本从旧表枚举，先建空选项'), t('货物名称'), t('物资别名'),
    single('使用单位', ['DSI', 'DCI', 'DXI', '金瑞'], '备注性质，不参与计算'), single('归属事业部', [], '选项由迁移脚本枚举'),
    t('供应商/客户'), num('预计装船重量（吨）', 2), num('装港重量（吨）', 2), num('干基折算（吨）', 2), num('溢短装（%）', 2),
    single('检测公司', [], '选项由迁移脚本枚举'), person('合同执行人员'),
    single('储运物料名', [], '备注性质'), single('储运大类', [], '备注性质'), single('本地国际', [], '备注性质'),
  ] },

  { key: 'T06', name: 'T06 大宗卸船结算扩展', fields: [
    auto('结算编号', 'BS-000001'),
    duplex('航次', 'T04', '大宗卸船结算', '与大宗航次 1:1'),
    t('卸货条款'), num('卸率（吨/天）', 0, 'CQD 时留空'), num('允许卸货天数', 2), num('TURN TIME（小时）', 0),
    { ...num('滞期费率', 2), group: '费用' }, { ...single('币种', ['IDR', 'USD']), group: '费用' },
    { ...num('滞期费 / 速遣费（USD）', 2), group: '费用' },
    num('卸港水尺吨位', 2), num('水尺 1（分钟）', 0), num('水尺 2（分钟）', 0), num('水尺 3（分钟）', 0),
    { ...num('汇率', 4), group: '费用' }, { ...num('港务费单价', 4), group: '费用' },
    { ...num('港务费（USD）', 2), group: '费用' }, { ...num('装卸费（USD）', 2), group: '费用' },
    num('汽运量（吨）', 2), num('管带机运量（吨）', 2), num('过磅重量（吨）', 2), num('其他部门运量（吨）', 2),
    num('倒运车数', 0), num('X1 管带机车数', 0), num('跨月船汽运预估（吨）', 2), num('跨月船管带机预估（吨）', 2),
    num('3# 管带机未运行（小时）', 2), num('4# 管带机未运行（小时）', 2),
    d('交接发出日'), d('交接签回日'), cb('德天不用交接'), cb('小雨保函'), t('影响卸船因素/异常反馈'),
  ] },

  { key: 'T07', name: 'T07 成品销售扩展', fields: [
    auto('扩展编号', 'SE-0001'), duplex('航次', 'T04', '成品销售扩展', '与成品航次 1:1'),
    single('租船方式', ['CFR', 'FOB']), t('海运合同号'),
  ] },

  { key: 'T08', name: 'T08 航程规则', fields: [
    auto('规则编号', 'RR-0001'), link('装港', 'T01'), link('卸港', 'T01'),
    multi('适用业务类型', ['大宗采购船', '成品销售船', '物资备件船']), single('吨级档', ['5 万吨'], '待确认'),
    num('经验航程（天）', 1), num('经验航程上限（天）', 1), person('经验值维护人'),
    sys(num('样本数', 0)), sys(num('统计 P50（天）', 2)), sys(num('统计 P80（天）', 2)),
    formula('采用口径', '样本数 ≥ 5 → "统计值"，否则 → "经验值"', 'text'),
    formula('生效航程 P50（天）', '采用口径 = "统计值" → 统计 P50（天），否则 → 经验航程（天）', 'number'),
    formula('生效航程 P80（天）', '采用口径 = "统计值" → 统计 P80（天），否则 → 经验航程上限（天）', 'number'),
    sys(dt('最近重算时间')), single('状态', ['启用', '停用']),
  ] },

  { key: 'T10', name: 'T10 靠船计划', fields: [
    t('码头'), t('泊位原文'), link('泊位', 'T02', false, '表外泊位留空'), t('船名'), num('船长', 1), t('船舶类型'), t('物资'),
    num('吨位', 0), d('预计到港'), dt('预计靠泊'), dt('预计卸完'), t('从属单位'), cb('是否德信', '只做展示，原始文件无此列，来源待定'),
    link('匹配航次', 'T04'), t('批次号'),
  ].map(sys) },
];

// 兼容表：列名和顺序取自清单附录 A、B，全部建成文本，由后端整表重写
function appendix(title) {
  const i = md.indexOf(title); if (i < 0) throw new Error('清单里找不到 ' + title);
  const rest = md.slice(i + title.length), end = rest.indexOf('\n## ');
  return (end < 0 ? rest : rest.slice(0, end)).split('\n').filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split('|')[2].trim());
}
const A = appendix('## 附录 A'), B = appendix('## 附录 B');
if (A.length !== 33 || B.length !== 87) throw new Error('附录列数不对：' + A.length + ' / ' + B.length);
tables.push({ key: 'T09a', name: 'T09a 兼容_商务海运船舶动态', fields: A.map((n) => sys(t(n))) });
tables.push({ key: 'T09b', name: 'T09b 兼容_大宗到船计划', fields: B.map((n) => sys(t(n))) });

const later = [
  { table: 'T04', after: 'T05', fields: [
    lookup('总货量（吨）', '货物明细', '预计装船重量（吨）', 'sum', '汇总 T05；「货物明细」是 T05 建「航次」双向关联时自动生成的反向字段'),
    formula('拼船', '货物明细 关联的记录数 ≥ 2 → "是"，否则 → "否"', 'text'),
  ] },
];

// 自检：表内字段不重名
for (const tb of tables) {
  const seen = new Set();
  for (const f of tb.fields) { if (seen.has(f.name)) throw new Error(tb.key + ' 字段重名：' + f.name); seen.add(f.name); }
}

const plan = {
  base: '德信智慧航运主数据',
  source: CHECKLIST,
  generated_by: 'scripts/build-base-plan.mjs',
  order: ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T10', 'T09a', 'T09b'],
  rules: [
    '每张表的第一个字段作为索引列（主字段）：新建表自带一个默认字段，把它改名并改类型为第一个字段，不要另建。',
    '字段名一字不差，含括号、空格和斜杠。',
    'required / unique 不在多维表格里设置，由应用后端校验。',
    'system_written 字段建完后由你在高级权限里设为只读（agent 不改权限）。',
    'group = 费用 的字段只有大宗采购部能看，由应用后端控制；Base 不对业务角色开放。',
  ],
  formula_selfcheck: {
    row: { 实际离装港: '2026-10-24 15:00', 实际抵卸港: '2026-10-30 09:30', 卸港靠泊: '2026-10-31 07:00', 卸港离港: '2026-11-03 19:30', 卸港: '本港 BAHODOPI' },
    expect: { '实际航程（天）': 5.77, '本港等泊（天）': 0.90, '本港作业（天）': 3.52, 本港侧: '卸' },
  },
  tables,
  later,
};
writeFileSync('docs/schema/base-plan.json', JSON.stringify(plan, null, 2) + '\n');
const n = tables.reduce((s, x) => s + x.fields.length, 0) + later.reduce((s, x) => s + x.fields.length, 0);
console.log('docs/schema/base-plan.json：' + tables.length + ' 张表，' + n + ' 个字段');
