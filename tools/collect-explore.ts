import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import sharp from 'sharp'
import type { ExploreAspect, ExploreBatch, ExploreConfig, ExploreJob } from '../shared/types/explore'

/**
 * 采集 Midjourney 探索榜 —— 生成 config/explore.yaml 与 public/explore/thumbs/。
 *
 * 数据源：Midjourney 官网 Explore 榜的匿名只读接口
 *   GET https://www.midjourney.com/api/explore?page=N&feed=top&_ql=explore
 *   4 页 × 50 = 200 条作业；page 从 0 开始，page=4 起返回空数组。
 *
 * 为什么本项目自己采（而不是读隔壁仓的 manifest）：
 * - 隔壁仓每天在换榜，读它的快照等于越用越旧；
 * - 数据归属要跟着本项目走，隔壁仓一改这里就坏。
 * 见 docs/adr/0013-explore-board-is-its-own-page-collected-daily.md。
 *
 * Cloudflare 的两道坎（实测）：
 *   1. 首页与接口会按 TLS 指纹（JA3）拦掉非浏览器客户端；
 *   2. cdn.midjourney.com 的图片必须带着首页下发的 __cf_bm cookie 才稳定返回，
 *      不带 cookie 约有 1/4 的请求被挑战成 403。
 * 所以这里统一走 Windows 自带的 curl.exe（Schannel 的 TLS 指纹像浏览器），
 * 并先访问一次 explore 页把通行证 cookie 存进临时 cookie jar。
 *
 * 产出：
 *   config/explore.yaml          快照（构建期内联进产物）
 *   public/explore/thumbs/*.webp  四格缩略图，重编码成 320px
 *
 * 失败即中止：不写快照、不删旧图。宁可给旧数据，也不让页面开天窗。
 */

/** 上游作业（只声明用得到的字段） */
export interface ExploreApiJob {
  id: string
  width?: number
  height?: number
  username_v2?: string
  display_name?: string
  enqueue_time?: number
  prompt?: {
    decodedPrompt?: Array<{ content?: string; weight?: number }>
    ar?: { w?: number; h?: number } | string | null
    version?: string | number
    styleRef?: Array<{ t?: string; content?: string; weight?: number }>
  }
  items?: Array<{ server_filtered?: boolean }>
}

/** 上游常量 */
export const EXPLORE_API = 'https://www.midjourney.com/api/explore'
export const EXPLORE_SOURCE_URL = 'https://www.midjourney.com/explore?tab=top'
export const EXPLORE_CLEARANCE_URL = 'https://www.midjourney.com/explore?tab=styles_top'
export const CDN_BASE = 'https://cdn.midjourney.com/'

/** 提示词短于这个长度就丢弃：这种作业抄进「主体与环境」也没有内容 */
export const MIN_PROMPT_LENGTH = 20
/** 保留窗口（天） */
export const DEFAULT_WINDOW_DAYS = 14
/** 缩略图宽度（重编码后）—— 网格与缩略图条用这一档 */
export const THUMB_WIDTH = 320
/** 灯箱大图宽度（重编码后）—— 这一档进 dist，体积大但离线可用 */
export const MID_WIDTH = 640
/** 标题截断长度（与隔壁仓 manifest 的 title 口径一致） */
export const TITLE_LENGTH = 81
/** 页面显示的作者名（上游账号名是 UUID，没有信息量） */
export const ANONYMOUS_AUTHOR = '匿名作者'

/** 浏览器化的请求头 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const PAGE_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

const API_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.midjourney.com/explore?tab=top',
  'X-CSRF-Protection': '1',
  _ql: 'explore',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
}

const IMAGE_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.midjourney.com',
  Referer: 'https://www.midjourney.com/',
  'Sec-Fetch-Dest': 'image',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'same-site',
}

// ── 纯函数（可单测） ─────────────────────────────────────

/** 把上游的分段提示词拼回可读原文 */
export function promptTextOf(prompt: ExploreApiJob['prompt']): string {
  const parts: string[] = []
  for (const seg of prompt?.decodedPrompt ?? []) {
    const content = (seg.content ?? '').trim()
    if (!content) continue
    const weight = seg.weight
    parts.push(weight !== undefined && weight !== 1 ? `${content}::${weight}` : content)
  }
  return parts.join(' ').trim()
}

/**
 * 宽高比：用上游声明的值（prompt.ar）。
 * 已核对 1016/1016 条与真实像素吻合；不要改用像素最简比（会碎成 51:91 这种）。
 */
export function aspectOf(job: ExploreApiJob): string {
  const ar = job.prompt?.ar
  if (ar && typeof ar === 'object' && ar.w && ar.h) return `${ar.w}:${ar.h}`
  if (typeof ar === 'string' && ar.includes(':')) return ar.replace('/', ':')
  const w = job.width ?? 0
  const h = job.height ?? 0
  if (!w || !h) return ''
  const g = gcd(w, h)
  return `${w / g}:${h / g}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * 风格参考码：上游 prompt.styleRef 里 t==="seed" 的是数字码，
 * t==="url" 的是图片型参考（没有码），不要混进来。
 */
export function styleRefsOf(prompt: ExploreApiJob['prompt']): string[] {
  const out: string[] = []
  for (const item of prompt?.styleRef ?? []) {
    const t = (item?.t ?? '').trim()
    const content = String(item?.content ?? '').trim()
    if (t === 'url') continue
    const code = t === 'seed' || t === 'sref' || t === 'style' ? content : t
    if (!code || code === 'url' || code.startsWith('http')) continue
    if (!out.includes(code)) out.push(code)
  }
  return out
}

/** UUID 形态的账号名（上游有 227 个这种占位） */
export function isPlaceholderAuthor(name: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name.trim())
}

/** 作者显示名：优先 display_name（真人名），账号名是 UUID 就显示「匿名作者」 */
export function authorNameOf(job: ExploreApiJob): string {
  const display = (job.display_name ?? '').trim()
  const account = (job.username_v2 ?? '').trim()
  if (display && !isPlaceholderAuthor(display)) return display
  if (account && !isPlaceholderAuthor(account)) return account
  return ANONYMOUS_AUTHOR
}

/** 这条作业能不能要：提示词太短等于没有内容 */
export function isUsableJob(job: ExploreApiJob): boolean {
  const text = promptTextOf(job.prompt)
  return text.length >= MIN_PROMPT_LENGTH
}

/** 缩略图路径（相对于 public/explore/） */
export function thumbPathOf(jobId: string, index: number): string {
  return `thumbs/${jobId}_${index}.webp`
}

/** 灯箱大图路径（相对于 public/explore/） */
export function midPathOf(jobId: string, index: number): string {
  return `mid/${jobId}_${index}.webp`
}

/**
 * 标题 = 提示词截断到 81 字。
 *
 * 口径与隔壁仓 manifest 的 title 一致（那边 1016 条作业的 title 全都是
 * 「提示词的前缀 + 省略号」），这样两批数据的标题规则相同。
 */
export function titleOf(prompt: string): string {
  const text = prompt.trim()
  if (text.length <= TITLE_LENGTH) return text
  return `${text.slice(0, TITLE_LENGTH).trimEnd()}…`
}

/** 上游作业 → 快照里的作业 */
export function toExploreJob(job: ExploreApiJob, batch: string): ExploreJob {
  const count = Math.max(1, job.items?.length ?? 4)
  const refs = styleRefsOf(job.prompt)
  const prompt = promptTextOf(job.prompt)
  return {
    id: job.id,
    prompt,
    title: titleOf(prompt),
    author: authorNameOf(job),
    authorId: (job.username_v2 ?? '').trim() || undefined,
    aspect: aspectOf(job),
    version: job.prompt?.version !== undefined ? String(job.prompt.version) : '',
    enqueueTime: job.enqueue_time ?? 0,
    batch,
    // 多个码用空格分隔：Midjourney 的 --sref 就是这么写多个码的
    sref: refs.length ? refs.join(' ') : undefined,
    thumbs: Array.from({ length: count }, (_, i) => thumbPathOf(job.id, i)),
    mids: Array.from({ length: count }, (_, i) => midPathOf(job.id, i)),
  }
}

/**
 * 合并两组作业：按 id 去重，**base 那条为准**。
 *
 * 为什么是 base 赢：同一个作业会连续几天出现在榜上，而它的内容（提示词、
 * 成图）是不变的，变的是"哪天又出现了"。所以批次取**第一次采集到的那天**，
 * 历史批次才稳定——否则每天重采都会把老作业挪进今天的批次，几天后历史就空了。
 */
export function mergeJobs(base: ExploreJob[], overlay: ExploreJob[]): ExploreJob[] {
  const byId = new Map<string, ExploreJob>()
  for (const job of overlay) byId.set(job.id, job)
  for (const job of base) byId.set(job.id, job)
  return [...byId.values()]
}

/**
 * 采新批次时的合并口径：**同一批次整体替换，别批次保留首次采集日**。
 * 榜单一天里会换好几次；不替换的话，一天重采几次就把名单越滚越大，
 * 一批不再是"当天榜单的快照"了。
 */
export function replaceBatch(
  existing: ExploreJob[],
  batch: string,
  incoming: ExploreJob[]
): ExploreJob[] {
  return mergeJobs(
    existing.filter(job => job.batch !== batch),
    incoming
  )
}

/** 只保留最近 windowDays 个采集批次（按批次日期） */
export function pruneToWindow(jobs: ExploreJob[], windowDays: number): ExploreJob[] {
  const days = [...new Set(jobs.map(j => j.batch))].sort().reverse().slice(0, windowDays)
  const keep = new Set(days)
  return jobs.filter(j => keep.has(j.batch))
}

/** 采集批次清单（新到旧） */
export function batchesOf(jobs: ExploreJob[]): ExploreBatch[] {
  const map = new Map<string, ExploreBatch>()
  for (const job of jobs) {
    const entry = map.get(job.batch) ?? {
      key: job.batch,
      name: job.batch.slice(5),
      jobs: 0,
      images: 0,
    }
    entry.jobs += 1
    entry.images += job.thumbs.length
    map.set(job.batch, entry)
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key))
}

/** 宽高比清单（作业数降序）—— 网格按作业铺，计数也是作业数 */
export function aspectsOf(jobs: ExploreJob[]): ExploreAspect[] {
  const counts = new Map<string, number>()
  for (const job of jobs) {
    if (!job.aspect) continue
    counts.set(job.aspect, (counts.get(job.aspect) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, name: aspectLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/** 宽高比的中文显示名 */
export function aspectLabel(key: string): string {
  const [w, h] = key.split(':').map(Number)
  if (!w || !h) return key
  const vertical = h > w
  const square = w === h
  const name = square ? '方形' : vertical ? '竖版' : '横版'
  return `${name} ${key}`
}

/** 组装快照配置 */
export function buildExploreConfig(
  jobs: ExploreJob[],
  meta: { generatedAt: string; windowDays: number; fetched: number; dropped: number }
): ExploreConfig {
  return {
    source: {
      name: 'midjourney-explore',
      url: EXPLORE_SOURCE_URL,
      license: '已获许可，可分发（署名 + 回链原站）',
      generatedAt: meta.generatedAt,
      windowDays: meta.windowDays,
      fetched: meta.fetched,
      dropped: meta.dropped,
    },
    batches: batchesOf(jobs),
    aspects: aspectsOf(jobs),
    jobs,
  }
}

/** 生成 YAML 文本 */
export function renderExploreYaml(config: ExploreConfig): string {
  const header = [
    '# 生成物 —— 请勿手改。',
    '# 由 tools/collect-explore.ts 从 Midjourney 官网 Explore 榜采集生成',
    '#（npm run collect:explore）。单一来源：www.midjourney.com/explore?tab=top。',
    '# 授权：已获许可，可分发（署名 + 回链原站）。',
    '',
  ].join('\n')
  const body = yaml.dump(config, { noRefs: true, lineWidth: 200, sortKeys: false })
  return header + body
}

/** 本地时区的 YYYY-MM-DD */
export function localISODate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── 网络（curl 通道） ────────────────────────────────────

interface CurlResult {
  status: number
  body: Buffer
}

/** 跑一次 curl：参数直接给 curl，不走 stdin 传参 */
function curl(args: string[], timeoutMs = 90_000): Promise<CurlResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'curl.exe',
      ['-sS', '--max-time', String(Math.max(1, Math.floor(timeoutMs / 1000))), ...args],
      { windowsHide: true }
    )
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', c => chunks.push(c as Buffer))
    child.stderr.on('data', c => {
      stderr += String(c)
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`curl 退出码 ${code}: ${stderr.trim().slice(0, 200)}`))
        return
      }
      const body = Buffer.concat(chunks)
      const isHtml = body.subarray(0, 64).toString('utf-8').trimStart().startsWith('<')
      resolve({ status: isHtml ? 403 : 200, body })
    })
  })
}

function headerArgs(headers: Record<string, string>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(headers)) out.push('-H', `${k}: ${v}`)
  return out
}

/**
 * 访问 explore 页，拿到 Cloudflare 通行证（__cf_bm）。
 * 拿不到不算失败：接口本身有时不需要通行证就能通，继续往下走。
 */
export async function ensureClearance(cookieFile: string): Promise<boolean> {
  const args = [
    '-sS',
    '-L',
    '-c',
    cookieFile,
    ...headerArgs(PAGE_HEADERS),
    '-o',
    'NUL',
    EXPLORE_CLEARANCE_URL,
  ]
  try {
    await curl(args)
    return true
  } catch {
    return false
  }
}

/** 取一页作业 */
export async function fetchApiPage(page: number, cookieFile: string): Promise<ExploreApiJob[]> {
  const url = `${EXPLORE_API}?page=${page}&feed=top&_ql=explore`
  const args = [
    '-sS',
    '--fail',
    '-b',
    cookieFile,
    ...headerArgs(API_HEADERS),
    url,
  ]
  const res = await curl(args)
  const parsed = JSON.parse(res.body.toString('utf-8')) as unknown
  return Array.isArray(parsed) ? (parsed as ExploreApiJob[]) : []
}

/** 下载一张 CDN 图 */
export async function downloadImage(url: string, cookieFile: string): Promise<Buffer> {
  const args = [
    '-sS',
    '--fail',
    '-b',
    cookieFile,
    ...headerArgs(IMAGE_HEADERS),
    url,
  ]
  const res = await curl(args)
  if (res.body.length < 1024) throw new Error(`图片过小（${res.body.length} 字节），多半是挑战页`)
  return res.body
}

/** 重编码成指定宽度的 WebP（宽上限，高度按原比例） */
export async function encodeImage(buffer: Buffer, width: number): Promise<Buffer> {
  return sharp(buffer)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: width >= MID_WIDTH ? 80 : 72 })
    .toBuffer()
}

/** 重编码成 320px WebP */
export async function encodeThumb(buffer: Buffer): Promise<Buffer> {
  return encodeImage(buffer, THUMB_WIDTH)
}

// ── 主流程 ───────────────────────────────────────────────

export interface CollectOptions {
  /** 项目根目录 */
  root: string
  /** 采集页数（每页 50 条） */
  pages?: number
  /** 保留窗口（天） */
  windowDays?: number
  /** 批次日期（默认今天） */
  batch?: string
  /** 只抓接口不下图（调试用） */
  skipImages?: boolean
  /** 日志 */
  log?: (message: string) => void
}

export interface CollectSummary {
  fetched: number
  usable: number
  dropped: number
  kept: number
  imagesDownloaded: number
  imagesRemoved: number
  batches: number
}

/** 隔壁仓的站点目录（默认在隔壁仓里） */
export function defaultNeighborSiteDir(root: string): string {
  return path.resolve(root, '..', 'ai-video-imge-prompts', 'sites', 'midjourney-explore')
}

/** 读已有快照里的作业 */
export function readSnapshotJobs(snapshotPath: string): ExploreJob[] {
  if (!fs.existsSync(snapshotPath)) return []
  try {
    const parsed = yaml.load(fs.readFileSync(snapshotPath, 'utf-8')) as ExploreConfig | null
    return parsed?.jobs ?? []
  } catch {
    return []
  }
}

// ── 一次性导入隔壁仓已有的本地数据 ────────────────────────

/** 隔壁仓 manifest.json 里的一条记录（只声明用得到的字段） */
export interface NeighborManifestRecord {
  id: string
  jobId: string
  index: number
  batch: string
  prompt: string
  aspect: string
  version: string | number
  username: string
  displayName: string
  enqueueTime: number
  hasStyleRef: number
  sref?: string
  thumb_path?: string
}

/**
 * 隔壁仓 manifest → 本项目的作业条目。
 *
 * 为什么要有这一步：隔壁仓已经采了 6 天的榜单（1016 条作业 / 4064 张图），
 * 重新采一遍既慢又没必要。导入它的本地数据，页面一开始就有历史可看；
 * 之后每天再由本项目自己采当天的榜单（见 collectExplore）。
 *
 * 过滤规则与自采一致：提示词短于 MIN_PROMPT_LENGTH 的作业丢弃。
 */
export function manifestToJobs(records: NeighborManifestRecord[]): ExploreJob[] {
  const byJob = new Map<string, ExploreJob>()
  for (const record of records) {
    if (!record?.jobId) continue
    const prompt = (record.prompt ?? '').trim()
    if (prompt.length < MIN_PROMPT_LENGTH) continue

    let job = byJob.get(record.jobId)
    if (!job) {
      const refs = (record.sref ?? '')
        .split(',')
        .map(code => code.trim())
        .filter(Boolean)
      const display = (record.displayName ?? '').trim()
      const account = (record.username ?? '').trim()
      job = {
        id: record.jobId,
        prompt,
        title: titleOf(prompt),
        author: display && !isPlaceholderAuthor(display)
          ? display
          : account && !isPlaceholderAuthor(account)
            ? account
            : ANONYMOUS_AUTHOR,
        authorId: account || undefined,
        aspect: record.aspect ?? '',
        version: record.version !== undefined ? String(record.version) : '',
        enqueueTime: record.enqueueTime ?? 0,
        batch: record.batch ?? '',
        sref: refs.length ? refs.join(' ') : undefined,
        thumbs: [],
        mids: [],
      }
      byJob.set(record.jobId, job)
    }
    // 同一作业的每一格各一条记录，按 index 排好
    // 路径要带 thumbs/ 前缀：快照里的路径是相对 public/explore/ 的
    const thumb = record.thumb_path
      ? `thumbs/${path.basename(record.thumb_path)}`
      : `thumbs/${record.jobId}_${record.index}.webp`
    if (!job.thumbs.includes(thumb)) job.thumbs.push(thumb)
    const mid = `mid/${record.jobId}_${record.index}.webp`
    if (!job.mids.includes(mid)) job.mids.push(mid)
  }
  for (const job of byJob.values()) {
    // 按格号排，不靠字典序（第 10 格会排到第 2 格前面）
    job.thumbs.sort((a, b) => gridIndexOf(a) - gridIndexOf(b))
    job.mids.sort((a, b) => gridIndexOf(a) - gridIndexOf(b))
  }
  return [...byJob.values()]
}

/** 从缩略图文件名里取格号（job-1_2.webp → 2） */
function gridIndexOf(thumb: string): number {
  const match = /_(\d+)\.webp$/.exec(thumb)
  return match ? Number(match[1]) : 0
}

export interface ImportOptions {
  /** 项目根目录 */
  root: string
  /** 隔壁仓的站点目录（含 manifest.json 与 thumbs/） */
  siteDir: string
  /** 保留窗口（天） */
  windowDays?: number
  /** 日志 */
  log?: (message: string) => void
}

export interface ImportSummary {
  /** manifest 里的记录数 */
  records: number
  /** 导入的作业数 */
  jobs: number
  /** 重编码的图片数 */
  images: number
  /** 跳过的图片数（本地已有） */
  skipped: number
  /** 找不到源图的作业数 */
  noImage: number
}

/**
 * 把隔壁仓的本地数据导进本项目的快照与缩略图目录。
 *
 * 图片是 640px 的，重编码成 320px（469 MB → 约 70 MB）。
 * 导入是"加数据"，不是"重采"：同一批次的作业按 id 合并，不整批替换
 * （整批替换是自采那一步的事，见 replaceBatch）。
 */
export async function importNeighborSite(options: ImportOptions): Promise<ImportSummary> {
  const log = options.log ?? (() => {})
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS
  const root = options.root
  const siteDir = options.siteDir

  const manifestPath = path.join(siteDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`找不到隔壁仓的 manifest：${manifestPath}`)
  }
  const records = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as NeighborManifestRecord[]
  log(`读到 manifest：${records.length} 条记录`)

  const jobs = manifestToJobs(records)
  log(`转成作业：${jobs.length} 条（提示词过短的已丢弃）`)

  const sourceThumbs = path.join(siteDir, 'thumbs')
  const destThumbs = path.join(root, 'public', 'explore', 'thumbs')
  const destMids = path.join(root, 'public', 'explore', 'mid')
  fs.mkdirSync(destThumbs, { recursive: true })
  fs.mkdirSync(destMids, { recursive: true })

  let images = 0
  let skipped = 0
  let mids = 0
  let noImage = 0
  const kept: ExploreJob[] = []

  for (const job of jobs) {
    const available: string[] = []
    const availableMids: string[] = []
    for (const rel of job.thumbs) {
      // 快照里的路径带 thumbs/ 前缀；落盘时只取文件名
      const name = path.basename(rel)
      const index = gridIndexOf(rel)
      const dest = path.join(destThumbs, name)
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
        available.push(rel)
        skipped++
      } else {
        const source = path.join(sourceThumbs, name)
        if (!fs.existsSync(source)) continue
        try {
          const encoded = await encodeThumb(fs.readFileSync(source))
          fs.writeFileSync(dest, encoded)
          available.push(rel)
          images++
        } catch (error) {
          log(`  重编码失败 ${name}：${(error as Error).message}`)
        }
      }

      // 灯箱大图（640px）：隔壁仓本地就有这一档，直接拷贝，不重编码
      const midName = `${job.id}_${index}.webp`
      const midDest = path.join(destMids, midName)
      if (!(fs.existsSync(midDest) && fs.statSync(midDest).size > 1024)) {
        const midSource = path.join(sourceThumbs, midName)
        if (fs.existsSync(midSource)) {
          fs.copyFileSync(midSource, midDest)
          mids++
        }
      }
      if (fs.existsSync(midDest) && fs.statSync(midDest).size > 1024) {
        availableMids.push(`mid/${midName}`)
      }
    }
    // 一张图都没有的作业不进快照（页面上是个空壳）
    if (available.length === 0) {
      noImage++
      continue
    }
    kept.push({ ...job, thumbs: available, mids: availableMids })
  }
  log(`缩略图：重编码 ${images} 张 · 已有跳过 ${skipped} 张`)
  log(`灯箱大图（640px）：拷贝 ${mids} 张`)
  log(`无图丢弃作业 ${noImage} 条`)

  const snapshotPath = path.join(root, 'config', 'explore.yaml')
  const existing = readSnapshotJobs(snapshotPath)
  // 导入的是更早的采集，批次归属以它为准（base 赢）
  const merged = mergeJobs(kept, existing)
  const pruned = pruneToWindow(merged, windowDays)
  log(`合并后 ${merged.length} 条，按 ${windowDays} 天窗口保留 ${pruned.length} 条`)

  const totalJobIds = new Set(records.map(r => r?.jobId).filter(Boolean)).size
  const config = buildExploreConfig(pruned, {
    generatedAt: new Date().toISOString(),
    windowDays,
    fetched: totalJobIds,
    dropped: totalJobIds - jobs.length,
  })
  fs.writeFileSync(snapshotPath, renderExploreYaml(config), 'utf-8')
  log(`已写 ${snapshotPath}`)

  return { records: records.length, jobs: kept.length, images, skipped, noImage }
}

/**
 * 采集一轮：取接口 → 过滤 → 合并去重 → 按窗口裁剪 → 下图 → 写快照。
 * 任何一步失败都直接抛出（不写快照、不删旧图）。
 */
export async function collectExplore(options: CollectOptions): Promise<CollectSummary> {
  const log = options.log ?? (() => {})
  const pages = options.pages ?? 4
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS
  const batch = options.batch ?? localISODate()
  const root = options.root

  const snapshotPath = path.join(root, 'config', 'explore.yaml')
  const thumbsDir = path.join(root, 'public', 'explore', 'thumbs')
  const midsDir = path.join(root, 'public', 'explore', 'mid')

  const cookieFile = path.join(os.tmpdir(), `mj-explore-${process.pid}.cookie`)
  fs.rmSync(cookieFile, { force: true })

  try {
    const cleared = await ensureClearance(cookieFile)
    log(cleared ? 'Cloudflare 通行证就绪' : '没拿到 Cloudflare 通行证（接口可能仍然可用）')

    const raw: ExploreApiJob[] = []
    for (let page = 0; page < pages; page++) {
      const jobs = await fetchApiPage(page, cookieFile)
      log(`  第 ${page + 1} 页：${jobs.length} 条`)
      if (jobs.length === 0) break
      raw.push(...jobs)
    }
    if (raw.length === 0) throw new Error('上游接口没有返回任何作业')

    const usable = raw.filter(isUsableJob)
    const dropped = raw.length - usable.length
    log(`上游 ${raw.length} 条，可用 ${usable.length} 条（丢弃 ${dropped} 条：提示词过短）`)

    const incoming = usable.map(job => toExploreJob(job, batch))
    const existing = readSnapshotJobs(snapshotPath)
    const merged = replaceBatch(existing, batch, incoming)
    const kept = pruneToWindow(merged, windowDays)
    log(`合并后 ${merged.length} 条，按 ${windowDays} 天窗口保留 ${kept.length} 条`)

    let imagesDownloaded = 0
    let midsDownloaded = 0
    let imagesRemoved = 0
    if (!options.skipImages) {
      fs.mkdirSync(thumbsDir, { recursive: true })
      fs.mkdirSync(midsDir, { recursive: true })
      const wanted = new Set<string>()
      const wantedMids = new Set<string>()
      const tasks: Array<{ file: string; url: string }> = []
      const midTasks: Array<{ file: string; url: string }> = []
      for (const job of kept) {
        for (const rel of job.thumbs) {
          const file = path.join(root, 'public', 'explore', rel)
          wanted.add(path.basename(file))
          const index = Number(path.basename(file).split('_')[1].split('.')[0])
          // 灯箱大图（640px）：先下这一档，缩略图由它重编码而来
          const midFile = path.join(root, 'public', 'explore', midPathOf(job.id, index))
          wantedMids.add(path.basename(midFile))
          if (!(fs.existsSync(midFile) && fs.statSync(midFile).size > 1024)) {
            midTasks.push({ file: midFile, url: `${CDN_BASE}${job.id}/0_${index}_640_N.webp` })
          }
          if (fs.existsSync(file) && fs.statSync(file).size > 1024) continue
          tasks.push({ file, url: `${CDN_BASE}${job.id}/0_${index}_640_N.webp` })
        }
      }
      // 并发下取：一张图一次 curl，串行 800 张要 20 分钟
      const concurrency = 6
      const runTasks = async (list: Array<{ file: string; url: string }>, width: number) => {
        let cursor = 0
        const worker = async () => {
          while (cursor < list.length) {
            const task = list[cursor++]
            let done = false
            for (let attempt = 1; attempt <= 2 && !done; attempt++) {
              try {
                const rawImage = await downloadImage(task.url, cookieFile)
                const encoded = await encodeImage(rawImage, width)
                fs.writeFileSync(task.file, encoded)
                done = true
              } catch (error) {
                if (attempt === 2) {
                  log(`  图下载失败 ${path.basename(task.file)}：${(error as Error).message}`)
                }
              }
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker))
      }
      await runTasks(midTasks, MID_WIDTH)
      midsDownloaded = midTasks.length
      await runTasks(tasks, THUMB_WIDTH)
      imagesDownloaded = tasks.length

      // 清理窗口外作业留下的图
      for (const name of fs.readdirSync(thumbsDir)) {
        if (!wanted.has(name)) {
          fs.rmSync(path.join(thumbsDir, name), { force: true })
          imagesRemoved++
        }
      }
      for (const name of fs.readdirSync(midsDir)) {
        if (!wantedMids.has(name)) {
          fs.rmSync(path.join(midsDir, name), { force: true })
          imagesRemoved++
        }
      }
      log(
        `缩略图：新下 ${imagesDownloaded} 张 · 灯箱大图：新下 ${midsDownloaded} 张 · 清理 ${imagesRemoved} 张`
      )
    }

    const config = buildExploreConfig(kept, {
      generatedAt: new Date().toISOString(),
      windowDays,
      fetched: raw.length,
      dropped,
    })
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
    fs.writeFileSync(snapshotPath, renderExploreYaml(config), 'utf-8')
    log(`已写 ${snapshotPath}`)

    return {
      fetched: raw.length,
      usable: usable.length,
      dropped,
      kept: kept.length,
      imagesDownloaded,
      imagesRemoved,
      batches: config.batches.length,
    }
  } finally {
    fs.rmSync(cookieFile, { force: true })
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

/* ── 上游字段探针（--probe）────────────────────────────────────────────
   为什么需要它：抓回来的作业只取 `ar` / `version` / `styleRef` 几个字段
   （见 ExploreApiJob 的注释「只声明用得到的字段」），但 971 条 prompt 正文里
   **一个 `--参数` 都没有** —— 说明上游把参数拆成了结构字段，只是我们没声明。
   剩下的字段名**不能靠猜**：名字写错会静默拿到 undefined，而「上游没有这个字段」
   与「字段名拼错」在水合后的数据里长得一模一样，事后无法区分。
   所以给一个只读探针：跑一次，把真实键名与出现次数打出来，再决定加哪些。
   它不写快照、不下载配图、不进 update 链（见 ADR-0028 之后的采集侧待办）。 */

export interface ProbeField {
  key: string
  count: number
  /** 非空条数：null / undefined / 空数组都不算。区分「字段存在但恒为空」与「有真值」 */
  filled: number
  example: string
}

export interface ProbeReport {
  jobs: number
  jobFields: ProbeField[]
  promptFields: ProbeField[]
  versionValues: Array<{ value: string; count: number }>
}

const PROBE_EXAMPLE_LIMIT = 72

/** 取一个能看懂但不刷屏的样例值。 */
function exampleOf(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) {
    return `array(${value.length}) ${JSON.stringify(value).slice(0, PROBE_EXAMPLE_LIMIT)}`
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return (text ?? '').slice(0, PROBE_EXAMPLE_LIMIT)
}

/** 「有值」的判据：null / undefined / 空数组都算空。false 算有值（`styleRaw: false` 是真信息）。 */
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

/** 统计一组对象上出现过的键；按出现次数降序（最常出现的先看）。 */
function tallyFields(rows: Array<Record<string, unknown> | null>): ProbeField[] {
  const acc = new Map<string, ProbeField>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    for (const key of Object.keys(row)) {
      const value = (row as Record<string, unknown>)[key]
      const hit = acc.get(key)
      if (hit) {
        hit.count += 1
        if (isFilled(value)) hit.filled += 1
      } else {
        acc.set(key, { key, count: 1, filled: isFilled(value) ? 1 : 0, example: exampleOf(value) })
      }
    }
  }
  return [...acc.values()].sort(
    (a, b) => b.filled - a.filled || b.count - a.count || a.key.localeCompare(b.key)
  )
}

export function describeJobShape(jobs: Array<Record<string, unknown>>): ProbeReport {
  const promptRows = jobs.map((job) => {
    const prompt = job && (job as { prompt?: unknown }).prompt
    return prompt && typeof prompt === 'object' ? (prompt as Record<string, unknown>) : null
  })
  const versions = new Map<string, number>()
  for (const row of promptRows) {
    const v = row?.version
    if (v === undefined || v === null) continue
    const key = String(v)
    versions.set(key, (versions.get(key) ?? 0) + 1)
  }
  return {
    jobs: jobs.length,
    jobFields: tallyFields(jobs),
    promptFields: tallyFields(promptRows),
    versionValues: [...versions.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  }
}

export function renderProbeReport(report: ProbeReport): string {
  const table = (rows: ProbeField[]): string[] =>
    rows.length
      ? rows.map((r) => `| \`${r.key}\` | ${r.count} | ${r.filled} | ${r.example.replace(/\|/g, '\\|')} |`)
      : ['| （无） | 0 | 0 | — |']
  const header = ['| 键 | 出现次数 | 非空 | 样例 |', '|---|---|---|---|']
  return [
    '# 上游字段探针（只读）',
    '',
    `作业 ${report.jobs} 条。下表是**上游真实返回**的键，不代表本项目已经用到它们。`,
    '用途：确认「要不要给采样加参数维度」之前，先看上游到底给不给这些字段 ——',
    '「非空」为 0 说明字段存在但恒为空，加了也是白加。',
    '',
    '## job 顶层键',
    '',
    ...header,
    ...table(report.jobFields),
    '',
    '## prompt 对象内的键',
    '',
    ...header,
    ...table(report.promptFields),
    '',
    '## version 取值分布',
    '',
    '| version | 条数 |',
    '|---|---|',
    ...(report.versionValues.length
      ? report.versionValues.map((v) => `| ${v.value} | ${v.count} |`)
      : ['| （无） | 0 |']),
    '',
  ].join('\n')
}

/**
 * 只读探针：取一页上游数据，报告字段形状。
 * 不写 config/explore.yaml、不下载配图、不动 dist/。
 */
export async function probeExplore(options: {
  root: string
  pages?: number
  log?: (message: string) => void
}): Promise<ProbeReport> {
  const log = options.log ?? (() => {})
  const pages = options.pages ?? 1
  const cookieFile = path.join(os.tmpdir(), `mj-probe-${process.pid}.cookie`)
  fs.rmSync(cookieFile, { force: true })
  try {
    const cleared = await ensureClearance(cookieFile)
    log(cleared ? 'Cloudflare 通行证就绪' : '没拿到 Cloudflare 通行证（接口可能仍然可用）')
    const raw: Array<Record<string, unknown>> = []
    for (let page = 0; page < pages; page++) {
      const jobs = await fetchApiPage(page, cookieFile)
      log(`  第 ${page + 1} 页：${jobs.length} 条`)
      if (jobs.length === 0) break
      // 声明类型只覆盖用到的字段，探针要看**全部**键，故按未知形状收
      raw.push(...(jobs as unknown as Array<Record<string, unknown>>))
    }
    if (raw.length === 0) throw new Error('上游接口没有返回任何作业')
    return describeJobShape(raw)
  } finally {
    fs.rmSync(cookieFile, { force: true })
  }
}

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const argv = process.argv.slice(2)
  const readArg = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const pages = readArg('pages') ? Number(readArg('pages')) : undefined
  const windowDays = readArg('window') ? Number(readArg('window')) : undefined
  const batch = readArg('batch')
  const skipImages = argv.includes('--skip-images')

  // 一次性导入隔壁仓已有的本地数据（默认指向隔壁仓的站点目录）
  const importDir = argv.includes('--import')
    ? readArg('import') ?? defaultNeighborSiteDir(root)
    : undefined

  if (argv.includes('--probe')) {
    // 只读探针：先看清上游给哪些字段，再决定要不要加维度。失败不猜字段名。
    const outFile = path.join(root, '.probe-keys.txt')
    probeExplore({
      root,
      pages: pages ?? 1,
      log: message => console.log(`[collect-explore] ${message}`),
    })
      .then(report => {
        const text = renderProbeReport(report)
        fs.writeFileSync(outFile, text, 'utf-8')
        console.log(text)
        console.log(`[collect-explore] 已写 ${outFile}（只读：未写快照、未下载配图）`)
      })
      .catch((error: Error) => {
        console.error(`[collect-explore] 探针失败：${error.message}`)
        console.error(
          '[collect-explore] 没拿到真实字段名就不要往 ExploreApiJob 里加字段 —— 名字猜错只会静默拿到 undefined。'
        )
        process.exit(1)
      })
  } else {
    const run = importDir
      ? importNeighborSite({
          root,
          siteDir: importDir,
          windowDays,
          log: message => console.log(`[collect-explore] ${message}`),
        }).then(summary => {
          console.log(
            `[collect-explore] 导入完成：${summary.jobs} 条作业 · 重编码 ${summary.images} 张图 · 跳过 ${summary.skipped} 张`
          )
        })
      : collectExplore({
          root,
          pages,
          windowDays,
          batch,
          skipImages,
          log: message => console.log(`[collect-explore] ${message}`),
        }).then(summary => {
          console.log(
            `[collect-explore] 完成：上游 ${summary.fetched} 条 · 入库 ${summary.kept} 条 · 批次 ${summary.batches} 个 · 新图 ${summary.imagesDownloaded} 张`
          )
        })

    run.catch((error: Error) => {
      console.error(`[collect-explore] 失败：${error.message}`)
      console.error('[collect-explore] 保留上一份快照与旧图，未做任何写入。')
      process.exit(1)
    })
  }
}
