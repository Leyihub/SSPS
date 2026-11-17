# SSPS Design System v2 · Warm Paper / Ink

生效日期：2026-11-15。替换 2026-11-05 锁定的深蓝 ERP 视觉基线（原 `CLAUDE.md` 第 25 行已同步改写）。

本次是**纯样式层重构**：不改任何 JS / TSX 业务逻辑、不改 DOM 结构、不改字段与状态、不加新交互控件。原型与 React 应用共用的类名全部保留，只替换外壳、配色、字阶、组件皮肤与断点。按项目汇报口径，**目前没有任何功能上线**。

---

## 1. 设计语言定位

参考仪表盘的三个关键判断，构成后续所有取舍的依据：

1. **暖中性纸感，不是软件蓝。** 整体几乎无饱和色，靠「表面明度 + 1px 细线」分层，不靠色块。原型站把应用做成浮在陶土色画布上的圆角「纸」，React 嵌入态全屏铺满。
2. **墨黑是唯一强调色。** 主按钮、当前值、选中态、Logo 一律 `#1a1a18`；绿色 / 砖红只用于趋势与逾期，不用于装饰。
3. **编辑式信息密度。** 大数字是第一视觉锚点，卡片遵循「眉标 → 结论 + 数字 + 趋势 + 微图表 → 细线页脚」三段式；用字重、字号、灰度建立层级，用灰阶（浅灰=过去 / 墨黑=当前 / 斜纹=预测）编码时间维度。

## 2. Design Token

单一源定义在 `prototype/assets/app.css` 的 `:root`，与 `app/client/src/ssps/ssps.css` 逐行一致（仅外壳配置不同）。同时 `app/client/src/tailwind-theme.css` 的 shadcn token 已改为相同色值，消除加载顺序带来的差异。

| 类别 | Token | 值 | 用途 |
|---|---|---|---|
| 表面 | `--bg` / `--page` | `#faf9f6` | 页面底 |
| | `--sidebar` | `#f1eee9` | 侧栏 |
| | `--card` / `--surface` | `#ffffff` | 卡片、浮层 |
| | `--surface-2` / `-3` | `#f5f3ee` / `#ece8e0` | 次级填充、hover |
| | `--line` / `--line-2` / `--line-strong` | `#e6e2da` / `#efebe4` / `#d8d3ca` | 分隔线 |
| 文本 | `--ink` / `--text` | `#1a1a18` / `#2a2926` | 主标题、正文 |
| | `--muted` / `--faint` | `#8a857d` / `#aaa49a` | 辅助、眉标 |
| 强调 | `--primary` | `#1a1a18` | 主按钮、选中、链接（**兼容旧变量名**，由蓝改墨黑） |
| | `--primary-bg` / `--primary-hover` | `#f1eee9` / `#35342f` | 选中底、hover |
| 语义 | `--ok` / `--ok-bg` | `#2f7d55` / `#eef4ef` | 正向趋势 |
| | `--warn` / `--warn-bg` | `#c0452f` / `#faeeea` | 负向、逾期 |
| | `--caution` / `--caution-bg` | `#a86a2e` / `#f8f1e6` | 提醒、原型标识 |
| | `--info` / `--info-bg` | `#4a6b8a` / `#eef2f5` | 中性状态 |
| 图表 | `--bar-past` / `--bar-now` / `--hatch` | `#c9c5bd` / `#1a1a18` / 斜纹 | 过去 / 当前 / 预测 |
| 形状 | `--radius` / `--shadow` / `--focus` | `8px` / `0 1px 2px rgba(26,26,24,.04)` / 2px 墨黑环 | 圆角、阴影、焦点 |
| 字体 | `--font` / `--mono` | Inter → 系统中文字体栈 / 等宽栈 | 不加载外部字体，离线可用 |

## 3. 字阶与排版

1. 大数字 KPI：32px / 500 / `letter-spacing:-.035em` / tabular-nums。
2. 页面标题：22px / 600 / `-.025em`；卡片标题 12.5px / 600。
3. 正文：12–13px / 400 / `line-height:1.5`。
4. 眉标与页脚：10px / 500 / 全大写 / `letter-spacing:.14em`，用 `·` 分隔，右侧带 `→` 链接。
5. 全局 `font-variant-numeric:tabular-nums`，数字列对齐；层级靠字重与灰度，不靠颜色。

## 4. 可复用组件契约

现有类名（`.card` `.card-h` `.card-b` `.btn` `.tag` `.st` `.tbl` `.tabs2` `.inp` `.seg` `.chipf` `.mask` `.modal` `.tip` 等）**全部保留原语义**，只换皮肤，现有页面无需改动即可生效。

新增 `.ds-*` 组件类供后续页面直接使用，不依赖任何业务 DOM：

- 结构：`.ds-card` / `.ds-head` / `.ds-body` / `.ds-foot` / `.ds-grid`
- 数据：`.ds-eyebrow` / `.ds-kpi` / `.ds-trend`（`.up` / `.down`） / `.ds-spark`（`i.now` / `i.future`）
- 控件：`.ds-seg` / `.ds-dot`（`.ok` / `.warn` / `.info`） / `.ds-kbd`

交互一律「轻反馈」：hover 只让边框略深或底色微变，选中只让字变粗，浮层统一白底细边框轻阴影；不引入大阴影、渐变或强动效。

## 5. 布局与响应式

1. 外壳 `grid-template-columns:196px minmax(0,1fr)`；已移除旧 `body{min-width:1440px}`，改为流式。
2. 断点：`1440`（侧栏收窄）、`1100`（三列变两列、隐藏次要时间）、`900`（侧栏抽屉化、单列、卡片可横向滚动、表格最小宽 600px）、`640`（全部单列、按钮触控目标 ≥36px、输入框全宽、弹窗底部贴合）。
3. 各页面专属 CSS 里存在 4/5/6 列固定栅格，共享样式末尾用一条 `!important` 兜底规则在窄屏改为 `repeat(auto-fit,minmax(...))`；7 列日历 `.cal` 不参与，保持 7 列。
4. 原型展示态（`prototype/`）：`--canvas:#a6634a`、圆角 16px 应用窗口、外边距 28px。React 嵌入态（`app/client/`）：`--canvas` 与页面同色、无圆角无边距无阴影。两份文件**只允许这 5 个外壳变量不同**。

## 6. 不参与换肤的业务语义色（硬规矩）

以下内容在 `CLAUDE.md` 已锁定，本次**原样保留**，任何后续换肤都不允许改动：

1. CMR 四档色阶 `--c1-*` ~ `--c4-*`（≥50% / 30–50% / 15–30% / <15%），容量指标只用 CMR。
2. 「无数据」灰色斜线 `--stripe`（`repeating-linear-gradient`），绝不显示为 0%；`.nd` / `.tag.nodata` / `plan.noplan` 的斜纹语义不变。
3. `.tag.lowtrust` 低可信标签、`.sx` 删除线状态、状态标签 `.s0`–`.s7` 的区分度。
4. 规则引擎输出的数值、字段与状态名——本次未触及任何数据层。

## 7. 文件落点

| 文件 | 变更 |
|---|---|
| `prototype/assets/app.css` | 设计系统单一源（重写） |
| `app/client/src/ssps/ssps.css` | 同一份内容，仅 5 个外壳变量改为嵌入态 |
| `app/client/src/tailwind-theme.css` | shadcn `:root` token 同步为新色值 |
| `prototype/*.html`（12 个） | 内联样式 / SVG / JS 字符串里的旧色值归一化 |
| `app/client/src/pages/*/*.css`、`*.tsx` | 页面专属样式与内联图形色值归一化 |
| `prototype/assets/*.js`、`app/client/src/ssps/*.tsx` | 运行时生成的图形颜色归一化 |
| `prototype/index.html`、`P02-prediction-v2.html` | 自包含页面补齐 `:root` token（标记 `/* ds-v2-tokens */`） |
| `scripts/apply-design-tokens.mjs` | 一次性迁移 + 幂等复现脚本 |
| `prototype/assets/skin.css` | **皮肤层**（三套皮肤 token 与组件覆盖 + 切换器样式） |
| `app/client/src/ssps/skin.css` | 与上一行完全一致的副本 |
| `prototype/assets/shell.js` | 右上角切换器渲染、交互、皮肤持久化 |
| `app/client/src/components/SkinSwitch.tsx` | React 侧同一套切换器 |
| `scripts/apply-skin.mjs` | 给 13 个页面接入 `skin.css` 与首屏初始化脚本（幂等，可升级旧脚本） |
| `scripts/apply-dark-safety.mjs` | 把页面级写死的暖纸色值换成 token（幂等，为暗色皮肤铺路） |
| `scripts/check-contrast.mjs` | 从 CSS 解析三套皮肤 token 并计算 WCAG 对比度 |
| `scripts/shot-skin.mjs` | 多皮肤对照截图与样式探针 |
| `scripts/shot-midnight.mjs` | 夜墨渲染验证：截图 + 运行时文字对比度探针 + 溢出检测 |
| `CLAUDE.md` | 第 25 行视觉基线条款改写 |

未改动：`C:\Users\董金\ssps-miaoda`（平台开发主线）、`server/`、`shared/`、任何 API / 数据 / 状态逻辑。

## 8. 皮肤系统（Paper / Midnight / Legacy）

**机制**：皮肤只切换 `<html data-skin>` 的取值，`paper`（暖纸，默认）、`midnight`（夜墨）、`legacy`（2025 版深蓝 ERP）各由一份 token 表驱动。全部覆盖集中在 `skin.css`，不进 `app.css`，因此共享样式仍是单一源、仍只差 5 个外壳变量。三套皮肤**共用同一份 DOM、布局、间距、断点与交互逻辑**。

| 项 | 取值 |
|---|---|
| 属性 | `<html data-skin="paper">` / `data-skin="midnight"` / `data-skin="legacy"` |
| 持久化 | `localStorage['ssps-skin']`，缺省 `paper` |
| 首屏防闪烁 | 各页 `<head>` 内联脚本（标记 `data-skin-init`）在样式解析前落属性；React 在 `index.tsx` 首次渲染前落属性 |
| 入口 | 右上角下拉：`暖纸 · 墨黑` / `夜墨 · 纸白` / `经典 · 深蓝`，当前项打勾 |
| 交互 | 点击展开、点选生效、点外部或 `Esc` 关闭；窄屏 ≤640px 只留图标 |

### 8.1 夜墨（Midnight）配色映射

夜墨是「暖纸 · 墨黑」的**同构暗色版**：只替换颜色，不动任何尺寸、间距、栅格、圆角、字阶与断点。下表是 `paper → midnight` 的完整 token 映射（左侧为暖纸当前值，右侧为新皮肤值）。

| 元素 / 用途 | Token | 暖纸 | 夜墨 |
|---|---|---|---|
| 外壳画布（原型展示底） | `--canvas` | `#a6634a` 陶土 | `#0a0908` 近黑 |
| 页面底 / 顶栏 | `--bg` `--page` | `#faf9f6` | `#141311` |
| 侧栏底 | `--sidebar` | `#f1eee9` | `#0e0d0b` |
| 卡片底 | `--card` | `#ffffff` | `#1b1a17` |
| 控件 / 浮层 / 输入框 | `--surface` | `#ffffff` | `#232220` |
| 弱一级表面（表头、悬停） | `--surface-2` | `#f5f3ee` | `#201f1c` |
| 强一级表面（按下、选中） | `--surface-3` | `#ece8e0` | `#2b2926` |
| 常规边框 | `--line` | `#e6e2da` | `#2c2a26` |
| 细分隔线 | `--line-2` | `#efebe4` | `#232120` |
| 强边框（输入、按钮） | `--line-strong` | `#d8d3ca` | `#3b3934` |
| 主文字 / 标题 / 大数字 | `--ink` | `#1a1a18` | `#ece9e2` |
| 正文 | `--text` | `#2a2926` | `#d8d3c9` |
| 次要文字 / 说明 | `--muted` | `#8a857d` | `#a09a8e` |
| 微标签 / 脚注（10px 大写） | `--faint` | `#aaa49a` | `#908a7d` |
| 反白字（落在实心块上） | `--on-ink` | `#ffffff` | `#141311` |
| 主按钮底 / 强调实心块 | `--primary` | `#1a1a18` | `#ece9e2` 纸白 |
| 主按钮悬停 | `--primary-hover` | `#35342f` | `#fffdf6` |
| 强调浅底（选中项、图表高亮） | `--primary-bg` | `#f1eee9` | `#262420` |
| 强调文字 | `--primary-fg` | `#1a1a18` | `#ece9e2` |
| 强调描边 | `--primary-line` | `#1a1a18` | `#3b3934` |
| 侧栏两端 | `--nav-1` `--nav-2` | `#f1eee9` `#ece8e0` | `#0e0d0b` `#141311` |
| 成功 / 充裕 | `--ok` / `--ok-bg` / `--ok-line` | `#2f7d55` / `#eef4ef` / `#cfe2d5` | `#6fbf95` / `#16241d` / `#2d4a3a` |
| 警示 / 逾期 | `--warn` / `--warn-bg` / `--warn-line` | `#c0452f` / `#faeeea` / `#edd2c9` | `#f0806a` / `#2a1613` / `#5c2e26` |
| 强警示文字 | `--warn-strong` | `#a33724` | `#ff9f8c` |
| 注意 / 临期 | `--caution` / `--caution-bg` / `--caution-line` | `#a86a2e` / `#f8f1e6` / `#e8dcc4` | `#e2ab70` / `#2a2015` / `#4f3c23` |
| 信息 / 计划口径 | `--info` / `--info-bg` / `--info-line` | `#4a6b8a` / `#eef2f5` / `#d6e0e8` | `#9ab7d4` / `#171e26` / `#2f3f4f` |
| 图表：过去 | `--bar-past` | `#c9c5bd` | `#4d4a45` |
| 图表：当前 | `--bar-now` | `#1a1a18` | `#ece9e2` |
| 图表：未来 / 预测底 | `--bar-future` | `#e3dfd7` | `#2e2c28` |
| 图表：预测斜纹 | `--hatch` | 浅米底 + 灰斜线 | `#1b1a17` + `#6a6560` 斜线 |
| 卡片阴影 | `--shadow` | `rgba(26,26,24,.04)` | `rgba(0,0,0,.45)` |
| 浮层阴影 | `--shadow-pop` | `rgba(26,26,24,.14)` | `rgba(0,0,0,.66)` |
| 聚焦环 | `--focus` | `rgba(26,26,24,.16)` | `rgba(236,233,226,.28)` |
| 外壳投影 | `--shell-shadow` | `rgba(60,32,20,.24)` | `rgba(0,0,0,.55)` |
| 模态蒙层 / 抽屉蒙层 | `.mask` `.navmask` | `rgba(26,26,24,.4)` | `rgba(0,0,0,.62)` |
| 头像底 / 头像字 | `.avatar` | 墨黑底 + 白字 | `#2b2926` 底 + `#ece9e2` 字 |
| ⓘ 帮助点 | `.i` | 浅灰底 + 白字 | `#3b3934` 底 + `#ece9e2` 字 |
| 无数据标签文字（底色仍是浅灰斜线） | `.nd` `.tag.nodata` | `--muted` | `#3f3c37` |
| 无数据格内小标签底 | `.cell.nd i` `.cell.nd small` | `rgba(255,255,255,.85)` | `rgba(20,19,17,.84)` + 浅字 |
| 自包含页顶栏 | `.top` | 墨黑 / 白字 | `#0e0d0b` / `#ece9e2` |

**页面内联 SVG**（不改任何 JS，仅用属性选择器）：`#1a1a18 → #ece9e2`、`#35342f → #a8a29a`、`#c9c5bd → #4d4a45`、`#d8d3ca → #3b3934`、`#c0452f → #f0806a`、`#2f7d55 → #6fbf95`、`#fff → #141311`。

**刻意不换的部分**：CMR 四档 `--c1-*`~`--c4-*`、`--stripe` 灰色斜线、`.tag.lowtrust` 的低可信语义、`.sx` 删除线。因此夜墨下容量日历仍是「深色画布 + 浅色数据格」——这是业务色阶优先于主题色的结果，不是漏改。

### 8.2 夜墨对比度实测

> 2026-11-17 修复：夜墨下次要文字曾几乎不可见。原因是 `skin.css` 夜墨的 shadcn 补充段把 `--muted` 重定义成了弱化底色 `#201f1c`（shadcn 的含义），因排在后面而覆盖了前一段的次要文字色 `#a09a8e`（SSPS 样式的含义）。已删掉那一条重定义（两份 `skin.css` 同步）。当时的实测之所以通过，是因为 `scripts/check-contrast.mjs` 只读取第一段定义；脚本已改为按出现顺序合并同一皮肤的全部段落并忽略注释，把错误写法加回去时会报「最低 1:1」。遗留：`app/client/src/tailwind-theme.css` 里暖纸的 `--muted:#f5f3ee` 与 `ssps.css` 的 `--muted:#8a857d` 是同一个命名冲突，React 侧哪个生效取决于加载顺序，尚未处理。

由 `node scripts/check-contrast.mjs` 从 CSS 真实 token 计算，WCAG 2.1 相对亮度公式，正文门槛 4.5:1、大字 3:1：

| 组合 | 前景 on 背景 | 对比度 | 判定 |
|---|---|---|---|
| 正文 / 页面底 | `#d8d3c9` on `#141311` | 12.45:1 | AAA |
| 正文 / 卡片 | `#d8d3c9` on `#1b1a17` | 11.67:1 | AAA |
| 标题 / 大数字 | `#ece9e2` on `#141311` | 15.31:1 | AAA |
| 次要文字 / 页面底 | `#a09a8e` on `#141311` | 6.64:1 | AA+ |
| 次要文字 / 卡片 | `#a09a8e` on `#1b1a17` | 6.22:1 | AA+ |
| 微标签 / 卡片 | `#908a7d` on `#1b1a17` | 5.07:1 | AA |
| 主按钮字 / 主按钮底 | `#141311` on `#ece9e2` | 15.31:1 | AAA |
| 成功 / 页面底 | `#6fbf95` on `#141311` | 8.45:1 | AAA |
| 警示 / 页面底 | `#f0806a` on `#141311` | 7.07:1 | AAA |
| 注意 / 页面底 | `#e2ab70` on `#141311` | 9.10:1 | AAA |
| 信息 / 页面底 | `#9ab7d4` on `#141311` | 8.93:1 | AAA |
| 语义色 / 各自浅底 | 见 `--ok-bg` 等 | 6.54–8.08:1 | AA+ |
| 无数据标签 / 灰斜线 | `#3f3c37` on `#f6f7f9` | 10.24:1 | AAA |
| CMR 四档（不变） | 原配色 | 5.43–8.05:1 | AA+ |

**结论**：夜墨 30 组检查全部通过 AA，最低 5.07:1。运行时逐元素探针（`scripts/shot-midnight.mjs`）在 P01/P02/P04/P06/P11/index 六页、1600 / 860 / 390 三档视口下扫描实际渲染文字，低于门槛的元素为 **0**。

参照：暖纸皮肤的 `--muted` / `--faint` 实测为 3.48:1 / 2.35:1（原始编辑式设计的低对比取舍），本次未改动；夜墨把这两档提升到 6.64:1 / 5.41:1。

**legacy 皮肤覆盖范围**（全部在 `skin.css` 内，选择器一律带 `[data-skin="legacy"]` 前缀）：

1. token：表面/文本/强调/语义/图表/形状/字体整体回到 2025 基线（`#eef1f5` 底、`#26394f→#203348` 导航、`#1677ff` 主色、10px 圆角、更实的投影）。
2. 外壳：取消陶土画布与圆角窗口，全屏铺满，侧栏 208px。
3. 侧栏：深蓝渐变底、白色文字、3px 左侧蓝条选中、分组标签取消大写。
4. 组件：按钮中/主按钮改蓝底白字、页签恢复蓝色下划线、表头取消大写与字距、卡片内边距回到 16px、大数字恢复 700 字重、提示气泡改深色底。
5. 页面内联 SVG：把墨黑描边映射回品牌蓝、砖红映射回警示橙（用属性选择器 `svg [stroke="#1a1a18"]`，不改动任何 JS）。
6. 响应式：断点内重新复位栅格与内边距——桌面 208px 列的声明特异性高于 `app.css` 的 `@media`，不在断点里复位会让窄屏残留侧栏列宽。

**不可换肤**：CMR 色阶、`--stripe` 无数据斜线、低可信标签、状态标签语义，两套皮肤下逐字相同。

## 9. 迁移脚本

`node scripts/apply-design-tokens.mjs`：把旧蓝色 ERP 硬编码色值映射为新 token，拉平渐变、把冷蓝 rgba 阴影转为暖中性、保护 CMR 变量定义行、给两个自包含页面注入共享 `:root`。脚本**幂等**，可重复运行（新色值白名单 + 注入标记），输出替换统计与未映射色值清单。

显式映射表覆盖 120+ 旧色值；未登记的色值按明度 / 饱和度兜底归入暖中性或低饱和语义色，因此不会出现视觉死角。

`node scripts/apply-skin.mjs`：给 `prototype/` 下 13 个页面接入 `skin.css` 与首屏初始化脚本；已存在 `data-skin-init` 时只升级脚本内容（支持 `paper` / `midnight` / `legacy`），幂等。

`node scripts/apply-dark-safety.mjs`：把页面级写死的暖纸色值（`#fff`、`#f5f3ee`、`#1a1a18` …）替换为对应 token。暖纸下取值完全相同，所以零视觉回归；夜墨下由 token 统一接管，避免白底白字。跳过 `:root` 定义行、CMR、`--stripe` / `--hatch`、SVG 属性与纹理渐变。

`node scripts/check-contrast.mjs`：解析 `app.css` 与 `skin.css` 的真实 token，按 WCAG 2.1 计算 30 组前景/背景对比度；夜墨低于 AA 时退出码非 0。

`node scripts/shot-midnight.mjs [skin]`：截图 + 运行时探针——遍历有直接文本的元素，取其计算色与最近不透明祖先背景，按字号/字重选择 4.5 或 3.0 门槛，输出低于门槛的清单；同时报告 `scrollWidth` 与越界元素数。

## 10. 验收清单

1. 旧主色 `#1677ff` / `#26394f` / `#e6f4ff` 等零残留（`legacy` 皮肤层内除外——那里是刻意的还原）。
2. 两份共享样式 `diff` 结果只有 5 行外壳配置差异；两份 `skin.css` 完全一致。
3. 自包含页面所有 `var(--x)` 引用都有对应定义。
4. CMR 四档色阶与 `--stripe` 定义逐字未变。
5. 900px / 640px 下无横向溢出，侧栏抽屉可用，表格可横向滚动。
6. 业务逻辑、字段、状态、路由、API 零改动。
7. 三套皮肤在 390 / 860 / 1600 三档视口下 `scrollWidth == clientWidth`、越界元素 0；切换后刷新仍保持所选皮肤；切换器在 390px 收缩为图标且不挤压顶栏。
8. 夜墨与暖纸的 DOM / 布局 / 间距 / 断点完全一致：`skin.css` 中 `[data-skin="midnight"]` 规则**只出现颜色、阴影、边框色**，不出现 `width` / `height` / `padding` / `margin` / `grid` / `font-size` 等几何属性。
9. 夜墨对比度：`node scripts/check-contrast.mjs` 全部 ≥AA（最低 5.07:1）；运行时文字探针 0 处低于门槛。
