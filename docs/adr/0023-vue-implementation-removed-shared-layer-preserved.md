# Vue 实现删除，共享逻辑层迁出到 shared/

> **状态：已实施并验证（2026-11-11）**。Vue 版实现（`src/` 58 文件 / 11,198 行）已删除，Vue 依赖已从 `package.json` 移除，`legacy:*` / `verify:legacy*` 脚本已退役。**但报告 3.5 原文的「删除 `src/`」被实测收窄** —— `src/` 同时是**共享逻辑层**的所在，其中 7 个纯逻辑模块被 8 个测试文件直接依赖，整体删除会连带删掉被测对象。故拆层：类型与纯逻辑层迁出到 `shared/`，Vue 层整体删除。**测试覆盖零损失**（16 文件 / 295 用例，与第 10 步基线完全一致）。
>
> 依据：报告 3.5（`docs/第一性原理校验报告.md`）、执行序第 11 步。实施编年见 ADR-0017 的 Round 18。

## 背景

报告 3.5 诊断：项目里并存两套前端实现 —— Vue 3 SPA（`src/`）与静态多页 WebUI（`webui/`）。同批功能有两份代码（组装 / 筛选 / 会话持久化 / 探索榜），`package.json` 保留 `legacy:dev` / `legacy:build` / `legacy:preview` / `verify:legacy` 四条脚本，`scripts/verify-app.mjs` 还在维护。保留成本不只是体积 —— **它让「哪个是权威实现」在每个新人眼里都要重新确认一次**。

ADR-0017（原裁决）判定「静态 WebUI 为正式前端，Vue 退役但源码保留」，并预留了 `legacy:*` 作为回退点。本 ADR 关闭这个回退点。

## 决定

1. **Vue 实现整体删除**：`src/`（58 文件 / 11,198 行）、根 `index.html`（Vite 入口）、`scripts/verify-app.mjs`（Vue 版冒烟验证）。`package.json` 移除 `legacy:dev` / `legacy:build` / `legacy:preview` / `verify:legacy` / `verify:legacy:dev` 五条脚本，以及 `vue` / `pinia` / `naive-ui` / `vue-tsc` / `@vitejs/plugin-vue` 五个依赖。
2. **共享逻辑层迁出到 `shared/`**，不删：
   - `src/types/`（7 文件 / 611 行）→ `shared/types/`
   - `src/utils/` 中被测试依赖的 7 个纯逻辑模块（1,334 行中的绝大部分）→ `shared/utils/`
   - `src/vite-env.d.ts` → `shared/env.d.ts`（删 `*.vue` 声明，保留 `virtual:app-config`）
   - 全部用 `git mv` 迁移，**历史保留**（`git log --follow` 可追）
3. **`@/` alias 指向 `shared/`**：`tsconfig.json` 的 `paths` 与 `vitest.config.ts` 的 `test.alias` 同步改为 `shared/*`。⇒ **8 个测试文件的 import 路径一个字都不用改** —— 改的是 alias 的指向，不是测试代码。
4. **`vite.config.ts` 改名 `vitest.config.ts`**：删 vue 插件、dev server 段、build 段；保留 `yamlConfigPlugin()`（`virtual:app-config` 虚拟模块）与 `cacheDir`（绕开 Windows 系统 Temp 的 EPERM 竞争）。
5. **`tools/*.d.ts` 改名 `tools/*.d.mts`**：`.mjs` 模块的声明文件必须是 `.d.mts` 才会被 TypeScript 匹配到。

## 为什么不是「整体删除 src/」

实施前逐层实测 `src/` 的实际内容，发现报告原文把 `src/` 整体当「退役的 Vue 实现」，**这个前提只对了一半**：

| `src/` 子层 | 文件 / 行数 | 性质 | 依赖方 |
|---|---|---|---|
| `components/` | 25 / 7,588 行 | Vue UI（naive-ui） | 仅 Vue 自身 |
| `stores/` | 9 / 970 行 | Pinia 状态 | 仅 Vue 自身 |
| `assets/` + `App.vue` + `main.ts` + `vite-env.d.ts` | 4 / 609 行 | Vue 入口 | 仅 Vue 自身 |
| **`types/`** | **7 / 611 行** | **纯 TS 类型** | **`tools/` 3 个文件 + `tests/` 8 个文件** |
| **`utils/`** | **13 / 1,334 行** | **纯 TS 函数** | **其中 7 个模块被 `tests/` 8 个文件直接 import 并断言行为** |

被依赖的 7 个模块：`facetFilter` / `filterHash` / `exploreHash` / `styleMerge` / `promptLabel` / `promptBuilder` / `parameterCompat`。实测 7/7 文件中 `from 'vue'` / `document.` / `window.` 出现次数**均为 0** —— 它们是纯逻辑，不是 UI 代码。

**按字面整体删除的后果**：

- 295 个用例里约 100 个直接编译失败（被测对象不存在）；
- `webui/js/filter-engine.js`（第 7 步抽出的唯一筛选引擎）**失去全部单元测试保护** —— `styleMerge` / `promptLabel` / `exploreHash` 在 `webui/` 侧**无对应实现**（实测 grep 零命中），不是「改个路径」能解决的。

## 考虑过的选项

- **A（采纳）—— 拆层迁出**：只删 Vue 层，类型与纯逻辑层迁到 `shared/`，alias 指向新位置。代价是改 13 处 import 路径（3 个 `tools/` + alias 配置），收益是测试覆盖零损失、双前端问题彻底消失。
- **B（否决）—— 按字面整体删**：一步到位、无需改 import，但测试从 295 掉到约 190，筛选与提示词拼装的核心算法覆盖归零。**代价大于收益** —— 删除冗余不该以删掉测试为代价。
- **C（否决）—— 先移植到 `webui/js/` 再删**：真正做到零 TS 残留，但 `styleMerge` / `promptLabel` / `exploreHash` 在 webui 侧无实现，等于**新写 3 个模块**，且要从 ESM 改写成 webui 的 IIFE 全局风格。工作量与风险最高，且把「删冗余」变成「写新功能」。

用户 2026-11-11 拍板选 **A**。

## `src/` 那 26 项未提交改动的处置

`src/` 删除前工作区有 **26 项未提交改动**（23 M + 1 D + 2 ??，611 insertions / 603 deletions）。实测确认：

- 全部停在 **2026-11-07 19:42–20:49**，正是「探索榜放入提示词库」决策的时点；
- 内容是 4 类 Vue 版改造：① 顶栏下沉成左栏 Dock（`AppHeader.vue` 删除 222 行，新增 `SessionDock.vue` / `DockToolbar.vue`）② 探索榜从独立页变词库页签 ③ GitHub / ❤️ 入口删除 ④ naive-ui 主题 token 对齐（`App.vue` 的 `themeOverrides`）。

**该决策在第 7 步已按报告 4.2 被推翻**（探索榜升为独立一级视图「研究样本库」，ADR-0020）。`webui/` 已按新决策重做，实测：无 appbar 顶栏代码、无 GitHub 入口、主题用纯 CSS token（`:root` / `[data-theme="light"]`）—— 不存在 Vue 版那些问题。

用户 2026-11-11 拍板**直接丢弃**（git 历史保留 2026-11-07 基线，随时可取回）。

## 后果

- **`webui/` 是唯一前端实现** —— 「哪个是权威实现」不再需要重新确认。
- **Vue 依赖清零** —— `package.json` 的 `dependencies` 只剩 `js-yaml`（构建期 YAML 解析）。
- **测试覆盖零损失** —— 16 文件 / 295 用例，与第 10 步基线完全一致。
- **类型检查错误净减 1** —— 7 → 6。`.d.ts` → `.d.mts` 后 `tools/job-key.mjs` 的隐式 any 声明生效。剩余 6 个错误（`tests/filterEngine.test.ts` 4 个、`tests/sampleExport.test.ts` 2 个）是迁移前就存在的历史问题，不在本步范围。
- **`tools/` 纳入类型检查** —— `tsconfig.json` 的 `include` 增加 `tools/**/*.ts`（原只含 `src/` + `tests/`）。生产代码纳入检查是净收益。
- **历史 ADR 不改写** —— ADR-0001 / 0004 / 0008 / 0013 / 0015 / 0016 / 0018 里提到 `src/` 的段落**保留原样**（那是历史记录，不是当前事实）。ADR-0013 末尾那句「该实现将在第 11 步删除」现已成真。
- **`docs/screenshots/` 4 张 Vue 时代截图仍在** —— README 已自述过时；重拍属独立视觉轮次，不在本步。

## 实施中踩到的两个坑

| 坑 | 现象 | 根因 | 修法 |
|---|---|---|---|
| **vitest 2.x 不读 `resolve.alias`** | `@/utils/*` 报 `Cannot find module`，但 vite 侧探针能看到别名 | vitest 的模块解析走 `test.alias`；写在 `resolve.alias` 里只影响 vite 应用构建管线 | 改到 `test.alias`（已在 `vitest.config.ts` 的文件头注明，避免复发） |
| **`git mv` 之后 Write 写回旧路径** | `vitest.config.ts` 的内容被回退成旧 `vite.config.ts` | Write 写的是 `vite.config.ts` 路径，之后 `git rm` 把新文件删掉了 | 先删旧文件再写新内容，写完回查 |

## 验证记录

| 项 | 结果 |
|---|---|
| `npm run verify`（源码 `webui/`） | **100/100 通过**（与第 10 步基线一致，零回退） |
| `npm test` | **16 文件 / 295 用例全部通过**（与基线完全一致，收集守卫确认完整） |
| `npx tsc --noEmit` | **6 个错误**（迁移前基线 7 个，净减 1） |
| `npm run build` | `dist/` **26 文件 / 7.00 MB / 18 个 JS / 4 个 HTML**；单一命名空间守门通过 |
| 残留引用扫描 | 代码层 `src/` 引用**清零**（剩余提及全是说明性注释） |

## 回退

`git revert` 本次提交即可恢复 `src/` 与 legacy 脚本。若只想要回退某一层：从 `git log --follow shared/utils/facetFilter.ts` 取回历史，或 `git checkout <第 10 步的 commit> -- src/`。
