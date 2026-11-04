/* 共用外壳：左侧导航 + 顶栏。BUILT 是唯一的"已做/待做"来源，index.html 与导航都读它。 */
(function () {
  const PAGES = [
    { id: 'P01', name: '工作台', file: 'P01-workbench.html', group: '工作', user: '业务员',
      desc: '我的待办：待补节点、ETA 超过 3 天未更新、本周到港、数据质量问题；一键进入航次或预测', api: 'A01 A07 A25' },
    { id: 'P02', name: '智能发船预测', file: 'P02-prediction.html', group: '预测', user: '业务员',
      desc: '输入业务类型、货量、装卸港、受载期/期望窗口；Plan A / Plan B 卡片；下方 30 天容量日历；采纳与宣船文案', api: 'A20 A21 A23 A24' },
    { id: 'P03', name: '预测详情', file: 'P03-prediction-detail.html', group: '预测', user: '业务员', sub: true,
      desc: 'S1 参数匹配溯源（每个数字来自哪张表、哪个批次、哪条航程规则）；可用泊位视图；侧栏宣船文案 + 一键复制', api: 'A22 A24' },
    { id: 'P06', name: '港口容量日历', file: 'P06-capacity-calendar.html', group: '预测', user: '全员',
      desc: '按吨级档切换（默认 5 万吨）；≤15 天显示 CMR，＞15 天显示重叠船数；点击某日看当日在港船', api: 'A20' },
    { id: 'P04', name: '航次列表', file: 'P04-voyage-list.html', group: '航次', user: '全员',
      desc: '页签：大宗 / 成品 / 物资 / 全部；状态、本港日期、业务员筛选；状态色标；导出 Excel', api: 'A07' },
    { id: 'P05', name: '航次详情/编辑', file: 'P05-voyage-detail.html', group: '航次', user: '业务员',
      desc: '顶部时间轴（计划 vs 实际）；基本信息、货物明细、卸船结算/销售扩展、ETA 修订历史、变更日志', api: 'A08–A16' },
    { id: 'P07', name: '靠船计划', file: 'P07-berth-plan.html', group: '主数据', user: '物流管理员',
      desc: '批次列表（来源、行数、校验结果）、最新一期明细、手动上传、未匹配泊位/船舶告警', api: 'A17 A19' },
    { id: 'P08', name: '主数据', file: 'P08-master-data.html', group: '主数据', user: '物流管理员、部门主管',
      desc: '港口（含别名）、泊位、船舶、航程规则（经验值编辑、样本数、当前口径）', api: 'A02–A06' },
    { id: 'P09', name: '数据质量', file: 'P09-data-quality.html', group: '主数据', user: '全员',
      desc: '问题清单按责任人、问题类型筛选，点击直达对应航次字段', api: 'A25' },
    { id: 'P10', name: '系统管理', file: 'P10-admin.html', group: '系统', user: '系统管理员',
      desc: '同步日志、兼容表手动刷新、迁移 dry-run 报告、连通性自检', api: 'A26–A28' },
  ];
  const BUILT = { P02: '待评审' };   // 每做完一页在这里登记；未登记 = 待做

  function navHtml(active) {
    let h = '<div class="brand"><span class="logo">S</span><div><b>SSPS</b><small>智慧发船预测系统</small></div></div>';
    h += '<a class="nav-item' + (active === 'index' ? ' active' : '') + '" href="index.html"><span class="code">◎</span>原型导航</a>';
    let last = '';
    PAGES.forEach((p) => {
      if (p.group !== last) { h += '<div class="nav-group">' + p.group + '</div>'; last = p.group; }
      const built = !!BUILT[p.id];
      const cls = 'nav-item' + (p.sub ? ' sub' : '') + (active === p.id ? ' active' : '') + (built ? '' : ' disabled');
      h += built
        ? '<a class="' + cls + '" href="' + p.file + '"><span class="code">' + p.id + '</span>' + p.name + '</a>'
        : '<span class="' + cls + '" title="原型待做"><span class="code">' + p.id + '</span>' + p.name + '<em>待做</em></span>';
    });
    h += '<div class="nav-foot">原型阶段 · 无功能已上线<br>示例数据均为虚构</div>';
    return h;
  }
  function mount(opts) {
    const nav = document.getElementById('nav'), top = document.getElementById('topbar');
    if (nav) nav.innerHTML = '<div class="nav-in">' + navHtml(opts.active) + '</div>';
    if (top) top.innerHTML =
      '<div class="crumb"><a href="index.html">原型导航</a><i>/</i><b>' + (opts.title || '') + '</b></div>' +
      '<div class="top-right"><span class="proto-flag">原型 · 示例数据，非真实业务</span>' +
      '<span class="top-date">2026-11-04 周三</span>' +
      '<span class="user"><span class="avatar">林</span><span>林海川<small>业务员 · 大宗采购部</small></span></span></div>';
  }
  window.SHELL = { PAGES, BUILT, mount };
})();
