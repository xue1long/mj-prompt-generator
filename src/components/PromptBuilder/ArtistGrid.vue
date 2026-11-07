<template>
  <div class="artist-grid-wrap">
    <!-- 筛选后没有命中：明确说一声，不要给一片空白 -->
    <div v-if="subCategories.length === 0" class="empty-state">
      <span class="empty-icon">🔍</span>
      <span class="empty-text">该条件下没有匹配的条目</span>
    </div>

    <template v-else>
      <div v-for="subCategory in subCategories" :key="subCategory.id" class="artist-section">
        <div class="artist-section-header">
          <h4 class="artist-section-title">{{ subCategory.name }}</h4>
          <span class="artist-section-count">({{ subCategory.prompts.length }})</span>
        </div>

        <div class="artist-grid">
          <ArtistCard
            v-for="prompt in visiblePrompts(subCategory.id, subCategory.prompts)"
            :key="prompt.id"
            :prompt="prompt"
            :category-id="categoryId"
            :sub-category-id="subCategory.id"
            :selected="isSelected(prompt.id)"
            @toggle="handleToggle"
            @detail="openDetail(prompt, subCategory.id, subCategory.name)"
          />
        </div>

        <button
          v-if="hiddenCount(subCategory.id, subCategory.prompts) > 0"
          class="more-btn"
          @click="showMore(subCategory.id)"
        >
          显示更多（还有 {{ hiddenCount(subCategory.id, subCategory.prompts) }} 条）
        </button>
      </div>

      <!-- 署名：站方许可的条件是署名 + 回链（回链在每张卡上） -->
      <p class="attribution">
        风格条目来自 Midlibrary · 站方书面许可：个人学习用途，署名 + 回链原站
      </p>
    </template>

    <!-- 详情弹窗 -->
    <n-modal
      v-model:show="detailVisible"
      preset="card"
      :style="{ maxWidth: '860px', width: '92%' }"
      :bordered="false"
      :segmented="{ content: true }"
    >
      <template #header>
        <div class="modal-header">
          <span class="modal-title">{{ detailTitle }}</span>
          <span class="modal-category">{{ detailSubCategory }}</span>
        </div>
      </template>

      <div v-if="detail" class="modal-content">
        <div class="modal-image-wrapper">
          <img
            class="modal-image"
            :src="getPreviewImagePath(detail.prompt.preview)"
            :alt="detailTitle"
          />
        </div>

        <div class="modal-info">
          <!-- 英文写法（与显示名相同时不重复显示） -->
          <div v-if="detail.prompt.prompt_en !== detailTitle" class="info-section">
            <div class="info-label">英文写法</div>
            <div class="info-value info-en">{{ detail.prompt.prompt_en }}</div>
          </div>

          <!-- 简介：他是谁 -->
          <div v-if="detail.prompt.description" class="info-section">
            <div class="info-label">简介</div>
            <div class="info-value">{{ detail.prompt.description }}</div>
          </div>

          <!-- 风格描述：这张画面长什么样 -->
          <div v-if="detail.prompt.observation" class="info-section">
            <div class="info-label">风格描述</div>
            <div class="info-value">{{ detail.prompt.observation }}</div>
          </div>

          <!-- 预览图生成提示词（风格条目的原文行只有 "by X --v 8.2"，不重复展示） -->
          <div v-if="showGenerationPrompt" class="info-section generation-prompt">
            <div class="info-label">预览图生成提示词</div>
            <div class="info-value info-code">{{ detail.prompt.generationPrompt }}</div>
          </div>

          <div class="modal-actions">
            <button class="use-prompt-btn modal-btn" @click="toggleDetail">
              <span class="btn-icon">{{ isSelected(detail.prompt.id) ? '−' : '✓' }}</span>
              <span class="btn-text">
                {{ isSelected(detail.prompt.id) ? '取消选用' : '选用此风格' }}
              </span>
            </button>
            <a
              v-if="detail.prompt.sourceUrl"
              class="source-link"
              :href="detail.prompt.sourceUrl"
              target="_blank"
              rel="noopener"
            >
              Midlibrary ↗
            </a>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { getPreviewImagePath, promptLabel } from '@/utils'
import type { FilterState } from '@/utils/facetFilter'
import type { PromptItem, PromptSubCategory } from '@/types'
import ArtistCard from './ArtistCard.vue'

const props = defineProps<{
  subCategories: PromptSubCategory[]
  categoryId: string
  selectedPrompts: Set<string>
  /** 当前筛选状态：筛选一变，分页要回到第一页 */
  filterState: FilterState
}>()

const emit = defineEmits<{
  (e: 'toggle', categoryId: string, promptId: string, subCategoryId: string): void
}>()

/**
 * 每个二级分类先显示多少条。
 * 与标签形态时一致（100 条一批）：画家一个类目就有一千多条，
 * 一次性铺开会把网格撑爆。
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

/** 筛选条件变了就回到第一页（否则会停在空白的第 N 页上） */
watch(
  () => props.filterState,
  () => {
    limits.value = {}
  }
)

const isSelected = (promptId: string) => props.selectedPrompts.has(promptId)

function handleToggle(categoryId: string, promptId: string, subCategoryId: string) {
  emit('toggle', categoryId, promptId, subCategoryId)
}

// ---- 详情弹窗 ----
interface DetailItem {
  prompt: PromptItem
  subCategoryId: string
  subCategoryName: string
}

const detailVisible = ref(false)
const detail = ref<DetailItem | null>(null)

function openDetail(prompt: PromptItem, subCategoryId: string, subCategoryName: string) {
  detail.value = { prompt, subCategoryId, subCategoryName }
  detailVisible.value = true
}

const detailTitle = computed(() => (detail.value ? promptLabel(detail.value.prompt) : ''))
const detailSubCategory = computed(() => detail.value?.subCategoryName ?? '')

/**
 * 风格条目的原文提示词行只有 "by Puuung --v 8.2"，没有信息量，不重复展示；
 * 手写条目的生成提示词是完整的一行，值得展示。
 */
const showGenerationPrompt = computed(() => {
  const prompt = detail.value?.prompt
  const generation = prompt?.generationPrompt?.trim()
  if (!prompt || !generation) return false
  const bare = generation.replace(/^by\s+/i, '').replace(/--.*$/, '').trim()
  return bare.toLowerCase() !== prompt.prompt_en.toLowerCase()
})

function toggleDetail() {
  if (!detail.value) return
  handleToggle(props.categoryId, detail.value.prompt.id, detail.value.subCategoryId)
}
</script>

<style scoped>
.artist-grid-wrap {
  padding: 16px 0;
}

.artist-section {
  margin-bottom: 24px;
}

.artist-section:last-of-type {
  margin-bottom: 0;
}

.artist-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-light);
}

.artist-section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.artist-section-count {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
}

/* 卡片网格：列宽比风格参考码页宽一点，卡片上要放得下一句简介 */
.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
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

/* 署名 */
.attribution {
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px solid var(--border-light);
  font-size: 11px;
  color: var(--text-tertiary);
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

/* ---- 详情弹窗 ---- */
.modal-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-category {
  font-size: 12px;
  color: var(--text-tertiary);
}

.modal-content {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.modal-image-wrapper {
  flex: 0 0 320px;
  width: 320px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.modal-image {
  display: block;
  width: 100%;
  height: auto;
}

.modal-info {
  flex: 1 1 280px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.info-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.info-value {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-primary);
}

.info-en {
  font-family: monospace;
  word-break: break-all;
}

.info-code {
  font-family: monospace;
  font-size: 11px;
  line-height: 1.5;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border-left: 3px solid var(--primary-color);
  word-break: break-all;
}

.modal-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.use-prompt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--primary-color);
  background: var(--primary-color);
  color: var(--text-primary);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  cursor: pointer;
}

.source-link {
  font-size: 12px;
  color: var(--text-tertiary);
  text-decoration: none;
}

.source-link:hover {
  color: var(--primary-color);
}

/* 暗色主题 */
:global(.dark) .artist-section-header {
  border-bottom-color: var(--border-color);
}

:global(.dark) .artist-section-title {
  color: var(--text-primary);
}
</style>
