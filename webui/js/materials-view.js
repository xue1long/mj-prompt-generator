/* ==========================================================================
   资料库视图（ADR-0029）：工作台第七个一级视图 #materials

   装的是**研究者自己收集、尚未成为研究证据**的提示词与图片：
   来源混杂、一条提示词配 0–N 张图、没有七段拆解、不参与对照。
   它与「研究样本库」（社区四格成图 + 拆解 + 证据）是异质的两类数据，
   因此并列为一级视图，而不是样本库的一个页签或一个导入表单。

   ## 本文件遵守的既有契约
   · 三段式 headHtml / toolbarHtml / bodyHtml + wire，不自行启动、不监听 hashchange。
   · 筛选走 FILTER_ENGINE，维度在这里声明，URL 白名单由 workbench.js 搬运
     （ADR-0010：hash 是筛选状态的唯一来源）。
   · 弹层走 core.js 的 mountDialog（对话框语义 / 焦点陷阱 / 焦点归还）。
   · 配图统一走 ../public/materials/（ADR-0030 撤销了 ADR-0029 的 blob: 破例）。
     真相源是项目文件；浏览器只在 npm run dev 下经 /api/materials 写入。
     file:// 双击是只读浏览，编辑入口一律禁用。

   ## 明确不做（ADR-0030 范围刹车）
   七段拆解、四格补齐、对照、转成研究样本、LLM、前端侧 320/640 两档重编码。
   ========================================================================== */

const MATERIALS_VIEW = (() => {
  const SOURCE_LABELS = { batch: '清单导入', manual: '手工录入' };
  const state = {
    items: [],
    urls: new Map(),         // 图片文件名 -> ../public/materials/<name>
    editable: false,
    loaded: false,
    loading: false,
    error: '',
    notice: '',
    q: '',
    hasImage: false,
    source: '',
    tags: [],
    date: '',
  };

  /* ── 筛选源（Q10：5 个维度，复用统一引擎） ────────────────────────── */
  const SOURCE = FILTER_ENGINE.source('materials', [
    { key: 'q', type: 'q', matchOf: (it, text) => {
      if (String(it.prompt || '').toLowerCase().includes(text)) return true;
      if (String(it.author || '').toLowerCase().includes(text)) return true;
      if (String(it.note || '').toLowerCase().includes(text)) return true;
      return (it.tags || []).some(t => String(t).toLowerCase().includes(text));
    } },
    { key: 'hasImage', type: 'bool', activeOf: (it) => (it.imageIds || []).length > 0 },
    { key: 'source', type: 'enum', valueOf: (it) => it.source || 'manual' },
    { key: 'tags', type: 'multi', valuesOf: (it) => it.tags || [] },
    { key: 'date', type: 'enum', valueOf: (it) => dayOf(it.createdAt) },
  ]);

  function dayOf(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function source() { return SOURCE; }
  function count() { return state.items.length; }
  function dims() {
    return {
      q: state.q,
      hasImage: state.hasImage,
      source: state.source,
      tags: [...state.tags],
      date: state.date,
    };
  }
  function stateFromDims(d) {
    state.q = d.q || '';
    state.hasImage = !!d.hasImage;
    state.source = d.source || '';
    state.tags = Array.isArray(d.tags) ? [...d.tags] : [];
    state.date = d.date || '';
  }
  function filterState() {
    return {
      q: state.q,
      dims: { hasImage: state.hasImage, source: state.source, tags: [...state.tags], date: state.date },
    };
  }
  function matched() { return FILTER_ENGINE.filter(SOURCE, state.items, filterState()); }
  function allTags() {
    return [...new Set(state.items.flatMap(it => it.tags || []))].sort();
  }
  function allDates() {
    return [...new Set(state.items.map(it => dayOf(it.createdAt)).filter(Boolean))].sort().reverse();
  }

  /* ── 数据装载 ─────────────────────────────────────────────────────── */
  async function reload() {
    await MATERIALS_API.probe();          // file:// 下不发任何 fetch
    const items = await MATERIALS_API.allItems();
    state.urls.clear();
    for (const it of items) {
      for (const name of it.imageIds || []) state.urls.set(name, MATERIALS_API.imageUrl(name));
    }
    state.items = items || [];
    state.editable = MATERIALS_API.status().editable;
    state.loaded = true;
    state.error = '';
  }
  function load() { return reload(); }

  function isActive() {
    return location.hash.replace(/^#\/?/, '').split('?')[0] === 'materials';
  }
  /** 全量重绘（筛选控件 / 导入 / 编辑后）；只重绘 body 时用 repaintBody 保住输入焦点。 */
  function repaint() { if (typeof render === 'function') render(); }
  function repaintBody() {
    const panel = document.getElementById('library-panel');
    if (panel) panel.innerHTML = bodyHtml();
  }
  function writeUrl() { if (typeof writeFilterToUrl === 'function') writeFilterToUrl(); }

  /* ── 三段式 ───────────────────────────────────────────────────────── */
  function headHtml() {
    const withImages = state.items.filter(it => (it.imageIds || []).length > 0).length;
    return `
      <div class="library-head" data-od-id="materials-head">
        <h1>资料库</h1>
        <p class="lead">自己收集的提示词与图片 —— 来源混杂、可先只存文字、后期再补图。它<b>不是研究样本</b>：没有四格成图与七段拆解，不参与对照，也拿不到研究样本库的引用键。</p>
        <div class="head-meta">
          <span class="param-chip">资料条目 ${state.items.length}</span>
          <span class="param-chip">有配图 ${withImages} / ${state.items.length}</span>
          <span class="param-chip">存于项目文件 · 可入库</span>
          <span class="param-chip">${state.editable ? '可编辑' : '只读浏览'}</span>
        </div>
        ${state.editable ? '' : '<p class="mat-readonly" data-od-id="materials-readonly">只读浏览 · 编辑请在项目根运行 <code>npm run dev</code></p>'}
      </div>`;
  }

  function toolbarHtml() {
    const tagOptions = allTags();
    return `
      <div class="toolbar mat-toolbar" data-od-id="materials-toolbar">
        <div class="search">
          ${icon('search')}
          <input id="mat-search" type="search" aria-label="搜索资料" placeholder="搜索提示词、作者、标签或备注"
            value="${esc(state.q)}" autocomplete="off">
        </div>
        <label class="mat-check" title="只看有配图的条目">
          <input type="checkbox" data-mat-hasimage${state.hasImage ? ' checked' : ''}>只看有配图
        </label>
        <label class="mat-select">来源
          <select data-mat-source aria-label="按来源筛选">
            <option value="">全部</option>
            <option value="batch"${state.source === 'batch' ? ' selected' : ''}>清单导入</option>
            <option value="manual"${state.source === 'manual' ? ' selected' : ''}>手工录入</option>
          </select>
        </label>
        <label class="mat-select">收录日
          <select data-mat-date aria-label="按收录日筛选">
            <option value="">全部</option>
            ${allDates().map(d => `<option value="${esc(d)}"${state.date === d ? ' selected' : ''}>${esc(d)}</option>`).join('')}
          </select>
        </label>
        <details class="mat-tagbox"${state.tags.length ? ' open' : ''}>
          <summary>标签${state.tags.length ? ` <span class="n">${state.tags.length}</span>` : ''}</summary>
          <div class="mat-taglist" role="group" aria-label="按标签筛选（组内任一）">
            ${tagOptions.length
              ? tagOptions.map(t => `<label class="mat-check"><input type="checkbox" data-mat-tag value="${esc(t)}"${state.tags.includes(t) ? ' checked' : ''}>${esc(t)}</label>`).join('')
              : '<p class="dock-hint">还没有标签</p>'}
          </div>
        </details>
        <span class="spacer"></span>
        <button class="btn btn-primary" type="button" data-mat-import${state.editable ? '' : ' disabled title="只读浏览：编辑请运行 npm run dev"'}>导入资料</button>
        <button class="btn btn-secondary" type="button" data-mat-export="json">导出 JSON</button>
        <button class="btn btn-secondary" type="button" data-mat-export="md">导出 Markdown</button>
      </div>`;
  }

  function chipsHtml() {
    const chips = [];
    if (state.q) chips.push({ key: 'q', label: `搜索：${state.q}` });
    if (state.hasImage) chips.push({ key: 'hasImage', label: '只看有配图' });
    if (state.source) chips.push({ key: 'source', label: `来源：${SOURCE_LABELS[state.source] || state.source}` });
    for (const t of state.tags) chips.push({ key: 'tags', value: t, label: `标签：${t}` });
    if (state.date) chips.push({ key: 'date', label: `收录日：${state.date}` });
    return `
      <div class="mat-chips" data-od-id="materials-chips" role="status" aria-live="polite">
        <span class="mat-chips-n">${chips.length} 条筛选</span>
        ${chips.length
          ? chips.map(c => `<button class="param-chip mat-chip" type="button" data-mat-chip="${esc(c.key)}" data-mat-value="${esc(c.value || '')}"
               aria-label="移除筛选 ${esc(c.label)}" title="移除这条筛选">${esc(c.label)} ×</button>`).join('')
          : '<span class="dock-hint">未设置筛选条件</span>'}
        ${chips.length ? '<button class="btn btn-ghost" type="button" data-mat-reset>重置</button>' : ''}
      </div>`;
  }

  function cardHtml(it) {
    const imgs = (it.imageIds || []).map((id, i) => {
      const url = state.urls.get(id);
      const name = (it.imageNames || [])[i] || '';
      return url
        ? `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" decoding="async">`
        : '';
    }).filter(Boolean).join('');
    const summary = String(it.prompt || '').slice(0, 81) + (String(it.prompt || '').length > 81 ? '…' : '');
    return `
      <article class="mat-card" data-mat-open="${esc(it.id)}" tabindex="0" role="button"
        aria-label="打开资料：${esc(summary)}">
        <div class="mat-thumbs">
          ${imgs || '<div class="img-plate">暂无配图 · 可后期补传</div>'}
        </div>
        <div class="mat-body">
          <div class="mat-prompt">${esc(summary) || '<span class="dock-hint">（空提示词）</span>'}</div>
          <div class="mat-meta">
            <span class="param-chip">${esc(SOURCE_LABELS[it.source] || '手工录入')}</span>
            <span class="param-chip">图片 ${(it.imageIds || []).length}</span>
            ${(it.tags || []).map(t => `<span class="param-chip">${esc(t)}</span>`).join('')}
          </div>
        </div>
      </article>`;
  }

  function bodyHtml() {
    if (state.error) {
      return `<div class="mat-empty"><h2>资料库不可用</h2><p class="dock-hint">${esc(state.error)}</p></div>`;
    }
    const rows = matched();
    return `
      ${chipsHtml()}
      <div class="group-block">
        <div class="group-head">
          <h2>资料条目</h2>
          <span class="n">命中 ${rows.length} / ${state.items.length} 条 · 无图条目保留空壳卡片，可在详情里补传</span>
        </div>
        ${state.notice ? `<p class="dock-hint" data-od-id="materials-notice">${esc(state.notice)}</p>` : ''}
        ${rows.length
          ? `<div class="mat-grid" data-od-id="materials-grid">${rows.map(cardHtml).join('')}</div>`
          : `<div class="mat-empty" data-od-id="materials-empty">
               <h2>${state.items.length ? '没有命中的资料' : '资料库还是空的'}</h2>
               <p class="dock-hint">${state.items.length
                 ? '试着移除几条筛选条件，或重置全部条件。'
                 : '可以导入 JSON / CSV / Markdown 清单（图片按文件名匹配），也可以直接手工录入一条纯文本提示词，图片以后再补。'}</p>
               ${state.items.length || !state.editable ? '' : '<button class="btn btn-primary" type="button" data-mat-import>导入第一批资料</button>'}
             </div>`}
      </div>`;
  }

  /* ── 清单解析（纯函数，导出供单测） ───────────────────────────────── */
  function normalizeEntry(row) {
    return {
      prompt: String(row.prompt ?? row['提示词'] ?? '').trim(),
      images: MATERIALS_API.normalizeImageNames(row.images ?? row['图片'] ?? []),
      tags: MATERIALS_API.normalizeTags(row.tags ?? row['标签'] ?? []),
      author: String(row.author ?? row['作者'] ?? '').trim(),
      note: String(row.note ?? row['备注'] ?? '').trim(),
    };
  }

  function csvCells(line) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function parseCsv(text) {
    const lines = String(text).split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const head = csvCells(lines[0]);
    return lines.slice(1).map(line => {
      const cells = csvCells(line);
      return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
    });
  }

  /** Markdown：一行 `- <提示词>` 起一条；紧随的 `  - 图片：a.webp, b.webp` 给它挂图。 */
  function parseMarkdown(text) {
    const out = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trimEnd();
      const item = /^\s*[-*]\s+(.+)$/.exec(line);
      if (!item) continue;
      const body = item[1].trim();
      const img = /^(?:图片|images?)\s*[:：]\s*(.+)$/i.exec(body);
      if (img && out.length) {
        const last = out[out.length - 1];
        last.images.push(...MATERIALS_API.normalizeImageNames(img[1]));
      } else {
        out.push({ prompt: body, images: [] });
      }
    }
    return out.map(normalizeEntry);
  }

  function parseManifest(text, filename) {
    const ext = String(filename || '').toLowerCase().split('.').pop();
    let rows;
    if (ext === 'json') {
      const data = JSON.parse(text);
      rows = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    } else if (ext === 'csv') {
      rows = parseCsv(text);
    } else {
      rows = parseMarkdown(text);
    }
    return rows.map(normalizeEntry).filter(e => e.prompt);
  }

  /* ── 导入 ─────────────────────────────────────────────────────────── */
  function existingKeys() {
    return new Set(state.items.map(it =>
      MATERIALS_API.dedupeKey({ prompt: it.prompt, images: it.imageNames || [] })));
  }

  /** 逐条落盘：先建条目，再把匹配到的图片追加进去。重复按 Q11 判据跳过。 */
  async function addEntries(entries, fileList, sourceKind) {
    const files = new Map([...(fileList || [])].map(f => [MATERIALS_API.basename(f.name), f]));
    // 手工录入没有清单，图片是用户当场选的 —— 把这些文件名并入去重键，
    // 否则「同提示词 + 同图片」再录一次会因为键里缺图片名而不被判重。
    const rows = sourceKind === 'manual'
      ? entries.map(e => ({ ...e, images: [...files.keys()].sort() }))
      : entries;
    const seen = existingKeys();
    let added = 0;
    let skipped = 0;
    let missing = 0;
    for (const e of rows) {
      if (!e.prompt) { skipped++; continue; }
      const key = MATERIALS_API.dedupeKey(e);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      const item = await MATERIALS_API.putItem({
        prompt: e.prompt, tags: e.tags, author: e.author, note: e.note,
        source: sourceKind, imageIds: [], imageNames: [],
      });
      for (const name of e.images) {
        const f = files.get(name);
        if (!f) { missing++; continue; }
        await MATERIALS_API.addImage(item.id, f);
      }
      added++;
    }
    await reload();
    return { total: rows.length, added, skipped, missing };
  }

  function openImport() {
    const { backdrop, close } = mountDialog(`
      <div class="sheet mat-sheet" data-od-id="materials-import">
        <div class="sheet-head">
          <div style="flex:1">
            <p class="eyebrow">资料库 · 导入</p>
            <h2>导入提示词与图片</h2>
          </div>
          <button class="btn btn-ghost" type="button" data-role="close">关闭</button>
        </div>
        <div class="sheet-body">
          <h3>批量清单</h3>
          <p class="dock-hint">JSON 字段：<span class="mono">prompt / images / tags / author / note</span>；
            CSV 用同名表头（images、tags 用 <span class="mono">|</span> 分隔）；
            Markdown 一行 <span class="mono">- 提示词</span>，下一行可写 <span class="mono">  - 图片：a.webp, b.webp</span>。
            图片按<b>文件名</b>匹配，清单里的本机路径会自动去掉。</p>
          <div class="mat-form">
            <label>清单文件（.json / .csv / .md / .txt）
              <input type="file" id="mat-manifest" accept=".json,.csv,.md,.txt,application/json,text/csv,text/markdown,text/plain">
            </label>
            <label>图片文件（可多选，按文件名匹配；不匹配也不影响条目入库）
              <input type="file" id="mat-images" accept="image/*" multiple>
            </label>
            <button class="btn btn-primary" type="button" data-mat-do-import>导入清单</button>
          </div>
          <h3>手工录入一条</h3>
          <div class="mat-form">
            <label>提示词（必填，可先只填文字）
              <textarea id="mat-manual-prompt" rows="3" placeholder="a quiet street after rain, cinematic lighting --ar 16:9"></textarea>
            </label>
            <label>标签（逗号分隔，可空）<input type="text" id="mat-manual-tags" placeholder="暖色调, 街景"></label>
            <label>作者 / 出处（可空）<input type="text" id="mat-manual-author"></label>
            <label>备注（可空）<textarea id="mat-manual-note" rows="2"></textarea></label>
            <label>图片（可空，可后期补传）<input type="file" id="mat-manual-images" accept="image/*" multiple></label>
            <button class="btn btn-primary" type="button" data-mat-do-manual>添加这一条</button>
          </div>
          <p class="dock-hint" id="mat-import-result" role="status" aria-live="polite"></p>
        </div>
      </div>`, { label: '导入资料' });

    const resultEl = backdrop.querySelector('#mat-import-result');
    const say = (msg) => { if (resultEl) resultEl.textContent = msg; };

    backdrop.addEventListener('click', async (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;

      if (t.closest('[data-mat-do-import]')) {
        const manifestEl = backdrop.querySelector('#mat-manifest');
        const file = manifestEl && manifestEl.files && manifestEl.files[0];
        if (!file) { say('请先选择清单文件。'); return; }
        const imagesEl = backdrop.querySelector('#mat-images');
        try {
          const text = await file.text();
          const entries = parseManifest(text, file.name);
          const r = await addEntries(entries, imagesEl && imagesEl.files, 'batch');
          state.notice = `清单导入：新增 ${r.added} 条 · 重复跳过 ${r.skipped} 条 · 缺图 ${r.missing} 张（条目已保留空壳）`;
          say(state.notice);
          repaint();
        } catch (err) {
          say(`导入失败：${(err && err.message) || err}`);
        }
        return;
      }

      if (t.closest('[data-mat-do-manual]')) {
        const prompt = (backdrop.querySelector('#mat-manual-prompt') || {}).value || '';
        if (!prompt.trim()) { say('提示词不能为空。'); return; }
        const tags = (backdrop.querySelector('#mat-manual-tags') || {}).value || '';
        const author = (backdrop.querySelector('#mat-manual-author') || {}).value || '';
        const note = (backdrop.querySelector('#mat-manual-note') || {}).value || '';
        const imagesEl = backdrop.querySelector('#mat-manual-images');
        try {
          const entry = normalizeEntry({ prompt, tags, author, note, images: [] });
          const r = await addEntries([entry], imagesEl && imagesEl.files, 'manual');
          state.notice = r.added ? '已添加 1 条资料。' : `未添加：这条资料与已有条目重复（共跳过 ${r.skipped} 条）。`;
          say(state.notice);
          repaint();
        } catch (err) {
          say(`添加失败：${(err && err.message) || err}`);
        }
      }
    });
    return close;
  }

  /* ── 详情 / 编辑灯箱 ──────────────────────────────────────────────── */
  function openSheet(id) {
    const it = state.items.find(x => x.id === id);
    if (!it) return;
    const imgs = (it.imageIds || []).map((imageId, i) => {
      const url = state.urls.get(imageId);
      const name = (it.imageNames || [])[i] || '';
      return `
        <div class="mat-sheet-img">
          ${url ? `<img src="${esc(url)}" alt="${esc(name)}">` : '<div class="img-plate">图片不可用</div>'}
          <button class="btn btn-ghost" type="button" data-mat-del-image="${esc(imageId)}" aria-label="删除图片 ${esc(name)}">删除这张</button>
          <span class="dock-hint">${esc(name)}</span>
        </div>`;
    }).join('');
    const { backdrop, close } = mountDialog(`
      <div class="sheet mat-sheet" data-od-id="materials-sheet">
        <div class="sheet-head">
          <div style="flex:1">
            <p class="eyebrow">${esc(SOURCE_LABELS[it.source] || '手工录入')} · 收录 ${esc(dayOf(it.createdAt))}</p>
            <h2>资料条目</h2>
          </div>
          <button class="btn btn-ghost" type="button" data-role="close">关闭</button>
        </div>
        <div class="sheet-body">
          <h3>配图（${(it.imageIds || []).length} 张）</h3>
          <div class="mat-sheet-imgs">${imgs || '<p class="dock-hint">暂无配图 —— 这是一张空壳卡片，可以在下面补传。</p>'}</div>
          <div class="mat-form">
            <label>补传图片（可多选，追加到本条）
              <input type="file" id="mat-add-images" accept="image/*" multiple>
            </label>
            <label>提示词
              <textarea id="mat-edit-prompt" rows="4">${esc(it.prompt)}</textarea>
            </label>
            <label>标签（逗号分隔）<input type="text" id="mat-edit-tags" value="${esc((it.tags || []).join(', '))}"></label>
            <label>作者 / 出处<input type="text" id="mat-edit-author" value="${esc(it.author)}"></label>
            <label>备注<textarea id="mat-edit-note" rows="3">${esc(it.note)}</textarea></label>
            <div class="btn-row">
              <button class="btn btn-primary" type="button" data-mat-save>保存修改</button>
              <button class="btn btn-secondary" type="button" data-mat-copy>复制提示词</button>
              <button class="btn btn-ghost" type="button" data-mat-delete>删除这条资料</button>
            </div>
          </div>
          <p class="dock-hint" id="mat-sheet-result" role="status" aria-live="polite"></p>
        </div>
      </div>`, { label: '资料条目详情' });

    // 只读态仍可查看提示词与配图，但所有写控件一律禁用（不只靠按钮 disabled 的视觉）。
    if (!state.editable) {
      backdrop.querySelectorAll('[data-mat-save], [data-mat-delete], [data-mat-del-image], '
        + '#mat-add-images, #mat-edit-prompt, #mat-edit-tags, #mat-edit-author, #mat-edit-note')
        .forEach((el) => { el.disabled = true; });
    }
    const say = (msg) => {
      const el = backdrop.querySelector('#mat-sheet-result');
      if (el) el.textContent = msg;
    };
    const refresh = async () => {
      await reload();
      repaint();
      close();
      openSheet(id);
    };

    backdrop.addEventListener('click', async (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      const delImg = t.closest('[data-mat-del-image]');
      if (delImg) {
        await MATERIALS_API.removeImage(delImg.dataset.matDelImage);
        await refresh();
        return;
      }
      if (t.closest('[data-mat-save]')) {
        const prompt = (backdrop.querySelector('#mat-edit-prompt') || {}).value || '';
        if (!prompt.trim()) { say('提示词不能为空。'); return; }
        await MATERIALS_API.putItem({
          id: it.id, prompt,
          tags: (backdrop.querySelector('#mat-edit-tags') || {}).value || '',
          author: (backdrop.querySelector('#mat-edit-author') || {}).value || '',
          note: (backdrop.querySelector('#mat-edit-note') || {}).value || '',
        });
        await reload();
        repaint();
        close();
        state.notice = '已保存修改。';
        return;
      }
      if (t.closest('[data-mat-copy]')) {
        if (typeof copyText === 'function') copyText(it.prompt, '提示词已复制');
        return;
      }
      if (t.closest('[data-mat-delete]')) {
        if (!window.confirm('删除这条资料及其全部配图？此操作不可撤销。')) return;
        await MATERIALS_API.removeItem(it.id);
        await reload();
        repaint();
        close();
        state.notice = '已删除该资料。';
      }
    });
    backdrop.addEventListener('change', async (ev) => {
      const t = ev.target;
      if (!t || t.id !== 'mat-add-images' || !t.files || !t.files.length) return;
      for (const f of t.files) await MATERIALS_API.addImage(it.id, f);
      say(`已补传 ${t.files.length} 张图片。`);
      await refresh();
    });
  }

  /* ── 导出（Q10：复用样本导出的双格式口径，标识用条目 id，图片只带文件名） ── */
  function exportRows() { return matched(); }
  function exportJson() {
    const rows = exportRows();
    const payload = {
      source: 'MJ 提示词研究工作台 / 资料库',
      exportedAt: new Date().toISOString(),
      scope: rows.length === state.items.length ? '全部' : '筛选命中',
      count: rows.length,
      note: '图片只带文件名，不含二进制（配图在项目根 public/materials/）。',
      items: rows.map(it => ({
        id: it.id, prompt: it.prompt, images: it.imageNames || [],
        source: it.source, tags: it.tags, author: it.author, note: it.note,
        createdAt: it.createdAt, updatedAt: it.updatedAt,
      })),
    };
    download(JSON.stringify(payload, null, 2), 'json', 'application/json;charset=utf-8');
  }
  function exportMarkdown() {
    const rows = exportRows();
    const lines = [
      '# 资料库导出', '',
      `- 导出时间：${new Date().toLocaleString('zh-CN')}`,
      `- 范围：${rows.length === state.items.length ? '全部' : '筛选命中'} · ${rows.length} 条`,
      '- 图片只列文件名，不含二进制（配图在项目根 public/materials/）。', '',
    ];
    rows.forEach((it, i) => {
      lines.push(`## ${i + 1}. ${it.id}`, '');
      lines.push('```text', it.prompt, '```', '');
      lines.push(`- 图片：${(it.imageNames || []).length ? it.imageNames.join('、') : '（暂无配图）'}`);
      lines.push(`- 来源：${SOURCE_LABELS[it.source] || it.source || '手工录入'}`);
      lines.push(`- 标签：${(it.tags || []).join('、') || '（无）'}`);
      if (it.author) lines.push(`- 作者 / 出处：${it.author}`);
      // 备注是多行文本；Markdown 列表项里的裸换行会把后续行顶出列表，导出时压成一行。
      if (it.note) lines.push(`- 备注：${String(it.note).replace(/\s*\n+\s*/g, ' / ')}`);
      lines.push(`- 收录日：${dayOf(it.createdAt)}`, '');
    });
    download(lines.join('\n'), 'md', 'text/markdown;charset=utf-8');
  }
  function download(text, ext, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    a.download = `资料库导出-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  }

  /* ── 事件 ─────────────────────────────────────────────────────────── */
  function removeChip(key, value) {
    if (key === 'q') state.q = '';
    else if (key === 'hasImage') state.hasImage = false;
    else if (key === 'source') state.source = '';
    else if (key === 'date') state.date = '';
    else if (key === 'tags') state.tags = state.tags.filter(t => t !== value);
    writeUrl();
    repaint();
  }
  function resetFilters() {
    state.q = ''; state.hasImage = false; state.source = ''; state.tags = []; state.date = '';
    writeUrl();
    repaint();
  }

  function onClick(ev) {
    const t = ev.target instanceof Element ? ev.target : null;
    if (!t) return;
    if (t.closest('[data-mat-import]')) { if (state.editable) openImport(); return; }
    const exp = t.closest('[data-mat-export]');
    if (exp) { if (exp.dataset.matExport === 'md') exportMarkdown(); else exportJson(); return; }
    const chip = t.closest('[data-mat-chip]');
    if (chip) { removeChip(chip.dataset.matChip, chip.dataset.matValue); return; }
    if (t.closest('[data-mat-reset]')) { resetFilters(); return; }
    const card = t.closest('[data-mat-open]');
    if (card) { openSheet(card.dataset.matOpen); }
  }
  function onInput(ev) {
    const t = ev.target;
    if (!t || t.id !== 'mat-search') return;
    state.q = t.value;
    writeUrl();
    repaintBody();
  }
  function onChange(ev) {
    const t = ev.target;
    if (!t || !t.dataset) return;
    if ('matHasimage' in t.dataset) { state.hasImage = !!t.checked; }
    else if ('matSource' in t.dataset) { state.source = t.value || ''; }
    else if ('matDate' in t.dataset) { state.date = t.value || ''; }
    else if ('matTag' in t.dataset) {
      state.tags = t.checked
        ? [...new Set([...state.tags, t.value])]
        : state.tags.filter(x => x !== t.value);
    } else return;
    writeUrl();
    repaint();
  }
  function onKeydown(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = ev.target instanceof Element ? ev.target : null;
    const card = t && t.closest('[data-mat-open]');
    if (!card) return;
    ev.preventDefault();
    openSheet(card.dataset.matOpen);
  }

  /** render() 每次重建 #page 的子节点；委托绑在 #page 本身，用标记防重复累积。 */
  function wire(page) {
    if (!page) return;
    if (!page.dataset.matWired) {
      page.dataset.matWired = '1';
      page.addEventListener('click', onClick);
      page.addEventListener('input', onInput);
      page.addEventListener('change', onChange);
      page.addEventListener('keydown', onKeydown);
    }
    if (!state.loaded && !state.loading) {
      state.loading = true;
      reload().then(() => {
        state.loading = false;
        if (isActive()) repaint();
      }).catch((err) => {
        state.loading = false;
        state.loaded = true;
        state.error = (err && err.message) || String(err);
        if (isActive()) repaint();
      });
    }
  }

  return {
    source, count, dims, stateFromDims, load,
    headHtml, toolbarHtml, bodyHtml, wire,
    parseManifest, parseCsv, parseMarkdown, normalizeEntry,
    dayOf, matched, exportJson, exportMarkdown,
    ui: state,
  };
})();

if (typeof window !== 'undefined') window.MATERIALS_VIEW = MATERIALS_VIEW;
