import type { PromptItem } from '@/types'

/**
 * 条目的显示名。
 *
 * 摄影词库的条目都有中文名；风格条目只有原文名（上游不给中文名），
 * 这种条目显示时回落到英文写法。
 */
export function promptLabel(prompt: PromptItem): string {
  return prompt.prompt_zh?.trim() || prompt.prompt_en
}
