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

const server = http.createServer((req, res) => {
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
