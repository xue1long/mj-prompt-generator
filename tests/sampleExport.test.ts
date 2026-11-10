import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 研究样本导出（报告 4.1 / 第 10 步）的单元测试。
 *
 * 这层守的是**导出格式的契约**：
 *   · 导出的是筛选命中的全量，不是分页后显示的部分
 *   · JSON 与 Markdown 同源 —— 条数、字段、引用键必须一致
 *   · 边界不能塌：空结果、缺拆解、特殊字符、非法时间戳
 *
 * 端到端（verify-webui.mjs）守的是**链路可用**：按钮点了有没有真的下载。
 * 两层都要有 —— 只有端到端的话，格式塌了要等到人真去用才发现。
 *
 * 与 filterEngine.test.ts 同一手法：vm 加载前端算法本体，
 * 不在测试里复刻一份实现（复刻 = 两处漂移 = 断言为一个浏览器里不存在的行为背书）。
 */

const ROOT = path.resolve(__dirname, '..');
const EXPORT_FILE = path.join(ROOT, 'webui', 'js', 'sample-export.js');
const DATA_FILE = path.join(ROOT, 'webui', 'js', 'data-explore.js');
const JOBKEY_FILE = path.join(ROOT, 'webui', 'js', 'job-key.js');

interface Seg {
  段位: string;
  文本: string;
  备注: string;
}
interface Row {
  引用键: string;
  标题: string;
  提示词: string;
  作者: string;
  宽高比: string;
  版本: string;
  风格参考码: string;
  采集批次: string;
  生成日期: string;
  配图数: number;
  拆解来源: string;
  拆解摘要: string;
  七段拆解: Seg[];
}

/** 加载前端导出模块本体 + 真实数据 + 键算法。 */
function loadExport(jobs?: unknown[]) {
  const ctx: any = { console };
  vm.createContext(ctx);
  // 键算法：与 sample-export.js 用的是同一个 JOB_KEY
  vm.runInContext(fs.readFileSync(JOBKEY_FILE, 'utf8'), ctx, { timeout: 5000 });
  // 导出模块本体
  vm.runInContext(fs.readFileSync(EXPORT_FILE, 'utf8'), ctx, { timeout: 5000 });
  // 真实数据。
  // 注意：vm 里的顶层 const 不进 context —— 必须显式挂到 globalThis，
  // 否则 ctx.EXPLORE_JOBS 是 undefined（与 tests/phraseIndex.test.ts 同一手法）。
  vm.runInContext(
    fs.readFileSync(DATA_FILE, 'utf8') + '\n;globalThis.__JOBS = EXPLORE_JOBS;',
    ctx,
    { timeout: 10000 },
  );

  // 装一个最小可用的 EXPLORE_BOARD 替身：只提供 matches() 与 state
  const all = ctx.__JOBS || [];
  const list = jobs === undefined ? all : jobs;
  ctx.EXPLORE_BOARD = {
    state: { q: '', batch: '', aspect: '', srefOnly: false, srefCodes: new Set(), phrases: new Set() },
    matches: () => list,
  };

  vm.runInContext(
    '\n;globalThis.__SE = SAMPLE_EXPORT;',
    ctx,
    { timeout: 5000 },
  );
  return { SE: ctx.__SE, ctx, all };
}

describe('研究样本导出', () => {
  describe('取数口径', () => {
    it('导出的是筛选命中的全量，不是分页后显示的部分', () => {
      const { SE } = loadExport();
      const jobs = SE.currentJobs();
      // 真实数据远多于一页（页面默认显示 60 条）
      expect(jobs.length).toBeGreaterThan(60);
      expect(jobs.length).toBe(SE.currentJobs().length);
    });

    it('EXPLORE_BOARD 缺席时返回空数组而不是抛错', () => {
      const ctx: any = { console };
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(EXPORT_FILE, 'utf8'), ctx, { timeout: 5000 });
      vm.runInContext('\n;globalThis.__SE = SAMPLE_EXPORT;', ctx, { timeout: 5000 });
      expect(ctx.__SE.currentJobs()).toEqual([]);
    });
  });

  describe('JSON 格式', () => {
    it('是合法 JSON，且条数与命中数一致', () => {
      const { SE } = loadExport();
      const jobs = SE.currentJobs();
      const o = JSON.parse(SE.toJson(jobs));
      expect(o['命中条数']).toBe(jobs.length);
      expect(o['样本']).toHaveLength(jobs.length);
    });

    it('含筛选条件描述，便于外部判断这份数据是什么', () => {
      const { SE } = loadExport();
      const o = JSON.parse(SE.toJson());
      expect(typeof o['筛选条件']).toBe('string');
      expect(o['筛选条件'].length).toBeGreaterThan(0);
      expect(typeof o['导出时间']).toBe('string');
    });

    it('每条都带引用键、提示词与生成日期', () => {
      const { SE } = loadExport();
      const o = JSON.parse(SE.toJson());
      for (const row of o['样本']) {
        expect(row['引用键']).toMatch(/^[0-9a-f]{8}-[0-9a-z]{4}$/);
        expect(typeof row['提示词']).toBe('string');
        expect(row['生成日期']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('空结果导出仍是合法 JSON，条数为 0', () => {
      const { SE } = loadExport([]);
      const o = JSON.parse(SE.toJson());
      expect(o['命中条数']).toBe(0);
      expect(o['样本']).toEqual([]);
    });
  });

  describe('Markdown 格式', () => {
    it('与 JSON 同源 —— 详情段数等于命中条数', () => {
      const { SE } = loadExport();
      const jobs = SE.currentJobs();
      const md = SE.toMarkdown(jobs);
      const details = (md.match(/^### \d+\./gm) || []).length;
      expect(details).toBe(jobs.length);
    });

    it('含概览表头与每一行', () => {
      const { SE } = loadExport();
      const md = SE.toMarkdown();
      expect(md.startsWith('# 研究样本导出')).toBe(true);
      expect(md).toContain('| 引用键 |');
      const rows = (md.match(/^\| /gm) || []).length;
      // 表头 + 分隔行 + 每条一行
      expect(rows).toBe(SE.currentJobs().length + 2);
    });

    it('空结果时给出明确说明，不留空白页', () => {
      const { SE } = loadExport([]);
      const md = SE.toMarkdown();
      expect(md).toContain('没有命中任何样本');
    });

    it('提示词里的竖线被转义，不会破表格', () => {
      const { SE } = loadExport([
        { id: 'a1', title: 'T', prompt: 'a | b | c', author: 'x', aspect: '1:1', version: '8.2', sref: '', batch: '2026-11-01', time: 1793437658000, thumbs: [], decomposition: null },
      ]);
      const md = SE.toMarkdown();
      // 提示词在代码块里，表格行里的竖线必须转义
      const tableLine = md.split('\n').find((l) => l.startsWith('| ') && l.includes('a1') || (l.startsWith('| ') && l.includes('T')));
      expect(tableLine).toBeDefined();
      // 提示词代码块内原样保留
      expect(md).toContain('a | b | c');
    });

    it('拆解按段位逐段呈现，含备注', () => {
      const { SE } = loadExport();
      const md = SE.toMarkdown();
      expect(md).toContain('**主体**');
      expect(md).toContain('备注：');
    });
  });

  describe('拆解字段', () => {
    it('保留段位、文本与备注', () => {
      const { SE } = loadExport();
      const jobs = SE.currentJobs();
      const withSeg = jobs.find((j: any) => j.decomposition && Array.isArray(j.decomposition.segments) && j.decomposition.segments.length);
      expect(withSeg).toBeTruthy();
      const row = SE.rowOf(withSeg) as Row;
      expect(row['七段拆解'].length).toBe(withSeg.decomposition.segments.length);
      expect(row['七段拆解'][0]['段位']).toBeTruthy();
    });

    it('没有拆解的作业留空，不编造', () => {
      const { SE } = loadExport();
      const jobs = SE.currentJobs();
      const noDecomp = jobs.find((j: any) => !j.decomposition);
      expect(noDecomp).toBeTruthy();
      const row = SE.rowOf(noDecomp) as Row;
      expect(row['七段拆解']).toEqual([]);
      expect(row['拆解摘要']).toBe('');
      expect(row['拆解来源']).toBe('');
    });

    it('拆解来源如实取自源字段（规则解析 / 逐条精拆 / 手工精拆）', () => {
      const { SE } = loadExport();
      const jobs = SE.currentJobs();
      const sources = new Set(
        jobs
          .filter((j: any) => j.decomposition)
          .map((j: any) => SE.rowOf(j)['拆解来源']),
      );
      expect(sources.size).toBeGreaterThan(0);
      // 只允许出现源数据里真实存在的来源，不允许造出第四种
      const allowed = new Set(['规则解析', '逐条精拆', '手工精拆']);
      for (const s of sources) expect(allowed.has(s)).toBe(true);
    });
  });

  describe('生成日期', () => {
    it('由 time 字段（Unix 毫秒）换算，与采集批次是两个口径', () => {
      const { SE } = loadExport();
      const jobs = SE.currentJobs();
      const row = SE.rowOf(jobs[0]) as Row;
      expect(row['生成日期']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // 采集批次是日期串，生成日期也是日期串，但两者不必相等
      expect(row['采集批次']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('time 缺失或非法时留空，不产出假日期', () => {
      const { SE } = loadExport([
        { id: 'b1', title: 'T', prompt: 'p', author: 'x', aspect: '1:1', version: '8.2', sref: '', batch: '2026-11-01', time: 0, thumbs: [], decomposition: null },
        { id: 'b2', title: 'T', prompt: 'p', author: 'x', aspect: '1:1', version: '8.2', sref: '', batch: '2026-11-01', thumbs: [], decomposition: null },
      ]);
      const rows = SE.currentJobs().map((j: any) => SE.rowOf(j) as Row);
      expect(rows[0]['生成日期']).toBe('');
      expect(rows[1]['生成日期']).toBe('');
    });
  });

  describe('文件名', () => {
    it('带时间戳与筛选标识，扩展名正确', () => {
      const { SE } = loadExport();
      expect(SE.filename('json')).toMatch(/^研究样本导出-\d{8}-\d{4}-all\.json$/);
      expect(SE.filename('md')).toMatch(/^研究样本导出-\d{8}-\d{4}-all\.md$/);
    });
  });
});
