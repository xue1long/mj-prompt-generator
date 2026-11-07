#!/usr/bin/env node
/**
 * 逐条精拆工作流的「进度 + 取数」工具。
 *
 * 背景：探索榜 942 条，其中 939 条是确定性规则解析（降级质量）。用户要求
 * 逐条由 LLM 按 SKILL.md「完整版工作流」精拆。单轮会话装不下 939 条的
 * 精读 + 输出，因此采用「分片 + 断点续跑」：
 *
 *   config/decompose-parts/part-001.json   每片一个 JSON 数组（完整分解对象）
 *   tools/merge-fine-parts.mjs             校验分片并合并回主数据文件
 *
 * 本工具只负责：
 *   --status              显示进度（总数 / 手工 / 已精拆 / 规则兜底 / 剩余）
 *   --next N              导出接下来 N 条待精拆作业的原文（默认 25 条）
 *   --batch K --size N    导出第 K 批（1-based，按待精拆队列切片）
 *   --ids id1,id2,...     精确取指定 jobId（补拆用）
 *
 * 断点 = 分片文件 + 主数据里 model 含「逐条精拆」的条目 + 3 条手工精拆。
 * 不需要额外的 progress 文件，重跑天然幂等。
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

export const MODEL_FINE = 'WorkBuddy 逐条精拆 v1（LLM 语义判断）'
const DEFAULT_SIZE = 25

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag)
  if (i < 0) return fallback
  const v = Number(process.argv[i + 1])
  return Number.isFinite(v) && v > 0 ? v : fallback
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

function collectState() {
  const snap = yaml.load(fs.readFileSync(SNAPSHOT, 'utf8'))
  const dec = yaml.load(fs.readFileSync(DECOMPOSED, 'utf8'))
  const parts = readParts()
  const partIds = new Set(parts.flatMap(p => p.items.map(x => x.jobId)))
  const handIds = new Set(dec.jobs.filter(x => x.model.includes('手工')).map(x => x.jobId))
  const fineIds = new Set(dec.jobs.filter(x => x.model.includes('逐条精拆')).map(x => x.jobId))
  const done = new Set([...partIds, ...handIds, ...fineIds])
  const pending = snap.jobs.filter(j => !done.has(j.id))
  return { snap, dec, parts, partIds, handIds, fineIds, pending }
}

function printStatus(s) {
  const total = s.snap.jobs.length
  const hand = s.handIds.size
  const fine = new Set([...s.partIds, ...s.fineIds]).size
  console.log([
    `总作业      ${total}`,
    `手工精拆    ${hand}（不重拆）`,
    `逐条精拆    ${fine}（分片 ${s.parts.length} 个：${s.parts.map(p => p.file + '=' + p.items.length).join(', ') || '无'}）`,
    `规则兜底    ${total - hand - fine}（待逐条覆盖，其中本轮队列 ${s.pending.length} 条）`,
    `完成度      ${(((hand + fine) / total) * 100).toFixed(1)}%`,
  ].join('\n'))
}

function renderJob(j, n) {
  const oneLine = String(j.prompt || '').replace(/\s*\r?\n\s*/g, ' ').trim()
  return [
    `[${n}] ${j.id} | ${j.aspect || '-'} | ${j.author || '-'} | v${j.version || '-'} | sref=${j.sref || '无'} | len=${oneLine.length}`,
    `PROMPT: ${oneLine}`,
    '',
  ].join('\n')
}

function main() {
  const s = collectState()
  const argv = process.argv.slice(2)

  if (argv.includes('--status')) {
    printStatus(s)
    return
  }

  let picked
  if (argv.includes('--ids')) {
    const wanted = new Set((argv[argv.indexOf('--ids') + 1] || '').split(',').map(x => x.trim()).filter(Boolean))
    picked = s.snap.jobs.filter(j => wanted.has(j.id))
    if (!picked.length) throw new Error('--ids 没有命中任何 jobId')
  } else {
    const batch = argv.includes('--batch') ? argValue('--batch', 1) : null
    const size = argv.includes('--next')
      ? argValue('--next', DEFAULT_SIZE)
      : argValue('--size', DEFAULT_SIZE)
    const start = batch ? (batch - 1) * size : 0
    picked = s.pending.slice(start, start + size)
    if (!picked.length) {
      console.log('全部待精拆作业已覆盖，没有下一批。')
      return
    }
    console.log(`# 待精拆 ${s.pending.length} 条 · 本批 ${picked.length} 条（第 ${batch || 1} 批，每批 ${size} 条）`)
    console.log('# 输出格式：[序号] jobId | 比例 | 作者 | 版本 | sref | 长度，下一行 PROMPT 全文')
    console.log('')
  }

  picked.forEach((j, i) => process.stdout.write(renderJob(j, i + 1)))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
