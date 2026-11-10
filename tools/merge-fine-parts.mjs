#!/usr/bin/env node
/**
 * 逐条精拆分片：契约校验 + 质量守门 + 合并回主数据。
 *
 * 用法：
 *   node tools/merge-fine-parts.mjs --check    # 只校验分片，不写主文件
 *   node tools/merge-fine-parts.mjs            # 校验并合并写回 config/explore-decomposed.yaml
 *
 * 输出格式：JSON。派生文件 config/explore-decomposed.yaml 由全部写者统一写 JSON
 * （另两个写者是 tools/decompose-explore.ts 与 tools/rule-decompose.mjs）。
 * 文件名沿用 .yaml 是历史遗留，读方走容错解析，不靠扩展名判格式。
 *
 * 分片格式（config/decompose-parts/part-NNN.json，顶层数组）：
 *   {
 *     "jobId": "...",
 *     "framework": "人物画像" | "物体描述" | null,
 *     "segments": [ { "text": "...", "note": "..." }, ... ],   // 恰好 7 项，段号/模块名由本脚本按方法论给定
 *     "composition": ["引导线（推断）"],
 *     "tags": { "style": [], "lighting": [], "angle": [], "emotion": [] },
 *     "paramTail": { "text": "", "params": [] },
 *     "health": [ { "id": "R1", "ok": true, "note": "..." }, ... ],
 *     "summary": "一句自然的中文概括"
 *   }
 * 机械字段（schemaVersion / methodologyVersion / model / generatedAt）由脚本补齐，
 * 让精拆者把输出预算全部花在实质判断上。
 *
 * 质量守门（关键）：防止把「规则解析」或模板填充伪装成精拆。
 *   - 七段 note 至少 4 条是「非模板且 >= 12 字」的具体理解
 *   - 体检 note 至少 6 条是「非模板且 >= 10 字」的具体理由
 *   - 中文速读必须是自然句，不能是规则版那种「A，B，9:16 画幅。」词表拼接
 *   - 全部字段契约 + jobId 必须命中快照
 * 守门失败会列出文件名 / jobId / 具体原因，退出码 1，绝不写主文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describeSources, serializeDecomposed } from './decomposed-format.mjs'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = path.join(ROOT, 'config', 'explore.yaml')
const DECOMPOSED = path.join(ROOT, 'config', 'explore-decomposed.yaml')
const PARTS_DIR = path.join(ROOT, 'config', 'decompose-parts')

const MODEL_FINE = 'WorkBuddy 逐条精拆 v1（LLM 语义判断）'
const METHODOLOGY_VERSION = 'v8.2'
const SCHEMA_VERSION = 1
const SEGMENT_MODULES = ['主体', '动作 / 状态', '细节与环境', '构图与镜头', '光线与色彩', '风格与审美', '参数尾']
const VALID_HEALTH = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'M1', 'M2', 'M3', 'M4', 'M5', 'V1', 'V2', 'V3', 'V4'])
const VALID_FRAMEWORK = new Set(['人物画像', '物体描述'])

/** 规则解析器产出的固定模板句：精拆条目若大量复用，说明没做语义判断 */
const TEMPLATE_NOTES = new Set([
  '未检出显式动作或状态词',
  '未检出景别 / 机位 / 焦段信号',
  '未检出显式光线或色调词',
  '首个短语视为主体，位置最前（铁律 2）',
  '主体位于首个短语，权重保住',
  '名词短语为主，未检出完整描述句',
  '全文英文半角标点',
  '未见画质堆料词',
  '单主体或主体明确',
  '未要求画面出现准确文字',
  '未堆砌 8k / masterpiece / best quality',
  '无中文长句',
  '未出现 :: 权重语法（V7+ 已移除）',
  '未使用 --no，无逐词审核误伤风险',
  '无排除项，未使用 --no',
])

/** 规则版中文速读特征：短词表 + 「N:M 画幅。」收尾 */
const RULE_SUMMARY_RE = /^[^，。]{1,10}(，[^，。]{1,10}){0,5}，\d+:\d+ 画幅。$/

const isSpecific = (s, min) => typeof s === 'string' && s.trim().length >= min && !TEMPLATE_NOTES.has(s.trim())

function checkItem(raw, file, index, snapshotIds) {
  const at = `${file}[${index}] ${raw && raw.jobId ? raw.jobId.slice(0, 8) : '(无 jobId)'}`
  const err = msg => new Error(`${at}: ${msg}`)
  if (!raw || typeof raw !== 'object') throw err('不是对象')
  if (!raw.jobId || !snapshotIds.has(raw.jobId)) throw err('jobId 缺失或不在 explore.yaml 快照里')
  if (raw.framework !== null && !VALID_FRAMEWORK.has(raw.framework)) throw err('framework 只能是 人物画像 / 物体描述 / null')
  if (!Array.isArray(raw.segments) || raw.segments.length !== 7) throw err('segments 必须恰好 7 项')
  for (let i = 0; i < 7; i++) {
    const s = raw.segments[i]
    if (!s || typeof s.text !== 'string' || typeof s.note !== 'string' || !s.note.trim()) {
      throw err(`第 ${i + 1} 段缺 text 或 note`)
    }
  }
  const specificSegments = raw.segments.filter(s => isSpecific(s.note, 12)).length
  if (specificSegments < 4) throw err(`七段 note 里只有 ${specificSegments} 条具体理解（需 >= 4 条、每条 >= 12 字且非模板句）——疑似模板填充`)

  if (!Array.isArray(raw.composition)) throw err('composition 必须是数组')
  for (const k of ['style', 'lighting', 'angle', 'emotion']) {
    if (!raw.tags || !Array.isArray(raw.tags[k])) throw err(`tags.${k} 必须是数组`)
  }
  if (!raw.paramTail || !Array.isArray(raw.paramTail.params) || typeof raw.paramTail.text !== 'string') {
    throw err('paramTail 结构不合法')
  }
  if (!Array.isArray(raw.health) || raw.health.length < 11) throw err('health 至少 11 项')
  const ids = raw.health.map(h => h && h.id)
  if (ids.some(id => !VALID_HEALTH.has(id))) throw err('health 含非法 id：' + ids.filter(id => !VALID_HEALTH.has(id)).join(','))
  if (new Set(ids).size !== ids.length) throw err('health id 重复')
  for (const h of raw.health) {
    if (typeof h.ok !== 'boolean' || typeof h.note !== 'string' || !h.note.trim()) throw err(`体检 ${h.id} 缺 ok 或 note`)
  }
  const specificHealth = raw.health.filter(h => isSpecific(h.note, 10)).length
  if (specificHealth < 6) throw err(`体检 note 里只有 ${specificHealth} 条具体理由（需 >= 6 条、每条 >= 10 字且非模板句）`)

  const summary = String(raw.summary || '').trim()
  if (summary.length < 12) throw err('中文速读过短（需 >= 12 字）')
  if (RULE_SUMMARY_RE.test(summary)) throw err('中文速读是规则版词表拼接，不是自然概括')
  if (!/[，。；、]/.test(summary)) throw err('中文速读不像自然中文句')

  return {
    jobId: raw.jobId,
    schemaVersion: SCHEMA_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    framework: raw.framework,
    segments: raw.segments.map((s, i) => ({
      code: String(i + 1),
      module: SEGMENT_MODULES[i],
      text: s.text,
      note: s.note,
    })),
    composition: raw.composition,
    tags: raw.tags,
    paramTail: raw.paramTail,
    health: raw.health,
    summary,
    model: MODEL_FINE,
    generatedAt: new Date().toISOString(),
  }
}

function readParts() {
  if (!fs.existsSync(PARTS_DIR)) return []
  return fs.readdirSync(PARTS_DIR)
    .filter(f => /^part-\d+\.json$/.test(f))
    .sort()
    .map(file => {
      const items = JSON.parse(fs.readFileSync(path.join(PARTS_DIR, file), 'utf8'))
      if (!Array.isArray(items)) throw new Error(`${file} 顶层必须是数组`)
      return { file, items }
    })
}

function main() {
  const checkOnly = process.argv.includes('--check') || process.argv.includes('--dry-run')
  const snap = yaml.load(fs.readFileSync(SNAPSHOT, 'utf8'))
  const snapshotIds = new Set(snap.jobs.map(j => j.id))
  // --part <file>：只校验/合并指定分片。subagent 并行时逐片验收用，
  // 避免某个坏分片阻塞全量 --check；全部收工后仍必须跑一次不带 --part 的全量校验。
  const partArg = process.argv.indexOf('--part')
  let parts
  if (partArg >= 0) {
    const rel = process.argv[partArg + 1]
    if (!rel) throw new Error('--part 需要文件路径')
    const abs = path.isAbsolute(rel) ? rel : path.resolve(ROOT, rel)
    const items = JSON.parse(fs.readFileSync(abs, 'utf8'))
    if (!Array.isArray(items)) throw new Error(`${rel} 顶层必须是数组`)
    parts = [{ file: path.basename(abs), items }]
  } else {
    parts = readParts()
  }
  if (!parts.length) throw new Error('config/decompose-parts/ 下没有 part-*.json 分片')

  const normalized = []
  const seen = new Set()
  for (const { file, items } of parts) {
    items.forEach((raw, i) => {
      const item = checkItem(raw, file, i, snapshotIds)
      if (seen.has(item.jobId)) throw new Error(`jobId 在多个分片里重复：${item.jobId}`)
      seen.add(item.jobId)
      normalized.push(item)
    })
  }
  console.log(`OK: ${parts.length} 个分片 / ${normalized.length} 条逐条精拆，契约与质量守门全部通过`)

  const base = yaml.load(fs.readFileSync(DECOMPOSED, 'utf8'))
  const byId = new Map(base.jobs.map(x => [x.jobId, x]))
  const handIds = new Set(base.jobs.filter(x => x.model.includes('手工')).map(x => x.jobId))
  let overwritten = 0
  let skippedHand = 0
  for (const item of normalized) {
    if (handIds.has(item.jobId)) { skippedHand++; continue }   // 3 条手工精拆优先级最高，不覆盖
    if (byId.has(item.jobId)) overwritten++
    byId.set(item.jobId, item)
  }

  const jobs = snap.jobs.map(j => byId.get(j.id)).filter(Boolean)
  const counts = {}
  for (const j of jobs) counts[j.model] = (counts[j.model] || 0) + 1
  const hand = counts['WorkBuddy 手工分解（mj-prompt-decompose skill v1.0.0）'] || 0
  const fine = counts[MODEL_FINE] || 0
  const rule = jobs.length - hand - fine

  console.log(`合并预览：总 ${jobs.length} 条 = 手工 ${hand} + 逐条精拆 ${fine} + 规则兜底 ${rule}`)
  console.log(`本轮覆盖规则条目 ${overwritten} 条；手工条目跳过 ${skippedHand} 条`)
  if (checkOnly) {
    console.log('--check 模式：未写主文件')
    return
  }

  base.jobs = jobs
  base.generatedAt = new Date().toISOString()
  // 顶层 model 如实统计各来源（共用 tools/decomposed-format.mjs 的 describeSources），
  // 不写死「手工 + LLM + 规则」三段——真实构成会变，写死会谎报。
  base.model = describeSources(jobs)
  fs.writeFileSync(DECOMPOSED, serializeDecomposed(base), 'utf8')
  console.log(`OK: 已写回 ${path.relative(ROOT, DECOMPOSED)}（${(fs.statSync(DECOMPOSED).size / 1024 / 1024).toFixed(2)} MB）`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
