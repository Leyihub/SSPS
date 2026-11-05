/* 库存消耗模拟曲线（SVG）：库存按日耗下降，已排定到货回升；标出危险线、断料日、最晚到港日，以及加入方案后的库存走势。 */
(function () {
  const E = window.ENGINE, T = E.TODAY, md = (n) => E.md(n);
  const fmtW = (n) => (n >= 10000 ? Math.round(n / 1000) / 10 + ' 万' : String(Math.round(n)));
  window.StockChart = {
    // opts: { latest, buffer, marks:[{d,tons,label,color}], until, warnDays }
    html(item, opts) {
      opts = opts || {};
      const W = Math.round(opts.width || 760), H = opts.height || 240, L = 52, R = 16, Tp = 22, B = 32, so = opts.so !== undefined ? opts.so : E.stockout(item), gap = opts.gap || null;
      const marks = (opts.marks || []).filter((m) => m && m.d != null);
      let until = T + 45;
      [so, opts.latest, ...marks.map((m) => m.d + 14)].forEach((x) => { if (x != null && x + 14 > until) until = x + 14; });
      until = Math.min(until, T + 100);
      const base = E.project(item, [], until);
      const lines = marks.slice(0, 2).map((m) => ({ m, pts: E.project(item, [{ d: m.d, tons: m.tons }], until) }));
      const ymax = Math.max(...base.map((p) => p[1]), ...lines.flatMap((l) => l.pts.map((p) => p[1])), item.daily * (opts.warnDays || 15) * 1.4, 1) * 1.08;
      const x = (d) => L + (d - T) / (until - T) * (W - L - R), y = (v) => Tp + (1 - v / ymax) * (H - Tp - B);
      const path = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
      const warn = item.daily * (opts.warnDays || 15);
      let g = '';
      // y 轴刻度
      for (let k = 0; k <= 4; k++) { const v = ymax / 1.08 * k / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#eef0f3"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="#98a4b3">' + fmtW(v) + '</text>'; }
      // x 轴刻度（每 10 天）
      for (let d = T; d <= until; d += 10) g += '<text x="' + x(d) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#98a4b3">' + md(d) + '</text>';
      // 断料期着色
      if (so != null) { const end = marks.length ? Math.min(...marks.map((m) => m.d)) : until; if (end > so) g += '<rect x="' + x(so) + '" y="' + Tp + '" width="' + Math.max(0, x(Math.min(end, until)) - x(so)) + '" height="' + (H - Tp - B) + '" fill="#fff1f0" opacity=".75"/>'; }
      // 危险线
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(warn) + '" y2="' + y(warn) + '" stroke="#fa8c16" stroke-dasharray="5 4"/><text x="' + (W - R - 4) + '" y="' + (y(warn) - 5) + '" text-anchor="end" font-size="11" fill="#d46b08">危险线（' + (opts.warnDays || 15) + ' 天用量）</text>';
      // 基础库存线
      g += '<path d="' + path(base) + ' L' + x(until) + ' ' + y(0) + ' L' + x(T) + ' ' + y(0) + ' Z" fill="#e6f4ff" opacity=".8"/><path d="' + path(base) + '" fill="none" stroke="#1677ff" stroke-width="2.2"/>';
      // 加入方案后的库存线
      lines.forEach((l) => { g += '<path d="' + path(l.pts.filter((p) => p[0] >= l.m.d - 1)) + '" fill="none" stroke="' + l.m.color + '" stroke-width="2.4" stroke-dasharray="6 4"/>'; });
      // 竖线：今天 / 最晚到港 / 断料日 / 方案到港
      const vline = (d, color, label, dy, dash, left) => '<line x1="' + x(d) + '" x2="' + x(d) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="' + color + '" stroke-width="1.6"' + (dash ? ' stroke-dasharray="4 3"' : '') + '/><text x="' + (x(d) + (left ? -4 : 4)) + '" y="' + (Tp + 10 + dy) + '" text-anchor="' + (left ? 'end' : 'start') + '" font-size="11.5" font-weight="600" fill="' + color + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + label + '</text>';
      g += vline(T, '#8c8c8c', '今天', 0, true);
      if (opts.latest != null && so != null) g += vline(opts.latest, '#fa8c16', '最晚到港 ' + md(opts.latest), 16, true, opts.latest >= T + 8);
      if (gap) g += vline(gap.from, '#fa8c16', '短缺口 ' + md(gap.from), 0, false);
      if (so != null) g += vline(so, '#cf1322', '断料日 ' + md(so), 0, false);
      marks.forEach((m, i) => { g += '<line x1="' + x(m.d) + '" x2="' + x(m.d) + '" y1="' + (H - B - 40) + '" y2="' + (H - B) + '" stroke="' + m.color + '" stroke-width="2.4"/><circle cx="' + x(m.d) + '" cy="' + (H - B - 40) + '" r="9" fill="' + m.color + '"/><text x="' + x(m.d) + '" y="' + (H - B - 36) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + m.label + '</text>'; });
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;max-width:100%;height:auto" role="img" aria-label="库存消耗模拟曲线">' + g + '</svg>';
    },
  };
})();
