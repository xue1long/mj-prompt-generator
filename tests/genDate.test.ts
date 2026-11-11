import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 生成日期换算（报告 2.7 / 第 13 步）的单元测试。
 *
 * 这层守的是**口径**，不是格式：
 *   · 非法输入不能变成 `NaN-NaN-NaN` 或抛错（数据里真有空值的那天）
 *   · 必须是**本地时间**（UTC 会让实测 287 条落在不同日期）
 *   · 界面筛选与样本导出必须给出**同一个**日期 —— 这是抽出这个模块的全部理由
 *
 * 与 sampleExport.test.ts 同一手法：vm 加载前端本体，不在测试里复刻实现。
 */

const ROOT = path.resolve(__dirname, '..');
const GENDATE_FILE = path.join(ROOT, 'webui', 'js', 'gen-date.js');
const EXPORT_FILE = path.join(ROOT, 'webui', 'js', 'sample-export.js');
const JOBKEY_FILE = path.join(ROOT, 'webui', 'js', 'job-key.js');
const DATA_FILE = path.join(ROOT, 'webui', 'js', 'data-explore.js');

interface GenDate {
  ofTime(time: unknown): string;
  ofJob(job: { time?: number } | null | undefined): string;
  shortLabel(iso: string): string;
}

function loadGenDate(): GenDate {
  const ctx: any = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(GENDATE_FILE, 'utf8'), ctx, { timeout: 5000 });
  vm.runInContext('\n;globalThis.__GD = GEN_DATE;', ctx, { timeout: 5000 });
  return ctx.__GD;
}

/** 真实数据（971 条共用一个 vm 实例，避免反复解析 3 MB 文件）。 */
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

describe('生成日期（GEN_DATE）', () => {
  describe('ofTime：毫秒 → 本地日期', () => {
    it('正常时间戳转成 YYYY-MM-DD', () => {
      const GD = loadGenDate();
      // 本地时间构造，避免测试机时区影响（不写死 UTC 字符串）
      const t = new Date(2026, 9, 14, 12, 0, 0).getTime(); // 2026-10-14 12:00 本地
      expect(GD.ofTime(t)).toBe('2026-10-14');
    });

    it('月末与年初不越界（补零正确）', () => {
      const GD = loadGenDate();
      expect(GD.ofTime(new Date(2026, 0, 1, 0, 30, 0).getTime())).toBe('2026-01-01');
      expect(GD.ofTime(new Date(2026, 11, 31, 23, 30, 0).getTime())).toBe('2026-12-31');
      expect(GD.ofTime(new Date(2026, 2, 9, 8, 0, 0).getTime())).toBe('2026-03-09');
    });

    it('非法值一律返回空串，不抛错也不产出 NaN 日期', () => {
      const GD = loadGenDate();
      for (const bad of [undefined, null, '', 'abc', NaN, 0, -1, -1e13, Infinity, {}]) {
        expect(GD.ofTime(bad)).toBe('');
      }
    });

    it('本地时间口径：与 UTC 在同一天边界上可以不同（这是有意的）', () => {
      const GD = loadGenDate();
      // 构造「本地当天 00:30」——在 UTC+8 下对应的 UTC 日期是前一天
      const t = new Date(2026, 9, 14, 0, 30, 0).getTime();
      expect(GD.ofTime(t)).toBe('2026-10-14');
      const utcDay = new Date(t).toISOString().slice(0, 10);
      const offsetMin = new Date(t).getTimezoneOffset();
      // 只有东半球（UTC 偏移为负）才会出现「本地今天 / UTC 昨天」
      if (offsetMin < 0) expect(utcDay).not.toBe('2026-10-14');
    });
  });

  describe('ofJob', () => {
    it('取 job.time，缺 job 或 time 时返回空串', () => {
      const GD = loadGenDate();
      expect(GD.ofJob({ time: new Date(2026, 5, 1, 9, 0, 0).getTime() })).toBe('2026-06-01');
      expect(GD.ofJob(null)).toBe('');
      expect(GD.ofJob(undefined)).toBe('');
      expect(GD.ofJob({})).toBe('');
      expect(GD.ofJob({ time: 0 })).toBe('');
    });
  });

  describe('shortLabel', () => {
    it('标准日期截成 MM-DD，非标准原样返回', () => {
      const GD = loadGenDate();
      expect(GD.shortLabel('2026-11-09')).toBe('11-09');
      expect(GD.shortLabel('')).toBe('');
      expect(GD.shortLabel('11-09')).toBe('11-09');
      expect(GD.shortLabel('2026/11/09')).toBe('2026/11/09');
    });
  });

  describe('真实数据', () => {
    it('971 条作业全部能换算，且无一条产出空串', () => {
      const GD = loadGenDate();
      const jobs = loadJobs();
      expect(jobs.length).toBeGreaterThan(900);
      const empty = jobs.filter((j) => !GD.ofJob(j));
      expect(empty).toHaveLength(0);
    });

    it('生成日期的天数远小于采集批次（两个口径确实不同）', () => {
      const GD = loadGenDate();
      const jobs = loadJobs();
      const days = new Set(jobs.map((j) => GD.ofJob(j)));
      const batches = new Set(jobs.map((j) => j.batch));
      // 实测：34 个生成日 vs 8 个采集批次
      expect(days.size).toBeGreaterThan(batches.size * 2);
      // 且绝大多数作业的批次键 ≠ 它的生成日（实测 968/971）
      const mismatch = jobs.filter((j) => GD.ofJob(j) !== String(j.batch)).length;
      expect(mismatch).toBeGreaterThan(jobs.length * 0.9);
    });
  });

  describe('与样本导出的一致（模块存在的理由）', () => {
    it('界面筛选与导出「生成日期」列对同一条作业给出同一个日期', () => {
      const GD = loadGenDate();
      const jobs = loadJobs();

      // 走导出的真实路径：job-key + gen-date + sample-export
      const ctx: any = { console };
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(JOBKEY_FILE, 'utf8'), ctx, { timeout: 5000 });
      vm.runInContext(fs.readFileSync(GENDATE_FILE, 'utf8'), ctx, { timeout: 5000 });
      vm.runInContext(fs.readFileSync(EXPORT_FILE, 'utf8'), ctx, { timeout: 5000 });
      vm.runInContext('\n;globalThis.__SE = SAMPLE_EXPORT;', ctx, { timeout: 5000 });
      const SE: any = ctx.__SE;
      ctx.EXPLORE_BOARD = {
        state: { q: '', batch: '', aspect: '', srefOnly: false, srefCodes: new Set(), phrases: new Set() },
        matches: () => jobs,
      };

      const sample = jobs.slice(0, 40);
      const rows = JSON.parse(SE.toJson(sample))['样本'];
      expect(rows).toHaveLength(sample.length);
      for (let i = 0; i < sample.length; i++) {
        expect(rows[i]['生成日期']).toBe(GD.ofJob(sample[i]));
      }
    });
  });
});
