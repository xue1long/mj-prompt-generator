【最终提示词】
a young woman, eyes closed, absorbed in a distant memory, the same interior washed out into pale haze, 85mm lens, shallow depth of field, creamy bokeh, diffused backlight, nostalgic --edit https://example.com/char_front.png --profile m123456 --sref https://example.com/texture.jpg --s 220 --c 0 --raw --ar 9:16 --hd --v 8.2

【为什么这么写】
- 主体与动作：画面只放她一个人，主体放最前、权重最高。"eyes closed, absorbed in a distant memory" 一句话给完状态——闭着眼 + 心神不在当下，回忆的叙事由这两个短语承担，不额外堆"sad / pensive / dreaming"这类解释性形容。
- 构图与镜头：浅景深按可判定的光学事实写，不用中文近义词硬翻："shallow depth of field" 管虚实关系，"creamy bokeh" 管背景化开的光斑质感，"85mm lens" 是人像浅景深的常规焦段。朦胧靠"环境被洗白成 pale haze"这种画面事实 + 扩散光实现，而不是靠形容词。
- 光线与色彩：只写光源事实（diffused backlight，柔和无硬边的散射逆光），不写 muted color、film grain、low contrast 这类色调词——整套色调统一由情绪板 m123456 负责，正文里再压色调会和情绪板打架。
- 风格与审美：情绪只给一个词 nostalgic（回忆镜头的底色），不叠 melancholic / wistful / dreamy 这类近义词，否则注意力被摊薄；媒介感靠 --raw + 摄影术语，不写 8k / masterpiece / best quality（V6 之后基本失效）。
- 角色一致性：--edit https://example.com/char_front.png 锁角色五官——V8.2 已移除 --cref / --cw，这是唯一正解（--cref 只在 V6 / Niji 6 有效）。--edit 最多 4 张参考图，且第一张参考图会自动匹配宽高比、默认比例设置却不会自动套用，所以必须显式写 --ar 9:16。
- 情绪板与质感的二选一：这条走的是漂移控制的「策略 B · 特殊镜头（回忆 / 梦境 / 闪回）」——--edit 锁脸 + --profile 锁长期氛围 + --sref 临时叠质感。硬约束是：带了 --profile / --p 就绝不能再写 --sw / --sv（官方不兼容），所以这条里的 --sref 走默认权重 100。若你更想要更强的质感控制，就二选一——这条镜头放弃 --profile，改成 --sref URL --sw 100~120 单独控制（代价是丢掉整条剧的长期画风基准）。
- 参数：--v 8.2（Edit Model 与 Moodboards 都依赖它）；--s 220——氛围特写本该拉到 250–280，但叠加 sref 时上限就是 220，压在这条线上；--c 0 定稿不要多样性；--raw 写实 / 摄影类情绪板建议开；--hd 出交付图（1.3 GPU 分）；--ar 9:16 与这条戏的主线镜头保持一致，才能剪进同一场戏。
- 红线自查：无 --cref / --cw、无 --style raw、无 --q、无 :: 权重、无 --v 8、无 --preview；--profile 与 --sw / --sv 未同现；--tile 未与 --edit 同现；参数全在末尾、标点全英文半角；单一主体。
- 两条唯一假设（其余别动）：① 正文里 "the same interior" 是场景占位——MJ 不记得上一张图，同场戏的环境与服装必须在正文里复述一遍主线镜头里真实出现的元素（房间 / 走廊 / 窗边 + 关键道具），换掉这几个词即可；② --sref 指向的质感图必须无人物、只有材质光影，别用网红人像。

【变体】
A. 探索版（关键词堆叠，试构图快，先 --sd 找方向）：
woman, eyes closed, hazy, soft focus, shallow depth of field, creamy bokeh, diffused backlight, nostalgic --edit https://example.com/char_front.png --profile m123456 --sref https://example.com/texture.jpg --s 120 --c 40 --sd --ar 9:16 --v 8.2

B. 定稿版（描述句，元素关系更明确）：
A young woman with her eyes closed, absorbed in a distant memory, her face resting in soft diffused backlight while the room behind her dissolves into pale haze and creamy bokeh, framed as a medium close-up on an 85mm lens with shallow depth of field, nostalgic --edit https://example.com/char_front.png --profile m123456 --sref https://example.com/texture.jpg --s 220 --c 0 --raw --ar 9:16 --hd --v 8.2

C. 排除版（最终提示词 + --no，先写清要什么，再用减法）：
a young woman, eyes closed, absorbed in a distant memory, the same interior washed out into pale haze, 85mm lens, shallow depth of field, creamy bokeh, diffused backlight, nostalgic --edit https://example.com/char_front.png --profile m123456 --sref https://example.com/texture.jpg --s 220 --c 0 --raw --ar 9:16 --hd --v 8.2 --no anime, cartoon, illustration, painting, text, watermark

【下一步】
- 先换掉两个占位域名：example.com/char_front.png 和 example.com/texture.jpg 都必须换成 MJ 能读到的图片直链（Discord 上传后点开大图右键复制，或网页端上传后到 Manage Uploads 取），否则 --edit / --sref 拿不到参考图。
- sref 质感图的要求：只放材质与光影，不要人物、不要清晰人脸。这张图只服务这一条回忆镜头，跑完下一组主线镜头立刻把 --sref 拿掉——主线常驻 sref 会飘。
- 没有质感图也能跑：直接删掉 --sref 那段参数，其余一字不动（这是策略 A 的 --edit + --profile 写法），朦胧靠正文的 pale haze + creamy bokeh + --raw 就够。
- 脸不像：闭眼镜头对五官依赖低，主要看脸型、发际线、眉形；还是飘就再补一张 45° 侧面角色图一起 --edit（最多 4 张），比调 --s 更管用。
- 朦胧过头看不清人：删掉 soft focus，或把 creamy bokeh 换成 gentler background blur；没有回忆感：去掉 --sref 后把 --s 提到 250–280，或换一张更糊的质感图。
- 环境一致性：把正文里 "the same interior" 换成主线镜头里真实出现的环境与服装词，这条回忆镜头才能剪进同一场戏；--ar 也要与主线保持一致（这里按 9:16），别漏写——--edit 下默认比例不会自动套用。
- 情绪板前提：Global Profile 必须先解锁，否则 --profile 直接报错；情绪板内人像参考控制在 2 张以内，其余放空镜、材质、光影，否则脸会漂。
- 迭代注意：V8.2 的 --edit 结果不兼容 Remix，想调就改提示词重跑；关键字幕 / 时间轴文字后期合成，V8.2 不保证拼写准确。
