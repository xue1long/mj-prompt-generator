# 风格库：补分面筛选 + 卡片形态与「风格与类型库」对齐

> **状态**：**accepted**（2026-11-16）
> **决策来源**：grill-with-docs 会话，用户拍板 13 项（详见「拍板记录」一节）
> **配套**：`CONTEXT.md`（风格库分面 / 风格码卡片术语层）、`docs/风格库筛选方案.md` 第十二节（落地记录）、`README.md`、`webui/js/style-library.js`
> **相关**：[ADR-0031](0031-style-types-library-as-standalone-page.md)（风格与类型库独立页）、[ADR-0009](0009-style-code-is-a-parameter-not-a-fragment.md)（风格参考码是参数不是片段）、[ADR-0010](0010-filter-state-lives-in-url-hash.md)（筛选状态在 URL hash）、[ADR-0017](0017-static-webui-no-backend.md)（纯静态架构）、[ADR-0030](0030-materials-library-persisted-and-baked.md)（单一图片命名空间）

## 决定

把「风格库」页（`webui/style-library.html`，Midlibrary 风格参考码 4,638 条）从「只有一个搜索框 + 一套独立 code-* 卡片样式」改造成与「风格与类型库」页**同源同法**的页面：

1. **补分面筛选** —— 分面词（10 组 66 词，带实时计数）+ 主色（95 色，带实时计数），语义沿用「组内任一、组间全部」；另加「只看实测」「只看精选」两个开关与 A→Z / 最新收录两个排序项。
2. **卡片形态统一** —— 改用 `artist-card` / `artist-pick` / `artist-body` / `artist-thumb` / `artist-more` 这套与艺术家侧、类型库页**共用的 CSS**，右上角两个小按钮（详情 / 复制），整卡点击 = 复制 `--sref <码>`。
3. **数据链修复** —— `config/styles.yaml` → `webui/js/data-stylecodes.js` 建立**生成链**，构建期加守门断言。此前 `data-stylecodes.js` 是手工产物且已被截断（详见「数据链事故」一节）。
4. **配图统一入库** —— 两页的配图统一指向入库目录 `public/preview-images/tracked/`，并把全量图复制进去（10,140 张 / 204.5 MB）。

## 为什么

风格库页原本是全项目唯一「只有一个筛选维度」的页面，而且卡片是**另一套** `code-*` 样式（`research-view.js` / `styles-top-view.js` / `core.js` 全局搜索面板仍在用这套 class，所以**保留不删**）。这造成两个具体问题：

1. **同一份数据两种呈现**：用户从「风格与类型库」页过来，预期同样的分面面板、同样的卡片形态、同样的右上角双按钮；实际却是另一套界面。
2. **能力缺失**：上游 `midlibrary.io/library` 的风格码视图有分面词 / 主色 / 只看实测 / 编辑精选 / 搜索 / 排序，本地只有搜索。原先「完全应用原页面的筛选过滤器」这个需求在风格码这一支上没落地。

## 拍板记录（用户 13 项决策）

| 轮次 | 议题 | 决策 |
|---|---|---|
| 1 | 风格码卡片整卡点击该做什么 | **整卡 = 复制**；右上角两个按钮改成「详情 + 复制码」 |
| 1 | 只有 120/4,638 有参考图怎么办 | **全部 4:3，无图就空着**（后被上游事实修正为 1:1，见下） |
| 1 | 分面要补到什么范围 | **全维度对齐**（含编辑精选） |
| 2 | 分面词筛选语义 | **沿用组内任一 / 组间全部** |
| 2 | 主色筛选语义 | **多选取并集（OR）** |
| 2 | 卡片缺「简介」行 | **补风格描述字段**，充当地图简介行 |
| 3 | `data-stylecodes.js` 是手工产物且已截断 | **完整修：yaml 补字段 + 建生成脚本** |
| 3 | 修好数据链后 4,638 条都有 preview 路径 | **同步全部 4,638 张** |
| 3 | 排序要不要加「最新收录」 | **加**（口径 = 创建时间倒序） |
| 4 | 类型库页的 1,180 张图指向 gitignored 目录 | **两页统一入库到 `tracked/`** |
| 5 | 分面面板显示哪些分面词 | **只显示实际有数据的 66 词** |
| 5 | 主色面板显示哪些色 | **只显示实际用到的 95 色** |
| 6 | 上游缩略图实测是 320×320 **正方形** | **保持 1:1 正方形**（不裁切） |

## 数据链事故（先讲这个 —— 它推翻了一整批中间结论）

动手前实测发现 `webui/js/data-stylecodes.js` 是**手工产物且已被截断**：

| 字段 | 手工产物 | 源（`config/styles.yaml` / 上游） |
|---|---|---|
| `terms` | 恒为 4 个 | 5~18 个 |
| `colours` | 恒 ≤3 个 | 1~9 个 |
| `preview` | 只有 120 条 | 4,638 条 |
| `isPick` | 全丢 | 554 条 |
| `tested` | 3,949 条但与源对不上 | 3,949 条 |
| `observation` | 全丢 | 4,638 条 |
| `createdAt` | 全丢 | 4,638 条 |

**基于截断数据得出的所有结论都是假象**，包括：

- 「每条恰好 4 个分面词」→ 实际每条跨 **3~10 组**；
- 「跨 2 组词对筛空率 47.5%」→ 实际只有 **15.6%**；
- 「`detailed ∧ characters ∧ vivid-colors` 三词交集 0 条」→ 实际 **1,738 条**。

**修复**：`tools/build-styles.ts` 的 `buildStyles()` 新增 `intro` / `observation` / `createdAt` 三个字段并重建 `config/styles.yaml`；`scripts/build-webui-data.mjs` 新增 `styles.yaml` 输入、`data-stylecodes.js` 产物与**构建期守门断言**（条数 / 组数 / 色数 / 未知词 / 未知色 / tested / pick / 有描述 / 有时间，全部与源快照对齐）。

这条事故的教训写进流程：**产物文件不能手工维护** —— 一旦有人手改，断言只能发现「与源不符」，发现不了「源本身是否可信」；所以断言必须逐字段对齐源。

## 筛选维度与语义

全部由统一筛选引擎（`webui/js/filter-engine.js`）承载，URL hash 是唯一状态源（ADR-0010）：

| 维度 | 类型 | 说明 |
|---|---|---|
| `q` | 自由文本 | 搜风格名或风格码 |
| `terms` | 多选（**带分面组**） | 66 个分面词，10 组 |
| `colours` | 多选 | 95 个主色，多选取并集 |
| `tested` | 开关 | 只看实测（3,949 条） |
| `pick` | 开关 | 只看精选（554 条） |

**排序不进引擎白名单**：排序是**显示顺序**不是「收窄条件」，所以 `sort=new` 会被引擎记进 `ignored`（不静默忽略）但**不影响筛选条数**；页面自己用正则单独解析 `sort` 参数并自己拼进 hash。这条分工有单测守着（`tests/filterEngine.test.ts` 的「排序参数不参与筛选」3 例）。

### 「组内任一、组间全部」在完整数据下撑得住

| 语义 | 条数 |
|---|---:|
| 上游平铺 AND（`expressive ∧ illustrative ∧ scenes`） | **353** |
| 本项目「(expressive ∨ illustrative) ∧ scenes」 | **1,675** |

同组两词 `expressive ∨ illustrative` = 3,038 条；跨组两词 `expressive ∧ scenes` = 794 条。

**分面计数**沿用分组维度的整链试算口径：「选项上的数字 = 在当前条件基础上再打开该项会得到的条数」。verify 里逐项断言面板计数 == 页内现算。

### 「最新收录」的口径

上游排序下拉含 `Newly tested`（按**实测时间**排），但实测时间在源快照与上游 payload 里都不存在 —— 是服务端行为，快照复刻不了。**冒名顶替会让用户误判「这个码最近被验证过」**。

唯一可溯源的时间事实是条目 ULID 里的**创建时间**（`items.json`，4,638/4,638 可解，范围 2024-12-06 → 2026-10-25）。所以排序项叫「最新收录」，详情弹层标注「收录于 YYYY-MM-DD（按创建时间，非实测时间）」。

## 卡片形态

改用与类型库页**同一套** `artist-*` class，不再另起 `code-*` 样式：

```
<article class="artist-card" data-od-id="code-card-<id>">
  <button class="artist-pick" data-copy-sref="<码>">     ← 整卡 = 复制 --sref
    <span class="artist-thumb"><img …><span class="badge">实测</span></span>
    <span class="artist-body">
      <span class="artist-name">…</span>
      <span class="artist-meta">--sref <码></span>
      <span class="artist-intro">…风格描述…</span>        ← 充当地图简介行
      <span class="swatches">…</span>
    </span>
  </button>
  <button class="artist-more" data-detail="<id>">…</button>   ← 详情
  <button class="artist-more" data-copy="<id>">…</button>     ← 复制码
</article>
```

CSS 只加了一条让位规则（两个按钮都要占右上角）：

```css
[data-od-id^="code-card-"] .artist-more[data-copy] { right: 42px; }
```

**没有「加进提示词」** —— 风格码是 `--sref` 的**参数取值**，不是提示词片段，按 ADR-0009 不进会话的 `other` 槽。详情弹层里的动作是「复制 `--sref <码>`」+ 上游回链。

### 缩略图 1:1（实施期修正）

最初按 `.artist-thumb` 的 `aspect-ratio: 4/3` 写卡片。但实测发现那行 CSS 是**死代码** —— 被 `img { width:100%; height:100% }` 覆盖，实际渲染 231×231。

四种实验后结论：**上游缩略图本身就是 320×320 正方形**，所以 1:1 才是正确版位：

| 实验 | 结果 |
|---|---|
| `.artist-thumb{flex:none}` | 仍 1:1 |
| `flex:0 0 auto` | 仍 1:1 |
| 把 `aspect-ratio` 挪到 img 上 | 231×173，但**裁掉上下各 12.5%** |
| **保持 1:1**（用户拍板） | 不裁切，且「两页一样」目标已达成 |

随即删掉失效的 `aspect-ratio` 声明，并给 `.artist-thumb.is-plate`（无图时的排版版位）补 `aspect-ratio: 1/1`。

## 配图入库

上游 CDN 直连 403，图必须从隔壁仓复制到本地。此前两个目录：

| 目录 | 性质 | 数量 |
|---|---|---|
| `public/preview-images/midlibrary/` | **生成物**（gitignored） | 10,140 张 / 204.5 MB |
| `public/preview-images/tracked/` | **入库**（前端实际引用） | 原 448 张 → 现 **10,140 张** |

**真实缺陷**：类型库页的 `preview` 指向 gitignored 的 `midlibrary/` —— **clone 之后 1,180 张图全丢**。本轮统一改为指向 `tracked/`，并让 `tools/sync-style-images.ts` 的第二步把全部 kind 的图复制进 `tracked/`（幂等：>1KB 跳过）。

三方 id（风格码 / 类型条目 / 艺术家）**零交集、文件名零冲突**。

## 具体落地

| 项 | 内容 |
|---|---|
| 改动 | `webui/js/style-library.js` —— 整体重写（242 → ~500 行）：筛选源、URL 往返（含 `sort`）、分面面板、卡片、详情弹层 |
| 改动 | `webui/css/app.css` —— `code-*` 卡片右上角双按钮让位；`.artist-thumb` 去掉失效 `aspect-ratio`；`.is-plate` 补 1:1 |
| 改动 | `tools/build-styles.ts` —— `StyleCode` 新增 `intro` / `observation` / `createdAt`；`buildStyles()` 接 `ulidsBySlug`；`renderStylesFile` 接 `itemsPath` |
| 改动 | `scripts/build-webui-data.mjs` —— `styles.yaml` 输入与校验；`data-stylecodes.js` 产物 + 守门断言；`pickImage()` 新增 `midlibrary` 分支 |
| 改动 | `tools/sync-style-images.ts` —— 第二步：把 `SYNCED_KINDS` 的图复制进 `tracked/`（幂等） |
| 重建 | `config/styles.yaml`（10.4 MB）、`webui/js/data-stylecodes.js`（3.69 MB）、`webui/js/data-types.js` |
| 新增 | `public/preview-images/tracked/` **9,692 张**（总计 10,140 张 / 204.5 MB） |
| 改动 | `scripts/verify-webui.mjs` —— 新增第 14 组「风格库独立页」**39 条断言**；13b 窄屏回归扩到两页 |
| 改动 | `tests/filterEngine.test.ts` —— 新增 3 例「排序参数不参与筛选」（66 → 69） |
| 改动 | `CONTEXT.md` / `README.md` / `docs/风格库筛选方案.md` | 术语层、生成链、落地记录 |

## 考虑过的选项

| 选项 | 否决理由 |
|---|---|
| **风格码也加「加进提示词」** | 风格码是 `--sref` 参数取值，不是提示词片段（ADR-0009）；塞进 `other` 槽会产出 `--sref 3383230063` 这种无效提示词 |
| **保留独立的 `code-*` 卡片样式** | 用户明确要「改成和风格与类型库一样」；两套样式会让同一份数据有两种呈现 |
| **把分面词全列出来（含没数据的上游词表）** | 68 词里只有 66 个被风格码用到；列出来点了必然空 |
| **沿用上游的平铺 AND** | 三词只剩 353 条（对比本项目 1,675），等于把库筛空 |
| **排序项叫 "Newly tested"** | 实测时间在快照与 payload 里都不存在，冒名顶替会误导用户 |
| **缩略图按 4:3 裁切** | 实测上游图是 320×320 正方形；裁切会切掉画面上下 12.5% |
| **把 `midlibrary/` 整个目录入库** | 那是生成物（10,140 张 / 204.5 MB），会与「采集链产物不入库」的既有约定冲突；入库的是前端实际引用的 `tracked/` |

## 后果

- **风格库页从「一个筛选维度」变成「五个维度 + 两个排序」**，与类型库页能力对等。
- **`config/styles.yaml` 从「人工快照」变成「生成物」**：重新采集上游后跑 `npm run build:styles` 即可重建，不需要手工维护 4,638 条。
- **`public/preview-images/tracked/` 从 448 → 10,140 张（+204.5 MB）**：仓库体积显著增长。代价是 clone 变慢；收益是 clone 之后不跑任何采集链也能看到全部配图（这正是类型库页此前的真实缺陷）。
- **`data-stylecodes.js` 从 1.1 MB → 3.69 MB**（terms / colours / observation / createdAt 完整化）。
- **`code-*` CSS class 保留**：全局搜索面板（`research-view.js` / `styles-top-view.js` / `core.js`）仍在用，本轮不动它们。

## 验证记录（2026-11-16）

| 项 | 结果 |
|---|---|
| `npx vitest run tests/filterEngine.test.ts` | **69/69 通过**（新增 3 例「排序参数不参与筛选」） |
| `npm run build` | 通过 |
| `npm run verify` | **258/260**；新增第 14 组 **39 条全通过** |
| `npm run build:styles` | 风格参考码 4,638 / 分面词 68 / 主色 96 / 分面覆盖 100% / 有风格描述 4,638 / 有创建时间 4,638 |
| `npm run build:webui-data` | 风格库 4,638 / 有配图 4,638 / 分面词组 10 / 分面词 66 / 主色 95 |
| `npm run sync:style-images` | 复制 0 张 · 跳过 10,140 张 · 源站缺 0；`tracked/` 复制 9,692 张（195.6 MB）· 跳过 448 张 |

### 与本次改动无关的既有红，登记不代改

`npm run verify` 剩 2 条 FAIL，都在**探索榜拆解**上：`tests/candidateVocab.test.ts` 与 verify 的拆解断言写死了旧快照数字，而 `config/explore.yaml` 已被采集更新 —— 当前「待精拆」为 **73 条**（`3+50+918+73 = 1044`）。这与 [ADR-0031](0031-style-types-library-as-standalone-page.md) 登记的既有红是**同一组**，数字也一致。

**在干净的 HEAD 上复测同样是这 2 条红** —— 与本次改动无关。修它需要单独裁决（补跑拆解链 vs 放宽断言），本 ADR 不夹带。本轮也**没有**把后台采集产物（`config/explore.yaml` / `data-explore.js` / `data-stylestop.js` / `data-materials.js`）混进提交 —— 它们被恢复到了 HEAD 状态。

## 明确不做的事

- 不给风格码加「加进提示词」（ADR-0009）。
- 不动 `code-*` CSS class 与全局搜索面板（`research-view.js` / `styles-top-view.js` / `core.js`）。
- 不引入上游的 `like`（收藏）维度 —— 那是账号态，服务端行为。
- 不补跑探索榜拆解链、不改 `config/explore.yaml`（它由每日采集自动更新）。
- 不删 `public/preview-images/midlibrary/`（生成物，仍是采集链的落地位置）。
