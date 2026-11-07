import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { Plugin } from 'vite'

/**
 * 配置虚拟模块：把 config/*.yaml 在构建期内联进产物。
 *
 * 为什么不用运行时 fetch：
 *  - file:// 直接打开 dist/index.html 时，fetch 本地 YAML 会被浏览器的 CORS 规则拦掉；
 *  - 内联后 YAML 的解析错误在构建期就暴露，而不是用户打开页面看到空白。
 */
export const VIRTUAL_CONFIG_ID = 'virtual:app-config'
const RESOLVED_ID = `\0${VIRTUAL_CONFIG_ID}`

export interface LoadedConfigs {
  prompts: unknown
  parameters: unknown
  styles: unknown
  explore: unknown
  /** 探索榜提示词结构分解（生成物，见 ADR-0015）；没有则 null */
  exploreDecomposed: unknown
  /** 官方风格榜快照（生成物，npm run build:styles-top）；没有则 null */
  stylesTop: unknown
}

/**
 * 读取并解析 config 目录下的 YAML 配置。
 * @param root 项目根目录
 */
export function loadYamlConfigs(root: string): LoadedConfigs {
  const configDir = path.resolve(root, 'config')

  const read = (file: string): unknown => {
    const fullPath = path.join(configDir, file)
    if (!fs.existsSync(fullPath)) {
      throw new Error(`[mj-yaml-config] 缺少配置文件: ${fullPath}`)
    }
    const text = fs.readFileSync(fullPath, 'utf-8')
    try {
      return yaml.load(text)
    } catch (error) {
      throw new Error(
        `[mj-yaml-config] YAML 解析失败 ${fullPath}: ${(error as Error).message}`
      )
    }
  }

  /**
   * 可选配置：风格库快照、探索榜快照、分解结果都是生成物，
   * 没有它们应用照样能跑（只是对应的功能不可用）。
   */
  const readOptional = (file: string): unknown => {
    const fullPath = path.join(configDir, file)
    if (!fs.existsSync(fullPath)) return null
    return read(file)
  }

  return {
    prompts: read('prompts.yaml'),
    parameters: read('parameters.yaml'),
    styles: readOptional('styles.yaml'),
    explore: readOptional('explore.yaml'),
    exploreDecomposed: readOptional('explore-decomposed.yaml'),
    stylesTop: readOptional('styles-top.yaml'),
  }
}

/**
 * 生成虚拟模块内容。
 */
export function renderConfigModule(root: string): string {
  const { prompts, parameters, styles, explore, exploreDecomposed, stylesTop } = loadYamlConfigs(root)
  return [
    `export const PROMPTS_CONFIG = ${JSON.stringify(prompts)};`,
    `export const PARAMETERS_CONFIG = ${JSON.stringify(parameters)};`,
    `export const STYLES_CONFIG = ${JSON.stringify(styles)};`,
    `export const EXPLORE_CONFIG = ${JSON.stringify(explore)};`,
    `export const EXPLORE_DECOMPOSED_CONFIG = ${JSON.stringify(exploreDecomposed)};`,
    `export const STYLES_TOP_CONFIG = ${JSON.stringify(stylesTop)};`,
  ].join('\n')
}

/**
 * Vite 插件：config/*.yaml -> virtual:app-config
 * 开发模式下监听 YAML 变化并触发整页刷新，改词库/参数即时可见。
 */
export function yamlConfigPlugin(): Plugin {
  let root = process.cwd()

  return {
    name: 'mj-yaml-config',

    configResolved(resolved) {
      root = resolved.root
    },

    resolveId(id) {
      if (id === VIRTUAL_CONFIG_ID) return RESOLVED_ID
      return null
    },

    load(id) {
      if (id === RESOLVED_ID) return renderConfigModule(root)
      return null
    },

    configureServer(server) {
      const configDir = path.resolve(root, 'config')
      server.watcher.add(configDir)

      const reload = (file: string) => {
        if (!path.resolve(file).startsWith(configDir)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }

      server.watcher.on('change', reload)
      server.watcher.on('add', reload)
      server.watcher.on('unlink', reload)
    },
  }
}
