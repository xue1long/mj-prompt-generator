# MJ Prompt Generator

一个**本地运行**的 Midjourney 提示词生成器，专为摄影爱好者和设计师打造。
点选摄影术语、光线方案与艺术家风格，实时拼出一条可直接粘贴到 Midjourney 的提示词。

纯前端应用，**不需要后端、不需要联网**，构建产物双击即用。

> **当前实现状态（2026-11-10）**：正式前端是 `webui/` 下的静态多页 WebUI（原 Vue SPA 仅以 `legacy:*` 保留）；探索榜 957 条 / 7 批次、官方风格榜 200 组；`dist/` 720 文件 / 19.25 MB。**配图引用项目根 `public/`，`dist/` 必须在项目根内打开，单独拷走会丢图。** 下文部分章节仍描述 Vue 时代实现，已在相应处标注；权威决策见 [ADR-0017](docs/adr/0017-static-webui-replaces-vue-spa.md)。

---

## ✨ 功能特性

- 🎨 **摄影提示词库** —— 5 个一级分类 / 22 个二级分类 / **156 条**中英双语摄影提示词
- 🔭 **探索榜** —— 工作台的第 6 个页签（深链 `#explore`）：浏览 Midjourney 社区的作业成图（**957 条作业 / 3,828 张缩略档图**，来自隔壁仓存量导入 + 每日自采，保留最近 14 天），按日期 / 宽高比 / 搜索词筛选，看中哪条就一键填进「主体与环境」；其中 **81 条带真实 `--sref` 风格参考码**，可用「只看有 sref」筛出来并一键填进 `--sref` 参数
- 🖼️ **预览图** —— 156 张示例图，悬停标签即可预览，并附上当初生成它的提示词供参考
- 🖼️ **提示词画廊** —— 浏览所有带预览图的提示词，一键取用
- 🖌️ **风格库** —— **4,322 位**艺术家（画家 / 插画师 / 摄影师 / 设计师…）并入「艺术家/摄影师」分类；**4,638 个**风格参考码在「风格参考码」页签里搜名字查码，一键填进 `--sref` 参数
- 🔎 **筛选** —— 风格库可按「编辑精选 / 只看实测」收窄，还能按 **68 个分面词**（10 组：风格质量 / 主题 / 技法 / 配色 / 情绪…）与 **96 个主色**筛（组内任一、组间全部）；条件写在 URL hash 里（`#/style-codes?term=detailed&colour=blue`），可后退、可分享、可刷新复现
- 🔍 **全局搜索** —— `Ctrl+K`（Mac：`Cmd+K`）唤起，中英文模糊匹配
- ⚙️ **参数设置（可折叠）** —— 位于提示词库下方，可收起／展开，收起时仍显示当前参数摘要；覆盖官方现行图片类参数，**按模型版本联动**：当前版本不支持的参数自动置灰并说明原因
- 📝 **主体与环境输入** —— 内置示例模板，一键填充
- 🖱️ **拖动排序** —— 已选提示词可拖拽调整顺序
- ✂️ **手动编辑** —— 最终提示词可手动改写，一键重置回自动生成
- 💾 **会话持久化** —— 已选提示词、主体环境、参数值都存在本地，刷新页面不丢
- 🌗 **亮/暗双主题**

---

## 🚀 快速开始

需要 Node.js 18 或更高版本。

```bash
npm install
npm run dev
```

`dev` 是 Node 内置 http 静态服务（非 Vite），监听 <http://127.0.0.1:5173/>，**不会自动打开浏览器**，需手动访问。

### 打包成一个"双击即用"的版本

```bash
npm run build:webui-data   # 可选：从 config/*.yaml 重建数据产物（默认 public，两域全量配图）
npm run build
```

产物在 `dist/`。**直接在项目根内双击 `dist/index.html` 就能用**，不需要起服务器，也不需要装 Node。

> ⚠️ **不要只拷 `dist/` 文件夹**：探索榜与风格榜的配图以 `../public/...` 引用项目根 `public/`，单独拷走会丢图。要分发需连同项目根 `public/` 一起，或单独排期把图复制进 `dist/`。

```bash
npm run preview     # 用本地服务器预览 dist/（可选）
```

---

## 🧪 测试

```bash
npm test          # 单元测试：组装规则 + 版本兼容规则
npm run verify    # 冒烟验证：用本机 Chrome/Edge 真实渲染（需已 npm run build）
```

单元测试覆盖四件关键事：

- **提示词组装规则** —— 固定顺序（摄影前缀 → 机位 → 主体环境 → 光线 → 其他 → 参数）与参数输出规则
- **版本兼容规则** —— 切换模型版本后，不支持的参数被清除、越界的滑块值被收敛
- **词库导出同步** —— 技能包里的摄影词库快照与 `config/prompts.yaml` 保持一致（改了 YAML 忘了重新导出，测试会失败）
- **风格库数据** —— 风格条目与风格参考码的形状、码形如 `--sref <数字>`、风格条目并入词库时不与手写条目重名、风格参考码不进词库
- **筛选** —— 筛选引擎的语义（组内任一、组间全部、主色并集、计数口径）与 URL 契约（白名单、非法参数丢弃、往返一致）

冒烟验证（`npm run verify`）用本机 Chrome/Edge 以 `file://` 真实打开 `webui/` 下的四个页面，默认**不依赖 dev server**；加 `--dist`（`node scripts/verify-webui.mjs --dist`）才校验构建产物。当前共 45 项断言，覆盖渲染、全量数据契约（阈值取自产物统计对象，采集后无需改数字）、分页与空态降级、**sref 如实透传与「只看有 sref」端到端可用**、会话 / 主题 / 旧 hash 迁移、参数折叠态、窄屏基线。
它需要本机装有 Chrome 或 Edge，并已安装 `puppeteer-core`（已在 devDependencies 中）。

`docs/screenshots/` 下 4 张是 Vue 时代截图，已与现行静态 WebUI 不符，重拍留待单独视觉轮次。

---

## 📁 目录结构

```
MJ Prompt Generator/
├─ config/                 ← 配置与数据快照（构建期读取）
│  ├─ prompts.yaml           提示词词库（手写）
│  ├─ parameters.yaml        参数定义 + 版本兼容关系
│  ├─ styles.yaml            风格库快照（生成物，勿手改）
│  ├─ explore.yaml           探索榜作业快照（生成物，957 条 / 7 批次）
│  ├─ explore-decomposed.yaml  七段拆解（生成物，942 条；15 条待精拆走空态；内容是 JSON）
│  └─ styles-top.yaml        官方风格榜 200 码（生成物）
├─ webui/                  ← 正式前端（静态多页，无编译步骤）
│  ├─ index.html / gallery.html / style-library.html / explore.html
│  ├─ js/                    会话、词库、参数、探索榜、风格库 + data-*.js（生成物）
│  ├─ css/app.css
│  └─ assets/               抽样图（入库；默认 public 模式下不参与）
├─ public/                 ← 全量图（生成物，.gitignore 排除）：explore/thumbs 320px、
│                            explore/mid 640px、preview-images/midjourney-styles-top
├─ scripts/                ← 静态服务 / 构建 / 数据生成 / 冒烟校验（.mjs）
├─ src/ + vite.config.ts   ← 退役的 Vue SPA 源码（回退点，legacy:* 可重建）
├─ tools/                  ← 采集、导出、拆解等 TypeScript 工具
├─ skills/                 ← 配套 Agent 技能包
├─ evals/ / tests/ / docs/adr/
├─ CONTEXT.md              术语表（只定义领域语言）
└─ NOTICE.md               第三方内容与授权条件
```

---

## ✏️ 改词库

编辑 `config/prompts.yaml`，结构是两级分类：

```yaml
categories:
  - id: shutter-speed
    name: 快门速度
    icon: timer-outline
    special:
      positionTag: camera      # 位置标签，决定它在最终提示词里的位置
    subCategories:
      - id: high-speed
        name: 高速摄影
        prompts:
          - id: highspeed-photography
            prompt_zh: 高速摄影
            prompt_en: highspeed photography
            preview: shutter-speed/highspeed-photography.webp
            generationPrompt: "photography, highspeed photography, ..."
```

- `positionTag` 取值：`artist` / `camera` / `lighting` / `other`
- `preview` 相对于 `public/preview-images/`
- `generationPrompt` 只用于展示，不参与组装

静态 WebUI 不监听 YAML：改完 `config/*.yaml` 需依次跑 `npm run build:webui-data`（重建 `webui/js/data-*.js`）与 `npm run build`（同步 `dist/`）。Vue 时代的 Vite HMR 只在 `npm run legacy:dev` 下有效。

---

## 🖌️ 风格库（Midlibrary）

「风格库」是另一份数据，**不是手写的**：它的单一来源是 [Midlibrary 风格库](https://midlibrary.io/library)的 manifest（在隔壁仓 `ai-video-imge-prompts` 里采集），本仓只持有导出快照 `config/styles.yaml`。

| 内容 | 数量 | 去处 |
| --- | ---: | --- |
| 风格条目（艺术家 / 摄影师 / 插画师 / 设计师…） | 4,322 | 并进「艺术家/摄影师」分类，按画师类目分二级分类 |
| 风格参考码（`--sref <码>`） | 4,638 | 「风格参考码」页签：搜名字查码，一键填进参数 |
| 分面词（10 组：风格质量 / 主题 / 技法 / 配色 / 情绪 / 类型 / 媒介 / 构图 / 视觉效果 / 题材） | 68 | 筛选面板（组内任一、组间全部） |
| 主色 | 96 | 筛选面板（多选取并集，带色块） |

两者的性质不同：**风格条目是提示词片段**（进词库参与组装），**风格参考码是参数**（只进 `--sref` 参数框，不进词库）——见 [ADR-0009](docs/adr/0009-style-code-is-a-parameter-not-a-fragment.md)。

分面词与主色来自同站的详情层（`data/details.json`），采集覆盖 **8,960 / 8,960 = 100%**。筛选语义与上游的区别见 [风格库筛选方案](docs/风格库筛选方案.md)。

更新流程（两步）：

```bash
# 1. 隔壁仓补齐缩略图
cd ../ai-video-imge-prompts && python tools/fetch.py --site midlibrary --tier thumb

# 2. 本仓重新生成快照并复制预览图
npm run build:styles        # → config/styles.yaml
npm run sync:style-images   # → public/preview-images/midlibrary/
```

`config/styles.yaml` 与 `public/preview-images/midlibrary/` 都是**生成物**：前者不要手改，后者不进版本库（`.gitignore` 已排除，约 185 MB）。

授权是**有条件**的：站方书面许可，允许个人学习用途的镜像（含图片），条件是**署名 + 回链**。每张卡片上的「Midlibrary ↗」就是回链，完整声明见 [NOTICE.md](NOTICE.md)。

---

## 🔭 探索榜（Midjourney Explore）

「探索榜」是工作台提示词库的**第 6 个页签**（深链 `#explore`），左栏会话 Dock 常驻，右栏只切换内容；旧链接 `#/explore?...` 会自动重定向到 `#explore`。

| 内容 | 数量（当前快照） | 说明 |
| --- | ---: | --- |
| 作业 | **957 条** | 一条社区生成 = 一条原始提示词 + 四格成图 + 作者名 |
| 配图 | **3,828 张 × 2 档** | `thumbs/` 320px WebP（网格与灯箱，**当前唯一接入的档位**）+ `mid/` 640px WebP（大图档，**代码尚未接入**，见 ADR-0017 Round 8） |
| 七段拆解 | 942 条 | 11-08 新增的 15 条暂无拆解，灯箱走空态，不杜撰 |
| 批次 | 每天一份（当前 7 份） | 只保留最近 **14 天**，旧的连图一起清 |

**拆解结果分三种来源，灯箱会如实标注**：`手工精拆 · 已验收基准`（3 条）、`LLM 逐条精拆`（50 条）、`规则解析 · 未精拆`（889 条）。
规则解析是确定性关键词匹配、**从未经过 LLM**，每段只保留前 3 个短语、note 多为模板句，所以看起来「没拆完」不是模型偷懒；15 条无拆解的作业走空态、不显示徽章。判断一条拆解是否可靠，先看灯箱顶部的来源徽章。可复现的只读审计见 `node tools/audit-decomposition.mjs --top 20`。
**网格上一张卡 = 一条作业**（不是一张图）：主图按作业自己的宽高比显示、不裁切，下面是标题（提示词前 81 字）+ 作者 / 日期 / 版本 + 宽高比与 sref 标签，最底下一排**四格缩略图条**——点哪一格就换哪一格当主图，点主图开灯箱。灯箱里是同一套「大图 + 缩略图条」，并且**打开时停在你刚看的那一格**。当前未实现下载按钮；640px 大图档 `mid/` 也尚未接入灯箱（见上表）。

数据有两条来路：

1. **一次性导入隔壁仓的存量**（`ai-video-imge-prompts` 已采的 6 天榜单，1016 条作业 / 4064 张图）→ 320px 重编码 + 640px 直接拷贝；
2. **此后每天由本项目自己采**：打上游匿名接口取当天的榜单 → 下载两档图 → 写快照 `config/explore.yaml`（构建期由 `build:webui-data` 读取）。

两条来路按**作业 id** 合并；同一个作业跨天上榜时，批次取**第一次采集到的那天**，历史批次才不会随每天重采而搬家。**采集失败即中止，保留上一份快照与旧图**，宁可给旧数据也不让页面开天窗。

> ⚠️ 配图**不复制进 `dist/`**：静态 WebUI 以 `../public/...` 引用项目根的全量图，`dist/` 只有 720 文件 / **19.25 MB**。代价是 `dist/` 脱离项目根单独分发会丢图（裁决与取舍见 ADR-0017 Round 8）。`public/` 下的图由采集链生成、不进版本库。

```bash
npm run collect:explore     # 只采集（写 config/explore.yaml 与 public/explore/{thumbs,mid}/）
npm run collect:explore -- --import   # 从隔壁仓导入存量数据（首次安装时跑一次）
npm run update:explore      # 【唯一入口】采集 → 分解 → 烘焙 → 构建，dist 永远是新的
```

**更新链只有这一条入口**（`scripts/update-explore.mjs`），四步固定顺序：

| 步骤 | 做什么 | 失败后果 |
| --- | --- | --- |
| 1 采集 | 写快照 `config/explore.yaml` + 下载配图 | **致命**，旧快照与旧图保留 |
| 2 分解 | 写 `config/explore-decomposed.yaml`（要 LLM 代理） | **只告警、不阻断** —— 新作业走灯箱空态，其余数据照常更新 |
| 3 烘焙 | `config/*.yaml` → `webui/js/data-*.js` | **致命**，中止，不更新 `dist/` |
| 4 构建 | `webui/` → `dist/` | **致命** |

没配 LLM 代理时用下面两个开关：

```bash
npm run update:explore:no-decompose   # 跳过分解（其余三步照跑）
npm run update:explore:collect-only  # 只采集，不烘焙不构建
```

分解步骤会自动备份派生文件到 `node_modules/.cache/mj-update-backup/`，失败时自动回滚 —— 942 条精拆成果不会被抹掉。

Windows 上要每天自动更新，可以把仓库根目录的 `更新探索榜.bat` 挂到计划任务。它只是 `npm run update:explore` 的**薄包装**（流程只定义在一处，改流程不用动它）。

**作业不是提示词条目。** 一条作业是别人写好的**整条**成品提示词，不是能拼进提示词的片段，所以它不进「已选提示词」；点「填入主体与环境」把它整条放进你手写的那一栏（已有内容时会让你选覆盖还是追加），点「填入 --sref」则把风格参考码放进参数框。

筛选由工具条控制（日期 / 宽高比 / 搜索词）；旧 `#/explore?...` 深链重定向到 `#explore` 页签，查询参数不保证保留。筛选粒度是**作业**（一条作业四格一起命中或一起排除）。

授权与署名见 [NOTICE.md](NOTICE.md)，设计取舍见 [ADR-0013](docs/adr/0013-explore-board-is-its-own-page-collected-daily.md) 与 [ADR-0014](docs/adr/0014-explore-cards-are-jobs-with-grid-switcher.md)。

---

## 🎛️ 改参数

编辑 `config/parameters.yaml`。**兼容关系写在这里，不写在代码里**：

```yaml
  - id: quality
    name: 质量
    type: select
    param: --q
    default: "1"
    versions: ["6.0", "6.1", "7"]      # 只在这些模型版本下有效
    optionsByVersion:                   # 按版本覆盖选项
      "6.1":
        - { value: "0.5", label: "快速 (0.5)" }
        - { value: "1", label: "标准 (1)" }
      "7":
        - { value: "1", label: "标准 (1)" }
        - { value: "4", label: "超高质量 (4)" }
```

可用字段：

| 字段 | 含义 |
|---|---|
| `versions` | 该参数在哪些模型版本下有效；缺省 = 全版本有效 |
| `optionsByVersion` | 按模型版本覆盖下拉选项 |
| `defaultByVersion` | 按模型版本覆盖默认值 |
| `rangeByVersion` | 按模型版本覆盖滑块范围 |
| `alwaysEmit` | 取默认值时也照常输出 |
| `flagOnly` | 只输出参数名、不带值（如 `--raw`） |
| `flagFromValue` | 把选项值本身当作参数名（如 `--hd`） |

选项级字段：`param`（覆盖参数名，如 `--niji`）、`paramValue`（覆盖参数值）、`flagOnly`。

> ⚠️ 参数的取值与版本归属以 **Midjourney 官方帮助中心** 为准，不要凭印象填。
> 逐条出处见 [`docs/参数事实表.md`](docs/参数事实表.md)。

---

## 🤖 配套 Agent 技能包

`skills/midjourney-prompt-writing/` 是一个独立的 Agent 技能包，让 AI 助手按本教程的方法论帮你写 Midjourney 提示词。

```bash
npm run export:vocab    # 改了 config/prompts.yaml 后，把词库同步进技能包
```

**技能包自己带的东西：**

| 文件 | 内容 |
|---|---|
| `SKILL.md` | 交付流程、硬性红线、什么时候读哪个参考文件 |
| `references/method.md` | 七段式结构、关键词 vs 描述句、构图五法、控图工作流 |
| `references/vocab-style.md` | 画风、流派、构图、镜头质感、情感词 |
| `references/vocab-photography.md` | **生成物** —— 由 `tools/export-vocab.ts` 从 `config/prompts.yaml` 导出 |
| `references/param-whitelist.md` | V8.2 参数合法性白名单、组合冲突、版本决策路径 |
| `references/templates.md` | 8 套场景模板 + 3 套漂移策略改写版 |
| `references/drift-control.md` | 短剧/漫剧：情绪板、四类漂移、三套策略、出图前自检 SOP |
| `references/glossary.md` | 术语表（规范名） |
| `references/legacy-note.md` | 旧写法为什么在 V8.2 下无效（历史附录） |

**两条边界：**

- 技能包**不复制**参数的取值范围与版本归属表 —— 那些以 `midjourney-doc-facts` 技能为准（见 [ADR-0006](docs/adr/0006-param-facts-reference-not-copy.md)）。
- 技能包里的摄影词库是 `config/prompts.yaml` 的**导出快照**，不手改（见 [ADR-0005](docs/adr/0005-vocab-single-source-exported-snapshot.md)）。

安装到本机的共享技能库并分发：

```bash
skills-manager-cli skills install --local ./skills/midjourney-prompt-writing
skills-manager-cli skills deploy midjourney-prompt-writing --agent deepseek_harness --agent workbuddy --agent claude_code --agent codex
```

冒烟样例与断言在 `evals/midjourney-prompt-writing/evals.json`。

---

## 🔀 与上游的差异

本项目以 [xueshanlinghu/MJPromptGenerator](https://github.com/xueshanlinghu/MJPromptGenerator)（MIT）的源码为底座本地化，主要改动：

| 方面 | 上游 | 本项目 |
|---|---|---|
| 配置加载 | 运行时 `fetch` 读 `public/config/*.yaml` | `build:webui-data` 预生成 `webui/js/data-*.js`，运行时零请求，产物可双击打开 |
| 参数数量 | 13 个（含 `--stop`、`--style original`、`--cref` 等已失效项） | 24 个，覆盖官方现行图片类参数 |
| 版本兼容 | 无，所有参数对所有版本可见 | 按官方兼容矩阵联动，不支持的参数置灰并说明原因 |
| 会话持久化 | 只写了参数值，且从未读回；选中的提示词一刷新就没 | 已选提示词 + 主体环境 + 参数值一起存取 |
| 仓库随附 | GitHub Pages 部署工作流 | 移除，改为本地运行 |

决策记录见 [`docs/adr/`](docs/adr/)。

---

## 📖 术语

领域词汇见 [`CONTEXT.md`](CONTEXT.md)。

---

## 🙏 致谢

- 本项目基于 [xueshanlinghu/MJPromptGenerator](https://github.com/xueshanlinghu/MJPromptGenerator)（作者：雪山凌狐）的源码本地化。
- **特别感谢野菩萨老师及其团队在摄影提示词整理和专业指导方面提供的宝贵支持**，使本项目能够提供专业、全面的摄影提示词库。

## License

MIT —— 见 [LICENSE](LICENSE)。

**代码**是 MIT；随项目分发的第三方内容（Midlibrary 风格库及其样例图、Midjourney 探索榜的成图与提示词）受各自站点的条件约束，见 [NOTICE.md](NOTICE.md)。
