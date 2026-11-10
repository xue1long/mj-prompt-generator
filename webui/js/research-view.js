/* ==========================================================================
   研究笔记视图（报告 2.3 / 第 6 步）

   把「观察记录」与「结论」两类一等数据显示出来：
     · 观察记录：一条研究样本 ↔ 多条观察（笔记、假设、标签），可按标签聚合
     · 结论：一段文字 + 它依据的样本引用键集合

   数据源：RESEARCH_DB（webui/js/research-store.js，本地 IndexedDB）
   样本数据源：EXPLORE_JOBS（构建期烘焙）—— 本视图只按引用键反查，不复制样本数据。

   样式约定：复用既有类（.tag / .param-chip / .state / .textarea / .text-input），
   少量差异用 inline 样式，不改 app.css（沿用 ADR-0017 Round 8 的做法）。
   ========================================================================== */

const RESEARCH_VIEW = (() => {
  const ui = {
    /** 当前筛选的标签；空 = 全部 */
    tag: '',
    /** 当前筛选的引用键；空 = 全部 */
    jobKey: '',
    /** 视图区段：notes / conclusions */
    section: 'notes',
    /** 数据是否已加载 */
    loaded: false,
    notes: [],
    conclusions: [],
    tags: [],
    /** 存储不可用时的原因（如实展示，不静默） */
    error: null,
  };

  /* ── 数据加载 ─────────────────────────────────────────────────────── */

  async function load() {
    const status = RESEARCH_DB.status();
    if (!status.available) {
      ui.error = status.reason || '本地数据库不可用';
      ui.loaded = true;
      return;
    }
    try {
      const [notes, conclusions, tags] = await Promise.all([
        RESEARCH_DB.allNotes(),
        RESEARCH_DB.allConclusions(),
        RESEARCH_DB.tagCounts(),
      ]);
      ui.notes = notes;
      ui.conclusions = conclusions;
      ui.tags = tags;
      ui.error = null;
    } catch (e) {
      ui.error = (e && e.message) || String(e);
    }
    ui.loaded = true;
  }

  /** 当前筛选后的观察记录。 */
  function visibleNotes() {
    let rows = ui.notes;
    if (ui.tag) rows = rows.filter((n) => (n.tags || []).some((t) => t.toLowerCase() === ui.tag.toLowerCase()));
    if (ui.jobKey) rows = rows.filter((n) => n.jobKey === ui.jobKey);
    return rows;
  }

  /** 当前筛选后的结论。 */
  function visibleConclusions() {
    let rows = ui.conclusions;
    if (ui.jobKey) rows = rows.filter((c) => (c.jobKeys || []).includes(ui.jobKey));
    return rows;
  }

  /* ── 样本反查 ─────────────────────────────────────────────────────── */

  /** 按引用键找样本（用于显示标题/作者）。找不到就如实说找不到，不编造。 */
  function jobOf(key) {
    if (typeof EXPLORE_JOBS === 'undefined') return null;
    return EXPLORE_JOBS.find((j) => (typeof JOB_KEY !== 'undefined' ? JOB_KEY.keyOf(j) : String(j.id).slice(0, 8)) === key) || null;
  }

  function jobTitle(key) {
    const j = jobOf(key);
    if (!j) return '（样本已不在当前快照中）';
    return j.title || j.prompt?.slice(0, 40) || key;
  }

  /* ── 渲染 ─────────────────────────────────────────────────────────── */

  function headHtml() {
    const n = ui.notes.length;
    const c = ui.conclusions.length;
    return `
      <div class="library-head" data-od-id="research-head">
        <h1>研究笔记</h1>
        <p class="lead">观察记录与结论都存在本机浏览器里（IndexedDB），不联网、不上传。关掉页面也不会丢。</p>
        <div class="head-meta">
          <span class="param-chip">观察记录 ${n} 条</span>
          <span class="param-chip">结论 ${c} 条</span>
          <span class="param-chip">标签 ${ui.tags.length} 个</span>
        </div>
      </div>`;
  }

  function toolbarHtml() {
    const tagChips = ui.tags.length
      ? ui.tags.map((t) => `
          <button class="chip${ui.tag === t.tag ? ' on' : ''}" type="button" data-rv-tag="${esc(t.tag)}"
            aria-pressed="${ui.tag === t.tag}">${esc(t.tag)} · ${t.count}</button>`).join('')
      : `<span class="dock-hint">还没有标签。在作业详情里写观察记录时打标签，标签会出现在这里。</span>`;

    return `
      <div class="toolbar" data-od-id="research-toolbar">
        <div class="field-row">
          <span class="field-label">区段</span>
          <button class="chip${ui.section === 'notes' ? ' on' : ''}" type="button" data-rv-section="notes" aria-pressed="${ui.section === 'notes'}">观察记录</button>
          <button class="chip${ui.section === 'conclusions' ? ' on' : ''}" type="button" data-rv-section="conclusions" aria-pressed="${ui.section === 'conclusions'}">结论</button>
          ${ui.tag ? `<button class="chip" type="button" data-rv-tag="">标签：${esc(ui.tag)} ✕</button>` : ''}
          ${ui.jobKey ? `<button class="chip" type="button" data-rv-job="">样本：${esc(ui.jobKey)} ✕</button>` : ''}
        </div>
        <div class="field-row">
          <span class="field-label">按标签聚合</span>
          ${tagChips}
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-primary" type="button" data-rv-new-conclusion>${icon('plus')}新建结论</button>
          <button class="btn btn-ghost" type="button" data-rv-export>${icon('copy')}导出全部</button>
        </div>
      </div>`;
  }

  function bodyHtml() {
    if (ui.error) {
      return stateHtml({
        title: '本地数据库不可用',
        desc: ui.error + '。观察记录与结论需要 IndexedDB（隐私模式下浏览器会禁用它）。',
        iconName: 'info',
        danger: true,
      });
    }
    if (!ui.loaded) {
      return stateHtml({ title: '正在读取本地数据…', iconName: 'search' });
    }
    return ui.section === 'notes' ? notesHtml() : conclusionsHtml();
  }

  function notesHtml() {
    const rows = visibleNotes();
    if (!rows.length) {
      return stateHtml({
        title: ui.notes.length ? '当前筛选下没有记录' : '还没有观察记录',
        desc: ui.notes.length
          ? '换个标签或清掉筛选看看。'
          : '在探索榜里打开任意一条作业的详情，写下你的观察 —— 它会挂在这条作业上，并可以打标签。',
        iconName: 'info',
      });
    }
    return `
      <div class="tag-grid" data-od-id="research-notes">
        ${rows.map((n) => {
          const j = jobOf(n.jobKey);
          return `
            <article class="card code-card" data-rv-note="${esc(n.id)}">
              <div class="code-info">
                <div class="code-more">
                  <span class="code-name">${esc(jobTitle(n.jobKey))}</span>
                  <code class="code-sub">${esc(n.jobKey)}</code>
                </div>
                <p class="code-gen" style="white-space:pre-wrap">${esc(n.body)}</p>
                ${(n.tags || []).length ? `<div class="term-row">${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
                <div class="btn-row" style="margin-top:10px">
                  ${j ? `<button class="btn btn-ghost" type="button" data-rv-open-job="${esc(n.jobKey)}">打开这条作业</button>` : ''}
                  <button class="btn btn-ghost" type="button" data-rv-edit="${esc(n.id)}">编辑</button>
                  <button class="btn btn-ghost" type="button" data-rv-del="${esc(n.id)}">删除</button>
                </div>
                <p class="meta">${esc(fmtTime(n.createdAt))}${n.updatedAt && n.updatedAt !== n.createdAt ? ` · 改于 ${esc(fmtTime(n.updatedAt))}` : ''}</p>
              </div>
            </article>`;
        }).join('')}
      </div>`;
  }

  function conclusionsHtml() {
    const rows = visibleConclusions();
    if (!rows.length) {
      return stateHtml({
        title: ui.conclusions.length ? '当前筛选下没有结论' : '还没有结论',
        desc: ui.conclusions.length
          ? '换个筛选看看。'
          : '结论指向它依据的样本集合 —— 先在探索榜里给作业写观察记录，再把相关作业挂到结论上。',
        iconName: 'info',
      });
    }
    return `
      <div class="tag-grid" data-od-id="research-conclusions">
        ${rows.map((c) => {
          return `
          <article class="card code-card" data-rv-conclusion="${esc(c.id)}">
            <div class="code-info">
              <div class="code-more">
                <span class="code-name">${esc(c.title || '（无标题结论）')}</span>
                <code class="code-sub">${esc(fmtTime(c.createdAt))}</code>
              </div>
              <p class="code-gen" style="white-space:pre-wrap">${esc(c.body)}</p>
              ${(c.jobKeys || []).length ? `
                <div class="term-row" style="margin-top:8px">
                  ${c.jobKeys.map((k) => `<code class="param-chip" title="${esc(jobTitle(k))}">${esc(k)}</code>`).join('')}
                </div>
                <p class="meta">依据 ${c.jobKeys.length} 条样本</p>` : `<p class="meta">尚未挂样本</p>`}
              <div class="btn-row" style="margin-top:10px">
                <button class="btn btn-ghost" type="button" data-rv-edit-c="${esc(c.id)}">编辑</button>
                <button class="btn btn-ghost" type="button" data-rv-del-c="${esc(c.id)}">删除</button>
              </div>
            </div>
          </article>`;
        }).join('')}
      </div>`;
  }

  function fmtTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ── 编辑弹层 ─────────────────────────────────────────────────────── */

  /** 观察记录编辑弹层（新建 / 编辑共用）。 */
  function noteDialog(note, jobKey) {
    const isNew = !note;
    const cur = note || { jobKey: jobKey || '', body: '', tags: [] };
    const { backdrop, close } = mountDialog(`
      <div class="sheet job-sheet" data-od-id="note-sheet">
        <div class="sheet-head">
          <div style="flex:1">
            <p class="eyebrow">观察记录</p>
            <h2>${isNew ? '写下你的观察' : '编辑观察记录'}</h2>
          </div>
          <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
        </div>
        <div class="sheet-body">
          <div class="field-row">
            <span class="field-label">挂在样本</span>
            <code class="param-chip">${esc(cur.jobKey)}</code>
            <span class="meta">${esc(jobTitle(cur.jobKey))}</span>
          </div>
          <div class="field-row" style="align-items:flex-start;flex-direction:column;gap:6px">
            <span class="field-label">观察内容</span>
            <textarea class="textarea" id="rv-note-body" rows="6" placeholder="你从这条样本里看到了什么？">${esc(cur.body)}</textarea>
          </div>
          <div class="field-row" style="align-items:flex-start;flex-direction:column;gap:6px">
            <span class="field-label">标签（逗号分隔）</span>
            <input class="text-input" id="rv-note-tags" type="text" value="${esc((cur.tags || []).join('、'))}" placeholder="例如：构图、暖色调、待验证">
            <span class="meta">标签用来聚合多条记录 —— 报告 2.3 要求的「按标签聚合」。</span>
          </div>
          <div class="btn-row" style="margin-top:16px">
            <button class="btn btn-primary" type="button" data-role="save">${icon('check')}保存</button>
            <button class="btn btn-ghost" type="button" data-role="close">取消</button>
          </div>
        </div>
      </div>`, { label: '观察记录' });

    const bodyEl = backdrop.querySelector('#rv-note-body');
    const tagsEl = backdrop.querySelector('#rv-note-tags');
    const saveBtn = backdrop.querySelector('[data-role="save"]');
    const closeBtn2 = backdrop.querySelector('.btn-ghost[data-role="close"]');
    if (closeBtn2) closeBtn2.addEventListener('click', close);
    setTimeout(() => bodyEl && bodyEl.focus(), 30);

    saveBtn.addEventListener('click', async () => {
      const body = bodyEl.value.trim();
      if (!body) { toast('观察内容不能为空', 'close'); return; }
      const tags = tagsEl.value.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean);
      saveBtn.disabled = true;
      try {
        if (isNew) {
          await RESEARCH_DB.addNote({ jobKey: cur.jobKey, body, tags });
          toast('观察记录已保存');
        } else {
          await RESEARCH_DB.updateNote(cur.id, { body, tags });
          toast('观察记录已更新');
        }
        close();
        await load();
        emitResearchChange();
      } catch (e) {
        toast('保存失败：' + ((e && e.message) || e), 'close');
        saveBtn.disabled = false;
      }
    });
    return { backdrop, close };
  }

  /** 结论编辑弹层。 */
  function conclusionDialog(conclusion) {
    const isNew = !conclusion;
    const cur = conclusion || { title: '', body: '', jobKeys: [] };
    const { backdrop, close } = mountDialog(`
      <div class="sheet job-sheet" data-od-id="conclusion-sheet">
        <div class="sheet-head">
          <div style="flex:1">
            <p class="eyebrow">结论</p>
            <h2>${isNew ? '新建结论' : '编辑结论'}</h2>
          </div>
          <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
        </div>
        <div class="sheet-body">
          <div class="field-row" style="align-items:flex-start;flex-direction:column;gap:6px">
            <span class="field-label">标题（可留空）</span>
            <input class="text-input" id="rv-c-title" type="text" value="${esc(cur.title)}" placeholder="例如：暖色调来自 --sref">
          </div>
          <div class="field-row" style="align-items:flex-start;flex-direction:column;gap:6px">
            <span class="field-label">结论</span>
            <textarea class="textarea" id="rv-c-body" rows="6" placeholder="你从这些样本里得出的判断">${esc(cur.body)}</textarea>
          </div>
          <div class="field-row" style="align-items:flex-start;flex-direction:column;gap:6px">
            <span class="field-label">依据的样本（引用键，逗号分隔）</span>
            <input class="text-input" id="rv-c-keys" type="text" value="${esc((cur.jobKeys || []).join('、'))}" placeholder="例如：7b95a9a0-qfxx、3ac731a0-abcd">
            <span class="meta">引用键可在探索榜的作业详情里复制。留空表示这条结论暂不挂样本。</span>
          </div>
          <div class="btn-row" style="margin-top:16px">
            <button class="btn btn-primary" type="button" data-role="save">${icon('check')}保存</button>
            <button class="btn btn-ghost" type="button" data-role="close">取消</button>
          </div>
        </div>
      </div>`, { label: '结论' });

    const titleEl = backdrop.querySelector('#rv-c-title');
    const bodyEl = backdrop.querySelector('#rv-c-body');
    const keysEl = backdrop.querySelector('#rv-c-keys');
    const saveBtn = backdrop.querySelector('[data-role="save"]');
    const closeBtn2 = backdrop.querySelector('.btn-ghost[data-role="close"]');
    if (closeBtn2) closeBtn2.addEventListener('click', close);
    setTimeout(() => bodyEl && bodyEl.focus(), 30);

    saveBtn.addEventListener('click', async () => {
      const body = bodyEl.value.trim();
      if (!body) { toast('结论内容不能为空', 'close'); return; }
      const jobKeys = keysEl.value.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean);
      saveBtn.disabled = true;
      try {
        if (isNew) {
          await RESEARCH_DB.addConclusion({ title: titleEl.value.trim(), body, jobKeys });
          toast('结论已保存');
        } else {
          await RESEARCH_DB.updateConclusion(cur.id, { title: titleEl.value.trim(), body, jobKeys });
          toast('结论已更新');
        }
        close();
        await load();
        emitResearchChange();
      } catch (e) {
        toast('保存失败：' + ((e && e.message) || e), 'close');
        saveBtn.disabled = false;
      }
    });
    return { backdrop, close };
  }

  /* ── 导出 ─────────────────────────────────────────────────────────── */

  /** 导出为 JSON 文本（含样本引用键与样本标题，便于外部工具消费）。 */
  function exportJson() {
    const notes = visibleNotes().map((n) => ({
      id: n.id,
      样本引用键: n.jobKey,
      样本标题: jobTitle(n.jobKey),
      观察: n.body,
      标签: n.tags || [],
      创建于: fmtTime(n.createdAt),
      修改于: fmtTime(n.updatedAt),
    }));
    const conclusions = visibleConclusions().map((c) => ({
      id: c.id,
      标题: c.title,
      结论: c.body,
      依据样本: (c.jobKeys || []).map((k) => ({ 引用键: k, 标题: jobTitle(k) })),
      创建于: fmtTime(c.createdAt),
      修改于: fmtTime(c.updatedAt),
    }));
    return JSON.stringify({ 导出时间: fmtTime(Date.now()), 观察记录: notes, 结论: conclusions }, null, 2);
  }

  /* ── 事件 ─────────────────────────────────────────────────────────── */

  function wire(root) {
    const page = root || document.getElementById('page');
    if (!page) return;

    page.querySelectorAll('[data-rv-tag]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        ui.tag = btn.dataset.rvTag;
        await load();
        emitResearchChange();
      });
    });
    page.querySelectorAll('[data-rv-section]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        ui.section = btn.dataset.rvSection;
        await load();
        emitResearchChange();
      });
    });
    page.querySelectorAll('[data-rv-job]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        ui.jobKey = '';
        await load();
        emitResearchChange();
      });
    });

    const newC = page.querySelector('[data-rv-new-conclusion]');
    if (newC) newC.addEventListener('click', () => conclusionDialog(null));

    const exp = page.querySelector('[data-rv-export]');
    if (exp) exp.addEventListener('click', () => copyText(exportJson(), '研究数据已导出为 JSON'));

    page.querySelectorAll('[data-rv-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const n = ui.notes.find((x) => x.id === btn.dataset.rvEdit);
        if (n) noteDialog(n);
      });
    });
    page.querySelectorAll('[data-rv-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const n = ui.notes.find((x) => x.id === btn.dataset.rvDel);
        if (!n) return;
        if (!confirm('删除这条观察记录？此操作不可撤销。')) return;
        try {
          await RESEARCH_DB.deleteNote(n.id);
          toast('观察记录已删除');
          await load();
          emitResearchChange();
        } catch (e) {
          toast('删除失败：' + ((e && e.message) || e), 'close');
        }
      });
    });
    page.querySelectorAll('[data-rv-edit-c]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const c = ui.conclusions.find((x) => x.id === btn.dataset.rvEditC);
        if (c) conclusionDialog(c);
      });
    });
    page.querySelectorAll('[data-rv-del-c]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const c = ui.conclusions.find((x) => x.id === btn.dataset.rvDelC);
        if (!c) return;
        if (!confirm('删除这条结论？此操作不可撤销。')) return;
        try {
          await RESEARCH_DB.deleteConclusion(c.id);
          toast('结论已删除');
          await load();
          emitResearchChange();
        } catch (e) {
          toast('删除失败：' + ((e && e.message) || e), 'close');
        }
      });
    });
    page.querySelectorAll('[data-rv-open-job]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.rvOpenJob;
        location.hash = `#explore?job=${encodeURIComponent(key)}`;
      });
    });
  }

  /** 供外部（探索榜灯箱）在写完记录后刷新本视图。 */
  async function refresh() {
    await load();
  }

  /** 按引用键过滤（从灯箱跳过来时用）。 */
  async function filterByJob(key) {
    ui.jobKey = String(key || '');
    await load();
  }

  /** 暴露给探索榜灯箱：在某条样本上写观察记录。 */
  async function writeNoteFor(jobKey) {
    await load();
    noteDialog(null, jobKey);
  }

  return {
    ui,
    load,
    refresh,
    wire,
    filterByJob,
    writeNoteFor,
    headHtml,
    toolbarHtml,
    bodyHtml,
    noteDialog,
    conclusionDialog,
    exportJson,
    visibleNotes,
    visibleConclusions,
    jobOf,
    jobTitle,
  };
})();

/* 研究数据变化时的通知：让灯箱里的「已有记录」计数与研究视图同步刷新。 */
function emitResearchChange() {
  document.dispatchEvent(new CustomEvent('researchchange'));
}
