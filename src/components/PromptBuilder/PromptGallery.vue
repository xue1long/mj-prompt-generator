<template>
  <div class="prompt-gallery">
    <div class="gallery-header">
      <h3 class="gallery-title">🖼️ 画廊</h3>
      <p class="gallery-description">
        共 {{ galleryItems.length }} 张预览图
        <span v-if="hiddenCount > 0">（已显示 {{ visibleItems.length }} 张）</span>
        ，点击查看详情
      </p>
    </div>

    <div v-if="galleryItems.length > 0" class="gallery-grid">
      <div
        v-for="item in visibleItems"
        :key="`${item.categoryId}-${item.subCategoryId || ''}-${item.prompt.id}`"
        class="gallery-item"
        @click="handleItemClick(item)"
      >
        <div class="image-wrapper">
          <img
            :src="item.imagePath"
            :alt="promptLabel(item.prompt)"
            class="gallery-image"
            loading="lazy"
            @error="handleImageError"
          />
          <div class="image-overlay">
            <div class="overlay-text">
              <div class="overlay-title">{{ promptLabel(item.prompt) }}</div>
              <div v-if="item.prompt.prompt_en !== promptLabel(item.prompt)" class="overlay-subtitle">{{ item.prompt.prompt_en }}</div>
            </div>
            <button
              class="use-prompt-btn"
              @click.stop="handleUsePrompt(item)"
            >
              <span class="btn-icon">✓</span>
              <span class="btn-text">使用此提示词</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <span class="empty-icon">📷</span>
      <span class="empty-text">暂无预览图</span>
    </div>

    <button v-if="hiddenCount > 0" class="more-btn" @click="limit += PAGE_SIZE">
      显示更多（还有 {{ hiddenCount }} 张）
    </button>

    <!-- 详情弹窗 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :style="{ maxWidth: '900px', width: '90%' }"
      :bordered="false"
      :segmented="{ content: true }"
    >
      <template #header>
        <div class="modal-header">
          <span class="modal-title">{{ selectedItem ? promptLabel(selectedItem.prompt) : '' }}</span>
          <span class="modal-category">{{ selectedItem?.categoryName }}</span>
        </div>
      </template>

      <div v-if="selectedItem" class="modal-content">
        <!-- 预览图 -->
        <div class="modal-image-wrapper">
          <img
            :src="selectedItem.imagePath"
            :alt="promptLabel(selectedItem.prompt)"
            class="modal-image"
          />
        </div>

        <!-- 信息区 -->
        <div class="modal-info">
          <!-- 名称（风格条目没有中文名，显示原文名） -->
          <div class="info-section">
            <div class="info-label">{{ selectedItem.prompt.prompt_zh ? '中文提示词' : '名称' }}</div>
            <div class="info-value">{{ promptLabel(selectedItem.prompt) }}</div>
          </div>

          <!-- 英文提示词（与名称相同时不重复显示） -->
          <div v-if="selectedItem.prompt.prompt_en !== promptLabel(selectedItem.prompt)" class="info-section">
            <div class="info-label">英文提示词</div>
            <div class="info-value info-en">{{ selectedItem.prompt.prompt_en }}</div>
          </div>

          <!-- 描述（如果有） -->
          <div v-if="selectedItem.prompt.description" class="info-section">
            <div class="info-label">说明</div>
            <div class="info-value">{{ selectedItem.prompt.description }}</div>
          </div>

          <!-- 生成提示词（如果有） -->
          <div v-if="selectedItem.prompt.generationPrompt" class="info-section generation-prompt">
            <div class="info-label">预览图生成提示词</div>
            <div class="info-value info-code">{{ selectedItem.prompt.generationPrompt }}</div>
          </div>

          <!-- 使用提示词按钮 -->
          <div class="modal-actions">
            <button
              class="use-prompt-btn modal-btn"
              @click="handleUsePrompt(selectedItem)"
            >
              <span class="btn-icon">✓</span>
              <span class="btn-text">使用此提示词</span>
            </button>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { NModal } from 'naive-ui'
import { usePromptStore } from '@/stores/promptStore'
import { getPreviewImagePath, promptLabel } from '@/utils'
import type { PromptItem } from '@/types'

/** 一页显示多少张图（风格库进来后总数有四千多，懒加载分批显示） */
const PAGE_SIZE = 240

interface GalleryItem {
  categoryId: string
  categoryName: string
  subCategoryId?: string
  subCategoryName?: string
  prompt: PromptItem
  imagePath: string
}

const promptStore = usePromptStore()
const { config } = storeToRefs(promptStore)

// 弹窗状态
const showModal = ref(false)
const selectedItem = ref<GalleryItem | null>(null)

/** 分批显示：先出一批，点「显示更多」再加一批 */
const limit = ref(PAGE_SIZE)

// 收集所有有预览图的提示词
const galleryItems = computed<GalleryItem[]>(() => {
  const items: GalleryItem[] = []
  const categories = config.value?.categories || []

  categories.forEach(category => {
    // 一级分类的提示词
    if (category.prompts && category.prompts.length > 0) {
      category.prompts.forEach(prompt => {
        if (prompt.preview) {
          items.push({
            categoryId: category.id,
            categoryName: category.name,
            prompt,
            imagePath: getPreviewImagePath(prompt.preview)
          })
        }
      })
    }

    // 二级分类的提示词
    if (category.subCategories && category.subCategories.length > 0) {
      category.subCategories.forEach(subCategory => {
        subCategory.prompts.forEach(prompt => {
          if (prompt.preview) {
            items.push({
              categoryId: category.id,
              categoryName: category.name,
              subCategoryId: subCategory.id,
              subCategoryName: subCategory.name,
              prompt,
              imagePath: getPreviewImagePath(prompt.preview)
            })
          }
        })
      })
    }
  })

  return items
})

/** 本批显示的图 */
const visibleItems = computed<GalleryItem[]>(() => galleryItems.value.slice(0, limit.value))

/** 还没显示的图数 */
const hiddenCount = computed(() => Math.max(0, galleryItems.value.length - limit.value))

// 处理图片点击
const handleItemClick = (item: GalleryItem) => {
  selectedItem.value = item
  showModal.value = true
}
// 处理使用提示词
const handleUsePrompt = (item: GalleryItem) => {
  promptStore.togglePrompt(item.categoryId, item.prompt.id, item.subCategoryId)
}

// 处理图片加载错误
const handleImageError = (e: Event) => {
  const target = e.target as HTMLImageElement
  target.style.opacity = '0.3'
}
</script>

<style scoped>
.prompt-gallery {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 0;
  height: 100%;
}

.gallery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border-light);
}

.gallery-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.gallery-description {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

/* 网格布局 */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  overflow-y: auto;
  padding: 4px;
}

.gallery-item {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  background: var(--bg-tertiary);
}

.gallery-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px var(--shadow-hover);
}

.image-wrapper {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 比例 */
  overflow: hidden;
  background: var(--bg-tertiary);
}

.gallery-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.gallery-item:hover .gallery-image {
  transform: scale(1.05);
}

.image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  padding: 16px 12px 12px 12px;
  opacity: 0;
  transition: opacity 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gallery-item:hover .image-overlay {
  opacity: 1;
}

.overlay-text {
  color: white;
  flex: 1;
}

.overlay-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.overlay-subtitle {
  font-size: 11px;
  opacity: 0.9;
  font-family: monospace;
}

/* 使用提示词按钮 */
.use-prompt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  pointer-events: auto;
}

.use-prompt-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

.use-prompt-btn:active {
  transform: translateY(0);
}

.btn-icon {
  font-size: 14px;
  font-weight: bold;
}

.btn-text {
  white-space: nowrap;
}

/* Modal中的按钮 */
.modal-actions {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}

.modal-btn {
  padding: 12px 32px;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.modal-btn:hover {
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 16px;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 64px;
  opacity: 0.3;
}

.empty-text {
  font-size: 14px;
}

/* Modal 样式 */
.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-category {
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: 4px;
}

.modal-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.modal-image-wrapper {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.modal-image {
  width: 100%;
  height: auto;
  display: block;
}

.modal-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}

.info-en {
  font-family: monospace;
  color: var(--text-secondary);
}

.info-code {
  font-family: monospace;
  font-size: 13px;
  background: var(--bg-secondary);
  padding: 12px;
  border-radius: 6px;
  border-left: 3px solid var(--primary-color);
  word-break: break-word;
  line-height: 1.6;
}

.generation-prompt {
  margin-top: 8px;
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

.more-btn:hover {
  color: var(--text-primary);
  border-color: var(--primary-color);
}

/* 响应式 */
@media (max-width: 768px) {
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .modal-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
