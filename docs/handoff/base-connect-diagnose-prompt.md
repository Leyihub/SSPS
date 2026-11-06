# 排查提示词：飞书应用调用多维表格返回 NOTEXIST（2026-11-06）

用途：把下面「提示词」整段交给本机另一个 AI（要能执行命令）。它只做只读排查，把原因和修复步骤报告出来。不改任何数据、不改仓库、不提交。

## 已知事实（不用重查）

- 飞书应用：`cli_aa2584bb95f89bef`，名称「德信智慧海运」，与妙搭应用 `app_17heqwc44fd` 是同一个飞书应用，也是 `lark-cli` 当前登录用的应用。
- 多维表格「德信智慧航运主数据」，地址形如 `https://dlsteelgroup.feishu.cn/base/<令牌>?table=tbl5POTzcu79CO66&view=...`（是 `/base/`，不是 `/wiki/`）。`tbl5POTzcu79CO66` 就是配置里的 T04 航次主表。
- `.env.local`（`C:\Users\董金\ssps-miaoda\.env.local`）里的 `BITABLE_APP_TOKEN` 与地址栏里 `/base/` 后面那串**逐字一致**（27 位）。
- 用 `.env.local` 里的 `LARK_APP_ID` / `LARK_APP_SECRET` 取 `tenant_access_token`：**成功**。
- 用这个令牌 `GET /open-apis/bitable/v1/apps/{令牌}` 和 `.../tables`：都返回 **code 91402 NOTEXIST**（HTTP 400）。把它当知识库节点 `GET /open-apis/wiki/v2/spaces/get_node` 返回 131005 not found。
- 在飞书里打开这个 Base →「文档应用」，搜索到「德信智慧海运」，右侧显示**「已授予可管理权限」**。
- 这个 Base 顶部显示**密级 L3**；路径是「德龙钢铁产业集团 > 刘浩阳 > 德信智慧航运主数据」；最近修改：2026-11-05 21:36。
- 2026-11-05 有过一份建表报告（`docs/schema/base-build-report-2026-11-05.md`），当时建出了 T01–T10 的表，用的是什么身份（应用 / 用户）没有记录。
- 开放平台里该应用已开通 `bitable:app`、`base:app:create` 等，待开通：`contact:user:search`、`contact:contact.base:readonly`；「刷新 user_access_token」未开启。

## 提示词（整段复制）

```text
你是排查工程师。目标：弄清楚为什么飞书自建应用「德信智慧海运」(cli_aa2584bb95f89bef) 用 tenant_access_token 调多维表格接口返回 91402 NOTEXIST，尽管这个应用在该 Base 的「文档应用」里已被授予「可管理」权限，并给出让它恢复可用的具体修复步骤。

背景与已知事实见仓库文件 C:\Users\董金\WorkBuddy\SSPS\docs\handoff\base-connect-diagnose-prompt.md 的「已知事实」一节，请先读它，已知的不要重复验证。

硬性规则：
1. 全程只读。不要创建、修改、删除任何多维表格数据、表、字段、权限、协作者、文档设置；不要改 .env.local；不要 git commit / push；不要发布应用；不要改开放平台设置。
2. 绝不打印、记录、写入文件任何密钥或令牌：LARK_APP_SECRET、tenant_access_token、user_access_token、BITABLE_APP_TOKEN 的值都不要出现在输出里（只说「已设置」，或只显示前 4 位和长度）。App ID（cli_ 开头）可以显示。
3. 从 C:\Users\董金\ssps-miaoda\.env.local 读取 LARK_APP_ID、LARK_APP_SECRET、BITABLE_APP_TOKEN，只在代码里用，不回显。
4. 在 Windows PowerShell（普通窗口，不要用管理员窗口，否则 lark-cli 会报 dpop_key_missing）里操作。接口域名用 https://open.feishu.cn。
5. 每条结论要附证据（接口、状态码、错误码、错误信息原文）。查不出来就说查不出来，不要猜。

排查步骤（按顺序，能得出结论就提前停）：
A. 确认同一个令牌在「用户身份」下能不能访问：用 lark-cli（user 身份）读这个 Base 的元信息和数据表列表（先 lark-cli base --help / lark-cli schema 看有哪些只读命令）。若缺 base 相关 scope，只报告缺哪个，不要自己去扩大授权。目的：证明 Base 本身存在、令牌正确，问题只在「应用身份」。
B. 用应用的 tenant_access_token 调云空间接口看这个文档应用能不能「看见」它：
   - POST /open-apis/drive/v1/metas/batch_query，request_docs=[{doc_token: <BITABLE_APP_TOKEN>, doc_type: "bitable"}]，看返回的元信息或失败原因；
   - GET /open-apis/drive/v1/permissions/<BITABLE_APP_TOKEN>/public?type=bitable（需要对应权限，缺就报告缺哪个）；
   - 对照文档说明（https://open.feishu.cn/document/ 搜「多维表格 错误码 91402」「文档应用 授权」「密级标签 安全标签 API 访问」）确认 91402 在「有授权却仍返回」时的含义。
C. 检查「密级 L3」：飞书文档的密级/安全标签是否会限制应用（tenant 身份）通过 OpenAPI 访问？查官方文档并用 lark-cli（drive 域的 secure labels 相关只读命令，见 lark-cli drive --help）读出这个 Base 的密级设置。若结论是「L3 会阻止应用访问」，写清楚要改成什么、由谁（文档所有者/管理员）改。
D. 检查文档归属与位置：路径显示在「刘浩阳」名下。确认文档所有者是谁、是否在知识库（wiki）空间中、是否被移动/转移过（2026-11-05 21:36 有过修改）。若在知识库里，说明应用要加到知识库空间成员里才行，给出具体步骤。
E. 检查应用侧：这个应用的 bitable 相关权限是否已「发布到线上生效」（开放平台里创建并发布了版本），而不是只勾选。用 lark-cli api 或文档里的应用权限接口只读核对，核对不了就说明需要在开放平台页面看什么。
F. 看看 2026-11-05 建表报告（docs/schema/base-build-report-2026-11-05.md）和 docs/schema/base-build-agent-prompt.md，判断当时建表用的是应用身份还是用户身份。如果当时只用过用户身份，说明应用身份从来没真正通过，这一点要明确写出来。

输出格式（中文，面向非程序员的产品负责人，结论在前）：
1. 一句话结论：根本原因是什么（有把握 / 没把握）。
2. 证据：每个关键判断对应的接口、状态码、错误信息。
3. 修复步骤：用「你在飞书页面上点哪里」的方式写，一步一步，标明谁来做（Leyinet / 租户管理员 / 文档所有者）。
4. 修好后如何验证：给出一条只读命令或检查方法，期望看到什么。
5. 没查清的部分和需要 Leyinet 补充的信息。
不要写入任何文件，直接在对话里输出。
```
