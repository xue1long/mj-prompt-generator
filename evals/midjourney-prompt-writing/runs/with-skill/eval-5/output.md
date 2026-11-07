【最终提示词】

```
/imagine a lone figure rendered as a dark featureless silhouette, standing still beside a tall window and facing the bright glass, dim interior room with sheer curtain and window mullions, full-body shot, eye level shot, subject positioned off-center, rule of thirds composition, strong Back lighting with blown-out highlights outside the window, Rim lighting along the figure's edge, Glare with soft lens flare, Lowkey lighting, high contrast, photography, cinematic still, --sref https://example.com/style.jpg --sw 150 --ar 3:2 --s 100 --c 30 --sd --raw --v 8.2
```

【为什么这么写】

- **主体与动作**：一个人、一处窗、一个动作（静立、朝窗），不塞第二个主体；剪影直接写 `featureless silhouette`，不去描述五官，避免 MJ 给你补一张脸——这才是逆光剪影该有的样子。
- **构图与镜头**：`full-body shot` + `eye level shot` 是窗边人物最稳的一组；`subject positioned off-center` + `rule of thirds composition` 用来打破 MJ 默认把主体摆正中间的习惯；`window mullions`（窗格）本身自带引导线和框架感。
- **光线与色彩**：`Back lighting`（光源在主体之后，直接出剪影）+ `Rim lighting`（边缘一条亮边）+ `Glare`（窗外过曝、镜头耀光）+ `Lowkey lighting`（室内压暗）+ `high contrast` 兜住反差。**色彩一律不写死**——质感测试里颜色要交给参考图，正文再压颜色就是两边抢权重。
- **风格与审美**：只留 `photography` + `cinematic still` 两个中性词，**不写 grain、不写色调、不写画风**。这一版的任务是"把拍摄条件描述清楚，审美交给 `--sref`"；正文越干净，参考图那份质感越能被单独看见。
- **参数**：
  - `--sref https://example.com/style.jpg --sw 150`：质感的入口。`--sw` 按官方建议从 150 起步。
  - **不带 `--p` / `--profile`**：按你说的先不上长期画风；而且官方明确 `--sw`/`--sv` 与情绪板不兼容，本来就只能二选一。
  - `--ar 3:2`：你没说用途，我先给横构图（窗与人的关系在横幅里最完整）。要竖版封面只改这一处为 `--ar 9:16`，其余不动。
  - `--s 100`（探索期区间 50–150）+ `--c 30`：纯测试阶段留一点多样性，看同一张参考图能出几个方向。
  - `--sd`：测试期用标准分辨率省 GPU 成本，定稿再上 `--hd`。
  - `--raw`：摄影类默认建议带，压住 V8.2 的默认演绎，让画面贴着字面描述走。
  - `--v 8.2`；未使用 `--cref`/`--cw`（V8.2 已移除）、`--q`、`::` 权重、`--style raw`。

【变体】

A. **探索版（关键词堆叠，试构图快）**
```
/imagine silhouette, person standing, window, backlit, rim light, blown highlights, interior room, off-center, rule of thirds, photography, --sref https://example.com/style.jpg --sw 150 --ar 3:2 --s 50 --c 50 --sd --raw --v 8.2
```

B. **定稿版（描述句，元素关系更明确）**
```
/imagine A lone figure stands motionless beside a tall window, the daylight behind it blowing out the glass and reducing the body to a dark, featureless silhouette edged by a thin rim of light, sheer curtains diffusing the glow across a dim interior, the figure placed off-center at eye level in a wide horizontal frame, a quiet photographic moment with clean high-contrast falloff, --sref https://example.com/style.jpg --sw 150 --ar 3:2 --s 250 --c 0 --hd --raw --v 8.2
```

C. **排除版（最终提示词 + `--no`）**
```
/imagine a lone figure rendered as a dark featureless silhouette, standing still beside a tall window and facing the bright glass, dim interior room with sheer curtain and window mullions, full-body shot, eye level shot, subject positioned off-center, rule of thirds composition, strong Back lighting with blown-out highlights outside the window, Rim lighting along the figure's edge, Glare with soft lens flare, Lowkey lighting, high contrast, photography, cinematic still, --sref https://example.com/style.jpg --sw 150 --ar 3:2 --s 100 --c 30 --sd --raw --no anime, cartoon, illustration, painting, watermark, text --v 8.2
```

D. **结构对标版（参考图同时当垫图传）**
```
/imagine a lone figure rendered as a dark featureless silhouette, standing still beside a tall window and facing the bright glass, dim interior room with sheer curtain and window mullions, full-body shot, eye level shot, subject positioned off-center, rule of thirds composition, strong Back lighting with blown-out highlights outside the window, Rim lighting along the figure's edge, Glare with soft lens flare, Lowkey lighting, high contrast, photography, cinematic still, --edit https://example.com/style.jpg --sref https://example.com/style.jpg --sw 150 --ar 3:2 --s 100 --c 30 --sd --raw --v 8.2
```

D 是对照组：主提示词只把参考图当**风格**用（`--sref`），D 让它同时进 `--edit`（结构与光位），看"连构图也照抄参考图"会是什么效果。V8.2 里传参考图只有两条路——`--edit` 管内容结构、`--sref` 管风格，**`--cref`/`--cw` 已被移除**。注意 `--edit` 会按第一张参考图对齐宽高比，而默认 `--ar` 不会自动套用，所以这里仍然显式写了 `--ar 3:2`。

【下一步】

- **先换掉参考图直链**：我这边访问 `https://example.com/style.jpg` 返回 HTTP 404，`--sref` 需要一个 MJ 能直接读到的图片 URL（公开可访问，不能是需要登录或跳转的图床页面）。
- **参考图主体越少越好**：`--sref` 会把参考图里的主体特征一起带过来。若那张图里有明显的人物或物体，剪影会"长"成它的样子；这时把 `--sw` 压到 100，或换一张纯材质图。
- **一次只调一个变量**：想更吃参考图的质感 → `--sw` 从 150 往上加（300、500）；想更偏文字 → 降到 100。其余一律不动，才知道是哪个旋钮起的作用。
- **批量试构图**：网页端可在末尾加 `--draft`（一次出 24 张 512×512 草图，Discord 不支持）；网页端不需要写 `/imagine` 前缀。
- **出图后按元素报问题**：轮廓不干净 → 正文加 `featureless silhouette, clean hard edge`；窗外不够炸 → 把 `blown-out highlights` 改成 `blown-out overexposed highlights`；人太黑看不见 → 加 `soft fill light on the interior side`。
- **定稿复现**：拿到 seed（Discord 给图加 ✉️ 表情，机器人私信发你）后写回 `--seed`；同一张参考图 + 同一个 `--sw` + 同一个 `--ar` 就能稳定复现。
- **以后要上你那套长期画风**：情绪板（`--p` / `--profile`）与 `--sw`/`--sv` 官方不兼容，二选一——要长期画风就删掉 `--sref`/`--sw`，要参考图质感就走现在这条。
