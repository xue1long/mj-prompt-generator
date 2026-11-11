import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { describeSources, serializeDecomposed } from './decomposed-format.mjs'
import type {
  ExploreConfig,
  ExploreDecomposedConfig,
  ExploreJob,
  ExploreJobDecomposition,
  HealthCheck,
  PromptParam,
  PromptSegment,
  PromptTagGroup,
} from '../shared/types/explore'

/**
 * 探索榜提示词结构分解 —— 构建期 LLM 预生成（见 ADR-0015）。
 *
 * 读 config/explore.yaml 的作业，把「上次以来新增 / 已过期」的作业交给
 * OpenAI 兼容代理上的强模型，按《Midjourney 从基础到进阶使用教程（V8.2）》
 * 第三章的七段式方法论拆成固定结构，写进独立的派生文件
 * config/explore-decomposed.yaml（按 jobId 关联）。
 *
 * 为什么不写进 explore.yaml：采集脚本 collect-explore.ts 每次会整体覆盖重写
 * 那份快照，写进去下次采集就丢了。
 *
 * 方法论单一来源：本工具运行时直接读取
 * `.workbuddy/skills/mj-prompt-decompose/SKILL.md` 的第二章作为 system prompt，
 * 不在本文件里另抄一份。改方法论只改 SKILL.md。
 *
 * 零新增依赖：原生 fetch + js-yaml（项目已有），不引入 LLM SDK。
 *
 * 用法：
 *   node tools/decompose-explore.ts                 # 增量（只分解新增作业）
 *   node tools/decompose-explore.ts --all          # 全量重算
 *   node tools/decompose-explore.ts --all --limit 5  # 小批验证
 *   node tools/decompose-explore.ts --dry-run      # 只看待分解清单，不调 API 不写文件
 */

// ── 常量 ────────────────────────────────────────────────

/** schema 版本；结构变更时 +1，旧数据自动判为过期 */
export const SCHEMA_VERSION = 1
/** 方法论基线；升级时改这里，旧数据自动判为过期（或跑 --all） */
export const METHODOLOGY_VERSION = 'v8.2'

const SNAPSHOT_FILE = 'explore.yaml'
const OUTPUT_FILE = 'explore-decomposed.yaml'
const SKILL_FILE = path.join('.workbuddy', 'skills', 'mj-prompt-decompose', 'SKILL.md')
/** 方法论正文的起止标题；改 SKILL.md 标题时要同步改这里 */
const METHOD_START = '## 二、方法论速查'
const METHOD_END = '## 三、'

/** 七段式的固定段号与模块名：不管 LLM 怎么写，模块列一律由工具给定 */
export const SEGMENT_CODES = ['1', '2', '3', '4', '5', '6', '7'] as const
export const SEGMENT_MODULES: Record<string, string> = {
  '1': '主体',
  '2': '动作 / 状态',
  '3': '细节与环境',
  '4': '构图与镜头',
  '5': '光线与色彩',
  '6': '风格与审美',
  '7': '参数尾',
}

const DEFAULT_CONCURRENCY = 3
const DEFAULT_TIMEOUT_MS = 90_000
const MAX_ATTEMPTS = 3
/** 每成功多少条落一次盘（中途挂了不丢已完成的） */
const CHECKPOINT_EVERY = 10

// ── 环境变量 ────────────────────────────────────────────

/** 极简 .env 加载器：不引入 dotenv，已有 process.env 优先 */
export function loadEnvFile(root: string): void {
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return
  for (const raw of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

export interface LlmOptions {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

/** 只在真的要调 API 时才校验密钥；--dry-run 不需要 .env */
export function llmOptionsFromEnv(): LlmOptions {
  const baseUrl = (process.env.MJ_DECOMPOSE_BASE_URL ?? '').trim()
  const apiKey = (process.env.MJ_DECOMPOSE_API_KEY ?? '').trim()
  const model = (process.env.MJ_DECOMPOSE_MODEL ?? '').trim()
  const missing = [
    !baseUrl && 'MJ_DECOMPOSE_BASE_URL',
    !apiKey && 'MJ_DECOMPOSE_API_KEY',
    !model && 'MJ_DECOMPOSE_MODEL',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(
      `缺少环境变量：${missing.join(' / ')}。请复制 .env.example 为 .env 并填写。`
    )
  }
  const timeoutRaw = Number(process.env.MJ_DECOMPOSE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
    // concurrency 单独由主流程读，这里不塞进 LlmOptions
  }
}

/** 并发数也从 env 读（允许强模型限流时调小） */
export function concurrencyFromEnv(): number {
  const raw = Number(process.env.MJ_DECOMPOSE_CONCURRENCY ?? DEFAULT_CONCURRENCY)
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_CONCURRENCY
}

// ── 方法论单一来源 ──────────────────────────────────────

/** 直接截取 SKILL.md 第二章正文，作为 LLM 的 system prompt 依据 */
export function loadMethodology(root: string): string {
  const skillPath = path.join(root, SKILL_FILE)
  if (!fs.existsSync(skillPath)) {
    throw new Error(`找不到方法论源文件：${skillPath}（分解方法论只在该文件维护）`)
  }
  const text = fs.readFileSync(skillPath, 'utf-8')
  const start = text.indexOf(METHOD_START)
  const end = start >= 0 ? text.indexOf(METHOD_END, start + METHOD_START.length) : -1
  if (start < 0 || end < 0) {
    throw new Error(
      `SKILL.md 里找不到「${METHOD_START}」到「${METHOD_END}」这一段，无法复用方法论`
    )
  }
  return text.slice(start, end).trim()
}

const OUTPUT_SCHEMA_EXAMPLE = {
  framework: '人物画像 | 物体描述 | null（判定不了填 null）',
  segments: [
    {
      code: '1~7 的字符串',
      module: '模块名（工具会统一覆盖，可随意填）',
      text: '命中的英文原文片段；没命中填空字符串',
      note: '中文备注：是否最前 / 命中哪条构图法 / 参数在 V8.2 下是否有效；没有填空字符串',
    },
  ],
  composition: ['命中的构图五法中文名：三分法 / 框架式 / 留白负空间 / 引导线 / 对称式；没命中给空数组'],
  tags: {
    style: ['命中的画风 / 媒介 / 流派 / 镜头感词，保留英文原文'],
    lighting: ['命中的光线 / 色调词，保留英文原文'],
    angle: ['命中的景别 / 机位 / 焦段词，保留英文原文'],
    emotion: ['命中的情感词，保留英文原文'],
  },
  health: [
    {
      id: 'R1~R5（铁律）/ M1~M5（误区）/ V1~V4（V8.2 版本约束，仅命中相关语法时列）',
      ok: true,
      note: '中文说明；合规项写简短理由，违规项写风险点',
    },
  ],
  summary: '一句中文速读：这条 prompt 在画什么、什么调性',
}

/** 组装 system prompt：方法论原文 + 严格 JSON 输出契约 */
export function buildSystemPrompt(methodology: string): string {
  return [
    '你是 Midjourney 提示词结构分析器。严格依据下面给定的方法论，把一条社区提示词拆成固定结构。',
    '只输出一个 JSON 对象，不要解释、不要 markdown 围栏、不要多余文字。',
    '',
    '# 方法论（唯一依据，基线 V8.2）',
    methodology,
    '',
    '# 输出 JSON 结构（字段名不许改，字符串一律用双引号）',
    JSON.stringify(OUTPUT_SCHEMA_EXAMPLE, null, 2),
    '',
    '# 硬性规则',
    '1. segments 必须恰好 7 项，code 依次为 "1".."7"，顺序对应 ①主体 ②动作状态 ③细节与环境 ④构图与镜头 ⑤光线与色彩 ⑥风格与审美 ⑦参数尾；没命中的段 text 填空字符串，不许省略。',
    '2. text 与 tags 里的词保留提示词原文（英文社区 prompt 不要翻译）；note / summary / health.note 用中文。',
    '3. 参数尾只认正文里真实出现的 "--" 参数；正文没写显式参数就不要虚构 --ar / --v，⑦段 text 填空字符串。',
    '4. health 必须覆盖 R1~R5 与 M1~M5 共 10 项；V1~V4 仅在这条 prompt 命中对应失效语法时列出。ok 为布尔值。',
    '5. 框架判定与构图法归属是软判断，判不准就填 null / 空数组，不要编造。',
    '6. 只做解构，不许改写、润色或补充原提示词。',
  ].join('\n')
}

/** user prompt：把作业原文与背景分开，避免 LLM 把 aspect 当成 --ar 编造 */
export function buildUserPrompt(job: ExploreJob): string {
  return [
    '请分解下面这条 Midjourney 社区提示词。',
    '',
    `作业背景（仅供判断，不要写进分解结果，也不要据此虚构参数）：宽高比 ${job.aspect || '未知'} · 模型版本 ${job.version || '未知'} · 作者 ${job.author}`,
    '',
    '提示词原文：',
    job.prompt,
  ].join('\n')
}

// ── 参数尾：确定性解析，不交给 LLM ──────────────────────

/**
 * 从提示词正文里解析 "--" 参数。
 * 从第一个 --flag 起取到末尾，按空格切 token；遇新 flag 开新参数，
 * 其余 token 累加进 value（所以 "--no anime, cartoon" 会得到一个完整取值）。
 */
export function parseParamTail(prompt: string): { text: string; params: PromptParam[] } {
  const firstFlag = prompt.search(/--[a-zA-Z]/)
  if (firstFlag < 0) return { text: '', params: [] }
  const text = prompt.slice(firstFlag).trim()
  const params: PromptParam[] = []
  let current: PromptParam | null = null
  for (const token of text.split(/\s+/)) {
    if (/^--[a-zA-Z][a-zA-Z0-9_-]*$/.test(token)) {
      if (current) params.push(current)
      current = { name: token, value: '' }
    } else if (current) {
      current.value = current.value ? `${current.value} ${token}` : token
    }
  }
  if (current) params.push(current)
  return { text, params }
}

// ── LLM 结果解析与归一化 ────────────────────────────────

/** 去掉 markdown 围栏 / 前后废话，取出 JSON */
export function extractJson(raw: string): unknown {
  let text = raw.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(text)
  if (fenced) text = fenced[1].trim()
  if (!text.startsWith('{')) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) text = text.slice(start, end + 1)
  }
  return JSON.parse(text)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
}

/** 把 LLM 的松散输出收敛成前端可确定性渲染的固定结构 */
export function normalizeResult(
  parsed: unknown,
  job: ExploreJob,
  model: string
): ExploreJobDecomposition {
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
  const paramTail = parseParamTail(job.prompt)

  // 七段式：段数、段号、模块名全部由工具给定，LLM 只提供命中文本与备注
  const byCode = new Map<string, Record<string, unknown>>()
  if (Array.isArray(obj.segments)) {
    for (const seg of obj.segments) {
      if (!seg || typeof seg !== 'object') continue
      const s = seg as Record<string, unknown>
      const code = String(s.code ?? '').trim()
      if (/^[1-7]$/.test(code)) byCode.set(code, s)
    }
  }
  const segments: PromptSegment[] = SEGMENT_CODES.map(code => {
    const s = byCode.get(code) ?? {}
    const text = typeof s.text === 'string' ? s.text.trim() : ''
    const note = typeof s.note === 'string' ? s.note.trim() : ''
    return {
      code,
      module: SEGMENT_MODULES[code],
      text: code === '7' && !text ? paramTail.text : text,
      ...(note ? { note } : {}),
    }
  })

  const framework =
    obj.framework === '人物画像' || obj.framework === '物体描述' ? obj.framework : null

  const tagsObj = (obj.tags && typeof obj.tags === 'object' ? obj.tags : {}) as Record<string, unknown>
  const tags: PromptTagGroup = {
    style: asStringArray(tagsObj.style),
    lighting: asStringArray(tagsObj.lighting),
    angle: asStringArray(tagsObj.angle),
    emotion: asStringArray(tagsObj.emotion),
  }

  const rawHealth = Array.isArray(obj.health) ? obj.health : []
  const health: HealthCheck[] = rawHealth
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => {
      const note = typeof item.note === 'string' ? item.note.trim() : ''
      return {
        id: String(item.id ?? '').trim(),
        ok: item.ok !== false,
        ...(note ? { note } : {}),
      }
    })
    .filter(item => item.id.length > 0)

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''
  if (!summary) throw new Error('LLM 结果缺少中文速读（summary）')

  return {
    jobId: job.id,
    schemaVersion: SCHEMA_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    framework,
    segments,
    composition: asStringArray(obj.composition),
    tags,
    paramTail,
    health,
    summary,
    model,
    generatedAt: new Date().toISOString(),
  }
}

// ── LLM 调用（OpenAI 兼容 /chat/completions） ────────────

/** 代理地址既可能填到 /v1，也可能直接给完整的 /chat/completions */
export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function callLlm(system: string, user: string, options: LlmOptions): Promise<string> {
  const url = chatCompletionsUrl(options.baseUrl)
  const baseBody: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  }

  const post = async (body: Record<string, unknown>): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    })

  let response = await post(baseBody)
  if (response.status === 400) {
    const detail = (await response.text()).slice(0, 400)
    // 有些兼容代理不认 response_format：去掉再试一次
    if (/response_format|json_object/i.test(detail)) {
      const fallback = { ...baseBody }
      delete fallback.response_format
      response = await post(fallback)
    } else {
      throw new Error(`LLM 代理返回 400：${detail}`)
    }
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400)
    throw new Error(`LLM 代理返回 ${response.status}：${detail}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('LLM 代理返回内容为空')
  }
  return content
}

async function decomposeJob(
  job: ExploreJob,
  system: string,
  options: LlmOptions
): Promise<ExploreJobDecomposition> {
  const user = buildUserPrompt(job)
  let lastError: Error = new Error('未知错误')
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await callLlm(system, user, options)
      return normalizeResult(extractJson(raw), job, options.model)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1))
    }
  }
  throw lastError
}

// ── 读写派生文件 ────────────────────────────────────────

/** 读真 YAML 配置（如 config/explore.yaml）。 */
function readYaml<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return (yaml.load(fs.readFileSync(filePath, 'utf-8')) as T) ?? null
  } catch (error) {
    throw new Error(`YAML 解析失败 ${filePath}：${(error as Error).message}`)
  }
}

/** 读派生文件（config/explore-decomposed.yaml）。
 *
 *  统一写 JSON 后，读方不再靠扩展名猜格式。但派生文件若被别的写者写成 YAML，
 *  必须直接报错而不是让 js-yaml 静默兼容——格式漂移一旦静默通过，构建期才会
 *  在 JSON.parse 上炸，而那时错误现场已经离原因很远。 */
function readDerived<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  const text = fs.readFileSync(filePath, 'utf-8')
  if (!text.trimStart().startsWith('{')) {
    throw new Error(
      `派生文件格式漂移 ${filePath}：期望 JSON（以 { 开头），实际是 YAML。` +
        '所有写者必须统一写 JSON（见 writeOutput 的说明）。'
    )
  }
  try {
    return (yaml.load(text) as T) ?? null
  } catch (error) {
    throw new Error(`解析失败 ${filePath}：${(error as Error).message}`)
  }
}

/**
 * 原子写：先写同目录临时文件再替换，避免中途失败留下半截文件。
 *
 * 格式统一（2026-11-10）：本文件写 JSON，不再写 YAML。
 * 此前本工具用 yaml.dump 写出 YAML，而 rule-decompose.mjs / merge-fine-parts.mjs
 * 用 JSON.stringify 写出 JSON，构建期 build-webui-data.mjs 又用 JSON.parse 读——
 * 三个写者格式互斥，跑一次 decompose:explore 就会产出 YAML，让构建链在
 * JSON.parse 上直接抛错。现统一为 JSON：与另两个写者、与构建期读取、与当前
 * 数据文件内容全部一致。
 *
 * 文件名沿用 .yaml 是既有事实（扩展名与内容不符），不单独改名，避免牵动
 * 采集链与 git 历史；读方一律走容错解析，格式判定不靠扩展名。 */
export function writeOutput(
  filePath: string,
  jobs: ExploreJobDecomposition[],
  model: string
): void {
  const config: ExploreDecomposedConfig = {
    methodologyVersion: METHODOLOGY_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    model,
    jobs,
  }
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, serializeDecomposed(config), 'utf-8')
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true })
  fs.renameSync(tmp, filePath)
}

// ── 主流程 ──────────────────────────────────────────────

export interface DecomposeOptions {
  /** 项目根目录 */
  root: string
  /** 全量重算（忽略已有分解） */
  all?: boolean
  /** 最多处理多少条（小批验证用） */
  limit?: number
  /** 只看待分解清单，不调 API、不写文件 */
  dryRun?: boolean
  /** 日志 */
  log?: (message: string) => void
}

export interface DecomposeSummary {
  total: number
  reused: number
  pending: number
  done: number
  failed: number
  written: boolean
}

export async function decomposeExplore(options: DecomposeOptions): Promise<DecomposeSummary> {
  const log = options.log ?? (() => {})
  const root = options.root
  const configDir = path.join(root, 'config')
  const snapshotPath = path.join(configDir, SNAPSHOT_FILE)
  const outputPath = path.join(configDir, OUTPUT_FILE)

  // 1) 快照 + 已有派生数据 + 方法论（方法论读不到就直接失败，避免静默用旧口径）
  const snapshot = readYaml<ExploreConfig>(snapshotPath)
  if (!snapshot?.jobs?.length) {
    throw new Error(`找不到探索榜快照或快照为空：${snapshotPath}。先跑 npm run collect:explore`)
  }
  const existing = readDerived<ExploreDecomposedConfig>(outputPath)
  const methodology = loadMethodology(root)
  log(`方法论来源：${SKILL_FILE.replace(/\\/g, '/')} 第二章（${METHODOLOGY_VERSION}）`)

  // 2) 已有结果里只保留「仍在当前快照 + schema/方法论都未过期」的；顺手清掉孤儿
  const allIds = new Set(snapshot.jobs.map(job => job.id))
  const results = new Map<string, ExploreJobDecomposition>()
  for (const item of existing?.jobs ?? []) {
    if (!item || typeof item.jobId !== 'string' || !allIds.has(item.jobId)) continue
    if (item.schemaVersion !== SCHEMA_VERSION) continue
    if (item.methodologyVersion !== METHODOLOGY_VERSION) continue
    results.set(item.jobId, item)
  }

  let pending = snapshot.jobs.filter(job => options.all || !results.has(job.id))
  if (options.limit && options.limit > 0) pending = pending.slice(0, options.limit)

  log(
    `快照 ${snapshot.jobs.length} 条作业 · 已有有效分解 ${results.size} 条 · ` +
      `待分解 ${pending.length} 条${options.all ? '（--all 全量）' : '（增量）'}`
  )

  const summary: DecomposeSummary = {
    total: snapshot.jobs.length,
    reused: results.size,
    pending: pending.length,
    done: 0,
    failed: 0,
    written: false,
  }

  if (options.dryRun) {
    for (const job of pending.slice(0, 5)) {
      log(`  · ${job.id} | ${job.prompt.slice(0, 60)}`)
    }
    log('--dry-run：未调用 LLM，未写文件')
    return summary
  }

  if (pending.length === 0) {
    // 即便没有新增，也要落一次盘：把窗口外的孤儿从派生文件里清掉
    const ordered = orderedResults(snapshot.jobs, results)
    writeOutput(outputPath, ordered, describeSources(ordered))
    summary.written = true
    log(`无需新增分解，已写 ${outputPath}（${ordered.length} 条，清理孤儿完成）`)
    return summary
  }

  loadEnvFile(root)
  const llm = llmOptionsFromEnv()
  const concurrency = concurrencyFromEnv()
  const system = buildSystemPrompt(methodology)
  log(`LLM：${llm.model} @ ${chatCompletionsUrl(llm.baseUrl)} · 并发 ${concurrency}`)

  const queue = [...pending]
  let cursor = 0
  let done = 0
  let failed = 0
  let lastCheckpoint = 0

  /** 每次落盘都按快照顺序输出，保证 diff 稳定且自动清理孤儿 */
  const checkpoint = () => {
    const ordered = orderedResults(snapshot.jobs, results)
    writeOutput(outputPath, ordered, describeSources(ordered))
    summary.written = true
  }

  const worker = async () => {
    while (cursor < queue.length) {
      const job = queue[cursor++]
      try {
        results.set(job.id, await decomposeJob(job, system, llm))
        done++
        summary.done = done
        if (done - lastCheckpoint >= CHECKPOINT_EVERY) {
          checkpoint()
          lastCheckpoint = done
          log(`  [${done}/${pending.length}] 已完成，已落盘`)
        }
      } catch (error) {
        failed++
        summary.failed = failed
        log(`  分解失败 ${job.id}：${(error as Error).message}`)
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  } finally {
    // 只在「至少成功一条」时写：代理完全不可达时保留上一份派生数据，不写坏文件
    if (done > 0) checkpoint()
  }

  if (done === 0) {
    throw new Error(
      `${failed} 条作业全部分解失败，未写 ${outputPath}（保留上一份数据）。` +
        '检查代理可达性与 .env 配置。'
    )
  }
  log(
    `完成：新增 ${done} 条 · 失败 ${failed} 条 · 派生文件共 ${results.size} 条 → ${outputPath}`
  )
  if (failed > 0) {
    // 部分失败：成功数据已落盘，下次增量会补上失败的；但仍让流水线感知异常
    throw new Error(`${failed} 条分解失败（成功的 ${done} 条已落盘），下次运行会自动补算`)
  }
  return summary
}

/** 按快照里的作业顺序输出，缺失的跳过（那些就是本次失败 / 待补算的） */
function orderedResults(
  jobs: ExploreJob[],
  results: Map<string, ExploreJobDecomposition>
): ExploreJobDecomposition[] {
  const out: ExploreJobDecomposition[] = []
  for (const job of jobs) {
    const item = results.get(job.id)
    if (item) out.push(item)
  }
  return out
}

// ── CLI ─────────────────────────────────────────────────

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const argv = process.argv.slice(2)
  const readArg = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const limitRaw = Number(readArg('limit') ?? NaN)

  decomposeExplore({
    root,
    all: argv.includes('--all'),
    dryRun: argv.includes('--dry-run'),
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : undefined,
    log: message => console.log(`[decompose-explore] ${message}`),
  })
    .then(result => {
      console.log(
        `[decompose-explore] 汇总：全量 ${result.total} · 复用 ${result.reused} · ` +
          `待分解 ${result.pending} · 成功 ${result.done} · 失败 ${result.failed}`
      )
    })
    .catch((error: Error) => {
      console.error(`[decompose-explore] 失败：${error.message}`)
      process.exit(1)
    })
}
