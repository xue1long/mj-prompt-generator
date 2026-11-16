import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 研究样本两轴分类（ADR-0028）的单元测试。
 *
 * 这层守的是**可加总**与**不串味**，不是具体条数：
 *   · 每条作业在每层恰好落一档（否则分面计数不能相加，分块会重叠）
 *   · 两轴的档位值域互不相交（媒介不会返回主体标签，反之亦然）
 *   · 强弱信号：`collage` 这类风格修饰词不得压过正文里的 `photograph`
 *   · `negative space`（留白）不得把人像判成科幻 —— 实测踩过的坑
 *   · 判不出来时返回「未声明 / 未判量」而不是默认归到写实
 *
 * 具体数字刻意不写死：词表调一次数字就变，写死必红。这里只断言恒等式。
 *
 * 与 sampleExport.test.ts / genDate.test.ts 同一手法：vm 加载前端本体，
 * 不在测试里复刻实现。
 */

const ROOT = path.resolve(__dirname, '..');
const TAX_FILE = path.join(ROOT, 'webui', 'js', 'sample-taxonomy.js');
const DATA_FILE = path.join(ROOT, 'webui', 'js', 'data-explore.js');
const JOBKEY_FILE = path.join(ROOT, 'webui', 'js', 'job-key.js');
const GENDATE_FILE = path.join(ROOT, 'webui', 'js', 'gen-date.js');
const EXPORT_FILE = path.join(ROOT, 'webui', 'js', 'sample-export.js');

interface Classification {
  medium: string;
  subject: string;
  source: string;
}

interface Taxonomy {
  SOURCE: string;
  MEDIUMS: Array<{ value: string; label: string }>;
  SUBJECTS: Array<{ value: string; label: string }>;
  MEDIUM_VALUES: Set<string>;
  SUBJECT_VALUES: Set<string>;
  classify(job: unknown): Classification;
  mediumOf(job: unknown): string;
  subjectOf(job: unknown): string;
  labelOf(axis: string, value: string): string;
  distribution(jobs: unknown[]): { medium: Map<string, number>; subject: Map<string, number> };
  explain(job: unknown): { medium: any; subject: any };
  MEDIUM_RULES: Array<{ value: string; tier: string; en: RegExp; zh?: string[] }>;
  SUBJECT_RULES: Array<{ value: string; tier: string; en: RegExp; zh?: string[] }>;
}

function loadTaxonomy(): Taxonomy {
  if (cachedTax) return cachedTax;
  const ctx: any = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(TAX_FILE, 'utf8'), ctx, { timeout: 5000 });
  vm.runInContext('\n;globalThis.__TAX = SAMPLE_TAXONOMY;', ctx, { timeout: 5000 });
  cachedTax = ctx.__TAX;
  return cachedTax!;
}
let cachedTax: Taxonomy | null = null;

/** 真实数据（971 条共用一个 vm 实例）。 */
let cachedJobs: any[] | null = null;
function loadJobs(): any[] {
  if (cachedJobs) return cachedJobs;
  const ctx: any = { console };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(DATA_FILE, 'utf8') + '\n;globalThis.__J = EXPLORE_JOBS;',
    ctx,
    { timeout: 20000 },
  );
  cachedJobs = ctx.__J;
  return cachedJobs!;
}

/** 造一条最小作业。只给需要的字段，其余留空 —— 分类器必须容忍缺字段。 */
function job(parts: { style?: string[]; summary?: string; segments?: string[]; prompt?: string }) {
  const segments = (parts.segments || []).map((text, i) => ({
    code: String(i + 1),
    module: i === 0 ? '主体' : '其它',
    text,
  }));
  return {
    id: 'test-job',
    title: 'test',
    prompt: parts.prompt || '',
    decomposition: { source: '规则解析', summary: parts.summary || '', segments, tags: { style: parts.style || [] } },
  };
}

describe('两轴分类（SAMPLE_TAXONOMY）', () => {
  describe('档位表', () => {
    it('两轴的取值域互不相交（媒介与主体不串味）', () => {
      const T = loadTaxonomy();
      const overlap = [...T.MEDIUM_VALUES].filter((v) => T.SUBJECT_VALUES.has(v));
      expect(overlap).toEqual([]);
    });

    it('「未声明」「未判定」各自在轴里，且都排最后', () => {
      const T = loadTaxonomy();
      expect(T.MEDIUMS[T.MEDIUMS.length - 1].value).toBe('undeclared');
      expect(T.SUBJECTS[T.SUBJECTS.length - 1].value).toBe('unknown');
    });

    it('档位值都是 ASCII slug，label 另外给出（value 进 URL 与导出，label 只显示）', () => {
      const T = loadTaxonomy();
      for (const x of [...T.MEDIUMS, ...T.SUBJECTS]) {
        expect(x.value).toMatch(/^[a-z][a-z0-9]*$/);
        expect(x.label.length).toBeGreaterThan(0);
        // label 是给人看的，不能等于 slug（「3D / CG」是全 ASCII 的中文习惯写法，
        // 所以不要求 label 必须含汉字）
        expect(x.label).not.toBe(x.value);
      }
    });

    it('中文词条一律两字以上', () => {
      /* 实测教训：单字中文在提示词里几乎都是修饰语，会把主体判飞 ——
         「自然」命中「自然长发」14 条、「海」命中 chibi 小猫 21 条、
         「花」命中速写咖啡馆与静物蜡烛 12 条。两字以上的约束是这类误判的
         结构防线：它不会让词表变得更准，但能挡住一整类「单字撞词」。 */
      const T = loadTaxonomy();
      const singles: string[] = [];
      for (const rules of [T.MEDIUM_RULES, T.SUBJECT_RULES]) {
        for (const r of rules) for (const w of r.zh || []) {
          if ([...String(w)].length < 2) singles.push(`${r.value}:${w}`);
        }
      }
      expect(singles).toEqual([]);
    });

    it('中文词表非空（防止上面的断言因为词表被删空而空转通过）', () => {
      const T = loadTaxonomy();
      const count = [...T.MEDIUM_RULES, ...T.SUBJECT_RULES]
        .reduce((n, r) => n + (r.zh?.length || 0), 0);
      expect(count).toBeGreaterThan(60);
    });
  });

  describe('判定：强弱信号', () => {
    it('tags.style 里的 collage 不得压过正文的 photograph', () => {
      const T = loadTaxonomy();
      // 这是真实样本：style = ["collage","cinematic"]，prompt 明写 photograph
      const j = job({
        style: ['collage', 'cinematic'],
        prompt: 'Full body cinematic photograph of a Korean woman in her early forties.',
      });
      expect(T.mediumOf(j)).toBe('realistic');
    });

    it('只有弱信号时仍能判出（poster 归平面设计）', () => {
      const T = loadTaxonomy();
      const j = job({ style: ['poster'], summary: '一张男性肖像海报' });
      expect(T.mediumOf(j)).toBe('graphic');
    });

    it('同层内按档位顺序取先命中的一档（不做加权打分）', () => {
      const T = loadTaxonomy();
      const j = job({ prompt: 'watercolor painting of a pear' });
      expect(T.mediumOf(j)).toBe('illustration');
    });

    it('来源层优先于档位顺序：tags.style 的摄影压过 prompt 里的水彩', () => {
      const T = loadTaxonomy();
      // 两层都是强信号时，先看 tags.style —— 它是拆解直接给媒介词的那一层
      const j = job({ style: ['photorealistic'], prompt: 'watercolor painting of a pear' });
      expect(T.mediumOf(j)).toBe('realistic');
    });
  });

  describe('判定：回退与空值', () => {
    it('三层都没有媒介词 → undeclared，不默认归写实', () => {
      const T = loadTaxonomy();
      const j = job({ prompt: 'a quiet afternoon', summary: '一个安静的下午' });
      expect(T.mediumOf(j)).toBe('undeclared');
    });

    it('只有 summary 有线索时也能判出（回退到第二层）', () => {
      const T = loadTaxonomy();
      const j = job({ prompt: 'a quiet afternoon', summary: '一幅水彩插画' });
      expect(T.mediumOf(j)).toBe('illustration');
    });

    it('主体能从句子的实体词判出，而不是只有 summary', () => {
      const T = loadTaxonomy();
      const j = job({ prompt: 'a red fox sleeping on a mossy rock' });
      expect(T.subjectOf(j)).toBe('animal');
    });

    it('negative space（留白）不得判成科幻', () => {
      const T = loadTaxonomy();
      const j = job({
        prompt: 'minimalist portrait of a woman, large negative space on the left',
        summary: '极简人像，左侧大面积留白',
      });
      expect(T.subjectOf(j)).toBe('person');
    });

    it('outer space 才算科幻', () => {
      const T = loadTaxonomy();
      const j = job({ prompt: 'an astronaut drifting in outer space above a blue planet' });
      expect(T.subjectOf(j)).toBe('scifi');
    });

    it('空 job 与缺字段一律不抛错，返回兜底档', () => {
      const T = loadTaxonomy();
      for (const bad of [null, undefined, {}, { decomposition: null }]) {
        const c = T.classify(bad);
        expect(c.medium).toBe('undeclared');
        expect(c.subject).toBe('unknown');
      }
    });

    it('每层只返回一个值（字符串），不是数组', () => {
      const T = loadTaxonomy();
      const c = T.classify(job({ prompt: 'watercolor portrait of a woman' }));
      expect(typeof c.medium).toBe('string');
      expect(typeof c.subject).toBe('string');
      expect(Array.isArray(c.medium)).toBe(false);
    });
  });

  describe('真实数据：可加总', () => {
    it('971 条全部落在一档内，两轴各自求和 = 总数', () => {
      const T = loadTaxonomy();
      const jobs = loadJobs();
      expect(jobs.length).toBeGreaterThan(900);

      const d = T.distribution(jobs);
      const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
      expect(sum(d.medium)).toBe(jobs.length);
      expect(sum(d.subject)).toBe(jobs.length);

      // 没有落在档位表之外的值
      for (const k of d.medium.keys()) expect(T.MEDIUM_VALUES.has(k)).toBe(true);
      for (const k of d.subject.keys()) expect(T.SUBJECT_VALUES.has(k)).toBe(true);
    });

    it('缓存生效：同一条作业两次分类返回同一个结果对象', () => {
      const T = loadTaxonomy();
      const j = loadJobs()[0];
      expect(T.classify(j)).toBe(T.classify(j));
    });

    it('explain 能说出凭哪个词判的，且档位与 classify 一致', () => {
      const T = loadTaxonomy();
      const jobs = loadJobs();
      // 找一条判得出的，避免命中兜底档（兜底档没有依据词）
      const j = jobs.find((x) => {
        const c = T.classify(x);
        return c.medium !== 'undeclared' && c.subject !== 'unknown';
      });
      expect(j).toBeTruthy();
      const e = T.explain(j);
      const c = T.classify(j);
      expect(e.medium.value).toBe(c.medium);
      expect(e.subject.value).toBe(c.subject);
      expect(e.medium.word).toBeTruthy();
      expect(e.subject.word).toBeTruthy();
      expect(['strong', 'weak']).toContain(e.medium.tier);
    });

    it('与拆解框架对质的一致率不低于 80%（精度回归基线）', () => {
      /* 没有人工标注时，用「拆解框架」当独立的第二信号对质：
         framework=人物画像 应落在人像，framework=物体描述 不应落在人像。
         两边都判得出的才算可对质 —— 只对质可判的交集，不把「未判定」算成正确。
         这条守的是**回归**：词表改坏了，一致率会掉下来。
         阈值 80% 略低于当时的 83.6%，留给措辞抖动；若真掉到 80% 以下，
         多半是某条规则开始串味，而不是数据变差。 */
      const T = loadTaxonomy();
      const jobs = loadJobs();
      const verdict = (j: any): boolean | null => {
        const f = j?.decomposition?.framework || '';
        const s = T.subjectOf(j);
        if (f === '人物画像') return s === 'person';
        if (f === '物体描述') return s !== 'person';
        return null;
      };
      const judged = jobs.filter((j) => verdict(j) !== null);
      expect(judged.length).toBeGreaterThan(400);
      const agree = judged.filter((j) => verdict(j)).length;
      expect(agree / judged.length).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('与样本导出一致', () => {
    it('JSON 导出带两轴 slug 与分类来源，Markdown 用中文名', () => {
      const jobs = loadJobs();
      const ctx: any = { console };
      vm.createContext(ctx);
      for (const f of [JOBKEY_FILE, GENDATE_FILE, TAX_FILE, EXPORT_FILE]) {
        vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { timeout: 5000 });
      }
      vm.runInContext('\n;globalThis.__SE = SAMPLE_EXPORT;globalThis.__TAX = SAMPLE_TAXONOMY;', ctx, { timeout: 5000 });
      const SE: any = ctx.__SE;
      const T: Taxonomy = ctx.__TAX;
      // 导出只读 state；两轴为空即「全部」
      ctx.EXPLORE_BOARD = {
        state: { q: '', batch: '', mediums: new Set(), subjects: new Set(), phrases: new Set(), decomp: new Set(), genDates: new Set() },
        matches: () => jobs,
      };

      const sample = jobs.slice(0, 20);
      const rows = JSON.parse(SE.toJson(sample))['样本'];
      expect(rows).toHaveLength(sample.length);
      for (let i = 0; i < sample.length; i++) {
        const c = T.classify(sample[i]);
        expect(rows[i]['表现媒介']).toBe(c.medium);
        expect(rows[i]['画面主体']).toBe(c.subject);
        expect(rows[i]['分类来源']).toBe('rule');
      }

      // Markdown 里是中文名，且带「规则推算」的免责说明
      const md = SE.toMarkdown(sample);
      expect(md).toContain('表现媒介');
      expect(md).toContain('画面主体');
      expect(md).toContain('规则推算');
      const first = T.classify(sample[0]);
      expect(md).toContain(T.labelOf('medium', first.medium));
    });

    it('筛选条件摘要用中文名，且能带上两轴', () => {
      const jobs = loadJobs();
      const ctx: any = { console };
      vm.createContext(ctx);
      for (const f of [JOBKEY_FILE, GENDATE_FILE, TAX_FILE, EXPORT_FILE]) {
        vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { timeout: 5000 });
      }
      vm.runInContext('\n;globalThis.__SE = SAMPLE_EXPORT;globalThis.__TAX = SAMPLE_TAXONOMY;', ctx, { timeout: 5000 });
      const SE: any = ctx.__SE;
      ctx.EXPLORE_BOARD = {
        state: { q: '', batch: '', mediums: new Set(['anime']), subjects: new Set(['person']), phrases: new Set(), decomp: new Set(), genDates: new Set() },
        matches: () => jobs,
      };
      const s = SE.filterSummary();
      expect(s).toContain('表现媒介 二次元 / 动漫');
      expect(s).toContain('画面主体 人像 / 人物');
    });
  });
});
