/*
 * 暗色安全化：把页面级「写死的暖纸色值」换成 design token。
 *   —— 在 paper 皮肤下取值完全相同（#fff = --surface、#1a1a18 = --ink …），零视觉回归
 *   —— 在 midnight 皮肤下由 token 统一接管，避免白底白字
 * 不处理：:root token 定义行、CMR 四档、--stripe / --hatch 业务口径、SVG 属性、渐变纹理
 * 幂等：替换后不再含目标字面量，重复运行无变化。
 */
import fs from 'node:fs';
import path from 'node:path';

const FILES = [];
for (const dir of ['prototype', 'app/client/src/pages']) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) continue;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of fs.readdirSync(path.join(abs, entry.name))) {
        if (/\.(css|html)$/.test(f)) FILES.push(path.join(abs, entry.name, f));
      }
    } else if (/\.html$/.test(entry.name)) {
      FILES.push(path.join(abs, entry.name));
    }
  }
}

/* 先按「属性语义」处理白色，再按色值映射到最近的 token */
const PROP_RULES = [
  [/\bbackground(-color)?\s*:\s*#(?:fff|ffffff)\b/gi, 'background$1:var(--surface)'],
  [/\bcolor\s*:\s*#(?:fff|ffffff)\b/gi, 'color:var(--on-ink)'],
  [/\bfill\s*:\s*#(?:fff|ffffff)\b/gi, 'fill:var(--on-ink)'],
];

const TOKEN_MAP = {
  '#faf9f6': 'var(--bg)',
  '#f5f3ee': 'var(--surface-2)',
  '#f1eee9': 'var(--sidebar)',
  '#ece8e0': 'var(--surface-3)',
  '#e6e2da': 'var(--line)',
  '#efebe4': 'var(--line-2)',
  '#d8d3ca': 'var(--line-strong)',
  '#1a1a18': 'var(--ink)',
  '#35342f': 'var(--primary-hover)',
  '#8a857d': 'var(--muted)',
  '#aaa49a': 'var(--faint)',
  '#2f7d55': 'var(--ok)',
  '#cfe2d5': 'var(--ok-line)',
  '#eef4ef': 'var(--ok-bg)',
  '#c0452f': 'var(--warn)',
  '#edd2c9': 'var(--warn-line)',
  '#faeeea': 'var(--warn-bg)',
  '#a86a2e': 'var(--caution)',
  '#e8dcc4': 'var(--caution-line)',
  '#f8f1e6': 'var(--caution-bg)',
  '#4a6b8a': 'var(--info)',
  '#d6e0e8': 'var(--info-line)',
  '#eef2f5': 'var(--info-bg)',
  '#c9c5bd': 'var(--bar-past)',
  '#e3dfd7': 'var(--bar-future)',
};

const SKIP_LINE = [
  /^\s*--[a-z0-9-]+\s*:/i,          // token 定义行（含 CMR、stripe、hatch）
  /repeating-linear-gradient/i,      // 纹理 / 斜线
  /(?:stroke|fill)\s*=\s*"#/i,       // SVG 属性（由 skin.css 属性选择器接管）
  /^\s*(?:--c[1-4]|--stripe)/i,
];

const stats = { files: 0, changed: 0, replacements: 0, byColor: {} };

for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let hit = 0;

  const out = lines.map((line) => {
    if (SKIP_LINE.some((re) => re.test(line))) return line;

    let next = line;
    for (const [re, rep] of PROP_RULES) {
      next = next.replace(re, (...m) => {
        hit++;
        stats.byColor['#fff(property)'] = (stats.byColor['#fff(property)'] || 0) + 1;
        return rep.replace('$1', m[1] || '');
      });
    }

    next = next.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
      const token = TOKEN_MAP[hex.toLowerCase()];
      if (!token) return hex;
      hit++;
      stats.byColor[hex.toLowerCase()] = (stats.byColor[hex.toLowerCase()] || 0) + 1;
      return token;
    });

    return next;
  });

  stats.files++;
  if (hit > 0) {
    fs.writeFileSync(file, out.join('\n'));
    stats.changed++;
    stats.replacements += hit;
  }
}

console.log(JSON.stringify(stats, null, 2));
