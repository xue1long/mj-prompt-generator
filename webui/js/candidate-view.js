/* ==========================================================================
   候选词条视图（报告 2.6 / 第 12 步）
   --------------------------------------------------------------------------
   这是「假设集与证据集的交界面」。

   提示词库（词库）是**待验证的假设集**，研究样本库（社区作业）是**证据集**。
   在此之前两者是**两套互不相通的文本** —— 社区 prompt 里出现 `light and shadow`，
   词库里没有，没人知道该把它记下来。

   本视图就是那条通路：**社区高频措辞 × 词库覆盖情况**。

   ## 为什么是一级视图而不是提示词库的第 N 个页签

   与 ADR-0020 同一个理由：候选词条既不是「可拼装的片段」（它是社区作者写的
   原文，不能直接拼进你的提示词），也不是「社区成品」（它是词，不是成品）。
   它是**两者的对照面** —— 与两者都不同层，所以与两者并列。

   ## 本视图只做「清单 + 导出」，不入库

   刻意不做的事：
     · 不自动把候选词条并入词库 —— 词库是人工审过的假设集，
       让机器直接改它，等于让噪声改写你的方法论。
     · 不给候选词条写「建议」按钮 —— 一旦有了「一键采纳」，
       研究者就会停止判断，工具就变成了自动化的借口。

   想要的是：**把「社区里到底在说什么」和「我的词库漏了什么」并排摆出来，
   让人自己决定哪些值得进词库。**

   ## 三态差异标记（详见 webui/js/candidate-vocab.js）

     · 已在词库（exact）      —— 词库原样有这句话
     · 词库有近义（near）      —— 词库有词元级重合的相近表述
     · 词库未覆盖（missing）    —— 词库零重合 ⇒ 这是**真缺口**

   ## 筛选走统一引擎（报告 3.4）

   状态以 URL hash 为唯一来源（ADR-0010）：
     #candidates?q=hair&status=missing&minDf=20
   ========================================================================== */

const CANDIDATE_VIEW = (() => {
  const ui = {
    q: '',
    /** 三态筛选（multi）：可在 exact / near / missing 之间任选 */
    status: new Set(),
    /** 最小频次（enum）：'' = 不限；否则是阈值下限。
        **不能用 '0' 当「不限」的哨兵** —— 引擎的 enum 维度是「精确匹配」，
        值非空即激活 ⇒ minDf='0' 会把 df>0 的候选全部滤掉（实测 matches() 返回 0）。
        空串才是引擎认的「不激活」。 */
    minDf: '',
    limit: 120,
  };

  /* ── 数据源 ─────────────────────────────────────────────────────────
     词库条目：把 VOCAB_CATEGORIES 的三层结构（分类 → 分组 → 条目）摊平。
     艺术家分类不在此列 —— 艺术家是「人名」，不是措辞，
     社区 prompt 里没人写 "Wes Anderson"，把它当措辞比对没有意义。 */
  function vocabItems() {
    if (typeof VOCAB_CATEGORIES === 'undefined') return [];
    const out = [];
    for (const c of VOCAB_CATEGORIES) {
      for (const g of c.groups || []) {
        for (const it of g.items || []) {
          out.push({ zh: it.zh, en: it.en, cat: c.id, catName: c.name });
        }
      }
    }
    return out;
  }

  /* 候选清单：全站一份，惰性构建。
     构建耗时实测 ~120 ms（571 候选 × 133 词库条目的词元比对），
     放在视图首次进入时构建，之后复用。 */
  let BUILT = null;
  function built() {
    if (BUILT) return BUILT;
    if (typeof CANDIDATE_VOCAB === 'undefined') return null;
    if (typeof PHRASE_INDEX === 'undefined' || typeof EXPLORE_JOBS === 'undefined') return null;
    const idx = PHRASE_INDEX.shared(EXPLORE_JOBS);
    const keyOf = (j) => (typeof JOB_KEY !== 'undefined' ? JOB_KEY.keyOf(j) : String(j?.id || '').slice(0, 8));
    BUILT = CANDIDATE_VOCAB.build(idx.phrases, idx.byJob, EXPLORE_JOBS, vocabItems(), { keyOf });
    return BUILT;
  }

  /** 词库反向验证（假设集被证据集检验）—— 与候选清单同一批数据，不同视角。 */
  let VALIDATED = null;
  function validated() {
    if (VALIDATED) return VALIDATED;
    const b = built();
    if (!b) return null;
    if (typeof PHRASE_INDEX === 'undefined' || typeof EXPLORE_JOBS === 'undefined') return null;
    const idx = PHRASE_INDEX.shared(EXPLORE_JOBS);
    const keyOf = (j) => (typeof JOB_KEY !== 'undefined' ? JOB_KEY.keyOf(j) : String(j?.id || '').slice(0, 8));
    VALIDATED = CANDIDATE_VOCAB.validateVocab(idx.phrases, idx.byJob, EXPLORE_JOBS, vocabItems(), { keyOf });
    return VALIDATED;
  }

  /** 重建（数据换了才需要）。 */
  function reset() {
    BUILT = null;
    VALIDATED = null;
  }

  /**
   * 候选总数 —— **不触发构建**。
   *
   * 为什么单独开这个口：workbench.js 的 viewCount() 在**每次 render** 的
   * viewnav 里同步调用。若它去调 built()，那么打开首页（library 视图）
   * 也要先跑一遍 phrase-index(300ms) + candidate-vocab(391ms) ≈ 690 ms
   * —— 一个跟当前视图无关的开销。
   *
   * 所以：未构建时给 0，构建后给真数。候选视图自己渲染完会把
   * viewnav 上的数字补上（见 CANDIDATE_VIEW.warm()）。
   */
  function count() {
    return BUILT ? BUILT.candidates.length : 0;
  }

  /**
   * 预热：确保清单已构建，然后把 viewnav 上的计数补上。
   * 在候选视图渲染完之后调用（此时 built() 已有缓存，第二次是零成本）。
   */
  function warm(host) {
    const b = built();
    if (!b) return 0;
    const scope = host || document;
    const el = scope.querySelector ? scope.querySelector('#view-candidates .n') : null;
    if (el) el.textContent = b.candidates.length.toLocaleString('zh-CN');
    return b.candidates.length;
  }

  /* ── 筛选源声明（报告 3.4：白名单由这里给）───────────────────────── */
  const SOURCE = FILTER_ENGINE.source('candidates', [
    { key: 'q', type: 'q', matchOf: (c, text) => {
      if (String(c.phrase || '').toLowerCase().includes(text)) return true;
      // 近义匹配的词库条目名也要能被搜到 —— 用户找的是「意思」，
      // 不一定记得社区作者写的是哪个词
      return (c.matches || []).some((m) => String(m.en || '').toLowerCase().includes(text)
        || String(m.zh || '').toLowerCase().includes(text));
    } },
    { key: 'status', type: 'multi', valuesOf: (c) => [c.status] },
    /* minDf 声明为 enum 只是为了**进 URL 白名单**（ADR-0010：参数要么被支持、
       要么被丢弃并提示，不允许静默忽略）。
       **它不参与引擎匹配** —— 引擎的 enum 语义是「精确等于」，
       而 minDf 是「阈值下限」；把阈值当等值用会把候选全滤掉（实测 matches()=0）。
       所以匹配时用 engineState() 把这个维度清空，阈值由 matches() 前置处理。 */
    { key: 'minDf', type: 'enum', valueOf: (c) => String(c.df) },
  ]);

  /* ── 状态 ─────────────────────────────────────────────────────────── */
  function filterState() {
    return {
      q: ui.q || '',
      dims: {
        status: [...ui.status],
        minDf: ui.minDf || '',
      },
    };
  }

  /** 给引擎用的状态 —— 把 minDf 清空（阈值不进引擎匹配，见 SOURCE 的注释）。 */
  function engineState() {
    const st = filterState();
    return { q: st.q, dims: { status: st.dims.status, minDf: '' } };
  }

  /** 最小频次阈值（0 = 不限）。 */
  function minDfValue() {
    const n = Number(ui.minDf);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** 当前筛选命中的候选（全部，不是分页后显示的那些）。 */
  function matches() {
    const b = built();
    if (!b) return [];
    const all = b.candidates;
    const minDf = minDfValue();
    // 阈值前置过滤（阈值语义 ≠ 引擎的等值语义）
    const pre = minDf > 0 ? all.filter((c) => c.df >= minDf) : all;
    return FILTER_ENGINE.filter(SOURCE, pre, engineState());
  }

  /** 三态计数（在当前其它筛选下计算 —— 经典分面行为）。 */
  function statusCounts() {
    const b = built();
    const out = { exact: 0, near: 0, missing: 0 };
    if (!b) return out;
    const minDf = minDfValue();
    const pre = minDf > 0 ? b.candidates.filter((c) => c.df >= minDf) : b.candidates;
    // 算某态的计数时，要排除「status 维度自己」的筛选
    const st = engineState();
    const probe = { q: st.q, dims: { status: [], minDf: '' } };
    for (const c of FILTER_ENGINE.filter(SOURCE, pre, probe)) {
      out[c.status] = (out[c.status] || 0) + 1;
    }
    return out;
  }

  const MIN_DF_OPTIONS = [
    { value: '', label: '不限频次' },
    { value: '10', label: '≥ 10 条作业' },
    { value: '20', label: '≥ 20 条作业' },
    { value: '50', label: '≥ 50 条作业' },
  ];

  /* ── 片段 ─────────────────────────────────────────────────────────── */

  function headHtml() {
    const b = built();
    const v = validated();
    if (!b) {
      return `
        <div class="library-head" data-od-id="candidate-head">
          <h1>候选词条</h1>
          <p class="lead">候选词条模块未加载。确认 js/ 目录完整（candidate-vocab.js、phrase-index.js、data-explore.js），然后重新加载。</p>
        </div>`;
    }
    const vocabN = b.vocabCount;
    const usedN = v ? v.filter((r) => r.matched).length : 0;
    return `
      <div class="library-head" data-od-id="candidate-head">
        <h1>候选词条</h1>
        <p class="lead">社区里反复出现的措辞，逐条标出<b>词库覆盖到了没有</b>。这是提示词库（你的假设集）与研究样本库（社区证据）之间的对质界面——<b>看缺口，不自动补</b>。</p>
        <div class="head-meta">
          <span class="param-chip">候选 ${b.candidates.length} 条</span>
          <span class="param-chip">词库 ${vocabN} 条</span>
          <span class="param-chip">词库被社区用到 ${usedN} 条</span>
          <span class="param-chip">精确命中 ${b.byStatus.exact}</span>
          <span class="param-chip">真缺口 ${b.byStatus.missing}</span>
        </div>
      </div>`;
  }

  function toolbarHtml() {
    const b = built();
    const counts = statusCounts();
    const list = matches();
    return `
      <div class="toolbar" data-od-id="candidate-toolbar">
        <div class="search">
          ${icon('search')}
          <input id="cand-search" type="search" aria-label="搜索候选词条"
            placeholder="搜索社区措辞，例如 hair / portrait" value="${esc(ui.q)}" autocomplete="off">
        </div>
        <div class="tag-grid" role="group" aria-label="按词库覆盖情况筛选" style="display:flex;gap:6px;flex-wrap:wrap">
          ${['exact', 'near', 'missing'].map(s => `
            <button class="toggle${ui.status.has(s) ? ' on' : ''}" type="button" data-cand-status="${s}"
              aria-pressed="${ui.status.has(s)}" title="${esc(CANDIDATE_VOCAB.STATUS_LABEL[s])}">
              ${esc(CANDIDATE_VOCAB.STATUS_LABEL[s])}<span class="n">${counts[s] || 0}</span>
            </button>`).join('')}
        </div>
        <select class="select" id="cand-mindf" aria-label="最小频次" style="width:auto">
          ${MIN_DF_OPTIONS.map(o => `<option value="${esc(o.value)}"${ui.minDf === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="dock-count" id="cand-count" role="status" aria-live="polite">${list.length} 条（显示 ${Math.min(ui.limit, list.length)}）</span>
        ${exportMenuHtml()}
      </div>`;
  }

  /* ── 导出菜单 ─────────────────────────────────────────────────────── */
  function exportMenuHtml() {
    return `
      <details class="msel" data-od-id="candidate-export-menu">
        <summary class="msel-label" title="把当前筛选命中的候选词条导出为独立文件">
          ${icon('external')}导出
        </summary>
        <div class="msel-panel" role="group" aria-label="导出格式">
          <div class="msel-list">
            <button class="btn btn-ghost" type="button" data-cand-export="json">JSON（给工具消费）</button>
            <button class="btn btn-ghost" type="button" data-cand-export="markdown">Markdown（给人读）</button>
          </div>
          <p class="dock-hint" style="padding:8px 10px">导出的是<b>当前筛选命中的全部候选</b>，不只是屏幕上显示的那些。</p>
        </div>
      </details>`;
  }

  /* ── 候选行 ───────────────────────────────────────────────────────── */
  const STATUS_CLASS = { exact: 'is-exact', near: 'is-near', missing: 'is-missing' };

  function candidateRowHtml(c) {
    const near = c.matches || [];
    return `
      <tr class="cand-row ${STATUS_CLASS[c.status] || ''}" data-od-id="cand-${esc(c.phrase)}">
        <td class="cand-phrase">
          <button class="cand-phrase-btn" type="button" data-cand-phrase="${esc(c.phrase)}" title="查看出处样本">${esc(c.phrase)}</button>
        </td>
        <td class="cand-df">${c.df}</td>
        <td class="cand-status"><span class="cand-badge ${STATUS_CLASS[c.status] || ''}">${esc(c.statusLabel)}</span></td>
        <td class="cand-match">
          ${near.length
            ? near.slice(0, 3).map((m) => `<span class="term">${esc(m.zh || m.en)}<span class="en">${esc(m.en)}</span></span>`).join('')
            : '<span class="dock-hint">—</span>'}
        </td>
        <td class="cand-src">
          <button class="cand-src-btn" type="button" data-cand-sources="${esc(c.phrase)}">${c.sourceCount} 条出处</button>
        </td>
      </tr>`;
  }

  function bodyHtml() {
    const b = built();
    if (!b) {
      return stateHtml({
        title: '候选词条模块未加载',
        desc: '确认 js/ 目录完整（candidate-vocab.js、phrase-index.js、data-explore.js），然后重新加载。',
        iconName: 'info',
      });
    }
    const list = matches();
    if (!list.length) {
      return stateHtml({
        title: '没有匹配的候选词条',
        desc: '当前筛选条件下没有结果。清空搜索框，或把「词库覆盖情况」与最小频次放宽。',
        iconName: 'search',
      });
    }
    const shown = list.slice(0, ui.limit);
    const counts = statusCounts();
    return `
      <div class="group-block">
        <div class="group-head">
          <h2>候选词条清单</h2>
          <span class="n">显示 ${shown.length} / ${list.length} 条 · 全部 ${b.candidates.length} 条（精确 ${b.byStatus.exact} · 近义 ${b.byStatus.near} · 未覆盖 ${b.byStatus.missing}）</span>
        </div>
        <p class="dock-hint" style="margin-bottom:14px">
          <b>真缺口</b>（${counts.missing} 条）是社区高频使用、而你的词库完全没有的措辞 —— 这些是最值得考虑进词库的。
          <b>词库有近义</b>（${counts.near} 条）说明词库方向对了但措辞没对上，值得看看是不是该换种写法。
          点<b>出处</b>看是哪几条社区作业用了它。
        </p>
        <div style="overflow-x:auto">
          <table class="cand-table">
            <thead>
              <tr>
                <th scope="col">社区措辞</th>
                <th scope="col" style="width:64px">频次</th>
                <th scope="col" style="width:110px">词库覆盖</th>
                <th scope="col">词库对应</th>
                <th scope="col" style="width:96px">出处</th>
              </tr>
            </thead>
            <tbody>${shown.map(candidateRowHtml).join('')}</tbody>
          </table>
        </div>
        ${shown.length < list.length
          ? `<div style="text-align:center;margin-top:16px"><button class="btn btn-secondary" type="button" data-role="cand-more">加载更多（还有 ${(list.length - shown.length).toLocaleString('zh-CN')} 条）</button></div>`
          : ''}
      </div>`;
  }

  /* ── 出处弹层 ─────────────────────────────────────────────────────── */
  function openSourcesSheet(phrase) {
    const b = built();
    if (!b) return;
    const c = b.candidates.find((x) => x.phrase === phrase);
    if (!c) return;
    const jobs = typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS : [];
    const keyOf = (j) => (typeof JOB_KEY !== 'undefined' ? JOB_KEY.keyOf(j) : String(j?.id || '').slice(0, 8));
    const byKey = new Map(jobs.map((j) => [keyOf(j), j]));
    const hits = (c.sources || []).map((k) => byKey.get(k)).filter(Boolean);
    const STATUS_LABEL = (typeof CANDIDATE_VOCAB !== 'undefined' && CANDIDATE_VOCAB.STATUS_LABEL[c.status]) || c.status;

    const { backdrop } = mountDialog(`
      <div class="sheet" data-od-id="cand-sources">
        <div class="sheet-head">
          <div style="flex:1">
            <p class="eyebrow">候选词条出处 · ${esc(STATUS_LABEL)}</p>
            <h2>${esc(c.phrase)}</h2>
          </div>
          <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
        </div>
        <p class="dock-hint" style="margin:0 0 14px">
          ${c.df} 条社区作业用到了这个措辞。点引用键可直接跳到那条样本。
        </p>
        <div class="job-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
          ${hits.map((j) => `
            <button class="job-card" type="button" data-cand-goto="${esc(keyOf(j))}" style="text-align:left">
              <span class="job-body">
                <span class="job-title">${esc(j.title || '(无标题)')}</span>
                <span class="job-meta">
                  <span>${esc(j.aspect || '')}</span>
                  <span class="author">${esc(j.author || '')}</span>
                </span>
                <span class="job-meta"><code style="font-family:ui-monospace,monospace">${esc(keyOf(j))}</code></span>
              </span>
            </button>`).join('')}
        </div>
      </div>`, { label: `候选词条 ${c.phrase} 的出处` });

    backdrop.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('[data-cand-goto]');
      if (!btn || !backdrop.contains(btn)) return;
      ev.preventDefault();
      const key = btn.dataset.candGoto;
      // 跳到研究样本库独立页并直达那条作业（深链契约，报告 2.1 / ADR-0034）
      location.assign(`samples.html#samples?job=${encodeURIComponent(key)}`);
    });
  }

  /* ── 导出执行 ─────────────────────────────────────────────────────── */
  function doExport(format) {
    if (typeof CANDIDATE_EXPORT === 'undefined') {
      toast('导出模块未加载', 'close');
      return;
    }
    const list = matches();
    if (!list.length) {
      toast('当前筛选没有命中任何候选词条', 'close');
      return;
    }
    try {
      if (format === 'markdown') {
        CANDIDATE_EXPORT.download(
          CANDIDATE_EXPORT.toMarkdown(list),
          CANDIDATE_EXPORT.filename('md'),
          'text/markdown;charset=utf-8',
        );
      } else {
        CANDIDATE_EXPORT.download(
          CANDIDATE_EXPORT.toJson(list),
          CANDIDATE_EXPORT.filename('json'),
          'application/json;charset=utf-8',
        );
      }
      toast(`已导出 ${list.length} 条候选词条`);
    } catch (e) {
      toast('导出失败：' + ((e && e.message) || e), 'close');
    }
  }

  /* ── 刷新 ─────────────────────────────────────────────────────────── */
  /** 任一筛选变化后的唯一刷新入口：重绘 body、同步 toolbar 计数。 */
  function refresh(host) {
    const body = panelOf(host);
    if (!body) return;
    body.innerHTML = bodyHtml();
    wireBody(body);
    const scope = body.parentElement || host;
    const count = scope.querySelector('#cand-count');
    if (count) {
      const list = matches();
      count.textContent = `${list.length} 条（显示 ${Math.min(ui.limit, list.length)}）`;
    }
    // 三态 toggle 的选中态与计数
    const counts = statusCounts();
    scope.querySelectorAll('[data-cand-status]').forEach((el) => {
      const s = el.dataset.candStatus;
      el.classList.toggle('on', ui.status.has(s));
      el.setAttribute('aria-pressed', String(ui.status.has(s)));
      const n = el.querySelector('.n');
      if (n) n.textContent = String(counts[s] || 0);
    });
  }

  /** 解析容器（与 explore-board.js 同手法，兼容 #library-panel 与容器本身）。 */
  function panelOf(host) {
    if (!host) return null;
    if (host.id === 'library-panel' || host.id === 'candidate-panel') return host;
    return host.querySelector('#library-panel') || host.querySelector('#candidate-panel');
  }

  /* ── 接线 ─────────────────────────────────────────────────────────── */
  function wire(host) {
    const pushUrl = () => {
      if (typeof writeFilterToUrl === 'function') writeFilterToUrl();
    };

    const search = host.querySelector('#cand-search');
    if (search) {
      search.addEventListener('input', () => {
        ui.q = search.value;
        ui.limit = 120;
        pushUrl();
        refresh(host);
      });
    }

    const mindf = host.querySelector('#cand-mindf');
    if (mindf) {
      mindf.addEventListener('change', () => {
        ui.minDf = mindf.value;
        ui.limit = 120;
        pushUrl();
        refresh(host);
      });
    }

    /* 三态 toggle 与导出：**事件委托**（挂在 toolbar 上）——
       toolbar 每次 render 都重建，逐元素绑定会丢（同 explore-board.js 的做法）。 */
    const toolbar0 = host.querySelector('.toolbar');
    if (toolbar0 && !toolbar0.dataset.candDelegated) {
      toolbar0.dataset.candDelegated = '1';
      toolbar0.addEventListener('click', (ev) => {
        const st = ev.target.closest ? ev.target.closest('[data-cand-status]') : null;
        if (st && toolbar0.contains(st)) {
          const s = st.dataset.candStatus;
          if (ui.status.has(s)) ui.status.delete(s); else ui.status.add(s);
          ui.limit = 120;
          pushUrl();
          refresh(host);
          return;
        }
        const exp = ev.target.closest ? ev.target.closest('[data-cand-export]') : null;
        if (exp && toolbar0.contains(exp)) {
          ev.preventDefault();
          doExport(exp.dataset.candExport);
          const det = exp.closest('details');
          if (det) det.open = false;
          return;
        }
      });
    }

    /* 出处弹层的触发：点「N 条出处」或社区措辞本身。
       委托挂在 panel 上 —— refresh() 会重建 body，逐元素绑定每次都丢。 */
    const panel = panelOf(host);
    if (panel && !panel.dataset.candPanelDelegated) {
      panel.dataset.candPanelDelegated = '1';
      panel.addEventListener('click', (ev) => {
        const more = ev.target.closest ? ev.target.closest('[data-role="cand-more"]') : null;
        if (more) { ui.limit += 120; refresh(panel); return; }
        const src = ev.target.closest ? ev.target.closest('[data-cand-sources]') : null;
        if (src) { openSourcesSheet(src.dataset.candSources); return; }
        const ph = ev.target.closest ? ev.target.closest('[data-cand-phrase]') : null;
        if (ph) { openSourcesSheet(ph.dataset.candPhrase); return; }
      });
    }

    wireBody(host);
  }

  function wireBody(host) {
    const body = panelOf(host);
    if (!body) return;
    // body 里的按钮全部走面板级委托（见 wire），这里不重复绑定。
    // 保留一个空实现以对齐其它视图的接口形状。
  }

  /* ── 状态读写（供 workbench.js 的 URL 契约使用）──────────────────── */
  function stateFromDims(dims) {
    ui.q = dims.q || '';
    ui.status = new Set(dims.status || []);
    ui.minDf = dims.minDf || '';
  }

  function dims() {
    return {
      q: ui.q || '',
      status: [...ui.status],
      minDf: ui.minDf || '',
    };
  }

  function source() {
    return SOURCE;
  }

  return {
    headHtml,
    toolbarHtml,
    bodyHtml,
    wire,
    wireBody,
    refresh,
    matches,
    built,
    validated,
    statusCounts,
    stateFromDims,
    dims,
    source,
    reset,
    count,
    warm,
    vocabItems,
    state: ui,
  };
})();

if (typeof window !== 'undefined') window.CANDIDATE_VIEW = CANDIDATE_VIEW;
