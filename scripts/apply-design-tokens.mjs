/* SSPS Design System v2 · 页面级色值归一化
 * 用途：把散落在原型 HTML 内联样式、页面专属 CSS、JS/TSX 字符串里的旧蓝色 ERP
 *       硬编码色值，统一替换为新设计 token。只改颜色字面量，不改任何业务逻辑。
 * 保护：CMR 四档色阶与「无数据」灰色斜线的变量定义行原样保留（业务硬规矩）。
 * 用法：node scripts/apply-design-tokens.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAP = Object.create(null);
const bind = (css, lit, list) => { for (const h of list) MAP[h.toLowerCase()] = [css, lit]; };

/* —— 墨黑强调与深色文字 —— */
bind('var(--primary)', '#1a1a18', ['#1677ff', '#1d39c4', '#4096ff']);
bind('var(--primary-hover)', '#35342f', ['#0958d9']);
bind('var(--ink)', '#1a1a18', ['#26394f', '#203348', '#1f2d3d', '#17365d']);
bind('var(--text)', '#2a2926', ['#3b4a5c', '#4a596b', '#44546a']);
bind('var(--muted)', '#8a857d', ['#5b6878', '#6b7a8c', '#7b8696', '#8a94a3', '#8a97a8', '#8c8c8c', '#595959']);
bind('var(--faint)', '#aaa49a', ['#98a4b3', '#a7b0bc', '#c0c8d2']);

/* —— 表面与分隔线 —— */
bind('var(--bg)', '#faf9f6', ['#f1f4f8']);
bind('var(--primary-bg)', '#f1eee9', ['#e6f4ff']);
bind('var(--surface-2)', '#f5f3ee', [
  '#eef0f3', '#f3f8ff', '#f9f0ff', '#fbfcfe', '#f7f9fb', '#f0f7ff', '#f5faff',
  '#f5f6f8', '#fafbfc', '#f7f9fc', '#f4ebff', '#fbfbfc', '#f7f8fa', '#f5f8fc',
  '#f2fbfa', '#f2f3f5', '#fff8f7', '#f2f4f7', '#fff2e8', '#fafbfd', '#f6f7f9',
  '#f2f6fb', '#f2f5f9', '#eef2f7', '#eceff3', '#e6f1ff', '#e6eefb', '#f4fcfc',
  '#eaf3ff', '#dfeeff', '#fafafa', '#f5faff', '#f0f0f0'
]);
bind('var(--line)', '#e6e2da', ['#e4e8ee', '#e6ebf2', '#e3e8ef', '#e1e5eb', '#bae0ff', '#b7d8ff', '#d6e6fb', '#e0e7f1', '#e8ebef']);
bind('var(--line-2)', '#efebe4', ['#f0f2f5']);
bind('var(--line-strong)', '#d8d3ca', [
  '#d3d9e1', '#dfe3e8', '#c4cad3', '#d9dee5', '#d0d7e2', '#c9d0d9', '#d0d5dc',
  '#e0e0e0', '#d9d9d9', '#b9c8da', '#adc6ff', '#cdd2d9', '#91caff'
]);
bind('var(--bar-past)', '#c9c5bd', ['#69b1ff']);

/* —— 语义色 —— */
bind('var(--warn)', '#c0452f', ['#cf1322', '#ff4d4f', '#a8071a', '#ad2102', '#d4380d']);
bind('var(--warn-bg)', '#faeeea', ['#fff1f0', '#fff8f7']);
bind('var(--warn-line)', '#edd2c9', ['#ffa39e', '#ff7875', '#ff9c6e', '#ffbb96', '#ffccc7']);
bind('var(--ok)', '#2f7d55', ['#237804', '#389e0d', '#52c41a']);
bind('var(--ok-bg)', '#eef4ef', ['#f6ffed']);
bind('var(--ok-line)', '#cfe2d5', ['#b7eb8f', '#95de64']);
bind('var(--caution)', '#a86a2e', ['#ad4e00', '#d46b08', '#ad6800', '#fa8c16', '#faad14']);
bind('var(--caution-bg)', '#f8f1e6', ['#fffbe6', '#fff7e6']);
bind('var(--caution-line)', '#e8dcc4', ['#ffe58f', '#ffd591']);
bind('var(--info)', '#4a6b8a', ['#08979c', '#531dab', '#9254de', '#b37feb', '#597ef7', '#3730a3', '#08777c']);
bind('var(--info-bg)', '#eef2f5', ['#eef2ff', '#e6fffb', '#f2fbfa']);
bind('var(--info-line)', '#d6e0e8', ['#d3adf7', '#c7d2fe', '#87e8de', '#9bd6d8']);

/* CMR 色阶专用：出现在变量定义行时整行跳过；出现在别处时按语义色归一 */
MAP['#d9f7be'] = ['var(--ok-line)', '#cfe2d5'];
MAP['#135200'] = ['var(--ok)', '#2f7d55'];
MAP['#fff1b8'] = ['var(--caution-bg)', '#f8f1e6'];
MAP['#614700'] = ['var(--caution)', '#a86a2e'];
MAP['#ffd666'] = ['var(--caution-line)', '#e8dcc4'];
MAP['#ffd8bf'] = ['var(--warn-line)', '#edd2c9'];
MAP['#873800'] = ['var(--caution)', '#a86a2e'];
MAP['#ffa940'] = ['var(--caution-line)', '#e8dcc4'];

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const CMR_LINE = /--c[1-4]-(?:bg|fg|bd)\s*:|--stripe\s*:/;
const VAR_LINE = /--[a-z0-9-]+\s*:/i;
/* 新设计系统自身的字面色值：重复运行脚本时保持不变，保证幂等 */
const NEW_LITERALS = new Set([
  '#1a1a18', '#35342f', '#2a2926', '#8a857d', '#aaa49a', '#faf9f6',
  '#f1eee9', '#f5f3ee', '#e6e2da', '#efebe4', '#d8d3ca', '#c9c5bd',
  '#c0452f', '#faeeea', '#edd2c9', '#2f7d55', '#eef4ef', '#cfe2d5',
  '#a86a2e', '#f8f1e6', '#e8dcc4', '#4a6b8a', '#eef2f5', '#d6e0e8',
  '#ffffff', '#fff', '#a6634a', '#ece8e0', '#a33724', '#e3dfd7',
  '#f6f4ef', '#f6f7f9', '#cdd2d9',
  /* CMR 四档色阶：业务语义色，任何情况下都不参与换肤 */
  '#d9f7be', '#135200', '#95de64', '#fff1b8', '#614700', '#ffd666',
  '#ffd8bf', '#873800', '#ffa940', '#ffccc7', '#a8071a', '#ff7875',
]);

function expand(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/* 未登记色值的兜底：按明度 / 饱和度归入暖中性或低饱和语义色 */
function fallback(hex) {
  const [r, g, b] = expand(hex);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx - mn, light = (mx + mn) / 2;
  if (sat < 24) {
    if (mn > 246) return ['var(--surface)', '#ffffff'];
    if (mn > 222) return ['var(--surface-2)', '#f5f3ee'];
    if (mn > 198) return ['var(--line)', '#e6e2da'];
    if (mn > 155) return ['var(--line-strong)', '#d8d3ca'];
    if (light > 110) return ['var(--muted)', '#8a857d'];
    return ['var(--text)', '#2a2926'];
  }
  if (r >= g && r >= b) return light > 170 ? ['var(--warn-bg)', '#faeeea'] : ['var(--warn)', '#c0452f'];
  if (g >= r && g >= b) return light > 170 ? ['var(--ok-bg)', '#eef4ef'] : ['var(--ok)', '#2f7d55'];
  if (r >= b && g >= b) return light > 170 ? ['var(--caution-bg)', '#f8f1e6'] : ['var(--caution)', '#a86a2e'];
  return light > 170 ? ['var(--info-bg)', '#eef2f5'] : ['var(--info)', '#4a6b8a'];
}

const stats = { files: 0, hex: 0, gradient: 0, rgba: 0, unmapped: new Set() };

function convertLine(line, cssMode) {
  if (CMR_LINE.test(line)) return line;
  const literalOnly = VAR_LINE.test(line);
  let out = line;

  /* 1. 保护业务斜纹（无数据） */
  const stripes = [];
  out = out.replace(/repeating-linear-gradient\([^)]*\)/g, (m) => {
    stripes.push(m);
    return `__STRIPE_${stripes.length - 1}__`;
  });

  /* 2. 渐变改纯色：深色渐变 → 墨黑，浅色渐变 → 浅填充 */
  out = out.replace(/(?<!repeating-)linear-gradient\([^)]*\)/g, (m) => {
    stats.gradient++;
    const stops = m.match(/#[0-9a-fA-F]{6}\b/g) || [];
    const dark = /--nav-[12]/.test(m) || (stops.length > 0 && stops.every((h) => {
      const [r, g, b] = expand(h);
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 < 110;
    }));
    const cssVal = dark ? 'var(--ink)' : 'var(--surface-2)';
    return cssMode && !literalOnly ? cssVal : (dark ? '#1a1a18' : '#f5f3ee');
  });

  /* 3. 冷蓝阴影 / 描边 rgba → 暖中性 */
  out = out.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g, (m, r, g, b, a) => {
    if (Number(b) <= Number(r) + 8) return m;
    stats.rgba++;
    return `rgba(26,26,24,${a})`;
  });

  /* 4. 色值 → token（自定义属性定义行用字面色值，避免 var() 自引用） */
  out = out.replace(HEX, (m) => {
    const key = m.toLowerCase();
    if (NEW_LITERALS.has(key)) return m;
    const hit = MAP[key] || fallback(m);
    if (!MAP[key]) stats.unmapped.add(key);
    stats.hex++;
    return cssMode && !literalOnly ? hit[0] : hit[1];
  });

  /* 5. 还原斜纹 */
  stripes.forEach((s, i) => { out = out.replace(`__STRIPE_${i}__`, s); });
  return out;
}

function convertFile(rel, mode) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const lines = src.split(/\r?\n/);
  let cssMode = mode === 'css';
  let inStyle = false;
  const out = lines.map((line) => {
    let current = line;
    if (mode === 'html') {
      const open = /<style[^>]*>/i.test(current);
      const close = /<\/style>/i.test(current);
      if (open) inStyle = true;
      cssMode = inStyle;
      const res = cssMode ? convertLine(current, true) : convertLine(current, false);
      if (close) inStyle = false;
      return res;
    }
    return convertLine(current, cssMode);
  });
  const next = out.join('\n');
  if (next !== src) { fs.writeFileSync(abs, next, 'utf8'); stats.files++; }
}

const targets = [];
for (const f of fs.readdirSync(path.join(ROOT, 'prototype'))) {
  if (f.endsWith('.html')) targets.push([`prototype/${f}`, 'html']);
}
for (const f of fs.readdirSync(path.join(ROOT, 'prototype/assets'))) {
  if (f.endsWith('.js')) targets.push([`prototype/assets/${f}`, 'js']);
}
const pageDir = path.join(ROOT, 'app/client/src/pages');
for (const d of fs.readdirSync(pageDir)) {
  const dir = path.join(pageDir, d);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.css')) targets.push([`app/client/src/pages/${d}/${f}`, 'css']);
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) targets.push([`app/client/src/pages/${d}/${f}`, 'js']);
  }
}
const sspsDir = path.join(ROOT, 'app/client/src/ssps');
for (const f of fs.readdirSync(sspsDir)) {
  if (f.endsWith('.tsx') || f.endsWith('.ts')) targets.push([`app/client/src/ssps/${f}`, 'js']);
}
targets.push(['app/client/src/components/Layout.tsx', 'js']);

for (const [rel, mode] of targets) convertFile(rel, mode);

/* —— 自包含页面补齐共享 token ——
 * index.html 与 P02-prediction-v2.html 不加载 assets/app.css，
 * 其内联样式引用了新 token，需注入同一份 :root 定义（带标记，避免重复注入）。 */
const sharedCss = fs.readFileSync(path.join(ROOT, 'prototype/assets/app.css'), 'utf8');
const rootBlock = sharedCss.match(/:root\s*\{[\s\S]*?\n\}/);
if (rootBlock) {
  for (const f of ['prototype/index.html', 'prototype/P02-prediction-v2.html']) {
    const abs = path.join(ROOT, f);
    let s = fs.readFileSync(abs, 'utf8');
    if (s.includes('/* ds-v2-tokens')) continue;
    s = s.replace(/<style>/i, `<style>\n/* ds-v2-tokens · 与 prototype/assets/app.css 同源 */\n${rootBlock[0]}`);
    fs.writeFileSync(abs, s, 'utf8');
    stats.files++;
  }
}

console.log(JSON.stringify({
  filesChanged: stats.files,
  hexReplaced: stats.hex,
  gradientsFlattened: stats.gradient,
  rgbaNormalized: stats.rgba,
  unmappedColors: [...stats.unmapped].sort(),
}, null, 2));
