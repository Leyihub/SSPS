/* 共用外壳：左侧导航 + 顶栏。BUILT 是唯一的"已做/待做"来源，index.html 与导航都读它。 */
(function () {
  const PAGES = [
    { id: 'P01', name: '工作台', file: 'P01-workbench.html', group: '工作', user: '业务员',
      desc: '我的待办：待补节点、ETA 超过 3 天未更新、本周到港、数据质量问题；一键进入航次或预测', api: 'A01 A07 A25' },
    { id: 'P11', name: '智能提问', file: 'P11-ask.html', group: '预测', user: '业务员',
      desc: '用文字或语音说出需求，系统判断船型、识别物料和货量，展示库存可用天数与断料日，再生成不会断料的预测', api: 'A29 A30' },
    { id: 'P02', name: '智能发船预测', file: 'P02-prediction.html', group: '预测', user: '业务员',
      desc: '输入业务类型、货量、装卸港、受载期/期望窗口；Plan A / Plan B 卡片；下方 30 天容量日历；采纳与宣船文案', api: 'A20 A21 A23 A24' },
    { id: 'P03', name: '预测详情', file: 'P03-prediction-detail.html', group: '预测', user: '业务员', sub: true,
      desc: 'S1 参数匹配溯源（每个数字来自哪张表、哪个批次、哪条航程规则）；可用泊位视图；侧栏宣船文案 + 一键复制', api: 'A22 A24' },
    { id: 'P06', name: '港口容量日历', file: 'P06-capacity-calendar.html', group: '预测', user: '全员',
      desc: '按吨级档切换（默认 5 万吨）；≤15 天显示 CMR，＞15 天显示重叠船数；点击某日看当日在港船', api: 'A20' },
    { id: 'P04', name: '船舶动态', file: 'P04-vessel-board.html', group: '航次', user: '三个部门全员',
      desc: '协作台（2026-11-17 评审通过，取代航次列表）：按岗位切换视图、行内更新按行保存、岗位接力待办、预警栏与汇总带、仓储作业日志、列设置与岗位授权', api: 'A07–A16 A23 A25 A31–A35' },
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
  const BUILT = { P01: '待评审', P11: '待评审', P02: '待评审', P03: '待评审', P04: '待评审', P05: '待评审', P06: '待评审', P07: '待评审', P08: '待评审', P09: '待评审', P10: '待评审' };   // 每做完一页在这里登记；未登记 = 待做

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
      '<div class="crumb"><button class="burger" id="burger" aria-label="菜单">☰</button><a href="index.html">原型导航</a><i>/</i><b>' + (opts.title || '') + '</b></div>' +
      '<div class="top-right"><span class="proto-flag">原型 · 示例数据，非真实业务</span>' +
      '<span class="top-date">2026-11-04 周三</span>' +
      '<span data-skin-slot></span>' +
      '<span class="user"><span class="avatar">' + (opts.user ? opts.user[0][0] : '林') + '</span><span>' + (opts.user ? opts.user[0] : '林海川') + '<small>' + (opts.user ? opts.user[2] + ' · ' + opts.user[1] : '业务员 · 大宗采购部') + '</small></span></span></div>';
    bootSkin();
  }
  document.addEventListener('click', (e) => {
    const nav = document.getElementById('nav'); if (!nav) return;
    let m = document.querySelector('.navmask'); if (!m) { m = document.createElement('div'); m.className = 'navmask'; document.body.appendChild(m); }
    if (e.target.closest('#burger')) { nav.classList.toggle('open'); m.classList.toggle('on', nav.classList.contains('open')); }
    else if (e.target.classList.contains('navmask')) { nav.classList.remove('open'); m.classList.remove('on'); }
  });
  /* ---------- 皮肤切换：paper 暖纸 / midnight 夜墨 / legacy 经典深蓝 ----------
     属性落在 <html data-skin>，首屏由各页 <head> 的内联脚本提前设定，避免闪烁。
     这里只负责「右上角下拉」的渲染与交互，不碰任何业务状态。 */
  const SKIN_KEY = 'ssps-skin';
  const SKINS = [
    { id: 'paper', name: '暖纸 · 墨黑', short: '暖纸', desc: '默认设计语言' },
    { id: 'midnight', name: '夜墨 · 纸白', short: '夜墨', desc: '暗色，同一结构' },
    { id: 'legacy', name: '经典 · 深蓝', short: '经典', desc: '2025 版 ERP 风格' },
  ];
  const SKIN_IDS = SKINS.map((s) => s.id);
  const skinNow = () => {
    const cur = document.documentElement.getAttribute('data-skin');
    return SKIN_IDS.indexOf(cur) >= 0 ? cur : 'paper';
  };

  function syncSkin(box) {
    const cur = skinNow();
    const pop = box.querySelector('.skin-sw-pop');
    const btn = box.querySelector('.skin-sw-btn');
    const lab = box.querySelector('.skin-sw-label');
    if (lab) lab.textContent = (SKINS.find((s) => s.id === cur) || SKINS[0]).short;
    btn.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true');
    box.querySelectorAll('.skin-sw-opt').forEach((o) => {
      o.setAttribute('aria-selected', o.dataset.skin === cur ? 'true' : 'false');
    });
  }
  function applySkin(id, remember) {
    const next = SKIN_IDS.indexOf(id) >= 0 ? id : 'paper';
    document.documentElement.setAttribute('data-skin', next);
    if (remember) { try { localStorage.setItem(SKIN_KEY, next); } catch (e) { /* 无存储时忽略 */ } }
    document.querySelectorAll('.skin-sw').forEach(syncSkin);
  }
  function closeSkin(except) {
    document.querySelectorAll('.skin-sw').forEach((box) => {
      if (box === except) return;
      box.querySelector('.skin-sw-pop').hidden = true;
      box.querySelector('.skin-sw-btn').setAttribute('aria-expanded', 'false');
    });
  }
  function mountSkin(el) {
    el.classList.add('skin-sw');
    el.innerHTML =
      '<button class="skin-sw-btn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="切换界面皮肤">' +
        '<span class="skin-sw-ico"></span><span class="skin-sw-label"></span><span class="skin-sw-car"></span>' +
      '</button>' +
      '<div class="skin-sw-pop" role="listbox" aria-label="界面皮肤" hidden>' +
        '<div class="skin-sw-t">界面皮肤</div>' +
        SKINS.map((s) =>
          '<button class="skin-sw-opt" type="button" role="option" data-skin="' + s.id + '" aria-selected="false">' +
            '<span class="skin-sw-pv pv-' + s.id + '"><i></i><i></i></span>' +
            '<span class="skin-sw-tx"><b>' + s.name + '</b><small>' + s.desc + '</small></span>' +
            '<span class="skin-sw-ck"></span>' +
          '</button>').join('') +
      '</div>';
    syncSkin(el);
  }
  function bootSkin() {
    document.querySelectorAll('[data-skin-slot]').forEach((el) => {
      if (!el.classList.contains('skin-sw')) mountSkin(el);
    });
  }
  document.addEventListener('click', (e) => {
    const box = e.target.closest('.skin-sw');
    const opt = e.target.closest('.skin-sw-opt');
    const btn = e.target.closest('.skin-sw-btn');
    if (opt && box) {
      applySkin(opt.dataset.skin, true);
      box.querySelector('.skin-sw-pop').hidden = true;
      box.querySelector('.skin-sw-btn').setAttribute('aria-expanded', 'false');
      return;
    }
    if (btn && box) {
      const pop = box.querySelector('.skin-sw-pop');
      closeSkin(box);
      pop.hidden = !pop.hidden;
      btn.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true');
      return;
    }
    closeSkin(null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeSkin(null);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSkin);
  else bootSkin();
  // 外部（含浏览器插件、调试工具）改动 data-skin 时，下拉标签跟着同步
  if (window.MutationObserver) {
    new MutationObserver(() => document.querySelectorAll('.skin-sw').forEach(syncSkin))
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
  }

  window.SHELL = { PAGES, BUILT, mount, skin: { apply: applySkin, current: skinNow, boot: bootSkin } };
})();
