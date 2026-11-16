/* ==========================================================================
   研究样本库筛选源（共享）：workbench.js 与 samples.html 各加载一次。

   原定义在 workbench.js:223（AXR-0028 收窄维度后）：宽高比与 sref 三件套下线，
   换成可解释的两轴分类。按 ADR-0034 把样本库升为顶栏独立页后，工作台不再
   持有这个视图，但筛选契约必须两页一致 —— 所以把「白名单」抽到本文件，
   让工作台（旧链转发路径）与独立页都从同一处取，杜绝两份漂移。

   valuesOf 里对 SAMPLE_TAXONOMY / PHRASE_INDEX / GEN_DATE 用 typeof 守卫，
   因为这些是运行时现算模块，加载顺序晚于本文件也不影响（调用时才求值）。
   ========================================================================== */

/** 已下线的样本库参数：静默丢弃，不弹「已忽略」（ADR-0028）。 */
const LEGACY_SAMPLES_PARAMS = ['aspect', 'sref', 'srefCode'];

/** 一条作业命中的收录短语（筛选维度的取值来源）。
    索引由 PHRASE_INDEX.shared() 惰性构建，两页共用同一份缓存 ——
    与 explore-board.js 的 index() 完全同口径。 */
function phraseIndexOf(job) {
  if (typeof PHRASE_INDEX === 'undefined' || typeof EXPLORE_JOBS === 'undefined') return [];
  const idx = PHRASE_INDEX.shared(EXPLORE_JOBS);
  return idx.byJob.get(String(job?.id ?? '')) || [];
}

const EXPLORE_FILTER_SOURCE = FILTER_ENGINE.source('samples', [
  { key: 'q', type: 'q', matchOf: (j, text) => {
    if (String(j.title || '').toLowerCase().includes(text)) return true;
    if (String(j.author || '').toLowerCase().includes(text)) return true;
    return String(j.prompt || '').toLowerCase().includes(text);
  } },
  { key: 'batch', type: 'enum', valueOf: (j) => j.batch },
  /* 两轴分类（ADR-0028）：运行时由 SAMPLE_TAXONOMY 现算，不烘焙进产物 ——
     改一条正则不必重建 3 MB 生成物（与 job-key / phrase-index 同一取舍）。
     每层单值互斥，故 valuesOf 只返回 0 或 1 个值，各档计数之和恒等于 971。 */
  { key: 'medium', type: 'multi', valuesOf: (j) => (
    typeof SAMPLE_TAXONOMY !== 'undefined' ? [SAMPLE_TAXONOMY.mediumOf(j)] : []
  ) },
  { key: 'subject', type: 'multi', valuesOf: (j) => (
    typeof SAMPLE_TAXONOMY !== 'undefined' ? [SAMPLE_TAXONOMY.subjectOf(j)] : []
  ) },
  // 提示词短语（报告 2.2）：从 prompt 现算的短语索引，不是烘焙字段
  { key: 'phrase', type: 'multi', valuesOf: (j) => (typeof PHRASE_INDEX !== 'undefined' ? phraseIndexOf(j) : []) },
  // 拆解来源（报告 2.5）：三层可信度 + 无拆解。值域与 explore-board.js 的 DECOMP_SOURCES 一致
  { key: 'decomp', type: 'multi', valuesOf: (j) => [(j.decomposition && j.decomposition.source) || '无拆解'] },
  /* 生成日期（报告 2.7）：由 time 换算的**真实生成日**，与上面的 batch 是两个口径。
     实测 968/971 条两者不同（批次 2026-11-05 下真实生成日横跨 28 天），
     拿批次当时间维度做研究会全错。换算走 GEN_DATE（与样本导出同一份实现）。 */
  { key: 'genDate', type: 'multi', valuesOf: (j) => {
    const d = typeof GEN_DATE !== 'undefined' ? GEN_DATE.ofJob(j) : '';
    return d ? [d] : [];
  } },
]);
