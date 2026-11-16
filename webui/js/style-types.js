/* ==========================================================================
   风格与类型库：Midlibrary 上游 4 个条目类型类的全量词库（1,180 条）。

   收录范围（上游 16 分类里的「条目类型类」之一部分）：
     · genres-art-movements  流派与艺术运动（genre 248 + movement 64）
     · general-modifiers      通用修饰（style_quality 175）
     · techniques             技法（technique 393）
     · titles                 标题（title 300）
   上游第 5 个条目类型类 sref-styles（风格参考码 4,638 条）在风格库页，不重复收录。

   与风格库的分工（CONTEXT.md）：
     风格库 = 谁画的（艺术家 + 风格参考码）——单选互斥
     类型库 = 画成什么样（上面 4 类）——多选累加
   两批数据同源（midlibrary manifest + details），但语义不同，故分两页。

   筛选统一走 webui/js/filter-engine.js（报告 3.4）：状态以 URL hash 为唯一来源
   （ADR-0010），刷新 / 后退 / 分享都能复现。

   筛选语义沿用本项目既有约定「组内任一、组间全部」（docs/风格库筛选方案.md 5.2），
   **不照搬上游的平铺 AND** —— 上游把 10 个分面词组压平成一个 AND 池，
   实测 `abstract ∧ characters` 只剩 3 条，等于把库筛空。
   引擎的 multi 维度声明 groupOf 后即按组判定（见 filter-engine.js 3a）。
   ========================================================================== */

const TYPE_TOTAL = TYPE_ENTRIES.length;
const TYPE_TESTED = TYPE_ENTRIES.filter(e => e.tested).length;
const TYPE_PUBLIC_DOMAIN = TYPE_ENTRIES.filter(e => e.publicDomain).length;

/** 条目类型（kind）→ 中文标签。同一分类下有多种 kind，分开展示更清楚。 */
const TYPE_KIND_LABELS = {
  genre: '流派',
  movement: '艺术运动',
  style_quality: '风格修饰',
  technique: '技法',
  title: '标题',
};

/* 分面词 slug → 所属组 id。
   引擎的 groupOf 用它把选中值按组切分：同组取或、跨组取与。
   数据事实：目标子集的 65 个分面词 slug 到组是**一一对应**的
   （实测 0 个 slug 跨组），所以这张表不会丢信息。 */
const TYPE_TERM_GROUP = {};
for (const g of TYPE_TERM_GROUPS) {
  for (const t of g.terms) TYPE_TERM_GROUP[t.slug] = g.id;
}

const typeUi = {
  q: '',
  cat: '',
  terms: new Set(),
  colours: new Set(),
  tested: false,
  publicDomain: false,
  sort: 'az',
  limit: 48,
  facetsOpen: false,
};

/* ── 筛选源（报告 3.4）────────────────────────────────────────────────
   维度清单与上游 tools.state 对齐（categories/kinds/terms/colours/
   pick/tested/publicDomain/q/like/sort），但按本地口径落地：
     · categories → cat（单选：本地用二级分类，不必像上游那样多选 OR）
     · terms      → multi + groupOf（组内任一、组间全部）
     · colours    → multi（同维度多值取并集）
     · tested / publicDomain → bool
     · q          → 自由文本
   排序不作为筛选维度进 URL —— 它是显示顺序，不是「收窄条件」；
   但仍写进 hash（上游也是 sort 进 state），刷新后能复现顺序。 */
const TYPE_FILTER_SOURCE = FILTER_ENGINE.source('style-types', [
  { key: 'q', type: 'q', matchOf: (e, text) => {
    if (String(e.name || '').toLowerCase().includes(text)) return true;
    return String(e.en || '').toLowerCase().includes(text);
  } },
  { key: 'cat', type: 'enum', valueOf: (e) => e.cat || '' },
  { key: 'terms', type: 'multi', valuesOf: (e) => e.terms || [], groupOf: (v) => TYPE_TERM_GROUP[v] || '' },
  { key: 'colours', type: 'multi', valuesOf: (e) => e.colours || [] },
  { key: 'tested', type: 'bool', activeOf: (e) => !!e.tested },
  { key: 'publicDomain', type: 'bool', activeOf: (e) => !!e.publicDomain },
]);

function typeFilterState() {
  return {
    q: typeUi.q || '',
    dims: {
      cat: typeUi.cat || '',
      terms: [...typeUi.terms],
      colours: [...typeUi.colours],
      tested: !!typeUi.tested,
      publicDomain: !!typeUi.publicDomain,
    },
  };
}

/* 排序：
   az    → 按名称 A→Z（上游同名排序项）
   new   → 最新收录：按条目创建时间倒序。
           口径说明：上游对应项是 "Newly tested"（按**实测时间**排），
           但源快照与上游 payload 都没有任何时间戳字段 —— 那个排序是服务端行为，
           本地快照复刻不了。唯一可溯源的时间事实是条目 ULID 里的**创建时间**
           （items.json，1,180/1,180 可解），所以本项叫「最新收录」，
           标注为收录时间而非实测时间，不冒充实测口径。 */
function sortTypeEntries(list) {
  const arr = [...list];
  if (typeUi.sort === 'new') {
    // 有时间的在前；同时间按名称排，保证顺序稳定（不做随机洗牌）
    arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(a.name).localeCompare(String(b.name)));
    return arr;
  }
  arr.sort((a, b) => String(a.name).localeCompare(String(b.name), 'en'));
  return arr;
}

function typeEntries() {
  const src = TYPE_FILTER_SOURCE;
  const hits = FILTER_ENGINE.filter(src, TYPE_ENTRIES, typeFilterState());
  return sortTypeEntries(hits);
}

/** 当前筛选下的分面计数（分面计数在「其它维度的筛选下」计算） */
function typeFacetCounts(dimKey) {
  return FILTER_ENGINE.counts(TYPE_FILTER_SOURCE, TYPE_ENTRIES, typeFilterState(), dimKey);
}

/* 筛选状态 → URL（ADR-0010：hash 是筛选的唯一来源）
   排序不进引擎的状态（它不是筛选维度），但要一起写进 hash，
   否则刷新后顺序就丢了 —— 上游也是 sort 进 state 的。 */
function writeTypeFilterToUrl() {
  const hash = FILTER_ENGINE.buildHash(TYPE_FILTER_SOURCE, 'style-types', typeFilterState());
  const sep = hash.includes('?') ? '&' : '?';
  const full = typeUi.sort && typeUi.sort !== 'az' ? `${hash}${sep}sort=${encodeURIComponent(typeUi.sort)}` : hash;
  if (location.hash !== full) {
    try { history.replaceState(null, '', full); } catch { location.hash = full; }
  }
}

/* URL → 筛选状态 */
function readTypeFilterFromUrl() {
  const parsed = FILTER_ENGINE.parseHash(TYPE_FILTER_SOURCE, location.hash);
  const st = parsed.state;
  typeUi.q = st.q || '';
  typeUi.cat = (st.dims && st.dims.cat) || '';
  typeUi.terms = new Set((st.dims && st.dims.terms) || []);
  typeUi.colours = new Set((st.dims && st.dims.colours) || []);
  typeUi.tested = !!(st.dims && st.dims.tested);
  typeUi.publicDomain = !!(st.dims && st.dims.publicDomain);
  // 排序参数不属引擎白名单，单独读（合法的两个值之外一律回落 A→Z）
  const m = location.hash.match(/[?&]sort=([^&]*)/);
  const raw = m ? decodeURIComponent(m[1]) : '';
  typeUi.sort = raw === 'new' ? 'new' : 'az';
  return parsed.ignored || [];
}

/* ── 界面 ──────────────────────────────────────────────────────────────── */

function typeHeadHtml() {
  return `
    <div class="library-head" data-od-id="type-head">
      <h1>风格与类型库</h1>
      <p class="lead">通用提示词片段 —— 流派、修饰、技法、标题。它们不指认作者，只描述画面本身的属性，可以多条叠加进同一条提示词。风格参考码在「风格库」页。</p>
      <div class="head-meta">
        <span class="param-chip">条目 ${TYPE_TOTAL.toLocaleString('zh-CN')}</span>
        <span class="param-chip">实测 ${TYPE_TESTED.toLocaleString('zh-CN')}</span>
        <span class="param-chip">公有领域 ${TYPE_PUBLIC_DOMAIN.toLocaleString('zh-CN')}</span>
      </div>
    </div>`;
}

function typeToolbarHtml() {
  const list = typeEntries();
  return `
    <div class="toolbar" data-od-id="type-toolbar">
      <div class="search" style="flex:1 1 220px;max-width:320px">
        ${icon('search')}
        <input id="type-search" type="search" aria-label="搜索类型条目"
          placeholder="搜索名称，例如 cyberpunk" value="${esc(typeUi.q)}" autocomplete="off">
      </div>
      <button class="toggle${typeUi.tested ? ' on' : ''}" type="button" data-toggle="tested" aria-pressed="${typeUi.tested}">
        只看实测 <span class="n">${TYPE_TESTED}</span>
      </button>
      <button class="toggle${typeUi.publicDomain ? ' on' : ''}" type="button" data-toggle="publicDomain" aria-pressed="${typeUi.publicDomain}">
        只看公有领域 <span class="n">${TYPE_PUBLIC_DOMAIN}</span>
      </button>
      <button class="toggle${typeUi.facetsOpen ? ' on' : ''}" type="button" data-toggle="facets" aria-pressed="${typeUi.facetsOpen}"
        ${typeUi.facetsOpen ? 'aria-controls="type-facet-panel"' : ''}>${icon('sliders')}分面</button>
      <label class="toggle" style="gap:6px">
        <span class="visually-hidden" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">排序</span>
        <select id="type-sort" class="select" aria-label="排序方式" style="border:0;background:transparent;padding:0;font-size:12.5px;color:inherit">
          <option value="az"${typeUi.sort === 'az' ? ' selected' : ''}>A → Z</option>
          <option value="new"${typeUi.sort === 'new' ? ' selected' : ''}>最新收录</option>
        </select>
      </label>
      <span class="spacer"></span>
      <span class="dock-count" role="status" aria-live="polite">${list.length.toLocaleString('zh-CN')} 条</span>
    </div>`;
}

/* 分面面板：分类 + 分面词（按组）+ 主色
   计数口径：选项上的数字 = 在当前其它条件下再打开该项会得到的条数。
   零计数选项显示但置灰（docs/风格库筛选方案.md 3 节：取一种行为，不混用）。 */
function typeFacetsHtml() {
  if (!typeUi.facetsOpen) return '';
  const catCounts = typeFacetCounts('cat');
  const termCounts = typeFacetCounts('terms');
  const colourCounts = typeFacetCounts('colours');
  return `
    <div class="group-block" id="type-facet-panel" data-od-id="type-facet-panel"
      style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px">
      <div class="group-head"><h2>分类</h2><span class="n">单选</span></div>
      <div class="tag-grid" role="group" aria-label="按分类筛选">
        <button class="tag${!typeUi.cat ? ' on' : ''}" type="button" data-cat="" aria-pressed="${!typeUi.cat}">
          全部<span class="en">${TYPE_TOTAL}</span>
        </button>
        ${TYPE_CATEGORIES.map(c => {
          const n = catCounts.get(c.id) || 0;
          return `<button class="tag${typeUi.cat === c.id ? ' on' : ''}" type="button" data-cat="${esc(c.id)}"
            aria-pressed="${typeUi.cat === c.id}"${n === 0 && typeUi.cat !== c.id ? ' disabled' : ''}>
            ${esc(c.name)}<span class="en">${n}</span></button>`;
        }).join('')}
      </div>

      <div class="group-head" style="margin-top:16px"><h2>分面词</h2><span class="n">组内任一 · 组间全部</span></div>
      ${TYPE_TERM_GROUPS.map(g => `
        <div style="margin-bottom:12px">
          <div class="slot-head" style="margin-bottom:6px">${esc(g.name)}</div>
          <div class="tag-grid" role="group" aria-label="${esc(g.name)}分面">
            ${g.terms.map(t => {
              const n = termCounts.get(t.slug) || 0;
              return `<button class="tag${typeUi.terms.has(t.slug) ? ' on' : ''}" type="button" data-term="${esc(t.slug)}"
                aria-pressed="${typeUi.terms.has(t.slug)}"${n === 0 && !typeUi.terms.has(t.slug) ? ' disabled' : ''}>
                ${esc(t.label)}<span class="en">${n}</span></button>`;
            }).join('')}
          </div>
        </div>`).join('')}

      <div class="group-head" style="margin-top:16px"><h2>主色</h2><span class="n">${typeUi.colours.size ? `已选 ${typeUi.colours.size}` : '按占比取前几色'}</span></div>
      <div class="swatches" style="gap:7px;flex-wrap:wrap" role="group" aria-label="按主色筛选">
        ${TYPE_COLOURS.map(c => {
          const n = colourCounts.get(c.slug) || 0;
          return `<button class="swatch" type="button" data-colour="${esc(c.slug)}"
            title="${esc(c.name)} · ${n} 条" aria-label="${esc(c.name)}，${n} 条"
            aria-pressed="${typeUi.colours.has(c.slug)}"
            ${n === 0 && !typeUi.colours.has(c.slug) ? 'disabled' : ''}
            style="width:20px;height:20px;background:${esc(c.hex)};${typeUi.colours.has(c.slug) ? 'box-shadow:0 0 0 2px var(--accent);' : ''}${n === 0 && !typeUi.colours.has(c.slug) ? 'opacity:.35;cursor:not-allowed;' : ''}"></button>`;
        }).join('')}
      </div>
    </div>`;
}

/* 一张类型卡片：图 + 名称 + 类别 + 动作
   用户钦定的两个动作：
     · 复制提示词 —— 复制该条目的英文写法
     · 加进提示词 —— 加入当前会话（走 other 槽，多选累加）
   整卡点击 = 加进提示词（与艺术家侧一致）。
   卡片右上角另有两个小按钮：**详情**（打开详情弹层）与**复制**。 */
function typeCardHtml(e) {
  const on = isSelected(e.id);
  return `
    <article class="artist-card${on ? ' on' : ''}" data-od-id="type-card-${esc(e.id)}">
      <button class="artist-pick" type="button"
        data-item-id="${esc(e.id)}"
        aria-pressed="${on}"
        data-zh="${esc(e.name)}" data-en="${esc(e.en)}"
        data-position="other" data-category="${esc(typeCatName(e.cat))}">
        <span class="artist-thumb" data-plate-name="${esc(e.name)}">
          ${e.preview
    ? `<img src="${esc(e.preview)}" alt="${esc(e.name)} 的预览图" loading="lazy" decoding="async">`
    : ''}
          ${e.tested ? '<span class="badge">实测</span>' : ''}
          ${e.publicDomain ? '<span class="badge pick">公有领域</span>' : ''}
        </span>
        <span class="artist-body">
          <span class="artist-name">${esc(e.name)}</span>
          <span class="artist-meta">${esc(typeKindLabel(e.kind))} · ${esc(typeCatName(e.cat))}</span>
          ${e.intro ? `<span class="artist-intro">${esc(e.intro)}</span>` : ''}
          <span class="swatches" aria-hidden="true">
            ${(e.colours || []).slice(0, 5).map(slug => {
    const col = TYPE_COLOURS.find(x => x.slug === slug);
    return col ? `<span class="swatch" style="background:${esc(col.hex)}" title="${esc(col.name)}"></span>` : '';
  }).join('')}
          </span>
        </span>
      </button>
      <button class="artist-more" type="button" data-detail="${esc(e.id)}"
        aria-label="查看 ${esc(e.name)} 的详情" title="详情">${icon('info')}</button>
      <button class="artist-more" type="button" data-copy="${esc(e.id)}"
        aria-label="复制 ${esc(e.name)} 的提示词写法" title="复制提示词">${icon('copy')}</button>
    </article>`;
}

function typeCatName(id) {
  const c = TYPE_CATEGORIES.find(x => x.id === id);
  return c ? c.name : id;
}

function typeKindLabel(kind) {
  return TYPE_KIND_LABELS[kind] || kind;
}

function typeBodyHtml() {
  const list = typeEntries();
  if (!list.length) {
    return stateHtml({
      title: '没有匹配的类型条目',
      desc: '换个关键词，或把分面条件放宽（同组多个词是「任一」，跨组才是「全部」）。',
      iconName: 'search',
    });
  }
  const shown = list.slice(0, typeUi.limit);
  return `
    <div class="group-block">
      <div class="group-head">
        <h2>类型条目</h2>
        <span class="n">显示 ${shown.length} / ${list.length.toLocaleString('zh-CN')} 条 · 词库共 ${TYPE_TOTAL.toLocaleString('zh-CN')} 条${typeUi.sort === 'new' ? ' · 按收录时间倒序' : ''}</span>
      </div>
      <div class="artist-grid">
        ${shown.map(typeCardHtml).join('')}
      </div>
      ${shown.length < list.length ? `<div style="text-align:center;margin-top:16px"><button class="btn btn-secondary" type="button" data-role="type-more">加载更多（还有 ${(list.length - shown.length).toLocaleString('zh-CN')} 条）</button></div>` : ''}
    </div>`;
}

/* ── 详情弹层 ──────────────────────────────────────────────────────────── */
function openTypeSheet(id) {
  const e = TYPE_ENTRIES.find(x => x.id === id);
  if (!e) return;
  const terms = (e.terms || []).map(slug => {
    for (const g of TYPE_TERM_GROUPS) {
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
  const created = e.createdAt ? new Date(e.createdAt).toISOString().slice(0, 10) : '';
  const { backdrop } = mountDialog(`
    <div class="sheet" data-od-id="type-sheet">
      <div class="sheet-head">
        <div style="flex:1">
          <p class="eyebrow">${esc(typeKindLabel(e.kind))} · ${esc(typeCatName(e.cat))}</p>
          <h2 class="artist-sheet-name">${esc(e.name)}</h2>
        </div>
        <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="artist-sheet-grid">
        <div>
          ${e.preview
    ? `<img src="${esc(e.preview)}" alt="${esc(e.name)} 的预览图">`
    : `<div class="artist-thumb is-plate" style="aspect-ratio:4/3;border-radius:8px;border:1px solid var(--border)"><span class="plate-name">${esc(e.name)}</span></div>`}
          <div class="btn-row" style="margin-top:12px">
            <button class="btn btn-primary" type="button" data-role="copy" style="flex:1">${icon('copy')}复制提示词</button>
            <button class="btn btn-secondary" type="button" data-role="add" style="flex:1">${icon('plus')}加进提示词</button>
          </div>
          ${e.url ? `<p class="dock-hint" style="margin-top:10px"><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">在上游 Midlibrary 查看${icon('external')}</a></p>` : ''}
          <p class="dock-hint" style="margin-top:8px">上游写法：<span class="mono">${esc(e.en)}</span>${created ? `<br>收录于 ${esc(created)}（按创建时间，非实测时间）` : ''}</p>
        </div>
        <div>
          ${e.intro ? `
            <div class="artist-sheet-block" style="margin-top:0">
              <h3>简介</h3>
              <p>${esc(e.intro)}</p>
            </div>` : ''}
          ${e.observation ? `
            <div class="artist-sheet-block">
              <h3>风格描述</h3>
              <p>${esc(e.observation)}</p>
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
          ${(e.colours || []).length ? `
            <div class="artist-sheet-block">
              <h3>主色</h3>
              <div class="swatches" style="gap:8px">
                ${(e.colours || []).map(slug => {
    const col = TYPE_COLOURS.find(x => x.slug === slug);
    return col ? `<span class="swatch" style="width:18px;height:18px;background:${esc(col.hex)}" title="${esc(col.name)}"></span>` : '';
  }).join('')}
              </div>
            </div>` : ''}
        </div>
      </div>
    </div>`, { label: `${e.name} 的详情` });

  backdrop.querySelector('[data-role="copy"]').addEventListener('click', () => {
    copyText(e.en, '提示词已复制');
  });
  backdrop.querySelector('[data-role="add"]').addEventListener('click', () => {
    addTypeToSession(e);
  });
}

/* ── 会话动作 ──────────────────────────────────────────────────────────── */
/* 类型条目走 other 槽：多选累加，不触发 artist 的单选互斥。
   core.js 的 togglePrompt 对非 artist 的 position 一律走多选分支。 */
function addTypeToSession(e) {
  togglePrompt({
    id: e.id,
    zh: e.name,
    en: e.en,
    position: 'other',
    category: typeCatName(e.cat),
  });
  toast(isSelected(e.id) ? `已加入提示词：${e.name}` : `已从提示词移除：${e.name}`);
}

/* ── 渲染与接线 ────────────────────────────────────────────────────────── */
function renderTypes() {
  const page = document.getElementById('page');
  if (!page) return;
  page.innerHTML = `
    ${typeHeadHtml()}
    ${typeToolbarHtml()}
    <div id="type-facet-slot" data-od-id="type-facet-slot">${typeFacetsHtml()}</div>
    <div class="library-body" id="type-panel" role="region" aria-label="类型条目" tabindex="0">${typeBodyHtml()}</div>`;
  wireTypes();
  markImageStates(page);
}

/* 重绘筛选区与结果区（不动搜索框，避免失焦）
   分面面板走固定插槽 #type-facet-slot：面板本身可能不存在（关闭态），
   所以只能「整块重写插槽内容」，不能「替换已存在的面板节点」——
   后者在面板首次打开时找不到节点，面板永远出不来。 */
function refreshTypeResults() {
  const page = document.getElementById('page');
  if (!page) return;
  const panel = page.querySelector('#type-panel');
  if (panel) {
    panel.innerHTML = typeBodyHtml();
    wireTypeBody(panel);
    markImageStates(panel);
  }
  const slot = page.querySelector('#type-facet-slot');
  if (slot) {
    slot.innerHTML = typeFacetsHtml();
    const facet = slot.querySelector('#type-facet-panel');
    if (facet) wireTypeFacets(facet);
  }
  const c = page.querySelector('.toolbar .dock-count');
  if (c) c.textContent = `${typeEntries().length.toLocaleString('zh-CN')} 条`;
  // 开关的选中态要跟着状态走（工具栏本身不重绘，避免搜索框失焦）
  const tested = page.querySelector('[data-toggle="tested"]');
  if (tested) {
    tested.classList.toggle('on', typeUi.tested);
    tested.setAttribute('aria-pressed', String(typeUi.tested));
  }
  const pd = page.querySelector('[data-toggle="publicDomain"]');
  if (pd) {
    pd.classList.toggle('on', typeUi.publicDomain);
    pd.setAttribute('aria-pressed', String(typeUi.publicDomain));
  }
  const facets = page.querySelector('[data-toggle="facets"]');
  if (facets) {
    facets.classList.toggle('on', typeUi.facetsOpen);
    facets.setAttribute('aria-pressed', String(typeUi.facetsOpen));
  }
}

function wireTypes() {
  const page = document.getElementById('page');
  if (!page) return;

  const search = page.querySelector('#type-search');
  if (search) {
    search.addEventListener('input', () => {
      typeUi.q = search.value;
      typeUi.limit = 48;
      writeTypeFilterToUrl();
      refreshTypeResults();
    });
  }

  const sort = page.querySelector('#type-sort');
  if (sort) {
    sort.addEventListener('change', () => {
      typeUi.sort = sort.value === 'new' ? 'new' : 'az';
      writeTypeFilterToUrl();
      refreshTypeResults();
    });
  }

  page.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      if (key === 'tested') typeUi.tested = !typeUi.tested;
      else if (key === 'publicDomain') typeUi.publicDomain = !typeUi.publicDomain;
      else if (key === 'facets') typeUi.facetsOpen = !typeUi.facetsOpen;
      writeTypeFilterToUrl();
      refreshTypeResults();
    });
  });

  const facet = page.querySelector('#type-facet-panel');
  if (facet) wireTypeFacets(facet);

  const panel = page.querySelector('#type-panel');
  if (panel) wireTypeBody(panel);
}
function wireTypeFacets(root) {
  root.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      typeUi.cat = btn.dataset.cat || '';
      typeUi.limit = 48;
      writeTypeFilterToUrl();
      refreshTypeResults();
    });
  });
  root.querySelectorAll('[data-term]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.term;
      if (typeUi.terms.has(s)) typeUi.terms.delete(s);
      else typeUi.terms.add(s);
      typeUi.limit = 48;
      writeTypeFilterToUrl();
      refreshTypeResults();
    });
  });
  root.querySelectorAll('[data-colour]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.colour;
      if (typeUi.colours.has(s)) typeUi.colours.delete(s);
      else typeUi.colours.add(s);
      typeUi.limit = 48;
      writeTypeFilterToUrl();
      refreshTypeResults();
    });
  });
}

function wireTypeBody(root) {
  root.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', () => {
      const e = TYPE_ENTRIES.find(x => x.id === el.dataset.itemId);
      if (!e) return;
      addTypeToSession(e);
      // 选中态要立刻反映到卡片上（不重排整页，避免滚动跳动）
      const card = el.closest('.artist-card');
      if (card) {
        const on = isSelected(e.id);
        card.classList.toggle('on', on);
        el.setAttribute('aria-pressed', String(on));
      }
    });
  });
  root.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const e = TYPE_ENTRIES.find(x => x.id === el.dataset.copy);
      if (e) copyText(e.en, '提示词已复制');
    });
  });
  root.querySelectorAll('[data-detail]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openTypeSheet(el.dataset.detail);
    });
  });
  root.querySelectorAll('[data-role="type-more"]').forEach(btn => {
    btn.addEventListener('click', () => {
      typeUi.limit += 48;
      refreshTypeResults();
    });
  });
}

/* 启动 */
readTypeFilterFromUrl();
boot('style-types.html');
renderTypes();
window.addEventListener('hashchange', () => {
  readTypeFilterFromUrl();
  renderTypes();
});
