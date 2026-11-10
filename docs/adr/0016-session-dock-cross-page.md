# 会话状态抽成恒常左栏 Dock（已选/主体环境/最终/参数）

> **状态：挂载点已修订（2026-11-07）**。探索榜并入提示词库成为第 9 个页签后，顶层「页面」概念取消，Dock 从「按页面换挂载点」改为「顶层单实例、始终左栏」。下文「跨页面常驻 / 探索榜内嵌右栏」的条目已作废，其余决定（主体环境入口迁移、手改态入会话、复用会话语义）仍有效，详见文末修订段。

把"已选提示词、主体环境、最终提示词、参数设置"这四块原本分散在 `App.vue` 左栏与 `PromptPanel` 第一个页签里的状态，抽成一个独立的跨页面常驻组件 `SessionDock`，统一承载与编辑。

## 决定

- **单一组件 `SessionDock`**：`src/components/Layout/SessionDock.vue`，内嵌 `SelectedPrompts` / `SubjectEnvironmentInput` / `FinalPrompt` / `ParameterSection`，自上而下为「已选提示词 → 主体与环境 → 最终提示词 → 参数设置」。
- **跨页面常驻**：
  - 工作台：左栏 = `SessionDock`，右栏 = 提示词库（`PromptPanel`）。
  - 探索榜：左栏 = 探索网格（`ExplorePage`），右栏 = 提示词库面板，**`SessionDock` 内嵌于该右栏**（"放入到提示词库里面"），默认在上、提示词库在下。
  - 两页共享同一套 Pinia 状态（`promptStore` / `parameterStore`），因此两处编辑实时互通。
- **主体环境编辑入口迁移**：原在 `PromptPanel` 第一个页签的「主体与环境」输入，移入 `SessionDock`，`PromptPanel` 删除该页签。编辑入口唯一，避免双入口状态漂移。
- **最终提示词手动改写态入会话**：`FinalPrompt` 的 `editedPrompt` / `isManuallyEdited` 从组件本地 `ref` 提升到 `promptStore`（`finalPromptEdited` / `isFinalPromptManuallyEdited`），并写进 `SessionSnapshot`，刷新/重开浏览器后保留（之前是纯本地态，刷新即丢）。
- **复用「会话」语义**：领域语言不新增词条，沿用 `CONTEXT.md` 的「会话」概念；仅扩展其内涵（现含最终提示词手改态），不另立术语。

## 考虑过的选项

- **底部浮条（探索榜）**：最早方案是探索榜底部可折叠浮条。被否决——用户明确要求"放入到提示词库里面"，即嵌进右栏提示词库面板，而非游离浮层。
- **探索榜左栏常驻面板**：曾考虑探索榜也用左栏 Dock。被否决——与"嵌入提示词库"的指令冲突。
- **两页各挂一个独立 Dock 实例**：实现更简单、无布局体操，但会产生两个 DOM 实例（仍共享 Pinia，状态一致）。未采用，因单组件按页面切换形态更贴合"全局固定"语义；当前实现中探索榜的 Dock 渲染在右栏、工作台在左栏，属同组件的不同挂载点。
- **手动改写态单独存 localStorage key**：由 `FinalPrompt` 直接读写独立键。否决——违背单一状态源，链路零散，且与 `saveToSession` 的合并式落盘不一致。
- **不抽组件、仅在 `App.vue` 加 sticky 包裹**：改动最小但无法跨页面复用，且主体环境仍需留在 `PromptPanel`。否决。

## 后果

- **新增文件**：`src/components/Layout/SessionDock.vue`；新增 ADR（本文件）。
- **改动文件**：`src/App.vue`（双页布局）、`src/components/PromptBuilder/PromptPanel.vue`（删主体环境页签）、`src/components/ResultPanel/FinalPrompt.vue`（绑定 store）、`src/stores/promptStore.ts`（新增两字段与 action）、`src/utils/sessionPersistence.ts`（`SessionSnapshot` 扩展两可选字段）。
- **向后兼容**：`SessionSnapshot` 新增两字段为可选，旧 `mj-session-v1` 快照缺字段时按 `''` / `false` 兜底，不破坏已存会话。
- **状态一致性**：两页 Dock 共享 Pinia，探索榜点头像回填 `subjectEnvironment` / 风格参考码 `styleRef` 会实时反映到 Dock。
- **术语表**：`CONTEXT.md`「会话」补充最终提示词手改态；「手动编辑提示词」注明其属于会话、持久化。

## 修订 2026-11-07：单实例、恒定左栏

**起因**：同日 ADR-0013 修订把探索榜改成提示词库第 9 个页签，顶层「页面」概念随之取消。用户明确裁决 SessionDock「始终左栏常驻」。原先「工作台挂左栏 / 探索榜内嵌右栏」的两个挂载点方案失去前提。

**新的决定**：

- `src/App.vue` 恒定两栏：左栏 `SessionDock`，右栏 `PromptPanel`（内含探索榜页签）。Dock 在根组件挂一次，切任何页签都不卸载、不换栏、不产生第二个 DOM 实例。
- 删除 `dock-embed` 形态与 `pageStore.page` 布局分支；`pageStore.current` 只剩 `DockToolbar`（左栏 `SessionDock` 顶部工具条）的导航高亮与搜索栏显隐两个用途。
- 「跨页面常驻」改称「跨页签常驻」：已无顶层页面，两处编辑入口变成同一处，状态一致性不再依赖「两个实例共享 Pinia」，而是天然只有一份 DOM + 一份 store。

**仍然有效**：单一组件 `SessionDock` 的四块构成、主体环境编辑入口唯一、最终提示词手改态提升到 `promptStore` 并写入 `SessionSnapshot`、`restored` 防挂载期竞态、旧 `mj-session-v1` 快照兼容、复用 `CONTEXT.md` 的「会话」语义不另立术语。

**改动文件**：`src/App.vue`（恒定两栏）、`scripts/verify-app.mjs`（Dock 判据改为「在左栏 + 单实例 + 非内嵌」）、`CONTEXT.md`（「会话」条目与探索榜章节）。

**回归判据**（`npm run verify` 两个 target）：词库页签与探索榜页签下都要求 `.main-column .session-dock` 存在；`.session-dock` 全页计数恒为 1；不含 `dock-embed`；最终提示词手改态刷新后仍保留。长期回归入口是 `npm run verify:dev`（`--require-dev` 强制 dev-server 目标不可被静默跳过）；普通 `npm run verify` 在 dev server 没起时只验构建产物并打印醒目警告——避免「只验了旧 dist、退出码却是 0」的假绿。

**考虑过但否决**：把 Dock 也做成提示词库的一个页签。否决——那样「已选提示词 / 最终提示词 / 参数设置」会随页签切换被遮住，违背「全局固定」的原始需求（澄清问题 Q1 选的是「跨页面常驻」）。
