// 飞书多维表格字段名（中文）——写飞书时用。名字以 docs/schema/base-plan.json 为准，测试里有一致性检查，改名会立刻报错。
export const F = {
  T01: { code: '港口编码', cn: '中文名称', en: '英文标准名', alias: '别名', country: '国家', region: '地区', kind: '性质', isLocal: '是否本港', status: '状态' },
  T02: { code: '泊位编码', terminal: '码头', capacity: '容量吨级（吨）', category: '泊位类别', status: '状态', basis: '依据版本', effective: '生效日期', note: '备注' },
  T03: { mmsi: 'MMSI', imo: 'IMO', name: '标准船名', alias: '船名别名', type: '船型', dwt: '载重吨 DWT', length: '船长（米）' },
  T04: {
    biz: '业务类型', attr: '业务属性', no: '船次号', vessel: '船舶', carrier: '承运方', shipVoy: '船方航次号', load: '装港', disch: '卸港', disch2: '第二卸港', finalPort: '最终目的港',
    laycanS: '受载期始', laycanE: '受载期止', planLoadArr: '计划抵装港', actLoadArr: '实际抵装港', loadBerth: '装港靠泊', planLoadDep: '计划离装港', actLoadDep: '实际离装港',
    planDischS: '计划抵卸港窗口始', planDischE: '计划抵卸港窗口止', eta: '当前 ETA（卸港）', actDischArr: '实际抵卸港', dischBerth: '卸港靠泊', dischDep: '卸港离港',
    status: '船舶状态', flags: '异常标记', planBerths: '计划泊位', actBerths: '实际泊位', owner: '负责业务员', dept: '所属部门', focus: '重点关注', review: '审核状态', source: '数据来源', remark: '备注', readonly: '历史只读',
  },
  T05: { voyage: '航次', contract: '合同号', ea: 'EA 采购订单号', big: '物资大类', name: '货物名称', alias: '物资别名', unit: '使用单位', party: '供应商/客户', tons: '预计装船重量（吨）', loadTons: '装港重量（吨）', dry: '干基折算（吨）', over: '溢短装（%）' },
  T06: {
    voyage: '航次', terms: '卸货条款', rate: '卸率（吨/天）', allowDays: '允许卸货天数', turn: 'TURN TIME（小时）', demRate: '滞期费率', demCur: '币种', demUsd: '滞期费 / 速遣费（USD）', gauge: '卸港水尺吨位',
    g1: '水尺 1（分钟）', g2: '水尺 2（分钟）', g3: '水尺 3（分钟）', fx: '汇率', portUnit: '港务费单价', portFee: '港务费（USD）', loadFee: '装卸费（USD）', truck: '汽运量（吨）', belt: '管带机运量（吨）', weigh: '过磅重量（吨）',
    other: '其他部门运量（吨）', carTurn: '倒运车数', x1Cars: 'X1 管带机车数', crossTruck: '跨月船汽运预估（吨）', crossBelt: '跨月船管带机预估（吨）', beltOff3: '3# 管带机未运行（小时）', beltOff4: '4# 管带机未运行（小时）',
    sendDay: '交接发出日', backDay: '交接签回日', noHandover: '德天不用交接', rain: '小雨保函', issue: '影响卸船因素/异常反馈',
  },
  T07: { voyage: '航次', way: '租船方式', contract: '海运合同号' },
  T08: { load: '装港', disch: '卸港', biz: '适用业务类型', exp: '经验航程（天）', expMax: '经验航程上限（天）', samples: '样本数', p50: '统计 P50（天）', p80: '统计 P80（天）', recalc: '最近重算时间', status: '状态' },
} as const;

export const DATE_KEYS = new Set(['laycanS', 'laycanE', 'planLoadArr', 'actLoadArr', 'loadBerth', 'planLoadDep', 'actLoadDep', 'planDischS', 'planDischE', 'eta', 'actDischArr', 'dischBerth', 'dischDep']);
/** 日期字段（只有日期没有时刻）：T06 的交接日、T02 的生效日期；飞书同样写毫秒时间戳，应用库是 date */
export const pad = (n: number, w = 4) => String(n).padStart(w, '0');
/** 'YYYY-MM-DD' → 飞书日期的毫秒时间戳（按 UTC+8 的零点） */
export const dayMs = (d: string | null | undefined) => (d ? Date.parse(d.slice(0, 10) + 'T00:00:00+08:00') : null);
