/**
 * 参数相关类型定义
 */

/** 参数类型 */
export type ParameterType = 'select' | 'slider' | 'input' | 'checkbox'

/** 选择器选项 */
export interface SelectOption {
  value: string
  label: string
  /** 覆盖该选项的参数名（如 --niji） */
  param?: string
  /** 覆盖该选项的参数值（如 niji-7 -> 7） */
  paramValue?: string
  /** 只输出参数名、不带值（如 --fast） */
  flagOnly?: boolean
}

/** 参数基础配置 */
export interface BaseParameter {
  /** 参数ID */
  id: string
  /** 参数名称 */
  name: string
  /** 参数类型 */
  type: ParameterType
  /** Midjourney 参数名（如 --v, --ar 等） */
  param: string
  /** 默认值 */
  default: string | number | boolean
  /** 描述 */
  description?: string
  /** 该参数在哪些模型版本下有效；缺省表示在所有版本下有效 */
  versions?: string[]
  /** 即使取默认值也照常输出 */
  alwaysEmit?: boolean
  /** 只输出参数名、不带值（如 --raw） */
  flagOnly?: boolean
  /** 把选项值本身当作参数名（如 --hd） */
  flagFromValue?: boolean
}

/** 选择器参数 */
export interface SelectParameter extends BaseParameter {
  type: 'select'
  options: SelectOption[]
  default: string
  /** 按模型版本覆盖选项 */
  optionsByVersion?: Record<string, SelectOption[]>
  /** 按模型版本覆盖默认值 */
  defaultByVersion?: Record<string, string>
}

/** 滑块参数 */
export interface SliderParameter extends BaseParameter {
  type: 'slider'
  min: number
  max: number
  step: number
  default: number
  /** 按模型版本覆盖范围 */
  rangeByVersion?: Record<string, { min: number; max: number; step?: number }>
}

/** 输入框参数 */
export interface InputParameter extends BaseParameter {
  type: 'input'
  placeholder?: string
  default: string
}

/** 复选框参数 */
export interface CheckboxParameter extends BaseParameter {
  type: 'checkbox'
  label?: string
  default: boolean
}

/** 参数联合类型 */
export type Parameter = SelectParameter | SliderParameter | InputParameter | CheckboxParameter

/** 参数配置文件结构 */
export interface ParametersConfig {
  parameters: Parameter[]
}

/** 参数值映射 */
export interface ParameterValues {
  /** 模型版本（决定哪些参数有效） */
  version?: string
  [key: string]: any
}
