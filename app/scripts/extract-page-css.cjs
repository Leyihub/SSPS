// 把原型页面里的内联 <style> 抽出来，给每条选择器加上页面前缀（避免不同页面的同名类互相影响），写到指定文件。
// 用法：node scripts/extract-page-css.cjs ../prototype/P04-voyage-list.html pg-p04 client/src/pages/Voyages/p04.css
const fs = require('node:fs');
const [src, prefix, out] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

function prefixSelectors(sel) {
  return sel.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    if (/^(html|body|:root|\*)$/.test(s)) return null;
    return '.' + prefix + ' ' + s;
  }).filter(Boolean).join(',');
}
function walk(text) {
  let out = '', i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const body = text.slice(open + 1, j - 1);
    if (head.startsWith('@media')) out += head + '{' + walk(body) + '}\n';
    else if (head.startsWith('@')) out += head + '{' + body + '}\n';
    else { const sel = prefixSelectors(head); if (sel) out += sel + '{' + body + '}\n'; }
    i = j;
  }
  return out;
}
fs.writeFileSync(out, '/* 由 scripts/extract-page-css.cjs 从原型页面抽出，选择器已加前缀 .' + prefix + ' */\n' + walk(css));
console.log('写入', out);
