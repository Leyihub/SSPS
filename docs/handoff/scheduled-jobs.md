# 定时任务清单（W31）

定时任务用妙搭平台的**自动化触发器**：`app/server/modules/admin/jobs.automation.ts` 里每个任务方法用 `@BindTrigger('名称[cron 表达式]')` 声明，应用启动时自动向平台的 trigger-server 注册，到点由平台回调应用（`POST /innerapi/automation/invoke`），不走前端、不需要令牌。这是 `@lark-apaas/nestjs-trigger` 文档给出的做法；`PlatformModule.forRoot()` 已经带上了自动化模块。

每个任务自己吞掉异常，只记日志；会写运行日志（D09，系统管理页「同步日志」可见）的有：云空间拉取、航程重算、兼容表刷新。系统管理员也可以在页面或接口手动触发同样的动作。时间按 IMIP 当地时间（WITA，UTC+8）设计，**平台触发器的 cron 用什么时区需要在真实环境确认**（如果是 UTC，把表达式的小时往前挪 8 小时）。

| 触发器 | 动作 | cron | 手动触发的接口（系统管理员） |
| --- | --- | --- | --- |
| cronPullBerthPlan | 从云空间拉取新的靠船计划 | `*/30 * * * *` | `POST /api/berth-plans/pull` |
| cronReplay | 补偿「飞书已写成功、镜像回写没做完」的记录 | `*/5 * * * *` | `POST /api/admin/replay` |
| cronCompatDirty | 兼容表增量刷新（航次保存过才刷） | `*/10 * * * *` | `POST /api/admin/compat/refresh` |
| cronCompatFull | 兼容表 T09a/T09b 全量重写 | `50 15 * * *` | 同上 |
| cronRecomputeRoutes | 航程规则重算（样本数、P50/P80） | `0 3 * * *` | `POST /api/route-rules/recompute` |
| cronIssueScan | 数据质量扫描（缺 MMSI、ETA 超期未更新） | `0 8 * * *` | `POST /api/data-issues/scan` |

云空间拉取需要环境变量 `LARK_APP_ID`、`LARK_APP_SECRET`、`DRIVE_FOLDER_TOKEN_BERTH_PLAN`，没配置时这个任务只记一条警告日志；兼容表刷新需要飞书多维表格配置（`BITABLE_*`）。

**还没有的**：库存文件的云空间拉取（库存目前只有手动上传）；同步防覆盖的核对任务（见任务书 W16）。
