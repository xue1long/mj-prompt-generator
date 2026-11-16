# 风格与类型库：独立页（而非工作台一级视图）

> **状态**：**accepted**（2026-11-16）
> **决策来源**：grill-with-docs 会话，用户拍板 `Q1-A / Q2-A / Q3-A / Q4-A / Q5-A`
> **配套**：`CONTEXT.md`（风格与类型库术语层）、`docs/风格库筛选方案.md` 第十一节（落地记录）、`README.md`、`webui/js/filter-engine.js` 3a（多组维度）
> **相关**：[ADR-0009](0009-style-code-is-a-parameter-not-a-fragment.md)（风格参考码是参数不是片段）、[ADR-0010](0010-filter-state-lives-in-url-hash.md)（筛选状态在 URL hash）、[ADR-0020](0020-research-sample-library-is-top-level.md)（一级视图准入标准）

## 决定

把 Midlibrary 上游 16 个分类里「条目类型类」的 4 个 —— `genres-art-movements`（流派与艺术运动）、`general-modifiers`（通用修饰）、`techniques`（技法）、`titles`（标题），共 **1,180 条** —— 搬成本地**独立页** `webui/style-types.html`（「风格与类型库」）。

**不**挂进工作台一级视图（`VIEWS`），**不**做二级页签。它与「风格库」平级，靠顶栏 NAV 进入。

上游第 5 个条目类型类 `sref-styles`（风格参考码 4,638 条）留在「风格库」页，不重复收录。

## 为什么是独立页而不是一级视图

工作台的一级视图是**研究闭环的七个角色**（假设集 / 证据集 / 对质 / 对照 / 产出 / 参照语料 / 自采资料），见 `CONTEXT.md` 的「工作台」与 ADR-0020 的一级视图准入标准（一级视图 = 异质的数据集）。

风格与类型库**不属于任何一个角色** —— 它是一份**词库**，跟「风格库」是同一层级的两个平行词库页。挂进 `VIEWS` 会：

1. 破坏「一级视图 = 研究角色」这条语义；
2. 要改窄屏断言（`verify-webui.mjs` 的 `visible === 7`）；
3. 让 8 个一级视图挤进 390px 首屏 —— 而实测第 9 组正是为此写了「一级视图按钮首屏必须全可点」的断言。

用户拍板时选的就是独立页。

## 与「风格库」的分工（数据同源，语义不同）

两批数据来自**同一份** `manifest.json`，但语义不同，故分两页：

| | 风格库 | 风格与类型库 |
|---|---|---|
| 回答的问题 | 谁画的 | 画成什么样 |
| 内容 | 风格条目 4,322 + 风格参考码 4,638 | 类型条目 1,180 |
| 会话槽位 | 艺术家（单选互斥）/ 风格参考码（参数位） | 其他（**多选累加**） |
| 上游第 5 个条目类型类 | sref-styles 在本页 | 不重复收录 |

一句话：**风格条目指认作者，类型条目只描述画面属性。** 类型条目走 `other` 槽（用户拍板），多条可叠加成 `photography, Rangoli, Lath art --v 8.2`。

## 上游的三个硬约束

1. **不能 iframe 嵌。** `X-Frame-Options: SAMEORIGIN` + `CSP: frame-ancestors 'self'`。筛选器必须在本地重做 —— 这正是需求的核心（"完整应用原页面的筛选过滤器"）。
2. **图片 CDN 直连 403。** 必须从隔壁仓复制到本地 `public/preview-images/midlibrary/`（1,180 张 / 23.7 MB，源站缺 0 张）。`mid/`（175 MB）本次不引入。
3. **上游排序含服务端行为。** 见「排序口径」一节。

## 筛选维度

全部由统一筛选引擎（`webui/js/filter-engine.js`）承载，URL hash 是唯一状态源（ADR-0010）：

| 维度 | 类型 | 说明 |
|---|---|---|
| `q` | 自由文本 | 搜名称（中英文） |
| `cat` | 单选 | 4 个二级分类 |
| `terms` | 多选（**带分面组**） | 65 个分面词，10 组 |
| `colours` | 多选 | 87 个主色 |
| `tested` | 开关 | 只看实测（83 条） |
| `publicDomain` | 开关 | 只看公有领域（876 条） |

分面覆盖 100%（65/65 词、87/87 色有数据）；65 个分面词与 87 个主色的中文名由既有 `TERM_LABELS` / `COLOUR_PREFIX` / `COLOUR_BASE` 全覆盖，无需新增词表。

## 筛选语义：不照搬上游的平铺 AND

上游把 10 个分面组**压平成一个 AND 池**（组只是 UI 排版）。本项目沿用既有约定「组内任一、组间全部」。

实测对照（`expressive`、`illustrative` 同属风格质量组，`scenes` 属主题组）：

| 语义 | 条数 |
|---|---:|
| 上游平铺 AND（`a ∧ b ∧ c`） | **37** |
| 本项目「(a ∨ b) ∧ c」 | **160** |

同组两词 `expressive ∨ illustrative` = 483 条；跨组两词 `expressive ∧ scenes` = 125 条。

**引擎侧改动**：`filter-engine.js` 的 multi 维度新增可选的 `groupOf(value)` 声明。声明后按组切分选中值，逐组判或、跨组判与；未声明则退回原行为（该维度所有取值取或）—— **向后兼容**，艺术家侧的 `terms` 维度没有 `groupOf`，行为不变。

分面计数在分组维度上改用「把候选值加进它所属组后，整条筛选链的结果条数」口径。

## 排序口径的决策

上游排序下拉 6 项：`Most used / Most liked / A → Z / Newest Picks / Newly tested / Shuffle`。

本项目只做两项：`A → Z`（上游同名项）与 `最新收录`。

**`最新收录` ≠ 上游的 `Newly tested`**：后者按**实测时间**排，而实测时间在源快照与上游 payload 里都不存在（`testedAt` / `tested_at` / `testedDate` 出现 **0 次**），是服务端行为，快照复刻不了。冒名顶替会让用户误判「这个条目最近被验证过」。

**创建时间从哪来**：隔壁仓 `sites/midlibrary/data/items.json` 每条带真实 ULID（如 `01HAQT5PE0JH9ZJQVH2CT9VX4X`），前 10 位是 Crockford Base32 编码的 48 位毫秒时间戳，解出即条目创建时间 —— 覆盖 **1,180 / 1,180**，范围 2022-11-13 → 2025-02-07。

所以排序项叫「最新收录」，详情弹层里标注「收录于 YYYY-MM-DD（按创建时间，非实测时间）」。

## 会话动作

两个按钮，用户钦定：

- **复制提示词** —— 复制该条目的英文写法。
- **加进提示词** —— 进会话的 **`other` 槽**（多选累加），不触发艺术家的单选互斥。

整卡点击 = 加进提示词（与艺术家侧一致）。

## 具体落地

| 项 | 内容 |
|---|---|
| 新增 | `webui/style-types.html` —— 独立页骨架（含会话 Dock，与 `style-library.html` 同构） |
| 新增 | `webui/js/style-types.js` —— 筛选源、URL 往返、分面面板、卡片、详情弹层、会话动作 |
| 新增 | `webui/js/data-types.js` —— 构建期生成物（1.38 MB） |
| 新增 | `config/types.yaml` —— 类型库快照（生成物，勿手改） |
| 改动 | `webui/js/filter-engine.js` —— multi 维度新增可选 `groupOf`；`counts()` 分组分支；导出 `multiMatches` |
| 改动 | `webui/js/core.js` —— `NAV` 新增入口（第 4 个） |
| 改动 | `tools/build-styles.ts` —— 新增 ULID 解码、类型库快照生成（`renderTypesYaml` / `renderTypesFile`） |
| 改动 | `tools/sync-style-images.ts` —— `SYNCED_KINDS` 覆盖新增 5 个 kind |
| 改动 | `scripts/build-webui-data.mjs` —— `types.yaml` 输入校验、`data-types.js` 产物与数据契约断言 |
| 改动 | `scripts/build-webui.mjs` —— `REQUIRED_HTML` 加 `style-types.html`（5 个 HTML） |
| 改动 | `scripts/verify-webui.mjs` —— 新增第 13 组（独立页断言）+ 13b（窄屏回归） |
| 改动 | `tests/filterEngine.test.ts` —— 新增 13 例多组维度用例（53 → 66） |
| 改动 | `CONTEXT.md` / `README.md` / `docs/风格库筛选方案.md` | 术语层、生成链、落地记录 |

## 考虑过的选项

| 选项 | 否决理由 |
|---|---|
| **挂进工作台一级视图** | 一级视图 = 研究闭环的七个角色，类型库是词库不属任何角色；且要动窄屏 `visible === 7` 断言，8 个按钮挤不进 390px |
| **做成「风格库」的二级页签** | 二级页签只属于提示词库（`CONTEXT.md` 明确）；且风格库是「谁画的」、类型库是「画成什么样」，不是同一层级的两级 |
| **整页 iframe 嵌上游** | `X-Frame-Options: SAMEORIGIN` + `CSP: frame-ancestors 'self'` —— 技术上不可能 |
| **照搬上游的平铺 AND** | 实测三词只剩 37 条，等于把库筛空；与项目既有约定冲突 |
| **排序项叫 "Newly tested"** | 实测时间在快照与 payload 里都不存在，冒名顶替会误导用户 |
| **用 `publicDomain` 之外的新开关（如 pick）** | 上游 picks 在本子集为 0 条，无数据支撑，不做空开关 |
| **引入 `mid/` 640px 大图** | 175 MB / 1,180 张，与「风格库」页的 thumb 策略不一致，本轮不引入 |

## 后果

- **数据链新增一条**：`manifest.json` + `details.json` + `items.json` → `config/types.yaml` → `webui/js/data-types.js`。与风格库共用 `build-styles.ts` 与 `sync-style-images.ts`，不新增采集脚本。
- **`filter-engine.js` 的 multi 维度语义扩展**：新增可选 `groupOf` 声明。**未声明的维度行为完全不变**（既有 53 项测试全绿），所以这不是破坏性变更。
- **`dist/` 从 35 → 38 文件、28 → 29 个 JS、4 → 5 个 HTML**。
- **顶栏 NAV 从 3 → 4 个入口**，窄屏断言随之补测（390×844 / 800×600 下 4 个入口首屏全可点、无横向溢出）。
- **ULID 解码成为新事实来源**：`items.json` 此前无人使用，现在它是「收录时间」的唯一依据。若上游条目 id 规则变化，创建时间会失效 —— 解码加了合理性下限（2020-01-01），解不出即置 0，排序退化为按名称。

## 验证记录（2026-11-16）

| 项 | 结果 |
|---|---|
| `npx vitest run tests/filterEngine.test.ts` | **66/66 通过**（新增 13 例多组维度用例） |
| `npm run build` | 通过；38 文件 / 29 JS / 5 HTML；单一图片命名空间守门通过 |
| `npm run verify` | **211/213**；新增第 13 + 13b 组 **37 条全通过** |
| `npm test`（含收集守卫） | 20 文件全部收集、404 用例；400 通过 / 4 失败，**4 个失败全在 `tests/candidateVocab.test.ts`，与本次改动无关** |

### 与本次改动无关的既有红，登记不代改

1. `tests/candidateVocab.test.ts` 把旧快照数字写死（971 作业 / 571 短语 / 12 精确命中 / 11 匹配）。**在干净的 HEAD 上复测同样是这 4 条红** —— 数据已更新为 1044 / 631 / 12，是数据更新后断言未同步，不是引擎缺陷。
2. `verify-webui.mjs` 的「拆解缺口归零」「拆解来源分层不重不漏」因 **73 条新作业无拆解** 而失败（`3+50+918+73 = 1044`）。同样在 HEAD 上即为此数。
3. 修这两处需要单独裁决（改断言口径 vs 补跑拆解链），本 ADR 不夹带。

## 明确不做的事

- 不做「更多 used / liked / picks / shuffle」排序 —— 快照里没有对应数据支撑。
- 不做上游的 `like`（收藏）维度 —— 那是账号态，服务端行为。
- 不把上游第 5 个条目类型类（sref-styles）搬进本页。
- 不引入 `mid/` 640px 大图。
- 不改采集链、不改 `config/explore.yaml`、不补跑探索榜拆解。
