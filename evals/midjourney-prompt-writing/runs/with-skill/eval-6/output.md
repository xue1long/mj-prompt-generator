【最终提示词】

```
a lone pedestrian holding a translucent umbrella, walking away from the camera through heavy rain on a city street at night, neon shop signs and vertical billboards in Japanese and Chinese characters, rain-soaked asphalt and puddles mirroring the signs, dense rain streaks caught in the air, humid night haze, medium long shot, eye level shot, rule of thirds composition with the figure placed off-center, leading lines of the wet street converging into the frame, neon lighting, magenta and cyan glow, rim light outlining the umbrella edge, lowkey lighting, street photography, photorealistic, cinematic, fine film grain, 35mm, lonely --ar 16:9 --s 150 --c 0 --raw --v 8.2
```

（把代码块里这一整行复制，粘贴到 `/imagine` 后面即可。）

【为什么这么写】

- 主体与动作：一个撑伞的行人背身走进雨里，是街拍里最稳的"人 + 环境"关系——既给画面一个可读的主体（背影不挑脸、不锁角色），又不会让霓虹背景喧宾夺主。伞特意写成半透明，能透出身后的霓虹色块，是雨夜最有辨识度的一件道具；"walking away"让画面自带叙事。
- 构图与镜头：中远景 + 平视机位，保留街拍真实的视高，不做成俯拍海报；三分法把人物推到画面右侧三分之一，打破 AI 默认的居中构图；湿路面的边缘和两侧招牌形成引导线，把视线牵向画面深处的霓虹，制造纵深。
- 光线与色彩：主光交给霓虹，用品红 + 青做冷暖对撞，这是雨夜霓虹最有辨识度的色彩关系；低调布光让暗部沉下去，伞沿再补一道轮廓光，把主体从霓虹背景里"剥"出来；湿沥青和积水负责把霓虹颜色复制第二遍，画面亮度因此不闷。情绪词只给一个 `lonely`——同一维度不叠近义词，否则注意力被摊薄。
- 风格与审美：写实街拍 + 胶片颗粒 + 35mm 质感，压掉 AI 插画味；`photorealistic` 与 `--raw` 配合，让材质（伞面、湿地、金属）更接近真实拍摄。
- 参数：`--ar 16:9` 是街拍默认横构图（要做竖屏封面或短剧就换 9:16）；`--s 150` 落在探索上沿与定稿下沿之间，先锁构图又留一点发挥；`--c 0` 保证同批出图不各跑各的；`--raw` 压住模型演绎、更贴字面，写实/摄影类默认带上；`--v 8.2` 是官方当前默认版本。

【变体】

A. 探索版（关键词堆叠，试构图快）：

```
street photography, neon night city, rain, wet asphalt reflections, lone pedestrian with umbrella, neon lighting, bokeh, film grain --ar 16:9 --s 100 --c 40 --sd --raw --v 8.2
```

B. 定稿版（描述句，元素关系更明确）：

```
/imagine a lone pedestrian holding a translucent umbrella walking away from the camera through heavy rain on a rain-soaked city street at night, standing in the right third of the frame, tall neon signs in Japanese and Chinese characters glowing above the street, wet asphalt and puddles mirroring magenta and cyan light, rain streaks catching the neon, a rim of light along the umbrella edge, humid night haze, street photography, photorealistic, cinematic, fine film grain, 35mm, lonely --ar 16:9 --s 250 --c 0 --hd --raw --v 8.2
```

C. 排除版（最终提示词 + 减法）：

```
a lone pedestrian holding a translucent umbrella, walking away from the camera through heavy rain on a city street at night, neon shop signs and vertical billboards in Japanese and Chinese characters, rain-soaked asphalt and puddles mirroring the signs, dense rain streaks caught in the air, humid night haze, medium long shot, eye level shot, rule of thirds composition with the figure placed off-center, leading lines of the wet street converging into the frame, neon lighting, magenta and cyan glow, rim light outlining the umbrella edge, lowkey lighting, street photography, photorealistic, cinematic, fine film grain, 35mm, lonely --ar 16:9 --s 150 --c 0 --raw --no daylight, crowds, watermark, illustration, anime, cartoon --v 8.2
```

【下一步】

- 用途先定一下：是封面 / 海报 / 竖屏短剧？给 9:16 我重排构图（引导线和人物位置要跟着换，不是把比例参数一改了事）。
- 这次是出单张，还是要成套系列？系列的话固定 `--seed` 只改一个变量，或用 `--sref` 锁画风——单张和系列的做法不一样。
- 画面哪块不对 → 指到具体元素（"伞的透视不对"、"背景招牌太糊"、"地面反射太亮"），我单点改，其它一律不动。
- 要换风格 → 只换风格词，其他不动：想要胶片光晕就把 `cinematic` 换成 `Cinestill 50 film`；想要更冷更硬就把 `magenta and cyan glow` 换成 `cyan light` + `hard lighting`。
- 招牌上的中文字不保证拼写准确（模型只做到"像"），要准确字样就后期合成；如果本来就不想要文字，在 `--no` 里加 `text`。
- 想要更实的雨丝和更细的湿地纹理，可试 `--exp 15`（细节/色调增强，社区实测甜区 10–25）。
- 下雨天更容易出"糊成一片"，先跑 A 版用 `--sd` 试构图和亮度，方向对了再上 B 版 `--hd` 出片。
