/**
 * 探索榜页签的 URL 契约。
 *
 * 与词库页签的筛选契约（utils/filterHash.ts）是两套：
 * - 词库页签路径 `#/artists`、`#/style-codes`，由 filterStore 解析；
 * - 探索榜是提示词库里的第 9 个页签，路径 `#/explore`，参数名不与词库重名，
 *   由 exploreStore 解析。两套不能互相代管，否则筛选参数会被当作非法参数清空。
 *
 * 形如 `#/explore?d=2026-11-06&ar=9:16&sref=1&q=cat`。
 * 与 ADR-0010 一致：hash 是筛选状态的唯一来源，不认识的参数直接丢弃。
 */

/** hash 里的路径段 */
export const EXPLORE_PATH = 'explore'

/** 探索榜的筛选状态 */
export interface ExploreFilterState {
  /** 采集批次（日期 YYYY-MM-DD） */
  batch: string
  /** 宽高比（上游声明值，如 "9:16"） */
  aspect: string
  /** 只看带风格参考码的作业 */
  srefOnly: boolean
  /** 搜索词（提示词原文或作者名） */
  q: string
}

export const EMPTY_EXPLORE_FILTER: ExploreFilterState = {
  batch: '',
  aspect: '',
  srefOnly: false,
  q: '',
}

/** 允许出现的参数名 */
export const EXPLORE_PARAMS = ['d', 'ar', 'sref', 'q'] as const

export interface ParsedExploreHash {
  /** 解析出的筛选状态 */
  state: ExploreFilterState
  /** 被丢弃的参数名（用于提示「已忽略不支持的筛选」） */
  ignored: string[]
}

/** 这个 hash 是不是探索榜页签 */
export function isExploreHash(hash: string): boolean {
  const path = (hash || '').replace(/^#/, '').split('?')[0].replace(/^\//, '')
  return path === EXPLORE_PATH
}

/** 解析 hash；不认识的参数算丢弃，不算错误 */
export function parseExploreHash(hash: string): ParsedExploreHash {
  const state: ExploreFilterState = { ...EMPTY_EXPLORE_FILTER }
  const ignored: string[] = []
  const raw = (hash || '').replace(/^#/, '')
  if (!raw) return { state, ignored }

  const [, rawQuery = ''] = raw.split('?')
  const params = new URLSearchParams(rawQuery)
  for (const key of new Set(params.keys())) {
    if (!(EXPLORE_PARAMS as readonly string[]).includes(key)) {
      ignored.push(key)
      continue
    }
    if (key === 'd') {
      state.batch = (params.get('d') ?? '').trim()
      continue
    }
    if (key === 'ar') {
      state.aspect = (params.get('ar') ?? '').trim()
      continue
    }
    if (key === 'q') {
      state.q = (params.get('q') ?? '').trim()
      continue
    }
    // 布尔参数：出现即 1；其他取值视为未生效
    if ((params.get('sref') ?? '').trim() === '1') {
      state.srefOnly = true
    }
  }
  return { state, ignored }
}

/** 生成 hash；没有生效条件时只留路径 */
export function buildExploreHash(state: ExploreFilterState): string {
  const params = new URLSearchParams()
  if (state.batch) params.append('d', state.batch)
  if (state.aspect) params.append('ar', state.aspect)
  if (state.srefOnly) params.append('sref', '1')
  if (state.q) params.append('q', state.q)
  const query = params.toString()
  return `#/${EXPLORE_PATH}${query ? `?${query}` : ''}`
}
