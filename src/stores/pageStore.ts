import { defineStore } from 'pinia'
import { buildExploreHash, isExploreHash } from '@/utils/exploreHash'
import { useExploreStore } from './exploreStore'
import { useFilterStore } from './filterStore'

/**
 * 顶层页面状态。
 *
 * 本项目没有路由，页面由 URL hash 的路径段决定：
 * - `#/artists`、`#/style-codes` 等是提示词库里的页签（工作台）；
 * - `#/explore` 是探索榜这个**顶层独立页面**（见 ADR-0013）。
 */
export type AppPage = 'workbench' | 'explore'

export const usePageStore = defineStore('page', {
  state: (): { current: AppPage } => ({
    current: 'workbench',
  }),

  getters: {
    /** 当前是不是探索榜页面 */
    isExplore: (state): boolean => state.current === 'explore',
  },

  actions: {
    /** 按当前 hash 同步页面（hash 变化时调用） */
    syncFromHash() {
      this.current = isExploreHash(window.location.hash) ? 'explore' : 'workbench'
    },

    /** 去探索榜（带上当前的探索榜筛选） */
    goExplore() {
      const exploreStore = useExploreStore()
      window.location.hash = buildExploreHash(exploreStore.filter)
      this.current = 'explore'
    },

    /** 回工作台（把提示词库当前页签的筛选写回 hash） */
    goWorkbench() {
      const filterStore = useFilterStore()
      filterStore.syncHash()
      this.current = 'workbench'
    },
  },
})
