/*
 * 共用脚本：状态推导（严格按 docs/schema/status-rules.md）、节点时序校验、格式化、浮窗、提示。
 * 只在原型里使用；真实实现在后端 server/domain/status.js、validate.js。
 */
(function () {
  const M = window.MOCK, E = window.ENGINE, C = {};
  const DAY = 86400000;
  C.fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'));
  C.pct = (x) => Math.round(x * 1000) / 10 + '%';
  C.dayNum = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  C.iso = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  C.TODAY = C.dayNum(M.today);
  C.md = (s) => (s ? s.slice(5, 10).replace('-', '/') : '—');                          // 11/08
  C.mdh = (s) => (s ? s.slice(5, 10).replace('-', '/') + (s.length > 10 && s.slice(11, 16) !== '00:00' ? ' ' + s.slice(11, 16) : '') : '—');
  C.mdCn = (s) => { if (!s) return '—'; const p = s.slice(0, 10).split('-'); return Number(p[1]) + '月' + Number(p[2]) + '日'; };
  C.wk = (s) => '周' + '日一二三四五六'[new Date(C.dayNum(s) * DAY).getUTCDay()];
  C.zh = (en) => { const p = M.ports.find((q) => q.en === en); return p ? p.cn.replace(/（.*?）/g, '') : (en || '—'); };
  C.esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  C.qs = new URLSearchParams(location.search);
  C.me = M.user;

  // ---------- 船舶状态（8 个互斥状态 + 取消） ----------
  C.STATUS = ['待宣船', '未到装港', '装港等泊', '装港装货', '航行中', '卸港等泊', '卸港卸货', '已结束'];
  C.statusOf = (v) => {
    const prodSale = v.biz === '成品销售船';
    if ((v.flags || []).includes('取消')) return '已结束（取消）';                                // 1
    if (v.dischDep || (prodSale && v.dischBerth)) return '已结束';                                // 2
    if (v.dischBerth) return '卸港卸货';                                                         // 3
    if (v.actDischArr) return '卸港等泊';                                                        // 4
    if (v.actLoadDep) return '航行中';                                                           // 5
    if (v.loadBerth || (v.biz === '大宗采购船' && v.actLoadArr)) return '装港装货';              // 6（大宗常不记录装港靠泊）
    if (v.actLoadArr) return '装港等泊';                                                         // 7
    if (v.vessel) return '未到装港';                                                             // 8
    return '待宣船';                                                                             // 9
  };
  C.stCls = (s) => (s === '已结束（取消）' ? 'sx' : 's' + C.STATUS.indexOf(s));
  C.stTag = (s) => '<span class="st ' + C.stCls(s) + '">' + s + '</span>';
  // 本港侧：装港为本港 = 装，否则 = 卸
  C.side = (v) => (v.load === 'BAHODOPI' ? '装' : '卸');
  C.localDate = (v) => { const s = C.side(v); return s === '装' ? { plan: v.laycanS, act: v.actLoadArr } : { plan: v.planDischS, act: v.actDischArr }; };
  C.total = (v) => M.cargoLines.filter((c) => c.voyage === v.id).reduce((a, c) => a + c.tons, 0) || v.tons;
  C.cargoOf = (v) => M.cargoLines.filter((c) => c.voyage === v.id);
  // 公式字段
  C.days = (a, b) => (a && b ? Math.round((new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'))) / DAY * 100) / 100 : null);
  C.derive = (v) => ({
    status: C.statusOf(v), side: C.side(v), total: C.total(v), pooled: C.cargoOf(v).length >= 2,
    overdue: v.laycanE && v.actLoadArr ? v.actLoadArr > v.laycanE : false,
    voyageDays: C.days(v.actLoadDep, v.actDischArr),
    waitDays: C.side(v) === '卸' ? C.days(v.actDischArr, v.dischBerth) : C.days(v.actLoadArr, v.loadBerth),
    workDays: C.side(v) === '卸' ? C.days(v.dischBerth, v.dischDep) : C.days(v.loadBerth, v.actLoadDep),
  });
  // 实际时间节点链：后一节点早于前一节点即拒绝保存
  C.CHAIN = [['actLoadArr', '实际抵装港'], ['loadBerth', '装港靠泊'], ['actLoadDep', '实际离装港'], ['actDischArr', '实际抵卸港'], ['dischBerth', '卸港靠泊'], ['dischDep', '卸港离港']];
  C.validate = (v) => {
    let prev = null;
    for (const [k, label] of C.CHAIN) {
      if (!v[k]) continue;
      if (prev && v[k] < v[prev[0]]) return '「' + label + '」（' + v[k] + '）不能早于「' + prev[1] + '」（' + v[prev[0]] + '）';
      prev = [k, label];
    }
    return null;
  };
  // 工作台待办 / 数据质量用：待补节点（实际抵卸港有值而实际离装港为空）
  C.missingDep = (v) => !!(v.actDischArr && !v.actLoadDep && !(v.flags || []).includes('取消'));
  C.ETA_STALE_DAYS = 3;                       // 暂定阈值（待确认）
  C.etaStale = (v) => !!(v.eta && !v.actDischArr && v.etaUpdated && C.TODAY - C.dayNum(v.etaUpdated) > C.ETA_STALE_DAYS);
  C.role = () => M.people[C.me.name].role;
  C.canEdit = (v) => !v.readonly && (['物流管理员', '系统管理员'].includes(C.role()) || v.owner === C.me.name || (C.role() === '部门主管' && v.dept === C.me.dept));

  // ---------- 浮窗与提示 ----------
  const TIPS = [];
  C.ic = (text) => '<span class="i" data-k="' + (TIPS.push(text) - 1) + '">i</span>';
  C.tipAttr = (text) => ' data-tip="' + C.esc(text) + '"';
  let tb = document.getElementById('tipbox');
  if (!tb) { tb = document.createElement('div'); tb.id = 'tipbox'; document.body.appendChild(tb); }
  const show = (el) => {
    const t = el.dataset.k !== undefined ? TIPS[+el.dataset.k] : el.dataset.tip; if (!t) return;
    tb.innerHTML = String(t).replace(/\\n|\n/g, '<br>'); tb.style.display = 'block';
    const r = el.getBoundingClientRect(), w = tb.offsetWidth, h = tb.offsetHeight;
    let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8), y = r.bottom + 8;
    if (y + h > innerHeight - 8) y = r.top - h - 8;
    tb.style.left = x + 'px'; tb.style.top = y + 'px';
  };
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('.i,[data-tip]'); if (el) show(el); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('.i,[data-tip]')) tb.style.display = 'none'; });
  document.addEventListener('click', (e) => { const el = e.target.closest('.i'); if (el) show(el); else tb.style.display = 'none'; });
  C.toast = (t) => {
    let el = document.getElementById('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(C.toast.t); C.toast.t = setTimeout(() => el.classList.remove('on'), 2600);
  };
  // 弹窗：C.modal({title, body, ok, onOk})
  C.modal = (o) => {
    let m = document.getElementById('cmodal'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'cmodal'; m.className = 'mask on';
    m.innerHTML = '<div class="modal" style="width:' + (o.width || 560) + 'px"><div class="modal-h"><span>' + o.title + '</span><button data-x>×</button></div><div class="modal-b">' + o.body + '</div><div class="modal-f">' +
      (o.hideCancel ? '' : '<button class="btn" data-x>取消</button>') + (o.ok === false ? '' : '<button class="btn primary" id="cmOk">' + (o.ok || '确定') + '</button>') + '</div></div>';
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelectorAll('[data-x]').forEach((b) => b.onclick = close);
    const ok = m.querySelector('#cmOk'); if (ok) ok.onclick = () => { if (!o.onOk || o.onOk(m) !== false) close(); };
    if (o.onOpen) o.onOpen(m);
    return m;
  };
  C.download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); };
  // ---------- 会话内持久化（原型：只存在于本浏览器标签页，刷新不丢，关闭即清） ----------
  const KEY = 'ssps-proto-v1', KEYS = ['voyageList', 'etaRevisions', 'changeLog', 'issues', 'cargoLines', 'batches', 'syncLogs', 'routeRules', 'vessels', 'ports', 'bulkSettle', 'salesExt'];
  try { const raw = sessionStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); KEYS.forEach((k) => { if (d[k]) M[k] = d[k]; }); } } catch (e) { /* 无存储时忽略 */ }
  C.persist = () => { try { const o = {}; KEYS.forEach((k) => { o[k] = M[k]; }); sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
  C.resetData = () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
  window.C = C;
})();
