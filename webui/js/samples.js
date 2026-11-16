/* ==========================================================================
   研究样本库独立页（ADR-0034）：原为工作台一级视图 #samples，升为顶栏独立页
   samples.html，与「工作台」并列；工作台原位置保留跳转路标。

   三段式内容（headHtml / toolbarHtml / bodyHtml / wire）仍由 explore-board.js
   提供，本文件只负责「宿主」那部分 —— 与 workbench.js 里 samples 分支同构：
     · hash 是筛选状态唯一来源（ADR-0010），格式沿用 #samples?...，
       所以 index.html#samples?... 的旧深链可原样带参数跳过来；
     · 筛选白名单从 explore-filter.js 取（两页同一份，杜绝漂移）；
     · SAMPLE_TAXONOMY / PHRASE_INDEX / GEN_DATE 现算，不烘焙；
     · job 深链 #samples?job=<key> 直达灯箱（报告 2.1）。

   explore-board.js 里两处宿主钩子靠全局名对接：
     · writeFilterToUrl() —— 筛选变化回写地址栏（typeof 守卫，缺失则跳过）
     · EXPLORE_FILTER_SOURCE —— matches() / facetCount() 的白名单
   本页按工作台同名约定实现，保证两端行为完全一致。
   ========================================================================== */

const SAMPLES_TOTAL = EXPLORE_JOBS.length;

/** 诊断快照：供 verify-webui.mjs 断言读「不支持参数 / q」等解析结果。
    独立页不暴露工作台的全局 ui，所以用这个只读镜像代替（ADR-0034）。 */
const SAMPLES_DIAG = { ignoredParams: [], q: '' };

/* ── hash 读写（ADR-0010：hash 是筛选状态的唯一来源） ───────────────── */
function readSamplesFromUrl() {
  const parsed = FILTER_ENGINE.parseHash(EXPLORE_FILTER_SOURCE, location.hash);
  const st = parsed.state;
  const s = EXPLORE_BOARD.state;
  s.q = st.q || '';
  s.batch = (st.dims && st.dims.batch) || '';
  s.mediums = new Set((st.dims && st.dims.medium) || []);
  s.subjects = new Set((st.dims && st.dims.subject) || []);
  s.phrases = new Set((st.dims && st.dims.phrase) || []);
  s.decomp = new Set((st.dims && st.dims.decomp) || []);
  s.genDates = new Set((st.dims && st.dims.genDate) || []);
  // 已下线参数静默丢弃（ADR-0028）；其它未知参数提示一次
  const unknown = (parsed.ignored || []).filter((k) => !LEGACY_SAMPLES_PARAMS.includes(k));
  SAMPLES_DIAG.ignoredParams = unknown;
  SAMPLES_DIAG.q = s.q;
  return unknown;
}

function samplesFilterState() {
  const s = EXPLORE_BOARD.state;
  return {
    q: s.q || '',
    dims: {
      batch: s.batch || '',
      medium: [...(s.mediums || [])],
      subject: [...(s.subjects || [])],
      phrase: [...(s.phrases || [])],
      decomp: [...(s.decomp || [])],
      genDate: [...(s.genDates || [])],
    },
  };
}

/** explore-board.js 的宿主钩子：筛选变化后回写 hash。保留 job 深链参数。 */
function writeFilterToUrl() {
  let hash = FILTER_ENGINE.buildHash(EXPLORE_FILTER_SOURCE, 'samples', samplesFilterState());
  const job = EXPLORE_BOARD.jobFromHash();
  if (job) {
    const sep = hash.includes('?') ? '&' : '?';
    hash = `${hash}${sep}job=${encodeURIComponent(job)}`;
  }
  if (location.hash !== hash) {
    try { history.replaceState(null, '', hash); } catch { location.hash = hash; }
  }
}

/* ── 渲染 ───────────────────────────────────────────────────────────── */
function renderSamples() {
  const page = document.getElementById('page');
  if (!page) return;
  page.innerHTML = `
    ${EXPLORE_BOARD.headHtml()}
    <div class="standalone-nav" data-od-id="samples-nav"
      style="display:flex;align-items:center;gap:12px;padding:6px 2px 10px">
      <span class="dock-hint">顶栏独立页 · 原工作台「研究样本库」视图</span>
      <span class="spacer"></span>
      <a class="param-chip" href="index.html" style="text-decoration:none;color:inherit" title="回到工作台">工作台 ↗</a>
    </div>
    ${EXPLORE_BOARD.toolbarHtml()}
    <div class="library-body" id="library-panel" role="region" aria-label="研究样本库" tabindex="0">
      ${EXPLORE_BOARD.bodyHtml()}
    </div>`;
  EXPLORE_BOARD.wire(page);
  markImageStates(page);
}

/* ── 启动 ───────────────────────────────────────────────────────────── */
const bootIgnored = readSamplesFromUrl();
boot('samples.html');
renderSamples();
if (bootIgnored.length) {
  toast(`已忽略不支持的筛选参数：${bootIgnored.join('、')}`, 'close');
}

// 深链直达：#samples?job=<key> → 打开那条作业的灯箱（报告 2.1）
const deepJob = EXPLORE_BOARD.jobFromHash();
if (deepJob) EXPLORE_BOARD.openJobByKey(deepJob);

window.addEventListener('hashchange', () => {
  const ignored = readSamplesFromUrl();
  if (ignored.length) {
    toast(`已忽略不支持的筛选参数：${ignored.join('、')}`, 'close');
  }
  renderSamples();
  const job = EXPLORE_BOARD.jobFromHash();
  if (job) EXPLORE_BOARD.openJobByKey(job);
});
