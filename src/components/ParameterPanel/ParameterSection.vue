<template>
  <n-card
    size="small"
    :bordered="false"
    class="parameter-panel-card"
    :class="{ 'is-collapsed': collapsed }"
  >
    <template #header>
      <div class="panel-header">
        <div class="panel-heading">
          <h3 class="panel-title">⚙️ 参数设置</h3>
          <p class="panel-description">调整 Midjourney 生成参数</p>
        </div>

        <div class="panel-header-extra">
          <!-- 收起时仍能看到当前参数，避免右侧最终提示词里的参数"凭空出现" -->
          <code
            v-if="collapsed && parameterSummary"
            class="panel-summary"
            :title="parameterSummary"
          >{{ parameterSummary }}</code>

          <button
            type="button"
            class="collapse-toggle"
            data-role="parameter-panel-toggle"
            :aria-expanded="!collapsed"
            aria-controls="parameter-panel-body"
            @click="toggle"
          >
            <span class="toggle-icon" :class="{ 'is-collapsed': collapsed }">▾</span>
            <span class="toggle-text">{{ collapsed ? '展开' : '收起' }}</span>
          </button>
        </div>
      </div>
    </template>

    <!--
      用 v-show 而不是 v-if：折叠时参数节点仍留在 DOM 里。
      一来参数配置与面板可见性无关，二来冒烟验证依赖这 24 个节点做断言。
    -->
    <div id="parameter-panel-body" v-show="!collapsed" class="parameter-panel-body">
      <ParameterPanel />
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NCard } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { useParameterStore } from '@/stores/parameterStore'
import { PromptBuilder } from '@/utils/promptBuilder'
import ParameterPanel from './ParameterPanel.vue'

/** 折叠状态是界面偏好，不是创作状态，因此不写进 mj-session-v1 会话快照 */
const COLLAPSE_KEY = 'mj-parameter-panel-collapsed'

/** 读取折叠状态；没有记录时默认收起（参数区已移到词库之下，默认展开会把词库挤扁） */
function readCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return raw === null ? true : raw === '1'
  } catch {
    return true
  }
}

const collapsed = ref(readCollapsed())

const parameterStore = useParameterStore()
const { values, config } = storeToRefs(parameterStore)

/**
 * 收起时显示的参数摘要。
 * 直接复用最终提示词的参数拼装逻辑，两处显示不可能对不上。
 */
const parameterSummary = computed(() => {
  const cfg = config.value
  if (!cfg) return ''
  return PromptBuilder.addParameters('', values.value, cfg).trim()
})

/** 展开 / 收起 */
function toggle() {
  collapsed.value = !collapsed.value
  try {
    localStorage.setItem(COLLAPSE_KEY, collapsed.value ? '1' : '0')
  } catch {
    // 存储不可用时忽略：折叠只是界面状态，不影响功能
  }
}
</script>

<style scoped>
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.panel-heading {
  min-width: 0;
}

.panel-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.panel-description {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 4px 0 0 0;
}

/* 收起时只留一条标题，把空间让给提示词库 */
.is-collapsed .panel-description {
  display: none;
}

.panel-header-extra {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 收起状态下显示的参数摘要 */
.panel-summary {
  font-family: 'Courier New', Consolas, monospace;
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 2px 6px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 折叠开关 */
.collapse-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.collapse-toggle:hover {
  color: var(--text-blue);
  border-color: var(--text-blue);
}

.collapse-toggle:focus-visible {
  outline: 2px solid var(--text-blue);
  outline-offset: 2px;
}

.toggle-icon {
  display: inline-block;
  font-size: 12px;
  line-height: 1;
  transition: transform 0.2s ease;
}

.toggle-icon.is-collapsed {
  transform: rotate(-90deg);
}
</style>
