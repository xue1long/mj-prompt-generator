import { describe, it, expect } from 'vitest'
import {
  artistFragment,
  buildStyles,
  codeFragment,
  colourLabel,
  colourSlugsOf,
  previewPath,
  stripParams,
  termSlugsOf,
} from '../tools/build-styles'
import type { MidlibraryDetail, MidlibraryRow } from '../tools/build-styles'

const rows: MidlibraryRow[] = [
  {
    id: 'puuung',
    slug: 'puuung',
    name: 'Puuung',
    kind: 'artist',
    category: 'illustrators',
    prompt: 'by Puuung --v 8.2',
    sref: '',
    sourceUrl: 'https://midlibrary.io/library/puuung',
    thumb_path: 'thumbs/puuung.webp',
    testedMark: true,
  },
  {
    id: '47c2b6',
    slug: '47c2b6',
    name: 'Hillside Letterform',
    kind: 'style_code',
    category: 'sref-styles',
    prompt: '--sref 3383230063 --v 8.2',
    sref: '3383230063',
    sourceUrl: 'https://midlibrary.io/library/47c2b6',
    thumb_path: 'thumbs/47c2b6.webp',
    isPick: true,
  },
  {
    id: 'studio-ghibli',
    slug: 'studio-ghibli',
    name: 'Studio Ghibli',
    kind: 'title',
    category: 'titles',
    prompt: 'Studio Ghibli --v 8.2',
    sref: '',
    sourceUrl: 'https://midlibrary.io/library/studio-ghibli',
    thumb_path: 'thumbs/studio-ghibli.webp',
  },
]

/** 详情层：分面词 [[组名, [[显示名, 计数, slug], …]], …]，主色 [[hex, 色名, 占比, slug], …] */
const details: Record<string, MidlibraryDetail> = {
  puuung: {
    a: 'Puuung is a South Korean illustrator known for capturing the beauty of everyday life.',
    o: 'The style uses finely drawn outlines and flat yet subtly varied color areas.',
    t: [
      ['Style quality', [['Detailed', '8,116', 'detailed']]],
      ['Subject', [['Characters', '6,569', 'characters']]],
    ],
    c: [
      ['#5d84cf', 'blue', '41%', 'blue'],
      ['#96b5ed', 'light blue', '31%', 'light-blue'],
    ],
  },
  '47c2b6': {
    t: [['Style quality', [['Detailed', '8,116', 'detailed']]]],
    c: [['#111111', 'black', '100%', 'black']],
  },
}

describe('风格库生成', () => {
  it('stripParams 去掉参数尾', () => {
    expect(stripParams('Studio Ghibli --v 8.2')).toBe('Studio Ghibli')
    expect(stripParams('no flags')).toBe('no flags')
  })

  it('artistFragment 剥掉 by 前缀与版本参数', () => {
    expect(artistFragment('by Puuung --v 8.2', 'Puuung')).toBe('Puuung')
    expect(artistFragment('Puuung --v 8.2', 'Puuung')).toBe('Puuung')
    expect(artistFragment('--v 8.2', 'Puuung')).toBe('Puuung')
  })

  it('codeFragment 输出 --sref <码>', () => {
    expect(codeFragment('3383230063')).toBe('--sref 3383230063')
  })

  it('预览图路径指向 midlibrary 子目录', () => {
    expect(previewPath('puuung')).toBe('midlibrary/puuung.webp')
  })

  it('只收艺术家与风格参考码，其余类型不进本项目', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    expect(styles.artists.map(a => a.id)).toEqual(['puuung'])
    expect(styles.codes.map(c => c.id)).toEqual(['47c2b6'])
  })

  it('风格条目保留原文名与上游提示词行', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    const artist = styles.artists[0]
    expect(artist.name).toBe('Puuung')
    expect(artist.promptEn).toBe('Puuung')
    expect(artist.sourcePrompt).toBe('by Puuung --v 8.2')
    expect(artist.sourceUrl).toBe('https://midlibrary.io/library/puuung')
  })

  it('详情层的简介与风格描述带进条目', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    const artist = styles.artists[0]
    expect(artist.intro).toBe('Puuung is a South Korean illustrator known for capturing the beauty of everyday life.')
    expect(artist.observation).toBe('The style uses finely drawn outlines and flat yet subtly varied color areas.')
  })

  it('没有详情层文本的条目：简介与风格描述留空，不报错', () => {
    const styles = buildStyles(rows, {}, '2026-01-01')
    expect(styles.artists[0].intro).toBeUndefined()
    expect(styles.artists[0].observation).toBeUndefined()
  })

  it('风格参考码不收简介——码是参数，没有"是谁"的问题', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    const code = styles.codes[0] as { intro?: string; observation?: string }
    expect(code.intro).toBeUndefined()
    expect(code.observation).toBeUndefined()
  })

  it('风格参考码带码本身与写法', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    const code = styles.codes[0]
    expect(code.code).toBe('3383230063')
    expect(code.promptEn).toBe('--sref 3383230063')
  })

  it('画师类目带中文名与条数', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    expect(styles.categories).toEqual([{ id: 'illustrators', name: '插画师', count: 1 }])
  })

  it('分面词与主色带进条目，主色保持占比降序', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    expect(styles.artists[0].terms).toEqual(['detailed', 'characters'])
    expect(styles.artists[0].colours).toEqual(['blue', 'light-blue'])
    expect(styles.codes[0].terms).toEqual(['detailed'])
  })

  it('词组带 id 与中文名，词带中文标签', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    expect(styles.termGroups.map(g => g.id)).toEqual(['style-quality', 'subject'])
    expect(styles.termGroups[0].name).toBe('风格质量')
    expect(styles.termGroups[0].terms).toEqual([{ slug: 'detailed', label: '精细' }])
    expect(styles.termGroups[1].terms).toEqual([{ slug: 'characters', label: '人物' }])
  })

  it('主色词表带中文名与色块 hex', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    const blue = styles.colours.find(c => c.slug === 'blue')
    expect(blue?.name).toBe('蓝')
    expect(blue?.hex).toBe('#5d84cf')
    expect(styles.colours.find(c => c.slug === 'light-blue')?.name).toBe('浅蓝')
  })

  it('主色中文名由 slug 组合，认不出来的回落英文名', () => {
    expect(colourLabel('blue')).toBe('蓝')
    expect(colourLabel('dark-ochre')).toBe('深赭石')
    expect(colourLabel('bone-white')).toBe('骨白')
    expect(colourLabel('mystery-color', 'mystery')).toBe('mystery')
  })

  it('没有详情层的条目：分面为空，覆盖率下降但不报错', () => {
    const styles = buildStyles(rows, {}, '2026-01-01')
    expect(styles.artists[0].terms).toEqual([])
    expect(styles.artists[0].colours).toEqual([])
    expect(styles.termGroups).toEqual([])
    expect(styles.source.facetCoverage).toBe(0)
  })

  it('覆盖率按「有分面词的条目」算', () => {
    // rows 里有 3 条，其中 2 条有详情层；codes/artists 只收 2 条，但覆盖率按入参 rows 算
    const styles = buildStyles(rows, details, '2026-01-01')
    expect(styles.source.facetCoverage).toBe(66.7)
  })

  it('分面词与主色的抽取是纯函数', () => {
    expect(termSlugsOf(details.puuung)).toEqual(['detailed', 'characters'])
    expect(termSlugsOf(undefined)).toEqual([])
    expect(colourSlugsOf(details.puuung)).toEqual(['blue', 'light-blue'])
    expect(colourSlugsOf(undefined)).toEqual([])
  })

  it('来源与授权写明', () => {
    const styles = buildStyles(rows, details, '2026-01-01')
    expect(styles.source.name).toBe('midlibrary')
    expect(styles.source.license).toContain('署名')
    expect(styles.source.license).toContain('回链')
  })
})
