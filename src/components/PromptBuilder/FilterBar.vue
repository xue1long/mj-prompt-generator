<template>
  <div class="filter-bar">
    <div class="search-row">
      <input
        v-model="searchText"
        type="text"
        class="search-input"
        :placeholder="placeholder"
        @input="handleInput"
      />
      <span class="search-icon">🔍</span>
      <span v-if="searchText" class="clear-icon" @click="clearSearch">✕</span>
    </div>

    <div class="toggle-row">
      <button
        v-for="dimension in dimensions"
        :key="dimension.key"
        type="button"
        class="toggle"
        :class="{ active: state[dimension.key] }"
        @click="toggle(dimension.key)"
      >
        <span class="toggle-label">{{ dimension.label }}</span>
        <span class="toggle-count">{{ dimension.count }}</span>
      </button>

      <button
        v-if="facetCount > 0 || groups.length > 0"
        type="button"
        class="toggle facet-toggle"
        :class="{ active: facetOpen }"
        @click="facetOpen = !facetOpen"
      >
        <span class="toggle-label">分面</span>
        <span v-if="facetCount" class="facet-badge">{{ facetCount }}</span>
        <span class="toggle-arrow">{{ facetOpen ? '▴' : '▾' }}</span>
      </button>

      <span class="filter-count">{{ total }} 条</span>
    </div>

    <div v-if="hasActive" class="chip-row">
      <span v-if="state.q.trim()" class="chip">
        搜索：“{{ state.q.trim() }}”<button type="button" class="chip-x" @click="clearSearch">×</button>
      </span>
      <span
        v-for="dimension in dimensions"
        :key="`chip-${dimension.key}`"
        v-show="state[dimension.key]"
        class="chip"
      >
        {{ dimension.label }}<button type="button" class="chip-x" @click="toggle(dimension.key)">×</button>
      </span>
      <span v-for="slug in state.terms" :key="`chip-term-${slug}`" class="chip">
        {{ termLabel(slug) }}<button type="button" class="chip-x" @click="toggleTerm(slug)">×</button>
      </span>
      <span v-for="slug in state.colours" :key="`chip-colour-${slug}`" class="chip">
        <span class="chip-swatch" :style="{ background: colourHex(slug) }"></span>
        {{ colourLabel(slug) }}<button type="button" class="chip-x" @click="toggleColour(slug)">×</button>
      </span>
      <button type="button" class="reset-btn" @click="reset">重置</button>
    </div>

    <!-- 分面面板：组内任一、组间全部 -->
    <div v-show="facetOpen && hasFacets" class="facet-panel">
      <div v-for="group in groups" :key="group.id" class="facet-group">
        <div class="facet-group-name">{{ group.name }}</div>
        <div class="facet-terms">
          <button
            v-for="term in group.terms"
            :key="term.slug"
            type="button"
            class="facet-chip"
            :class="{ active: state.terms.includes(term.slug), empty: term.count === 0 }"
            @click="toggleTerm(term.slug)"
          >
            {{ term.label }}<span class="facet-count">{{ term.count }}</span>
          </button>
        </div>
      </div>

      <div v-if="colours.length" class="facet-group">
        <div class="facet-group-name">主色</div>
        <div class="facet-colours">
          <button
            v-for="colour in colours"
            :key="colour.slug"
            type="button"
            class="swatch"
            :class="{ active: state.colours.includes(colour.slug), empty: colour.count === 0 }"
            :style="{ background: colour.hex }"
            :title="`${colour.name}（${colour.count}）`"
            @click="toggleColour(colour.slug)"
          ></button>
        </div>
      </div>

      <p v-if="facetCoverage < 100" class="facet-coverage">
        分面数据覆盖 {{ facetCoverage }}% 的条目，其余条目不会出现在分面筛选结果里
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { EMPTY_FILTER, toggleFilter } from '@/utils/facetFilter'
import type { BoolDim, FilterKind, FilterState } from '@/utils/facetFilter'

/** 一个可点的布尔维度（带「再打开会得到多少条」） */
export interface FilterDimension {
  key: BoolDim
  label: string
  count: number
}

/** 面板里的一个分面词 */
export interface FacetTerm {
  slug: string
  label: string
  count: number
}

/** 面板里的一组分面词 */
export interface FacetGroup {
  id: string
  name: string
  terms: FacetTerm[]
}

/** 面板里的一个主色 */
export interface FacetColour {
  slug: string
  name: string
  hex: string
  count: number
}

const props = withDefaults(
  defineProps<{
    state: FilterState
    total: number
    dimensions: FilterDimension[]
    groups?: FacetGroup[]
    colours?: FacetColour[]
    facetCoverage?: number
    placeholder?: string
  }>(),
  {
    groups: () => [],
    colours: () => [],
    facetCoverage: 100,
    placeholder: '搜索…',
  }
)

const emit = defineEmits<{
  (e: 'update:state', next: FilterState): void
}>()

/** 搜索输入防抖：每敲一个字都写 hash 会把历史记录冲爆 */
const SEARCH_DEBOUNCE = 250

const searchText = ref(props.state.q)
const facetOpen = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

/** 外部状态变化（后退、分享链接）时同步回输入框 */
watch(
  () => props.state.q,
  value => {
    if (value !== searchText.value) searchText.value = value
  }
)

const hasFacets = computed(() => props.groups.length > 0 || props.colours.length > 0)
const facetCount = computed(() => props.state.terms.length + props.state.colours.length)

const hasActive = computed(
  () =>
    !!props.state.q.trim() ||
    props.state.tested ||
    props.state.pick ||
    props.state.terms.length > 0 ||
    props.state.colours.length > 0
)

/** 把 slug 换成给人看的中文名 */
const termLabelMap = computed(() => {
  const map = new Map<string, string>()
  for (const group of props.groups) {
    for (const term of group.terms) map.set(term.slug, term.label)
  }
  return map
})
const colourMap = computed(() => {
  const map = new Map<string, FacetColour>()
  for (const colour of props.colours) map.set(colour.slug, colour)
  return map
})

function termLabel(slug: string): string {
  return termLabelMap.value.get(slug) ?? slug
}

function colourLabel(slug: string): string {
  return colourMap.value.get(slug)?.name ?? slug
}

function colourHex(slug: string): string {
  return colourMap.value.get(slug)?.hex ?? '#999'
}

function emitState(next: FilterState) {
  emit('update:state', next)
}

function handleInput() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emitState({ ...props.state, q: searchText.value.trim() }), SEARCH_DEBOUNCE)
}

function clearSearch() {
  if (timer) clearTimeout(timer)
  searchText.value = ''
  emitState({ ...props.state, q: '' })
}

function toggle(kind: FilterKind, slug?: string) {
  emitState(toggleFilter(props.state, kind, slug))
}

function toggleTerm(slug: string) {
  toggle('term', slug)
}

function toggleColour(slug: string) {
  toggle('colour', slug)
}

function reset() {
  if (timer) clearTimeout(timer)
  searchText.value = ''
  emitState({ ...EMPTY_FILTER, terms: [], colours: [] })
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0 12px;
  border-bottom: 1px solid var(--border-light);
}

.search-row {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 8px 34px 8px 34px;
  font-size: 13px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--text-primary);
  outline: none;
}

.search-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.search-icon {
  position: absolute;
  left: 11px;
  font-size: 13px;
  pointer-events: none;
}

.clear-icon {
  position: absolute;
  right: 11px;
  font-size: 13px;
  color: var(--text-tertiary);
  cursor: pointer;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle:hover {
  border-color: var(--primary-color);
  color: var(--text-primary);
}

.toggle.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.toggle-count {
  font-family: monospace;
  font-size: 11px;
  opacity: 0.75;
}

.facet-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--primary-color);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.toggle.active .facet-badge {
  background: #fff;
  color: var(--primary-color);
}

.toggle-arrow {
  font-size: 10px;
  opacity: 0.7;
}

.filter-count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.chip-swatch {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
}

.chip-x {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  line-height: 1;
  color: var(--text-tertiary);
  cursor: pointer;
}

.chip-x:hover {
  color: var(--error-color, #e11d48);
}

.reset-btn {
  border: none;
  background: none;
  padding: 3px 4px;
  font-size: 11px;
  color: var(--primary-color);
  cursor: pointer;
}

/* 分面面板 */
.facet-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-secondary);
  max-height: 320px;
  overflow-y: auto;
}

.facet-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.facet-group-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.facet-terms {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.facet-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
}

.facet-chip:hover {
  border-color: var(--primary-color);
  color: var(--text-primary);
}

.facet-chip.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.facet-chip.empty {
  opacity: 0.35;
}

.facet-count {
  font-family: monospace;
  font-size: 10px;
  opacity: 0.7;
}

.facet-colours {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
  padding: 0;
}

.swatch.active {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}

.swatch.empty {
  opacity: 0.3;
}

.facet-coverage {
  margin: 0;
  font-size: 11px;
  color: var(--warning-color, #b45309);
}

/* 暗色主题 */
:global(.dark) .search-input {
  background: rgba(30, 41, 59, 0.9);
  border-color: #334155;
  color: #f1f5f9;
}
</style>
