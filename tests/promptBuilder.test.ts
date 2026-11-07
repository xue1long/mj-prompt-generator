import { describe, it, expect } from 'vitest'
import { PARAMETERS_CONFIG } from 'virtual:app-config'
import { PromptBuilder } from '@/utils/promptBuilder'
import { defaultValues, sanitizeValues } from '@/utils/parameterCompat'
import type { ParametersConfig, SelectedPrompt } from '@/types'

const config = PARAMETERS_CONFIG as ParametersConfig

function prompt(
  id: string,
  text: string,
  positionTag: string,
  timestamp: number
): SelectedPrompt {
  return {
    categoryId: 'test',
    promptId: id,
    text,
    timestamp,
    positionTag,
  }
}

function build(values: Record<string, any>, selected: SelectedPrompt[] = [], subject = '') {
  return PromptBuilder.buildPhotography(selected, subject, values, config)
}

describe('提示词组装顺序', () => {
  it('没有艺术家时前缀为 photography', () => {
    const result = build({}, [])
    expect(result.startsWith('photography')).toBe(true)
  })

  it('有艺术家时前缀为 photography by X', () => {
    const result = build({}, [prompt('a', 'Annie Leibovitz', 'artist', 1)])
    expect(result.startsWith('photography by Annie Leibovitz')).toBe(true)
  })

  it('固定顺序为 艺术家 -> 机位 -> 主体环境 -> 光线 -> 其他', () => {
    const selected = [
      prompt('other', 'other term', 'other', 1),
      prompt('lighting', 'rim lighting', 'lighting', 2),
      prompt('camera', 'DSLR', 'camera', 3),
      prompt('artist', 'Nick Knight', 'artist', 4),
    ]
    const result = build({}, selected, 'a woman with long hair')

    expect(result).toBe(
      'photography by Nick Knight, DSLR, a woman with long hair, rim lighting, other term'
    )
  })

  it('同一分组内按选中顺序排列', () => {
    const selected = [
      prompt('c1', 'first', 'camera', 10),
      prompt('c2', 'second', 'camera', 20),
    ]
    const result = build({}, selected)
    expect(result).toBe('photography, first, second')
  })
})

describe('参数输出', () => {
  it('版本与宽高比总是输出', () => {
    const values = defaultValues(config.parameters, '8.2')
    const result = build(values)
    expect(result).toContain('--v 8.2')
    expect(result).toContain('--ar 16:9')
  })

  it('取默认值的可调参数不输出', () => {
    const values = defaultValues(config.parameters, '8.2')
    const result = build(values)
    expect(result).not.toContain('--s ')
    expect(result).not.toContain('--c ')
    expect(result).not.toContain('--weird')
    expect(result).not.toContain('--iw ')
    expect(result).not.toContain('--sw ')
  })

  it('非默认值会被输出', () => {
    const values = defaultValues(config.parameters, '8.2')
    values.stylize = 500
    values.chaos = 30
    values.no = 'text, watermark'
    const result = build(values)
    expect(result).toContain('--s 500')
    expect(result).toContain('--c 30')
    expect(result).toContain('--no text, watermark')
  })

  it('开关型参数只在启用时输出', () => {
    const values = defaultValues(config.parameters, '8.2')
    expect(build(values)).not.toContain('--raw')
    values.raw = true
    values.tile = true
    const result = build(values)
    expect(result).toContain('--raw')
    expect(result).toContain('--tile')
  })

  it('Niji 版本输出 --niji 而不是 --v', () => {
    const values = defaultValues(config.parameters, 'niji-7')
    const result = build(values)
    expect(result).toContain('--niji 7')
    expect(result).not.toContain('--v ')
  })

  it('V8.1/V8.2 下质量参数被屏蔽', () => {
    const values = defaultValues(config.parameters, '8.2')
    values.quality = '2'
    expect(build(values)).not.toContain('--q ')

    const v7 = defaultValues(config.parameters, '7')
    v7.quality = '2'
    expect(build(v7)).toContain('--q 2')
  })

  it('V7 独占的 Omni 参考只在 V7 输出', () => {
    const v8 = defaultValues(config.parameters, '8.2')
    v8.omniRef = 'https://example.com/a.png'
    expect(build(v8)).not.toContain('--oref')

    const v7 = defaultValues(config.parameters, '7')
    v7.omniRef = 'https://example.com/a.png'
    expect(build(v7)).toContain('--oref https://example.com/a.png')
  })

  it('V8.1 独占的分辨率参数只在 V8 输出', () => {
    const v8 = defaultValues(config.parameters, '8.2')
    v8.resolution = 'hd'
    expect(build(v8)).toContain('--hd')

    const v7 = defaultValues(config.parameters, '7')
    v7.resolution = 'hd'
    expect(build(v7)).not.toContain('--hd')
  })

  it('速度模式输出 --fast / --relax', () => {
    const values = defaultValues(config.parameters, '8.2')
    values.speed = 'fast'
    expect(build(values)).toContain('--fast')

    values.speed = 'relax'
    expect(build(values)).toContain('--relax')
  })

  it('生成速度默认留空时不出现在结果里', () => {
    const values = defaultValues(config.parameters, '8.2')
    expect(build(values)).not.toContain('--fast')
    expect(build(values)).not.toContain('--relax')
  })
})

describe('参数与配置的对应关系', () => {
  it('每个参数都声明了 CLI 参数名或由选项覆盖', () => {
    for (const param of config.parameters) {
      const hasFlag =
        !!param.param ||
        (param.type === 'select' &&
          (param.options || []).some(option => !!option.param))
      expect(hasFlag, `参数 ${param.id} 缺少 param`).toBe(true)
    }
  })

  it('配置里不残留已废弃的参数', () => {
    const ids = config.parameters.map(p => p.id)
    expect(ids).not.toContain('characterRef') // --cref 属 Legacy，已由 Omni / 编辑模型取代
    expect(ids).not.toContain('stop') // 官方参数表里没有 --stop
    expect(ids).not.toContain('style') // 官方现为 --raw
  })

  it('模型版本下拉里的每个取值都在各参数的 versions 列表中', () => {
    const versionParam = config.parameters.find(p => p.id === 'version')
    expect(versionParam).toBeDefined()
    const versions = (versionParam as any).options.map((o: any) => o.value)
    expect(versions).toEqual(['8.2', '8.1', '7', '6.1', '6.0', 'niji-7', 'niji-6'])
  })
})

describe('版本切换时的参数清洗', () => {
  it('切到 V8.2 会清掉 V7 专属的 Omni 参数', () => {
    const values = defaultValues(config.parameters, '7')
    values.omniRef = 'https://example.com/a.png'
    values.omniWeight = 300

    const sanitized = sanitizeValues(config.parameters, values, '8.2')
    expect(sanitized.omniRef).toBe('')
    expect(sanitized.omniWeight).toBe(100)
  })

  it('切到 Niji 7 会把图片权重收敛到 0-2', () => {
    const values = defaultValues(config.parameters, '8.2')
    values.imageWeight = 3

    const sanitized = sanitizeValues(config.parameters, values, 'niji-7')
    expect(sanitized.imageWeight).toBe(2)
  })

  it('V7 的质量选项里没有 0.5', () => {
    const values = defaultValues(config.parameters, '6.1')
    values.quality = '0.5'

    const sanitized = sanitizeValues(config.parameters, values, '7')
    expect(sanitized.quality).toBe('1')
  })

  it('V6 的风格参考版本默认回到 4', () => {
    const values = defaultValues(config.parameters, '7')
    expect(values.styleVersion).toBe('6')

    const sanitized = sanitizeValues(config.parameters, values, '6.1')
    expect(sanitized.styleVersion).toBe('4')
  })
})
