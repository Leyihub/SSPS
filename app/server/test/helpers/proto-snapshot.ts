// 用原型的示例数据组一份预测快照（有靠船计划、航次、库存），供各服务测试共用。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const proto = path.join(__dirname, '../fixtures/prototype');
const ctx: any = { window: {}, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
vm.runInContext('var window=this.window;' + fs.readFileSync(path.join(proto, 'mock-data.js'), 'utf8'), ctx);
export const M = ctx.window.MOCK;
export const protoSnapshot = () => ({ today: M.today, berths: M.berths, planRows: M.berthPlanRows, berthPlanBatch: { batchNo: M.batch.batchNo, planDate: M.batch.planDate, source: M.batch.source, coverTo: null },
  voyages: M.voyages, routeRules: M.routeRules, inventory: { batchNo: null, items: M.inventory.items }, ports: M.ports });
