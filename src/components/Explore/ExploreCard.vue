<template>
  <article class="explore-card">
    <!-- 主图：按作业自己的宽高比显示，不裁切 -->
    <div class="main-image" :style="{ aspectRatio: ratioStyle }">
      <img
        :src="mainThumbSrc"
        :alt="mainAlt"
        loading="lazy"
        decoding="async"
        @click="emit('open', job, activeIndex)"
      />

      <!-- 宽高比与风格参考码角标 -->
      <span class="badge badge-aspect">{{ job.aspect }}</span>
      <span v-if="job.sref" class="badge badge-sref">sref</span>

      <!-- 下载当前这一格 -->
      <button
        class="download-btn"
        type="button"
        title="下载这一格"
        @click.stop="downloadActive"
      >
        <n-icon>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12 3v10.6l3.3-3.3 1.4 1.4-5.7 5.7-5.7-5.7 1.4-1.4L10 13.6V3h2zM5 19h14v2H5v-2z"
            />
          </svg>
        </n-icon>
      </button>
    </div>

    <!-- 文字区：标题（提示词前 81 字）+ 元信息 + 标签 -->
    <div class="card-meta">
      <h4 class="card-title" :title="job.prompt">{{ job.title }}</h4>

      <div class="card-facts">
        <span class="fact-author" :title="`作者：${job.author}`">{{ job.author }}</span>
        <span class="fact-date">{{ job.batch.slice(5) }}</span>
        <span v-if="job.version" class="fact-version">v{{ job.version }}</span>
      </div>

      <div class="card-tags">
        <span class="tag tag-aspect">{{ job.aspect }}</span>
        <span v-if="job.sref" class="tag tag-sref">sref {{ job.sref }}</span>
      </div>

      <!-- 四格缩略图条：点一下切主图 -->
      <div class="thumb-strip">
        <button
          v-for="(thumb, index) in job.thumbs"
          :key="thumb"
          type="button"
          class="strip-cell"
          :class="{ active: index === activeIndex }"
          :title="`第 ${index + 1} 格`"
          @click="select(index)"
        >
          <img :src="getExploreImagePath(thumb)" :alt="`第 ${index + 1} 格`" loading="lazy" />
          <span class="strip-label">{{ index + 1 }}</span>
        </button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NIcon } from 'naive-ui'
import type { ExploreJob } from '@/types'
import { getExploreImagePath } from '@/utils'
import { downloadImageFile } from '@/utils/download'

const props = defineProps<{
  job: ExploreJob
}>()

const emit = defineEmits<{
  (e: 'open', job: ExploreJob, index: number): void
}>()

/** 当前显示第几格 */
const activeIndex = ref(0)

/** 换作业时回到第一格 */
watch(
  () => props.job.id,
  () => {
    activeIndex.value = 0
  }
)

/** 主图用缩略图档（320px），灯箱才用 640px 大图 */
const mainThumbSrc = computed(() => getExploreImagePath(props.job.thumbs[activeIndex.value] ?? ''))

const mainAlt = computed(() => `${props.job.author} 的作业：${props.job.title.slice(0, 60)}`)

/** 容器比例：作业自己的宽高比（上游声明值） */
const ratioStyle = computed(() => {
  const [w, h] = (props.job.aspect || '1:1').split(':').map(Number)
  if (!w || !h) return '1 / 1'
  return `${w} / ${h}`
})

function select(index: number) {
  activeIndex.value = index
}

/** 下载当前这一格：优先 640px 灯箱档，没有就退回 320px */
function downloadActive() {
  const mid = props.job.mids?.[activeIndex.value]
  const thumb = props.job.thumbs[activeIndex.value]
  const source = mid
    ? getExploreImagePath(mid)
    : getExploreImagePath(thumb)
  const name = `midjourney-${props.job.id}_${activeIndex.value + 1}.webp`
  downloadImageFile(source, name)
}
</script>

<style scoped>
.explore-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-primary);
  overflow: hidden;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.explore-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

/* 主图区：按作业自己的比例，不裁切 */
.main-image {
  position: relative;
  background: var(--bg-tertiary);
  overflow: hidden;
}

.main-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: zoom-in;
}

.badge {
  position: absolute;
  top: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.badge-aspect {
  left: 6px;
}

.badge-sref {
  right: 6px;
  background: rgba(56, 189, 248, 0.85);
}

/* 下载按钮 */
.download-btn {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(2px);
  transition: background 0.2s ease;
}

.download-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

/* 文字区 */
.card-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
}

.card-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.card-facts {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.fact-author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fact-date,
.fact-version {
  flex-shrink: 0;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.6;
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.tag-sref {
  border-color: rgba(56, 189, 248, 0.5);
  color: #0284c7;
}

/* 四格缩略图条 */
.thumb-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.strip-cell {
  position: relative;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 6px;
  background: var(--bg-tertiary);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.strip-cell:hover {
  border-color: var(--border-color);
}

.strip-cell.active {
  border-color: var(--primary-color);
}

.strip-cell img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
}

.strip-label {
  position: absolute;
  left: 2px;
  bottom: 2px;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 9px;
  line-height: 1.5;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  pointer-events: none;
}
</style>
