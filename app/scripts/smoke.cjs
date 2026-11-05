// 冒烟：用编译后的代码（npm run build:server 之后）真起一个 Nest，走一遍 HTTP 主线，验证依赖注入、校验管道、异常过滤器都接得上。
// 只带业务模块和内存数据，不连飞书和数据库，也不需要登录态。用法：npm run smoke
require('reflect-metadata');
const path = require('node:path');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { Module, ValidationPipe } = require('@nestjs/common');
const d = path.join(__dirname, '../dist/server/'), pick = (p, n) => require(d + p)[n];

class Root {}
Module({ imports: ['ports/ports', 'prediction/prediction', 'capacity/capacity', 'voyage/voyage', 'master/master', 'imports/imports'].map((m) => pick(`modules/${m.split('/')[0]}/${m.split('/')[1]}.module.js`, m.split('/')[1][0].toUpperCase() + m.split('/')[1].slice(1) + 'Module')) })(Root);

(async () => {
  const app = await NestFactory.create(Root, { logger: ['error'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new (pick('common/filters/exception.filter.js', 'GlobalExceptionFilter'))());
  await app.listen(0);
  const base = await app.getUrl();
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const step = (name) => console.log('✓', name);

  assert.equal((await call('GET', '/api/me')).status, 200); step('当前用户');
  assert.equal((await call('GET', '/api/ports?q=' + encodeURIComponent('巴浩'))).body[0].en, 'BAHODOPI'); step('港口别名模糊匹配');
  const c = await call('POST', '/api/voyages', { biz: '大宗采购船', load: 'SURIGAO', disch: 'BAHODOPI', planDischS: '2026-12-01', planDischE: '2026-12-03', cargo: [{ name: '镍矿', tons: 50000 }] }, { 'x-idempotency-key': 'smoke-1' });
  assert.equal(c.status, 201); const id = c.body.voyage.id; step('新建航次 ' + id);
  assert.equal((await call('POST', '/api/voyages', { biz: '火箭' })).status, 400); step('入参校验拒绝非法业务类型');
  assert.equal((await call('POST', `/api/voyages/${id}/eta`, { eta: '2026-12-02 08:00', basis: '船代' })).status, 201); step('修订 ETA');
  assert.equal((await call('POST', `/api/voyages/${id}/eta`, { eta: '2026-12-03 08:00', basis: '猜的' })).status, 400); step('ETA 缺依据被拒绝');
  const p = await call('POST', '/api/predictions', { biz: '大宗采购船', tons: 50000, load: 'SURIGAO', disch: 'BAHODOPI', winStart: '2026-12-01', winEnd: '2026-12-20' });
  assert.equal(p.body.status, 'ok'); step('预测 ' + p.body.runNo);
  assert.equal((await call('POST', `/api/predictions/${p.body.runNo}/adopt`, { label: 'A' })).status, 201); step('采纳方案（新建待宣船航次）');
  assert.equal((await call('POST', `/api/predictions/${p.body.runNo}/announcement`, { label: 'A' })).status, 201); step('生成宣船文案');
  assert.equal((await call('GET', '/api/capacity/calendar')).status, 200); step('容量日历');
  assert.equal((await call('POST', '/api/route-rules/recompute')).status, 403); step('非系统管理员不能重算航程规则');
  await app.close();
  console.log('冒烟通过');
})().catch((e) => { console.error('冒烟失败：', e); process.exit(1); });
