import { defineStore } from 'pinia'
import type {
  StyleArtist,
  StyleCode,
  StyleCategory,
  StyleColour,
  StyleTermGroup,
  StylesConfig,
} from '@/types'
import { getStylesConfig } from '@/utils'

interface StyleState {
  /** 风格库配置（生成物 config/styles.yaml） */
  config: StylesConfig | null
  /** 加载状态 */
  loading: boolean
  /** 错误信息 */
  error: string | null
}

export const useStyleStore = defineStore('style', {
  state: (): StyleState => ({
    config: null,
    loading: false,
    error: null,
  }),

  getters: {
    /** 风格条目（艺术家） */
    artists: (state): StyleArtist[] => state.config?.artists ?? [],

    /** 风格参考码 */
    codes: (state): StyleCode[] => state.config?.codes ?? [],

    /** 画师类目 */
    categories: (state): StyleCategory[] => state.config?.categories ?? [],

    /** 分面词组（组内任一、组间全部） */
    termGroups: (state): StyleTermGroup[] => state.config?.termGroups ?? [],

    /** 主色 */
    colours: (state): StyleColour[] => state.config?.colours ?? [],

    /** 有分面数据的条目占比 */
    facetCoverage: (state): number => state.config?.source?.facetCoverage ?? 0,

    /**
     * 分面词 slug → 组 id 的查表函数。
     * 组 id 在配置上是稳定的，所以这个闭包只在配置变化时重建一次。
     */
    groupOfTerm: (state) => {
      const index = new Map<string, string>()
      for (const group of state.config?.termGroups ?? []) {
        for (const term of group.terms) index.set(term.slug, group.id)
      }
      return (slug: string): string | undefined => index.get(slug)
    },

    /** 数据来源与授权说明（署名与回链要用） */
    source: (state): StylesConfig['source'] | null => state.config?.source ?? null,

    /** 是否已经加载到风格库 */
    hasStyles: (state): boolean => (state.config?.artists?.length ?? 0) > 0,
  },

  actions: {
    /**
     * 加载风格库配置。
     * 风格库是生成物，没生成时不算错误——只是没有这个 tab 的内容。
     */
    async loadConfig() {
      this.loading = true
      this.error = null
      try {
        this.config = await getStylesConfig()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载风格库失败'
        console.error('Failed to load styles config:', error)
      } finally {
        this.loading = false
      }
    },
  },
})
