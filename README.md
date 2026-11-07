# MJ Prompt Generator

一个**本地运行**的 Midjourney 提示词生成器，专为摄影爱好者和设计师打造。
点选摄影术语、光线方案与艺术家风格，实时拼出一条可直接粘贴到 Midjourney 的提示词。

纯前端应用，**不需要后端、不需要联网**，构建产物双击即用。

---

## ✨ 功能特性

- 🎨 **摄影提示词库** —— 5 个一级分类 / 22 个二级分类 / **156 条**中英双语摄影提示词
- 🔭 **探索榜** —— 独立页面 `#/explore`：浏览 Midjourney 社区的作业成图（**942 条作业 / 3,768 张图**，来自隔壁仓存量导入 + 每日自采，保留最近 14 天），按日期 / 宽高比 / 有无风格参考码筛选，看中哪条就一键填进「主体与环境」或 `--sref`
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

浏览器会自动打开 <http://localhost:5173>。

### 打包成一个"双击即用"的版本

```bash
npm run build
```

产物在 `dist/`。**直接双击 `dist/index.html` 就能用**，不需要起服务器，也不需要装 Node。
把整个 `dist/` 文件夹拷给谁，谁就能直接打开（预览图是相对路径，整个文件夹一起拷即可）。

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

冒烟验证（`npm run verify`）会真实打开应用，检查：应用挂载、参数区展开、参数数量、版本联动是否正确置灰、
最终提示词是否正确组装、刷新后会话是否恢复。开发服务器没启动时它会自动跳过，只验证 `dist/`。
它需要本机装有 Chrome 或 Edge，并已安装 `puppeteer-core`（已在 devDependencies 中）。

截图会写到 `docs/screenshots/`。

---

## 📁 目录结构

```
MJ Prompt Generator/
├─ config/                 ← 配置（构建期内联进产物）
│  ├─ prompts.yaml           提示词词库（手写）
│  ├─ styles.yaml            风格库快照（**生成物，勿手改**）
│  └─ parameters.yaml        参数定义 + 版本兼容关系
├─ skills/                 ← 配套的 Agent 技能包（源码）
│  └─ midjourney-prompt-writing/
├─ tools/                  ← 项目自有工具
│  ├─ export-vocab.ts        词库 → 技能包的导出脚本
│  ├─ build-styles.ts        Midlibrary manifest → config/styles.yaml
│  └─ sync-style-images.ts   Midlibrary 缩略图 → public/preview-images/midlibrary/
├─ evals/                  ← 技能包冒烟样例与断言
├─ docs/
│  ├─ 参数事实表.md           每个参数的官方出处、取值范围与官方文档的矛盾登记
│  ├─ Midlibrary筛选规则分析.md  上游风格库的筛选规则（实测口径见文首）
│  ├─ 风格库筛选方案.md         本项目风格库筛选的分档方案（A/B/C 档）
│  ├─ sources/               官方文章的离线快照
│  └─ adr/                   决策记录
├─ public/preview-images/  ← 预览图（midlibrary/ 子目录是生成物，见 .gitignore）
├─ scripts/
│  ├─ yamlConfigPlugin.ts    把 config/*.yaml 在构建期内联的 Vite 插件
│  └─ convert-images.js      PNG → WebP 转换脚本
├─ src/
│  ├─ components/            界面组件
│  ├─ stores/                Pinia 状态
│  ├─ types/                 类型定义
│  └─ utils/                 组装器、版本兼容、会话持久化
├─ tests/                   vitest 测试
├─ CONTEXT.md               术语表
├─ NOTICE.md                第三方内容与授权条件
└─ vite.config.ts
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

开发模式下保存 YAML 会自动整页刷新；发布版本需要重新 `npm run build`。

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

顶部的「探索榜」是一个**独立页面**（`#/explore`），不是提示词库里的页签：它占满整屏，用来看社区最近做出了什么。

| 内容 | 数量（当前快照） | 说明 |
| --- | ---: | --- |
| 作业 | **942 条** | 一条社区生成 = 一条原始提示词 + 四格成图 + 作者名 |
| 成图 | **3,768 张 × 2 档** | `thumbs/` 320px WebP（63 MB，网格与缩略图条）+ `mid/` 640px WebP（429 MB，灯箱与下载） |
| 批次 | 每天一份（当前 6 份） | 只保留最近 **14 天**，旧的连图一起清 |

**网格上一张卡 = 一条作业**（不是一张图）：主图按作业自己的宽高比显示、不裁切，下面是标题（提示词前 81 字）+ 作者 / 日期 / 版本 + 宽高比与 sref 标签，最底下一排**四格缩略图条**——点哪一格就换哪一格当主图，点主图开灯箱。灯箱里是同一套「大图 + 缩略图条」，并且**打开时停在你刚看的那一格**。每张卡和灯箱都有下载按钮（下载当前那一格的 640px 档）。

数据有两条来路：

1. **一次性导入隔壁仓的存量**（`ai-video-imge-prompts` 已采的 6 天榜单，1016 条作业 / 4064 张图）→ 320px 重编码 + 640px 直接拷贝；
2. **此后每天由本项目自己采**：打上游匿名接口取当天的榜单 → 下载两档图 → 写快照 `config/explore.yaml`（构建期内联）。

两条来路按**作业 id** 合并；同一个作业跨天上榜时，批次取**第一次采集到的那天**，历史批次才不会随每天重采而搬家。**采集失败即中止，保留上一份快照与旧图**，宁可给旧数据也不让页面开天窗。

> ⚠️ 两档图都进 `dist/`（保证双击 `index.html` 离线可用），所以 `dist/` 约 **700 MB**。如果只想要轻量版，删掉 `public/explore/mid/` 后重构建——灯箱会退回 320px 档。

```bash
npm run collect:explore     # 只采集（写 config/explore.yaml 与 public/explore/{thumbs,mid}/）
npm run collect:explore -- --import   # 从隔壁仓导入存量数据（首次安装时跑一次）
npm run update:explore      # 采集 + 重新构建（dist 永远是新的）
```

Windows 上要每天自动更新，可以把仓库根目录的 `更新探索榜.bat` 挂到计划任务。

**作业不是提示词条目。** 一条作业是别人写好的**整条**成品提示词，不是能拼进提示词的片段，所以它不进「已选提示词」；点「填入主体与环境」把它整条放进你手写的那一栏（已有内容时会让你选覆盖还是追加），点「填入 --sref」则把风格参考码放进参数框。

筛选条件（日期 / 宽高比 / 有无 sref / 搜索词）写在 URL hash 里（`#/explore?ar=9:16`），可后退、可分享、可刷新复现。筛选粒度是**作业**（一条作业四格一起命中或一起排除）。

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
| 配置加载 | 运行时 `fetch` 读 `public/config/*.yaml` | 构建期内联成虚拟模块，运行时零请求，产物可双击打开 |
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
