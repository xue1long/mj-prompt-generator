/* ==========================================================================
   风格库独立页：Midlibrary 风格参考码（--sref）全量词库（4,638 条）。
   官方风格榜已按 ADR-0034 升为顶栏独立页 styles-top.html，不在本页。
   参考图按需取，取不到就落回排版版位。

   筛选统一走 webui/js/filter-engine.js（报告 3.4）：状态以 URL hash 为唯一来源
   （ADR-0010），刷新 / 后退 / 分享都能复现。

   筛选语义沿用本项目既有约定「组内任一、组间全部」（docs/风格库筛选方案.md 5.2），
   与「风格与类型库」页同源同法：分面词维度声明 groupOf，引擎按组判定。

   卡片形态与「风格与类型库」页对齐（ADR-0032）：
     · 卡片外壳用 artist-card / artist-pick / artist-body / artist-more
       —— 与艺术家侧、类型库页共用同一套 CSS，不另起一套 code-* 样式。
     · 4:3 缩略图（artist-thumb），右上角两个小按钮：详情 + 复制 --sref。
     · 整卡点击 = 复制 --sref（风格码是**参数**不是提示词片段，
       按 ADR-0009 不进会话的 other 槽，所以不适用「加进提示词」）。
   ========================================================================== */

const CODE_TOTAL = STYLE_CODES.length;
const CODE_TESTED = STYLE_CODES.filter(c => c.tested).length;
const CODE_PICK = STYLE_CODES.filter(c => c.pick).length;
const CODE_ILLUSTRATED = STYLE_CODES.filter(c => c.preview).length;

/** 分面词 slug → 所属组 id。
   引擎的 groupOf 用它把选中值按组切分：同组取或、跨组取与。
   数据事实：风格码用到的 66 个分面词 slug 到组是**一一对应**的
   （实测 0 个 slug 跨组），所以这张表不会丢信息。 */
const CODE_TERM_GROUP = {};
for (const g of STYLE_TERM_GROUPS) {
  for (const t of g.terms) CODE_TERM_GROUP[t.slug] = g.id;
}

const styleUi = {
  q: '',
  limit: 48,
  terms: new Set(),
  colours: new Set(),
  tested: false,
  pick: false,
  sort: 'az',
  facetsOpen: false,
};

/* ── 筛选源（报告 3.4）────────────────────────────────────────────────
   维度清单与上游 tools.state 对齐（terms/colours/tested/pick/q/sort），
   但按本地口径落地：
     · terms    → multi + groupOf（组内任一、组间全部）
     · colours  → multi（同维度多值取并集）
     · tested / pick → bool
     · q        → 自由文本
   排序不作为筛选维度进 URL —— 它是显示顺序，不是「收窄条件」；
   但仍写进 hash（上游也是 sort 进 state），刷新后能复现顺序。 */
const STYLE_FILTER_SOURCE = FILTER_ENGINE.source('style-library', [
  { key: 'q', type: 'q', matchOf: (c, text) => {
    if (String(c.name || '').toLowerCase().includes(text)) return true;
    return String(c.code || '').includes(text);
  } },
  { key: 'terms', type: 'multi', valuesOf: (c) => c.terms || [], groupOf: (v) => CODE_TERM_GROUP[v] || '' },
  { key: 'colours', type: 'multi', valuesOf: (c) => c.colours || [] },
  { key: 'tested', type: 'bool', activeOf: (c) => !!c.tested },
  { key: 'pick', type: 'bool', activeOf: (c) => !!c.pick },
]);

function styleFilterState() {
  return {
    q: styleUi.q || '',
    dims: {
      terms: [...styleUi.terms],
      colours: [...styleUi.colours],
      tested: !!styleUi.tested,
      pick: !!styleUi.pick,
    },
  };
}

/* 排序：
   az    → 按名称 A→Z（上游同名排序项）
   new   → 最新收录：按条目创建时间倒序。
           口径说明：上游对应项是 "Newly tested"（按**实测时间**排），
           但源快照与上游 payload 都没有任何时间戳字段 —— 那个排序是服务端行为，
           本地快照复刻不了。唯一可溯源的时间事实是条目 ULID 里的**创建时间**
           （items.json，4,638/4,638 可解），所以本项叫「最新收录」，
           标注为收录时间而非实测时间，不冒充实测口径。 */
function sortStyleCodes(list) {
  const arr = [...list];
  if (styleUi.sort === 'new') {
    // 有时间的在前；同时间按名称排，保证顺序稳定（不做随机洗牌）
    arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(a.name).localeCompare(String(b.name)));
    return arr;
  }
  arr.sort((a, b) => String(a.name).localeCompare(String(b.name), 'en'));
  return arr;
}

function styleCodes() {
  const src = STYLE_FILTER_SOURCE;
  const hits = FILTER_ENGINE.filter(src, STYLE_CODES, styleFilterState());
  return sortStyleCodes(hits);
}

/** 当前筛选下的分面计数（分面计数在「其它维度的筛选下」计算） */
function styleFacetCounts(dimKey) {
  return FILTER_ENGINE.counts(STYLE_FILTER_SOURCE, STYLE_CODES, styleFilterState(), dimKey);
}

/* 筛选状态 → URL（ADR-0010：hash 是筛选的唯一来源）
   排序不进引擎的状态（它不是筛选维度），但要一起写进 hash，
   否则刷新后顺序就丢了 —— 上游也是 sort 进 state 的。 */
function writeStyleFilterToUrl() {
  const hash = FILTER_ENGINE.buildHash(STYLE_FILTER_SOURCE, 'style-library', styleFilterState());
  const sep = hash.includes('?') ? '&' : '?';
  const full = styleUi.sort && styleUi.sort !== 'az' ? `${hash}${sep}sort=${encodeURIComponent(styleUi.sort)}` : hash;
  if (location.hash !== full) {
    try { history.replaceState(null, '', full); } catch { location.hash = full; }
  }
}

/* URL → 筛选状态 */
function readStyleFilterFromUrl() {
  const parsed = FILTER_ENGINE.parseHash(STYLE_FILTER_SOURCE, location.hash);
  const st = parsed.state;
  styleUi.q = st.q || '';
  styleUi.terms = new Set((st.dims && st.dims.terms) || []);
  styleUi.colours = new Set((st.dims && st.dims.colours) || []);
  styleUi.tested = !!(st.dims && st.dims.tested);
  styleUi.pick = !!(st.dims && st.dims.pick);
  // 排序参数不属引擎白名单，单独读（合法的两个值之外一律回落 A→Z）
  const m = location.hash.match(/[?&]sort=([^&]*)/);
  const raw = m ? decodeURIComponent(m[1]) : '';
  styleUi.sort = raw === 'new' ? 'new' : 'az';
  return parsed.ignored || [];
}

/* ── 界面 ──────────────────────────────────────────────────────────────── */

function styleHeadHtml() {
  return `
    <div class="library-head" data-od-id="style-head">
      <h1>风格库</h1>
      <p class="lead">风格参考码填进 <span class="mono">--sref</span>，让一条提示词借用另一张图的整体观感。官方风格榜在工作台的「风格榜」视图里。</p>
      <div class="head-meta">
        <span class="param-chip">参考码 ${CODE_TOTAL.toLocaleString('zh-CN')}</span>
        <span class="param-chip">实测 ${CODE_TESTED.toLocaleString('zh-CN')}</span>
        <span class="param-chip">编辑精选 ${CODE_PICK.toLocaleString('zh-CN')}</span>
      </div>
    </div>`;
}

function styleToolbarHtml() {
  const list = styleCodes();
  return `
    <div class="toolbar" data-od-id="style-toolbar">
      <div class="search" style="flex:1 1 220px;max-width:320px">
        ${icon('search')}
        <input id="style-search" type="search" aria-label="搜索风格名或风格码"
          placeholder="搜索风格名或码" value="${esc(styleUi.q)}" autocomplete="off">
      </div>
      <button class="toggle${styleUi.tested ? ' on' : ''}" type="button" data-toggle="tested" aria-pressed="${styleUi.tested}">
        只看实测 <span class="n">${CODE_TESTED}</span>
      </button>
      <button class="toggle${styleUi.pick ? ' on' : ''}" type="button" data-toggle="pick" aria-pressed="${styleUi.pick}">
        只看精选 <span class="n">${CODE_PICK}</span>
      </button>
      <button class="toggle${styleUi.facetsOpen ? ' on' : ''}" type="button" data-toggle="facets" aria-pressed="${styleUi.facetsOpen}"
        ${styleUi.facetsOpen ? 'aria-controls="style-facet-panel"' : ''}>${icon('sliders')}分面</button>
      <label class="toggle" style="gap:6px">
        <span class="visually-hidden" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">排序</span>
        <select id="style-sort" class="select" aria-label="排序方式" style="border:0;background:transparent;padding:0;font-size:12.5px;color:inherit">
          <option value="az"${styleUi.sort === 'az' ? ' selected' : ''}>A → Z</option>
          <option value="new"${styleUi.sort === 'new' ? ' selected' : ''}>最新收录</option>
        </select>
      </label>
      <span class="spacer"></span>
      <span class="dock-count" role="status" aria-live="polite">${list.length.toLocaleString('zh-CN')} 条</span>
    </div>`;
}

/* 分面面板：分面词（按组）+ 主色
   计数口径：选项上的数字 = 在当前其它条件下再打开该项会得到的条数。
   零计数选项显示但置灰（docs/风格库筛选方案.md 3 节：取一种行为，不混用）。

   面板只列**实际被用到的**词与色（66 词 / 10 组、95 色）——
   上游词表还有 2 词 1 色风格码没用上，列出来只会让人点了必然空。 */
function styleFacetsHtml() {
  if (!styleUi.facetsOpen) return '';
  const termCounts = styleFacetCounts('terms');
  const colourCounts = styleFacetCounts('colours');
  return `
    <div class="group-block" id="style-facet-panel" data-od-id="style-facet-panel"
      style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px">
      <div class="group-head"><h2>分面词</h2><span class="n">组内任一 · 组间全部</span></div>
      ${STYLE_TERM_GROUPS.map(g => `
        <div style="margin-bottom:12px">
          <div class="slot-head" style="margin-bottom:6px">${esc(g.name)}</div>
          <div class="tag-grid" role="group" aria-label="${esc(g.name)}分面">
            ${g.terms.map(t => {
              const n = termCounts.get(t.slug) || 0;
              return `<button class="tag${styleUi.terms.has(t.slug) ? ' on' : ''}" type="button" data-term="${esc(t.slug)}"
                aria-pressed="${styleUi.terms.has(t.slug)}"${n === 0 && !styleUi.terms.has(t.slug) ? ' disabled' : ''}>
                ${esc(t.label)}<span class="en">${n}</span></button>`;
            }).join('')}
          </div>
        </div>`).join('')}

      <div class="group-head" style="margin-top:16px"><h2>主色</h2><span class="n">${styleUi.colours.size ? `已选 ${styleUi.colours.size}` : '多选取并集'}</span></div>
      <div class="swatches" style="gap:7px;flex-wrap:wrap" role="group" aria-label="按主色筛选">
        ${STYLE_COLOURS.map(c => {
          const n = colourCounts.get(c.slug) || 0;
          return `<button class="swatch" type="button" data-colour="${esc(c.slug)}"
            title="${esc(c.name)} · ${n} 条" aria-label="${esc(c.name)}，${n} 条"
            aria-pressed="${styleUi.colours.has(c.slug)}"
            ${n === 0 && !styleUi.colours.has(c.slug) ? 'disabled' : ''}
            style="width:20px;height:20px;background:${esc(c.hex)};${styleUi.colours.has(c.slug) ? 'box-shadow:0 0 0 2px var(--accent);' : ''}${n === 0 && !styleUi.colours.has(c.slug) ? 'opacity:.35;cursor:not-allowed;' : ''}"></button>`;
        }).join('')}
      </div>
    </div>`;
}

/* 一张风格码卡片：图 + 名称 + 码 + 风格描述 + 色块
   动作（与「风格与类型库」页对齐）：
     · 整卡点击 = 复制 --sref
     · 右上角两个小按钮：**详情**（打开详情弹层）与**复制**。
   风格码没有「加进提示词」——它是参数不是提示词片段（ADR-0009）。 */
function styleCodeCardHtml(c) {
  return `
    <article class="artist-card" data-od-id="code-card-${esc(c.id)}">
      <button class="artist-pick" type="button" data-copy-sref="${esc(c.code)}"
        title="点击复制 --sref ${esc(c.code)}${c.tested ? '（已实测）' : ''}">
        <span class="artist-thumb" data-plate-name="${esc(c.name)}">
          ${c.preview
    ? `<img src="${esc(c.preview)}" alt="${esc(c.name)} 的风格预览图" loading="lazy" decoding="async">`
    : ''}
          ${c.tested ? '<span class="badge">实测</span>' : ''}
          ${c.pick ? '<span class="badge pick">精选</span>' : ''}
        </span>
        <span class="artist-body">
          <span class="artist-name">${esc(c.name)}</span>
          <span class="artist-meta">--sref ${esc(c.code)}</span>
          ${c.observation ? `<span class="artist-intro">${esc(c.observation)}</span>` : ''}
          <span class="swatches" aria-hidden="true">
            ${(c.colours || []).slice(0, 5).map(slug => {
    const col = STYLE_COLOURS.find(x => x.slug === slug);
    return col ? `<span class="swatch" style="background:${esc(col.hex)}" title="${esc(col.name)}"></span>` : '';
  }).join('')}
          </span>
        </span>
      </button>
      <button class="artist-more" type="button" data-detail="${esc(c.id)}"
        aria-label="查看 ${esc(c.name)} 的详情" title="详情">${icon('info')}</button>
      <button class="artist-more" type="button" data-copy="${esc(c.id)}"
        aria-label="复制 ${esc(c.name)} 的风格参考码" title="复制 --sref">${icon('copy')}</button>
    </article>`;
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
  return `
    <div class="group-block">
      <div class="group-head">
        <h2>风格参考码</h2>
        <span class="n">显示 ${shown.length} / ${list.length.toLocaleString('zh-CN')} 条 · 词库共 ${CODE_TOTAL.toLocaleString('zh-CN')} 条，其中 ${CODE_ILLUSTRATED} 条带参考图${styleUi.sort === 'new' ? ' · 按收录时间倒序' : ''}</span>
      </div>
      <div class="artist-grid">
        ${shown.map(styleCodeCardHtml).join('')}
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
  const terms = (c.terms || []).map(slug => {
    for (const g of STYLE_TERM_GROUPS) {
      const t = g.terms.find(x => x.slug === slug);
      if (t) return { label: t.label, group: g.name };
    }
    return { label: slug, group: '' };
  });
  const groups = [];
  for (const t of terms) {
    let g = groups.find(x => x.name === t.group);
    if (!g) { g = { name: t.group, items: [] }; groups.push(g); }
    g.items.push(t.label);
  }
  const created = c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '';
  const { backdrop } = mountDialog(`
    <div class="sheet" data-od-id="code-sheet">
      <div class="sheet-head">
        <div style="flex:1">
          <p class="eyebrow">${c.tested ? '已实测' : '风格参考码'}${c.pick ? ' · 编辑精选' : ''}</p>
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
          <p class="dock-hint" style="margin-top:8px">上游写法：<span class="mono">--sref ${esc(c.code)}</span>${created ? `<br>收录于 ${esc(created)}（按创建时间，非实测时间）` : ''}</p>
        </div>
        <div>
          ${c.intro ? `
            <div class="artist-sheet-block" style="margin-top:0">
              <h3>简介</h3>
              <p>${esc(c.intro)}</p>
            </div>` : ''}
          ${c.observation ? `
            <div class="artist-sheet-block"${c.intro ? '' : ' style="margin-top:0"'}>
              <h3>风格描述</h3>
              <p>${esc(c.observation)}</p>
            </div>` : ''}
          ${groups.length ? `
            <div class="artist-sheet-block">
              <h3>分面词</h3>
              ${groups.map(g => `
                <div style="margin-bottom:8px">
                  <div class="slot-head" style="margin-bottom:4px">${esc(g.name || '其它')}</div>
                  <div class="term-row">${g.items.map(t => `<span class="term">${esc(t)}</span>`).join('')}</div>
                </div>`).join('')}
            </div>` : ''}
          ${(c.colours || []).length ? `
            <div class="artist-sheet-block">
              <h3>主色</h3>
              <div class="swatches" style="gap:8px">
                ${(c.colours || []).map(slug => {
    const col = STYLE_COLOURS.find(x => x.slug === slug);
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

/* ── 渲染与接线 ────────────────────────────────────────────────────────── */
function renderStyle() {
  const page = document.getElementById('page');
  if (!page) return;
  page.innerHTML = `
    ${styleHeadHtml()}
    ${styleToolbarHtml()}
    <div id="style-facet-slot" data-od-id="style-facet-slot">${styleFacetsHtml()}</div>
    <div class="library-body" id="library-panel" role="region"
      aria-label="风格参考码" tabindex="0">${styleBodyHtml()}</div>`;
  wireStyle();
  markImageStates(page);
}

/* 重绘筛选区与结果区（不动搜索框，避免失焦）
   分面面板走固定插槽 #style-facet-slot：面板本身可能不存在（关闭态），
   所以只能「整块重写插槽内容」，不能「替换已存在的面板节点」——
   后者在面板首次打开时找不到节点，面板永远出不来。 */
function refreshStyleResults() {
  const page = document.getElementById('page');
  if (!page) return;
  const panel = page.querySelector('#library-panel');
  if (panel) {
    panel.innerHTML = styleBodyHtml();
    wireStyleBody(panel);
    markImageStates(panel);
  }
  const slot = page.querySelector('#style-facet-slot');
  if (slot) {
    slot.innerHTML = styleFacetsHtml();
    const facet = slot.querySelector('#style-facet-panel');
    if (facet) wireStyleFacets(facet);
  }
  const c = page.querySelector('.toolbar .dock-count');
  if (c) c.textContent = `${styleCodes().length.toLocaleString('zh-CN')} 条`;
  // 开关的选中态要跟着状态走（工具栏本身不重绘，避免搜索框失焦）
  const tested = page.querySelector('[data-toggle="tested"]');
  if (tested) {
    tested.classList.toggle('on', styleUi.tested);
    tested.setAttribute('aria-pressed', String(styleUi.tested));
  }
  const pick = page.querySelector('[data-toggle="pick"]');
  if (pick) {
    pick.classList.toggle('on', styleUi.pick);
    pick.setAttribute('aria-pressed', String(styleUi.pick));
  }
  const facets = page.querySelector('[data-toggle="facets"]');
  if (facets) {
    facets.classList.toggle('on', styleUi.facetsOpen);
    facets.setAttribute('aria-pressed', String(styleUi.facetsOpen));
  }
}

function wireStyle() {
  const page = document.getElementById('page');
  if (!page) return;

  const search = page.querySelector('#style-search');
  if (search) {
    search.addEventListener('input', () => {
      styleUi.q = search.value;
      styleUi.limit = 48;
      writeStyleFilterToUrl();
      refreshStyleResults();
    });
  }

  const sort = page.querySelector('#style-sort');
  if (sort) {
    sort.addEventListener('change', () => {
      styleUi.sort = sort.value === 'new' ? 'new' : 'az';
      writeStyleFilterToUrl();
      refreshStyleResults();
    });
  }

  page.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      if (key === 'tested') styleUi.tested = !styleUi.tested;
      else if (key === 'pick') styleUi.pick = !styleUi.pick;
      else if (key === 'facets') styleUi.facetsOpen = !styleUi.facetsOpen;
      writeStyleFilterToUrl();
      refreshStyleResults();
    });
  });

  const facet = page.querySelector('#style-facet-panel');
  if (facet) wireStyleFacets(facet);

  const panel = page.querySelector('#library-panel');
  if (panel) wireStyleBody(panel);
}

function wireStyleFacets(root) {
  root.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.term;
      if (styleUi.terms.has(s)) styleUi.terms.delete(s);
      else styleUi.terms.add(s);
      styleUi.limit = 48;
      writeStyleFilterToUrl();
      refreshStyleResults();
    });
  });
  root.querySelectorAll('[data-colour]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.colour;
      if (styleUi.colours.has(s)) styleUi.colours.delete(s);
      else styleUi.colours.add(s);
      styleUi.limit = 48;
      writeStyleFilterToUrl();
      refreshStyleResults();
    });
  });
}

function wireStyleBody(root) {
  root.querySelectorAll('[data-copy-sref]').forEach(el => {
    el.addEventListener('click', () => copyText(`--sref ${el.dataset.copySref}`, '风格参考已复制'));
  });
  root.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const c = STYLE_CODES.find(x => x.id === el.dataset.copy);
      if (c) copyText(`--sref ${c.code}`, '风格参考已复制');
    });
  });
  root.querySelectorAll('[data-detail]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openCodeSheet(el.dataset.detail);
    });
  });
  const more = root.querySelector('[data-role="code-more-list"]');
  if (more) more.addEventListener('click', () => {
    styleUi.limit += 48;
    refreshStyleResults();
  });
}

readStyleFilterFromUrl();
boot('style-library.html');
renderStyle();
window.addEventListener('hashchange', () => {
  readStyleFilterFromUrl();
  renderStyle();
});
