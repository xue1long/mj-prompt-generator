import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  normalizePrompt,
  fnv1a,
  jobKey,
  jobKeys,
} from '../tools/job-key.mjs';

/**
 * 作业稳定引用键（报告 2.1）的单元测试。
 *
 * 这层守的是**算法契约**：键怎么算、碰撞怎么办。
 * 端到端（verify-webui.mjs）守的是**链路可用**：深链能不能真的打开灯箱。
 * 两层都要有 —— 只有端到端的话，键算法一改，测试要等到跑浏览器才发现问题。
 */
describe('作业稳定引用键', () => {
  describe('提示词归一化', () => {
    it('折叠连续空白', () => {
      expect(normalizePrompt('a   b')).toBe('a b');
      expect(normalizePrompt('a\n\tb')).toBe('a b');
    });

    it('去首尾空白并转小写', () => {
      expect(normalizePrompt('  Hello World  ')).toBe('hello world');
    });

    it('空值不抛错', () => {
      expect(normalizePrompt(undefined)).toBe('');
      expect(normalizePrompt(null)).toBe('');
      expect(normalizePrompt('')).toBe('');
    });

    it('大小写与多余空格差异不影响归一化结果', () => {
      expect(normalizePrompt('A  B')).toBe(normalizePrompt('a b'));
    });
  });

  describe('FNV-1a 哈希', () => {
    it('同一输入恒得同一输出', () => {
      expect(fnv1a('hello')).toBe(fnv1a('hello'));
    });

    it('不同输入得不同输出', () => {
      expect(fnv1a('hello')).not.toBe(fnv1a('world'));
    });

    it('输出是 36 进制字符串（非空）', () => {
      const h = fnv1a('some prompt text');
      expect(h.length).toBeGreaterThan(0);
      expect(h).toMatch(/^[0-9a-z]+$/);
    });

    it('空串也有稳定输出', () => {
      expect(fnv1a('')).toBe(fnv1a(''));
      expect(fnv1a('').length).toBeGreaterThan(0);
    });
  });

  describe('键的构造', () => {
    const job = { id: '7b95a9a0-f44a-4b27-9c18-e139023fa47a', prompt: 'a portrait of a woman' };

    it('形如 id 前 8 位 + 短横线 + 4 位哈希', () => {
      expect(jobKey(job)).toMatch(/^[0-9a-f]{8}-[0-9a-z]{4}$/);
    });

    it('前缀取自 id 前 8 位', () => {
      expect(jobKey(job).slice(0, 8)).toBe('7b95a9a0');
    });

    it('同一作业恒得同一键', () => {
      expect(jobKey(job)).toBe(jobKey({ ...job }));
    });

    it('提示词归一化差异不影响键（空格/大小写）', () => {
      expect(jobKey({ id: job.id, prompt: 'A  Portrait' }))
        .toBe(jobKey({ id: job.id, prompt: 'a portrait' }));
    });

    it('提示词内容变了，键会变', () => {
      expect(jobKey({ id: job.id, prompt: 'a portrait of a woman' }))
        .not.toBe(jobKey({ id: job.id, prompt: 'a portrait of a man' }));
    });

    it('id 变了，键会变', () => {
      expect(jobKey(job)).not.toBe(jobKey({ ...job, id: '12345678-aaaa-bbbb-cccc-ddddeeeeffff' }));
    });

    it('缺 id 时用占位符，不抛错', () => {
      expect(jobKey({ prompt: 'x' })).toMatch(/^\?{8}-[0-9a-z]{4}$/);
    });

    it('缺 prompt 时也有键', () => {
      expect(jobKey({ id: 'abcdef12-0000-0000-0000-000000000000' })).toMatch(/^abcdef12-[0-9a-z]{4}$/);
    });

    it('空作业不抛错', () => {
      expect(() => jobKey({})).not.toThrow();
      expect(() => jobKey(null)).not.toThrow();
    });
  });

  describe('碰撞检测', () => {
    it('无碰撞时返回等长数组', () => {
      const jobs = [
        { id: 'aaaaaaaa-0000-0000-0000-000000000000', prompt: 'one' },
        { id: 'bbbbbbbb-0000-0000-0000-000000000000', prompt: 'two' },
        { id: 'cccccccc-0000-0000-0000-000000000000', prompt: 'three' },
      ];
      const keys = jobKeys(jobs);
      expect(keys).toHaveLength(3);
      expect(new Set(keys).size).toBe(3);
    });

    it('id 相同但提示词不同 → 键不同（靠哈希段区分）', () => {
      const jobs = [
        { id: 'aaaaaaaa-0000-0000-0000-000000000000', prompt: 'first prompt' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000000', prompt: 'second prompt' },
      ];
      const keys = jobKeys(jobs);
      expect(keys[0]).not.toBe(keys[1]);
    });

    it('真碰撞时抛错（键必须唯一）', () => {
      const jobs = [
        { id: 'aaaaaaaa-0000-0000-0000-000000000000', prompt: 'same' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000000', prompt: 'same' },
      ];
      expect(() => jobKeys(jobs)).toThrow(/碰撞/);
    });

    it('碰撞报错信息里带出撞上的键', () => {
      const jobs = [
        { id: 'aaaaaaaa-0000-0000-0000-000000000000', prompt: 'same' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000000', prompt: 'same' },
      ];
      expect(() => jobKeys(jobs)).toThrow(/aaaaaaaa/);
    });

    it('空数组不抛错', () => {
      expect(jobKeys([])).toEqual([]);
    });
  });

  describe('构建期与浏览器端一致', () => {
    /**
     * 键的算法本体在 webui/js/job-key.js（浏览器端），构建期通过 vm 加载同一份。
     * 这条断言锁死「两端算出同一个键」—— 一旦有人把算法抄成两份并改了一边，
     * 构建期的碰撞断言就会为一个浏览器里不存在的键背书，测试必须先炸。
     */
    it('同一份算法：tools/job-key.mjs 与 webui/js/job-key.js 算出的键一致', () => {
      const algoFile = path.resolve(__dirname, '../webui/js/job-key.js');
      const text = fs.readFileSync(algoFile, 'utf8');
      const ctx: Record<string, unknown> = {};
      vm.createContext(ctx);
      vm.runInContext(text + '\n;globalThis.__JOB_KEY = JOB_KEY;', ctx, { timeout: 5000 });
      const browserAlgo = ctx.__JOB_KEY as {
        keyOf(job: unknown): string;
        normalizePrompt(p: unknown): string;
        fnv1a(s: string): string;
      };

      const samples = [
        { id: '7b95a9a0-f44a-4b27-9c18-e139023fa47a', prompt: 'Bust shot of an ordinary Korean woman' },
        { id: 'abcdef12-0000-0000-0000-000000000000', prompt: 'A  Portrait  OF  Someone' },
        { id: '', prompt: '' },
        { id: '12345678-aaaa-bbbb-cccc-ddddeeeeffff', prompt: 'x'.repeat(500) },
      ];
      for (const s of samples) {
        expect(jobKey(s)).toBe(browserAlgo.keyOf(s));
        expect(normalizePrompt(s.prompt)).toBe(browserAlgo.normalizePrompt(s.prompt));
        expect(fnv1a(normalizePrompt(s.prompt))).toBe(browserAlgo.fnv1a(normalizePrompt(s.prompt)));
      }
    });

    it('浏览器端算法文件存在且可独立加载（不依赖其他脚本）', () => {
      const algoFile = path.resolve(__dirname, '../webui/js/job-key.js');
      expect(fs.existsSync(algoFile)).toBe(true);
      const ctx: Record<string, unknown> = {};
      vm.createContext(ctx);
      expect(() =>
        vm.runInContext(fs.readFileSync(algoFile, 'utf8'), ctx, { timeout: 5000 })
      ).not.toThrow();
    });
  });
});
