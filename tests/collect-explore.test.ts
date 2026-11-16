import { describe, it, expect } from 'vitest'
import {
  ANONYMOUS_AUTHOR,
  MIN_PROMPT_LENGTH,
  TITLE_LENGTH,
  aspectLabel,
  aspectOf,
  authorNameOf,
  buildExploreConfig,
  isPlaceholderAuthor,
  isUsableJob,
  mergeJobs,
  manifestToJobs,
  pruneToWindow,
  promptTextOf,
  replaceBatch,
  styleRefsOf,
  toExploreJob,
  describeJobShape,
  renderProbeReport,
  type ExploreApiJob,
  type NeighborManifestRecord,
} from '../tools/collect-explore'
import type { ExploreJob } from '@/types'

function apiJob(overrides: Partial<ExploreApiJob> = {}): ExploreApiJob {
  return {
    id: 'job-1',
    width: 1648,
    height: 2944,
    username_v2: '69e6d250-5046-49e4-9bc9-6f061169db27',
    display_name: 'u3761941744',
    enqueue_time: 1791958105932,
    prompt: {
      decodedPrompt: [{ content: 'a quiet street at dusk, soft light', weight: 1 }],
      ar: { w: 9, h: 16 },
      version: 8.2,
      styleRef: [],
    },
    items: [{}, {}, {}, {}],
    ...overrides,
  }
}

describe('上游数据的解析', () => {
  it('分段提示词拼回原文', () => {
    const text = promptTextOf({
      decodedPrompt: [
        { content: 'first', weight: 1 },
        { content: 'second', weight: 2 },
        { content: '  ' },
      ],
    })
    expect(text).toBe('first second::2')
  })

  it('宽高比用上游声明值，不自己算像素比', () => {
    expect(aspectOf(apiJob())).toBe('9:16')
    // 上游没给 ar 时才退回像素（约成最简比——也正因为它碎，才要优先用声明值）
    const noAr = apiJob({ prompt: { decodedPrompt: [] } })
    expect(aspectOf(noAr)).toBe('103:184')
  })

  it('风格参考码只收数字码，图片型参考不算码', () => {
    const refs = styleRefsOf({
      styleRef: [
        { t: 'seed', content: '2918660786' },
        { t: 'url', content: 'https://s.mj.run/abc' },
        { t: 'seed', content: '2918660786' },
      ],
    })
    expect(refs).toEqual(['2918660786'])
  })

  it('账号名是 UUID 时显示匿名作者', () => {
    expect(isPlaceholderAuthor('69e6d250-5046-49e4-9bc9-6f061169db27')).toBe(true)
    expect(isPlaceholderAuthor('u3761941744')).toBe(false)
    expect(authorNameOf(apiJob())).toBe('u3761941744')
    expect(
      authorNameOf(apiJob({ display_name: '', username_v2: '69e6d250-5046-49e4-9bc9-6f061169db27' }))
    ).toBe(ANONYMOUS_AUTHOR)
  })

  it('宽高比显示名分横竖方', () => {
    expect(aspectLabel('9:16')).toBe('竖版 9:16')
    expect(aspectLabel('16:9')).toBe('横版 16:9')
    expect(aspectLabel('1:1')).toBe('方形 1:1')
  })
})

describe('入库前的过滤规则', () => {
  it('提示词太短的作业丢弃', () => {
    const short = apiJob({
      prompt: { decodedPrompt: [{ content: 'cat' }], ar: { w: 1, h: 1 } },
    })
    expect(isUsableJob(short)).toBe(false)
    expect(isUsableJob(apiJob())).toBe(true)
    expect('cat'.length).toBeLessThan(MIN_PROMPT_LENGTH)
  })

  it('转成快照条目：四格路径、版本号是字符串', () => {
    const job = toExploreJob(apiJob(), '2026-11-06')
    expect(job.thumbs).toEqual([
      'thumbs/job-1_0.webp',
      'thumbs/job-1_1.webp',
      'thumbs/job-1_2.webp',
      'thumbs/job-1_3.webp',
    ])
    expect(job.version).toBe('8.2')
    expect(job.batch).toBe('2026-11-06')
    expect(job.aspect).toBe('9:16')
  })
})

describe('隔壁仓本地数据的导入', () => {
  const record = (over: Partial<NeighborManifestRecord> = {}): NeighborManifestRecord => ({
    id: 'job-1_0',
    jobId: 'job-1',
    index: 0,
    batch: '2026-11-03',
    prompt: 'a quiet street at dusk, soft light',
    aspect: '9:16',
    version: 8.2,
    username: '69e6d250-5046-49e4-9bc9-6f061169db27',
    displayName: 'bykorolenko',
    enqueueTime: 1793618285105,
    hasStyleRef: 0,
    sref: '',
    thumb_path: 'thumbs/job-1_0.webp',
    ...over,
  })

  it('同一作业的四格记录合成一条作业', () => {
    const jobs = manifestToJobs([
      record(),
      record({ id: 'job-1_1', index: 1, thumb_path: 'thumbs/job-1_1.webp' }),
      record({ id: 'job-1_2', index: 2, thumb_path: 'thumbs/job-1_2.webp' }),
      record({ id: 'job-1_3', index: 3, thumb_path: 'thumbs/job-1_3.webp' }),
    ])
    expect(jobs).toHaveLength(1)
    expect(jobs[0].thumbs).toEqual([
      'thumbs/job-1_0.webp',
      'thumbs/job-1_1.webp',
      'thumbs/job-1_2.webp',
      'thumbs/job-1_3.webp',
    ])
    expect(jobs[0].batch).toBe('2026-11-03')
    expect(jobs[0].version).toBe('8.2')
  })

  it('提示词太短的作业丢弃', () => {
    const jobs = manifestToJobs([record({ prompt: 'model' }), record({ jobId: 'job-2', id: 'job-2_0' })])
    expect(jobs.map(j => j.id)).toEqual(['job-2'])
  })

  it('风格参考码是逗号分隔的多个码，转成空格分隔', () => {
    const jobs = manifestToJobs([record({ sref: '2405248426,12133245,3433999548' })])
    expect(jobs[0].sref).toBe('2405248426 12133245 3433999548')
  })

  it('账号名是 UUID 时作者显示为匿名作者', () => {
    const jobs = manifestToJobs([record({ displayName: '' })])
    expect(jobs[0].author).toBe(ANONYMOUS_AUTHOR)
  })

  it('标题是提示词截断到 81 字', () => {
    const long = 'x'.repeat(200)
    const jobs = manifestToJobs([record({ prompt: long })])
    expect(jobs[0].title.length).toBe(TITLE_LENGTH + 1) // 81 字 + 省略号
    expect(jobs[0].title.endsWith('…')).toBe(true)
  })

  it('短提示词的标题就是它本身', () => {
    // 要长于 MIN_PROMPT_LENGTH、短于 TITLE_LENGTH，才既不被丢弃也不需要截断
    const short = 'a short but usable prompt'
    const jobs = manifestToJobs([record({ prompt: short })])
    expect(jobs[0].title).toBe(short)
  })
})

describe('合并与保留窗口', () => {
  function job(id: string, batch: string): ExploreJob {
    return {
      id,
      prompt: 'x'.repeat(30),
      title: 'x'.repeat(30),
      author: 'someone',
      aspect: '9:16',
      version: '8.2',
      enqueueTime: 0,
      batch,
      thumbs: [`thumbs/${id}_0.webp`],
      mids: [`mid/${id}_0.webp`],
    }
  }

  it('同 id 的作业合并成一条，已有的那条为准（批次取首次采集日）', () => {
    const old = { ...job('a', '2026-11-01'), prompt: 'old' }
    const next = { ...job('a', '2026-11-02'), prompt: 'new' }
    const merged = mergeJobs([old], [next])
    expect(merged).toHaveLength(1)
    expect(merged[0].batch).toBe('2026-11-01')
  })

  it('同一天重采：这一批整体替换，不越滚越大', () => {
    const yesterday = job('old-batch', '2026-11-05')
    const todayOld = job('gone', '2026-11-06')
    const todayNew = job('fresh', '2026-11-06')
    const merged = replaceBatch([yesterday, todayOld], '2026-11-06', [todayNew])
    expect(merged.map(j => j.id).sort()).toEqual(['fresh', 'old-batch'])
  })

  it('只保留最近 N 个批次', () => {
    const jobs = [
      job('a', '2026-11-01'),
      job('b', '2026-11-02'),
      job('c', '2026-11-03'),
    ]
    const kept = pruneToWindow(jobs, 2)
    expect(kept.map(j => j.batch)).toEqual(['2026-11-02', '2026-11-03'])
  })

  it('快照里带批次清单与宽高比统计', () => {
    const config = buildExploreConfig([job('a', '2026-11-01'), job('b', '2026-11-01')], {
      generatedAt: '2026-11-06T00:00:00.000Z',
      windowDays: 14,
      fetched: 200,
      dropped: 13,
    })
    expect(config.batches).toHaveLength(1)
    expect(config.batches[0].jobs).toBe(2)
    expect(config.aspects[0]).toEqual({ key: '9:16', name: '竖版 9:16', count: 2 })
    expect(config.source.dropped).toBe(13)
  })
})

describe('上游字段探针（--probe）', () => {
  /* 探针存在的理由：971 条 prompt 正文里一个 `--参数` 都没有，说明参数被上游
     拆成了结构字段；但字段名未知，猜错会静默拿到 undefined。所以只读探针
     必须先如实报出「上游给了哪些键」。这几个用例守的就是「如实」。 */
  const raw = [
    { id: 'a', width: 1, prompt: { decodedPrompt: [], ar: { w: 9, h: 16 }, version: '8.2', stylize: 250 } },
    { id: 'b', prompt: { decodedPrompt: [], ar: null, version: 7, stylize: 100, chaos: 12 } },
    { id: 'c' },
  ]

  it('如实列出 job 与 prompt 两层的键，包括本项目没声明的', () => {
    const report = describeJobShape(raw)
    expect(report.jobs).toBe(3)
    const jobKeys = report.jobFields.map(f => f.key)
    expect(jobKeys).toContain('id')
    expect(jobKeys).toContain('prompt')
    const promptKeys = report.promptFields.map(f => f.key)
    expect(promptKeys).toEqual(expect.arrayContaining(['decodedPrompt', 'ar', 'version', 'stylize']))
    // chaos 只在 1 条里出现 —— 计数必须如实，不能按「有就全算」
    expect(report.promptFields.find(f => f.key === 'chaos')?.count).toBe(1)
  })

  it('按「非空」降序排，「非空」相同的再按出现次数降序', () => {
    const report = describeJobShape(raw)
    const rows = report.promptFields
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const cur = rows[i]
      expect(prev.filled).toBeGreaterThanOrEqual(cur.filled)
      if (prev.filled === cur.filled) expect(prev.count).toBeGreaterThanOrEqual(cur.count)
    }
  })

  it('version 取值按字符串归并（8.2 与 7 不混），缺 version 的不计入', () => {
    const report = describeJobShape(raw)
    expect(report.versionValues).toEqual([
      { value: '7', count: 1 },
      { value: '8.2', count: 1 },
    ].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)))
  })

  it('没有 prompt 的作业不抛错', () => {
    const report = describeJobShape([{ id: 'x' }, {} as Record<string, unknown>])
    expect(report.jobs).toBe(2)
    expect(report.promptFields).toEqual([])
  })

  it('「非空」计数区分「字段存在但恒为空」与「有真值」', () => {
    /* 这一列是整个探针的重点：上游把 stylize / chaos 都列出来了，但值可能恒为 null。
       只看「出现次数」会误判成「上游给了参数」，进而给采样白加一维。 */
    const report = describeJobShape(raw)
    const stylize = report.promptFields.find(f => f.key === 'stylize')
    expect(stylize?.count).toBe(2)   // 两条 job 都带这个键
    expect(stylize?.filled).toBe(2)  // 且都有值
    const ar = report.promptFields.find(f => f.key === 'ar')
    expect(ar?.count).toBe(2)
    expect(ar?.filled).toBe(1)       // 其中一条 ar 是 null
    const empty = describeJobShape([{ id: 'z', prompt: { stylize: null } }])
    expect(empty.promptFields[0]).toMatchObject({ key: 'stylize', count: 1, filled: 0 })
  })

  it('报告文本含表头与键名；空报告不产出空表', () => {
    const md = renderProbeReport(describeJobShape(raw))
    expect(md).toContain('上游字段探针')
    expect(md).toContain('| 键 | 出现次数 | 非空 | 样例 |')
    expect(md).toContain('stylize')
    const empty = renderProbeReport(describeJobShape([]))
    expect(empty).toContain('（无）')
  })
})
