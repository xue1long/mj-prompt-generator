import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_FILE = path.join(ROOT, 'webui/js/candidate-vocab.js');
const PHRASE_FILE = path.join(ROOT, 'webui/js/phrase-index.js');
const DATA_FILE = path.join(ROOT, 'webui/js/data-explore.js');
const JOBKEY_FILE = path.join(ROOT, 'webui/js/job-key.js');
const VOCAB_FILE = path.join(ROOT, 'webui/js/data-vocab.js');

/** 加载浏览器端模块到 vm 上下文（与 phraseIndex.test.ts 同手法）。 */
function loadEngine() {
  const ctx: any = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ENGINE_FILE, 'utf8') + '\n;globalThis.__CV = CANDIDATE_VOCAB;', ctx);
  return ctx.__CV;
}

/** 加载 PHRASE_INDEX + EXPLORE_JOBS + JOB_KEY。 */
function loadCorpus() {
  const ctx: any = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(PHRASE_FILE, 'utf8') + '\n;globalThis.__P = PHRASE_INDEX;', ctx);
  vm.runInContext(fs.readFileSync(DATA_FILE, 'utf8') + '\n;globalThis.__J = EXPLORE_JOBS;', ctx);
  vm.runInContext(fs.readFileSync(JOBKEY_FILE, 'utf8') + '\n;globalThis.__K = JOB_KEY;', ctx);
  return { P: ctx.__P, jobs: ctx.__J, keyOf: ctx.__K.keyOf };
}

/** 真实词库（data-vocab.js 的 133 条扁平化）。 */
function loadRealVocab() {
  const ctx: any = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(VOCAB_FILE, 'utf8') + '\n;globalThis.__V = VOCAB_CATEGORIES;', ctx);
  const out: any[] = [];
  for (const c of ctx.__V) {
    for (const g of c.groups) {
      for (const it of g.items) out.push({ zh: it.zh, en: it.en, cat: c.id });
    }
  }
  return out;
}

/** 词库条目（扁平化形态：zh / en），与 webui 侧一致。 */
const VOCAB = [
  { zh: '特写', en: 'close-up' },
  { zh: '人像', en: 'portrait' },
  { zh: '自然光', en: 'natural light' },
  { zh: '逆光', en: 'backlight' },
  { zh: '全景', en: '360 panorama' },
];

describe('候选词条引擎（报告 2.6 / 第 12 步）', () => {
  describe('词库索引', () => {
    it('跳过空英文表述', () => {
      const CV = loadEngine();
      const idx = CV.buildVocabIndex([{ zh: 'x', en: '' }, { zh: 'y', en: 'ok' }]);
      expect(idx.entries).toHaveLength(1);
      expect(idx.entries[0].en).toBe('ok');
    });

    it('词元切分保留数字与连字符', () => {
      const CV = loadEngine();
      const idx = CV.buildVocabIndex([{ zh: '全景', en: '360 panorama' }]);
      expect(idx.entries[0].tokens).toEqual(['360', 'panorama']);
      expect(idx.tokenMap.has('panorama')).toBe(true);
    });

    it('vocabPhrases 收录单词元形式', () => {
      const CV = loadEngine();
      const set = CV.vocabPhrases([{ zh: 'a', en: 'portrait' }, { zh: 'b', en: '360 panorama' }]);
      expect(set.has('portrait')).toBe(true);
      expect(set.has('360 panorama')).toBe(true);
      // 多词条目不额外收录单词元
      expect(set.has('panorama')).toBe(false);
    });

    it('连字符视为词分隔：close-up 与 close up 归一化后相同', () => {
      const CV = loadEngine();
      expect(CV.normalize('close-up')).toBe('close up');
      expect(CV.normalize('  Close   Up ')).toBe('close up');
      expect(CV.signature('blue light')).toBe(CV.signature('light blue'));
      expect(CV.signature('close up')).not.toBe(CV.signature('close-up far'));
    });
  });

  describe('差异判定（三态）', () => {
    const CV = loadEngine();
    const { tokenMap, sigMap } = CV.buildVocabIndex(VOCAB);
    const exactSet = CV.vocabPhrases(VOCAB);

    it('完全相同 → 已在词库', () => {
      const r = CV.classify('portrait', exactSet, tokenMap, sigMap);
      expect(r.status).toBe('exact');
    });

    it('词元级重合但非整句 → 词库有近义', () => {
      const r = CV.classify('cinematic portrait', exactSet, tokenMap, sigMap);
      expect(r.status).toBe('near');
      expect(r.viaTokens).toContain('portrait');
      expect(r.matches.some((m: any) => m.en === 'portrait')).toBe(true);
    });

    it('零重合 → 词库未覆盖（真缺口）', () => {
      const r = CV.classify('hair', exactSet, tokenMap, sigMap);
      expect(r.status).toBe('missing');
      expect(r.matches).toHaveLength(0);
      expect(r.viaTokens).toHaveLength(0);
    });

    it('词序不同但词元集合相同 → 仍算精确', () => {
      const r = CV.classify('light natural', exactSet, tokenMap, sigMap);
      expect(r.status).toBe('exact');
    });

    it('空短语不报错', () => {
      const r = CV.classify('', exactSet, tokenMap, sigMap);
      expect(r.status).toBe('missing');
    });
  });

  describe('清单构建', () => {
    const CV = loadEngine();
    const { P, jobs, keyOf } = loadCorpus();
    const idx = P.build(jobs);
    const built = CV.build(idx.phrases, idx.byJob, jobs, VOCAB, { keyOf });

    it('候选条数 = 收录短语数', () => {
      expect(built.candidates).toHaveLength(idx.phrases.length);
    });

    it('三种状态计数之和 = 候选总数', () => {
      const sum = built.byStatus.exact + built.byStatus.near + built.byStatus.missing;
      expect(sum).toBe(built.candidates.length);
    });

    it('按 df 降序排序（同频按字典序）', () => {
      for (let i = 1; i < built.candidates.length; i++) {
        const a = built.candidates[i - 1];
        const b = built.candidates[i];
        expect(a.df).toBeGreaterThanOrEqual(b.df);
        if (a.df === b.df) expect(a.phrase.localeCompare(b.phrase)).toBeLessThanOrEqual(0);
      }
    });

    it('每条候选带频次、状态标签与出处引用键', () => {
      for (const c of built.candidates) {
        expect(typeof c.phrase).toBe('string');
        expect(c.phrase.length).toBeGreaterThan(0);
        expect(c.df).toBeGreaterThan(0);
        expect(['exact', 'near', 'missing']).toContain(c.status);
        expect(typeof c.statusLabel).toBe('string');
        expect(Array.isArray(c.sources));
        expect(c.sourceCount).toBe(c.sources.length);
      }
    });

    it('出处引用键去重且非空', () => {
      const withSrc = built.candidates.filter((c: any) => c.sourceCount > 0);
      expect(withSrc.length).toBeGreaterThan(0);
      for (const c of withSrc) {
        expect(new Set(c.sources).size).toBe(c.sources.length);
        for (const k of c.sources) expect(String(k).length).toBeGreaterThan(0);
      }
    });

    it('df 等于出处条数（两者口径一致）', () => {
      for (const c of built.candidates) {
        expect(c.sourceCount).toBe(c.df);
      }
    });

    it('出处引用键是 JOB_KEY 的真键格式（<id8>-<hash4>）', () => {
      const c = built.candidates.find((x: any) => x.sourceCount > 0);
      expect(c).toBeTruthy();
      for (const k of c.sources) expect(String(k)).toMatch(/^[0-9a-f]{8}-[0-9a-z]{4}$/);
    });

    it('状态为 exact 的候选确实在词库里', () => {
      const exact = built.candidates.filter((c: any) => c.status === 'exact');
      expect(exact.length).toBeGreaterThan(0);
      for (const c of exact) {
        const sig = CV.signature(c.phrase);
        const hit = VOCAB.some((v) => CV.signature(v.en) === sig);
        expect(hit).toBe(true);
      }
    });

    it('空入参不崩，返回空清单', () => {
      const r = CV.build([], new Map(), [], []);
      expect(r.candidates).toHaveLength(0);
      expect(r.byStatus.exact).toBe(0);
    });

    it('跨 realm 的 Map 入参不被丢弃（vm 加载的实测坑）', () => {
      // PHRASE_INDEX.build() 返回的 Map 属于 vm realm，
      // 在宿主 realm 里 `instanceof Map === false` —— 若引擎用 instanceof 判定，
      // 入参会被静默换成空 Map，出处全丢（测试表现为 sourceCount 全 0）。
      expect(idx.byJob instanceof Map).toBe(false);
      expect(built.candidates.some((c: any) => c.sourceCount > 0)).toBe(true);
    });
  });

  describe('词库反向验证（假设集被证据集检验）', () => {
    const CV = loadEngine();
    const { P, jobs, keyOf } = loadCorpus();
    const idx = P.build(jobs);

    it('每条词库条目都有验证结论', () => {
      const rows = CV.validateVocab(idx.phrases, idx.byJob, jobs, VOCAB, { keyOf });
      expect(rows).toHaveLength(VOCAB.length);
      for (const r of rows) {
        expect(typeof r.matched).toBe('boolean');
        expect(typeof r.df).toBe('number');
        expect(Array.isArray(r.sources));
      }
    });

    it('被社区用到的词库条目带出处引用键', () => {
      const rows = CV.validateVocab(idx.phrases, idx.byJob, jobs, VOCAB, { keyOf });
      const matched = rows.filter((r: any) => r.matched);
      expect(matched.length).toBeGreaterThan(0);
      for (const r of matched) {
        expect(r.sources.length).toBeGreaterThan(0);
        expect(r.df).toBe(r.sources.length);
      }
    });

    it('站得住的条目排前面', () => {
      const rows = CV.validateVocab(idx.phrases, idx.byJob, jobs, VOCAB, { keyOf });
      const firstUnmatched = rows.findIndex((r: any) => !r.matched);
      if (firstUnmatched >= 0) {
        for (let i = 0; i < firstUnmatched; i++) expect(rows[i].matched).toBe(true);
      }
    });

    it('两个方向口径一致：被 build 判 exact 的词库条目在 validateVocab 里也是 matched', () => {
      const vocab = loadRealVocab();
      const built = CV.build(idx.phrases, idx.byJob, jobs, vocab, { keyOf });
      const rows = CV.validateVocab(idx.phrases, idx.byJob, jobs, vocab, { keyOf });
      const matchedEn = new Set(rows.filter((r: any) => r.matched).map((r: any) => r.en));
      // build 判 exact 的候选，其 matches 里指向的词库条目必须是 matched 的
      for (const c of built.candidates.filter((x: any) => x.status === 'exact')) {
        for (const m of c.matches) {
          expect(matchedEn.has(m.en)).toBe(true);
        }
      }
    });
  });

  describe('真实语料实测（971 条作业）', () => {
    const CV = loadEngine();
    const { P, jobs, keyOf } = loadCorpus();
    const idx = P.build(jobs);
    const vocab = loadRealVocab();

    it('社区作业数是 971', () => {
      expect(jobs).toHaveLength(971);
    });

    it('收录短语数是 571', () => {
      expect(idx.phrases).toHaveLength(571);
    });

    it('真实词库是 133 条', () => {
      expect(vocab).toHaveLength(133);
    });

    it('三态分布：精确命中是个位数、零覆盖是多数', () => {
      const built = CV.build(idx.phrases, idx.byJob, jobs, vocab, { keyOf });
      // 12 条精确命中是实测值（签名口径，词序无关）
      expect(built.byStatus.exact).toBe(12);
      expect(built.byStatus.missing).toBeGreaterThan(built.byStatus.near);
      expect(built.byStatus.missing + built.byStatus.near + built.byStatus.exact).toBe(571);
    });

    it('df 与出处条数逐条一致（真实语料）', () => {
      const built = CV.build(idx.phrases, idx.byJob, jobs, vocab, { keyOf });
      for (const c of built.candidates) expect(c.sourceCount).toBe(c.df);
    });

    it('词库反向验证：133 条里 11 条在社区被用过', () => {
      const rows = CV.validateVocab(idx.phrases, idx.byJob, jobs, vocab, { keyOf });
      expect(rows).toHaveLength(133);
      expect(rows.filter((r: any) => r.matched)).toHaveLength(11);
    });
  });
});
