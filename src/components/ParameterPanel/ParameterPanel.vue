<template>
  <div class="parameter-panel">
    <n-spin :show="loading" description="加载中...">
      <div v-if="error" class="error-state">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{{ error }}</span>
        <n-button size="small" @click="handleRetry">重试</n-button>
      </div>

      <div v-else-if="displayParams.length > 0" class="parameters-container">
        <div
          v-for="item in displayParams"
          :key="item.param.id"
          class="parameter-item"
          :class="{ 'is-unsupported': !item.supported }"
          :data-param-id="item.param.id"
        >
          <div class="param-label">
            <span class="param-name">{{ item.param.name }}</span>
            <code class="param-flag">{{ item.param.param }}</code>
            <span v-if="item.param.description" class="param-hint">
              <n-tooltip :style="{ maxWidth: '280px' }">
                <template #trigger>
                  <span class="hint-icon">?</span>
                </template>
                {{ item.param.description }}
              </n-tooltip>
            </span>
            <span v-if="!item.supported" class="unsupported-badge">
              <n-tooltip :style="{ maxWidth: '260px' }">
                <template #trigger>
                  <span class="badge-text">当前版本不可用</span>
                </template>
                {{ item.reason }}
              </n-tooltip>
            </span>
          </div>

          <!-- 选择器 -->
          <n-select
            v-if="item.param.type === 'select'"
            v-model:value="values[item.param.id]"
            :options="item.options as any"
            :disabled="!item.supported"
            size="small"
            @update:value="(v: any) => handleValueChange(item.param, v)"
          />

          <!-- 滑块 -->
          <div v-else-if="item.param.type === 'slider'" class="slider-container">
            <n-slider
              v-model:value="values[item.param.id]"
              :min="item.range.min"
              :max="item.range.max"
              :step="item.range.step"
              :disabled="!item.supported"
              @update:value="(v: any) => handleValueChange(item.param, v)"
            />
            <span class="slider-value">{{ values[item.param.id] }}</span>
          </div>

          <!-- 文本输入 -->
          <n-input
            v-else-if="item.param.type === 'input'"
            v-model:value="values[item.param.id]"
            :placeholder="item.param.placeholder || ''"
            :disabled="!item.supported"
            size="small"
            @update:value="(v: any) => handleValueChange(item.param, v)"
          />

          <!-- 复选框 -->
          <n-checkbox
            v-else-if="item.param.type === 'checkbox'"
            v-model:checked="values[item.param.id]"
            :disabled="!item.supported"
            @update:checked="(v: any) => handleValueChange(item.param, v)"
          >
            {{ item.param.label || '启用' }}
          </n-checkbox>
        </div>

        <!-- 重置按钮 -->
        <div class="reset-section">
          <n-button size="small" @click="handleReset" secondary>
            🔄 重置为默认值
          </n-button>
        </div>
      </div>

      <div v-else class="empty-state">
        <span class="empty-icon">📦</span>
        <span class="empty-text">暂无参数配置</span>
      </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NSpin, NButton, NSelect, NSlider, NInput, NCheckbox, NTooltip } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { useParameterStore } from '@/stores/parameterStore'
import {
  effectiveOptions,
  effectiveRange,
  isSupportedByVersion,
} from '@/utils/parameterCompat'
import type { Parameter, SelectOption } from '@/types'

const parameterStore = useParameterStore()
const { loading, error, config, values } = storeToRefs(parameterStore)

interface DisplayParam {
  param: Parameter
  supported: boolean
  options: SelectOption[]
  range: { min: number; max: number; step: number }
  reason: string
}

/** 当前模型版本 */
const currentVersion = computed(() => parameterStore.currentVersion)

/** 参数列表 + 版本兼容状态 */
const displayParams = computed<DisplayParam[]>(() => {
  const list = config.value?.parameters || []
  const version = currentVersion.value

  return list.map(param => {
    const supported = isSupportedByVersion(param, version)
    return {
      param,
      supported,
      options: effectiveOptions(param, version),
      range: effectiveRange(param, version),
      reason: supported
        ? ''
        : `当前模型版本${version ? ` ${version}` : ''}不支持 ${param.param}`,
    }
  })
})

// 处理参数变化
const handleValueChange = (param: Parameter, value: any) => {
  // 模型版本变化时，连带清洗其他参数（当前版本不支持的一律回到默认值）
  if (param.id === 'version') {
    parameterStore.setVersion(String(value))
    return
  }
  parameterStore.setValue(param.id, value)
  parameterStore.saveToLocalStorage()
}

// 重置参数
const handleReset = () => {
  parameterStore.resetToDefaults()
}

// 重试加载
const handleRetry = () => {
  parameterStore.loadConfig()
}
</script>

<style scoped>
.parameter-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.parameters-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

/* 自定义滚动条 */
.parameters-container::-webkit-scrollbar {
  width: 6px;
}

.parameters-container::-webkit-scrollbar-track {
  background: transparent;
}

.parameters-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.parameters-container::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

.parameter-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 当前版本不支持的参数 */
.parameter-item.is-unsupported {
  opacity: 0.55;
}

.param-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.param-name {
  white-space: nowrap;
}

.param-flag {
  font-family: monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 0 4px;
}

.param-hint {
  display: inline-flex;
  align-items: center;
}

.unsupported-badge {
  display: inline-flex;
  align-items: center;
}

.badge-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-yellow);
  background: var(--color-yellow);
  border-radius: 4px;
  padding: 1px 6px;
  cursor: help;
}

.hint-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-blue);
  color: var(--text-blue);
  font-size: 11px;
  font-weight: 700;
  cursor: help;
  transition: all 0.2s ease;
}

.hint-icon:hover {
  transform: scale(1.15);
  box-shadow: 0 2px 8px var(--shadow-color);
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-container :deep(.n-slider) {
  flex: 1;
}

.slider-value {
  min-width: 40px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: monospace;
}

.reset-section {
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  display: flex;
  justify-content: center;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--error-color);
}

.error-icon {
  font-size: 48px;
  opacity: 0.8;
}

.error-text {
  font-size: 14px;
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
}

/* 暗色主题 */
:global(.dark) .parameters-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

:global(.dark) .parameters-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
