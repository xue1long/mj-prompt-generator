/**
 * 构建静态 WebUI（ADR-0017）：把 webui/ 原样复制进 dist/。
 *
 * 与旧 Vue 构建的区别：
 *   - 不再跑 vue-tsc / vite，无编译期数据内联；数据由 build:webui-data 预先生成。
 *   - dist/ 是纯静态目录，双击 dist/index.html 或任意静态服务器即可用。
 *   - public/ 下 18,216 张图保持不动（不复制、不删除），它们是数据生产链的源。
 *
 * 运行：npm run build   （等价于 node scripts/build-webui.mjs）
 * 回退：npm run legacy:build 会重建旧 Vue 产物。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'webui');
const DIST = path.join(ROOT, 'dist');

const REQUIRED_HTML = ['index.html', 'explore.html', 'gallery.html', 'style-library.html'];

function treeStat(dir) {
  let files = 0;
  let bytes = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = treeStat(p);
      files += r.files;
      bytes += r.bytes;
    } else {
      files += 1;
      bytes += fs.statSync(p).size;
    }
  }
  return { files, bytes };
}

function fail(msg) {
  console.error('[build-webui] ' + msg);
  process.exit(1);
}

for (const f of REQUIRED_HTML) {
  if (!fs.existsSync(path.join(SRC, f))) fail(`webui/ 缺少 ${f}`);
}
if (!fs.existsSync(path.join(SRC, 'js', 'data-explore.js'))) fail('webui/js/ 数据文件缺失，先跑 npm run build:webui-data');

const srcStat = treeStat(SRC);
if (fs.existsSync(DIST)) {
  const old = treeStat(DIST);
  console.log(`[build-webui] 清空旧 dist/：${old.files} 文件 / ${(old.bytes / 1048576).toFixed(1)} MB（旧构建产物；旧 Vue 版本可用 legacy:build 重建）`);
  fs.rmSync(DIST, { recursive: true, force: true });
  if (fs.existsSync(DIST)) fail('dist/ 清空失败');
}

fs.cpSync(SRC, DIST, { recursive: true });

/* 产物自检 */
const out = treeStat(DIST);
const missing = REQUIRED_HTML.filter((f) => !fs.existsSync(path.join(DIST, f)));
const jsCount = fs.readdirSync(path.join(DIST, 'js')).filter((f) => f.endsWith('.js')).length;
if (missing.length) fail('产物缺少：' + missing.join(', '));
if (out.files !== srcStat.files || out.bytes !== srcStat.bytes) {
  fail(`复制不完整：源 ${srcStat.files}/${srcStat.bytes} 产物 ${out.files}/${out.bytes}`);
}

console.log(
  `[build-webui] 完成 → dist/：${out.files} 文件 / ${(out.bytes / 1048576).toFixed(2)} MB / ${jsCount} 个 JS / 4 个 HTML`
);
console.log('[build-webui] 双击 dist/index.html 即可使用；或 npm run preview');
