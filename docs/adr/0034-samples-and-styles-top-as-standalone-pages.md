# 研究样本库 / 风格榜：从工作台一级视图升为顶栏一级独立页

> **状态**：**accepted**（2026-11-16）
> **决策来源**：用户拍板 4 项（见「拍板记录」）
> **相关**：[ADR-0033](0033-artists-library-as-standalone-page.md)（艺术家库独立页，同一路径）、[ADR-0026](0026-styles-top-as-top-level-view.md)（风格榜原为工作台一级视图）、[ADR-0020](0020-research-sample-library-is-top-level.md)（样本库原为工作台一级视图）、[ADR-0010](0010-filter-state-lives-in-url-hash.md)（hash 是筛选状态唯一来源）、[ADR-0017](0017-static-webui-no-backend.md)（纯静态 WebUI）

## 决定

把工作台 `index.html` 的两个一级视图 `#samples`（研究样本库）与 `#styles-top`（官方风格榜）抽出来，做成顶栏一级独立页：

1. **页面** —— 新增 `webui/samples.html` 与 `webui/styles-top.html`。顶栏 label 分别为「样本库」「风格榜」，排在「艺术家库」之后（用户拍板：不插在工作台正后，保留艺术家库紧跟工作台的位置）。最终顺序：工作台 → 艺术家库 → 样本库 → 风格榜 → 画廊 → 风格库 → 风格与类型库。
2. **工作台路标** —— 一级视图切换条末尾留「样本库 ↗」「风格榜 ↗」两个跳转链接（`data-od-id` 分别为 `samples-nav-link` / `styles-top-nav-link`）。
3. **旧链** —— `index.html#samples?...` / `#explore?...` 原样带 query 跳到 `samples.html#samples?...`；`index.html#styles-top` 跳到 `styles-top.html#styles-top`；更旧的 `#/samples` / `#/explore` / `#/styles-top` 由 `core.js` 的 `migrateLegacyHash()` 直接落到新页。`explore.html` 旧重定向页也改指 `samples.html`。
4. **筛选源单一化** —— 样本库筛选白名单从 `workbench.js` 抽到共享模块 `webui/js/explore-filter.js`，工作台（旧链转发期仍需白名单）与 `samples.html` 各加载一次，杜绝两份漂移。短语索引辅助 `phraseIndexOf()` 一并搬入共享模块，改用 `PHRASE_INDEX.shared()`（两页共用一份缓存）。
5. **三段式内容不动** —— `explore-board.js` / `styles-top-view.js` 继续提供 `headHtml / toolbarHtml / bodyHtml / wire`。新页只做「宿主」：`samples.js` 负责 hash 读写与 job 深链（与旧工作台 samples 分支同构），`styles-top-page.js` 只启动 + 渲染 + 接线（零筛选）。
6. **跨页动作** —— 对照视图仍留在工作台。样本库页点「去对照」跨页跳 `index.html#compare?a=…&b=…`；候选词条点出处引用键、研究笔记点作业引用键都跨页跳 `samples.html#samples?job=…`；两处导出文案同步更新。

## 为什么

工作台的一级视图从 7 个涨到 7 个（含 4 个异质数据集），一级视图条在窄屏已接近承载上限。样本库（1,044 条社区作业 + 七段拆解 + 一整套两轴筛选）与风格榜（200 组官方码 + 1,600 张题材图）都是体量巨大、彼此异质、且与「工作台=词库拼装」定位不同的语料，和艺术家库（ADR-0033）一样适合独立成页。

同时，风格库（ADR-0032）、风格与类型库（ADR-0031）、艺术家库（ADR-0033）都已是顶栏页，样本库与风格榜却还是工作台内一级视图，入口层级不一致 —— 本 ADR 把这一层拉齐。

## 拍板记录（用户 4 项决策）

| 议题 | 选项 | 决策 |
|---|---|---|
| 页面形态 | 独立页 + 工作台路标 / 仅顶栏链接 | **独立页 + 路标**（与 ADR-0033 一致） |
| 顶栏标签 | 研究样本库 / 研究样品库 | **样本库**（用户自定义；项目术语「研究样本库」保留在 CONTEXT/README 与页面 h1） |
| 顶栏顺序 | 工作台后立即插入 / 艺术家库后插入 | **艺术家库后插入** |
| 旧链处理 | 自动跳新页 / 保留双入口 | **自动跳新页** |

## 实现要点（源码级）

| 文件 | 改动 |
|---|---|
| `webui/js/core.js` | `NAV` 加两项；`migrateLegacyHash()` 新增 `standalone` 映射（含 query 原样转发） |
| `webui/js/workbench.js` | `VIEWS` 删 `samples` / `styles-top`（7→5）；删 `viewCount` / `render` / `wire` / 筛选灌入的对应分支；`readHash()` 的 `moved` 映射转发旧链；`viewnavHtml()` 末尾加两个路标 |
| `webui/js/explore-filter.js`（新） | 共享筛选源 + `LEGACY_SAMPLES_PARAMS` + `phraseIndexOf()` |
| `webui/samples.html` + `webui/js/samples.js`（新） | 样本库独立页与启动脚本 |
| `webui/styles-top.html` + `webui/js/styles-top-page.js`（新） | 风格榜独立页与启动脚本 |
| `webui/js/explore-board.js` | `jobDeepLink()` 固定指向 `samples.html#samples?job=`；`goCompareNow()` 在独立页跨页跳工作台 |
| `webui/js/candidate-view.js` / `research-view.js` / `compare-view.js` | 跨页跳转改 `location.assign` |
| `webui/js/sample-export.js` / `candidate-export.js` | 导出文案的深链改为 `samples.html#samples?job=` |
| `webui/explore.html` | 旧重定向页改指 `samples.html#samples` |
| `scripts/build-webui.mjs` | `REQUIRED_HTML` 加两页 |
| `scripts/verify-webui.mjs` | 组1 顶栏/路标断言；组3 整组改在 samples.html 跑；组4b 改在 styles-top.html 跑；组6/7/8b 旧链断言改指新页；组9 窄屏视图数 7→5 |

## 兼容与风险

- **job 深链**：`#samples?job=<key>` 格式不变，独立页 `samples.js` 启动时读 hash 并调 `EXPLORE_BOARD.openJobByKey()`，与旧工作台行为一致。
- **筛选复现**：独立页用 `FILTER_ENGINE.parseHash(EXPLORE_FILTER_SOURCE, ...)` 读全部维度（含两轴分类、短语、拆解来源、生成日期），刷新/分享可复现。
- **对照视图**：仍在工作台，从样本库跨页进入；`COMPARE_VIEW` 的 `a/b` URL 契约不变。
- **左栏 Dock**：两个独立页都渲染（与艺术家库一致），风格榜的「套用到工作台」写 `session.params.styleRef` 后立即能在 Dock 看到。
- **既有红**：`verify` 里「拆解缺口归零（第 13 步）」仍失败（73/1044 无拆解），`npm test` 里 `candidateVocab.test.ts` 4 条旧快照失败 —— 均在干净 HEAD 复现，与本次迁移无关，不代改。
