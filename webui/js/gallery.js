/* ==========================================================================
   画廊：把带预览图的词条集中陈列，可直接取用
   筛选统一走 webui/js/filter-engine.js（报告 3.4）：状态以 URL hash 为唯一来源。
   ========================================================================== */

const galleryUi = { q: '', cat: 'all', limit: 24 };

/* ── 筛选源（报告 3.4）────────────────────────────────────────────────
   画廊侧：分类（单选）+ 词条搜索。 */
const GALLERY_FILTER_SOURCE = FILTER_ENGINE.source('gallery', [
  { key: 'q', type: 'q', matchOf: (it, text) => {
    if (String(it.zh || '').toLowerCase().includes(text)) return true;
    return String(it.en || '').toLowerCase().includes(text);
  } },
  { key: 'cat', type: 'enum', valueOf: (it) => it.catId || '' },
]);

/* 词库是三层结构（分类 → 分组 → 词条），引擎要的是扁平列表。
   先展平一次并缓存 —— 展平结果不随筛选变化，筛选交给引擎。 */
let galleryFlatCache = null;
function galleryFlat() {
  if (galleryFlatCache) return galleryFlatCache;
  const out = [];
  for (const cat of VOCAB_CATEGORIES) {
    for (const g of cat.groups) {
      for (const it of g.items) {
        if (!it.preview) continue;
        out.push({ ...it, cat, catId: cat.id, group: g.name, position: cat.position });
      }
    }
  }
  galleryFlatCache = out;
  return out;
}

function galleryFilterState() {
  return {
    q: galleryUi.q || '',
    dims: { cat: galleryUi.cat === 'all' ? '' : (galleryUi.cat || '') },
  };
}

function galleryEntries() {
  return FILTER_ENGINE.filter(GALLERY_FILTER_SOURCE, galleryFlat(), galleryFilterState());
}

/* 筛选状态 → URL（ADR-0010） */
function writeGalleryFilterToUrl() {
  const hash = FILTER_ENGINE.buildHash(GALLERY_FILTER_SOURCE, 'gallery', galleryFilterState());
  if (location.hash !== hash) {
    try { history.replaceState(null, '', hash); } catch { location.hash = hash; }
  }
}

/* URL → 筛选状态 */
function readGalleryFilterFromUrl() {
  const parsed = FILTER_ENGINE.parseHash(GALLERY_FILTER_SOURCE, location.hash);
  const st = parsed.state;
  galleryUi.q = st.q || '';
  galleryUi.cat = (st.dims && st.dims.cat) || 'all';
  return parsed.ignored || [];
}

function galleryHeadHtml() {
  const total = VOCAB_CATEGORIES.reduce((s, c) => s + c.groups.reduce((t, g) => t + g.items.length, 0), 0);
  return `
    <div class="library-head" data-od-id="gallery-head">
      <h1>画廊</h1>
      <p class="lead">每一条词条配一张示例图与当初生成它的完整提示词。看中了就直接取用，不必回词库里翻。</p>
      <div class="head-meta">
        <span class="param-chip">示例 ${total}</span>
        <span class="param-chip">分类 ${VOCAB_CATEGORIES.length}</span>
      </div>
    </div>`;
}

function galleryToolbarHtml() {
  const list = galleryEntries();
  return `
    <div class="toolbar" data-od-id="gallery-toolbar">
      <div class="search">
        ${icon('search')}
        <input id="gal-search" type="search" aria-label="搜索词条"
          placeholder="搜索词条" value="${esc(galleryUi.q)}" autocomplete="off">
      </div>
      <div class="catnav" role="group" aria-label="按分类筛选" style="border:0;padding:0;gap:6px">
        <button class="catnav-btn" type="button" data-gal-cat="all" aria-pressed="${galleryUi.cat === 'all'}">全部</button>
        ${VOCAB_CATEGORIES.map(c => `<button class="catnav-btn" type="button" data-gal-cat="${esc(c.id)}" aria-pressed="${galleryUi.cat === c.id}">${esc(c.name)}</button>`).join('')}
      </div>
      <span class="spacer"></span>
      <span class="dock-count" role="status" aria-live="polite">${list.length} 张</span>
    </div>`;
}

function galleryBodyHtml() {
  const list = galleryEntries();
  if (!list.length) {
    return stateHtml({
      title: '没有匹配的示例',
      desc: '换个关键词，或者切回「全部」分类再看看。',
      iconName: 'image',
    });
  }
  const shown = list.slice(0, galleryUi.limit);
  const groups = new Map();
  for (const it of shown) {
    const key = it.cat.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return [...groups.entries()].map(([name, items]) => `
    <section class="group-block" data-od-id="gallery-${esc(name)}">
      <div class="group-head"><h2>${esc(name)}</h2><span class="n">${items.length} 张</span></div>
      <div class="gallery-grid">
        ${items.map(it => `
          <article class="gal-card" data-od-id="gal-${esc(it.id)}">
            <div class="gal-img">
              <img src="assets/vocab/${esc(it.cat.id)}/${esc(it.id)}.webp" alt="${esc(it.zh)} 的示例图" loading="lazy" decoding="async">
            </div>
            <div class="gal-body">
              <div class="gal-name">${esc(it.zh)}</div>
              <div class="gal-cat">${esc(it.en)} · ${esc(it.group)}</div>
              <p class="gal-gen">${esc(it.gen || '—')}</p>
              <div class="btn-row">
                <button class="btn btn-secondary" type="button" data-gal-add="${esc(it.id)}"
                  data-zh="${esc(it.zh)}" data-en="${esc(it.en)}"
                  data-position="${esc(it.position)}" data-category="${esc(it.cat.name)}"
                  aria-pressed="${isSelected(it.id)}" style="flex:1">${icon('plus')}${isSelected(it.id) ? '已取用' : '取用'}</button>
                <button class="btn btn-ghost" type="button" data-gal-copy="${esc(it.id)}" aria-label="复制 ${esc(it.zh)} 的示例提示词">${icon('copy')}</button>
              </div>
            </div>
          </article>`).join('')}
      </div>
    </section>`).join('')
    + (shown.length < list.length
      ? `<div style="text-align:center;margin-top:8px"><button class="btn btn-secondary" type="button" data-role="gal-more">加载更多（还有 ${list.length - shown.length} 张）</button></div>`
      : '');
}

function renderGallery() {
  const page = document.getElementById('page');
  if (!page) return;
  page.innerHTML = `
    ${galleryHeadHtml()}
    ${galleryToolbarHtml()}
    <div class="library-body" id="library-panel">${galleryBodyHtml()}</div>`;
  wireGallery();
  markImageStates(page);
}

function wireGallery() {
  const page = document.getElementById('page');
  const search = page.querySelector('#gal-search');
  if (search) {
    search.addEventListener('input', () => {
      galleryUi.q = search.value;
      galleryUi.limit = 24;
      writeGalleryFilterToUrl();
      const body = page.querySelector('#library-panel');
      if (!body) return;
      body.innerHTML = galleryBodyHtml();
      wireGalleryBody();
      const c = page.querySelector('.toolbar .dock-count');
      if (c) c.textContent = `${galleryEntries().length} 张`;
      markImageStates(body);
    });
  }
  page.querySelectorAll('[data-gal-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      galleryUi.cat = btn.dataset.galCat;
      galleryUi.limit = 24;
      writeGalleryFilterToUrl();
      renderGallery();
    });
  });
  wireGalleryBody();
}

function wireGalleryBody() {
  const body = document.getElementById('library-panel');
  if (!body) return;
  body.querySelectorAll('[data-gal-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      togglePrompt({
        id: btn.dataset.galAdd,
        zh: btn.dataset.zh,
        en: btn.dataset.en,
        position: btn.dataset.position || 'other',
        category: btn.dataset.category || '',
      });
      toast(isSelected(btn.dataset.galAdd) ? `已加入：${btn.dataset.zh}` : `已移出：${btn.dataset.zh}`);
    });
  });
  body.querySelectorAll('[data-gal-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      let gen = '';
      for (const cat of VOCAB_CATEGORIES) {
        for (const g of cat.groups) {
          const it = g.items.find(x => x.id === btn.dataset.galCopy);
          if (it) { gen = it.gen || ''; break; }
        }
      }
      if (!gen) { toast('这条词条没有记录生成提示词', 'close'); return; }
      copyText(gen, '示例提示词已复制');
    });
  });
  const more = body.querySelector('[data-role="gal-more"]');
  if (more) more.addEventListener('click', () => {
    galleryUi.limit += 24;
    body.innerHTML = galleryBodyHtml();
    wireGalleryBody();
    markImageStates(body);
  });
}

readGalleryFilterFromUrl();
boot('gallery.html');
renderGallery();
window.addEventListener('hashchange', () => {
  readGalleryFilterFromUrl();
  renderGallery();
});
