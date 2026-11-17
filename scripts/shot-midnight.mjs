/*
 * 夜墨皮肤渲染验证：
 *   1) 切换皮肤（写 localStorage 后 reload，走真实持久化路径）
 *   2) 截图（桌面 / 平板 / 手机）
 *   3) 运行时文字对比度探针：找出「实际渲染文字 vs 最近不透明背景」低于 4.5 的位置
 *   4) 横向溢出检测
 * 用法：node scripts/shot-midnight.mjs [skin]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const SKIN = process.argv[2] || 'midnight';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///C:/Users/董金/WorkBuddy/SSPS/prototype/';
const OUT = 'C:/Users/董金/WorkBuddy/SSPS/prototype/screenshots/';
const PROFILE = 'C:/Users/董金/WorkBuddy/SSPS/.tmp-chrome-' + SKIN;

const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=9420', '--window-size=1600,1000', '--user-data-dir=' + PROFILE], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let u;
for (let i = 0; i < 60; i++) {
  try {
    const j = await (await fetch('http://127.0.0.1:9420/json/list')).json();
    const x = j.find((a) => a.type === 'page');
    if (x) { u = x.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
if (!u) { console.log('NO_WS'); p.kill(); process.exit(1); }

const ws = new WebSocket(u);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const cmd = (m, params = {}) => new Promise((res) => {
  const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params }));
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m); pend.delete(m.id); }
};
const val = async (expr) => {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
  return r.result?.value;
};

await cmd('Page.enable');
await cmd('Runtime.enable');

/* 页面内：文字对比度探针 */
const PROBE = `(function(){
  function rgb(s){var m=s.match(/[\\d.]+/g);if(!m)return null;return [+m[0],+m[1],+m[2],m[3]===undefined?1:+m[3]];}
  function L(c){var v=c.slice(0,3).map(function(x){var s=x/255;return s<=.03928?s/12.92:Math.pow((s+.055)/1.055,2.4)});return .2126*v[0]+.7152*v[1]+.0722*v[2];}
  function ratio(a,b){var x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  function bgOf(el){
    var n=el;
    while(n&&n!==document.documentElement){
      var cs=getComputedStyle(n), c=rgb(cs.backgroundColor);
      if(c&&c[3]>=.85) return c;
      if(cs.backgroundImage!=='none'&&!/^(none)$/.test(cs.backgroundImage)) return null; // 渐变/纹理跳过
      n=n.parentElement;
    }
    var b=rgb(getComputedStyle(document.body).backgroundColor);
    return b&&b[3]>=.85?b:[250,249,246,1];
  }
  var out=[], vw=document.documentElement.clientWidth;
  var all=document.querySelectorAll('body *');
  for(var i=0;i<all.length;i++){
    var el=all[i];
    var own='';
    for(var k=0;k<el.childNodes.length;k++){var c=el.childNodes[k];if(c.nodeType===3)own+=c.nodeValue;}
    own=own.trim();
    if(own.length<2) continue;
    var r=el.getBoundingClientRect();
    if(r.width<2||r.height<2) continue;
    var cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) continue;
    if(el.closest('svg')) continue;
    var fg=rgb(cs.color); var bg=bgOf(el);
    if(!fg||!bg) continue;
    var rr=ratio(fg,bg);
    var px=parseFloat(cs.fontSize), wt=+cs.fontWeight||400;
    var need=(px>=24||(px>=18.66&&wt>=700))?3:4.5;
    if(rr<need) out.push({sel:el.tagName.toLowerCase()+'.'+String(el.className).split(' ').slice(0,2).join('.'),
      txt:own.slice(0,16), fg:cs.color, bg:'rgb('+bg.slice(0,3).map(Math.round).join(',')+')',
      ratio:+rr.toFixed(2), size:cs.fontSize, weight:cs.fontWeight, need:need});
  }
  out.sort(function(a,b){return a.ratio-b.ratio});
  return JSON.stringify({vw:vw, sw:document.documentElement.scrollWidth,
    over:[].filter.call(document.querySelectorAll('body *'),function(e){var b=e.getBoundingClientRect();return b.width>0&&b.right>vw+3}).length,
    low:out.slice(0,14), count:out.length});
})()`;

const PAGES = [
  ['P01-workbench.html', 'workbench'],
  ['P02-prediction.html', 'predict'],
  ['P06-capacity-calendar.html', 'calendar'],
  ['index.html', 'index'],
  ['P04-voyage-list.html', 'list'],
  ['P11-ask.html', 'ask'],
];

const report = [];
for (const [w, h] of [[1600, 1000], [860, 900], [390, 900]]) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
  for (const [page, name] of (w === 1600 ? PAGES : [['P01-workbench.html', 'workbench'], ['P06-capacity-calendar.html', 'calendar']])) {
    await cmd('Page.navigate', { url: BASE + page });
    await sleep(700);
    await val(`localStorage.setItem('ssps-skin','${SKIN}')`);
    await cmd('Page.reload');
    await sleep(1400);
    const r = JSON.parse(await val(PROBE));
    const theme = await val('document.documentElement.getAttribute("data-skin")');
    report.push({ page, w, theme, ...r });
    if (name === 'workbench' || name === 'calendar' || name === 'index') {
      const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const tag = w === 1600 ? '' : `-${w}`;
      fs.writeFileSync(OUT + `skin-${SKIN}-${name}${tag}.png`, Buffer.from(shot.data, 'base64'));
    }
  }
}

/* 下拉展开特写 */
await cmd('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false });
await cmd('Page.navigate', { url: BASE + 'P01-workbench.html' });
await sleep(1400);
await val('document.querySelector(".skin-sw-btn").click()');
await sleep(300);
const dd = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 1080, y: 0, width: 520, height: 330, scale: 2 } });
fs.writeFileSync(OUT + `skin-${SKIN}-dropdown.png`, Buffer.from(dd.data, 'base64'));

console.log(JSON.stringify(report, null, 1));
ws.close();
p.kill();
process.exit(0);
