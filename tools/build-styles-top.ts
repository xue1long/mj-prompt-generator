import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'

/**
 * 生成 config/styles-top.yaml —— Midjourney 官方风格榜（styles_top）快照。
 *
 * 单一来源：隔壁 ai-video-imge-prompts 仓的 exports/styles_top/
 * （tools/styles_top.py 采集的风格码清单 _srefs.txt + 缩略图 thumbs/）。
 *
 * 与 Midlibrary 的生成物 config/styles.yaml 平行，但数据形态不同：
 * styles_top 没有艺术家 / 提示词 / 分面，只有「风格码 + 8 张题材示例图」，
 * 所以单独成文件、单独成模块，不污染 style.ts 的分面模型。
 */

/** 8 种题材（id 与源站缩略图文件名一致；中文名手写，机器翻译不靠谱） */
export const STYLES_TOP_KINDS: { id: string; label: string }[] = [
  { id: 'portrait', label: '人像' },
  { id: 'landscape', label: '风景' },
  { id: 'still_life', label: '静物' },
  { id: 'hot_cup_of_coffee', label: '咖啡' },
  { id: 'tree', label: '树' },
  { id: 'house', label: '房屋' },
  { id: 'animal', label: '动物' },
  { id: 'street_scene', label: '街景' },
]

/** 预览图目录（相对于 public/preview-images/） */
export const STYLES_TOP_PREVIEW_DIR = 'midjourney-styles-top'

export interface StylesTopEntry {
  id: string
  code: string
  display: string
  images: Partial<Record<string, string>>
}

export interface StylesTopConfig {
  source: {
    name: string
    url: string
    license: string
    generatedAt: string
    count: number
  }
  kinds: { id: string; label: string }[]
  entries: StylesTopEntry[]
}

/** 本地时区的 YYYY-MM-DD（快照日期用本地日期，不用 UTC） */
export function localISODate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 默认的 _srefs.txt 路径：隔壁仓 */
export function defaultSrefsPath(root: string): string {
  return path.resolve(root, '..', 'ai-video-imge-prompts', 'exports', 'styles_top', '_srefs.txt')
}

/** 默认的缩略图目录：隔壁仓 */
export function defaultThumbsDir(root: string): string {
  return path.resolve(root, '..', 'ai-video-imge-prompts', 'exports', 'styles_top', 'thumbs')
}

/**
 * 把风格码清单 + 缩略图目录转成官方风格榜配置。
 * 只收源站实际存在的档（某个码的某题材图缺失就不写进 images，不编造）。
 */
export function buildStylesTop(
  srefsPath: string,
  thumbsDir: string,
  generatedAt: string
): StylesTopConfig {
  if (!fs.existsSync(srefsPath)) {
    throw new Error(`[build-styles-top] 找不到 _srefs.txt: ${srefsPath}`)
  }
  const codes = fs
    .readFileSync(srefsPath, 'utf-8')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)

  const entries: StylesTopEntry[] = []
  for (const code of codes) {
    const images: Partial<Record<string, string>> = {}
    for (const kind of STYLES_TOP_KINDS) {
      const src = path.join(thumbsDir, `${code}_${kind.id}.webp`)
      if (fs.existsSync(src)) {
        images[kind.id] = `${STYLES_TOP_PREVIEW_DIR}/${code}_${kind.id}.webp`
      }
    }
    entries.push({ id: code, code, display: `0_${code}`, images })
  }

  return {
    source: {
      name: 'midjourney-styles-top',
      url: 'https://www.midjourney.com/explore?tab=styles_top',
      license: '内部参考（Midjourney styles_top 衍生，非官方）',
      generatedAt,
      count: entries.length,
    },
    kinds: STYLES_TOP_KINDS,
    entries,
  }
}

/** 生成 YAML 文本 */
export function renderStylesTopYaml(config: StylesTopConfig): string {
  const header = [
    '# 生成物 —— 请勿手改。',
    '# 由 tools/build-styles-top.ts 从隔壁仓 ai-video-imge-prompts/exports/styles_top/',
    '# （_srefs.txt + thumbs/）生成（npm run build:styles-top）。',
    '# 单一来源：Midjourney styles_top 榜单（衍生，非官方，仅供内部参考）。',
    '',
  ].join('\n')

  const body = yaml.dump(config, {
    noRefs: true,
    lineWidth: 200,
    sortKeys: false,
  })

  return header + body
}

/** 把官方风格榜快照写到 config/styles-top.yaml，返回输出路径 */
export function renderStylesTopFile(root: string, srefsPath: string, thumbsDir: string): string {
  const config = buildStylesTop(srefsPath, thumbsDir, localISODate())
  const outFile = path.join(root, 'config', 'styles-top.yaml')
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, renderStylesTopYaml(config), 'utf-8')
  return outFile
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const srefsPath = process.env.STYLES_TOP_SREFS ?? defaultSrefsPath(root)
  const thumbsDir = process.env.STYLES_TOP_THUMBS ?? defaultThumbsDir(root)
  const out = renderStylesTopFile(root, srefsPath, thumbsDir)
  const config = buildStylesTop(srefsPath, thumbsDir, localISODate())
  const withImages = config.entries.filter(e => Object.keys(e.images).length > 0).length
  console.log(
    `[build-styles-top] 已生成 ${out}（风格码 ${config.entries.length} 条 / 有图 ${withImages} 条）`
  )
}
