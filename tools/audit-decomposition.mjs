#!/usr/bin/env node
/**
 * 拆解质量审计（**只读**，不写任何文件）。
 *
 * 背景：config/explore-decomposed.yaml 混有「手工精拆 / 逐条精拆 / 规则兜底」三种来源，
 * 现有守门 tools/merge-fine-parts.mjs 只查 note 长度、模板句黑名单、summary 自然句与字段契约，
 * 不检查「原文里的实词是否真的被拆进七段」，所以「LLM 只摘了几个词、其余丢掉」能全绿通过。
 *
 * 本工具补上这一层，把可疑条目变成可复现的清单：
 *   node tools/audit-decomposition.mjs                 分组统计 + 逐条精拆里的可疑条目
 *   node tools/audit-decomposition.mjs --all          连规则兜底的最差条目一起列
 *   node tools/audit-decomposition.mjs --top 30       控制清单条数（默认 20）
 *   node tools/audit-decomposition.mjs --ids          只输出待重拆 jobId（逗号分隔，喂给 fine-decompose.mjs --ids）
 *   node tools/audit-decomposition.mjs --json         输出完整机器可读结果
 *
 * 指标是**启发式**：中文 / 日文 / 韩文长句里 LLM 本就只摘关键词，覆盖率天然偏低，
 * 因此阈值只用来排优先级，最终是否重拆仍需人工对照原文抽检。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = path.join(ROOT, 'config', 'explore.yaml')
const DECOMPOSED = path.join(ROOT, 'config', 'explore-decomposed.yaml')
const PARTS_DIR = path.join(ROOT, 'config', 'decompose-parts')

/** 与 tools/merge-fine-parts.mjs:51-67 保持一致；改那边时同步改这里 */
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
const RULE_SUMMARY_RE = /^[^，。]{1,10}(，[^，。]{1,10}){0,5}，\d+:\d+ 画幅。$/

/** 判据集中在这里，方便按人工抽检结果调 */
const TH = {
  minCoverage: 0.55,   // 原文实词覆盖率低于此值 → LOW_COVERAGE
  minLexemes: 8,       // 原文实词太少时不判覆盖率（短 prompt 噪声大）
  maxEmpty: 3,         // 空 text 段 >= 3 → EMPTY_SEGMENTS（仅对非短 prompt）
  minLexemesForEmpty: 12, // 短 prompt 的七段空段是契约允许的（fine-agent-prompt.md:34），不判偷懒
  minUnexplainedEmpty: 2, // 空段里 >=2 段「连具体解释都没有」才算偷懒；精拆契约要求 note 说明缺失原因
  minSpecificNotes: 6, // 七段 note 具体数 < 6 → THIN_NOTES（守门只要求 4）
  dumpRatio: 0.70,     // 单段 text / 原文 >= 0.70 且段长 > 60 → WHOLE_DUMP
}

const argv = process.argv.slice(2)
const has = f => argv.includes(f)
const argNum = (f, dflt) => {
  const i = argv.indexOf(f)
  const v = i >= 0 ? Number(argv[i + 1]) : NaN
  return Number.isFinite(v) && v > 0 ? v : dflt
}

/** 归一化：去标点，保留英文数字与 CJK */
const norm = s => String(s || '').toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/** 实词集合：英文按词（>=3 字母），CJK 按 bigram；中英混排也能用 */
function lexemes(text) {
  const out = new Set()
  const s = norm(text)
  for (const tok of s.split(' ')) {
    if (/^[a-z0-9]+$/.test(tok)) {
      if (tok.length >= 3) out.add(tok)
    } else {
      const cjk = tok.replace(/[^\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '')
      for (let i = 0; i + 1 < cjk.length; i++) out.add(cjk.slice(i, i + 2))
    }
  }
  return out
}

const isSpecific = (s, min) => typeof s === 'string' && s.trim().length >= min && !TEMPLATE_NOTES.has(s.trim())

/** 参数尾单独摘掉：它本就该整段进⑦，不该算进「主体段覆盖率」分母 */
function stripParams(prompt) {
  const i = prompt.search(/\s--[a-z]/)
  return (i < 0 ? prompt : prompt.slice(0, i)).trim()
}

function sourceOf(job) {
  const m = String(job?.model || '')
  if (m.includes('手工')) return '手工精拆'
  if (m.includes('逐条精拆')) return '逐条精拆'
  if (m.includes('规则解析')) return '规则兜底'
  return '未知来源'
}

function audit(job, prompt, partFile) {
  const seg = Array.isArray(job.segments) ? job.segments : []
  const health = Array.isArray(job.health) ? job.health : []
  const body = stripParams(prompt)
  const allText = seg.map(s => String(s.text || '')).join(' ')
  const srcLex = lexemes(body)
  const hitLex = lexemes(allText)
  const hitCount = [...srcLex].filter(x => hitLex.has(x)).length
  const coverage = srcLex.size ? hitCount / srcLex.size : 1
  const emptySegments = seg.filter(s => !String(s.text || '').trim()).length
  // 精拆契约允许「没命中就留空」，但要求 note 解释原因；有具体解释的空段是合法结果，不是偷懒。
  const unexplainedEmpty = seg.filter(s => !String(s.text || '').trim() && !isSpecific(s.note, 12)).length
  const noteSpecific = seg.filter(s => isSpecific(s.note, 12)).length
  const healthSpecific = health.filter(h => isSpecific(h.note, 10)).length
  const templateHits = [...seg, ...health].filter(x => TEMPLATE_NOTES.has(String(x.note || '').trim())).length
  const longest = Math.max(0, ...seg.map(s => String(s.text || '').trim().length))
  const dumpRatio = body.length ? longest / body.length : 0
  const summary = String(job.summary || '').trim()

  const flags = []
  if (srcLex.size >= TH.minLexemes && coverage < TH.minCoverage) flags.push('LOW_COVERAGE')
  if (srcLex.size >= TH.minLexemesForEmpty && emptySegments >= TH.maxEmpty
      && unexplainedEmpty >= TH.minUnexplainedEmpty) flags.push('EMPTY_SEGMENTS')
  if (noteSpecific < TH.minSpecificNotes) flags.push('THIN_NOTES')
  if (templateHits > 0) flags.push('TEMPLATE_NOTES')
  if (longest > 60 && dumpRatio >= TH.dumpRatio) flags.push('WHOLE_DUMP')
  if (RULE_SUMMARY_RE.test(summary)) flags.push('RULE_SUMMARY')
  if (summary.length < 12) flags.push('SHORT_SUMMARY')

  // 三类来源语义不同，不能混为一谈：只有逐条精拆是 LLM 产物，flags 才代表「偷懒候选」。
  // 手工精拆 = 已验收基准（SKILL.md 第九节优先级最高，fine-decompose.mjs:61 明确不重拆）。
  // 规则兜底 = 根本没过 LLM，不是偷懒，是尚未精拆。
  const source = sourceOf(job)
  const category = source === '逐条精拆' ? 'LAZY_SUSPECT'
    : source === '手工精拆' ? 'HAND_BASELINE' : 'NOT_LLM'

  return {
    jobId: job.jobId,
    source,
    category,
    part: partFile || null,
    flags,
    coverage: Number(coverage.toFixed(3)),
    lexemes: srcLex.size,
    matched: hitCount,
    emptySegments,
    unexplainedEmpty,
    noteSpecific,
    healthItems: health.length,
    healthSpecific,
    templateHits,
    longestSegment: longest,
    dumpRatio: Number(dumpRatio.toFixed(3)),
    summaryLength: summary.length,
    prompt: prompt.slice(0, 160),
  }
}

function readPartMap() {
  const map = new Map()
  if (!fs.existsSync(PARTS_DIR)) return map
  for (const f of fs.readdirSync(PARTS_DIR).filter(x => /^part-\d+\.json$/.test(x)).sort()) {
    const items = JSON.parse(fs.readFileSync(path.join(PARTS_DIR, f), 'utf8'))
    if (!Array.isArray(items)) continue
    for (const x of items) if (x && x.jobId) map.set(x.jobId, f)
  }
  return map
}

function main() {
  const snap = yaml.load(fs.readFileSync(SNAPSHOT, 'utf8'))
  // 派生文件统一写 JSON；容错读 YAML 只是不因格式漂移让只读审计工具直接崩。
  const decText = fs.readFileSync(DECOMPOSED, 'utf8')
  let dec
  try {
    dec = JSON.parse(decText)
  } catch {
    dec = yaml.load(decText) || { jobs: [] }
    console.warn(`[audit-decomposition] 警告：派生文件内容是 YAML，已容错读入（应统一写 JSON）`)
  }
  const jobs = Array.isArray(snap.jobs) ? snap.jobs : []
  const byId = new Map((dec.jobs || []).map(j => [j.jobId, j]))
  const partMap = readPartMap()

  const rows = []
  const missing = []
  for (const j of jobs) {
    const d = byId.get(j.id)
    if (!d) { missing.push(j.id); continue }
    rows.push(audit(d, String(j.prompt || ''), partMap.get(j.id)))
  }

  const groups = {}
  for (const r of rows) (groups[r.source] = groups[r.source] || []).push(r)
  const avg = (arr, k) => arr.length ? arr.reduce((s, x) => s + x[k], 0) / arr.length : 0

  if (has('--json')) {
    console.log(JSON.stringify({ thresholds: TH, totalSnapshot: jobs.length, totalDecomposed: dec.jobs.length, missing, rows }, null, 2))
    return
  }

  const lazy = rows.filter(r => r.category === 'LAZY_SUSPECT' && r.flags.length > 0)
  const notLlm = rows.filter(r => r.category === 'NOT_LLM')
  const ids = lazy.map(r => r.jobId)
  if (has('--ids')) { console.log(ids.join(',')); return }

  console.log(`快照 ${jobs.length} 条 / 已拆解 ${dec.jobs.length} 条 / 无拆解 ${missing.length} 条`)
  console.log(`阈值：覆盖率 < ${TH.minCoverage}（实词 >= ${TH.minLexemes}）· 空段 >= ${TH.maxEmpty}（实词 >= ${TH.minLexemesForEmpty} 且无解释空段 >= ${TH.minUnexplainedEmpty} 才判）· 具体 note < ${TH.minSpecificNotes} · 整坨搬运 >= ${TH.dumpRatio}\n`)
  console.log('来源'.padEnd(12) + '条数  覆盖率   空段/条  具体note/条  模板note/条  速读均长  质量flag')
  for (const [k, arr] of Object.entries(groups)) {
    console.log(
      k.padEnd(12) + String(arr.length).padEnd(6) +
      (avg(arr, 'coverage') * 100).toFixed(1).padStart(5) + '%' +
      avg(arr, 'emptySegments').toFixed(2).padStart(9) +
      avg(arr, 'noteSpecific').toFixed(2).padStart(12) +
      avg(arr, 'templateHits').toFixed(2).padStart(13) +
      avg(arr, 'summaryLength').toFixed(0).padStart(10) +
      String(arr.filter(r => r.flags.length).length).padStart(11)
    )
  }

  const flagCounts = {}
  for (const r of lazy) for (const f of r.flags) flagCounts[f] = (flagCounts[f] || 0) + 1
  console.log('\n逐条精拆 Flag 分布：' + (Object.entries(flagCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ') || '无'))
  console.log(`\n【结论】逐条精拆 ${groups['逐条精拆']?.length || 0} 条里疑似偷懒 ${lazy.length} 条；手工精拆 ${groups['手工精拆']?.length || 0} 条为已验收基准（不重拆）；规则兜底 ${notLlm.length} 条是尚未精拆，不是 LLM 偷懒。`)

  const top = argNum('--top', 20)
  const render = (r) => {
    console.log(`  ${r.jobId.slice(0, 8)} [${(r.source + (r.part ? '/' + r.part.replace('part-', 'p').replace('.json', '') : '')).padEnd(18)}] cov=${(r.coverage * 100).toFixed(0)}% 空段=${r.emptySegments} 具体note=${r.noteSpecific} 模板=${r.templateHits} | ${r.flags.join(',')}`)
    console.log(`      原文：${r.prompt.replace(/\s+/g, ' ').slice(0, 110)}`)
  }
  const list = [...lazy].sort((a, b) => b.flags.length - a.flags.length || a.coverage - b.coverage).slice(0, top)
  console.log(`\n待重拆清单（前 ${list.length} 条 / 共 ${lazy.length} 条，只含 LLM 逐条精拆）：`)
  for (const r of list) render(r)
  if (has('--all')) {
    const worst = [...notLlm].filter(r => r.flags.length).sort((a, b) => a.coverage - b.coverage || b.flags.length - a.flags.length).slice(0, top)
    console.log(`\n规则兜底最差 ${worst.length} 条（尚未精拆，按覆盖率排序，供排补拆优先级）：`)
    for (const r of worst) render(r)
  }
  console.log('\n提示：--ids 可直接导出待重拆 jobId（配合 node tools/fine-decompose.mjs --ids <ids> 取原文）。')
  console.log('本工具只读，未写入任何文件；覆盖率是启发式指标，中文长句需人工对照原文抽检。')
}

main()
