【最终提示词】
a young woman in a light trench coat, holding a black umbrella and walking away through a rain-soaked narrow alley at night, turning her head back over her shoulder with a wistful look, wet asphalt reflecting streetlamp and neon signage, rain streaks on brick walls, full shot from behind at slight low angle, rule of thirds composition with the alley receding in deep perspective, dim cool streetlight mixed with warm neon accents, cinematic short-drama still, 35mm, shallow depth of field, --edit https://example.com/char_front.png --profile m123456 --s 180 --c 0 --raw --ar 9:16 --hd --v 8.2

【为什么这么写】
- 主体与动作：主体放最前、权重最高，画面只放一个人物。"walking away through a rain-soaked narrow alley at night" 与 "turning her head back over her shoulder" 把"走 + 回头看一眼"拆成两个可判定动作，避免模型画成站着不动只回头。情绪只给一个词 wistful，不叠近义词。
- 构图与镜头：背影全身 + 略低机位 + 三分法 + 巷道纵深引导线，把主体从默认的正中央挪开；竖屏里人物落在上三分点，后方留出走过的路，符合短剧"回头看身后"的叙事。shallow depth of field 压掉背景杂物，让观众只看她。
- 光线与色彩：只写光源事实（冷调路灯 + 暖调霓虹反射到湿地面），不写 muted color、film grain 这类色调词——色调统一由情绪板 m123456 负责，提示词里再压色调会和情绪板打架。
- 风格与审美：风格词只留一个类型标记 cinematic short-drama still，另两个是镜头词（35mm、shallow depth of field），不写 8k / masterpiece / best quality（V6 之后基本失效）。
- 角色一致性：--edit https://example.com/char_front.png 锁角色五官（V8.2 已移除 --cref，这是唯一正解）；--edit 不会自动套用宽高比，所以必须显式写 --ar 9:16。
- 情绪板：--profile m123456 是官方写法（--p m123456 只是社区简写）。带情绪板时不要写 --sw / --sv / --sref，官方不兼容。
- 参数：--v 8.2（默认版本，Edit Model 与 Moodboards 都依赖它）；--s 180——回头 + 持伞 + 雨丝属复杂动作，按漂移控制表压到 140–190 区间保结构，氛围不足再往上调；--c 0 定稿不要多样性；--raw 写实/摄影类情绪板建议开；--hd 出交付图。
- 红线自查：无 --cref/--cw、无 --style raw、无 --q、无 :: 权重、无 --v 8、无 --preview；--profile 与 --sw/--sv/--sref 未同现；未与 --edit 同现 --tile；标点全英文半角；单一主体。
- 唯一假设：角色设定图里的服装按"浅色风衣 / 夜街造型"写。若设定图是别的服装或妆造，只改正文里 "in a light trench coat" 这一处，其余不动。

【变体】
A. 探索版（关键词堆叠，试构图快，先 --sd 找方向）：
young woman, black umbrella, rain-soaked alley at night, walking away, glancing back over her shoulder, neon reflections on wet asphalt, rain streaks on brick walls, rule of thirds, shallow depth of field, --edit https://example.com/char_front.png --profile m123456 --s 100 --c 40 --sd --ar 9:16 --v 8.2

B. 定稿版（描述句，元素关系更明确）：
A young woman in a light trench coat holds a black umbrella and walks away down a rain-soaked narrow alley at night, then turns her head back over her shoulder with a wistful look; wet asphalt mirrors streetlamp and neon signage, rain streaks run down the brick walls; framed as a full shot from behind at a slight low angle, the alley receding in deep perspective with the subject off-center; lit by dim cool streetlight with warm neon accents; cinematic short-drama still, 35mm, shallow depth of field, --edit https://example.com/char_front.png --profile m123456 --s 180 --c 0 --raw --ar 9:16 --hd --v 8.2

C. 排除版（最终提示词 + --no，先写清要什么，再用减法）：
a young woman in a light trench coat, holding a black umbrella and walking away through a rain-soaked narrow alley at night, turning her head back over her shoulder with a wistful look, wet asphalt reflecting streetlamp and neon signage, rain streaks on brick walls, full shot from behind at slight low angle, rule of thirds composition with the alley receding in deep perspective, dim cool streetlight mixed with warm neon accents, cinematic short-drama still, 35mm, shallow depth of field, --edit https://example.com/char_front.png --profile m123456 --s 180 --c 0 --raw --ar 9:16 --hd --v 8.2 --no anime, cartoon, illustration, painting, text, watermark

【下一步】
- 先换掉占位链接：example.com/char_front.png 是占位域名，必须换成 MJ 能读到的图片直链（Discord 上传后点开大图右键复制，或网页端上传后到 Manage Uploads 取），否则 --edit 拿不到角色图。
- 回头动作最容易脸糊：再补一张 45° 侧面角色图一起 --edit（最多 4 张），比调 --s 更能锁住五官。角色设定图若已含服装妆造，--edit 会一并带过来，正文里的服装词按设定图改一次即可。
- 情绪板前提：Global Profile 必须先解锁，否则 --profile 直接报错；用了情绪板就别再写 --sw / --sv / --sref；情绪板内人像参考控制在 2 张以内，其余放空镜、材质、光影，否则脸会漂。
- 调参方向：结构跑形或多手多指 → --s 降到 140–160；氛围不足 → --s 提到 220–250；需要 Vary Region 修脸修手 → 先 --sd 跑构图，最后一步再 --hd（HD 图上局部重绘会降回 SD），且 V8.2 的 --edit 结果不兼容 Remix。
- 出系列分镜：固定同一个 --profile 和同一套"主体 + 动作 + 环境 + 镜头"骨架，只改场景与动作词，其余不动；每条镜头记下 prompt 和 seed 存成模板复用。
