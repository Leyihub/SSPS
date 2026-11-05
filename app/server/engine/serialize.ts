// 把引擎结果转成可以直接 JSON 返回的形状：Set 转数组；库存物料项只保留摘要（不带整条序列）。
const isSet = (v: unknown) => Object.prototype.toString.call(v) === '[object Set]';

export function toApiResult(res: any) {
  return JSON.parse(JSON.stringify(res, (k, v) => {
    if (isSet(v)) return [...(v as Set<unknown>)];
    if (v && typeof v === 'object' && Array.isArray(v.series) && 'daily' in v) {
      return { name: v.name, type: v.type, stock: v.stock, daily: v.daily, days: v.days, validUntil: v.validUntil ?? null };
    }
    return v;
  }));
}
