import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'

/**
 * 导出摄影词库到技能包。
 *
 * 为什么要有这一步：
 * 摄影术语的单一来源是 config/prompts.yaml（GUI 与技能共用一份词库）。
 * 技能包要能脱离本仓库独立分发，所以把词库导出成一份静态 Markdown 快照，
 * 而不是让技能在运行时去读 YAML。
 *
 * 生成物是 skills/midjourney-prompt-writing/references/vocab-photography.md，
 * 那一侧手写的内容不受影响 —— 生成物与手写物必须分文件。
 *
 * 为什么在 tools/ 而不是 scripts/：
 * scripts/** 归 tsconfig.node.json 那个项目引用管，tests/ 归根工程管。
 * 测试要 import 这个模块，两边同时拥有它会触发 TS6305（引用项目产物未构建）。
 * tools/ 由根工程独占，没有这个冲突。
 */

interface PromptEntry {
  id: string
  prompt_zh: string
  prompt_en: string
  preview?: string
  generationPrompt?: string
}

interface SubCategory {
  id: string
  name: string
  prompts: PromptEntry[]
}

interface Category {
  id: string
  name: string
  icon?: string
  special?: { positionTag?: string }
  prompts?: PromptEntry[]
  subCategories?: SubCategory[]
}

interface SubjectEnvironmentExample {
  id: string
  title: string
  subject: string
  environment: string
  fullText: string
}

interface PromptsConfig {
  subjectEnvironmentExamples?: SubjectEnvironmentExample[]
  categories: Category[]
}

const POSITION_TAG_MEANING: Record<string, string> = {
  artist: '艺术家 / 摄影师风格，写在提示词最前的摄影前缀位置',
  camera: '机位与镜头',
  lighting: '光线控制',
  other: '其他',
}

/** 本地时区的 YYYY-MM-DD（快照日期用本地日期，不用 UTC） */
export function localISODate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 读取并解析 config/prompts.yaml */
export function loadPromptsConfig(root: string): PromptsConfig {
  const file = path.join(root, 'config', 'prompts.yaml')
  if (!fs.existsSync(file)) {
    throw new Error(`[export-vocab] 缺少配置文件: ${file}`)
  }
  const parsed = yaml.load(fs.readFileSync(file, 'utf-8')) as PromptsConfig | undefined
  if (!parsed || !Array.isArray(parsed.categories)) {
    throw new Error(`[export-vocab] 配置结构异常，缺少 categories: ${file}`)
  }
  return parsed
}

/** 把生成提示词里的参数尾去掉，只留可参考的正文 */
export function stripParams(generationPrompt: string | undefined): string {
  if (!generationPrompt) return ''
  const cut = generationPrompt.indexOf('--')
  return (cut === -1 ? generationPrompt : generationPrompt.slice(0, cut)).trim()
}

/** 一级分类下实际生效的二级分组（有 subCategories 用它，否则用分类自己的 prompts） */
export function groupsOf(category: Category): SubCategory[] {
  if (category.subCategories && category.subCategories.length > 0) {
    return category.subCategories
  }
  return [
    {
      id: category.id,
      name: '条目',
      prompts: category.prompts ?? [],
    },
  ]
}

export function countEntries(config: PromptsConfig): number {
  return config.categories.reduce(
    (sum, category) => sum + groupsOf(category).reduce((n, g) => n + g.prompts.length, 0),
    0
  )
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

/** 生成词库 Markdown */
export function buildVocabMarkdown(config: PromptsConfig, snapshotDate: string): string {
  const total = countEntries(config)
  const lines: string[] = []

  lines.push('# 摄影提示词词库')
  lines.push('')
  lines.push('> **生成物 —— 请勿手改。**')
  lines.push('> 由 `tools/export-vocab.ts` 从 `config/prompts.yaml` 导出。')
  lines.push(
    `> 快照日期：${snapshotDate} ｜ 一级分类 ${config.categories.length} 个 ｜ 提示词条目 ${total} 条`
  )
  lines.push('> 改词库请改 `config/prompts.yaml`，然后跑 `npm run export:vocab`。')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 怎么用这份词库')
  lines.push('')
  lines.push('- 这是**摄影技术术语**词库：快门速度、景深光圈、镜头焦段与机位、光线方案、艺术家与流派。')
  lines.push('- **画风、构图、情感、镜头质感词不在这里**，在 `vocab-style.md`。')
  lines.push('- 术语本身的中文名只是标签，**真正进入提示词的是英文写法**。')
  lines.push('- 同一术语以本文件为准；本文件未收录的风格词在 `vocab-style.md`。')
  lines.push('- 每条的「示例用法」是当初生成预览图时用的提示词正文（已去掉参数尾），供你参考它出现在句子里时的样子。')
  lines.push('')
  lines.push('## 位置标签')
  lines.push('')
  lines.push('| 标签 | 含义 |')
  lines.push('|---|---|')
  for (const [tag, meaning] of Object.entries(POSITION_TAG_MEANING)) {
    lines.push(`| \`${tag}\` | ${meaning} |`)
  }
  lines.push('')
  lines.push('## 目录')
  lines.push('')
  for (const category of config.categories) {
    lines.push(`- [${category.name}](#${category.name})`)
    const groups = groupsOf(category)
    if (groups.length > 1) {
      for (const group of groups) {
        lines.push(`  - [${group.name}](#${group.name})`)
      }
    }
  }
  lines.push('')
  lines.push('## 分类总览')
  lines.push('')
  lines.push('| 一级分类 | 二级分类 | 条目数 | 位置标签 |')
  lines.push('|---|---|---|---|')
  for (const category of config.categories) {
    const tag = category.special?.positionTag ?? 'other'
    for (const group of groupsOf(category)) {
      lines.push(
        `| ${escapeCell(category.name)} | ${escapeCell(group.name)} | ${group.prompts.length} | \`${tag}\` |`
      )
    }
  }
  lines.push('')

  for (const category of config.categories) {
    const tag = category.special?.positionTag ?? 'other'
    const groups = groupsOf(category)
    const catCount = groups.reduce((n, g) => n + g.prompts.length, 0)
    lines.push('---')
    lines.push('')
    lines.push(`## ${category.name}`)
    lines.push('')
    lines.push(`> 位置标签 \`${tag}\`（${POSITION_TAG_MEANING[tag] ?? '其他'}） ｜ ${catCount} 条`)
    lines.push('')
    for (const group of groups) {
      if (groups.length > 1) {
        lines.push(`### ${group.name}`)
        lines.push('')
      }
      lines.push('| 中文 | 英文 | 示例用法 |')
      lines.push('|---|---|---|')
      for (const entry of group.prompts) {
        const example = stripParams(entry.generationPrompt)
        lines.push(
          `| ${escapeCell(entry.prompt_zh)} | \`${escapeCell(entry.prompt_en)}\` | ${escapeCell(example)} |`
        )
      }
      lines.push('')
    }
  }

  const examples = config.subjectEnvironmentExamples ?? []
  if (examples.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 主体与环境示例')
    lines.push('')
    lines.push('> 提示词里唯一由你自由书写的部分是「主体与环境」。下面是几种起手写法。')
    lines.push('')
    lines.push('| 场景 | 主体 | 环境 | 合并 |')
    lines.push('|---|---|---|---|')
    for (const example of examples) {
      lines.push(
        `| ${escapeCell(example.title)} | ${escapeCell(example.subject)} | ${escapeCell(
          example.environment
        )} | \`${escapeCell(example.fullText)}\` |`
      )
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('> 预览图在本仓库的 `public/preview-images/` 下，与本文件同源。')
  lines.push('')

  return lines.join('\n')
}

/** 把词库写入技能包，返回输出路径 */
export function renderVocabMarkdown(root: string, snapshotDate: string = localISODate()): string {
  const config = loadPromptsConfig(root)
  const outDir = path.join(root, 'skills', 'midjourney-prompt-writing', 'references')
  const outFile = path.join(outDir, 'vocab-photography.md')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outFile, buildVocabMarkdown(config, snapshotDate), 'utf-8')
  return outFile
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const out = renderVocabMarkdown(root)
  console.log(`[export-vocab] 已生成 ${out}`)
}
