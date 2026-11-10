/* ==========================================================================
   探索榜面板（可复用组件）
   现在挂在工作台的提示词库里，作为第 6 个页签「探索榜」（原项目 ADR-0013：
   探索榜是提示词库的一个页签，不是独立页面；会话 Dock 常驻、只换右栏）。
   组件对外只暴露 head / toolbar / body 三段，工作台与独立页各自拼装。
   数据源：config/explore.yaml + config/explore-decomposed.yaml
   ========================================================================== */

const EXPLORE_BOARD = (() => {
  const ui = { q: '', batch: '', aspect: '', srefOnly: false, limit: 60 };

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

  /** 这条作业的深链：#explore?job=<key>。
      用相对 index.html，file:// 与 http:// 下都成立（深链是给人和笔记用的，
      粘到别的机器上也能开）。 */
  function jobDeepLink(job) {
    const key = jobKeyOf(job);
    const base = location.pathname.endsWith('/')
      ? 'index.html'
      : location.pathname.split('/').pop() || 'index.html';
    return `${base}#explore?job=${encodeURIComponent(key)}`;
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
    return `
      <div class="ex-card__actions">
        <button class="ex-card__actions-btn ex-card__actions-btn--primary" type="button"
          data-ex-action="apply" data-job-id="${esc(j.id)}">套用到工作台</button>
        <button class="ex-card__actions-btn ex-card__actions-btn--outline" type="button"
          data-ex-action="copy" data-job-id="${esc(j.id)}" aria-label="复制这条提示词">
          ${ACTION_ICON.copy}<span class="ex-card__actions-label">复制</span></button>
        <span class="ex-card__actions-spacer"></span>
        <button class="ex-card__actions-btn ex-card__actions-btn--fav" type="button"
          data-ex-action="fav" data-job-id="${esc(j.id)}"
          aria-label="收藏这条提示词" aria-pressed="${favRead(j.prompt)}">
          ${ACTION_ICON.bookmark}</button>
      </div>`;
  }

  function matches() {
    const q = ui.q.trim().toLowerCase();
    return EXPLORE_JOBS.filter(j => {
      if (ui.batch && j.batch !== ui.batch) return false;
      if (ui.aspect && j.aspect !== ui.aspect) return false;
      if (ui.srefOnly && !j.sref) return false;
      if (q && !j.title.toLowerCase().includes(q) && !String(j.author).toLowerCase().includes(q)
        && !j.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
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
        <h1>探索榜</h1>
        <p class="lead">社区已做好的成品：一条原始提示词配四格成图。点开看它是怎么搭的——七段结构、命中构图法、参数尾与合规体检。</p>
        <div class="head-meta">${chipsHtml()}</div>
      </div>`;
  }

  function toolbarHtml() {
    return `
      <div class="toolbar" data-od-id="explore-toolbar">
        <div class="search">
          ${icon('search')}
          <input id="ex-search" type="search" aria-label="搜索提示词或作者"
            placeholder="搜索提示词或作者" value="${esc(ui.q)}" autocomplete="off">
        </div>
        <select class="select" id="ex-batch" aria-label="按批次筛选" style="width:auto">
          <option value="">全部批次</option>
          ${availableBatches().map(b => `<option value="${esc(b.key)}"${ui.batch === b.key ? ' selected' : ''}>${esc(b.name)} · ${b.sample}</option>`).join('')}
        </select>
        <select class="select" id="ex-aspect" aria-label="按宽高比筛选" style="width:auto">
          <option value="">全部比例</option>
          ${availableAspects().map(a => `<option value="${esc(a.key)}"${ui.aspect === a.key ? ' selected' : ''}>${esc(a.name)} · ${a.sample}</option>`).join('')}
        </select>
        ${srefCount()
          ? `<button class="toggle${ui.srefOnly ? ' on' : ''}" type="button" id="ex-sref" aria-pressed="${ui.srefOnly}">只看有 sref <span class="n">${srefCount()}</span></button>`
          : `<span class="param-chip" title="源数据未采集 --sref 字段">源数据未采集 sref</span>`}
        <span class="spacer"></span>
        <span class="dock-count" role="status" aria-live="polite">${matches().length} 条作业（显示 ${Math.min(ui.limit, matches().length)}）</span>
      </div>`;
  }

  function bodyHtml() {
    const list = matches();
    const shown = list.slice(0, ui.limit);
    if (!list.length) {
      return stateHtml({
        title: '没有匹配的作业',
        desc: srefCount() ? '换个关键词，或者把批次、比例与「只看有 sref」的筛选放宽。' : '换个关键词，或者放宽批次与比例筛选。',
        iconName: 'search',
      });
    }
    return `
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
  }

  /** 把 toolbar + grid 换到 host 里并接线 */
  function wire(host) {
    const search = host.querySelector('#ex-search');
    if (search) search.addEventListener('input', () => {
      ui.q = search.value;
      ui.limit = 60;
      refresh(host);
    });

    const batch = host.querySelector('#ex-batch');
    if (batch) batch.addEventListener('change', () => {
      ui.batch = batch.value;
      ui.limit = 60;
      refresh(host);
    });

    const aspect = host.querySelector('#ex-aspect');
    if (aspect) aspect.addEventListener('change', () => {
      ui.aspect = aspect.value;
      ui.limit = 60;
      refresh(host);
    });

    const sref = host.querySelector('#ex-sref');
    if (sref) sref.addEventListener('click', () => {
      ui.srefOnly = !ui.srefOnly;
      refresh(host);
    });

    wireBody(host);

    // 操作区按钮用事件委托：筛选会重建 panel 的 innerHTML，委托挂在 panel 本身才能存活。
    // 不改动既有 [data-job] 逐元素绑定，也不往卡片里注入任何节点。
    const panel = panelOf(host);
    if (panel && !panel.dataset.exDelegated) {
      panel.dataset.exDelegated = '1';
      panel.addEventListener('click', (ev) => {
        const more = ev.target.closest ? ev.target.closest('[data-role="ex-more"]') : null;
        if (more) { ui.limit += 60; refresh(panel); return; }
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
              ${d.paramTail?.text ? `<div class="param-tail-box">${esc(d.paramTail.text)}</div>` : ''}
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

    markImageStates(backdrop);
    const closeBtn = backdrop.querySelector('[data-role="close"]');
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

  /** 把 job 参数写进 URL（保持页签是 explore）。不写 query 的其余部分。 */
  function writeJobToHash(key) {
    const base = `#explore${key ? `?job=${encodeURIComponent(key)}` : ''}`;
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
    state: ui,
  };
})();
