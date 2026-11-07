import type { ParameterValues, SelectedPrompt } from '@/types'

/**
 * 会话持久化。
 *
 * 会话 = 已选提示词 + 主体与环境 + 参数值，刷新或重开浏览器后应当原样恢复。
 */

const SESSION_KEY = 'mj-session-v1'
/** 旧版本把参数值单独存在这个 key 里，首次运行时迁移过来 */
const LEGACY_PARAMETER_KEY = 'mj-parameter-values'

export interface SessionSnapshot {
  selectedPrompts: SelectedPrompt[]
  subjectEnvironment: string
  parameterValues: ParameterValues
}

function isStorageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/**
 * 读取会话快照；不存在时返回 null
 */
export function loadSession(): SessionSnapshot | null {
  if (!isStorageAvailable()) return null

  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return {
          selectedPrompts: Array.isArray(parsed.selectedPrompts) ? parsed.selectedPrompts : [],
          subjectEnvironment:
            typeof parsed.subjectEnvironment === 'string' ? parsed.subjectEnvironment : '',
          parameterValues:
            parsed.parameterValues && typeof parsed.parameterValues === 'object'
              ? parsed.parameterValues
              : {},
        }
      }
    }

    // 迁移旧版本写下的参数值
    const legacy = localStorage.getItem(LEGACY_PARAMETER_KEY)
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy)
      return {
        selectedPrompts: [],
        subjectEnvironment: '',
        parameterValues: parsedLegacy && typeof parsedLegacy === 'object' ? parsedLegacy : {},
      }
    }

    return null
  } catch (error) {
    console.error('Failed to load session:', error)
    return null
  }
}

/**
 * 合并式保存会话片段
 * @param patch 需要更新的部分
 */
export function updateSession(patch: Partial<SessionSnapshot>): void {
  if (!isStorageAvailable()) return

  try {
    const current = loadSession() ?? {
      selectedPrompts: [],
      subjectEnvironment: '',
      parameterValues: {},
    }

    const next: SessionSnapshot = {
      selectedPrompts: patch.selectedPrompts ?? current.selectedPrompts,
      subjectEnvironment: patch.subjectEnvironment ?? current.subjectEnvironment,
      parameterValues: patch.parameterValues ?? current.parameterValues,
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify(next))
  } catch (error) {
    console.error('Failed to save session:', error)
  }
}

/**
 * 清空会话
 */
export function clearSession(): void {
  if (!isStorageAvailable()) return
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch (error) {
    console.error('Failed to clear session:', error)
  }
}
