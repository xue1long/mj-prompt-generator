<template>
  <div
    class="artist-card"
    :class="{ selected }"
    role="button"
    :aria-pressed="selected"
    :title="title"
    @click="handleCardClick"
  >
    <div class="thumb-wrapper">
      <img
        class="artist-image"
        :src="imagePath"
        :alt="title"
        loading="lazy"
        @error="handleImageError"
      />

      <!-- 角标：主色 + 实测。风格参考码页的角标放码值，艺术家条目没有码 -->
      <div class="thumb-badge">
        <span
          v-if="colour"
          class="colour-dot"
          :style="{ background: colour.hex }"
          :title="`主色：${colour.name}`"
        ></span>
        <span v-if="prompt.testedMark" class="tested-badge" title="上游实测过">实测</span>
      </div>

      <!-- 选中标记 -->
      <span v-if="selected" class="selected-mark">✓</span>
    </div>

    <div class="card-meta">
      <div class="card-name">{{ title }}</div>
      <p v-if="subtitle" class="card-subtitle" :title="subtitle">{{ subtitle }}</p>
      <div class="card-actions">
        <button class="action-btn" type="button" @click.stop="emit('detail')">详情</button>
        <!-- 逐条回链：站方许可的条件是署名 + 回链 -->
        <a
          v-if="prompt.sourceUrl"
          class="source-link"
          :href="prompt.sourceUrl"
          target="_blank"
          rel="noopener"
          @click.stop
        >
          Midlibrary ↗
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStyleStore } from '@/stores/styleStore'
import { getPreviewImagePath, promptLabel } from '@/utils'
import type { PromptItem } from '@/types'

const props = defineProps<{
  prompt: PromptItem
  categoryId: string
  subCategoryId: string
  selected: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', categoryId: string, promptId: string, subCategoryId: string): void
  (e: 'detail'): void
}>()

const styleStore = useStyleStore()

/** 显示名：有中文名用中文名，风格条目回落到原文名 */
const title = computed(() => promptLabel(props.prompt))

const imagePath = computed(() => getPreviewImagePath(props.prompt.preview))

/**
 * 副标题：上游简介的第一句。
 *
 * 上游不给中文名，这句简介是认出"他是谁、擅长什么"的唯一线索；
 * 开头重复的名字（"Puuung is a South Korean illustrator…"）去掉，
 * 名字已经在标题上了。
 */
const subtitle = computed(() => {
  const intro = props.prompt.description?.trim()
  if (intro) {
    const sentence = firstSentence(intro)
    const withoutName = sentence.startsWith(title.value)
      ? sentence.slice(title.value.length).trim()
      : sentence
    return capitalize(withoutName)
  }
  // 手写条目没有简介，退回英文写法（与标题相同就不重复显示）
  return props.prompt.prompt_en !== title.value ? props.prompt.prompt_en : ''
})

/** 主色：上游按占比降序给了几个，取第一个 */
const colour = computed(() => {
  const slug = props.prompt.colours?.[0]
  if (!slug) return null
  const found = styleStore.colours.find(item => item.slug === slug)
  return found ? { name: found.name, hex: found.hex } : null
})

/** 取第一句（简介是整段话，卡片上只放一句） */
function firstSentence(text: string): string {
  const matched = text.match(/^[\s\S]*?[.!?](?=\s|$)/)
  return (matched ? matched[0] : text).trim()
}

function capitalize(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** 单击卡片 = 选中/取消（艺术家分类是"选一个风格"的主路径） */
function handleCardClick() {
  emit('toggle', props.categoryId, props.prompt.id, props.subCategoryId)
}

/** 图片裂了就淡掉，不留破图标 */
function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement
  target.style.opacity = '0.3'
}
</script>

<style scoped>
.artist-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.artist-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--shadow-hover);
}

.artist-card.selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-color);
}

.thumb-wrapper {
  position: relative;
  width: 100%;
  padding-bottom: 100%;
  overflow: hidden;
  background: var(--bg-secondary);
}

.artist-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 风格库图是 320×320 方图，手写图是 1456×816 横图：
     统一裁成方图时偏上取，能多留一点主体上部 */
  object-position: center 35%;
}

/* 角标：主色 + 实测 */
.thumb-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.colour-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.tested-badge {
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  line-height: 1.4;
}

.selected-mark {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-color);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

.card-meta {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-subtitle {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-tertiary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.action-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}

.action-btn:hover {
  color: var(--text-primary);
  border-color: var(--primary-color);
}

.source-link {
  font-size: 11px;
  color: var(--text-tertiary);
  text-decoration: none;
}

.source-link:hover {
  color: var(--primary-color);
}
</style>
