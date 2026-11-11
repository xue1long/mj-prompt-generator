/// <reference types="vite/client" />

/**
 * 环境与虚拟模块的类型声明。
 *
 * 第 11 步（报告 3.5）：本文件原为 `src/vite-env.d.ts`，随 Vue 实现一起删除后
 * 迁到 `shared/` —— 因为其中 `virtual:app-config` 的声明仍被
 * tests/config.test.ts 与 tests/promptBuilder.test.ts 需要。
 *
 * 与原版的区别：
 *   - 删掉 `declare module '*.vue'`（Vue 实现已删除，不再有 .vue 文件）
 *   - `./types` → `../shared/types`（类型层迁出 src/）
 */

/**
 * config/*.yaml 在构建期内联成的虚拟模块
 * （实现见 scripts/yamlConfigPlugin.ts）。
 */
declare module 'virtual:app-config' {
  import type {
    ExploreConfig,
    ExploreDecomposedConfig,
    ParametersConfig,
    PromptsConfig,
    StylesConfig,
    StylesTopConfig,
  } from '../shared/types'
  export const PROMPTS_CONFIG: PromptsConfig
  export const PARAMETERS_CONFIG: ParametersConfig
  /** 风格库快照；没生成时为 null（应用照常可用，只是没有风格库） */
  export const STYLES_CONFIG: StylesConfig | null
  /** 探索榜快照；没采集过时为 null（应用照常可用，只是没有探索榜） */
  export const EXPLORE_CONFIG: ExploreConfig | null
  /** 探索榜提示词结构分解；没生成时为 null（灯箱只显示原始提示词） */
  export const EXPLORE_DECOMPOSED_CONFIG: ExploreDecomposedConfig | null
  /** 官方风格榜快照；没生成时为 null（应用照常可用，只是没有「官方风格榜」tab） */
  export const STYLES_TOP_CONFIG: StylesTopConfig | null
}

/** 扩展 ImportMeta 接口 */
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly SSR: boolean
  readonly MODE: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  readonly hot?: {
    readonly data: any
    accept(): void
    accept(cb: (mod: any) => void): void
    accept(dep: string, cb: (mod: any) => void): void
    accept(deps: readonly string[], cb: (mods: any[]) => void): void
    dispose(cb: (data: any) => void): void
    decline(): void
    invalidate(): void
    on(event: string, cb: (...args: any[]) => void): void
  }
}
