// 平台角色成员目录：把「谁有 SSPS 的哪个平台角色」「这个人的姓名、飞书企业内 user_id、部门」读出来并缓存。
// 数据来自平台权限 SDK（AuthorizationSDK.members.list）。所有要用 SSPS 的人都必须在某个 SSPS 角色里，所以角色成员列表就是用户目录。
// 注意：没有在真实平台上验证过（云端连不到平台），字段形状按 SDK 类型定义写，联调时核对（任务书 W15）。

export interface PlatformUser { userId: string; name: string; employeeId: string | null; deptName: string | null }

/** SDK 里用到的最小接口，测试里用假的 */
export interface MembersSdk {
  members: { list(bizID: string, params?: { type?: 'User'; page?: number; pageSize?: number }): Promise<{ members: { userList?: Array<{ userID?: string; name?: Record<string, string>; employeeID?: string; department?: { name?: Record<string, string> } }> }; total: number; hasMore: boolean }> };
}
/** 多语文本取一个：优先中文，其次英文，其次随便一个 */
const pickText = (t?: Record<string, string>) => (t ? t.zh_cn ?? t['zh-CN'] ?? t.zh ?? t['2052'] ?? t.en_us ?? t['en-US'] ?? t.en ?? Object.values(t)[0] ?? '' : '');

export interface UserSource {
  /** 按平台用户 ID 查；缓存里没有时会刷新一次（有最短刷新间隔，防止未知用户反复打平台接口） */
  get(userId: string): Promise<PlatformUser | null>;
}

export function createRoleMemberSource(sdk: MembersSdk, roleBizIds: string[], o: { ttlMs?: number; minRefreshMs?: number; now?: () => number } = {}): UserSource {
  const ttl = o.ttlMs ?? 5 * 60_000, minRefresh = o.minRefreshMs ?? 30_000, now = o.now ?? Date.now;
  let cache = new Map<string, PlatformUser>(), loadedAt = -Infinity, inflight: Promise<void> | null = null;
  async function refresh() {
    const next = new Map<string, PlatformUser>();
    for (const bizId of roleBizIds) {
      for (let page = 1; ; page++) {
        const res = await sdk.members.list(bizId, { type: 'User', page, pageSize: 200 });
        for (const u of res.members?.userList ?? []) if (u.userID) next.set(u.userID, { userId: u.userID, name: pickText(u.name) || u.userID, employeeId: u.employeeID || null, deptName: pickText(u.department?.name) || null });
        if (!res.hasMore) break;
      }
    }
    cache = next; loadedAt = now();
  }
  const load = () => (inflight ??= refresh().finally(() => { inflight = null; }));
  return {
    async get(userId) {
      if (now() - loadedAt > ttl) await load();
      let u = cache.get(userId) ?? null;
      if (!u && now() - loadedAt >= minRefresh) { await load(); u = cache.get(userId) ?? null; }
      return u;
    },
  };
}
