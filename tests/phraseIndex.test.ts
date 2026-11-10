import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 提示词短语索引（报告 2.2）的单元测试。
 *
 * 这层守的是**算法契约**：短语怎么切、什么算噪声、阈值怎么定。
 * 端到端（verify-webui.mjs）守的是**链路可用**：短语下拉能不能筛出对的结果。
 * 两层都要有 —— 只有端到端的话，切词规则一改，要等到跑浏览器才发现筛出的是垃圾。
 *
 * 与 filterEngine.test.ts 同一手法：vm 加载前端算法本体，
 * 不在测试里复刻一份实现（复刻 = 两处会漂移）。
 */

const PHRASE_FILE = path.resolve(__dirname, '../webui/js/phrase-index.js');
const DATA_FILE = path.resolve(__dirname, '../webui/js/data-explore.js');

interface PhraseEntry { phrase: string; df: number }
interface PhraseIndex {
  phrases: PhraseEntry[];
  byJob: Map<string, string[]>;
  df: Map<string, number>;
}
interface PhraseApi {
  FUNC_WORDS: Set<string>;
  NEGATION_WORDS: Set<string>;
  MULTI_MIN_DF: number;
  WORD_MIN_DF: number;
  candidatesOf(prompt: string): Set<string>;
  build(jobs: Array<{ id?: string; prompt?: string }>): PhraseIndex;
  phrasesOf(index: PhraseIndex, job: { id?: string }): string[];
}

/** 加载前端算法本体（顶层 const 不进 vm context，要显式取出来）。 */
function loadPhraseApi(): PhraseApi {
  const text = fs.readFileSync(PHRASE_FILE, 'utf8');
  const ctx: Record<string, any> = { console };
  vm.createContext(ctx);
  vm.runInContext(text + '\n;globalThis.__PI = PHRASE_INDEX;', ctx, { timeout: 5000 });
  return ctx.__PI as PhraseApi;
}

/** 加载真实数据（用于「实测口径」那组断言）。 */
function loadJobs(): Array<{ id: string; prompt: string; sref?: string }> {
  const text = fs.readFileSync(DATA_FILE, 'utf8');
  const ctx: Record<string, any> = { console };
  vm.createContext(ctx);
  vm.runInContext(text + '\n;globalThis.__J = EXPLORE_JOBS;', ctx, { timeout: 10000 });
  return ctx.__J as Array<{ id: string; prompt: string; sref?: string }>;
}

describe('提示词短语索引', () => {
  describe('候选短语抽取', () => {
    const PI = loadPhraseApi();

    it('空 prompt 不产出候选', () => {
      expect([...PI.candidatesOf('')]).toEqual([]);
      expect([...PI.candidatesOf('   ')]).toEqual([]);
      expect([...PI.candidatesOf(undefined as unknown as string)]).toEqual([]);
    });

    it('功能词不成短语', () => {
      const cands = [...PI.candidatesOf('the of and a an')];
      expect(cands).toEqual([]);
    });

    it('单词候选保留有风格信息的词', () => {
      const cands = [...PI.candidatesOf('cinematic grain editorial')];
      expect(cands).toContain('cinematic');
      expect(cands).toContain('grain');
      expect(cands).toContain('editorial');
    });

    it('多词短语里含功能词就整组丢弃（防「and white」这类拼接噪声）', () => {
      const cands = [...PI.candidatesOf('skin texture and white background')];
      expect(cands).toContain('skin texture');
      expect(cands).toContain('white background');
      expect(cands).not.toContain('and white');
      expect(cands).not.toContain('texture and');
    });

    it('保留数字混排的词（35mm / 8k / 3d）', () => {
      const cands = [...PI.candidatesOf('shot on 35mm lens, 8k, 3d render')];
      expect(cands).toContain('35mm');
      expect(cands).toContain('8k');
      expect(cands).toContain('3d');
      expect(cands).toContain('35mm lens');
    });

    it('全是数字的片段丢弃', () => {
      expect([...PI.candidatesOf('123 456 7890')]).toEqual([]);
    });

    it('单字符词丢弃', () => {
      expect([...PI.candidatesOf('a b c')]).toEqual([]);
    });

    it('按逗号切段，段边界不产生跨段短语', () => {
      const cands = [...PI.candidatesOf('cinematic, lighting')];
      // 「cinematic lighting」跨了逗号，不该出现
      expect(cands).not.toContain('cinematic lighting');
      expect(cands).toContain('cinematic');
      expect(cands).toContain('lighting');
    });

    it('分号与竖线同样作段边界', () => {
      const cands = [...PI.candidatesOf('cinematic; lighting | grain')];
      expect(cands).not.toContain('cinematic lighting');
      expect(cands).not.toContain('lighting grain');
    });

    it('否定标记 no 单独自成短语时被排除', () => {
      const cands = [...PI.candidatesOf('no watermark, no text')];
      expect(cands).not.toContain('no');
      // 但整段短语保留 —— 「no watermark」本身就是社区常用写法
      expect(cands).toContain('no watermark');
    });

    it('候选按 prompt 小写归一', () => {
      const cands = [...PI.candidatesOf('Cinematic Grain')];
      expect(cands).toContain('cinematic');
      expect(cands).toContain('grain');
    });

    it('同一 prompt 内重复的短语只出现一次', () => {
      const cands = [...PI.candidatesOf('grain, grain, grain')];
      expect(cands.filter(c => c === 'grain').length).toBe(1);
    });
  });

  describe('索引构建', () => {
    const PI = loadPhraseApi();

    it('空集合不产出短语', () => {
      const idx = PI.build([]);
      expect(idx.phrases.length).toBe(0);
      expect(idx.byJob.size).toBe(0);
    });

    it('df 低于阈值的短语不收录', () => {
      // 3 条作业、同一短语 → df=3，低于多词阈值 8
      const jobs = [
        { id: 'a', prompt: 'film grain, cinematic' },
        { id: 'b', prompt: 'film grain, lighting' },
        { id: 'c', prompt: 'film grain, portrait' },
      ];
      const idx = PI.build(jobs);
      expect(idx.phrases.find(p => p.phrase === 'film grain')).toBeUndefined();
      // 但 df 仍然被记下来了（供调试）
      expect(idx.df.get('film grain')).toBe(3);
    });

    it('df 达到阈值的短语被收录', () => {
      const jobs = Array.from({ length: 9 }, (_, i) => ({
        id: `j${i}`, prompt: `film grain, portrait ${i}`,
      }));
      const idx = PI.build(jobs);
      const hit = idx.phrases.find(p => p.phrase === 'film grain');
      expect(hit).toBeDefined();
      expect(hit!.df).toBe(9);
    });

    it('短语表按 df 降序、同频按字典序', () => {
      const jobs = Array.from({ length: 12 }, (_, i) => ({
        id: `j${i}`, prompt: `alpha beta, gamma, delta ${i}`,
      }));
      const idx = PI.build(jobs);
      for (let i = 1; i < idx.phrases.length; i++) {
        const prev = idx.phrases[i - 1], cur = idx.phrases[i];
        expect(prev.df).toBeGreaterThanOrEqual(cur.df);
        if (prev.df === cur.df) {
          expect(prev.phrase.localeCompare(cur.phrase)).toBeLessThanOrEqual(0);
        }
      }
    });

    it('收录的短语里没有功能词', () => {
      const jobs = Array.from({ length: 12 }, (_, i) => ({
        id: `j${i}`, prompt: `skin texture, the background, and white ${i}`,
      }));
      const idx = PI.build(jobs);
      for (const p of idx.phrases) {
        for (const w of p.phrase.split(' ')) {
          expect(PI.FUNC_WORDS.has(w)).toBe(false);
        }
      }
    });

    it('byJob 记录每条作业命中的收录短语', () => {
      const jobs = Array.from({ length: 9 }, (_, i) => ({
        id: `j${i}`, prompt: `film grain, portrait ${i}`,
      }));
      const idx = PI.build(jobs);
      expect(idx.byJob.get('j0')).toContain('film grain');
      expect(idx.byJob.get('j0')).not.toContain('portrait 0'); // 数字后缀不入短语
    });

    it('phrasesOf 是便捷入口', () => {
      const jobs = Array.from({ length: 9 }, (_, i) => ({
        id: `j${i}`, prompt: `film grain, portrait ${i}`,
      }));
      const idx = PI.build(jobs);
      expect(PI.phrasesOf(idx, { id: 'j3' })).toEqual(idx.byJob.get('j3'));
      expect(PI.phrasesOf(idx, { id: '不存在' })).toEqual([]);
    });

    it('同一输入两次构建结果一致（确定性）', () => {
      const jobs = [
        { id: 'a', prompt: 'film grain, cinematic' },
        { id: 'b', prompt: 'film grain, lighting' },
      ];
      const i1 = PI.build(jobs);
      const i2 = PI.build(jobs);
      expect(JSON.stringify(i1.phrases)).toBe(JSON.stringify(i2.phrases));
    });
  });

  describe('真实数据实测口径', () => {
    const PI = loadPhraseApi();
    const JOBS = loadJobs();
    const idx = PI.build(JOBS);

    it('全量作业能建出非空短语表', () => {
      expect(JOBS.length).toBeGreaterThan(900);
      expect(idx.phrases.length).toBeGreaterThan(300);
    });

    it('多词短语全部达到多词阈值', () => {
      const multi = idx.phrases.filter(p => p.phrase.includes(' '));
      expect(multi.length).toBeGreaterThan(100);
      for (const p of multi) expect(p.df).toBeGreaterThanOrEqual(PI.MULTI_MIN_DF);
    });

    it('单词全部达到单词阈值', () => {
      const single = idx.phrases.filter(p => !p.phrase.includes(' '));
      expect(single.length).toBeGreaterThan(200);
      for (const p of single) expect(p.df).toBeGreaterThanOrEqual(PI.WORD_MIN_DF);
    });

    it('绝大多数作业至少命中一个收录短语', () => {
      const hit = JOBS.filter(j => (idx.byJob.get(j.id) || []).length > 0).length;
      // 实测 898/971（92.5%）—— 剩下的作业措辞太碎，不影响筛选功能
      expect(hit / JOBS.length).toBeGreaterThan(0.85);
    });

    it('收录的多词短语里没有拼接噪声（and / of 开头结尾）', () => {
      const multi = idx.phrases.filter(p => p.phrase.includes(' '));
      for (const p of multi) {
        const words = p.phrase.split(' ');
        expect(words[0]).not.toBe('and');
        expect(words[words.length - 1]).not.toBe('and');
        expect(words[0]).not.toBe('of');
      }
    });
  });
});
