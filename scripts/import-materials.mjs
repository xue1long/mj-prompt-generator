/**
 * 资料库批量导入兜底（ADR-0030 / Q1）：JSON 清单 + 图片目录 → 落盘 + 烘焙。
 *
 * 与 HTTP 路径**共用** scripts/materials-api.mjs 的写入函数，禁止第二套落盘逻辑。
 * CSV / Markdown 清单请在 WebUI 的导入抽屉里做 —— 解析器在 materials-view.js，
 * 不为 CLI 复制一份。
 *
 * 用法：
 *   node scripts/import-materials.mjs <清单.json> [图片目录]
 *   npm run import:materials -- <清单.json> <图片目录>
 *
 * 清单：数组，或 { items: [...] }。字段 prompt（必填）/ images / tags / author / note，
 *       兼容中文表头「提示词 / 图片 / 标签 / 作者 / 备注」。images 里的本机路径取 basename。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveItem, saveImage, attachImage, rebuildNow, ensureDirs, listItems, dedupeKey } from './materials-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [manifestArg, imagesArg] = process.argv.slice(2);

function usage() {
  console.log('用法：node scripts/import-materials.mjs <清单.json> [图片目录]');
  console.log('  清单只支持 JSON（数组或 {items:[...]}）；CSV / Markdown 请在 WebUI 导入抽屉里做。');
}

function basename(name) {
  return String(name ?? '').split(/[\\/]/).pop().trim();
}
function asArray(v) {
  return Array.isArray(v) ? v : String(v ?? '').split(/[|,，;；]/);
}
function normalizeTags(v) {
  if (Array.isArray(v)) return [...new Set(v.map((t) => String(t).trim()).filter(Boolean))];
  return [...new Set(String(v ?? '').split(/[,，;；\s]+/).map((t) => t.trim()).filter(Boolean))];
}
function normalizeEntry(row) {
  return {
    prompt: String(row.prompt ?? row['提示词'] ?? '').trim(),
    images: asArray(row.images ?? row['图片'] ?? []).map(basename).filter(Boolean),
    tags: normalizeTags(row.tags ?? row['标签'] ?? []),
    author: String(row.author ?? row['作者'] ?? '').trim(),
    note: String(row.note ?? row['备注'] ?? '').trim(),
  };
}

async function main() {
  if (!manifestArg) { usage(); process.exit(1); }
  const manifestPath = path.resolve(manifestArg);
  if (!fs.existsSync(manifestPath)) throw new Error(`清单文件不存在：${manifestPath}`);
  if (path.extname(manifestPath).toLowerCase() !== '.json') {
    throw new Error('CLI 只支持 JSON 清单；CSV / Markdown 请用 WebUI 导入抽屉');
  }
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rows = (Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []))
    .map(normalizeEntry).filter((e) => e.prompt);
  const imagesDir = imagesArg ? path.resolve(ROOT, imagesArg) : null;
  if (imagesDir && !fs.existsSync(imagesDir)) throw new Error(`图片目录不存在：${imagesDir}`);

  ensureDirs();
  // Q11 判据：规范化提示词 + 原始图片文件名集合。与 GUI 的 addEntries 同一口径。
  const seen = new Set(listItems().map((it) => dedupeKey({ prompt: it.prompt, images: it.originalNames || [] })));
  let added = 0;
  let skipped = 0;
  let missing = 0;
  let images = 0;
  for (const e of rows) {
    const key = dedupeKey({ prompt: e.prompt, images: e.images });
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    const created = saveItem({
      prompt: e.prompt, tags: e.tags, author: e.author, note: e.note, source: 'batch',
    });
    for (const name of e.images) {
      const abs = imagesDir ? path.join(imagesDir, name) : '';
      if (!abs || !fs.existsSync(abs)) { missing++; continue; }
      const shot = await saveImage({ itemId: created.item.id, name, input: fs.readFileSync(abs) });
      attachImage(created.item.id, shot.file, name);
      images++;
    }
    added++;
  }
  const result = rebuildNow();
  console.log(`[import-materials] 清单 ${rows.length} 条 → 新增 ${added} / 重复跳过 ${skipped} / 缺图 ${missing} 张`);
  console.log(`[import-materials] 图片 ${images} 张 · 资料库现有 ${result.total} 条 · 已重烘焙`);
}

main().catch((err) => {
  console.error('[import-materials] ' + err.message);
  process.exit(1);
});
