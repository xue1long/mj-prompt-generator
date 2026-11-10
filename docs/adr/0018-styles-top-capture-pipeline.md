# 风格榜（styles_top）采集管线：从隔壁仓移植为本项目自有的 TypeScript 采集链

> **状态：移植已完成并验证**。目标实现见 `tools/collect-styles-top.ts`（`captureStylesTop` / `fetchStylesTop` / `buildStylesTopFromLocal`）+ `tools/build-styles-top.ts` + `tools/sync-styles-top-images.ts`，配套 `config/styles-top.yaml`（200 条）、`src/components/PromptBuilder/StylesTopLibrary.vue`、`tests/collect-styles-top.test.ts`。落地提交 `a25c4e9`（移植风格榜）、`b371c3d`（移植采集能力）。

## 背景

隔壁仓 `ai-video-imge-prompts` 有一套 `tools/styles_top.py`：登录态下抓取 Midjourney 官方 **styles_top 风格榜**的 200 个风格码（sref），匿名下载每个码 8 张题材缩略图，生成静态 `index.html` 画廊。它本身是个独立能力，与本项目的提示词库无耦合。

本项目需要一个「官方风格榜」数据源供 `StylesTopLibrary.vue` 查看（与 Midlibrary 风格*库*是**不同**的两份数据：Midlibrary 是艺术家/风格参考码，styles_top 是官方按热度排的风格榜，只有「码 + 8 张题材图」，没有艺术家/分面/提示词）。

移植的决策点：**(1)** 浏览器驱动用 Playwright 还是项目已有的 puppeteer-core；**(2)** 风格码清单的权威来源是文本文件还是本项目既有的 YAML 快照；**(3)** 是否沿用 Python 版的静态 HTML 画廊；**(4)** 移植后两份实现（Python 上游 + TS 移植）谁是当前项目的权威、如何防漂移。

## 决定

1. **整体移植为 TypeScript**，落点在 `tools/`，不跨仓调用 Python。理由：本项目是 Node/TS 单体，`npm run update:styles-top` 要一气呵成（捕获 → 下载 → 生成快照 → 构建 WebUI 数据 → 构建），跨仓调 Python 会引入解释器与环境耦合。源仓 Python 脚本保留不动，继续服务它自己的 `exports/styles_top/`。
2. **浏览器驱动用 puppeteer-core**（替换源仓的 Playwright）。`puppeteer-core` 已在 `devDependencies`，`verify` / `collect-explore` 已用它连本机 Chrome；再引 Playwright 会多一套浏览器内核与依赖。捕获函数 `captureStylesTop()` 懒加载 `puppeteer-core`，不污染核心下载链路（核心链路只用 `curl.exe` 通道，零运行时依赖）。
3. **风格码清单以 `config/styles-top.yaml` 为 canonical 来源**，不再依赖 `_srefs.txt`。`fetchStylesTop()` 默认从 YAML 读码；仅当 YAML 缺失时才回退到 `data/styles-top/_srefs.txt` 或隔壁仓 `exports/styles_top/_srefs.txt`。YAML 由 `buildStylesTopFromLocal()` 扫描**本地实际存在的图**生成（无图的码丢弃），构建期内联进 `dist/`（沿用 ADR-0003「双击即用」前提）。
4. **不移植 Python 版的静态 `index.html` 画廊**。本项目已有 `StylesTopLibrary.vue` 查看器 + 构建期内联的 YAML 数据，再产一份独立 HTML 是冗余。捕获产物只写 `data/styles-top/_srefs.txt` 作为中间态，最终汇入 `config/styles-top.yaml`。
5. **当前项目（MJ Prompt Generator）的权威实现是 TS 移植版**（`tools/collect-styles-top.ts`），因为它被 `npm run update:styles-top` 实际调用。Python 版（`ai-video-imge-prompts/tools/styles_top.py`）是隔壁仓自己的产物，只服务 `exports/styles_top/`，本项目的镜像方向是**单向**：隔壁仓改了捕获逻辑 → 视情况手工同步回本项目；反向不自动。
6. **CLI 约定**（单文件 + flag，无子命令解析器，与 `collect-explore.ts` 一致）：
   - 默认：读 `config/styles-top.yaml` 的码 → 下 8 张题材图（断点续传）。
   - `--capture`：先用 `captureStylesTop` 抓码再下（需已登录 MJ 的 Chrome，远程调试 9222）。
   - `-i <file>`：从自定义 sref 清单下（不走 config）。
   - `--top N` / `--dry-run` / `--no-build` / `--workers N` / `--timeout S` / `--retries N`：与源仓参数对齐。

## 考虑过的选项

| 选项 | 否决理由 |
|---|---|
| 直接在 TS 里 `child_process` 调隔壁仓的 `python tools/styles_top.py` | 跨解释器 + 跨仓相对路径（`../ai-video-imge-prompts/...`），`npm run update:*` 组合命令会脆；且源仓 Python 输出的是静态 HTML，本项目用不上。 |
| 捕获用 Playwright（与源仓一致） | 重复装一套浏览器内核，与本项目 `puppeteer-core` 既有的 Chrome 通道冲突；`verify` / `collect-explore` 已验证 puppeteer-core 连调试端口稳定。 |
| 保留 `_srefs.txt` 为权威、YAML 仅镜像 | YAML 已是本项目「数据单一来源」范式（Midlibrary 风格库、探索榜都是 YAML 内联）；让 `_srefs.txt` 当权威会制造第二个真相源，与全仓约定相悖。 |
| 移植静态 `index.html` 画廊 | `StylesTopLibrary.vue` 已覆盖查看需求，静态页冗余且无法接入构建期内联的参数/筛选体系。 |
| 把 styles_top 并进 Midlibrary 风格库 | 两者数据形态不同（官方榜只有码+8 图，无艺术家/分面/提示词），并进去会污染 `styles.yaml` 的分面模型（见 ADR-0008）。单独成文件 `styles-top.yaml` + 单独成类型 `styleTop.ts`。 |

## 后果

- **新增**：`tools/collect-styles-top.ts`、`tools/build-styles-top.ts`、`tools/sync-styles-top-images.ts`、`config/styles-top.yaml`（生成物）、`src/types/styleTop.ts`、`src/components/PromptBuilder/StylesTopLibrary.vue`、`src/stores/stylesTopStore.ts`、`tests/collect-styles-top.test.ts`、`package.json` 的 `build:styles-top` / `sync:styles-top-images` / `collect:styles-top` / `update:styles-top` 四条脚本。
- **授权**：styles_top 缩略图来自 `cdn.midjourney.com`，匿名直连可下（与探索榜同域，无需 cookie），画廊每张卡回链 MJ 原站（详情页 + CDN 原图），规避 Cloudflare 对 inline `<img>` 子资源的拦截。`config/styles-top.yaml` 标注为「内部参考（衍生，非官方）」。
- **断点续传 + 重试**：`fetchStylesTop` 用 `curl.exe` 通道（Schannel 的 TLS 指纹像浏览器）+ 并发 + 已存在且有效 WebP 跳过，网络抖动/挑战页只需重跑本命令续传；失败只在 summary 记录，不中断其余下载。
- **捕获需登录态**：`captureStylesTop` 连的是**已登录 midjourney.com** 的 Chrome（远程调试 9222），从完整 DOM（`$$eval` 抠 `/styles/0_<code>`）提取全部码，滚到底（本屏无新增即停）后去重写 `data/styles-top/_srefs.txt`。与源仓 `cmd_capture` 算法逐行等价（含 `finally { disconnect() }` 收尾）。
- **双实现漂移风险（已登记，未完全消除）**：捕获逻辑现在两份（Python 上游 + TS 移植）。MJ 改榜单 DOM 时两份都得修。当前约定是**单向镜像**（源仓改 → 手工同步回本项目），不自动。详见下方「已知缺陷」。
- **图片不入库**：`public/preview-images/midjourney-styles-top/` 被 `.gitignore` 排除（约 216.7 MB），靠 `collect-styles-top` / `sync-styles-top-images` 落地，保证双击 `dist/` 离线可用（与探索榜同策略）。

## 验证记录

| 项 | 结果 |
|---|---|
| 单元（vitest） | `tests/collect-styles-top.test.ts`：URL 模板、WebP 校验、码清单读取（config/yaml 与 txt 两路）、`fetchStylesTop` dry-run 任务数（2 码 × 8 = 16）、`buildStylesTopFromLocal` 只收有图的码 —— 全过 |
| 快照 | `config/styles-top.yaml` 200 条 entries，与源仓 `_srefs.txt` 的 200 码一致 |
| 构建链 | `npm run update:styles-top` = `collect:styles-top` → `build:styles-top` → `build:webui-data` → `build`，产物含官方榜 200 组 |
| 捕获（手动，需登录 Chrome） | `npm run collect:styles-top -- --capture` 连 CDP 抓码写入 `data/styles-top/_srefs.txt`，逻辑与源仓 `cmd_capture` 等价 |

## 已知缺陷（已登记）

- **双实现漂移**：捕获逻辑在 Python 上游与 TS 移植各存一份，无自动同步。触发条件：MJ 改 styles_top 榜单 DOM（如卡片 `<a>` 选择器变化）。缓解：改 TS 移植版（本项目实际调用者）后，若隔壁仓仍用 Python 版，手工把选择器/到底判定同步回去；本 ADR 为唯一记录点。
- **捕获无单测**：`captureStylesTop` 需真 Chrome + 登录态，未纳入 vitest；已覆盖的是纯函数（URL 构造、WebP 校验、码清单读取）。
- **`capture` 默认落盘 `data/styles-top/_srefs.txt` 不在 canonical 链上**：`--capture` 跑完会把码写进 `_srefs.txt`，但 `buildStylesTopFromLocal` 的 canonical 是 `config/styles-top.yaml`；需再跑一次 `build`/`update` 把 `_srefs.txt` 的内容并回 YAML（CLI 已自动串起 `--capture → fetch → build`）。

## 收口状态

- 移植的可执行部分：完成，四条 `npm` 脚本 + Vue 查看器 + 单测均在位。
- 未闭合 1 项：双实现漂移的自动同步机制（当前为单向手工镜像，本 ADR 登记为已知缺陷，未排期自动化）。
