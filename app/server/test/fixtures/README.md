# 测试夹具（自包含）

这些文件是从仓库根目录的 `prototype/`、`docs/` 复制来的，**目的是让 `app/` 单独放在妙搭平台仓库里时 `npm test` 也能跑**（平台仓库里没有 `docs/` 和 `prototype/`）。全部是虚构示例数据或表结构元数据，不含真实业务数据。

| 夹具 | 来源 | 用途 |
| --- | --- | --- |
| `prototype/{engine.js,mock-data.js,assets/nlp.js}` | `prototype/` | 与原型引擎逐项对照的基准（parity、nlp、provenance、预测服务测试）、演示服务的示例数据 |
| `base-plan.json` | `docs/schema/base-plan.json` | 假飞书按它校验写入的字段名与类型 |
| `T02-berths.json` | `docs/schema/seed/T02-berths.json` | 23 个泊位的真实容量种子（核对用） |
| `permission-matrix.md` | 由 `scripts/gen-permission-matrix.ts` 生成 | 权限矩阵文档与代码一致性测试 |

**同步规则**：在有 `docs/`、`prototype/` 的 GitHub 文档仓里，`fixtures-in-sync.spec.ts` 会核对这些夹具与源文件逐字节一致，不一致就失败（提示重新复制）；在平台仓库里没有源文件，这个测试自动跳过。改了源文件（原型引擎、base-plan.json、种子）后，要同时更新这里。
