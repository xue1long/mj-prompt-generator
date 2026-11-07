<template>
  <div class="explore-filters">
    <n-input
      class="search-input"
      :value="filter.q"
      placeholder="搜索提示词或作者"
      clearable
      @update:value="onSearch"
    />

    <n-select
      class="facet-select batch-select"
      :value="filter.batch || null"
      :options="batchOptions"
      placeholder="全部日期"
      clearable
      @update:value="onBatch"
    />

    <n-select
      class="facet-select aspect-select"
      :value="filter.aspect || null"
      :options="aspectOptions"
      placeholder="全部比例"
      clearable
      @update:value="onAspect"
    />

    <n-checkbox :checked="filter.srefOnly" @update:checked="onSrefOnly">
      只看有 sref
    </n-checkbox>

    <n-button size="small" quaternary @click="emit('reset')">重置</n-button>

    <span class="result-count">{{ count }} 条作业</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NInput, NSelect, NCheckbox, NButton } from 'naive-ui'
import type { ExploreAspect, ExploreBatch } from '@/types'
import type { ExploreFilterState } from '@/utils/exploreHash'

const props = defineProps<{
  filter: ExploreFilterState
  batches: ExploreBatch[]
  aspects: ExploreAspect[]
  /** 当前命中的作业数 */
  count: number
}>()

const emit = defineEmits<{
  (e: 'change', filter: ExploreFilterState): void
  (e: 'reset'): void
}>()

const batchOptions = computed(() =>
  props.batches.map(b => ({ label: `${b.name}（${b.images}）`, value: b.key }))
)

const aspectOptions = computed(() =>
  props.aspects.map(a => ({ label: `${a.name}（${a.count}）`, value: a.key }))
)

/** 搜索要防抖：每敲一个字就改一次 hash 会把历史塞满 */
const keyword = ref(props.filter.q)
let timer: ReturnType<typeof setTimeout> | null = null

function onSearch(value: string) {
  keyword.value = value
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    emit('change', { ...props.filter, q: keyword.value.trim() })
  }, 300)
}

function onBatch(value: string | null) {
  emit('change', { ...props.filter, batch: value ?? '' })
}

function onAspect(value: string | null) {
  emit('change', { ...props.filter, aspect: value ?? '' })
}

function onSrefOnly(value: boolean) {
  emit('change', { ...props.filter, srefOnly: value })
}

/** 从 hash 恢复时同步输入框（深链进来时框里要有内容） */
watch(
  () => props.filter.q,
  value => {
    if (value !== keyword.value) keyword.value = value
  }
)
</script>

<style scoped>
.explore-filters {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 0;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-light);
}

.search-input {
  width: 240px;
}

.facet-select {
  width: 160px;
}

.result-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
