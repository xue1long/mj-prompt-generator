/* ==========================================================================
   风格榜视图（ADR-0026）：工作台第六个一级视图 #styles-top。
   装的是官方风格榜（styles_top）这一参照语料，零筛选；三段式供
   workbench.js 拼装。本文件不自行启动、不监听 hashchange —— 顶层副作用
   只属于独立页 style-library.js，工作台不加载它。

   卡片结构：上方主图（可切换）+ 中间 --sref 信息 + 两个功能按钮 + 下方一行 8 张题材缩略图。
   点击缩略图把该题材图换到上方主图，缩略图自己是 button，键盘可达。
   「套用到工作台」写进 session.params.styleRef（与 explore-board.js 的
   fill-sref 同一契约：ADR-0013 / ADR-0016），「复制参考码」只进剪贴板。
   ========================================================================== */
const STYLES_TOP_VIEW = {
  headHtml() {
    return `
      <div class="library-head" data-od-id="styles-top-head">
        <h1>风格榜</h1>
        <p class="lead">Midjourney 官方风格热度榜：按题材给出可直接引用的风格码。点缩略图在上方切换 8 个题材的样例；「套用到工作台」把 <span class="mono">--sref</span> 写进左栏会话参数，「复制参考码」只复制到剪贴板。</p>
        <div class="head-meta">
          <span class="param-chip">风格码 ${STYLES_TOP_ENTRIES.length} 组</span>
          <span class="param-chip">题材 ${STYLES_TOP_KINDS.length} 类</span>
          <span class="param-chip">官方榜配图 ${STYLES_TOP_IMAGE_STATS.withImages} / ${STYLES_TOP_IMAGE_STATS.total}${STYLES_TOP_IMAGE_STATS.mode === 'sample' ? '（本地抽样）' : ''}</span>
        </div>
      </div>`;
  },

  toolbarHtml() {
    return `
      <div class="toolbar" data-od-id="styles-top-toolbar">
        <span class="dock-hint">参照语料 · 风格码是参数，不是可拼装的提示词条目</span>
        <span class="spacer"></span>
        <span class="dock-count" role="status" aria-live="polite">${STYLES_TOP_ENTRIES.length} 组</span>
      </div>`;
  },

  bodyHtml() {
    return `
      <div class="group-block">
        <div class="group-head"><h2>官方风格榜</h2><span class="n">配图 ${STYLES_TOP_IMAGE_STATS.withImages} / ${STYLES_TOP_IMAGE_STATS.total} 组，其余为排版版位</span></div>
        <div class="job-grid">
          ${STYLES_TOP_ENTRIES.map(e => {
            const images = e.images || {};
            // 按 STYLES_TOP_KINDS 的固定题材顺序取图，不依赖对象插入顺序；
            // 8 个题材全展示（数据层 200 组 × 8 = 1600 张），不再 slice(0, 4)。
            const imgs = STYLES_TOP_KINDS
              .map(k => ({ id: k.id, label: k.label, src: images[k.id] }))
              .filter(x => !!x.src);
            const main = images.portrait || images.landscape || imgs[0]?.src;
            const mainKind = imgs.find(x => x.src === main) || imgs[0];
            const mainLabel = mainKind ? mainKind.label : '样例';
            return `
            <article class="sref-card" data-od-id="styles-top-${esc(e.code)}" data-code="${esc(e.code)}">
              <div class="gal-img">
                ${main
                  ? `<img class="sref-main" src="${esc(main)}" alt="风格码 ${esc(e.code)} 的${esc(mainLabel)}样例" loading="lazy" decoding="async">
                     <span class="sref-main-label">${esc(mainLabel)}</span>`
                  : `<div class="img-plate">暂无本地配图 · ${esc(e.code)}</div>`}
              </div>
              <div class="sref-body">
                <span class="code-num">--sref ${esc(e.code)}</span>
                <div style="font-size:12.5px;color:var(--muted)">${esc(e.display)}</div>
                <div class="sref-actions">
                  <button class="btn btn-primary" type="button" data-apply-sref="${esc(e.code)}"
                    title="把 --sref ${esc(e.code)} 写入工作台的风格参考参数"
                    aria-label="套用风格码 ${esc(e.code)} 到工作台">${icon('plus')}套用到工作台</button>
                  <button class="btn btn-secondary" type="button" data-copy-sref="${esc(e.code)}"
                    aria-label="复制 --sref ${esc(e.code)}">${icon('copy')}复制参考码</button>
                </div>
              </div>
              <div class="sref-kind-row">
                ${imgs.length
                  ? imgs.map(x =>
                      `<button class="kind-thumb${x.src === main ? ' is-active' : ''}" type="button"
                         data-kind="${esc(x.id)}" data-label="${esc(x.label)}" data-preview-src="${esc(x.src)}"
                         aria-pressed="${x.src === main ? 'true' : 'false'}"
                         title="在上方查看${esc(x.label)}样例"
                         aria-label="在上方查看风格码 ${esc(e.code)} 的${esc(x.label)}样例">
                         <img src="${esc(x.src)}" alt="" loading="lazy" decoding="async">
                       </button>`).join('')
                  : `<span class="img-plate">8 题材样图未随附</span>`}
              </div>
            </article>`;
          }).join('')}
        </div>
      </div>`;
  },

  wire(page) {
    const body = page && page.querySelector('#library-panel');
    if (!body) return;
    // render() 每次重建 #page.innerHTML，#library-panel 是新节点，委托不会累积。
    // 200 张卡 × 8 = 1600 个缩略图，逐个绑定不划算，统一委托到容器。
    body.addEventListener('click', (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      const apply = t.closest('[data-apply-sref]');
      if (apply) {
        const code = apply.dataset.applySref;
        // 与 explore-board.js 的 fill-sref 同一契约（ADR-0013 / ADR-0016）：
        // 风格码是参数，写进 styleRef 参数位，不进「已选提示词」，
        // 也不覆盖手动改写的最终提示词。emitChange() 由 core.js boot 里的
        // onChange(() => renderDock()) 接住，左栏摘要/参数框/最终提示词随之同步。
        session.params.styleRef = code;
        saveSession();
        emitChange();
        toast(`已套用 --sref ${code} 到工作台`);
        return;
      }
      const copy = t.closest('[data-copy-sref]');
      if (copy) {
        copyText(`--sref ${copy.dataset.copySref}`, '风格参考已复制');
        return;
      }
      const thumb = t.closest('.kind-thumb');
      if (!thumb) return;
      const card = thumb.closest('.sref-card');
      if (!card) return;
      const main = card.querySelector('.sref-main');
      if (main) {
        main.src = thumb.dataset.previewSrc;
        main.alt = `风格码 ${card.dataset.code} 的${thumb.dataset.label}样例`;
      }
      const label = card.querySelector('.sref-main-label');
      if (label) label.textContent = thumb.dataset.label;
      card.querySelectorAll('.kind-thumb').forEach((b) => {
        const on = b === thumb;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  },
};
