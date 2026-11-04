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

/*
 * ===== 运营数据扩充（P01、P04–P10 使用）=====
 * 同样全部虚构。字段名对照 docs/schema：T03 船舶、T04 航次、T05 货物明细、T06 卸船结算、T07 销售扩展、
 * T08 航程规则、D01 ETA 修订、D02 变更日志、D03 靠船计划批次、D08 数据质量、D09 同步日志。
 * 航次的「船舶状态」不在这里写死，由 assets/common.js 的 statusOf() 按 status-rules.md 从时间节点推导。
 */
(function () {
  const M = window.MOCK, DAY = 86400000;
  const dnOf = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const TODAY = dnOf(M.today);
  const at = (off, hm) => isoOf(TODAY + off) + ' ' + (hm || '08:00');       // 相对今天的日期时间
  const abs = (iso, hm) => (iso.length > 10 ? iso : iso + ' ' + (hm || '08:00'));
  M.now = M.today + ' 09:42';
  M.people = {
    '林海川': { dept: '大宗采购部', role: '业务员' }, '周晓棠': { dept: '大宗采购部', role: '部门主管' }, '陈砚秋': { dept: '大宗采购部', role: '业务员' },
    '韩墨': { dept: '商务海运部', role: '业务员' }, '苏望舒': { dept: '商务海运部', role: '部门主管' },
    '顾明远': { dept: '仓储物流部', role: '物流管理员' }, '钟立诚': { dept: '仓储物流部', role: '系统管理员' },
  };

  // ---------- T01 港口：补充别名与更多港口 ----------
  const extraPorts = [
    { code: '061', cn: '青岛', en: 'QINGDAO', country: '中国', nature: '外港', isLocal: false },
    { code: '062', cn: '天津', en: 'TIANJIN', country: '中国', nature: '外港', isLocal: false },
    { code: '071', cn: '新加坡', en: 'SINGAPORE', country: '新加坡', nature: '外港', isLocal: false },
    { code: '039', cn: '肯达里', en: 'KENDARI', country: '印度尼西亚', nature: '内港', isLocal: false },
    { code: '063', cn: '秦皇岛', en: 'QINHUANGDAO', country: '中国', nature: '外港', isLocal: false },
    { code: '064', cn: '唐山', en: 'TANGSHAN', country: '中国', nature: '外港', isLocal: false },
    { code: '065', cn: '新村港', en: 'XINCUN', country: '中国', nature: '外港', isLocal: false },
  ];
  extraPorts.forEach((p) => M.ports.push(p));
  const alias = { BAHODOPI: ['IMIP', 'BAHODOPI(IMIP)', 'BAHODOPI PORT', '巴浩多比港'], SURIGAO: ['SURIGAO PORT', 'Surigao', '苏里高港'], TAGANITO: ['TAGANITO PORT', 'Taganito', '塔加尼托港'],
    JAKARTA: ['JKT', 'JAKARTA PORT', '雅加达港', 'TANJUNG PRIOK'], SURABAYA: ['SBY', 'SURABAYA PORT', '泗水港'], HAIPHONG: ['HAI PHONG', 'HAIPHONG PORT', '海防港'],
    QINGDAO: ['QINGDAO PORT', 'Tsingtao'], TIANJIN: ['TIANJIN XINGANG', '天津新港'], SINGAPORE: ['SIN', 'SINGAPORE PORT'], KENDARI: ['KENDARI PORT'], QINHUANGDAO: ['QHD', '秦皇岛港', 'QINHUANGDAO PORT'], TANGSHAN: ['京唐港', '曹妃甸', 'TANGSHAN PORT'], XINCUN: ['新村', 'XINCUN PORT'] };
  const region = { BAHODOPI: '中苏拉威西', SURIGAO: '棉兰老', TAGANITO: '棉兰老', JAKARTA: '爪哇', SURABAYA: '爪哇', HAIPHONG: '越南北部', QINGDAO: '山东', TIANJIN: '天津', SINGAPORE: '—', KENDARI: '东南苏拉威西', QINHUANGDAO: '河北', TANGSHAN: '河北', XINCUN: '浙江' };
  M.ports.forEach((p) => { p.alias = alias[p.en] || []; p.region = region[p.en] || ''; p.status = '启用'; });

  // ---------- 航次（T04 子集，丰富版） ----------
  const base = (o) => Object.assign({ attr: '内贸', no: '', carrier: '', shipVoy: '', disch2: null, finalPort: null, laycanS: null, laycanE: null, planLoadArr: null, actLoadArr: null, loadBerth: null,
    planLoadDep: null, actLoadDep: null, planDischS: null, planDischE: null, eta: null, actDischArr: null, dischBerth: null, dischDep: null, flags: [], planBerths: [], actBerths: [],
    focus: false, review: '待审核', source: '应用录入', origKey: '', readonly: false, remark: '', tons: 0 }, o);
  const list = [];
  // 1) 预测用的航次（已有）→ 补全时间节点，使状态能由节点推导出来
  M.voyages.forEach((v) => {
    const wS = dnOf(v.winStart), wE = dnOf(v.winEnd), prod = v.biz === '成品销售船';
    const o = base({ id: v.id, biz: v.biz, attr: prod ? '外贸' : (v.biz === '物资备件船' ? '雅加达物资' : '内贸'), vessel: v.vessel, load: v.load, disch: v.disch, tons: v.totalTons,
      flags: v.flags.slice(), owner: v.owner, dept: v.dept, no: prod ? 'CN' + (700 + list.length) : (v.biz === '物资备件船' ? 'FN' + (700 + list.length) : ''), source: '应用录入' });
    if (prod) { o.laycanS = at(wS - TODAY, '00:00'); o.laycanE = at(wE - TODAY, '23:59'); } else { o.planDischS = at(wS - TODAY, '00:00'); o.planDischE = at(wE - TODAY, '23:59'); }
    if (v.status !== '待宣船') { o.planLoadArr = at(wS - TODAY - 6, '08:00'); o.planLoadDep = at(wS - TODAY - 5, '18:00'); }
    if (v.status === '航行中') { o.actLoadArr = at(-3, '14:00'); o.actLoadDep = at(-1, '16:30'); o.eta = at(wS - TODAY, '10:00'); o.etaUpdated = at(-1, '17:20'); }
    list.push(o);
  });
  const byId = (id) => list.find((v) => v.id === 'VY-2026-' + id);
  // 让「航行中」的航次里有 1 条 ETA 已超过 3 天没更新（工作台待办用）
  const ghost = byId('0412'); if (ghost) { ghost.etaUpdated = at(-5, '09:10'); ghost.owner = M.user.name; ghost.dept = M.user.dept; }
  // 2) 手工补充：已结束、取消、缺节点、历史只读、本周到港等
  const add = (o) => list.push(base(o));
  add({ id: 'VY-2026-0301', biz: '大宗采购船', vessel: 'MV OCEAN LARK', load: 'SURIGAO', disch: 'BAHODOPI', tons: 54200, owner: '林海川', dept: '大宗采购部', source: '企微大宗到船表', review: '已审核', origKey: '大宗到船表#0188',
    planDischS: at(-14, '00:00'), planDischE: at(-12, '23:59'), planLoadArr: at(-21), actLoadArr: at(-20, '09:00'), planLoadDep: at(-19), actLoadDep: at(-19, '15:30'), eta: at(-13, '10:00'), actDischArr: at(-13, '11:20'), dischBerth: at(-12, '06:40'), dischDep: at(-9, '21:10'), actBerths: ['F2'], planBerths: ['F2'] });
  add({ id: 'VY-2026-0302', biz: '大宗采购船', vessel: 'MV TIRTA MAS', load: 'TAGANITO', disch: 'BAHODOPI', tons: 48800, owner: '周晓棠', dept: '大宗采购部', source: '企微大宗到船表', review: '已审核', focus: true,
    planDischS: at(-20, '00:00'), planDischE: at(-18, '23:59'), planLoadArr: at(-26), actLoadArr: at(-26, '10:00'), actLoadDep: at(-24, '12:00'), eta: at(-19), actDischArr: at(-19, '08:30'), dischBerth: at(-18, '05:00'), dischDep: at(-15, '19:30'), actBerths: ['L4'], planBerths: ['L4'] });
  add({ id: 'VY-2026-0303', biz: '成品销售船', attr: '外贸', no: 'CN661', vessel: 'MV SAMUDRA 88', load: 'BAHODOPI', disch: 'HAIPHONG', finalPort: 'HAIPHONG', tons: 26000, owner: '韩墨', dept: '商务海运部', source: '企微商务海运表', review: '已审核',
    laycanS: at(-16, '00:00'), laycanE: at(-10, '23:59'), planLoadArr: at(-14), actLoadArr: at(-13, '07:30'), loadBerth: at(-12, '10:00'), actLoadDep: at(-9, '14:00'), planLoadDep: at(-9), eta: at(-1), actDischArr: at(-1, '09:00'), dischBerth: at(0, '07:00'), actBerths: ['F9'] });
  add({ id: 'VY-2026-0304', biz: '大宗采购船', vessel: 'MV KEMBANG LAUT', load: 'JAKARTA', disch: 'BAHODOPI', tons: 31000, owner: '陈砚秋', dept: '大宗采购部', flags: ['取消'], planDischS: at(-6, '00:00'), planDischE: at(-4, '23:59'), planLoadArr: at(-12), remark: '船东违约，货物改装下一艘' });
  add({ id: 'VY-2026-0305', biz: '大宗采购船', vessel: 'MV BINTANG LAUT', load: 'SURIGAO', disch: 'BAHODOPI', tons: 51500, owner: '林海川', dept: '大宗采购部', focus: true, planBerths: ['F1'],
    planDischS: at(3, '00:00'), planDischE: at(5, '23:59'), planLoadArr: at(-6), actLoadArr: at(-6, '11:00'), actLoadDep: at(-4, '13:30'), eta: at(4, '08:00'), etaUpdated: at(-5, '10:05') });
  add({ id: 'VY-2026-0306', biz: '大宗采购船', vessel: 'MV NUSA PERDANA', load: 'TAGANITO', disch: 'BAHODOPI', tons: 47000, owner: '林海川', dept: '大宗采购部', planBerths: ['L6'],
    planDischS: at(2, '00:00'), planDischE: at(4, '23:59'), planLoadArr: at(-7), actLoadArr: at(-6, '09:30'), actLoadDep: at(-3, '18:00'), eta: at(2, '14:00'), etaUpdated: at(-1, '16:40') });
  add({ id: 'VY-2026-0307', biz: '大宗采购船', vessel: 'MV SELAT JAYA', load: 'SURIGAO', disch: 'BAHODOPI', tons: 43200, owner: '林海川', dept: '大宗采购部', planBerths: ['F3'], actBerths: [],
    planDischS: at(-1, '00:00'), planDischE: at(1, '23:59'), planLoadArr: at(-8), actLoadArr: at(-8, '10:00'), eta: at(0, '06:00'), actDischArr: at(0, '05:40'), remark: '实际离装港时间漏填，需补录' });  // 缺实际离装港 → 待补节点
  add({ id: 'VY-2026-0308', biz: '成品销售船', attr: '外贸', no: 'CN662', vessel: 'MV ANGIN BARAT', load: 'BAHODOPI', disch: 'QINGDAO', finalPort: 'QINGDAO', tons: 22000, owner: '韩墨', dept: '商务海运部',
    laycanS: at(-2, '00:00'), laycanE: at(4, '23:59'), planLoadArr: at(-3), actLoadArr: at(-2, '13:00'), loadBerth: at(-1, '08:00'), planLoadDep: at(3), planBerths: ['F9'], actBerths: ['F9'] });
  add({ id: 'VY-2026-0309', biz: '成品销售船', attr: '内贸', no: 'CN663', vessel: 'MV PULAU INDAH', load: 'BAHODOPI', disch: 'TIANJIN', finalPort: 'TIANJIN', tons: 18500, owner: '韩墨', dept: '商务海运部', focus: true,
    laycanS: at(0, '00:00'), laycanE: at(6, '23:59'), planLoadArr: at(-1), actLoadArr: at(0, '04:50'), planLoadDep: at(4), planBerths: ['F10'] });
  add({ id: 'VY-2026-0310', biz: '物资备件船', attr: '国内物资', no: 'FN706', vessel: 'MV FAJAR 66', load: 'SURABAYA', disch: 'BAHODOPI', tons: 9000, owner: '陈砚秋', dept: '大宗采购部',
    planDischS: at(5, '00:00'), planDischE: at(7, '23:59'), planLoadArr: at(0), planLoadDep: at(1) });
  add({ id: 'VY-2026-0311', biz: '大宗采购船', vessel: 'MV MEGA TRANS 3', load: 'TAGANITO', disch: 'BAHODOPI', tons: 36000, owner: '周晓棠', dept: '大宗采购部', planBerths: ['F5'],
    planDischS: at(6, '00:00'), planDischE: at(8, '23:59'), planLoadArr: at(-1), actLoadArr: at(0, '03:20'), planLoadDep: at(2) });   // 大宗：有实际抵装港 → 装港装货
  add({ id: 'VY-2026-0312', biz: '大宗采购船', vessel: 'MV WAWONII STAR', load: 'SURIGAO', disch: 'BAHODOPI', tons: 46500, owner: '陈砚秋', dept: '大宗采购部', source: '历史副本', readonly: true, review: '已审核', origKey: '历史副本#2231',
    planDischS: '2026-03-12 00:00', planDischE: '2026-03-14 23:59', actLoadArr: '2026-03-05 08:00', actLoadDep: '2026-03-07 10:00', actDischArr: '2026-03-12 09:00', dischBerth: '2026-03-13 04:00', dischDep: '2026-03-16 20:00', eta: '2026-03-12 08:00', actBerths: ['L6'] });
  add({ id: 'VY-2026-0313', biz: '大宗采购船', vessel: 'MV KARANG EMAS', load: 'JAKARTA', disch: 'BAHODOPI', disch2: 'SURABAYA', tons: 39500, owner: '周晓棠', dept: '大宗采购部', source: '历史副本', readonly: true, review: '已审核', origKey: '历史副本#1904',
    planDischS: '2026-02-20 00:00', planDischE: '2026-02-22 23:59', actLoadArr: '2026-02-12 11:00', actLoadDep: '2026-02-14 09:30', actDischArr: '2026-02-21 07:10', dischBerth: '2026-02-21 18:00', dischDep: '2026-02-24 22:30', eta: '2026-02-21 08:00', actBerths: ['F7'] });
  add({ id: 'VY-2026-0314', biz: '物资备件船', attr: '雅加达物资', no: 'FN707', vessel: 'MV TANJUNG MAS', load: 'JAKARTA', disch: 'BAHODOPI', tons: 7200, owner: '陈砚秋', dept: '大宗采购部', review: '已审核',
    planDischS: at(-3, '00:00'), planDischE: at(-1, '23:59'), planLoadArr: at(-9), actLoadArr: at(-9, '10:00'), loadBerth: at(-9, '14:00'), actLoadDep: at(-7, '09:00'), eta: at(-2), actDischArr: at(-2, '07:00'), dischBerth: at(-1, '09:00'), dischDep: at(0, '02:30'), actBerths: ['LN17'] });
  // 3) 靠船计划里的德信船：每条都生成对应航次（保证靠船计划与航次表一致）；故意留 3 条不生成，用来演示「未匹配航次」告警
  const used = new Set(M.voyages.map((v) => v.vessel).concat(list.map((v) => v.vessel)));
  const dex = M.berthPlanRows.filter((r) => r.inPool && r.isDexin);
  const skip = new Set(dex.slice(-3));
  const roman = ['', ' II', ' III', ' IV'];
  let gen = 320; const owners = ['林海川', '周晓棠', '陈砚秋'];
  dex.forEach((r) => {
    let k = 0; while (used.has(r.vessel + roman[k])) k++;
    r.vessel = r.vessel + roman[k]; used.add(r.vessel);
    if (skip.has(r)) return;
    const s = dnOf(r.start), e = dnOf(r.end), eta = dnOf(r.eta), id = 'VY-2026-0' + (gen++), load = ['SURIGAO', 'TAGANITO', 'JAKARTA'][gen % 3], ow = owners[gen % 3];
    const o = base({ id, biz: '大宗采购船', vessel: r.vessel, load, disch: 'BAHODOPI', tons: r.tons, owner: ow, dept: '大宗采购部', review: '已审核', planBerths: [r.berth],
      planDischS: r.eta + ' 00:00', planDischE: r.eta + ' 23:59', planLoadArr: isoOf(eta - 9) + ' 08:00', actLoadArr: isoOf(eta - 8) + ' 10:00', actLoadDep: isoOf(Math.min(eta - 6, TODAY - 1)) + ' 15:00', eta: r.eta + ' 08:00' });
    if (eta > TODAY) { o.actLoadArr = isoOf(Math.min(eta - 8, TODAY - 3)) + ' 10:00'; o.etaUpdated = at(-1, '15:00'); }
    else { o.actDischArr = r.eta + ' 09:30'; if (s <= TODAY) { o.dischBerth = r.start + ' 07:00'; o.actBerths = [r.berth]; } if (e < TODAY) o.dischDep = r.end + ' 20:00'; }
    list.push(o); r.matchVoyage = id;
  });
  list.forEach((v) => { if (!v.etaUpdated && v.eta && !v.actDischArr) v.etaUpdated = at(-1, '15:00'); });
  M.voyageList = list;

  // ---------- T05 货物明细 ----------
  const cargoKinds = { 大宗采购船: [['原料', '红土镍矿', 'DXI'], ['辅料', '石灰石', 'DSI'], ['燃料', '煤炭', 'DCI'], ['辅料', '硫磺', '金瑞']], 成品销售船: [['成品', '线材', ''], ['成品', '热卷', ''], ['成品', '方坯', '']], 物资备件船: [['工程辅料', '设备备件', '金瑞']] };
  const suppliers = ['东盛矿业', '岛海资源', '远航贸易', '赤道能源', '南洋物产'];
  M.cargoLines = [];
  list.forEach((v, i) => {
    const kinds = cargoKinds[v.biz], two = v.tons >= 45000 && v.biz === '大宗采购船' && i % 3 === 0;
    const parts = two ? [Math.round(v.tons * 0.6 / 100) * 100, v.tons - Math.round(v.tons * 0.6 / 100) * 100] : [v.tons];
    parts.forEach((t, k) => {
      const kd = kinds[(i + k) % kinds.length];
      M.cargoLines.push({ voyage: v.id, no: 'CL-' + String(M.cargoLines.length + 1).padStart(4, '0'), contract: (v.biz === '成品销售船' ? 'SC-26' : 'HT-26') + '-' + String(100 + i * 3 + k).padStart(4, '0'),
        ea: v.source === '历史副本' ? 'EA' + (4500 + i) : '', big: kd[0], kind: kd[1], name: kd[1], alias: '', unit: v.biz === '大宗采购船' ? kd[2] || 'DXI' : '', dept2: v.biz === '大宗采购船' ? '原料事业部' : '',
        party: v.biz === '成品销售船' ? ['华隆钢贸', '北辰物资', '越海工贸'][i % 3] : suppliers[(i + k) % suppliers.length], tons: t, loadTons: v.actLoadDep ? Math.round(t * 1.004) : null, dry: null, over: v.biz === '大宗采购船' ? '±10%' : '', exec: v.owner });
    });
  });

  // ---------- T06 大宗卸船结算 / T07 成品销售扩展 ----------
  M.bulkSettle = {}; M.salesExt = {};
  list.forEach((v, i) => {
    if (v.biz === '大宗采购船' && v.actDischArr) M.bulkSettle[v.id] = { terms: '接收 NOR 后 4 天内卸完', rate: 12000, allowDays: 4, turn: 12, demRate: 35000000, demCur: 'IDR', demUsd: v.dischDep ? [-3860, 2140, 0][i % 3] : null,
      gauge: Math.round(v.tons * 0.998), fee: 8010.11 + i * 37, portFee: 6420 + i * 12, loadFee: 15230 + i * 60, truck: Math.round(v.tons * 0.35), belt: Math.round(v.tons * 0.6), weigh: Math.round(v.tons * 0.999), other: 0,
      beltOff3: i % 4 === 0 ? 6 : 0, beltOff4: 0, sendDay: isoOf(dnOf(v.actDischArr) + 1), backDay: v.dischDep ? isoOf(dnOf(v.dischDep) + 2) : null, rain: false, issue: i % 5 === 0 ? '管带机 3# 临时检修 6 小时' : '' };
    if (v.biz === '成品销售船') M.salesExt[v.id] = { way: i % 2 ? 'CFR' : 'FOB', contract: 'SH-26-' + String(300 + i).padStart(4, '0') };
  });

  // ---------- T03 船舶主档 ----------
  const names = [...new Set(list.map((v) => v.vessel).filter(Boolean))];
  ['MV GRAND MERIDIAN', 'MV AURA 7'].forEach((n) => { if (!names.includes(n)) names.push(n); });
  ['TB. BINTANG 1 / BG. BINTANG 2', 'KM. BENUA 777', 'MV DELTA HARMONY', 'MV SERI BAHARI'].forEach((n) => { if (!names.includes(n)) names.push(n); });
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 900000; return h + 100000; };
  M.vessels = names.map((n, i) => {
    const noMmsi = n === 'MV AURA 7' || n === 'MV SINAR HARAPAN';
    return { id: 'VS-' + String(i + 1).padStart(4, '0'), mmsi: noMmsi ? '' : '525' + hash(n), imo: i % 4 === 3 ? '' : '9' + hash(n + 'i'), name: n, alias: i % 5 === 0 ? [n.replace('MV ', 'M.V. ')] : [],
      type: n.startsWith('TB.') ? '拖驳组合' : (n.startsWith('KM.') ? '杂货船' : (i % 6 === 5 ? '杂货船' : '散货船')), dwt: 8000 + (hash(n) % 60) * 1000, loa: 110 + (hash(n) % 12) * 10, tier: '' };
  });
  if (!M.vessels.find((v) => v.name === 'MV SINAR HARAPAN')) M.vessels.push({ id: 'VS-' + String(M.vessels.length + 1).padStart(4, '0'), mmsi: '', imo: '', name: 'MV SINAR HARAPAN', alias: [], type: '散货船', dwt: 52000, loa: 190, tier: '' });
  list.forEach((v) => { const x = v.vessel && M.vessels.find((q) => q.name === v.vessel); v.mmsi = x ? x.mmsi : ''; });

  // ---------- T08 航程规则：补充 ----------
  const rr = (id, load, disch, biz, tier, exp, expMax, owner, samples, p50, p80) => ({ id, load, disch, biz, tier, exp, expMax, owner, samples, p50, p80, recomputed: M.today, status: '启用' });
  [rr('R-005', 'JAKARTA', 'BAHODOPI', ['成品销售船'], null, 5, 7, '韩墨', 0, null, null),
   rr('R-006', 'BAHODOPI', 'QINGDAO', ['成品销售船'], null, 11, 13, '韩墨', 1, 11.2, 12.0),
   rr('R-007', 'BAHODOPI', 'TIANJIN', ['成品销售船'], null, 12, 14, '韩墨', 2, 12.4, 13.5),
   rr('R-008', 'SURABAYA', 'BAHODOPI', ['物资备件船'], null, 3, 4, '陈砚秋', 6, 3.4, 4.2),
   rr('R-009', 'SINGAPORE', 'BAHODOPI', ['物资备件船'], null, 6, 8, '陈砚秋', 0, null, null),
   rr('R-010', 'QINHUANGDAO', 'BAHODOPI', ['大宗采购船'], '5万吨档', 11, 13, '周晓棠', 38, 10.6, 12.4),
   rr('R-011', 'TANGSHAN', 'BAHODOPI', ['大宗采购船'], '5万吨档', 11, 14, '周晓棠', 21, 11.2, 13.5),
   rr('R-012', 'XINCUN', 'BAHODOPI', ['大宗采购船'], null, 9, 12, '陈砚秋', 2, 9.5, 11.0)].forEach((r) => {
    r.basis = r.samples >= 5 ? '统计值' : '经验值'; r.effP50 = r.samples >= 5 ? r.p50 : r.exp; r.effP80 = r.samples >= 5 ? r.p80 : r.expMax; M.routeRules.push(r); });
  M.routeRules.forEach((r) => { r.status = r.status || '启用'; });
  // 原有规则 R-003 的「适用业务类型」保持仅大宗（物资备件船借用）

  // ---------- D01 ETA 修订 / D02 变更日志 ----------
  M.etaRevisions = [
    { voyage: 'VY-2026-0305', node: '当前 ETA（卸港）', old: at(4, '14:00'), nw: at(4, '08:00'), basis: '船讯网', by: '林海川', at: at(-5, '10:05') },
    { voyage: 'VY-2026-0305', node: '当前 ETA（卸港）', old: at(5, '08:00'), nw: at(4, '14:00'), basis: '船代', by: '林海川', at: at(-8, '16:20') },
    { voyage: 'VY-2026-0306', node: '当前 ETA（卸港）', old: at(3, '06:00'), nw: at(2, '14:00'), basis: '电话', by: '林海川', at: at(-1, '16:40') },
    { voyage: 'VY-2026-0412', node: '当前 ETA（卸港）', old: at(12, '10:00'), nw: at(13, '10:00'), basis: '船讯网', by: '林海川', at: at(-5, '09:10') },
  ];
  M.changeLog = [
    { voyage: 'VY-2026-0305', field: '实际离装港', old: '', nw: at(-4, '13:30'), by: '林海川', at: at(-4, '13:42') },
    { voyage: 'VY-2026-0305', field: '船舶状态', old: '装港装货', nw: '航行中', by: '系统', at: at(-4, '13:42') },
    { voyage: 'VY-2026-0305', field: '计划泊位', old: '', nw: 'F1', by: '林海川', at: at(-6, '11:20') },
    { voyage: 'VY-2026-0307', field: '实际抵卸港', old: '', nw: at(0, '05:40'), by: '陈砚秋', at: at(0, '06:05') },
    { voyage: 'VY-2026-0306', field: '实际离装港', old: '', nw: at(-3, '18:00'), by: '林海川', at: at(-3, '18:10') },
  ];

  // ---------- D08 数据质量问题 ----------
  const iss = [];
  const issue = (obj, type, owner, status, field, note) => iss.push({ id: 'DQ-' + String(iss.length + 1).padStart(3, '0'), obj, type, owner, status, field, note });
  issue('VY-2026-0307', '缺离装港时间', '林海川', '待处理', 'actLoadDep', '已有实际抵卸港，实际离装港为空，无法记入航程样本');
  issue('VY-2026-0305', 'ETA 超期未更新', '林海川', '待处理', 'eta', 'ETA 已 5 天未更新（阈值暂定 3 天）');
  issue('VY-2026-0412', 'ETA 超期未更新', '林海川', '待处理', 'eta', 'ETA 已 5 天未更新（阈值暂定 3 天）');
  issue('MV AURA 7', '缺 MMSI', '陈砚秋', '待处理', 'mmsi', 'MMSI 为必填，航次 VY-2026-0435 无法接入船讯网');
  issue('MV SINAR HARAPAN', '缺 MMSI', '韩墨', '待处理', 'mmsi', '旧表缺 MMSI，按标准船名匹配未成功');
  issue('VY-2026-0310', '港口未匹配', '陈砚秋', '待处理', 'load', '装港原文「SBY 泗水港」，请指定标准港口并追加别名');
  issue('VY-2026-0308', '港口未匹配', '韩墨', '处理中', 'disch', '卸港原文「青岛港(山东)」，已指定待管理员追加别名');
  issue('VY-2026-0314', '节点时序倒置', '陈砚秋', '待处理', 'dischBerth', '卸港靠泊早于实际抵卸港，保存被拦截');
  issue('VY-2026-0302', '疑似占位时间', '周晓棠', '处理中', 'actDischArr', '实际到达、靠港、离港时间完全一致，疑似批量复制的占位时间，不进统计样本');
  issue('VY-2026-0301', '缺离装港时间', '周晓棠', '已关闭', 'actLoadDep', '已补录');
  issue('VY-2026-0309', '缺 MMSI', '韩墨', '已关闭', 'mmsi', '已补录');
  issue('VY-2026-0311', '缺离装港时间', '周晓棠', '待处理', 'actLoadDep', '已抵装港但计划离装港已过，请确认是否已离港');
  issue('VY-2026-0313', '港口未匹配', '周晓棠', '待处理', 'disch2', '第二卸港原文「SURABAYA 泗水」，已匹配为泗水，待确认');
  issue('VY-2026-0306', 'ETA 超期未更新', '林海川', '已关闭', 'eta', '已于昨日更新');
  M.issues = iss;

  // ---------- D03 靠船计划批次（历史） ----------
  const bt = (no, date, src, file, rows, check, st) => ({ batchNo: no, planDate: date, source: src, fileName: file, rows, validation: check, status: st });
  M.batches = [
    Object.assign({}, M.batch, { validation: M.batch.validation }),
    bt('BP-20261102-01', '2026-11-02', '飞书云空间', '靠船计划_20261102.xlsx', 54, '通过 · 3 行标「非德信池」· 0 行未匹配泊位', '成功'),
    bt('BP-20261101-01', '2026-11-01', '飞书云空间', '靠船计划_20261101.xlsx', 52, '通过 · 3 行标「非德信池」· 0 行未匹配泊位', '成功'),
    bt('BP-20261031-02', '2026-10-31', '手动上传', '靠船计划_1031_补.xlsx', 51, '通过 · 2 行标「非德信池」· 0 行未匹配泊位', '成功'),
    bt('BP-20261031-01', '2026-10-31', '飞书云空间', '靠船计划_20261031.xlsx', 49, '部分失败 · 2 行泊位无法解析', '部分失败'),
    bt('BP-20261030-01', '2026-10-30', '飞书云空间', '靠船计划_20261030.xlsx', 0, '失败 · 文件格式不是 IMIP 靠船计划', '失败'),
    bt('BP-20261029-01', '2026-10-29', '飞书云空间', '靠船计划_20261029.xlsx', 50, '通过 · 3 行标「非德信池」· 0 行未匹配泊位', '成功'),
    bt('BP-20260803-01', '2026-08-03', '手动上传', '靠船计划表_迁移首批.xlsx', 453, '通过 · 迁移首个批次（来自企微靠船计划表）', '成功'),
  ];
  // ---------- D09 同步日志 ----------
  const sl = (type, off, hm, ms, n, ok, err) => ({ type, start: at(off, hm), end: at(off, hm.replace(/:(\d\d)$/, (m, a) => ':' + String(Math.min(59, +a + ms)).padStart(2, '0'))), n, ok, err: err || '' });
  M.syncLogs = [
    sl('拉取云空间靠船计划', 0, '07:30', 1, 55, '成功'), sl('生成兼容表（T09a 商务海运）', 0, '15:50', 2, 336, '成功'), sl('生成兼容表（T09b 大宗到船）', 0, '15:52', 3, 643, '成功'),
    sl('写入飞书 · 航次主表', 0, '09:12', 0, 1, '成功'), sl('写入飞书 · 航次货物明细', 0, '09:12', 0, 2, '成功'), sl('重算航程规则（每日）', 0, '03:00', 1, 9, '成功'),
    sl('拉取云空间靠船计划', -1, '07:30', 1, 54, '成功'), sl('写入飞书 · 航次主表', -1, '16:41', 0, 1, '失败', '限流：同一多维表格并发写入，已排队重试 2 次后成功'),
    sl('拉取云空间靠船计划', -4, '07:30', 0, 0, '失败', '云空间文件夹里没有新文件，或文件格式不是 IMIP 靠船计划'), sl('生成兼容表（T09a 商务海运）', -1, '15:50', 2, 336, '成功'),
  ];
  M.syncLogs[7].ok = '成功'; M.syncLogs[7].err = '第 1 次因同一多维表格并发写入被限流，排队重试后成功';
  // ---------- 迁移 dry-run 摘要（数字来自实施计划书第 7 节的预估，以脚本输出为准） ----------
  M.migration = { runAt: at(-2, '17:05'), items: [
    ['商务海运船舶动态表', 336, '航次约 330 个（按船次号归并）'], ['大宗到船计划表（现表）', 636, '约 572 个航次'], ['大宗到船计划表（历史副本）', 3059, '约 2802 个航次，标「历史只读」'], ['现表与历史副本重叠', 120, '按合同号 + 标准船名 + 到港日判重，保留现表'],
    ['靠船计划表', 453, '作为第一个批次入应用库，不进 T10'], ['港口信息表', 211, '→ 港口主档'] ],
    todo: [['港口写法未匹配', 295, '共 295 种原始写法，去括号和重复后仍未匹配的由物流管理员指定并追加别名'], ['缺 MMSI（大宗现表）', 287, '先按标准船名匹配，匹配不上进清单'], ['商务海运表里的大宗船', 8, '12 条只有 4 条能对上大宗航次，其余 8 条待确认'],
      ['疑似占位时间（合同 GYYL25080）', 54, '62 行里 54 行到达、靠港、离港时间完全相同，迁移但不进统计样本'], ['泊位写法', 81, '「排靠泊位」有 81 种写法，匹配泊位主档，表外泊位只留在备注'], ['人员姓名待映射', 42, '大宗约 33 人、商务海运约 9 人，需一份姓名 → 飞书账号映射表']] };
  // ---------- 连通性自检 ----------
  M.health = [['飞书应用凭证（租户令牌）', '正常', '剩余有效期 1 小时 48 分'], ['航运主数据多维表格', '正常', '11 张表可读写，权限已开通'], ['云空间靠船计划文件夹', '正常', '最近文件 靠船计划_20261103.xlsx'], ['应用数据库', '正常', '镜像表同步延迟 < 1 分钟'], ['综合物流平台兼容表', '提醒', 'T09b 最近一次刷新 15:52，距今 17 小时']];
})();

/* 卸船结算示例数据补全：T06 里的水尺、其他部门运量、倒运车数等字段 */
(function () {
  const M = window.MOCK; let i = 0;
  Object.keys(M.bulkSettle).forEach((id) => {
    const x = M.bulkSettle[id], g = x.gauge || 50000; i++;
    Object.assign(x, { g1: Math.round(g * 0.3333), g2: Math.round(g * 0.3333), g3: g - 2 * Math.round(g * 0.3333), other: 0, carTurn: 150 + i * 6, x1Cars: 40 + i * 2, crossTruck: 0, crossBelt: 0, noHandover: false, fx: 15820 + i * 3, portUnit: 0.26 });
  });
})();

/*
 * ===== 库存消耗模拟（示例数据，数值全部虚构）=====
 * 结构对照企微「物料消耗明细」表：导入日期、库存日期、品名、物料类型、日耗、库存、可用天数。
 * 该表的库存序列已经包含「已排定到货」，所以断料日 = 模拟库存首次降到 0 的那一天（= 断料计划）。
 * 真实文件含业务数据，不入库；P11 页面支持在本机浏览器里导入真实文件（只在本地解析）。
 */
(function () {
  const M = window.MOCK, DAY = 86400000;
  const dnOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  const T0 = dnOf(M.today);
  // [物料类型, 品名, 当前库存(吨), 日耗(吨), 已排定到货[[第几天, 吨]]]
  const RAW = [
    ['铁矿', '铁矿总库存', 700000, 21000, [[28, 300000]]], ['铁矿', '烧结粉矿', 380000, 11000, [[25, 150000]]], ['铁矿', '烧结、竖炉精粉', 260000, 8500, []],
    ['铁矿', '中低硅块', 34000, 2100, []], ['铁矿', '高硅块', 12000, 1800, []], ['铁矿', '长协-巴混', 120000, 4800, [[20, 60000]]], ['铁矿', '卡拉拉精粉', 7200, 260, []],
    ['铁矿', '毛塔精粉', 0, 400, []], ['铁矿', '印粉', 4500, 500, []], ['铁矿', '氧化铁皮', 30000, 1500, []], ['铁矿', '超特粉', 210000, 4000, []], ['铁矿', '炼铁-酸性料', 52000, 4200, []],
    ['焦煤', '焦煤总库存', 380000, 8000, [[36, 120000]]], ['焦煤', '一线主焦煤', 60000, 1400, []], ['焦煤', '二线主焦煤', 44000, 1600, []], ['焦煤', '1/3焦煤', 150000, 2400, []], ['焦煤', '肥煤', 70000, 800, []],
    ['焦煤', '气煤', 28000, 1100, []], ['焦煤', '焦化喷吹煤', 30000, 1300, []], ['焦煤', '低硫气煤', 1900, 700, []], ['焦煤', '高硫气煤', 5000, 450, []], ['焦煤', '焦粉', 18000, 450, []],
    ['焦煤', '炼铁喷吹煤', 90000, 2500, []], ['焦煤', '焦炭', 33000, 900, []],
    ['辅料', '废钢', 11000, 450, []], ['辅料', '生铁', 70000, 1000, []], ['辅料', '烧结石灰石', 80000, 3000, [[20, 40000]]], ['辅料', '烧结凌美石粉', 28000, 400, []],
    ['辅料', '炼钢凌美石块', 15000, 260, []], ['辅料', '炼钢石灰石小料', 11000, 1000, []],
  ];
  const HORIZON = 150;
  const items = RAW.map(([type, name, stock0, daily, arr]) => {
    const series = []; let s = stock0;
    for (let k = 0; k <= HORIZON; k++) {
      if (k > 0) { s = Math.max(0, s - daily); const a = arr.find((x) => x[0] === k); if (a) s += a[1]; }
      series.push([T0 + k, Math.round(s), daily]);
    }
    const out = series.find((x) => x[1] <= 0);
    return { type, name, stock: stock0, daily, days: Math.floor(stock0 / daily), series, stockout: out ? out[0] : null, arrivals: arr.map((a) => [T0 + a[0], a[1]]) };
  });
  M.inventory = { updated: M.today + ' 08:30', source: '库存消耗模拟表（示例数据）', sample: true, warnDays: 15, safeDays: 25, bufferDays: 3, items };
})();
