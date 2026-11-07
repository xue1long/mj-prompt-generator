# 短剧女主 · 雨夜巷口回头 —— Midjourney 提示词

> 需求：短剧女主撑伞在雨夜小巷走，回头看一眼。
> 参考：`char_front.png`（角色设定图）+ 情绪板 `m123456`；画幅 9:16（竖屏，适合短剧/短视频）。

---

## 一、主提示词（直接复制到 Midjourney 输入框）

```
cinematic film still, a young East Asian woman walking alone down a narrow rain-soaked alley at night, holding a transparent umbrella tilted over her shoulder, shot from behind in three-quarter rear view, she turns her head back over her shoulder, guarded anxious expression, wet hair strands stuck to her cheek, beige trench coat over thin knit sweater, damp asphalt with mirror puddles, cyan and magenta neon signs glowing on wet brick walls, warm sodium streetlight rim light on her shoulder and umbrella edge, heavy rain streaks catching the backlight, volumetric haze, shallow depth of field 85mm, anamorphic lens flare, subtle 35mm film grain, moody teal and orange color grade, high contrast low-key night photography, ultra detailed skin texture, short drama cinematic key art --cref https://example.com/char_front.png --cw 80 --sref m123456 --sw 80 --ar 9:16 --style raw --no text, watermark, logo, caption --v 7
```

---

## 二、参数拆解（为什么这么写）

| 参数 | 取值 | 作用 |
|---|---|---|
| `--cref` | `https://example.com/char_front.png` | 角色参考，把设定图里的脸/身形绑定到画面主体 |
| `--cw` | `80` | 角色权重。`100`＝脸+服装全锁；`0`＝只锁脸。这里给 `80`，让 trench coat 服从剧情造型又不丢脸 |
| `--sref` | `m123456` | 情绪板作为风格参考（色调、光线、质感、镜头语言） |
| `--sw` | `80` | 风格权重。100 会完全接管画面；压到 80 保留情绪板质感但让"雨夜巷口回头"这个叙事动作清晰 |
| `--ar` | `9:16` | 竖屏 9:16，短剧正片与信息流竖屏原生比例（人物居中偏下，留出顶部字幕安全区） |
| `--style raw` | — | 抑制 MJ 默认"插画美化"，保留真实雨夜质感，短剧实拍感更强 |
| `--no` | `text, watermark, logo, caption` | 掐掉街边招牌文字、水印和字幕条 |
| `--v 7` | — | 当前版本，对 `--cref` / `--sref` 支持最完整 |

**画面逻辑（为什么这样描述）**

1. **叙事动作先写**：开头 `a young East Asian woman walking alone down a narrow rain-soaked alley at night` + `turns her head back over her shoulder`，把"走 + 回头"这个复合动作拆清楚，模型才不会只给一个正面站姿。
2. **机位服务于情绪**：`shot from behind in three-quarter rear view`（背面四分之三）——既保留"走"的动势（背影、伞、发丝被雨打湿），又让"回头"这个表情能被看清，比纯背影更有戏，比纯正面更有悬念。
3. **前后景分工**：前景暖色钠灯光给人物一道轮廓光（rim light），背景青/品红霓虹拉开纵深；雨丝靠背光被"点亮"才有质感（`heavy rain streaks catching the backlight`）。
4. **质感锚点**：`85mm + shallow depth of field`（浅景深虚化背景霓虹）、`anamorphic lens flare`、`35mm film grain` 三件套，是"电影截图"感的关键；`teal and orange` 调色对应短剧主流冷暖对撞。
5. **皮肤与细节**：`ultra detailed skin texture` 防止脸部被风格化抹平。

---

## 三、三个可直接替换的变体

**A. 钩子更强（短剧爆点版）** —— 加入身后追踪者剪影，仰角压迫感

```
cinematic film still, low angle, a young East Asian woman in a beige trench coat holding a transparent umbrella walking down a narrow rain-soaked alley at night, she turns her head back over her shoulder with a shocked guarded expression, a tall shadowy male figure following her in the far background out of focus, cyan and magenta neon on wet brick walls, sodium streetlight backlight, heavy rain streaks, volumetric haze, 85mm shallow depth of field, anamorphic flare, 35mm film grain, teal and orange grade, high contrast low-key, short drama thriller key art --cref https://example.com/char_front.png --cw 80 --sref m123456 --sw 80 --ar 9:16 --style raw --no text, watermark, logo --v 7
```

**B. 言情柔光版** —— 暖黄、伞下补光、雨量小，适合"回眸一笑"类桥段

```
cinematic film still, a young East Asian woman walking slowly down a rain-drenched old alley at night under a transparent umbrella, she turns her head back over her shoulder with a soft restrained smile, warm amber streetlight glow, gentle rain, wet pavement reflecting golden lights, soft bokeh, 50mm, shallow depth of field, delicate film grain, warm muted color grade, romantic short drama still --cref https://example.com/char_front.png --cw 80 --sref m123456 --sw 80 --ar 9:16 --style raw --no text, watermark, logo --v 7
```

**C. 极简剪影版** —— 情绪板权重拉满，交给 moodboard 决定色调

```
cinematic film still, a young East Asian woman with an umbrella walking in a rainy night alley, seen from behind turning her head back, neon reflections on wet ground, strong backlight, rain haze, deep shadows, minimal composition, film grain --cref https://example.com/char_front.png --cw 100 --sref m123456 --sw 150 --ar 9:16 --style raw --v 7
```

---

## 四、短剧连续镜头怎么排（同一角色多镜）

固定 `--cref` + `--sref` 不变，只改"镜头语言 + 景别"，就能得到一组风格统一的分镜：

1. **大全景**：删掉 `turns her head back`，改为 `wide shot, full body, tiny figure in the alley`
2. **中景（走路）**：`medium shot from behind, walking, umbrella in frame`
3. **回头瞬间**：主提示词原样（`three-quarter rear view, turns her head back`）
4. **特写**：`close-up portrait, three-quarter view, rain on her face, looking back over shoulder`
5. **主观镜头 / 空镜**：`empty alley at night, umbrella on the ground, rain ripples in a puddle`

补充两点：
- `--seed` 可以锁定随机性，但**人物一致性的主力是 `--cref`**；只靠 seed 换景别，脸会飘。
- 如果要连服装、发型、道具（伞/包）一起锁，把 `--cw` 提到 `100`；如果想让剧情服装自由发挥，降到 `50-60`。想连"人+物件"整体照搬设定图，可用 v7 的 `--oref https://example.com/char_front.png --ow 100` 代替 `--cref`。

---

## 五、两个微调开关

| 想要 | 改法 |
|---|---|
| 更真实、少插画感 | 加 `--style raw --s 150`（降低风格化随机） |
| 画面更"高级"、更有海报感 | 加 `--s 400`，并把 `midnight` 换成 `cinematic poster composition` |
| 雨更大更戏剧 | `heavy rain streaks catching the backlight` → `torrential downpour, water splashing off the umbrella` |
| 夜景太暗看不清脸 | 加 `soft fill light on her face from the neon sign`，或 `--sref` 权重降到 `60` |
| 想让情绪板主导 | `--sw` 提到 `150-300`（权重过高时会抢构图，画面可能变"不像雨夜巷口"，建议 80-150 试） |

---

**一句话结论**：把"走"和"回头"写进同一句主体描述，机位选背面四分之三，`--cref` 锁人、`--sref m123456` 锁情绪、`--ar 9:16` 锁竖屏，`--style raw` 保住实拍质感——这就是这条提示词的全部逻辑。
