import {
  PROMPTS_CONFIG,
  PARAMETERS_CONFIG,
  STYLES_CONFIG,
  EXPLORE_CONFIG,
  EXPLORE_DECOMPOSED_CONFIG,
  STYLES_TOP_CONFIG,
} from 'virtual:app-config'
import type {
  PromptsConfig,
  ParametersConfig,
  StylesConfig,
  ExploreConfig,
  ExploreDecomposedConfig,
  StylesTopConfig,
} from '@/types'

/**
 * 配置加载。
 *
 * YAML 在构建期就被解析并内联进产物（见 scripts/yamlConfigPlugin.ts），
 * 运行时不发起任何请求——这样 dist/index.html 可以直接双击打开。
 */

/**
 * 加载提示词配置
 */
export async function loadPromptsConfig(): Promise<PromptsConfig> {
  return PROMPTS_CONFIG as PromptsConfig
}

/**
 * 加载参数配置
 */
export async function loadParametersConfig(): Promise<ParametersConfig> {
  return PARAMETERS_CONFIG as ParametersConfig
}

/**
 * 加载风格库配置。
 * 风格库是生成物（config/styles.yaml），没生成时返回 null——应用照常可用。
 */
export async function loadStylesConfig(): Promise<StylesConfig | null> {
  return (STYLES_CONFIG as StylesConfig | null) ?? null
}

/**
 * 加载探索榜配置。
 * 同样是生成物（config/explore.yaml），没采集过时返回 null——应用照常可用，
 * 只是没有探索榜这个页面。
 */
export async function loadExploreConfig(): Promise<ExploreConfig | null> {
  return (EXPLORE_CONFIG as ExploreConfig | null) ?? null
}

/**
 * 加载探索榜提示词结构分解。
 *
 * 生成物（config/explore-decomposed.yaml，见 ADR-0015），由
 * `npm run decompose:explore` 在构建期生成。没有它时返回 null——
 * 灯箱退化为只显示原始提示词，不报错也不空白。
 */
export async function loadExploreDecomposedConfig(): Promise<ExploreDecomposedConfig | null> {
  return (EXPLORE_DECOMPOSED_CONFIG as ExploreDecomposedConfig | null) ?? null
}

/**
 * 加载官方风格榜配置（styles_top）。
 * 生成物（config/styles-top.yaml，由 npm run build:styles-top 生成），
 * 没生成时返回 null——应用照常可用，只是没有「官方风格榜」这个 tab 的内容。
 */
export async function loadStylesTopConfig(): Promise<StylesTopConfig | null> {
  return (STYLES_TOP_CONFIG as StylesTopConfig | null) ?? null
}

/**
 * 配置缓存
 */
const configCache = {
  prompts: null as PromptsConfig | null,
  parameters: null as ParametersConfig | null,
  styles: null as StylesConfig | null,
  explore: null as ExploreConfig | null,
  exploreDecomposed: null as ExploreDecomposedConfig | null,
  stylesTop: null as StylesTopConfig | null,
  stylesLoaded: false,
  exploreLoaded: false,
  exploreDecomposedLoaded: false,
  stylesTopLoaded: false,
}

/**
 * 获取提示词配置（带缓存）
 */
export async function getPromptsConfig(): Promise<PromptsConfig> {
  if (!configCache.prompts) {
    configCache.prompts = await loadPromptsConfig()
  }
  return configCache.prompts
}

/**
 * 获取参数配置（带缓存）
 */
export async function getParametersConfig(): Promise<ParametersConfig> {
  if (!configCache.parameters) {
    configCache.parameters = await loadParametersConfig()
  }
  return configCache.parameters
}

/**
 * 获取风格库配置（带缓存）
 */
export async function getStylesConfig(): Promise<StylesConfig | null> {
  if (!configCache.stylesLoaded) {
    configCache.styles = await loadStylesConfig()
    configCache.stylesLoaded = true
  }
  return configCache.styles
}

/**
 * 获取探索榜配置（带缓存）
 */
export async function getExploreConfig(): Promise<ExploreConfig | null> {
  if (!configCache.exploreLoaded) {
    configCache.explore = await loadExploreConfig()
    configCache.exploreLoaded = true
  }
  return configCache.explore
}

/**
 * 获取探索榜提示词结构分解（带缓存）
 */
export async function getExploreDecomposedConfig(): Promise<ExploreDecomposedConfig | null> {
  if (!configCache.exploreDecomposedLoaded) {
    configCache.exploreDecomposed = await loadExploreDecomposedConfig()
    configCache.exploreDecomposedLoaded = true
  }
  return configCache.exploreDecomposed
}

/**
 * 获取官方风格榜配置（带缓存）
 */
export async function getStylesTopConfig(): Promise<StylesTopConfig | null> {
  if (!configCache.stylesTopLoaded) {
    configCache.stylesTop = await loadStylesTopConfig()
    configCache.stylesTopLoaded = true
  }
  return configCache.stylesTop
}

/**
 * 清除配置缓存（用于开发时重新加载）
 */
export function clearConfigCache(): void {
  configCache.prompts = null
  configCache.parameters = null
  configCache.styles = null
  configCache.explore = null
  configCache.exploreDecomposed = null
  configCache.stylesTop = null
  configCache.stylesLoaded = false
  configCache.exploreLoaded = false
  configCache.exploreDecomposedLoaded = false
  configCache.stylesTopLoaded = false
}
