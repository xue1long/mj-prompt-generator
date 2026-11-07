#!/usr/bin/env node
/**
 * 技能包冒烟判定器。
 *
 * 把 evals.json 里"人读"的断言，翻译成机器可判的正则，逐条跑在 runs 目录下各 eval-N 的 output.md 上。
 * 只覆盖可机器判定的事实（flag 合法性、参数有无、输出结构）；提示词写得好不好由人评。
 *
 * 关键设计：**红线只扫"提示词正文"，不扫 agent 的讲解文字。**
 * agent 在"为什么这么写"里提到 `--cref`、`--style raw` 是在陈述"没用它"，那是正确的表述。
 * 提示词正文的特征是纯 ASCII 且含 `--flag`；含中文的行一律是散文，不参与红线判定。
 *
 * 用法：node evals/midjourney-prompt-writing/grade.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const runsDir = path.join(here, 'runs')

/** V8.2 非法写法：任何一条提示词正文出现即 FAIL */
const ILLEGAL = [
  { name: '--cref / --cw', re: /--cref\b|--cw\b/ },
  { name: '--style raw', re: /--style\s+raw\b/ },
  { name: '--q', re: /--q\b/ },
  { name: ':: 权重', re: /::/ },
  { name: '--v 8（应为 8.1/8.2）', re: /--v\s+8(?![.\d])/ },
  { name: '--preview', re: /--preview\b/ },
  { name: 'V6 后失效的堆料词', re: /\b8k\b|masterpiece|best quality/i },
]

/** 每个 eval 的专属判定（对提示词正文判定） */
const CHECKS = {
  1: [
    { name: '含竖版 --ar', re: /--ar\s+(4:5|9:16|2:3|3:4)\b/ },
    { name: '含 --raw', re: /--raw\b/ },
  ],
  2: [
    { name: '含 --raw', re: /--raw\b/ },
  ],
  3: [
    { name: '用 --edit 传角色图', re: /--edit\s+\S+/ },
    { name: '含 --ar 9:16', re: /--ar\s+9:16\b/ },
    { name: '调用情绪板（--profile / --p）', re: /--profile\b|--p\s+\S+/ },
  ],
  4: [
    { name: '出现 --sref', re: /--sref\s+\S+/ },
    { name: '用 --edit 传角色图', re: /--edit\s+\S+/ },
  ],
  5: [
    { name: '出现 --sref', re: /--sref\s+\S+/ },
    { name: '出现 --sw', re: /--sw\b/ },
    { name: '不带 --profile / --p', re: /--profile\b|--p\s+\S+/, negate: true },
  ],
  6: [
    { name: '含 --ar', re: /--ar\s+\S+/ },
  ],
}

/** 整篇文档的结构判定 */
const STRUCTURE = {
  6: [
    { name: '含「最终提示词」板块', re: /最终提示词/ },
    { name: '含「为什么这么写」板块', re: /为什么这么写/ },
    { name: '含「变体」板块', re: /变体/ },
  ],
}

/**
 * 从产出里抽出"提示词正文"候选：
 *  1. 围栏代码块里的每一行
 *  2. 独立的、纯 ASCII、含 --flag、够长的行
 * 含中文的行一律排除 —— 那是讲解文字。
 */
function extractPrompts(text) {
  const out = []

  for (const m of text.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)) {
    for (const line of m[1].split(/\r?\n/)) {
      const t = line.trim()
      if (t && !/[^\x00-\x7F]/.test(t)) out.push(t)
    }
  }

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (t.length < 60) continue
    if (/[^\x00-\x7F]/.test(t)) continue
    if (!/--[a-z]/.test(t)) continue
    out.push(t)
  }

  return [...new Set(out)]
}

function checkOutput(file, checks) {
  const text = fs.readFileSync(file, 'utf-8')
  const prompts = extractPrompts(text)
  const corpus = prompts.join('\n')
  const results = []

  for (const illegal of ILLEGAL) {
    const hit = prompts.filter(p => illegal.re.test(p))
    results.push({
      name: `【红线】提示词正文不含 ${illegal.name}`,
      ok: hit.length === 0,
      note: hit.length ? `命中 ${hit.length} 条` : '',
    })
  }

  results.push({
    name: '【结构】抽出至少一条提示词正文',
    ok: prompts.length > 0,
    note: prompts.length ? '' : '没找到纯 ASCII 的提示词行',
  })

  results.push({
    name: '【红线】提示词正文含 --v 8.2',
    ok: /--v\s+8\.2\b/.test(corpus),
  })

  for (const c of checks) {
    const hit = prompts.some(p => c.re.test(p))
    const ok = c.negate ? !hit : hit
    results.push({ name: c.name, ok })
  }

  // 情绪板与 --sw/--sv 不能同现（逐条提示词判定）
  const conflict = prompts.filter(
    p => (/--profile\b|--p\s+\S+/.test(p)) && (/--sw\b|--sv\b/.test(p))
  )
  results.push({
    name: '【红线】单条提示词里情绪板不与 --sw/--sv 同现',
    ok: conflict.length === 0,
    note: conflict.length ? `命中 ${conflict.length} 条` : '',
  })

  // 中文标点混进参数（只在提示词正文里查）
  const badPunct = prompts.filter(p => /--\S*[，。：；（）、]/.test(p))
  results.push({
    name: '【红线】提示词正文参数无中文标点',
    ok: badPunct.length === 0,
  })

  for (const s of STRUCTURE[Number(file.match(/eval-(\d+)/)[1])] ?? []) {
    results.push({ name: s.name, ok: s.re.test(text) })
  }

  return { results, promptCount: prompts.length }
}

const variants = [
  { key: 'with-skill', label: '带技能' },
  { key: 'without-skill', label: '无技能（基线）' },
]

let totalFail = 0
const summary = []

for (const variant of variants) {
  const dir = path.join(runsDir, variant.key)
  if (!fs.existsSync(dir)) continue
  const evalDirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()

  for (const evalDir of evalDirs) {
    const file = path.join(dir, evalDir, 'output.md')
    if (!fs.existsSync(file)) continue
    const n = Number(evalDir.replace('eval-', ''))
    const { results, promptCount } = checkOutput(file, CHECKS[n] ?? [])
    const failed = results.filter(r => !r.ok)
    totalFail += failed.length
    summary.push({
      variant: variant.label,
      eval: n,
      passed: results.length - failed.length,
      total: results.length,
      promptCount,
      failed,
    })

    console.log(`\n=== ${variant.label} · eval-${n} ===（抽出 ${promptCount} 条提示词正文）`)
    for (const r of results) {
      console.log(`  ${r.ok ? '[OK  ]' : '[FAIL]'} ${r.name}${r.note ? '  ← ' + r.note : ''}`)
    }
  }
}

console.log('\n' + '='.repeat(60))
console.log('合计失败项: ' + totalFail)
console.log('\n汇总:')
for (const s of summary) {
  console.log(
    `  ${s.variant.padEnd(14)} eval-${s.eval}: ${s.passed}/${s.total}  （${s.promptCount} 条提示词）` +
      (s.failed.length ? `\n      失败: ${s.failed.map(f => f.name).join(' | ')}` : '')
  )
}

process.exit(totalFail > 0 ? 1 : 0)
