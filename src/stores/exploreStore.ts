import { defineStore } from 'pinia'
import type {
  ExploreAspect,
  ExploreBatch,
  ExploreConfig,
  ExploreJob,
  ExploreJobDecomposition,
} from '@/types'
import { getExploreConfig, getExploreDecomposedConfig } from '@/utils'
import {
  EMPTY_EXPLORE_FILTER,
  buildExploreHash,
  isExploreHash,
  parseExploreHash,
  type ExploreFilterState,
} from '@/utils/exploreHash'

/**
 * 探索榜状态。
 *
 * 探索榜是顶层独立页面（#/explore），不是提示词库里的一个页签，
 * 所以它自己持有一份筛选状态，并按自己的 hash 契约同步
 * （见 utils/exploreHash.ts 与 ADR-0013）。
 *
 * 粒度是**作业**不是成图：网格上一张卡就是一条作业（含它的四格），
 * 四格缩略图条在卡内切换，灯箱里再展开（见 ADR-0014）。
 *
 * 提示词结构分解是另一份生成物（ADR-0015），按 jobId 关联进来；
 * 缺失时 decompositionMap 为空，灯箱只显示原始提示词。
 */
interface ExploreState {
  /** 快照配置 */
  config: ExploreConfig | null
  /** 作业列表（网格直接用这个） */
  jobs: ExploreJob[]
  /** 提示词结构分解，按 jobId 索引 */
  decompositionMap: Record<string, ExploreJobDecomposition>
  /** 筛选状态 */
  filter: ExploreFilterState
  /** 被丢弃的 hash 参数（一次性提示用） */
  ignored: string[]
  /** 加载状态 */
  loading: boolean
  /** 从 hash 恢复期间不回写 hash（否则深链会被自己冲掉） */
  restoring: boolean
}

export const useExploreStore = defineStore('explore', {
  state: (): ExploreState => ({
    config: null,
    jobs: [],
    decompositionMap: {},
    filter: { ...EMPTY_EXPLORE_FILTER },
    ignored: [],
    loading: false,
    restoring: false,
  }),

  getters: {
    /** 快照里的批次（新到旧） */
    batches: (state): ExploreBatch[] => state.config?.batches ?? [],

    /** 快照里的宽高比 */
    aspects: (state): ExploreAspect[] => state.config?.aspects ?? [],

    /** 原站地址（署名与回链用） */
    sourceUrl: (state): string => state.config?.source.url ?? 'https://www.midjourney.com/explore?tab=top',

    /** 授权说明 */
    license: (state): string => state.config?.source.license ?? '',

    /** 快照生成时间 */
    generatedAt: (state): string => state.config?.source.generatedAt ?? '',

    /** 取某条作业的结构分解；没有则 null（灯箱优雅降级） */
    decompositionOf: (state) => (jobId: string): ExploreJobDecomposition | null =>
      state.decompositionMap[jobId] ?? null,

    /** 筛选后的作业 */
    filteredJobs: (state): ExploreJob[] => {
      const { batch, aspect, srefOnly, q } = state.filter
      const keyword = q.trim().toLowerCase()
      if (!batch && !aspect && !srefOnly && !keyword) return state.jobs
      return state.jobs.filter(job => {
        if (batch && job.batch !== batch) return false
        if (aspect && job.aspect !== aspect) return false
        if (srefOnly && !job.sref) return false
        if (keyword) {
          const haystack = `${job.prompt} ${job.author}`.toLowerCase()
          if (!haystack.includes(keyword)) return false
        }
        return true
      })
    },
  },

  actions: {
    /**
     * 加载探索榜快照与结构分解（都是构建期内联，没有生成过时为 null）。
     */
    async loadConfig() {
      if (this.config || this.loading) return
      this.loading = true
      try {
        const [config, decomposed] = await Promise.all([
          getExploreConfig(),
          getExploreDecomposedConfig(),
        ])
        this.config = config
        this.jobs = config?.jobs ?? []
        this.decompositionMap = Object.fromEntries(
          (decomposed?.jobs ?? []).map(item => [item.jobId, item])
        )
      } finally {
        this.loading = false
      }
    },

    /**
     * 从 hash 恢复筛选状态。
     * @returns 这个 hash 是不是探索榜页面
     */
    applyFromHash(hash: string): boolean {
      if (!isExploreHash(hash)) return false
      const parsed = parseExploreHash(hash)
      if (parsed.ignored.length) this.ignored = parsed.ignored
      this.restoring = true
      this.filter = parsed.state
      this.restoring = false
      return true
    },

    /** 改筛选条件 */
    setFilter(next: ExploreFilterState) {
      this.filter = { ...next }
      this.ignored = []
      this.syncHash()
    },

    /** 清空筛选 */
    resetFilter() {
      this.filter = { ...EMPTY_EXPLORE_FILTER }
      this.ignored = []
      this.syncHash()
    },

    /** 关掉「已忽略不支持的筛选」提示 */
    clearIgnored() {
      this.ignored = []
    },

    /** 把筛选状态写进 hash */
    syncHash() {
      if (this.restoring) return
      const hash = buildExploreHash(this.filter)
      if (hash === window.location.hash) return
      window.location.hash = hash
    },
  },
})
