import { EMPTY_FILTER, type FilterState } from './facetFilter'

/**
 * 筛选状态的 URL 契约（hash 是筛选的唯一状态源）。
 *
 * 形如：`#/style-codes?pick=1&term=detailed&term=characters&colour=blue&q=ghibli`、
 * `#/artists?tested=1&term=characters`。
 * 刷新、后退、分享同一条 hash 都能复现同一筛选结果。
 *
 * 与上游不同的是：**不认识的参数直接丢弃并修正 URL**，不静默忽略
 * （本地单人工具，静默失败比报错更贵）。
 */

/** 一个可筛 tab 的契约：hash 路径 + 允许的参数名 */
export interface FilterTabPolicy {
  /** hash 里的路径段 */
  path: string
  /** 该 tab 允许出现的参数名（hash 里的写法，与状态字段名不同） */
  allowed: ReadonlyArray<FilterParam>
}

/** hash 参数名（`term` / `colour` 对应状态里的 `terms` / `colours`） */
export type FilterParam = 'q' | 'tested' | 'pick' | 'term' | 'colour'

/**
 * 可筛 tab 的注册表，键是 n-tabs 的 name。
 * 不在这里的 tab 没有筛选，也就不会在 hash 里留参数。
 */
export const FILTER_TABS: Record<string, FilterTabPolicy> = {
  artists: { path: 'artists', allowed: ['q', 'tested', 'term', 'colour'] },
  'style-library': { path: 'style-codes', allowed: ['q', 'pick', 'tested', 'term', 'colour'] },
}

export interface ParsedFilterHash {
  /** 命中的可筛 tab（没有命中为 null） */
  tab: string | null
  /** 解析出的筛选状态 */
  state: FilterState
  /** 被丢弃的参数名（用于提示「已忽略不支持的筛选」） */
  ignored: string[]
}

/** 解析 hash；不认识的路径与参数都不算错误，只是丢弃 */
export function parseFilterHash(hash: string): ParsedFilterHash {
  const empty: ParsedFilterHash = {
    tab: null,
    state: { ...EMPTY_FILTER, terms: [], colours: [] },
    ignored: [],
  }
  const raw = (hash || '').replace(/^#/, '')
  if (!raw) return empty

  const [rawPath, rawQuery = ''] = raw.split('?')
  const path = rawPath.replace(/^\//, '')
  const entry = Object.entries(FILTER_TABS).find(([, policy]) => policy.path === path)
  if (!entry) return empty

  const [tab, policy] = entry
  const params = new URLSearchParams(rawQuery)
  const state: FilterState = { ...EMPTY_FILTER, terms: [], colours: [] }
  const ignored: string[] = []

  for (const key of new Set(params.keys())) {
    if (!policy.allowed.includes(key as FilterParam)) {
      ignored.push(key)
      continue
    }
    if (key === 'q') {
      state.q = (params.get('q') ?? '').trim()
      continue
    }
    if (key === 'term' || key === 'colour') {
      const field = key === 'term' ? 'terms' : 'colours'
      state[field] = params
        .getAll(key)
        .map(value => value.trim())
        .filter(Boolean)
      continue
    }
    // 布尔参数：出现即 1；其他取值（如 tested=0）视为未生效，不着痕迹地丢掉
    if ((params.get(key) ?? '').trim() === '1') {
      state[key as 'tested' | 'pick'] = true
    }
  }

  return { tab, state, ignored }
}

/** 生成 hash；没有生效条件时只留路径 */
export function buildFilterHash(tab: string, state: FilterState): string {
  const policy = FILTER_TABS[tab]
  if (!policy) return ''

  const params = new URLSearchParams()
  const q = state.q.trim()
  if (q) params.append('q', q)
  for (const dim of ['tested', 'pick'] as const) {
    if (state[dim] && policy.allowed.includes(dim)) params.append(dim, '1')
  }
  if (policy.allowed.includes('term')) {
    for (const slug of state.terms) params.append('term', slug)
  }
  if (policy.allowed.includes('colour')) {
    for (const slug of state.colours) params.append('colour', slug)
  }

  const query = params.toString()
  return `#/${policy.path}${query ? `?${query}` : ''}`
}

/** 该 tab 是否有筛选能力 */
export function isFilterTab(tab: string): boolean {
  return tab in FILTER_TABS
}
