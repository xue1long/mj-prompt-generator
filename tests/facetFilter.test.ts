import { describe, it, expect } from 'vitest'
import {
  EMPTY_FILTER,
  applyFilters,
  codeSearchText,
  countIfEnabled,
  filterSubCategories,
  isEmptyFilter,
  matchesFilters,
  promptSearchText,
  toggleFilter,
} from '@/utils/facetFilter'
import type { FilterContext, FilterState, FilterableEntry } from '@/utils/facetFilter'
import type { PromptSubCategory } from '@/types'

interface Entry extends FilterableEntry {
  name: string
  code: string
  terms: string[]
  colours: string[]
}

/** 三个风格参考码，分面词跨三个组 */
const codes: Entry[] = [
  {
    name: 'Hillside Letterform',
    code: '3383230063',
    testedMark: true,
    isPick: true,
    terms: ['detailed', 'characters', 'glow'],
    colours: ['blue', 'light-blue'],
  },
  {
    name: 'Colossometal',
    code: '7326104',
    testedMark: true,
    isPick: false,
    terms: ['detailed', 'landscapes'],
    colours: ['blue', 'green'],
  },
  {
    name: 'Quiet Field',
    code: '42',
    testedMark: false,
    isPick: false,
    terms: ['abstract'],
    colours: ['red'],
  },
]

/** slug → 组 id（组内任一、组间全部的判定依据） */
const TERM_GROUP: Record<string, string> = {
  detailed: 'style-quality',
  abstract: 'style-quality',
  characters: 'subject',
  landscapes: 'subject',
  glow: 'visual-effects',
}

const context: FilterContext<Entry> = {
  textOf: codeSearchText,
  groupOfTerm: slug => TERM_GROUP[slug],
}

function state(patch: Partial<FilterState> = {}): FilterState {
  return { ...EMPTY_FILTER, terms: [], colours: [], ...patch }
}

const names = (items: Entry[]) => items.map(item => item.name)

describe('筛选引擎', () => {
  it('没有生效条件时原样返回（同一个数组引用）', () => {
    expect(isEmptyFilter(state())).toBe(true)
    expect(isEmptyFilter(state({ terms: ['detailed'] }))).toBe(false)
    expect(isEmptyFilter(state({ colours: ['blue'] }))).toBe(false)
    expect(applyFilters(codes, state(), context)).toBe(codes)
  })

  it('搜索匹配风格名与码，大小写不敏感', () => {
    expect(names(applyFilters(codes, state({ q: 'HILLSIDE' }), context))).toEqual([
      'Hillside Letterform',
    ])
    expect(names(applyFilters(codes, state({ q: '7326' }), context))).toEqual(['Colossometal'])
  })

  it('布尔维度之间取交集', () => {
    expect(applyFilters(codes, state({ tested: true }), context)).toHaveLength(2)
    expect(applyFilters(codes, state({ pick: true }), context)).toHaveLength(1)
    expect(applyFilters(codes, state({ tested: true, pick: true }), context)).toHaveLength(1)
  })

  it('同一组分面词取并集（组内任一）', () => {
    const hits = applyFilters(codes, state({ terms: ['detailed', 'abstract'] }), context)
    expect(names(hits)).toEqual(['Hillside Letterform', 'Colossometal', 'Quiet Field'])
  })

  it('不同组分面词取交集（组间全部）', () => {
    const hits = applyFilters(codes, state({ terms: ['detailed', 'characters'] }), context)
    expect(names(hits)).toEqual(['Hillside Letterform'])
  })

  it('组间全部为空时就是空结果，不是并集', () => {
    // characters 在 subject 组，abstract 在 style-quality 组：没有一条同时满足
    const hits = applyFilters(codes, state({ terms: ['characters', 'abstract'] }), context)
    expect(hits).toHaveLength(0)
  })

  it('主色多选取并集', () => {
    expect(names(applyFilters(codes, state({ colours: ['blue', 'red'] }), context))).toEqual([
      'Hillside Letterform',
      'Colossometal',
      'Quiet Field',
    ])
    expect(names(applyFilters(codes, state({ colours: ['green'] }), context))).toEqual([
      'Colossometal',
    ])
  })

  it('主色与分面词、布尔维度之间都取交集', () => {
    expect(applyFilters(codes, state({ colours: ['green'], terms: ['characters'] }), context)).toHaveLength(0)
    expect(
      applyFilters(codes, state({ colours: ['blue'], terms: ['detailed'], tested: true }), context)
    ).toHaveLength(2)
  })

  it('计数口径 = 在当前条件基础上再打开该项会得到的条数', () => {
    expect(countIfEnabled(codes, state(), context, 'tested')).toBe(2)
    expect(countIfEnabled(codes, state(), context, 'pick')).toBe(1)
    // 已经限定在「人物」里，再点「抽象」是 0 条（组间全部）
    expect(countIfEnabled(codes, state({ terms: ['characters'] }), context, 'term', 'abstract')).toBe(0)
    // 已经限定在「人物」里，再点「精细」是 1 条
    expect(countIfEnabled(codes, state({ terms: ['characters'] }), context, 'term', 'detailed')).toBe(1)
    // 已选的条件重复点没有额外收益，计数等于当前结果数
    expect(countIfEnabled(codes, state({ terms: ['detailed'] }), context, 'term', 'detailed')).toBe(2)
  })

  it('toggleFilter 增删条件且不改入参', () => {
    const base = state({ terms: ['detailed'] })
    const added = toggleFilter(base, 'term', 'characters')
    expect(added.terms).toEqual(['detailed', 'characters'])
    expect(base.terms).toEqual(['detailed'])

    const removed = toggleFilter(added, 'term', 'detailed')
    expect(removed.terms).toEqual(['characters'])

    expect(toggleFilter(state(), 'tested').tested).toBe(true)
    expect(toggleFilter(state({ colours: ['blue'] }), 'colour', 'blue').colours).toEqual([])
  })

  it('matchesFilters 对未标记的条目一律判假', () => {
    const plain: Entry = { name: 'Nope', code: '1', terms: [], colours: [] }
    expect(matchesFilters(plain, state({ tested: true }), context)).toBe(false)
    expect(matchesFilters(plain, state({ terms: ['detailed'] }), context)).toBe(false)
    expect(matchesFilters(plain, state({ colours: ['blue'] }), context)).toBe(false)
    expect(matchesFilters(plain, state(), context)).toBe(true)
  })

  it('提示词条目的搜索文本覆盖中文名与英文写法', () => {
    expect(promptSearchText({ id: 'x', prompt_zh: '高速摄影', prompt_en: 'highspeed photography' }))
      .toBe('高速摄影 highspeed photography')
    expect(promptSearchText({ id: 'y', prompt_en: 'Puuung' })).toBe(' Puuung')
  })

  it('按条件收窄二级分类，空分组直接去掉', () => {
    const subCategories: PromptSubCategory[] = [
      {
        id: 'a',
        name: '画家甲',
        prompts: [
          { id: 'p1', prompt_en: 'Monet', testedMark: true, terms: ['detailed'] },
          { id: 'p2', prompt_en: 'Puuung', testedMark: false, terms: ['abstract'] },
        ],
      },
      {
        id: 'b',
        name: '画家乙',
        prompts: [{ id: 'p3', prompt_en: 'Rembrandt', testedMark: false, terms: ['detailed'] }],
      },
    ]

    expect(filterSubCategories(subCategories, state())).toBe(subCategories)

    const narrowed = filterSubCategories(subCategories, state({ terms: ['detailed'] }))
    expect(narrowed.map(sub => sub.id)).toEqual(['a', 'b'])
    expect(narrowed[0].prompts.map(p => p.prompt_en)).toEqual(['Monet'])

    const none = filterSubCategories(subCategories, state({ terms: ['landscapes'] }))
    expect(none).toEqual([])
  })
})
