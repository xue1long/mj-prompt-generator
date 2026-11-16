/**
 * 资料库烘焙（ADR-0030）：把 data/materials/items/*.json 变成前端内联数据 JS。
 *
 * 与 build-webui-data.mjs 刻意分开，理由（写进 ADR-0030）：
 *   · 后者 :59-61 强制三份 config 齐全，:244/:256 按 jobs/entries 二分硬编码，
 *     :262 要求 total>0 —— 契约是「构建期全量校验、不杜撰」。
 *   · 资料库是用户数据：允许为空、目录可以不存在、每次编辑都要增量跑。
 *     把它塞进那个脚本会污染它的守门语义。代价只有约 10 行 render 模板重复。
 *
 * 输入（真相源，入库）：data/materials/items/<id>.json、public/materials/*.webp
 * 输出（生成物，勿手改）：webui/js/data-materials.js
 * 用法：npm run build:materials / node scripts/build-materials-data.mjs --dry-run
 *
 * 原则：不杜撰。缺字段置空；引用了不存在的图片是硬错误（宁可构建失败，不要页面裂图）。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MATERIALS_ROOT = path.join(ROOT, 'data', 'materials');
export const ITEMS_DIR = path.join(MATERIALS_ROOT, 'items');
export const IMAGES_DIR = path.join(ROOT, 'public', 'materials');
export const OUT_FILE = path.join(ROOT, 'webui', 'js', 'data-materials.js');
export const IMAGE_BASE = '../public/materials/';
export const SCHEMA_VERSION = 1;

export function validId(id) {
  return /^[A-Za-z0-9_-]+$/.test(String(id ?? ''));
}
export function validImageName(name) {
  return /^[A-Za-z0-9_-]+\.webp$/.test(String(name ?? ''));
}
export function imagePath(name) {
  if (!validImageName(name)) throw new Error(`非法图片文件名：${name}`);
  return path.join(IMAGES_DIR, name);
}

/** 读全部条目。目录不存在 = 空库（合法初始态，不报错）。墓碑优先于条目。 */
export function readItems({ strict = true } = {}) {
  if (!fs.existsSync(ITEMS_DIR)) return [];
  const tombstones = new Set();
  const rows = [];
  for (const file of fs.readdirSync(ITEMS_DIR).sort()) {
    if (!file.endsWith('.json')) continue;
    const abs = path.join(ITEMS_DIR, file);
    let row;
    try {
      row = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      throw new Error(`条目文件解析失败 ${file}：${err.message}`);
    }
    if (file.endsWith('.deleted.json')) {
      tombstones.add(String(row && row.id));
      continue;
    }
    rows.push({ file, row });
  }

  const items = [];
  const seen = new Set();
  for (const { file, row } of rows) {
    const id = String((row && row.id) ?? '');
    if (tombstones.has(id)) continue;
    if (strict) {
      if (!validId(id)) throw new Error(`${file}：id 非法（只允许字母数字 _ -）`);
      if (seen.has(id)) throw new Error(`条目 id 重复：${id}`);
      if (!String(row.prompt ?? '').trim()) throw new Error(`${file}：prompt 为空`);
      if (!Array.isArray(row.images)) throw new Error(`${file}：images 必须是数组`);
      for (const name of row.images) {
        if (!validImageName(name)) throw new Error(`${file}：图片文件名非法 ${name}`);
      }
      if (row.schemaVersion !== undefined && row.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(`${file}：schemaVersion ${row.schemaVersion} 不受支持`);
      }
    }
    seen.add(id);
    items.push({
      id,
      prompt: String(row.prompt ?? ''),
      images: [...row.images],
      originalNames: Array.isArray(row.originalNames) ? row.originalNames.map(String) : [],
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      author: String(row.author ?? ''),
      note: String(row.note ?? ''),
      source: String(row.source ?? 'manual'),
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
      schemaVersion: SCHEMA_VERSION,
    });
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

function safeJson(v) {
  return JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function renderData(items) {
  const banner = [
    '// 生成物 —— 请勿手改。',
    '// 由 scripts/build-materials-data.mjs 从 data/materials/items/*.json 烘焙（npm run build:materials）。',
    '// 真相源是项目文件；file:// 下只读，编辑请运行 npm run dev。',
    `// 生成时间：${new Date().toISOString()}`,
    '',
  ].join('\n');
  const source = {
    generatedAt: new Date().toISOString(),
    total: items.length,
    withImages: items.filter((it) => it.images.length > 0).length,
    imageBase: IMAGE_BASE,
    schemaVersion: SCHEMA_VERSION,
  };
  return banner
    + `const MATERIALS_SOURCE = ${safeJson(source)};\n`
    + `const MATERIALS_ITEMS = ${safeJson(items)};\n`;
}

/** 两阶段：先全部校验通过，再一次性落盘。失败绝不写坏产物。 */
export function rebuild({ dryRun = false, log = console.log } = {}) {
  const items = readItems();
  const missing = [];
  for (const it of items) {
    for (const name of it.images) {
      if (!fs.existsSync(imagePath(name))) missing.push(`${it.id}:${name}`);
    }
  }
  if (missing.length) {
    throw new Error(`资料库有 ${missing.length} 个图片文件不存在，例如 ${missing.slice(0, 3).join(', ')}`);
  }
  const text = renderData(items);
  new vm.Script(text, { filename: 'data-materials.js' }); // 语法自检
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(text + '\n;({n:MATERIALS_ITEMS.length,base:MATERIALS_SOURCE.imageBase})', ctx, { timeout: 5000 });
  if (!dryRun) fs.writeFileSync(OUT_FILE, text, 'utf8');
  log(`[build-materials-data] ${items.length} 条 / 有配图 ${items.filter((it) => it.images.length).length} 条`
    + `${dryRun ? '（dry-run，未写文件）' : ` → webui/js/data-materials.js`}`);
  return { total: items.length, text, items };
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    rebuild({ dryRun: process.argv.includes('--dry-run') });
  } catch (err) {
    console.error('[build-materials-data] ' + err.message);
    process.exit(1);
  }
}
