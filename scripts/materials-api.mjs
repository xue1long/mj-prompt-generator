/**
 * 资料库写侧（ADR-0030）：落盘 → 原子写 → 烘焙，以及 /api/materials 的 HTTP handler。
 *
 * 被 serve-webui.mjs（HTTP）与 scripts/import-materials.mjs（CLI）**共用同一份实现**，
 * 不允许出现第二套落盘逻辑。读侧是构建期产物 webui/js/data-materials.js，不走这里。
 *
 * 安全边界：只绑 127.0.0.1；Origin 白名单；20MB 体上限；字段白名单；
 * 客户端给的文件名/路径一律不采信（服务端生成 <itemId>_<n>.webp）；
 * 所有落盘路径 path.resolve 后校验仍在目标目录内。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, ITEMS_DIR, IMAGES_DIR, MATERIALS_ROOT, SCHEMA_VERSION,
  validId, validImageName, imagePath, readItems, rebuild,
} from './build-materials-data.mjs';

const LOGS_DIR = path.join(ROOT, 'logs', 'materials');
const MAX_BODY = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/* sharp 只在真的上传图片时懒加载 —— 没装它也不该拖垮整个 dev 服务。 */
let sharpPromise;
async function getSharp() {
  if (!sharpPromise) {
    sharpPromise = import('sharp').then((mod) => mod.default || mod).catch(() => {
      throw new Error('图片压缩需要 sharp，请在项目根执行 npm install');
    });
  }
  return sharpPromise;
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function originAllowed(req, port) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / node fetch 等非浏览器客户端
  return typeof origin === 'string'
    && (origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { tooLarge = true; continue; } // 继续消费，避免挂起
    chunks.push(chunk);
  }
  if (tooLarge) return { tooLarge: true };
  return { text: Buffer.concat(chunks).toString('utf8') };
}

async function jsonBody(req, res) {
  const body = await readBody(req);
  if (body.tooLarge) { sendJson(res, 413, { ok: false, error: '请求体超过 20MB 上限' }); return null; }
  let payload;
  try { payload = JSON.parse(body.text); }
  catch { sendJson(res, 400, { ok: false, error: 'JSON 解析失败' }); return null; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    sendJson(res, 400, { ok: false, error: '请求体必须是 JSON 对象' });
    return null;
  }
  return payload;
}

/* ── 落盘原语 ───────────────────────────────────────────────────────── */

function inside(dir, abs) {
  return abs === dir || abs.startsWith(dir + path.sep);
}
function assertInside(abs, dir, what) {
  if (!inside(path.resolve(dir), path.resolve(abs))) throw new Error(`${what} 越界：${abs}`);
}

/** 临时文件 + rename：单文件原子写，Windows 下 rename 会覆盖同名目标。 */
function atomicWrite(abs, content) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, abs);
}

function backup(text, label) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = path.join(LOGS_DIR, `${stamp}-${label}.bak`);
  fs.writeFileSync(bak, text, 'utf8');
  return bak;
}

function itemFile(id) {
  if (!validId(id)) throw new Error('非法条目 id');
  const abs = path.join(ITEMS_DIR, `${id}.json`);
  assertInside(abs, ITEMS_DIR, '条目文件');
  return abs;
}
function newId() {
  return `mat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function normalizeTags(tags) {
  const raw = Array.isArray(tags) ? tags : String(tags ?? '').split(/[,，;；\s]+/);
  return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
}
function normalizeImageNames(names) {
  const raw = Array.isArray(names) ? names : String(names ?? '').split(/[|,，;；]/);
  return raw.map((n) => String(n ?? '').split(/[\\/]/).pop().trim()).filter(Boolean).sort();
}
/** 与前端 materials-api.js 的 dedupeKey 同一口径（Q11）：规范化提示词 + 图片名集合。 */
export function dedupeKey(entry) {
  return `${normalizeText(entry && entry.prompt)}\u0000${normalizeImageNames(entry && entry.images).join('\u0001')}`;
}

/** 字段白名单 + 类型收敛。客户端传的 id / images 里的路径一律不采信。 */
export function shape(input, base = {}) {
  const out = {
    id: String(base.id || newId()),
    prompt: String(input.prompt ?? base.prompt ?? '').trim(),
    images: base.images ? [...base.images] : [],
    originalNames: base.originalNames ? [...base.originalNames] : [],
    tags: normalizeTags(input.tags ?? base.tags ?? []),
    author: String(input.author ?? base.author ?? '').trim(),
    // 备注是多行文本（WebUI 用 textarea，CLI 清单也会带换行）：统一成 LF，便于 git 里逐行 diff。
    note: String(input.note ?? base.note ?? '').replace(/\r\n?/g, '\n').trim(),
    source: ['batch', 'manual', 'backfill'].includes(String(input.source ?? base.source)) ? String(input.source ?? base.source) : 'manual',
    createdAt: Number(base.createdAt) || Date.now(),
    updatedAt: Date.now(),
    schemaVersion: SCHEMA_VERSION,
  };
  if (!out.prompt) throw new Error('prompt 不能为空');
  for (const k of ['tags', 'author', 'source']) {
    if (/[\r\n\u0000]/.test(String(out[k]))) throw new Error(`字段 ${k} 含非法字符`);
  }
  // note 允许换行（textarea 契约），只拦 NUL。
  if (/\u0000/.test(out.note)) throw new Error('字段 note 含非法字符');
  return out;
}

/* ── 对外的写入函数（HTTP 与 CLI 共用） ─────────────────────────────── */

export function listItems() { return readItems(); }

/** 新建或更新一条。返回 { item, items, needRebuild }。 */
export function saveItem(input) {
  const id = String(input.id ?? '');
  let base = {};
  if (id) {
    const abs = itemFile(id);
    if (!fs.existsSync(abs)) throw new Error(`条目不存在：${id}`);
    base = JSON.parse(fs.readFileSync(abs, 'utf8'));
  }
  const item = shape(input, base);

  // 不做隐式去重：Q11 判据用的是「原始图片文件名」，而落盘后的文件名由本模块生成，
  // 两者不是同一个集合。去重统一由导入侧（GUI addEntries / CLI）用 Q11 判据完成，
  // 避免服务端与前端出现两套口径。dedupeKey 仍导出给 CLI 使用。

  const abs = itemFile(item.id);
  const original = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  if (original) backup(original, item.id);
  for (const name of item.images) {
    if (!validImageName(name)) throw new Error(`图片文件名非法：${name}`);
    assertInside(imagePath(name), IMAGES_DIR, '配图');
  }
  atomicWrite(abs, JSON.stringify(item, null, 2) + '\n');

  let needRebuild = false;
  let rebuildError = '';
  try { rebuild({ log: () => {} }); }
  catch (err) { needRebuild = true; rebuildError = err.message; }
  return { item, items: readItems(), needRebuild, rebuildError };
}

/** 删除：写墓碑 → 删条目 → 删配图 → 烘焙。墓碑优先，防多设备「A 删 B 改」复活。 */
export function removeItem(id) {
  const abs = itemFile(id);
  if (!fs.existsSync(abs)) throw new Error(`条目不存在：${id}`);
  const item = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const tomb = path.join(ITEMS_DIR, `${id}.deleted.json`);
  atomicWrite(tomb, JSON.stringify({ id, deletedAt: Date.now() }, null, 2) + '\n');
  fs.rmSync(abs, { force: true });
  for (const name of item.images || []) {
    if (validImageName(name)) fs.rmSync(imagePath(name), { force: true });
  }
  let needRebuild = false;
  try { rebuild({ log: () => {} }); }
  catch { needRebuild = true; }
  return { id, items: readItems(), needRebuild };
}

/** 从条目里移除一张图（不改其他字段），随后删物理文件。 */
export function removeImage(id, name) {
  const abs = itemFile(id);
  if (!fs.existsSync(abs)) throw new Error(`条目不存在：${id}`);
  if (!validImageName(name)) throw new Error('非法图片文件名');
  const item = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const i = (item.images || []).indexOf(name);
  if (i === -1) return { item, items: readItems() };
  item.images.splice(i, 1);
  if (Array.isArray(item.originalNames) && item.originalNames.length > i) item.originalNames.splice(i, 1);
  item.updatedAt = Date.now();
  atomicWrite(abs, JSON.stringify(item, null, 2) + '\n');
  fs.rmSync(imagePath(name), { force: true });
  let needRebuild = false;
  try { rebuild({ log: () => {} }); }
  catch { needRebuild = true; }
  return { item, items: readItems(), needRebuild };
}

/** 服务端生成文件名：忽略客户端给的原始名，只把它记进 originalNames 供展示。 */
function nextImageName(itemId) {
  const prefix = `${itemId}_`; // id 已由 validId 限为 [A-Za-z0-9_-]，无正则元字符
  let max = 0;
  if (fs.existsSync(IMAGES_DIR)) {
    const re = new RegExp('^' + prefix + '(\\d+)\\.webp$');
    for (const f of fs.readdirSync(IMAGES_DIR)) {
      const m = re.exec(f);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `${prefix}${max + 1}.webp`;
}

/** input 可以是 Buffer（CLI）或 data: URL（HTTP）；统一压成 640px / q80 webp。 */
export async function saveImage({ itemId, name, input }) {
  if (!validId(itemId)) throw new Error('非法条目 id');
  let buffer = input;
  if (typeof input === 'string') {
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(input);
    if (!m) throw new Error('只接受 data:image/(png|jpeg|webp);base64, 图片');
    buffer = Buffer.from(m[2], 'base64');
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('图片内容为空');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('单张图片超过 12MB');
  const sharp = await getSharp();
  const out = await sharp(buffer)
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const file = nextImageName(itemId);
  const abs = imagePath(file);
  assertInside(abs, IMAGES_DIR, '配图');
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  atomicWrite(abs, out);
  return { file, originalName: String(name ?? '').split(/[\\/]/).pop() || 'image' };
}

/** 把图片挂到条目上（同时记录原始文件名），再烘焙。 */
export function attachImage(itemId, file, originalName) {
  const abs = itemFile(itemId);
  if (!fs.existsSync(abs)) throw new Error(`条目不存在：${itemId}`);
  if (!validImageName(file)) throw new Error('非法图片文件名');
  const item = JSON.parse(fs.readFileSync(abs, 'utf8'));
  item.images = [...(item.images || []), file];
  item.originalNames = [...(item.originalNames || []), originalName || file];
  item.updatedAt = Date.now();
  atomicWrite(abs, JSON.stringify(item, null, 2) + '\n');
  let needRebuild = false;
  try { rebuild({ log: () => {} }); }
  catch { needRebuild = true; }
  return { item, items: readItems(), needRebuild };
}

export function rebuildNow() {
  return rebuild({ log: () => {} });
}

/* ── HTTP handler ───────────────────────────────────────────────────── */

function replyWrite(res, result, okStatus = 200) {
  if (result.needRebuild) {
    sendJson(res, 202, { ok: false, needRebuild: true, error: '已落盘但烘焙失败，请点「重新烘焙」', items: result.items });
    return;
  }
  sendJson(res, okStatus, { ok: true, ...result });
}

export async function handleMaterials(req, res, { port, useDist = false } = {}) {
  if (!originAllowed(req, port)) { sendJson(res, 403, { ok: false, error: 'Origin 不被允许' }); return; }
  let pathname;
  try { pathname = new URL(req.url, 'http://127.0.0.1').pathname; }
  catch { sendJson(res, 400, { ok: false, error: 'URL 非法' }); return; }

  if (pathname === '/api/materials' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, editable: !useDist, total: listItems().length, version: SCHEMA_VERSION });
    return;
  }
  // preview(--dist) 服务的是复制产物：烘焙只写 webui/js/，开放写会造成「盘上已更新、页面没变」。
  if (useDist) {
    sendJson(res, 403, { ok: false, error: 'preview 模式只读，编辑请运行 npm run dev' });
    return;
  }

  if (pathname === '/api/materials/rebuild' && req.method === 'POST') {
    try { sendJson(res, 200, { ok: true, ...rebuildNow(), items: listItems() }); }
    catch (err) { sendJson(res, 500, { ok: false, error: '烘焙失败：' + err.message }); }
    return;
  }

  if (pathname === '/api/materials/images' && req.method === 'POST') {
    const payload = await jsonBody(req, res);
    if (!payload) return;
    try {
      const r = await saveImage({ itemId: payload.itemId, name: payload.name, input: payload.dataUrl });
      // 一步到位：压缩落盘 + 挂到条目 + 烘焙，避免「图在盘上、条目没引用」的中间态。
      const attached = attachImage(payload.itemId, r.file, r.originalName);
      replyWrite(res, { ...attached, file: r.file, originalName: r.originalName });
    } catch (err) { sendJson(res, 400, { ok: false, error: err.message }); }
    return;
  }

  if (pathname === '/api/materials/items' && req.method === 'POST') {
    const payload = await jsonBody(req, res);
    if (!payload) return;
    try {
      const r = saveItem(payload.item && typeof payload.item === 'object' ? payload.item : payload);
      replyWrite(res, r);
    } catch (err) { sendJson(res, 400, { ok: false, error: err.message }); }
    return;
  }

  const imgMatch = /^\/api\/materials\/items\/([A-Za-z0-9_-]+)\/images\/([A-Za-z0-9_-]+\.webp)$/.exec(pathname);
  if (imgMatch && req.method === 'DELETE') {
    try { replyWrite(res, removeImage(imgMatch[1], imgMatch[2])); }
    catch (err) { sendJson(res, 400, { ok: false, error: err.message }); }
    return;
  }

  const m = /^\/api\/materials\/items\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (m && (req.method === 'PUT' || req.method === 'DELETE')) {
    const id = m[1];
    if (req.method === 'PUT') {
      const payload = await jsonBody(req, res);
      if (!payload) return;
      try { replyWrite(res, saveItem({ ...(payload.item && typeof payload.item === 'object' ? payload.item : payload), id })); }
      catch (err) { sendJson(res, 400, { ok: false, error: err.message }); }
      return;
    }
    try { replyWrite(res, removeItem(id)); }
    catch (err) { sendJson(res, 400, { ok: false, error: err.message }); }
    return;
  }

  sendJson(res, 405, { ok: false, error: '方法或路径不允许' });
}

/** CLI 与单测用来确保目录存在。 */
export function ensureDirs() {
  fs.mkdirSync(MATERIALS_ROOT, { recursive: true });
  fs.mkdirSync(ITEMS_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
