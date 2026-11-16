/* ==========================================================================
   风格榜独立页（ADR-0034）：原为工作台一级视图 #styles-top，升为顶栏独立页
   styles-top.html，与「工作台」并列；工作台原位置保留跳转路标。

   本页零筛选（与旧工作台视图一致），三段式内容由 styles-top-view.js 提供，
   本文件只做「宿主」三件事：启动 core 的顶栏 / Dock、渲染、接线。
   卡片上的「套用到工作台」写 session.params.styleRef —— 左栏 Dock 在本页
   同样渲染，所以写入后立即能看到生效；「复制参考码」只进剪贴板。

   hash 沿用 #styles-top（无参数），旧链 index.html#styles-top 与
   #/styles-top 由 core.js 的 migrateLegacyHash / workbench.js 的 readHash
   自动跳过来，本页不解析 hash 状态。
   ========================================================================== */

function renderStylesTop() {
  const page = document.getElementById('page');
  if (!page) return;
  page.innerHTML = `
    ${STYLES_TOP_VIEW.headHtml()}
    <div class="standalone-nav" data-od-id="styles-top-nav"
      style="display:flex;align-items:center;gap:12px;padding:6px 2px 10px">
      <span class="dock-hint">顶栏独立页 · 原工作台「风格榜」视图</span>
      <span class="spacer"></span>
      <a class="param-chip" href="index.html" style="text-decoration:none;color:inherit" title="回到工作台">工作台 ↗</a>
    </div>
    ${STYLES_TOP_VIEW.toolbarHtml()}
    <div class="library-body" id="library-panel" role="region" aria-label="风格榜" tabindex="0">
      ${STYLES_TOP_VIEW.bodyHtml()}
    </div>`;
  STYLES_TOP_VIEW.wire(page);
  markImageStates(page);
}

boot('styles-top.html');
renderStylesTop();
