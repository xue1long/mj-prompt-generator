/* ==========================================================================
   资料库前端数据层（ADR-0030）：读构建期产物，写本机 /api/materials。

   与上一版（materials-store.js / IndexedDB + blob:）的区别，也是这次替换的理由：
     · 真相源是项目文件 data/materials/items/*.json 与 public/materials/*.webp，
       不再落在浏览器 origin 里 —— 换设备 / 清站点数据都不丢。
     · 前端只读 MATERIALS_ITEMS（<script> 同步加载的内联产物），**运行时不 fetch 数据**，
       不违反 ADR-0022:23。fetch 只用于「写」和一次可编辑性探测。
     · file:// 下不发任何请求，资料库降级为只读浏览；编辑需 npm run dev。

   对外保持与 materials-store.js 相同的函数名，让 materials-view.js 的改动压到最小：
   条目在视图层仍以 imageIds[] / imageNames[] 呈现（imageIds 即服务端生成的文件名）。
   ========================================================================== */

const MATERIALS_API = (() => {
  const IMAGE_BASE_FALLBACK = '../public/materials/';
  let cache = null;              // 视图形状的条目数组；null = 尚未装载
  let editable = false;
  let reason = '未探测';

  /* ── 纯函数（与服务端 materials-api.mjs 的 dedupeKey 同一口径） ─────── */

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
  function basename(name) {
    return String(name ?? '').split(/[\\/]/).pop().trim();
  }
  function normalizeImageNames(names) {
    const raw = Array.isArray(names) ? names : String(names ?? '').split(/[|,，;；]/);
    return raw.map(basename).filter(Boolean).sort();
  }
  /** Q11 去重判据：规范化提示词 + 图片文件名集合。 */
  function dedupeKey(entry) {
    return `${normalizeText(entry && entry.prompt)}\u0000${normalizeImageNames(entry && entry.images).join('\u0001')}`;
  }

  /* ── 产物 → 视图形状 ──────────────────────────────────────────────── */

  function viewShape(it) {
    const images = Array.isArray(it.images) ? it.images.slice() : [];
    const original = Array.isArray(it.originalNames) && it.originalNames.length === images.length
      ? it.originalNames.slice() : images.slice();
    return { ...it, imageIds: images, imageNames: original };
  }
  function ingest(items) {
    cache = (items || []).map(viewShape);
    return cache;
  }
  function sourceGlobal() {
    return (typeof MATERIALS_SOURCE !== 'undefined' && MATERIALS_SOURCE) ? MATERIALS_SOURCE : {};
  }
  function imageUrl(name) {
    return (sourceGlobal().imageBase || IMAGE_BASE_FALLBACK) + String(name ?? '');
  }

  async function allItems() {
    if (!cache) {
      const raw = (typeof MATERIALS_ITEMS !== 'undefined' && Array.isArray(MATERIALS_ITEMS))
        ? MATERIALS_ITEMS : [];
      ingest(raw);
    }
    return cache;
  }
  /** 兼容旧调用：产物里没有独立的图片表，图片路径由 imageUrl() 现算。 */
  async function allImages() { return []; }
  function imageObjectUrl() { return ''; }
  function releaseObjectUrl() {}
  function releaseAllObjectUrls() {}
  function status() { return { available: true, editable, reason }; }

  /* ── 可编辑性探测 & 写请求 ────────────────────────────────────────── */

  async function probe() {
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      editable = false;
      reason = 'file:// 只读浏览';
      return false;
    }
    try {
      const res = await fetch('/api/materials', { method: 'GET' });
      const data = await res.json();
      editable = !!(res.ok && data.ok && data.editable);
      reason = editable ? '本机服务可写' : (data.error || '服务未开放编辑');
    } catch {
      editable = false;
      reason = '本机服务不可用（可能是旧进程未重启）';
    }
    return editable;
  }

  async function request(method, url, body) {
    if (!editable) throw new Error('当前是只读浏览，编辑请在项目根运行 npm run dev');
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* 非 JSON 响应按 HTTP 状态处理 */ }
    if (Array.isArray(data.items)) ingest(data.items);
    if (data.needRebuild) {
      const err = new Error('已落盘但烘焙失败，请运行 npm run build:materials 或点「重新烘焙」');
      err.needRebuild = true;
      throw err;
    }
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('读取图片失败：' + ((reader.error && reader.error.message) || '')));
      reader.readAsDataURL(file);
    });
  }

  /* ── 对外写操作（签名与旧 store 一致） ────────────────────────────── */

  async function putItem(input) {
    const payload = {
      prompt: input.prompt, tags: input.tags, author: input.author, note: input.note, source: input.source,
    };
    const data = input.id
      ? await request('PUT', `/api/materials/items/${encodeURIComponent(input.id)}`, { item: payload })
      : await request('POST', '/api/materials/items', { item: payload });
    return data.item;
  }

  async function addImage(itemId, file) {
    const dataUrl = await fileToDataUrl(file);
    return request('POST', '/api/materials/images', {
      itemId, name: (file && file.name) || 'image', dataUrl,
    });
  }

  async function removeImage(imageId) {
    const items = await allItems();
    const owner = items.find((it) => (it.imageIds || []).includes(imageId));
    if (!owner) return false;
    await request('DELETE', `/api/materials/items/${encodeURIComponent(owner.id)}/images/${encodeURIComponent(imageId)}`);
    return true;
  }

  async function removeItem(id) {
    return request('DELETE', `/api/materials/items/${encodeURIComponent(id)}`);
  }

  async function rebuild() {
    return request('POST', '/api/materials/rebuild', {});
  }

  return {
    // 纯函数（单测直接测这些，不依赖 DOM / fetch）
    newId, normalizeText, normalizeTags, basename, normalizeImageNames, dedupeKey,
    // 读
    allItems, allImages, imageObjectUrl, releaseObjectUrl, releaseAllObjectUrls, imageUrl, status,
    // 写
    probe, putItem, addImage, removeImage, removeItem, rebuild,
    // 供视图在编辑成功后刷新
    ingest, viewShape,
  };
})();

if (typeof window !== 'undefined') window.MATERIALS_API = MATERIALS_API;
