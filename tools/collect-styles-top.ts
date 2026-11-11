import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { STYLES_TOP_KINDS, STYLES_TOP_PREVIEW_DIR } from './build-styles-top.ts'
import type { StylesTopConfig } from '../shared/types/styleTop'

/**
 * 采集 Midjourney 官方风格榜（styles_top）缩略图 —— 迁移自隔壁仓 tools/styles_top.py。
 *
 * 数据源：Midjourney styles_top 榜单。
 *   - 风格码清单：须登录态才能拿到（capture 子命令用 puppeteer 连已登录 Chrome 抓）。
 *     但本项目 config/styles-top.yaml 已内置 200 个码，默认直接用它当清单，不必每次
 *     都登录；只有"榜单变了要补新码"时才需要 --capture。
 *   - 缩略图：cdn.midjourney.com 匿名直连可下（与 explore 同域，无需 cookie），且画廊里
 *     每张卡回链 MJ 原站（详情页 + CDN 原图），规避 Cloudflare 对 inline <img> 的拦截。
 *
 * 镜像 collect-explore.ts 的范式：curl.exe 通道（Schannel 的 TLS 指纹像浏览器）+ 断点续传
 * + 并发。落盘到 public/preview-images/midjourney-styles-top/（gitignore，靠本工具落地）。
 *
 * CLI（单文件，用 flag 表达，无子命令解析器）：
 *   默认          读 config/styles-top.yaml 的码 -> 下 8 张题材图（断点续传）
 *   --capture     先用 puppeteer 抓码再下（需已登录 MJ 的 Chrome，远程调试 9222）
 *   -i <file>     从自定义 sref 清单下（不走 config）
 *   --top N       只取前 N 个码
 *   --dry-run     只打印将要下的任务数，不下
 *   --no-build    下完不重新生成 config/styles-top.yaml
 *   --workers N   并发数（默认 16）   --timeout S  单图超时秒（默认 60）   --retries N（默认 3）
 *
 * 为何不在本项目生成静态画廊 HTML：源仓 styles_top.py 的 build 产独立 index.html，但本项目
 * 已有 StylesTopLibrary.vue 这个查看器，静态页冗余，故省略。
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** 缩略图 CDN（与 explore 同域，匿名可下；k 取值见 STYLES_TOP_KINDS） */
const CDN = 'https://cdn.midjourney.com/styles/0_{s}/{k}_640_N.webp'
/** 风格详情页（画廊"MJ 详情↗"与复制 sref 的目标） */
const MJ_PAGE = 'https://www.midjourney.com/styles/0_{s}'
/** styles_top 榜单页（capture 入口） */
const MJ_EXPLORE = 'https://www.midjourney.com/explore?tab=styles_top'
/** 从 /styles/0_<code> 链接里抠数字码 */
const SREF_RE = /\/styles\/0_(\d+)/

const IMAGE_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.midjourney.com',
  Referer: 'https://www.midjourney.com/',
  'Sec-Fetch-Dest': 'image',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'cross-site',
}

// ── 纯函数（可单测） ─────────────────────────────────────

/** 缩略图 CDN URL */
export function cdnUrlOf(code: string, kind: string): string {
  return CDN.replace('{s}', code).replace('{k}', kind)
}

/** 风格详情页 URL */
export function detailPageOf(code: string): string {
  return MJ_PAGE.replace('{s}', code)
}

/** WebP 校验：RIFF....WEBP，且至少 12 字节 */
export function isValidWebp(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  const head = buffer.subarray(0, 4).toString('latin1')
  const fmt = buffer.subarray(8, 12).toString('latin1')
  return head === 'RIFF' && fmt === 'WEBP'
}

/** 从 _srefs.txt 读取码清单（去空、去重保序） */
export function readSrefsFromFile(file: string): string[] {
  if (!fs.existsSync(file)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const s = raw.trim()
    if (s && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

/** 从本项目 config/styles-top.yaml 提取码清单（canonical 来源） */
export function readCodesFromConfig(root: string): string[] {
  const yamlPath = path.join(root, 'config', 'styles-top.yaml')
  if (!fs.existsSync(yamlPath)) return []
  const cfg = yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as StylesTopConfig | null
  return (cfg?.entries ?? [])
    .map(e => (e.code || e.id || '').trim())
    .filter(Boolean)
}

// ── 网络（curl 通道，镜像 collect-explore.ts） ───────────

interface CurlResult {
  status: number
  body: Buffer
}

function curl(args: string[], timeoutMs = 60_000): Promise<CurlResult> {
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
      resolve({ status: 200, body: Buffer.concat(chunks) })
    })
  })
}

function headerArgs(headers: Record<string, string>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(headers)) out.push('-H', `${k}: ${v}`)
  return out
}

/** 下载一个 URL 的二进制内容 */
async function downloadUrl(url: string, timeoutMs: number): Promise<Buffer> {
  const res = await curl(headerArgs(IMAGE_HEADERS).concat(url), timeoutMs)
  return res.body
}

// ── 下载（断点续传 + 并发） ──────────────────────────────

export interface FetchOptions {
  /** 项目根目录 */
  root: string
  /** 风格码清单 */
  codes: string[]
  /** 并发数（默认 16） */
  workers?: number
  /** 单图超时（秒，默认 60） */
  timeout?: number
  /** 重试次数（默认 3） */
  retries?: number
  /** 只打印任务数，不下 */
  dryRun?: boolean
  /** 日志 */
  log?: (message: string) => void
}

export interface FetchSummary {
  codes: number
  jobs: number
  ok: number
  skip: number
  fail: number
  failures: Array<{ code: string; kind: string; reason: string }>
}

/**
 * 把风格码清单的 8 张题材图从 CDN 下到 public/preview-images/midjourney-styles-top/。
 * 已存在且是有效 WebP 的跳过（断点续传）；任何单图失败只在 summary.failures 记录，
 * 不中断其余下载，可重跑续传。
 */
export async function fetchStylesTop(options: FetchOptions): Promise<FetchSummary> {
  const log = options.log ?? (() => {})
  const root = options.root
  const workers = options.workers ?? 16
  const timeout = (options.timeout ?? 60) * 1000
  const retries = options.retries ?? 3
  const destDir = path.join(root, 'public', 'preview-images', STYLES_TOP_PREVIEW_DIR)
  fs.mkdirSync(destDir, { recursive: true })

  const jobs: Array<{ code: string; kind: string }> = []
  for (const code of options.codes) {
    for (const k of STYLES_TOP_KINDS) jobs.push({ code, kind: k.id })
  }
  log(`fetch: 码=${options.codes.length} 题材=${STYLES_TOP_KINDS.length} 任务=${jobs.length}`)
  if (options.dryRun) {
    return { codes: options.codes.length, jobs: jobs.length, ok: 0, skip: 0, fail: 0, failures: [] }
  }

  let ok = 0
  let skip = 0
  let fail = 0
  const failures: FetchSummary['failures'] = []

  const runOne = async (job: { code: string; kind: string }): Promise<string> => {
    const dest = path.join(destDir, `${job.code}_${job.kind}.webp`)
    if (fs.existsSync(dest)) {
      const buf = fs.readFileSync(dest)
      if (isValidWebp(buf) && buf.length > 100) return 'skip'
    }
    let last = ''
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const buf = await downloadUrl(cdnUrlOf(job.code, job.kind), timeout)
        if (isValidWebp(buf) && buf.length > 100) {
          fs.writeFileSync(dest, buf)
          return 'ok'
        }
        last = `坏图 size=${buf.length}`
      } catch (error) {
        last = (error as Error).message.slice(0, 120)
      }
    }
    return 'FAIL:' + last
  }

  let cursor = 0
  let done = 0
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      const st = await runOne(job)
      if (st === 'ok') ok++
      else if (st === 'skip') skip++
      else {
        fail++
        failures.push({ code: job.code, kind: job.kind, reason: st.slice(5) })
      }
      done++
      if (done % 50 === 0 || done === jobs.length) {
        log(`  [${done}/${jobs.length}] ok=${ok} skip=${skip} fail=${fail}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker))

  log(`DONE ok=${ok} skip=${skip} fail=${fail}`)
  if (failures.length) {
    log(`失败 ${failures.length} 条（多为网络/挑战页，重跑本命令可续传）：`)
    for (const f of failures.slice(0, 20)) log(`  ${f.code}_${f.kind}: ${f.reason}`)
  }
  return { codes: options.codes.length, jobs: jobs.length, ok, skip, fail, failures }
}

// ── 捕获风格码清单（需登录，puppeteer 连已登录 Chrome） ──

export interface CaptureOptions {
  /** Chrome 远程调试地址（默认 http://127.0.0.1:9222） */
  cdp?: string
  /** 最大滚动次数（防卡死，默认 80） */
  maxScrolls?: number
  /** 每次滚动后等待秒数（等懒加载，默认 1.2） */
  pause?: number
  /** 日志 */
  log?: (message: string) => void
}

/**
 * 驱动已登录 MJ 的 Chrome（CDP）滚到底，从完整 DOM 提取全部风格码 -> 返回码清单。
 *
 * 仅此函数需要 puppeteer-core（已在 devDependencies，懒加载，不污染核心下载链路）。
 * 前置：让 Chrome 以远程调试启动且已登录 midjourney.com，例如：
 *   chrome.exe --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data"
 * 然后访问一次 https://www.midjourney.com/ 确认登录态，再调用本函数。
 */
export async function captureStylesTop(options: CaptureOptions): Promise<string[]> {
  const log = options.log ?? (() => {})
  const cdp = options.cdp ?? 'http://127.0.0.1:9222'
  const maxScrolls = options.maxScrolls ?? 80
  const pause = options.pause ?? 1.2

  let puppeteer: import('puppeteer-core').PuppeteerNode
  try {
    const mod = await import('puppeteer-core')
    puppeteer = mod.default
  } catch {
    throw new Error('capture 需要 puppeteer-core（已在 devDependencies，运行 npm i 即可安装）')
  }

  let browser: import('puppeteer-core').Browser
  try {
    browser = await puppeteer.connect({ browserURL: cdp })
  } catch (error) {
    throw new Error(
      `capture 失败：无法连接 CDP（${cdp}）。请先以远程调试启动已登录 midjourney.com 的 Chrome：\n` +
        '  chrome.exe --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\\Google\\Chrome\\User Data"\n' +
        '然后在那个 Chrome 里访问一次 https://www.midjourney.com/ 确认登录态。\n' +
        `（底层：${(error as Error).message}）`
    )
  }

  try {
    const page = await browser.newPage()
    // 与 curl 通道同 UA：Cloudflare 会向 headless Chrome 的真实 UA 下挑战页
    await page.setUserAgent(UA)
    await page.goto(MJ_EXPLORE, { waitUntil: 'load', timeout: 60_000 })
    try {
      await page.waitForSelector('a[href^="/styles/0_"]', { timeout: 20_000 })
    } catch {
      throw new Error(
        'capture 失败：页面未出现风格卡。常见原因：\n' +
          '  1) CDP 指向的 Chrome 未登录 midjourney.com —— 先在那里面登录并访问一次 MJ；\n' +
          '  2) 远程调试端口不对（确认 --remote-debugging-port 与 --cdp 一致）；\n' +
          '  3) 页面跳到了登录页。'
      )
    }
    const seen = new Set<string>()
    const ordered: string[] = []
    let prev = 0
    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await new Promise(resolve => setTimeout(resolve, pause * 1000))
      const hrefs = await page.$$eval('a[href^="/styles/0_"]', els =>
        els.map(e => e.getAttribute('href') || '')
      )
      for (const h of hrefs) {
        const m = SREF_RE.exec(h || '')
        if (m && m[1] && !seen.has(m[1])) {
          seen.add(m[1])
          ordered.push(m[1])
        }
      }
      log(`  scroll ${i + 1}: 累计 ${ordered.length} 个风格码`)
      if (i > 0 && ordered.length === prev) break // 本屏无新增，已到底
      prev = ordered.length
    }
    return ordered
  } finally {
    await browser.disconnect()
  }
}

// ── CLI ──────────────────────────────────────────────────

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const argv = process.argv.slice(2)
  const readArg = (name: string): string | undefined => {
    // 文档同时写了 -i / --i，两种前缀都要认；否则 -i 会被忽略并静默回退读旧快照
    const i = argv.findIndex(a => a === `--${name}` || a === `-${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const capture = argv.includes('--capture')
  const dryRun = argv.includes('--dry-run')
  const noBuild = argv.includes('--no-build')
  const infile = readArg('i')
  const top = readArg('top') ? Number(readArg('top')) : undefined
  const workers = readArg('workers') ? Number(readArg('workers')) : undefined
  const cdp = readArg('cdp') ?? 'http://127.0.0.1:9222'

  const log = (message: string) => console.log(`[collect-styles-top] ${message}`)

  const run = (async () => {
    let codes: string[]
    if (infile) {
      codes = readSrefsFromFile(path.resolve(root, infile))
      log(`从 ${infile} 读到 ${codes.length} 个码`)
    } else if (capture) {
      log('capture：连接已登录 MJ 的 Chrome…')
      codes = await captureStylesTop({ cdp, log })
      const dataDir = path.join(root, 'data', 'styles-top')
      fs.mkdirSync(dataDir, { recursive: true })
      fs.writeFileSync(path.join(dataDir, '_srefs.txt'), codes.join('\n') + '\n', 'utf-8')
      log(`capture：写入 ${codes.length} 个码 -> data/styles-top/_srefs.txt`)
    } else {
      codes = readCodesFromConfig(root)
      if (codes.length === 0) {
        throw new Error(
          '未找到风格码清单：先运行 --capture（需登录 MJ 的 Chrome）或 -i <sref清单>，' +
            '或先 npm run build:styles-top 生成 config/styles-top.yaml'
        )
      }
      log(`从 config/styles-top.yaml 读到 ${codes.length} 个码`)
    }
    if (top && top > 0) codes = codes.slice(0, top)
    const summary = await fetchStylesTop({ root, codes, workers, dryRun, log })
    if (!dryRun && !noBuild) {
      const { buildStylesTopFromLocal } = await import('./build-styles-top.ts')
      // 用本次采集到的码清单，别回退到旧快照里的码，否则新码进不了 YAML
      const out = buildStylesTopFromLocal(root, { codes })
      log(`已刷新 ${out}`)
    }
    console.log(
      `[collect-styles-top] 完成：码 ${summary.codes} · 任务 ${summary.jobs} · ` +
        `新下 ${summary.ok} · 跳过 ${summary.skip} · 失败 ${summary.fail}`
    )
  })()

  run.catch((error: Error) => {
    console.error(`[collect-styles-top] 失败：${error.message}`)
    process.exit(1)
  })
}
