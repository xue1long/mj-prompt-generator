import { describe, it, expect } from 'vitest'
import { buildFilterHash, parseFilterHash, isFilterTab } from '@/utils/filterHash'
import { EMPTY_FILTER } from '@/utils/facetFilter'

describe('筛选 URL 契约', () => {
  it('解析风格参考码的筛选', () => {
    const parsed = parseFilterHash('#/style-codes?pick=1&q=ghibli')
    expect(parsed.tab).toBe('style-library')
    expect(parsed.state.q).toBe('ghibli')
    expect(parsed.state.pick).toBe(true)
    expect(parsed.state.terms).toEqual([])
    expect(parsed.state.colours).toEqual([])
    expect(parsed.ignored).toEqual([])
  })

  it('解析分面词与主色（同一参数重复出现即多选）', () => {
    const parsed = parseFilterHash(
      '#/style-codes?term=detailed&term=characters&colour=blue&colour=green'
    )
    expect(parsed.state.terms).toEqual(['detailed', 'characters'])
    expect(parsed.state.colours).toEqual(['blue', 'green'])
    expect(parsed.ignored).toEqual([])
  })

  it('解析艺术家侧的筛选', () => {
    const parsed = parseFilterHash('#/artists?tested=1&term=characters')
    expect(parsed.tab).toBe('artists')
    expect(parsed.state.tested).toBe(true)
    expect(parsed.state.terms).toEqual(['characters'])
  })

  it('该 tab 不支持的参数被丢弃并记下来', () => {
    // 艺术家侧没有「编辑精选」这个维度
    const parsed = parseFilterHash('#/artists?tested=1&pick=1')
    expect(parsed.state.pick).toBe(false)
    expect(parsed.ignored).toEqual(['pick'])
  })

  it('完全不认识的参数同样被丢弃', () => {
    const parsed = parseFilterHash('#/style-codes?category=painters&sort=popular')
    expect(parsed.ignored.sort()).toEqual(['category', 'sort'])
    expect(parsed.tab).toBe('style-library')
  })

  it('布尔参数不是 1 时视为未生效，但不算被丢弃的参数', () => {
    const parsed = parseFilterHash('#/style-codes?tested=0')
    expect(parsed.state.tested).toBe(false)
    expect(parsed.ignored).toEqual([])
  })

  it('不认识的路径当作没有筛选', () => {
    expect(parseFilterHash('#/gallery').tab).toBeNull()
    expect(parseFilterHash('#/gallery').state).toEqual(EMPTY_FILTER)
    expect(parseFilterHash('').tab).toBeNull()
  })

  it('生成 hash：空条件只留路径', () => {
    expect(buildFilterHash('style-library', EMPTY_FILTER)).toBe('#/style-codes')
    expect(buildFilterHash('artists', EMPTY_FILTER)).toBe('#/artists')
  })

  it('生成 hash：条件按固定顺序，且只写该 tab 允许的', () => {
    expect(
      buildFilterHash('style-library', {
        q: 'ghibli',
        tested: true,
        pick: true,
        terms: ['detailed', 'characters'],
        colours: ['blue'],
      })
    ).toBe('#/style-codes?q=ghibli&tested=1&pick=1&term=detailed&term=characters&colour=blue')
    // 艺术家侧没有 pick：即使状态里是 true 也不写
    expect(
      buildFilterHash('artists', {
        q: '',
        tested: true,
        pick: true,
        terms: ['characters'],
        colours: [],
      })
    ).toBe('#/artists?tested=1&term=characters')
  })

  it('生成的 hash 能原样解析回来（往返一致）', () => {
    const state = { q: 'monet', tested: true, pick: false, terms: ['detailed'], colours: ['blue'] }
    const parsed = parseFilterHash(buildFilterHash('artists', state))
    expect(parsed.tab).toBe('artists')
    expect(parsed.state).toEqual(state)
  })

  it('不可筛的 tab 生成空串（调用方据此清掉 hash）', () => {
    expect(buildFilterHash('gallery', { ...EMPTY_FILTER, terms: [], colours: [] })).toBe('')
    expect(isFilterTab('gallery')).toBe(false)
    expect(isFilterTab('style-library')).toBe(true)
  })

  it('搜索词里的空格与中文都能往返', () => {
    const state = { q: '吉卜力 风格', tested: false, pick: false, terms: [], colours: [] }
    expect(parseFilterHash(buildFilterHash('style-library', state)).state.q).toBe('吉卜力 风格')
  })
})
