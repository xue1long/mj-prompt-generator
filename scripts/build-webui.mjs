/**
 * 构建静态 WebUI（ADR-0017）：把 webui/ 原样复制进 dist/。
 *
 * 与旧 Vue 构建的区别（Vue 版已于第 11 步删除，见报告 3.5）：
 *   - 不跑 vue-tsc / vite，无编译期数据内联；数据由 build:webui-data 预先生成。
 *   - dist/ 是纯静态目录，双击 dist/index.html 或任意静态服务器即可用。
 *   - public/ 下的图保持不动（不复制、不删除），它们是数据生产链的源。
 *
 * dist/ 的职责（报告 3.2 / ADR-0017 Round 16）：**只放代码**。
 *   dist/ 与 webui/ 同构（都在项目根下一层），所以两边的配图路径都写 ../public/…，
 *   指向同一个 public/ —— 复制时无需改写路径。
 *   代价：dist/ 必须在项目根内使用；单独拷走会丢图（public/ 是数据源，
 *   20,087 张里 19,928 张是采集链生成物、本就不入库）。
 *
 * 运行：npm run build   （等价于 node scripts/build-webui.mjs）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'webui');
const DIST = path.join(ROOT, 'dist');

const REQUIRED_HTML = ['index.html', 'explore.html', 'gallery.html', 'style-library.html', 'style-types.html', 'artists.html'];

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
if (!fs.existsSync(path.join(SRC, 'js', 'data-types.js'))) fail('webui/js/data-types.js 缺失，先跑 npm run build:webui-data');

const srcStat = treeStat(SRC);
if (fs.existsSync(DIST)) {
  const old = treeStat(DIST);
  console.log(`[build-webui] 清空旧 dist/：${old.files} 文件 / ${(old.bytes / 1048576).toFixed(1)} MB（旧构建产物）`);
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

/* 单一图片命名空间守门（报告 3.2 / ADR-0017 Round 16）：
   产物里不允许再出现指向 assets/ 的图片引用。历史上前端混用两套图片来源
   （webui/assets/ 与 ../public/），导致「dist/ 拷走能不能用」没有确定答案。
   这条断言把「只有一套命名空间」变成构建期的硬不变量 —— 违反即构建失败。 */
const assetRefs = [];
for (const f of fs.readdirSync(path.join(DIST, 'js'))) {
  if (!f.endsWith('.js')) continue;
  const text = fs.readFileSync(path.join(DIST, 'js', f), 'utf8');
  const m = text.match(/["'`](assets\/[a-z0-9_\-]+\/)/gi);
  if (m) assetRefs.push(f + ' → ' + [...new Set(m)].join(', '));
}
if (assetRefs.length) {
  fail('产物里仍有 assets/ 图片引用（单一命名空间被破坏）：\n    ' + assetRefs.join('\n    '));
}
/* 反向守门：产物里必须有 ../public/ 引用，否则说明配图路径被整体改坏。 */
const publicRefs = fs
  .readdirSync(path.join(DIST, 'js'))
  .filter((f) => f.endsWith('.js'))
  .some((f) => fs.readFileSync(path.join(DIST, 'js', f), 'utf8').includes('../public/'));
if (!publicRefs) fail('产物里找不到 ../public/ 配图引用 —— 配图路径可能被整体改坏');

console.log(
  `[build-webui] 完成 → dist/：${out.files} 文件 / ${(out.bytes / 1048576).toFixed(2)} MB / ${jsCount} 个 JS / ${REQUIRED_HTML.length} 个 HTML`
);
console.log('[build-webui] 单一图片命名空间检查通过（产物无 assets/ 引用，配图统一走 ../public/）');
console.log('[build-webui] dist/ 必须在项目根内使用（配图指向 ../public/）；双击 dist/index.html 即用，或 npm run preview');
