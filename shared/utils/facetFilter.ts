import type { PromptItem, PromptSubCategory } from '../types'

/**
 * 筛选引擎（纯函数，无 Vue 依赖）。
 *
 * 语义与上游一致的两条：
 * - **组内任一、组间全部**：同一组分面词选多个取并集，不同组之间取交集；
 *   主色是同维度多值，取并集。
 * - **计数口径只有一套**：选项上的数字 = 在当前条件基础上再打开该项会得到的条数。
 *   上游那套「划分型维度反作用域」在本项目没有对应的可筛维度（类目已经是
 *   tab 与二级分类），故不引入，见 docs/风格库筛选方案.md。
 */

/** 一个 tab 的筛选状态 */
export interface FilterState {
  /** 搜索词（空串表示不按搜索收窄） */
  q: string
  /** 只看实测 */
  tested: boolean
  /** 编辑精选 */
  pick: boolean
  /** 已选分面词 slug（组内任一、组间全部） */
  terms: string[]
  /** 已选主色 slug（多选取并集） */
  colours: string[]
}

/** 布尔维度 */
export type BoolDim = 'tested' | 'pick'

/** 可切换的筛选维度 */
export type FilterKind = BoolDim | 'term' | 'colour'

/** 空筛选 */
export const EMPTY_FILTER: FilterState = {
  q: '',
  tested: false,
  pick: false,
  terms: [],
  colours: [],
}

/** 能参与筛选的条目：风格条目与风格参考码都满足 */
export interface FilterableEntry {
  testedMark?: boolean
  isPick?: boolean
  terms?: string[]
  colours?: string[]
}

/** 筛选上下文：条目的搜索文本 + 分面词的组归属 */
export interface FilterContext<T> {
  /** 该条目的搜索文本 */
  textOf: (item: T) => string
  /** 分面词 slug → 组 id；组内任一、组间全部靠它 */
  groupOfTerm?: (slug: string) => string | undefined
}

/** 是否没有任何生效条件 */
export function isEmptyFilter(state: FilterState): boolean {
  return (
    !state.q.trim() &&
    !state.tested &&
    !state.pick &&
    state.terms.length === 0 &&
    state.colours.length === 0
  )
}

/** 切换一个条件，返回新状态（纯函数，不改入参） */
export function toggleFilter(state: FilterState, kind: FilterKind, slug?: string): FilterState {
  if (kind === 'tested' || kind === 'pick') {
    return { ...state, [kind]: !state[kind] }
  }
  const key = kind === 'term' ? 'terms' : 'colours'
  const current = state[key]
  if (!slug) return state
  const next = current.includes(slug)
    ? current.filter(item => item !== slug)
    : [...current, slug]
  return { ...state, [key]: next }
}

/** 已选分面词按组归拢（组内任一、组间全部的判定依据） */
export function termsByGroup(
  state: FilterState,
  context: { groupOfTerm?: (slug: string) => string | undefined }
): Map<string, Set<string>> {
  const byGroup = new Map<string, Set<string>>()
  for (const slug of state.terms) {
    const group = context.groupOfTerm?.(slug) ?? ''
    const bucket = byGroup.get(group) ?? new Set<string>()
    bucket.add(slug)
    byGroup.set(group, bucket)
  }
  return byGroup
}

/** 单条是否满足全部条件（分组表与色集由调用方预先算好，避免逐条重建） */
function itemMatches<T extends FilterableEntry>(
  item: T,
  state: FilterState,
  context: FilterContext<T>,
  byGroup: Map<string, Set<string>>,
  colourSet: Set<string> | null
): boolean {
  if (state.tested && !item.testedMark) return false
  if (state.pick && !item.isPick) return false

  const q = state.q.trim().toLowerCase()
  if (q && !context.textOf(item).toLowerCase().includes(q)) return false

  if (byGroup.size > 0) {
    const entryTerms = item.terms ?? []
    for (const slugs of byGroup.values()) {
      // 某一组一个都没选中 -> 整条不合格（组间全部）
      if (!entryTerms.some(term => slugs.has(term))) return false
    }
  }

  if (colourSet) {
    const entryColours = item.colours ?? []
    if (!entryColours.some(colour => colourSet.has(colour))) return false
  }

  return true
}

/** 当前条件是否命中该条（对外暴露，便于单测与调试） */
export function matchesFilters<T extends FilterableEntry>(
  item: T,
  state: FilterState,
  context: FilterContext<T>
): boolean {
  const colourSet = state.colours.length ? new Set(state.colours) : null
  return itemMatches(item, state, context, termsByGroup(state, context), colourSet)
}

/**
 * 收窄条目。
 * 没有生效条件时原样返回（同一个数组引用，避免无谓的复制）。
 */
export function applyFilters<T extends FilterableEntry>(
  items: T[],
  state: FilterState,
  context: FilterContext<T>
): T[] {
  if (isEmptyFilter(state)) return items
  const byGroup = termsByGroup(state, context)
  const colourSet = state.colours.length ? new Set(state.colours) : null
  return items.filter(item => itemMatches(item, state, context, byGroup, colourSet))
}

/**
 * 在当前条件基础上再打开某一项会得到的条数。
 * 选项上的数字就是这个——用户据此判断值不值得点。
 */
export function countIfEnabled<T extends FilterableEntry>(
  items: T[],
  state: FilterState,
  context: FilterContext<T>,
  kind: FilterKind,
  slug?: string
): number {
  const next = enableFilter(state, kind, slug)
  const byGroup = termsByGroup(next, context)
  const colourSet = next.colours.length ? new Set(next.colours) : null
  let count = 0
  for (const item of items) {
    if (itemMatches(item, next, context, byGroup, colourSet)) count += 1
  }
  return count
}

/** 把某一项置为开启（布尔维度置 true，分面词/主色加入已选） */
export function enableFilter(state: FilterState, kind: FilterKind, slug?: string): FilterState {
  if (kind === 'tested' || kind === 'pick') {
    return { ...state, [kind]: true }
  }
  const key = kind === 'term' ? 'terms' : 'colours'
  if (!slug || state[key].includes(slug)) return state
  return { ...state, [key]: [...state[key], slug] }
}

/** 提示词条目的搜索文本（中文名 + 英文写法） */
export function promptSearchText(prompt: PromptItem): string {
  return `${prompt.prompt_zh ?? ''} ${prompt.prompt_en}`
}

/** 风格参考码的搜索文本（风格名 + 码本身） */
export function codeSearchText(item: { name: string; code: string }): string {
  return `${item.name} ${item.code}`
}

/** 提示词条目的筛选上下文 */
export const promptFilterContext: FilterContext<PromptItem> = {
  textOf: promptSearchText,
}

/**
 * 按筛选条件收窄二级分类；没有命中的分组直接去掉。
 * 无生效条件时原样返回，保持引用不变。
 */
export function filterSubCategories(
  subCategories: PromptSubCategory[],
  state: FilterState,
  context: FilterContext<PromptItem> = promptFilterContext
): PromptSubCategory[] {
  if (isEmptyFilter(state)) return subCategories
  return subCategories
    .map(subCategory => ({
      ...subCategory,
      prompts: applyFilters(subCategory.prompts, state, context),
    }))
    .filter(subCategory => subCategory.prompts.length > 0)
}
