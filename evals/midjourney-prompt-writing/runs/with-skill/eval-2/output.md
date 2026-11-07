【最终提示词】
```
a frosted matte glass perfume bottle with a brushed silver cap, standing upright and pristine, on a polished black marble slab with fine white veining, mirror-like reflection on the marble surface, dark gradient studio backdrop, centered symmetrical composition, slightly low eye-level angle, macro product shot, shallow depth of field, generous negative space above the bottle, studio softbox lighting with cool rim light from the right, cool teal and silver palette, high contrast, luxury commercial still life, photorealistic, ultra sharp focus, sophisticated --ar 4:5 --s 100 --raw --v 8.2
```

【为什么这么写】
- 主体与动作：`a frosted matte glass perfume bottle with a brushed silver cap` 放最前，权重最高，先锁住"磨砂玻璃瓶身"这个核心卖点；`standing upright and pristine` 表示整瓶出镜、无遮挡、不做使用态。
- 细节与环境：黑大理石写 `polished black marble slab with fine white veining`，把"黑 + 石纹 + 抛光"讲清楚，不要只丢"黑色石头"让模型猜；`mirror-like reflection on the marble surface` 给出瓶底倒影，是电商高级感的常规做法；`dark gradient studio backdrop` 用渐变暗背景压掉环境信息。
- 构图与镜头：`centered symmetrical composition` 居中对称——电商主图要正面完整展示产品，用构图词明确要求，避免 MJ 默认把主体随手偏移；`slightly low eye-level angle` 机位略低于瓶身中线，撑起瓶型；`macro product shot` + `shallow depth of field` 拉出磨砂材质与景深；`generous negative space above the bottle` 在瓶子上方留出放标题/价格的空间。
- 光线与色彩：冷调用 `cool rim light from the right`（右侧冷调轮廓光把磨砂玻璃的边缘"拉"出来）+ `cool teal and silver palette`（冷青银调）+ `high contrast`（黑底需要足够对比才高级）；`studio softbox lighting` 保证玻璃与金属的质感到位。
- 风格与审美：`luxury commercial still life` + `photorealistic` + `ultra sharp focus` 指向品牌广告级产品静物；结尾只留一个情绪词 `sophisticated`，同一语义维度不叠近义词，避免注意力被摊薄。
- 参数：`--v 8.2` 当前默认版本；`--ar 4:5` 竖版电商主图标准比例；`--s 100` 低风格化，保证瓶身形状不被模型"演绎改造"；`--raw` 降低模型演绎、更贴字面，写实/产品/摄影类必带；全 ASCII 半角标点，参数统一放末尾。
- 本次假设：瓶盖为拉丝银色、瓶身不带可见品牌文字、背景为暗色渐变棚拍背景。与实物不符时只改这三处，其余不动。

【变体】
A. 探索版（关键词堆叠，试构图快）：
```
frosted glass perfume bottle, black marble, cool blue rim light, macro product shot, luxury still life, dark background, high contrast --ar 4:5 --s 150 --c 40 --sd --raw --v 8.2
```
探索期用 `--sd` + `--c 40` 便宜试错，一次看多个构图方向；方向定了再换定稿版。

B. 定稿版（描述句，元素关系更明确）：
```
a frosted matte glass perfume bottle with a brushed silver cap, standing upright and pristine, on a polished black marble slab with fine white veining, mirror-like reflection on the marble surface, dark gradient studio backdrop, centered symmetrical composition, slightly low eye-level angle, macro product shot, shallow depth of field, generous negative space above the bottle, studio softbox lighting with cool rim light from the right, cool teal and silver palette, high contrast, luxury commercial still life, photorealistic, ultra sharp focus, sophisticated --ar 4:5 --s 200 --c 0 --hd --raw --v 8.2
```
`--s 200` + `--c 0` 锁死画面，`--hd` 出 2048px 交付图。注意 HD 图上再 Pan / Vary Region 会掉回 SD——先修图，最后一步再上 `--hd`。

C. 排除版（最终提示词 + --no …）：
```
a frosted matte glass perfume bottle with a brushed silver cap, standing upright and pristine, on a polished black marble slab with fine white veining, mirror-like reflection on the marble surface, dark gradient studio backdrop, centered symmetrical composition, slightly low eye-level angle, macro product shot, shallow depth of field, generous negative space above the bottle, studio softbox lighting with cool rim light from the right, cool teal and silver palette, high contrast, luxury commercial still life, photorealistic, ultra sharp focus, sophisticated --ar 4:5 --s 100 --raw --v 8.2 --no text, watermark, extra props, clutter, hands
```
减法交给 `--no`，比在正文里写"不要 xx"有效。`--no` 里的词会被逐词独立审核，所以只排 text / watermark / props / clutter / hands 这类安全词，不要写"不要现代服装"这种组合词。

【下一步】
- 比例不合适 → 只改 `--ar`（天猫/淘宝主图 3:4 或 2:3，抖音/小红书 9:16），其余一个字不动。
- 品牌名 / 瓶身标签 → MJ 不保证拼写，关键文字后期合成；需要控制标签形状与位置时，用 `--edit` 传标签稿再叠。
- 想更冷 / 更暖 → 只改光线段（`cool rim light` → `cyan light` 或 `warm light`），主体、构图、参数全部不动。
- 要出同系列多张（不同角度、不同规格） → 固定 `--seed` + 只改机位词；要严格一致，用 `--edit` 传这张成图作参考。
- 想更"广告感" → 把 `--s` 往上加（150–250），但瓶型会更艺术化，产品图慎用；整体还是保持 `--s 100` 更稳。
