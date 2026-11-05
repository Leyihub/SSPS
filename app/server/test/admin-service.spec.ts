import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminService } from '../modules/admin/admin.service';
import { ImportsService } from '../modules/imports/imports.service';
import { MasterService } from '../modules/master/master.service';
import { MemoryDirectory } from '../adapters/memory/memory-directory';
import { MemoryHealth, MemorySyncLog } from '../adapters/memory/memory-sync-log';
import { MemoryImportStore } from '../adapters/memory/memory-import-store';
import { MemoryMasterStore } from '../adapters/memory/memory-master-store';
import { MemoryVoyageStore } from '../adapters/memory/memory-voyage-store';
import { seedMaster } from '../adapters/memory/seed';
import type { Actor } from '../domain/voyage';

const admin: Actor = { userId: 'a', name: '管理员', role: '系统管理员', dept: null }, biz: Actor = { userId: 'b', name: '业务甲', role: '业务员', dept: '大宗采购部' }, logi: Actor = { userId: 'l', name: '物流', role: '物流管理员', dept: '仓储物流部' };

test('运行日志：导入成功、导入失败、航程重算都会记；只有系统管理员能看；失败可单独筛', async () => {
  const log = new MemorySyncLog(), dir = new MemoryDirectory(), master = new MemoryMasterStore(seedMaster()), v = new MemoryVoyageStore();
  const imports = new ImportsService(new MemoryImportStore(), master, v, dir, log), ms = new MasterService(master, v, dir, log), svc = new AdminService(log, new MemoryHealth(), dir);
  imports.clock = () => new Date('2026-11-05T08:30:00Z'); ms.clock = () => new Date('2026-11-05T09:00:00Z');
  const row = { 码头: '北区', 泊位: 'F1', 船名: 'MV A', 船长: 190, 船舶类型: '散货船', 物资名称: '镍矿', 吨位: 50000, 从属单位: '德信', 预计到港日期: '2026-11-06 08:00', 预计靠泊时间: '2026-11-07 08:00', 预计卸完时间: '2026-11-10 08:00' };
  await imports.importBerthPlan({ fileName: 'a.xlsx', rows: [row] }, logi);
  await assert.rejects(imports.importBerthPlan({ fileName: 'bad.xlsx', rows: [{ 船名: 'x' }] }, logi));
  await ms.recomputeRouteRules(admin);
  const all = await svc.syncLogs(admin);
  assert.deepEqual(all.map((x) => [x.type, x.ok]), [['航程重算 · 手动', '成功'], ['手动上传靠船计划', '失败'], ['手动上传靠船计划', '成功']]);
  assert.match(all[1].err, /缺少必要的列/); assert.equal(all[2].n, 1);
  assert.equal((await svc.syncLogs(admin, true)).length, 1);
  await assert.rejects(svc.syncLogs(biz), (e: any) => e.httpStatus === 403);
  const h = await svc.healthCheck(admin); assert.ok(h.checks.length >= 4 && h.checks.every((c) => c.status !== '正常'), '内存模式不装作正常');
  await assert.rejects(svc.healthCheck(logi), (e: any) => e.httpStatus === 403);
});
