// 假的飞书多维表格：按 docs/schema/base-plan.json 里的真实字段定义校验写入——字段名不存在、日期不是毫秒时间戳、关联不是 ID 数组、
// 人员不是 [{id}] 都会像真实接口一样报错；自动编号、公式、查找引用写了会被静默忽略（和真实行为一致）。
import fs from 'node:fs';
import path from 'node:path';
import type { BaseGateway, BaseRecord, TableKey, WriteOpts } from '../../lark/gateway';

const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../docs/schema/base-plan.json'), 'utf8'));
export const FIELDS: Record<string, Record<string, { type: string; options?: string[] }>> = Object.fromEntries(plan.tables.map((t: any) => [t.key, Object.fromEntries(t.fields.map((f: any) => [f.name, { type: f.type, options: f.options }]))]));
const IGNORED = new Set(['autonumber', 'formula', 'lookup']);

function check(table: string, name: string, v: any) {
  const f = FIELDS[table]?.[name];
  if (!f) throw new Error(`FieldNameNotFound: ${table}.${name}`);
  if (v === null) return;
  const bad = (why: string) => { throw new Error(`FieldValueInvalid: ${table}.${name} ${why}`); };
  switch (f.type) {
    case 'datetime': case 'date': if (!Number.isInteger(v) || v < 1e11) bad('日期必须是毫秒时间戳整数，得到 ' + JSON.stringify(v)); break;
    case 'link': case 'duplex': if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.startsWith('rec'))) bad('关联必须是记录 ID 字符串数组'); break;
    case 'person': if (!Array.isArray(v) || v.some((x) => !x || typeof x.id !== 'string')) bad('人员必须是 [{id}]'); break;
    case 'multi': if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) bad('多选必须是字符串数组'); break;
    case 'number': if (typeof v !== 'number' || !Number.isFinite(v)) bad('数字必须是数值'); break;
    case 'checkbox': if (typeof v !== 'boolean') bad('复选框必须是布尔值'); break;
    case 'single': if (typeof v !== 'string') bad('单选必须是选项文本'); if (f.options && f.options.length && !f.options.includes(v)) bad('不是有效选项：' + v); break;
    case 'text': if (typeof v !== 'string') bad('文本必须是字符串'); break;
  }
}

export class FakeBase implements BaseGateway {
  tables: Record<string, Map<string, BaseRecord>> = {};
  log: Array<{ op: string; table: string; n: number; opts?: WriteOpts }> = [];
  failNext: string | null = null;                     // 下一次写入抛这个错误（模拟飞书失败）
  private seq = 0; private auto: Record<string, number> = {};
  private t(table: string) { return (this.tables[table] ??= new Map()); }
  private maybeFail() { if (this.failNext) { const m = this.failNext; this.failNext = null; throw new Error(m); } }
  /** 预置一条记录（主数据：港口、泊位、船舶），返回记录 ID */
  seed(table: TableKey, fields: Record<string, any>, id?: string): string {
    const rid = id ?? 'rec' + String(++this.seq).padStart(6, '0'), f = { ...fields };
    for (const [k, def] of Object.entries(FIELDS[table])) if (def.type === 'autonumber') f[k] = String((this.auto[table + k] = (this.auto[table + k] ?? 0) + 1));   // 预置的记录也占编号，和真实 Base 一致
    this.t(table).set(rid, { record_id: rid, fields: f }); return rid;
  }

  async create(table: TableKey, records: Array<{ fields: Record<string, any> }>, opts?: WriteOpts) {
    this.maybeFail(); this.log.push({ op: 'create', table, n: records.length, opts });
    return records.map((r) => {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(r.fields)) { check(table, k, v); if (!IGNORED.has(FIELDS[table][k].type) && v !== null) fields[k] = v; }
      for (const [k, f] of Object.entries(FIELDS[table])) if (f.type === 'autonumber') fields[k] = String((this.auto[table + k] = (this.auto[table + k] ?? 0) + 1));
      const rid = 'rec' + String(++this.seq).padStart(6, '0'), rec = { record_id: rid, fields }; this.t(table).set(rid, rec);
      return { record_id: rid, fields: { ...fields } };
    });
  }
  async update(table: TableKey, records: BaseRecord[], opts?: WriteOpts) {
    this.maybeFail(); this.log.push({ op: 'update', table, n: records.length, opts });
    for (const r of records) {
      const cur = this.t(table).get(r.record_id); if (!cur) throw new Error('RecordIdNotFound: ' + r.record_id);
      for (const [k, v] of Object.entries(r.fields)) { check(table, k, v); if (IGNORED.has(FIELDS[table][k].type)) continue; if (v === null) delete cur.fields[k]; else cur.fields[k] = v; }
    }
  }
  async remove(table: TableKey, ids: string[]) { this.maybeFail(); this.log.push({ op: 'remove', table, n: ids.length }); for (const id of ids) this.t(table).delete(id); }
  async ids(table: TableKey) { return [...this.t(table).keys()]; }
  count(table: string) { return this.t(table).size; }
  get(table: string, rid: string) { return this.t(table).get(rid); }
  all(table: string) { return [...this.t(table).values()]; }
}
