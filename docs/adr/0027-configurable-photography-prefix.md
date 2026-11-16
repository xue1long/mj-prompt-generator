# 摄影前缀基词改为会话级可配置

> **状态**：accepted（2026-11-11）
> **决策来源**：用户指出「最终提示词里面的 photography 是设置的」，追问后裁决「改成可配置」，并选定「基词可配，留空即无」+「会话级」。
> **配套**：`CONTEXT.md:32`（摄影前缀术语条）、ADR-0013 / ADR-0016（会话落盘契约）、ADR-0017（静态 WebUI）、ADR-0026（验证口径）

## 决定

把最终提示词的**摄影前缀基词**从硬编码常量 `photography` 改为会话字段 `session.photoPrefix`（默认 `photography`），落盘 `mj-session-v2`，在左栏会话 Dock 的「主体与环境」区提供输入框。

拼装契约（前端 `core.js` 与 `shared/utils/promptBuilder.ts` 镜像一致）：

| 基词 | 无艺术家 | 有艺术家 |
|---|---|---|
| `photography`（默认） | `photography` | `photography by <名字>` |
| 自定义，如 `cinematic still` | `cinematic still` | `cinematic still by <名字>` |
| 空串 | 整段消失，提示词从机位 / 主体开始 | 只留艺术家名，不带 `by` |

配置是**会话级**：随 `subject` / `params` 一起落盘，刷新复现；点「清空会话」复位为 `photography`。不是全局偏好，也不进 `PARAMETERS`（它不是 Midjourney 参数，不该出现在参数摘要或参数尾）。

## 为什么难逆转

- 往 `mj-session-v2` 加字段会写进用户本地存储；移除字段后旧会话需靠「缺字段即默认」兼容读取。
- 「留空即无」改变了最终提示词的第一段，是用户产出物的形态变化；外部若有基于 `photography` 前缀的样例、文档或评测，需要同步。
- `CONTEXT.md` 的「摄影前缀」术语条从「固定写法」变成「可配置基词」，属于领域语言变更。

## 考虑过的选项

| 选项 | 否决理由 |
|---|---|
| 只管兜底词（有艺术家时仍固定 `photography by X`） | 用户选「基词可配」；固定 by 语义会让配置在选了艺术家后失效，语义不统一 |
| 完整模板可配（`{prefix}` / `{artists}` 占位符） | 最灵活，但要在 UI 解释占位符并处理非法模板，超出本次需求 |
| 全局偏好（独立 key，跨会话保留） | 用户选「会话级」；清空会话应能一键回到默认 |
| 当作新的 MJ 参数塞进 `PARAMETERS` | 它不是 `--xxx` 参数，会污染参数摘要、参数尾与版本兼容链 |
| 只改前端 `core.js`，不动 shared 镜像 | 两边是镜像实现，单改一处会让单元测试与运行时口径分叉 |

## 后果

- **会话字段**：`core.js` 新增 `DEFAULT_PHOTO_PREFIX` 常量与 `session.photoPrefix`；`loadSession()` 在缺字段 / 旧版迁移 / 数据损坏时一律回落默认；`saveSession()` 写字段；`clearAll()` 复位。旧 `mj-session-v2` 无需迁移。
- **拼装**：新增 `photographyPrefix(artists)`；`buildAutoPrompt()` 第一段改用它，`parts.filter(Boolean)` 自然吃掉空段。`shared/utils/promptBuilder.ts` 的 `buildPhotography()` 加第 5 个可选参数 `photoPrefix: string = 'photography'`，旧调用零改动、默认行为不变。
- **UI**：Dock「主体与环境」区新增 `#prefix-input`（`data-od-id="dock-prefix"`），跟随 `#subject-input` 策略 —— `input` 事件边输边存 + `refreshFinalOnly()`，不重绘整个 Dock，输入焦点不丢。窄屏下它在常驻区，不在折叠的「会话明细」里（已截图确认）。
- **一致性**：`workbench.js` 艺术家详情的「提示词写法」预览改用 `photographyPrefix([a.en])`，否则界面显示 `photography by X` 而最终提示词是 `<基词> by X`。
- **清空按钮**：`finalBarHtml()` 与 `wireFinalBar()` 的「会话本来就是空的」判定加入 `photoPrefix !== DEFAULT`，否则只改了前缀时按钮仍是 disabled，无法复位。
- **边界（沿用既有设计，不擅自改）**：手动改写状态下（`session.manual !== null`），改前缀写入会话但 `finalPrompt()` 仍显示改写文本 —— 与改 `subject` 一致，自动提示词仍在后台计算；不擅自清掉用户手改内容。

## 验证

| 项 | 结果 |
|---|---|
| `npm run verify` / `verify --dist` | **137/137**（新增 7 条） |
| `npm test` | **18 文件 / 338 用例**（333 + 5），守卫第 1 次即收集完整 |
| `npx tsc --noEmit` | 6 个既存错误（`tests/filterEngine.test.ts` 4 + `tests/sampleExport.test.ts` 2），**零新增** |
| `npm run build` | 31 文件 / 7.14 MB / 23 JS / 4 HTML |
| `webui/` ↔ `dist/` 逐文件 sha256 | 31/31 一致 |
| `node --check` | `core.js` / `workbench.js` / `verify-webui.mjs` 全过 |

`verify-webui.mjs` 新增 4c 断言组：默认基词与控件、自定义即时生效 + 不重绘 Dock + 落盘、刷新复现、留空无开头段、有艺术家按基词拼接 / 留空只留名字、清空会话复位、视图零运行时错误。实测 `cinematic still --v 8.2 --ar 16:9` → 留空后 `a quiet library --v 8.2 --ar 16:9` → 清空后 `photography --v 8.2 --ar 16:9`。`tests/promptBuilder.test.ts` 新增 5 条覆盖 shared 镜像的组合。

宽屏 1440×900 与窄屏 800×600 截图确认：输入框与说明文字常驻可见、无裁切或溢出。

> 口径说明：ADR-0026 的验证表记的是它收尾时（130/130）的全项目快照；本 ADR 之后为 **137/137**，README 同步为 137。历史数字不追溯改写。

## 回退

删 `core.js` 的 `DEFAULT_PHOTO_PREFIX` / `session.photoPrefix` / `photographyPrefix()`，恢复 `buildAutoPrompt()` 的硬编码第一段；`saveSession` / `loadSession` / `clearAll` 去掉字段；删 Dock 控件、`wireDock` 接线与两处清空判定；`workbench.js` 恢复 `photography by ${a.en}`；`shared/utils/promptBuilder.ts` 去掉第 5 参与新逻辑；删 `tests/promptBuilder.test.ts` 的新 describe 与 `verify-webui.mjs` 的 4c 断言组；`CONTEXT.md` 术语条恢复；重跑 `npm run build`。旧 `mj-session-v2` 里残留的 `photoPrefix` 字段会被忽略，无需数据迁移。
