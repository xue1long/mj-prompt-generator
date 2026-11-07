<template>
  <n-modal
    :show="show"
    preset="card"
    :style="{ maxWidth: '1100px', width: '94%' }"
    :bordered="false"
    :segmented="{ content: true }"
    @update:show="emit('update:show', $event)"
  >
    <template #header>
      <div class="modal-header">
        <span class="modal-title">社区作业</span>
        <span class="modal-sub">{{ job?.author }}</span>
      </div>
    </template>

    <div v-if="job" class="lightbox-body">
      <div class="visual">
        <!-- 主图：按图片自身尺寸显示，不放大（本地最高只有 640px 档） -->
        <div class="main-stage">
          <img
            :src="mainSrc"
            :alt="`第 ${activeIndex + 1} 格`"
            class="main-image"
          />
          <span class="stage-index">第 {{ activeIndex + 1 }} / {{ job.thumbs.length }} 格</span>
          <button class="download-btn" type="button" title="下载这一格" @click="downloadActive">
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

        <!-- 四格缩略图条：点一下切主图 -->
        <div class="thumb-strip">
          <button
            v-for="(thumb, index) in job.thumbs"
            :key="thumb"
            type="button"
            class="strip-cell"
            :class="{ active: index === activeIndex }"
            :title="`第 ${index + 1} 格`"
            @click="activeIndex = index"
          >
            <img :src="getExploreImagePath(thumb)" :alt="`第 ${index + 1} 格`" loading="lazy" />
            <span class="strip-label">第{{ index + 1 }}格</span>
          </button>
        </div>
      </div>

      <div class="side">
        <div class="facts">
          <span class="fact">{{ job.aspect }}</span>
          <span v-if="job.version" class="fact">v{{ job.version }}</span>
          <span class="fact">{{ job.batch }}</span>
          <span class="fact">{{ job.author }}</span>
        </div>

        <!-- 原始提示词 -->
        <div class="block">
          <div class="block-label">原始提示词</div>
          <div class="prompt-text">{{ job.prompt }}</div>
        </div>

        <!-- 风格参考码 -->
        <div v-if="job.sref" class="block">
          <div class="block-label">风格参考码</div>
          <div class="sref-row">
            <code class="sref-code">{{ job.sref }}</code>
            <button class="mini-btn" @click="copySref">复制</button>
            <button class="mini-btn" @click="fillSref">填入 --sref</button>
          </div>
        </div>

        <div class="actions">
          <button class="primary-btn" @click="fillSubject">填入主体与环境</button>
          <button class="plain-btn" @click="copyPrompt">复制提示词</button>
          <a class="source-link" :href="sourceUrl" target="_blank" rel="noopener noreferrer">
            打开原站 ↗
          </a>
        </div>

        <p class="note">
          作业是别人做好的整条提示词，填进「主体与环境」后可以照着改；
          它不是可拼的片段，所以不会进「已选提示词」。
        </p>

        <!--
          提示词结构解析（ADR-0015）：构建期 LLM 按第三章七段式方法论预生成。
          数据是派生数据（config/explore-decomposed.yaml），缺失时整块不渲染，
          灯箱退化为只显示原始提示词。
        -->
        <details
          v-if="decomposition"
          class="structure-block"
          :open="structureOpen"
          @toggle="onStructureToggle"
        >
          <summary class="structure-summary">
            <span class="structure-caret" aria-hidden="true">▸</span>
            <span class="structure-title">提示词结构解析</span>
            <span class="structure-source" :class="sourceKind">{{ sourceLabel }}</span>
            <span class="structure-version">{{ decomposition.methodologyVersion }}</span>
          </summary>

          <div class="structure-body">
            <!-- 框架判定 -->
            <div class="struct-row">
              <span class="struct-label">框架判定</span>
              <span class="struct-value">{{ frameworkLabel }}</span>
            </div>

            <!-- 七段式表格 -->
            <table class="struct-table">
              <thead>
                <tr>
                  <th>段</th>
                  <th>模块</th>
                  <th>命中内容</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="seg in decomposition.segments" :key="seg.code">
                  <td class="seg-code">{{ SEGMENT_NUMERALS[seg.code] ?? seg.code }}</td>
                  <td class="seg-module">{{ seg.module }}</td>
                  <td class="seg-text">{{ seg.text || '—' }}</td>
                  <td class="seg-note">{{ seg.note || '' }}</td>
                </tr>
              </tbody>
            </table>

            <!-- 构图五法 -->
            <div class="struct-section">
              <div class="struct-label">构图五法</div>
              <div v-if="decomposition.composition.length" class="chip-row">
                <span v-for="item in decomposition.composition" :key="item" class="chip">{{ item }}</span>
              </div>
              <div v-else class="struct-empty">未命中</div>
            </div>

            <!-- 词库打标 -->
            <div class="struct-section">
              <div class="struct-label">词库打标</div>
              <div v-for="group in tagGroups" :key="group.label" class="tag-line">
                <span class="tag-key">{{ group.label }}</span>
                <span v-if="group.values.length" class="chip-row">
                  <span v-for="value in group.values" :key="value" class="chip chip-soft">{{ value }}</span>
                </span>
                <span v-else class="struct-empty">无</span>
              </div>
            </div>

            <!-- 参数尾 -->
            <div class="struct-section">
              <div class="struct-label">参数尾</div>
              <div v-if="decomposition.paramTail.params.length" class="chip-row">
                <code v-for="(param, index) in decomposition.paramTail.params" :key="`${param.name}-${index}`" class="param-chip">
                  {{ param.name }}<template v-if="param.value"> {{ param.value }}</template>
                </code>
              </div>
              <div v-else class="struct-empty">正文未写显式参数</div>
            </div>

            <!-- 铁律 / 误区体检 -->
            <div class="struct-section">
              <div class="struct-label">铁律 / 误区体检</div>
              <ul class="health-list">
                <li v-for="item in decomposition.health" :key="item.id" :class="{ 'is-bad': !item.ok }">
                  <span class="health-mark">{{ item.ok ? '✓' : '!' }}</span>
                  <span class="health-id">{{ healthLabel(item.id) }}</span>
                  <span class="health-note">{{ item.note || (item.ok ? '合规' : '需注意') }}</span>
                </li>
              </ul>
            </div>

            <!-- 中文速读 -->
            <div class="struct-section">
              <div class="struct-label">中文速读</div>
              <div class="struct-summary-text">{{ decomposition.summary }}</div>
            </div>

            <p class="structure-disclaimer">
              结构按第三章七段式方法论生成；框架与构图法归属为推断，仅供理解参考。
              本条分解方式：{{ decomposition.model }}。
            </p>
          </div>
        </details>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { NIcon, NModal, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import type { ExploreJob, ExploreJobDecomposition } from '@/types'
import { copyText, getExploreImagePath } from '@/utils'
import { downloadImageFile } from '@/utils/download'

const props = defineProps<{
  show: boolean
  job: ExploreJob | null
  /** 原站地址（回链用） */
  sourceUrl: string
  /** 打开时定位到第几格（从卡片点进来时带过来） */
  initialIndex?: number
  /** 构建期预生成的结构分解；null 时不渲染结构区（优雅降级） */
  decomposition: ExploreJobDecomposition | null
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'fill-subject', job: ExploreJob): void
  (e: 'fill-sref', code: string): void
}>()

const message = useMessage()

/** 分解来源标记：精拆 / 规则兜底如实区分，随数据里的 model 字段自动变化 */
const isFineDecomposition = computed(() => {
  const m = props.decomposition?.model ?? ''
  return m.includes('逐条精拆') || m.includes('手工')
})
const sourceKind = computed(() => (isFineDecomposition.value ? 'is-fine' : 'is-rule'))
const sourceLabel = computed(() => {
  const m = props.decomposition?.model ?? ''
  if (m.includes('手工')) return '手工精拆'
  if (m.includes('逐条精拆')) return '逐条精拆'
  return '规则解析'
})

/** 七段式段号 → 带圈数字 */
const SEGMENT_NUMERALS: Record<string, string> = {
  '1': '①',
  '2': '②',
  '3': '③',
  '4': '④',
  '5': '⑤',
  '6': '⑥',
  '7': '⑦',
}

/** 体检项 id → 中文标签（R=铁律 M=误区 V=V8.2 版本约束） */
const HEALTH_LABELS: Record<string, string> = {
  R1: '名词短语，别写句子',
  R2: '主体放最前',
  R3: '参数末尾 · 英文半角',
  R4: '用 --no 做减法',
  R5: '少而精 > 堆料',
  M1: '中文标点',
  M2: '多主体',
  M3: '期待准确文字',
  M4: '堆砌 8k/masterpiece',
  M5: '中文长句',
  V1: ':: 权重（V7+ 移除）',
  V2: '--style raw（仅 V5/V6）',
  V3: '--no 逐词审核',
  V4: '--q/--oref/--cref 已移除',
}

function healthLabel(id: string): string {
  return HEALTH_LABELS[id] ?? id
}

const frameworkLabel = computed(() => {
  const framework = props.decomposition?.framework
  return framework ? `${framework}框架（推断）` : '未判定'
})

const tagGroups = computed<Array<{ label: string; values: string[] }>>(() => {
  const tags = props.decomposition?.tags
  if (!tags) return []
  return [
    { label: '风格 / 媒介', values: tags.style },
    { label: '视角 / 灯光', values: [...tags.angle, ...tags.lighting] },
    { label: '情感', values: tags.emotion },
  ]
})

/** 当前显示第几格 */
const activeIndex = ref(0)

/**
 * 结构解析折叠区默认展开（ADR-0015）。
 * 用响应式状态而不是静态 open：用户手动折叠后由原生 toggle 事件同步回来，
 * 换作业 / 重新打开灯箱时再重置为展开，避免上一条的折叠状态串到下一条。
 */
const structureOpen = ref(true)

function onStructureToggle(event: Event) {
  structureOpen.value = (event.target as HTMLDetailsElement).open
}

watch(
  () => [props.show, props.job?.id] as const,
  () => {
    structureOpen.value = true
  }
)

/** 换作业时定位到指定的那一格 */
watch(
  () => [props.job?.id, props.initialIndex] as const,
  ([, index]) => {
    activeIndex.value = Math.min(Math.max(index ?? 0, 0), (props.job?.thumbs.length ?? 1) - 1)
  },
  { immediate: true }
)

/** 主图用 640px 灯箱档；没有就退回 320px 缩略图 */
const mainSrc = computed(() => {
  const job = props.job
  if (!job) return ''
  const mid = job.mids?.[activeIndex.value]
  return getExploreImagePath(mid || job.thumbs[activeIndex.value] || '')
})

async function copyPrompt() {
  if (!props.job) return
  const ok = await copyText(props.job.prompt)
  message[ok ? 'success' : 'error'](ok ? '提示词已复制' : '复制失败')
}

async function copySref() {
  if (!props.job?.sref) return
  const ok = await copyText(props.job.sref)
  message[ok ? 'success' : 'error'](ok ? '风格参考码已复制' : '复制失败')
}

function fillSubject() {
  if (!props.job) return
  emit('fill-subject', props.job)
}

function fillSref() {
  if (!props.job?.sref) return
  emit('fill-sref', props.job.sref)
}

function downloadActive() {
  const job = props.job
  if (!job) return
  const source = getExploreImagePath(
    job.mids?.[activeIndex.value] || job.thumbs[activeIndex.value] || ''
  )
  downloadImageFile(source, `midjourney-${job.id}_${activeIndex.value + 1}.webp`)
}
</script>

<style scoped>
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

.modal-sub {
  font-size: 12px;
  color: var(--text-tertiary);
}

.lightbox-body {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  align-items: flex-start;
  /* 灯箱唯一滚动区：结构区默认展开后很长，整体在这里滚，避免 .side 与 modal 外层 NScrollbar 形成嵌套滚动导致滚不到底。不设 contain，保留滚到底后向 modal 外层的滚动链作兜底 */
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  padding-right: 4px;
  padding-bottom: 4px;
}

/* 左侧：大图 + 缩略图条 */
.visual {
  flex: 0 0 520px;
  width: 520px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 主图舞台：按图片自身尺寸显示，不放大 */
.main-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  padding: 10px;
  background: var(--bg-tertiary);
  border-radius: 10px;
}

.main-image {
  display: block;
  max-width: 100%;
  max-height: 560px;
  width: auto;
  height: auto;
  border-radius: 6px;
}

.stage-index {
  position: absolute;
  left: 12px;
  top: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}

.download-btn {
  position: absolute;
  right: 12px;
  top: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s ease;
}

.download-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

/* 四格缩略图条 */
.thumb-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.strip-cell {
  position: relative;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 8px;
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
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1px 0;
  text-align: center;
  font-size: 10px;
  line-height: 1.5;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  pointer-events: none;
}

/* 右侧：信息区。滚动统一由 .lightbox-body 负责，这里保持普通 flex 列，避免嵌套滚动 */
.side {
  flex: 1 1 320px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.fact {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  font-size: 11px;
  color: var(--text-secondary);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.block-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.prompt-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  max-height: 260px;
  overflow-y: auto;
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---- 提示词结构解析（ADR-0015） ---- */
.structure-block {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-secondary);
  /* clip 只做圆角裁剪，不创建滚动容器；hidden 在展开后会吃掉滚轮，让灯箱滚不到底 */
  overflow: clip;
}

.structure-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.structure-summary::-webkit-details-marker {
  display: none;
}

.structure-summary:hover {
  background: var(--bg-tertiary);
}

.structure-caret {
  display: inline-block;
  font-size: 11px;
  color: var(--text-tertiary);
  transition: transform 0.15s ease;
}

.structure-block[open] .structure-caret {
  transform: rotate(90deg);
}

.structure-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.structure-source {
  font-size: 10px;
  border-radius: 4px;
  padding: 1px 6px;
  border: 1px solid var(--border-light);
  color: var(--text-tertiary);
}

.structure-source.is-fine {
  color: var(--text-primary);
  border-color: var(--text-tertiary);
  font-weight: 600;
}

.structure-version {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 1px 6px;
}

.structure-body {
  padding: 4px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--border-light);
}

.struct-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-top: 8px;
}

.struct-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  flex: 0 0 auto;
}

.struct-value {
  font-size: 12px;
  color: var(--text-primary);
}

.struct-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 11px;
}

.struct-table th {
  text-align: left;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 4px 6px;
  border-bottom: 1px solid var(--border-light);
}

.struct-table td {
  padding: 5px 6px;
  vertical-align: top;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-secondary);
  word-break: break-word;
  line-height: 1.5;
}

.struct-table th:nth-child(1) { width: 26px; }
.struct-table th:nth-child(2) { width: 74px; }
.struct-table th:nth-child(3) { width: auto; }
.struct-table th:nth-child(4) { width: 34%; }

.seg-code {
  color: var(--primary-color) !important;
  font-weight: 700;
}

.seg-module {
  color: var(--text-primary) !important;
  font-weight: 600;
}

.seg-text {
  color: var(--text-primary) !important;
}

.seg-note {
  font-size: 10px;
  color: var(--text-tertiary) !important;
}

.struct-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.chip {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
}

.chip-soft {
  font-family: inherit;
}

.tag-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.tag-key {
  flex: 0 0 68px;
  font-size: 10px;
  color: var(--text-tertiary);
}

.param-chip {
  font-family: monospace;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-left: 2px solid var(--primary-color);
}

.struct-empty {
  font-size: 11px;
  color: var(--text-tertiary);
}

.health-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.health-list li {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.health-mark {
  flex: 0 0 12px;
  font-weight: 700;
  color: #4caf82;
}

.health-list li.is-bad .health-mark {
  color: #e06666;
}

.health-list li.is-bad .health-note {
  color: #e06666;
}

.health-id {
  flex: 0 0 auto;
  font-weight: 600;
  color: var(--text-primary);
}

.health-note {
  flex: 1 1 auto;
  word-break: break-word;
}

.struct-summary-text {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-tertiary);
}

.structure-disclaimer {
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

/* ---- 风格参考码 / 操作区 ---- */
.sref-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sref-code {
  font-family: monospace;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-secondary);
  border-left: 3px solid var(--primary-color);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.primary-btn {
  border: 1px solid var(--primary-color);
  background: var(--primary-color);
  color: var(--text-primary);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  cursor: pointer;
}

.plain-btn,
.mini-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 12px;
  padding: 6px 12px;
  cursor: pointer;
}

.mini-btn {
  font-size: 11px;
  padding: 3px 8px;
}

.plain-btn:hover,
.mini-btn:hover {
  color: var(--text-primary);
  border-color: var(--primary-color);
}

.source-link {
  font-size: 12px;
  color: var(--text-tertiary);
  text-decoration: none;
}

.source-link:hover {
  color: var(--primary-color);
}

.note {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-tertiary);
}
</style>
