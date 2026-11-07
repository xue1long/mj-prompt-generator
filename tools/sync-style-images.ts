import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * 把 midlibrary 的缩略图复制到本项目的预览图目录。
 *
 * 为什么图片也要搬：
 * - 上游按 Referer 门放行，外站热链实测 403，所以图片必须存本地；
 * - 本应用要"双击即用"，不能依赖隔壁仓的目录结构。
 *
 * 搬哪一档：
 * - 只搬 320px 缩略图（实测均 20.7KB/张）；
 * - 不搬 960px 整张样例表（八千多条会到 1GB 级别，浏览用不上）。
 *
 * 幂等：已存在且大于 1KB 的文件直接跳过，重跑只补缺失的。
 */

const MIN_SIZE = 1024

interface ManifestRow {
  id: string
  kind: string
  thumb_path?: string
}

function defaultManifestPath(root: string): string {
  return path.resolve(root, '..', 'ai-video-imge-prompts', 'sites', 'midlibrary', 'manifest.json')
}

function defaultThumbsDir(root: string): string {
  return path.resolve(root, '..', 'ai-video-imge-prompts', 'sites', 'midlibrary', 'thumbs')
}

export interface SyncResult {
  copied: number
  skipped: number
  missing: number
  bytes: number
}

/**
 * 复制风格库用到的缩略图。
 * @param root 项目根目录
 * @param manifestPath midlibrary manifest 路径
 * @param thumbsDir 缩略图源目录
 * @param destDir 目标目录（public/preview-images/midlibrary）
 */
export function syncStyleImages(
  root: string,
  manifestPath: string,
  thumbsDir: string,
  destDir: string
): SyncResult {
  const rows = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ManifestRow[]
  const wanted = rows.filter(r => r.kind === 'artist' || r.kind === 'style_code')

  fs.mkdirSync(destDir, { recursive: true })

  let copied = 0
  let skipped = 0
  let missing = 0
  let bytes = 0

  for (const row of wanted) {
    const srcName = row.thumb_path ? path.basename(row.thumb_path) : `${row.id}.webp`
    const src = path.join(thumbsDir, srcName)
    const dest = path.join(destDir, `${row.id}.webp`)

    if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_SIZE) {
      skipped++
      continue
    }
    if (!fs.existsSync(src)) {
      missing++
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
  const manifestPath = process.env.MIDLIBRARY_MANIFEST ?? defaultManifestPath(root)
  const thumbsDir = process.env.MIDLIBRARY_THUMBS ?? defaultThumbsDir(root)
  const destDir = path.join(root, 'public', 'preview-images', 'midlibrary')

  const result = syncStyleImages(root, manifestPath, thumbsDir, destDir)
  const mb = (result.bytes / 1024 / 1024).toFixed(1)
  console.log(
    `[sync-style-images] 复制 ${result.copied} 张（${mb}MB）· 跳过 ${result.skipped} 张 · 源站缺 ${result.missing} 张`
  )
  if (result.missing > 0) {
    console.log('[sync-style-images] 缺图需先在隔壁仓跑：python tools/fetch.py --site midlibrary --tier thumb')
  }
}
