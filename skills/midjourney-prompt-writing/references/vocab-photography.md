# 摄影提示词词库

> **生成物 —— 请勿手改。**
> 由 `tools/export-vocab.ts` 从 `config/prompts.yaml` 导出。
> 快照日期：2026-11-05 ｜ 一级分类 5 个 ｜ 提示词条目 156 条
> 改词库请改 `config/prompts.yaml`，然后跑 `npm run export:vocab`。

---

## 怎么用这份词库

- 这是**摄影技术术语**词库：快门速度、景深光圈、镜头焦段与机位、光线方案、艺术家与流派。
- **画风、构图、情感、镜头质感词不在这里**，在 `vocab-style.md`。
- 术语本身的中文名只是标签，**真正进入提示词的是英文写法**。
- 同一术语以本文件为准；本文件未收录的风格词在 `vocab-style.md`。
- 每条的「示例用法」是当初生成预览图时用的提示词正文（已去掉参数尾），供你参考它出现在句子里时的样子。

## 位置标签

| 标签 | 含义 |
|---|---|
| `artist` | 艺术家 / 摄影师风格，写在提示词最前的摄影前缀位置 |
| `camera` | 机位与镜头 |
| `lighting` | 光线控制 |
| `other` | 其他 |

## 目录

- [快门速度](#快门速度)
  - [高速摄影](#高速摄影)
  - [延时摄影](#延时摄影)
  - [定时摄影](#定时摄影)
  - [光涂鸦](#光涂鸦)
- [景深和光圈](#景深和光圈)
- [镜头的长短和位置](#镜头的长短和位置)
  - [镜头位置](#镜头位置)
  - [景别](#景别)
  - [景别-角度](#景别-角度)
  - [景别-人物](#景别-人物)
  - [景别-特殊](#景别-特殊)
  - [景别-设备、胶片](#景别-设备、胶片)
- [光线控制](#光线控制)
  - [光线-影调](#光线-影调)
  - [光线-位置](#光线-位置)
  - [光线-光度](#光线-光度)
  - [光线-通用描述](#光线-通用描述)
  - [光线-色彩](#光线-色彩)
  - [光的形容词](#光的形容词)
- [艺术家/摄影师](#艺术家/摄影师)
  - [超现实](#超现实)
  - [复古超现实](#复古超现实)
  - [极简](#极简)
  - [风景](#风景)
  - [夜空](#夜空)
  - [其他特色](#其他特色)

## 分类总览

| 一级分类 | 二级分类 | 条目数 | 位置标签 |
|---|---|---|---|
| 快门速度 | 高速摄影 | 4 | `camera` |
| 快门速度 | 延时摄影 | 2 | `camera` |
| 快门速度 | 定时摄影 | 2 | `camera` |
| 快门速度 | 光涂鸦 | 3 | `camera` |
| 景深和光圈 | 条目 | 5 | `camera` |
| 镜头的长短和位置 | 镜头位置 | 8 | `camera` |
| 镜头的长短和位置 | 景别 | 6 | `camera` |
| 镜头的长短和位置 | 景别-角度 | 5 | `camera` |
| 镜头的长短和位置 | 景别-人物 | 9 | `camera` |
| 镜头的长短和位置 | 景别-特殊 | 9 | `camera` |
| 镜头的长短和位置 | 景别-设备、胶片 | 14 | `camera` |
| 光线控制 | 光线-影调 | 7 | `lighting` |
| 光线控制 | 光线-位置 | 6 | `lighting` |
| 光线控制 | 光线-光度 | 6 | `lighting` |
| 光线控制 | 光线-通用描述 | 6 | `lighting` |
| 光线控制 | 光线-色彩 | 18 | `lighting` |
| 光线控制 | 光的形容词 | 23 | `lighting` |
| 艺术家/摄影师 | 超现实 | 2 | `artist` |
| 艺术家/摄影师 | 复古超现实 | 3 | `artist` |
| 艺术家/摄影师 | 极简 | 7 | `artist` |
| 艺术家/摄影师 | 风景 | 3 | `artist` |
| 艺术家/摄影师 | 夜空 | 2 | `artist` |
| 艺术家/摄影师 | 其他特色 | 6 | `artist` |

---

## 快门速度

> 位置标签 `camera`（机位与镜头） ｜ 11 条

### 高速摄影

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 高速摄影 | `highspeed photography` | photography, highspeed photography, a red bell pepper falls into the clear water and splashes, product map |
| 慢动作 | `slow movement` | photography by Henri Cartier-Bresson, slow movement, A vintage black and white street photography shot of a man in mid-air jumping over a large puddle on a rainy Parisian street, 1950s style, water splashing everywhere, reflections on the wet ground, classic vintage cars parked in the background |
| 子弹时间 | `Bullet time` | photography, bullet time, a soccer player kicking ball in mid-air, stadium background |
| 慢镜头 | `slow motion` | photography, slow motion, water balloon bursting with colorful paint explosion, black background, dramatic lighting |

### 延时摄影

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 延时摄影 | `Time-lapse photography` | photography, time-lapse photography, city skyline from day to night transition, moving clouds and traffic light trails, urban landscape |
| 长曝光 | `long exposure` | photography, long exposure, waterfall with silky smooth flowing water, misty effect, rocks and green forest, soft natural light |

### 定时摄影

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 连续摄影 | `Chrono photography` | photography, chrono photography, multiple frames showing golf swing sequence in one image, clean white background, professional studio lighting |
| 频闪效应 | `Stroboscopic` | photography, stroboscopic, dancer moving across frame with multiple exposures creating motion trail, dark stage, strobe flash lighting |

### 光涂鸦

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 光绘 | `Light painting` | photography, light painting, glowing light trails drawing spiral patterns in darkness, long exposure night photography, vibrant neon colors |
| 光涂鸦 | `Light graffiti` | photography, light graffiti, urban street art created with colored light painting, abandoned warehouse wall, long exposure night shot |
| 光绘画 | `Light drawing` | photography, light drawing, silhouette of person drawing heart shape with sparkler in air, night beach scene, long exposure |

---

## 景深和光圈

> 位置标签 `camera`（机位与镜头） ｜ 5 条

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 景深 | `DOF` | photography, DOF, portrait shot, a woman's face in sharp focus with blurred autumn forest background, natural light, warm tones |
| 景深 | `Depth of field` | photography, depth of field, close-up of red rose in focus with garden blurred in background, soft morning light |
| 散景 | `bokeh` | photography, bokeh, portrait with beautiful circular bokeh lights in background, city night scene, warm golden lights |
| 梦幻散景 | `Bokehlicious` | photography, bokehlicious, dreamy portrait with creamy smooth bokeh, sparkling fairy lights background, magical atmosphere, soft focus |
| 移轴摄影 | `Tilt-shift photography` | photography, tilt-shift photography, aerial view of race track with racing cars, miniature effect, selective focus, toy-like appearance |

---

## 镜头的长短和位置

> 位置标签 `camera`（机位与镜头） ｜ 51 条

### 镜头位置

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 天文摄影 | `Astrography` | photography, astrography, milky way galaxy over mountain landscape, stars and nebulae, long exposure night sky |
| 天体摄影 | `Astro photography` | photography, astro photography, spiral galaxy with colorful nebula, deep space, telescope view |
| NASA拍摄 | `Shot by NASA` | photography, shot by NASA, Earth from space with clouds and continents, blue marble, satellite view |
| 哈勃望远镜拍摄 | `Shot by hubble space telescope` | photography, shot by hubble space telescope, colorful cosmic nebula with stars, pillars of creation style, deep space |
| 近轨道拍摄 | `near orbit shot` | photography, near orbit shot, space station orbiting Earth, curvature of planet, atmospheric glow |
| 微距摄影 | `Macrography` | photography, macrography, extreme close-up of butterfly wing showing detailed scales and patterns, vibrant colors |
| 显微摄影 | `Micro photography` | photography, micro photography, microscopic view of colorful crystals, scientific, detailed structure |
| 微距视角 | `Macroview` | photography, macroview, water droplets on spider web with morning dew, bokeh background, soft light |

### 景别

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 极远景镜头 | `extreme long shot` | photography, extreme long shot, tiny person in vast desert landscape, endless sand dunes, dramatic sky |
| 远景镜头 | `Telephoto shots` | photography, telephoto shots, compressed perspective of mountain peaks, distant landscape, atmospheric haze |
| 远景镜头 | `long shot` | photography, long shot, person walking on beach from distance, coastline and ocean, golden hour |
| 中景镜头 | `medium shot` | photography, medium shot, person sitting at cafe table, upper body visible, urban street background |
| 特写镜头 | `close-up` | photography, close-up, human eye with detailed iris, reflections, sharp focus, natural light |
| 极特写镜头 | `extreme close-up` | photography, extreme close-up, human lips texture, skin pores visible, dramatic lighting |

### 景别-角度

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 顶视图 | `topview` | photography, topview, breakfast table from directly above, coffee and food arrangement, flat lay |
| 高角度镜头 | `high angle shot` | photography, high angle shot, person reading book in library, looking down from above, warm lighting |
| 低角度镜头 | `low angle shot` | photography, low angle shot, skyscraper looking up, dramatic perspective, blue sky background |
| 仰视角度 | `bottom-up view` | photography, bottom up view, tree canopy from ground level, branches against sky, sunlight filtering through |
| 平视角度 | `eye level shot` | Photography, eye level shot, a woman facing a sea of red maple leaves, with her back to the camera, the maple forest lush and green, showcasing the essence of autumn |

### 景别-人物

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 全身照 | `Full-body shot` | photography, full-body shot, fashion model standing, entire body visible head to toe, studio background |
| 半身照 | `Half-body shot` | photography, half-body shot, business person from waist up, professional attire, office environment |
| 腰部特写 | `waistup shot` | photography, waistup shot, chef cooking in kitchen, from waist to head, culinary action |
| 侧面照 | `side shot` | photography, side shot, person's profile silhouette, side view, dramatic rim lighting |
| 肖像照 | `Portrait` | photography, portrait, headshot of smiling person, shoulders and face, natural expression, soft lighting |
| 背影照 | `Back shot` | photography, back shot, person walking away towards sunset, rear view, silhouette |
| 颈部特写 | `Back neck shot` | photography, back neck shot, close-up of neck and hairline from behind, elegant, soft light |
| 锁骨特写 | `Collarbone shot` | photography, collarbone shot, close-up of collarbone and neck area, jewelry detail, elegant lighting |
| 手部特写 | `Hand shot` | photography, hand shot, close-up of hands holding coffee cup, detailed texture, warm light |

### 景别-特殊

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 广角 | `Wide angle` | photography, wide angle, spacious interior of modern home, expansive view, natural light |
| 超广角 | `Ultra-wide angle` | photography, ultra-wide angle, dramatic perspective of city street, distorted edges, dynamic composition |
| 全景 | `Panorama` | photography, panorama, sweeping mountain range landscape, wide horizontal view, epic scale |
| 360全景 | `360 panorama` | photography, 360 panorama, complete circular view of valley, surrounding landscape, immersive |
| 鱼眼镜头 | `Fish eye lens` | photography, fish eye lens, circular distorted view of skateboarder, extreme wide angle, curved horizon |
| 俯瞰视角 | `Aerial view` | photography, aerial view, bird's eye view of coastal town, buildings and beach, drone perspective |
| 过肩镜头 | `over shoulder shot` | photography, over shoulder shot, view from behind person's shoulder, conversation scene, natural framing |
| 第一人称视角 | `First-person view` | photography, first-person view, hands visible in frame holding hiking poles, trail ahead, POV perspective |
| 第三人称视角 | `Third-person view` | photography, third-person view, photographer in landscape taking photo, external perspective, storytelling |

### 景别-设备、胶片

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 数码单反 | `DSLR` | photography, DSLR, sharp professional photo of landscape, high detail, crisp focus |
| 尼康Z7 | `NikonZ7/Z7II` | photography, NikonZ7, high-resolution portrait with excellent color, professional quality |
| 佳能EOS R5 | `CanonEOSR5` | photography, CanonEOSR5, wildlife action shot with fast autofocus, sharp details |
| 富士X-T4 | `FujifilmX-T4-APS-C` | photography, FujifilmX-T4, street photography with film simulation colors, vintage tones |
| 索尼Alpha 1 | `SonyAlpha1` | photography, SonyAlpha1, sports action freeze frame, incredible detail, professional |
| 徕卡SL2 | `LeicaSL2` | photography, LeicaSL2, premium portrait with exceptional lens quality, rich tones |
| 松下LUMIX S1R | `PanasonicLUMIXS1R` | photography, PanasonicLUMIXS1R, high-resolution landscape with excellent dynamic range |
| 哈苏H2D | `HasselbladH2D` | photography, HasselbladH2D, medium format fashion photography, exquisite detail, studio quality |
| GoPro运动相机 | `GoPro` | photography, GoPro, action sports with wide angle view, extreme sports, dynamic motion |
| 大疆无人机 | `DJI` | photography, DJI, aerial drone shot of winding river through forest, top-down view |
| Cinestill 50胶片 | `Cinestill 50 film` | photography, Cinestill 50 film, cinematic colors with halation glow, night city lights |
| 柯达Tri-X 400胶片 | `Kodak Tri-X400 film` | photography, Kodak Tri-X400 film, classic black and white with grain, street photography |
| 柯达富士C200 | `Kodak Fujicolor C200` | photography, Kodak Fujicolor C200, warm film colors, nostalgic summer vibes, natural tones |
| Lomo Color 100 | `Lomography Color100` | photography, Lomography Color100, vibrant saturated colors, artistic vignette, experimental |

---

## 光线控制

> 位置标签 `lighting`（光线控制） ｜ 66 条

### 光线-影调

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 伦勃朗光 | `Rembrandt lighting` | photography, rembrandt lighting, portrait with triangle of light on cheek, dramatic shadows, classic studio setup |
| 半面光（分割光） | `split lighting` | photography, split lighting, portrait with half face lit and half in shadow, dramatic contrast, side lighting |
| 贝壳夹光 | `clamshell lighting` | photography, clamshell lighting, beauty portrait with soft shadows under chin, upper and lower lights, glamorous |
| 蝴蝶光 | `butterfly lighting` | photography, butterfly lighting, portrait with butterfly-shaped shadow under nose, centered above subject, classic beauty lighting |
| 派拉蒙光 | `Paramount Lighting` | photography, paramount lighting, glamorous portrait with classic Hollywood lighting, soft shadows, elegant mood |
| 环形光 | `loop lighting` | photography, loop lighting, portrait with small shadow of nose looping down, natural look, versatile |
| 泛光（无影光） | `flat lighting` | photography, flat lighting, portrait with minimal shadows, even illumination, beauty photography |

### 光线-位置

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 顶光 | `Top lighting` | photography, top lighting, subject lit from directly above, dramatic overhead light, theatrical mood |
| 舞台光 | `Stage lighting` | photography, stage lighting, performer in spotlight on dark stage, theatrical beams, dramatic atmosphere |
| 背光 | `Back lighting` | photography, back lighting, subject with light source behind, silhouette effect, golden rim |
| 轮廓光 | `Rim lighting` | photography, rim lighting, portrait with glowing edge light outlining subject, dramatic separation, moody |
| 底光 | `Bottom lighting` | photography, bottom lighting, face lit from below, eerie dramatic effect, horror movie style |
| 侧光 | `Side lighting` | photography, side lighting, portrait with strong directional light from side, texture emphasis, dramatic shadows |

### 光线-光度

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 硬光 | `Hard lighting` | photography, hard lighting, portrait with sharp defined shadows, strong contrast, intense directional light |
| 柔光 | `Soft lighting` | photography, soft lighting, portrait with gentle diffused light, smooth gradual shadows, flattering |
| 宽位光 | `board lighting` | photography, broad lighting, portrait with lit side of face toward camera, fuller look, classic setup |
| 窄位光 | `short lighting` | photography, short lighting, portrait with shadow side facing camera, slimming effect, dramatic contour |
| 高调光 | `Highkey lighting` | photography, highkey lighting, bright airy portrait with minimal shadows, white background, cheerful mood |
| 低调光 | `Lowkey lighting` | photography, lowkey lighting, dark moody portrait with deep shadows, black background, mysterious atmosphere |

### 光线-通用描述

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 影视级灯光 | `cinematic lighting` | photography, cinematic lighting, movie-quality scene with dramatic contrast, professional color grading, epic mood |
| 摄影棚灯光 | `Studio lighting` | photography, studio lighting, professional portrait with controlled artificial light, softboxes, clean background |
| 自然光 | `Natural light` | photography, natural light, portrait by window with soft daylight, authentic feel, organic shadows |
| 阳光 | `Sunlight` | photography, sunlight, outdoor portrait in bright sunshine, warm golden tones, sun flare |
| 聚光灯 | `Spotlight` | photography, spotlight, subject in focused beam of light, dramatic focal point, theater style |
| 耀光 | `Glare` | photography, glare, intense bright light washing over scene, lens flare, overexposed highlights |

### 光线-色彩

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 霓虹灯光 | `Neon lighting` | photography, neon lighting, urban night scene with colorful neon signs, vibrant glow, cyberpunk atmosphere |
| 红光 | `red light` | photography, red light, portrait bathed in red illumination, dramatic intense mood, cinematic |
| 蓝光 | `blue light` | photography, blue light, portrait with cool blue tones, calm mysterious atmosphere, nighttime feel |
| 绿光 | `green light` | photography, green light, portrait in emerald illumination, sci-fi atmosphere, matrix style |
| 黄光 | `yellow light` | photography, yellow light, portrait with golden yellow glow, cheerful warm mood, sunny feel |
| 橙光 | `orange light` | photography, orange light, portrait with sunset orange tones, warm cozy atmosphere, autumn feel |
| 紫光 | `purple light` | photography, purple light, portrait in violet illumination, dreamy mysterious mood, artistic |
| 粉光 | `pink light` | photography, pink light, portrait with soft pink glow, romantic dreamy atmosphere, feminine |
| 白光 | `white light` | photography, white light, portrait in pure white illumination, clean bright atmosphere, modern |
| 暖光 | `warm light` | photography, warm light, portrait with golden warm tones, cozy inviting atmosphere, sunset feel |
| 冷光 | `cool light` | photography, cool light, portrait with blue-tinted cool tones, refreshing calm atmosphere, morning feel |
| 金光 | `golden light` | photography, golden light, portrait in rich golden hour illumination, warm luxurious glow, magical |
| 银光 | `silver light` | photography, silver light, portrait with cool metallic sheen, elegant sophisticated atmosphere, moonlight feel |
| 琥珀光 | `amber light` | photography, amber light, portrait in warm honey-colored glow, nostalgic vintage atmosphere, retro |
| 青光 | `cyan light` | photography, cyan light, portrait with bright turquoise tones, fresh modern atmosphere, tech feel |
| 品红光 | `magenta light` | photography, magenta light, portrait in vivid fuchsia illumination, bold artistic mood, contemporary |
| 紫罗兰光 | `violet light` | photography, violet light, portrait with deep purple-blue tones, mysterious ethereal atmosphere, dreamy |
| 彩色光 | `colorful light` | photography, colorful light, portrait with multiple rainbow colors, vibrant festive atmosphere, dynamic |

### 光的形容词

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 闪烁的 | `Coruscating` | photography, coruscating light, subject with flickering glittering illumination, dynamic sparkles, magical |
| 明亮的 | `bright` | photography, bright light, scene flooded with intense illumination, high key, cheerful mood |
| 闪烁的 | `flashing` | photography, flashing light, subject with intermittent bursts of light, strobe effect, energetic |
| 闪闪发光的 | `sparkling` | photography, sparkling light, scene with tiny points of glittering light, festive magical atmosphere |
| 斑驳的 | `Dappled` | photography, dappled light, subject with spotted light patterns through foliage, natural organic shadows |
| 光滑的 | `Glossy` | photography, glossy light, subject with shiny reflective surface highlights, polished sleek appearance |
| 闪耀的 | `Gleaming` | photography, gleaming light, subject with bright steady radiance, polished metallic shine |
| 发光的 | `shining` | photography, shining light, subject emitting strong steady glow, luminous bright atmosphere |
| 辐射的 | `radiant` | photography, radiant light, subject with glowing energy radiating outward, warm luminous aura |
| 闪耀的 | `Glistening` | photography, glistening light, subject with wet sparkly surface reflections, fresh dewy appearance |
| 有光泽的 | `lustrous` | photography, lustrous light, subject with soft pearlescent sheen, elegant refined glow |
| 清澈的 | `Lucid` | photography, lucid light, scene with crystal clear transparent illumination, pure pristine quality |
| 辉煌的 | `Resplendent` | photography, resplendent light, subject with dazzling magnificent brilliance, glorious radiant atmosphere |
| 闪烁的 | `Shimmering` | photography, shimmering light, subject with soft wavering glow, gentle flowing luminescence |
| 光谱的 | `Spectral` | photography, spectral light, scene with rainbow prism colors, ethereal ghostly quality |
| 着火的 | `Ablaze` | photography, ablaze light, subject engulfed in intense fire-like glow, burning passionate atmosphere |
| 发光的 | `Aglow` | photography, aglow light, subject with warm gentle inner radiance, soft comforting luminescence |
| 欣喜的 | `Beaming` | photography, beaming light, subject with bright joyful radiance, happy cheerful glow |
| 熊熊燃烧的 | `Blazing` | photography, blazing light, subject with fierce intense flames of light, powerful fiery atmosphere |
| 眼花缭乱的 | `Dazzling` | photography, dazzling light, subject with blindingly brilliant illumination, stunning overwhelming brightness |
| 光辉灿烂的 | `Effulgent` | photography, effulgent light, subject with radiant shining splendor, magnificent glowing brilliance |
| 闪烁的 | `Twinkling` | photography, twinkling light, subject with intermittent sparkles, starry magical atmosphere |
| 华丽的 | `splendor` | photography, splendor light, subject with magnificent grandeur, majestic glorious radiance |

---

## 艺术家/摄影师

> 位置标签 `artist`（艺术家 / 摄影师风格，写在提示词最前的摄影前缀位置） ｜ 23 条

### 超现实

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 桑迪·斯科格伦 | `Sandy Skoglund` | photography by Sandy Skoglund, surreal installation with hundreds of bright orange cats in a monochrome blue room, highly saturated colors, whimsical repetition |
| 大卫·拉切贝尔 | `David LaChapelle` | photography by David LaChapelle, hyper-saturated pop surrealism portrait with vibrant colors, theatrical lighting, celebrity culture aesthetic, baroque composition |

### 复古超现实

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 杰夫·克恩 | `Geof Kern` | photography by Geof Kern, vintage surreal fashion editorial with retro styling, dreamlike atmosphere, soft muted colors, 1960s aesthetic |
| 安格斯·麦克比恩 | `Angus McBean` | photography by Angus McBean, vintage theatrical portrait with dramatic surreal elements, classic Hollywood glamour, elaborate staging, black and white |
| 拉尔夫·尤金·米亚德 | `Ralph Eugene Meatyard` | photography by Ralph Eugene Meatyard, mysterious figure wearing mask in abandoned decaying interior, ghostly atmosphere, black and white, experimental |

### 极简

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 查马·马多斯 | `Chema Madoz` | photography by Chema Madoz, minimalist black and white conceptual still life, poetic everyday objects transformed, clever visual metaphor, simple composition |
| 阿克斯·梅吉 | `akos major` | photography by akos major, minimalist geometric composition with clean lines, abstract architectural forms, monochromatic palette, precise balance |
| 斯嘉丽·霍夫特·格拉夫兰 | `Scarlett Hooft Graafland` | photography by Scarlett Hooft Graafland, minimalist surreal landscape with unexpected colorful elements, vast empty space, playful intervention in nature |
| 埃里克·马迪根·赫克 | `Erik Madigan Heck` | photography by Erik Madigan Heck, fine art fashion with vibrant saturated colors, painterly quality, artistic elegance, editorial sophistication |
| 迈尔斯·奥尔德里奇 | `Miles Aldridge` | photography by Miles Aldridge, hyper-saturated cinematic fashion, intense vibrant colors, film noir lighting, dramatic retro aesthetic, glossy finish |
| 尼克·奈特 | `Nick Knight` | photography by Nick Knight, avant-garde fashion with experimental techniques, bold innovative visuals, pushing boundaries, contemporary edge |
| 安妮·莱博维茨 | `Annie Leibovitz` | photography by Annie Leibovitz, iconic celebrity portrait with narrative storytelling, intimate yet grand, dramatic natural lighting, editorial mastery |

### 风景

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 马辛·索巴斯 | `Marcin Sobas` | photography by Marcin Sobas, dramatic landscape with moody atmospheric lighting, dark clouds, epic natural scenery, cinematic wilderness |
| 马丁·瑞克 | `Martin Rak` | photography by Martin Rak, night sky with stunning star trails circling over landscape, long exposure astrophotography, cosmic motion |
| 塞巴斯蒂昂·萨尔加多 | `Sebastião Salgado` | photography by Sebastião Salgado, powerful black and white documentary, human condition and nature, dramatic contrast, epic scale, social consciousness |

### 夜空

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 迈克尔·沙布伦 | `Michael Shainblum` | photography by Michael Shainblum, vibrant milky way galaxy over dramatic landscape, brilliant star-filled sky, astrophotography with vivid colors |
| 米科·拉格斯泰特 | `Mikko Lagerstedt` | photography by Mikko Lagerstedt, ethereal night landscape with aurora borealis, moody atmospheric blues and greens, minimalist Nordic scenery |

### 其他特色

| 中文 | 英文 | 示例用法 |
|---|---|---|
| 米沙·格尔丁（暗黑） | `Misha Gordin` | photography by Misha Gordin, dark surreal conceptual art, philosophical themes, haunting atmosphere, dramatic black and white, human silhouettes |
| 罗伯特·卡帕（战地） | `Robert Capa` | photography by Robert Capa, gritty war photojournalism, decisive moment in conflict, raw emotion, black and white documentary, historical significance |
| 张克纯（中国农村） | `Zhang Kechun` | photography by Zhang Kechun, contemplative Chinese rural landscape, Yellow River scenery, documentary style with artistic vision, muted natural colors |
| 任航 | `Ren hang` | photography by Ren hang, avant-garde portrait of urban Chinese youth, bold unconventional angles, raw emotional expression, contemporary street style |
| 张晶娜 | `Zhang jingna` | photography by Zhang jingna, ethereal fantasy portrait with flowing fabrics, dreamy soft lighting, Asian-inspired fairy tale aesthetic, romantic elegance |
| 维基 | `Weegee` | photography by Weegee, gritty black and white street photography, crime scene and New York nightlife, flash-lit drama, 1940s tabloid style |

---

## 主体与环境示例

> 提示词里唯一由你自由书写的部分是「主体与环境」。下面是几种起手写法。

| 场景 | 主体 | 环境 | 合并 |
|---|---|---|---|
| 户外人像 | a woman with long hair | in a beautiful garden with blooming flowers | `a woman with long hair, in a beautiful garden with blooming flowers` |
| 山景 | snow-capped mountains | under golden hour sky, misty valley below | `snow-capped mountains, under golden hour sky, misty valley below` |
| 城市街景 | modern city street | at night with neon lights and rain reflections | `modern city street, at night with neon lights and rain reflections` |

---

> 预览图在本仓库的 `public/preview-images/` 下，与本文件同源。
