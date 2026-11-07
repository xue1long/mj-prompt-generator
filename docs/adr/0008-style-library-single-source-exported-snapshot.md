# 风格库单一来源在 Midlibrary 站的 manifest，本仓只持有导出快照

Midlibrary 是一个风格库站（midlibrary.io/library），提供 5,502 个风格名与 4,638 个风格参考码，每条一行可复制的提示词加一张样例表。它的数据没有公开 JSON 接口（在服务端渲染的 RSC flight payload 里），但在隔壁仓 `ai-video-imge-prompts` 里已经采成 `sites/midlibrary/manifest.json`（10,140 条）并抓了本地缩略图。

本项目要吃掉这批数据。决定：**风格库的单一来源是隔壁仓的 manifest**；本仓不手抄、不手改，而是由 `tools/build-styles.ts` 生成一份静态快照 `config/styles.yaml`（构建期内联进产物，与 `config/prompts.yaml` 同一套机制）。风格条目（艺术家）在运行时并进「艺术家/摄影师」分类；风格参考码不进词库（那是另一件事，见 ADR-0009）。

## 考虑过的选项

- 直接把八千多条写进 `config/prompts.yaml`：手写源被生成物淹没，diff 与评审都失去意义；技能包快照也会跟着一起爆（ADR-0005 的导出脚本会把它们全导出去）。
- 运行时去读隔壁仓的 manifest：应用是本地离线的「双击即用」产物（ADR-0003），运行时不能依赖另一个仓的目录结构。
- 在本项目里重新抓一遍 Midlibrary：数据已经采好了，两份采集逻辑会各自漂移；抓取要处理 Referer 门、完整性校验与重试，不该在应用仓里重写一遍。
- 只在界面上放一个跳转到 midlibrary.io 的链接：查码是本项目的刚需（`--sref` 参数本来就存在，但用户既不知道码是多少，也不知道去哪儿查），跳转解决不了。

## 后果

- 更新流程固定两步：隔壁仓 `python tools/fetch.py --site midlibrary --tier thumb` 补图 → 本仓 `npm run build:styles` 生成快照、`npm run sync:style-images` 复制预览图。
- `config/styles.yaml` 是生成物，文件头写明「请勿手改」；手写词库与生成快照必须分文件（与 ADR-0005 同一条纪律）。
- 预览图不进版本库：`public/preview-images/midlibrary/` 由脚本从隔壁仓复制（约 185 MB），`.gitignore` 排除；缺图时界面回落到占位图。
- 风格条目没有中文名（上游只给原文名），所以「提示词条目」的定义要放开一类（见 `CONTEXT.md`）；界面显示时回落到原文名。
- 与手写词库重名的艺术家（实测 19 位，如 Nick Knight、Annie Leibovitz、Robert Capa）以手写的那条为准，风格库同名的跳过——手写条目有中文名和挑过的预览图，风格条目只有原文名和上游样例表。
- 词库并入发生在运行时（`src/utils/styleMerge.ts`），不是构建期：这样手写词库与风格快照各自独立，谁先谁后都能构建。
