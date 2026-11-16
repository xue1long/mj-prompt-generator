import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 资料库（ADR-0030 落盘改造）的单元测试。
 *
 * 守**纯逻辑与结构契约**（去重判据、清单解析、筛选维度声明、导出内容口径、
 * 烘焙产物形状）；真实落盘与 HTTP 写入由 scripts/verify-webui.mjs 第 12 组在真浏览器里守。
 * 不为测试引入 fake-indexeddb / 网络桩 —— 项目要求纯离线可构建。
 *
 * 浏览器端源码用 vm 加载同一份文件，烘焙脚本直接 import，都不复刻算法。
 */

const ROOT = path.resolve(__dirname, '..');
const STORE_FILE = path.join(ROOT, 'webui/js/materials-api.js');
const VIEW_FILE = path.join(ROOT, 'webui/js/materials-view.js');

function loadStore(): Record<string, any> {
  const ctx: Record<string, unknown> = {
    MATERIALS_ITEMS: [],
    MATERIALS_SOURCE: { imageBase: '../public/materials/', total: 0 },
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(STORE_FILE, 'utf8') + '\n;globalThis.__S = MATERIALS_API;',
    ctx, { timeout: 5000 });
  return ctx.__S as Record<string, any>;
}

function loadView() {
  const S = loadStore();
  const ctx: Record<string, unknown> = {
    FILTER_ENGINE: {
      source: (id: string, dims: unknown[]) => ({ id, dims }),
      filter: (_src: unknown, items: unknown[]) => items,
    },
    MATERIALS_API: S,
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(VIEW_FILE, 'utf8') + '\n;globalThis.__V = MATERIALS_VIEW;',
    ctx, { timeout: 5000 });
  return { V: ctx.__V as Record<string, any>, S, ctx };
}

/** 给导出函数提供最小 DOM / Blob / URL 桩，捕获下载下来的文本。 */
function withDownloadStubs(ctx: Record<string, unknown>) {
  const captured: string[] = [];
  ctx.document = {
    createElement: () => ({ style: {}, href: '', download: '', click() {}, remove() {} }),
    body: { appendChild() {} },
  };
  ctx.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };
  ctx.Blob = class {
    constructor(parts: unknown[]) { captured.push(String(parts[0])); }
  };
  ctx.setTimeout = () => 0;
  return captured;
}

const SAMPLE_ITEM = {
  id: 'mat-1',
  prompt: 'a quiet street after rain, cinematic lighting',
  imageIds: ['img-1'],
  imageNames: ['a.webp'],
  source: 'batch',
  tags: ['夜景'],
  author: 'olia',
  note: '待补第二张图',
  createdAt: new Date(2026, 10, 13, 12).getTime(),
  updatedAt: new Date(2026, 10, 13, 12).getTime(),
};

describe('资料库 · 数据层结构契约', () => {
  it('真相源是项目文件：前端不再用 IndexedDB，也不生成 blob: URL', () => {
    const text = fs.readFileSync(STORE_FILE, 'utf8');
    expect(text).not.toContain('indexedDB.open');
    expect(text).not.toContain('createObjectURL');
    expect(text).toContain('MATERIALS_ITEMS');
    expect(text).toContain('/api/materials');
    expect(fs.readFileSync(VIEW_FILE, 'utf8')).not.toContain('blob: URL');
  });

  it('两份源码都能独立加载，不依赖 DOM', () => {
    expect(() => loadStore()).not.toThrow();
    expect(() => loadView()).not.toThrow();
  });

  it('未探测时默认只读，配图路径走唯一命名空间', () => {
    const S = loadStore();
    expect(S.status().editable).toBe(false);
    expect(S.imageUrl('mat_1_1.webp')).toBe('../public/materials/mat_1_1.webp');
  });

  it('研究笔记的存储层零改动', () => {
    const research = fs.readFileSync(path.join(ROOT, 'webui/js/research-store.js'), 'utf8');
    expect(research).toContain('DB_VERSION = 1');
    expect(research).toContain("DB_NAME = 'mj-research'");
  });
});

describe('资料库 · 去重判据', () => {
  it('同一提示词 + 同一图片文件名（不同本机路径）判为重复', () => {
    const S = loadStore();
    const a = S.dedupeKey({ prompt: '  Hello   World ', images: ['C:/pics/a.webp'] });
    const b = S.dedupeKey({ prompt: 'hello world', images: ['/home/me/a.webp'] });
    expect(a).toBe(b);
  });

  it('提示词相同但图片不同 → 不是重复；无图与有图也不是重复', () => {
    const S = loadStore();
    expect(S.dedupeKey({ prompt: 'x', images: [] }))
      .not.toBe(S.dedupeKey({ prompt: 'x', images: ['a.webp'] }));
    expect(S.dedupeKey({ prompt: 'x', images: ['a.webp'] }))
      .not.toBe(S.dedupeKey({ prompt: 'x', images: ['b.webp'] }));
  });

  it('纯文本条目之间可判重；图片顺序不影响结果', () => {
    const S = loadStore();
    expect(S.dedupeKey({ prompt: 'text only', images: [] }))
      .toBe(S.dedupeKey({ prompt: 'TEXT  only', images: [] }));
    expect(S.dedupeKey({ prompt: 'p', images: ['b.webp', 'a.webp'] }))
      .toBe(S.dedupeKey({ prompt: 'p', images: ['a.webp', 'b.webp'] }));
  });

  it('normalizeTags 支持数组、逗号串与中文标点', () => {
    const S = loadStore();
    expect(S.normalizeTags([' 夜景 ', '雨'])).toEqual(['夜景', '雨']);
    expect(S.normalizeTags('夜景，雨; 街景')).toEqual(['夜景', '雨', '街景']);
    expect(S.normalizeTags('夜景,夜景')).toEqual(['夜景']);
  });
});

describe('资料库 · 清单解析', () => {
  it('JSON 清单：路径取 basename，字段归一化', () => {
    const { V } = loadView();
    const rows = V.parseManifest(JSON.stringify([
      { prompt: 'first', images: ['C:/pics/b.webp'], tags: '夜景, 雨' },
      { 提示词: 'second', 图片: 'a.webp', 作者: 'olia' },
    ]), 'list.json');
    expect(rows).toHaveLength(2);
    expect(rows[0].images).toEqual(['b.webp']);
    expect(rows[0].tags).toEqual(['夜景', '雨']);
    expect(rows[1].prompt).toBe('second');
    expect(rows[1].images).toEqual(['a.webp']);
    expect(rows[1].author).toBe('olia');
  });

  it('JSON 也接受 { items: [...] } 包裹', () => {
    const { V } = loadView();
    expect(V.parseManifest(JSON.stringify({ items: [{ prompt: 'x' }] }), 'l.json')).toHaveLength(1);
  });

  it('CSV：引号内逗号不被拆列，images / tags 用竖线分隔', () => {
    const { V } = loadView();
    const rows = V.parseManifest(
      'prompt,images,tags\n"a, b",x.webp|y.webp,夜景\nsecond,,雨\n', 'list.csv');
    expect(rows).toHaveLength(2);
    expect(rows[0].prompt).toBe('a, b');
    expect(rows[0].images).toEqual(['x.webp', 'y.webp']);
    expect(rows[1].images).toEqual([]);
  });

  it('Markdown：一行一条，紧随的图片行挂到上一条', () => {
    const { V } = loadView();
    const rows = V.parseManifest('- first\n  - 图片：b.webp, a.webp\n- second\n', 'list.md');
    expect(rows).toHaveLength(2);
    expect(rows[0].prompt).toBe('first');
    expect(rows[0].images).toEqual(['a.webp', 'b.webp']);
    expect(rows[1].images).toEqual([]);
  });

  it('空提示词的行被丢弃', () => {
    const { V } = loadView();
    expect(V.parseManifest('[{"prompt":"  "},{"prompt":"ok"}]', 'l.json')).toHaveLength(1);
  });
});

describe('资料库 · 筛选维度与状态', () => {
  it('声明 5 个维度，URL 白名单由此确定', () => {
    const { V } = loadView();
    expect(V.source().dims.map((d: any) => d.key))
      .toEqual(['q', 'hasImage', 'source', 'tags', 'date']);
    expect(V.source().dims.map((d: any) => d.type))
      .toEqual(['q', 'bool', 'enum', 'multi', 'enum']);
  });

  it('stateFromDims / dims 往返不丢多选值', () => {
    const { V } = loadView();
    V.stateFromDims({ q: 'rain', hasImage: true, source: 'batch', tags: ['夜景', '雨'], date: '2026-11-13' });
    expect(V.dims()).toEqual({
      q: 'rain', hasImage: true, source: 'batch', tags: ['夜景', '雨'], date: '2026-11-13',
    });
  });

  it('收录日按本地日期格式化', () => {
    const { V } = loadView();
    expect(V.dayOf(new Date(2026, 10, 13, 12).getTime())).toBe('2026-11-13');
    expect(V.dayOf(0)).toBe('');
  });
});

describe('资料库 · 导出内容口径', () => {
  it('JSON 导出带条目 id 与图片文件名，不含二进制与 blob: URL', () => {
    const { V, ctx } = loadView();
    const captured = withDownloadStubs(ctx);
    V.ui.items = [SAMPLE_ITEM];
    V.exportJson();
    const text = captured[0] || '';
    const payload = JSON.parse(text);
    expect(payload.source).toContain('资料库');
    expect(payload.count).toBe(1);
    expect(payload.items[0].id).toBe('mat-1');
    expect(payload.items[0].images).toEqual(['a.webp']);
    expect(text).not.toContain('blob:');
    expect(text).not.toContain('imageIds');
  });

  it('Markdown 导出带 id、提示词正文与图片文件名', () => {
    const { V, ctx } = loadView();
    const captured = withDownloadStubs(ctx);
    V.ui.items = [SAMPLE_ITEM];
    V.exportMarkdown();
    const text = captured[0] || '';
    expect(text).toContain('# 资料库导出');
    expect(text).toContain('mat-1');
    expect(text).toContain('a quiet street after rain');
    expect(text).toContain('a.webp');
    expect(text).not.toContain('blob:');
  });

  it('导出的是筛选命中全量（引擎返回几条就写几条）', () => {
    const { V, ctx } = loadView();
    const captured = withDownloadStubs(ctx);
    V.ui.items = [SAMPLE_ITEM, { ...SAMPLE_ITEM, id: 'mat-2' }, { ...SAMPLE_ITEM, id: 'mat-3' }];
    V.exportJson();
    expect(JSON.parse(captured[0]).count).toBe(3);
  });
});

describe('资料库 · 烘焙契约（ADR-0030）', () => {
  it('空库是合法初始态：产物仍有两个全局常量与唯一图片前缀', async () => {
    const mod = await import('../scripts/build-materials-data.mjs');
    const text = mod.renderData([]);
    expect(text).toContain('const MATERIALS_ITEMS = [];');
    expect(text).toContain('const MATERIALS_SOURCE = ');
    expect(text).toContain('../public/materials/');
  });

  it('id 与图片文件名白名单拒绝路径穿越', async () => {
    const mod = await import('../scripts/build-materials-data.mjs');
    expect(mod.validId('mat_abc_1')).toBe(true);
    expect(mod.validId('../evil')).toBe(false);
    expect(mod.validId('a/b')).toBe(false);
    expect(mod.validImageName('mat_abc_1.webp')).toBe(true);
    expect(mod.validImageName('../../x.png')).toBe(false);
  });

  it('视图形状把 images[] 映射成 imageIds[] / imageNames[]', () => {
    const S = loadStore();
    const shaped = S.viewShape({
      id: 'mat_x', prompt: 'p', images: ['mat_x_1.webp'], originalNames: ['origin.png'],
    });
    expect(shaped.imageIds).toEqual(['mat_x_1.webp']);
    expect(shaped.imageNames).toEqual(['origin.png']);
  });
});

describe('资料库 · 字段白名单（服务端 shape）', () => {
  it('备注是多行字段：保留换行，CRLF 统一成 LF', async () => {
    const { shape } = await import('../scripts/materials-api.mjs');
    const out = shape({ prompt: 'p', note: '来源：a\r\n分类：TEXT_ONLY\r续行' });
    expect(out.note).toBe('来源：a\n分类：TEXT_ONLY\n续行');
  });

  it('单行字段仍拒绝换行，note 只拦 NUL', async () => {
    const { shape } = await import('../scripts/materials-api.mjs');
    expect(() => shape({ prompt: 'p', author: 'a\nb' })).toThrow(/字段 author 含非法字符/);
    expect(() => shape({ prompt: 'p', tags: ['x\ny'] })).toThrow(/字段 tags 含非法字符/);
    expect(() => shape({ prompt: 'p', note: 'a\u0000b' })).toThrow(/字段 note 含非法字符/);
  });

  it('prompt 不能为空；images 不采信客户端传值', async () => {
    const { shape } = await import('../scripts/materials-api.mjs');
    expect(() => shape({ prompt: '   ' })).toThrow(/prompt 不能为空/);
    const out = shape({ prompt: 'p', images: ['../../etc/passwd'] });
    expect(out.images).toEqual([]);
  });
});
