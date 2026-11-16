/**
 * 静态 WebUI 本地服务器（ADR-0017）。
 *
 * Node 内置 http，零新依赖。默认直接服务 webui/ 源码，加 --dist 则服务构建产物。
 *   npm run dev                         → http://127.0.0.1:5173/
 *   npm run preview                     → 同一服务的 --dist 版本
 *   node scripts/serve-webui.mjs --port=8080 --dist
 *
 * 只绑定 127.0.0.1；路径做规范化 + 前缀校验，拒绝目录穿越。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleMaterials } from './materials-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portArg = args.find((a) => a.startsWith('--port='));
const port = Number(portArg ? portArg.slice('--port='.length) : process.env.PORT || 5173);
const useDist = args.includes('--dist');
const WEB_ROOT = path.join(ROOT, useDist ? 'dist' : 'webui');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(WEB_ROOT)) {
  console.error(`[serve-webui] 目录不存在：${WEB_ROOT}${useDist ? '\n请先运行 npm run build' : ''}`);
  process.exit(1);
}

// ── /api/settings：受限配置读写 ────────────────────────────────────────
// 沿用 127.0.0.1 绑定（见下方 listen）；仅放行本机 / localhost 的浏览器来源，
// 非浏览器客户端（curl / node fetch 等无 Origin）也允许。绝不回显 key 明文。
const ENV_PATH = path.join(ROOT, '.env');
const LOGS_DIR = path.join(ROOT, 'logs');
const SETTINGS_FIELDS = {
  baseUrl: 'MJ_DECOMPOSE_BASE_URL',
  model: 'MJ_DECOMPOSE_MODEL',
  apiKey: 'MJ_DECOMPOSE_API_KEY',
};
const MAX_SETTINGS_BODY = 8 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function parseEnvValues(text) {
  const values = { baseUrl: '', model: '', apiKey: '' };
  for (const line of text.split('\n')) {
    for (const field of Object.keys(SETTINGS_FIELDS)) {
      const prefix = SETTINGS_FIELDS[field] + '=';
      if (line.startsWith(prefix)) values[field] = line.slice(prefix.length);
    }
  }
  return values;
}

function configuredFrom(values) {
  return {
    baseUrl: values.baseUrl.trim().length > 0,
    model: values.model.trim().length > 0,
    apiKey: values.apiKey.trim().length > 0,
  };
}

// 只替换白名单三键对应的行，其余（注释、CONCURRENCY、TIMEOUT_MS 等）一字不动。
function applyEnvUpdates(text, updates) {
  return text.split('\n').map((line) => {
    for (const field of Object.keys(SETTINGS_FIELDS)) {
      const prefix = SETTINGS_FIELDS[field] + '=';
      if (Object.prototype.hasOwnProperty.call(updates, field) && line.startsWith(prefix)) {
        return prefix + updates[field];
      }
    }
    return line;
  }).join('\n');
}

function backupEnv(text) {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = path.join(LOGS_DIR, `env-${stamp}.bak`);
  fs.writeFileSync(bak, text, 'utf8'); // 保持 UTF-8 无 BOM / LF
  return bak;
}

async function readSettingsBody(req) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_SETTINGS_BODY) { tooLarge = true; continue; } // 继续消费，避免挂起
    chunks.push(chunk);
  }
  if (tooLarge) return { tooLarge: true };
  return { text: Buffer.concat(chunks).toString('utf8') };
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / node fetch 等非浏览器客户端
  return typeof origin === 'string' && (
    origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
  );
}

async function handleSettings(req, res) {
  if (!originAllowed(req)) {
    sendJson(res, 403, { ok: false, error: 'Origin 不被允许' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const values = parseEnvValues(fs.readFileSync(ENV_PATH, 'utf8'));
      sendJson(res, 200, { configured: configuredFrom(values) }); // 只回布尔，绝不回显明文
    } catch {
      sendJson(res, 500, { ok: false, error: '读取 .env 失败' });
    }
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: '仅支持 GET / POST' });
    return;
  }

  const body = await readSettingsBody(req);
  if (body.tooLarge) {
    sendJson(res, 413, { ok: false, error: '请求体超过 8KB 上限' });
    return;
  }
  let payload;
  try {
    payload = JSON.parse(body.text);
  } catch {
    sendJson(res, 400, { ok: false, error: 'JSON 解析失败' });
    return;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    sendJson(res, 400, { ok: false, error: '请求体必须是 JSON 对象' });
    return;
  }

  // 字段白名单：只收 baseUrl / model / apiKey 的字符串值；其他键一律忽略，
  // 绝不写 CONCURRENCY / TIMEOUT_MS。apiKey 为空串 / 缺失 = 不修改已有 key。
  const updates = {};
  for (const field of Object.keys(SETTINGS_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const value = payload[field];
    if (typeof value !== 'string') continue;
    if (/[\r\n]/.test(value)) { // 防止注入新行改写其他键
      sendJson(res, 400, { ok: false, error: '字段值含非法换行' });
      return;
    }
    if (field === 'apiKey' && value.trim() === '') continue;
    updates[field] = value;
  }

  let original;
  try {
    original = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    sendJson(res, 500, { ok: false, error: '读取 .env 失败' });
    return;
  }

  let backupPath;
  try {
    backupPath = backupEnv(original);
    fs.writeFileSync(ENV_PATH, applyEnvUpdates(original, updates), 'utf8');
  } catch {
    let restored = false;
    try {
      const restore = backupPath && fs.existsSync(backupPath)
        ? fs.readFileSync(backupPath, 'utf8')
        : original;
      fs.writeFileSync(ENV_PATH, restore, 'utf8');
      restored = true;
    } catch { /* 回退失败，下面明确报错 */ }
    sendJson(res, 500, {
      ok: false,
      error: restored ? '写入 .env 失败，已用备份回退' : '写入 .env 失败且回退失败',
    });
    return;
  }

  try {
    const values = parseEnvValues(fs.readFileSync(ENV_PATH, 'utf8'));
    sendJson(res, 200, { ok: true, configured: configuredFrom(values) });
  } catch {
    sendJson(res, 500, { ok: false, error: '写入后读取 .env 失败' });
  }
}

const server = http.createServer((req, res) => {
  // 精确匹配 /api/settings；其余路径原样落到下方静态逻辑（一字未改）。
  let apiPathname = '';
  try {
    apiPathname = new URL(req.url, 'http://127.0.0.1').pathname;
  } catch { /* 交给下方静态逻辑处理 */ }
  if (apiPathname === '/api/settings') {
    handleSettings(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: '服务器内部错误' });
    });
    return;
  }
  // ADR-0030：资料库写侧。preview(--dist) 由 handler 内部拒绝一切非 GET 写操作。
  if (apiPathname === '/api/materials' || apiPathname.startsWith('/api/materials/')) {
    handleMaterials(req, res, { port, useDist }).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: '服务器内部错误' });
    });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';

  // 全量配图：数据里的 ../public/... 经浏览器规范化后是 /public/...，
  // 这些文件不在 WEB_ROOT 内，单独映射到项目根 public/，且只放行该子树。
  const isPublic = pathname.startsWith('/public/');
  const baseRoot = isPublic ? path.join(ROOT, 'public') : WEB_ROOT;
  const target = isPublic
    ? path.resolve(baseRoot, pathname.slice('/public/'.length))
    : path.resolve(WEB_ROOT, '.' + pathname);
  // 规范化后必须仍在 baseRoot 内；用 path.sep 前缀避免 /webui-evil 这类绕过。
  if (target !== baseRoot && !target.startsWith(baseRoot + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + pathname);
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(302, { Location: pathname + (pathname.endsWith('/') ? '' : '/') }).end();
    return;
  }

  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(target).pipe(res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[serve-webui] 端口 ${port} 已被占用，用 --port=<n> 换一个`);
  } else {
    console.error('[serve-webui] ' + err.message);
  }
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[serve-webui] ${useDist ? 'dist/' : 'webui/'} → http://127.0.0.1:${port}/  (Ctrl+C 停止)`);
  console.log('[serve-webui] /public/** → 项目根 public/（全量配图，仅放行该子树）');
});
