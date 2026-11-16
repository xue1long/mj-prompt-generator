#!/usr/bin/env node
/**
 * 冻结式并行队列生成器 —— subagent 并行的前置，必须由主 agent 串行跑一次。
 *
 * 为什么需要它：tools/fine-decompose.mjs 的 `--batch K` 基于「实时 pending」切片，
 * 任何一个 subagent 落盘分片后 pending 就缩短，后续 agent 拿到的第 K 批会错位，
 * 导致重复精拆 / 漏拆。所以并行前把待精拆 jobId 一次性固化成文件，永不重算。
 *
 *   config/decompose-parts/queue/batch-NNN.json   { batch, size, ids }
 *   config/decompose-parts/part-NNN.json          subagent 产出（编号一一对应）
 *
 * 队列文件名不匹配 part-\d+.json 正则，不会被 merge-fine-parts.mjs 误读。
 * 编号从 002 起（part-001.json 是既有 25 条精拆）。
 *
 * 用法：
 *   node tools/build-fine-queue.mjs              # 首次：生成；之后：只读校验 + 状态
 *   node tools/build-fine-queue.mjs --status     # 只打印状态（队列 / 已完成 / 待派发）
 *   node tools/build-fine-queue.mjs --verify     # 严格校验并集与快照一致，退出码 1 表示不一致
 *   node tools/build-fine-queue.mjs --size 5     # 仅首次生成时生效（默认 5）
 *
 * 冻结语义：队列一旦生成绝不覆盖。理由：生成后 pending 会随分片落盘持续缩短，
 * 重建会让编号漂移、已完成批次被重新派发。要全量重启请先人工清空 queue/ 与
 * part-002*.json（本工具故意不提供一键重置，避免误删审计源）。
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
const QUEUE_DIR = path.join(PARTS_DIR, 'queue')
const FIRST_BATCH = 2
const DEFAULT_SIZE = 5

const pad = n => String(n).padStart(3, '0')
const queueName = n => `batch-${pad(n)}.json`
const partName = n => `part-${pad(n)}.json`

function argNumber(flag, fallback) {
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
    .map(file => ({
      file,
      items: JSON.parse(fs.readFileSync(path.join(PARTS_DIR, file), 'utf8')),
    }))
}

function collectState() {
  const snap = yaml.load(fs.readFileSync(SNAPSHOT, 'utf8'))
  const dec = yaml.load(fs.readFileSync(DECOMPOSED, 'utf8'))
  const parts = readParts()
  const handIds = new Set(dec.jobs.filter(x => x.model.includes('手工')).map(x => x.jobId))
  const partIds = new Set(parts.flatMap(p => p.items.map(x => x.jobId)))
  const fineIds = new Set(dec.jobs.filter(x => x.model.includes('逐条精拆')).map(x => x.jobId))
  const done = new Set([...handIds, ...partIds, ...fineIds])
  const pending = snap.jobs.filter(j => !done.has(j.id))
  return { snap, dec, parts, handIds, partIds, fineIds, done, pending }
}

function readQueues() {
  if (!fs.existsSync(QUEUE_DIR)) return []
  return fs.readdirSync(QUEUE_DIR)
    .filter(f => /^batch-\d+\.json$/.test(f))
    .sort()
    .map(file => ({ file, ...JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, file), 'utf8')) }))
}

/** 静态恒等式：队列并集 ∪ 手工 ∪ part-001 精拆 == 快照全集，三者互不相交 */
function verify(queues, s) {
  const snapIds = new Set(s.snap.jobs.map(j => j.id))
  const all = []
  for (const q of queues) {
    if (!Array.isArray(q.ids) || !q.ids.length) throw new Error(`${q.file}: ids 缺失或为空`)
    for (const id of q.ids) {
      if (!snapIds.has(id)) throw new Error(`${q.file}: id 不在快照里 ${id}`)
      all.push(id)
    }
  }
  if (new Set(all).size !== all.length) throw new Error(`队列里出现重复 jobId（${all.length - new Set(all).size} 个）`)

  const queueIds = new Set(all)
  const part001 = s.parts.find(p => p.file === 'part-001.json')
  const excluded = new Set([
    ...s.handIds,
    ...(part001 ? part001.items.map(x => x.jobId) : []),
  ])
  for (const id of queueIds) {
    if (excluded.has(id)) throw new Error(`队列含已精拆条目 ${id}`)
  }
  const union = new Set([...queueIds, ...excluded])
  if (union.size !== snapIds.size || [...snapIds].some(id => !union.has(id))) {
    throw new Error(`并集不等于快照全集：union=${union.size} snap=${snapIds.size}`)
  }
  return { queueIds, excluded, snapIds }
}

function printStatus(queues, s) {
  const pendingNums = queues
    .filter(q => !fs.existsSync(path.join(PARTS_DIR, partName(q.batch))))
    .map(q => q.batch)
  const doneNums = queues.length - pendingNums.length
  const covered = queues.filter(q => fs.existsSync(path.join(PARTS_DIR, partName(q.batch))))
    .reduce((n, q) => n + q.ids.length, 0)
  console.log([
    `队列分片    ${queues.length} 个（${queues.length ? queues[0].file + ' ~ ' + queues[queues.length - 1].file : '无'}）`,
    `每片条数    ${queues.length ? [...new Set(queues.map(q => q.ids.length))].join('/') : '-'}`,
    `已产出 part ${doneNums} 片 / 覆盖 ${covered} 条`,
    `待派发      ${pendingNums.length} 片，下一波建议：${pendingNums.slice(0, 4).map(pad).join(', ') || '无'}`,
    `主数据进度  手工 ${s.handIds.size} + 精拆 ${new Set([...s.partIds, ...s.fineIds]).size} / ${s.snap.jobs.length}`,
  ].join('\n'))
}

function main() {
  const argv = process.argv.slice(2)
  const s = collectState()
  let queues = readQueues()

  if (!queues.length && !argv.includes('--status') && !argv.includes('--verify')) {
    const size = argNumber('--size', DEFAULT_SIZE)
    fs.mkdirSync(QUEUE_DIR, { recursive: true })
    for (let i = 0, n = FIRST_BATCH; i < s.pending.length; i += size, n++) {
      const ids = s.pending.slice(i, i + size).map(j => j.id)
      const payload = { batch: n, size: ids.length, ids }
      fs.writeFileSync(path.join(QUEUE_DIR, queueName(n)), JSON.stringify(payload, null, 2) + '\n', 'utf8')
    }
    queues = readQueues()
    console.log(`OK: 已生成 ${queues.length} 份冻结队列，覆盖 ${s.pending.length} 条待精拆（每片 ${size} 条，编号 ${pad(FIRST_BATCH)}~${pad(FIRST_BATCH + queues.length - 1)}）`)
  }

  const { queueIds } = verify(queues, s)
  console.log(`OK: 队列校验通过 —— ${queueIds.size} 个唯一 jobId，与快照 / 手工 3 条 / part-001 精拆三方互不相交且并集完备`)
  printStatus(queues, s)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
