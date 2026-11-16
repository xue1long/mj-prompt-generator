import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 统一筛选引擎（报告 3.4）的单元测试。
 *
 * 这层守的是**引擎契约**：分组语义（组内任一 / 组间全部）、分面计数口径、
 * URL 往返一致性。端到端（verify-webui.mjs）守的是**链路可用**：筛选有没有真的
 * 进 URL、刷新有没有真的复现。两层都要有 —— 只有端到端的话，语义写反了要等到
 * 跑浏览器、看到错误的计数才发现。
 *
 * 引擎本体是浏览器端的 webui/js/filter-engine.js，这里用 vm 加载**同一份**代码，
 * 不复刻算法（与 jobKey.test.ts 同一手法）。
 */

type DimType = 'q' | 'enum' | 'bool' | 'multi';

interface Dim {
  key: string;
  type: DimType;
  matchOf?: (item: any, text: string) => boolean;
  valueOf?: (item: any) => string;
  valuesOf?: (item: any) => string[];
  activeOf?: (item: any) => boolean;
  groupOf?: (value: string) => string;
}

interface State {
  q: string;
  dims: Record<string, any>;
}

interface Engine {
  PARAM_TYPES: Record<string, DimType>;
  source(id: string, dims: Dim[]): { id: string; dims: Dim[] };
  dimsOf(src: any): Map<string, Dim>;
  emptyState(src: any): State;
  cloneState(st: State): State;
  sameState(a: State, b: State): boolean;
  matches(src: any, item: any, st: State): boolean;
  multiMatches(d: Dim, item: any, val: string[]): boolean;
  filter(src: any, items: any[], st: State): any[];
  counts(src: any, items: any[], st: State, dimKey: string): Map<string, number>;
  parseHash(src: any, hash: string): { tab: string | null; state: State; ignored: string[] };
  parseQuery(src: any, query: string): { tab: string | null; state: State; ignored: string[] };
  buildHash(src: any, tab: string, st: State): string;
  isEmpty(src: any, st: State): boolean;
}

const ENGINE_FILE = path.resolve(__dirname, '../webui/js/filter-engine.js');

/**
 * vm.createContext 建出来的是**裸沙箱**，没有浏览器 Web API。
 * 引擎用到 URLSearchParams（URL 契约的解析与生成），必须显式注入 ——
 * 否则测试会以 "URLSearchParams is not defined" 失败，那是脚手架缺件，不是引擎缺陷。
 */
function makeCtx(): Record<string, any> {
  const ctx: Record<string, any> = { URLSearchParams, window: {} };
  vm.createContext(ctx);
  return ctx;
}

function loadEngine(): Engine {
  const text = fs.readFileSync(ENGINE_FILE, 'utf8');
  const ctx = makeCtx();
  // 顶层 const 不进 context，显式取出来
  vm.runInContext(text + '\n;globalThis.__FE = FILTER_ENGINE;', ctx, { timeout: 5000 });
  return ctx.__FE as Engine;
}

const FE = loadEngine();

/* ── 测试用的样例数据源 ────────────────────────────────────────────────
   刻意覆盖四种参数类型，形状贴近真实数据源（艺术家 / 样本 / 风格码）。 */

interface Artist {
  name: string;
  en: string;
  tested: boolean;
  terms: string[];
  colours: string[];
}

const ARTISTS: Artist[] = [
  { name: '星野', en: 'hoshino', tested: true, terms: ['人像', '胶片'], colours: ['暖色'] },
  { name: '川濑', en: 'kawase', tested: false, terms: ['人像', '街拍'], colours: ['冷色'] },
  { name: '荒木', en: 'araki', tested: true, terms: ['风景'], colours: ['暖色', '高饱和'] },
  { name: '北野', en: 'kitano', tested: false, terms: [], colours: [] },
];

const LIB = FE.source('library', [
  {
    key: 'q',
    type: 'q',
    matchOf: (a: Artist, text: string) =>
      a.name.toLowerCase().includes(text) || String(a.en || '').toLowerCase().includes(text),
  },
  { key: 'tested', type: 'bool', activeOf: (a: Artist) => !!a.tested },
  { key: 'terms', type: 'multi', valuesOf: (a: Artist) => a.terms || [] },
  { key: 'colours', type: 'multi', valuesOf: (a: Artist) => a.colours || [] },
]);

function st(partial: Partial<State> & { dims?: Record<string, any> } = {}): State {
  const base = FE.emptyState(LIB);
  return {
    q: partial.q ?? base.q,
    dims: { ...base.dims, ...(partial.dims || {}) },
  };
}

describe('统一筛选引擎（报告 3.4）', () => {
  describe('维度注册表', () => {
    it('source 保留 id 与维度声明', () => {
      expect(LIB.id).toBe('library');
      expect(LIB.dims.map(d => d.key)).toEqual(['q', 'tested', 'terms', 'colours']);
    });

    it('dimsOf 按 key 索引维度', () => {
      const map = FE.dimsOf(LIB);
      expect(map.size).toBe(4);
      expect(map.get('terms')?.type).toBe('multi');
      expect(map.get('tested')?.type).toBe('bool');
    });

    it('PARAM_TYPES 覆盖四种参数类型', () => {
      expect(Object.keys(FE.PARAM_TYPES).sort()).toEqual(['bool', 'enum', 'multi', 'q']);
    });

    it('同一维度键不会被声明两次（重复声明会让白名单语义含糊）', () => {
      const keys = LIB.dims.map(d => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('空状态', () => {
    it('按维度类型推出默认值', () => {
      const s = FE.emptyState(LIB);
      expect(s.q).toBe('');
      expect(s.dims.tested).toBe(false);
      expect(s.dims.terms).toEqual([]);
      expect(s.dims.colours).toEqual([]);
    });

    it('q 维度不在 dims 里（避免两处真相源）', () => {
      expect(Object.keys(FE.emptyState(LIB).dims)).not.toContain('q');
    });

    it('enum 维度默认空串', () => {
      const src = FE.source('x', [{ key: 'batch', type: 'enum', valueOf: () => '' }]);
      expect(FE.emptyState(src).dims.batch).toBe('');
    });
  });

  describe('状态克隆与比较', () => {
    it('cloneState 深拷贝 multi 数组（改副本不影响原状态）', () => {
      const a = st({ dims: { terms: ['人像'] } });
      const b = FE.cloneState(a);
      b.dims.terms.push('胶片');
      expect(a.dims.terms).toEqual(['人像']);
      expect(b.dims.terms).toEqual(['人像', '胶片']);
    });

    it('sameState 对等价状态为真', () => {
      expect(FE.sameState(st({ q: 'a', dims: { terms: ['x', 'y'] } }), st({ q: 'a', dims: { terms: ['y', 'x'] } }))).toBe(true);
    });

    it('sameState 对 q 不同为假', () => {
      expect(FE.sameState(st({ q: 'a' }), st({ q: 'b' }))).toBe(false);
    });

    it('sameState 对 multi 取值不同为假', () => {
      expect(FE.sameState(st({ dims: { terms: ['x'] } }), st({ dims: { terms: ['y'] } }))).toBe(false);
    });

    it('sameState 对 bool 不同为假', () => {
      expect(FE.sameState(st({ dims: { tested: true } }), st({ dims: { tested: false } }))).toBe(false);
    });
  });

  describe('匹配语义', () => {
    it('空筛选 → 全部命中', () => {
      expect(FE.filter(LIB, ARTISTS, st())).toHaveLength(ARTISTS.length);
    });

    it('q 维度：命中才保留', () => {
      const hits = FE.filter(LIB, ARTISTS, st({ q: 'hoshino' }));
      expect(hits.map(a => a.en)).toEqual(['hoshino']);
    });

    it('q 维度：大小写不敏感', () => {
      expect(FE.filter(LIB, ARTISTS, st({ q: 'HOSHINO' }))).toHaveLength(1);
    });

    it('bool 维度：开启时只保留 active 的条目', () => {
      const hits = FE.filter(LIB, ARTISTS, st({ dims: { tested: true } }));
      expect(hits.map(a => a.name)).toEqual(['星野', '荒木']);
    });

    it('bool 维度：关闭时不过滤（bool 是「只看满足的」开关，不是按值筛选）', () => {
      // 契约：bool=false ≡ 该筛选未启用 ≡ 不过滤。
      // 它**不是**「筛出 tested===false 的条目」—— 那是另一种语义（按值筛选）。
      expect(FE.filter(LIB, ARTISTS, st({ dims: { tested: false } }))).toHaveLength(ARTISTS.length);
      const onlyUntested = FE.filter(LIB, ARTISTS, st({ dims: { tested: false } }))
        .filter(a => !a.tested);
      expect(onlyUntested).toHaveLength(2); // 关闭筛选时未实测的两条仍在结果里
    });

    it('multi 维度：组内任一命中即可（or）', () => {
      const hits = FE.filter(LIB, ARTISTS, st({ dims: { terms: ['风景', '街拍'] } }));
      expect(hits.map(a => a.name).sort()).toEqual(['川濑', '荒木']);
    });

    it('multi 维度：空数组不过滤', () => {
      expect(FE.filter(LIB, ARTISTS, st({ dims: { terms: [] } }))).toHaveLength(ARTISTS.length);
    });

    it('组间全部（and）：不同维度必须同时满足', () => {
      const hits = FE.filter(LIB, ARTISTS, st({ dims: { tested: true, terms: ['风景'] } }));
      expect(hits.map(a => a.name)).toEqual(['荒木']);
    });

    it('组间全部（and）：与条件冲突时结果为空', () => {
      // 已实测 且 街拍 —— 川濑有「街拍」但未实测 ⇒ 无交集
      const hits = FE.filter(LIB, ARTISTS, st({ dims: { tested: true, terms: ['街拍'] } }));
      expect(hits).toHaveLength(0);
    });

    it('q 与维度条件叠加', () => {
      const hits = FE.filter(LIB, ARTISTS, st({ q: 'hoshino', dims: { tested: true } }));
      expect(hits).toHaveLength(1);
      // 川濑未实测 ⇒ 与「只看实测」冲突
      const miss = FE.filter(LIB, ARTISTS, st({ q: 'kawase', dims: { tested: true } }));
      expect(miss).toHaveLength(0);
    });

    it('enum 维度：单选精确匹配', () => {
      const src = FE.source('s', [{ key: 'batch', type: 'enum', valueOf: (j: any) => j.batch }]);
      const items = [{ batch: 'b1' }, { batch: 'b2' }, { batch: 'b1' }];
      expect(FE.filter(src, items, { q: '', dims: { batch: 'b1' } })).toHaveLength(2);
      expect(FE.filter(src, items, { q: '', dims: { batch: '' } })).toHaveLength(3);
    });

    it('enum 维度：未知取值 → 结果为空（不静默放行全部）', () => {
      const src = FE.source('s', [{ key: 'batch', type: 'enum', valueOf: (j: any) => j.batch }]);
      expect(FE.filter(src, [{ batch: 'b1' }], { q: '', dims: { batch: 'zzz' } })).toHaveLength(0);
    });
  });

  describe('分面计数', () => {
    it('counts 在无筛选时给出各维度的总分布', () => {
      const c = FE.counts(LIB, ARTISTS, st(), 'terms');
      expect(c.get('人像')).toBe(2);
      expect(c.get('风景')).toBe(1);
      expect(c.get('胶片')).toBe(1);
    });

    it('counts 在其它维度筛选下计算（经典分面口径）', () => {
      // 只看实测 → 术语分布应只剩星野/荒木那两条
      const c = FE.counts(LIB, ARTISTS, st({ dims: { tested: true } }), 'terms');
      expect(c.get('人像')).toBe(1);
      expect(c.get('风景')).toBe(1);
      expect(c.get('街拍')).toBeUndefined();
    });

    it('counts 对目标维度自身不参与计算（选中某值后计数不塌缩）', () => {
      const c = FE.counts(LIB, ARTISTS, st({ dims: { terms: ['人像'] } }), 'terms');
      expect(c.get('人像')).toBe(2);
      expect(c.get('风景')).toBe(1);
    });

    it('counts 未知维度返回空 Map', () => {
      expect(FE.counts(LIB, ARTISTS, st(), 'nope').size).toBe(0);
    });

    it('counts 对 bool 维度没有取值分布（返回空）', () => {
      expect(FE.counts(LIB, ARTISTS, st(), 'tested').size).toBe(0);
    });

    it('counts 不修改传入的状态', () => {
      const s = st({ dims: { terms: ['人像'] } });
      FE.counts(LIB, ARTISTS, s, 'terms');
      expect(s.dims.terms).toEqual(['人像']);
    });
  });

  describe('URL 解析', () => {
    it('parseHash 拆出页签与 query', () => {
      const p = FE.parseHash(LIB, '#artists?q=star&terms=portrait');
      expect(p.tab).toBe('artists');
      expect(p.state.q).toBe('star');
    });

    it('parseHash 兼容无 # 前缀', () => {
      expect(FE.parseHash(LIB, 'artists?q=star').tab).toBe('artists');
    });

    it('parseHash 无 query 时页签仍能取到', () => {
      expect(FE.parseHash(LIB, '#artists').tab).toBe('artists');
      expect(FE.parseHash(LIB, '#artists').state.q).toBe('');
    });

    it('parseQuery 只解析 query（不把页签当参数名）', () => {
      const p = FE.parseQuery(LIB, 'q=star&terms=portrait');
      expect(p.state.q).toBe('star');
      expect(p.state.dims.terms).toEqual(['portrait']);
      expect(p.ignored).toEqual([]);
    });

    it('multi 参数重复出现即多选', () => {
      const p = FE.parseQuery(LIB, 'terms=a&terms=b&terms=c');
      expect(p.state.dims.terms).toEqual(['a', 'b', 'c']);
    });

    it('bool 参数出现即 1', () => {
      expect(FE.parseQuery(LIB, 'tested=1').state.dims.tested).toBe(true);
    });

    it('bool 参数非 1 视为未生效，但不算「不认识」', () => {
      const p = FE.parseQuery(LIB, 'tested=true');
      expect(p.state.dims.tested).toBe(false);
      expect(p.ignored).toEqual([]);
    });

    it('不认识的参数被丢弃并记进 ignored（不静默忽略）', () => {
      const p = FE.parseQuery(LIB, 'zzz=1&terms=a');
      expect(p.ignored).toEqual(['zzz']);
      expect(p.state.dims.terms).toEqual(['a']);
    });

    it('ignored 里同一个参数只出现一次', () => {
      const p = FE.parseQuery(LIB, 'zzz=1&zzz=2');
      expect(p.ignored).toEqual(['zzz']);
    });

    it('enum 取第一个非空值', () => {
      const src = FE.source('s', [{ key: 'batch', type: 'enum', valueOf: (j: any) => j.batch }]);
      expect(FE.parseQuery(src, 'batch=b1&batch=b2').state.dims.batch).toBe('b1');
    });

    it('空值参数被清掉（multi 里空串不计）', () => {
      const p = FE.parseQuery(LIB, 'terms=&terms=a');
      expect(p.state.dims.terms).toEqual(['a']);
    });
  });

  describe('URL 生成', () => {
    it('空状态只生成页签', () => {
      expect(FE.buildHash(LIB, 'artists', st())).toBe('#artists');
    });

    it('q 单独进 query', () => {
      expect(FE.buildHash(LIB, 'artists', st({ q: 'star' }))).toBe('#artists?q=star');
    });

    it('multi 维度逐个追加（组内任一体现在 URL 上）', () => {
      const h = FE.buildHash(LIB, 'artists', st({ dims: { terms: ['a', 'b'] } }));
      expect(h).toContain('terms=a');
      expect(h).toContain('terms=b');
    });

    it('bool 开启写 1，关闭不写', () => {
      expect(FE.buildHash(LIB, 'artists', st({ dims: { tested: true } }))).toContain('tested=1');
      expect(FE.buildHash(LIB, 'artists', st({ dims: { tested: false } }))).not.toContain('tested');
    });

    it('isEmpty 判定空/非空', () => {
      expect(FE.isEmpty(LIB, st())).toBe(true);
      expect(FE.isEmpty(LIB, st({ q: 'x' }))).toBe(false);
      expect(FE.isEmpty(LIB, st({ dims: { terms: ['a'] } }))).toBe(false);
      expect(FE.isEmpty(LIB, st({ dims: { tested: true } }))).toBe(false);
    });
  });

  describe('URL 往返', () => {
    it('状态 → hash → 状态 完全一致', () => {
      const s = st({ q: 'star', dims: { tested: true, terms: ['a', 'b'], colours: ['暖色'] } });
      const hash = FE.buildHash(LIB, 'artists', s);
      const back = FE.parseHash(LIB, hash);
      expect(back.tab).toBe('artists');
      expect(FE.sameState(back.state, s)).toBe(true);
    });

    it('往返后不产生被丢弃参数', () => {
      const s = st({ q: 'star', dims: { tested: true, terms: ['a'] } });
      const back = FE.parseHash(LIB, FE.buildHash(LIB, 'artists', s));
      expect(back.ignored).toEqual([]);
    });

    it('hash → 状态 → hash 稳定（幂等）', () => {
      const hash = FE.buildHash(LIB, 'artists', st({ q: 'star', dims: { terms: ['a', 'b'] } }));
      const again = FE.buildHash(LIB, 'artists', FE.parseHash(LIB, hash).state);
      expect(again).toBe(hash);
    });

    it('带被丢弃参数的 hash 往返后收敛成干净 hash', () => {
      const dirty = '#artists?q=star&zzz=1';
      const parsed = FE.parseHash(LIB, dirty);
      expect(parsed.ignored).toEqual(['zzz']);
      const clean = FE.buildHash(LIB, 'artists', parsed.state);
      expect(clean).toBe('#artists?q=star');
      expect(FE.parseHash(LIB, clean).ignored).toEqual([]);
    });
  });

  describe('引擎文件本身的约束', () => {
    it('浏览器端引擎文件存在且可独立加载（不依赖其他脚本）', () => {
      expect(fs.existsSync(ENGINE_FILE)).toBe(true);
      const ctx = makeCtx();
      expect(() =>
        vm.runInContext(fs.readFileSync(ENGINE_FILE, 'utf8'), ctx, { timeout: 5000 })
      ).not.toThrow();
    });

    it('引擎挂在 window 上（浏览器端可取用）', () => {
      const ctx = makeCtx();
      vm.runInContext(fs.readFileSync(ENGINE_FILE, 'utf8'), ctx, { timeout: 5000 });
      expect(typeof ctx.window.FILTER_ENGINE).toBe('object');
    });

    it('引擎是纯函数：不引用 DOM / window 内部 API', () => {
      const text = fs.readFileSync(ENGINE_FILE, 'utf8');
      expect(text).not.toMatch(/\bdocument\s*\./);
      expect(text).not.toMatch(/\blocation\s*\./);
    });
  });

  /* ── 多组维度（grouped multi，2026-11 风格与类型库）──────────────────
     分面词天然分多组（风格质量 / 主题 / 视觉效果…），而「组内任一、组间全部」
     要求：**同组多值取或，跨组取与**。
     这与「一个 multi 维度多值一律取或」是**两种不同语义** ——
     上游 Midlibrary 把 10 个组压平成一个 AND 池，实测三词只剩 37 条，
     本项目的分组语义是 160 条。

     维度可以声明 groupOf(value) → 组 id；未声明则退回原行为（全部取值取或），
     即**向后兼容**：艺术家侧的 terms 维度没有 groupOf，行为不变。 */
  describe('多组维度（groupOf 声明的 multi）', () => {
    /* 样例数据：3 个组，A 组有 a1/a2，B 组有 b1，C 组有 c1
       条目刻意覆盖「同组多值」「跨组组合」「只含一值」几种情形 */
    const GROUP_OF: Record<string, string> = { a1: 'A', a2: 'A', b1: 'B', c1: 'C' };
    const items = [
      { id: 'e1', terms: ['a1', 'b1'] },
      { id: 'e2', terms: ['a2', 'b1', 'c1'] },
      { id: 'e3', terms: ['a1'] },
      { id: 'e4', terms: ['c1'] },
      { id: 'e5', terms: [] },
    ];
    const src = FE.source('grouped', [
      { key: 'terms', type: 'multi', valuesOf: (x: any) => x.terms || [], groupOf: (v: string) => GROUP_OF[v] || '' },
    ]);
    const gst = (vals: string[]): State => ({ q: '', dims: { terms: vals } });

    it('未声明 groupOf 的维度行为不变（全部取值取或）—— 向后兼容', () => {
      // LIB.terms 没有 groupOf
      const hits = FE.filter(LIB, ARTISTS, st({ dims: { terms: ['风景', '街拍'] } }));
      expect(hits.map(a => a.name).sort()).toEqual(['川濑', '荒木']);
    });

    it('同组多值取或', () => {
      // a1 ∨ a2 → e1, e2, e3
      const hits = FE.filter(src, items, gst(['a1', 'a2']));
      expect(hits.map(x => x.id).sort()).toEqual(['e1', 'e2', 'e3']);
    });

    it('跨组多值取与', () => {
      // a1 ∧ b1 → 只有 e1
      const hits = FE.filter(src, items, gst(['a1', 'b1']));
      expect(hits.map(x => x.id)).toEqual(['e1']);
    });

    it('三词 = (同组并集) ∧ 跨组', () => {
      // (a1 ∨ a2) ∧ b1 → e1, e2
      const hits = FE.filter(src, items, gst(['a1', 'a2', 'b1']));
      expect(hits.map(x => x.id).sort()).toEqual(['e1', 'e2']);
    });

    it('分组语义 ≠ 平铺 AND（本项目更宽）', () => {
      const grouped = FE.filter(src, items, gst(['a1', 'a2', 'b1'])).length;
      const flat = items.filter(x => {
        const t = x.terms || [];
        return t.includes('a1') && t.includes('a2') && t.includes('b1');
      }).length;
      expect(grouped).toBeGreaterThan(flat);
    });

    it('同一组内三值仍是并集（不因组数变而收紧）', () => {
      const hits = FE.filter(src, items, gst(['a1', 'a2', 'b1', 'c1']));
      // (a1 ∨ a2) ∧ b1 ∧ c1 → e2
      expect(hits.map(x => x.id)).toEqual(['e2']);
    });

    it('空选中值不过滤', () => {
      expect(FE.filter(src, items, gst([]))).toHaveLength(items.length);
    });

    it('multiMatches 直接调用与 filter 结果一致', () => {
      const dim = FE.dimsOf(src).get('terms')!;
      expect(FE.multiMatches(dim, items[0], ['a1', 'a2'])).toBe(true);
      expect(FE.multiMatches(dim, items[0], ['a1', 'b1'])).toBe(true);
      expect(FE.multiMatches(dim, items[0], ['a1', 'c1'])).toBe(false);
    });

    it('未声明 groupOf 时 multiMatches 退回归或', () => {
      const dim = FE.dimsOf(LIB).get('terms')!;
      expect(FE.multiMatches(dim, ARTISTS[2], ['风景', '人像'])).toBe(true);
      expect(FE.multiMatches(dim, ARTISTS[3], ['风景', '人像'])).toBe(false);
    });

    /* 分组维度的计数口径：「把候选值加进它所属组后，整条筛选链的结果条数」 */
    it('分组维度 counts 用整链试算口径（不是简单计数）', () => {
      const c = FE.counts(src, items, gst([]), 'terms');
      // a1：加上 a1 后链上命中 e1, e3 → 2
      expect(c.get('a1')).toBe(2);
      // b1：加上 b1 后命中 e1, e2 → 2
      expect(c.get('b1')).toBe(2);
      // c1：加上 c1 后命中 e2, e4 → 2
      expect(c.get('c1')).toBe(2);
    });

    it('分组维度 counts 在已有跨组选中时反映整链结果', () => {
      // 已选 b1（B 组），再把候选值 a1 加进 A 组 → 整链 = A 组{a1} ∧ B 组{b1}
      // e1 有 a1+b1 → 命中；e2 有 a2+b1+c1，A 组要的是 a1（不是 a2）→ 不命中
      // 所以计数是 1。这条断言守的是「加进去的是**该候选值**，不是它整组的所有兄弟值」。
      const c = FE.counts(src, items, gst(['b1']), 'terms');
      expect(c.get('a1')).toBe(1);
      // 反证：若把 a2 也加进 A 组，e2 才命中 → 2
      const c2 = FE.counts(src, items, gst(['b1', 'a2']), 'terms');
      expect(c2.get('a1')).toBe(2);
    });

    it('分组维度 counts 不修改传入的状态', () => {
      const s = gst(['b1']);
      FE.counts(src, items, s, 'terms');
      expect(s.dims.terms).toEqual(['b1']);
    });

    it('URL 往返：多组维度的选中值能原样复现', () => {
      const s = gst(['a1', 'a2', 'b1']);
      const hash = FE.buildHash(src, 'style-types', s);
      expect(hash).toContain('terms=a1');
      expect(hash).toContain('terms=a2');
      expect(hash).toContain('terms=b1');
      const back = FE.parseHash(src, hash);
      expect(back.state.dims.terms).toEqual(['a1', 'a2', 'b1']);
      expect(FE.sameState(back.state, s)).toBe(true);
    });
  });
});
