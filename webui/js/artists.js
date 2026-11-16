/* ==========================================================================
   艺术家库独立页：Midlibrary 艺术家 / 摄影师全量索引（4,322 条）。
   原为工作台「提示词库」下的二级页签，按 ADR-0033 升为顶栏一级独立页，
   与「工作台」并列；工作台原位置保留「艺术家库 ↗」路标。

   筛选统一走 webui/js/filter-engine.js（报告 3.4）：状态以 URL hash 为唯一来源
   （ADR-0010），刷新 / 后退 / 分享都能复现。hash 格式沿用旧页签的
   #artists?...，所以 index.html#artists?q=... 的旧深链可原样带参数跳过来。

   维度：
     · q         → 名称 / 英文名 / 类别名
     · artistCat → enum（11 类，单选，进 URL —— 旧页签只在内存，刷新就丢）
     · terms     → multi + groupOf（组内任一、组间全部）
     · colours   → multi（多选取并集）
     · tested    → bool
   排序不是筛选维度，但仍写进 hash 以便复现。本数据源没有创建时间，
   所以只有「默认（有图在前）」与「A → Z」，不编造「最新收录」。

   卡片沿用 artist-* 一套 CSS（与工作台旧页签、风格库、类型库同形态）：
   整卡点击 = 加进提示词（position:'artist' 单选槽，摄影前缀 `by <艺术家>` 依赖它），
   右上角一个「详情」按钮。风格码那种「复制 --sref」动作不适用于艺术家。
   ========================================================================== */

const ARTIST_TOTAL = ARTISTS.length;
const ARTIST_TESTED = ARTISTS.filter((a) => a.tested).length;
const ARTIST_ILLUSTRATED = ARTISTS.filter((a) => !!a.preview).length;

/** 分面词 slug → 所属组 id。实测 68 词零跨组，所以这张表不丢信息。 */
const ARTIST_TERM_GROUP = {};
for (const g of TERM_GROUPS) {
  for (const t of g.terms) ARTIST_TERM_GROUP[t.slug] = g.id;
}

const artistCatName = (id) => ARTIST_CATEGORIES.find((c) => c.id === id)?.name || id;

const artistUi = {
  q: '',
  limit: 48,
  terms: new Set(),
  colours: new Set(),
  tested: false,
  artistCat: 'all',
  sort: 'curated', // curated = 有图在前；az = A → Z
  facetsOpen: false,
};

/* ── 筛选源 ─────────────────────────────────────────────────────────── */
const ARTIST_FILTER_SOURCE = FILTER_ENGINE.source('artists', [
  {
    key: 'q', type: 'q', matchOf: (a, text) => {
      if (String(a.name || '').toLowerCase().includes(text)) return true;
      if (String(a.en || '').toLowerCase().includes(text)) return true;
      return String(artistCatName(a.cat)).toLowerCase().includes(text);
    },
  },
  { key: 'artistCat', type: 'enum', valueOf: (a) => a.cat || '' },
  { key: 'terms', type: 'multi', valuesOf: (a) => a.terms || [], groupOf: (v) => ARTIST_TERM_GROUP[v] || '' },
  { key: 'colours', type: 'multi', valuesOf: (a) => a.colours || [] },
  { key: 'tested', type: 'bool', activeOf: (a) => !!a.tested },
]);

function artistFilterState() {
  return {
    q: artistUi.q || '',
    dims: {
      // 'all' 表示不筛选；引擎的 enum 只要非空就会比对，所以这里映射成空串。
      artistCat: artistUi.artistCat === 'all' ? '' : artistUi.artistCat,
      terms: [...artistUi.terms],
      colours: [...artistUi.colours],
      tested: !!artistUi.tested,
    },
  };
}

function sortArtists(list) {
  const arr = [...list];
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'en');
  if (artistUi.sort === 'az') return arr.sort(byName);
  // 默认：有参考图的在前，同档按名称排（顺序稳定，不做随机洗牌）
  return arr.sort((a, b) => ((b.preview ? 1 : 0) - (a.preview ? 1 : 0)) || byName(a, b));
}

function filteredArtists() {
  return sortArtists(FILTER_ENGINE.filter(ARTIST_FILTER_SOURCE, ARTISTS, artistFilterState()));
}

function artistFacetCounts(dimKey) {
  return FILTER_ENGINE.counts(ARTIST_FILTER_SOURCE, ARTISTS, artistFilterState(), dimKey);
}

/* URL（ADR-0010）：hash 是唯一状态源。排序不进引擎白名单，单独拼。 */
function writeArtistFilterToUrl() {
  const hash = FILTER_ENGINE.buildHash(ARTIST_FILTER_SOURCE, 'artists', artistFilterState());
  const sep = hash.includes('?') ? '&' : '?';
  const full = artistUi.sort !== 'curated'
    ? `${hash}${sep}sort=${encodeURIComponent(artistUi.sort)}`
    : hash;
  if (location.hash !== full) {
    try { history.replaceState(null, '', full); } catch { location.hash = full; }
  }
}

function readArtistFilterFromUrl() {
  const parsed = FILTER_ENGINE.parseHash(ARTIST_FILTER_SOURCE, location.hash);
  const st = parsed.state;
  artistUi.q = st.q || '';
  artistUi.artistCat = (st.dims && st.dims.artistCat) || 'all';
  artistUi.terms = new Set((st.dims && st.dims.terms) || []);
  artistUi.colours = new Set((st.dims && st.dims.colours) || []);
  artistUi.tested = !!(st.dims && st.dims.tested);
  const m = location.hash.match(/[?&]sort=([^&]*)/);
  artistUi.sort = m && decodeURIComponent(m[1]) === 'az' ? 'az' : 'curated';
  return parsed.ignored || [];
}

/* ── 界面 ──────────────────────────────────────────────────────────────── */
function artistHeadHtml() {
  const chosen = session.selected.find((s) => s.position === 'artist');
  return `
    <div class="library-head" data-od-id="artist-head">
      <h1>艺术家库</h1>
      <p class="lead">按创作者挑风格。选中一位会进入会话的「艺术家」槽，自动写在提示词的摄影前缀里；再选一位会替换前一位。</p>
      <div class="head-meta">
        <span class="param-chip">艺术家 ${ARTIST_TOTAL.toLocaleString('zh-CN')}</span>
        <span class="param-chip">带参考图 ${ARTIST_ILLUSTRATED.toLocaleString('zh-CN')}</span>
        <span class="param-chip">实测 ${ARTIST_TESTED.toLocaleString('zh-CN')}</span>
        <span class="param-chip" data-od-id="artist-slot">当前艺术家：${chosen ? esc(chosen.zh) : '未选'}</span>
      </div>
    </div>`;
}

function artistToolbarHtml() {
  const list = filteredArtists();
  return `
    <div class="toolbar" data-od-id="artist-toolbar">
      <div class="search" style="flex:1 1 220px;max-width:320px">
        ${icon('search')}
        <input id="artist-search" type="search" aria-label="搜索艺术家、摄影师或类别"
          placeholder="搜索艺术家 / 摄影师" value="${esc(artistUi.q)}" autocomplete="off">
      </div>
      <button class="toggle${artistUi.tested ? ' on' : ''}" type="button" data-toggle="tested" aria-pressed="${artistUi.tested}">
        只看实测 <span class="n">${ARTIST_TESTED}</span>
      </button>
      <button class="toggle${artistUi.facetsOpen ? ' on' : ''}" type="button" data-toggle="facets" aria-pressed="${artistUi.facetsOpen}"
        ${artistUi.facetsOpen ? 'aria-controls="artist-facet-panel"' : ''}>${icon('sliders')}分面</button>
      <label class="toggle" style="gap:6px">
        <span class="visually-hidden" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">排序</span>
        <select id="artist-sort" class="select" aria-label="排序方式" style="border:0;background:transparent;padding:0;font-size:12.5px;color:inherit">
          <option value="curated"${artistUi.sort === 'curated' ? ' selected' : ''}>默认（有图在前）</option>
          <option value="az"${artistUi.sort === 'az' ? ' selected' : ''}>A → Z</option>
        </select>
      </label>
      <span class="spacer"></span>
      <span class="dock-count" role="status" aria-live="polite">${list.length.toLocaleString('zh-CN')} 条</span>
    </div>`;
}

/* 类别条：11 类单选，enum 维度进 URL。计数按当前其它条件下的整链试算。 */
function artistCategoryHtml() {
  const counts = artistFacetCounts('artistCat');
  return `
    <div class="tag-grid" style="margin:0 0 16px" role="group" aria-label="艺术家类别" data-od-id="artist-cats">
      ${['all', ...ARTIST_CATEGORIES.map((c) => c.id)].map((id) => {
    const active = artistUi.artistCat === id;
    const label = id === 'all' ? '全部' : artistCatName(id);
    const n = id === 'all' ? filteredArtists().length : (counts.get(id) || 0);
    return `<button class="catnav-btn${active ? ' on' : ''}" type="button" data-artist-cat="${esc(id)}" aria-pressed="${active}">
        ${esc(label)}<span class="n">${n.toLocaleString('zh-CN')}</span></button>`;
  }).join('')}
    </div>`;
}

/* 分面面板：按组列实际被用到的词（68 词 / 10 组）+ 用到的主色（87 色）。
   选项数字 = 在当前其它条件下再打开该项会得到的条数；零计数置灰但仍显示。 */
function artistFacetsHtml() {
  if (!artistUi.facetsOpen) return '';
  const termCounts = artistFacetCounts('terms');
  const colourCounts = artistFacetCounts('colours');
  return `
    <div class="group-block" id="artist-facet-panel" data-od-id="artist-facet-panel"
      style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px">
      <div class="group-head"><h2>分面词</h2><span class="n">组内任一 · 组间全部</span></div>
      ${TERM_GROUPS.map((g) => `
        <div style="margin-bottom:12px">
          <div class="slot-head" style="margin-bottom:6px">${esc(g.name)}</div>
          <div class="tag-grid" role="group" aria-label="${esc(g.name)}分面">
            ${g.terms.map((t) => {
    const n = termCounts.get(t.slug) || 0;
    const on = artistUi.terms.has(t.slug);
    return `<button class="tag${on ? ' on' : ''}" type="button" data-term="${esc(t.slug)}"
                aria-pressed="${on}"${n === 0 && !on ? ' disabled' : ''}>${esc(t.label)}<span class="en">${n}</span></button>`;
  }).join('')}
          </div>
        </div>`).join('')}
      <div class="group-head" style="margin-top:16px"><h2>主色</h2><span class="n">${artistUi.colours.size ? `已选 ${artistUi.colours.size}` : '多选取并集'}</span></div>
      <div class="swatches" style="gap:7px;flex-wrap:wrap" role="group" aria-label="按主色筛选">
        ${COLOURS.map((c) => {
    const n = colourCounts.get(c.slug) || 0;
    const on = artistUi.colours.has(c.slug);
    return `<button class="swatch" type="button" data-colour="${esc(c.slug)}"
            title="${esc(c.name)} · ${n} 条" aria-label="${esc(c.name)}，${n} 条"
            aria-pressed="${on}"${n === 0 && !on ? ' disabled' : ''}
            style="width:20px;height:20px;background:${esc(c.hex)};${on ? 'box-shadow:0 0 0 2px var(--accent);' : ''}${n === 0 && !on ? 'opacity:.35;cursor:not-allowed;' : ''}"></button>`;
  }).join('')}
      </div>
    </div>`;
}

/* 卡片：整卡点击 = 加进提示词；右上角只有「详情」按钮。
   参考图在 data 里已是完整 ../public/ 路径（ADR-0033 生成链），不再二次拼。 */
function artistCardHtml(a) {
  const on = isSelected(a.id);
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
        data-item-id="${esc(a.id)}" aria-pressed="${on}"
        data-zh="${esc(a.name)}" data-en="${esc(a.en)}"
        data-position="artist" data-category="${esc(artistCatName(a.cat))}"
        title="${on ? '已在提示词中，点击移出' : '加入提示词'}">
        ${media}
        <span class="artist-body">
          ${a.preview ? `<span class="artist-name">${esc(a.name)}</span>` : ''}
          <span class="artist-meta">${esc(artistCatName(a.cat))}</span>
          <span class="artist-intro">${esc(a.intro)}</span>
          <span class="swatches" aria-hidden="true">
            ${(a.colours || []).map((slug) => {
    const c = COLOURS.find((x) => x.slug === slug);
    return c ? `<span class="swatch" style="background:${esc(c.hex)}" title="${esc(c.name)}"></span>` : '';
  }).join('')}
          </span>
        </span>
      </button>
      <button class="artist-more" type="button" data-detail="${esc(a.id)}"
        aria-label="查看 ${esc(a.name)} 的详情" title="详情">${icon('info')}</button>
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
  const shown = list.slice(0, artistUi.limit);
  return `
    <div class="group-block">
      <div class="group-head">
        <h2>艺术家 / 摄影师</h2>
        <span class="n">显示 ${shown.length.toLocaleString('zh-CN')} / ${list.length.toLocaleString('zh-CN')} 条 · 词库共 ${ARTIST_TOTAL.toLocaleString('zh-CN')} 条，其中 ${ARTIST_ILLUSTRATED.toLocaleString('zh-CN')} 条带参考图${artistUi.sort === 'az' ? ' · 按名称排序' : ''}</span>
      </div>
      <div class="artist-grid">
        ${shown.map(artistCardHtml).join('')}
      </div>
      ${shown.length < list.length ? `<div style="margin-top:20px;text-align:center"><button class="btn btn-secondary" type="button" data-role="artist-more-list">加载更多（还有 ${(list.length - shown.length).toLocaleString('zh-CN')} 条）</button></div>` : ''}
    </div>`;
}

/* ── 详情弹层 ─────────────────────────────────────────────────────────── */
function openArtistSheet(id) {
  const a = ARTISTS.find((x) => x.id === id);
  if (!a) return;
  const byGroup = [];
  for (const slug of (a.terms || [])) {
    const g = TERM_GROUPS.find((x) => x.terms.some((t) => t.slug === slug));
    const t = g && g.terms.find((x) => x.slug === slug);
    const name = t ? t.label : slug;
    let bucket = byGroup.find((x) => x.name === (g ? g.name : '其它'));
    if (!bucket) { bucket = { name: g ? g.name : '其它', items: [] }; byGroup.push(bucket); }
    bucket.items.push(name);
  }
  const { backdrop } = mountDialog(`
    <div class="sheet" data-od-id="artist-sheet">
      <div class="sheet-head">
        <div style="flex:1">
          <p class="eyebrow">${esc(artistCatName(a.cat))}${a.tested ? ' · 实测' : ''}${a.pick ? ' · 精选' : ''}</p>
          <h2 class="artist-sheet-name">${esc(a.name)}</h2>
        </div>
        <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="artist-sheet-grid">
        <div>
          ${a.preview
    ? `<img src="${esc(a.preview)}" alt="${esc(a.name)} 的风格预览图">`
    : `<div class="artist-thumb is-plate" style="aspect-ratio:1/1;border-radius:8px;border:1px solid var(--border)"><span class="plate-name">${esc(a.name)}</span></div>`}
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
          ${byGroup.length ? `
            <div class="artist-sheet-block">
              <h3>分面词</h3>
              ${byGroup.map((g) => `
                <div style="margin-bottom:8px">
                  <div class="slot-head" style="margin-bottom:4px">${esc(g.name)}</div>
                  <div class="term-row">${g.items.map((t) => `<span class="term">${esc(t)}</span>`).join('')}</div>
                </div>`).join('')}
            </div>` : ''}
          ${(a.colours || []).length ? `
            <div class="artist-sheet-block">
              <h3>主色</h3>
              <div class="swatches" style="gap:8px">
                ${a.colours.map((slug) => {
    const c = COLOURS.find((x) => x.slug === slug);
    return c ? `<span class="swatch" style="width:18px;height:18px;background:${esc(c.hex)}" title="${esc(c.name)}"></span>` : '';
  }).join('')}
              </div>
            </div>` : ''}
          <div class="artist-sheet-block">
            <h3>提示词写法</h3>
            <div class="param-tail-box" style="margin-top:0">${esc(photographyPrefix([a.en]))}</div>
          </div>
        </div>
      </div>
    </div>`, { label: `${a.name} 的详情` });

  backdrop.querySelector('[data-role="pick"]').addEventListener('click', () => {
    togglePrompt({ id: a.id, zh: a.name, en: a.en, position: 'artist', category: artistCatName(a.cat) });
    toast(isSelected(a.id) ? `已加入艺术家：${a.name}` : `已移出：${a.name}`);
  });
}

/* ── 渲染与接线 ────────────────────────────────────────────────────────── */
function renderArtists() {
  const page = document.getElementById('page');
  if (!page) return;
  page.innerHTML = `
    ${artistHeadHtml()}
    ${artistToolbarHtml()}
    <div id="artist-extra-slot" data-od-id="artist-extra-slot">
      ${artistCategoryHtml()}
      <div id="artist-facet-slot" data-od-id="artist-facet-slot">${artistFacetsHtml()}</div>
    </div>
    <div class="library-body" id="library-panel" role="region"
      aria-label="艺术家与摄影师" tabindex="0">${artistBodyHtml()}</div>`;
  wireArtists();
  markImageStates(page);
  syncArtistSelection();
}

/* 只重绘筛选区与结果区，不动搜索框（避免失焦）。
   分面面板走固定插槽：面板关闭时节点不存在，必须整块重写插槽内容。 */
function refreshArtistResults() {
  const page = document.getElementById('page');
  if (!page) return;
  const panel = page.querySelector('#library-panel');
  if (panel) {
    panel.innerHTML = artistBodyHtml();
    wireArtistBody(panel);
    markImageStates(panel);
    syncArtistSelection();
  }
  const extra = page.querySelector('#artist-extra-slot');
  if (extra) {
    extra.innerHTML = `${artistCategoryHtml()}<div id="artist-facet-slot" data-od-id="artist-facet-slot">${artistFacetsHtml()}</div>`;
    wireArtistExtras(extra);
  }
  const c = page.querySelector('.toolbar .dock-count');
  if (c) c.textContent = `${filteredArtists().length.toLocaleString('zh-CN')} 条`;
  const tested = page.querySelector('[data-toggle="tested"]');
  if (tested) {
    tested.classList.toggle('on', artistUi.tested);
    tested.setAttribute('aria-pressed', String(artistUi.tested));
  }
  const facets = page.querySelector('[data-toggle="facets"]');
  if (facets) {
    facets.classList.toggle('on', artistUi.facetsOpen);
    facets.setAttribute('aria-pressed', String(artistUi.facetsOpen));
    if (artistUi.facetsOpen) facets.setAttribute('aria-controls', 'artist-facet-panel');
    else facets.removeAttribute('aria-controls');
  }
}

/* 会话变化（在别处加进/移出艺术家）后同步卡片选中态与头部槽位提示 */
function syncArtistSelection() {
  document.querySelectorAll('[data-item-id]').forEach((el) => {
    const on = isSelected(el.dataset.itemId);
    el.setAttribute('aria-pressed', String(on));
    const card = el.closest('.artist-card');
    if (card) card.classList.toggle('on', on);
  });
  const slot = document.querySelector('[data-od-id="artist-slot"]');
  if (slot) {
    const a = session.selected.find((s) => s.position === 'artist');
    slot.textContent = `当前艺术家：${a ? a.zh : '未选'}`;
  }
}

function wireArtists() {
  const page = document.getElementById('page');
  if (!page) return;

  const search = page.querySelector('#artist-search');
  if (search) {
    search.addEventListener('input', () => {
      artistUi.q = search.value;
      artistUi.limit = 48;
      writeArtistFilterToUrl();
      refreshArtistResults();
    });
  }

  const sort = page.querySelector('#artist-sort');
  if (sort) {
    sort.addEventListener('change', () => {
      artistUi.sort = sort.value === 'az' ? 'az' : 'curated';
      writeArtistFilterToUrl();
      refreshArtistResults();
    });
  }

  page.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      if (key === 'tested') artistUi.tested = !artistUi.tested;
      else if (key === 'facets') artistUi.facetsOpen = !artistUi.facetsOpen;
      else return;
      writeArtistFilterToUrl();
      refreshArtistResults();
    });
  });

  wireArtistExtras(page);
  const panel = page.querySelector('#library-panel');
  if (panel) wireArtistBody(panel);
}

function wireArtistExtras(root) {
  root.querySelectorAll('[data-artist-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      artistUi.artistCat = btn.dataset.artistCat;
      artistUi.limit = 48;
      writeArtistFilterToUrl();
      refreshArtistResults();
    });
  });
  root.querySelectorAll('[data-term]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.term;
      if (artistUi.terms.has(s)) artistUi.terms.delete(s);
      else artistUi.terms.add(s);
      artistUi.limit = 48;
      writeArtistFilterToUrl();
      refreshArtistResults();
    });
  });
  root.querySelectorAll('[data-colour]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.colour;
      if (artistUi.colours.has(s)) artistUi.colours.delete(s);
      else artistUi.colours.add(s);
      artistUi.limit = 48;
      writeArtistFilterToUrl();
      refreshArtistResults();
    });
  });
}

function wireArtistBody(root) {
  root.querySelectorAll('[data-item-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const a = ARTISTS.find((x) => x.id === el.dataset.itemId);
      if (!a) return;
      togglePrompt({ id: a.id, zh: a.name, en: a.en, position: 'artist', category: artistCatName(a.cat) });
      toast(isSelected(a.id) ? `已加入艺术家：${a.name}` : `已移出：${a.name}`);
      syncArtistSelection();
    });
  });
  root.querySelectorAll('[data-detail]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openArtistSheet(el.dataset.detail);
    });
  });
  const more = root.querySelector('[data-role="artist-more-list"]');
  if (more) more.addEventListener('click', () => {
    artistUi.limit += 48;
    refreshArtistResults();
  });
}

readArtistFilterFromUrl();
boot('artists.html');
renderArtists();
onChange(syncArtistSelection);
window.addEventListener('hashchange', () => {
  readArtistFilterFromUrl();
  renderArtists();
});
