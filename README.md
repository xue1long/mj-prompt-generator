# MJ Prompt Generator

**Midjourney 提示词研究工作台** —— 用真实社区生成当素材，研究「什么样的提示词产出什么样的画面」，再把研究到的结论回用到自己的创作里。

纯本地运行：不需要后端、不需要联网、不需要 API Key。

---

## 它是什么

组装提示词只是研究闭环里的一步 —— **复用验证**。本项目的重心在「研究」这一侧：

| | 角色 | 装什么 |
|---|---|---|
| **提示词库** | 假设集 | 133 条摄影术语（快门 / 景深 / 镜头 / 光线）—— **待检验的假设** |
| **研究样本库** | 证据集 | 1044 条社区真实作业（原提示词 + 四格成图 + 作者）—— **可回指的证据** |
| **候选词条** | 对质界面 | 631 条社区高频措辞 × 词库覆盖度 —— 「我的词库漏了什么」第一次可见 |
| **对照** | 方法 | 两条样本并排，固定变量再下结论 |
| **研究笔记** | 产出 | 观察记录与结论，存在本机 IndexedDB |
| **风格榜** | 参照语料 | Midjourney 官方热度榜 200 个风格码 |
| **资料库** | 自采资料 | 你自己收集的提示词与图片，尚未成为研究证据 |

**核心主张**：词库是研究者的先验假设，社区数据是证据集。两者此前是两套互不相通的文本 —— 社区 prompt 里高频出现 `background`，你的词库里没有，也没人知道该不该记下来。这个项目让它们能对质。

> 领域语言以 [`CONTEXT.md`](CONTEXT.md) 为准（只定义术语，不描述实现）。设计取舍见 [`docs/adr/`](docs/adr/)（30 条 ADR）。

---

## 快速开始

需要 **Node.js 18+**。

```bash
npm install
npm run dev
```

`dev` 是 Node 内置 http 静态服务（**不是 Vite**），监听 <http://127.0.0.1:5173/>，**不会自动打开浏览器**，需手动访问。

### 打包成「双击即用」的版本

```bash
npm run build      # webui/ → dist/
```

产物在 `dist/`（**35 文件 / 7.4 MB，只放代码**）。**在项目根内双击 `dist/index.html` 就能用** —— 不需要起服务器，也不需要装 Node。

> ⚠️ **不要只拷 `dist/` 文件夹**：全部配图统一以 `../public/…` 引用项目根 `public/`（**唯一图片命名空间**），单独拷走会丢图。
>
> 这是**明确承担的代价**，不是待修缺陷 —— `public/` 下 21,273 张图里绝大多数是采集链生成物、本就不入库。`public/preview-images/tracked/`（448 张）与 `public/preview-images/thumbs/`（133 张）是**入库**的，`git clone` 后不跑采集链也有完整配图。

```bash
npm run preview    # 用本地服务器预览 dist/（可选）
```

### 资料库的编辑工作流

资料库的数据真相源是项目文件：`data/materials/items/<id>.json` + `public/materials/*.webp`，两者都**入库**，换设备 `git clone` 即可带走。

| 场景 | 能做什么 |
|---|---|
| 双击 `dist/index.html`（`file://`） | 七个视图照常浏览，资料库可筛选、可导出，但**只读** —— 导入 / 补传 / 删改按钮禁用并提示 `npm run dev` |
| `npm run dev` | 资料库可编辑。每次增删改经本机 `/api/materials` 落盘并自动重烘焙，页面即时刷新 |
| 批量兜底 | `npm run import:materials -- <清单.json> <图片目录>`（清单只支持 JSON；CSV / Markdown 请用导入抽屉） |

单独重烘焙：`npm run build:materials`。`npm run preview --dist` 对资料库写接口一律 403 —— 避免「盘上已更新、`dist/` 还是旧产物」。

---

## 工作台的七个一级视图

左栏恒为**会话 Dock**（已选提示词 / 主体与环境 / 参数值 / 最终提示词），右栏切换一级视图。切换视图**不重挂、不换栏**。

| 视图 | 深链 | 内容 |
|---|---|---|
| 提示词库 | `#vocab` | 4 个分类 / 17 个分组 / **133 条**摄影术语 + 4322 位艺术家 |
| 研究样本库 | `#samples` | **1044 条**社区作业，旧链 `#explore` 自动重定向 |
| 候选词条 | `#candidates` | 631 条社区措辞 × 词库覆盖度 |
| 对照 | `#compare?a=…&b=…` | 两条样本并排比 |
| 研究笔记 | `#research` | 观察记录与结论（IndexedDB） |
| 风格榜 | `#styles-top` | 官方热度榜 200 码 × 8 题材 |
| 资料库 | `#materials` | 自采提示词与图片 |

所有筛选条件**都写在 URL hash 里**（`#samples?batch=11-10&q=film`、`#style-library?q=film&tested=1`），可后退、可分享、可刷新复现；不认识的参数会被丢弃并提示一次。

---

## 研究样本库

工作台的一级视图（`#samples`）。**一条作业 = 一条社区生成 = 一条原始提示词 + 四格成图 + 作者名**。

| 内容 | 当前快照 | 说明 |
|---|---:|---|
| 作业 | **1044 条** | 12 个采集批次 |
| 配图 | **4176 张 × 2 档** | `thumbs/` 320px（网格与灯箱，**当前唯一接入的档位**）+ `mid/` 640px（**代码尚未接入**） |
| 七段拆解 | **971 / 1044** | 剩 73 条未拆解，灯箱走空态降级 |
| 采集批次 | 12 个 | **第一次采到它的那天**，不是生成时间 |
| 生成日期 | **39 天**（10-06 → 11-13） | 由 `enqueueTime` 换算的**真实生成日** |

### 三个不可混用的口径

| 维度 | 是什么 | 为什么它是个坑 |
|---|---|---|
| **采集批次** | 这条作业**第一次被采到**的那天 | 同一个作业会连续几天在榜上；批次取第一次，历史批次才稳定 |
| **生成日期** | 这条作业**被 Midjourney 生成**的那天 | 实测 **1041/1044 条两者不同** —— 拿批次当生成时间，跨批次的时间分析会全错 |
| **收录日** | 资料条目被**导入**的那天 | 资料库自己的口径，与前两者无关 |

### 拆解分三层，可信度不同

| 来源 | 条数 | 性质 |
|---|---:|---|
| 手工精拆 · 已验收基准 | **3** | 人工逐条拆，可直接采信 |
| 逐条精拆（LLM） | **50** | LLM 语义判断，可采信 |
| 规则解析 · 未精拆 | **918** | 确定性关键词匹配，**启发式推断** |

**研究结论默认只采信前两层** —— 界面「拆解来源」多选里只勾这两档即可。规则解析每段只保留前 3 个短语、note 多为模板句，所以看起来「没拆完」不是模型偷懒。

可复现的只读审计：`node tools/audit-decomposition.mjs --top 20`。

### 参数维度在这批数据上不可研究

`version` 1044/1044 全是 `8.2`，正文里出现 `--` 的全是 `--massive` / `--perfect` 这类破折号误命中，参数尾 1044/1044 为空。画幅与版本来自**上游字段**，不是作者写进 prompt 的 —— 别拿它们做参数用法的结论。

### 两条正交的内容轴（规则推算，不是人工标注）

| 轴 | 分布 |
|---|---|
| **表现媒介**（怎么画） | 写实 322 / 未声明 315 / 插画 275 / 平面 36 / 二次元 34 / 抽象 33 / 3D 29 |
| **画面主体**（画什么） | 人像 475 / 未判定 200 / 自然 131 / 动物 95 / 建筑 91 / 静物 34 / 科幻 18 |

**不是父子树**：选「人像」不分媒介是 475 条，选「二次元」+「人像」是另一个数。两轴都是**规则推算**，界面标签常驻「规则推算」后缀，比例会随词表浮动 —— **别直接当结论引用**（[ADR-0028](docs/adr/0028-two-axis-sample-taxonomy.md)）。

### 引用键

每条作业有一个短引用键（形如 `7b95a9a0-qfxx`），由作业标识前 8 位与提示词规范化哈希前 4 位组成。结论、观察记录、对照都写它来指认作业。

它同时是深链参数：`#samples?job=7b95a9a0-qfxx` 打开即直达那条作业的灯箱（`file://` 与 `http://` 下都成立）。

构建期会断言**全表零碰撞** —— 撞了就中止构建（键是结论挂证据的唯一依据）。纯提示词哈希在同批数据里有 34 组碰撞，所以键里必须带作业标识。

### 导出样本集

工具栏右端「导出」按钮，把**当前筛选命中的样本**导出成独立文件。

| 项 | 说明 |
|---|---|
| 导出条数 | **筛选命中的全量**，不是屏幕上分页显示的那部分 —— 只导已渲染部分会静默丢数据 |
| 两种格式 | **JSON**（给外部工具）/ **Markdown**（概览表 + 逐条详情，给人读） |
| 每条含 | 引用键、提示词、作者、宽高比、版本、sref、采集批次、**真实生成日期**、拆解来源与七段拆解 |

### 数据两条来路

1. **一次性导入隔壁仓存量**（`ai-video-imge-prompts` 已采的榜单）；
2. **此后每天由本项目自采**：打上游匿名接口取当天榜单 → 下载两档图 → 写快照 `config/explore.yaml`。

两条来路按**作业 id** 合并；同一作业跨天上榜时，批次取**第一次采集到的那天**。**采集失败即中止，保留上一份快照与旧图** —— 宁可给旧数据也不让页面开天窗。

### 更新链（唯一入口）

```bash
npm run update:explore              # 【唯一入口】采集 → 分解 → 烘焙 → 构建
npm run update:explore:no-decompose # 跳过分解（其余三步照跑）
npm run update:explore:collect-only # 只采集，不烘焙不构建
```

`scripts/update-explore.mjs` 四步固定顺序，失败后果分级：

| 步骤 | 做什么 | 失败后果 |
|---|---|---|
| 1 采集 | 写快照 + 下载配图 | **致命**，旧快照与旧图保留 |
| 2 分解 | 写七段拆解（要 LLM 代理） | **只告警、不阻断** —— 新作业走灯箱空态 |
| 3 烘焙 | `config/*.yaml` → `webui/js/data-*.js` | **致命**，中止，不更新 `dist/` |
| 4 构建 | `webui/` → `dist/` | **致命** |

分解步骤自动备份派生文件到 `node_modules/.cache/mj-update-backup/`，失败时自动回滚。

Windows 上要每天自动更新，可把仓库根目录的 `更新探索榜.bat` 挂到计划任务。它只是 `npm run update:explore` 的**薄包装**（流程只定义在一处）。

---

## 候选词条（词库漏了什么）

它回答一个此前**无法回答**的问题：**我手写的那 133 条词库，到底覆盖了社区真实用法的多少？**

631 条收录短语全量列出，按 df 降序：

| 列 | 含义 |
|---|---|
| 措辞 | 社区作者的真实写法（点它看该短语的出处） |
| 频次 | 多少条作业用过（df） |
| 状态 | `已在词库` / `词库有近义` / `词库未覆盖` |
| 词库对应 | 命中的词库条目（中英对照）；未覆盖时为空 |
| 出处 | `N 条出处` —— 点开列样本，点引用键**直达该样本的灯箱** |

**实测三态分布：13 条已在词库 / 146 条词库有近义 / 472 条词库未覆盖。**

**三态为什么不是「在 / 不在」**：二值会骗人。只看精确命中（13 条）会误以为词库完全没用；只看零命中会漏掉**反向**信号 —— 词库 133 条里 **121 条在社区零出现**，提示假设集可能过窄或过时。

**`已在词库` 按词元集合判定，不按字符串相等**：社区写 `light blue`、词库写 `blue light`，词序不同但词元相同，判为命中。这避免了「缺口」被虚报。

**为什么不能直接并入词库**：实测发现词库与社区高频词**不在同一语义层** —— 词库是摄影技术词（快门 / 景深 / 镜头 / 光线），社区高频词是内容词（`background` 303 / `hair` 179 / `white` 293）。社区 prompt 说的是「拍什么」，词库说的是「怎么拍」。把 `background` 硬塞进「光线」分类只会污染假设集。所以这个视图**只呈现、不改词库** —— 并入是人的判断（[ADR-0024](docs/adr/0024-candidate-vocab-as-top-level-view.md)）。

筛选也写进 URL：`#candidates?status=missing&minDf=20&q=light`。**导出**给 JSON（给工具）与 Markdown（给人读）。

---

## 对照（并排看两条）

研究里最常见的动作是「两条样本只差一个变量，判断这个变量是不是主因」—— 光靠浏览做不到。

**怎么用**：在研究样本库勾选两条（卡片上的「对照」框）→ 点「去对照」；或直接改地址栏 `#compare?a=<引用键>&b=<引用键>`。

| 块 | 看什么 | 口径 |
|---|---|---|
| **措辞差异** | 两条提示词里**只在一侧出现**的措辞被标出 | 按逗号切短语做 LCS 差异（不按空格切 —— 否则 `35mm lens` 被拆散） |
| **元数据** | 作者 / 比例 / 版本 / 批次 / 风格参考码 | 固定 5 项，不同的行高亮 |
| **七段拆解** | 同一框架的**同一位置** | 固定 7 行，缺失的段补空、不猜段 |

**取舍**：对照的 URL **只带 `a` / `b`**，不带样本库的筛选参数 —— 对照的是两条已固定的作业，筛选条件对它们没有意义。

**没做**：跨作业统计对比、三方以上对照、对照历史（要留结论就写进研究笔记）。

---

## 风格库（Midlibrary）

「风格库」是另一份数据，**不是手写的**：单一来源是 [Midlibrary 风格库](https://midlibrary.io/library) 的 manifest（在隔壁仓 `ai-video-imge-prompts` 里采集），本仓只持有导出快照 `config/styles.yaml`。

| 内容 | 数量 | 去处 |
|---|---:|---|
| 风格条目（艺术家 / 摄影师 / 插画师 / 设计师…） | **4,322** | 并进「艺术家/摄影师」分类，按画师类目分二级分类 |
| 风格参考码（`--sref <码>`） | **4,638** | 「风格库」独立页：搜名字查码，一键填进参数 |
| 分面词（10 组：风格质量 / 主题 / 视觉效果 / 技法 / 配色 / 情绪 / 类型 / 媒介 / 构图 / 题材） | **68** | 筛选面板（组内任一、组间全部） |
| 主色 | **96** | 筛选面板（多选取并集，带色块） |

两者的性质不同：**风格条目是提示词片段**（进词库参与组装），**风格参考码是参数**（只进 `--sref` 参数框，不进词库）—— 见 [ADR-0009](docs/adr/0009-style-code-is-a-parameter-not-a-fragment.md)。

更新流程：

```bash
# 1. 隔壁仓补齐缩略图
cd ../ai-video-imge-prompts && python tools/fetch.py --site midlibrary --tier thumb

# 2. 本仓重新生成快照并复制预览图
npm run build:styles        # → config/styles.yaml
npm run sync:style-images   # → public/preview-images/midlibrary/
```

授权是**有条件**的：站方书面许可，允许个人学习用途的镜像（含图片），条件是**署名 + 回链**。每张卡片上的「Midlibrary ↗」就是回链，完整声明见 [NOTICE.md](NOTICE.md)。

### 风格与类型库（独立页）

`style-types.html` 是**独立页**，不是工作台的一级视图。它装 Midlibrary 上游 16 个分类里「条目类型类」的 4 个 —— 流派与艺术运动、通用修饰、技法、标题，共 **1,180 条**。

它与「风格库」的分工是**语义**上的，不是数据上的（两批数据同源于一份 manifest）：

| | 风格库 | 风格与类型库 |
|---|---|---|
| 回答的问题 | 谁画的 | 画成什么样 |
| 内容 | 风格条目 4,322 + 风格参考码 4,638 | 类型条目 1,180 |
| 会话槽位 | 艺术家（单选互斥）/ 风格参考码（参数） | 其他（多选累加） |
| 上游第 5 个条目类型类 | sref-styles（风格参考码 4,638）在本页 | 不重复收录 |

**筛选**复用统一筛选引擎（`webui/js/filter-engine.js`），维度：分类、分面词、主色、只看实测、只看公有领域、搜索。URL hash 是状态的唯一来源（ADR-0010），刷新/后退/分享都能复现。

**筛选语义沿用本项目约定「组内任一、组间全部」，不照搬上游。** 上游把 10 个分面组压平成一个 AND 池 —— 实测三词 `expressive ∧ illustrative ∧ scenes` 只剩 37 条，本项目同口径是 160 条。这是本项目更宽也更可用的一处刻意分歧。

**排序**只有两项：

- `A → Z`（上游同名项）
- `最新收录` —— 按条目**创建时间**倒序。**这不是上游的 "Newly tested"**：上游按「实测时间」排，而那个字段在源快照与上游 payload 里都不存在（实测 `testedAt` 出现 0 次），是服务端行为，快照复刻不了。唯一可溯源的时间事实是条目 ULID 里的创建时间（1,180/1,180 可解），所以排序项改叫「最新收录」并在详情里标注「按创建时间，非实测时间」，不冒充实测口径。

数据链（与风格库同源）：

```bash
npm run build:styles        # → config/styles.yaml + config/types.yaml
npm run sync:style-images   # → public/preview-images/midlibrary/（类型库 1,180 张 / 23.7 MB）
npm run build:webui-data    # → webui/js/data-types.js
npm run build               # → dist/
```

---

## 风格榜

Midjourney 官方风格热度榜 **200 组 × 8 题材**示例图（深链 `#styles-top`）。

卡片下方一行 8 张题材缩略图，点击即在上方主图切换并标注题材名。两个功能按钮：

- **套用到工作台** → 把 `--sref` 写进左栏会话的**风格参考参数位**
- **复制参考码** → 只复制到剪贴板，不改会话

它是**参照语料**，不参与词库组装（[ADR-0026](docs/adr/0026-styles-top-as-top-level-view.md)）。

采集方式：需登录态的 Chrome（远程调试端口 9222）驱动浏览器滚到榜单底部抠出码清单，缩略图匿名直连 CDN 下。

---

## 改词库与参数

### 词库

编辑 `config/prompts.yaml`，结构是两级分类（`subCategories`；个别分类用 `prompts` 直挂）：

```yaml
categories:
  - id: shutter-speed
    name: 快门速度
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

YAML 共 **5 个分类 / 22 个二级分类 / 156 条**（含 23 条艺术家）；前端烘焙产物 `webui/js/data-vocab.js` 是 **4 个分类 / 17 个分组 / 133 条** —— 艺术家分类由 `data-artists.js` 单独提供，不进词库条目。

> ⚠️ **静态 WebUI 不监听 YAML**，也没有 HMR（Vue 时代的 Vite HMR 已随 Vue 实现一同退役，见 [ADR-0023](docs/adr/0023-vue-implementation-removed-shared-layer-preserved.md)）。改完 `config/*.yaml` 需手动重建数据产物并同步 `dist/`。
>
> **注意**：`data-vocab.js` / `data-artists.js` / `data-stylecodes.js` / `data-parameters.js` 这四份产物**当前没有配套的生成脚本**（`build:webui-data` 只处理探索榜与风格榜两域）。改这几个 YAML 后需自行更新对应产物文件。

### 参数

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
```

可用字段：`versions` / `optionsByVersion` / `defaultByVersion` / `rangeByVersion` / `alwaysEmit` / `flagOnly` / `flagFromValue`。

选项级字段：`param` / `paramValue` / `flagOnly`。

共 **24 个参数**，覆盖官方现行图片类参数。切换模型版本后，不支持的参数自动置灰并说明原因，越界的滑块值被收敛。

> ⚠️ 参数的取值与版本归属以 **Midjourney 官方帮助中心** 为准，不要凭印象填。逐条出处见 [`docs/参数事实表.md`](docs/参数事实表.md)。

---

## 摄影前缀

最终提示词的开头段，基词**会话级可配置**（默认 `photography`），在左栏会话 Dock 的「主体与环境」区设置。

| 基词 | 无艺术家 | 有艺术家 |
|---|---|---|
| `photography`（默认） | `photography` | `photography by <名字>` |
| 自定义，如 `cinematic still` | `cinematic still` | `cinematic still by <名字>` |
| 空串 | 整段消失 | 只留艺术家名，不带 `by` |

配置随会话落盘 `mj-session-v2`，刷新复现；点「清空会话」复位（[ADR-0027](docs/adr/0027-configurable-photography-prefix.md)）。

---

## 提示词短语索引

社区提示词天然是逗号分隔的短语列表（`a girl, photorealistic, cinematic lighting, shot on 35mm lens`），所以聚类的最小单位是**短语**而不是词。

- 当前收录 **631 条**（多词 180 + 单词 451），覆盖 **968 / 1044 = 92.7%** 的样本
- 收录阈值：多词短语 df ≥ 8，单词 df ≥ 20
- 停用词只停功能词（冠词 / 介词 / 连词…），**不停任何名词、形容词、副词** —— 那正是研究者要找的措辞信号
- 索引在**运行时现算**（改阈值不必重建 3 MB 数据产物）

研究样本库可按短语多选筛选（组内任一、组间全部）。

---

## 目录结构

```
MJ Prompt Generator/
├─ config/                 ← 配置与数据快照（构建期读取）
│  ├─ prompts.yaml           提示词词库（手写，5 分类 / 156 条）
│  ├─ parameters.yaml        参数定义 + 版本兼容关系（24 个）
│  ├─ styles.yaml            风格库快照（生成物，勿手改）
│  ├─ types.yaml             风格与类型库快照（生成物，1180 条 / 4 分类 / 65 分面词 / 87 主色）
│  ├─ explore.yaml           探索榜作业快照（生成物，1044 条 / 12 批次）
│  ├─ explore-decomposed.yaml  七段拆解（生成物，971 条；文件是 .yaml，内容是 JSON）
│  └─ styles-top.yaml        官方风格榜 200 码（生成物）
├─ webui/                  ← 正式前端（静态多页，无编译步骤）
│  ├─ index.html / gallery.html / style-library.html / style-types.html / explore.html
│  ├─ js/                    会话、词库、参数、探索榜、风格库、风格与类型库、对照视图、短语索引
│  │                         + 筛选引擎 + 研究数据层（IndexedDB）+ 样本导出
│  │                         + 候选词条（引擎 / 视图 / 导出三件）
│  │                         + 两轴分类 + 生成日期换算（界面与导出共用）
│  │                         + data-*.js（生成物）
│  └─ css/app.css
├─ public/                 ← 全量图（配图唯一来源，前端一律 ../public/ 引用）
│  ├─ explore/thumbs 320px、explore/mid 640px
│  ├─ materials/              资料库配图（入库）
│  ├─ preview-images/midlibrary（生成物，.gitignore 排除）
│  ├─ preview-images/tracked/   ← 前端实际引用的 448 张（入库）
│  └─ preview-images/thumbs/    ← 词库缩略图 133 张（入库）
├─ shared/                ← 共享逻辑层（纯 TS，零 DOM，可单测）
│  ├─ types/                 类型定义（探索榜 / 词库 / 参数 / 风格 / 配置）
│  └─ utils/                 筛选 / 拼装 / 合并 / 标签 / hash 契约（被 tests/ 直接覆盖）
├─ scripts/                ← 静态服务 / 构建 / 数据烘焙 / 冒烟校验（.mjs）
├─ tools/                  ← 采集、导出、拆解等 TypeScript 工具
├─ skills/                 ← 配套 Agent 技能包
├─ evals/ / tests/ / docs/adr/
├─ data/materials/        ← 资料库真相源（入库）
├─ CONTEXT.md              ← 术语表（只定义领域语言）
└─ NOTICE.md               ← 第三方内容与授权条件
```

---

## 测试

```bash
npm test          # 单元测试（vitest，经测试收集守卫）
npm run verify    # 冒烟验证：用本机 Chrome/Edge 真实渲染（需已 npm run build）
```

> **`npm test` 带一道「收集守卫」**：某些环境下 vitest 写 SSR 缓存会被拒（`EPERM`），而它对单个文件的 transform 失败是**跳过该文件**而不是整体报错 —— 表现为「测试文件数忽多忽少、用例数随机少几十个」。守卫会核对**实际收集的文件数**与**磁盘上的文件数**，不等就自动重跑（最多 3 次），连续失败则**明确报错并以非零码退出**。**绝不静默少跑后还报成功。** 临时目录已改到项目内（`node_modules/.cache/tmp`），绕开系统 Temp 的占用竞争。

单元测试覆盖 20 个文件 / 404 个用例：

- **提示词组装规则** —— 固定顺序（摄影前缀 → 机位 → 主体环境 → 光线 → 其他 → 参数）与参数输出规则；摄影前缀基词为**会话级可配置**
- **版本兼容规则** —— 切换模型版本后，不支持的参数被清除、越界的滑块值被收敛
- **词库导出同步** —— 技能包里的摄影词库快照与 `config/prompts.yaml` 保持一致
- **风格库数据** —— 形状、码形如 `--sref <数字>`、风格条目并入词库时不与手写条目重名、风格参考码不进词库
- **筛选** —— 筛选引擎语义（组内任一、组间全部、主色并集、计数口径）与 URL 契约（白名单、非法参数丢弃、往返一致）；**多组维度**（声明 `groupOf` 的 multi 维度按「同组取或、跨组取与」匹配，与上游的平铺 AND 明确区分，计数用整链试算口径）
- **短语索引与对照** —— 短语怎么切、什么算噪声、收录阈值；词级差异、元数据对照、七段拆解对照
- **样本导出** —— 导出的是筛选命中的**全量**；JSON 与 Markdown 同源；空结果、缺拆解、非法时间戳的降级
- **生成日期的口径** —— 非法时间戳不产出 `NaN` 日期、口径是本地时间而非 UTC；最关键的一条：**界面筛选与样本导出对同一条作业必须给出同一个日期**
- **共享逻辑层的纯函数**（`shared/utils/`：分面筛选 / 筛选 hash / 探索榜 hash / 风格合并 / 标签回填 / 提示词拼装 / 参数兼容）—— 7 个模块全部零 DOM 依赖

冒烟验证（`npm run verify`）用本机 Chrome/Edge 以 `file://` 真实打开 `webui/` 下的页面，默认**不依赖 dev server**；加 `--dist`（`node scripts/verify-webui.mjs --dist`）才校验构建产物。覆盖渲染、全量数据契约（阈值取自产物统计对象，采集后无需改数字）、分页与空态降级、**sref 如实透传**、**提示词短语多选筛选（URL 往返）**、**两轴分类（控件与「规则推算」常驻标注 / 分面计数不重不漏 / 按主体筛选与计数一致 / 进 URL / 已下线控件不再出现）**、**对照视图（并排渲染 / 三块对照 / 链接可分享）**、**候选词条（一级视图 / 三态标记 / 筛选进 URL 与刷新复现 / 出处弹层可回指样本 / 双格式导出）**、**拆解分层（缺口归零 / 三项计数不重不漏 / 勾两项进 URL / 刷新复现）**、**参数维度如实说明**、**配图真实加载**（判据 `complete && naturalWidth === 0`）、**样本导出（全量口径 / 随筛选联动）**、**风格榜（一级视图 / 200 组全量渲染 / 8 张题材缩略图一行 / 点击切换主图 / 套用写进 --sref / 复制只进剪贴板）**、**摄影前缀（默认基词 / 自定义即时生效 / 刷新复现 / 留空则无开头段）**、**风格与类型库（独立页渲染 / 数据契约 1180 条 / 配图全覆盖 / 分组筛选语义三档：组内并集、跨组交集、三词=(同组并集)∧跨组，且与上游平铺 AND 明确不同 / 分面面板 65 词 87 色 / A→Z 与最新收录两种排序 / 会话 other 槽多选累加 / 深链往返 / 窄屏 4 个导航入口首屏全可点）**、会话 / 主题 / 旧 hash 迁移、窄屏基线（390×844 一级视图按钮首屏全部可点；800×600 固定底条必须保持折叠态）。

它需要本机装有 Chrome 或 Edge，并已安装 `puppeteer-core`（已在 devDependencies 中）。

**界面截图不入库。** 旧的 4 张（Vue 时代产物）已于 2026-11-12 删除：没有任何脚本会重新生成它们，README 与 docs 也从未引用。需要图示时按现行界面现拍、现用，不要提交进仓库。

> ⚠️ **当前状态（2026-11-16）**：`npm test` 有 **4 处失败**，全部集中在 `tests/candidateVocab.test.ts` 的「真实语料实测」组 —— 断言写死了旧快照数字（971 作业 / 571 短语 / 11 条命中），而数据已更新为 1044 / 631 / 12。**这是数据更新后断言未同步，不是引擎缺陷**；引擎在当前数据上跑出的实测值见上文「候选词条」一节。修复需改测试断言。

---

## 配套 Agent 技能包

`skills/midjourney-prompt-writing/` 是一个独立的 Agent 技能包，让 AI 助手按本教程的方法论帮你写 Midjourney 提示词。

```bash
npm run export:vocab    # 改了 config/prompts.yaml 后，把词库同步进技能包
```

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

- 技能包**不复制**参数的取值范围与版本归属表 —— 那些以 `midjourney-doc-facts` 技能为准（[ADR-0006](docs/adr/0006-param-facts-reference-not-copy.md)）。
- 技能包里的摄影词库是 `config/prompts.yaml` 的**导出快照**，不手改（[ADR-0005](docs/adr/0005-vocab-single-source-exported-snapshot.md)）。

安装到本机的共享技能库并分发：

```bash
skills-manager-cli skills install --local ./skills/midjourney-prompt-writing
skills-manager-cli skills deploy midjourney-prompt-writing --agent deepseek_harness --agent workbuddy --agent claude_code --agent codex
```

冒烟样例与断言在 `evals/midjourney-prompt-writing/evals.json`。

---

## 与上游的差异

本项目以 [xueshanlinghu/MJPromptGenerator](https://github.com/xueshanlinghu/MJPromptGenerator)（MIT）的源码为底座本地化，主要改动：

| 方面 | 上游 | 本项目 |
|---|---|---|
| 前端形态 | Vue SPA | 静态多页 WebUI（Vue 实现已于第 11 步整体删除） |
| 配置加载 | 运行时 `fetch` 读 `public/config/*.yaml` | `build:webui-data` 预生成 `webui/js/data-*.js`，运行时零请求，产物可双击打开 |
| 参数数量 | 13 个（含 `--stop`、`--style original`、`--cref` 等已失效项） | 24 个，覆盖官方现行图片类参数 |
| 版本兼容 | 无，所有参数对所有版本可见 | 按官方兼容矩阵联动，不支持的参数置灰并说明原因 |
| 会话持久化 | 只写了参数值，且从未读回；选中的提示词一刷新就没 | 已选提示词 + 主体环境 + 参数值 + 摄影前缀一起存取 |
| 研究能力 | 无 | 样本库 / 候选词条 / 对照 / 研究笔记 / 导出（这是本项目的重心） |
| 仓库随附 | GitHub Pages 部署工作流 | 移除，改为本地运行 |

决策记录见 [`docs/adr/`](docs/adr/)。

---

## 术语

领域词汇见 [`CONTEXT.md`](CONTEXT.md)。

---

## 致谢

- 本项目基于 [xueshanlinghu/MJPromptGenerator](https://github.com/xueshanlinghu/MJPromptGenerator)（作者：雪山凌狐）的源码本地化。
- **特别感谢野菩萨老师及其团队在摄影提示词整理和专业指导方面提供的宝贵支持**，使本项目能够提供专业、全面的摄影提示词库。

## License

MIT —— 见 [LICENSE](LICENSE)。

**代码**是 MIT；随项目分发的第三方内容（Midlibrary 风格库及其样例图、Midjourney 探索榜的成图与提示词）受各自站点的条件约束，见 [NOTICE.md](NOTICE.md)。
