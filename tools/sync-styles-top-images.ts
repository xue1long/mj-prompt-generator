import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * 把 styles_top 的缩略图复制到本项目的预览图目录。
 *
 * 与 sync-style-images.ts 同一套约定：图片不入库（gitignore），从隔壁仓复制，
 * 保证「双击即用」不依赖隔壁仓目录结构。
 *
 * 幂等：已存在且大于 1KB 的文件直接跳过，重跑只补缺失的。
 */

const MIN_SIZE = 1024

/** 默认的缩略图目录：隔壁仓 */
function defaultThumbsDir(root: string): string {
  return path.resolve(root, '..', 'ai-video-imge-prompts', 'exports', 'styles_top', 'thumbs')
}

export interface SyncResult {
  copied: number
  skipped: number
  missing: number
  bytes: number
}

/**
 * 复制 styles_top 缩略图。
 * @param root 项目根目录
 * @param thumbsDir 缩略图源目录（隔壁仓 exports/styles_top/thumbs）
 * @param destDir 目标目录（public/preview-images/midjourney-styles-top）
 */
export function syncStylesTopImages(root: string, thumbsDir: string, destDir: string): SyncResult {
  fs.mkdirSync(destDir, { recursive: true })

  let copied = 0
  let skipped = 0
  let missing = 0
  let bytes = 0

  if (!fs.existsSync(thumbsDir)) {
    console.warn(`[sync-styles-top-images] 源目录不存在: ${thumbsDir}`)
    return { copied, skipped, missing, bytes }
  }

  const files = fs.readdirSync(thumbsDir).filter(f => f.toLowerCase().endsWith('.webp'))
  for (const f of files) {
    const src = path.join(thumbsDir, f)
    const dest = path.join(destDir, f)
    if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_SIZE) {
      skipped++
      continue
    }
    fs.copyFileSync(src, dest)
    copied++
    bytes += fs.statSync(dest).size
  }

  void root
  return { copied, skipped, missing, bytes }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const thumbsDir = process.env.STYLES_TOP_THUMBS ?? defaultThumbsDir(root)
  const destDir = path.join(root, 'public', 'preview-images', 'midjourney-styles-top')

  const result = syncStylesTopImages(root, thumbsDir, destDir)
  const mb = (result.bytes / 1024 / 1024).toFixed(1)
  console.log(
    `[sync-styles-top-images] 复制 ${result.copied} 张（${mb}MB）· 跳过 ${result.skipped} 张 · ` +
      `源站缺 ${result.missing} 张`
  )
  if (!fs.existsSync(thumbsDir)) {
    console.log('[sync-styles-top-images] 源目录缺失，请先确认隔壁仓 exports/styles_top/thumbs/ 存在')
  }
}
