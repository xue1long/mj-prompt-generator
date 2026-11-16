import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'

/**
 * 生成 config/styles.yaml —— Midlibrary 风格库快照。
 *
 * 为什么要有这一步：
 * - 风格名与风格参考码的单一来源是 midlibrary 站的 manifest.json
 *   （住在隔壁 ai-video-imge-prompts 仓），不是本仓的手写词库；
 * - 这批数据有八千多条，手写不现实、手改更危险，所以生成一份静态快照，
 *   构建期内联进产物（跟 config/prompts.yaml 同一套机制）。
 *
 * 分面词（term）与主色（colour）来自同站的详情层 data/details.json，只存在于
 * 详情页里（列表页没有）。采集完成后覆盖率是 100%，缺失时按「没有分面」处理。
 *
 * 生成物与手写物必须分文件：
 * - config/prompts.yaml 是人写的摄影词库；
 * - config/styles.yaml 是生成的风格库（风格名 + 风格参考码 + 分面词 + 主色）。
 * 两者不混在一起，也不互相覆盖。
 */

/** Midlibrary 站 manifest 里的一条记录（只取本项目用得到的字段） */
export interface MidlibraryRow {
  id: string
  slug: string
  name: string
  kind: string
  category: string
  prompt: string
  sref: string
  sourceUrl: string
  thumb_path?: string
  /** 是否已被 Midlibrary 实测 */
  testedMark?: boolean
  /** 是否编辑精选 */
  isPick?: boolean
  /** 是否属公有领域（可商用） */
  isPublicDomain?: boolean
  /** 上游真实 ULID（items.json 里才有；前 10 位可解出创建时间） */
  ulid?: string
}

/**
 * 详情层记录（data/details.json）：
 * - `a` 简介、`o` 观察（都只作展示，本文件不收）
 * - `t` 分面词：[[组名, [[显示名, 全站计数, slug], …]], …]
 * - `c` 主色：[[hex, 色名, 占比, slug], …]
 */
export interface MidlibraryDetail {
  a?: string
  o?: string
  t?: Array<[string, Array<[string, string, string]>]>
  c?: Array<[string, string, string, string]>
}

/** 风格条目：一位艺术家 / 摄影师 / 设计师 */
export interface StyleArtist {
  /** 唯一标识（midlibrary 的条目 id） */
  id: string
  /** 原文名（midlibrary 只提供原文名，没有中文名） */
  name: string
  /** 所属画师类目 */
  category: string
  /** 进入提示词的英文写法（已剥掉 "by " 前缀与版本参数） */
  promptEn: string
  /** 上游原始提示词行（只作展示，不参与组装） */
  sourcePrompt: string
  /** 预览图路径（相对于 public/preview-images/） */
  preview?: string
  /** 原站页面（署名与回链用） */
  sourceUrl: string
  /** 是否已被上游实测（筛选维度「只看实测」） */
  testedMark: boolean
  /** 是否编辑精选（筛选维度「编辑精选」） */
  isPick: boolean
  /** 分面词 slug（组内任一、组间全部） */
  terms: string[]
  /** 主色 slug，按占比降序（筛选维度「主色」） */
  colours: string[]
  /** 简介：他是谁、擅长什么（上游详情层 a 字段，4311/4322 覆盖） */
  intro?: string
  /** 风格描述：这张风格图画面的样子（上游详情层 o 字段，4322/4322 覆盖） */
  observation?: string
}

/** 风格参考码条目 */
export interface StyleCode {
  /** 唯一标识（midlibrary 的条目 id） */
  id: string
  /** 风格名 */
  name: string
  /** 码本身（填进 --sref 的值） */
  code: string
  /** 所属类目 */
  category: string
  /** 进入最终提示词的写法 */
  promptEn: string
  /** 上游原始提示词行（只作展示，不参与组装） */
  sourcePrompt: string
  /** 预览图路径（相对于 public/preview-images/） */
  preview?: string
  /** 原站页面（署名与回链用） */
  sourceUrl: string
  /** 是否已被上游实测（筛选维度「只看实测」） */
  testedMark: boolean
  /** 是否编辑精选（筛选维度「编辑精选」） */
  isPick: boolean
  /** 分面词 slug（组内任一、组间全部） */
  terms: string[]
  /** 主色 slug，按占比降序（筛选维度「主色」） */
  colours: string[]
}

/** 画师类目（中文名 + 条数） */
export interface StyleCategory {
  id: string
  name: string
  count: number
}

/** 一个分面词 */
export interface StyleTerm {
  slug: string
  label: string
}

/** 一组分面词（组内任一，组间全部） */
export interface StyleTermGroup {
  id: string
  name: string
  terms: StyleTerm[]
}

/** 一个主色（hex 取该色出现最多的那个值，仅用于色块） */
export interface StyleColour {
  slug: string
  name: string
  hex: string
}

export interface StylesConfig {
  source: {
    name: string
    url: string
    license: string
    generatedAt: string
    /** 有分面数据的条目占比（采集完成时应为 100） */
    facetCoverage: number
  }
  categories: StyleCategory[]
  termGroups: StyleTermGroup[]
  colours: StyleColour[]
  artists: StyleArtist[]
  codes: StyleCode[]
}

/* ══════════════════════════════════════════════════════════════════════
   风格与类型库（2026-11 新增）

   上游 midlibrary.io/library 的 16 个分类里有 5 个是「条目类型类」：
   流派与艺术运动 / 通用修饰 / 技法 / 标题 / 风格参考码。
   前 4 类（不含风格参考码，后者已在风格库页）是一批**通用提示词片段**——
   它们不指认具体作者，而是描述画面本身的属性（"Cyberpunk"、"Sashiko"、
   "Studio Ghibli"）。本项目把它们收进一张独立页「风格与类型库」。

   与风格库的分工（详见 CONTEXT.md）：
   - 风格库：谁画的（艺术家 4,322 + 风格参考码 4,638）——**单选**进提示词。
   - 类型库：画成什么样（类型 / 修饰 / 技法 / 标题 1,180）——**多选**进提示词。

   数据仍然来自同一个 manifest + details，只是另出一份快照
   （config/types.yaml），理由与 styles.yaml 同源：
   手写 1,180 条不现实、手改更危险，所以生成一份静态快照。
   ══════════════════════════════════════════════════════════════════════ */

/** 目标 5 个 kind（其中 style_code 已由风格库覆盖，此处不重复收） */
export const TYPE_KINDS = ['genre', 'movement', 'style_quality', 'technique', 'title'] as const

/** kind → 上游分类 id → 中文名 */
export const TYPE_CATEGORY_NAMES: Record<string, string> = {
  'genres-art-movements': '流派与艺术运动',
  'general-modifiers': '通用修饰',
  techniques: '技法',
  titles: '标题',
}

/** kind → 卡片上显示的类别标签（比分类名更细，区分同分类下的两种 kind） */
export const TYPE_KIND_LABELS: Record<string, string> = {
  genre: '流派',
  movement: '艺术运动',
  style_quality: '风格修饰',
  technique: '技法',
  title: '标题',
}

/** 一个类型条目 */
export interface TypeEntry {
  id: string
  /** 原文名 */
  name: string
  /** 上游分类 id（genres-art-movements / general-modifiers / techniques / titles） */
  category: string
  /** 上游条目类型（genre / movement / style_quality / technique / title） */
  kind: string
  /** 进入提示词的英文写法（已剥掉 "--v 8.2" 之类版本参数） */
  promptEn: string
  /** 上游原始提示词行（只作展示，不参与组装） */
  sourcePrompt: string
  /** 预览图路径（相对于 public/preview-images/） */
  preview?: string
  /** 原站页面（署名与回链用） */
  sourceUrl: string
  /** 是否已被上游实测 */
  testedMark: boolean
  /** 是否属公有领域（可商用） */
  isPublicDomain: boolean
  /** 分面词 slug（组内任一、组间全部） */
  terms: string[]
  /** 主色 slug，按占比降序 */
  colours: string[]
  /** 简介（上游详情层 a 字段） */
  intro?: string
  /** 风格描述（上游详情层 o 字段） */
  observation?: string
  /** 条目创建时间（毫秒，来自 ULID；0 = 解不出） */
  createdAt: number
}

/** 类型库的分类（比 artists 的分类少，且每类对应一个上游分类） */
export interface TypeCategory {
  id: string
  name: string
  count: number
}

export interface TypesConfig {
  source: {
    name: string
    url: string
    license: string
    generatedAt: string
    facetCoverage: number
    /** 快照对应的条数（用于对账，不写死） */
    total: number
  }
  categories: TypeCategory[]
  termGroups: StyleTermGroup[]
  colours: StyleColour[]
  entries: TypeEntry[]
}

/**
 * midlibrary 的画师类目中文名。
 * 只有十一个类目，机器翻译在这类专名上不可靠，所以手写这张表。
 */
export const ARTIST_CATEGORY_NAMES: Record<string, string> = {
  painters: '画家',
  illustrators: '插画师',
  photographers: '摄影师',
  'various-artists': '综合艺术家',
  'sculpture-installation': '雕塑与装置',
  designers: '设计师',
  'fashion-designers': '时装设计师',
  filmmakers: '电影人',
  architects: '建筑师',
  'street-artists': '街头艺术家',
  printmakers: '版画家',
}

/** 分面词组的 id（上游只给组名，这里定死 id，避免中文名参与推导） */
export const TERM_GROUP_IDS: Record<string, string> = {
  'Style quality': 'style-quality',
  Subject: 'subject',
  'Visual effects': 'visual-effects',
  Technique: 'technique',
  'Colour scheme': 'colour-scheme',
  Mood: 'mood',
  Genre: 'genre',
  Medium: 'medium',
  Composition: 'composition',
  Theme: 'theme',
}

/** 分面词组的中文名 */
export const TERM_GROUP_NAMES: Record<string, string> = {
  'Style quality': '风格质量',
  Subject: '主题',
  'Visual effects': '视觉效果',
  Technique: '技法',
  'Colour scheme': '配色',
  Mood: '情绪',
  Genre: '类型',
  Medium: '媒介',
  Composition: '构图',
  Theme: '题材',
}

/**
 * 分面词的中文名（68 个，手写）。
 * 上游词表是英文；这是给人看的筛选面板，中文名是必要的，机器翻译在这类
 * 审美词上不可靠。
 */
export const TERM_LABELS: Record<string, string> = {
  // Style quality
  abstract: '抽象',
  baroque: '巴洛克',
  bold: '粗犷',
  detailed: '精细',
  expressive: '表现力',
  illustrative: '插画感',
  minimalist: '极简',
  ornate: '繁复',
  realistic: '写实',
  sculptural: '雕塑感',
  // Subject
  animals: '动物',
  characters: '人物',
  'ethnic-poc': '民族',
  fashion: '时尚',
  floral: '花卉',
  landscapes: '风景',
  letters: '文字',
  patterns: '图案',
  portraits: '肖像',
  scenes: '场景',
  'still-life': '静物',
  urban: '城市',
  // Technique
  'bold-lines': '粗线',
  'broad-brushstrokes': '阔笔触',
  crosshatching: '交叉排线',
  'fine-brushstrokes': '细笔触',
  'fine-lines': '细线',
  'flat-color': '平涂',
  grain: '颗粒',
  painterly: '绘画感',
  'shallow-depth-of-field': '浅景深',
  // Colour scheme
  'bw-monochrome': '黑白',
  'high-contrast': '高对比',
  'light-colors': '浅色',
  metallic: '金属色',
  'moody-colors': '暗调',
  'pastel-colors': '粉彩',
  'psychedelic-colors': '迷幻',
  'subdued-colors': '柔和',
  'vivid-colors': '鲜亮',
  // Mood
  cute: '可爱',
  dark: '暗黑',
  dreamy: '梦幻',
  epic: '史诗',
  funny: '幽默',
  madness: '癫狂',
  // Genre
  cinematic: '电影感',
  comics: '漫画',
  documentary: '纪实',
  'sci-fi': '科幻',
  surreal: '超现实',
  // Medium
  collage: '拼贴',
  drawing: '绘画',
  halftone: '半调',
  ink: '墨',
  // Composition
  geometric: '几何',
  'negative-space': '留白',
  silhouette: '剪影',
  symmetry: '对称',
  // Visual effects
  backlighting: '逆光',
  glow: '发光',
  mist: '雾气',
  motion: '动感',
  // Theme
  classical: '古典',
  erotic: '情色',
  fantasy: '奇幻',
  religious: '宗教',
  retro: '复古',
}

/** 主色的深浅修饰词 */
const COLOUR_PREFIX: Record<string, string> = {
  dark: '深',
  light: '浅',
  pale: '淡',
  muted: '柔',
  vivid: '艳',
  deep: '浓',
}

/** 主色的基础色名 */
const COLOUR_BASE: Record<string, string> = {
  black: '黑',
  white: '白',
  grey: '灰',
  charcoal: '炭灰',
  silver: '银',
  'bone-white': '骨白',
  cream: '奶油',
  beige: '米色',
  brown: '棕',
  ochre: '赭石',
  rust: '锈红',
  olive: '橄榄',
  lime: '青柠',
  teal: '青绿',
  cyan: '青',
  blue: '蓝',
  indigo: '靛',
  violet: '紫罗兰',
  magenta: '洋红',
  pink: '粉',
  red: '红',
  orange: '橙',
  yellow: '黄',
  green: '绿',
}

/**
 * 主色中文名：由 slug 组合出来（96 个色都是「修饰词 + 基础色」的形状）。
 * 组合不出来时回落到上游英文名，不编造。
 */
export function colourLabel(slug: string, fallback = ''): string {
  const parts = slug.split('-')
  const prefix = COLOUR_PREFIX[parts[0]]
  if (prefix) {
    const base = COLOUR_BASE[parts.slice(1).join('-')]
    if (base) return prefix + base
  }
  return COLOUR_BASE[slug] ?? (fallback || slug)
}

/** 预览图目录（相对于 public/preview-images/） */
export const STYLE_PREVIEW_DIR = 'midlibrary'

/** 本地时区的 YYYY-MM-DD（快照日期用本地日期，不用 UTC） */
export function localISODate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 去掉提示词尾部的参数（"--v 8.2" 之类）。
 * midlibrary 的每行提示词都自带版本参数，而本项目的版本由参数区统一输出。
 */
export function stripParams(text: string): string {
  const cut = text.indexOf('--')
  return (cut === -1 ? text : text.slice(0, cut)).trim()
}

/**
 * 艺术家条目进入提示词的写法。
 * 上游写法是 "by Puuung --v 8.2"；本项目的摄影前缀自带 "by"，
 * 所以这里要剥掉前缀，只留名字，否则会拼成 "photography by by Puuung"。
 */
export function artistFragment(prompt: string, name: string): string {
  const stripped = stripParams(prompt).replace(/^by\s+/i, '').trim()
  return stripped || name
}

/** 风格参考码进入最终提示词的写法 */
export function codeFragment(code: string): string {
  return `--sref ${code}`
}

/** 预览图相对路径 */
export function previewPath(id: string): string {
  return `${STYLE_PREVIEW_DIR}/${id}.webp`
}

/* ── ULID 时间戳 ────────────────────────────────────────────────────────
   上游 items.json 里每条有一个真实 ULID（如 01HAQT5PE0JH9ZJQVH2CT9VX4X），
   前 10 位是 Crockford Base32 编码的 48 位毫秒时间戳 —— 条目**创建时间**。

   为什么需要它：上游有「Newly tested」排序（按实测时间排），但源快照
   （manifest.json / details.json）与上游 RSC payload 里都没有任何时间戳字段，
   实测排序是服务端行为，本地快照复刻不了。
   唯一可溯源的时间事实就是 ULID 里的创建时间 —— 所以本项目的排序项
   叫「最新收录」，并明确标注这是收录时间、不是实测时间。

   口径边界（不要越界）：
   - 这是**创建**时间，不是实测时间。上游 "Newly tested" 排的是后者。
   - 解不出来就置 0（排最后），不猜、不用采集日期顶替。 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 解 ULID 前 10 位 → 毫秒时间戳；解不出返回 0 */
export function ulidTimestamp(id: string): number {
  const head = String(id || '').slice(0, 10).toUpperCase()
  if (head.length < 10) return 0
  let ts = 0
  for (const ch of head) {
    const v = CROCKFORD.indexOf(ch)
    if (v < 0) return 0
    ts = ts * 32 + v
  }
  // 合理性下限：2020-01-01。上游 id 若是别的编码体系，解出来的数会离谱。
  return ts > 1577836800000 ? ts : 0
}

/** 从详情层记录里取分面词 slug（组内去看，本文件只要 slug） */
export function termSlugsOf(detail: MidlibraryDetail | undefined): string[] {
  if (!detail?.t) return []
  const slugs: string[] = []
  for (const [, options] of detail.t) {
    for (const [, , slug] of options) {
      if (slug && !slugs.includes(slug)) slugs.push(slug)
    }
  }
  return slugs
}

/** 从详情层记录里取主色 slug，保持上游的占比降序 */
export function colourSlugsOf(detail: MidlibraryDetail | undefined): string[] {
  if (!detail?.c) return []
  const slugs: string[] = []
  for (const [, , , slug] of detail.c) {
    if (slug && !slugs.includes(slug)) slugs.push(slug)
  }
  return slugs
}

/**
 * 把 manifest 记录 + 详情层转成风格库配置。
 * 只取两类：kind=artist（进词库）与 kind=style_code（进码面板）；
 * 其余类型（技法 / 标题 / 流派 / 修饰）不进本项目。
 */
export function buildStyles(
  rows: MidlibraryRow[],
  details: Record<string, MidlibraryDetail>,
  generatedAt: string
): StylesConfig {
  const artists: StyleArtist[] = []
  const codes: StyleCode[] = []
  const termSeen = new Map<string, Map<string, string>>()
  const colourHex = new Map<string, Map<string, number>>()
  const colourName = new Map<string, string>()
  let withFacets = 0

  for (const row of rows) {
    const detail = details[row.id]
    const terms = termSlugsOf(detail)
    const colours = colourSlugsOf(detail)
    if (terms.length > 0) withFacets += 1

    // 词表：组名 → (slug → 显示名)
    for (const [groupLabel, options] of detail?.t ?? []) {
      const group = termSeen.get(groupLabel) ?? new Map<string, string>()
      for (const [label, , slug] of options) {
        if (slug && !group.has(slug)) group.set(slug, label)
      }
      termSeen.set(groupLabel, group)
    }
    // 主色：slug → (hex → 出现次数)，以及 slug → 上游色名
    for (const [hex, name, , slug] of detail?.c ?? []) {
      if (!slug) continue
      const counter = colourHex.get(slug) ?? new Map<string, number>()
      counter.set(hex, (counter.get(hex) ?? 0) + 1)
      colourHex.set(slug, counter)
      if (!colourName.has(slug)) colourName.set(slug, name)
    }

    if (row.kind === 'artist') {
      artists.push({
        id: row.id,
        name: row.name,
        category: row.category,
        promptEn: artistFragment(row.prompt, row.name),
        sourcePrompt: row.prompt,
        preview: previewPath(row.id),
        sourceUrl: row.sourceUrl,
        testedMark: Boolean(row.testedMark),
        isPick: Boolean(row.isPick),
        terms,
        colours,
        // 详情层的两段文字：a 说他是谁、o 说这张画面长什么样。
        // 以前只收分面词与主色，把它们丢了——上游不给中文名，
        // 这段简介是界面认出"他是谁"的唯一线索（见 ADR-0011）。
        intro: detail?.a?.trim() || undefined,
        observation: detail?.o?.trim() || undefined,
      })
    } else if (row.kind === 'style_code') {
      const code = row.sref || stripParams(row.prompt).replace(/^--sref\s+/i, '').trim()
      if (!code) continue
      codes.push({
        id: row.id,
        name: row.name,
        code,
        category: row.category,
        promptEn: codeFragment(code),
        sourcePrompt: row.prompt,
        preview: previewPath(row.id),
        sourceUrl: row.sourceUrl,
        testedMark: Boolean(row.testedMark),
        isPick: Boolean(row.isPick),
        terms,
        colours,
      })
    }
  }

  const counts = new Map<string, number>()
  for (const artist of artists) {
    counts.set(artist.category, (counts.get(artist.category) ?? 0) + 1)
  }
  const categories: StyleCategory[] = [...counts.entries()]
    .map(([id, count]) => ({
      id,
      name: ARTIST_CATEGORY_NAMES[id] ?? id,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))

  // 词组顺序按上游面板的习惯固定下来，不跟着 Map 插入顺序漂
  const groupOrder = Object.keys(TERM_GROUP_IDS)
  const termGroups: StyleTermGroup[] = groupOrder
    .filter(label => (termSeen.get(label)?.size ?? 0) > 0)
    .map(label => ({
      id: TERM_GROUP_IDS[label],
      name: TERM_GROUP_NAMES[label] ?? label,
      terms: [...(termSeen.get(label) ?? new Map()).entries()]
        .map(([slug, label]) => ({ slug, label: TERM_LABELS[slug] ?? label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh')),
    }))

  const colours: StyleColour[] = [...colourHex.entries()]
    .map(([slug, counter]) => {
      const hex = [...counter.entries()].sort((a, b) => b[1] - a[1])[0][0]
      return { slug, name: colourLabel(slug, colourName.get(slug) ?? ''), hex }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))

  return {
    source: {
      name: 'midlibrary',
      url: 'https://midlibrary.io/library',
      license: '有条件：站方书面许可（个人学习用途，署名 + 回链）',
      generatedAt,
      facetCoverage:
        rows.length === 0 ? 0 : Math.round((withFacets / rows.length) * 1000) / 10,
    },
    categories,
    termGroups,
    colours,
    artists,
    codes,
  }
}

/** 生成 YAML 文本 */
export function renderStylesYaml(config: StylesConfig): string {
  const header = [
    '# 生成物 —— 请勿手改。',
    '# 由 tools/build-styles.ts 从 ai-video-imge-prompts 仓的',
    '# sites/midlibrary/manifest.json + data/details.json 生成（npm run build:styles）。',
    '# 单一来源：midlibrary.io/library —— 站方书面许可：个人学习用途，署名 + 回链。',
    '',
  ].join('\n')

  const body = yaml.dump(config, {
    noRefs: true,
    lineWidth: 200,
    sortKeys: false,
  })

  return header + body
}

/* ── 风格与类型库 ────────────────────────────────────────────────────────
   与 buildStyles 同源同法：读同一份 manifest + details，另出一份快照。
   两者分开的原因不是数据隔离（同一批源文件），而是**语义隔离**：
   风格库是「谁画的」，类型库是「画成什么样」，两者的组装语义不同
   （前者单选互斥，后者多选累加），放进同一份快照会让下拉里的
   「选谁」与「选什么」互相干扰。 */

/**
 * 把 manifest 记录 + 详情层转成类型库配置。
 * 只取 4 类通用片段：genre / movement / style_quality / technique / title。
 * style_code 不在此（风格参考码在风格库页）。
 *
 * ulidsBySlug 来自隔壁仓的 data/items.json —— manifest 里没有 ULID，
 * 只有 items.json 才带真实 id（排序要用的创建时间从它的前 10 位解）。
 */
export function buildTypes(
  rows: MidlibraryRow[],
  details: Record<string, MidlibraryDetail>,
  generatedAt: string,
  ulidsBySlug: Record<string, string> = {}
): TypesConfig {
  const entries: TypeEntry[] = []
  const termSeen = new Map<string, Map<string, string>>()
  const colourHex = new Map<string, Map<string, number>>()
  const colourName = new Map<string, string>()
  const wanted = new Set<string>(TYPE_KINDS)
  let withFacets = 0

  for (const row of rows) {
    if (!wanted.has(row.kind)) continue
    const detail = details[row.id]
    const terms = termSlugsOf(detail)
    const colours = colourSlugsOf(detail)
    if (terms.length > 0) withFacets += 1

    // 词表：组名 → (slug → 显示名)
    for (const [groupLabel, options] of detail?.t ?? []) {
      const group = termSeen.get(groupLabel) ?? new Map<string, string>()
      for (const [label, , slug] of options) {
        if (slug && !group.has(slug)) group.set(slug, label)
      }
      termSeen.set(groupLabel, group)
    }
    // 主色：slug → (hex → 出现次数)，以及 slug → 上游色名
    for (const [hex, name, , slug] of detail?.c ?? []) {
      if (!slug) continue
      const counter = colourHex.get(slug) ?? new Map<string, number>()
      counter.set(hex, (counter.get(hex) ?? 0) + 1)
      colourHex.set(slug, counter)
      if (!colourName.has(slug)) colourName.set(slug, name)
    }

    entries.push({
      id: row.id,
      name: row.name,
      category: row.category,
      kind: row.kind,
      promptEn: stripParams(row.prompt),
      sourcePrompt: row.prompt,
      preview: previewPath(row.id),
      sourceUrl: row.sourceUrl,
      testedMark: Boolean(row.testedMark),
      isPublicDomain: Boolean(row.isPublicDomain),
      terms,
      colours,
      intro: detail?.a?.trim() || undefined,
      observation: detail?.o?.trim() || undefined,
      createdAt: ulidTimestamp(ulidsBySlug[row.slug] || ''),
    })
  }

  const counts = new Map<string, number>()
  for (const e of entries) {
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  }
  const categories: TypeCategory[] = [...counts.entries()]
    .map(([id, count]) => ({
      id,
      name: TYPE_CATEGORY_NAMES[id] ?? id,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))

  const groupOrder = Object.keys(TERM_GROUP_IDS)
  const termGroups: StyleTermGroup[] = groupOrder
    .filter(label => (termSeen.get(label)?.size ?? 0) > 0)
    .map(label => ({
      id: TERM_GROUP_IDS[label],
      name: TERM_GROUP_NAMES[label] ?? label,
      terms: [...(termSeen.get(label) ?? new Map()).entries()]
        .map(([slug, label]) => ({ slug, label: TERM_LABELS[slug] ?? label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh')),
    }))

  const colours: StyleColour[] = [...colourHex.entries()]
    .map(([slug, counter]) => {
      const hex = [...counter.entries()].sort((a, b) => b[1] - a[1])[0][0]
      return { slug, name: colourLabel(slug, colourName.get(slug) ?? ''), hex }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))

  return {
    source: {
      name: 'midlibrary',
      url: 'https://midlibrary.io/library',
      license: '有条件：站方书面许可（个人学习用途，署名 + 回链）',
      generatedAt,
      facetCoverage:
        entries.length === 0 ? 0 : Math.round((withFacets / entries.length) * 1000) / 10,
      total: entries.length,
    },
    categories,
    termGroups,
    colours,
    entries,
  }
}

/** 生成类型库 YAML 文本 */
export function renderTypesYaml(config: TypesConfig): string {
  const header = [
    '# 生成物 —— 请勿手改。',
    '# 由 tools/build-styles.ts 从 ai-video-imge-prompts 仓的',
    '# sites/midlibrary/manifest.json + data/details.json 生成（npm run build:styles）。',
    '# 收录上游 4 个条目类型类：流派与艺术运动 / 通用修饰 / 技法 / 标题。',
    '# 单一来源：midlibrary.io/library —— 站方书面许可：个人学习用途，署名 + 回链。',
    '',
  ].join('\n')

  const body = yaml.dump(config, {
    noRefs: true,
    lineWidth: 200,
    sortKeys: false,
  })

  return header + body
}

/** 读取 manifest */
export function loadManifest(file: string): MidlibraryRow[] {
  if (!fs.existsSync(file)) {
    throw new Error(`[build-styles] 找不到 manifest: ${file}`)
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as MidlibraryRow[]
  if (!Array.isArray(parsed)) {
    throw new Error(`[build-styles] manifest 结构异常: ${file}`)
  }
  return parsed
}

/** 读取详情层（缺失时返回空对象：没有分面，但风格库照常可用） */
export function loadDetails(file: string): Record<string, MidlibraryDetail> {
  if (!fs.existsSync(file)) {
    return {}
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, MidlibraryDetail>
  return parsed && typeof parsed === 'object' ? parsed : {}
}

/**
 * 读取 items.json，产出 slug → ULID 的映射。
 *
 * 为什么单独要这个文件：manifest.json 里没有 ULID，只有 items.json 有真实 id。
 * ULID 前 10 位编码了条目创建时间，是本地唯一可溯源的时间事实
 * （上游的 "Newly tested" 排的是实测时间，那个量在快照里根本不存在）。
 *
 * 缺失时返回空对象 —— 类型库照常生成，只是没有时间排序。
 */
export function loadUlids(file: string): Record<string, string> {
  if (!fs.existsSync(file)) {
    return {}
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
    items?: Array<{ slug?: string; id?: string }>
  }
  const out: Record<string, string> = {}
  for (const it of parsed?.items ?? []) {
    if (it?.slug && it?.id && !out[it.slug]) out[it.slug] = it.id
  }
  return out
}

/** 默认的 manifest 路径：隔壁仓 */
export function defaultManifestPath(root: string): string {
  return path.resolve(root, '..', 'ai-video-imge-prompts', 'sites', 'midlibrary', 'manifest.json')
}

/** 默认的详情层路径：隔壁仓 */
export function defaultDetailsPath(root: string): string {
  return path.resolve(
    root,
    '..',
    'ai-video-imge-prompts',
    'sites',
    'midlibrary',
    'data',
    'details.json'
  )
}

/** 默认的 items.json 路径（带真实 ULID，供创建时间排序用） */
export function defaultItemsPath(root: string): string {
  return path.resolve(root, '..', 'ai-video-imge-prompts', 'sites', 'midlibrary', 'data', 'items.json')
}

/**
 * 把风格库快照写到 config/styles.yaml，返回输出路径。
 */
export function renderStylesFile(root: string, manifestPath: string, detailsPath: string): string {
  const rows = loadManifest(manifestPath)
  const details = loadDetails(detailsPath)
  const config = buildStyles(rows, details, localISODate())
  const outFile = path.join(root, 'config', 'styles.yaml')
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, renderStylesYaml(config), 'utf-8')
  return outFile
}

/**
 * 把类型库快照写到 config/types.yaml，返回输出路径。
 */
export function renderTypesFile(
  root: string,
  manifestPath: string,
  detailsPath: string,
  itemsPath?: string
): string {
  const rows = loadManifest(manifestPath)
  const details = loadDetails(detailsPath)
  const ulids = itemsPath ? loadUlids(itemsPath) : {}
  const config = buildTypes(rows, details, localISODate(), ulids)
  const outFile = path.join(root, 'config', 'types.yaml')
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, renderTypesYaml(config), 'utf-8')
  return outFile
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const manifestPath = process.env.MIDLIBRARY_MANIFEST ?? defaultManifestPath(root)
  const detailsPath = process.env.MIDLIBRARY_DETAILS ?? defaultDetailsPath(root)
  const itemsPath = process.env.MIDLIBRARY_ITEMS ?? defaultItemsPath(root)
  const out = renderStylesFile(root, manifestPath, detailsPath)
  const outTypes = renderTypesFile(root, manifestPath, detailsPath, itemsPath)
  const config = buildStyles(
    loadManifest(manifestPath),
    loadDetails(detailsPath),
    localISODate()
  )
  const types = buildTypes(
    loadManifest(manifestPath),
    loadDetails(detailsPath),
    localISODate(),
    loadUlids(itemsPath)
  )
  const withTime = types.entries.filter((e) => e.createdAt > 0).length
  console.log(
    `[build-styles] 已生成 ${out}（艺术家 ${config.artists.length} 条 / 风格参考码 ${config.codes.length} 条 / ` +
      `分面词 ${config.termGroups.reduce((n, g) => n + g.terms.length, 0)} 个 / 主色 ${config.colours.length} 个 / ` +
      `分面覆盖 ${config.source.facetCoverage}%）`
  )
  console.log(
    `[build-styles] 已生成 ${outTypes}（类型条目 ${types.entries.length} 条 / ` +
      `分类 ${types.categories.length} 个 / 分面词 ${types.termGroups.reduce((n, g) => n + g.terms.length, 0)} 个 / ` +
      `主色 ${types.colours.length} 个 / 分面覆盖 ${types.source.facetCoverage}% / 有创建时间 ${withTime} 条）`
  )
}
