import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import {
  cdnUrlOf,
  detailPageOf,
  isValidWebp,
  readCodesFromConfig,
  readSrefsFromFile,
  fetchStylesTop,
} from '../tools/collect-styles-top'
import { buildStylesTopFromLocal } from '../tools/build-styles-top'
import type { StylesTopConfig } from '@/types'

/** 造一个临时项目根，返回清理函数 */
function makeRoot(): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stt-test-'))
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

/** 一段合法 WebP（RIFF....WEBP + 足够字节） */
function fakeWebp(): Buffer {
  return Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.alloc(4),
    Buffer.from('WEBP'),
    Buffer.alloc(200),
  ])
}

describe('CDN 与详情页 URL', () => {
  it('缩略图 URL 模板', () => {
    expect(cdnUrlOf('325728830', 'portrait')).toBe(
      'https://cdn.midjourney.com/styles/0_325728830/portrait_640_N.webp'
    )
  })
  it('详情页 URL', () => {
    expect(detailPageOf('325728830')).toBe('https://www.midjourney.com/styles/0_325728830')
  })
})

describe('WebP 校验', () => {
  it('RIFF+WEBP 且够长 -> true', () => {
    expect(isValidWebp(fakeWebp())).toBe(true)
  })
  it('非 WebP / 太短 -> false', () => {
    expect(isValidWebp(Buffer.from('<html>'))).toBe(false)
    expect(isValidWebp(Buffer.from('RIFF'))).toBe(false)
    expect(isValidWebp(Buffer.from('RIFFxxxxXXXX'))).toBe(false) // 12 字节但签名非 WEBP
  })
})

describe('码清单读取', () => {
  it('从 config/styles-top.yaml 提取 code（canonical 来源）', () => {
    const { root, cleanup } = makeRoot()
    const config = {
      source: { name: 'x', url: 'u', license: 'l', generatedAt: '2026-11-07', count: 2 },
      kinds: [],
      entries: [
        { id: '1', code: '111', display: '0_111', images: {} },
        { id: '2', code: '222', display: '0_222', images: {} },
      ],
    } as StylesTopConfig
    fs.mkdirSync(path.join(root, 'config'), { recursive: true })
    fs.writeFileSync(path.join(root, 'config', 'styles-top.yaml'), yaml.dump(config), 'utf-8')
    expect(readCodesFromConfig(root)).toEqual(['111', '222'])
    cleanup()
  })

  it('从 _srefs.txt 读取，去空去重保序', () => {
    const { root, cleanup } = makeRoot()
    fs.writeFileSync(path.join(root, '_srefs.txt'), '111\n222\n\n333\n111\n', 'utf-8')
    expect(readSrefsFromFile(path.join(root, '_srefs.txt'))).toEqual(['111', '222', '333'])
    cleanup()
  })
})

describe('fetchStylesTop 断点续传（dry-run 离线可验）', () => {
  it('dry-run 只报任务数，不下图', async () => {
    const { root, cleanup } = makeRoot()
    const summary = await fetchStylesTop({ root, codes: ['1', '2'], dryRun: true })
    expect(summary.jobs).toBe(16) // 2 码 × 8 题材
    expect(summary.ok).toBe(0)
    expect(summary.skip).toBe(0)
    cleanup()
  })
})

describe('buildStylesTopFromLocal 本地优先', () => {
  it('只收本地实际存在的图，无图的码丢弃', () => {
    const { root, cleanup } = makeRoot()
    // 码清单：111、222
    const config = {
      source: { name: 'x', url: 'u', license: 'l', generatedAt: '2026-11-07', count: 2 },
      kinds: [{ id: 'portrait', label: '人像' }],
      entries: [
        { id: '1', code: '111', display: '0_111', images: {} },
        { id: '2', code: '222', display: '0_222', images: {} },
      ],
    } as StylesTopConfig
    fs.mkdirSync(path.join(root, 'config'), { recursive: true })
    fs.writeFileSync(path.join(root, 'config', 'styles-top.yaml'), yaml.dump(config), 'utf-8')
    // 只有 111 有一张有效 webp；222 无图
    const previewDir = path.join(root, 'public', 'preview-images', 'midjourney-styles-top')
    fs.mkdirSync(previewDir, { recursive: true })
    fs.writeFileSync(path.join(previewDir, '111_portrait.webp'), fakeWebp())

    const out = buildStylesTopFromLocal(root)
    const written = yaml.load(fs.readFileSync(out, 'utf-8')) as StylesTopConfig
    expect(written.entries).toHaveLength(1)
    expect(written.entries[0].id).toBe('111')
    expect(written.entries[0].images).toHaveProperty('portrait')
    cleanup()
  })
})
