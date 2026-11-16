# 风格榜升为工作台一级视图

> **状态**：accepted（2026-11-11）
> **决策来源**：用户「webui 里面的风格库，放到工作台里面」→ grill-with-docs R1–R3 逐轮裁决；R3 后用户确认 shared understanding 并授权实施。
> **配套**：ADR-0017:52（被部分推翻）、ADR-0019:13（数据边界）、ADR-0020（一级视图标准）、ADR-0024 选项 F（否决独立页）、ADR-0010（hash 唯一来源）、`CONTEXT.md:201`（已修订）

## 决定

把「官方风格榜」从 `webui/style-library.html` 的第二个 tab 升为工作台第六个一级视图 `#styles-top`（label「风格榜」）。Midlibrary 风格参考码 4,638 条留在独立页不动，独立页与顶栏三项保留；旧 `#/styles-top` 深链改指 `index.html#styles-top`。新视图零筛选。

## 为什么难逆转

hash id 一旦发出即对外 URL 契约；它部分推翻 ADR-0017:52「风格库提为顶栏独立页」；并决定 `CONTEXT.md` 工作台定义、一级视图计数与 `verify-webui.mjs` 断言口径。

## 实施前的事实纠偏

| 预设 | 实测 |
|---|---|
| 风格库页装的是 Midlibrary 风格条目 + 风格参考码 | 实际只装风格参考码 4,638 条（`STYLE_CODES`）与官方风格榜 200 组（`STYLES_TOP_ENTRIES`）；风格条目在 `data-artists.js`，归工作台「艺术家/摄影师」二级页签 |
| 官方榜自带分面筛选、是一套完整应用被压成页签 | `style-library.js:34-39` 的引擎只过滤 `STYLE_CODES`，官方榜完全不走筛选引擎；无增删改/收藏/导出，「应用」=复制 `--sref` |
| 需要为 `#styles-top` 新增 hash 白名单 | `filterSourceOf()` 对无筛选视图返回 null，`applyFilterFromQuery()` / `writeFilterToUrl()` 直接放行/返回（compare / research 同款），无需白名单 |
| 旧 `#/styles-top` 深链可用 | `core.js:919` 用 `location.replace()` 丢掉 hash，而 `styleUi.tab` 又不进 URL ⇒ 深链本来落到默认 codes tab，到不了官方榜 |

## 考虑过的选项

| 选项 | 否决理由 |
|---|---|
| 整页搬（风格参考码 + 官方榜一起进工作台） | 与「Midlibrary 风格库不动」冲突 |
| 按 `CONTEXT.md` 重组（把艺术家页签的风格条目也拉进来） | 改动面超出「放到工作台里」的字面范围 |
| 提示词库下的二级页签 | 官方榜是参照语料，放进假设集会暗示同类，同 ADR-0020 理由 |
| 工作台内非一级面板/抽屉 | 200 组 × 8 题材需要完整陈列空间 |
| 保留双份（独立页 + 工作台） | ADR-0019 否决过的「同一份数据两套界面各活一次」 |
| 旧深链仍指向独立页 | 官方榜 tab 已删，明确断链回归 |
| 给官方榜加搜索 / 题材筛选 | 既存状态是零筛选；加能力属本次需求之外 |

## 后果

- **顶层副作用改由「隔离」而非「重构」解决**：草案原写「`style-library.js:295-301` 必须改三段式」。实施改为新建 `webui/js/styles-top-view.js`（三段式），工作台只加载新模块、**不加载** `style-library.js`；独立页保留自己的顶层自启动（它本来就该自启动）。重复 boot / 覆盖 `#page` / 双份 hashchange 的风险由「不加载」消除，改动更小，且没有动独立页的启动链。
- **独立页清理**：删「官方风格榜」tab 按钮与整条 tab 条（只剩一个 tab 时按钮组无意义）、删头部 3 个官方榜 chip（否则显示幽灵数据）、`role="tabpanel"` 改 `role="region" aria-label="风格参考码"`；`style-library.html` 去掉已不再引用的 `data-stylestop.js`，并同步 description。
- **工作台接线**：`index.html` 补 `data-stylestop.js` + `styles-top-view.js`；`workbench.js` 的 `VIEWS` / `viewCount` / `render()` 四处三元 / `wire` 分支各加一处；`[data-view]` 通用导航与 `filterSourceOf` 无需改。
- **深链修复**：`core.js` 的 `pages['styles-top']` 移除，新增独立的 `key === 'styles-top'` 分支，带 `#styles-top` 跳转；`pages['style-codes']` 不动。同时同步 `:910` 注释。
- **验收断言搬家**：`verify-webui.mjs` 原 `:773-798` 的 5 条官方榜断言从独立页搬到 `index.html#styles-top`（去掉 `#style-tab-top` 点击），新增「风格榜是一级视图」身份断言、「独立页只保留风格参考码」断言、「旧风格榜深链直达」断言与视图零错误断言。
- **`render()` 由五层三元变六层**，可读性下降；按最小实现只加分支、不重构（登记，不视为待修缺陷）。
- **名实不符仍在**：独立页标题叫「风格库」，实际只装风格参考码；`CONTEXT.md` 的「风格库」专指 Midlibrary。按 R2 裁决只登记、不改名。
- **dist/ 不是源码**：`npm run build` 逐文件复制，不需手改；`REQUIRED_HTML` 不动（独立页保留）。

## CONTEXT.md 修订（2026-11-11 同日已落盘）

R3 裁决的修订分两部分。实施时先按「Q14 冻结 + 两项必须原子变更」暂缓；同日用户明确解除冻结并授权后，**一次性落盘**：

1. `CONTEXT.md:201`「五个」→「六个」，列举补「风格榜」（官方参照语料的查阅）。
2. `## 风格榜（styles_top）` 节新增「**风格榜视图**」术语条：工作台的一个一级视图，与「提示词库」「研究样本库」并列，装的是风格榜这一参照语料而非假设集或证据集；`_Avoid_`：风格库、官方风格页、风格码页。

**为什么两项必须同时改**：只加术语条而 `:201` 仍写「五个」，词汇表会自相矛盾 —— 比不改更糟。`README.md` 同步了 dist 文件数（30→31）、verify 断言数（120→125；三轮卡片修复后 126 → 127 → 130）、一级视图计数与列举、新增风格榜功能特性条、风格参考码落点（「页签」→「独立页」）、权威 ADR 链接，并在断言覆盖说明里补上风格榜的 5 组新断言。

**边界**：ADR-0017 Q14 冻结的是它当时记录的三处措辞（`mj-session-v1` 落盘键 / 会话布局 / 探索榜页签序号）。实测这三处已由后续 ADR 陆续修订完毕 —— 现文是 `mj-session-v2`（`:103`、`:117`）、恒为两栏（`:117`）、研究样本库是一级视图（`:173`），本次无需再改；Q14 作为历史记录保留在 ADR-0017 中，其措辞不追溯改写。「`CONTEXT.md` 风格库」节的名实不符仍按 R2 裁决只登记、不改。

## 明确不做

不动 `config/*`、`public/`、`shared/`、`tools/`、`tests/`、采集链、画廊、顶栏三项；不给官方榜加筛选/搜索/题材维度；不删 `style-library.html`；不改 `CONTEXT.md`「风格库」节。`app.css` 原计划不动，实施后因三轮卡片缺陷改了 `.sref-kind-row` 系列与 `.sref-actions` 双按钮样式（见下三节）。

## 验证记录

| 项 | 基线（改动前） | 实施后 |
|---|---|---|
| `npm run verify`（源码） | 120/120 | **130/130** |
| `verify-webui.mjs --dist` | 120/120 | **130/130** |
| `npm test` | 18 文件 / 333 用例 | **18 文件 / 333 用例**（各轮单独重跑均通过；并发/串行同命令跑曾触发 EPERM 收集不全） |
| `npx tsc --noEmit` | 6 个错误 | **6 个错误**（均在 `tests/*.test.ts`，与 ADR-0024 基线一致，零新增） |
| `npm run build` | 30 文件 / 22 JS | **31 文件 / 23 JS / 4 HTML / 7.14 MB** |
| `webui/` ↔ `dist/` 逐文件 sha256 | — | **31/31 完全一致** |
| 4 个 `node --check` | — | 全部通过 |

> 口径说明：本表是 ADR-0026 收尾时（130/130）的全项目快照；[ADR-0027](0027-configurable-photography-prefix.md) 把摄影前缀改为可配置后为 **137/137**，README 同步为 137。历史数字不追溯改写。

新增/改写断言（共 130 条）：一级视图身份、`#styles-top` 直达、官方榜数据源/全量渲染/占位/配图标注/无破图、8 张题材缩略图一行且 200 卡逐卡覆盖、点击缩略图在上方主图切换、视图零错误、独立页只留参考码、旧 `#/styles-top` 深链直达、双功能按钮并排不溢出、套用写进 `--sref` 参数位、复制只进剪贴板不改会话。

**一次非回归失败（如实记录）**：首次把 `verify` / `verify --dist` / `npm test` 三条命令并发跑时，`npm test` 连续 3 次收集不全（17/18，漏 `tests/filterEngine.test.ts`），stderr 为 `EPERM: operation not permitted, open '…/node_modules/.cache/tmp/…/ssr/…'`。这是 ADR-0017:108 已登记的 WorkBuddy fs-shim 环境限制，不是代码回归；**单独重跑 `npm test` 即 18/333 全过**，收集守卫确认完整。结论依赖单独重跑的结果，不依赖那次失败运行。

## 实施后修复：题材小图布局（同日，2026-11-11）

用户反馈「风格榜的卡片展示有问题」。Puppeteer 实测（`file://` 打开 `index.html#styles-top`）：

| 量 | 修复前 | 修复后 |
|---|---|---|
| 首张 `.sref-card` | 233 × 513 | 233 × 353 |
| `.sref-kind-row` 高 | 219 | 59 |
| 4 张题材小图 | 各 207 × 207，x = 13 / 226 / 439 / 652（后 3 张溢出卡片） | 各 47 × 47，x = 13 / 66 / 120 / 173（等宽一行） |

**根因**：`app.css:675` 的 `.sref-kind-row img { width: 100%; aspect-ratio: 1 / 1 }` 在 flex 容器里让每个 `<img>` 都试图占满整行宽；同文件占位版位 `.sref-kind-row .img-plate`（`:850`）本就有 `flex: 1`，真实 `<img>` 漏了这一句。

**修复**（一行）：

```css
.sref-kind-row img { flex: 1 1 0%; min-width: 0; width: 100%; aspect-ratio: 1 / 1; border-radius: var(--r-sm); border: 1px solid var(--border); }
```

`flex-basis: 0%` + `min-width: 0` 让四张图平分可用宽度，`aspect-ratio` 保住正方形，不再拉伸或溢出。

**回归防护**：`verify-webui.mjs` 新增 `kindLayout` 诊断与断言「题材小图平分一行且卡片高度未膨胀」——判据是 4 张图宽度均 > 0 且 < 卡片宽 / 4、最右边界不超卡片、卡片高 < 400。实测 `{"n":4,"cardW":233,"cardH":353,"widths":[47,47,47,47],"maxRight":220}`。

**复验**：`npm run build` → 31 文件 / 7.13 MB / 23 JS / 4 HTML；`npm run verify` 与 `verify-webui.mjs --dist` 均 **126/126**；`npm test` 单独重跑 18 文件 / 333 用例（收集守卫确认完整）；`tsc` 6 个既存错误零新增。

## 实施后修复 2：8 张题材图与点击换主图（同日，2026-11-11）

用户追问「卡片有 8 张示例图，为什么只显示 4 张」，随后裁决「改成一行塞 8 张，点击缩略图可以在上方展示」。上一节的 126/126 是修复 1 完成时的口径；**最终口径见上表（127/127）**。

**为什么原来只有 4 张**：`style-library.js` 的 `styleTopBodyHtml()` 从首次纳入版本控制（commit `f6ab943`）就写着 `imgs.slice(0, 4)`，而同一处的占位文案却是「8 题材样图未随附」。搬进工作台时**原样复制**了这段，不是本次丢数据。数据层始终是 200 组 × 8 题材 = 1,600 张（`STYLES_TOP_IMAGE_STATS.imageFiles = 1600`，每组 `images` 恰好 8 个 key），被截掉的是 `tree` / `house` / `animal` / `street_scene`。

**最终形态**（按用户裁决，替换上一节实施到一半的 4×2 网格方案）：

| 层 | 实现 |
|---|---|
| 渲染 | `styles-top-view.js` 按 `STYLES_TOP_KINDS` 固定顺序取满 8 张，去掉 `slice(0, 4)`；每张是 `<button class="kind-thumb">`，带 `data-kind` / `data-label` / `data-preview-src` / `aria-pressed` |
| 布局 | `app.css` 的 `.sref-kind-row` 改 `grid-template-columns: repeat(8, minmax(0, 1fr))`、gap 4px；实测每张 22px、卡片 233 × 328 |
| 交互 | `wire()` 在 `#library-panel` 上做事件委托（`render()` 每次重建 DOM，委托不会累积；1600 个缩略图不逐个绑定）。点击把该题材图换到 `.sref-main`，同步 alt、`.sref-main-label` 题材名与唯一选中态 |
| 可达性 | 缩略图是 button，键盘可聚焦；`title` + `aria-label` 写明「在上方查看 X 样例」，主图左下角常驻题材名标签 |

主图默认取 `portrait`，与第 1 张缩略图同图，但职责不同（大图预览 vs 题材索引）；按最小改动保留，不额外去重。

**验收（最终口径）**：`npm run verify` 与 `verify-webui.mjs --dist` 均 **127/127**。新增「点击题材缩略图在上方主图展示」断言，实测主图 `..._portrait.webp → ..._still_life.webp`、标签「人像 → 静物」、`active === 1` / `pressed === 1`；「8 张题材缩略图全量排成一行且卡片高度未膨胀」断言覆盖 200/200 张卡，判据 `n === 8`、题材顺序与 `STYLES_TOP_KINDS` 一致、`rows === 1`、每张宽 < 卡宽 / 8、`cardH < 400`。Puppeteer 截图目视确认切换前后无溢出、无裁切、无破图。

**`npm test`**：本轮收集守卫前两次只收到 17/18 文件（304 / 280 用例），第 3 次 18 文件 / 333 用例并判定「收集完整，结果可信」。这是 ADR-0017:108 已登记的 EPERM 环境限制，守卫自动重试已覆盖，不是代码回归；结论取「收集完整」那一次。

## 实施后修复 3：卡片双按钮（同日，2026-11-11）

用户要求把卡片里的单个「复制参考码」按钮改成两个：「套用到工作台」+「复制参考码」。上一节的 127/127 是修复 2 完成时的口径；**最终口径见上表（130/130）**。

**「套用到工作台」不新造机制**：`PARAMETERS` 里早有 `styleRef`（type `input`、param `--sref`、default `""`），`explore-board.js:966-972` 的灯箱「填入 --sref」就是 `session.params.styleRef = code; saveSession(); emitChange(); toast(...)`（ADR-0013 / ADR-0016 契约：风格码是参数，不进「已选提示词」，也不覆盖手动改写的最终提示词）。风格榜沿用同一参数位与同一套调用，不新增会话字段、不新增视图状态、不切视图。

| 按钮 | 行为 | 可见落点 |
|---|---|---|
| 套用到工作台（`btn-primary`，`data-apply-sref`） | 写 `session.params.styleRef` → `saveSession()` → `emitChange()` → toast「已套用 --sref X 到工作台」 | 左栏 Dock 参数摘要出现 `--sref X`、`#p-styleRef` 回填、最终提示词尾部带参数、落盘 `mj-session-v2` |
| 复制参考码（`btn-secondary`，`data-copy-sref`） | `copyText("--sref X", "风格参考已复制")` | 只进剪贴板，会话零改动 |

样式：卡片宽约 233px，默认 `.btn`（13px 字 / 14px padding）会把 6 字文案挤出卡片，故新增 `.sref-actions`（两列 grid、gap 5px）并把按钮压到 11.5px / `padding: 7px 4px` / icon 13px / `white-space: nowrap`。实测两按钮各 101 × 44、`scrollWidth === clientWidth`、`sameRow = true`、`maxRight 220 ≤ cardW 233`；Puppeteer 截图目视确认文案与 icon 完整、无裁切或重叠，8 张缩略图仍是一行。

**边界**：`emitChange()` 由 `core.js` boot 里的 `onChange(() => renderDock())` 接住，只重绘左栏；若用户此前手动改写过最终提示词（`session.manual !== null`），参数仍写入并可在参数摘要看到，但 `finalPrompt()` 沿用改写文本 —— 与既有 `fill-sref` 一致，不擅自丢弃用户手改内容。窄屏下 Dock 是折叠块，套用后不自动展开（既有行为，只登记）。

**验收（最终口径 130/130）**：新增 3 条断言 —— 「风格榜卡片两个功能按钮并排且不溢出」、「套用到工作台把风格码写进 --sref 参数位」（校验 `session.params.styleRef`、`mj-session-v2` 落盘、参数摘要 chip、`#p-styleRef` 值、`finalPrompt()` 尾部、toast）、「复制参考码只复制文本、不改工作台会话」（给 `navigator.clipboard.writeText` 打桩记录实际文本，并比对点击前后 `styleRef`）。实测 `code = 2002855559`，套用后提示词 `photography, a quiet library, morning, soft natural light --v 8.2 --ar 16:9 --sref 2002855559`；复制得 `--sref 2002855559` 且会话未变。断言末尾复位 `styleRef`，避免 `file://` 共享 localStorage 污染后续断言。

`npm run verify` 与 `verify-webui.mjs --dist` 均 **130/130**；`npm test` 单独重跑 18 文件 / 333 用例（守卫第 1 次即收集完整，EXIT=0）；`npm run build` 31 文件 / 7.14 MB / 23 JS / 4 HTML。首次把 dist verify 与 `npm test` 放在同一条命令里串行执行时，`npm test` 又触发 EPERM 收集不全并在重试中被超时打断（ADR-0017:108），单独重跑即通过 —— 与前述非回归失败同一环境限制。

## 回退

删 `webui/js/styles-top-view.js`；`workbench.js` 去掉 `VIEWS` 项、`viewCount` 分支、`render()` 四处分支与 `wire` 分支；`index.html` 去掉 2 个 script 标签；`core.js` 恢复 `pages['styles-top'] = 'style-library.html'` 与注释；`style-library.js` / `style-library.html` 恢复 tab、chip 与 `data-stylestop.js`；`verify-webui.mjs` 把断言搬回独立页；`app.css` 去掉 `.kind-thumb` / `.sref-main-label` 样式并恢复 `.sref-kind-row` 的 4 张布局；`verify-webui.mjs` 去掉 8 图、点击预览与 3 条双按钮断言；`app.css` 去掉 `.sref-actions` 样式；`styles-top-view.js` 恢复单个 `[data-copy-sref]` 按钮并删 `[data-apply-sref]` 分支；重跑 `npm run build`。无数据迁移、无产物格式变更。
