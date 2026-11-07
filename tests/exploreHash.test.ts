import { describe, it, expect } from 'vitest'
import {
  buildExploreHash,
  isExploreHash,
  parseExploreHash,
  EMPTY_EXPLORE_FILTER,
} from '@/utils/exploreHash'

describe('探索榜 URL 契约', () => {
  it('认得探索榜这个页面', () => {
    expect(isExploreHash('#/explore')).toBe(true)
    expect(isExploreHash('#/explore?ar=9:16')).toBe(true)
    expect(isExploreHash('#/artists')).toBe(false)
    expect(isExploreHash('')).toBe(false)
  })

  it('解析日期、比例、sref 与搜索词', () => {
    const parsed = parseExploreHash('#/explore?d=2026-11-06&ar=9:16&sref=1&q=cat')
    expect(parsed.state.batch).toBe('2026-11-06')
    expect(parsed.state.aspect).toBe('9:16')
    expect(parsed.state.srefOnly).toBe(true)
    expect(parsed.state.q).toBe('cat')
    expect(parsed.ignored).toEqual([])
  })

  it('不认识的参数被丢弃并记下来', () => {
    const parsed = parseExploreHash('#/explore?sort=hot&artist=nobody')
    expect(parsed.ignored.sort()).toEqual(['artist', 'sort'])
    expect(parsed.state).toEqual(EMPTY_EXPLORE_FILTER)
  })

  it('布尔参数不是 1 时视为未生效，但不算被丢弃的参数', () => {
    const parsed = parseExploreHash('#/explore?sref=0')
    expect(parsed.state.srefOnly).toBe(false)
    expect(parsed.ignored).toEqual([])
  })

  it('空 hash 就是没有筛选', () => {
    expect(parseExploreHash('').state).toEqual(EMPTY_EXPLORE_FILTER)
  })

  it('生成 hash：空条件只留路径', () => {
    expect(buildExploreHash(EMPTY_EXPLORE_FILTER)).toBe('#/explore')
  })

  it('生成 hash：条件按固定顺序排列', () => {
    const hash = buildExploreHash({
      batch: '2026-11-06',
      aspect: '9:16',
      srefOnly: true,
      q: 'cat',
    })
    expect(hash).toBe('#/explore?d=2026-11-06&ar=9%3A16&sref=1&q=cat')
  })

  it('往返一致', () => {
    const state = {
      batch: '2026-11-05',
      aspect: '1:1',
      srefOnly: false,
      q: 'portrait',
    }
    expect(parseExploreHash(buildExploreHash(state)).state).toEqual(state)
  })
})
