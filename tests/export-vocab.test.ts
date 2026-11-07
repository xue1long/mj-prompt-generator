import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildVocabMarkdown,
  countEntries,
  groupsOf,
  loadPromptsConfig,
  stripParams,
} from '../tools/export-vocab'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exportedFile = path.join(
  root,
  'skills',
  'midjourney-prompt-writing',
  'references',
  'vocab-photography.md'
)

const config = loadPromptsConfig(root)
const exported = fs.existsSync(exportedFile) ? fs.readFileSync(exportedFile, 'utf-8') : ''

/** 从导出文件头部取出快照日期，用它重新生成，才能比对幂等 */
function snapshotDateOf(markdown: string): string {
  const match = markdown.match(/快照日期：(\d{4}-\d{2}-\d{2})/)
  if (!match) throw new Error('导出文件缺少快照日期')
  return match[1]
}

describe('词库导出', () => {
  it('导出文件已生成', () => {
    expect(fs.existsSync(exportedFile)).toBe(true)
    expect(exported.length).toBeGreaterThan(0)
  })

  it('导出文件声明的条目数与 config/prompts.yaml 实际一致', () => {
    const declared = Number(exported.match(/提示词条目 (\d+) 条/)?.[1])
    expect(declared).toBe(countEntries(config))
    expect(declared).toBe(156)
  })

  it('每一条摄影术语都出现在导出文件里', () => {
    const missing: string[] = []
    for (const category of config.categories) {
      for (const group of groupsOf(category)) {
        for (const entry of group.prompts) {
          if (!exported.includes(`\`${entry.prompt_en}\``)) missing.push(entry.prompt_en)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('导出文件不含残留的参数尾（示例用法已去掉 -- 参数）', () => {
    expect(exported).not.toMatch(/--v 7/)
    expect(exported).not.toMatch(/--ar 16:9/)
  })

  it('重新生成的 Markdown 与磁盘上的产物逐字节一致（幂等）', () => {
    const regenerated = buildVocabMarkdown(config, snapshotDateOf(exported))
    expect(regenerated).toBe(exported)
  })

  it('stripParams 去掉参数尾并保留正文', () => {
    expect(stripParams('photography, bokeh, portrait --v 7 --ar 16:9')).toBe(
      'photography, bokeh, portrait'
    )
    expect(stripParams('no flags here')).toBe('no flags here')
    expect(stripParams(undefined)).toBe('')
  })

  it('位置标签都在已知集合内', () => {
    const known = new Set(['artist', 'camera', 'lighting', 'other'])
    for (const category of config.categories) {
      expect(known.has(category.special?.positionTag ?? 'other')).toBe(true)
    }
  })
})
