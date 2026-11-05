# server/ 后端领域层

纯函数、零依赖（Node ≥ 20，ESM），不连飞书、不连数据库。飞书脚手架（`lark-cli apps +init`）生成后，路由、仓储层和定时任务在脚手架里引用这里的模块（见 `docs/development-workflow.md`）。

```bash
cd server && npm test
```

- `config.js`：所有暂定值集中在这里。
- `lib/dates.js`：日期工具，只比较日期。
- `domain/`：状态推导、时序校验、航程规则。
- `engine/`：容量（CMR / 同期船数）、库存断料、推荐（Plan A/B）、宣船文案。
- `test/parity.test.js`：与原型引擎（`prototype/engine.js`）逐项对照。原型有意的改动要同时改两边。
