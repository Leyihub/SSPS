/*
 * 给 prototype 下所有页面接入皮肤层：
 *   1) <link rel="stylesheet" href="assets/skin.css">  —— 必须在页面内联 <style> 之后加载
 *   2) <script data-skin-init>                          —— 首屏前设定 data-skin，避免闪烁
 * 幂等：已存在 data-skin-init 时只把脚本内容升级为当前版本（支持 paper / midnight / legacy）。
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('prototype');
const MARK = 'data-skin-init';
const LINK = '<link rel="stylesheet" href="assets/skin.css">';
const INIT =
  '<script ' + MARK + '>(function(){var s="paper";try{var v=localStorage.getItem("ssps-skin");' +
  'if(v==="legacy"||v==="midnight")s=v;}catch(e){}' +
  'document.documentElement.setAttribute("data-skin",s);})();</script>';

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html'));
let injected = 0;
let upgraded = 0;
const skipped = [];

for (const f of files) {
  const p = path.join(DIR, f);
  let src = fs.readFileSync(p, 'utf8');

  if (src.includes(MARK)) {
    const next = src.replace(/<script data-skin-init>[\s\S]*?<\/script>/, INIT);
    if (next !== src) { fs.writeFileSync(p, next); upgraded++; }
    else skipped.push(f);
    continue;
  }

  const head = src.lastIndexOf('</head>');
  if (head < 0) { skipped.push(f + ' (无 </head>)'); continue; }

  const inject = (src.includes('assets/skin.css') ? '' : LINK + '\n') + INIT + '\n';
  src = src.slice(0, head) + inject + src.slice(head);
  fs.writeFileSync(p, src);
  injected++;
}

console.log(JSON.stringify({ injected, upgraded, skipped, total: files.length }, null, 2));
