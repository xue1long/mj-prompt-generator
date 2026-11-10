import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 对照视图（报告 2.2）的单元测试。
 *
 * 这层守的是**算法契约**：词级差异怎么算、拆解对照怎么对齐、
 * sref 码怎么从「空格分隔的字符串」里拆出来。
 * 端到端（verify-webui.mjs）守的是**链路可用**：勾选两条能不能真并排渲染出来。
 *
 * 与 filterEngine.test.ts / phraseIndex.test.ts 同一手法：vm 加载前端算法本体，
 * 不在测试里复刻一份实现（复刻 = 两处会漂移）。
 */

const COMPARE_FILE = path.resolve(__dirname, '../webui/js/compare-view.js');

interface DiffPart { text: string; kind: 'same' | 'only' | 'gap' }
interface DiffResult {
  a: DiffPart[];
  b: DiffPart[];
  onlyA: number;
  onlyB: number;
  same: number;
}
interface CompareApi {
  diffPrompts(a: string, b: string): DiffResult;
  metaRows(a: any, b: any): Array<{ label: string; a: string; b: string; same: boolean }>;
  decompRows(a: any, b: any): Array<{
    code: string; module: string;
    a: { text: string; note: string; has: boolean };
    b: { text: string; note: string; has: boolean };
    same: boolean;
  }>;
  srefCodes(job: any): string[];
}

/**
 * 加载前端算法本体。
 * compare-view.js 的渲染函数依赖 core.js 的 esc / icon / stateHtml，
 * 纯算法部分（diff / meta / decomp / srefCodes）不依赖它们 ——
 * 这里注入最小桩，只为让整个 IIFE 跑起来。
 */
function loadCompareApi(): CompareApi {
  const text = fs.readFileSync(COMPARE_FILE, 'utf8');
  const ctx: Record<string, any> = { console };
  vm.createContext(ctx);
  const stubs = `
    const esc = (s) => String(s ?? '');
    const icon = () => '';
    const stateHtml = () => '';
    const toast = () => {};
  `;
  vm.runInContext(stubs + text + '\n;globalThis.__CV = COMPARE_VIEW;', ctx, { timeout: 5000 });
  return ctx.__CV as CompareApi;
}

/** 按逗号切短语 —— 与 compare-view 的切分口径一致（测试里要独立复算一遍做交叉核对）。 */
function segs(prompt: string): string[] {
  return String(prompt || '').split(/[,;|]+/).map(s => s.trim()).filter(Boolean);
}

describe('对照视图', () => {
  describe('词级差异', () => {
    const CV = loadCompareApi();

    it('完全相同的 prompt 没有差异', () => {
      const d = CV.diffPrompts('a, b, c', 'a, b, c');
      expect(d.onlyA).toBe(0);
      expect(d.onlyB).toBe(0);
      expect(d.same).toBe(3);
    });

    it('一个短语不同 → 两侧各差 1', () => {
      const d = CV.diffPrompts('a, b, c', 'a, x, c');
      expect(d.onlyA).toBe(1);
      expect(d.onlyB).toBe(1);
      expect(d.same).toBe(2);
    });

    it('标记数与计数一致', () => {
      const d = CV.diffPrompts('a, b, c, d', 'a, x, c, y');
      expect(d.a.filter(p => p.kind === 'only').length).toBe(d.onlyA);
      expect(d.b.filter(p => p.kind === 'only').length).toBe(d.onlyB);
      expect(d.a.filter(p => p.kind === 'same').length).toBe(d.same);
    });

    it('差异只出现在短语级，不拆词（35mm lens 保持完整）', () => {
      const d = CV.diffPrompts('shot on 35mm lens', 'shot on 85mm lens');
      const aOnly = d.a.filter(p => p.kind === 'only').map(p => p.text);
      expect(aOnly).toContain('shot on 35mm lens');
      expect(aOnly).not.toContain('35mm');
    });

    it('共有短语按原顺序保留', () => {
      const d = CV.diffPrompts('first, shared, last', 'first, shared, last');
      expect(d.a.map(p => p.text)).toEqual(['first', 'shared', 'last']);
    });

    it('A 完全包含 B 时，B 的短语全标为共有', () => {
      const d = CV.diffPrompts('a, b, c', 'b');
      expect(d.same).toBe(1);
      expect(d.onlyA).toBe(2);
      expect(d.onlyB).toBe(0);
    });

    it('空 prompt 不抛错', () => {
      const d = CV.diffPrompts('', 'a');
      expect(d.onlyA).toBe(0);
      expect(d.onlyB).toBe(1);
      expect(d.same).toBe(0);
    });

    it('两侧都空 → 全零', () => {
      const d = CV.diffPrompts('', '');
      expect(d.onlyA).toBe(0);
      expect(d.onlyB).toBe(0);
      expect(d.same).toBe(0);
    });

    it('结果与独立复算一致（长度守恒）', () => {
      const pa = 'cinematic lighting, 35mm film, portrait of a woman';
      const pb = 'cinematic lighting, portrait of a woman, oil painting';
      const d = CV.diffPrompts(pa, pb);
      expect(d.a.filter(p => p.kind !== 'only').length + d.onlyA).toBe(segs(pa).length);
      expect(d.b.filter(p => p.kind !== 'only').length + d.onlyB).toBe(segs(pb).length);
    });

    it('分号与竖线也作分隔符', () => {
      const d = CV.diffPrompts('a; b', 'a | b');
      expect(d.same).toBe(2);
      expect(d.onlyA).toBe(0);
    });
  });

  describe('sref 码提取', () => {
    const CV = loadCompareApi();

    it('单码 → 单元素数组', () => {
      expect(CV.srefCodes({ sref: '3808026652' })).toEqual(['3808026652']);
    });

    it('多码（空格分隔）→ 多元素数组', () => {
      expect(CV.srefCodes({ sref: '225034070 4277459420' })).toEqual(['225034070', '4277459420']);
    });

    it('无 sref → 空数组', () => {
      expect(CV.srefCodes({})).toEqual([]);
      expect(CV.srefCodes({ sref: null })).toEqual([]);
      expect(CV.srefCodes({ sref: '' })).toEqual([]);
    });

    it('多余空格不产生空元素', () => {
      expect(CV.srefCodes({ sref: '  225034070   4277459420  ' })).toEqual(['225034070', '4277459420']);
    });
  });

  describe('元数据对照', () => {
    const CV = loadCompareApi();

    const A = { author: 'alice', aspect: '1:1', version: '8.2', batch: '2026-11-05', sref: '123' };
    const B = { author: 'bob', aspect: '1:1', version: '8.1', batch: '2026-11-05', sref: '123' };

    it('固定 5 个字段', () => {
      const rows = CV.metaRows(A, B);
      expect(rows.length).toBe(5);
      expect(rows.map(r => r.label)).toEqual(['作者', '比例', '版本', '批次', 'sref']);
    });

    it('相同字段标 same，不同字段标差异', () => {
      const rows = CV.metaRows(A, B);
      const byLabel = Object.fromEntries(rows.map(r => [r.label, r]));
      expect(byLabel['作者'].same).toBe(false);
      expect(byLabel['比例'].same).toBe(true);
      expect(byLabel['版本'].same).toBe(false);
      expect(byLabel['批次'].same).toBe(true);
      expect(byLabel['sref'].same).toBe(true);
    });

    it('缺失字段显示为破折号', () => {
      const rows = CV.metaRows({ author: 'x' }, { author: 'x' });
      const aspect = rows.find(r => r.label === '比例')!;
      expect(aspect.a).toBe('—');
      expect(aspect.same).toBe(true);
    });
  });

  describe('七段拆解对照', () => {
    const CV = loadCompareApi();

    const seg = (code: string, module: string, text: string, note = '') => ({ code, module, text, note });
    const A = {
      decomposition: {
        source: '逐条精拆',
        segments: [
          seg('1', '主体', 'a girl'),
          seg('2', '动作 / 状态', ''),
          seg('3', '细节与环境', 'a bathroom'),
        ],
      },
    };
    const B = {
      decomposition: {
        source: '规则解析',
        segments: [
          seg('1', '主体', 'a girl'),
          seg('2', '动作 / 状态', 'walking'),
          seg('3', '细节与环境', 'a bathroom'),
        ],
      },
    };

    it('恒定 7 行（缺失的段补空）', () => {
      const rows = CV.decompRows(A, B);
      expect(rows.length).toBe(7);
      expect(rows.map(r => r.code)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    });

    it('缺失的段 has=false、文本为空', () => {
      const rows = CV.decompRows(A, B);
      expect(rows[3].a.has).toBe(false);
      expect(rows[3].a.text).toBe('');
      expect(rows[3].b.has).toBe(false);
    });

    it('文本相同则标 same', () => {
      const rows = CV.decompRows(A, B);
      expect(rows[0].same).toBe(true);
      expect(rows[2].same).toBe(true);
    });

    it('文本不同则标差异', () => {
      const rows = CV.decompRows(A, B);
      expect(rows[1].same).toBe(false);
      expect(rows[1].a.text).toBe('');
      expect(rows[1].b.text).toBe('walking');
    });

    it('note 一并带出', () => {
      const withNote = {
        decomposition: { segments: [seg('1', '主体', 'a girl', '权重基本保住')] },
      };
      const rows = CV.decompRows(withNote, A);
      expect(rows[0].a.note).toBe('权重基本保住');
    });

    it('没有拆解结果也不抛错', () => {
      const rows = CV.decompRows({}, {});
      expect(rows.length).toBe(7);
      expect(rows.every(r => !r.a.has && !r.b.has)).toBe(true);
    });
  });
});
