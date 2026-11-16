/* ==========================================================================
   风格参考码独立页：Midlibrary 风格码（--sref）全量词库（4,638 条）。
   官方风格榜已按 ADR-0026 收编为工作台一级视图 #styles-top，不在本页。
   参考图按需取，取不到就落回排版版位。

   筛选统一走 webui/js/filter-engine.js（报告 3.4）：状态以 URL hash 为唯一来源
   （ADR-0010），刷新 / 后退 / 分享都能复现。
   ========================================================================== */

const CODE_TOTAL = STYLE_CODES.length;
const CODE_ILLUSTRATED = STYLE_CODES.filter(c => c.preview).length;
const styleUi = { q: '', limit: 48, kind: '' };

/* ── 筛选源（报告 3.4）────────────────────────────────────────────────
   风格参考码侧：名称/码搜索 + 只看已实测（kind 维度保留给 URL 契约兼容）。 */
const STYLE_FILTER_SOURCE = FILTER_ENGINE.source('style-library', [
  { key: 'q', type: 'q', matchOf: (c, text) => {
    if (String(c.name || '').toLowerCase().includes(text)) return true;
    return String(c.code || '').includes(text);
  } },
  { key: 'tested', type: 'bool', activeOf: (c) => !!c.tested },
  { key: 'kind', type: 'enum', valueOf: (c) => c.kind || '' },
]);

function styleFilterState() {
  return {
    q: styleUi.q || '',
    dims: {
      tested: !!styleUi.tested,
      kind: styleUi.kind || '',
    },
  };
}

function styleCodes() {
  const src = STYLE_FILTER_SOURCE;
  const hits = FILTER_ENGINE.filter(src, STYLE_CODES, styleFilterState());
  // 浏览顺序：先给有参考图的
  return hits.sort((a, b) => (a.preview ? 0 : 1) - (b.preview ? 0 : 1));
}

/* 筛选状态 → URL（ADR-0010：hash 是筛选的唯一来源） */
function writeStyleFilterToUrl() {
  const hash = FILTER_ENGINE.buildHash(STYLE_FILTER_SOURCE, 'style-library', styleFilterState());
  if (location.hash !== hash) {
    try { history.replaceState(null, '', hash); } catch { location.hash = hash; }
  }
}

/* URL → 筛选状态 */
function readStyleFilterFromUrl() {
  const parsed = FILTER_ENGINE.parseHash(STYLE_FILTER_SOURCE, location.hash);
  const st = parsed.state;
  styleUi.q = st.q || '';
  styleUi.tested = !!(st.dims && st.dims.tested);
  styleUi.kind = (st.dims && st.dims.kind) || '';
  return parsed.ignored || [];
}

function styleHeadHtml() {
  return `
    <div class="library-head" data-od-id="style-head">
      <h1>风格库</h1>
      <p class="lead">风格参考码填进 <span class="mono">--sref</span>，让一条提示词借用另一张图的整体观感。官方风格榜在工作台的「风格榜」视图里。</p>
      <div class="head-meta">
        <span class="param-chip">参考码 ${CODE_TOTAL.toLocaleString('zh-CN')}</span>
      </div>
    </div>`;
}

function styleToolbarHtml() {
  return `
    <div class="toolbar" data-od-id="style-toolbar">
      <div class="search" style="flex:1 1 220px;max-width:320px">
        ${icon('search')}
        <input id="style-search" type="search" aria-label="搜索风格名或风格码"
          placeholder="搜索风格名或码" value="${esc(styleUi.q)}" autocomplete="off">
      </div>
      <span class="spacer"></span>
      <span class="dock-count" role="status" aria-live="polite">${styleCodes().length.toLocaleString('zh-CN')} 条</span>
    </div>`;
}

/* 官方风格榜已迁到 webui/js/styles-top-view.js（工作台一级视图 #styles-top）。 */

function styleCodesBodyHtml() {
  const list = styleCodes();
  if (!list.length) {
    return stateHtml({
      title: '没有匹配的风格码',
      desc: '换个名称或直接输码试试，比如 3383230063。',
      iconName: 'search',
    });
  }
  const shown = list.slice(0, styleUi.limit);
  const testedCount = shown.filter(c => c.tested).length;
  return `
    <div class="group-block">
      <div class="group-head">
        <h2>风格参考码</h2>
        <span class="n">显示 ${shown.length} / ${list.length.toLocaleString('zh-CN')} 条 · 词库共 ${CODE_TOTAL.toLocaleString('zh-CN')} 条，其中 ${CODE_ILLUSTRATED} 条带参考图</span>
      </div>
      <div class="code-grid">
        ${shown.map(c => `
          <article class="code-card" data-od-id="code-${esc(c.id)}">
            <button class="code-pick" type="button" data-copy-sref="${esc(c.code)}"
              title="点击复制 --sref ${esc(c.code)}${c.tested ? '（已实测）' : ''}">
              ${c.preview
      ? `<span class="thumb" data-plate-name="${esc(c.name)}"><img src="${esc(midlibraryPreviewPath(c.preview))}" alt="${esc(c.name)} 的风格预览图" loading="lazy" decoding="async"></span>`
      : `<span class="thumb is-plate" data-plate-name="${esc(c.name)}"><span class="plate-code">${esc(c.code)}</span></span>`}
              <span class="code-info">
                <span class="code-name">${esc(c.name)}</span>
                <span class="code-num">--sref ${esc(c.code)}</span>
              </span>
            </button>
            <button class="code-more" type="button" data-detail="${esc(c.id)}" aria-label="查看 ${esc(c.name)} 的详情">${icon('info')}</button>
          </article>`).join('')}
      </div>
      ${shown.length < list.length ? `<div style="text-align:center;margin-top:16px"><button class="btn btn-secondary" type="button" data-role="code-more-list">加载更多（还有 ${(list.length - shown.length).toLocaleString('zh-CN')} 条）</button></div>` : ''}
    </div>`;
}

function styleBodyHtml() {
  return styleCodesBodyHtml();
}

/* ── 风格码详情 ─────────────────────────────────────────────────────── */
function openCodeSheet(id) {
  const c = STYLE_CODES.find(x => x.id === id);
  if (!c) return;
  const terms = c.terms.map(slug => {
    const t = TERM_GROUPS.flatMap(g => g.terms).find(x => x.slug === slug);
    return t ? t.label : slug;
  });
  const { backdrop } = mountDialog(`
    <div class="sheet" data-od-id="code-sheet">
      <div class="sheet-head">
        <div style="flex:1">
          <p class="eyebrow">${c.tested ? '已实测' : '风格参考码'}</p>
          <h2 class="artist-sheet-name">${esc(c.name)}</h2>
        </div>
        <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="artist-sheet-grid">
        <div>
          ${c.preview
      ? `<img src="${esc(midlibraryPreviewPath(c.preview))}" alt="${esc(c.name)} 的风格预览图">`
      : `<div class="artist-thumb is-plate" style="aspect-ratio:4/3;border-radius:8px;border:1px solid var(--border)"><span class="plate-code" style="font-size:20px">${esc(c.code)}</span></div>`}
          <div class="btn-row" style="margin-top:12px">
            <button class="btn btn-primary" type="button" data-role="copy" style="flex:1">${icon('copy')}复制 --sref ${esc(c.code)}</button>
          </div>
          ${c.url ? `<p class="dock-hint" style="margin-top:10px"><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">在上游 Midlibrary 查看${icon('external')}</a></p>` : ''}
        </div>
        <div>
          <div class="artist-sheet-block" style="margin-top:0">
            <h3>简介</h3>
            <p>${esc(c.intro || '上游没有提供这条简介。')}</p>
          </div>
          ${terms.length ? `
            <div class="artist-sheet-block">
              <h3>分面词</h3>
              <div class="term-row">${terms.map(t => `<span class="term">${esc(t)}</span>`).join('')}</div>
            </div>` : ''}
          ${c.colours.length ? `
            <div class="artist-sheet-block">
              <h3>主色</h3>
              <div class="swatches" style="gap:8px">
                ${c.colours.map(slug => {
                  const col = COLOURS.find(x => x.slug === slug);
                  return col ? `<span class="swatch" style="width:18px;height:18px;background:${esc(col.hex)}" title="${esc(col.name)}"></span>` : '';
                }).join('')}
              </div>
            </div>` : ''}
        </div>
      </div>
    </div>`, { label: `${c.name} 的详情` });

  backdrop.querySelector('[data-role="copy"]').addEventListener('click', () => {
    copyText(`--sref ${c.code}`, '风格参考已复制');
  });
}

function renderStyle() {
  const page = document.getElementById('page');
  if (!page) return;
  page.innerHTML = `
    ${styleHeadHtml()}
    ${styleToolbarHtml()}
    <div class="library-body" id="library-panel" role="region"
      aria-label="风格参考码" tabindex="0">${styleBodyHtml()}</div>`;
  wireStyle();
  markImageStates(page);
}

function wireStyle() {
  const page = document.getElementById('page');
  const search = page.querySelector('#style-search');
  if (search) {
    search.addEventListener('input', () => {
      styleUi.q = search.value;
      styleUi.limit = 48;
      writeStyleFilterToUrl();
      const body = page.querySelector('#library-panel');
      if (!body) return;
      body.innerHTML = styleBodyHtml();
      wireStyleBody();
      const c = page.querySelector('.toolbar .dock-count');
      if (c) c.textContent = `${styleCodes().length.toLocaleString('zh-CN')} 条`;
      markImageStates(body);
    });
  }
  wireStyleBody();
}

function wireStyleBody() {
  const body = document.getElementById('library-panel');
  if (!body) return;
  body.querySelectorAll('[data-copy-sref]').forEach(el => {
    el.addEventListener('click', () => copyText(`--sref ${el.dataset.copySref}`, '风格参考已复制'));
  });
  body.querySelectorAll('[data-detail]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openCodeSheet(el.dataset.detail);
    });
  });
  const more = body.querySelector('[data-role="code-more-list"]');
  if (more) more.addEventListener('click', () => {
    styleUi.limit += 48;
    body.innerHTML = styleBodyHtml();
    wireStyleBody();
    markImageStates(body);
  });
}

readStyleFilterFromUrl();
boot('style-library.html');
renderStyle();
window.addEventListener('hashchange', () => {
  readStyleFilterFromUrl();
  renderStyle();
});
