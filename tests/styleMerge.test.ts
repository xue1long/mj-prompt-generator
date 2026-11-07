import { describe, it, expect } from 'vitest'
import { mergeStyleArtists, artistToPromptItem, STYLE_ID_PREFIX } from '@/utils/styleMerge'
import { promptLabel } from '@/utils/promptLabel'
import type { PromptsConfig, StylesConfig } from '@/types'

const vocab: PromptsConfig = {
  categories: [
    {
      id: 'lighting',
      name: '光线控制',
      special: { positionTag: 'lighting' },
      subCategories: [{ id: 'light-tone', name: '光线-影调', prompts: [] }],
    },
    {
      id: 'artists',
      name: '艺术家/摄影师',
      special: { positionTag: 'artist' },
      subCategories: [
        {
          id: 'minimalist',
          name: '极简',
          prompts: [{ id: 'minimal-1', prompt_zh: '极简主义', prompt_en: 'minimalism' }],
        },
      ],
    },
  ],
}

const styles: StylesConfig = {
  source: {
    name: 'midlibrary',
    url: 'https://midlibrary.io/library',
    license: '有条件',
    generatedAt: '2026-01-01',
    facetCoverage: 100,
  },
  categories: [{ id: 'illustrators', name: '插画师', count: 1 }],
  termGroups: [
    { id: 'style-quality', name: '风格质量', terms: [{ slug: 'detailed', label: '精细' }] },
  ],
  colours: [{ slug: 'blue', name: '蓝', hex: '#5d84cf' }],
  artists: [
    {
      id: 'puuung',
      name: 'Puuung',
      category: 'illustrators',
      promptEn: 'Puuung',
      sourcePrompt: 'by Puuung --v 8.2',
      preview: 'midlibrary/puuung.webp',
      sourceUrl: 'https://midlibrary.io/library/puuung',
      testedMark: true,
      isPick: false,
      terms: ['detailed'],
      colours: ['blue'],
    },
  ],
  codes: [
    {
      id: '47c2b6',
      name: 'Hillside Letterform',
      code: '3383230063',
      category: 'sref-styles',
      promptEn: '--sref 3383230063',
      sourcePrompt: '--sref 3383230063 --v 8.2',
      preview: 'midlibrary/47c2b6.webp',
      sourceUrl: 'https://midlibrary.io/library/47c2b6',
      testedMark: true,
      isPick: true,
      terms: ['detailed'],
      colours: ['blue'],
    },
  ],
}

describe('风格库并入词库', () => {
  it('没有风格库时词库原样返回', () => {
    expect(mergeStyleArtists(vocab, null)).toBe(vocab)
  })

  it('风格条目进「艺术家/摄影师」分类', () => {
    const merged = mergeStyleArtists(vocab, styles)
    const artists = merged.categories.find(c => c.id === 'artists')
    expect(artists?.subCategories?.map(s => s.id)).toEqual([
      'minimalist',
      'midlibrary-illustrators',
    ])
    expect(artists?.subCategories?.[1].name).toBe('插画师')
    expect(artists?.subCategories?.[1].prompts).toHaveLength(1)
  })

  it('风格条目的 id 带前缀，不与手写条目撞号', () => {
    const merged = mergeStyleArtists(vocab, styles)
    const ids = merged.categories.flatMap(c => [
      ...(c.prompts ?? []),
      ...(c.subCategories ?? []).flatMap(s => s.prompts),
    ]).map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(`${STYLE_ID_PREFIX}puuung`)
  })

  it('风格条目没有中文名，显示时回落到原文名', () => {
    const item = artistToPromptItem(styles.artists[0])
    expect(item.prompt_zh).toBeUndefined()
    expect(promptLabel(item)).toBe('Puuung')
  })

  it('风格条目不带版本参数，也不带 by 前缀', () => {
    const item = artistToPromptItem(styles.artists[0])
    expect(item.prompt_en).toBe('Puuung')
    expect(item.generationPrompt).toBe('by Puuung --v 8.2')
  })

  it('风格条目带出实测 / 精选标记与分面数据，筛选才有的筛', () => {
    const item = artistToPromptItem(styles.artists[0])
    expect(item.testedMark).toBe(true)
    expect(item.isPick).toBe(false)
    expect(item.terms).toEqual(['detailed'])
    expect(item.colours).toEqual(['blue'])
  })

  it('风格条目带出简介与风格描述（认出"他是谁"的唯一线索）', () => {
    const item = artistToPromptItem({
      ...styles.artists[0],
      intro: 'Puuung is a South Korean illustrator known for everyday life.',
      observation: 'The style uses finely drawn outlines.',
    })
    expect(item.description).toBe('Puuung is a South Korean illustrator known for everyday life.')
    expect(item.observation).toBe('The style uses finely drawn outlines.')
  })

  it('风格条目带出原站页面——逐条回链是许可条件', () => {
    const item = artistToPromptItem(styles.artists[0])
    expect(item.sourceUrl).toBe('https://midlibrary.io/library/puuung')
  })

  it('没有简介的条目：说明留空，界面回落到英文写法', () => {
    const item = artistToPromptItem(styles.artists[0])
    expect(item.description).toBeUndefined()
    expect(promptLabel(item)).toBe('Puuung')
  })

  it('与手写词库重名的风格条目跳过（手写的那条优先）', () => {
    const duplicated: StylesConfig = {
      ...styles,
      artists: [
        ...styles.artists,
        {
          id: 'nick-knight',
          name: 'Nick Knight',
          category: 'photographers',
          promptEn: 'Nick Knight',
          sourcePrompt: 'by Nick Knight --v 8.2',
          preview: 'midlibrary/nick-knight.webp',
          sourceUrl: 'https://midlibrary.io/library/nick-knight',
          testedMark: true,
          isPick: false,
          terms: [],
          colours: [],
        },
      ],
      categories: [...styles.categories, { id: 'photographers', name: '摄影师', count: 1 }],
    }

    const vocabWithNick: PromptsConfig = {
      categories: [
        ...vocab.categories,
        {
          id: 'artists-nick',
          name: '其他特色',
          special: { positionTag: 'artist' },
          subCategories: [
            {
              id: 'nick',
              name: '尼克·奈特',
              prompts: [{ id: 'nick-knight-zh', prompt_zh: '尼克·奈特', prompt_en: 'Nick Knight' }],
            },
          ],
        },
      ],
    }

    const merged = mergeStyleArtists(vocabWithNick, duplicated)
    const names = merged.categories.flatMap(c => [
      ...(c.prompts ?? []),
      ...(c.subCategories ?? []).flatMap(s => s.prompts),
    ]).map(p => p.prompt_en)
    expect(names.filter(n => n === 'Nick Knight')).toHaveLength(1)
  })

  it('风格参考码不进词库——它是参数不是片段', () => {
    const merged = mergeStyleArtists(vocab, styles)
    const texts = merged.categories.flatMap(c => [
      ...(c.prompts ?? []),
      ...(c.subCategories ?? []).flatMap(s => s.prompts),
    ]).map(p => p.prompt_en)
    expect(texts.some(t => t.includes('--sref'))).toBe(false)
  })
})
