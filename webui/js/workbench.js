/* ==========================================================================
   工作台：左会话 Dock + 右主区
   主区按**一级视图**切换（报告 4.2）：
     · 提示词库    —— 四个摄影词库分类（假设集）
     · 研究笔记    —— 观察记录与结论（报告 2.3）
   艺术家 / 摄影师已按 ADR-0033 升为顶栏独立页「艺术家库」；研究样本库 /
   官方风格榜按 ADR-0034 升为顶栏独立页「样本库」/「风格榜」。本页只留跳转路标。

   筛选统一走 webui/js/filter-engine.js（报告 3.4）：一个引擎 + 一套 URL 契约。
   筛选状态以 URL hash 为唯一来源（ADR-0010），刷新 / 后退 / 分享都能复现。
   ========================================================================== */

const ARTIST_TOTAL = ARTISTS.length; // head 里的可点计数，仍指向艺术家库
const VOCAB_TOTAL = VOCAB_CATEGORIES.reduce(
  (s, c) => s + c.groups.reduce((t, g) => t + g.items.length, 0), 0);

/* ── 一级视图（报告 4.2）──────────────────────────────────────────────
   「提示词库」与「研究样本库」是**异质的证据集 vs 假设集**，不该同层并列在
   一个容器下（页签标题同级会暗示它们同类）。研究样本库因此升为一级视图。

   旧裁决：2026-11-07 用户要求「探索榜放入提示词库里面」（ADR-0013 修订），
   当时的落点是「提示词库的第 9 个页签」。本轮按报告 4.2 推翻该落点 ——
   见 docs/adr/0020-research-sample-library-is-top-level.md。

   「候选词条」（报告 2.6 / 第 12 步）同样是一级视图：它是假设集与证据集的
   **对质界面**，与两者都不同层（不是可拼装的片段，也不是社区成品）——
   见 docs/adr/0024-candidate-vocab-as-top-level-view.md。 */
const VIEWS = [
  { id: 'library', label: '提示词库', hint: '可拼装的片段 —— 你的假设集' },
  { id: 'candidates', label: '候选词条', hint: '社区高频措辞 × 词库覆盖 —— 对质界面' },
  { id: 'compare', label: '对照', hint: '并排看两条 —— 固定变量再下结论' },
  { id: 'research', label: '研究笔记', hint: '观察记录与结论' },
  { id: 'materials', label: '资料库', hint: '自己收集的提示词与图片 —— 未经研究的自采资料' },
];

/* 提示词库视图下的二级页签：四个摄影词库分类。
   艺术家 / 摄影师已按 ADR-0033 升为顶栏独立页「艺术家库」，
   原位置只留一个跳转路标（见 catnavHtml）。 */
const LIBRARY_TABS = VOCAB_CATEGORIES.map(c => ({ id: c.id, label: c.name, kind: 'vocab' }));

const ui = {
  /** 当前一级视图（报告 4.2）：library / samples / research */
  view: 'library',
  /** 提示词库视图下的二级页签（默认第一个词库分类） */
  tab: LIBRARY_TABS[0].id,
  q: '',
  // 下面五项曾服务艺术家页签。保留字段是为了 library 视图的 URL 契约 ——
  // filterSourceOf / applyFilterFromQuery 是全视图共用的，抹掉会误伤深链。
  // 提示词库视图本身已没有这些 UI 入口，实际取值为默认空。
  tested: false,
  terms: new Set(),
  colours: new Set(),
  artistCat: 'all',
  facetsOpen: false,
  limit: 48,
  /** 旧深链带来的作业引用键。样本库已迁出（ADR-0034），本字段不再消费，
      保留是为 URL 白名单兼容（known.add('job')），值恒为 null。 */
  hashJob: null,
  /** 上一次渲染的筛选签名：变了才重绘（避免 URL 回写引起的空转） */
  lastFilterSig: '',
  /** 上一次提示过的「不支持参数」签名 —— 保证只提示一次 */
  lastIgnoredSig: '',
};

/* ── 筛选 ───────────────────────────────────────────────────────────── */
const tabCount = (t) => VOCAB_CATEGORIES.find(c => c.id === t.id).groups.reduce((s, g) => s + g.items.length, 0);

/* 一级视图的计数 */
const viewCount = (v) => {
  if (v.id === 'candidates') {
    // 候选词条数：**不触发构建** —— viewCount 在每次 render 的 viewnav 里同步调用，
    // 若在这里跑一遍 phrase-index(300ms)+candidate-vocab(391ms)，
    // 打开首页（library 视图）也要付这 690 ms，与当前视图无关。
    // 未构建时给 0；候选视图渲染完由 CANDIDATE_VIEW.warm() 把数字补上。
    if (typeof CANDIDATE_VIEW === 'undefined') return 0;
    return CANDIDATE_VIEW.count();
  }
  if (v.id === 'compare') {
    // 对照视图固定两条 —— 计数就是 2（有对象时）；没对象时 0
    if (typeof COMPARE_VIEW === 'undefined') return 0;
    const p = COMPARE_VIEW.readFromHash();
    return p && p.a && p.b ? 2 : (p && (p.a || p.b) ? 1 : 0);
  }
  if (v.id === 'research') {
    // 研究笔记的计数来自本机 IndexedDB（异步加载）；未加载时先显示 0
    return typeof RESEARCH_VIEW !== 'undefined' ? (RESEARCH_VIEW.ui.notes.length + RESEARCH_VIEW.ui.conclusions.length) : 0;
  }
  if (v.id === 'materials') {
    // 资料条目存在本机 IndexedDB，异步装载；未装载时显示 0，装载后由 wire() 触发重绘补上。
    return typeof MATERIALS_VIEW !== 'undefined' ? MATERIALS_VIEW.count() : 0;
  }
  // 艺术家已按 ADR-0033 迁出「提示词库」视图，这里只数词条。
  return VOCAB_TOTAL;
};

/* 深链（报告 2.1 / 3.4）：
   形态  #<一级视图>            —— 直接落到某个视图
         #<一级视图>?<参数>     —— 带筛选参数（ADR-0010：hash 是筛选的唯一来源）
         #samples?job=<key>    —— 直达某条研究样本的灯箱

   页签 id 与 query 参数分开解析。此前只把整个 hash 当页签 id 匹配，
   'explore?job=xxx' 匹配不上任何页签会被整段丢弃。

   旧的 #explore / #samples / #styles-top 已按 ADR-0034 升为顶栏独立页 ——
   进入本页时原样带 query 转发出去，不再在工作台渲染这两个视图。
   筛选参数按数据源的白名单解析，不认识的参数丢弃并提示一次。 */
function readHash() {
  const raw = location.hash.replace(/^#\/?/, '').trim();
  const q = raw.indexOf('?');
  const id = (q === -1 ? raw : raw.slice(0, q)).trim();
  const query = q === -1 ? '' : raw.slice(q + 1);

  /* ADR-0033/0034：已迁出工作台的视图，旧深链原样带 query 跳到独立页。
     必须只用「显式 id」判定 —— 无 hash 时 ui.tab 默认是第一个词库分类，
     若按解析后的 tab 判定，工作台首屏会直接跳走。 */
  const moved = {
    artists: `artists.html#artists`,
    samples: 'samples.html#samples',
    explore: 'samples.html#samples', // 旧探索榜 id，保留兼容
    'styles-top': 'styles-top.html#styles-top',
  };
  if (moved[id]) {
    location.replace(`${moved[id]}${query ? `?${query}` : ''}`);
    return;
  }

  ui.view = VIEWS.some(v => v.id === id) ? id : 'library';

  // 二级页签：仅提示词库视图有
  if (ui.view === 'library') {
    const wanted = id;
    ui.tab = (wanted && LIBRARY_TABS.some(t => t.id === wanted)) ? wanted : LIBRARY_TABS[0].id;
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
  // 样本库已按 ADR-0034 迁出，其下线参数（ADR-0028）由 samples.html 自行处理。
  if (ignored && ignored.length) {
    const known = new Set([...(filterSourceOf(ui.view) || { dims: [] }).dims.map(d => d.key)]);
    known.add('job');
    // 对照视图的参数是 a / b（引用键），不是筛选维度 —— 要放进白名单，
    // 否则 #compare?a=…&b=… 会被当成「不支持的参数」丢掉，对照链接直接失效。
    if (ui.view === 'compare') { known.add('a'); known.add('b'); }
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
    if (ignored && ignored.length) {
      const sig = ignored.slice().sort().join(',');
      if (sig !== ui.lastIgnoredSig) {
        ui.lastIgnoredSig = sig;
        toast(`已忽略不支持的筛选参数：${ignored.join('、')}`, 'close');
      }
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

/* 研究样本库筛选源已按 ADR-0034 抽到 explore-filter.js，与独立页 samples.html
   共用一份。工作台虽不再渲染该视图，仍加载该模块以支撑旧链转发期的白名单
   （applyFilterFromQuery / filterSourceOf 的 typeof 守卫）。 */

/* 候选词条侧（报告 2.6 / 第 12 步）：搜索 + 三态筛选 + 最小频次。
   维度声明在 webui/js/candidate-view.js 里（视图自带自己的源，
   工作台只做 URL 契约的搬运）。 */
const CANDIDATE_FILTER_SOURCE = (typeof CANDIDATE_VIEW !== 'undefined') ? CANDIDATE_VIEW.source() : null;

/* 资料库侧（ADR-0029）：搜索 + 有无配图 + 来源 + 标签 + 收录日，维度在视图里声明。 */
const MATERIALS_FILTER_SOURCE = (typeof MATERIALS_VIEW !== 'undefined') ? MATERIALS_VIEW.source() : null;

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
  // 候选词条侧：状态在自己的视图里（报告 2.6）
  if (ui.view === 'candidates' && typeof CANDIDATE_VIEW !== 'undefined') {
    CANDIDATE_VIEW.stateFromDims({ q: ui.q, status: st.dims.status || [], minDf: st.dims.minDf || '' });
  }
  // 资料库：状态住在视图自己那里（与候选词条同一约定），工作台只搬运 URL 契约
  if (ui.view === 'materials' && typeof MATERIALS_VIEW !== 'undefined') {
    MATERIALS_VIEW.stateFromDims({
      q: ui.q,
      hasImage: !!(st.dims && st.dims.hasImage),
      source: (st.dims && st.dims.source) || '',
      tags: (st.dims && st.dims.tags) || [],
      date: (st.dims && st.dims.date) || '',
    });
  }
  ui.ignoredParams = parsed.ignored || [];
  return ui.ignoredParams;
}

/* 当前视图的筛选源（引擎的白名单） */
function filterSourceOf(view) {
  if (view === 'library') return LIBRARY_FILTER_SOURCE;
  if (view === 'candidates') return CANDIDATE_FILTER_SOURCE;
  if (view === 'materials') return MATERIALS_FILTER_SOURCE;
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
  if (ui.view === 'materials' && typeof MATERIALS_VIEW !== 'undefined') {
    const d = MATERIALS_VIEW.dims();
    return {
      q: d.q || '',
      dims: {
        hasImage: !!d.hasImage,
        source: d.source || '',
        tags: [...(d.tags || [])],
        date: d.date || '',
      },
    };
  }
  if (ui.view === 'candidates' && typeof CANDIDATE_VIEW !== 'undefined') {
    // 候选视图的状态住在视图自己那里（报告 2.6）—— 不在这里复制一份
    const d = CANDIDATE_VIEW.dims();
    return {
      q: d.q || '',
      dims: {
        status: [...(d.status || [])],
        minDf: d.minDf || '',
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
        <a class="param-chip" href="artists.html" data-od-id="artist-count-link"
          style="text-decoration:none;color:inherit" title="前往艺术家库">艺术家 ${ARTIST_TOTAL.toLocaleString('zh-CN')} ↗</a>
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
      <a class="catnav-btn" href="artists.html" data-od-id="artist-nav-link"
        title="艺术家 / 摄影师已升为顶栏独立页" style="text-decoration:none">艺术家库 <span class="n">↗</span></a>
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
      <a class="catnav-btn" href="samples.html" data-od-id="samples-nav-link"
        title="研究样本库已升为顶栏独立页" style="text-decoration:none">样本库 <span class="n">↗</span></a>
      <a class="catnav-btn" href="styles-top.html" data-od-id="styles-top-nav-link"
        title="风格榜已升为顶栏独立页" style="text-decoration:none">风格榜 <span class="n">↗</span></a>
    </div>`;
}

function toolbarHtml() {
  // 艺术家 / 摄影师的分面与「只看实测」已随页面迁到 artists.html（ADR-0033），
  // 这里只留下词条搜索。
  return `
    <div class="toolbar" data-od-id="library-toolbar">
      <div class="search">
        ${icon('search')}
        <input id="lib-search" type="search" aria-label="搜索词条"
          placeholder="搜索词条" value="${esc(ui.q)}" autocomplete="off">
      </div>
      <span class="spacer"></span>
      <span class="dock-count" id="result-count" role="status" aria-live="polite"></span>
    </div>`;
}

/* 艺术家分面面板已随页面迁到 artists.html（ADR-0033）。 */

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
              ${it.preview ? `data-preview="${esc(vocabPreviewPath(it))}" data-gen="${esc(it.gen || '')}"` : ''}>
              ${esc(it.zh)}<span class="en">${esc(it.en)}</span>
            </button>`).join('')}
        </div>
      </section>`).join('')}`;
}

/* 艺术家卡片与列表已随页面迁到 artists.html（ADR-0033）。 */
function bodyHtml() {
  return vocabBodyHtml();
}

/* 艺术家详情弹层已随页面迁到 artists.html（ADR-0033）。 */

/* ── 渲染 ───────────────────────────────────────────────────────────── */
function render() {
  const page = document.getElementById('page');
  if (!page) return;
  const isResearch = ui.view === 'research';
  const isCompare = ui.view === 'compare';
  const isCandidates = ui.view === 'candidates';
  const isMaterials = ui.view === 'materials';
  // 对照视图的对象从 URL 读（a / b 两个引用键）
  const cmpPair = isCompare && typeof COMPARE_VIEW !== 'undefined' ? COMPARE_VIEW.readFromHash() : null;
  const cmpHasBoth = !!(cmpPair && cmpPair.a && cmpPair.b);
  page.innerHTML = `
    ${isResearch ? RESEARCH_VIEW.headHtml() : isCompare ? COMPARE_VIEW.headHtml() : isCandidates ? CANDIDATE_VIEW.headHtml() : isMaterials ? MATERIALS_VIEW.headHtml() : headHtml()}
    ${viewnavHtml()}
    ${catnavHtml()}
    ${isResearch ? RESEARCH_VIEW.toolbarHtml() : isCompare ? COMPARE_VIEW.toolbarHtml(cmpHasBoth) : isCandidates ? CANDIDATE_VIEW.toolbarHtml() : isMaterials ? MATERIALS_VIEW.toolbarHtml() : toolbarHtml()}
    <div class="library-body" id="library-panel" role="tabpanel"
      aria-labelledby="${isResearch ? 'view-research' : isCompare ? 'view-compare' : isCandidates ? 'view-candidates' : isMaterials ? 'view-materials' : `tab-${esc(ui.tab)}`}" tabindex="0">
      ${isResearch ? RESEARCH_VIEW.bodyHtml() : isCompare ? COMPARE_VIEW.bodyHtml(cmpPair) : isCandidates ? CANDIDATE_VIEW.bodyHtml() : isMaterials ? MATERIALS_VIEW.bodyHtml() : bodyHtml()}
    </div>`;
  wire();
  if (isCompare) {
    COMPARE_VIEW.wire(page);
    markImageStates(page);
  } else if (isCandidates) {
    CANDIDATE_VIEW.wire(page);
    // 把 viewnav 上的候选计数补上（viewCount 不触发构建，见候选视图 count() 的注释）
    CANDIDATE_VIEW.warm(page);
  } else if (isResearch) {
    // 研究笔记的数据在本机 IndexedDB，是异步的 —— 先渲染骨架，再拉数据后重绘。
    RESEARCH_VIEW.wire(page);
    RESEARCH_VIEW.load().then(() => {
      if (ui.view !== 'research') return;
      render();
    });
  } else if (isMaterials) {
    // 资料库条目在本机 IndexedDB，异步装载；wire() 里自己触发一次重绘补上数据。
    MATERIALS_VIEW.wire(page);
  } else {
    updateCount();
    markImageStates(page);
  }
}

function updateCount() {
  const el = document.getElementById('result-count');
  if (!el) return;
  if (ui.view !== 'library') return;
  const cat = VOCAB_CATEGORIES.find(c => c.id === ui.tab);
  const total = cat ? cat.groups.reduce((s, g) => s + g.items.length, 0) : 0;
  el.textContent = ui.q ? `${total} 条中匹配` : `${total} 条`;
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
      // 切到对照视图时保留 a / b（它们是对照对象，不是筛选条件）；
      // 从对照视图切走时也不能把 a / b 带走 —— 那会污染下一个视图的 URL。
      const cmp = (typeof COMPARE_VIEW !== 'undefined') ? COMPARE_VIEW.readFromHash() : null;
      if (next === 'compare' && cmp && cmp.a && cmp.b) {
        location.hash = `#compare?a=${encodeURIComponent(COMPARE_VIEW.keyOf(cmp.a))}&b=${encodeURIComponent(COMPARE_VIEW.keyOf(cmp.b))}`;
      } else {
        location.hash = `#${next}`;
      }
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

  // 艺术家页签的分面 / 类别 / 详情 / 加载更多已随页面迁到 artists.html（ADR-0033）。
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
