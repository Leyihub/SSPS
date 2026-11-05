// 多维表格封装：读按 500 条分页；写按 500 条切批，经单线程队列串行；限流类错误转成可重试。
// 密钥与令牌只在这里使用，不进日志。
import { RetryableError } from './queue';

const BASE = 'https://open.feishu.cn/open-apis';
const RATE_LIMIT_CODES = new Set([99991400, 1254290, 1254291]);   // 请求过于频繁 / 写入冲突，值以飞书文档为准，联调时核对

/**
 * @param {object} o { getToken, appToken, tableIds:{T01:'tbl…'}, queue, fetchFn?, base? }
 */
export function createBitable({ getToken, appToken, tableIds, queue, fetchFn = fetch, base = BASE }) {
  const tid = (key) => { const id = tableIds[key]; if (!id) throw new Error('没有配置表 ' + key + ' 的 table_id'); return id; };
  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const token = await getToken();
    const res = await fetchFn(base + '/bitable/v1/apps/' + appToken + path, {
      method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) throw new RetryableError('飞书限流（HTTP 429）');
    const json = await res.json();
    if (json.code !== 0) {
      if (RATE_LIMIT_CODES.has(json.code)) throw new RetryableError('飞书限流：' + json.code + ' ' + json.msg);
      throw new Error('飞书接口错误 ' + json.code + '：' + json.msg);
    }
    return json.data;
  }
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const BATCH = 500;

  return {
    /** 读整张表（每页 ≤500 条）；读不经过写队列 */
    async listAll(key) {
      const out = []; let pageToken = '';
      do {
        const data = await call('GET', '/tables/' + tid(key) + '/records?page_size=' + BATCH + (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : ''));
        out.push(...(data.items || [])); pageToken = data.has_more ? data.page_token : '';
      } while (pageToken);
      return out;
    },
    /** 批量新增：records = [{ fields }]；按 500 条切批，全部经写队列串行 */
    batchCreate: (key, records) => queue.enqueue(async () => {
      const ids = [];
      for (const part of chunk(records, BATCH)) ids.push(...((await call('POST', '/tables/' + tid(key) + '/records/batch_create', { records: part })).records || []).map((r) => r.record_id));
      return ids;
    }),
    /** 批量更新：records = [{ record_id, fields }] */
    batchUpdate: (key, records) => queue.enqueue(async () => {
      for (const part of chunk(records, BATCH)) await call('POST', '/tables/' + tid(key) + '/records/batch_update', { records: part });
      return records.length;
    }),
    batchDelete: (key, recordIds) => queue.enqueue(async () => {
      for (const part of chunk(recordIds, BATCH)) await call('POST', '/tables/' + tid(key) + '/records/batch_delete', { records: part });
      return recordIds.length;
    }),
  };
}
