/**
 * 共享工具函数导出文件。
 *
 * 这里是**纯逻辑层**：不碰 DOM、不依赖 Vue、不读运行时状态，
 * 因此可以被 vitest 直接 import 做单元测试，也可以被构建期脚本
 * （tools/）复用。
 *
 * 与 `webui/js/` 的关系：`webui/` 是**运行时实现**（浏览器端、IIFE 全局模块），
 * 本目录是**可测试的算法源**。两边同名模块（facetFilter ↔ filter-engine.js、
 * promptBuilder ↔ core.js）必须保持行为一致 —— 改动其中一侧时，
 * 另一侧的对应逻辑要同步复核。
 *
 * 迁移说明（第 11 步，报告 3.5）：本目录原在 `src/utils/`，
 * 与 Vue 实现同处一棵树。但其中的纯逻辑模块被 tests/ 的 8 个测试文件
 * 直接依赖，整体删除 Vue 实现会连带删掉被测对象。
 * 故拆层迁出到 `shared/`，与 Vue 实现彻底解耦。
 */

/** 探索榜 URL 契约（hash ↔ 筛选状态） */
export * from './exploreHash'
/** 分面筛选引擎（组内任一 / 组间全部） */
export * from './facetFilter'
/** 词库筛选的 URL hash 契约 */
export * from './filterHash'
/** 参数与模型版本的兼容（8.2 / 7 等） */
export * from './parameterCompat'
/** 最终提示词拼装 */
export * from './promptBuilder'
/** 提示词标签回填 */
export * from './promptLabel'
/** 风格条目与艺术家条目的合并 */
export * from './styleMerge'
