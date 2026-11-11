import type { Parameter, ParameterValues, SelectOption } from '../types'

/**
 * 参数与模型版本的兼容关系。
 *
 * 兼容关系是数据（写在 config/parameters.yaml 的 versions / optionsByVersion /
 * defaultByVersion / rangeByVersion 字段里），不是代码里的硬编码矩阵。
 */

/** 该参数在给定模型版本下是否可用 */
export function isSupportedByVersion(param: Parameter, version?: string): boolean {
  if (!param.versions || param.versions.length === 0) return true
  if (!version) return true
  return param.versions.includes(version)
}

/** 给定模型版本下，该参数的下拉选项 */
export function effectiveOptions(param: Parameter, version?: string): SelectOption[] {
  if (param.type !== 'select') return []
  if (version && param.optionsByVersion && param.optionsByVersion[version]) {
    return param.optionsByVersion[version]
  }
  return param.options
}

/** 给定模型版本下，该参数的默认值 */
export function effectiveDefault(param: Parameter, version?: string): string | number | boolean {
  if (param.type === 'select') {
    if (version && param.defaultByVersion && param.defaultByVersion[version] !== undefined) {
      return param.defaultByVersion[version]
    }
  }
  return param.default
}

/** 给定模型版本下，滑块的取值范围 */
export function effectiveRange(
  param: Parameter,
  version?: string
): { min: number; max: number; step: number } {
  if (param.type !== 'slider') {
    return { min: 0, max: 100, step: 1 }
  }
  const override = version && param.rangeByVersion ? param.rangeByVersion[version] : undefined
  if (override) {
    return {
      min: override.min,
      max: override.max,
      step: override.step ?? param.step,
    }
  }
  return { min: param.min, max: param.max, step: param.step }
}

/**
 * 依据模型版本清洗参数值：
 *  - 当前版本不支持的参数 -> 回到默认值
 *  - 下拉选项在当前版本下已不存在 -> 回到默认值
 *  - 滑块值超出当前版本范围 -> 收敛到范围内
 */
export function sanitizeValues(
  parameters: Parameter[],
  values: ParameterValues,
  version?: string
): ParameterValues {
  const result: ParameterValues = { ...values }

  for (const param of parameters) {
    if (!isSupportedByVersion(param, version)) {
      result[param.id] = effectiveDefault(param, version)
      continue
    }

    if (param.type === 'select') {
      const options = effectiveOptions(param, version)
      const current = String(result[param.id] ?? '')
      const stillValid = options.some(option => option.value === current)
      if (!stillValid) {
        result[param.id] = effectiveDefault(param, version)
      }
      continue
    }

    if (param.type === 'slider') {
      const range = effectiveRange(param, version)
      const current = Number(result[param.id])
      if (Number.isNaN(current)) {
        result[param.id] = effectiveDefault(param, version)
      } else if (current < range.min || current > range.max) {
        result[param.id] = Math.min(Math.max(current, range.min), range.max)
      }
      continue
    }

    if (result[param.id] === undefined) {
      result[param.id] = effectiveDefault(param, version)
    }
  }

  return result
}

/** 生成一份以当前版本为准的默认参数值 */
export function defaultValues(parameters: Parameter[], version?: string): ParameterValues {
  const values: ParameterValues = {}
  for (const param of parameters) {
    // 版本参数的值就是版本本身，不是"按该版本查出来的默认值"
    if (param.id === 'version') {
      values[param.id] = String(version ?? param.default)
      continue
    }
    values[param.id] = effectiveDefault(param, version)
  }
  return values
}

/**
 * 当前版本下不可用的参数清单，用于在界面上说明原因。
 */
export function unsupportedParameters(
  parameters: Parameter[],
  version?: string
): Parameter[] {
  return parameters.filter(param => !isSupportedByVersion(param, version))
}
