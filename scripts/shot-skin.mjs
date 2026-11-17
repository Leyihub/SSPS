/*
 * 双皮肤截图：同一页面分别以 paper / legacy 渲染，用于逐项比对。
 * 用法：node scripts/shot-skin.mjs [宽] [高]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('.');
const BASE = 'file:///' + ROOT.replace(/\\/g, '/') + '/prototype/';
const OUT = path.join(ROOT, 'prototype', 'screenshots');
const W = Number(process.argv[2] || 1600);
const H = Number(process.argv[3] || 1000);
const PORT = 9401;

const PAGES = [
  ['P01-workbench.html', 'workbench'],
  ['P06-capacity-calendar.html', 'calendar'],
  ['index.html', 'index'],
  ['P02-prediction-v2.html', 'v2'],
];

fs.mkdirSync(OUT, { recursive: true });

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT,
  '--window-size=' + W + ',' + H,
  '--user-data-dir=' + path.join(ROOT, '.tmp-chrome-skin'),
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
    const page = list.find((t) => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* 还没起来 */ }
  await sleep(250);
}
if (!wsUrl) { console.log('NO_WS'); proc.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pend = new Map();
const cmd = (method, params = {}) => new Promise((res) => {
  const i = ++id;
  pend.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m); pend.delete(m.id); }
};

await cmd('Page.enable');
await cmd('Runtime.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const rows = [];
for (const [file, name] of PAGES) {
  for (const skin of ['paper', 'legacy']) {
    await cmd('Page.navigate', { url: BASE + file });
    await sleep(1500);
    if (skin === 'legacy') {
      await cmd('Runtime.evaluate', {
        expression: 'document.documentElement.setAttribute("data-skin","legacy");' +
          'document.querySelectorAll(".skin-sw").forEach(function(b){var p=b.querySelector(".skin-sw-pop");if(p)p.hidden=true});',
      });
      await sleep(450);
    }
    const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const out = path.join(OUT, 'skin-' + skin + '-' + name + '.png');
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));

    const probe = await cmd('Runtime.evaluate', {
      expression: 'JSON.stringify({vw:document.documentElement.clientWidth,' +
        'sw:document.documentElement.scrollWidth,' +
        'navBg:getComputedStyle(document.getElementById("nav")||document.body).backgroundImage.slice(0,60),' +
        'bodyBg:getComputedStyle(document.body).backgroundColor,' +
        'swBtn:!!document.querySelector(".skin-sw-btn")})',
      returnByValue: true,
    });
    rows.push({ skin, page: name, ...JSON.parse(probe.result.value) });
  }
}

ws.close();
proc.kill();
console.log(JSON.stringify(rows, null, 2));
