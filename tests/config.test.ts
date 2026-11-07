import { describe, it, expect } from 'vitest'
import { PROMPTS_CONFIG, PARAMETERS_CONFIG, STYLES_CONFIG } from 'virtual:app-config'
import type { PromptsConfig, ParametersConfig, StylesConfig } from '@/types'

const prompts = PROMPTS_CONFIG as PromptsConfig
const parameters = PARAMETERS_CONFIG as ParametersConfig
const styles = STYLES_CONFIG as StylesConfig | null

/** 词库里的全部条目 */
function allPrompts() {
  return prompts.categories.flatMap(category => [
    ...(category.prompts ?? []),
    ...(category.subCategories ?? []).flatMap(sub => sub.prompts),
  ])
}

describe('词库配置', () => {
  it('每个一级分类都带位置标签', () => {
    expect(prompts.categories.length).toBeGreaterThan(0)
    for (const category of prompts.categories) {
      expect(category.special?.positionTag).toBeTruthy()
    }
  })

  it('每条提示词都有中英文写法', () => {
    const all = allPrompts()
    expect(all.length).toBeGreaterThan(0)

    for (const item of all) {
      expect(item.id, '缺少 id').toBeTruthy()
      expect(item.prompt_zh, `${item.id} 缺少中文`).toBeTruthy()
      expect(item.prompt_en, `${item.id} 缺少英文`).toBeTruthy()
    }
  })

  it('所有提示词 id 全局唯一', () => {
    const ids = allPrompts().map(item => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个一级分类都有条目', () => {
    for (const category of prompts.categories) {
      const count =
        (category.prompts?.length ?? 0) +
        (category.subCategories ?? []).reduce((n, sub) => n + sub.prompts.length, 0)
      expect(count, `${category.id} 没有条目`).toBeGreaterThan(0)
    }
  })

  it('主体环境示例可读', () => {
    expect(prompts.subjectEnvironmentExamples?.length).toBe(3)
    for (const example of prompts.subjectEnvironmentExamples ?? []) {
      expect(example.fullText).toBeTruthy()
    }
  })
})

describe('风格库配置', () => {
  it('风格条目与风格参考码都在', () => {
    expect(styles, '风格库快照缺失，先跑 npm run build:styles').not.toBeNull()
    expect(styles!.artists.length).toBeGreaterThan(4000)
    expect(styles!.codes.length).toBeGreaterThan(4000)
  })

  it('风格条目 id 唯一，并入词库后不与手写条目撞号', () => {
    const ids = styles!.artists.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)

    // 风格条目的原始 id 可能与手写条目重名（例如 zhang-jingna 两边都有），
    // 并入词库时统一加 STYLE_ID_PREFIX，所以手写词库里不能有带该前缀的 id
    const prefixed = styles!.artists.map(a => `ml-${a.id}`)
    const vocabIds = allPrompts().map(item => item.id)
    expect(vocabIds.filter(id => id.startsWith('ml-'))).toEqual([])
    expect(new Set([...vocabIds, ...prefixed]).size).toBe(vocabIds.length + prefixed.length)
  })

  it('风格条目不自带版本参数，名字不带 by 前缀', () => {
    for (const artist of styles!.artists) {
      expect(artist.promptEn, artist.id).not.toMatch(/--/)
      expect(artist.promptEn, artist.id).not.toMatch(/^by\s/i)
      expect(artist.promptEn, artist.id).toBeTruthy()
    }
  })

  it('风格参考码形如 --sref <数字>', () => {
    for (const code of styles!.codes) {
      expect(code.code, code.id).toMatch(/^\d+$/)
      expect(code.promptEn, code.id).toBe(`--sref ${code.code}`)
    }
  })

  it('每条都有原站回链与预览图', () => {
    for (const item of [...styles!.artists, ...styles!.codes]) {
      expect(item.sourceUrl, item.id).toMatch(/^https:\/\/midlibrary\.io\//)
      expect(item.preview, item.id).toMatch(/^midlibrary\//)
    }
  })

  it('风格条目带筛选用的两个上游标记', () => {
    for (const item of [...styles!.artists, ...styles!.codes]) {
      expect(typeof item.testedMark, `${item.id} 缺少 testedMark`).toBe('boolean')
      expect(typeof item.isPick, `${item.id} 缺少 isPick`).toBe('boolean')
    }
    // 两个维度都要有真值，否则筛选开关等于摆设
    expect(styles!.artists.concat(styles!.codes).some(item => item.testedMark)).toBe(true)
    expect(styles!.artists.concat(styles!.codes).some(item => item.isPick)).toBe(true)
  })

  it('来源与授权写明', () => {
    expect(styles!.source.name).toBe('midlibrary')
    expect(styles!.source.license).toBeTruthy()
  })

  it('分面词与主色覆盖全量', () => {
    expect(styles!.source.facetCoverage).toBe(100)
    expect(styles!.termGroups).toHaveLength(10)
    expect(styles!.termGroups.reduce((n, group) => n + group.terms.length, 0)).toBe(68)
    expect(styles!.colours).toHaveLength(96)

    for (const item of [...styles!.artists, ...styles!.codes]) {
      expect(item.terms.length, `${item.id} 没有分面词`).toBeGreaterThan(0)
      expect(item.colours.length, `${item.id} 没有主色`).toBeGreaterThan(0)
    }
  })

  it('每个分面词 slug 只属于一组，且条目里的词都能找到归属', () => {
    const groupOf = new Map<string, string>()
    for (const group of styles!.termGroups) {
      for (const term of group.terms) {
        expect(groupOf.has(term.slug), `${term.slug} 出现在两个组里`).toBe(false)
        groupOf.set(term.slug, group.id)
      }
    }
    // 条目里出现的词必须都在词组表里，否则「组内任一、组间全部」会判错
    const missing = new Set<string>()
    for (const item of [...styles!.artists, ...styles!.codes]) {
      for (const slug of item.terms) {
        if (!groupOf.has(slug)) missing.add(slug)
      }
    }
    expect([...missing]).toEqual([])
  })

  it('条目的主色都有色名与 hex', () => {
    const known = new Map(styles!.colours.map(colour => [colour.slug, colour]))
    for (const item of [...styles!.artists, ...styles!.codes]) {
      for (const slug of item.colours) {
        const colour = known.get(slug)
        expect(colour, `${item.id} 引用了未知主色 ${slug}`).toBeTruthy()
        expect(colour!.hex).toMatch(/^#[0-9a-fA-F]{3,8}$/)
        expect(colour!.name).toBeTruthy()
      }
    }
  })
})

describe('参数配置', () => {
  it('每个参数都有 id、名称与类型', () => {
    for (const param of parameters.parameters) {
      expect(param.id).toBeTruthy()
      expect(param.name).toBeTruthy()
      expect(['select', 'slider', 'input', 'checkbox']).toContain(param.type)
    }
  })

  it('参数 id 唯一', () => {
    const ids = parameters.parameters.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('select 参数都提供了选项', () => {
    for (const param of parameters.parameters) {
      if (param.type !== 'select') continue
      const hasOptions =
        (param.options && param.options.length > 0) ||
        (param.optionsByVersion && Object.keys(param.optionsByVersion).length > 0)
      expect(hasOptions, `参数 ${param.id} 缺少选项`).toBe(true)
    }
  })

  it('versions 里出现的模型版本都在版本下拉中', () => {
    const versionParam = parameters.parameters.find(p => p.id === 'version')
    const known = new Set(
      (versionParam as any).options.map((o: any) => o.value)
    )

    for (const param of parameters.parameters) {
      const anyParam = param as any
      for (const version of param.versions ?? []) {
        expect(known.has(version), `参数 ${param.id} 引用了未知版本 ${version}`).toBe(true)
      }
      for (const version of Object.keys(anyParam.optionsByVersion ?? {})) {
        expect(known.has(version), `参数 ${param.id} 引用了未知版本 ${version}`).toBe(true)
      }
      for (const version of Object.keys(anyParam.defaultByVersion ?? {})) {
        expect(known.has(version), `参数 ${param.id} 引用了未知版本 ${version}`).toBe(true)
      }
      for (const version of Object.keys(anyParam.rangeByVersion ?? {})) {
        expect(known.has(version), `参数 ${param.id} 引用了未知版本 ${version}`).toBe(true)
      }
    }
  })
})
