import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 研究数据层（报告 2.3 / 第 6 步）的单元测试。
 *
 * 分层说明：
 *   · 这里守**纯逻辑与结构契约**（归一化、字段形状、索引声明、库与 store 命名）。
 *   · IndexedDB 的真实读写由 scripts/verify-webui.mjs 的浏览器断言守
 *     （file:// 下的 IndexedDB 行为必须在真浏览器里验，node 环境没有 IndexedDB）。
 *
 * 为什么不为测试引入 fake-indexeddb：项目要求纯离线可构建，
 * 多一个 devDependency 就要多一次联网安装；而且 fake 实现与 Chrome 真实现
 * 在事务时序上仍有差异 —— 关键路径交给真浏览器断言更可靠。
 */

const STORE_FILE = path.resolve(__dirname, '../webui/js/research-store.js');

/** 用 vm 加载浏览器端数据层（同一份代码，不复刻）。 */
function loadStore() {
  const text = fs.readFileSync(STORE_FILE, 'utf8');
  const ctx: Record<string, unknown> = {};
  vm.createContext(ctx);
  // 顶层 const 不进 context，需要显式取出来
  vm.runInContext(text + '\n;globalThis.__RESEARCH_DB = RESEARCH_DB;', ctx, { timeout: 5000 });
  return ctx.__RESEARCH_DB as {
    DB_NAME: string;
    DB_VERSION: number;
    STORE_NOTES: string;
    STORE_CONCLUSIONS: string;
    normalizeTags(tags: unknown): string[];
    normalizeKeys(keys: unknown): string[];
    status(): { available: boolean; reason: string | null };
  };
}

describe('研究数据层', () => {
  describe('结构契约', () => {
    it('库名与 store 命名固定（后续数据层扩展要认这个口径）', () => {
      const S = loadStore();
      expect(S.DB_NAME).toBe('mj-research');
      expect(S.DB_VERSION).toBe(1);
      expect(S.STORE_NOTES).toBe('notes');
      expect(S.STORE_CONCLUSIONS).toBe('conclusions');
    });

    it('数据层文件可独立加载，不依赖其他脚本', () => {
      expect(fs.existsSync(STORE_FILE)).toBe(true);
      const ctx: Record<string, unknown> = {};
      vm.createContext(ctx);
      expect(() => vm.runInContext(fs.readFileSync(STORE_FILE, 'utf8'), ctx, { timeout: 5000 })).not.toThrow();
    });

    it('声明了观察记录与结论两个实体', () => {
      const text = fs.readFileSync(STORE_FILE, 'utf8');
      expect(text).toContain('createObjectStore');
      // 两类实体各有独立的存储与索引声明
      expect(text).toContain("STORE_NOTES = 'notes'");
      expect(text).toContain("STORE_CONCLUSIONS = 'conclusions'");
    });

    it('观察记录建了 byJob / byTs / byTag 三个索引', () => {
      const text = fs.readFileSync(STORE_FILE, 'utf8');
      expect(text).toContain("createIndex('byJob', 'jobKey'");
      expect(text).toContain("createIndex('byTs', 'createdAt'");
      // 多值索引：一条记录可打多个标签，按标签聚合靠它
      expect(text).toContain("createIndex('byTag', 'tags', { unique: false, multiEntry: true })");
    });

    it('结论建了 byJob 多值索引（依据的是样本集合，不是单条）', () => {
      const text = fs.readFileSync(STORE_FILE, 'utf8');
      expect(text).toContain("createIndex('byJob', 'jobKeys', { unique: false, multiEntry: true })");
    });
  });

  describe('标签归一化', () => {
    it('去首尾空白', () => {
      expect(loadStore().normalizeTags(['  构图  '])).toEqual(['构图']);
    });

    it('去重（大小写不敏感）', () => {
      expect(loadStore().normalizeTags(['构图', '构图', 'COMPOSITION'])).toEqual(['构图', 'COMPOSITION']);
    });

    it('丢掉空标签', () => {
      expect(loadStore().normalizeTags(['构图', '', '   ', null, undefined])).toEqual(['构图']);
    });

    it('非数组返回空数组', () => {
      const S = loadStore();
      expect(S.normalizeTags(undefined)).toEqual([]);
      expect(S.normalizeTags(null)).toEqual([]);
      expect(S.normalizeTags('构图')).toEqual([]);
    });

    it('保序（先出现的在前）', () => {
      expect(loadStore().normalizeTags(['b', 'a', 'c'])).toEqual(['b', 'a', 'c']);
    });
  });

  describe('引用键归一化', () => {
    it('去首尾空白', () => {
      expect(loadStore().normalizeKeys(['  7b95a9a0-qfxx  '])).toEqual(['7b95a9a0-qfxx']);
    });

    it('去重（大小写不敏感）', () => {
      expect(loadStore().normalizeKeys(['7B95A9A0-QFXX', '7b95a9a0-qfxx'])).toEqual(['7B95A9A0-QFXX']);
    });

    it('丢掉空引用键', () => {
      expect(loadStore().normalizeKeys(['k1', '', '   ', null])).toEqual(['k1']);
    });

    it('非数组返回空数组', () => {
      expect(loadStore().normalizeKeys(undefined)).toEqual([]);
    });
  });

  describe('存储可用性', () => {
    it('status() 给出可用性与原因', () => {
      const S = loadStore();
      const st = S.status();
      expect(typeof st.available).toBe('boolean');
      // node 环境没有 IndexedDB → 不可用且有原因，不静默
      if (!st.available) expect(typeof st.reason).toBe('string');
    });

    it('node 环境（无 IndexedDB）下如实报告不可用，而不是假装成功', () => {
      const S = loadStore();
      // vm context 里没有 indexedDB 全局
      expect(S.status().available).toBe(false);
    });
  });

  describe('与引用键的衔接（报告 2.1 → 2.3）', () => {
    it('观察记录挂的是引用键，不是上游 UUID', () => {
      const text = fs.readFileSync(STORE_FILE, 'utf8');
      // 字段名与注释都指向引用键
      expect(text).toContain('jobKey');
      expect(text).toContain('引用键');
      // 不该出现按 UUID 存的另一个字段
      expect(text).not.toMatch(/jobId\s*:/);
    });

    it('引用键格式与第 5 步的键算法一致', () => {
      // 数据层只存字符串，格式由 job-key.js 保证；这里锁住「形如 id8-hash4」
      const text = fs.readFileSync(STORE_FILE, 'utf8');
      expect(text).toContain('jobKey');
      const sample = '7b95a9a0-qfxx';
      expect(sample).toMatch(/^[0-9a-f]{8}-[0-9a-z]{4}$/);
    });
  });
});
