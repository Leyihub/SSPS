/*
 * SSPS 原型示例数据（手工构造）。
 * 船名、人名、合同号、航次号均为虚构，不含真实业务数据。
 * 字段名对照 docs/schema：T01 港口 / T02 泊位 / T04 航次 / T08 航程规则 / T10 靠船计划 / D03 批次。
 * 【重要】泊位「容量吨级」为原型示例值，不是《泊位容量表》(2026-10-08) 原值；
 *         仅 LN16 = 1 万吨来自已锁定规则。真实值进入开发阶段后由 T02 提供。
 */
(function () {
  // ---------- 基本上下文 ----------
  const today = '2026-11-04'; // 原型固定"今天"，保证截图可复现

  const user = { name: '林海川', role: '业务员', dept: '大宗采购部' };

  // ---------- T01 港口主档（子集） ----------
  const ports = [
    { code: '001', cn: '巴浩多比（IMIP）', en: 'BAHODOPI', country: '印度尼西亚', nature: '内港', isLocal: true },
    { code: '014', cn: '苏里高', en: 'SURIGAO', country: '菲律宾', nature: '外港', isLocal: false },
    { code: '015', cn: '塔加尼托', en: 'TAGANITO', country: '菲律宾', nature: '外港', isLocal: false },
    { code: '037', cn: '雅加达', en: 'JAKARTA', country: '印度尼西亚', nature: '内港', isLocal: false },
    { code: '038', cn: '泗水', en: 'SURABAYA', country: '印度尼西亚', nature: '内港', isLocal: false },
    { code: '052', cn: '海防', en: 'HAIPHONG', country: '越南', nature: '外港', isLocal: false },
  ];

  // ---------- T02 泊位主档（23 个德信可用泊位） ----------
  // 北区码头 F1–F5、F7–F11；拉博塔码头 L4、L6、L7、L8、L11、L12、LN16–LN22
  const cap = { F1: 7, F2: 7, F3: 5, F4: 5, F5: 3, F7: 5, F8: 5, F9: 3, F10: 3, F11: 2,
                L4: 5, L6: 5, L7: 3, L8: 3, L11: 2, L12: 2,
                LN16: 1, LN17: 1, LN18: 1, LN19: 1, LN20: 2, LN21: 2, LN22: 2 };
  const berths = Object.keys(cap).map((code) => ({
    code,
    terminal: code.startsWith('F') ? '北区码头' : '拉博塔码头',
    capacity: cap[code] * 10000,           // 容量吨级（吨）——示例值，见文件头说明
    category: '海船泊位',
    status: '启用',
    basis: '泊位容量表 2026-10-08',
    effective: '2026-10-08',
    note: code === 'LN16' ? 'LN16 按普通 1 万吨泊位处理' : '',
  }));

  // ---------- T08 航程规则 ----------
  const routeRules = [
    { id: 'R-001', load: 'SURIGAO', disch: 'BAHODOPI', biz: ['大宗采购船'], tier: '5万吨档',
      exp: 4, expMax: 5, owner: '周晓棠', samples: 2, p50: 4.5, p80: 5.0, recomputed: '2026-11-04' },
    { id: 'R-002', load: 'TAGANITO', disch: 'BAHODOPI', biz: ['大宗采购船'], tier: '5万吨档',
      exp: 4, expMax: 6, owner: '周晓棠', samples: 14, p50: 3.8, p80: 4.6, recomputed: '2026-11-04' },
    { id: 'R-003', load: 'JAKARTA', disch: 'BAHODOPI', biz: ['大宗采购船'], tier: null,
      exp: 5, expMax: 7, owner: '陈砚秋', samples: 9, p50: 4.4, p80: 5.2, recomputed: '2026-11-04' },
    { id: 'R-004', load: 'BAHODOPI', disch: 'HAIPHONG', biz: ['成品销售船'], tier: null,
      exp: 9, expMax: 11, owner: '韩墨', samples: 3, p50: 9.3, p80: 10.4, recomputed: '2026-11-04' },
    // 注意：SURABAYA → BAHODOPI 故意不建规则，用于演示"缺航程规则"状态
  ].map((r) => Object.assign(r, {
    basis: r.samples >= 5 ? '统计值' : '经验值',                       // 样本数 ≥ 5 → 统计值
    effP50: r.samples >= 5 ? r.p50 : r.exp,                            // 生效航程 P50
    effP80: r.samples >= 5 ? r.p80 : r.expMax,                         // 生效航程 P80
  }));

  // ---------- D03 靠船计划批次 + T10/D04 明细 ----------
  const batch = {
    batchNo: 'BP-20261103-01', planDate: '2026-11-03', source: '飞书云空间',
    fileName: '靠船计划_20261103.xlsx', status: '成功',
  };

  // 手工设定各泊位的占用区间 [预计到港, 预计靠泊, 预计卸完]（MM-DD，2026 年）
  const OCC = {
    F1: [['10-30','10-31','11-06'], ['11-09','11-10','11-12'], ['11-16','11-16','11-19']],
    F2: [['11-01','11-02','11-05'], ['11-07','11-08','11-11'], ['11-13','11-14','11-17']],
    F3: [['11-02','11-03','11-07'], ['11-11','11-12','11-15']],
    F4: [['11-04','11-05','11-09'], ['11-12','11-13','11-16']],
    F5: [['11-02','11-03','11-08'], ['11-11','11-12','11-16']],
    F7: [['10-31','11-01','11-04'], ['11-06','11-07','11-10'], ['11-14','11-15','11-18']],
    F8: [['11-03','11-04','11-08'], ['11-10','11-11','11-14']],
    F9: [['10-31','11-01','11-05'], ['11-08','11-09','11-13']],
    F10: [['11-03','11-04','11-07'], ['11-09','11-10','11-14']],
    F11: [['11-02','11-03','11-06'], ['11-09','11-10','11-13']],
    L4: [['11-01','11-02','11-06'], ['11-08','11-09','11-12'], ['11-14','11-15','11-18']],
    L6: [['11-05','11-06','11-10'], ['11-12','11-13','11-16']],
    L7: [['11-01','11-02','11-06'], ['11-07','11-08','11-12'], ['11-14','11-15','11-18']],
    L8: [['11-04','11-05','11-09'], ['11-10','11-11','11-15']],
    L11: [['10-31','11-01','11-05'], ['11-06','11-07','11-10'], ['11-12','11-13','11-16']],
    L12: [['11-03','11-04','11-08'], ['11-11','11-12','11-14']],
    LN16: [['11-01','11-02','11-04'], ['11-08','11-09','11-11']],
    LN17: [['11-04','11-05','11-07'], ['11-11','11-12','11-14']],
    LN18: [['11-02','11-03','11-06'], ['11-12','11-13','11-16']],
    LN19: [['11-05','11-06','11-09'], ['11-13','11-14','11-16']],
    LN20: [['11-01','11-02','11-05'], ['11-08','11-09','11-12']],
    LN21: [['11-06','11-07','11-10'], ['11-13','11-14','11-16']],
    LN22: [['11-03','11-04','11-06'], ['11-10','11-11','11-13']],
  };
  // 表外泊位：保留原文、标「非德信池」、不进 CMR
  const OFFPOOL = [
    { raw: 'L5', terminal: '拉博塔码头', eta: '11-05', start: '11-06', end: '11-09' },
    { raw: 'Labota T 9号码头', terminal: '拉博塔码头', eta: '11-10', start: '11-11', end: '11-14' },
    { raw: 'L10', terminal: '拉博塔码头', eta: '11-03', start: '11-04', end: '11-07' },
  ];
  const shipNames = ['MV HAILAN 101','MV TIMUR STAR','MV SELAT JAYA','MV BINTANG LAUT','MV NUSA PERDANA',
    'MV OCEAN LARK','MV MORO PIONEER','MV KARANG EMAS','MV SAMUDRA 88','MV LAUT BIRU','MV TANJUNG MAS',
    'MV CAHAYA TIMUR','MV DELTA HARMONY','MV GRAND MERIDIAN','MV SERI BAHARI','MV ANGIN BARAT',
    'MV PULAU INDAH','MV RAJA SAMUDRA','MV FAJAR 66','MV LINTANG UTARA','MV BUMI SEJAHTERA',
    'MV KEMBANG LAUT','MV TIRTA MAS','MV MEGA TRANS 3','MV SINAR HARAPAN','MV WAWONII STAR',
    'MV KENDARI SPIRIT','MV MALUKU PRIDE','MV BATU HIJAU','MV ARUNA 9'];
  const cargoByCap = { 7: '红土镍矿', 5: '石灰石', 3: '煤炭', 2: '硫磺', 1: '设备/备件' };
  const berthPlanRows = [];
  let si = 0;
  Object.keys(OCC).forEach((code) => {
    OCC[code].forEach(([eta, start, end]) => {
      const c = cap[code];
      berthPlanRows.push({
        terminal: code.startsWith('F') ? '北区码头' : '拉博塔码头',
        berthRaw: code === 'L4' ? 'Labota T 4号码头' : code,
        berth: code, inPool: true,
        vessel: shipNames[si++ % shipNames.length],
        loa: 120 + c * 25, shipType: c >= 3 ? '散货船' : '杂货船',
        cargo: cargoByCap[c], tons: Math.round(c * 10000 * 0.85 / 100) * 100,
        eta: '2026-' + eta, start: '2026-' + start, end: '2026-' + end,
        owner: si % 3 === 0 ? '外部货主' : '德信', isDexin: si % 3 !== 0,
        matchVoyage: null, batchNo: batch.batchNo,
      });
    });
  });
  OFFPOOL.forEach((o) => berthPlanRows.push({
    terminal: o.terminal, berthRaw: o.raw, berth: null, inPool: false,
    vessel: shipNames[si++ % shipNames.length], loa: 150, shipType: '散货船', cargo: '煤炭', tons: 40000,
    eta: '2026-' + o.eta, start: '2026-' + o.start, end: '2026-' + o.end,
    owner: '外部货主', isDexin: false, matchVoyage: null, batchNo: batch.batchNo,
  }));
  batch.rows = berthPlanRows.length;
  batch.validation = '通过 · ' + OFFPOOL.length + ' 行标「非德信池」· 0 行未匹配泊位';

  // ---------- T04 航次主表（子集，仅预测用到的字段） ----------
  // 本港侧窗口：本港为卸港 → 计划抵卸港窗口始/止；本港为装港 → 受载期始/止
  const V = (id, biz, vessel, load, disch, tons, s, e, status, owner, flags) => ({
    id: 'VY-2026-' + id, biz, vessel, load, disch,
    localSide: load === 'BAHODOPI' ? '装' : '卸',
    totalTons: tons, winStart: '2026-' + s, winEnd: '2026-' + e,
    status, flags: flags || [], owner, dept: biz === '成品销售船' ? '商务海运部' : '大宗采购部',
  });
  const me = '林海川';
  const voyages = [
    // —— 与 50,000 吨档竞争的大船 ——
    V('0412', '大宗采购船', 'MV GRAND MERIDIAN', 'SURIGAO', 'BAHODOPI', 55000, '11-17', '11-21', '航行中', '周晓棠'),
    V('0413', '大宗采购船', 'MV MORO PIONEER', 'TAGANITO', 'BAHODOPI', 60000, '11-18', '11-22', '未到装港', '周晓棠'),
    V('0416', '大宗采购船', null, 'SURIGAO', 'BAHODOPI', 50000, '11-19', '11-21', '待宣船', me),
    V('0418', '大宗采购船', 'MV BUMI SEJAHTERA', 'TAGANITO', 'BAHODOPI', 52000, '11-20', '11-23', '未到装港', '陈砚秋'),
    V('0419', '大宗采购船', 'MV PULAU INDAH', 'SURIGAO', 'BAHODOPI', 48000, '11-20', '11-22', '未到装港', '陈砚秋'),
    V('0421', '大宗采购船', 'MV RAJA SAMUDRA', 'JAKARTA', 'BAHODOPI', 70000, '11-21', '11-24', '未到装港', '周晓棠'),
    V('0423', '大宗采购船', 'MV KARANG EMAS', 'TAGANITO', 'BAHODOPI', 45000, '11-22', '11-24', '未到装港', '韩墨'),
    V('0425', '大宗采购船', 'MV SINAR HARAPAN', 'SURIGAO', 'BAHODOPI', 50000, '11-24', '11-26', '未到装港', '韩墨', ['取消']), // 取消：不进密度和 CMR
    V('0426', '物资备件船', 'MV DELTA HARMONY', 'JAKARTA', 'BAHODOPI', 33000, '11-25', '11-25', '未到装港', '陈砚秋'),
    V('0428', '大宗采购船', null, 'TAGANITO', 'BAHODOPI', 50000, '11-26', '11-28', '待宣船', me),
    V('0430', '成品销售船', 'MV SERI BAHARI', 'BAHODOPI', 'HAIPHONG', 40000, '11-27', '11-29', '未到装港', '韩墨'),
    V('0432', '大宗采购船', 'MV TIRTA MAS', 'SURIGAO', 'BAHODOPI', 55000, '11-28', '12-01', '未到装港', '周晓棠'),
    V('0434', '大宗采购船', null, 'TAGANITO', 'BAHODOPI', 50000, '11-29', '12-01', '待宣船', me),
    V('0435', '大宗采购船', 'MV AURA 7', 'SURIGAO', 'BAHODOPI', 45000, '11-29', '11-30', '未到装港', '陈砚秋'),
    V('0436', '大宗采购船', 'MV WAWONII STAR', 'TAGANITO', 'BAHODOPI', 35000, '11-30', '12-01', '未到装港', '周晓棠'),
    V('0437', '成品销售船', 'MV KENDARI SPIRIT', 'BAHODOPI', 'HAIPHONG', 52000, '11-30', '12-01', '未到装港', '韩墨'),
    V('0438', '大宗采购船', 'MV MALUKU PRIDE', 'SURIGAO', 'BAHODOPI', 55000, '11-30', '12-01', '未到装港', '陈砚秋'),
    V('0439', '大宗采购船', 'MV BATU HIJAU', 'TAGANITO', 'BAHODOPI', 45000, '11-29', '11-30', '未到装港', '韩墨'),
    // —— 小吨级船（对 5 万吨档不构成竞争，对更小吨级查询才计入） ——
    V('0441', '物资备件船', 'MV ANGIN BARAT', 'JAKARTA', 'BAHODOPI', 8000, '11-22', '11-23', '未到装港', '陈砚秋'),
    V('0442', '物资备件船', 'MV FAJAR 66', 'SURABAYA', 'BAHODOPI', 12000, '11-25', '11-26', '未到装港', '陈砚秋'),
    V('0443', '大宗采购船', 'MV KEMBANG LAUT', 'JAKARTA', 'BAHODOPI', 25000, '11-26', '11-28', '未到装港', '周晓棠'),
    V('0444', '大宗采购船', 'MV LINTANG UTARA', 'SURIGAO', 'BAHODOPI', 28000, '11-27', '11-29', '未到装港', '韩墨'),
    V('0445', '物资备件船', 'MV MEGA TRANS 3', 'JAKARTA', 'BAHODOPI', 6000, '11-28', '11-29', '未到装港', '陈砚秋'),
    V('0446', '成品销售船', 'MV SAMUDRA 88', 'BAHODOPI', 'HAIPHONG', 18000, '11-24', '11-27', '未到装港', '韩墨'),
  ];

  window.MOCK = { today, user, ports, berths, routeRules, batch, berthPlanRows, voyages,
    meta: { berthCapacityIllustrative: true, poolTotal: berths.length } };
})();
