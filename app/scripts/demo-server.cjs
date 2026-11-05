// 演示服务：用内存版后端 + 原型里的虚构示例数据，起一个能被前端页面调用的 /api。
// 只用于本地预览和截图，不连飞书和数据库，数据重启即清。用法：npm run build:server && node scripts/demo-server.cjs [端口]
// 登录身份：请求头 x-demo-user（默认 林海川），可选值见 server/test/fixtures/prototype/mock-data.js 的 people。
require('reflect-metadata');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const express = require('express');
const { NestFactory } = require('@nestjs/core');
const { Module, ValidationPipe } = require('@nestjs/common');
const root = path.join(__dirname, '..'), d = path.join(root, 'dist/server/');
const pick = (p, n) => require(d + p)[n];

const ctx = { window: {}, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of ['mock-data.js']) vm.runInContext('var window=this.window;' + fs.readFileSync(path.join(root, 'server/test/fixtures/prototype', f), 'utf8'), ctx);
const M = ctx.window.MOCK;
const NOW = new Date(M.today + 'T09:42:00Z');

class Root {}
Module({ imports: ['ports', 'prediction', 'capacity', 'voyage', 'master', 'imports', 'admin'].map((m) => pick(`modules/${m}/${m}.module.js`, m[0].toUpperCase() + m.slice(1) + 'Module')) })(Root);

(async () => {
  const app = await NestFactory.create(Root, { logger: ['error'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new (pick('common/filters/exception.filter.js', 'GlobalExceptionFilter'))());
  const T = require(d + 'ports/tokens.js');
  const voyages = app.get(T.VOYAGE_STORE), master = app.get(T.MASTER_STORE), dir = app.get(T.DIRECTORY_PORT), snap = app.get(T.SNAPSHOT_PORT);
  const vsvc = app.get(pick('modules/voyage/voyage.service.js', 'VoyageService')), isvc = app.get(pick('modules/imports/imports.service.js', 'ImportsService'));
  vsvc.clock = () => NOW; isvc.clock = () => NOW; app.get(pick('modules/master/master.service.js', 'MasterService')).clock = () => NOW; snap.today = () => M.today;

  // 当前用户：按请求头切换
  for (const [name, p] of Object.entries(M.people)) dir.set(name, { name, role: p.role, dept: p.dept });
  app.use((req, _res, next) => { const n = decodeURIComponent(req.headers['x-demo-user'] || M.user.name); req.userContext = { userId: n, userName: n }; next(); });

  // 主数据
  for (const p of M.ports) await master.savePort({ code: p.code || '', en: p.en, cn: p.cn, alias: p.alias || [], country: p.country, region: p.region || '', kind: p.nature, isLocal: !!p.isLocal, status: '启用' });
  for (const r of M.routeRules) await master.saveRouteRule({ ...r, status: r.status || '启用' });
  for (const v of M.vessels) await master.saveVessel({ id: v.id, name: v.name, alias: v.alias || [], mmsi: v.mmsi || null, imo: v.imo || null, type: v.type, dwt: v.dwt || null, length: v.loa || null, tier: v.tier || null });

  // 航次及其附属
  const OPS_MONEY = new Set([...pick('domain/voyage.js', 'OPS_KEYS'), ...pick('domain/voyage.js', 'MONEY_KEYS')]);
  const settlement = Object.fromEntries(Object.entries(M.bulkSettle).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk]) => OPS_MONEY.has(kk)))]));
  voyages.seed({
    voyages: M.voyageList.map(({ tons, mmsi, origKey, ...v }) => v),
    cargo: M.cargoLines, settlement, sales: M.salesExt,
    eta: M.etaRevisions, log: M.changeLog.map((e) => ({ ...e, old: e.old || null, nw: e.nw || null })),
    issues: M.issues.map((i) => ({ id: i.id, object: i.obj, type: i.type, field: i.field, note: i.note, owner: i.owner, status: i.status })),
  });

  // 靠船计划：把原型的明细还原成 IMIP 原表的列，再走真实导入流程
  const raw = M.berthPlanRows.map((r) => ({ 码头: r.terminal, 泊位: r.berthRaw, 船名: r.vessel, 船长: r.loa, 船舶类型: r.shipType, 物资名称: r.cargo, 吨位: r.tons, 从属单位: r.owner, 预计到港日期: r.eta + ' 08:00', 预计靠泊时间: r.start + ' 08:00', 预计卸完时间: r.end + ' 08:00', 备注: '' }));
  await isvc.importBerthPlan({ fileName: M.batch.fileName, rows: raw, planDate: M.batch.planDate, source: '飞书云空间' }, null);
  // 库存：序列还原成逐日行
  const DAY = 86400000, iso = (n) => new Date(n * DAY).toISOString().slice(0, 10), inv = [];
  for (const it of M.inventory.items) for (const [dn, stock, daily] of it.series) inv.push({ 导入日期: M.today, 库存日期: iso(dn), 品名: it.name, 物料类型: it.type, 日耗: daily, 库存: stock, 可用天数: dn === it.series[0][0] ? it.days : null });
  await isvc.importInventory({ fileName: '库存消耗模拟（示例）.xlsx', rows: inv }, null);

  for (const l of [...M.syncLogs].reverse()) await app.get(T.SYNC_LOG).add({ type: l.type, start: l.start, end: l.end, n: l.n, ok: l.ok, err: l.err });   // 原型里的示例运行日志

  const port = Number(process.argv[2] || process.env.PORT || 3100), dist = path.join(root, fs.existsSync(path.join(root, 'dist/preview')) ? 'dist/preview' : 'dist/client');   // 优先托管不依赖平台的预览构建（npm run preview:build）
  if (fs.existsSync(dist)) {                                   // 有前端构建产物就一起托管（单端口预览）
    const x = app.getHttpAdapter().getInstance();
    const html = fs.existsSync(path.join(dist, 'client/preview/index.html')) ? 'client/preview/index.html' : 'client/index.html';
    const tpl = fs.readFileSync(path.join(dist, html), 'utf8').replace('{{appName}}', '智慧发船预测系统').replace('{{{__platform__}}}', '{}');   // 平台运行时会替换这两处模板变量
    x.use(express.static(dist, { index: false })); x.get(/^(?!\/api\/).*/, (_req, res) => res.type('html').send(tpl));
  }
  await app.listen(port);
  console.log('演示服务已启动：http://localhost:' + port + '（今天 = ' + M.today + '，当前用户 = ' + M.user.name + '）');
})().catch((e) => { console.error(e); process.exit(1); });
