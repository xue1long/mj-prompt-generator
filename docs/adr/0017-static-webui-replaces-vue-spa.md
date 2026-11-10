# 用静态多页 WebUI 替换 Vue SPA 正式前端

> **状态：替换已完成并验证（Round 1–4 全部裁决完毕）**。正式入口、`npm` 脚本、`dist/` 构建链、探索榜 942 条 / 官方风格榜 200 组全量数据均已接通。Round 4 用户按推荐裁定：`webui/assets/` 维持入库、不启用 `--images=public`、不动 `CONTEXT.md`、不动 CSS —— 均为「维持现状」，无新增代码改动。**唯一未闭合项**：`CONTEXT.md` 三处措辞修订（前置条件是用户先处理仓库里 34 项未提交改动）；窄屏遮挡与 4 张过期截图留待单独视觉轮次。本 ADR 不代批 `CONTEXT.md`。
>
> **编年提示（Round 8，2026-11-10）**：上文 Q13 / Round 5 关于「不启用 public 引用、保持 942 条、禁跑 `build:webui-data`」的裁决已被用户新裁决推翻；文中 942 条、Round 4「不启用 `--images=public`」等均为历史记录。**现行口径以本 ADR 末尾「Round 8」为准**。`CONTEXT.md` 仍按 Q14 冻结，本 ADR 不代批。

## 背景

正式前端原本是 Vue 3 + Pinia + naive-ui + Vite 的 SPA：`src/` 下 27 个 `.vue` / 31 个 `.ts`，6 个 YAML 经 `scripts/yamlConfigPlugin.ts` 在构建期内联进 `dist/assets/index-*.js`（约 11.2 MB），`public/` 下 18,216 张预览图（949 MB）随 `dist/` 一起交付。运行时无后端、无 API，产物可 `file://` 双击打开（ADR-0003）。

`C:\Users\HP\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\09539b8c-57b6-400f-9672-992d13b7d630\` 下另有一套「暗房仪表盘」重设计原型（说明见 `webui/REDESIGN-NOTES.md`）：纯静态 HTML/CSS/JS，无构建步骤，四屏共享一个常驻会话 Dock，Lighthouse 可访问性 / 最佳实践四屏均为 100。原型自己声明「没做的部分：真实数据加载、分面筛选完整维度」，数据是抽样快照。

用户裁定：**用该原型替换本项目的 webui 前端**；Round 1–3 均选择「按推荐执行」。

## 决定

1. **新正式前端 = 静态多页 WebUI**，落点 `webui/`：4 个 HTML（工作台 / 画廊 / 风格库 / 探索榜跳转页）、`css/app.css`、11 个 `js/*.js`、`assets/` 701 张图。无编译步骤，双击 `webui/index.html` 或 `dist/index.html` 均可用。原型源目录保持只读。
2. **Vue SPA 退役但源码保留**：`src/`、`vite.config.ts`、6 个 YAML、`public/`、`tools/` 全部留在仓库作为数据源与回退点；旧入口以 `legacy:dev` / `legacy:build` / `legacy:preview` 保留。
3. **入口与构建链（第 2 步，Q8=A）**：

   | 脚本 | 指向 |
   |---|---|
   | `dev` | `node scripts/serve-webui.mjs`（Node 内置 http，零新依赖，仅绑 `127.0.0.1`，路径规范化 + 前缀校验防穿越） |
   | `build` | `node scripts/build-webui.mjs`（清空 `dist/` → 原样复制 `webui/`） |
   | `preview` | `serve-webui.mjs --dist` |
   | `build:webui-data` | `node scripts/build-webui-data.mjs` |
   | `verify` / `verify:dev` | `scripts/verify-webui.mjs` |
   | `verify:legacy` / `verify:legacy:dev` | 原 `scripts/verify-app.mjs`（文件本身未改） |
   | `legacy:dev` / `legacy:build` / `legacy:preview` | 原 Vite 三件套 |
   | `update:explore` / `update:styles-top` | 末端由 `npm run build` 改为 `build:webui-data && build` |

   根 `index.html` 不删（仍是 Vite legacy 入口）。`dist/` 从 930.9 MB / 18,224 文件重建为 **18.83 MB / 720 文件**；`public/` 的 949 MB 图保留不动，作为数据生产链与下一轮全量配图的来源。
4. **全量数据接回（第 2 步，Q9=A）**：`scripts/build-webui-data.mjs` 从 `config/explore.yaml`（942 条）、`config/explore-decomposed.yaml`（942 条七段拆解，`jobId` 匹配率 942/942）、`config/styles-top.yaml`（200 码 × 8 题材）生成 `webui/js/data-explore.js` 与 `data-stylestop.js`。`EXPLORE_BATCHES` / `EXPLORE_ASPECTS` 直接取全量（6 / 35），不再有假空态。图片维持 701 张抽样，界面如实标注配图覆盖率。
   - 内置 `--images=public` 开关：把配图改为 `../public/` 相对路径，不复制文件、零体积增长。实测 `public/explore/thumbs` 对 942/942 作业、`public/preview-images/midjourney-styles-top` 对 200/200 风格码 **100% 覆盖**（63.3 MB + 216.7 MB，卡片只需这两组，无需 949 MB 全量）。但该路径只在项目根内有效，单独分发 `dist/` 会丢图，属下一轮 B 的范围，**默认关闭**。
5. **不杜撰**：源数据（`prompt` / `paramTail` / `tags`）没有 `sref` 字段，但 `config/explore.yaml` 的作业条目上**有独立的 `sref` 字段**（由 `tools/collect-explore.ts` 的 `styleRefsOf()` 从上游 `prompt.styleRef` 提取）。**口径更正（2026-11-10 复算）**：实测 957 条中有 **81 条带真实 sref**（63 个互不相同的字段值，其中 20 条是多码；把多码拆开后共 96 个唯一风格码）。原型样本里那 2 个 sref 值（`3808026652` / `3414761933`）**确实存在于源数据**（各出现 1 次），不是杜撰，应如实继承。「只看有 sref」在**有值时**显示可用筛选按钮，**无值时**改为说明 chip，避免制造假空态。
   > 历史事故（本 ADR 首版记为「源数据完全没有 sref 字段」「一律 null」）：`scripts/build-webui-data.mjs` 在构建期把 `j.sref` 硬编码成 `null`，把 81 条真值抹掉；`scripts/verify-webui.mjs` 的断言又写成 `data.sref === 0`，等于把 bug 固化成验收标准。现已修复（见文末 Round 9）。
6. **无图降级**：924 条作业 / 194 组风格码没有本地配图，卡片与灯箱改渲染 `.img-plate` 排版版位，不产生 `<img src="undefined">` 破图。头部标注「配图 18 / 942（本地抽样）」「官方榜配图 6 / 200（本地抽样）」。
7. **分页**：942 张卡片一次性渲染实测 **3.9 s**，改为首屏 60 条 + 「加载更多」(+60)，筛选变化重置 `limit`；实测首屏约 1.1 s（含浏览器 IPC），加载更多后 120 条。
8. **样本筛选项按实际覆盖生成**：`availableFrom()` 从 `EXPLORE_JOBS` 动态计算，接回全量后自动从 2 批次 / 6 比例扩展为 6 批次 / 35 比例，无需改数字；不改动上游全量统计。
9. **会话与偏好迁移**：新键 `mj-session-v2` / `mj-theme`；旧 `mj-session-v1`（`SessionSnapshot`）、`mj-parameter-values`、`theme` 只在缺新键时读取并映射，**不删除旧键**。字段映射见 `webui/js/core.js` 的 `readLegacySession()`。
10. **URL 契约兼容**：旧 `#/artists?...`、`#/explore?d/ar/sref/q` 重定向为 `#artists` / `#explore`；旧 `#/style-codes`、`#/styles-top`、`#/gallery` 跳到对应独立 HTML 页。迁移在 `core.js` 顶层执行，早于 `workbench.js` 的 `readHash()`。
11. **信息架构以原型为准**：工作台 6 个页签（4 个摄影分类 + 艺术家 + 探索榜），画廊与风格库提为顶栏独立页，会话 Dock 跨屏常驻。**这与 ADR-0013 / `CONTEXT.md:124` 的「探索榜是提示词库第 9 个页签」冲突**——以本 ADR 为准；`CONTEXT.md` 措辞修订由用户批准后单独落盘，本 ADR 不代批。
12. **校验**：`scripts/verify-webui.mjs` 共 **43 项断言**（Round 6 增 2 项、Round 7 增 4 项），支持 `--dist` 切换校验目标；覆盖四屏渲染、全量数据契约、分页、无图占位、筛选无假空态、会话 / 主题 / 旧 hash 迁移、「展开全部参数」折叠态双向回归、灯箱拆解段逐段送入左栏（送入 / 追加 / 空段无按钮 / 灯箱常开且零错误）、窄屏基线。窄屏 800×600 只断言渲染与零错误，遮挡作为 `NOTE` 登记、不计失败（Q11）。
13. **`webui/assets/` 维持入库，不加 `.gitignore` 忽略规则**（Q12=A，Round 4 已裁决）：Q4 原推荐「图片可由 `public/` 复现」经核实不成立，见「考虑过的选项」。要改成忽略，必须先补 sharp 压缩生成链，单独排期，本轮不做。
14. **`--images=public` 保持默认关闭**（Q13，Round 4 已裁决）：`build-webui-data.mjs` 的开关保留但不在构建链中启用；只有确认 `dist/` 需要脱离项目根独立分发时才启用，且需同时把 63.3 MB `public/explore/thumbs` + 216.7 MB `public/preview-images/midjourney-styles-top` 复制进 `dist/`。单独一轮做。
15. **窄屏遮挡与过期截图留待视觉轮次**（Q15，Round 4 已裁决）：不改 `css/app.css`；窄屏基线只作为 `verify-webui.mjs` 的 `NOTE`，遮挡不计失败。`docs/screenshots/` 4 张 Vue 时代截图保持原样，与新前端的视觉契约不符，重拍并入视觉轮次。

## 考虑过的选项

| 选项 | 否决理由 |
|---|---|
| 只把原型的视觉 / 布局移植回 Vue 组件 | 要同时改 27 个组件 + 主题覆盖 + ADR 契约，改动面比换前端更大；且原型本身已是可运行的高保真实现。 |
| 原型作为并列 v2 预览页，Vue 继续是正式前端 | 与用户「替换掉」的字面要求不符，会长期维护两套 UI。 |
| 直接删掉 `src/` 与 `public/` | 6 个 YAML 与 18,216 张图是唯一真实数据源，删掉即失去接回全量的能力；且用户要求可回退。 |
| 把抽样数据里的下拉选项直接改小数字 | 治标：接回全量数据后还要再改一次。改渲染层动态计算才是根因修复。 |
| 迁移时删除旧 `mj-session-v1` | 旧前端仍可能作为回退被打开，删键会让用户会话丢在半路。 |
| 把 `webui/` 内容提到项目根覆盖根 `index.html`（Q8=C） | Vite dev/build 行为会变，且无法与 legacy 源码共存。 |
| 一次性渲染全部 942 张探索卡 | Chrome headless 实测 3.9 s，交互不可接受；改分页。 |
| 沿用原型样本里的 2 个 sref 值 | **（2026-11-10 更正：否决理由不成立）** 首版记为「三个真实数据源都无此字段，属杜撰」，但实测这两个码（`3808026652` / `3414761933`）**就在 `config/explore.yaml` 里**。真实源头有 81 条 sref，原型样本取的是真值而非杜撰，应如实继承。 |
| 给 `webui/assets/` 加忽略规则（Q4 原推荐） | 抽样图是**压缩产物**，不是 `public/` 的直接副本（`webui/assets/explore` 72 张 1.4 MB vs `public/explore/thumbs` 3768 张 63.3 MB；`assets/styles-top` 48 张 0.8 MB vs 1600 张 216.7 MB）。忽略后 clone 仓库缺 701 张图：`build-webui-data.mjs` 读目录会失败、`dist/` 少图、`verify` 的配图断言全红。必须先有 sharp 生成链才能忽略。 |
| 把 `TMP/TEMP` 覆盖写进 `package.json` 的 test 脚本 | WorkBuddy fs shim 的 `%TEMP%` 限制是**环境**问题，不是项目问题；按用户「单次命令覆盖、不改全局配置」的既有约定，不固化进仓库。 |

## 后果

- **新增**：`webui/`（720 文件 / 18.83 MB）、`docs/adr/0017`、`scripts/verify-webui.mjs`、`scripts/serve-webui.mjs`、`scripts/build-webui.mjs`、`scripts/build-webui-data.mjs`。
- **改动**：`package.json`（仅 `scripts` 块增量替换，未覆盖用户已有编辑）；`webui/` 内 `js/core.js`、`js/explore-board.js`、`js/style-library.js`、`css/app.css`、`js/data-explore.js`、`js/data-stylestop.js`。**未提交 git，未改 `CONTEXT.md`、未改 `.gitignore`、未改 `scripts/verify-app.mjs`、未删 `public/` 任何文件**。仓库原有 34 项 M/D 未提交改动保持原样。
- **交付体积**：`dist/` 930.9 MB → 18.83 MB；`public/` 949 MB 保留作为数据源。
- **仍丢失（相对旧 Vue 前端）**：图片下载、全局搜索的部分维度、URL 筛选深链的查询参数（只保留页签级重定向）、旧 `verify-app.mjs` 的 DOM 断言链（改名 `verify:legacy` 保留）、`docs/screenshots/` 4 张视觉契约截图已过期。七段拆解灯箱与探索榜数据已通过全量接回补齐。
- **仍可跑**：`tests/` 下 10 个 vitest 文件 / 135 个用例不绑定 DOM，只依赖 `config/*.yaml`、`src/utils/*`、`tools/*`。
- **回退**：删除 `webui/` + 4 个新脚本 + 本 ADR 即回到原状；或 `npm run legacy:build` 重建旧 Vue 产物。原型源目录全程只读。
- **验收命令**：`npm run verify`、`node scripts/verify-webui.mjs --dist`、`TMP=<项目内目录> TEMP=<同目录> npm test`、`npm run build`、双击 `dist/index.html` 三屏可用。

## 验证记录

### 第 1 步（原型落地 + 契约兼容）

| 项 | 结果 |
|---|---|
| 静态 | 11 个 JS 语法通过；HTML 本地引用 0 缺失；`data-*.js` 中 568 个图片引用全部存在 |
| 浏览器 | Chrome headless 打开工作台 / 画廊 / 风格库三屏，渲染完整、0 控制台错误、0 请求失败；工作台 6 个 tab |
| 契约 | `verify-webui.mjs` **19/19 通过**：筛选收敛到 2 批次 / 6 比例无假空态、`mj-session-v1 → v2` 映射与旧键保留、`theme → mj-theme`、旧 hash 重定向与跨页跳转 |

### 第 2 步（入口链 + 全量数据，本轮）

| 项 | 结果 |
|---|---|
| 构建 | `npm run build` → `dist/` 720 文件 / 18.83 MB / 11 JS / 4 HTML；旧 930.9 MB 产物清空 |
| 服务器 | `serve-webui.mjs --dist` 实测 `/`、`/index.html`、`/gallery.html`、`/js/data-explore.js`、`/css/app.css`、webp 均 200 且 MIME 正确；404 与 `%2e%2e` 穿越均被拒 |
| 数据生成 | dry-run 双模式通过：sample 18/942 与 6/200 配图、public 942/942 与 200/200 配图；942 条拆解 100% 匹配；两种模式共 4,368 / 5,368 个图片路径全部存在 |
| 浏览器（源码） | `npm run verify` → **37/37 通过**，0 控制台错误、0 请求失败、0 破图；942 卡 / 924 占位、200 组 / 388 占位、灯箱 7 段拆解、分页 60→120、41 个下拉选项均有结果 |
| 浏览器（产物） | `verify-webui.mjs --dist` → **37/37 通过**（等价双击 `dist/index.html`） |
| 单测 | `npm test` 10 文件 / **135 用例全过**；默认 `%TEMP%` 下有 1 个 `EPERM` unhandled error 并漏跑 `config.test.ts`，项目内 `TMP/TEMP` 覆盖后退出码 0 |
| 语法 | 11 个 `webui/js/*.js` 全部 `vm.Script` 通过；4 个新 `.mjs` 通过 `node --check` |

### 已知缺陷（未修，已上报）

- **窄屏遮挡**：`≤980px` 单栏断点下固定在视口底部的「最终提示词」条盖住页签条；800×600 时 `#tab-explore` 中心 `elementFromPoint` 命中 `DIV.final-text`（第 1 步为 `DIV.final-label`），真实鼠标点击切不动页签；1440×900 正常。原型自带的 CSS 层叠问题，非本 ADR 改动引入。修布局属视觉决策，留待单独轮次。
- **`npm test` 的 `EPERM`**：vitest 的 SSR 临时文件写 `%TEMP%` 被 WorkBuddy 的 `node-brokered-fs-shim` 拒绝，属环境限制；把 `TMP` / `TEMP` 指到项目内 `node_modules/.vitest-tmp` 即恢复全量且退出码 0。
- **`CONTEXT.md` 未修订**：`:124` 探索榜页签序号、`:105` 会话布局、`:91` 落盘键三处措辞仍与现行实现冲突；用户批准前不动。
- **`webui/assets/` 入库口径**：已裁决维持现状（Q12=A）；忽略规则需先有 sharp 压缩生成链，未排期。

## Round 4 裁决（用户「按建议选择」，全部为维持现状）

| 问题 | 裁决 | 生效条件 / 重启条件 |
|---|---|---|
| Q12 `webui/assets/` 入库 | **A：维持** 701 张 / 12.4 MB 入库，不改 `.gitignore` | 只有补出 sharp 压缩生成链、能从 `public/` 稳定复现 701 张后，才重新评估 B / C |
| Q13 全量配图 | **不启用** `--images=public`，`dist/` 保持 18.83 MB 自包含 | 确认 `dist/` 要脱离项目根独立分发时，单独一轮做路径与复制方案 |
| Q14 `CONTEXT.md` 三处措辞 | **仍不动**，等用户先处理仓库 34 项未提交改动 | 提交 / 暂存完成后再落盘；ADR 已完整记录冲突与修订方向，不会因文档晚改而丢信息 |
| Q15 窄屏遮挡 / 4 张截图 | **不修 CSS、不重拍**，留待单独视觉轮次 | 视觉轮次统一处理 `≤980px` 层叠、`docs/screenshots/` 4 张、`REDESIGN-NOTES.md` 的视觉契约 |

本轮**零代码改动**：只更新本 ADR 与工作日志，并复跑验收确认基线未漂移。

## 收口状态

- **替换的可执行部分：完成**。`npm run dev` / `npm run build` / 双击 `webui/index.html` 或 `dist/index.html` 都指向静态 WebUI；旧 Vue 前端仅以 `legacy:*` 保留在仓库。
- **未闭合 2 项**：
  1. `CONTEXT.md:91`（`mj-session-v1`）、`:105`（恒为两栏）、`:124`（第 9 个页签）三处措辞与实现不符。方向已定（落盘键改 `mj-session-v2`、会话 Dock 跨屏常驻、探索榜为工作台一个页签），但按 Q14 需等用户处理未提交改动后再落笔；"WebUI / Vue SPA" 工程命名不进 `CONTEXT.md`，放本 ADR 与 README。
  2. **数据不一致**：11-08 采集后快照 957 条 / 7 批次，前端 `webui/` 与 `dist/` 仍是 942 条 / 6 批次。用户裁定 A（保持现状），等 `config/explore-decomposed.yaml` 的未提交工作合并后统一接回，详见下节。
     → **Round 8 已闭合**：11-10 接回 957 条 / 7 批次，15 条无拆解作业走灯箱空态，不补拆解。
- **未提交**：全部改动均未 commit / stage，原型源目录全程只读。

## Round 5：11-08 探索榜采集（用户裁定 A = 保持现状）

| 项 | 值 |
|---|---|
| 命令 | `npm run collect:explore`（只采集，不含分解、不含前端数据重建） |
| 上游 | 4 页 × 50 = 200 条 → 可用 187（丢弃 13 条提示词过短）→ 172 条已在快照 → **净新增 15 条** |
| 快照 | `config/explore.yaml` `f5ba19e9cc85 → 79ca33c7e364`：942 → **957 条 / 7 批次**，新批次 `2026-11-08(15)` |
| 图片 | `thumbs 3768 → 3828`（+60）、`mid 3732 → 3828`（+96），**清理 0 张**；新批次 120 个图片路径 0 缺失 |
| 未动 | `config/explore-decomposed.yaml`（`e7b10a24cd3e` 未变，用户未提交的 1310+/856- 改动完好）、`webui/js/data-explore.js` 与 `dist/js/data-explore.js`（`f042aef58518` 未变） |
| 验证 | `npm test` 135/135 退出码 0；`npm run verify` **37/37**；git M/D 34 → 35（仅新增 ` M config/explore.yaml`） |

> **数据哈希口径（全文通用，Round 7 补记）**：上表及本 ADR 里所有 12 位十六进制值（含 `f5ba19e9cc85` / `79ca33c7e364` / `e7b10a24cd3e` / `f042aef58518`）均为**文件字节的 `sha256` 摘要前 12 位**；不是 `git hash-object`（git blob，sha1），也不是 md5。原记录只写值、未写算法，曾导致用 git blob / md5 复核时误判为「哈希失效」——数值本身自记录起一直正确。复现（项目根目录，PowerShell 与 bash 均可）：
>
> `node -e "const fs=require('fs'),c=require('crypto');['config/explore.yaml','config/explore-decomposed.yaml','webui/js/data-explore.js'].forEach(f=>console.log(f,c.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0,12)))"`
>
> 另：`webui/` 与 `dist/` 是否一致用 md5 **全值**比对（同算法同输出即可），与上面的 sha256 前 12 位是两套口径，不要互相换算或交叉比对。

**A 生效期间的禁令**：

- 不跑 `npm run update:explore`、不跑 `npm run decompose:explore`：`tools/decompose-explore.ts:450` 会 `rmSync` 后重写 `config/explore-decomposed.yaml`，直接抹掉未提交改动。
- 不跑 `npm run build:webui-data`：15 条新作业会输出 `decomposition: null`，而 `webui/js/explore-board.js:316/347` 直接 `d.segments.map(...)` → 灯箱 TypeError；`scripts/verify-webui.mjs` 的「942 条」断言为硬编码，重建后会红。

> **Round 8 后状态**：A 已解除。灯箱空态（`explore-board.js:374`）与动态断言已落地，`build:webui-data` 现为**默认可执行**（`package.json:10` 带 `--images=public`）。但 `update:explore` / `decompose:explore` / `merge-fine-parts.mjs` **仍禁**：`tools/decompose-explore.ts:450` 的 `rmSync` 会抹掉 `config/explore-decomposed.yaml` 里用户未提交的精修。
>
> **Round 11 后状态（2026-11-10）**：**该禁令已解除**。复算证明「`rmSync` 抹掉精修」是误判 —— `writeOutput` 实为标准原子写（tmp → 删旧 → rename），失败不留半成品；保留逻辑按 `schemaVersion` + `methodologyVersion` 过滤，实测 **942/942 条一条不丢**。且更新链已收敛为唯一入口 `scripts/update-explore.mjs`，分解步骤自带**备份 + 失败自动回滚**两道护栏。详见 Round 11。
- `npm run build` 安全（只是把现有 942 条复制到 `dist/`）。

**从 A 切走的触发判据**（满足其一才动）：

1. `config/explore-decomposed.yaml` 的未提交改动已提交 / 暂存，且 15 条新作业补齐七段拆解 → `build:webui-data && build` 一次接回（方案 C）。
2. 决定不补拆解也要接回 → 先给灯箱加「待分解」降级、验证断言改动态值，再 `build:webui-data && build`（方案 B）。

**回退采集**：`git checkout -- config/explore.yaml` + 删除新增 156 张图（`thumbs` / `mid` 回到 3768 / 3732）。

## Round 6：修复「展开全部参数」点击任一选项即收起

**用户报告**：左侧栏会话 Dock 里展开「展开全部参数」后，点里面任何选项，折叠块都会弹回收起。

**根因链**（`webui/js/core.js`）：

| 环节 | 位置 | 事实 |
|---|---|---|
| 折叠块 | `:535`（修前 `<details id="param-details">`） | 没有 `open` 回填，`session` 里也没有对应状态字段 |
| 重建 | `:516 renderDock()` | `host.innerHTML = ...` 全量重建 `#dock`，新建的 `<details>` 一律默认收起 |
| 触发 | `:631` 每个参数控件的 `change` → `apply(read()); renderDock()`；`:914 onChange(() => renderDock())` | 任何参数交互 / 任何 `emitChange()` 都会重建 |
| 反证 | `:543` / `:567` `#dock-disclosure` | 有 `session.dockOpen` 保存 + `open` 回填 + `toggle` 同步，所以窄屏下它不受影响 |

即：作者给外层折叠块做了状态保存，漏了内层 `#param-details`。**不是事件冒泡、不是 CSS，是重绘时展开态没被保留**。

**修复**（最小改动，沿用 `#dock-disclosure` 既有模式，只改 `webui/js/core.js`）：

1. `:113` 加 `session.paramOpen = false`（内存态；`saveSession()` 只落盘 4 个字段，与 `dockOpen` 一致，刷新后回到收起）。
2. `:535` 改为 `<details id="param-details"${session.paramOpen ? ' open' : ''}>`。
3. `:572-573` 在 `wireDock()` 里给 `#param-details` 绑 `toggle`，把 `open` 同步回 `session.paramOpen`。

**没有顺手改的**：`renderDock()` 全量重建仍会让参数区失去焦点 / 滚动位置（滑块与文本框已用 `input` 事件避开重绘，见 `:619-630`）。属另一个问题，本次只修展开态，不扩大改动面。

**验证**：

| 项 | 结果 |
|---|---|
| 修前复现 | 1440×900 与 800×600 均：展开 `param=true` → 改 select `param=false` → 点 checkbox `param=false`；窄屏 `disc` 保持 true |
| 修后真实点击 | 两视口：展开 → 改 select → 点 checkbox 均 `param=true`；手动收起后再触发 change 仍 `param=false`；0 pageerror |
| `npm run verify` / `--dist` | **39/39**（新增 2 条双向回归断言：保持展开 / 保持收起） |
| `npm test` | 10 文件 / **135 用例**，退出码 0 |
| 数据哈希 | `config/explore.yaml` `79ca33c7e364`、`explore-decomposed.yaml` `e7b10a24cd3e`、前端 `data-explore.js` `f042aef58518` 全部未变；`webui/js/core.js` 与 `dist/js/core.js` 哈希一致 → **A 状态未被破坏** |
| 环境插曲 | 并发跑多个 Puppeteer 时 `--dist` 校验曾报 `EBUSY ... puppeteer_dev_chrome_profile-*\lockfile`；停掉挂住的任务后单独重跑即 39/39，与代码无关 |

`dist/` 已由 `npm run build` 同步修复（A 状态下该命令安全，只复制 `webui/`，不触碰数据生成链）。git M/D 仍 35、?? 24，未提交未暂存。

## Round 7：灯箱七段拆解可逐段送入左栏 + 数据哈希口径补记

**需求与裁决**：探索榜作业详情灯箱里，「七段拆解」每一段都要能单独送入左侧栏提示词框。经逐轮质询，Q1–Q6 全部按推荐锁定：落点 = 灯箱（不是卡片网格）；目标 = `#subject-input`「主体与环境」；「复制」= 写入输入框而非系统剪贴板；写入语义 = 追加、段间 `, `、不去重；空段不渲染按钮；验收加 4 条断言、**不新增 ADR 文件**、不动 `CONTEXT.md`。结论落入本 ADR 的编年记录，不另起 ADR。

**活代码前提**（与退役的 `src/` Vue 无关）：`npm run dev` 服务 `webui/index.html`，`dist/` 是 `webui/` 逐字复制；`session` / `saveSession()` / `emitChange()` / `toast()` / `esc()` 均为 `core.js` 全局。`renderDock()` 全量重建的是 `#dock`，灯箱 backdrop 挂在 `document.body`，所以写入不会关闭灯箱，可连点多段累积。

| 文件 | 位置 | 改动 |
|---|---|---|
| `webui/js/explore-board.js` | `:315`、`:350-357`、`:381-392`（`openJobSheet()` 内） | 新增 `segText()` 单一判空口径（`trim`）；非空段在 `.decomp-module` 行尾渲染 `.mini-btn`（复用 `.slot-tools`）；backdrop 一次 click 委托：按 `cur + ", " + text` 追加到 `session.subject` → `saveSession()` → `emitChange()` → `toast()` |
| `webui/css/app.css` | `:603` | `.decomp-module` 加 `display:flex; align-items:center; gap:8px`（唯一 CSS 改动，不动灯箱骨架） |
| `scripts/verify-webui.mjs` | `:154-186` | 灯箱断言后新增 4 条：空段无按钮、首次送入、再点按 `", "` 追加、灯箱常开且零错误；期望文本从 `EXPLORE_JOBS` 取，不硬编码 |
| `dist/` | — | 仅由 `npm run build` 复制同步（720 文件 / 18.83 MB），未手改 |

**状态边界**：只写 `session.subject`；不碰 `session.params` / `session.manual`，不调 `togglePrompt()` / `apply()`（活代码里这些函数会清空手动编辑提示词，属已登记的既有缺陷），不碰系统剪贴板，不碰作业拆解字段 `d.paramTail` 与 `core.js:294` 的同名函数。

**验证**：

| 项 | 结果 |
|---|---|
| `npm run verify` / `node scripts/verify-webui.mjs --dist` | **43/43**（基线 39 → +4），0 `pageerror` / `console.error` / `requestfailed` |
| 新增 4 条 | 空段不显示送入按钮（7 段 / 6 按钮 / 1 空段）、首次送入文本精确相等、追加为 `text1 + ", " + text2`、灯箱仍开且错误 0 |
| 语法 | `node --check scripts/verify-webui.mjs` 与 `vm.Script(explore-board.js)` 均通过 |
| 数据哈希 | 按 Round 5 补记的 sha256 前 12 位口径复核：`79ca33c7e364` / `e7b10a24cd3e` / `f042aef58518` **仍与当前文件匹配** → Round 5「A = 保持现状」未被破坏；`webui/` 与 `dist/` 的 `core.js`、`data-explore.js` md5 一致 |
| 禁令 | 全程未跑 `build:webui-data` / `decompose:explore` / `update:explore`，未改 `config/*.yaml`，未动 `src/`；`npm run build` 只复制现有 942 条，安全 |

**已知边界（登记不阻断）**：6594 段里 2982 段 `text` 为空（45.2%，⑦ 941/942 空）→ 不渲染按钮；1049 段含汉字（23 段纯中文）→ 原样送入、不做语言过滤；`paramTail` 同名异义已在上文消歧；窄屏遮挡与 4 张过期截图仍属 Q15 视觉轮次。

**未动**：`CONTEXT.md`（Q14 裁决仍生效，新术语「拆解段」只写在本 ADR）、Round 5/6 的历史数值与结论、README 陈旧段落、ADR-0013/0014/0015/0016。
（以上为 Round 7 当时的状态；**Round 8 已按用户裁决修订 README 与默认构建口径**，见文末。`CONTEXT.md` 仍未动。）

**回退**：本 ADR 与 3 个代码文件的改前副本在 `node_modules/.cache/mj-seg-append-20261109/`；ADR-0017 是**未跟踪文件**（`??`），禁止用 `git checkout --` 回退。按备份覆盖后重跑 `npm run build` 即可。

---

## Round 8：正式接回 957 条 + 固定默认配图口径（2026-11-10）

用户经 grill-with-docs 两轮 frontier，连续两次「按你的建议选择」，全部按推荐裁决。

### 裁决

| 轮 | 决策 | 裁决 |
|---|---|---|
| 1 | Q1 修复范围 | A 最小闭环：只修可执行口径 + 权威文档编年，不动数据生产链 / CSS / git |
| 1 | Q2 分发语义 | A 不要求 `dist/` 脱离项目根独立分发，把约束写进文档 |
| 1 | Q3 文档授权 | B 允许改 ADR-0017 + README |
| 1 | Q4 未提交改动 | A 不动、只登记 |
| 1 | Q5 术语 | 「按域配图模式 / 配图档位」属工程名词，**不进 `CONTEXT.md`** |
| 2 | Q6 默认口径 | A `build:webui-data` 默认 `--images=public`，两域全量 |
| 2 | Q7 15 条待精拆 | 保持空态，不补拆解 |
| 2 | Q8 断言真相源 | 产物统计对象 + 数组长度，运行时断言条数维持 44 |
| 2 | Q9 `mid/` 大图档 | 挂账，只登记「文档有、代码没有」 |

**Q13（Round 4「不启用 `--images=public`」）与 Round 5（A = 保持 942 条 / 禁跑 `build:webui-data`）由本轮用户裁决正式推翻**；上文相关段落为历史编年，不再是现行约束。`CONTEXT.md` 的 Q14 冻结**未解除**，本 ADR 不代批。

### 事实（本轮只读实测）

| 模式 | 探索榜配图 | 风格榜配图 | 路径来源 |
|---|---:|---:|---|
| `sample`（改前默认） | 18 / 957 | **0 / 200** | `webui/assets` |
| `explore-public`（11-10 02:43 手敲） | 957 / 957 | **0 / 200** | 探索榜 `../public/` |
| `public`（本轮默认） | 957 / 957 | 200 / 200 | 两域 `../public/` |

风格榜 0/200 的根因：`config/styles-top.yaml`（11-09 刷新为 200 个新码，如 `2002855559_portrait.webp`）与 `webui/assets/styles-top/`（仍是 6 个旧码 / 48 张，如 `1750422330_portrait.webp`）basename 全不匹配，`build-webui-data.mjs:88` 的 `sampleSets[kind].has(base)` 全 false。11-10 那轮未暴露，是因为 `--only=explore` 只写了探索榜产物。`--images=public` 让两域都走 `../public/`，**不复制文件、dist 体积不增**。

### 决定与改动

| 文件 | 改动 |
|---|---|
| `package.json:10` | `build:webui-data` 带 `--images=public`；`update:explore`（:20）/`update:styles-top`（:25）末端自动继承 |
| `scripts/build-webui-data.mjs:5-23` | 用法注释改为「默认 public」，并标注无 flag 的 sample 会得到 0/200 |
| `scripts/verify-webui.mjs` | `data` 补 `total / totalJobs / noDecomp`；原 957 / 942 / 15 / 7 / 35 / 6 / 200 字面量改为取自 `EXPLORE_IMAGE_STATS`、`EXPLORE_JOBS.length`、`EXPLORE_BATCHES.length`、`STYLES_TOP_IMAGE_STATS`；chips 文案改交叉校验；灯箱空态的批次键从数据动态取，不再写死 `2026-11-08`。**运行时 check 条数仍为 44** |
| `webui/js/data-explore.js`、`data-stylestop.js` | 无参 `npm run build:webui-data` 重建（生成物） |
| `dist/` | `npm run build` 原样复制，720 文件 / 19.23 MB |
| `README.md` | 改正 942 / 3768 / 700 MB / 独立页 / Vite / HMR / verify 等陈旧口径，新增当前实现状态与 dist 约束 |
| `CONTEXT.md` | **未动**（Q14 冻结） |

### 术语（工程层，不进术语表）

- **按域配图模式**：`sample`（两域用 `webui/assets` 抽样）/ `explore-public`（探索榜 `../public/`、风格榜仍抽样）/ `public`（两域 `../public/`）。是构建 flag，不是领域概念。
- **配图档位**：`public/explore/thumbs/` 320px 缩略档、`public/explore/mid/` 640px 大图档。现行 `explore-board.js:201/:334` **只引用 `thumbs`**；`mid` 档虽被 README 旧版写为灯箱/下载来源，代码未接入（Q9 挂账）。
- **「成图」歧义（登记，不改术语表）**：`CONTEXT.md` 的「成图」词条指一条作业四格之一，README 旧版 `:184` 却把两档图片文件都叫「成图」。README 本轮改用「缩略档 / 大图档」；术语表原义保留，等 Q14 解冻再统一。

### 验证（本轮实跑）

| 项 | 结果 |
|---|---|
| 默认口径 | `npm run build:webui-data -- --dry-run` → `public` / 探索榜 957/957 / 风格榜 200/200 / 拆解匹配 942（未匹配 15） |
| 单测 | `TMP/TEMP=node_modules/.vitest-tmp npm test` → 10 文件 / **135 用例**，退出码 0 |
| 源码校验 | `npm run verify` → **44/44**，0 控制台错误 / 0 请求失败 / 0 破图 |
| 产物校验 | `node scripts/verify-webui.mjs --dist` → **44/44** |
| 语法 | `node --check scripts/verify-webui.mjs` 通过 |
| 一致性 | `webui/` 与 `dist/` 的 6 个关键文件（两份 data-*.js、core.js、explore-board.js、style-library.js、app.css）md5 **全部相同** |
| git | 改动前 **37 M/D + 26 ??**，改动后 **38 M/D + 26 ??**；唯一新增项是 `M README.md`（本轮授权修改），其余均为既有改动；未提交、未暂存 |

> 口径更正：前几轮沿用了本 ADR 旧记录里的「34 / 35 项未提交改动」，与本轮 `git status --short` 实测的 **37 M/D + 26 ??（改文档前）→ 38 M/D + 26 ??（改文档后）** 不符；以本轮实测为准。

### 补丁：构建守门（同日「继续修复」）

**根因**：`scripts/build-webui-data.mjs` 原先在 `for (const out of outputs)` 里**边校验边写文件**，且只校验「图片路径存在」与「条目数」，不校验配图覆盖率。两个后果：sample 模式下 `webui/assets/styles-top` 与源快照 basename 全不匹配时，能静默产出 `0/200` 的 `data-stylestop.js`；若第二个产物校验失败，第一个坏文件已经落盘。

**修法（只改这一个文件，不碰默认口径 / 数据 / CSS / git / 术语表）**：

| 改动 | 位置 |
|---|---|
| 改为两阶段：先校验全部产物，把待写文件收进 `pending`，校验全过后再统一 `writeFileSync` | `build-webui-data.mjs` 产物循环 |
| 新增覆盖率守门：`stats.total > 0`，且 sample 模式下 `withImages === 0` 时中止并给可操作提示（改用 `--images=public` 或重做抽样图） | 同上 |
| dry-run 与 `--only` 旁路只告警、不中止，保留诊断与局部重建能力 | 同上 |

**验证**：`node --check` 通过；默认 `public` dry-run 仍 957/957 + 200/200；无 flag 的 sample dry-run 打印 1 条告警且退出码 0；**无 flag 且非 dry-run 实跑退出码 1、报错精确、两份 `data-*.js` 的 sha256 前后完全一致**（证明没有半成品落盘）；随后正常重建 public 产物，`webui/` 与 `dist/` 两份数据文件 md5 一致；`npm test` 135/135、`verify` 44/44、`--dist` 44/44 全部回归通过。

### 补丁 2：拆解来源如实标注 +「LLM 偷懒」诊断（同日「继续」）

**用户问题**：「已经精拆的提示词，部分拆解结果 LLM 偷懒，没有完全拆解」。只读诊断后结论是**该判断不成立**：

| 来源 | 条数 | 实词覆盖率 | 七段具体 note | 模板 note | 速读均长 |
|---|---:|---:|---:|---:|---:|
| 手工精拆 | 3 | 95.1% | 7.00/条 | 3.33 | 60 字 |
| 逐条精拆（LLM） | 50 | 87.2% | 7.00/条 | 0 | 87 字 |
| 规则兜底（非 LLM） | 889 | 79.7% | 3.73/条 | 12.75/条 | 25 字 |

真根因两条：① 889 条是 `rule-decompose.mjs` 的规则兜底，**根本没过 LLM**（`fine-decompose.mjs --status` 完成度 5.5%，183 批只跑 6 批，904 条待精拆）；② `build-webui-data.mjs` 只挑 7 个字段挂到 `decomposition`，**把 `model` 来源标记丢了**，灯箱也不渲染徽章，两类结果在 UI 上完全一样（SKILL.md 第九节承诺的「来源徽章」一直未实现）。

**抽检与判据修正**：新增只读工具 `tools/audit-decomposition.mjs`，按三类来源分开审计（实词覆盖率 / 空段 / 模板句 / 整坨搬运 / 词表速读）。初版把「空段 >= 3」直接判偷懒，得 13 条；人工逐条对照原文后确认 12 条是七段式结构性空缺（原文确实没写光线 / 构图 / 参数，且每段 note 都具体解释了缺失原因，属 `fine-agent-prompt.md:34` 允许的合法出口），1 条 `35bed494` 是「基于参考图生成变体」的指令型 prompt，七段式本就不适用 ⇒ **13 条全部假阳性，0 条需要重拆**。判据据此收紧为「空段 >= 3 且其中至少 2 段连具体解释都没有」，复跑 13 → 1；规则兜底仍被标记，语义不变。

**改动**：

| 文件 | 动作 |
|---|---|
| `scripts/build-webui-data.mjs` | 新增 `modelSource()`，把 `model` 长描述映射为 `source` 短标签透传进 `decomposition`（手工精拆 / 逐条精拆 / 规则解析 / 未标注） |
| `webui/js/explore-board.js` | 灯箱七段拆解标题下渲染来源徽章，规则解析额外附「确定性关键词匹配，非 LLM 语义判断，部分原文短语可能未收录」；复用已有 `.param-chip` + inline 强调色，**不改 `app.css`**（Round 4「不动 CSS」裁决保持） |
| `scripts/verify-webui.mjs` | 「灯箱七段拆解可用」一条内增加数据 ↔ 徽章文案交叉校验；空态分支校验有拆解才出现徽章。**断言条数仍 44，Q8 不变** |
| `tools/audit-decomposition.mjs` | 收紧 `EMPTY_SEGMENTS` 判据，新增 `unexplainedEmpty` 指标 |

**无损备份**：开工前把未提交的 `config/explore-decomposed.yaml`（942 条 / 3,612,763 字节 / sha16 `e7b10a24cd3e6130`）复制到 `node_modules/.cache/mj-backup-20261110/explore-decomposed.yaml.bak`；收尾时主文件 sha16 与备份完全一致，**未改动任何 `config/*.yaml`**。`decompose:explore` / `update:explore` / `merge-fine-parts.mjs` 写模式禁令继续生效。

**验证**：`npm test` 135/135；`verify` 44/44、`--dist` 44/44（灯箱断言实测 `badgeOk:true`、空态 `badge:""`）；来源分布 3 / 50 / 889 / 15 与主数据一致；`webui/` 与 `dist/` 关键文件 md5 一致；`dist/` 720 文件 / 19.25 MB；未提交、未暂存。

### Round 9：修复 sref 断链（2026-11-10）

**问题**：`config/explore.yaml` 里 **81 条作业带真实 sref**（上游 `prompt.styleRef`，由 `tools/collect-explore.ts` 的 `styleRefsOf()` 提取），但 `scripts/build-webui-data.mjs` 在构建期把 `j.sref` **硬编码成 `null`** —— 真值被就地丢弃。前端 `explore-board.js` 的 `srefCount()` 恒为 0，于是：

- 工具条的「只看有 sref」按钮**永不出现**，只剩「源数据未采集 sref」提示 chip；
- 即使手动构造出按钮，筛选 `if (ui.srefOnly && !j.sref) return false` 也会**恒空**；
- 灯箱的「填入 --sref」「复制 --sref」按钮、`job-meta` 的 sref 标记**全部不渲染**；
- 更糟的是 `scripts/verify-webui.mjs` 的断言写的是 `data.sref === 0`，且 UI 断言是「无 sref 时不显示假开关」—— **把 bug 固化成了验收标准**，缺陷从此「有测试保障」。

**根因性质**：这不是「源数据没有该字段」，而是**构建期丢弃 + 断言同步错误**的双重问题。首版 ADR 第 5 条据此写下的「源数据完全没有 sref 字段」「原型那 2 个 sref 值查无出处，属杜撰」**是事实错误**——实测 `3808026652` / `3414761933` 就在源快照里（各 1 次），原型样本取的是真值。

**改动**：

| 文件 | 动作 |
|---|---|
| `scripts/build-webui-data.mjs` | ① 文件头补「不杜撰」原则：**源数据里没有的字段一律置空；源数据里有的字段如实透传，不因旧结论而丢弃**。② 产物字段改 `sref: j.sref ?? null`（原为 `sref: null`）。③ 新增**构建期守门**：`must(r.sref === srcSref, ...)` —— 产物 sref 条数必须等于源快照 sref 条数，任何再次丢弃都在构建期失败。④ 报告行输出真实条数，不再输出固定文案 |
| `scripts/verify-webui.mjs` | ① 期望值**动态取自源快照**（新增 `expectedSrefCount()` 读 `config/explore.yaml`），采集后条数会变、断言跟着变。② 断言改为「sref 如实透传（非杜撰、非丢弃）」。③ UI 断言改为**分支式**：有 sref → 有按钮无提示；无 sref → 无按钮有提示。④ **新增端到端回归断言**：点「只看有 sref」后命中数 == 源条数，且每张卡片都带 sref 标记。 |
| `docs/adr/0017-...md` | 第 5 条与「考虑过的选项」表同步更正为实测口径；本文追加 Round 9 编年 |
| `README.md` | 探索榜条目改为「81 条带真实 sref，可按「只看有 sref」筛选」；断言条数 44 → 45 |
| `docs/第一性原理校验报告.md` | 2.4 节标记为「已修复」并附修法与验证证据 |

**前端未改**：`webui/js/explore-board.js` 的渲染逻辑本来就是正确的**条件式**（`srefCount() ? 按钮 : 提示 chip`），断链**只发生在数据侧**。这印证了第一性原理校验报告 2.4 节的判断——问题不在 UI，在数据链。

**验证**：`node --check` 通过；`build:webui-data --images=public --dry-run` 输出「sref：源数据 81 条带真实风格参考码（透传，不杜撰）」；实跑重建后 `webui/js/data-explore.js` sha16 由 `7ad816dd12e3faa0` → `d7f9aeb065ca12ee`；产物实测 957 条作业中 81 条 sref 非空、全为非空字符串、无 sref 者值为 `null`；`npm test` **135/135**；`npm run verify` **45/45**；`npm run build` 后 `npm run verify -- --dist` **45/45**；`webui/` 与 `dist/` 数据文件 md5 一致。

**断言条数变化**：44 → **45**（净增 1 条：sref 筛选端到端回归；1 条旧断言改为分支式，仍算 1 条）。这是修正固化 bug 的断言所必需的增量，非范围蔓延。

### Round 10：拆解输出统一 JSON + 读取容错（2026-11-10）

**问题**：`config/explore-decomposed.yaml`（派生文件）有 **3 个写者**、**2 种格式**：

| 工具 | 修复前写出格式 |
|---|---|
| `tools/decompose-explore.ts` | **YAML**（`yaml.dump`） |
| `tools/rule-decompose.mjs` | JSON（`JSON.stringify`） |
| `tools/merge-fine-parts.mjs` | JSON（`JSON.stringify`） |

（`tools/fine-decompose.mjs` 只**读**主文件、写的是分片目录 `config/decompose-parts/`，不是主文件写者。）

而构建期 `scripts/build-webui-data.mjs` 用 `JSON.parse` 读它 —— **跑一次 `npm run decompose:explore` 就会产出 YAML，让构建链在 `JSON.parse` 上直接抛错**，且错误现场离原因很远。

**口径更正**：首版《第一性原理校验报告》3.1 节写「4 个工具写同一个文件」，把 `fine-decompose.mjs` 误计为写者，实为 3 个。

**先对齐了「单一写者」的含义**：三个写者**职责互补，不是重复实现** —— LLM 语义判断（`decompose-explore.ts`）、确定性规则兜底（`rule-decompose.mjs`，当前 889 条数据的唯一来源）、人工逐条精拆分片合并（`merge-fine-parts.mjs`）。砍掉任何一个都会丢能力。故本轮**不砍写者，只统一格式与契约**。

**改动**：

| 位置 | 动作 |
|---|---|
| `tools/decomposed-format.mjs`（新增） | 派生文件格式契约的**单一来源**：`describeSources()` 如实统计各来源条数；`serializeDecomposed()` 产出**纯 JSON**。配 `decomposed-format.d.ts` |
| `tools/decompose-explore.ts` | ① 写出从 `yaml.dump` 改 `JSON.stringify`（走共用 `serializeDecomposed`），保留原子写。② 拆出 `readDerived()`：派生文件非 JSON **直接报错**，格式漂移不静默通过；`readYaml()` 保持读真 YAML 的 `config/explore.yaml`。③ 顶层 `model` 不再写 `llm.model`（会把「混合：3 手工 + 50 LLM + 889 规则」冲成一个模型名，等于宣称这批数据全是 LLM 产的），改 `describeSources()` |
| `tools/rule-decompose.mjs` / `tools/merge-fine-parts.mjs` | 写出改走共用 `serializeDecomposed`（纯 JSON）；顶层 `model` 改走共用 `describeSources` |
| `scripts/build-webui-data.mjs` | 读取改**容错**：先 JSON.parse，失败退回 yaml.load 并**打印格式漂移告警**，不再直接抛错炸链 |
| `tools/audit-decomposition.mjs` | 读取同样容错（只读审计工具不该因格式漂移直接崩） |

**为什么是纯 JSON 而不是真 YAML**：当前主文件**本来就是纯 JSON**（942 条，无任何 `//` 行）。JSON 规范里 `//` 注释**不合法** —— 实测给文件加注释头后 `JSON.parse` 直接抛 `Unexpected token '/'`。故任何写者加注释头都会破坏契约，让所有读方（以及编辑器插件、第三方脚本）读不了。文件名沿用 `.yaml` 是历史遗留，**读方一律走容错解析，格式判定看内容不看扩展名**。

**顺带根除的第二个缺陷**：三个写者对顶层 `model` 的措辞各不相同，且都**写死三段式**（真实构成会变，写死即谎报）。现统一为按实际 `model` 值分组的 `describeSources()`。

**验证**：

| 项 | 结果 |
|---|---|
| 端到端复现 | 真实派生文件换成 YAML → 跑真实构建脚本 → **退出码 0**（修复前抛错）+ stderr 明确告警 + 拆解仍正确匹配 942 条 + 原文件逐字节还原（sha16 `e7b10a24cd3e6130`） |
| 三写者真写 | `rule-decompose` 真写后是纯 JSON、可 `JSON.parse`、顶层 `model` 如实列出各来源、无重复前缀；主文件逐字节还原 |
| `--check` / `--dry-run` | `merge-fine-parts --check`、`rule-decompose --dry-run` 均未改主文件 |
| `decompose-explore --dry-run` | 「快照 957 条 · 已有有效分解 **942 条** · 待分解 15 条」—— 一条没丢 |
| `build:webui-data` | JSON 路径无告警，957 / 942 / 200 全对 |
| `npm test` / `verify` / `--dist` | **135/135** / **45/45** / **45/45** |

**备份**：动前把 `config/explore-decomposed.yaml`（3,612,763 字节 / sha16 `e7b10a24cd3e6130`）复制到 `node_modules/.cache/mj-backup-20261110-step3/explore-decomposed.yaml.bak`；收尾时主文件 sha16 与备份完全一致，**未改动任何 `config/*.yaml` 的内容**。

**未做（属下一轮）**：`package.json` 与 `更新探索榜.bat` 的入口收敛 —— 本轮只统一格式，**入口与 ADR 禁令仍并存**，仍靠人记。

### Round 11：更新链收敛为唯一入口（2026-11-10）

#### 问题

更新流程有**两处定义**，且各漏一步：

| 入口 | 展开的步骤 | 漏了什么 |
| --- | --- | --- |
| `package.json:20` `update:explore` | 采集 → 分解 → `build:webui-data` → `build`（**4 步**） | — |
| `更新探索榜.bat:9/16/24` | 采集 → 分解 → `build`（**3 步**） | **漏 `build:webui-data`（烘焙）** |

`build:webui-data` 是**唯一**把 `config/*.yaml` 烘焙成 `webui/js/data-*.js` 的步骤。漏了它，新采集的数据进了 `config/explore.yaml` 却进不了产物 → **页面一直是旧数据，且无任何报错**（静默失败）。

这个坑在 HEAD 里**有实证**：已提交态的 `config/explore.yaml` 是 **942 条 / 6 批次**，而已提交的 `webui/js/data-explore.js` 是 **957 条** —— 两者本就不一致，正是「采集了但没烘焙」的产物。

同时，`.bat` 第 2 步调的 `decompose:explore` 是 Round 9/10 反复声明**禁用**的入口 —— 禁令写在 ADR 里、入口却开在 `.bat` 里，**靠人记**。

#### 决定

1. **新增唯一入口 `scripts/update-explore.mjs`**：采集 → 分解 → 烘焙 → 构建，四步固定顺序，失败分级。
2. **`package.json` 的 `update:explore` 改为调它**；新增 `update:explore:no-decompose`（无 LLM 代理时）与 `update:explore:collect-only`（只采集，不动产物）。
3. **`更新探索榜.bat` 降为薄包装**：只 `call npm run update:explore`。流程改动只改一处。
4. **解除 `update:explore` / `decompose:explore` 禁令**，但**加安全网**（见下）。

#### 为什么必须用编排脚本而不是 `&&` 链

| 需求 | `&&` 能不能表达 |
| --- | --- |
| 分解失败不阻断采集链 | **不能** —— `&&` 遇非零退出就短路，后面的烘焙与构建全不跑 |
| 失败按步骤分级（采集/烘焙/构建致命，分解只警告） | **不能** —— 只有一个退出码，区分不出是哪一步、该多严重 |
| 分解失败时回滚派生文件 | **不能** —— `&&` 没有「失败后做清理」的语义 |

#### 失败分级

| 步骤 | 失败后果 | 处置 |
| --- | --- | --- |
| 1 采集 | 没有新快照，后面全无意义 | **致命**，退出码 1，旧快照与旧图保留 |
| 2 分解 | 新作业走灯箱空态（既有机制，29 条待补） | **警告，不阻断**，继续往下跑 |
| 3 烘焙 | 产物会与源数据不一致 | **致命**，中止，不更新 `dist/` |
| 4 构建 | `dist/` 不完整 | **致命** |

分解失败时若命中 `MJ_DECOMPOSE_(BASE_URL|API_KEY|MODEL)`，额外提示「复制 `.env.example` 为 `.env`」。

#### 安全网：为什么解除禁令前先加备份/回滚

Round 9/10 对 `decompose:explore` 下禁令的理由是「会抹掉 `config/explore-decomposed.yaml` 里的未提交精修」。该理由**经复算已不成立**：

- `writeOutput` 是标准**原子写**（写 tmp → 删旧 → rename），失败不留半成品、零损坏；
- 保留逻辑按 `schemaVersion` + `methodologyVersion` 过滤，实测 **942/942 条一条不丢**（3 手工 + 50 LLM + 889 规则全在）。

但「实测没出事」不等于「敢放进每日默认链」。故本轮加两道护栏：

- 分解前自动备份到 `node_modules/.cache/mj-update-backup/`（被 `.gitignore` 忽略，不污染仓库）；
- 分解失败**自动回滚**到备份。

实测：分解失败后主文件 sha16 `e7b10a24cd3e6130`、942 条、**与备份逐字节一致**。

#### 改动

| 位置 | 改动 |
| --- | --- |
| `scripts/update-explore.mjs`（新增） | 四步编排 + 失败分级 + 备份/回滚 + `--skip-decompose` / `--collect-only` 两个开关 |
| `package.json` | `update:explore` 指向编排脚本；新增 `update:explore:no-decompose`、`update:explore:collect-only` |
| `更新探索榜.bat` | 重写为薄包装，只调 `npm run update:explore` |

#### 验证

| 项 | 结果 |
| --- | --- |
| 完整四步（`npm run update:explore`） | 采集 971 条 / 分解因缺 `.env` 失败 → **自动回滚** → **不阻断** → 烘焙 971/942/200 → 构建 720 文件 → **退出码 0** |
| `--skip-decompose` | 跳过分解，照常烘焙构建，退出码 0 |
| `--collect-only` | 只采集；`data-explore.js` / `data-stylestop.js` sha16 **前后完全一致**（`ee92f425870ed9bb` / `92bf0f052cdf481a`） |
| 回滚完整性 | 派生文件 sha16 `e7b10a24cd3e6130`、942 条、顶层 `model` 完整、**与备份逐字节一致** |
| `npm run verify` / `--dist` | **45/45** / **45/45**（采集后 sref 81→82、比例 35→36，动态断言自动跟随，无需改数字） |
| `npm test` | 10 文件全跑、**135 用例**；1 个 `EPERM` unhandled error 经 HEAD 对照跑出**同一形态**（`1 failed | 117 passed` + 同 1 error）→ 判定为 WorkBuddy fs shim 的沙箱环境问题，**非本轮引入** |

#### 顺带根除的第三个缺陷

`package.json` 的 `update:explore` 一度被写成 `node scripts/update-explore.mnode`（扩展名手误）。**它不会立刻报错** —— `npm run` 会因模块不存在而失败，但只有真正跑那条命令时才暴露；而实测若直接 `node scripts/update-explore.mjs` 则**完全绕过**了这条错误路径。教训：**入口收敛的产物必须从真实入口（`npm run`）验，不能只验被调用的那个文件**。已修为 `.mjs`，并以 `npm run update:explore` 实跑确认。

### Round 12：作业稳定引用键 + 深链直达（2026-11-10）

#### 问题

一条社区作业在系统里只有内部 `id`（上游 UUID，36 字符），**没法被人引用**：
写研究结论时不能说「依据 7b95a9a0-f44a-4b27-9c18-e139023fa47a」—— 36 个字符没法口头传、没法手写、没法在笔记里检索。

更硬的一条：`workbench.js` 的 `readHash()` **只认页签 id**（把整个 hash 当页签 id 匹配），
传 `#explore?job=xxx` 匹配不上任何页签 → **整段被丢弃**，落回默认的「艺术家」页签。
即深链机制此前只用于筛选状态（ADR-0010），无法指认「正在看哪一条」。

#### 决定

给每条作业一个**本项目自有的短引用键**，并支持 `#explore?job=<键>` 直达灯箱。

#### 键的构造

    <作业标识前 8 位>-<提示词规范化哈希前 4 位>

- **前 8 位**：标识「是哪一条」。上游标识一次生成、跨批次重采不变；
  `tools/collect-explore.ts` 的 `mergeJobs` 按 id 去重（base 优先），同一条作业在快照中
  永远只有一条、批次取首次采集那天 —— **键不随重采搬家**。
- **后 4 位**：标识「内容是否变过」。上游若改了同一条作业的提示词正文 → 哈希变 → 键变 →
  引用旧键的人会发现内容对不上，而不是拿到一条被悄悄改写过的作业。

#### 候选方案的实测否决

| 候选 | 实测 | 判定 |
| --- | --- | --- |
| 纯提示词哈希 | 971 条里 **34 组碰撞**（社区大量重复提示词） | 不可用 |
| 纯 id 前 8 位 | 971 条零碰撞，但 32 bit 在 ~7.7 万条时碰撞概率约 50% | 靠运气 |
| **id 前 8 + 哈希前 4** | 971 条零碰撞，有效位宽 48 bit | **采用** |

#### 改动

| 位置 | 改动 |
| --- | --- |
| `webui/js/job-key.js`（新增） | 键算法**唯一本体**：浏览器端纯函数、无依赖，归一化 / FNV-1a / 键构造。由 `index.html` 用 `<script>` 直接加载 |
| `tools/job-key.mjs`（新增） | 构建期入口：通过 `vm` **加载同一份** `webui/js/job-key.js`（不是复刻逻辑），再包一层「批量 + 碰撞检测」 |
| `scripts/build-webui-data.mjs` | 构建期跑**零碰撞断言**（碰撞即中止）。**产物不携带 `key`** —— 键是推导量而非采集事实，烘焙进去会让「改一行前端代码」变成「6 MB 生成物跟着漂移」 |
| `webui/js/explore-board.js` | 灯箱展示引用键 + 「复制键」「复制深链」；新增 `openJobByKey()` / `findByKey()` / `jobDeepLink()` / `writeJobToHash()` |
| `webui/js/workbench.js` | `readHash()` 改为**页签 id 与 query 分开解析**；`render()` 后消费 `ui.hashJob` 直达灯箱 |
| `webui/js/core.js` | `mountDialog` 增 `onClose` 回调 —— 灯箱关闭时清掉 URL 的 `job` 参数 |
| `scripts/verify-webui.mjs` | 新增 **3 条断言**（45 → 48） |
| `tests/jobKey.test.ts`（新增） | **24 个单元测试**（135 → 159） |

#### 三个实现细节值得记

1. **回写地址栏用 `history.replaceState`，不改 `location.hash`** —— 改 hash 会触发 `hashchange`
   → 重渲染 → 灯箱被重建关闭。`replaceState` 只改地址栏，不触发重渲染，因此不会递归。
2. **`mountDialog` 的 `close` 是内部闭包**，调用方拿不到覆盖它的机会。原先想用
   `MutationObserver` 监听 backdrop 移除来挂钩关闭回调 —— 太重。改为给 `mountDialog`
   加一个 `onClose` 参数，是更直接的解法。
3. **键的算法本体只有一份，且刻意不烘焙进产物。** 最初的实现把 `key` 写进 `data-explore.js`，
   结果该生成物的 diff 达 6.18 MB —— key 注入与 971 条采集数据变更被混在一起，
   diff 完全读不出人话。根因是：**键是「由 id 与 prompt 推导出来的量」，不是采集来的事实。**
   改为前端运行时计算后：产物不含 key → 代码改动不引起生成物漂移；
   算法只有一份（`webui/js/job-key.js`）→ 不存在两处漂移。
   构建期仍通过 `vm` 加载**同一份**代码跑碰撞断言 —— 不是复刻逻辑，
   而是加载同一份，所以断言守得住运行时真正用的键。

#### 验证

| 项 | 结果 |
| --- | --- |
| 构建期守门 | 971 条算出 971 个互不相同的键；人为造碰撞会中止构建。产物 `key` 字段 0 / 971 |
| 深链直达（真实浏览器） | `#explore?job=7b95a9a0-qfxx` → 灯箱直接打开，页面显示的键与数据一致 |
| 关闭清理 | 关闭灯箱后地址栏回到 `#explore` |
| 找不到时 | 不开灯箱 + toast「找不到引用键 xxx 对应的作业」，不静默 |
| 旧深链不受影响 | `#explore` 正常；`#/explore?d=...&ar=...` 仍按 ADR-0010 重定向 |
| `npm run verify` / `--dist` | **48/48** / **48/48** |
| `npm test` | **11 文件 / 159 用例**（新增 24） |

#### 未做

本步只解决「作业能被指认」。**观察记录与结论落盘**（报告 2.3）尚未做 ——
引用键现在能指认一条作业、能在灯箱里看到、能深链直达，但「写下观察记录并把它挂到这条作业上」
还没有载体。属第 6 步。

### Round 13：观察记录与结论落盘（IndexedDB）（2026-11-10）

#### 问题

Round 12 给每条样本配了引用键，但**引用键本身不是数据** —— 它能指认一条作业，
却没有地方挂「我为什么关注它」「我从中看到了什么」。

收藏机制撑不住这件事，有确证的语义 bug：`explore-board.js` 的收藏键基于**提示词正文**的
FNV 哈希，而实测有 **34 条提示词重复（涉及 74 条作业）** → 同一条提示词的两次收藏会互相覆盖。

#### 决定

研究数据落到**本机 IndexedDB**，两类实体：

- **观察记录**：挂在**一条**样本上的笔记 / 假设 / 判断，带标签
- **结论**：一段文字 + 它**依据的样本集合**（`jobKeys[]`），不归属任何单条样本

#### 存储选型：先实测，再选

选型前用**真浏览器**量了四件事（不是查文档）：

| 能力 | 实测 |
| --- | --- |
| `file://` 下 IndexedDB | 建表 / 读写 / 索引全部可用，`isSecureContext = true` |
| IndexedDB 容量 | 20,000 条 1KB 记录（20 MB）未触顶 |
| localStorage 容量 | 实测 5042 KB ≈ 4.9 MB 即 `QuotaExceededError` |
| `file://` 跨目录 | 不同路径共享同一个库（origin 都是 `file://`） |

选 IndexedDB 的理由不是"更大"，而是**第 10 步要在同一个库上扩展**作业/拆解的查询下沉、
增量与导出 —— 塞进 localStorage 会在第 10 步被推翻重写。

#### 改动

| 位置 | 改动 |
| --- | --- |
| `webui/js/research-store.js`（新增） | 数据层唯一实现：库 `mj-research`（版本 1），store `notes` + `conclusions`，索引 byJob / byTs / byTag(multiEntry) |
| `webui/js/research-view.js`（新增） | 「研究笔记」视图：观察区段 / 结论区段 / 标签聚合 / 导出 JSON |
| `webui/js/explore-board.js` | 灯箱「写观察」入口 + 计数与列表 |
| `webui/js/workbench.js` | 第 7 个页签「研究笔记」+ 计数同步 |
| `webui/index.html` | 脚本加载顺序 |
| `scripts/verify-webui.mjs` | 新增 **13 条断言**（48 → 61） |
| `tests/researchStore.test.ts`（新增） | **18 个单元测试**（159 → 177） |

#### 三个实现细节值得记

1. **IndexedDB 事务不能跨 `await`** —— 规范允许浏览器在 await 让出微任务后自动提交事务，
   后续 `put` 会抛 `TransactionInactiveError`。所以更新走**「读事务 → 写事务」两步**，
   每个事务内部同步完成，不依赖脆弱时序。
2. **`researchchange` 用全局事件而不是冒泡** —— 观察记录弹层是**嵌套**在灯箱里的
   `mountDialog`，保存按钮的点击**不会冒泡到外层 backdrop**。改用
   `document.addEventListener('researchchange', ...)` 同步，灯箱关闭时移除监听。
3. **"页签数"断言不能写死** —— 旧断言写死"6 个页签"，加页签就得改断言。改为动态断言
   "DOM 页签数 == `TABS` 声明数"，以后加页签不用动断言。

#### 验证

| 项 | 结果 |
| --- | --- |
| `npm run build:webui-data` | 通过 |
| `npm run build` | 723 文件 / 19.31 MB / 14 个 JS / 4 个 HTML |
| `npm run verify` / `--dist` | **61/61** / **61/61** |
| 
| `npx vitest run` | **12 文件 / 177 用例**（新增 18） |
| 数据层浏览器探针 | **18/18** |
| 端到端浏览器探针 | **24/24** |

#### 未做

- **对照视图（2.2）** —— 并排比较、sref 码筛选，属第 8 步。
- **作业 / 拆解的查询下沉、增量、导出（4.1 完整版）** —— 第 10 步在同一个库 `mj-research` 上扩展。
- **跨作业对比分析** —— 结论可建、可挂作业、可看，但横向统计属第 8 步。

### Round 14：统一筛选引擎 + 研究样本库升为一级视图（2026-11-10）

#### 问题

两件事叠在一起：

1. **筛选有 4 套各写各的实现** —— `workbench.js`（分面词 + 主色 + 只看实测 + 搜索，带分面计数）、`explore-board.js`（批次 + 比例 + 只看有 sref + 搜索，**无计数、无分面、无分组语义**）、`style-library.js`（搜索）、`gallery.js`（分类 + 搜索）。每加一个数据源就多一套。
2. **筛选状态根本没进 URL** —— 静态 WebUI 三个页面的 `q` / `terms` / `colours` 全在内存里，**刷新即丢**。ADR-0010 只在 Vue 版落地（`src/utils/exploreHash.ts` + `facetFilter.ts`），静态版没有对应的独立解析器。

外加一个结构问题：探索榜是「词库的一个页签」（ADR-0013，2026-11-07 按用户要求修订），但 Q3 已裁定**社区数据是证据集、词库是假设集**，二者不该同层。

#### 决定

1. **抽出 `webui/js/filter-engine.js`：一个引擎 + 一套 URL 契约**，四个数据源共用。引擎是**纯函数、无依赖**（不碰 DOM、不碰 `window`），可被 `vm` 加载做单元测试。
2. **URL 沿用 ADR-0010 形态**：`#<页签>?<参数>`，与既有的 `#explore?job=<引用键>` 同一形态，不引入第二套写法。回写用 `history.replaceState`（改 hash 会触发重渲染 → 焦点丢失、灯箱被关）。
3. **探索榜升为一级视图「研究样本库」**（`VIEWS`），与「提示词库」「研究笔记」并列；二级页签（`LIBRARY_TABS`：4 个词库分类 + 艺术家）**只属于提示词库**。

详见 `docs/adr/0020-research-sample-library-is-top-level.md`（4.2 的独立裁决）。

#### 改动

| 位置 | 改动 |
| --- | --- |
| `webui/js/filter-engine.js`（新增） | 统一筛选引擎：`source` / `emptyState` / `cloneState` / `sameState` / `matches` / `filter` / `counts` / `parseHash` / `parseQuery` / `buildHash` / `isEmpty` |
| `webui/js/workbench.js` | 两级视图结构（`VIEWS` / `LIBRARY_TABS`）；提示词库筛选源接引擎；URL 回写；不认识参数丢弃 + 提示一次 |
| `webui/js/explore-board.js` | 研究样本库筛选源接引擎；批次 / 比例下拉显示**分面计数**；深链 `#explore?job=` → `#samples?job=` |
| `webui/js/style-library.js` | 风格库筛选源接引擎 + URL 读写 |
| `webui/js/gallery.js` | 画廊筛选源接引擎 + URL 读写；新增 `galleryFlat()` **展平缓存**（词库是三层结构） |
| `webui/index.html` / `style-library.html` / `gallery.html` | 加载 `js/filter-engine.js` |
| `webui/explore.html` | 空壳页 → 重定向页（`index.html#samples`） |
| `scripts/verify-webui.mjs` | 新增 **14 条断言**（61 → 75）；旧「页签数」断言拆成 4 条动态断言 |
| `tests/filterEngine.test.ts`（新增） | **53 个单元测试**（177 → 230） |

#### 三个实现细节值得记

1. **`parseQuery` 与 `parseHash` 必须分开** —— `parseHash` 自己拆页签与 query；调用方若已拆过页签还用 `parseHash`，会把 `x?batch` 当成参数名整段丢掉。本步初版用 `parseHash(src, '?x' + query)` 的 hack 实测**丢参数**，故引擎新增 `parseQuery(src, query)` 只解析 query 串。
2. **`q` 维度的权威位置是 `state.q`（顶层），不在 `dims` 里** —— 否则 `state.q` 与 `state.dims.q` 是**两处真相源**，改一处漏一处。
3. **回写 URL 必须用 `replaceState`** —— 改 `location.hash` 会触发 `hashchange` → 重渲染 → 搜索框输入焦点丢失、灯箱被重建关闭。

#### 验证

| 项 | 结果 |
| --- | --- |
| `npm run build:webui-data` | 通过（sref 源数据 82 条透传） |
| `npm run build` | 724 文件 / 19.34 MB / **15 个 JS** / 4 个 HTML |
| `npm run verify` | **75/75**（61 → 75） |
| `npx vitest run` | **13 文件 / 230 用例**（177 → 230，新增 53） |
| 端到端浏览器探针 | **27/27** |

#### 未做

- **sref 码筛选（2.2）** —— 是**按码值筛选**（不是布尔开关），属第 8 步，已在 `EXPLORE_FILTER_SOURCE` 注释里登记。
- **对照视图（2.2）** —— 并排比较，属第 8 步。
- **一级视图只覆盖左右方向键导航** —— 更完整的键盘导航属第 10 步的交互统一。

### 未闭合（登记，不阻断）

1. `CONTEXT.md:91 / :105 / :124` 三处措辞（`mj-session-v1`、恒为两栏、第 9 个页签）仍与实现不符，Q14 冻结未解除。
2. ~~15 条 11-08 作业无七段拆解，灯箱走空态。补齐需跑 `decompose:explore`，会抹掉 `config/explore-decomposed.yaml` 的未提交精修 → **`update:explore` / `decompose:explore` / `merge-fine-parts.mjs` 禁令继续生效**。~~ **Round 11 已解除**：禁令理由经复算不成立（原子写 + 版本过滤 942/942 一条不丢），更新链收敛为唯一入口并自带备份/回滚。待补条数随采集推进到 **29 条**（971 - 942），仍需配好 LLM 代理（`.env`）才能补齐。
3. `mid/` 640px 大图档未接入灯箱（Q9 挂账）。
4. `dist/` 单独拷走会丢图：探索榜 3828 张 + 风格榜 1600 张都在项目根 `public/`（`.gitignore` 排除）。Q2 A 已接受，README 已写明。
5. `webui/assets/styles-top/` 抽样图仍是 6 个旧码：public 默认模式下不影响；手动跑 sample 现在会被上述守门**中止且不留半成品**，不再静默产出 0/200。抽样图 basename 不匹配本身仍未修，恢复 sample 能力需重做抽样图（未排期）。
6. 窄屏页签遮挡（Q15）、`docs/screenshots/` 4 张 Vue 时代过期截图、38 M/D + 27 ?? 未提交改动 —— 维持原状（唯一新增 `??` 是 `tools/audit-decomposition.mjs`；备份在 `node_modules/.cache/` 内，被忽略）。

### 回退

Round 11 的回退：`package.json` 的 `update:explore` 改回 `npm run collect:explore && npm run decompose:explore && npm run build:webui-data && npm run build`（或原三步版），删除 `scripts/update-explore.mjs`、`更新探索榜.bat` 恢复原三步展开。本 ADR 章节与 README 修订一并回退。ADR-0017 是**未跟踪文件**，禁止用 `git checkout --` 回退。

Round 13 的回退：删除 `webui/js/research-store.js` 与 `webui/js/research-view.js`，
把 `webui/index.html` 的两行脚本标签去掉，从 `webui/js/workbench.js` 去掉第 7 个页签与
渲染分支，从 `webui/js/explore-board.js` 去掉灯箱里的研究记录区块，并回退
`scripts/verify-webui.mjs` 的 13 条新断言。**`mj-research` 库里的用户数据不会被删除** ——
删掉前端代码不等于删掉浏览器里的库；需要清库用「研究笔记」页签里的清空动作。

Round 14 的回退：删除 `webui/js/filter-engine.js`，把 `webui/index.html`、`webui/style-library.html`、`webui/gallery.html` 里的 `js/filter-engine.js` 脚本标签去掉，把四个数据源里接引擎的 `filter` / `matches` / `counts` 调用改回各自的本地实现，`webui/js/workbench.js` 的 `VIEWS` / `LIBRARY_TABS` 改回单层 `TABS`，`webui/explore.html` 改回空壳页，并回退 `scripts/verify-webui.mjs` 的 14 条新断言。**旧深链兼容不需回退** —— `#explore` → `#samples` 的重定向是纯加法，去掉它只会让第 5 步发出去的深链失效，不会破坏新链。
