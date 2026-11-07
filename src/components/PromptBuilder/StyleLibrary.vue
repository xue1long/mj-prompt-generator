<template>
  <div class="style-library">
    <div class="library-header">
      <h3 class="library-title">🎨 风格参考码</h3>
      <p class="library-description">
        共 {{ codes.length }} 个风格参考码 · 选中即填进「风格参考」参数（<code>--sref</code>）
      </p>
    </div>

    <!-- 筛选（搜索 + 布尔维度 + 分面词 + 主色 + 已选条件条 + 条数） -->
    <FilterBar
      :state="filterState"
      :total="filteredCodes.length"
      :dimensions="dimensions"
      :groups="facetGroups"
      :colours="facetColours"
      :facet-coverage="styleStore.facetCoverage"
      placeholder="搜索风格名或码，例如 ghibli / 3383230063"
      @update:state="handleFilterChange"
    />

    <!-- 当前已填的 sref -->
    <div v-if="currentSref" class="current-sref">
      <span class="current-label">当前 --sref</span>
      <code class="current-value">{{ currentSref }}</code>
      <button class="link-btn" @click="clearSref">清除</button>
    </div>

    <div v-if="codes.length === 0" class="empty-state">
      <span class="empty-icon">📦</span>
      <span class="empty-text">风格库快照缺失，先跑 npm run build:styles 生成</span>
    </div>

    <div v-else-if="filteredCodes.length === 0" class="empty-state">
      <span class="empty-icon">🔍</span>
      <span class="empty-text">没有匹配的风格参考码</span>
    </div>

    <div v-else class="code-grid">
      <div v-for="item in visibleCodes" :key="item.id" class="code-card">
        <div class="thumb-wrapper">
          <img
            :src="imagePath(item)"
            :alt="item.name"
            class="code-image"
            loading="lazy"
            @error="handleImageError"
          />
          <div class="code-overlay">
            <span class="code-value">{{ item.code }}</span>
          </div>
        </div>
        <div class="code-meta">
          <div class="code-name" :title="item.name">{{ item.name }}</div>
          <div class="code-actions">
            <button class="action-btn primary" @click="fillSref(item)">填入 --sref</button>
            <button class="action-btn" @click="copyCode(item)">复制</button>
            <a class="source-link" :href="item.sourceUrl" target="_blank" rel="noopener">
              Midlibrary ↗
            </a>
          </div>
        </div>
      </div>
    </div>

    <button v-if="hiddenCount > 0" class="more-btn" @click="limit += PAGE_SIZE">
      显示更多（还有 {{ hiddenCount }} 条）
    </button>

    <p class="attribution">
      来源：
      <a href="https://midlibrary.io/library" target="_blank" rel="noopener">Midlibrary</a>
      · 站方书面许可：个人学习用途，署名 + 回链原站
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useStyleStore } from '@/stores/styleStore'
import { useParameterStore } from '@/stores/parameterStore'
import { useFilterStore } from '@/stores/filterStore'
import { applyFilters, codeSearchText, countIfEnabled } from '@/utils/facetFilter'
import type { FilterContext } from '@/utils/facetFilter'
import { getPreviewImagePath } from '@/utils'
import FilterBar from './FilterBar.vue'
import type { FacetColour, FacetGroup, FilterDimension } from './FilterBar.vue'
import type { StyleCode } from '@/types'

/** 一页显示多少张卡 */
const PAGE_SIZE = 120

/** 本组件在筛选注册表里的 tab 名（与 n-tabs 的 name 一致） */
const TAB = 'style-library'

const styleStore = useStyleStore()
const parameterStore = useParameterStore()
const filterStore = useFilterStore()
const message = useMessage()

const limit = ref(PAGE_SIZE)

onMounted(() => {
  if (!styleStore.config) {
    styleStore.loadConfig()
  }
})

const codes = computed<StyleCode[]>(() => styleStore.codes)

/** 筛选状态来自 filterStore（由 URL hash 驱动） */
const filterState = computed(() => filterStore.stateOf(TAB))

/** 筛选上下文：搜索文本 + 分面词的组归属 */
const filterContext = computed<FilterContext<StyleCode>>(() => ({
  textOf: codeSearchText,
  groupOfTerm: styleStore.groupOfTerm,
}))

/** 筛选结果 */
const filteredCodes = computed<StyleCode[]>(() =>
  applyFilters(codes.value, filterState.value, filterContext.value)
)

/** 两个布尔维度各自「再打开会得到多少条」 */
const dimensions = computed<FilterDimension[]>(() => [
  {
    key: 'pick',
    label: '编辑精选',
    count: countIfEnabled(codes.value, filterState.value, filterContext.value, 'pick'),
  },
  {
    key: 'tested',
    label: '只看实测',
    count: countIfEnabled(codes.value, filterState.value, filterContext.value, 'tested'),
  },
])

/** 分面词面板：每个词都带「选中会得到多少条」 */
const facetGroups = computed<FacetGroup[]>(() =>
  styleStore.termGroups.map(group => ({
    id: group.id,
    name: group.name,
    terms: group.terms.map(term => ({
      slug: term.slug,
      label: term.label,
      count: countIfEnabled(codes.value, filterState.value, filterContext.value, 'term', term.slug),
    })),
  }))
)

/** 主色面板 */
const facetColours = computed<FacetColour[]>(() =>
  styleStore.colours.map(colour => ({
    slug: colour.slug,
    name: colour.name,
    hex: colour.hex,
    count: countIfEnabled(codes.value, filterState.value, filterContext.value, 'colour', colour.slug),
  }))
)

const visibleCodes = computed(() => filteredCodes.value.slice(0, limit.value))
const hiddenCount = computed(() => Math.max(0, filteredCodes.value.length - limit.value))

/** 筛选条件变了就回到第一页 */
watch(filterState, () => {
  limit.value = PAGE_SIZE
})

function handleFilterChange(next: typeof filterState.value) {
  filterStore.setFilter(TAB, next)
}

/** 当前 --sref 的值 */
const currentSref = computed(() => {
  const value = parameterStore.getValue('styleRef')
  return typeof value === 'string' ? value : ''
})

function imagePath(item: StyleCode): string {
  return getPreviewImagePath(item.preview)
}

/** 缺图时回落到占位图 */
function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement
  target.src = getPreviewImagePath(undefined)
}

/** 把码填进「风格参考」参数 */
function fillSref(item: StyleCode) {
  parameterStore.setValue('styleRef', item.code)
  parameterStore.saveToLocalStorage()
  message.success(`已填入 --sref ${item.code}`)
}

function clearSref() {
  parameterStore.setValue('styleRef', '')
  parameterStore.saveToLocalStorage()
  message.info('已清除 --sref')
}

async function copyCode(item: StyleCode) {
  try {
    await navigator.clipboard.writeText(item.promptEn)
    message.success(`已复制 ${item.promptEn}`)
  } catch {
    message.error('复制失败，请手动选中')
  }
}
</script>

<style scoped>
.style-library {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 0;
}

.library-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border-light);
}

.library-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.library-description {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

.library-description code {
  font-family: monospace;
}

/* 当前 sref */
.current-sref {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  font-size: 12px;
}

.current-label {
  color: var(--text-tertiary);
}

.current-value {
  font-family: monospace;
  color: var(--text-primary);
}

.link-btn {
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

/* 卡片网格 */
.code-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.code-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tertiary);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.code-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--shadow-hover);
}

.thumb-wrapper {
  position: relative;
  width: 100%;
  padding-bottom: 100%;
  overflow: hidden;
  background: var(--bg-secondary);
}

.code-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.code-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 6px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
}

.code-value {
  font-family: monospace;
  font-size: 11px;
  color: #fff;
}

.code-meta {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.code-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.code-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.action-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: 4px;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}

.action-btn:hover {
  color: var(--text-primary);
  border-color: var(--primary-color);
}

.action-btn.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.source-link {
  font-size: 11px;
  color: var(--text-tertiary);
  text-decoration: none;
}

.source-link:hover {
  color: var(--primary-color);
}

/* 显示更多 */
.more-btn {
  align-self: center;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  padding: 6px 16px;
  cursor: pointer;
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
  font-size: 36px;
  opacity: 0.3;
}

.empty-text {
  font-size: 13px;
}

.attribution {
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--border-light);
}

.attribution a {
  color: var(--primary-color);
  text-decoration: none;
}

/* 暗色主题 */
:global(.dark) .search-input {
  background: rgba(30, 41, 59, 0.9);
  border-color: #334155;
  color: #f1f5f9;
}

:global(.dark) .library-header {
  border-bottom-color: var(--border-color);
}
</style>
