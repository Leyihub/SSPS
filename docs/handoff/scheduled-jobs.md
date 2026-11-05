# 定时任务清单（W31）

后端已经写好这些内部接口，都接受两种调用：系统管理员登录后手动触发，或定时任务带请求头 `x-internal-token`（值 = 环境变量 `INTERNAL_JOB_TOKEN`；没配置这个变量时定时调用一律被拒绝）。接口都可以重复触发：同一份云空间文件按 token 去重，补偿只补没做完的，兼容表按行就地覆盖，扫描不重复生成问题。每次运行在「系统管理 → 同步日志」里留记录。时间按 IMIP 当地时间（WITA，UTC+8）。

| 任务 | 接口 | 建议频率 | 说明 |
| --- | --- | --- | --- |
| 拉取云空间靠船计划 | `POST /api/berth-plans/pull` | 每 30 分钟 | 需要环境变量 `DRIVE_FOLDER_TOKEN_BERTH_PLAN`、`LARK_APP_ID`、`LARK_APP_SECRET`；没配置返回 503 |
| 补偿重放 | `POST /api/admin/replay` | 每 5 分钟 | 把「飞书写成功、回写镜像没做完」的记录补完，返回补了几条和积压数量 |
| 兼容表增量刷新 | `POST /api/admin/compat/refresh?onlyIfDirty=1` | 每 10 分钟 | 航次保存过才刷，否则立刻返回 skipped |
| 兼容表全量刷新 | `POST /api/admin/compat/refresh` | 每日 15:50 | 兜底（待刷新标记只在进程内存里） |
| 航程规则重算 | `POST /api/route-rules/recompute` | 每日 03:00 | 样本数、P50/P80 |
| 数据质量扫描 | `POST /api/data-issues/scan` | 每日 08:00 | 缺 MMSI、ETA 超期未更新的生成与自动关闭 |

**这些触发器要在真实环境里建**（`lark-cli apps +automation-create`，在你的本机执行），云端建不了。本机提示词见 `docs/local-tasks-prompts.md` 的提示词 8。建好之前，这些任务可以由系统管理员在页面或用 curl 手动触发。

**还没有的**：库存文件的云空间拉取（库存目前只有手动上传）；同步防覆盖的核对任务（见任务书 W16）。
