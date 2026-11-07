# NOTICE

本项目包含来自第三方站点的内容。**代码**是 MIT（见 [LICENSE](LICENSE)）；下面列出的**内容**受各自站点的条件约束，**不随 MIT 一起授权**。

---

## Midlibrary 风格库

| 项 | 内容 |
| --- | --- |
| 来源 | <https://midlibrary.io/library>（JB Nina, Inc.） |
| 内容 | 4,322 个风格条目（艺术家 / 摄影师 / 插画师 / 设计师 / 建筑师等）+ 4,638 个风格参考码，以及它们的样例图（缩略图，320px WebP） |
| 授权 | **有条件**：站方书面许可——允许在**个人学习用途**下镜像与使用这些内容（**含图片**），条件是**署名 + 回链原站** |

### 本项目如何履行这两个条件

- **回链**：每一张风格卡片上的「Midlibrary ↗」链接回该条目的原站页面（`https://midlibrary.io/library/<条目>`）。
- **署名**：「风格参考码」页签底部标注来源与授权条件；本文件即署名声明。
- 数据经 `tools/build-styles.ts` 从隔壁仓 `ai-video-imge-prompts` 的 `sites/midlibrary/manifest.json` 导出，生成物是 `config/styles.yaml`。

### 不在授权范围内的用法

把本项目连同上述内容**再分发**（发给别人、公开仓库、发布成品），或用于**商业用途**，都需要另行取得站方书面许可。代码本身不受此限。

---

## Midjourney 探索榜

| 项 | 内容 |
| --- | --- |
| 来源 | <https://www.midjourney.com/explore?tab=top>（Midjourney 官网 Explore 榜） |
| 内容 | 社区生成的成图（每条作业四格）、每条的原始提示词与作者名，以及部分作业带的风格参考码 |
| 授权 | **已获许可，可分发**；条件是**署名 + 回链原站**。许可文件见 `docs/licenses/` |

### 本项目如何履行这两个条件

- **署名**：每张卡片显示该条作业的作者名，页面底部标注来源与授权条件；本文件即署名声明。
- **回链**：灯箱里的「打开原站」指向 Midjourney 官网 Explore 榜（上游没有单条作业的公开深链，只能回到榜单页）。
- 数据由本项目自己的 `tools/collect-explore.ts` 采集：存量一次性从隔壁仓 `ai-video-imge-prompts` 导入，之后每天由本项目自己打上游匿名接口重采；生成物是 `config/explore.yaml`，缩略图重编码后存在 `public/explore/thumbs/`。

### 与 Midlibrary 风格库的区别

两处内容的授权条件**不同**：风格库是「有条件」（仅限个人学习用途的书面许可），探索榜是「已获许可可分发」。分别适用，不要互相套用。

---

## 其他

「摄影提示词库」（`config/prompts.yaml` 的 156 条摄影术语）来自本项目上游 [xueshanlinghu/MJPromptGenerator](https://github.com/xueshanlinghu/MJPromptGenerator)（MIT），并由野菩萨老师及其团队整理提供，见 [README.md](README.md) 的致谢。
