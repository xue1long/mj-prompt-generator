# 提示词方法论

> 来源：《Midjourney 从基础到进阶使用教程（V8.2 整合版）》第三章 + 第五章，删去配图后整理。
> 术语口径见 `glossary.md`。

## 目录

- [一、七段式结构](#一七段式结构)
- [二、关键词 vs 描述句](#二关键词-vs-描述句探索期与定稿期)
- [三、两套提示词框架](#三两套提示词框架)
- [四、构图五法](#四构图五法)
- [五、视角与灯光](#五视角与灯光)
- [六、镜头感](#六镜头感让画面像照片)
- [七、情感词](#七情感词)
- [八、写词的 5 条铁律](#八写词的-5-条铁律)
- [九、常见误区](#九常见误区)
- [十、控图工作流](#十控图工作流)
- [十一、分辨率工作流](#十一分辨率工作流)

---

## 一、七段式结构

一条合格的提示词**不是一段作文，而是 7 个短语模块 + 末尾参数**。模块之间用逗号分隔，不写完整句子。

| 段 | 模块 | 写什么 | 示例 |
|---|---|---|---|
| ① | **主体** | 画面核心对象 + 关键属性 | `a weathered fisherman` |
| ② | **动作/状态** | 主体在做什么、什么情绪 | `hauling in a net at dawn` |
| ③ | **细节与环境** | 场景、时间、天气、周边元素 | `misty harbor, wooden pier, gulls overhead` |
| ④ | **构图与镜头** | 景别、机位、焦段、构图法 | `wide-angle shot, low angle, rule of thirds` |
| ⑤ | **光线与色彩** | 光源方向、硬/柔、色调 | `golden hour backlight, warm amber palette` |
| ⑥ | **风格与审美** | 媒介/画风/流派/情绪 | `cinematic still, film grain, melancholic` |
| ⑦ | **参数尾** | 版本、比例、风格化等 | `--ar 16:9 --s 150 --v 8.2` |

**组装示例：**

```
a weathered fisherman, hauling in a net at dawn, misty harbor with wooden pier and gulls overhead, wide-angle shot from low angle, rule of thirds composition, golden hour backlight with warm amber palette, cinematic still with fine film grain, --ar 16:9 --s 150 --v 8.2
```

**为什么这样拆：**

- **MJ 读的是词与短语的权重分布，不是语法。** 名词短语比完整句子更省 token，也更容易被拆解成构图要素。
- **一段话塞十个信息点，模型会平均分配注意力。** 分模块写等于手动指定优先级，主体写在最前权重自然最高。
- **参数必须放在最末尾，且用英文半角空格隔开。** 参数与提示词混排会导致解析失败。

---

## 二、关键词 vs 描述句：探索期与定稿期

同一场景，两种写法：

**版本 A —— 关键词堆叠**

```
wizard, ruins, forest, dramatic lighting, epic, detailed
```

**版本 B —— 完整描述句**

```
An ancient wizard standing among crumbling ruins in a misty forest, dramatic light breaking through the canopy, epic atmosphere, intricate details
```

| 写法 | 优势 | 劣势 | 适用 |
|---|---|---|---|
| 关键词 | 快、试错成本低、风格发散 | 元素之间无关系，容易各画各的 | 探索期、找风格 |
| 描述句 | 元素关系明确、主体与场景绑定、可控性强 | token 消耗高、试错慢 | 定稿期、复杂场景 |

> ⚠️ **措辞口径**：常规写词阶段用**名词短语**（提高信噪比）；但**高保真复刻、复杂情绪表达**时，**完整描述句**会保留更多元素。
>
> **实操建议：探索期用关键词锁定方向，定稿期换成描述句补足关系。** 不要用一套写法打所有阶段。

---

## 三、两套提示词框架

### 人物画像框架（角色、肖像、故事场景）

```
主体 + 装饰特征 + 容貌 + 动作 + 镜头 + 环境 + 整体风格 + 参数
```

```
a young girl, wearing a red hooded cloak and holding a small lantern, bright curious eyes and freckled cheeks, running through the woods, medium shot, autumn forest with falling leaves, Ghibli-inspired hand-painted style, --ar 4:5 --s 200 --v 8.2
```

### 物体描述框架（产品、静物、道具）

```
主体 + 环境 + 镜头 + 意境/风格 + 参数
```

```
a crystal perfume bottle on black marble, soft studio lighting with warm rim light, macro shot, luxury commercial still life, --ar 4:5 --s 150 --raw --v 8.2
```

**物体描述框架的另一种典型用法 —— 概念化生物：** 极简主体描述（"会飞的小猪"）能出效果，但加入环境与光线描述后层次才出来；这类"梗图"效果往往靠变体挑选。

---

## 四、构图五法

AI 默认**总把主体放在正中央**。用构图词打破这一点。

| 方法 | 写什么 | 提示词 |
|---|---|---|
| **三分法** | 主体放在横竖三等分的交点 | `rule of thirds composition, subject positioned off-center` |
| **框架式** | 用门、窗、枝叶做前景框 | `framed through a broken window, foreground frame, subject in the center of the frame` |
| **留白 / 负空间** | 主体极小、环境占大面积 | `tiny subject in vast empty landscape, extreme negative space, minimalist composition` |
| **引导线** | 用道路、河流、轨道、光束把视线牵向主体 | `leading lines converging toward the subject, path in foreground, deep perspective` |
| **对称式** | 居中对称（神社、宫殿、拱门），营造庄严秩序 | `symmetrical composition, centered subject, architectural symmetry` |

> **留白**制造孤独/渺小/宁静；**对称式**适合仪式感；**引导线**是让主体不再居中的最快手段。

---

## 五、视角与灯光

**完整词表在 `vocab-photography.md`**（由 `config/prompts.yaml` 导出，是摄影术语的单一来源）。按维度组织：

| 维度 | YAML 里的二级分类 | 选词方向 |
|---|---|---|
| **景别** | `shot-size` | 特写 / 中景 / 全身 / 远景 / 全景 |
| **机位** | `shot-angle` | 平视 / 仰拍 / 俯拍 / 鸟瞰 /  Dutch angle |
| **焦段** | `lens-position`、`lens-position-sub` | 广角 / 35mm / 50mm / 85mm / 长焦 / 微距 |
| **光线** | `light-tone`（色温）、`light-position`（方向）、`light-intensity`（强度）、`light-description`（质感）、`light-color`（颜色）、`light-adjectives` | 软光 / 硬光 / 轮廓光 / 逆光 / 体积光 / 霓虹 / 影棚柔光箱 |
| **色调** | `light-color` | 暖琥珀 / 冷青橙 / 低饱和 / 高对比 / 单色 |

> **本文件不重复列举这些词。** 同一个术语以 `vocab-photography.md` 为准。

---

## 六、镜头感：让画面"像照片"

提示词加摄影术语，画面立刻从"AI 插画"变成"实拍"。

| 加了什么 | 效果变化 |
|---|---|
| `photography`, `photorealistic` | 材质与光照更接近真实摄影 |
| `in focus`, `sharp focus` | 主体更锐利，减少糊化 |
| `depth of field`, `bokeh` | 背景虚化，主体突出 |
| `cinematic`, `film still`, `anamorphic` | 电影感画幅与色调 |
| `film grain`, `35mm` | 胶片颗粒质感 |
| `DSLR`, `shot on Canon EOS R5` | 逼近特定机型的成像特征 |

> 词表见 `vocab-style.md`。其中 `bokeh`、`DSLR`、`CanonEOSR5` 已由 `vocab-photography.md` 收录（YAML 写法为准，YAML 用 `CanonEOSR5` 无空格）。

---

## 七、情感词

同一主体加上不同的情绪词，就是完全不同的两张图。

**完整词表见 `vocab-style.md`。** 情绪词改变的是**整张图的叙事**，而不是某个局部细节——放在风格段（⑥）末尾。

---

## 八、写词的 5 条铁律

| # | 铁律 | 说明 |
|---|---|---|
| 1 | **用名词短语，别写句子** | 提高信噪比；复杂情绪场景除外 |
| 2 | **主体放最前** | 越靠前权重越高。MJ 遵循"提示词权重顺序 = 重要性顺序" |
| 3 | **参数统一放末尾** | 参数与提示词之间必须有**英文半角空格**，冒号也必须英文半角 |
| 4 | **用 `--no` 做减法** | 与其写"不要卡通"，不如写 `--no anime, cartoon, illustration, painting` |
| 5 | **少而精 > 堆料** | 超过 3 个参考图会互相打架。V8.2 的 Edit Model 最多 4 张，但也别一次塞满 |

> ⚠️ **铁律 4 在 V7+ 失效**：`词::2 词::1`（Multi-Prompting）只支持到 V6.1，V7 / V8 全部不支持，官方也没提供替代 flag。V8 想要"加强某个元素"，只能用重复描述（`red red dress`）、拆分生成，或用 `--edit`。

---

## 九、常见误区

| 误区 | 说明 |
|---|---|
| 参数与提示词用中文标点 | `，` `：` `（）` 会导致参数解析失败，必须全英文半角 |
| 一个 prompt 塞 5 个主体 | 模型会平均分配注意力，结果每个都不突出。拆成多次生成 |
| 期待 MJ 出准确文字 | V8.2 文字渲染已是当前最佳，但仍不保证拼写准确。关键文字后期合成 |
| 堆砌形容词 | `8k, masterpiece, best quality` 这类词在 V6 之后基本失效，官方模型已内建高质量审美 |
| 中文长句提示词 | 能用但理解精度低于英文。关键风格词建议用英文 |

---

## 十、控图工作流

单张出图用七段式就够。要控制"长什么样"而不是"画什么"，用下面的手段。

### 10.1 垫图四步法（图像提示）

1. **明确需求关键词** —— 先把"我要什么"拆成可检索的关键词，而不是一句模糊描述
2. **收集并挑选参考图** —— 多找几张才有挑选余地
3. **垫图 + 关键词生成**
   ```
   /imagine [垫图URL] summer beach party poster, vibrant colors, palm trees, sunset --ar 2:3 --s 200 --v 8.2
   ```
4. **迭代打磨成稿** —— 选中最接近的一张放大，再用 Vary Region / Remix 修细节

**`--iw` 调节垫图权重：**

| `--iw` | 效果 |
|---|---|
| `0` | 几乎只认文字，垫图只提供色调倾向 |
| `0.5` | 垫图作为弱引导，主体由文字主导 |
| `1`（默认） | 文字与垫图均衡 |
| `2` | 垫图主导，画面构图被强约束 |
| `3` | V7/V8.1 上限 |

> **短剧主线用 0.3–0.6**：只借构图机位，不抢角色长相与情绪板氛围。

### 10.2 角色一致性：四条路径

| 需求 | V8.2 推荐做法 | 旧版做法 |
|---|---|---|
| 锁脸 + 换场景 | `--edit` 传角色图 | `--cref` + `--cw 100`（仅 V6/Niji 6） |
| 保留角色神韵 | `--edit` | `--oref` + `--ow`（需 `--v 7`） |
| 只锁风格不锁人 | `--sref` + `--sw` | 同左 |
| 同一提示词出系列 | `--seed` 固定 + 提示词微调 | 同左 |

**`--edit` 的官方行为（迁移时必须知道）：**

- 最多 **4 张**参考图
- 自动匹配**第一张参考图**的宽高比；**默认宽高比设置不会自动套用，需显式写 `--ar`**
- ❌ 与 `--tile` 不兼容
- ❌ **结果不兼容 Remix**
- ✅ 可与 `--sref`、`--ow`、`--cw`、Moodboards、Personalization、`--hd` 同时使用
- ✅ 可与 Image Prompts、Style References 组合

**锁脸的 `--edit` 写法**（替代 `--cref` + `--cw 100`）：

```
/imagine [动作与场景描述] --edit https://example.com/front.png https://example.com/side45.png --ar 9:16 --v 8.2
```

多传几张不同角度的正面 / 45° 侧面参考图，比调权重更有效——`--edit` 没有 `--cw` 那样的角色权重刻度。

### 10.3 局部重绘（Vary Region）

在已有图上圈选一块区域，只重画这一块。**换衣服、换表情、修手、去除路人**全靠它。

1. 点开并放大要改的那张图
2. 点下方 `Vary (Region)` 按钮 → 框选 + 写指令
3. 控制框选区域大小：**选区占画面 20%–50%**（社区经验值，官方未给百分比；选区过小会被忽略）

> ⚠️ **V8.2 下的限制**：Vary Region **仍是 V6.1 引擎**，且**只作用于 V8.2 的 SD 图**。要编辑 HD 图，得改用 midjourney.com 的 Edit 工具，**结果仍是 SD 分辨率**（需再放大才能回到 HD）。

### 10.4 Remix：小步迭代

**Remix 改的是"下一次生成的指令"**，适合"整体方向不变、局部要素微调"的迭代；Vary 改的是图本身。

开启方式：`/settings` 里打开 Remix，或 `/prefer remix` 让每次都自动开启。

**Vary 三档的选择：**

| 档位 | 幅度 | 何时用 |
|---|---|---|
| **Subtle** | 微调 | 画面已接近完美，只差一点光影/细节 |
| **Creative** | 大改 | 保留大方向，重构整个画面 |
| **Region** | 局部 | 精确控制某一小块 |

> V8.2 的 `--edit` 结果**不兼容 Remix**。要在 V8.2 上用 Remix 迭代，需回退到 V7 及更早。

### 10.5 Seed 的获取与复用

**拿到 seed 就能复现、就能微调出系列图。这是性价比最高的一个小技巧。**

Discord 获取三步：

1. 点开图片 → 右上角「添加反应」
2. 搜索并选择**信封（✉️）**表情
3. 机器人通过**私信**发来 seed 数值

复用 seed 出系列图：

```
/imagine a young girl with freckles wearing a red hood, forest, Ghibli style --seed 123456789 --ar 4:5 --v 8.2
```

固定 seed 后，只改一个变量（背景/服装/表情），其余保持稳定。

> ⚠️ **V8 系列的 seed 是"99% 相同"，不是像素级完全一致。** 依赖完全一致的批量生产请用 `--edit` 或 `--sref`。

### 10.6 风格系列图（SREF 工作流）

**目标：一批图风格统一，但内容不同。**

```
/imagine [主体A] --sref https://example.com/style.png --sw 150 --ar 1:1 --v 8.2
/imagine [主体B] --sref https://example.com/style.png --sw 150 --ar 1:1 --v 8.2
```

要点：

1. `--sref` 的参考图要选**纯风格图**（不含明显主体），否则主体特征会被一起带过去
2. `--sw` 从 **150** 起步，按需增减
3. 一批图要严格统一，就固定同一张 `--sref` 图 + 固定 `--sw` + 固定 `--ar`
4. **探索风格方向时**，在 Draft 模式（网页端）里写 `--sref random`，一次出 24 张不同风格
   （⚠️ 官方限定：`--sref random` 只兼容 `--sv 4` 和 `--sv 6`）

### 10.7 个性化档案（Personalization / Moodboards）

**思路：喂给 MJ 一批你喜欢的图，让它归纳出"你的审美"，之后一键复用。**

1. 在 `midjourney.com` 的 **Personalize / Moodboards** 页面创建新档案
2. 上传若干你喜欢的图片作为参考
3. MJ 归纳出该档案的风格倾向
4. 生成时加 `--p` 调用，或用 `--profile [code]` 指定档案

```
/imagine a cozy cabin in the woods --ar 4:5 --s 150 --p --no anime, cartoon, illustration, painting
/imagine a cozy cabin in the woods --profile 1234567890
```

> ⚠️ **必须先解锁 Global Profile**，否则使用 `--p` 会直接报错。可通过 Personalize 页面选够喜欢的图来解锁。
> **Global V7 Profile 可在 V8.1 / V8.2 使用；但 V8 的 Profile 不兼容 V7。**
> ⚠️ **`--sw` / `--sv` 与 Moodboards 不兼容** —— 用情绪板就别再写这两个参数。

情绪板的选图规则与短剧漂移控制 → `drift-control.md`

### 10.8 完整工作流总览

```
① 需求拆解      →  关键词清单 + 目标比例 + 用途
② 参考收集      →  垫图 / 风格图 / 角色图
③ SD 快试       →  --sd --draft（网页端）24 张草图找方向
④ 锁定方向      →  选定构图 + 风格 + 角色（--edit / --sref / --seed）
⑤ HD 出片      →  --hd 输出交付图
⑥ 局部修整      →  Vary Region / Remix 修细节
⑦ 记录配方      →  记下 prompt + 参数 + seed，存成模板复用
```

---

## 十一、分辨率工作流

```
1. 用 --sd（0.8 GPU 分钟）快速试构图、试风格
2. 选定方向后，用 --hd（1.3 GPU 分钟）出最终交付图
```

> ⚠️ **在 HD 图上做 Pan / Zoom Out / Vary Region，结果会降回 SD 分辨率。** 要么先扩图再升 HD，要么全程 HD 后直接交付。
