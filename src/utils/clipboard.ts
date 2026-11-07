/**
 * 复制文本到剪贴板。
 *
 * 优先用异步剪贴板 API；它在非安全上下文（部分浏览器的 file:// 场景）
 * 会被拒绝，这时降级到隐藏 textarea + execCommand。
 *
 * @returns 是否复制成功
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      return ok
    } catch {
      return false
    }
  }
}
