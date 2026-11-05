// tenant_access_token 缓存：提前 5 分钟刷新；并发请求共用同一次刷新。密钥只从调用方传入，绝不打印。
const BASE = 'https://open.feishu.cn/open-apis';

export function createTokenProvider({ appId, appSecret, fetchFn = fetch, now = () => Date.now(), base = BASE }) {
  let cache = { token: null, expiresAt: 0 }, inflight = null;
  return async function getTenantToken() {
    if (cache.token && now() < cache.expiresAt - 5 * 60 * 1000) return cache.token;
    if (!inflight) {
      inflight = (async () => {
        const res = await fetchFn(base + '/auth/v3/tenant_access_token/internal', {
          method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        }).then((r) => r.json());
        if (res.code !== 0) throw new Error('取令牌失败：' + res.code + ' ' + res.msg);          // 错误信息里不带密钥
        cache = { token: res.tenant_access_token, expiresAt: now() + res.expire * 1000 };
        return cache.token;
      })().finally(() => { inflight = null; });
    }
    return inflight;
  };
}
