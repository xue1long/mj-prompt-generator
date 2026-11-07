<template>
  <div class="prompt-panel">
    <div class="panel-header">
      <h3 class="panel-title">🎨 提示词库</h3>
      <p class="panel-description">点击标签添加提示词，鼠标悬停查看预览</p>
    </div>

    <n-spin :show="loading" description="加载中...">
      <div v-if="error" class="error-state">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{{ error }}</span>
        <n-button size="small" @click="handleRetry">重试</n-button>
      </div>

      <div v-else ref="tabsContainerRef" class="tabs-container">
        <!-- URL 里带了不支持的筛选参数时提示一次 -->
        <n-alert
          v-if="filterStore.ignored.length"
          type="warning"
          size="small"
          closable
          :bordered="false"
          class="ignored-alert"
          @close="filterStore.clearIgnored()"
        >
          已忽略不支持的筛选：{{ filterStore.ignored.join('、') }}
        </n-alert>

        <!-- Tab页结构：主体环境 + 各个一级分类 -->
        <n-tabs v-model:value="activeTab" type="line" animated>
          <!-- 第一个Tab：主体环境 -->
          <n-tab-pane name="subject-environment">
            <template #tab>
              <span class="tab-label">
                <span class="tab-icon">📝</span>
                <span class="tab-name">主体与环境</span>
              </span>
            </template>

            <!-- 主体环境输入区 -->
            <div class="subject-tab-content">
              <SubjectEnvironmentInput
                v-model="subjectEnvironmentValue"
                :examples="subjectEnvironmentExamples"
              />
            </div>
          </n-tab-pane>

          <!-- 其他Tab：各个分类 -->
          <n-tab-pane
            v-for="category in categories"
            :key="category.id"
            :name="category.id"
          >
            <template #tab>
              <span class="tab-label">
                <span class="tab-icon">{{ getIcon(category.icon) }}</span>
                <span class="tab-name">{{ category.name }}</span>
                <span class="tab-count">({{ getTotalPromptsCount(category) }})</span>
              </span>
            </template>

            <!-- 特殊提示（如艺术家的单选提示） -->
            <div v-if="category.special?.singleSelectionHint" class="category-hint">
              <n-alert type="info" size="small" :bordered="false">
                <template #icon>
                  <span>💡</span>
                </template>
                {{ category.special.singleSelectionHint }}
              </n-alert>
            </div>

            <!-- 艺术家分类带筛选条：4300 多条靠分类 tab 翻不动 -->
            <div v-if="canFilterCategory(category)" class="category-filter">
              <FilterBar
                :state="artistFilterState"
                :total="artistFilteredCount"
                :dimensions="artistDimensions"
                :groups="artistFacetGroups"
                :colours="artistFacetColours"
                :facet-coverage="styleStore.facetCoverage"
                placeholder="搜索艺术家名，例如 monet / puuung"
                @update:state="handleArtistFilterChange"
              />
            </div>

            <!-- 艺术家分类用卡片网格：4000 多条靠标签云翻不动，
                 卡片上有预览图和上游简介，才看得出"他是谁" -->
            <ArtistGrid
              v-if="category.id === ARTIST_CATEGORY_ID"
              :sub-categories="visibleSubCategories(category)"
              :category-id="category.id"
              :selected-prompts="selectedPromptsSet"
              :filter-state="artistFilterState"
              @toggle="handleTogglePrompt"
            />

            <!-- 其他分类：二级分类列表（标签云） -->
            <PromptSubCategoryList
              v-else
              :sub-categories="visibleSubCategories(category)"
              :prompts="category.prompts || []"
              :category-id="category.id"
              :selected-prompts="selectedPromptsSet"
              @toggle="handleTogglePrompt"
            />
          </n-tab-pane>

          <!-- Tab：风格参考码 -->
          <n-tab-pane name="style-library">
            <template #tab>
              <span class="tab-label">
                <span class="tab-icon">🎨</span>
                <span class="tab-name">风格参考码</span>
              </span>
            </template>

            <!-- 风格参考码内容 -->
            <StyleLibrary />
          </n-tab-pane>

          <!-- Tab：官方风格榜 -->
          <n-tab-pane name="styles-top">
            <template #tab>
              <span class="tab-label">
                <span class="tab-icon">🏆</span>
                <span class="tab-name">官方风格榜</span>
              </span>
            </template>

            <!-- 官方风格榜内容 -->
            <StylesTopLibrary />
          </n-tab-pane>

          <!-- 最后一个Tab：画廊 -->
          <n-tab-pane name="gallery">
            <template #tab>
              <span class="tab-label">
                <span class="tab-icon">🖼️</span>
                <span class="tab-name">画廊</span>
              </span>
            </template>

            <!-- 画廊内容 -->
            <PromptGallery />
          </n-tab-pane>
        </n-tabs>
      </div>

      <div v-if="!loading && !error && categories.length === 0" class="empty-state">
        <span class="empty-icon">📦</span>
        <span class="empty-text">暂无提示词配置</span>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, onBeforeUnmount } from 'vue'
import { NSpin, NButton, NTabs, NTabPane, NAlert } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { usePromptStore } from '@/stores/promptStore'
import { useFilterStore } from '@/stores/filterStore'
import { useStyleStore } from '@/stores/styleStore'
import { applyFilters, countIfEnabled, filterSubCategories, promptSearchText } from '@/utils/facetFilter'
import type { FilterContext } from '@/utils/facetFilter'
import type { PromptCategory as PromptCategoryType, PromptItem } from '@/types'
import SubjectEnvironmentInput from './SubjectEnvironmentInput.vue'
import PromptSubCategoryList from './PromptSubCategoryList.vue'
import ArtistGrid from './ArtistGrid.vue'
import PromptGallery from './PromptGallery.vue'
import StyleLibrary from './StyleLibrary.vue'
import StylesTopLibrary from './StylesTopLibrary.vue'
import FilterBar from './FilterBar.vue'
import type { FacetColour, FacetGroup, FilterDimension } from './FilterBar.vue'

const promptStore = usePromptStore()
const filterStore = useFilterStore()
const styleStore = useStyleStore()
const { loading, error, config, selectedPrompts, subjectEnvironment } = storeToRefs(promptStore)

/** 目前只有「艺术家/摄影师」这一个分类需要筛选条（4300+ 条靠分类 tab 翻不动） */
const ARTIST_CATEGORY_ID = 'artists'

// Tabs 容器引用
const tabsContainerRef = ref<HTMLElement | null>(null)

// 计算属性：获取所有分类
const categories = computed(() => {
  return config.value?.categories || []
})

// 计算属性：获取主体环境示例
const subjectEnvironmentExamples = computed(() => {
  return config.value?.subjectEnvironmentExamples || []
})

// 主体环境的双向绑定
const subjectEnvironmentValue = computed({
  get: () => subjectEnvironment.value,
  set: (value) => {
    promptStore.setSubjectEnvironment(value)
  }
})

// 计算属性：已选提示词 Set（用于快速查找）
const selectedPromptsSet = computed(() => {
  const set = new Set<string>()
  selectedPrompts.value.forEach(item => {
    set.add(item.promptId)
  })
  return set
})

// 获取图标emoji
const getIcon = (icon?: string) => {
  const iconMap: Record<string, string> = {
    'palette-outline': '🎨',
    'cube-outline': '🖼️',
    'sunny-outline': '💡',
    'sparkles-outline': '✨',
    'camera-outline': '📷',
    'person-outline': '👤',
    'timer-outline': '⏱️',
    'aperture-outline': '⚙️'
  }
  return icon ? iconMap[icon] || '📌' : '📌'
}

// 获取分类下的总提示词数量
const getTotalPromptsCount = (category: PromptCategoryType) => {
  if (category.subCategories && category.subCategories.length > 0) {
    return category.subCategories.reduce((sum, sub) => sum + sub.prompts.length, 0)
  }
  return category.prompts?.length || 0
}

// 处理提示词切换（添加/移除）
const handleTogglePrompt = (categoryId: string, promptId: string, subCategoryId?: string) => {
  promptStore.togglePrompt(categoryId, promptId, subCategoryId)
}

// ---- 筛选：hash 是唯一状态源，艺术家侧的筛选状态存在 filterStore 里 ----

/** 当前激活的 tab；与 n-tabs 双向绑定，并镜像到 URL hash */
const activeTab = ref('subject-environment')
/** 恢复完 hash 之前不许回写，否则会把深链冲掉 */
const hashReady = ref(false)

const artistFilterState = computed(() => filterStore.stateOf(ARTIST_CATEGORY_ID))

/** 合并后的艺术家条目（手写 + 风格库） */
const artistPrompts = computed(() => {
  const category = categories.value.find(item => item.id === ARTIST_CATEGORY_ID)
  return (category?.subCategories ?? []).flatMap(sub => sub.prompts)
})

/** 筛选上下文：搜索文本 + 分面词的组归属 */
const artistFilterContext = computed<FilterContext<PromptItem>>(() => ({
  textOf: promptSearchText,
  groupOfTerm: styleStore.groupOfTerm,
}))

/** 筛选后的条数（筛选条上的「N 条」） */
const artistFilteredCount = computed(
  () => applyFilters(artistPrompts.value, artistFilterState.value, artistFilterContext.value).length
)

/** 艺术家侧的布尔维度：只剩「只看实测」有真区分度（450/4323） */
const artistDimensions = computed<FilterDimension[]>(() => [
  {
    key: 'tested',
    label: '只看实测',
    count: countIfEnabled(
      artistPrompts.value,
      artistFilterState.value,
      artistFilterContext.value,
      'tested'
    ),
  },
])

/** 分面词面板（艺术家侧同样按「组内任一、组间全部」） */
const artistFacetGroups = computed<FacetGroup[]>(() =>
  styleStore.termGroups.map(group => ({
    id: group.id,
    name: group.name,
    terms: group.terms.map(term => ({
      slug: term.slug,
      label: term.label,
      count: countIfEnabled(
        artistPrompts.value,
        artistFilterState.value,
        artistFilterContext.value,
        'term',
        term.slug
      ),
    })),
  }))
)

/** 主色面板 */
const artistFacetColours = computed<FacetColour[]>(() =>
  styleStore.colours.map(colour => ({
    slug: colour.slug,
    name: colour.name,
    hex: colour.hex,
    count: countIfEnabled(
      artistPrompts.value,
      artistFilterState.value,
      artistFilterContext.value,
      'colour',
      colour.slug
    ),
  }))
)

function canFilterCategory(category: PromptCategoryType): boolean {
  return category.id === ARTIST_CATEGORY_ID
}

/** 艺术家分类按筛选收窄，其他分类原样返回 */
function visibleSubCategories(category: PromptCategoryType) {
  const subCategories = category.subCategories ?? []
  if (!canFilterCategory(category)) return subCategories
  return filterSubCategories(subCategories, artistFilterState.value, artistFilterContext.value)
}

function handleArtistFilterChange(next: typeof artistFilterState.value) {
  filterStore.setFilter(ARTIST_CATEGORY_ID, next)
}

/** hash → 筛选状态；命中可筛 tab 时一并切过去 */
function syncFromHash() {
  const tab = filterStore.applyFromHash(window.location.hash)
  if (tab) activeTab.value = tab
}

function handleHashChange() {
  if (!hashReady.value) return
  syncFromHash()
}

watch(activeTab, name => {
  if (!hashReady.value) return
  filterStore.setActiveTab(name)
})

// 重试加载
const handleRetry = () => {
  promptStore.loadConfig()
}

// 拖动滚动功能
let tabsNavElement: HTMLElement | null = null
let wrapperElement: HTMLElement | null = null
let isDragging = false
let startX = 0
let scrollLeft = 0

const handleMouseDown = (e: MouseEvent) => {
  if (!tabsNavElement || !wrapperElement) return

  // 只在标签栏区域响应
  const target = e.target as HTMLElement
  const isOnTab = target.closest('.n-tabs-tab') || target.closest('.n-tabs-nav-scroll-wrapper')

  if (!isOnTab) return

  isDragging = true
  startX = e.pageX
  scrollLeft = tabsNavElement.scrollLeft
  wrapperElement.style.cursor = 'grabbing'
  wrapperElement.style.userSelect = 'none'

  // 阻止默认的文本选择和点击行为
  e.preventDefault()
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging || !tabsNavElement) return
  e.preventDefault()

  const x = e.pageX
  const walk = (startX - x) * 2
  tabsNavElement.scrollLeft = scrollLeft + walk
}

const handleMouseUp = () => {
  if (!wrapperElement) return
  isDragging = false
  wrapperElement.style.cursor = 'grab'
  wrapperElement.style.userSelect = 'auto'
}

const handleMouseLeave = () => {
  if (!wrapperElement || !isDragging) return
  isDragging = false
  wrapperElement.style.cursor = 'grab'
  wrapperElement.style.userSelect = 'auto'
}

// 组件挂载时加载配置和设置拖动滚动
onMounted(() => {
  if (!config.value) {
    promptStore.loadConfig()
  }

  // hash 是筛选的唯一状态源：先恢复，再允许回写
  syncFromHash()
  hashReady.value = true
  window.addEventListener('hashchange', handleHashChange)

  // 设置拖动滚动功能
  setTimeout(() => {
    if (tabsContainerRef.value) {
      // 找到真正可以滚动的元素 v-x-scroll
      const scrollElement = tabsContainerRef.value.querySelector('.v-x-scroll') as HTMLElement
      const wrapper = tabsContainerRef.value.querySelector('.n-tabs-nav-scroll-wrapper') as HTMLElement

      if (scrollElement && wrapper) {
        // scrollElement 是真正滚动的元素
        tabsNavElement = scrollElement
        wrapperElement = wrapper

        // 设置 wrapper 的样式（显示拖动光标）
        wrapper.style.cursor = 'grab'

        // 在 wrapper 上监听鼠标按下事件
        wrapper.addEventListener('mousedown', handleMouseDown, { passive: false })
        wrapper.addEventListener('mouseleave', handleMouseLeave)

        // 在 document 上监听移动和松开事件
        document.addEventListener('mousemove', handleMouseMove, { passive: false })
        document.addEventListener('mouseup', handleMouseUp)
      }
    }
  }, 300)
})

// 组件卸载时清理事件监听器
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', handleHashChange)
  if (wrapperElement) {
    wrapperElement.removeEventListener('mousedown', handleMouseDown)
    wrapperElement.removeEventListener('mouseleave', handleMouseLeave)
  }
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})
</script>

<style scoped>
.prompt-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border-light);
}

.panel-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.panel-description {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
  text-align: right;
}

.tabs-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/*
 * n-spin 在内容外面套了两层包裹：.n-spin-container / .n-spin-content。
 * 它们是普通 block、高度 auto；作为 flex 子项时「自动最小尺寸 = 内容高度」，
 * 于是标签列表会把整张卡片撑到几千 px，超出部分被卡片的 overflow:hidden 裁掉，
 * 页签容器因此没有可滚动的溢出量（艺术家页一铺开就滚不动）。
 * 改成 flex 列 + min-height:0，把高度交回给页签容器，由它自己滚。
 */
.prompt-panel :deep(.n-spin-container),
.prompt-panel :deep(.n-spin-content) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.tabs-container :deep(.n-tabs) {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.tabs-container :deep(.n-tabs-nav) {
  flex-shrink: 0;
}

.tabs-container :deep(.n-tabs-nav-scroll-content) {
  transition: none;
}

.tabs-container :deep(.n-tabs-nav-scroll-wrapper) {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-color, rgba(0, 0, 0, 0.2)) transparent;
}

.tabs-container :deep(.n-tabs-nav-scroll-wrapper)::-webkit-scrollbar {
  height: 4px;
}

.tabs-container :deep(.n-tabs-nav-scroll-wrapper)::-webkit-scrollbar-thumb {
  background: var(--scrollbar-color, rgba(0, 0, 0, 0.2));
  border-radius: 2px;
}

.tabs-container :deep(.n-tabs-nav-scroll-wrapper)::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-container :deep(.n-tabs-tab) {
  padding: 8px 10px !important;
}

.tabs-container :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  overflow-y: auto;
  /*
   * n-tabs 开着 animated 时，切换页签会往容器上写内联 height/max-height 做高度过渡。
   * 我们的高度由 flex 决定、内容由容器自己滚，这组内联值只会把可视高度卡在
   * 测量那一刻的尺寸（图片还没加载时更小），所以压掉它。
   */
  height: auto !important;
  max-height: none !important;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.tab-icon {
  font-size: 15px;
}

.tab-name {
  font-weight: 500;
  white-space: nowrap;
}

.tab-count {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.category-hint {
  margin-bottom: 16px;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--error-color);
}

.error-icon {
  font-size: 48px;
  opacity: 0.8;
}

.error-text {
  font-size: 14px;
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
}

.subject-tab-content {
  padding: 16px 0;
}

/* URL 里被丢弃的筛选参数提示 */
.ignored-alert {
  margin-bottom: 8px;
}

/* 艺术家分类上方的筛选条 */
.category-filter {
  padding-top: 4px;
  /* 4300 多条要滚很久，筛选条吸在顶上，改条件时手不用往回挪 */
  position: sticky;
  top: 0;
  z-index: 3;
  /* 背景要盖住滚过去的内容：与卡片底色一致（亮色白、暗色 --bg-secondary）。
     不能用 var(--n-color)：那会被 tab 作用域的同名变量抢走，变成主色绿。 */
  background: var(--bg-primary);
  padding-bottom: 8px;
}

:global(.dark) .category-filter {
  background: var(--bg-secondary);
}

.subject-tab-content :deep(.subject-environment-input) {
  margin-bottom: 0;
  border: none;
}
</style>
