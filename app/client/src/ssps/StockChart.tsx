// 库存消耗模拟曲线（SVG）：库存按日耗下降，已排定到货回升；标出危险线、断料日、最晚到港日，以及加入方案后的库存走势。
// 曲线数据全部来自后端 /api/inventory/trend（引擎的 project），这里只画图。
import { useEffect, useRef, useState } from 'react';
import { nMd } from './cmr';

export interface TrendData { today: number; until: number; so: number | null; series: Array<[number, number, number]>; base: Array<[number, number]>; lines: Array<{ d: number; tons: number; pts: Array<[number, number]> }> }
export interface StockMark { d: number; tons: number; label: string; color: string }

const fmtW = (n: number) => (n >= 10000 ? Math.round(n / 1000) / 10 + ' 万' : String(Math.round(n)));

export function StockChart({ trend, daily, latest, gap, marks, warnDays = 15 }: { trend: TrendData; daily: number; latest: number | null; gap: { from: number; to: number } | null; marks: StockMark[]; warnDays?: number }) {
  const box = useRef<HTMLDivElement>(null), [W, setW] = useState(900);
  useEffect(() => { const el = box.current; if (!el || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(([e]) => setW(Math.max(520, Math.round(e.contentRect.width)))); ro.observe(el); return () => ro.disconnect(); }, []);
  const H = 240, L = 52, R = 16, Tp = 22, B = 32, T = trend.today, until = trend.until, so = trend.so;
  const inR = (d: number | null | undefined) => d != null && d >= T && d <= until;
  const ymax = Math.max(...trend.base.map((p) => p[1]), ...trend.lines.flatMap((l) => l.pts.map((p) => p[1])), daily * warnDays * 1.4, 1) * 1.08;
  const x = (d: number) => L + ((d - T) / (until - T)) * (W - L - R), y = (v: number) => Tp + (1 - v / ymax) * (H - Tp - B);
  const path = (pts: Array<[number, number]>) => pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
  const warn = daily * warnDays, step = until - T <= 10 ? 1 : until - T <= 20 ? 2 : until - T <= 40 ? 5 : 10;
  const vline = (d: number, color: string, label: string, dy: number, dash: boolean, left = false) => (
    <g key={label}>
      <line x1={x(d)} x2={x(d)} y1={Tp} y2={H - B} stroke={color} strokeWidth="1.6" strokeDasharray={dash ? '4 3' : undefined} />
      <text x={x(d) + (left ? -4 : 4)} y={Tp + 10 + dy} textAnchor={left ? 'end' : 'start'} fontSize="11.5" fontWeight="600" fill={color} stroke="#fff" strokeWidth="3" paintOrder="stroke">{label}</text>
    </g>
  );
  const endRed = marks.length ? Math.min(...marks.map((m) => m.d)) : until;
  return (
    <div ref={box}><svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: '100%', height: 'auto' }} role="img" aria-label="库存消耗模拟曲线">
      {[0, 1, 2, 3, 4].map((k) => { const v = (ymax / 1.08 * k) / 4; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef0f3" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#98a4b3">{fmtW(v)}</text></g>; })}
      {Array.from({ length: Math.floor((until - T) / step) + 1 }, (_, i) => T + i * step).map((d) => <text key={d} x={x(d)} y={H - 12} textAnchor="middle" fontSize="11" fill="#98a4b3">{nMd(d)}</text>)}
      {inR(so) && endRed > so! && <rect x={x(so!)} y={Tp} width={Math.max(0, x(Math.min(endRed, until)) - x(so!))} height={H - Tp - B} fill="#fff1f0" opacity=".75" />}
      <line x1={L} x2={W - R} y1={y(warn)} y2={y(warn)} stroke="#fa8c16" strokeDasharray="5 4" />
      <text x={W - R - 4} y={y(warn) - 5} textAnchor="end" fontSize="11" fill="#d46b08">危险线（{warnDays} 天用量）</text>
      <path d={`${path(trend.base)} L${x(until)} ${y(0)} L${x(T)} ${y(0)} Z`} fill="#e6f4ff" opacity=".8" />
      <path d={path(trend.base)} fill="none" stroke="#1677ff" strokeWidth="2.2" />
      {trend.lines.map((l, i) => <path key={i} d={path(l.pts.filter((p) => p[0] >= l.d - 1))} fill="none" stroke={marks[i]?.color ?? '#1677ff'} strokeWidth="2.4" strokeDasharray="6 4" />)}
      {vline(T, '#8c8c8c', '今天', 0, true)}
      {inR(latest) && so != null && vline(latest!, '#fa8c16', '最晚到港 ' + nMd(latest!), 16, true, latest! >= T + 8)}
      {gap && inR(gap.from) && vline(gap.from, '#fa8c16', '短缺口 ' + nMd(gap.from), 0, false)}
      {inR(so) && vline(so!, '#cf1322', '断料日 ' + nMd(so!), 0, false)}
      {marks.filter((m) => inR(m.d)).map((m) => (
        <g key={m.label}><line x1={x(m.d)} x2={x(m.d)} y1={H - B - 40} y2={H - B} stroke={m.color} strokeWidth="2.4" /><circle cx={x(m.d)} cy={H - B - 40} r="9" fill={m.color} /><text x={x(m.d)} y={H - B - 36} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{m.label}</text></g>
      ))}
    </svg></div>
  );
}
