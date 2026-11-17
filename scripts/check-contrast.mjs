/*
 * 配色可访问性检查：从 app.css + skin.css 解析每套皮肤的真实 token，
 * 逐组计算 WCAG 2.1 对比度。midnight 为强制门槛（正文 4.5、大字 3.0），
 * paper / legacy 作为参考值一并输出（历史皮肤不阻断构建）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const baseCss = fs.readFileSync(path.join(ROOT, 'prototype/assets/app.css'), 'utf8');
const skinCss = fs.readFileSync(path.join(ROOT, 'prototype/assets/skin.css'), 'utf8');

// 同一皮肤可能有多段同名选择器（如 shadcn token 补充段）。浏览器按出现顺序取最后一个值，
// 所以这里把所有「选择器恰好等于 header」的段落依次拼起来，而不是只取第一段。
const pickBlock = (css, headerRe) => {
  const re = new RegExp(headerRe.source + String.raw`\s*\{`, headerRe.flags.includes('m') ? 'gm' : 'g');
  let out = '';
  for (const m of css.matchAll(re)) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    for (let j = start; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) { out += css.slice(start + 1, j) + ' '; break; }
    }
  }
  return out;
};

const parseTokens = (block) => {
  const out = {};
  const live = block.replace(/\/\*[\s\S]*?\*\//g, ' ');   // 注释里的示例写法不是生效的声明
  for (const m of live.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
};

const resolve = (tokens, value, seen = 0) => {
  if (seen > 8) return value;
  return value.replace(/var\((--[a-z0-9-]+)\)/gi, (_, name) => {
    const v = tokens[name];
    return v === undefined ? '' : resolve(tokens, v, seen + 1);
  });
};

const base = parseTokens(pickBlock(baseCss, /^:root/m));
const legacy = { ...base, ...parseTokens(pickBlock(skinCss, /:root\[data-skin="legacy"\]/)) };
const midnight = { ...base, ...parseTokens(pickBlock(skinCss, /:root\[data-skin="midnight"\]/)) };

const hexToRgb = (hex) => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  h = h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/* [名称, 前景 token, 背景 token, 是否大字] */
const PAIRS = [
  ['正文 / 页面底', '--text', '--bg', false],
  ['正文 / 卡片', '--text', '--card', false],
  ['标题墨色 / 页面底', '--ink', '--bg', true],
  ['标题墨色 / 卡片', '--ink', '--card', true],
  ['标题墨色 / 浮层', '--ink', '--surface', false],
  ['次要文字 / 页面底', '--muted', '--bg', false],
  ['次要文字 / 卡片', '--muted', '--card', false],
  ['次要文字 / 侧栏', '--muted', '--sidebar', false],
  ['次要文字 / 浮层', '--muted', '--surface', false],
  ['微标签 / 页面底', '--faint', '--bg', false],
  ['微标签 / 卡片', '--faint', '--card', false],
  ['微标签 / 侧栏', '--faint', '--sidebar', false],
  ['主按钮文字 / 主按钮底', '--on-ink', '--primary', false],
  ['主按钮底 / 页面底（边界）', '--primary', '--bg', false],
  ['成功 / 页面底', '--ok', '--bg', false],
  ['成功 / 成功浅底', '--ok', '--ok-bg', false],
  ['警示 / 页面底', '--warn', '--bg', false],
  ['警示 / 警示浅底', '--warn', '--warn-bg', false],
  ['强警示 / 警示浅底', '--warn-strong', '--warn-bg', false],
  ['注意 / 页面底', '--caution', '--bg', false],
  ['注意 / 注意浅底', '--caution', '--caution-bg', false],
  ['信息 / 页面底', '--info', '--bg', false],
  ['信息 / 信息浅底', '--info', '--info-bg', false],
  ['表格表头 / 表头底', '--muted', '--surface-2', false],
  ['悬停文字 / 悬停底', '--ink', '--surface-3', false],
];

const CMR = [
  ['CMR ≥50% 充裕', '--c1-fg', '--c1-bg'],
  ['CMR 30–50% 适中', '--c2-fg', '--c2-bg'],
  ['CMR 15–30% 紧张', '--c3-fg', '--c3-bg'],
  ['CMR <15% 拥堵', '--c4-fg', '--c4-bg'],
];

const run = (tokens, label, enforce) => {
  const rows = [];
  let worst = 99;
  let fails = 0;
  const check = (name, fgToken, bgToken, large, fgOverride) => {
    const fg = resolve(tokens, fgOverride || tokens[fgToken] || '');
    const bg = resolve(tokens, tokens[bgToken] || '');
    if (!fg.startsWith('#') || !bg.startsWith('#')) return;
    const r = ratio(fg, bg);
    const need = large ? 3 : 4.5;
    const ok = r >= need;
    if (enforce && !ok) fails++;
    if (r < worst) worst = r;
    rows.push({ name, fg, bg, ratio: +r.toFixed(2), need, ok });
  };
  for (const [n, fg, bg, large] of PAIRS) check(n, fg, bg, large);
  for (const [n, fg, bg] of CMR) check(n, fg, bg, false);
  if (label === 'midnight') {
    const fg = '#3f3c37';
    const bgStripe = '#f6f7f9';
    const r = ratio(fg, bgStripe);
    if (r < worst) worst = r;
    rows.push({ name: '无数据标签文字 / 灰斜线', fg, bg: bgStripe, ratio: +r.toFixed(2), need: 4.5, ok: r >= 4.5 });
  }
  return { label, rows, worst: +worst.toFixed(2), fails };
};

const results = [
  run(base, 'paper', false),
  run(midnight, 'midnight', true),
  run(legacy, 'legacy', false),
];

for (const r of results) {
  console.log(`\n── ${r.label} ── 最低 ${r.worst}:1 ${r.label === 'midnight' ? (r.fails ? `✗ ${r.fails} 项未达 AA` : '✓ 全部达 AA') : '(参考)'}`);
  for (const row of r.rows) {
    console.log(`  ${row.ok ? '✓' : '✗'} ${row.name.padEnd(26)} ${row.fg} on ${row.bg}  ${String(row.ratio).padStart(6)}:1  ≥${row.need}`);
  }
}

const target = results.find((r) => r.label === 'midnight');
fs.writeFileSync(
  path.join(ROOT, 'prototype/screenshots/contrast-midnight.json'),
  JSON.stringify(target, null, 2)
);
if (target.fails) {
  console.error(`\nmidnight 有 ${target.fails} 组未达 AA`);
  process.exit(1);
}
console.log('\nmidnight 全部通过 AA');
