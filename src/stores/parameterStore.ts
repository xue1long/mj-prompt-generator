import { defineStore } from 'pinia'
import type { ParametersConfig, Parameter, ParameterValues } from '@/types'
import { getParametersConfig } from '@/utils'
import { defaultValues, sanitizeValues } from '@/utils/parameterCompat'
import { loadSession, updateSession } from '@/utils/sessionPersistence'

interface ParameterState {
  /** 参数配置 */
  config: ParametersConfig | null
  /** 参数值 */
  values: ParameterValues
  /** 加载状态 */
  loading: boolean
  /** 错误信息 */
  error: string | null
}

export const useParameterStore = defineStore('parameter', {
  state: (): ParameterState => ({
    config: null,
    values: {},
    loading: false,
    error: null,
  }),

  getters: {
    /**
     * 获取所有参数配置
     */
    parameters: (state): Parameter[] => {
      return state.config?.parameters || []
    },

    /**
     * 根据ID获取参数
     */
    getParameterById: (state) => {
      return (id: string): Parameter | undefined => {
        return state.config?.parameters.find(p => p.id === id)
      }
    },

    /**
     * 获取参数值
     */
    getValue: (state) => {
      return (id: string): any => {
        const param = state.config?.parameters.find(p => p.id === id)
        return state.values[id] ?? param?.default
      }
    },

    /**
     * 当前模型版本
     */
    currentVersion: (state): string | undefined => {
      const version = state.values.version
      return version === undefined || version === '' ? undefined : String(version)
    },
  },

  actions: {
    /**
     * 加载参数配置
     */
    async loadConfig() {
      this.loading = true
      this.error = null
      try {
        this.config = await getParametersConfig()
        this.initializeValues()
        this.loadFromLocalStorage()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载参数配置失败'
        console.error('Failed to load parameters config:', error)
      } finally {
        this.loading = false
      }
    },

    /**
     * 初始化参数值为默认值（按当前模型版本）
     */
    initializeValues() {
      if (!this.config) return
      const version = String(this.config.parameters.find(p => p.id === 'version')?.default ?? '')
      this.values = defaultValues(this.config.parameters, version || undefined)
    },

    /**
     * 设置参数值
     */
    setValue(id: string, value: any) {
      this.values[id] = value
    },

    /**
     * 切换模型版本，并按新版本清洗其他参数
     */
    setVersion(version: string) {
      this.values.version = version
      if (this.config) {
        this.values = sanitizeValues(this.config.parameters, this.values, version)
      }
      this.saveToLocalStorage()
    },

    /**
     * 重置单个参数到默认值
     */
    resetParameter(id: string) {
      const param = this.getParameterById(id)
      if (param) {
        this.values[id] = param.default
      }
    },

    /**
     * 重置所有参数到默认值
     */
    resetAll() {
      this.initializeValues()
      this.saveToLocalStorage()
    },

    /**
     * 重置所有参数到默认值（别名）
     */
    resetToDefaults() {
      this.resetAll()
    },

    /**
     * 从 localStorage 恢复参数值
     */
    loadFromLocalStorage() {
      const session = loadSession()
      if (!session || !Object.keys(session.parameterValues).length) return

      try {
        this.values = { ...this.values, ...session.parameterValues }
        if (this.config && this.values.version) {
          this.values = sanitizeValues(
            this.config.parameters,
            this.values,
            String(this.values.version)
          )
        }
      } catch (error) {
        console.error('Failed to load parameters from localStorage:', error)
      }
    },

    /**
     * 保存参数值到 localStorage
     */
    saveToLocalStorage() {
      updateSession({ parameterValues: { ...this.values } })
    },
  },
})
