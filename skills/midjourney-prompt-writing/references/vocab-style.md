# 风格词库（画风 / 质感 / 构图 / 情感）

> 来源：《Midjourney 从基础到进阶使用教程（V8.2 整合版）》第三章 3.4–3.8，删去配图后整理。
> **摄影技术术语不在这里**（快门、光圈、焦段、光线方案、摄影师名）——那些在 `vocab-photography.md`，由 `config/prompts.yaml` 导出，是单一来源。
> **风格词是性价比最高的变量**：换一个词，画面整体调性就变。

---

## 一、画风 / 媒介类

```
oil painting, watercolor, ink wash, pencil sketch, charcoal drawing,
digital painting, concept art, matte painting, artstation trending,
3d render, octane render, claymation, paper cutout, collage,
stained glass, embroidery, pixel art, ukiyo-e woodblock
```

| 词 | 画面倾向 |
|---|---|
| `oil painting` | 厚涂笔触、可见油彩肌理 |
| `watercolor` | 透明水彩、边缘晕染、纸纹 |
| `ink wash` | 水墨、留白、淡墨层次 |
| `pencil sketch` / `charcoal drawing` | 素描、线条主导、明暗块面 |
| `digital painting` | 干净的数字厚涂、无纸张肌理 |
| `concept art` | 概念设定图、强调剪影与氛围 |
| `matte painting` | 电影概念背景、大气透视 |
| `artstation trending` | 3A 游戏/角色宣传图质感 |
| `3d render` / `octane render` | 三维渲染、体积光与材质反射 |
| `claymation` | 黏土动画、哑光塑形 |
| `paper cutout` | 剪纸拼贴、硬边分层 |
| `collage` | 拼贴、混合媒介 |
| `stained glass` | 彩色玻璃窗、透光色块 |
| `embroidery` | 刺绣质感、线迹肌理 |
| `pixel art` | 像素点阵、低分辨率 |
| `ukiyo-e woodblock` | 浮世绘木版、平面套色 |

---

## 二、游戏 / 动画画风

```
Ghibli-inspired, Pixar-style, Disney-esque, Studio Ghibli,
cel-shaded anime, Studio Trigger style, game cinematic, Overwatch hero concept,
Zelda breath of the wild, Genshin Impact style
```

> ⚠️ **版权与风格模仿的现实约束**：部分画风词在部分模型版本上效果不稳定（模型训练数据里可能根本没有对应风格）。写这类词之前先确认它在当前版本真的出效果——**先跑一版草图验证**，别把整张图押在一个未验证的风格词上。

---

## 三、艺术家 / 流派类

```
in the style of Rembrandt, Art Nouveau, Bauhaus poster,
Soviet propaganda poster, brutalist architecture, cyberpunk neon,
steampunk, cottagecore, solarpunk
```

| 词 | 画面倾向 |
|---|---|
| `in the style of Rembrandt` | 伦勃朗式暗调肖像、单点光 |
| `Art Nouveau` | 新艺术运动、藤蔓曲线、装饰性边框 |
| `Bauhaus poster` | 包豪斯、几何色块、极简字体区 |
| `Soviet propaganda poster` | 苏式宣传画、粗笔触、高对比红 |
| `brutalist architecture` |  brutalism、清水混凝土、几何体块 |
| `cyberpunk neon` | 赛博朋克、霓虹、高饱和青紫 |
| `steampunk` | 蒸汽朋克、黄铜齿轮、暖褐色调 |
| `cottagecore` | 田园童话、碎花、柔和自然光 |
| `solarpunk` | 太阳朋克、绿色建筑、清洁未来 |

> 具体的摄影师/画家名在 `vocab-photography.md`（YAML 的"艺术家/摄影师"分类）。**本节是"流派与美学"**，两者不是一回事，别混用。

---

## 四、特殊效果风格

| 词 | 效果 |
|---|---|
| `photogram` | 平面图像被处理成**立体实体模型**的观感（类似 3D 浮雕 / 纸雕质感） |

---

## 五、构图法词汇

AI 默认**总把主体放在正中央**。用构图词打破这一点。

| 方法 | 英文写法 | 说明 |
|---|---|---|
| **三分法** | `rule of thirds composition, subject positioned off-center` | 主体放在横竖三等分的交点 |
| **框架式** | `framed through a broken window, foreground frame, subject in the center of the frame` | 用门、窗、枝叶做前景框 |
| **留白 / 负空间** | `tiny subject in vast empty landscape, extreme negative space, minimalist composition` | 主体极小、环境占大面积；制造孤独、渺小、宁静 |
| **引导线** | `leading lines converging toward the subject, path in foreground, deep perspective` | 用道路、河流、轨道、光束把视线牵向主体 |
| **对称式** | `symmetrical composition, centered subject, architectural symmetry` | 居中对称；适合庄严、秩序、仪式感 |

---

## 六、镜头质感词

加摄影术语，画面立刻从"AI 插画"变成"实拍"。

| 词 | 效果 |
|---|---|
| `photography`, `photorealistic` | 材质与光照更接近真实摄影 |
| `in focus`, `sharp focus` | 主体更锐利，减少糊化 |
| `depth of field` | 景深，主体与背景的分离 |
| `bokeh` | 背景虚化光斑（**YAML 已收录**） |
| `cinematic`, `film still` | 电影感画幅与色调 |
| `anamorphic` | 变形宽银幕、椭圆焦外、横向光斑 |
| `film grain`, `35mm` | 胶片颗粒质感 |
| `DSLR`, `CanonEOSR5` | 逼近特定机型的成像特征（**YAML 已收录，YAML 写法为准**） |

---

## 七、情感词

同一主体加上不同的情绪词，就是完全不同的两张图。

```
hopeful, melancholic, serene, ominous, nostalgic, triumphant,
lonely, tender, epic, claustrophobic, playful, bittersweet, awe-inspiring
```

| 情绪 | 更强的说法 |
|---|---|
| 希望 | `hopeful`, `uplifting` |
| 忧郁 | `melancholic`, `wistful`, `somber` |
| 平静 | `serene`, `peaceful`, `tranquil` |
| 不祥 | `ominous`, `foreboding`, `menacing` |
| 怀旧 | `nostalgic`, `retro`, `vintage` |
| 胜利 | `triumphant`, `heroic`, `uplifting` |
| 孤独 | `lonely`, `isolated`, `solitary` |
| 温柔 | `tender`, `gentle`, `intimate` |
| 史诗 | `epic`, `grand`, `monumental` |
| 压迫 | `claustrophobic`, `oppressive`, `suffocating` |
| 俏皮 | `playful`, `whimsical`, `cheerful` |
| 苦甜 | `bittersweet`, `wistful` |
| 敬畏 | `awe-inspiring`, `breathtaking` |

> 情绪词改变的是**整张图的叙事**，而不是某个局部细节。放在七段式的第 ⑥ 段（风格与审美）末尾。
> ⚠️ **同一情绪别叠多个近义词**（`melancholic` + `somber` + `wistful`）——注意力会被摊薄，反而变弱。

---

## 八、选词原则

1. **一次只调一个变量。** 换风格词时，主体、构图、光线全部不动——否则你不知道是哪个词起了作用。
2. **风格词放在第 ⑥ 段，不要提前。** 主体在最前权重最高。
3. **用 `--no` 排除你不想的画风**，比在正文里写 "not cartoon" 有效得多。
4. **风格词和情绪词可以叠加**，但同一个语义维度（画风、情绪）里只留一个。
5. **不确定某个风格词在当前版本是否有效 → 先跑 `--draft` 草图验证**（网页端一次出 24 张，成本低）。
