/**
 * 把图片存到本地。
 *
 * 为什么不用 `<a download>`：那是跨域地址时浏览器会忽略 download 属性，
 * 直接打开图片而不是存下来。所以改成先取成 blob 再触发一次本地下载。
 *
 * 同源（file:// 下的 dist、或 dev server 的 public/）时 fetch 能直接拿到；
 * 跨域时 fetch 会被 CORS 拦掉，那就退回「新标签页打开图片」让用户自己存。
 */
export async function downloadImageFile(url: string, filename: string): Promise<boolean> {
  if (!url) return false
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    triggerDownload(objectUrl, filename)
    // 立刻 revoke 会让部分浏览器来不及开始下载
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    return true
  } catch {
    // 兜底：新标签页打开原图
    window.open(url, '_blank', 'noopener')
    return false
  }
}

/** 触发一次浏览器下载 */
function triggerDownload(objectUrl: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}
