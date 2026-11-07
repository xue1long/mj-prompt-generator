# 场景模板

> 来源：《Midjourney 从基础到进阶使用教程（V8.2 整合版）》第六章 + 实战笔记改写版。
> **全部为 V8.2 可直接运行版本。** 统一采用"提示词原文 + 适用场景 + 关键参数"三段式。
> 短剧 / 系列类的模板在文末；它们的用法与约束见 `drift-control.md`。

---

## 模板 1 · 写实人像

```
a weathered fisherman in his sixties, deep laugh lines and sun-darkened skin, pulling a heavy net, weathered canvas jacket, medium shot, harbor at dawn, golden hour backlight with volumetric mist, documentary photography with 85mm portrait lens, shallow depth of field, muted teal and amber palette --ar 4:5 --s 150 --raw --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 人物肖像、纪实风格人像、封面图 |
| 关键参数 | `--raw` 压制模型的艺术演绎，保留真实质感 |
| 比例 | `--ar 4:5` 竖版；社交媒体竖图 |
| 可替换 | `weathered fisherman` → 你的主体描述（年龄、职业、衣着特征） |

---

## 模板 2 · 产品静物

```
a frosted glass perfume bottle on black marble, amber liquid catching light, soft studio softbox with warm rim light, macro product shot, luxury commercial still life, ultra sharp focus, dark gradient background --ar 4:5 --s 100 --raw --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 电商主图、产品广告、包装概念图 |
| 关键参数 | `--raw` + `--s 100` 低风格化，保证产品形状不被模型"改造" |
| 进阶 | 把 `black marble` 换成 `wet concrete` / `raw linen` / `glossy acrylic` 换质感 |

---

## 模板 3 · 室内设计 / 建筑

```
minimalist scandinavian living room, oak floor, boucle sofa, large window with sheer curtains, soft overcast daylight, wide-angle interior architectural photography, 24mm lens, one point perspective, calm neutral palette --ar 16:9 --s 200 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 室内效果图、家居带货、空间概念 |
| 关键参数 | `--ar 16:9` 横幅；`one point perspective` 拉出纵深 |
| 进阶 | 加 `--no people, furniture clutter` 清空杂物 |

---

## 模板 4 · 美食摄影

```
a steaming bowl of tonkotsu ramen, chashu pork, soft-boiled egg, scallion, dark ceramic bowl on weathered wood, side window soft light with warm falloff, food photography, 50mm macro, shallow depth of field, steam rising, rich warm tones --ar 1:1 --s 150 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 菜单、外卖图、餐饮物料 |
| 关键参数 | `soft-boiled egg` 这类**具体材质词**比 `delicious food` 有效得多 |
| 进阶 | 换 `side window soft light` → `hard directional light` 换布光调性 |

---

## 模板 5 · 动漫角色

```
a determined young mage with crimson hair casting fire magic, intense glowing eyes, ancient library with floating books, dramatic dynamic lighting, anime cel shading, detailed background art, high contrast --niji 7 --ar 4:5 --s 200
```

| 项 | 说明 |
|---|---|
| 适用 | 二次元立绘、同人图、角色设计稿 |
| 关键参数 | `--niji 7` 是动漫线当前最优版本 |
| 注意 | `--niji` 与 `--v` **互斥**，这条提示词里不能写 `--v`；`--raw` 对 Niji 无效 |

---

## 模板 6 · 角色分镜 / 多宫格

```
character sheet of a young swordswoman, silver shoulder-length hair, teal scarf, leather armor with brass buckles, front view, side view, back view, three point turn-around, white background, clean line art, consistent proportions --ar 16:9 --s 100 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 角色设定稿、三视图、IP 形象开发 |
| 关键参数 | `--ar 16:9` 给三个视角留出横向空间 |
| 进阶 | 把 `three point turn-around` 改成 `expression sheet` 出表情差分 |

---

## 模板 7 · 海报 / 印花

```
retro travel poster for the moon coast, bold flat colors, screen print texture, sun and waves emblem, bold sans-serif type area, limited palette of cream coral and teal, mid-century modern --ar 2:3 --s 300 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 活动海报、贴纸、印花、装饰画 |
| 关键参数 | `--s 300` 拉高风格化；`screen print texture` 指定印刷质感 |
| 无缝平铺 | 加 `--tile` 输出可无缝拼接的图案（⚠️ `--tile` 与 `--edit` 不兼容，两者不能同现） |

---

## 模板 8 · 角色转面图（V8.2 版）

> ⚠️ 原教程此模板用的是 `--cref ... --v 6.1`。**`--cref` 在 V8.2 已失效**，下面是改写后的 V8.2 写法。

```
/imagine the same young girl in a red hooded cloak, close-up portrait, soft warm rim light, shallow depth of field, photorealistic --edit https://example.com/front.png https://example.com/side45.png --ar 1:1 --s 100 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 角色转面、多角度出图 |
| 关键参数 | `--edit` 最多 4 张参考图；**没有 `--cw` 那样的角色权重刻度**，靠多传不同角度的图来稳定五官 |
| 宽高比 | `--edit` 会自动匹配**第一张参考图**的宽高比，但默认宽高比设置不会自动套用 → **必须显式写 `--ar`** |
| 旧写法 | `--cref ... --cw 100 --v 6.1` 仅在 V6/Niji 6 有效 |

---

## 模板 9 · 短剧主线镜头（策略 A · V8.2 版）

> 原实战笔记用的是 `--cref`；V8.2 改用 `--edit`。策略说明见 `drift-control.md`。

```
/imagine a young east asian woman holding an umbrella, walking in a rain-soaked alley at night, glancing back over her shoulder, soft diffused ambient light --edit https://example.com/char_front.png https://example.com/char_45.png --p m123456 --s 220 --raw --ar 9:16 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 短剧/漫剧主线镜头（占 90% 的镜头） |
| 关键参数 | `--edit` 锁角色长相 + `--p` 锁情绪板氛围，**不带 `--sref`** |
| `--s` 调节 | 动作复杂/多人/大场景 → 压到 140–190 优先保结构；特写/氛围 → 拉到 250–280 |
| 禁忌 | `--p` 与 `--sw` / `--sv` 不能同现 |

---

## 模板 10 · 特殊质感镜头（策略 B · V8.2 版）

> ⚠️ 原实战笔记写的是 `--p mxxxxxx ... --sref ... --sw 80~120`——**`--sw` 与 Moodboards 不兼容**。下面是合法写法。

```
/imagine the same young woman with eyes closed, hazy memory shot, shallow depth of field --edit https://example.com/char_front.png --p m123456 --sref https://example.com/texture.jpg --ar 9:16 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 回忆 / 梦境 / 闪回等特殊镜头 |
| 关键参数 | 用了 `--p` 就**不要写 `--sw` / `--sv`**；`--sref` 单独出现时权重取默认 100 |
| 若要更强的质感控制 | 这条镜头**放弃 `--p`**，改用 `--sref URL --sw 100~120` 单独控制 |
| 禁忌 | 这组跑完，下一组立刻去掉 `--sref`——主线镜头不要常驻 |

---

## 模板 11 · 风格对标测试（策略 C · V8.2 版）

```
/imagine a young woman, backlit silhouette by a window --edit https://example.com/char_front.png --sref https://example.com/style.jpg --sw 150 --ar 9:16 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 试新风格、对标参考（纯测试） |
| 关键参数 | `--cref` → `--edit`；此处**不带 `--p`**（测试阶段不叠加长期基准） |
| 后续 | 跑满意后**把成品筛选加入情绪板，转为策略 A 长期方案** |

---

## 模板 12 · 前置构图参考（垫图 · 低权重）

```
/imagine [前置构图图链接] a young woman in the rain, side glance, dialogue shot --edit https://example.com/char_front.png --p m123456 --iw 0.5 --s 220 --raw --ar 9:16 --v 8.2
```

| 项 | 说明 |
|---|---|
| 适用 | 锁机位构图（对话镜头、固定机位分镜） |
| 关键参数 | `--iw 0.3–0.6` 是短剧主线最常用区间——只借构图机位，不抢角色脸与情绪板氛围 |
| 禁忌 | 前置图不要用带清晰正面人脸的真人图；不要与高 `--iw`、高 `--sw`、高 `--s` 叠加 |
| 比例 | 前置图裁剪成与 `--ar` 一致，AI 理解构图最准 |

---

## 选型指引

| 用户想要 | 拿哪个模板 |
|---|---|
| 一张好看的人像 | 模板 1 |
| 电商产品图 | 模板 2 |
| 房间/空间效果图 | 模板 3 |
| 菜单/餐饮图 | 模板 4 |
| 二次元角色立绘 | 模板 5 |
| 角色设定三视图 | 模板 6 |
| 活动海报 / 印花 | 模板 7 |
| 同一角色的不同角度 | 模板 8 |
| 短剧主线镜头 | 模板 9 |
| 回忆/梦境镜头 | 模板 10 |
| 试风格 | 模板 11 |
| 固定机位构图 | 模板 12 |
