/* ==========================================================================
   研究样本库面板（报告 4.2：原「探索榜」）
   现在是**一级视图** —— 与「提示词库」并列而非从属。理由：词库是可拼装的片段
   （假设集），社区作业是不可拼装的成品（证据集）；两者在同一个容器下并列，
   页签标题同级会暗示它们同类（Q3 已裁定社区数据是证据集、词库是假设集）。

   旧裁决：2026-11-07 用户要求「探索榜放入提示词库里面」（ADR-0013 修订）。
   本轮按报告 4.2 推翻该落点 —— 见 docs/adr/0020-research-sample-library-is-top-level.md。

   筛选统一走 webui/js/filter-engine.js（报告 3.4）：状态以 URL hash 为唯一来源。
   数据源：config/explore.yaml + config/explore-decomposed.yaml
   ========================================================================== */

const EXPLORE_BOARD = (() => {
  const ui = {
    q: '', batch: '', aspect: '', srefOnly: false,
    /** 已选的 sref 码（多选，报告 2.2） */
    srefCodes: new Set(),
    /** 已选的 prompt 短语（多选，报告 2.2） */
    phrases: new Set(),
    /** 已选的拆解来源（多选，报告 2.5）—— 值的域在 DECOMP_SOURCES */
    decomp: new Set(),
    /** 已选的生成日期（多选，报告 2.7）—— `YYYY-MM-DD`，由 time 换算 */
    genDates: new Set(),
    limit: 60,
    facetsOpen: false,
    /** 勾选待对照的作业 id（最多 2 条，报告 2.2） */
    compareSel: [],
  };

  /* 拆解来源的取值域（报告 2.5）—— 与 build-webui-data.mjs 的 modelSource() 同域。
     第四项「无拆解」是为将来采集到的新作业留的位置：当前 971/971 都有拆解，
     但滚动窗口每天进新作业，缺拆解是常态而非异常。 */
  const DECOMP_SOURCES = [
    { value: '手工精拆', label: '手工精拆 · 已验收基准' },
    { value: '逐条精拆', label: '逐条精拆 · LLM 语义判断' },
    { value: '规则解析', label: '规则解析 · 未精拆' },
    { value: '无拆解', label: '无拆解' },
  ];
  /** 「可信拆解」= 手工 + 逐条。报告 2.5：研究结论默认只采信这一层。 */
  const TRUSTED_DECOMP = ['手工精拆', '逐条精拆'];
  /** 一条作业的拆解来源。缺拆解归到「无拆解」，不归到最低可信的规则解析 ——
      「没有结论」和「有结论但不可信」是两件事。 */
  const decompSourceOf = (j) => (j && j.decomposition && j.decomposition.source) || '无拆解';

  /** 多选下拉的 id → 它对应的状态集合。
      单一映射，别在各处写 `id === 'x' ? A : B` 的三元 —— 每加一个下拉就要改好几处，
      漏一处就会让新下拉的勾选态被当成另一个下拉的状态（错得很难看出来）。 */
  function setOfMsel(id) {
    switch (id) {
      case 'ex-srefcode': return ui.srefCodes;
      case 'ex-phrase': return ui.phrases;
      case 'ex-decomp': return ui.decomp;
      case 'ex-gendate': return ui.genDates;
      default: return null;
    }
  }

  /* ── 卡片操作区 ─────────────────────────────────────────────────────
     收藏键只由提示词正文的哈希决定：同一条提示词在任何筛选条件下状态一致。
     图标独立用 16 网格，不复用 core.js 的 24 网格 icon()。            */
  const FAV_PREFIX = 'mj-explore-fav-';
  let favReadWarned = false;

  const ACTION_ICON = {
    copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5"/><path d="M11 5.5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11h2"/></svg>',
    bookmark: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5h8a1 1 0 0 1 1 1V14l-5-3.2L3 14V3.5a1 1 0 0 1 1-1Z"/></svg>',
  };

  function favKey(prompt) {
    // FNV-1a 32 位：同步、零依赖；不用 crypto.subtle（file:// 下不保证安全上下文）
    let h = 0x811c9dc5;
    for (let i = 0; i < prompt.length; i++) {
      h ^= prompt.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return FAV_PREFIX + (h >>> 0).toString(36);
  }

  /* ── 稳定引用键（报告 2.1）───────────────────────────────────────────
     每条作业有一个本项目自有的短标识（如 7b95a9a0-qfxx），供研究结论引用、
     供 #explore?job=<key> 深链直达灯箱。

     键在**运行时**由 webui/js/job-key.js 算出（算法本体只有那一份，
     构建期通过 vm 加载同一份做零碰撞断言）—— 前端自己算，不消费产物里的字段，
     这样改一行前端代码不会引起生成物漂移。
     构造与理由见 webui/js/job-key.js 的文件头注释。 */
  const jobKeyOf = (job) => (job && typeof JOB_KEY !== 'undefined') ? JOB_KEY.keyOf(job) : String(job?.id || '').slice(0, 8);

  /** 按稳定键找作业。 */
  function findByKey(key) {
    if (!key) return null;
    const k = String(key).trim().toLowerCase();
    if (!k) return null;
    return EXPLORE_JOBS.find((j) => jobKeyOf(j).toLowerCase() === k) || null;
  }

  /** 这条作业的深链：#samples?job=<key>（报告 4.2：一级视图 id 是 samples）。
      用相对 index.html，file:// 与 http:// 下都成立（深链是给人和笔记用的，
      粘到别的机器上也能开）。 */
  function jobDeepLink(job) {
    const key = jobKeyOf(job);
    const base = location.pathname.endsWith('/')
      ? 'index.html'
      : location.pathname.split('/').pop() || 'index.html';
    return `${base}#samples?job=${encodeURIComponent(key)}`;
  }

  function favRead(prompt) {
    try {
      return localStorage.getItem(favKey(prompt)) === '1';
    } catch {
      // 存储可用性探测：与 THEME_KEY / SESSION_KEY 的读取防护同构；不静默，只提示一次
      if (!favReadWarned) {
        favReadWarned = true;
        toast('收藏状态无法读取，本次不恢复收藏', 'close');
      }
      return false;
    }
  }

  function favWrite(prompt, on) {
    try {
      localStorage.setItem(favKey(prompt), on ? '1' : '0');
      return true;
    } catch {
      toast('收藏状态无法保存', 'close');
      return false;
    }
  }

  /** 与详情灯箱 fill-subject 同一契约（ADR-0013 / ADR-0016）：
      社区成品写进「主体与环境」，不进「已选提示词」，也不覆盖手动改写的最终提示词。 */
  function applyToWorkbench(job) {
    session.subject = job.prompt;
    saveSession();
    emitChange();
    const input = document.getElementById('subject-input');
    if (input) {
      input.value = job.prompt;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
    toast('已填入主体与环境');
  }

  async function copyPrompt(prompt, btn) {
    // core.js 的 copyText 已实现 clipboard → execCommand 降级，并在彻底失败时显式 toast
    const ok = await copyText(prompt, '提示词已复制');
    if (!ok) return;
    const label = btn.querySelector('.ex-card__actions-label');
    if (!label) return;
    label.textContent = '已复制';
    setTimeout(() => {
      if (label.isConnected) label.textContent = '复制';
    }, 1200);
  }

  function toggleFav(job, btn) {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    if (!favWrite(job.prompt, next)) return;
    btn.setAttribute('aria-pressed', String(next));
  }

  function actionsHtml(j) {
    const picked = ui.compareSel.includes(j.id);
    return `
      <div class="ex-card__actions">
        <button class="ex-card__actions-btn ex-card__actions-btn--primary" type="button"
          data-ex-action="apply" data-job-id="${esc(j.id)}">套用到工作台</button>
        <button class="ex-card__actions-btn ex-card__actions-btn--outline" type="button"
          data-ex-action="copy" data-job-id="${esc(j.id)}" aria-label="复制这条提示词">
          ${ACTION_ICON.copy}<span class="ex-card__actions-label">复制</span></button>
        <span class="ex-card__actions-spacer"></span>
        <label class="ex-card__cmp" title="勾选后切到「对照」视图并排比较">
          <input type="checkbox" data-ex-cmp="${esc(j.id)}"${picked ? ' checked' : ''}>
          <span class="ex-card__cmp-label">${picked ? '已选' : '对比'}</span>
        </label>
        <button class="ex-card__actions-btn ex-card__actions-btn--fav" type="button"
          data-ex-action="fav" data-job-id="${esc(j.id)}"
          aria-label="收藏这条提示词" aria-pressed="${favRead(j.prompt)}">
          ${ACTION_ICON.bookmark}</button>
      </div>`;
  }

  /* ── 筛选（报告 3.4：统一走 filter-engine.js）─────────────────────
     引擎的白名单由 workbench.js 的 EXPLORE_FILTER_SOURCE 声明；
     这里只提供「怎么取值」，匹配与计数都由引擎做 —— 不再各写各的。 */
  /* 短语索引（报告 2.2）：全站共享一份（缓存在 phrase-index.js 里）。
      索引由 prompt 现算，不烘焙进数据产物 ——
      改阈值不必重建 6 MB 生成物，理由同 job-key.js。 */
  function index() {
    if (typeof PHRASE_INDEX === 'undefined') return null;
    return PHRASE_INDEX.shared(EXPLORE_JOBS);
  }

  /** 一条作业的 sref 码（上游是空格分隔的字符串，可能一作业多码）。 */
  const srefCodeList = (j) => String(j?.sref || '').split(/\s+/).filter(Boolean);

  /** 一条作业命中的收录短语。 */
  function phrasesOfJob(j) {
    const idx = index();
    if (!idx) return [];
    return idx.byJob.get(String(j?.id ?? '')) || [];
  }

  function filterState() {
    return {
      q: ui.q || '',
      dims: {
        batch: ui.batch || '',
        aspect: ui.aspect || '',
        sref: !!ui.srefOnly,
        srefCode: [...ui.srefCodes],
        phrase: [...ui.phrases],
        // 报告 2.5 / 2.7 新增的两个维度
        decomp: [...ui.decomp],
        genDate: [...ui.genDates],
      },
    };
  }

  function matches() {
    const src = typeof EXPLORE_FILTER_SOURCE !== 'undefined' ? EXPLORE_FILTER_SOURCE : null;
    if (!src) return EXPLORE_JOBS.slice();
    return FILTER_ENGINE.filter(src, EXPLORE_JOBS, filterState());
  }

  /** 某个维度的分面计数（批次 / 比例）。 */
  function facetCount(dimKey, value) {
    const src = typeof EXPLORE_FILTER_SOURCE !== 'undefined' ? EXPLORE_FILTER_SOURCE : null;
    if (!src) return 0;
    return FILTER_ENGINE.counts(src, EXPLORE_JOBS, filterState(), dimKey).get(value) || 0;
  }

  const totalJobs = () => EXPLORE_BATCHES.reduce((s, b) => s + b.jobs, 0);
  const srefCount = () => EXPLORE_JOBS.filter(j => j.sref).length;

  /* 下拉只列本地样本实际覆盖的批次 / 比例，避免「选了必空态」（ADR-0017）。
     选项后的数字取样本内真实条数，不沿用上游全量统计；接回全量数据后自动扩展。 */
  function availableFrom(list, field) {
    const counts = new Map();
    for (const j of EXPLORE_JOBS) counts.set(j[field], (counts.get(j[field]) || 0) + 1);
    const seen = new Set();
    const out = [];
    for (const it of list) {
      if (!counts.has(it.key)) continue;
      out.push({ ...it, sample: counts.get(it.key) });
      seen.add(it.key);
    }
    for (const [key, n] of counts) {
      if (!seen.has(key)) out.push({ key, name: key, sample: n });
    }
    return out;
  }
  const availableBatches = () => availableFrom(EXPLORE_BATCHES, 'batch');
  const availableAspects = () => availableFrom(EXPLORE_ASPECTS, 'aspect');

  /** 某个维度的**完整**分面计数表（一次算完，供多选下拉逐项取用）。
      与 facetCount 同口径，但只算一次 —— 短语维度有 571 个选项，
      逐项算就是 571 × 971 次匹配。 */
  function facetCounts(dimKey) {
    const src = typeof EXPLORE_FILTER_SOURCE !== 'undefined' ? EXPLORE_FILTER_SOURCE : null;
    if (!src) return new Map();
    return FILTER_ENGINE.counts(src, EXPLORE_JOBS, filterState(), dimKey);
  }

  /* sref 码下拉的选项（报告 2.2）：按出现次数降序。 */
  function availableSrefCodes() {
    const counts = new Map();
    for (const j of EXPLORE_JOBS) {
      for (const c of srefCodeList(j)) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([code, n]) => ({ code, n }))
      .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  }

  /* 生成日期的选项（报告 2.7）：真实生成日，**新 → 旧**排列。
     为什么不复用 availableBatches：批次是「首次采集日」，实测 968/971 条
     与真实生成日不同，两者是不同的口径，选项也不能共用。
     日期换算走 GEN_DATE（与样本导出的那一列同一份实现）。 */
  function availableGenDates() {
    const counts = new Map();
    if (typeof GEN_DATE === 'undefined') return [];
    for (const j of EXPLORE_JOBS) {
      const d = GEN_DATE.ofJob(j);
      if (!d) continue;
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([date, n]) => ({ date, n }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /* 拆解来源的选项（报告 2.5）：只列数据里真的出现的来源，顺序按可信度。 */
  function availableDecompSources() {
    const seen = new Set();
    for (const j of EXPLORE_JOBS) seen.add(decompSourceOf(j));
    return DECOMP_SOURCES.filter((s) => seen.has(s.value));
  }

  /* 短语下拉的选项（报告 2.2）：全局短语表，按 df 降序。
     全部内联进 toolbar 会让 HTML 涨到 177 KB（实测），所以懒加载 —— 见 multiSelectHtml。 */
  function availablePhrases() {
    const idx = index();
    if (!idx) return [];
    return idx.phrases;
  }

  /* ── 多选下拉（报告 2.2）─────────────────────────────────────────────
     纯 HTML 实现（details + checkbox），不引框架。
     展开时用分面计数显示「选了其它筛选后还剩多少条」——
     分面计数在其它维度当前筛选下计算，这是经典分面行为。

     性能要点（两条，缺一都会让首屏变慢）：
     1. 分面计数**一次算完整张表**，不要每个选项算一次。
        短语维度有 571 个选项，逐个算 = 571 × 971 次匹配 ≈ 55 万次 ——
        首屏渲染会被拖到秒级，toast 提示都来不及显示就消失了。
     2. 选项**懒加载**：lazy=true 时不把选项内联进 HTML，
        等 details 展开（toggle 事件）再注入。
        571 个短语全内联会让 toolbar 涨到 177 KB。 */
  function multiSelectHtml({ id, label, options, selected, dimKey, formatName, lazy }) {
    const sel = selected || [];
    const count = sel.length;
    const nameOf = formatName || ((o) => o.label ?? o.value ?? o.phrase ?? o.code);
    const valueOf = (o) => o.value ?? o.phrase ?? o.code;
    const counts = facetCounts(dimKey);
    const rowHtml = (o) => {
      const v = valueOf(o);
      const n = counts.get(v) || 0;
      const on = sel.includes(v);
      return `
                <label class="msel-row${n === 0 && !on ? ' is-empty' : ''}">
                  <input type="checkbox" data-msel-item="${id}" value="${esc(v)}"${on ? ' checked' : ''}>
                  <span class="msel-name">${esc(nameOf(o))}</span>
                  <span class="msel-n">${n}</span>
                </label>`;
    };
    const body = lazy
      ? (sel.length ? options.filter(o => sel.includes(valueOf(o))).map(rowHtml).join('') : '')
      : options.map(rowHtml).join('');
    return `
      <details class="msel" id="${id}" data-msel="${id}"${lazy ? ' data-msel-lazy="1"' : ''}>
        <summary class="msel-sum">
          <span class="msel-label">${esc(label)}</span>
          ${count ? `<span class="msel-badge">${count}</span>` : ''}
          <span class="msel-caret" aria-hidden="true">▾</span>
        </summary>
        <div class="msel-panel" role="group" aria-label="${esc(label)}">
          <div class="msel-tools">
            <button class="btn btn-ghost" type="button" data-msel-clear="${id}">清空</button>
            <span class="dock-hint" style="margin-left:auto">组内任一 · 组间全部</span>
          </div>
          <div class="msel-list" data-msel-list="${id}">
            ${body || (lazy ? '<p class="dock-hint" style="padding:8px 0">展开后加载选项…</p>' : '<p class="dock-hint" style="padding:8px 0">当前数据里没有可筛的项。</p>')}
          </div>
        </div>
      </details>`;
  }

  function chipsHtml() {
    return `
      <span class="param-chip">作业 ${EXPLORE_JOBS.length} / ${totalJobs()}</span>
      <span class="param-chip">批次 ${availableBatches().length} / ${EXPLORE_BATCHES.length}</span>
      <span class="param-chip">配图 ${EXPLORE_IMAGE_STATS.withImages} / ${EXPLORE_IMAGE_STATS.total}${EXPLORE_IMAGE_STATS.mode === 'sample' ? '（本地抽样）' : ''}</span>
      <span class="param-chip">数据源 midjourney.com/explore</span>`;
  }

  function headHtml() {
    return `
      <div class="library-head" data-od-id="explore-head">
        <h1>研究样本库</h1>
        <p class="lead">社区已做好的成品：一条原始提示词配四格成图。这是**证据集**——用来检验你的假设，不是用来拼装的片段。点开看它是怎么搭的：七段结构、命中构图法、参数尾与合规体检。</p>
        <div class="head-meta">${chipsHtml()}</div>
      </div>`;
  }

  function toolbarHtml() {
    const srefCodes = availableSrefCodes();
    const phrases = availablePhrases();
    const decompSources = availableDecompSources();
    const genDates = availableGenDates();
    /* 「只看可信拆解」开关的 on 状态 = 当前恰好只勾了手工 + 逐条。
       为什么不做成独立状态位：那会让「开关开着、多选里又勾了规则解析」
       这种自相矛盾的状态可能发生。开关只是多选的**快捷写法**，
       URL 里体现的就是 decomp 多选本身，刷新与分享都自然复现。 */
    const trustedOn = ui.decomp.size === TRUSTED_DECOMP.length
      && TRUSTED_DECOMP.every((v) => ui.decomp.has(v));
    const trustedCount = EXPLORE_JOBS.filter((j) => TRUSTED_DECOMP.includes(decompSourceOf(j))).length;
    return `
      <div class="toolbar" data-od-id="explore-toolbar">
        <div class="search">
          ${icon('search')}
          <input id="ex-search" type="search" aria-label="搜索提示词或作者"
            placeholder="搜索提示词或作者" value="${esc(ui.q)}" autocomplete="off">
        </div>
        <select class="select" id="ex-batch" aria-label="按采集批次筛选" title="采集批次 = 这条作业第一次被采到的那天，不是它被生成的那天" style="width:auto">
          <option value="">全部采集批次</option>
          ${availableBatches().map(b => `<option value="${esc(b.key)}"${ui.batch === b.key ? ' selected' : ''}>${esc(b.name)} · ${facetCount('batch', b.key)}</option>`).join('')}
        </select>
        <select class="select" id="ex-aspect" aria-label="按宽高比筛选" style="width:auto">
          <option value="">全部比例</option>
          ${availableAspects().map(a => `<option value="${esc(a.key)}"${ui.aspect === a.key ? ' selected' : ''}>${esc(a.name)} · ${facetCount('aspect', a.key)}</option>`).join('')}
        </select>
        ${srefCount()
          ? `<button class="toggle${ui.srefOnly ? ' on' : ''}" type="button" id="ex-sref" aria-pressed="${ui.srefOnly}">只看有 sref <span class="n">${srefCount()}</span></button>`
          : `<span class="param-chip" title="源数据未采集 --sref 字段">源数据未采集 sref</span>`}
        ${srefCodes.length ? multiSelectHtml({
          id: 'ex-srefcode',
          label: 'sref 码',
          options: srefCodes.map(c => ({ value: c.code, label: c.code })),
          selected: [...ui.srefCodes],
          dimKey: 'srefCode',
        }) : ''}
        ${phrases.length ? multiSelectHtml({
          id: 'ex-phrase',
          label: '提示词短语',
          options: phrases.map(p => ({ value: p.phrase, label: p.phrase })),
          selected: [...ui.phrases],
          dimKey: 'phrase',
          lazy: true,
        }) : ''}
        ${decompSources.length ? multiSelectHtml({
          id: 'ex-decomp',
          label: '拆解来源',
          options: decompSources.map(s => ({ value: s.value, label: s.label })),
          selected: [...ui.decomp],
          dimKey: 'decomp',
        }) : ''}
        ${decompSources.length
          ? `<button class="toggle${trustedOn ? ' on' : ''}" type="button" id="ex-decomp-trusted"
               aria-pressed="${trustedOn}" title="只保留手工精拆与逐条精拆 —— 研究结论默认只采信这一层">只看可信拆解 <span class="n">${trustedCount}</span></button>`
          : ''}
        ${genDates.length ? multiSelectHtml({
          id: 'ex-gendate',
          label: '生成日期',
          options: genDates.map(g => ({ value: g.date, label: GEN_DATE.shortLabel(g.date) })),
          selected: [...ui.genDates],
          dimKey: 'genDate',
        }) : ''}
        <span class="spacer"></span>
        <span class="dock-count" role="status" aria-live="polite">${matches().length} 条作业（显示 ${Math.min(ui.limit, matches().length)}）</span>
        ${exportMenuHtml()}
      </div>`;
  }

  /* ── 导出（报告 4.1 / 第 10 步）────────────────────────────────────
     一个按钮 + 一个格式下拉。为什么不是一个「导出」按钮直接下载：
     两种格式的用途不同（JSON 给工具、Markdown 给人读），让用户每次
     都要猜就失去了导出的意义。

     导出的条数是**当前筛选命中的全部**，不是当前显示的 60 条 ——
     页面分页，导出只覆盖已渲染部分会静默丢数据。 */
  function exportMenuHtml() {
    return `
      <details class="msel" data-od-id="export-menu">
        <summary class="msel-label" title="把当前筛选命中的样本导出为独立文件">
          ${icon('external')}导出
        </summary>
        <div class="msel-panel" role="group" aria-label="导出格式">
          <div class="msel-list">
            <button class="btn btn-ghost" type="button" data-export-format="json">JSON（给工具消费）</button>
            <button class="btn btn-ghost" type="button" data-export-format="markdown">Markdown（给人读）</button>
          </div>
          <p class="dock-hint" style="padding:8px 10px">导出的是<b>当前筛选命中的全部样本</b>，不只是屏幕上显示的那些。</p>
        </div>
      </details>`;
  }

  /** 执行导出。格式之外的逻辑全在 webui/js/sample-export.js。 */
  function doExport(format) {
    if (typeof SAMPLE_EXPORT === 'undefined') {
      toast('导出模块未加载', 'close');
      return;
    }
    const jobs = SAMPLE_EXPORT.currentJobs();
    if (!jobs.length) {
      toast('当前筛选没有命中任何样本', 'close');
      return;
    }
    try {
      if (format === 'markdown') {
        SAMPLE_EXPORT.download(
          SAMPLE_EXPORT.toMarkdown(jobs),
          SAMPLE_EXPORT.filename('md'),
          'text/markdown;charset=utf-8',
        );
      } else {
        SAMPLE_EXPORT.download(
          SAMPLE_EXPORT.toJson(jobs),
          SAMPLE_EXPORT.filename('json'),
          'application/json;charset=utf-8',
        );
      }
      toast(`已导出 ${jobs.length} 条样本`);
    } catch (e) {
      toast('导出失败：' + ((e && e.message) || e), 'close');
    }
  }

  /* ── 勾选对照条（报告 2.2）────────────────────────────────────────
     勾选两条后浮在卡片流上方：显示已选哪两条 + 「去对照」入口。
     放在 body 里而不是 toolbar 里 —— body 每次 refresh 都会重建，
     条上的计数与状态因此天然跟着更新，不用单独同步。 */
  function compareBarHtml() {
    if (!ui.compareSel.length) return '';
    const jobs = ui.compareSel
      .map(id => EXPLORE_JOBS.find(j => j.id === id))
      .filter(Boolean);
    const ready = jobs.length === 2;
    return `
      <div class="cmp-bar" data-od-id="cmp-bar">
        <span class="cmp-bar-label">${icon('columns')}对照</span>
        ${jobs.map((j, i) => `
          <span class="cmp-bar-item">
            <span class="cmp-badge cmp-badge--${i === 0 ? 'a' : 'b'}">${i === 0 ? 'A' : 'B'}</span>
            <span class="cmp-bar-title">${esc(j.title.slice(0, 28))}</span>
          </span>`).join('')}
        ${!ready ? '<span class="dock-hint">再勾一条就能并排比较</span>' : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-role="cmp-clear-sel">清空</button>
        <button class="btn btn-primary" type="button" id="ex-go-compare"${ready ? '' : ' disabled'}>
          ${icon('columns')}去对照
        </button>
      </div>`;
  }

  /* 跳到对照视图：把已勾选的两条写进 URL 再切视图。 */
  function goCompareNow() {
    const jobs = ui.compareSel
      .map(id => EXPLORE_JOBS.find(j => j.id === id))
      .filter(Boolean);
    if (jobs.length < 2) {
      toast('对照需要勾选两条作业', 'close');
      return;
    }
    if (typeof COMPARE_VIEW === 'undefined') return;
    // 用 location.hash 赋值切视图，**不要**用 writeToHash（它走 replaceState）。
    // replaceState 不触发 hashchange —— workbench 的 readHash() 就不会跑，
    // ui.view 还停在 'samples'，render() 渲染的还是样本库。
    // （实测踩过：hash 正确变成 #compare?a=…&b=…，但页面上还是样本库。）
    // location.hash 赋值 → hashchange → readHash() → render()，一条链路走完。
    location.hash = COMPARE_VIEW.hashFor(jobs[0], jobs[1]);
  }

  function bodyHtml() {
    const list = matches();
    const shown = list.slice(0, ui.limit);
    if (!list.length) {
      return stateHtml({
        title: '没有匹配的作业',
        desc: srefCount() ? '换个关键词，或者把批次、比例、sref 码与短语筛选放宽。' : '换个关键词，或者放宽批次与比例筛选。',
        iconName: 'search',
      });
    }
    return `
      ${compareBarHtml()}
      <div class="job-grid">
        ${shown.map(j => `
          <div class="ex-card__actions-frame">
            <button class="job-card" type="button" data-od-id="job-${esc(j.id)}" data-job="${esc(j.id)}">
              <span class="job-thumbs">
                ${j.thumbs.length
                  ? j.thumbs.map((t, i) => `<img src="${esc(t)}" alt="${esc(j.title.slice(0, 40))} 的第 ${i + 1} 格成图" loading="lazy" decoding="async">`).join('')
                  : `<span class="img-plate">暂无本地配图 · ${esc(j.id.slice(0, 8))}</span>`}
              </span>
              <span class="job-body">
                <span class="job-title">${esc(j.title)}</span>
                <span class="job-meta">
                  <span>${esc(j.aspect)}</span>
                  <span>V${esc(j.version)}</span>
                  ${j.sref ? `<span class="sref">sref ${esc(j.sref)}</span>` : ''}
                  <span class="author">${esc(j.author)}</span>
                </span>
              </span>
            </button>
            ${actionsHtml(j)}
          </div>`).join('')}
      </div>
      ${shown.length < list.length
        ? `<div style="text-align:center;margin-top:16px"><button class="btn btn-secondary" type="button" data-role="ex-more">加载更多（还有 ${(list.length - shown.length).toLocaleString('zh-CN')} 条）</button></div>`
        : ''}`;
  }

  /** 解析卡片容器。
      工作台宿主 render() 生成的容器 id 是 #library-panel（workbench.js:328），
      历史代码只认 #explore-panel，拿到 null 后直接 .innerHTML 会抛错。
      这里同时兼容两种 id，以及调用方传「页根」或传「容器本身」两种情况。 */
  function panelOf(host) {
    if (!host) return null;
    if (host.id === 'library-panel' || host.id === 'explore-panel') return host;
    return host.querySelector('#library-panel') || host.querySelector('#explore-panel');
  }

  /** 任一筛选变化后的唯一刷新入口：重绘卡片、重绑详情、同步计数与 toggle 状态。
      搜索框与筛选控件在 toolbar 里、不在容器内，因此不会被重建，输入焦点不丢。 */
  function refresh(host) {
    const body = panelOf(host);
    if (!body) return;
    body.innerHTML = bodyHtml();
    wireBody(body);
    markImageStates(body);
    // toolbar 是容器的兄弟节点：从父级找，传页根或传容器本身都能同步到
    const scope = body.parentElement || host;
    const count = scope.querySelector('.toolbar .dock-count');
    if (count) count.textContent = `${matches().length} 条作业（显示 ${Math.min(ui.limit, matches().length)}）`;
    const sref = scope.querySelector('#ex-sref');
    if (sref) {
      sref.classList.toggle('on', ui.srefOnly);
      sref.setAttribute('aria-pressed', String(ui.srefOnly));
    }
    // 多选下拉的勾选态与计数：toolbar 不随 body 重建，这里显式同步。
    scope.querySelectorAll('[data-msel-item]').forEach(el => {
      const set = setOfMsel(el.dataset.mselItem);
      if (set) el.checked = set.has(el.value);
    });
    scope.querySelectorAll('[data-msel]').forEach(det => {
      const set = setOfMsel(det.dataset.msel);
      if (!set) return;
      const badge = det.querySelector('.msel-badge');
      if (set.size) {
        if (badge) badge.textContent = String(set.size);
        else {
          const b = document.createElement('span');
          b.className = 'msel-badge';
          b.textContent = String(set.size);
          const lab = det.querySelector('.msel-label');
          if (lab) lab.after(b);
        }
      } else if (badge) {
        badge.remove();
      }
    });
    // 「只看可信拆解」开关：on 态由多选推导，不是独立状态位（见 toolbarHtml 注释）
    const trustedBtn = scope.querySelector('#ex-decomp-trusted');
    if (trustedBtn) {
      const on = ui.decomp.size === TRUSTED_DECOMP.length
        && TRUSTED_DECOMP.every((v) => ui.decomp.has(v));
      trustedBtn.classList.toggle('on', on);
      trustedBtn.setAttribute('aria-pressed', String(on));
    }
  }

  /** 把 toolbar + grid 换到 host 里并接线 */
  function wire(host) {
    // 筛选变化 → 回写 URL（报告 3.4 / ADR-0010：hash 是筛选状态的唯一来源）
    const pushUrl = () => {
      if (typeof writeFilterToUrl === 'function') writeFilterToUrl();
    };

    const search = host.querySelector('#ex-search');
    if (search) search.addEventListener('input', () => {
      ui.q = search.value;
      ui.limit = 60;
      pushUrl();
      refresh(host);
    });

    const batch = host.querySelector('#ex-batch');
    if (batch) batch.addEventListener('change', () => {
      ui.batch = batch.value;
      ui.limit = 60;
      pushUrl();
      refresh(host);
    });

    const aspect = host.querySelector('#ex-aspect');
    if (aspect) aspect.addEventListener('change', () => {
      ui.aspect = aspect.value;
      ui.limit = 60;
      pushUrl();
      refresh(host);
    });

    const sref = host.querySelector('#ex-sref');
    if (sref) sref.addEventListener('click', () => {
      ui.srefOnly = !ui.srefOnly;
      pushUrl();
      refresh(host);
    });

    /* 多选下拉的懒加载（报告 2.2）：展开 details 时才把 571 条短语注进 DOM。
       折叠状态下 toolbar 里只有一行摘要 —— 首屏 HTML 从 177 KB 降到 ~1 KB。 */
    host.querySelectorAll('[data-msel-lazy]').forEach(det => {
      det.addEventListener('toggle', () => {
        if (!det.open) return;
        const list = det.querySelector('[data-msel-list]');
        if (!list || list.dataset.loaded === '1') return;
        const id = det.dataset.msel;
        const opts = id === 'ex-phrase'
          ? availablePhrases().map(p => ({ value: p.phrase, label: p.phrase }))
          : availableSrefCodes().map(c => ({ value: c.code, label: c.code }));
        const counts = facetCounts(id === 'ex-phrase' ? 'phrase' : 'srefCode');
        const sel = id === 'ex-phrase' ? ui.phrases : ui.srefCodes;
        list.innerHTML = opts.map(o => {
          const n = counts.get(o.value) || 0;
          const on = sel.has(o.value);
          return `
                <label class="msel-row${n === 0 && !on ? ' is-empty' : ''}">
                  <input type="checkbox" data-msel-item="${id}" value="${esc(o.value)}"${on ? ' checked' : ''}>
                  <span class="msel-name">${esc(o.label)}</span>
                  <span class="msel-n">${n}</span>
                </label>`;
        }).join('');
        list.dataset.loaded = '1';
      });
    });

    /* 多选下拉（报告 2.2）：sref 码 / 提示词短语。
       用**事件委托**（挂在 toolbar 上）—— 懒加载注入的 checkbox 是新元素，
       逐元素绑定绑不到它们；且 refresh() 后 body 重建也会丢绑定。 */
    const toolbar0 = host.querySelector('.toolbar');
    if (toolbar0 && !toolbar0.dataset.mselDelegated) {
      toolbar0.dataset.mselDelegated = '1';
      toolbar0.addEventListener('change', (ev) => {
        const el = ev.target.closest ? ev.target.closest('[data-msel-item]') : null;
        if (!el || !toolbar0.contains(el)) return;
        const id = el.dataset.mselItem;
        const v = el.value;
        const set = setOfMsel(id);
        if (!set) return;
        if (el.checked) set.add(v); else set.delete(v);
        ui.limit = 60;
        pushUrl();
        refresh(host);
      });
      // 「清空」也走委托 —— 与上面的 change 同理，保持一处真相源
      toolbar0.addEventListener('click', (ev) => {
        const btn = ev.target.closest ? ev.target.closest('[data-msel-clear]') : null;
        if (btn && toolbar0.contains(btn)) {
          const id = btn.dataset.mselClear;
          const set = setOfMsel(id);
          if (set) set.clear();
          ui.limit = 60;
          pushUrl();
          refresh(host);
          return;
        }
        // 「只看可信拆解」快捷开关（报告 2.5）：它只是 decomp 多选的一种写法 ——
        // 打开 = 只勾手工 + 逐条；再点一次 = 清空。单一状态源，URL 里就是 decomp。
        const trustedBtn = ev.target.closest ? ev.target.closest('#ex-decomp-trusted') : null;
        if (trustedBtn && toolbar0.contains(trustedBtn)) {
          ev.preventDefault();
          const on = ui.decomp.size === TRUSTED_DECOMP.length
            && TRUSTED_DECOMP.every((v) => ui.decomp.has(v));
          ui.decomp = on ? new Set() : new Set(TRUSTED_DECOMP);
          ui.limit = 60;
          pushUrl();
          refresh(host);
          return;
        }
        // 导出（报告 4.1 / 第 10 步）：同样走委托 —— toolbar 每次 render 都重建，
        // 逐元素绑定会丢。点击后收起下拉，否则面板一直挂在页面上。
        const expBtn = ev.target.closest ? ev.target.closest('[data-export-format]') : null;
        if (expBtn && toolbar0.contains(expBtn)) {
          ev.preventDefault();
          doExport(expBtn.dataset.exportFormat);
          const det = expBtn.closest('details');
          if (det) det.open = false;
          return;
        }
      });
    }

    /* 勾选待对照的作业（报告 2.2）：最多 2 条。
       走**事件委托**（挂在 panel 上）而不是逐元素绑定 ——
       refresh() 会重建 body，逐元素绑定每次刷新都会丢。
       选满 2 条后再勾第 3 条 → 顶掉最早选的那条（先进先出），
       而不是静默忽略 —— 静默会让用户以为勾上了。 */
    const panelCmp = panelOf(host);
    if (panelCmp && !panelCmp.dataset.exCmpDelegated) {
      panelCmp.dataset.exCmpDelegated = '1';
      panelCmp.addEventListener('change', (ev) => {
        const el = ev.target.closest ? ev.target.closest('[data-ex-cmp]') : null;
        if (!el || !panelCmp.contains(el)) return;
        const id = el.dataset.exCmp;
        if (!id) return;
        if (el.checked) {
          if (!ui.compareSel.includes(id)) {
            ui.compareSel.push(id);
            while (ui.compareSel.length > 2) ui.compareSel.shift();
          }
        } else {
          ui.compareSel = ui.compareSel.filter(x => x !== id);
        }
        refresh(panelCmp);
      });
    }

    wireBody(host);

    // 操作区按钮用事件委托：筛选会重建 panel 的 innerHTML，委托挂在 panel 本身才能存活。
    // 不改动既有 [data-job] 逐元素绑定，也不往卡片里注入任何节点。
    const panel = panelOf(host);
    if (panel && !panel.dataset.exDelegated) {
      panel.dataset.exDelegated = '1';
      panel.addEventListener('click', (ev) => {
        const more = ev.target.closest ? ev.target.closest('[data-role="ex-more"]') : null;
        if (more) { ui.limit += 60; refresh(panel); return; }
        // 对照条：去对照 / 清空勾选（这两个按钮在 body 内，会被 refresh 重建，
        // 所以走委托而不是逐元素绑定）
        if (ev.target.closest && ev.target.closest('#ex-go-compare')) {
          ev.preventDefault();
          goCompareNow();
          return;
        }
        if (ev.target.closest && ev.target.closest('[data-role="cmp-clear-sel"]')) {
          ev.preventDefault();
          ui.compareSel = [];
          refresh(panel);
          return;
        }
        const btn = ev.target.closest ? ev.target.closest('[data-ex-action]') : null;
        if (!btn || !panel.contains(btn)) return;
        const job = EXPLORE_JOBS.find(j => j.id === btn.dataset.jobId);
        if (!job) return;
        const action = btn.dataset.exAction;
        if (action === 'apply') applyToWorkbench(job);
        else if (action === 'copy') copyPrompt(job.prompt, btn);
        else if (action === 'fav') toggleFav(job, btn);
      });
    }
  }

  function wireBody(host) {
    const body = panelOf(host);
    if (!body) return;
    body.querySelectorAll('[data-job]').forEach(el => {
      if (el.dataset.wired) return;
      el.dataset.wired = '1';
      el.addEventListener('click', () => openJobSheet(el.dataset.job));
    });
  }

  /* ── 灯箱：作业详情 + 七段拆解 ───────────────────────────────────── */
  function openJobSheet(id) {
    // 逐段送入的单一空值判据：与数据体检口径一致，只去首尾空白、不改内容
    const segText = (s) => String(s.text ?? '').trim();
    const job = EXPLORE_JOBS.find(j => j.id === id);
    if (!job) return;
    const d = job.decomposition;
    const tags = d ? Object.entries(d.tags || {}).filter(([, v]) => v && v.length) : [];
    // 如实标注拆解来源：规则解析从未过 LLM，不能与逐条精拆在灯箱里看起来一样（SKILL.md 第九节）。
    // 复用已有 .param-chip 样式 + inline 强调色，不改 app.css（ADR-0017 Round 4「不动 CSS」）。
    const SOURCE_LABEL = {
      '手工精拆': '手工精拆 · 已验收基准',
      '逐条精拆': 'LLM 逐条精拆',
      '规则解析': '规则解析 · 未精拆',
      '未标注': '来源未标注',
    };
    const sourceBadge = d ? (() => {
      const label = SOURCE_LABEL[d.source] || SOURCE_LABEL['未标注'];
      const accent = d.source === '逐条精拆' || d.source === '手工精拆';
      const hint = d.source === '规则解析'
        ? ' · 确定性关键词匹配，非 LLM 语义判断，部分原文短语可能未收录'
        : '';
      return `<p class="dock-hint" style="margin:10px 0 14px"><span class="param-chip" data-role="decomp-source"${accent ? ' style="color:var(--accent);border-color:var(--accent-line)"' : ''}>${esc(label)}</span>${esc(hint)}</p>`;
    })() : '';

    const { backdrop } = mountDialog(`
      <div class="sheet job-sheet" data-od-id="job-sheet">
        <div class="sheet-head">
          <div style="flex:1">
            <p class="eyebrow">${esc(job.batch)} · V${esc(job.version)} · ${esc(job.aspect)}</p>
            <h2>${esc(job.title)}</h2>
          </div>
          <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
        </div>
        <div class="job-sheet-grid">
          <div>
            <div class="job-sheet-imgs">
              ${job.thumbs.length
                ? job.thumbs.map((t, i) => `<img src="${esc(t)}" alt="${esc(job.title.slice(0, 40))} 的第 ${i + 1} 格成图" decoding="async">`).join('')
                : `<div class="img-plate">本条暂无配图</div>`}
            </div>
            <div class="btn-row" style="margin-top:16px">
              <button class="btn btn-primary" type="button" data-role="copy-prompt">${icon('copy')}复制原始提示词</button>
              <button class="btn btn-secondary" type="button" data-role="fill-subject">${icon('arrowRight')}填入主体与环境</button>
              ${job.sref ? `<button class="btn btn-secondary" type="button" data-role="fill-sref">${icon('plus')}填入 --sref</button>` : ''}
              ${job.sref ? `<button class="btn btn-ghost" type="button" data-role="copy-sref" aria-label="复制 --sref ${esc(job.sref)}">${icon('copy')}</button>` : ''}
            </div>
            <p class="dock-hint" style="margin-top:12px">作者 ${esc(job.author)} · 采集于 ${esc(job.batch)} 批次 · 社区成品，不能直接拼进你的提示词</p>
            <div class="param-chip" style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
              <span title="研究结论里引用这条作业时写这个键">引用键</span>
              <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em">${esc(jobKeyOf(job))}</code>
              <button class="btn btn-ghost" type="button" data-role="copy-key" aria-label="复制引用键">${icon('copy')}复制键</button>
              <button class="btn btn-ghost" type="button" data-role="copy-link" aria-label="复制这条作业的深链">${icon('copy')}复制深链</button>
            </div>
            <div class="param-chip" style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
              <span title="你对这条作业写下的观察与依据它写下的结论">研究记录</span>
              <span data-role="note-count">观察 0 · 结论 0</span>
              <button class="btn btn-ghost" type="button" data-role="write-note" aria-label="写下你对这条作业的观察">${icon('pencil')}写观察</button>
            </div>
            <div data-role="note-list" style="margin-top:8px"></div>
          </div>
          <div>
            ${d ? `
              <div class="group-head"><h2>七段拆解</h2><span class="n">${esc(d.framework || '—')}</span></div>
              ${sourceBadge}
              <div class="decomp">
                ${d.segments.map((s, i) => {
                  const segBtn = segText(s)
                    ? `<button class="mini-btn" type="button" data-seg-action="append" data-seg-index="${i}" aria-label="把第 ${esc(s.code)} 段送入主体与环境" title="送入主体与环境">${icon('plus')}</button>`
                    : '';
                  return `
                  <div class="decomp-row" style="animation-delay:${i * 55}ms">
                    <span class="decomp-code">${esc(s.code)}</span>
                    <div>
                      <div class="decomp-module">${esc(s.module)}<span class="slot-tools">${segBtn}</span></div>
                      <div class="decomp-text">${esc(s.text || '—')}</div>
                      ${s.note ? `<p class="decomp-note">${esc(s.note)}</p>` : ''}
                    </div>
                  </div>`;
                }).join('')}
              </div>
              ${d.paramTail?.text
                ? `<div class="param-tail-box">${esc(d.paramTail.text)}</div>`
                : `<p class="param-absent" data-od-id="param-absent">正文未写 MJ 参数。社区作者多数不写 <code>--ar</code> / <code>--v</code>，而参数尾是<b>按正文里的 <code>--</code> 实打实切出来的</b>，没有就显示没有 —— 不拿推断值冒充。</p>`}
              <p class="param-caveat" data-od-id="param-caveat">参数维度在这批数据上<b>不可研究</b>：实测 971 条里 <code>version</code> 全是 <code>8.2</code>（零区分度），正文里出现 <code>--</code> 的 9 条全是 <code>--massive</code> / <code>--perfect</code> 这类正文破折号误命中。画幅与版本来自上游字段，<b>不是作者写进 prompt 的</b>，别当参数用法规避结论。</p>
              ${tags.length ? `
                <div class="group-head" style="margin-top:20px"><h2>词库打标</h2></div>
                <div class="term-row">
                  ${tags.map(([, arr]) => arr.map(t => `<span class="term">${esc(t)}</span>`).join('')).join('')}
                </div>` : ''}
              ${d.health?.length ? `
                <div class="health">
                  ${d.health.map(h => `<span class="${h.ok ? 'good' : 'bad'}">${esc(h.id)} ${esc(h.note || (h.ok ? '通过' : ''))}</span>`).join('')}
                </div>` : ''}
            ` : `<p class="dock-hint">这条作业还没有拆解结果。</p>`}
          </div>
        </div>
      </div>`, { label: '作业详情与提示词拆解', onClose: () => { if (jobFromHash()) writeJobToHash(null); } });

    // 七段逐段送入「主体与环境」：一次委托挂在 backdrop 上，灯箱常开时可连点多段累积。
    // 只写 session.subject，不碰 session.params / session.manual（后者会被 togglePrompt 等清空）。
    backdrop.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('[data-seg-action]');
      if (!btn || !backdrop.contains(btn) || !d) return;
      const seg = d.segments[Number(btn.dataset.segIndex)];
      const text = seg ? segText(seg) : '';
      if (!text) return;
      const cur = String(session.subject ?? '').trimEnd();
      session.subject = cur.trim() ? `${cur}, ${text}` : text;
      saveSession();
      emitChange();
      toast(`第 ${seg.code} 段已送入主体与环境`);
    });

    backdrop.querySelector('[data-role="copy-prompt"]').addEventListener('click', () => {
      copyText(job.prompt, '原始提示词已复制');
    });

    // 一条作业是社区成品，不是可拼的片段：填进「主体与环境」与 --sref 参数位，
    // 不进「已选提示词」（ADR-0013 / ADR-0016）
    const fillSubject = backdrop.querySelector('[data-role="fill-subject"]');
    if (fillSubject) fillSubject.addEventListener('click', () => {
      session.subject = job.prompt;
      saveSession();
      emitChange();
      toast('已填入主体与环境');
    });
    const fillSref = backdrop.querySelector('[data-role="fill-sref"]');
    if (fillSref) fillSref.addEventListener('click', () => {
      session.params.styleRef = String(job.sref);
      saveSession();
      emitChange();
      toast(`已填入 --sref ${job.sref}`);
    });
    const srefBtn = backdrop.querySelector('[data-role="copy-sref"]');
    if (srefBtn) srefBtn.addEventListener('click', () => copyText(`--sref ${job.sref}`, '风格参考已复制'));

    // 引用键与深链：让研究结论能挂到这条作业上（报告 2.1）
    const keyBtn = backdrop.querySelector('[data-role="copy-key"]');
    if (keyBtn) keyBtn.addEventListener('click', () => copyText(jobKeyOf(job), '引用键已复制'));
    const linkBtn = backdrop.querySelector('[data-role="copy-link"]');
    if (linkBtn) {
      linkBtn.addEventListener('click', () => copyText(jobDeepLink(job), '深链已复制'));
    }

    // 研究记录（报告 2.3）：把「观察记录」挂到这条作业上。
    // 数据存在本机 IndexedDB —— 观察记录是一等数据，不再是 localStorage 里那个
    // 「只能标个布尔」的收藏位（收藏位基于提示词哈希，还有 34 组同提示词互相覆盖的 bug）。
    const writeBtn = backdrop.querySelector('[data-role="write-note"]');
    if (writeBtn) {
      writeBtn.addEventListener('click', () => {
        if (typeof RESEARCH_VIEW === 'undefined') { toast('研究笔记模块未加载', 'close'); return; }
        RESEARCH_VIEW.writeNoteFor(jobKeyOf(job));
      });
    }
    // 已有记录：数量 + 列表（结论也要能看到 —— 结论的依据集合可能包含这条作业）
    const noteCountEl = backdrop.querySelector('[data-role="note-count"]');
    const noteListEl = backdrop.querySelector('[data-role="note-list"]');
    const paintResearch = async () => {
      if (typeof RESEARCH_DB === 'undefined') return;
      const key = jobKeyOf(job);
      try {
        const [notes, conclusions] = await Promise.all([
          RESEARCH_DB.notesByJob(key),
          RESEARCH_DB.conclusionsByJob(key),
        ]);
        if (noteCountEl) noteCountEl.textContent = `观察 ${notes.length} · 结论 ${conclusions.length}`;
        if (!noteListEl) return;
        if (!notes.length && !conclusions.length) {
          noteListEl.innerHTML = '<p class="dock-hint" style="margin:6px 0 0">还没有针对这条作业的观察或结论。</p>';
          return;
        }
        noteListEl.innerHTML = [
          ...notes.map((n) => `
            <div class="term-row" style="margin-top:6px">
              <span class="term">观察</span>
              <span style="flex:1;min-width:0">${esc(n.body)}</span>
              ${(n.tags || []).length ? n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('') : ''}
            </div>`),
          ...conclusions.map((c) => `
            <div class="term-row" style="margin-top:6px">
              <span class="term">结论</span>
              <span style="flex:1;min-width:0">${esc(c.title ? c.title + '：' : '')}${esc(c.body)}</span>
            </div>`),
        ].join('');
      } catch (e) {
        if (noteListEl) noteListEl.innerHTML = `<p class="dock-hint" style="margin:6px 0 0">读取研究记录失败：${esc((e && e.message) || e)}</p>`;
      }
    };
    paintResearch();
    // 研究数据变化时重绘计数与列表。
    // 不能靠「点击保存按钮」冒泡 —— 保存发生在**嵌套**的观察记录弹层里，
    // 事件不会冒泡到外层 backdrop。用全局 researchchange 事件才可靠。
    const onResearchChange = () => paintResearch();
    document.addEventListener('researchchange', onResearchChange);
    // 灯箱关闭时摘掉监听（否则每次开灯箱都多一个监听器）
    const closeBtn = backdrop.querySelector('[data-role="close"]');
    if (closeBtn) closeBtn.addEventListener('click', () => document.removeEventListener('researchchange', onResearchChange));

    markImageStates(backdrop);
    if (closeBtn) closeBtn.focus();
  }

  /* ── 深链直达（报告 2.1）─────────────────────────────────────────────
     URL 形态：#explore?job=<key>

     与筛选深链（ADR-0010）的区别：筛选深链记的是「当前筛选状态」，
     这里的 job 参数记的是「正在看哪一条作业」。两者可共存：
     #explore?job=xxx 会先把页签切到探索榜，再打开那条作业的灯箱。 */

  /** 从 URL 里读出 job 参数（没有就是 null）。 */
  function jobFromHash() {
    const h = String(location.hash || '');
    const q = h.indexOf('?');
    if (q === -1) return null;
    const params = new URLSearchParams(h.slice(q + 1));
    return params.get('job');
  }

  /** 把 job 参数写进 URL（保持一级视图是 samples）。不写 query 的其余部分。 */
  function writeJobToHash(key) {
    const base = `#samples${key ? `?job=${encodeURIComponent(key)}` : ''}`;
    if (location.hash !== base) {
      // 用 replaceState 而不是改 location.hash：改 hash 会触发 hashchange → 重渲染 →
      // 灯箱被重建关闭。replaceState 只改地址栏，不触发重渲染。
      try {
        history.replaceState(null, '', base);
      } catch {
        location.hash = base;
      }
    }
  }

  /**
   * 按稳定键直达灯箱。键找不到时如实提示，不静默失败。
   * @returns {boolean} 是否命中并打开
   */
  function openJobByKey(key) {
    const job = findByKey(key);
    if (!job) {
      const shown = String(key || '').slice(0, 24);
      toast(shown ? `找不到引用键 ${shown} 对应的作业` : '深链里没有指定作业', 'close');
      return false;
    }
    // 直达时清掉筛选：用户是冲着这一条来的，不该被残留的批次/比例筛选挡住。
    ui.q = '';
    ui.batch = '';
    ui.aspect = '';
    ui.srefOnly = false;
    ui.srefCodes.clear();
    ui.phrases.clear();
    ui.limit = 60;
    openJobSheet(job.id);
    writeJobToHash(jobKeyOf(job));
    return true;
  }

  return {
    headHtml,
    chipsHtml,
    toolbarHtml,
    bodyHtml,
    wire,
    wireBody,
    openJobSheet,
    openJobByKey,
    findByKey,
    jobKeyOf,
    jobDeepLink,
    jobFromHash,
    srefCodeList,
    phrasesOfJob,
    availableSrefCodes,
    availablePhrases,
    /** 当前筛选命中的全部作业（全量，非分页后的显示部分）。
        导出功能（webui/js/sample-export.js）用它取数 —— 保证导出的是
        筛选命中的全部，而不是屏幕上已渲染的那 60 条。 */
    matches,
    state: ui,
  };
})();
