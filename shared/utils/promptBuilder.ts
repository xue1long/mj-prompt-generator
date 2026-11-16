import type {
  Parameter,
  ParameterValues,
  ParametersConfig,
  SelectOption,
  SelectedPrompt,
} from '../types'
import { isSupportedByVersion } from './parameterCompat'

/**
 * 提示词构建器
 *
 * 组装顺序固定：摄影前缀 -> 机位 -> 主体与环境 -> 光线 -> 其他 -> 参数。
 * 参数部分由 config/parameters.yaml 驱动：参数名、取值、哪些版本可用，
 * 都在数据里，代码不再硬编码任何 Midjourney 参数。
 */
export class PromptBuilder {
  /**
   * 摄影专用提示词构建
   * @param selectedPrompts 已选择的提示词列表（包含位置标签）
   * @param subjectEnvironment 主体与环境描述
   * @param parameters 参数值
   * @param config 参数配置（决定参数名、取值与版本兼容关系）
   * @param photoPrefix 摄影前缀基词（ADR-0027）；留空则不带开头段
   * @returns 完整的提示词字符串
   */
  static buildPhotography(
    selectedPrompts: SelectedPrompt[],
    subjectEnvironment: string,
    parameters: ParameterValues,
    config?: ParametersConfig,
    photoPrefix: string = 'photography'
  ): string {
    // 1. 按位置标签分组（按选中顺序）
    const groups = this.groupPromptsByPosition(selectedPrompts)

    // 2. 构建摄影前缀（ADR-0027）：基词由会话配置，留空时整段消失
    const artists = groups.artist.map(p => p.text)
    const base = String(photoPrefix ?? '').trim()
    const photographyPrefix = base
      ? (artists.length > 0 ? `${base} by ${artists.join(', ')}` : base)
      : artists.join(', ')

    // 3. 组合各部分（按固定顺序）
    const parts: string[] = [photographyPrefix]

    if (groups.camera.length > 0) {
      parts.push(groups.camera.map(p => p.text).join(', '))
    }

    const trimmedSubject = subjectEnvironment.trim()
    if (trimmedSubject) {
      parts.push(trimmedSubject)
    }

    if (groups.lighting.length > 0) {
      parts.push(groups.lighting.map(p => p.text).join(', '))
    }

    if (groups.other.length > 0) {
      parts.push(groups.other.map(p => p.text).join(', '))
    }

    const promptText = parts.filter(p => p).join(', ')

    // 4. 添加参数
    return this.addParameters(promptText, parameters, config)
  }

  /**
   * 按位置标签分组提示词
   * @param prompts 已选择的提示词列表
   * @returns 按位置分组的提示词
   */
  private static groupPromptsByPosition(
    prompts: SelectedPrompt[]
  ): Record<string, SelectedPrompt[]> {
    const groups: Record<string, SelectedPrompt[]> = {
      artist: [],
      camera: [],
      lighting: [],
      other: [],
    }

    // 复制一份再排序，避免在只读上下文里改动 store 状态
    ;[...prompts]
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach(prompt => {
        const tag = prompt.positionTag || 'other'
        if (tag in groups) {
          groups[tag].push(prompt)
        } else {
          groups.other.push(prompt)
        }
      })

    return groups
  }

  /**
   * 添加参数到提示词
   * @param promptText 基础提示词文本
   * @param parameters 参数值
   * @param config 参数配置
   * @returns 带参数的完整提示词
   */
  static addParameters(
    promptText: string,
    parameters: ParameterValues,
    config?: ParametersConfig
  ): string {
    const params: string[] = []

    if (config) {
      const version = parameters.version ? String(parameters.version) : undefined
      for (const param of config.parameters) {
        const emitted = this.emitParameter(param, parameters, version)
        if (emitted) params.push(emitted)
      }
    }

    if (params.length > 0) {
      return `${promptText} ${params.join(' ')}`
    }
    return promptText
  }

  /**
   * 把单个参数转成命令行片段
   * @param param 参数配置
   * @param values 参数值
   * @param version 当前模型版本
   * @returns 参数片段；不适用时返回 null
   */
  private static emitParameter(
    param: Parameter,
    values: ParameterValues,
    version?: string
  ): string | null {
    // 当前模型版本不支持该参数 -> 不输出
    if (!isSupportedByVersion(param, version)) return null

    const raw = values[param.id]
    if (raw === undefined || raw === null) return null

    const isDefault = this.isDefaultValue(param, raw)

    if (param.type === 'checkbox') {
      return raw === true ? param.param : null
    }

    if (param.type === 'select') {
      const value = String(raw)
      const option = this.findOption(param.options, value)
      const flag = option?.param || param.param

      // 选项值本身就是参数名，如 --hd / --sd
      if (param.flagFromValue) {
        if (isDefault && !param.alwaysEmit) return null
        return `--${value}`
      }

      if (value === '' && !param.alwaysEmit) return null

      // 选项级覆盖，如 --fast 只输出参数名
      if (option?.flagOnly || param.flagOnly) {
        return flag || null
      }

      const outValue = option?.paramValue ?? value
      if (outValue === '') return null
      if (!flag) return null
      if (isDefault && !param.alwaysEmit) return null
      return `${flag} ${outValue}`
    }

    if (param.type === 'slider') {
      const value = Number(raw)
      if (Number.isNaN(value)) return null
      if (isDefault && !param.alwaysEmit) return null
      return `${param.param} ${value}`
    }

    // input
    const value = String(raw).trim()
    if (!value) return null
    if (isDefault && !param.alwaysEmit) return null
    return `${param.param} ${value}`
  }

  /** 找出与取值匹配的选项 */
  private static findOption(
    options: SelectOption[] | undefined,
    value: string
  ): SelectOption | undefined {
    return options?.find(option => option.value === value)
  }

  /** 取值是否等于默认值（用于决定是否省略参数） */
  private static isDefaultValue(param: Parameter, value: unknown): boolean {
    return String(value) === String(param.default)
  }

  /**
   * 验证提示词是否有效
   * @param prompt 提示词字符串
   * @returns 是否有效
   */
  static isValid(prompt: string): boolean {
    return prompt.trim().length > 0
  }
}
