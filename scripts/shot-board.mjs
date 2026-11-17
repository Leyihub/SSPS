/*
 * 船舶动态协作台原型截图：按岗位和关键状态各拍一张，存到 prototype/screenshots/board-*.png。
 * 用法：node scripts/shot-board.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('.');
const URL_ = 'file:///' + ROOT.replace(/\\/g, '/') + '/prototype/P04-vessel-board.html';
const OUT = path.join(ROOT, 'prototype', 'screenshots');
const PORT = 9402;

// 页面内的小工具：切身份、切视图、展开行
const H = `
  const sw = (n) => { const s = document.getElementById('viewer'); s.value = n; s.dispatchEvent(new Event('change', { bubbles: true })); };
  const go = (id) => document.querySelector('#views [data-v="' + id + '"]').click();
  const open = (id) => document.querySelector('#tbl [data-x="' + id + '"]').click();
  const M = window.MOCK, C = window.C;
  const find = (f) => (M.voyageList.find(f) || {}).id;
`;
const SHOTS = [
  ['board-01-bulk-todo', 1600, 1000, `sw('林海川'); go('todo'); open('VY-2026-0307');`],
  ['board-02-bulk-plan', 1600, 1000, `sw('林海川'); go('bulk');`],
  ['board-03-sales', 1600, 1000, `sw('韩墨'); go('prod'); open(find((v) => v.biz === '成品销售船' && C.statusOf(v) === '装港等泊'));`],
  ['board-04-warehouse', 1600, 1000, `sw('罗景行'); go('port'); open(find((v) => v.biz === '大宗采购船' && C.statusOf(v) === '卸港卸货'));`],
  ['board-05-warehouse-loading', 1600, 1000, `sw('罗景行'); go('load'); open(find((v) => v.biz === '成品销售船' && C.statusOf(v) === '装港装货'));`],
  ['board-06-adopt', 1600, 1000, `sw('林海川'); document.getElementById('bAdopt').click();`],
  ['board-07-fee', 1600, 1000, `sw('周晓棠'); go('fee');`],
  ['board-08-grant', 1600, 1000, `sw('钟立诚'); document.getElementById('bGrant').click();`],
  ['board-09-columns', 1600, 1000, `sw('罗景行'); go('port'); document.getElementById('bCols').click();`],
  ['board-10-cozy', 1600, 1000, `sw('林海川'); go('bulk'); document.querySelector('#dens [data-d="cozy"]').click();`],
  ['board-11-midnight', 1600, 1000, `sw('林海川'); go('todo'); open('VY-2026-0307'); document.documentElement.setAttribute('data-skin', 'midnight');`],
  ['board-12-mobile', 390, 844, `sw('罗景行'); go('todo'); document.querySelector('#cards [data-x]').click();`],
];

fs.mkdirSync(OUT, { recursive: true });
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=' + PORT, '--window-size=1600,1000', '--user-data-dir=' + path.join(ROOT, '.tmp-chrome-board')], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 60; i++) {
  try { const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); const page = list.find((t) => t.type === 'page'); if (page) { wsUrl = page.webSocketDebuggerUrl; break; } } catch { /* 还没起来 */ }
  await sleep(250);
}
if (!wsUrl) { console.log('NO_WS'); proc.kill(); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map();
const cmd = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m); pend.delete(m.id); } };
await cmd('Page.enable'); await cmd('Runtime.enable');

const report = [];
for (const [name, w, h, js] of SHOTS) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await cmd('Page.navigate', { url: URL_ });
  await sleep(900);
  await cmd('Runtime.evaluate', { expression: 'sessionStorage.clear();try{localStorage.removeItem("ssps-density");localStorage.removeItem("ssps-skin");localStorage.removeItem("ssps-board-myviews")}catch(e){};location.reload()' });
  await sleep(1100);
  const r = await cmd('Runtime.evaluate', { expression: '(function(){try{' + H + js + ';var t=document.getElementById("toast");if(t)t.classList.remove("on");return "ok · 横向溢出=" + (document.documentElement.scrollWidth > document.documentElement.clientWidth)}catch(e){return "ERR " + e.message}})()', returnByValue: true });
  await sleep(500);
  const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(shot.data, 'base64'));
  report.push(name + ' · ' + (r.result ? r.result.value : JSON.stringify(r)));
}
ws.close(); proc.kill();
console.log(report.join('\n'));
