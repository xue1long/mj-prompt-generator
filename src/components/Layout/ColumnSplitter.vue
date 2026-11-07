<template>
  <div
    ref="handleRef"
    class="column-splitter"
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    aria-label="调整左右栏宽度"
    :aria-valuenow="Math.round(ratio * 100)"
    :aria-valuemin="Math.round(range.min * 100)"
    :aria-valuemax="Math.round(range.max * 100)"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKeyDown"
  >
    <span class="splitter-line" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ ratio: number }>()
const emit = defineEmits<{
  (e: 'update:ratio', value: number): void
  (e: 'commit'): void
}>()

/** 每栏最小宽度（px） */
const MIN_PANEL = 320
/** 分割条轨道宽度（px），必须与 App.vue 里 grid 的第二条轨道一致 */
const HANDLE_WIDTH = 20

const handleRef = ref<HTMLElement | null>(null)

/** 所在网格的内容宽度 */
function containerWidth(): number {
  const el = handleRef.value?.parentElement
  return el ? el.clientWidth : 0
}

/** 左栏占比的合法区间，随窗口宽度变化 */
const range = ref({ min: 0.2, max: 0.8 })

function updateRange() {
  const w = containerWidth()
  if (!w) return
  range.value = {
    min: MIN_PANEL / w,
    max: (w - HANDLE_WIDTH - MIN_PANEL) / w,
  }
}

function clamp(value: number): number {
  return Math.min(Math.max(value, range.value.min), range.value.max)
}

/** 拖动 */
let dragging = false
let startX = 0
let startRatio = 0
let prevCursor = ''
let prevUserSelect = ''

function onPointerDown(e: PointerEvent) {
  dragging = true
  startX = e.clientX
  startRatio = props.ratio
  handleRef.value?.setPointerCapture(e.pointerId)

  // 拖动时不要选中文本，光标也要保持 col-resize
  prevCursor = document.body.style.cursor
  prevUserSelect = document.body.style.userSelect
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const w = containerWidth()
  if (!w) return
  emit('update:ratio', clamp(startRatio + (e.clientX - startX) / w))
}

function onPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  handleRef.value?.releasePointerCapture(e.pointerId)
  document.body.style.cursor = prevCursor
  document.body.style.userSelect = prevUserSelect
  emit('commit')
}

/** 键盘操作：方向键微调，Shift 加速，Home/End 到边界 */
function onKeyDown(e: KeyboardEvent) {
  const step = e.shiftKey ? 0.1 : 0.02
  let next: number | null = null

  if (e.key === 'ArrowLeft') next = props.ratio - step
  else if (e.key === 'ArrowRight') next = props.ratio + step
  else if (e.key === 'Home') next = range.value.min
  else if (e.key === 'End') next = range.value.max

  if (next === null) return
  e.preventDefault()
  emit('update:ratio', clamp(next))
  emit('commit')
}

onMounted(() => {
  updateRange()
  window.addEventListener('resize', updateRange)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateRange)
  document.body.style.cursor = prevCursor
  document.body.style.userSelect = prevUserSelect
})
</script>

<style scoped>
.column-splitter {
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
}

.splitter-line {
  width: 2px;
  height: 100%;
  border-radius: 2px;
  background: var(--border-color);
  transition: background 0.2s ease, width 0.2s ease;
}

.column-splitter:hover .splitter-line,
.column-splitter:focus-visible .splitter-line {
  width: 4px;
  background: var(--text-blue);
}

.column-splitter:focus-visible {
  outline: none;
}
</style>
