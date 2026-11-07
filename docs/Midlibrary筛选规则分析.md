# Midlibrary 筛选规则分析

> **取用日期：2026-11-05**
> 事实来源：<https://midlibrary.io/library?category=printmakers> 的真实 SSR HTML + 站点自身的客户端 JS chunk（`/_next/static/chunks/3gyq30p3bp6-w.js`，模块 `29206`）。
> 方法：用 Puppeteer 打开真实页面，逐个构造 URL 组合并读取命中数与筛选面板计数，再用站点自己的 URL 构造器源码交叉验证。
> 站点服务端过滤逻辑无法直接读到，规则由「输入 URL → 观察命中集」反推得出；并集/交集的数值自洽性互相印证（如 1546+919=2465、7∩26=3）。
> 全库规模：10,142 条，每页 48，共 212 页。

---

## 一、一句话结论

**URL 是唯一事实来源**：筛选面板只是 URL 的渲染结果。真正参与过滤的是 5 个筛选参数 `category` / `term` / `colour` / `tested` / `pick`（外加 `q` 搜索、`like` 相似），**面板上那 12 个视觉分组在数据层是扁平的**——除 CATEGORY 外全部共用同一个 `term` 参数。

---

## 二、参数总表（/library）

| 参数 | 含义 | 可多值 | 多值之间的关系 |
|---|---|---|---|
| `category` | 16 个分类（11 个艺术家类别 + Genres/Modifiers/Techniques/Titles/SREF codes） | ✅ | **OR（并集）** |
| `term` | 68 个标签，覆盖 10 个 UI 分组 | ✅ | **AND（交集）** |
| `colour` | 96 个具体色，按 10 个色系分组展示 | ✅ | **AND（交集）** |
| `tested` | 布尔，是否已被实测验证（全库 4,490 条） | ❌ | AND |
| `pick` | 布尔，编辑精选（554 条，chip 名 "Midlibrary Picks"，/library 无 UI 入口） | ❌ | AND |
| `q` | 全文搜索；**非空时 sort 自动切 `best`** | ❌ | AND |
| `like` | 相似风格（样式 slug）；**非空时 sort 自动切 `similar`** | ❌ | AND |
| `sort` | `popular` / `az` / `picks` / `tested` / `shuffle`（+ 派生的 `best` / `similar`） | ❌ | 不参与过滤 |
| `seed` | shuffle 随机种子 | ❌ | — |
| `page` | 分页，每页 48 | ❌ | — |
| `kind` | **死参数**：站内无任何 UI 生成它，任意取值 total=0 | ✅ | — |

同一参数重复出现 = 追加，不是覆盖：`?category=printmakers&category=painters` 表示同时要这两个。

> **为什么只有 category 是 OR？** 16 个类别的计数之和 = 1546+919+685+309+236+165+135+118+107+60+43+312+175+393+301+4638 = **10,142 = 全库总数**。即 **category 是对全库的互斥划分**，并集必然等于相加。而 term / colour 是**可重叠的标签**，多个取交集才有意义。

---

## 三、组合规则（实测）

### 3.1 类别之间是并集

| URL | 命中 | 说明 |
|---|---|---|
| `?category=painters` | 1,546 | |
| `?category=printmakers` | 43 | |
| `?category=painters&category=illustrators` | **2,465** | = 1546+919，**并集** |

### 3.2 标签之间是交集

在 `category=printmakers`（43 条）上下文内：

| URL | 命中 | 说明 |
|---|---|---|
| `?…&term=abstract` | 7 | |
| `?…&term=characters` | 26 | |
| `?…&term=abstract&term=characters` | **3** | = 7∩26，**交集** |
| `?…&term=detailed&term=geometric` | 9 | 34∩16 |
| `?…&term=detailed&term=characters` | 21 | 34∩26 |

> ⚠️ **这是最容易踩的坑**：面板上「风格质量 / 主题 / 视觉特效 / 技法 / 色彩 / 类型 / 题材 / 媒介 / 情绪 / 构图」是 10 个分组，但选 Abstract + Characters 得到的是 **AND（3 条）**，不是「风格质量组 OR 主题组」。**分组只是排版，不产生分组语义。**

### 3.3 颜色也是交集

| URL | 命中 |
|---|---|
| `?category=printmakers&colour=black` | 22 |
| `?category=printmakers&colour=black&colour=white` | **2**（交集，非并集） |

### 3.4 不同参数之间恒为 AND

| URL | 命中 |
|---|---|
| `?category=printmakers&term=abstract&tested=1` | 1（7 个 abstract 中只有 1 个测过） |
| `?category=printmakers&term=abstract&colour=black` | 2 |
| `?q=wood&category=printmakers&term=detailed` | 2 |

### 3.5 搜索与相似会改写排序

| URL | 命中 | 排序 | 芯片 |
|---|---|---|---|
| `?q=portrait` | 3,401 | **best**（自动） | `q:“portrait”` |
| `?like=alan-fearnley` | 96 | **similar**（自动） | `like:Like Alan Fearnley` |
| `?sort=picks` | 10,142（**不筛**） | picks | 无 |
| `?pick=1` | 554 | popular | `pick:Midlibrary Picks` |

---

## 四、面板分组 → 参数映射

| 面板分组 | 参数 | 选项数 | 说明 |
|---|---|---|---|
| CATEGORY | `category` | 16 | 11 个艺术家类别 + 5 个条目类型 |
| Style quality | `term` | 10 | |
| Subject | `term` | 12 | |
| Visual effects | `term` | 4 | |
| Technique | `term` | 9 | |
| Colour scheme | `term` | 9 | |
| Genre | `term` | 5 | |
| Theme | `term` | 5 | |
| Medium | `term` | 4 | |
| Mood | `term` | 6 | |
| Composition | `term` | 4 | |
| Tested | `tested` | 1 | 面板右下的独立开关，不在分栏里 |
| Colours（顶栏独立按钮） | `colour` | 96 | 10 个 family，只用于面板分栏，不是参数名 |

---

## 五、计数规则：**三类维度的口径互不相同**（最容易写错的一处）

| 维度 | 计数口径 | 实测证据 |
|---|---|---|
| **term** | **当前结果集内**带该 term 的条数（结果集已含 term 维度自身的过滤） | `?term=abstract&term=bold` → total=234，面板显示 abstract=234、bold=234、detailed=86、painters=69。若按「排除自身维度」应是 804/1079/8116 |
| **colour** | 同上，当前结果集内计数 | `?colour=black&colour=white` → total=449，black=449、white=449；`?colour=black` → white=449（非全库 1,627） |
| **tested** | 同上，当前结果集内计数 | `?category=printmakers&term=detailed` → total=34，tested=9 |
| **category** | **排除 category 维度自身过滤后**，其余条件下的条数（因为类别是 OR，反作用域才有意义） | `?category=printmakers&term=detailed` → total=34，但 painters=1,332、sref-styles=3,629 |

实测对照（`?category=printmakers&term=abstract` 上下文）：

| 选项 | 面板显示 | 口径 |
|---|---|---|
| Painters | 166 | category 口径：\|Painters ∩ abstract\| |
| Bold | 1 | term 口径：结果集内带 Bold 的条数 |
| Detailed | 2 | term 口径 |
| Abstract | 7 | term 口径（= 该项已选中，等于结果集总数） |
| Tested | 1 | tested 口径 |

**零计数选项照样显示**（Baroque 0 / Letters 0 / Pastel 0 …），不做隐藏。

---

## 六、交互与 URL 契约

- **面板是客户端渲染的**：SSR HTML 里没有任何 `term=` / `colour=` 链接（`[?&]term=` 匹配数为 0），必须打开 `.thin-panel` 才拿得到 href。
- **面板是纯链接**：每个选项都是 `<a class="thin-filter" href="…">`，href 直接是点击后的目标 URL；选中态靠当前 URL 反推。
- **已选条件渲染成芯片**（`.thin-chip`）：`43 styles shown with [Printmakers ×] [Abstract ×] [Reset]`。
  - 芯片的 `aria-label` 是「Show styles without X」——点击 × = **移除该条件**。
  - 芯片带 `data-chip`（category / term / colour / tested / pick / like / q），**q 的显示值带引号**：`q:“wood”`。
- **点已激活的分类 = 取消它**：`category=printmakers` 时面板里 Printmakers 的 href 是 `/library`。
- **Reset**：`.thin-state-reset` → `/library`（清空全部条件）。
- **筛选按钮上有个小圆点**（`.thin-filters-dot`）标记「当前有生效筛选」。
- **筛选面板是抽屉层**：`aria-expanded` + `aria-controls` 指向 `thin-panel` 容器，Esc 关闭。
- **搜索框有 `/` 快捷键提示**，排序是原生 `<select>`（`data-sort`）。
- **排序不改变命中集**，只改变顺序；`shuffle` 是随机器（配 `seed=` 可复现）。
- **无限滚动**：首屏 48 张卡片。
- `html` 上带 `data-grid-mode="details"` / `data-density="default"`：还有「详情/紧凑」两种网格与密度档位。
- **URL 改写**：`?category=sref-styles` 单独出现时会被客户端改写成 `/sref-codes`（同 4,638 条）。

---

## 七、边界行为

| 输入 | 结果 |
|---|---|
| `?category=printmakers&term=bogus-term-xyz` | **0 条**，且**不生成芯片**（无法识别的标签值被丢弃，不报错） |
| `?category=printmakers&subject=characters` | **静默忽略**（`subject` 不是已知参数），结果仍是 43 条、无芯片 |
| `?category=printmakers&kind=titles` | **0 条**，但**会生成芯片** `kind:titles`（参数名已知，只是无任何 UI 会生成它，且无内容匹配） |
| 参数顺序 | 无影响（`?a&b` ≡ `?b&a`，已验） |
| 数字格式 | 千分位：`1,546 styles`；单数 `1 style` |

---

## 八、库里的三种条目类型（同一个卡片组件）

`category` 组其实是**两个层级被压进了同一个参数**：艺术家类别（Printmakers/Painters/…）与条目类型（Titles/Genres/Modifiers/Techniques/SREF codes）。三者渲染成同一种 `.ml-style-card`，但**载荷不同**：

| 条目类型 | 示例 | 卡片动作 | 规模 |
|---|---|---|---|
| 艺术家风格 | Bertha Lum / Printmakers | Copy prompt | 43 条（该类） |
| 标题 | Studio Ghibli / Titles | Copy prompt | 301 条 |
| SREF 代码 | Hillside Letterform / SREF codes | **Copy SREF code** | 4,638 条，复制的是代码不是提示词 |

---

## 九、客户端 URL 构造器（源码佐证）

`/_next/static/chunks/3gyq30p3bp6-w.js`（模块 `29206`）：

```js
for (let t of e.categories) r.append("category", t);
for (let t of e.kinds)     r.append("kind", t);      // kinds 初始化为 [] 且无写入路径 → 死参数
for (let t of e.terms)      r.append("term", t);
for (let t of e.colours)    r.append("colour", t);
e.pick && r.append(…);
```

可以确认：**多值参数靠重复 append 表达**（`URLSearchParams.append`），面板与 URL 一一对应，没有隐藏的 JS 状态。

---

## 十、/lab 的结构（与 /library 的差异）

- **`/lab` 本身没有筛选面板**，是导航 hub（Explore / Benchmarks / Style Roulette）。
- **真正带面板的是 `/lab/benchmarks/{set}/{prompt}`**：
  - `set`：`sref`（SREF codes，3,949）/ `named`（Named styles，541）
  - sref 有 17 个 prompt、named 有 9 个 prompt
- **与 /library 共用同一套词表语义与 slug**（term 68 个、colour 96 个，category/term/colour 关系完全一致），差异只有三处：
  1. category 只列当前 set 内存在的（sref set 只有 SREF codes；named set 有 15 个非 SREF 类目）
  2. term/colour 计数被**限定在当前 benchmark set 内**（sref/portraits 里没有 `baroque`；named set 里没有 `psychedelic-colors` / `madness`）
  3. **无 Tested 开关**；sort 选项无 `picks`
- `/lab/style-roulette` 无面板，但复用同一套词表生成跳转链接，形如
  `/library?term=geometric&colour=light-orange&colour=brown` —— 侧面印证 term/colour 的 AND 组合用法。

---

## 十一、怎么拿这份词表（无公开 API）

- `robots.txt`：`Disallow: /api/` + sitemap 索引（18 个子 sitemap，内容是 `/library/<slug>` 页面 URL，**不含词表**）。
- **没有公开词表 API**：`/api/terms|filters|tools|library|search|options|taxonomy|colour(s)|categories|styles|config|health` 全部 404。
- **可机器解析的来源是 SSR 内嵌的 RSC flight payload**：

```
GET https://midlibrary.io/library?category=printmakers
→ 在 HTML 中定位 \"tools\":{\"state\" → 从其后的第一个 { 做括号配平扫描（跳过 \ 转义）
→ JSON.parse(JSON.parse('"' + raw + '"')) 即得完整对象
```

结构为：

```json
{ "state": {categories, kinds, terms, colours, pick, tested, q, like, sort, seed, page, defaultSort},
  "like": null,
  "categories": [{value, label, count, selected}],
  "termGroups": [{dimension, label, options:[{value, label, count, selected}]}],
  "colours": [{value, label, hex, family, count, selected}],
  "tested": {value, label, count, selected},
  "shuffleSeed": 0, "total": 10142 }
```

> 抓取提示：Node 内置 `fetch` 对该站偶发 ConnectTimeout（Cloudflare + IPv6），用 `Invoke-WebRequest`（PowerShell）或 puppeteer 更稳。

---

## 附录 A：category 词表（16 个，参数 `category=`）

计数为全库口径，**16 个之和 = 10,142 = 全库总数（互斥划分）**。

| slug | 显示名 | 全库计数 |
|---|---|---|
| `painters` | Painters | 1,546 |
| `illustrators` | Illustrators | 919 |
| `photographers` | Photographers | 685 |
| `various-artists` | Various | 309 |
| `sculpture-installation` | Sculptors | 236 |
| `designers` | Designers | 165 |
| `fashion-designers` | Fashion designers | 135 |
| `filmmakers` | Filmmakers | 118 |
| `architects` | Architects | 107 |
| `street-artists` | Street artists | 60 |
| `printmakers` | Printmakers | 43 |
| `genres-art-movements` | Genres | 312 |
| `general-modifiers` | Modifiers | 175 |
| `techniques` | Techniques | 393 |
| `titles` | Titles | 301 |
| `sref-styles` | SREF codes | 4,638 |

---

## 附录 B：term 词表（68 个，参数 `term=`）

10 个分组**共用同一参数**；分组名（dimension）只存在于 UI 与 payload 的 `termGroups[].dimension` 字段里。

| 分组 | slug \| 显示名 \| 全库计数 |
|---|---|
| `style_quality` Style quality (10) | `abstract`\|Abstract\|804 · `baroque`\|Baroque\|**4** · `bold`\|Bold\|1,079 · `detailed`\|Detailed\|8,116 · `expressive`\|Expressive\|3,403 · `illustrative`\|Illustrative\|2,985 · `minimalist`\|Minimalist\|107 · `ornate`\|Ornate\|1,627 · `realistic`\|Realistic\|2,317 · `sculptural`\|Sculptural\|1,196 |
| `subject` Subject (12) | `animals`\|Animals\|1,607 · `characters`\|Characters\|6,569 · `ethnic-poc`\|Ethnic\|60 · `fashion`\|Fashion\|1,032 · `floral`\|Floral\|1,718 · `landscapes`\|Landscapes\|4,222 · `letters`\|Letters\|**31** · `patterns`\|Patterns\|1,250 · `portraits`\|Portraits\|2,649 · `scenes`\|Scenes\|4,927 · `still-life`\|Still Life\|486 · `urban`\|Urban\|1,375 |
| `phenomenon` Visual effects (4) | `backlighting`\|Backlighting\|239 · `glow`\|Glow\|2,292 · `mist`\|Mist\|815 · `motion`\|Motion\|1,525 |
| `technique` Technique (9) | `bold-lines`\|Bold lines\|1,731 · `broad-brushstrokes`\|Broad brushstrokes\|896 · `crosshatching`\|Crosshatching\|425 · `fine-brushstrokes`\|Fine brushstrokes\|1,290 · `fine-lines`\|Fine lines\|2,687 · `flat-color`\|Flat color\|2,068 · `grain`\|Grain\|844 · `painterly`\|Painterly\|3,807 · `shallow-depth-of-field`\|Shallow focus\|860 |
| `style_color_scheme` Colour scheme (9) | `bw-monochrome`\|BW\|1,184 · `high-contrast`\|High contrast\|5,519 · `light-colors`\|Light\|91 · `metallic`\|Metallic\|245 · `moody-colors`\|Moody\|1,750 · `pastel-colors`\|Pastel\|135 · `psychedelic-colors`\|Psychedelic\|9 · `subdued-colors`\|Subdued\|2,734 · `vivid-colors`\|Vivid\|5,437 |
| `genre` Genre (5) | `cinematic`\|Cinematic\|1,320 · `comics`\|Comics\|525 · `documentary`\|Documentary\|86 · `sci-fi`\|Sci-fi\|587 · `surreal`\|Surreal\|3,264 |
| `theme` Theme (5) | `classical`\|Classical\|827 · `erotic`\|Erotic\|13 · `fantasy`\|Fantasy\|2,623 · `religious`\|Religious\|252 · `retro`\|Retro\|676 |
| `medium` Medium (4) | `collage`\|Collage\|313 · `drawing`\|Drawing\|1,746 · `halftone`\|Halftone\|27 · `ink`\|Ink\|888 |
| `mood` Mood (6) | `cute`\|Cute\|123 · `dark`\|Dark\|1,717 · `dreamy`\|Dreamy\|2,092 · `epic`\|Epic\|1,041 · `funny`\|Funny\|71 · `madness`\|Madness\|9 |
| `composition` Composition (4) | `geometric`\|Geometric\|2,386 · `negative-space`\|Negative space\|1,403 · `silhouette`\|Silhouette\|314 · `symmetry`\|Symmetry\|597 |

---

## 附录 C：colour 词表（96 个，参数 `colour=`）

family 名只用于面板分栏（`.thin-families`），**不是参数名**；参数名是具体色 slug。计数为全库口径。

| family | slug \| 全库计数 |
|---|---|
| neutral (7) | `black`\|4,998 · `bone-white`\|1,484 · `charcoal`\|1,760 · `cream`\|416 · `grey`\|1,534 · `silver`\|1,391 · `white`\|1,627 |
| red (7) | `dark-red`\|392 · `deep-red`\|174 · `light-red`\|51 · `muted-red`\|55 · `pale-red`\|41 · `red`\|584 · `vivid-red`\|598 |
| orange (10) | `dark-rust`\|22 · `deep-rust`\|31 · `light-orange`\|408 · `muted-orange`\|201 · `muted-rust`\|36 · `orange`\|348 · `pale-orange`\|306 · `rust`\|144 · `vivid-orange`\|110 · `vivid-rust`\|29 |
| brown (5) | `beige`\|1,162 · `brown`\|2,236 · `dark-brown`\|991 · `deep-brown`\|4 · `muted-brown`\|127 |
| yellow (10) | `dark-ochre`\|209 · `deep-ochre`\|**0**（面板不渲染） · `light-yellow`\|251 · `muted-ochre`\|510 · `muted-yellow`\|31 · `ochre`\|407 · `pale-yellow`\|241 · `vivid-ochre`\|8 · `vivid-yellow`\|2 · `yellow`\|22 |
| green (17) | `dark-green`\|528 · `dark-olive`\|323 · `deep-green`\|6 · `deep-olive`\|**0**（不渲染） · `green`\|119 · `light-green`\|29 · `light-lime`\|40 · `lime`\|3 · `muted-green`\|136 · `muted-lime`\|6 · `muted-olive`\|150 · `olive`\|85 · `pale-green`\|39 · `pale-lime`\|51 · `vivid-green`\|2 · `vivid-lime`\|**0**（不渲染） · `vivid-olive`\|1 |
| cyan (10) | `cyan`\|80 · `dark-cyan`\|234 · `dark-teal`\|179 · `light-cyan`\|80 · `light-teal`\|32 · `muted-cyan`\|373 · `muted-teal`\|183 · `pale-cyan`\|91 · `pale-teal`\|27 · `teal`\|37 |
| blue (7) | `blue`\|692 · `dark-blue`\|911 · `deep-blue`\|197 · `light-blue`\|152 · `muted-blue`\|616 · `pale-blue`\|142 · `vivid-blue`\|30 |
| violet (9) | `dark-indigo`\|19 · `dark-violet`\|15 · `deep-indigo`\|24 · `deep-violet`\|6 · `light-violet`\|8 · `muted-violet`\|11 · `pale-violet`\|15 · `violet`\|21 · `vivid-violet`\|11 |
| pink (14) | `dark-magenta`\|28 · `dark-pink`\|36 · `deep-magenta`\|6 · `deep-pink`\|8 · `light-magenta`\|19 · `light-pink`\|39 · `magenta`\|56 · `muted-magenta`\|21 · `muted-pink`\|22 · `pale-magenta`\|30 · `pale-pink`\|44 · `pink`\|174 · `vivid-magenta`\|15 · `vivid-pink`\|12 |

---

## 附录 D：其它值得记录的细节

1. **term slug 与样式详情页 slug 仅部分重叠**，不要互推：
   - 存在（200）：`/library/detailed`、`/library/baroque`、`/library/light-colors`、`/library/psychedelic-colors`
   - 不存在（404）：`/library/abstract`、`/library/bold`、`/library/letters`、`/library/shallow-depth-of-field`、`/library/bw-monochrome`
2. `/features`（By look）与 `/categories` 均为纯导航页，**无筛选面板、无 tools payload**。
3. `category=sref-styles` 单独出现时客户端改写 URL 为 `/sref-codes`（4,638 条）。
4. 分页：`pageSize=48`；`/library` 212 页、`/sref-codes` 97 页。

---

## 十二、结论与对本项目的取舍

**可借鉴的（做筛选面板时值得抄）**

1. **URL 即状态**：筛选结果可分享、可后退、可刷新复现；面板不持有状态。
2. **芯片 + Reset 的「当前条件」回显条**，用户永远知道自己在什么集合里。
3. **计数动态重算**，且**按维度区分口径**（划分型维度反作用域、标签型维度取结果集内计数）——这是让计数有决策价值的关键。
4. **选项即普通链接**（`<a href>`），无 JS 也能用、可右键新标签打开。

**别照抄的**

1. **分组只有排版意义**。如果本项目的提示词库要按「风格 / 主题 / 色彩」分组筛选，应当让**组内 OR、组间 AND**（经典 faceted search），而不是像该站那样全部压平成一个 AND 标签集——后者会导致「选 2 个标签几乎必然筛空」（实测 abstract+characters 只剩 3 条）。
2. `category` 用 OR 而 `term`/`colour` 用 AND 的不对称，容易让人误判结果集大小。若要统一，建议按**数据是否互斥划分**来决定，而不是按维度名字。
3. 未知参数静默忽略、无效标签返回 0 条空列表：本工具面向单人使用，更适合在 UI 上直接提示「该条件下无结果」，而不是给一个空列表。
4. `kind` 这类死参数、`sort` 的隐式改写（`q`→best、`like`→similar）会让 URL 语义变得含糊，本工具不必引入。
