import { defineStore } from 'pinia'
import { EMPTY_FILTER, type FilterState } from '@/utils/facetFilter'
import { buildFilterHash, isFilterTab, parseFilterHash } from '@/utils/filterHash'

/**
 * 筛选状态。
 *
 * 两个可筛 tab（艺术家 / 风格参考码）各持一份状态，互不干扰；
 * 当前激活 tab 的筛选状态同步到 URL hash——hash 是筛选的唯一状态源，
 * localStorage 只留给会话（已选提示词、主体环境、参数值）。
 */
interface FilterStoreState {
  /** 当前激活的 tab（与 n-tabs 的 name 一致） */
  activeTab: string
  /** 各可筛 tab 的筛选状态 */
  filters: Record<string, FilterState>
  /** 上一次从 hash 里丢弃的参数名（用于提示，不参与筛选） */
  ignored: string[]
}

export const useFilterStore = defineStore('filter', {
  state: (): FilterStoreState => ({
    activeTab: 'subject-environment',
    filters: {
      artists: { ...EMPTY_FILTER },
      'style-library': { ...EMPTY_FILTER },
    },
    ignored: [],
  }),

  getters: {
    /** 艺术家侧的筛选状态 */
    artists: (state): FilterState => state.filters.artists ?? EMPTY_FILTER,

    /** 风格参考码侧的筛选状态 */
    codes: (state): FilterState => state.filters['style-library'] ?? EMPTY_FILTER,
  },

  actions: {
    /** 取某个 tab 的筛选状态 */
    stateOf(tab: string): FilterState {
      return this.filters[tab] ?? EMPTY_FILTER
    },

    /**
     * 从 hash 恢复筛选状态。
     * @returns 命中的可筛 tab；没有命中返回 null
     */
    applyFromHash(hash: string): string | null {
      const parsed = parseFilterHash(hash)
      // 提示是一次性的：URL 被修正后不再带着非法参数，
      // 所以这里只在有被丢弃的参数时覆盖，否则保留上一次的提示
      if (parsed.ignored.length) this.ignored = parsed.ignored
      if (!parsed.tab) return null
      this.filters[parsed.tab] = parsed.state
      this.activeTab = parsed.tab
      return parsed.tab
    },

    /** 关掉「已忽略不支持的筛选」提示 */
    clearIgnored() {
      this.ignored = []
    },

    /**
     * 切换 tab：记录并同步 hash。
     * 这里**不清**「已忽略的筛选参数」——从 hash 恢复时切 tab 也会走到这里，
     * 清了就等于刚提示完就自己抹掉。清理由关闭提示、改筛选或重置负责。
     */
    setActiveTab(tab: string) {
      this.activeTab = tab
      this.syncHash()
    },

    /** 改筛选条件（整体替换该 tab 的状态） */
    setFilter(tab: string, next: FilterState) {
      this.filters[tab] = { ...next }
      this.ignored = []
      if (this.activeTab === tab) this.syncHash()
    },

    /** 清空某个 tab 的筛选 */
    resetFilter(tab: string) {
      this.filters[tab] = { ...EMPTY_FILTER }
      this.ignored = []
      if (this.activeTab === tab) this.syncHash()
    },

    /**
     * 把当前 tab 的筛选写进 hash。
     * 不能筛的 tab 把筛选相关的 hash 清掉（否则刷新会跳回可筛 tab）。
     */
    syncHash() {
      const hash = buildFilterHash(this.activeTab, this.stateOf(this.activeTab))
      if (hash === window.location.hash) return
      if (!hash) {
        if (window.location.hash) window.location.hash = ''
        return
      }
      window.location.hash = hash
    },

    /** 该 tab 是否可筛 */
    canFilter(tab: string): boolean {
      return isFilterTab(tab)
    },
  },
})
