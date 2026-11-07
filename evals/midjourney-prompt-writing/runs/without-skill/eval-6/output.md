# 新提示词 · 城市夜景街拍（霓虹 + 雨）

已新建下面这条提示词，直接复制进 Midjourney 输入框即可出图。

## 主提示词（推荐先跑这条）

```
/imagine prompt: cinematic night street photography, rain-soaked city alley just after midnight, dense neon signage in magenta cyan and warm amber glowing above the narrow street, saturated color bleeding across wet black asphalt, mirror-like puddles reflecting the signs, long-exposure light trails from a passing taxi, steam and mist drifting through the light beams, lone pedestrian holding a transparent umbrella in the mid-ground, shot on 35mm film, shallow depth of field, teal and orange color grade, atmospheric haze, high contrast, photorealistic, ultra detailed --ar 16:9 --style raw --stylize 200 --v 7
```

## 参数解读

| 参数 | 作用 |
| --- | --- |
| `--ar 16:9` | 横幅电影感构图，适合街景横幅 |
| `--style raw` | 降低模型默认的"美化"倾向，保留更真实的光影与颗粒 |
| `--stylize 200` | 中等风格化，霓虹这类题材数值太高容易糊成一团光斑 |
| `--v 7` | 当前主力模型版本 |

## 三个可直接用的变体

**1. 竖构图 · 雨滴与霓虹特写**
```
/imagine prompt: extreme close-up of raindrops on a dark window, neon signage refracted into abstract magenta and teal bokeh, wet glass, moody low-key lighting, 85mm lens, macro detail, film grain, cinematic --ar 9:16 --style raw --stylize 150 --v 7
```

**2. 赛博朋克 · 广角仰拍**
```
/imagine prompt: cyberpunk city street in the rain, towering neon billboards, holographic kanji and Chinese characters glowing through drizzle, wide-angle low-angle view, flying cars streaking light trails, flooded street reflections, volumetric fog, hyper-detailed, dramatic perspective, sci-fi cinematic --ar 21:9 --style raw --stylize 300 --v 7
```

**3. 复古胶片 · 安静街角**
```
/imagine prompt: rainy night street corner in a small East Asian town, soft pink and green neon glowing faintly through drizzle, wet pavement reflecting light, empty street, distant warm window light, nostalgic analog film photography, Kodak Portra 400, muted tones, soft grain, quiet melancholy mood --ar 4:5 --style raw --stylize 100 --v 7
```

## 迭代建议

- **画面太乱/发光糊成一团** → 把 `--stylize` 降到 `100–150`，并补一句 `sharp sign lettering, defined edges`
- **雨感不够** → 在描述里加 `heavy rainfall, visible rain streaks, dripping awnings, ripples spreading on puddles`
- **霓虹颜色太杂** → 限定色板，例如 `limited palette of magenta and teal only`
- **想要更强的反射** → 加 `wet reflective ground, mirror reflection, razor-sharp mirror reflections`
- **想换成俯视机位** → 加 `high angle shot looking down at the crosswalk`

## 排版检查

- 主体 → 场景 → 光线 → 镜头/胶片 → 画质 → 参数，顺序保持不变
- 逗号分隔的短语比长句更稳，避免 `and` 串联超过两个形容词
- 每条控制在 60–80 个词，堆太满反而互相干扰
