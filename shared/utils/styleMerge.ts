import type {
  PromptCategory,
  PromptItem,
  PromptSubCategory,
  PromptsConfig,
  StyleArtist,
  StylesConfig,
} from '../types'

/**
 * 把风格库并进词库。
 *
 * 风格条目（艺术家）进「艺术家/摄影师」分类，按上游的画师类目分成二级分类；
 * 风格参考码不进词库——它是参数，不是提示词片段（见 CONTEXT.md）。
 *
 * 为什么在运行时合并而不是写进 config/prompts.yaml：
 * - 风格条目有八千多条，是生成物，混进手写词库会把 diff 和评审都淹掉；
 * - 手写词库与生成快照必须分文件（见 ADR-0008）。
 */

/** 风格条目的 id 前缀（避免与手写条目撞号） */
export const STYLE_ID_PREFIX = 'ml-'

/** 风格二级分类的 id 前缀 */
export const STYLE_SUBCATEGORY_PREFIX = 'midlibrary-'

/** 目标一级分类的 id */
export const ARTIST_CATEGORY_ID = 'artists'

/** 风格条目 → 词库条目 */
export function artistToPromptItem(artist: StyleArtist): PromptItem {
  return {
    id: `${STYLE_ID_PREFIX}${artist.id}`,
    // 风格条目没有中文名：上游只给原文名，界面回落到英文写法显示
    prompt_en: artist.promptEn,
    preview: artist.preview,
    // 上游原始提示词行，只作展示，不参与组装
    generationPrompt: artist.sourcePrompt,
    // 简介与风格描述：上游详情层的两段文字，只作展示
    description: artist.intro,
    observation: artist.observation,
    // 原站页面：署名与回链（NOTICE 的许可条件要求逐条回链）
    sourceUrl: artist.sourceUrl,
    // 筛选维度要用的上游标记与分面数据
    testedMark: artist.testedMark,
    isPick: artist.isPick,
    terms: artist.terms,
    colours: artist.colours,
  }
}

/** 找出承接风格条目的分类：优先「艺术家/摄影师」，否则取第一个 artist 位置的分类 */
export function findArtistCategory(categories: PromptCategory[]): PromptCategory | undefined {
  return (
    categories.find(c => c.id === ARTIST_CATEGORY_ID) ??
    categories.find(c => c.special?.positionTag === 'artist')
  )
}

/** 名字归一化（比较用） */
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * 词库里已有的名字（中文名与英文写法都算）。
 * 手写词库是手工整理过的，有中文名和挑过的预览图；
 * 风格库里同名的条目是自动带进来的，重名时以手写的那条为准。
 */
export function existingNames(config: PromptsConfig): Set<string> {
  const names = new Set<string>()
  for (const category of config.categories) {
    const items = [
      ...(category.prompts ?? []),
      ...(category.subCategories ?? []).flatMap(sub => sub.prompts),
    ]
    for (const item of items) {
      if (item.prompt_zh) names.add(normalizeName(item.prompt_zh))
      names.add(normalizeName(item.prompt_en))
    }
  }
  return names
}

/**
 * 把风格条目并进词库配置（不修改入参）。
 * @param config 手写词库
 * @param styles 风格库快照（没有时原样返回）
 */
export function mergeStyleArtists(
  config: PromptsConfig,
  styles: StylesConfig | null
): PromptsConfig {
  if (!styles || !styles.artists || styles.artists.length === 0) {
    return config
  }

  const target = findArtistCategory(config.categories)
  if (!target) {
    return config
  }

  const byCategory = new Map<string, StyleArtist[]>()
  const taken = existingNames(config)
  for (const artist of styles.artists) {
    // 与手写词库重名的条目跳过：手写的那条有中文名和挑过的预览图
    if (taken.has(normalizeName(artist.name))) continue
    const list = byCategory.get(artist.category)
    if (list) {
      list.push(artist)
    } else {
      byCategory.set(artist.category, [artist])
    }
  }

  const subCategories: PromptSubCategory[] = styles.categories
    .filter(category => byCategory.has(category.id))
    .map(category => ({
      id: `${STYLE_SUBCATEGORY_PREFIX}${category.id}`,
      name: category.name,
      prompts: (byCategory.get(category.id) ?? []).map(artistToPromptItem),
    }))

  const categories = config.categories.map(category =>
    category.id === target.id
      ? {
          ...category,
          subCategories: [...(category.subCategories ?? []), ...subCategories],
        }
      : category
  )

  return { ...config, categories }
}
