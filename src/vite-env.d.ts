/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// config/*.yaml 在构建期内联成的虚拟模块
declare module 'virtual:app-config' {
  import type {
    ExploreConfig,
    ExploreDecomposedConfig,
    ParametersConfig,
    PromptsConfig,
    StylesConfig,
    StylesTopConfig,
  } from './types'
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

// 扩展 ImportMeta 接口
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly SSR: boolean
  readonly MODE: string
  readonly BASE_URL: string
  // 可以在这里添加更多环境变量的类型定义
  // readonly VITE_SOME_KEY: string
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
