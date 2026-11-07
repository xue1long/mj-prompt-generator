<template>
  <n-config-provider :theme="theme">
    <n-message-provider>
      <div class="app-container">
        <AppHeader />
        <main class="main-content">
          <!-- 探索榜是顶层独立页面：占满整屏，不显示左栏 -->
          <ExplorePage v-if="page === 'explore'" />
          <div v-else class="content-grid" :style="splitStyle">
            <!-- 左栏：已选提示词 + 最终提示词 + 参数设置（可折叠） -->
            <section class="left-panel panel">
              <n-card title="✨ 已选提示词" size="small" :bordered="false" class="selected-card">
                <SelectedPrompts
                  :selected-prompts="selectedPrompts"
                  @remove="handleRemovePrompt"
                  @reorder="handleReorderPrompt"
                />
              </n-card>

              <n-card title="🎯 最终提示词" size="small" :bordered="false" class="result-card">
                <FinalPrompt />
              </n-card>

              <ParameterSection />
            </section>

            <!-- 分割条：拖动可调整左右栏宽度 -->
            <ColumnSplitter
              :ratio="splitRatio"
              @update:ratio="setSplitRatio"
              @commit="commitSplit"
            />

            <!-- 右栏：提示词库 -->
            <section class="right-panel panel">
              <n-card size="small" :bordered="false" class="prompt-panel-card">
                <PromptPanel />
              </n-card>
            </section>
          </div>
        </main>
        <AppFooter />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NCard } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from './stores/themeStore'
import { usePromptStore } from './stores/promptStore'
import { useParameterStore } from './stores/parameterStore'
import { useStyleStore } from './stores/styleStore'
import { useStylesTopStore } from './stores/stylesTopStore'
import { usePageStore } from './stores/pageStore'
import AppHeader from './components/Layout/AppHeader.vue'
import AppFooter from './components/Layout/AppFooter.vue'
import ColumnSplitter from './components/Layout/ColumnSplitter.vue'
import PromptPanel from './components/PromptBuilder/PromptPanel.vue'
import SelectedPrompts from './components/PromptBuilder/SelectedPrompts.vue'
import ParameterSection from './components/ParameterPanel/ParameterSection.vue'
import FinalPrompt from './components/ResultPanel/FinalPrompt.vue'
import ExplorePage from './components/Explore/ExplorePage.vue'

const themeStore = useThemeStore()
const theme = computed(() => themeStore.naiveTheme)

const promptStore = usePromptStore()
const { selectedPrompts } = storeToRefs(promptStore)

/**
 * 参数配置的加载放在这里，而不是参数面板内部。
 * 参数值是全局数据：面板折叠、隐藏甚至没渲染时，右侧最终提示词仍然要用它组装，
 * 所以加载不能依附于"面板恰好被渲染出来"。
 */
const parameterStore = useParameterStore()

/**
 * 风格库配置同理：艺术家页的卡片要读主色表（主色角标），
 * 而风格参考码页签可能一直没被打开过——不能把加载挂在那个页签上。
 */
const styleStore = useStyleStore()
const stylesTopStore = useStylesTopStore()

/**
 * 顶层页面：工作台（提示词库）与探索榜（独立页）。
 * 页面由 URL hash 的路径段决定，hash 变化时跟着切。
 */
const pageStore = usePageStore()
const { current: page } = storeToRefs(pageStore)

function onHashChange() {
  pageStore.syncFromHash()
}

onMounted(() => {
  if (!parameterStore.config) {
    parameterStore.loadConfig()
  }
  if (!styleStore.config) {
    styleStore.loadConfig()
  }
  if (!stylesTopStore.config) {
    stylesTopStore.loadConfig()
  }
  pageStore.syncFromHash()
  window.addEventListener('hashchange', onHashChange)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', onHashChange)
})

// 移除已选提示词
const handleRemovePrompt = (categoryId: string, promptId: string, subCategoryId?: string) => {
  promptStore.removePrompt(categoryId, promptId, subCategoryId)
}

// 重新排序已选提示词
const handleReorderPrompt = (fromIndex: number, toIndex: number) => {
  promptStore.reorderPrompt(fromIndex, toIndex)
}

/**
 * 左右栏宽度比例（0~1）。
 * 界面偏好而非创作状态，因此单独存一个键，不写进 mj-session-v1 会话快照。
 */
const SPLIT_KEY = 'mj-split-ratio'
const DEFAULT_SPLIT = 0.47

function readSplitRatio(): number {
  try {
    const raw = localStorage.getItem(SPLIT_KEY)
    const value = raw === null ? NaN : Number(raw)
    return Number.isFinite(value) && value > 0.05 && value < 0.95 ? value : DEFAULT_SPLIT
  } catch {
    return DEFAULT_SPLIT
  }
}

const splitRatio = ref(readSplitRatio())

/**
 * 用字符串形式绑定 CSS 变量：Vue 3.5 收窄了 CSSProperties 的索引签名，
 * 对象字面量里的自定义属性过不了类型检查。
 */
const splitStyle = computed(() => `--split-left: ${(splitRatio.value * 100).toFixed(3)}%`)

/** 拖动过程中实时更新 */
function setSplitRatio(value: number) {
  splitRatio.value = value
}

/** 松手后落盘 */
function commitSplit() {
  try {
    localStorage.setItem(SPLIT_KEY, String(splitRatio.value))
  } catch {
    // 存储不可用时忽略：宽度比例只是界面偏好
  }
}
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  overflow: hidden;
}

.main-content {
  flex: 1;
  width: 100%;
  padding: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 两栏网格布局 */
.content-grid {
  display: grid;
  gap: 20px;
  width: 100%;
  flex: 1;
  overflow: hidden;
}

/* 大屏幕（1200px+）：两栏 —— 左：已选/最终/参数，右：提示词库 */
@media (min-width: 1200px) {
  .content-grid {
    /* 三条轨道：左栏 | 分割条 | 右栏。左栏宽度由 --split-left 驱动 */
    grid-template-columns: var(--split-left, 47%) 20px minmax(0, 1fr);
    column-gap: 0;
    row-gap: 20px;
    height: 100%;
  }

  .panel {
    height: 100%;
    overflow: hidden;
  }

  /* 左栏：已选提示词吃掉剩余高度，最终提示词与参数区按内容高度 */
  .left-panel .selected-card {
    flex: 1 1 auto;
    min-height: 100px;
  }

  .left-panel .result-card {
    flex: 0 0 auto;
  }

  /* 参数区展开时最多占三分之一，剩下的留给已选提示词 */
  .left-panel .parameter-panel-card {
    flex: 0 1 auto;
    max-height: 33%;
  }

  .left-panel .selected-card :deep(.n-card__content),
  .left-panel .result-card :deep(.n-card__content),
  .left-panel .parameter-panel-card :deep(.n-card__content) {
    flex: 1;
    min-height: 0;
    padding: 16px;
    overflow-y: auto;
  }

  /* 右栏：提示词库占满整栏，标签页内容自己滚动 */
  .right-panel .prompt-panel-card {
    flex: 1 1 auto;
    min-height: 0;
  }

  .right-panel .prompt-panel-card :deep(.n-card__content) {
    flex: 1;
    min-height: 0;
    padding: 16px;
    overflow: hidden;
  }
}

/* 笔记本电脑屏幕（768px-1200px）：两栏 */
@media (min-width: 768px) and (max-width: 1199px) {
  .content-grid {
    grid-template-columns: var(--split-left, 47%) 20px minmax(0, 1fr);
    column-gap: 0;
    row-gap: 20px;
    align-items: start;
  }

  .left-panel {
    grid-column: 1 / 2;
    grid-row: 1 / 2;
  }

  .column-splitter {
    grid-column: 2 / 3;
    grid-row: 1 / 2;
  }

  .right-panel {
    grid-column: 3 / 4;
    grid-row: 1 / 2;
  }
}

/* 小屏幕（<768px）：单栏布局 */
@media (max-width: 767px) {
  .content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .main-content {
    padding: 16px;
  }

  /* 单栏没有左右之分，隐藏分割条 */
  .column-splitter {
    display: none;
  }

  /* 单栏时把提示词库提到最前面：它是选词的主工作区 */
  .right-panel {
    order: -1;
  }
}

/* 中小屏幕：内容可能超过一屏，改为整页滚动（≥1200px 是固定高度的应用外壳） */
@media (max-width: 1199px) {
  .app-container {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }

  .main-content {
    overflow: visible;
  }

  .content-grid {
    overflow: visible;
  }
}

/* 面板样式 */
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.right-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* Naive UI Card 自定义样式 */
:deep(.n-card) {
  border-radius: 12px;
  box-shadow: 0 2px 8px var(--shadow-color);
  border: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
}

.prompt-panel-card :deep(.n-card__content) {
  padding: 16px;
}

.parameter-panel-card :deep(.n-card__content) {
  padding: 16px;
}

:deep(.n-card:hover) {
  box-shadow: 0 4px 12px var(--shadow-hover);
  transition: box-shadow 0.3s ease;
}

:deep(.n-card__header) {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-primary);
}

/* 暗色主题适配 */
:global(.dark) :deep(.n-card) {
  background-color: var(--bg-secondary);
  border-color: var(--border-color);
}
</style>
