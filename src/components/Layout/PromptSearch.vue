<template>
  <div class="prompt-search" v-click-outside="handleClickOutside">
    <!-- 搜索输入框 -->
    <div class="search-input-wrapper">
      <input
        ref="searchInputRef"
        v-model="searchKeyword"
        type="text"
        class="search-input"
        placeholder="搜索提示词... (Ctrl+K)"
        @focus="handleFocus"
        @input="handleSearch"
      />
      <span class="search-icon">🔍</span>
      <span v-if="searchKeyword" class="clear-icon" @click="clearSearch">✕</span>
    </div>

    <!-- 搜索结果下拉框 -->
    <transition name="dropdown">
      <div v-if="showResults && searchKeyword" class="search-dropdown">
        <div v-if="searchResults.length > 0" class="results-list">
          <div
            v-for="result in searchResults"
            :key="`${result.categoryId}-${result.subCategoryId || ''}-${result.prompt.id}`"
            class="result-item"
            @click="handleAddPrompt(result)"
          >
            <div class="result-info">
              <div class="result-main">
                <span class="result-zh">{{ promptLabel(result.prompt) }}</span>
                <span v-if="result.prompt.prompt_en !== promptLabel(result.prompt)" class="result-en">{{ result.prompt.prompt_en }}</span>
              </div>
              <div class="result-meta">
                <span class="result-category">{{ result.categoryName }}</span>
                <span v-if="result.subCategoryName" class="result-subcategory">
                  / {{ result.subCategoryName }}
                </span>
              </div>
            </div>
            <div class="add-indicator" :class="{ selected: isPromptSelected(result.prompt.id) }">
              <span v-if="isPromptSelected(result.prompt.id)" class="icon">✓</span>
              <span v-else class="icon">+</span>
            </div>
          </div>
        </div>
        <div v-else class="no-results">
          <span class="no-results-icon">🔍</span>
          <span class="no-results-text">未找到相关提示词</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { usePromptStore } from '@/stores/promptStore'
import { promptLabel } from '@/utils'
import type { PromptItem } from '@/types'

interface SearchResult {
  categoryId: string
  categoryName: string
  subCategoryId?: string
  subCategoryName?: string
  prompt: PromptItem
}

const promptStore = usePromptStore()
const { config, selectedPrompts } = storeToRefs(promptStore)

const searchKeyword = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const showResults = ref(false)

// 计算已选提示词集合
const selectedPromptsSet = computed(() => {
  const set = new Set<string>()
  selectedPrompts.value.forEach(item => {
    set.add(item.promptId)
  })
  return set
})

// 检查提示词是否已选中
const isPromptSelected = (promptId: string) => {
  return selectedPromptsSet.value.has(promptId)
}

// 搜索结果（限制20条）
const searchResults = computed<SearchResult[]>(() => {
  if (!searchKeyword.value.trim()) {
    return []
  }

  const keyword = searchKeyword.value.toLowerCase().trim()
  const results: SearchResult[] = []
  const categories = config.value?.categories || []

  categories.forEach(category => {
    // 搜索一级分类的提示词
    if (category.prompts && category.prompts.length > 0) {
      category.prompts.forEach(prompt => {
        if (matchPrompt(prompt, keyword)) {
          results.push({
            categoryId: category.id,
            categoryName: category.name,
            prompt
          })
        }
      })
    }

    // 搜索二级分类的提示词
    if (category.subCategories && category.subCategories.length > 0) {
      category.subCategories.forEach(subCategory => {
        subCategory.prompts.forEach(prompt => {
          if (matchPrompt(prompt, keyword)) {
            results.push({
              categoryId: category.id,
              categoryName: category.name,
              subCategoryId: subCategory.id,
              subCategoryName: subCategory.name,
              prompt
            })
          }
        })
      })
    }
  })

  return results.slice(0, 20) // 限制最多显示20条
})

// 匹配提示词
const matchPrompt = (prompt: PromptItem, keyword: string): boolean => {
  const zhMatch = prompt.prompt_zh?.toLowerCase().includes(keyword) ?? false
  const enMatch = prompt.prompt_en.toLowerCase().includes(keyword)
  const descMatch = prompt.description?.toLowerCase().includes(keyword) || false
  return zhMatch || enMatch || descMatch
}

// 处理焦点
const handleFocus = () => {
  showResults.value = true
}

// 处理搜索
const handleSearch = () => {
  showResults.value = true
}

// 清除搜索
const clearSearch = () => {
  searchKeyword.value = ''
  showResults.value = false
}

// 添加提示词
const handleAddPrompt = (result: SearchResult) => {
  promptStore.togglePrompt(result.categoryId, result.prompt.id, result.subCategoryId)
}

// 点击外部关闭
const handleClickOutside = () => {
  showResults.value = false
}

// 全局快捷键监听
const handleKeyDown = (e: KeyboardEvent) => {
  // Ctrl+K 或 Cmd+K 激活搜索
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
    showResults.value = true
  }
  // ESC 关闭搜索结果
  if (e.key === 'Escape' && showResults.value) {
    showResults.value = false
    searchInputRef.value?.blur()
  }
}

// v-click-outside 指令
const vClickOutside = {
  mounted(el: HTMLElement & { clickOutsideEvent?: (event: Event) => void }, binding: any) {
    el.clickOutsideEvent = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value()
      }
    }
    document.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el: HTMLElement & { clickOutsideEvent?: (event: Event) => void }) {
    if (el.clickOutsideEvent) {
      document.removeEventListener('click', el.clickOutsideEvent)
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.prompt-search {
  position: relative;
  width: 100%;
  max-width: 400px;
}

/* 搜索输入框 */
.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 10px 80px 10px 40px;
  font-size: 14px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}

.search-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
  background: rgba(255, 255, 255, 1);
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-icon {
  position: absolute;
  left: 12px;
  font-size: 16px;
  pointer-events: none;
}

.clear-icon {
  position: absolute;
  right: 12px;
  font-size: 16px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s ease;
}

.clear-icon:hover {
  color: var(--text-primary);
}

/* 搜索结果下拉框 */
.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: 500px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.results-list {
  padding: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.result-item:last-child {
  margin-bottom: 0;
}

.result-item:hover {
  background: var(--bg-tertiary);
  transform: translateX(2px);
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.result-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-zh {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.result-en {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.result-category {
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.result-subcategory {
  opacity: 0.8;
}

/* 添加指示器 */
.add-indicator {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.3s ease;
}

.add-indicator.selected {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.icon {
  line-height: 1;
}

/* 无结果 */
.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 20px;
  color: var(--text-tertiary);
}

.no-results-icon {
  font-size: 36px;
  opacity: 0.3;
}

.no-results-text {
  font-size: 13px;
}

/* 下拉动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 暗色主题 */
:global(.dark) .search-input {
  background: rgba(30, 41, 59, 0.9);
  border-color: #334155;
  color: #f1f5f9;
}

:global(.dark) .search-input:focus {
  background: rgba(30, 41, 59, 1);
  border-color: #667eea;
}

:global(.dark) .search-dropdown {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* 响应式 */
@media (max-width: 768px) {
  .prompt-search {
    max-width: 100%;
  }

  .search-input {
    padding: 10px 40px 10px 40px;
    font-size: 13px;
  }

  .search-dropdown {
    max-height: 400px;
  }
}
</style>
