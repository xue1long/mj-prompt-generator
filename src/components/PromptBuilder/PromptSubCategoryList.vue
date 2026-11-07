<template>
  <div class="subcategory-list">
    <!-- 筛选后没有命中：明确说一声，不要给一片空白 -->
    <div v-if="isEmpty" class="empty-state">
      <span class="empty-icon">🔍</span>
      <span class="empty-text">该条件下没有匹配的条目</span>
    </div>

    <!-- 情况1: 有二级分类 -->
    <template v-if="subCategories.length > 0">
      <div
        v-for="subCategory in subCategories"
        :key="subCategory.id"
        class="subcategory-section"
      >
        <!-- 二级分类标题（只是标题，不可点击） -->
        <div class="subcategory-header">
          <h4 class="subcategory-title">{{ subCategory.name }}</h4>
          <span class="subcategory-count">({{ subCategory.prompts.length }})</span>
        </div>

        <!-- 该二级分类下的提示词标签 -->
        <div class="prompts-grid">
          <PromptPreview
            v-for="(prompt, index) in visiblePrompts(subCategory.id, subCategory.prompts)"
            :key="prompt.id"
            :prompt="previewPrompt"
            :show="isPreviewVisible && previewPrompt?.id === prompt.id"
          >
            <PromptTag
              :prompt="prompt"
              :category-id="categoryId"
              :sub-category-id="subCategory.id"
              :is-selected="isPromptSelected(prompt.id)"
              :color-index="index % 4"
              @click="handleTagClick"
              @preview="handlePreview"
            />
          </PromptPreview>
        </div>

        <!-- 条目太多时先出一批 -->
        <button
          v-if="hiddenCount(subCategory.id, subCategory.prompts) > 0"
          class="more-btn"
          @click="showMore(subCategory.id)"
        >
          显示更多（还有 {{ hiddenCount(subCategory.id, subCategory.prompts) }} 条）
        </button>
      </div>
    </template>

    <!-- 情况2: 无二级分类（向后兼容） -->
    <template v-else>
      <div class="prompts-grid">
        <PromptPreview
          v-for="(prompt, index) in visiblePrompts(categoryId, prompts)"
          :key="prompt.id"
          :prompt="previewPrompt"
          :show="isPreviewVisible && previewPrompt?.id === prompt.id"
        >
          <PromptTag
            :prompt="prompt"
            :category-id="categoryId"
            :is-selected="isPromptSelected(prompt.id)"
            :color-index="index % 4"
            @click="handleTagClick"
            @preview="handlePreview"
          />
        </PromptPreview>
      </div>

      <button
        v-if="hiddenCount(categoryId, prompts) > 0"
        class="more-btn"
        @click="showMore(categoryId)"
      >
        显示更多（还有 {{ hiddenCount(categoryId, prompts) }} 条）
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PromptSubCategory, PromptItem } from '@/types'
import PromptTag from './PromptTag.vue'
import PromptPreview from './PromptPreview.vue'

interface Props {
  subCategories: PromptSubCategory[]
  prompts: PromptItem[]
  categoryId: string
  selectedPrompts: Set<string>
}

interface Emits {
  (e: 'toggle', categoryId: string, promptId: string, subCategoryId?: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/** 筛选后两个列表都空了 */
const isEmpty = computed(
  () => props.subCategories.length === 0 && props.prompts.length === 0
)

// 预览状态
const previewPrompt = ref<PromptItem | null>(null)
const isPreviewVisible = ref(false)

/**
 * 每个二级分类先显示多少条。
 * 风格库并进来之后，「画家」一个类目就有上千条，
 * 一次性铺开会把标签区撑爆，所以先出一批，点「显示更多」再加一批。
 */
const PAGE_SIZE = 100

/** 各分组当前显示的条数上限 */
const limits = ref<Record<string, number>>({})

function limitOf(key: string): number {
  return limits.value[key] ?? PAGE_SIZE
}

function visiblePrompts(key: string, prompts: PromptItem[]): PromptItem[] {
  return prompts.slice(0, limitOf(key))
}

function hiddenCount(key: string, prompts: PromptItem[]): number {
  return Math.max(0, prompts.length - limitOf(key))
}

function showMore(key: string) {
  limits.value = { ...limits.value, [key]: limitOf(key) + PAGE_SIZE }
}

const isPromptSelected = (promptId: string) => {
  return props.selectedPrompts.has(promptId)
}

const handleTagClick = (data: { categoryId: string, promptId: string, subCategoryId?: string }) => {
  emit('toggle', data.categoryId, data.promptId, data.subCategoryId)
}

const handlePreview = (prompt: PromptItem, show: boolean) => {
  if (show) {
    previewPrompt.value = prompt
    isPreviewVisible.value = true
  } else {
    isPreviewVisible.value = false
  }
}
</script>

<style scoped>
.subcategory-list {
  padding: 16px 0;
}

.subcategory-section {
  margin-bottom: 24px;
}

.subcategory-section:last-child {
  margin-bottom: 0;
}

.subcategory-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-light);
}

.subcategory-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.subcategory-count {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.prompts-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 显示更多 */
.more-btn {
  margin-top: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  padding: 5px 14px;
  cursor: pointer;
}

.more-btn:hover {
  color: var(--text-primary);
  border-color: var(--primary-color);
}

/* 筛选无结果 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 32px;
  opacity: 0.3;
}

.empty-text {
  font-size: 13px;
}

/* 暗色主题 */
:global(.dark) .subcategory-header {
  border-bottom-color: var(--border-color);
}

:global(.dark) .subcategory-title {
  color: var(--text-primary);
}
</style>
