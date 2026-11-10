/* ==========================================================================
   工作台：左会话 Dock + 右主区
   主区按**一级视图**切换（报告 4.2）：
     · 提示词库    —— 五个分区：四个摄影词库分类 + 艺术家/摄影师（假设集）
     · 研究样本库  —— 社区作业（证据集），原「探索榜」
     · 研究笔记    —— 观察记录与结论（报告 2.3）
   艺术家为全量词库（4,322 条）；预览图按需取，没有图的落回排版版位。

   筛选统一走 webui/js/filter-engine.js（报告 3.4）：一个引擎 + 一套 URL 契约。
   筛选状态以 URL hash 为唯一来源（ADR-0010），刷新 / 后退 / 分享都能复现。
   ========================================================================== */

const ARTIST_TOTAL = ARTISTS.length;
const ARTIST_ILLUSTRATED = ARTISTS.filter(a => a.preview).length;
// 浏览顺序：先给有参考图的，再排纯文字条目
const ARTISTS_SORTED = [...ARTISTS].sort((a, b) => (a.preview ? 0 : 1) - (b.preview ? 0 : 1));
const VOCAB_TOTAL = VOCAB_CATEGORIES.reduce(
  (s, c) => s + c.groups.reduce((t, g) => t + g.items.length, 0), 0);

/* ── 一级视图（报告 4.2）──────────────────────────────────────────────
   「提示词库」与「研究样本库」是**异质的证据集 vs 假设集**，不该同层并列在
   一个容器下（页签标题同级会暗示它们同类）。研究样本库因此升为一级视图。

   旧裁决：2026-11-07 用户要求「探索榜放入提示词库里面」（ADR-0013 修订），
   当时的落点是「提示词库的第 9 个页签」。本轮按报告 4.2 推翻该落点 ——
   见 docs/adr/0020-research-sample-library-is-top-level.md。 */
const VIEWS = [
  { id: 'library', label: '提示词库', hint: '可拼装的片段 —— 你的假设集' },
  { id: 'samples', label: '研究样本库', hint: '社区已做好的成品 —— 证据集' },
  { id: 'research', label: '研究笔记', hint: '观察记录与结论' },
];

/* 提示词库视图下的二级页签：四个摄影词库分类 + 艺术家 */
const LIBRARY_TABS = [
  ...VOCAB_CATEGORIES.map(c => ({ id: c.id, label: c.name, kind: 'vocab' })),
  { id: 'artists', label: '艺术家 / 摄影师', kind: 'artists' },
];
const EXPLORE_TOTAL = EXPLORE_BATCHES.reduce((s, b) => s + b.jobs, 0);

const ui = {
  /** 当前一级视图（报告 4.2）：library / samples / research */
  view: 'library',
  /** 提示词库视图下的二级页签 */
  tab: 'artists',
  q: '',
  tested: false,
  terms: new Set(),
  colours: new Set(),
  artistCat: 'all',
  facetsOpen: false,
  limit: 48,
  /** URL 里带来的作业引用键（#samples?job=<key>）；渲染后用它直达灯箱（报告 2.1） */
  hashJob: null,
  /** 上一次渲染的筛选签名：变了才重绘（避免 URL 回写引起的空转） */
  lastFilterSig: '',
  /** 上一次提示过的「不支持参数」签名 —— 保证只提示一次 */
  lastIgnoredSig: '',
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
  return VOCAB_CATEGORIES.find(c => c.id === t.id).groups.reduce((s, g) => s + g.items.length, 0);
};

/* 一级视图的计数 */
const viewCount = (v) => {
  if (v.id === 'samples') return EXPLORE_TOTAL;
  if (v.id === 'research') {
    // 研究笔记的计数来自本机 IndexedDB（异步加载）；未加载时先显示 0
    return typeof RESEARCH_VIEW !== 'undefined' ? (RESEARCH_VIEW.ui.notes.length + RESEARCH_VIEW.ui.conclusions.length) : 0;
  }
  return VOCAB_TOTAL + ARTIST_TOTAL;
};

/* 深链（报告 2.1 / 3.4）：
   形态  #<一级视图>            —— 直接落到某个视图
         #<一级视图>?<参数>     —— 带筛选参数（ADR-0010：hash 是筛选的唯一来源）
         #samples?job=<key>    —— 直达某条研究样本的灯箱

   页签 id 与 query 参数分开解析。此前只把整个 hash 当页签 id 匹配，
   'explore?job=xxx' 匹配不上任何页签会被整段丢弃。

   旧的 #explore 仍可用 —— 重定向到新的 #samples（一级视图）。
   筛选参数按数据源的白名单解析，不认识的参数丢弃并提示一次。 */
function readHash() {
  const raw = location.hash.replace(/^#\/?/, '').trim();
  const q = raw.indexOf('?');
  const id = (q === -1 ? raw : raw.slice(0, q)).trim();
  const query = q === -1 ? '' : raw.slice(q + 1);

  // 一级视图：优先匹配 VIEWS；'explore' 是旧的探索榜 id，重定向到 'samples'
  let view = VIEWS.find(v => v.id === id);
  if (!view && id === 'explore') view = VIEWS.find(v => v.id === 'samples');
  ui.view = view ? view.id : 'library';

  // 二级页签：仅提示词库视图有
  if (ui.view === 'library') {
    const legacyExplore = id === 'explore';
    const wanted = legacyExplore ? 'artists' : id;
    ui.tab = (wanted && LIBRARY_TABS.some(t => t.id === wanted)) ? wanted : 'artists';
  }

  // query 参数
  const params = new URLSearchParams(query);
  ui.hashJob = params.get('job');
  ui.rawQuery = query;
  // 筛选状态由各数据源自己解析（引擎按白名单吃参数）
  const ignored = applyFilterFromQuery(query);

  // 不认识的参数：丢弃并**提示一次**（ADR-0010）。
  // 不静默忽略 —— 本地单人工具，静默失败比报错更贵。
  // 同时把 URL 修正成只含支持的参数（job 深链参数要保留）。
  if (ignored && ignored.length) {
    const known = new Set([...(filterSourceOf(ui.view) || { dims: [] }).dims.map(d => d.key)]);
    known.add('job');
    const kept = [];
    for (const [k, v] of params.entries()) {
      if (known.has(k)) kept.push([k, v]);
    }
    const qs = new URLSearchParams(kept).toString();
    const fixed = `#${ui.view}${qs ? `?${qs}` : ''}`;
    if (location.hash !== fixed) {
      try { history.replaceState(null, '', fixed); } catch { /* 忽略 */ }
    }
    // 提示**一次**：同一组不支持的参数不重复刷屏。
    // 闸门按「参数名集合」判定 —— 用户改了筛选后 URL 里不再有这些参数，
    // 再次带着同样的坏参数进来才算另一次。
    const sig = ignored.slice().sort().join(',');
    if (sig !== ui.lastIgnoredSig) {
      ui.lastIgnoredSig = sig;
      toast(`已忽略不支持的筛选参数：${ignored.join('、')}`, 'close');
    }
  }
}

/* ── 筛选源声明（报告 3.4）──────────────────────────────────────────
   每个数据源声明自己有哪些筛选维度，引擎据此决定「哪些参数允许出现在 URL 里」。
   维度类型：q 自由文本 / enum 单选 / bool 开关 / multi 多选（组内任一）。 */

/* 提示词库侧：艺术家分面词 + 主色 + 只看实测 + 搜索 */
const LIBRARY_FILTER_SOURCE = FILTER_ENGINE.source('library', [
  { key: 'q', type: 'q', matchOf: (a, text) => {
    if (a.name.toLowerCase().includes(text)) return true;
    return String(a.en || '').toLowerCase().includes(text);
  } },
  { key: 'tested', type: 'bool', activeOf: (a) => !!a.tested },
  { key: 'terms', type: 'multi', valuesOf: (a) => a.terms || [] },
  { key: 'colours', type: 'multi', valuesOf: (a) => a.colours || [] },
]);

/* 研究样本库侧：批次 + 比例 + 只看有 sref + 搜索（报告 2.2 的 sref 码筛选留待第 8 步） */
const EXPLORE_FILTER_SOURCE = FILTER_ENGINE.source('samples', [
  { key: 'q', type: 'q', matchOf: (j, text) => {
    if (String(j.title || '').toLowerCase().includes(text)) return true;
    if (String(j.author || '').toLowerCase().includes(text)) return true;
    return String(j.prompt || '').toLowerCase().includes(text);
  } },
  { key: 'batch', type: 'enum', valueOf: (j) => j.batch },
  { key: 'aspect', type: 'enum', valueOf: (j) => j.aspect },
  { key: 'sref', type: 'bool', activeOf: (j) => !!j.sref },
]);

/* 把 URL 里的筛选参数灌进当前视图的筛选状态 */
function applyFilterFromQuery(query) {
  const src = filterSourceOf(ui.view);
  if (!src) {
    ui.ignoredParams = [];
    return ui.ignoredParams;
  }
  // 用 parseQuery 而不是 parseHash —— 页签已经被 readHash 拆过了，不重复拆
  const parsed = FILTER_ENGINE.parseQuery(src, query);
  const st = parsed.state;
  ui.q = st.q || '';
  ui.tested = !!(st.dims && st.dims.tested);
  ui.terms = new Set(st.dims && st.dims.terms ? st.dims.terms : []);
  ui.colours = new Set(st.dims && st.dims.colours ? st.dims.colours : []);
  // 探索榜侧：批次 / 比例 / 只看有 sref
  if (st.dims && st.dims.batch !== undefined) EXPLORE_BOARD.state.batch = st.dims.batch || '';
  if (st.dims && st.dims.aspect !== undefined) EXPLORE_BOARD.state.aspect = st.dims.aspect || '';
  if (st.dims && st.dims.sref !== undefined) EXPLORE_BOARD.state.srefOnly = !!st.dims.sref;
  if (ui.view === 'samples') EXPLORE_BOARD.state.q = ui.q;
  ui.ignoredParams = parsed.ignored || [];
  return ui.ignoredParams;
}

/* 当前视图的筛选源（引擎的白名单） */
function filterSourceOf(view) {
  if (view === 'samples') return EXPLORE_FILTER_SOURCE;
  if (view === 'library') return LIBRARY_FILTER_SOURCE;
  return null;
}

/* ── URL 回写（ADR-0010：hash 是筛选状态的唯一来源）──────────────────
   筛选一变就把状态写回地址栏。用 history.replaceState 而不是改
   location.hash —— 改 hash 会触发 hashchange → 重渲染 → 输入焦点丢失、
   灯箱被重建关闭。replaceState 只改地址栏，不触发重渲染。

   保留 job 参数（深链）：正在看某条样本时改筛选不该把深链抹掉。 */
function writeFilterToUrl() {
  const src = filterSourceOf(ui.view);
  if (!src) return;
  const st = currentFilterState();
  let hash = FILTER_ENGINE.buildHash(src, ui.view, st);
  // 研究样本库侧额外保留 job 深链参数
  const job = (location.hash.match(/[?&]job=([^&]*)/) || [])[1];
  if (job) {
    const sep = hash.includes('?') ? '&' : '?';
    hash = `${hash}${sep}job=${job}`;
  }
  if (location.hash !== hash) {
    try {
      history.replaceState(null, '', hash);
    } catch {
      location.hash = hash;
    }
  }
}

/* 当前视图的筛选状态（统一成引擎的状态形状） */
function currentFilterState() {
  if (ui.view === 'samples') {
    const s = EXPLORE_BOARD.state;
    return {
      q: s.q || '',
      dims: {
        batch: s.batch || '',
        aspect: s.aspect || '',
        sref: !!s.srefOnly,
      },
    };
  }
  return {
    q: ui.q || '',
    dims: {
      tested: !!ui.tested,
      terms: [...ui.terms],
      colours: [...ui.colours],
    },
  };
}

/* 筛选状态变化后：回写 URL + 重绘（筛选一变 URL 一定变） */
function applyFilterChange() {
  writeFilterToUrl();
  render();
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

/* 二级页签：只属于「提示词库」视图。其它两个一级视图没有二级页签，
   所以这里在它们下面渲染时会返回空串（不占位、不留白边）。 */
function catnavHtml() {
  if (ui.view !== 'library') return '';
  return `
    <div class="catnav" role="tablist" aria-label="提示词库分区" data-od-id="library-tabs">
      ${LIBRARY_TABS.map(t => `
        <button class="catnav-btn" role="tab" type="button" id="tab-${esc(t.id)}" data-tab="${esc(t.id)}"
          aria-controls="library-panel" aria-selected="${ui.tab === t.id}"
          tabindex="${ui.tab === t.id ? '0' : '-1'}">
          ${esc(t.label)}<span class="n">${tabCount(t)}</span>
        </button>`).join('')}
    </div>`;
}

/* 一级视图切换条（报告 4.2）：证据集与假设集不同层，不能同级并列在一个容器里。 */
function viewnavHtml() {
  return `
    <div class="catnav" role="tablist" aria-label="一级视图" data-od-id="view-tabs"
      style="border-bottom:2px solid var(--border-2);padding-bottom:0">
      ${VIEWS.map(v => `
        <button class="catnav-btn" role="tab" type="button" id="view-${esc(v.id)}" data-view="${esc(v.id)}"
          aria-controls="library-panel" aria-selected="${ui.view === v.id}"
          title="${esc(v.hint || '')}"
          tabindex="${ui.view === v.id ? '0' : '-1'}"
          style="${ui.view === v.id ? 'font-size:14px;font-weight:600;padding-block:8px' : 'padding-block:8px'}">
          ${esc(v.label)}<span class="n">${viewCount(v).toLocaleString('zh-CN')}</span>
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
  const isSamples = ui.view === 'samples';
  const isResearch = ui.view === 'research';
  page.innerHTML = `
    ${isSamples ? EXPLORE_BOARD.headHtml() : isResearch ? RESEARCH_VIEW.headHtml() : headHtml()}
    ${viewnavHtml()}
    ${catnavHtml()}
    ${isSamples ? EXPLORE_BOARD.toolbarHtml() : isResearch ? RESEARCH_VIEW.toolbarHtml() : toolbarHtml()}
    <div class="library-body" id="library-panel" role="tabpanel"
      aria-labelledby="${isSamples ? 'view-samples' : isResearch ? 'view-research' : `tab-${esc(ui.tab)}`}" tabindex="0">
      ${isSamples ? EXPLORE_BOARD.bodyHtml() : isResearch ? RESEARCH_VIEW.bodyHtml() : bodyHtml()}
    </div>`;
  wire();
  if (isSamples) {
    EXPLORE_BOARD.wire(page);
    markImageStates(page);
    // 深链直达：#samples?job=<key> → 打开那条作业的灯箱（报告 2.1）
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
      if (ui.view !== 'research') return;
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
  if (ui.view !== 'library') return;
  if (ui.tab === 'artists') {
    el.textContent = `${filteredArtists().length.toLocaleString('zh-CN')} 条匹配`;
  } else {
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

  // 一级视图切换（报告 4.2）
  page.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.view;
      if (next === ui.view) return;
      ui.view = next;
      ui.q = '';
      ui.limit = 48;
      if (next !== 'library') { ui.terms = new Set(); ui.colours = new Set(); }
      location.hash = `#${next}`;
      render();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const i = VIEWS.findIndex(v => v.id === btn.dataset.view);
      let n = i;
      if (e.key === 'ArrowRight') n = (i + 1) % VIEWS.length;
      else if (e.key === 'ArrowLeft') n = (i - 1 + VIEWS.length) % VIEWS.length;
      else if (e.key === 'Home') n = 0;
      else n = VIEWS.length - 1;
      ui.view = VIEWS[n].id;
      location.hash = `#${ui.view}`;
      render();
      const el = document.getElementById(`view-${VIEWS[n].id}`);
      if (el) el.focus();
    });
  });

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
      const i = LIBRARY_TABS.findIndex(t => t.id === btn.dataset.tab);
      let next = i;
      if (e.key === 'ArrowRight') next = (i + 1) % LIBRARY_TABS.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + LIBRARY_TABS.length) % LIBRARY_TABS.length;
      else if (e.key === 'Home') next = 0;
      else next = LIBRARY_TABS.length - 1;
      ui.tab = LIBRARY_TABS[next].id;
      location.hash = `#${ui.tab}`;
      render();
      const el = document.getElementById(`tab-${LIBRARY_TABS[next].id}`);
      if (el) el.focus();
    });
  });

  const search = document.getElementById('lib-search');
  if (search) {
    search.addEventListener('input', () => {
      ui.q = search.value;
      ui.limit = 48;
      writeFilterToUrl();
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
      if (kind === 'tested') { ui.tested = !ui.tested; writeFilterToUrl(); }
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
      writeFilterToUrl();
      render();
    });
  });
  body.querySelectorAll('[data-colour]').forEach(el => {
    el.addEventListener('click', () => {
      const s = el.dataset.colour;
      if (ui.colours.has(s)) ui.colours.delete(s); else ui.colours.add(s);
      writeFilterToUrl();
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
  if (ui.view === 'research') render();
  else {
    const el = document.querySelector('#view-research .n');
    if (el && typeof RESEARCH_VIEW !== 'undefined') {
      el.textContent = String(RESEARCH_VIEW.ui.notes.length + RESEARCH_VIEW.ui.conclusions.length);
    }
  }
});

readHash();
boot('index.html');
onChange(syncSelection);
render();
