/* ==========================================================================
   工作台：左会话 Dock + 右提示词库
   库内五个分区：四个摄影词库分类 + 艺术家/摄影师。
   艺术家为全量词库（4,322 条）；预览图按需取，没有图的落回排版版位。
   ========================================================================== */

const ARTIST_TOTAL = ARTISTS.length;
const ARTIST_ILLUSTRATED = ARTISTS.filter(a => a.preview).length;
// 浏览顺序：先给有参考图的，再排纯文字条目
const ARTISTS_SORTED = [...ARTISTS].sort((a, b) => (a.preview ? 0 : 1) - (b.preview ? 0 : 1));
const VOCAB_TOTAL = VOCAB_CATEGORIES.reduce(
  (s, c) => s + c.groups.reduce((t, g) => t + g.items.length, 0), 0);

const TABS = [
  ...VOCAB_CATEGORIES.map(c => ({ id: c.id, label: c.name, kind: 'vocab' })),
  { id: 'artists', label: '艺术家 / 摄影师', kind: 'artists' },
  // 探索榜是提示词库的一个页签，不是独立页面（沿用原项目 ADR-0013）
  { id: 'explore', label: '探索榜', kind: 'explore' },
  // 研究笔记（报告 2.3）：观察记录与结论 —— 研究闭环的「记录」一段。
  // 计数是异步的（数据在本机 IndexedDB），空时显示 0。
  { id: 'research', label: '研究笔记', kind: 'research' },
];
const EXPLORE_TOTAL = EXPLORE_BATCHES.reduce((s, b) => s + b.jobs, 0);

const ui = {
  tab: 'artists',
  q: '',
  tested: false,
  terms: new Set(),
  colours: new Set(),
  artistCat: 'all',
  facetsOpen: false,
  limit: 48,
  /** URL 里带来的作业引用键（#explore?job=<key>）；渲染后用它直达灯箱（报告 2.1） */
  hashJob: null,
};

/* ── 筛选 ───────────────────────────────────────────────────────────── */
function filteredArtists() {
  const q = ui.q.trim().toLowerCase();
  return ARTISTS_SORTED.filter(a => {
    if (ui.artistCat !== 'all' && a.cat !== ui.artistCat) return false;
    if (ui.tested && !a.tested) return false;
    if (ui.terms.size && !a.terms.some(t => ui.terms.has(t))) return false;
    if (ui.colours.size && !a.colours.some(c => ui.colours.has(c))) return false;
    if (q && !a.name.toLowerCase().includes(q) && !String(a.en).toLowerCase().includes(q)) return false;
    return true;
  });
}
const visibleColours = () => {
  const used = new Set();
  ARTISTS.forEach(a => a.colours.forEach(c => used.add(c)));
  return COLOURS.filter(c => used.has(c.slug));
};
const termCount = (slug) => ARTISTS.reduce((n, a) => n + (a.terms.includes(slug) ? 1 : 0), 0);
const colourCount = (slug) => ARTISTS.reduce((n, a) => n + (a.colours.includes(slug) ? 1 : 0), 0);
const catName = (id) => ARTIST_CATEGORIES.find(c => c.id === id)?.name || id;
const tabCount = (t) => {
  if (t.kind === 'artists') return ARTIST_TOTAL;
  if (t.kind === 'explore') return EXPLORE_TOTAL;
  if (t.kind === 'research') {
    // 研究笔记的计数来自本机 IndexedDB（异步加载）；未加载时先显示 0
    return typeof RESEARCH_VIEW !== 'undefined' ? (RESEARCH_VIEW.ui.notes.length + RESEARCH_VIEW.ui.conclusions.length) : 0;
  }
  return VOCAB_CATEGORIES.find(c => c.id === t.id).groups.reduce((s, g) => s + g.items.length, 0);
};

/* 深链：#artists / #shutter-speed 直接落到某个分区；无 hash 时默认落在艺术家（与原产品一致）
   带参数：#explore?job=<key> —— 页签 id 与 query 参数分开解析（报告 2.1）。
   此前只把整个 hash 当页签 id 匹配，'explore?job=xxx' 匹配不上任何页签会被丢弃。 */
function readHash() {
  const raw = location.hash.replace(/^#\/?/, '').trim();
  const q = raw.indexOf('?');
  const id = (q === -1 ? raw : raw.slice(0, q)).trim();
  ui.tab = (id && TABS.some(t => t.id === id)) ? id : 'artists';
  ui.hashJob = q === -1 ? null : new URLSearchParams(raw.slice(q + 1)).get('job');
}

/* ── 片段 ───────────────────────────────────────────────────────────── */
function headHtml() {
  return `
    <div class="library-head" data-od-id="workbench-head">
      <h1>工作台</h1>
      <p class="lead">挑摄影术语、艺术家风格与光线方案，实时拼成一条可直接粘进 Midjourney 的提示词。</p>
      <div class="head-meta">
        <span class="param-chip">词条 ${VOCAB_TOTAL}</span>
        <span class="param-chip">艺术家 ${ARTIST_TOTAL.toLocaleString('zh-CN')}</span>
        <span class="param-chip">风格参考码 4,638</span>
      </div>
    </div>`;
}

function catnavHtml() {
  return `
    <div class="catnav" role="tablist" aria-label="提示词库分区" data-od-id="library-tabs">
      ${TABS.map(t => `
        <button class="catnav-btn" role="tab" type="button" id="tab-${esc(t.id)}" data-tab="${esc(t.id)}"
          aria-controls="library-panel" aria-selected="${ui.tab === t.id}"
          tabindex="${ui.tab === t.id ? '0' : '-1'}">
          ${esc(t.label)}<span class="n">${tabCount(t)}</span>
        </button>`).join('')}
    </div>`;
}

function toolbarHtml() {
  const isArtists = ui.tab === 'artists';
  return `
    <div class="toolbar" data-od-id="library-toolbar">
      <div class="search">
        ${icon('search')}
        <input id="lib-search" type="search" aria-label="${isArtists ? '搜索艺术家' : '搜索词条'}"
          placeholder="${isArtists ? '搜索艺术家名，例如 monet / puuung' : '搜索词条'}"
          value="${esc(ui.q)}" autocomplete="off">
      </div>
      ${isArtists ? `
        <button class="toggle${ui.tested ? ' on' : ''}" type="button" data-toggle="tested" aria-pressed="${ui.tested}">
          只看实测 <span class="n">${ARTISTS.reduce((n, a) => n + (a.tested ? 1 : 0), 0)}</span>
        </button>
        <button class="toggle${ui.facetsOpen ? ' on' : ''}" type="button" data-toggle="facets" aria-pressed="${ui.facetsOpen}"
          ${ui.facetsOpen ? 'aria-controls="facet-panel"' : ''}>${icon('sliders')}分面</button>
      ` : ''}
      <span class="spacer"></span>
      <span class="dock-count" id="result-count" role="status" aria-live="polite"></span>
    </div>`;
}

function facetsHtml() {
  if (ui.tab !== 'artists' || !ui.facetsOpen) return '';
  const colours = visibleColours();
  return `
    <div class="group-block" id="facet-panel" data-od-id="facet-panel"
      style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px">
      <div class="group-head"><h2>分面词</h2><span class="n">组内任一 · 组间全部</span></div>
      ${TERM_GROUPS.map(g => `
        <div style="margin-bottom:12px">
          <div class="slot-head" style="margin-bottom:6px">${esc(g.name)}</div>
          <div class="tag-grid" role="group" aria-label="${esc(g.name)}分面">
            ${g.terms.map(t => `
              <button class="tag${ui.terms.has(t.slug) ? ' on' : ''}" type="button" data-term="${esc(t.slug)}" aria-pressed="${ui.terms.has(t.slug)}">
                ${esc(t.label)}<span class="en">${termCount(t.slug)}</span>
              </button>`).join('')}
          </div>
        </div>`).join('')}
      <div class="group-head" style="margin-top:16px"><h2>主色</h2><span class="n">${ui.colours.size ? `已选 ${ui.colours.size}` : '按占比取前几色'}</span></div>
      <div class="swatches" style="gap:7px;flex-wrap:wrap" role="group" aria-label="按主色筛选">
        ${colours.map(c => `
          <button class="swatch" type="button" data-colour="${esc(c.slug)}" title="${esc(c.name)} · ${colourCount(c.slug)} 条"
            aria-label="${esc(c.name)}，${colourCount(c.slug)} 条" aria-pressed="${ui.colours.has(c.slug)}"
            style="width:20px;height:20px;background:${esc(c.hex)};${ui.colours.has(c.slug) ? 'box-shadow:0 0 0 2px var(--accent);' : ''}"></button>`).join('')}
      </div>
    </div>`;
}

function vocabBodyHtml() {
  const cat = VOCAB_CATEGORIES.find(c => c.id === ui.tab);
  if (!cat) return '';
  const q = ui.q.trim().toLowerCase();
  const groups = cat.groups
    .map(g => ({
      ...g,
      items: g.items.filter(it => !q || it.zh.toLowerCase().includes(q) || it.en.toLowerCase().includes(q)),
    }))
    .filter(g => g.items.length);
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  if (!total) {
    return stateHtml({
      title: `「${cat.name}」里没有匹配的词条`,
      desc: `当前共 ${cat.groups.reduce((s, g) => s + g.items.length, 0)} 条。换个关键词，或者清空搜索框再看看。`,
      iconName: 'search',
    });
  }
  return `
    ${cat.hint ? `<p class="dock-hint" style="margin-bottom:16px">${esc(cat.hint)}</p>` : ''}
    ${groups.map(g => `
      <section class="group-block" data-od-id="group-${esc(g.id)}">
        <div class="group-head"><h2>${esc(g.name)}</h2><span class="n">${g.items.length} 条</span></div>
        <div class="tag-grid" role="group" aria-label="${esc(g.name)}">
          ${g.items.map(it => `
            <button class="tag${isSelected(it.id) ? ' on' : ''}" type="button"
              data-item-id="${esc(it.id)}"
              data-zh="${esc(it.zh)}" data-en="${esc(it.en)}"
              aria-pressed="${isSelected(it.id)}"
              data-position="${esc(cat.position)}" data-category="${esc(cat.name)}"
              ${it.preview ? `data-preview="assets/vocab/${esc(cat.id)}/${esc(it.id)}.webp" data-gen="${esc(it.gen || '')}"` : ''}>
              ${esc(it.zh)}<span class="en">${esc(it.en)}</span>
            </button>`).join('')}
        </div>
      </section>`).join('')}`;
}

function artistCardHtml(a) {
  const on = isSelected(a.id);
  // 有参考图的给照片，没有的落回排版版位（生产环境按需取图，取不到也是这个结果）
  const media = a.preview
    ? `<span class="artist-thumb" data-plate-name="${esc(a.name)}">
         <img src="${esc(a.preview)}" alt="${esc(a.name)} 的风格预览图" loading="lazy" decoding="async">
         ${a.tested ? '<span class="badge">实测</span>' : ''}
         ${a.pick ? '<span class="badge pick">精选</span>' : ''}
       </span>`
    : `<span class="artist-thumb is-plate" data-plate-name="${esc(a.name)}">
         <span class="plate-name">${esc(a.name)}</span>
         ${a.tested ? '<span class="badge">实测</span>' : ''}
         ${a.pick ? '<span class="badge pick">精选</span>' : ''}
       </span>`;
  return `
    <article class="artist-card${on ? ' on' : ''}" data-od-id="artist-card-${esc(a.id)}">
      <button class="artist-pick" type="button"
        data-item-id="${esc(a.id)}"
        aria-pressed="${on}"
        data-zh="${esc(a.name)}" data-en="${esc(a.en)}"
        data-position="artist" data-category="${esc(catName(a.cat))}">
        ${media}
        <span class="artist-body">
          ${a.preview ? `<span class="artist-name">${esc(a.name)}</span>` : ''}
          <span class="artist-meta">${esc(catName(a.cat))}</span>
          <span class="artist-intro">${esc(a.intro)}</span>
          <span class="swatches" aria-hidden="true">
            ${a.colours.map(slug => {
              const c = COLOURS.find(x => x.slug === slug);
              return c ? `<span class="swatch" style="background:${esc(c.hex)}" title="${esc(c.name)}"></span>` : '';
            }).join('')}
          </span>
        </span>
      </button>
      <button class="artist-more" type="button" data-detail="${esc(a.id)}" aria-label="查看 ${esc(a.name)} 的详情">${icon('info')}</button>
    </article>`;
}

function artistBodyHtml() {
  const list = filteredArtists();
  if (!list.length) {
    return stateHtml({
      title: '没有匹配的艺术家',
      desc: '当前筛选条件下没有结果。取消「只看实测」或清空分面词试试。',
      iconName: 'search',
    });
  }
  const shown = list.slice(0, ui.limit);
  return `
    <div class="group-block">
      <div class="group-head">
        <h2>艺术家 / 摄影师</h2>
        <span class="n">显示 ${shown.length} / ${list.length} 条 · 词库共 ${ARTIST_TOTAL.toLocaleString('zh-CN')} 条，其中 ${ARTIST_ILLUSTRATED} 条带参考图</span>
      </div>
      <div class="tag-grid" style="margin-bottom:16px" role="group" aria-label="艺术家类别">
        <button class="catnav-btn" type="button" data-artist-cat="all" aria-pressed="${ui.artistCat === 'all'}">全部<span class="n">${ARTIST_TOTAL}</span></button>
        ${ARTIST_CATEGORIES.map(c => `
          <button class="catnav-btn" type="button" data-artist-cat="${esc(c.id)}" aria-pressed="${ui.artistCat === c.id}">
            ${esc(c.name)}<span class="n">${c.count}</span>
          </button>`).join('')}
      </div>
      <div class="artist-grid">
        ${shown.map(artistCardHtml).join('')}
      </div>
      ${shown.length < list.length ? `<div style="margin-top:20px;text-align:center"><button class="btn btn-secondary" type="button" data-role="more">加载更多（还有 ${(list.length - shown.length).toLocaleString('zh-CN')} 条）</button></div>` : ''}
    </div>`;
}

function bodyHtml() {
  return ui.tab === 'artists' ? facetsHtml() + artistBodyHtml() : vocabBodyHtml();
}

/* ── 艺术家详情 ─────────────────────────────────────────────────────── */
function openArtistSheet(id) {
  const a = ARTISTS.find(x => x.id === id);
  if (!a) return;
  const terms = a.terms.map(slug => {
    const t = TERM_GROUPS.flatMap(g => g.terms).find(x => x.slug === slug);
    return t ? t.label : slug;
  });
  const { backdrop } = mountDialog(`
    <div class="sheet" data-od-id="artist-sheet">
      <div class="sheet-head">
        <div style="flex:1">
          <p class="eyebrow">${esc(catName(a.cat))}${a.tested ? ' · 实测' : ''}${a.pick ? ' · 精选' : ''}</p>
          <h2 class="artist-sheet-name">${esc(a.name)}</h2>
        </div>
        <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="artist-sheet-grid">
        <div>
          ${a.preview
      ? `<img src="${esc(a.preview)}" alt="${esc(a.name)} 的风格预览图">`
      : `<div class="artist-thumb is-plate" style="aspect-ratio:4/3;border-radius:8px;border:1px solid var(--border)"><span class="plate-name">${esc(a.name)}</span></div>`}
          <div class="btn-row" style="margin-top:12px">
            <button class="btn ${isSelected(a.id) ? 'btn-secondary' : 'btn-primary'}" type="button" data-role="pick" style="flex:1">
              ${icon(isSelected(a.id) ? 'check' : 'plus')}${isSelected(a.id) ? '已在提示词中' : '加入提示词'}
            </button>
          </div>
          ${a.url ? `<p class="dock-hint" style="margin-top:10px"><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">在上游 Midlibrary 查看${icon('external')}</a></p>` : ''}
        </div>
        <div>
          <div class="artist-sheet-block" style="margin-top:0">
            <h3>简介</h3>
            <p>${esc(a.intro || '上游没有提供这条简介。')}</p>
          </div>
          ${a.observation ? `
            <div class="artist-sheet-block">
              <h3>风格描述</h3>
              <p>${esc(a.observation)}</p>
            </div>` : ''}
          ${terms.length ? `
            <div class="artist-sheet-block">
              <h3>分面词</h3>
              <div class="term-row">${terms.map(t => `<span class="term">${esc(t)}</span>`).join('')}</div>
            </div>` : ''}
          ${a.colours.length ? `
            <div class="artist-sheet-block">
              <h3>主色</h3>
              <div class="swatches" style="gap:8px">
                ${a.colours.map(slug => {
                  const c = COLOURS.find(x => x.slug === slug);
                  return c ? `<span class="swatch" style="width:18px;height:18px;background:${esc(c.hex)}" title="${esc(c.name)}"></span>` : '';
                }).join('')}
              </div>
            </div>` : ''}
          <div class="artist-sheet-block">
            <h3>提示词写法</h3>
            <div class="param-tail-box" style="margin-top:0">photography by ${esc(a.en)}</div>
          </div>
        </div>
      </div>
    </div>`, { label: `${a.name} 的详情` });

  backdrop.querySelector('[data-role="pick"]').addEventListener('click', () => {
    togglePrompt({
      id: a.id, zh: a.name, en: a.en, position: 'artist', category: catName(a.cat),
    });
    toast(isSelected(a.id) ? `已加入艺术家：${a.name}` : `已移出：${a.name}`);
  });
}

/* ── 渲染 ───────────────────────────────────────────────────────────── */
function render() {
  const page = document.getElementById('page');
  if (!page) return;
  const isExplore = ui.tab === 'explore';
  const isResearch = ui.tab === 'research';
  page.innerHTML = `
    ${isExplore ? EXPLORE_BOARD.headHtml() : isResearch ? RESEARCH_VIEW.headHtml() : headHtml()}
    ${catnavHtml()}
    ${isExplore ? EXPLORE_BOARD.toolbarHtml() : isResearch ? RESEARCH_VIEW.toolbarHtml() : toolbarHtml()}
    <div class="library-body" id="library-panel" role="tabpanel" aria-labelledby="tab-${esc(ui.tab)}" tabindex="0">
      ${isExplore ? EXPLORE_BOARD.bodyHtml() : isResearch ? RESEARCH_VIEW.bodyHtml() : bodyHtml()}
    </div>`;
  wire();
  if (isExplore) {
    EXPLORE_BOARD.wire(page);
    markImageStates(page);
    // 深链直达：#explore?job=<key> → 打开那条作业的灯箱（报告 2.1）
    // 只在确实有 key 时触发；openJobByKey 内部用 replaceState 回写地址栏，
    // 不会触发 hashchange → 不会重渲染 → 不递归。
    if (ui.hashJob) {
      const key = ui.hashJob;
      ui.hashJob = null;
      EXPLORE_BOARD.openJobByKey(key);
    }
  } else if (isResearch) {
    // 研究笔记的数据在本机 IndexedDB，是异步的 —— 先渲染骨架，再拉数据后重绘。
    RESEARCH_VIEW.wire(page);
    RESEARCH_VIEW.load().then(() => {
      if (ui.tab !== 'research') return;
      render();
    });
  } else {
    updateCount();
    markImageStates(page);
  }
}

function updateCount() {
  const el = document.getElementById('result-count');
  if (!el) return;
  if (ui.tab === 'artists') {
    el.textContent = `${filteredArtists().length.toLocaleString('zh-CN')} 条匹配`;
  } else if (ui.tab !== 'explore' && ui.tab !== 'research') {
    const cat = VOCAB_CATEGORIES.find(c => c.id === ui.tab);
    const total = cat ? cat.groups.reduce((s, g) => s + g.items.length, 0) : 0;
    el.textContent = ui.q ? `${total} 条中匹配` : `${total} 条`;
  }
}

function syncSelection() {
  document.querySelectorAll('[data-item-id]').forEach(el => {
    const on = isSelected(el.dataset.itemId);
    el.classList.toggle('on', on);
    el.setAttribute('aria-pressed', String(on));
    const card = el.closest('.artist-card');
    if (card) card.classList.toggle('on', on);
  });
}

/* ── 预览浮窗 ───────────────────────────────────────────────────────── */
const pop = document.createElement('div');
pop.className = 'preview-pop';
pop.style.display = 'none';
document.body.appendChild(pop);
let popTimer = null;

function showPop(el) {
  const src = el.dataset.preview;
  if (!src) return;
  clearTimeout(popTimer);
  popTimer = setTimeout(() => {
    const gen = el.dataset.gen || '';
    pop.innerHTML = `<img src="${esc(src)}" alt="${esc(el.dataset.zh)} 的预览图"><div class="cap"><div class="t">${esc(gen.slice(0, 140) || '—')}</div></div>`;
    pop.style.display = 'block';
    const r = el.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(12, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 12));
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }, 220);
}
function hidePop() {
  clearTimeout(popTimer);
  pop.style.display = 'none';
}

/* ── 事件 ───────────────────────────────────────────────────────────── */
function wire() {
  const page = document.getElementById('page');

  page.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      ui.tab = btn.dataset.tab;
      ui.q = '';
      ui.limit = 48;
      if (location.hash.replace(/^#\/?/, '') !== ui.tab) location.hash = `#${ui.tab}`;
      render();
    });
    // 页签之间用方向键移动焦点
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const i = TABS.findIndex(t => t.id === btn.dataset.tab);
      let next = i;
      if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
      else if (e.key === 'Home') next = 0;
      else next = TABS.length - 1;
      ui.tab = TABS[next].id;
      location.hash = `#${ui.tab}`;
      render();
      const el = document.getElementById(`tab-${TABS[next].id}`);
      if (el) el.focus();
    });
  });

  const search = document.getElementById('lib-search');
  if (search) {
    search.addEventListener('input', () => {
      ui.q = search.value;
      ui.limit = 48;
      const body = document.getElementById('library-panel');
      if (!body) return;
      body.innerHTML = bodyHtml();
      wireBody();
      updateCount();
      markImageStates(body);
    });
  }

  page.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.toggle;
      if (kind === 'tested') ui.tested = !ui.tested;
      else ui.facetsOpen = !ui.facetsOpen;
      render();
    });
  });

  wireBody();
}

function wireBody() {
  const body = document.getElementById('library-panel');
  if (!body) return;

  body.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', () => {
      togglePrompt({
        id: el.dataset.itemId,
        zh: el.dataset.zh,
        en: el.dataset.en,
        position: el.dataset.position || 'other',
        category: el.dataset.category || '',
      });
    });
    if (el.dataset.preview) {
      el.addEventListener('mouseenter', () => showPop(el));
      el.addEventListener('mouseleave', hidePop);
      el.addEventListener('focus', () => showPop(el));
      el.addEventListener('blur', hidePop);
    }
  });

  body.querySelectorAll('[data-detail]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openArtistSheet(el.dataset.detail);
    });
  });

  body.querySelectorAll('[data-term]').forEach(el => {
    el.addEventListener('click', () => {
      const s = el.dataset.term;
      if (ui.terms.has(s)) ui.terms.delete(s); else ui.terms.add(s);
      render();
    });
  });
  body.querySelectorAll('[data-colour]').forEach(el => {
    el.addEventListener('click', () => {
      const s = el.dataset.colour;
      if (ui.colours.has(s)) ui.colours.delete(s); else ui.colours.add(s);
      render();
    });
  });
  body.querySelectorAll('[data-artist-cat]').forEach(el => {
    el.addEventListener('click', () => {
      ui.artistCat = el.dataset.artistCat;
      ui.limit = 48;
      render();
    });
  });
  const more = body.querySelector('[data-role="more"]');
  if (more) more.addEventListener('click', () => { ui.limit += 48; render(); });
}

window.addEventListener('scroll', hidePop, true);
window.addEventListener('hashchange', () => { readHash(); render(); });

// 研究数据变化（灯箱里写了观察 / 研究视图里改了记录）→ 页签计数与列表同步刷新。
// 只在研究页签或探索榜页签时重绘，避免在别的页签上做无谓的整页渲染。
document.addEventListener('researchchange', () => {
  if (ui.tab === 'research') render();
  else {
    const el = document.querySelector('#tab-research .n');
    if (el && typeof RESEARCH_VIEW !== 'undefined') {
      el.textContent = String(RESEARCH_VIEW.ui.notes.length + RESEARCH_VIEW.ui.conclusions.length);
    }
  }
});

readHash();
boot('index.html');
onChange(syncSelection);
render();
