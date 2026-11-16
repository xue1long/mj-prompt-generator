# 艺术家库：从工作台二级页签升为顶栏一级独立页

> **状态**：**accepted**（2026-11-16）
> **决策来源**：grill-with-docs 会话，用户拍板 14 项（详见「拍板记录」一节）
> **配套**：`CONTEXT.md`（「艺术家库」与「艺术家分类」术语拆分）、`README.md`、`scripts/build-webui-data.mjs`（生成链与守门断言）
> **相关**：[ADR-0032](0032-style-library-facets-and-card-unification.md)（风格库分面与卡片统一）、[ADR-0031](0031-style-types-library-as-standalone-page.md)（风格与类型库独立页）、[ADR-0010](0010-filter-state-lives-in-url-hash.md)（筛选状态在 URL hash）、[ADR-0017](0017-static-webui-no-backend.md)（纯静态 WebUI）、[ADR-0009](0009-style-code-is-a-parameter-not-a-fragment.md)（摄影前缀与艺术家槽位）

## 决定

把「工作台 → 提示词库 → 艺术家 / 摄影师」二级页签抽出来，做成顶栏一级独立页 `webui/artists.html`，与「工作台」并列：

1. **页面** —— 新页 label「艺术家库」，顶栏第 5 入口，紧跟「工作台」。工作台原位置留下「艺术家库 ↗」路标，head 里的艺术家计数也改成指向新页的可点链接。
2. **数据链** —— `config/styles.yaml` → `webui/js/data-artists.js` 建立生成链，构建期加守门断言。此前那份手工产物被严重截断（见下），必须先修才能谈筛选语义。
3. **筛选** —— 维度 `q` / `artistCat`（enum，进 URL）/ `terms`（multi + `groupOf`，组内任一、组间全部）/ `colours`（multi 并集）/ `tested`（bool）。分面板只列实际用到的 68 词 / 87 色。
4. **卡片动作** —— 整卡点击 = 加进提示词（`position:'artist'` 单选槽，摄影前缀 `by <艺术家>` 依赖它），右上角只有「详情」按钮；**没有**「复制」——复制是风格码的动作，不适用于艺术家。
5. **旧链** —— `index.html#artists?...` 原样带 query 跳到 `artists.html#artists?...`；更旧的 `#/artists?...` 同样直达。hash 格式沿用 `#artists?...`，所以旧链不用改写。

## 为什么

工作台的「提示词库」原本有 5 个二级页签（4 个摄影词库分类 + 艺术家）。艺术家是全量 4,322 条的独立数据集，筛选维度（类别 / 分面词 / 主色 / 实测）也比词库分类复杂得多，跟 4 个词库分类并排在同一层会暗示它们同类——这与 [ADR-0024](0024-candidate-vocab-as-top-level-view.md) / [ADR-0026](0026-styles-top-as-top-level-view.md) 把异质数据升为一级视图是同一条理由。

同时，风格库（ADR-0032）与风格与类型库（ADR-0031）已是顶栏独立页，艺术家侧仍是工作台内页签，三份同源数据的入口层级不一致。

## 数据链事故（先讲这个 —— 它推翻了两项中间结论）

动手前的实测发现 `webui/js/data-artists.js` 是**手工产物且系统性地被截断**：

| 字段 | `config/styles.yaml`（源） | `data-artists.js`（旧产物） | 截断规则 | 受影响条目 |
|---|---|---|---|---|
| 条数 | 4,322 | 4,322 | 一致 | — |
| 分面词 | 最多 15 个 | 最多 **6** 个 | 取前 6 | 4,241 |
| 主色 | 最多 9 个 | 最多 **4** 个 | 取前 4 | 4,017 |
| 简介 | 最长 1,580 字符 | 最长 **420** | 截 420 | 4,020 |
| 风格描述 | 最长 452 字符 | 最长 **320** | 截 320 | 4,200 |
| 配图路径 | 4,322 条全有 | 仅 **328** 条 | 3,994 条置 null | 3,994 |

证据：`config/styles.yaml:502-521`（`puuung` 源 11 词 / 6 色）对 `data-artists.js`（同条 6 词 / 4 色）。图片文件**并未丢失** —— ADR-0032 已把 10,140 张同步进 `public/preview-images/tracked/`，只是数据里的路径被抹掉了。

这直接推翻了 grill 第三轮里两个「事实」：所谓「58 词 / 78 色」「328 张带图」都是截断后的假象。修复后真实值是 **68 词 / 87 色 / 4,322 条全有配图**。若按截断数据建分面，用户点一个词只会得到错误结果。

**守门方式**：`scripts/build-webui-data.mjs` 新增 artists 域，把条数、类别数、词色覆盖、配图条数、`terms/colours/intro/observation` 的最大长度全部与源快照钉死。任何再次截断都会在构建期失败，而不是等到界面上才发现。

## 拍板记录（用户 14 项决策）

| 轮次 | 议题 | 决策 |
|---|---|---|
| 1 | 「迁移」是搬走还是复制 | **搬走但留路标**：原位置放「艺术家库 ↗」 |
| 1 | 新页顶栏 label | **艺术家库**（4 字，与「风格库」「画廊」一致） |
| 1 | 卡片点击动作 | **保留加进提示词**（艺术家是会话核心槽位） |
| 1 | 筛选语义 | **对齐引擎分组语义**（声明 `groupOf`） |
| 2 | CONTEXT.md 术语冲突 | **拆两个术语**：「艺术家库」= 独立页；「艺术家分类」= 槽位概念 |
| 2 | 艺术家类别（11 类）进不进 URL | **纳入引擎 enum 维度** |
| 2 | 路标形态 | **页签条末尾跳转按钮**（与页签视觉区分） |
| 2 | 工作台 head 计数 | **改成可点链接**指向新页 |
| 3 | 旧深链 `index.html#artists` | **自动跳到新页** |
| 3 | 排序 | **只做 A→Z**，默认有图在前（数据无创建时间，不编造「最新收录」） |
| 3 | 分面板显示范围 | **只显示实际用到的词 / 色** |
| 3 | 新页头部 | **标题 + 三项统计 + 当前会话艺术家槽位** |
| 4 | 旧链的筛选参数 | **原样带到新页** |
| 5（实施期） | `data-artists.js` 被截断 | **完整修 + 建生成链**（与 ADR-0032 同法） |

## 实现要点

| 文件 | 变更 |
|---|---|
| `webui/artists.html` + `webui/js/artists.js` | 新增独立页；`boot('artists.html')` |
| `webui/js/core.js` | NAV 加第 5 项；`#/artists` 旧契约直达新页 |
| `webui/js/workbench.js` | 删 artists 页签及专属渲染 / 筛选 / 详情代码；加路标与计数链接；显式 `#artists` 重定向 |
| `config/styles.yaml` → `webui/js/data-artists.js` | 生成链（全量字段，无截断） |
| `scripts/build-webui-data.mjs` | artists 域 + 守门断言 |
| `scripts/build-webui.mjs` | `REQUIRED_HTML` 加 `artists.html` |
| `scripts/verify-webui.mjs` | 新增第 15 组；7a-2 改测新页；13b 窄屏扩到三页 |
| `CONTEXT.md` | 「艺术家库」与「艺术家分类」拆分；工作台定义更新 |

**旧链兼容的两道闸**：

1. `core.js` 的 `migrateLegacyHash()` 处理 `#/artists?...`（Vue SPA 时代的契约），直接 `location.replace('artists.html#artists?...')`。
2. `workbench.js` 的 `readHash()` 处理 `#artists?...`（新版页签契约），同样带 query 转发。

第二道闸只能用**显式 `id === 'artists'`** 判定，不能按解析后的 `ui.tab`：工作台首屏无 hash 时 `ui.tab` 默认是第一个词库分类，若按 tab 判定会让首屏直接跳走。

**窄屏实测**（390×844）：5 个入口全部首屏可见、可点、无遮挡；导航内部滚动 13px，文档零溢出。800×600 与 1440×900 无溢出。

## 后果

**正面**：入口层级与另外两个独立页一致；筛选状态（含 11 类类别）刷新 / 分享可复现；4,322 条全有配图；分面计数用引擎整链试算，不再有静态计数误导。

**代价 / 已知限制**：

- `ARTISTS` 全局仍由 `core.js:1026` 的全局搜索面板使用，生成产物的全局名（`ARTISTS` / `TERM_GROUPS` / `COLOURS` / `ARTIST_CATEGORIES`）保持不变。
- 工作台 `LIBRARY_FILTER_SOURCE` 保留了 `tested` / `terms` / `colours` 维度以维持 URL 白名单契约，但已无 UI 入口；这是有意保留，不是漏删。
- 本数据源没有创建时间，所以排序只有「默认（有图在前）」与「A → Z」——不提供风格库那种「最新收录」。
- `npm run verify` 剩 2 条既有红（探索榜拆解缺口 73/1044）、`npm test` 剩 4 条既有红（`candidateVocab.test.ts` 写死旧快照），与 ADR-0031 登记的是同一组，在干净 HEAD 上复测同样红，不夹带修复。
