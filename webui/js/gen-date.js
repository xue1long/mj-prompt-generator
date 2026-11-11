/**
 * 生成日期 —— 研究样本「被 Midjourney 实际生成」的那一天（报告 2.7 / 第 13 步）。
 *
 * ## 为什么单独一个模块
 *
 * 这个换算有**两个调用方**：研究样本导出（`sample-export.js`，第 10 步）与
 * 研究样本库的「生成日期」筛选维度（第 13 步）。同一批数据必须给出同一个日期，
 * 两处各写一份就是两处漂移（改一处忘一处 → 导出的日期与界面筛出的日期对不上）。
 *
 * ## 为什么是本地时间而不是 UTC
 *
 * 上游 `time` 是 Unix **毫秒**（实测 971/971 都是 13 位）。切成日期时，
 * UTC 与本地（UTC+8）在实测数据上有 **287 条**落在不同日期 —— 用哪个都能自洽，
 * 但必须只有一个口径。这里取**本地时间**：
 *   · 使用者看的是自己日历上的「哪天」；
 *   · 导出（第 10 步）已经用本地时间，切换口径会让旧导出与界面自相矛盾。
 *
 * ## 与「采集批次」的区别（不可混用）
 *
 * 采集批次 = 这条作业**第一次被我们采到**的那天（上游每榜滚动，同一作业会连续几天出现）。
 * 生成日期 = 它**被生成**的那天。实测 968/971 条两者不同；批次 `2026-11-05` 下
 * 真实生成日横跨 28 天（最早 2026-10-06）。拿批次当生成时间会让时间分析全错。
 */
const GEN_DATE = (() => {
  const pad = (n) => String(n).padStart(2, '0');

  /**
   * Unix 毫秒 → 本地日期 `YYYY-MM-DD`。非法值返回空串（不抛错、不留 `NaN-NaN-NaN`）。
   * @param {number|string} time
   * @returns {string}
   */
  function ofTime(time) {
    const t = Number(time);
    if (!Number.isFinite(t) || t <= 0) return '';
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /**
   * 一条作业的生成日期。
   * @param {{time?: number}} job
   * @returns {string}
   */
  function ofJob(job) {
    return ofTime(job && job.time);
  }

  /**
   * 界面用的短标签（`MM-DD`）—— 下拉里的日期都在同一年，带年份只是占位。
   * 非标准形态原样返回，方便暴露问题而不是静默吞掉。
   * @param {string} iso
   * @returns {string}
   */
  function shortLabel(iso) {
    const s = String(iso || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : s;
  }

  return { ofTime, ofJob, shortLabel };
})();
