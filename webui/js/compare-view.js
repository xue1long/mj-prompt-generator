/* ==========================================================================
   对照视图（报告 2.2）
   ==========================================================================

   研究者真正要回答的问题不是「这条样本好不好看」，而是
   **「这两条之间到底差在哪，把变量固定住之后结论还成立吗」**。

   本视图提供「并排看两条」的能力：
     · 在研究样本库里勾选两条 → 切到「对照」视图
     · 并排渲染：成图、提示词词级差异、元数据对照、七段拆解对照
     · URL 形态 #compare?a=<引用键>&b=<引用键> —— 可分享、可复现

   ## 为什么它是独立的一级视图，而不是样本库的二级页签

   ADR-0020 定下的一级视图标准是「**异质的数据集**」：
   提示词库 = 可拼装的假设集，研究样本库 = 不可拼装的证据集，研究笔记 = 我的产出。
   对照视图装的是**样本库里的两条**，数据同源 —— 按那条标准它不满足。

   但它仍然要独立，理由是**它是一类动作，不是一类数据**：
     · 需要并排的**空间**（两列），样本库是卡片流，塞不下也看不清
     · 需要 URL **可分享**（粘给同事，对方直接看到同一组对照）
     · 需要**固定的比较对象**（a / b 两条），而不是滚动中的列表

     取舍：对照的 URL **只带 a / b**，不带样本库的筛选参数。
     对照的是两条已固定的作业，筛选条件对它们没有意义；而样本库那边的筛选
     状态本来就独立保存在自己的 hash 里，切回去时各自恢复，互不污染。

   这是一个**由用户拍板的例外**（2026-11-10，AskUserQuestion：「对照视图形态」）。
   标准被记录在 docs/adr/0021-compare-view-as-top-level.md，
   明确它是「动作型视图」而非「数据集型视图」—— 这是本项目里第一个打破
   ADR-0020 一级视图标准的视图，因此它的理由必须留在 ADR 里，不能只留在代码注释里。

   ## 词级差异怎么算

   不引第三方 diff 库（file:// 下要零依赖）。用一个标准做法：
   最长公共子序列（LCS）切两条 prompt 的词序列，标出「只在 A」「只在 B」「两边都有」。
   词按逗号切（社区 prompt 的天然结构），不是按空格 —— 按空格切会把
   "35mm lens" 拆成两个词，差异就淹没在噪声里。
   ========================================================================== */

const COMPARE_VIEW = (() => {
  /* ── 引用键 ──────────────────────────────────────────────────────────
     与样本库共用 JOB_KEY —— 同一套键，对照链接和深链才能互相引用。 */
  const keyOf = (job) => (job && typeof JOB_KEY !== 'undefined')
    ? JOB_KEY.keyOf(job)
    : String(job?.id || '').slice(0, 8);

  /** 按引用键找作业。 */
  function findByKey(key) {
    if (!key) return null;
    const k = String(key).trim().toLowerCase();
    if (!k) return null;
    const list = typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS : [];
    return list.find(j => keyOf(j).toLowerCase() === k) || null;
  }

  /** sref 码拆成数组（上游是空格分隔的字符串，可能一作业多码）。 */
  const srefCodes = (job) => String(job?.sref || '').split(/\s+/).filter(Boolean);

  /* ── 词级差异 ─────────────────────────────────────────────────────────
     LCS（最长公共子序列）动态规划。
     prompt 词数通常 10~40，最坏 200 —— O(n·m) 完全够用。 */
  function tokenizePrompt(prompt) {
    return String(prompt || '')
      .split(/[,;|]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  /**
   * 两条 prompt 的词级差异。
   * @returns {{a: Array<{text:string, kind:'same'|'only'|'gap'}>, b: Array<...>, onlyA: number, onlyB: number, same: number}}
   */
  function diffPrompts(promptA, promptB) {
    const A = tokenizePrompt(promptA);
    const B = tokenizePrompt(promptB);
    // LCS 长度表
    const m = A.length, n = B.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = A[i - 1] === B[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    // 回溯
    const aOut = [], bOut = [];
    let i = m, j = n, onlyA = 0, onlyB = 0, same = 0;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && A[i - 1] === B[j - 1]) {
        aOut.push({ text: A[i - 1], kind: 'same' });
        bOut.push({ text: B[j - 1], kind: 'same' });
        same++;
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        bOut.push({ text: B[j - 1], kind: 'only' });
        onlyB++;
        j--;
      } else {
        aOut.push({ text: A[i - 1], kind: 'only' });
        onlyA++;
        i--;
      }
    }
    aOut.reverse(); bOut.reverse();
    return { a: aOut, b: bOut, onlyA, onlyB, same };
  }

  /* ── 元数据对照 ───────────────────────────────────────────────────────
     逐字段列出，标出「两边不同」的项 —— 这是「固定变量」时最该先看的地方。 */
  const META_FIELDS = [
    { key: 'author', label: '作者' },
    { key: 'aspect', label: '比例' },
    { key: 'version', label: '版本' },
    { key: 'batch', label: '批次' },
    { key: 'sref', label: 'sref' },
  ];

  function metaRows(jobA, jobB) {
    return META_FIELDS.map(f => {
      const va = f.key === 'sref' ? srefCodes(jobA).join(' ') : String(jobA?.[f.key] ?? '—');
      const vb = f.key === 'sref' ? srefCodes(jobB).join(' ') : String(jobB?.[f.key] ?? '—');
      return { label: f.label, a: va || '—', b: vb || '—', same: va === vb };
    });
  }

  /* ── 拆解对照 ─────────────────────────────────────────────────────────
     七段是同一个框架下的同一组位置 —— 并排看能直接回答
     「作者 A 在第 4 段写了镜头，B 没写，这算不算差异」。 */
  const SEVEN_CODES = ['1', '2', '3', '4', '5', '6', '7'];

  function segMap(job) {
    const d = job?.decomposition;
    const map = new Map();
    if (!d || !Array.isArray(d.segments)) return map;
    for (const s of d.segments) map.set(String(s.code), s);
    return map;
  }

  function decompRows(jobA, jobB) {
    const ma = segMap(jobA), mb = segMap(jobB);
    return SEVEN_CODES.map(code => {
      const sa = ma.get(code), sb = mb.get(code);
      const ta = String(sa?.text ?? '').trim();
      const tb = String(sb?.text ?? '').trim();
      return {
        code,
        module: sa?.module || sb?.module || '',
        a: { text: ta, note: String(sa?.note ?? '').trim(), has: !!sa },
        b: { text: tb, note: String(sb?.note ?? '').trim(), has: !!sb },
        same: ta === tb,
      };
    });
  }

  /** 拆解来源标签（如实标注，规则解析 ≠ LLM 精拆）。 */
  const SOURCE_LABEL = {
    '手工精拆': '手工精拆 · 已验收基准',
    '逐条精拆': 'LLM 逐条精拆',
    '规则解析': '规则解析 · 未精拆',
    '未标注': '来源未标注',
  };

  /* ── 渲染 ───────────────────────────────────────────────────────────── */

  function promptDiffHtml(diff) {
    const side = (list) => list.map(p => {
      if (p.kind === 'same') {
        return `<span class="cmp-tok">${esc(p.text)}</span>`;
      }
      return `<span class="cmp-tok cmp-tok--only">${esc(p.text)}</span>`;
    }).join('');
    return `
      <div class="cmp-prompts">
        <div class="cmp-prompts-col">
          <div class="cmp-prompts-head"><span class="cmp-badge cmp-badge--a">A</span><span>仅 A 有</span><span class="n">${diff.onlyA} 段</span></div>
          <div class="cmp-toks">${side(diff.a) || '<span class="dock-hint">（空）</span>'}</div>
        </div>
        <div class="cmp-prompts-col">
          <div class="cmp-prompts-head"><span class="cmp-badge cmp-badge--b">B</span><span>仅 B 有</span><span class="n">${diff.onlyB} 段</span></div>
          <div class="cmp-toks">${side(diff.b) || '<span class="dock-hint">（空）</span>'}</div>
        </div>
      </div>
      <p class="dock-hint" style="margin-top:10px">
        共有 ${diff.same} 段措辞 · 仅 A 有 ${diff.onlyA} 段 · 仅 B 有 ${diff.onlyB} 段。
        差异按<strong>逗号分隔的短语</strong>算，不是按空格 —— 社区 prompt 天然是短语列表，
        按空格切会把「35mm lens」拆成两个词，差异就淹没在噪声里。
      </p>`;
  }

  function metaHtml(rows) {
    return `
      <table class="cmp-meta">
        <thead><tr><th>字段</th><th>A</th><th>B</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr class="${r.same ? '' : 'is-diff'}">
              <td>${esc(r.label)}</td>
              <td>${esc(r.a)}</td>
              <td>${esc(r.b)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function decompHtml(rows) {
    return `
      <table class="cmp-decomp">
        <thead><tr><th>段</th><th>A</th><th>B</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr class="${r.same ? '' : 'is-diff'}">
              <td><span class="decomp-code">${esc(r.code)}</span><span style="display:block;font-size:11px;color:var(--muted)">${esc(r.module)}</span></td>
              <td>
                ${r.a.text ? `<div class="cmp-text">${esc(r.a.text)}</div>` : '<div class="cmp-text cmp-text--empty">（空）</div>'}
                ${r.a.note ? `<p class="decomp-note">${esc(r.a.note)}</p>` : ''}
              </td>
              <td>
                ${r.b.text ? `<div class="cmp-text">${esc(r.b.text)}</div>` : '<div class="cmp-text cmp-text--empty">（空）</div>'}
                ${r.b.note ? `<p class="decomp-note">${esc(r.b.note)}</p>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function sideHtml(job, label, cls) {
    if (!job) {
      return `<div class="cmp-side cmp-side--empty">
        <div class="cmp-side-head"><span class="cmp-badge cmp-badge--${cls}">${label}</span><span class="n">未选择</span></div>
        <p class="dock-hint">在研究样本库里勾选一条作业，或直接改地址栏里的 a / b 参数。</p>
      </div>`;
    }
    return `
      <div class="cmp-side">
        <div class="cmp-side-head">
          <span class="cmp-badge cmp-badge--${cls}">${label}</span>
          <span class="cmp-side-title">${esc(job.title)}</span>
        </div>
        <div class="job-sheet-imgs" style="margin-top:10px">
          ${job.thumbs && job.thumbs.length
            ? job.thumbs.map((t, i) => `<img src="${esc(t)}" alt="${esc(job.title.slice(0, 40))} 的第 ${i + 1} 格成图" decoding="async">`).join('')
            : '<div class="img-plate">本条暂无配图</div>'}
        </div>
        <div class="cmp-side-meta">
          <span>${esc(job.author)}</span><span>${esc(job.aspect)}</span><span>V${esc(job.version)}</span>
          ${job.sref ? `<span class="sref">sref ${esc(job.sref)}</span>` : ''}
        </div>
        <div class="cmp-side-keys">
          <span title="引用键">引用键</span>
          <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(keyOf(job))}</code>
        </div>
        ${job.decomposition ? `<p class="dock-hint" style="margin-top:8px">拆解来源：${esc(SOURCE_LABEL[job.decomposition.source] || SOURCE_LABEL['未标注'])}</p>` : '<p class="dock-hint" style="margin-top:8px">这条作业还没有拆解结果。</p>'}
      </div>`;
  }

  /** 头部说明。 */
  function headHtml() {
    return `
      <div class="library-head" data-od-id="compare-head">
        <h1>对照</h1>
        <p class="lead">并排看两条研究样本，把变量固定住再下结论：成图、提示词措辞差异、元数据、七段拆解逐段对照。
        对照对象写在地址栏里（<code>#compare?a=…&amp;b=…</code>），可以直接分享。</p>
        <div class="head-meta">
          <span class="param-chip">对照 2 条</span>
          <span class="param-chip">差异按逗号短语算</span>
        </div>
      </div>`;
  }

  /** 工具条：返回样本库 + 清空对照。 */
  function toolbarHtml(hasBoth) {
    return `
      <div class="toolbar" data-od-id="compare-toolbar">
        <button class="btn btn-secondary" type="button" data-role="cmp-back">回到研究样本库</button>
        ${hasBoth ? '<button class="btn btn-ghost" type="button" data-role="cmp-clear">清空对照</button>' : ''}
        <span class="spacer"></span>
        <span class="dock-count" role="status" aria-live="polite">${hasBoth ? '并排比较中' : '等待选择两条'}</span>
      </div>`;
  }

  /**
   * 主体。
   * @param {{a: object|null, b: object|null}} pair
   */
  function bodyHtml(pair) {
    const a = pair?.a || null;
    const b = pair?.b || null;
    if (!a && !b) {
      return stateHtml({
        title: '还没有选择对照对象',
        desc: '在研究样本库里勾选两条作业（卡片左下角的「对照」框），再切到这个视图；或者直接改地址栏：#compare?a=引用键&b=引用键',
        iconName: 'columns',
      });
    }
    if (!a || !b) {
      const have = a ? 'A' : 'B';
      const missing = a ? 'B' : 'A';
      return stateHtml({
        title: `只选了 ${have}，还缺 ${missing}`,
        desc: `再选一条作业就能并排比较。地址栏形态：#compare?a=引用键&b=引用键`,
        iconName: 'columns',
      });
    }

    const diff = diffPrompts(a.prompt, b.prompt);
    const rows = metaRows(a, b);
    const decomp = decompRows(a, b);
    const diffFields = rows.filter(r => !r.same).length;
    const diffSegs = decomp.filter(r => !r.same).length;

    return `
      <div class="cmp-root">
        <div class="cmp-summary" data-od-id="cmp-summary">
          <span class="param-chip">措辞差异 ${diff.onlyA} / ${diff.onlyB} 段</span>
          <span class="param-chip">元数据不同 ${diffFields} / ${rows.length} 项</span>
          <span class="param-chip">拆解不同 ${diffSegs} / ${decomp.length} 段</span>
        </div>

        <div class="cmp-sides">
          ${sideHtml(a, 'A', 'a')}
          ${sideHtml(b, 'B', 'b')}
        </div>

        <section class="cmp-section" data-od-id="cmp-diff">
          <div class="group-head"><h2>提示词措辞差异</h2><span class="n">仅一侧出现的措辞被标出</span></div>
          ${promptDiffHtml(diff)}
        </section>

        <section class="cmp-section" data-od-id="cmp-meta">
          <div class="group-head"><h2>元数据对照</h2><span class="n">不同的行会高亮</span></div>
          ${metaHtml(rows)}
        </section>

        <section class="cmp-section" data-od-id="cmp-decomp">
          <div class="group-head"><h2>七段拆解对照</h2><span class="n">同一框架的同一位置</span></div>
          ${decompHtml(decomp)}
        </section>
      </div>`;
  }

  /* ── URL ───────────────────────────────────────────────────────────────
     形态：#compare?a=<引用键>&b=<引用键>
     a / b 缺任一个都如实提示，不静默补默认值。 */

  /** 从 hash 读出对照对象。 */
  function readFromHash() {
    const h = String(location.hash || '');
    const q = h.indexOf('?');
    if (q === -1) return { a: null, b: null };
    const params = new URLSearchParams(h.slice(q + 1));
    const ka = params.get('a');
    const kb = params.get('b');
    return {
      a: ka ? findByKey(ka) : null,
      b: kb ? findByKey(kb) : null,
      rawA: ka, rawB: kb,
    };
  }

  /** 对照对象的 hash 片段（纯计算，不碰 location）。
      切视图时用它做 location.hash 的值 —— 触发 hashchange → readHash → render。 */
  function hashFor(jobA, jobB) {
    const params = new URLSearchParams();
    if (jobA) params.set('a', keyOf(jobA));
    if (jobB) params.set('b', keyOf(jobB));
    const qs = params.toString();
    return `#compare${qs ? `?${qs}` : ''}`;
  }

  /** 把对照对象写进 hash（用 replaceState，避免触发重渲染丢焦点）。
      只在「视图不变、只换对象」时用（清空对照）；切视图请用 hashFor + location.hash。 */
  function writeToHash(jobA, jobB) {
    const base = hashFor(jobA, jobB);
    if (location.hash !== base) {
      try { history.replaceState(null, '', base); } catch { location.hash = base; }
    }
  }

  /** 接线。 */
  function wire(host) {
    const back = host.querySelector('[data-role="cmp-back"]');
    if (back) back.addEventListener('click', () => {
      // ADR-0034：研究样本库已升为顶栏独立页，跨页返回。
      location.assign('samples.html#samples');
    });
    const clear = host.querySelector('[data-role="cmp-clear"]');
    if (clear) clear.addEventListener('click', () => {
      writeToHash(null, null);
      if (typeof render === 'function') render();
    });
  }

  return {
    headHtml,
    toolbarHtml,
    bodyHtml,
    wire,
    diffPrompts,
    metaRows,
    decompRows,
    srefCodes,
    findByKey,
    keyOf,
    readFromHash,
    writeToHash,
    hashFor,
  };
})();

if (typeof window !== 'undefined') window.COMPARE_VIEW = COMPARE_VIEW;
