/* ==========================================================================
   风格库：风格参考码（--sref）+ 官方风格榜（styles_top）
   参考码为全量词库（4,638 条）；参考图按需取，取不到就落回排版版位。

   筛选统一走 webui/js/filter-engine.js（报告 3.4）：状态以 URL hash 为唯一来源
   （ADR-0010），刷新 / 后退 / 分享都能复现。
   ========================================================================== */

const CODE_TOTAL = STYLE_CODES.length;
const CODE_ILLUSTRATED = STYLE_CODES.filter(c => c.preview).length;
const styleUi = { tab: 'codes', q: '', limit: 48, kind: '' };

/* ── 筛选源（报告 3.4）────────────────────────────────────────────────
   风格库侧：风格码搜索 + 题材筛选（官方榜）+ 只看已实测。 */
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
      <p class="lead">风格参考码填进 <span class="mono">--sref</span>，让一条提示词借用另一张图的整体观感；官方风格榜按题材给出可直接引用的码。</p>
      <div class="head-meta">
        <span class="param-chip">参考码 ${CODE_TOTAL.toLocaleString('zh-CN')}</span>
        <span class="param-chip">官方榜 ${STYLES_TOP_ENTRIES.length} 组</span>
        <span class="param-chip">题材 ${STYLES_TOP_KINDS.length} 类</span>
        <span class="param-chip">官方榜配图 ${STYLES_TOP_IMAGE_STATS.withImages} / ${STYLES_TOP_IMAGE_STATS.total}${STYLES_TOP_IMAGE_STATS.mode === 'sample' ? '（本地抽样）' : ''}</span>
      </div>
    </div>`;
}

function styleToolbarHtml() {
  return `
    <div class="toolbar" data-od-id="style-toolbar">
      <div class="catnav" role="tablist" aria-label="风格库分区" style="border:0;padding:0;gap:6px">
        <button class="catnav-btn" role="tab" type="button" id="style-tab-codes" data-style-tab="codes"
          aria-controls="library-panel" aria-selected="${styleUi.tab === 'codes'}"
          tabindex="${styleUi.tab === 'codes' ? '0' : '-1'}">风格参考码<span class="n">${CODE_TOTAL}</span></button>
        <button class="catnav-btn" role="tab" type="button" id="style-tab-top" data-style-tab="top"
          aria-controls="library-panel" aria-selected="${styleUi.tab === 'top'}"
          tabindex="${styleUi.tab === 'top' ? '0' : '-1'}">官方风格榜<span class="n">${STYLES_TOP_ENTRIES.length}</span></button>
      </div>
      ${styleUi.tab === 'codes' ? `
        <div class="search" style="flex:1 1 220px;max-width:320px;margin-left:auto">
          ${icon('search')}
          <input id="style-search" type="search" aria-label="搜索风格名或风格码"
            placeholder="搜索风格名或码" value="${esc(styleUi.q)}" autocomplete="off">
        </div>` : ''}
      <span class="spacer"></span>
      <span class="dock-count" role="status" aria-live="polite">${styleUi.tab === 'codes' ? `${styleCodes().length.toLocaleString('zh-CN')} 条` : `${STYLES_TOP_ENTRIES.length} 组`}</span>
    </div>`;
}

function styleTopBodyHtml() {
  return `
    <div class="group-block">
      <div class="group-head"><h2>官方风格榜</h2><span class="n">配图 ${STYLES_TOP_IMAGE_STATS.withImages} / ${STYLES_TOP_IMAGE_STATS.total} 组，其余为排版版位</span></div>
      <div class="job-grid">
        ${STYLES_TOP_ENTRIES.map(e => {
          const imgs = Object.entries(e.images || {});
          const main = e.images.portrait || e.images.landscape || imgs[0]?.[1];
          return `
          <article class="sref-card" data-od-id="styles-top-${esc(e.code)}">
            <div class="gal-img">
              ${main
                ? `<img src="${esc(main)}" alt="风格码 ${esc(e.code)} 的样例" loading="lazy" decoding="async">`
                : `<div class="img-plate">暂无本地配图 · ${esc(e.code)}</div>`}
            </div>
            <div class="sref-body">
              <span class="code-num">--sref ${esc(e.code)}</span>
              <div style="font-size:12.5px;color:var(--muted)">${esc(e.display)}</div>
              <div class="btn-row" style="margin-top:10px">
                <button class="btn btn-secondary" type="button" data-copy-sref="${esc(e.code)}" style="flex:1">${icon('copy')}复制参考码</button>
              </div>
            </div>
            <div class="sref-kind-row">
              ${imgs.length
                ? imgs.slice(0, 4).map(([k, v]) =>
                  `<img src="${esc(v)}" alt="风格码 ${esc(e.code)} 的${esc((STYLES_TOP_KINDS.find(x => x.id === k) || {}).label || k)}样例" loading="lazy" decoding="async">`).join('')
                : `<span class="img-plate">8 题材样图未随附</span>`}
            </div>
          </article>`;
        }).join('')}
      </div>
    </div>`;
}

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
      ? `<span class="thumb" data-plate-name="${esc(c.name)}"><img src="${esc(c.preview)}" alt="${esc(c.name)} 的风格预览图" loading="lazy" decoding="async"></span>`
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
  return styleUi.tab === 'top' ? styleTopBodyHtml() : styleCodesBodyHtml();
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
      ? `<img src="${esc(c.preview)}" alt="${esc(c.name)} 的风格预览图">`
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
    <div class="library-body" id="library-panel" role="tabpanel"
      aria-labelledby="style-tab-${esc(styleUi.tab)}" tabindex="0">${styleBodyHtml()}</div>`;
  wireStyle();
  markImageStates(page);
}

function wireStyle() {
  const page = document.getElementById('page');
  page.querySelectorAll('[data-style-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      styleUi.tab = btn.dataset.styleTab;
      styleUi.q = '';
      styleUi.limit = 48;
      renderStyle();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      styleUi.tab = styleUi.tab === 'codes' ? 'top' : 'codes';
      renderStyle();
      const el = document.getElementById(`style-tab-${styleUi.tab}`);
      if (el) el.focus();
    });
  });
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
