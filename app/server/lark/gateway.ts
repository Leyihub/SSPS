// 多维表格网关：仓储只依赖这个小接口，真实实现包一层 createBitable，测试里用假的（test/helpers/fake-base.ts）。
// 写入格式（2026-11-05 已用真实 Base 验证，见 docs/schema/mirror-samples.md）：
//   日期时间 = 13 位毫秒时间戳（整数，字符串会被拒绝）；关联 = 记录 ID 字符串数组；人员 = [{ id }]；多选 = 字符串数组；
//   自动编号 / 公式 / 查找引用写了也会被静默忽略；PATCH 只改传入的字段。
export type TableKey = 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06' | 'T07' | 'T08' | 'T09a' | 'T09b' | 'T10';
export interface BaseRecord { record_id: string; fields: Record<string, any> }
export interface WriteOpts { /** 人员字段用哪种 ID：open_id（默认）或 user_id（飞书企业内 ID） */ userIdType?: 'open_id' | 'user_id' | 'union_id' }

export interface BaseGateway {
  create(table: TableKey, records: Array<{ fields: Record<string, any> }>, opts?: WriteOpts): Promise<BaseRecord[]>;
  update(table: TableKey, records: BaseRecord[], opts?: WriteOpts): Promise<void>;
  remove(table: TableKey, recordIds: string[]): Promise<void>;
  /** 整张表现有的记录 ID（按表里的顺序）。兼容表整表重写时用，不读字段内容 */
  ids(table: TableKey): Promise<string[]>;
}

type AnyFn = (...a: any[]) => any;
export function createBitableGateway(b: { createRecords: AnyFn; batchUpdate: AnyFn; batchDelete: AnyFn; listAll: AnyFn }): BaseGateway {
  const q = (o?: WriteOpts) => (o?.userIdType ? 'user_id_type=' + o.userIdType : '');
  return {
    create: (t, records, o) => b.createRecords(t, records, q(o)),
    update: async (t, records, o) => { await b.batchUpdate(t, records, q(o)); },
    remove: async (t, ids) => { await b.batchDelete(t, ids); },
    ids: async (t) => (await b.listAll(t)).map((r: { record_id: string }) => r.record_id),
  };
}
