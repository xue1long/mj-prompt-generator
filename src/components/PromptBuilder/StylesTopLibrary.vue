<template>
  <div class="styles-top">
    <div class="library-header">
      <h3 class="library-title">🏆 官方风格榜</h3>
      <p class="library-description">
        共 {{ entries.length }} 个 Midjourney 风格码 · 每个码 8 张题材示例图 · 选中即填进「风格参考」参数（<code>--sref</code>）
      </p>
    </div>

    <!-- 搜索 -->
    <div class="search-row">
      <input
        v-model="query"
        class="search-input"
        type="search"
        placeholder="筛选风格码，例如 325728830"
        autocomplete="off"
      />
      <span class="count">{{ filtered.length }} / {{ entries.length }}</span>
    </div>

    <div v-if="entries.length === 0" class="empty-state">
      <span class="empty-icon">📦</span>
      <span class="empty-text">官方风格榜快照缺失，先跑 npm run build:styles-top 生成配置、npm run sync:styles-top-images 复制图片</span>
    </div>

    <div v-else-if="filtered.length === 0" class="empty-state">
      <span class="empty-icon">🔍</span>
      <span class="empty-text">没有匹配的风格码</span>
    </div>

    <div v-else class="code-grid">
      <div v-for="item in visible" :key="item.id" class="code-card">
        <div class="card-head">
          <span class="code-value">{{ item.display }}</span>
          <div class="card-actions">
            <button class="action-btn primary" @click="fillSref(item)">填入 --sref</button>
            <button class="action-btn" @click="copySref(item)">复制</button>
          </div>
        </div>
        <div class="kind-grid">
          <div v-for="kind in kinds" :key="kind.id" class="kind-tile" :title="kind.label">
            <img
              v-if="item.images[kind.id]"
              :src="imagePath(item.images[kind.id]!)"
              :alt="kind.label"
              loading="lazy"
              @error="handleImageError"
            />
            <span v-else class="kind-missing">{{ kind.label }}</span>
            <span class="kind-cap">{{ kind.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <button v-if="hiddenCount > 0" class="more-btn" @click="limit += PAGE_SIZE">
      显示更多（还有 {{ hiddenCount }} 条）
    </button>

    <p class="attribution">
      来源：Midjourney styles_top（内部参考，非官方）
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useStylesTopStore } from '@/stores/stylesTopStore'
import { useParameterStore } from '@/stores/parameterStore'
import { getPreviewImagePath } from '@/utils'
import type { StylesTopEntry } from '@/types'

/** 一页显示多少张卡 */
const PAGE_SIZE = 60

const store = useStylesTopStore()
const parameterStore = useParameterStore()
const message = useMessage()

const query = ref('')
const limit = ref(PAGE_SIZE)

const entries = computed(() => store.entries)
const kinds = computed(() => store.kinds)

const q = computed(() => query.value.trim().toLowerCase())
const filtered = computed(() =>
  q.value
    ? entries.value.filter(
        e => e.code.includes(q.value) || e.display.toLowerCase().includes(q.value)
      )
    : entries.value
)
const visible = computed(() => filtered.value.slice(0, limit.value))
const hiddenCount = computed(() => Math.max(0, filtered.value.length - limit.value))

/** 筛选条件变了就回到第一页 */
watch(q, () => {
  limit.value = PAGE_SIZE
})

function imagePath(p: string): string {
  return getPreviewImagePath(p)
}

/** 缺图时回落到占位图 */
function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement
  target.src = getPreviewImagePath(undefined)
}

/** 把码填进「风格参考」参数 */
function fillSref(item: StylesTopEntry) {
  parameterStore.setValue('styleRef', item.code)
  parameterStore.saveToLocalStorage()
  message.success(`已填入 --sref ${item.code}`)
}

async function copySref(item: StylesTopEntry) {
  try {
    await navigator.clipboard.writeText(`--sref ${item.code}`)
    message.success(`已复制 --sref ${item.code}`)
  } catch {
    message.error('复制失败，请手动选中')
  }
}
</script>

<style scoped>
.styles-top {
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

/* 搜索 */
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.count {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* 卡片网格 */
.code-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.code-card {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-tertiary);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.code-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--shadow-hover);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-light);
}

.code-value {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
}

.card-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: 4px;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
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

/* 题材九宫格（4 列 × 2 行） */
.kind-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
  padding: 6px;
}

.kind-tile {
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 5px;
  background: var(--bg-secondary);
}

.kind-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.kind-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 11px;
  color: var(--text-tertiary);
}

.kind-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  font-size: 10px;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  padding: 6px 4px 2px;
  text-align: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.kind-tile:hover .kind-cap {
  opacity: 1;
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
  text-align: center;
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
