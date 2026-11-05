// 平台用户 ↔ 显示名 ↔ 飞书用户 ID。航次的「负责业务员」在镜像表里只有平台用户 ID，页面要显示姓名；
// 往多维表格写人员字段要飞书侧的 ID。真实实现用平台权限 SDK（nestjs-authzpaas）的用户信息，见任务书 W15。
export interface UserLookupPort {
  names(userIds: string[]): Promise<Record<string, string>>;
  /** 飞书侧用户 ID（企业内 user_id）；查不到返回 null，调用方就不写人员字段 */
  feishuUserId(userId: string): Promise<string | null>;
}
