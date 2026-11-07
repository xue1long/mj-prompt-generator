【最终提示词】

an elderly fisherman in his sixties, weathered lined face and calloused hands, hauling a heavy wet net with both hands and braced legs, thick sea fog over a small fishing harbor before dawn, wooden pier, moored wooden fishing boats, coiled rope and orange net floats, full-body shot from a low angle, rule of thirds composition with the subject off-center, leading lines from the pier converging toward him, cold blue-gray predawn light, soft diffused low-contrast light through the fog, faint amber glow on the horizon, muted desaturated palette, documentary photography, photojournalistic, candid, natural light, fine film grain, lonely, --ar 3:4 --s 150 --c 0 --raw --hd --v 8.2

【为什么这么写】

- **主体与动作**：`an elderly fisherman in his sixties` 坐实年龄（`in his sixties` 比 `old` 更能让模型画出六十多岁的脸，而不是七八十岁或二十几岁）；`weathered lined face and calloused hands` 给年龄可看的证据——褶皱的脸、老茧的手，这两处是纪实说服力的来源；动作写成 `hauling a heavy wet net with both hands and braced legs`，"拉"的方向、重力和用力的姿态都比 `pulling a net` 更有分量。
- **细节与环境**：`thick sea fog over a small fishing harbor before dawn` 同时交代雾、港口、凌晨三个要素，`before dawn` 比 `dawn` 更靠前、也避免日出直射光；`moored wooden fishing boats`、`coiled rope and orange net floats` 是让画面"像真的港口"的锚点，橙色浮子同时给冷调画面一点跳色。全场只有一个人，不塞第二主体。
- **构图与镜头**：`full-body shot from a low angle` 让老人在竖幅里占住高度，略带仰视强化劳作的重量感；`rule of thirds composition with the subject off-center` 打破 AI 默认把主体摆正中间的习惯；`leading lines from the pier converging toward him` 用栈桥和缆绳把视线牵到人身上，让画面不是"一个人站在空地上"。
- **光线与色彩**：`cold blue-gray predawn light` + `soft diffused low-contrast light through the fog` 是雾天凌晨的真实光比——软、低对比、无硬阴影；`faint amber glow on the horizon` 给冷蓝一点暖的呼吸口，避免整张灰死；`muted desaturated palette` 压住饱和度，这是纪实片与旅游宣传片的分界线。
- **风格与审美**：`documentary photography` + `photojournalistic` + `candid` 三词共同锁定"纪实"，`candid` 挡掉摆拍感；`natural light` 排除影棚光；`fine film grain` 给一点胶片质感；情绪词只用一个 `lonely`（用户未指定情绪，按"雾中独自劳作"取孤独感；同一维度不叠近义词）。
- **参数**：
  - `--v 8.2`：默认版本，照片级真实感直接可用。
  - `--ar 3:4`：朋友圈竖版最实用的比例（对应 1080×1440），主体在方形缩略图里也能保住；想手机全屏沉浸看，把比例换成 `--ar 9:16`，其余不动。
  - `--s 150`：定稿锁画面的区间是 100–250；探索期要降回 50–150 并配 `--c 30–50`。
  - `--c 0`：定稿关掉多样性，避免四张各画各的。
  - `--raw`：写实/摄影类建议带，降低模型演绎、更贴字面（注意是 `--raw`，不是 `--style raw`）。
  - `--hd`：定稿出 2048px。注意 HD 图上做局部重绘或扩图会降回 SD，改图请先在 `--sd` 阶段试稿。
  - 未写 `--cref` / `--q` / `::` / `--style raw` / `--v 8`（V8.2 均不支持或已废弃）；也没有用 `--tile`、`--sw` 等易冲突参数。

【变体】

A. **探索版**（关键词堆叠，试构图快，`--sd` 便宜试错）

elderly fisherman, hauling net, foggy harbor, predawn, wooden pier, fishing boats, orange net floats, full-body shot, low angle shot, rule of thirds, blue hour, cold tones, documentary photography, photojournalistic, film grain, --ar 3:4 --s 100 --c 40 --sd --raw --v 8.2

B. **定稿版**（描述句，元素关系更明确，适合复杂情绪）

An elderly fisherman in his sixties braces himself on the wet planks of a small fishing harbor and hauls a heavy net through the thick fog before dawn, cold blue-gray light diffusing through the sea mist while a faint amber band of sunrise glows low on the horizon, documentary photojournalism, candid unposed moment, natural light, subtle film grain, muted desaturated color, lonely, --ar 3:4 --s 200 --c 0 --raw --hd --v 8.2

C. **排除版**（最终提示词 + `--no`，压住 AI 味和过度后期）

an elderly fisherman in his sixties, weathered lined face and calloused hands, hauling a heavy wet net with both hands and braced legs, thick sea fog over a small fishing harbor before dawn, wooden pier, moored wooden fishing boats, coiled rope and orange net floats, full-body shot from a low angle, rule of thirds composition with the subject off-center, leading lines from the pier converging toward him, cold blue-gray predawn light, soft diffused low-contrast light through the fog, faint amber glow on the horizon, muted desaturated palette, documentary photography, photojournalistic, candid, natural light, fine film grain, lonely, --ar 3:4 --s 150 --c 0 --raw --hd --no anime, cartoon, illustration, painting, 3d render, oversaturated, HDR, text, watermark --v 8.2

【下一步】

- **画面哪块不对** → 指到具体元素再改，别整体重写：比如"脸的朝向"、"手和网绳的接触"、"背景的杂物"、"雾太浓看不见船"。一次只动一个变量。
- **要系列图**（同一老人多张、或者这套港口的成套图）→ 固定 `--seed` 微调场景；角色长相要锁死用 `--edit` 传角色图（V8.2 主力手段，`--cref` 已废弃）；只要画风统一用 `--sref` + `--sw`（从 150 起）。V8 的 seed 是"99% 相同"，不是像素级一致。
- **要换风格** → 只换风格词，其他不动：想要更硬的纪实感，可在最前面加摄影家前缀 `photography by Zhang Kechun`（中国纪实、自然低饱和）；想要黑白纪实，正文加 `black and white` 即可，参数不变。
- **要更浓的雾或更暗的氛围** → 只动第 ⑤ 段光线词：`cold blue-gray predawn light` 改成 `blue hour light, heavy fog, low visibility`，其余七段全部保持原样。
