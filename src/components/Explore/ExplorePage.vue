<template>
  <div class="explore-page">
    <header class="explore-header">
      <button class="back-btn" @click="goWorkbench">← 返回工作台</button>
      <div class="title-area">
        <h2 class="page-title">Midjourney 探索榜</h2>
        <span class="page-sub">社区作业 · {{ totalCount }} 条作业 · {{ batchCount }} 个批次</span>
      </div>
      <a class="source-link" :href="sourceUrl" target="_blank" rel="noopener noreferrer">
        Midjourney 探索榜 ↗
      </a>
    </header>

    <!-- 还没采集过数据 -->
    <div v-if="!config && !loading" class="empty-state">
      <span class="empty-icon">🗂</span>
      <span class="empty-text">还没有探索榜数据。运行 npm run collect:explore 采集一次。</span>
    </div>

    <template v-else>
      <ExploreFilters
        :filter="filter"
        :batches="batches"
        :aspects="aspects"
        :count="filteredJobs.length"
        @change="setFilter"
        @reset="resetFilter"
      />

      <div v-if="filteredJobs.length === 0" class="empty-state">
        <span class="empty-icon">🔍</span>
        <span class="empty-text">该条件下没有匹配的作业</span>
      </div>

      <div v-else class="explore-grid">
        <ExploreCard
          v-for="job in visibleJobs"
          :key="job.id"
          :job="job"
          @open="openLightbox"
        />
      </div>

      <button v-if="hiddenCount > 0" class="more-btn" @click="showMore">
        加载更多（还有 {{ hiddenCount }} 条作业）
      </button>

      <!-- 署名：许可条件是署名 + 回链（回链在右上角与灯箱里） -->
      <p class="attribution">
        成图与提示词来自 Midjourney 探索榜 · {{ license }} · 提示词短于 20 字符的作业未收录
        <template v-if="generatedAt"> · 数据更新于 {{ generatedAt.slice(0, 10) }}</template>
      </p>
    </template>

    <!-- 灯箱 -->
    <ExploreLightbox
      v-model:show="lightboxVisible"
      :job="currentJob"
      :source-url="sourceUrl"
      :initial-index="currentIndex"
      :decomposition="currentDecomposition"
      @fill-subject="handleFillSubject"
      @fill-sref="handleFillSref"
    />

    <!-- 主体与环境已有内容时：让用户自己决定覆盖还是追加 -->
    <n-modal
      v-model:show="conflictVisible"
      preset="card"
      :style="{ maxWidth: '440px', width: '92%' }"
      :bordered="false"
      title="主体与环境已有内容"
    >
      <p class="conflict-text">
        要把这条社区提示词<strong>覆盖</strong>到「主体与环境」，还是<strong>追加</strong>到后面？
      </p>
      <div class="conflict-actions">
        <button class="plain-btn" @click="applyAppend">追加到后面</button>
        <button class="primary-btn" @click="applyReplace">覆盖原有内容</button>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { NModal, useMessage } from 'naive-ui'
import { storeToRefs } from 'pinia'
import type { ExploreJob } from '@/types'
import { useExploreStore } from '@/stores/exploreStore'
import { usePromptStore } from '@/stores/promptStore'
import { useParameterStore } from '@/stores/parameterStore'
import { usePageStore } from '@/stores/pageStore'
import { isExploreHash, type ExploreFilterState } from '@/utils/exploreHash'
import ExploreCard from './ExploreCard.vue'
import ExploreFilters from './ExploreFilters.vue'
import ExploreLightbox from './ExploreLightbox.vue'

/** 一批显示多少条作业（一条作业含四格图，一次铺太多会把浏览器拖死） */
const PAGE_SIZE = 60

const exploreStore = useExploreStore()
const { config, jobs, filter, loading, batches, aspects, filteredJobs, sourceUrl, license, generatedAt } =
  storeToRefs(exploreStore)

const promptStore = usePromptStore()
const parameterStore = useParameterStore()
const pageStore = usePageStore()
const message = useMessage()

const totalCount = computed(() => jobs.value.length)
const batchCount = computed(() => batches.value.length)

/** ---- 筛选 ---- */
function setFilter(next: ExploreFilterState) {
  exploreStore.setFilter(next)
}

function resetFilter() {
  exploreStore.resetFilter()
}

/** ---- 分批显示 ---- */
const limit = ref(PAGE_SIZE)
const visibleJobs = computed(() => filteredJobs.value.slice(0, limit.value))
const hiddenCount = computed(() => Math.max(0, filteredJobs.value.length - limit.value))

function showMore() {
  limit.value += PAGE_SIZE
}

/** 筛选条件变了就回到第一批 */
watch(filteredJobs, () => {
  limit.value = PAGE_SIZE
})

/** ---- 灯箱 ---- */
const lightboxVisible = ref(false)
const currentJob = ref<ExploreJob | null>(null)
/** 从卡片点进来时看的是第几格 */
const currentIndex = ref(0)
/** 当前作业的结构分解（构建期预生成；没有则 null，灯箱只显示原始提示词） */
const currentDecomposition = computed(() =>
  currentJob.value ? exploreStore.decompositionOf(currentJob.value.id) : null
)

function openLightbox(job: ExploreJob, index: number) {
  currentJob.value = job
  currentIndex.value = index
  lightboxVisible.value = true
}

/** ---- 填入主体与环境 ---- */
const conflictVisible = ref(false)
const pendingJob = ref<ExploreJob | null>(null)

function handleFillSubject(job: ExploreJob) {
  const current = promptStore.subjectEnvironment.trim()
  // 空着就直接填；已有内容才问（覆盖还是追加由用户决定）
  if (!current) {
    promptStore.setSubjectEnvironment(job.prompt)
    message.success('已填入主体与环境')
    return
  }
  pendingJob.value = job
  conflictVisible.value = true
}

function applyReplace() {
  if (!pendingJob.value) return
  promptStore.setSubjectEnvironment(pendingJob.value.prompt)
  conflictVisible.value = false
  pendingJob.value = null
  message.success('已覆盖主体与环境')
}

function applyAppend() {
  if (!pendingJob.value) return
  const current = promptStore.subjectEnvironment.trim()
  promptStore.setSubjectEnvironment(`${current}\n\n${pendingJob.value.prompt}`)
  conflictVisible.value = false
  pendingJob.value = null
  message.success('已追加到主体与环境')
}

/** ---- 填入 --sref ---- */
function handleFillSref(code: string) {
  parameterStore.setValue('styleRef', code)
  parameterStore.saveToLocalStorage()
  message.success(`已填入 --sref ${code}`)
}

/** ---- hash 与页面 ---- */
function goWorkbench() {
  pageStore.goWorkbench()
}

function onHashChange() {
  if (!isExploreHash(window.location.hash)) return
  exploreStore.applyFromHash(window.location.hash)
}

onMounted(() => {
  exploreStore.loadConfig()
  exploreStore.applyFromHash(window.location.hash)
  window.addEventListener('hashchange', onHashChange)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', onHashChange)
})
</script>

<style scoped>
.explore-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px 40px;
}

.explore-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.back-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  padding: 6px 12px;
  cursor: pointer;
}

.back-btn:hover {
  color: var(--text-primary);
  border-color: var(--primary-color);
}

.title-area {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.page-sub {
  font-size: 12px;
  color: var(--text-tertiary);
}

.source-link {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
  text-decoration: none;
}

.source-link:hover {
  color: var(--primary-color);
}

/* 作业网格：一张卡 = 一条作业（含它的四格） */
.explore-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  align-items: start;
}

.more-btn {
  align-self: center;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  padding: 6px 14px;
  cursor: pointer;
}

.more-btn:hover {
  color: var(--text-primary);
  border-color: var(--primary-color);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 32px;
  opacity: 0.3;
}

.empty-text {
  font-size: 13px;
}

/* 署名 */
.attribution {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-light);
  font-size: 11px;
  color: var(--text-tertiary);
}

.conflict-text {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}

.conflict-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.primary-btn {
  border: 1px solid var(--primary-color);
  background: var(--primary-color);
  color: var(--text-primary);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  cursor: pointer;
}

.plain-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  padding: 6px 12px;
  cursor: pointer;
}
</style>
