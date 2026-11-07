import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'

/**
 * 生成 config/styles-top.yaml —— Midjourney 官方风格榜（styles_top）快照。
 *
 * 数据形态：每个风格码配 8 张题材示例图（人像 / 风景 / 静物 / 咖啡 / 树 / 屋 / 动物 / 街景），
 * 没有艺术家 / 提示词 / 分面，所以单独成文件、单独成模块，不污染 style.ts 的分面模型。
 *
 * 来源（两套，本地优先）：
 *   1. 本项目自采：tools/collect-styles-top.ts 把图下到
 *      public/preview-images/midjourney-styles-top/，本工具扫那个目录生成快照
 *      （buildStylesTopFromLocal，默认路径）；
 *   2. 隔壁 ai-video-imge-prompts 仓的 exports/styles_top/（一次性导入用，sync-styles-top-images.ts）。
 *
 * 约定：图片不入库（gitignore），靠 collect-styles-top / sync 落地，保证双击 dist 即用。
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

/** 本地 _srefs.txt 读取（去空、去重保序），找不到返回空数组 */
function readSrefsLocal(root: string): string[] {
  const file = path.join(root, 'data', 'styles-top', '_srefs.txt')
  if (!fs.existsSync(file)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const s = raw.trim()
    if (s && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

/**
 * 本地优先构建快照：扫 public/preview-images/midjourney-styles-top/ 实际存在的图，
 * 只收有图的码（无图的不进快照，避免空卡）。码清单按 入参 > config yaml > 本地 _srefs.txt
 * > 隔壁仓 _srefs.txt 的顺序取。
 *
 * 这样 collect-styles-top 自采的图直接生效，不再依赖隔壁仓；隔壁仓只作为一次性种子。
 */
export function buildStylesTopFromLocal(root: string, options?: { codes?: string[] }): string {
  const previewDir = path.join(root, 'public', 'preview-images', STYLES_TOP_PREVIEW_DIR)

  let codes = options?.codes && options.codes.length ? options.codes : undefined
  if (!codes || !codes.length) {
    const yamlPath = path.join(root, 'config', 'styles-top.yaml')
    if (fs.existsSync(yamlPath)) {
      const cfg = yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as StylesTopConfig | null
      const fromYaml = (cfg?.entries ?? [])
        .map(e => (e.code || e.id || '').trim())
        .filter(Boolean)
      if (fromYaml.length) codes = fromYaml
    }
  }
  if (!codes || !codes.length) codes = readSrefsLocal(root)
  if (!codes || !codes.length) {
    const nb = defaultSrefsPath(root)
    if (fs.existsSync(nb)) codes = readSrefsFromNeighbor(nb)
  }
  if (!codes || !codes.length) {
    throw new Error(
      '[build-styles-top] 找不到风格码清单：先运行 collect:styles-top（或 --capture），' +
        '或用 STYLES_TOP_SREFS 指向隔壁仓 _srefs.txt'
    )
  }

  const entries: StylesTopEntry[] = []
  for (const code of codes) {
    const images: Partial<Record<string, string>> = {}
    for (const kind of STYLES_TOP_KINDS) {
      const f = `${code}_${kind.id}.webp`
      const p = path.join(previewDir, f)
      if (fs.existsSync(p) && fs.statSync(p).size > 100) {
        images[kind.id] = `${STYLES_TOP_PREVIEW_DIR}/${f}`
      }
    }
    if (Object.keys(images).length === 0) continue // 无图的码丢弃
    entries.push({ id: code, code, display: `0_${code}`, images })
  }

  const config: StylesTopConfig = {
    source: {
      name: 'midjourney-styles-top',
      url: 'https://www.midjourney.com/explore?tab=styles_top',
      license: '内部参考（Midjourney styles_top 衍生，非官方）',
      generatedAt: localISODate(),
      count: entries.length,
    },
    kinds: STYLES_TOP_KINDS,
    entries,
  }
  const outFile = path.join(root, 'config', 'styles-top.yaml')
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, renderStylesTopYaml(config), 'utf-8')
  return outFile
}

/** 从隔壁仓 _srefs.txt 读码清单（复用 defaultSrefsPath 的约定） */
function readSrefsFromNeighbor(srefsPath: string): string[] {
  if (!fs.existsSync(srefsPath)) return []
  return fs
    .readFileSync(srefsPath, 'utf-8')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const envSrefs = process.env.STYLES_TOP_SREFS
  const envThumbs = process.env.STYLES_TOP_THUMBS
  const previewDir = path.join(root, 'public', 'preview-images', STYLES_TOP_PREVIEW_DIR)
  const hasLocal =
    fs.existsSync(previewDir) &&
    fs.readdirSync(previewDir).some(f => f.toLowerCase().endsWith('.webp'))

  let out: string
  let sourceLabel: string
  if (envSrefs || envThumbs) {
    out = renderStylesTopFile(root, envSrefs ?? defaultSrefsPath(root), envThumbs ?? defaultThumbsDir(root))
    sourceLabel = '隔壁仓（env 指定）'
  } else if (hasLocal) {
    out = buildStylesTopFromLocal(root)
    sourceLabel = '本地预览图目录（本地优先）'
  } else if (fs.existsSync(defaultSrefsPath(root)) && fs.existsSync(defaultThumbsDir(root))) {
    out = renderStylesTopFile(root, defaultSrefsPath(root), defaultThumbsDir(root))
    sourceLabel = '隔壁仓（本地无图，退回）'
  } else {
    out = buildStylesTopFromLocal(root) // 兜不住会抛错提示
    sourceLabel = '本地优先'
  }

  const config = yaml.load(fs.readFileSync(out, 'utf-8')) as StylesTopConfig
  const withImages = config.entries.filter(e => Object.keys(e.images).length > 0).length
  console.log(
    `[build-styles-top] 已生成 ${out}（来源：${sourceLabel} · 风格码 ${config.entries.length} 条 / 有图 ${withImages} 条）`
  )
}
