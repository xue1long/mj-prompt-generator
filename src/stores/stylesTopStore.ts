import { defineStore } from 'pinia'
import type { StylesTopConfig, StylesTopEntry, StylesTopKind } from '@/types'
import { getStylesTopConfig } from '@/utils'

interface StylesTopState {
  /** 官方风格榜配置（生成物 config/styles-top.yaml） */
  config: StylesTopConfig | null
  /** 加载状态 */
  loading: boolean
  /** 错误信息 */
  error: string | null
}

export const useStylesTopStore = defineStore('stylesTop', {
  state: (): StylesTopState => ({
    config: null,
    loading: false,
    error: null,
  }),

  getters: {
    /** 风格码条目 */
    entries: (state): StylesTopEntry[] => state.config?.entries ?? [],

    /** 题材（8 种） */
    kinds: (state): StylesTopKind[] => state.config?.kinds ?? [],

    /** 数据来源与授权说明 */
    source: (state): StylesTopConfig['source'] | null => state.config?.source ?? null,

    /** 是否已经加载到官方风格榜 */
    hasStylesTop: (state): boolean => (state.config?.entries?.length ?? 0) > 0,
  },

  actions: {
    /**
     * 加载官方风格榜配置。
     * 生成物，没生成时不算错误——只是没有这个 tab 的内容。
     */
    async loadConfig() {
      this.loading = true
      this.error = null
      try {
        this.config = await getStylesTopConfig()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载官方风格榜失败'
        console.error('Failed to load styles-top config:', error)
      } finally {
        this.loading = false
      }
    },
  },
})
