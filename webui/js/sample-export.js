/* ==========================================================================
   研究样本导出（报告 4.1 / 第 10 步）

   把「研究样本库当前筛选结果」导出成独立文件，让研究结论能带着证据走。

   ## 为什么需要它

   报告 4.1 原本设想的三条要求里，前两条（作业落 IndexedDB、筛选下沉到
   数据层）经实测在本项目不成立 —— 详见 docs/第一性原理校验报告.md 的
   4.1 节「实测复核」。真正剩下来的缺口只有一条：

     **研究者的结论需要连同证据导出成独立文件。**

   已有的 research-view.js 导出的是「观察记录 + 结论」（我写的东西），
   但**样本集本身**不可导出 —— 而样本集才是证据。现在补上这一块。

   ## 导出的内容口径

   导出的条数 = **当前筛选命中的全部条数**，不是当前显示的条数。
   页面是分页的（默认显示 60 条），若只导出已显示的部分，导出会静默
   丢数据 —— 那比不导出更危险。所以用 matches() 的全量结果。

   ## 两种格式

   · JSON —— 给工具消费（外部脚本、统计、进一步处理）。
   · Markdown —— 给人读（贴进笔记、论文、周报）。

   两者内容同源：同一份条数、同一份字段，只是排版不同。

   ## 为什么要带引用键

   引用键（报告 2.1 的 <id8>-<hash4>）是本项目对外的稳定标识。
   导出的样本必须带着它 —— 否则外部拿到的是无法回指的孤立文本。

   ## 为什么引用键在运行时算而不是烘焙

   与 webui/js/job-key.js 的理由一致：引用键是「由作业标识与提示词
   推导出来的量」，不是采集来的事实。烘焙进产物会让「改一行前端代码」
   变成「生成物跟着漂移」。这里直接复用同一个 JOB_KEY，不复刻算法。

   ## 为什么不落 IndexedDB 再从库里导出

   file:// 协议下 origin 为 null，fetch / XHR / 动态 import 全部被 CORS
   拦截（Chrome 实测）。数据只能以内联 JS 形态到达页面，落库前仍需
   先拿到全量 —— 于是「落库」只是多复制一份，不带来任何查询收益。
   详见报告 4.1「实测复核」。

   ========================================================================== */

const SAMPLE_EXPORT = (() => {
  /* ── 字段取值 ─────────────────────────────────────────────────────── */

  /** 作业的引用键。与灯箱、深链、研究笔记用的是同一个算法。 */
  function keyOf(job) {
    if (job && typeof JOB_KEY !== 'undefined') return JOB_KEY.keyOf(job);
    return String(job?.id || '').slice(0, 8);
  }

  /** 生成时间（Unix 毫秒）→ 本地日期字符串。
      批次键是「首次采集日」，与生成时间不是一回事（报告 2.7），
      导出时两个都给，读者才不会混。

      换算逻辑在 `webui/js/gen-date.js`（第 13 步抽出）—— 研究样本库的
      「生成日期」筛选维度用的是同一份实现。两处各写一份就会漂移：
      导出的日期与界面筛出的日期可能对不上，而同一条作业只该有一个生成日。
      GEN_DATE 缺席时返回空串（导出文件的该列留空比给错日期安全）。 */
  function genDate(job) {
    return typeof GEN_DATE !== 'undefined' ? GEN_DATE.ofJob(job) : '';
  }

  /**
   * 七段拆解，每段一行。
   *
   * 段的实际结构（实测 942/942 一致）：
   *   { code: '1', module: '主体', text: '…', note: '…' }
   * 段位模块固定八类：主体 / 动作·状态 / 细节与环境 / 构图与镜头 /
   * 光线与色彩 / 风格与审美 / 参数尾（七段 + 参数尾）。
   *
   * 没有拆解的作业返回空数组 —— 不编造。
   */
  function decompSegments(job) {
    const d = job?.decomposition;
    if (!d || typeof d !== 'object') return [];
    const segs = Array.isArray(d.segments) ? d.segments : [];
    return segs
      .map((s) => {
        if (typeof s === 'string') return { 段位: '', 文本: s, 备注: '' };
        if (!s || typeof s !== 'object') return null;
        return {
          段位: String(s.module || s.code || '').trim(),
          文本: String(s.text || s.value || s.content || '').trim(),
          备注: String(s.note || '').trim(),
        };
      })
      .filter((s) => s && (s.段位 || s.文本));
  }

  /** 拆解来源（精拆 / 规则解析）。用于让读者知道这条拆解可不可信。
      实测分布：规则解析 889 / 逐条精拆 50 / 手工精拆 3。 */
  function decompSource(job) {
    const d = job?.decomposition;
    if (!d || typeof d !== 'object') return '';
    return String(d.source || '').trim();
  }

  /** 拆解的一句话摘要（社区作业作者意图的概括）。 */
  function decompSummary(job) {
    const d = job?.decomposition;
    if (!d || typeof d !== 'object') return '';
    return String(d.summary || '').trim();
  }

  /** 两轴分类（ADR-0028）。取值是稳定 slug（`realistic` / `person`），
      中文名只在 Markdown 渲染时转换 —— 导出文件里的值要能被脚本直接统计。 */
  function taxonomyOf(job) {
    if (typeof SAMPLE_TAXONOMY === 'undefined') return { medium: '', subject: '', source: '' };
    const c = SAMPLE_TAXONOMY.classify(job);
    return { medium: c.medium, subject: c.subject, source: c.source };
  }

  /** 一条作业的规范化字段。JSON 与 Markdown 共用这一份。 */
  function rowOf(job) {
    const t = taxonomyOf(job);
    return {
      引用键: keyOf(job),
      标题: String(job?.title || ''),
      提示词: String(job?.prompt || ''),
      作者: String(job?.author || ''),
      宽高比: String(job?.aspect || ''),
      版本: String(job?.version || ''),
      风格参考码: String(job?.sref || ''),
      采集批次: String(job?.batch || ''),
      生成日期: genDate(job),
      表现媒介: t.medium,
      画面主体: t.subject,
      分类来源: t.source,
      配图数: Array.isArray(job?.thumbs) ? job.thumbs.length : 0,
      拆解来源: decompSource(job),
      拆解摘要: decompSummary(job),
      七段拆解: decompSegments(job),
    };
  }

  /* ── 命中集合 ─────────────────────────────────────────────────────── */

  /**
   * 当前筛选命中的全部作业。
   *
   * 关键：用 EXPLORE_BOARD.matches() 的**全量**结果，不是页面已渲染的
   * 那 60 条。页面分页，若导出只覆盖已渲染部分会静默丢数据。
   *
   * @returns {Array<object>}
   */
  function currentJobs() {
    if (typeof EXPLORE_BOARD === 'undefined') return [];
    const all = EXPLORE_BOARD.matches();
    return Array.isArray(all) ? all : [];
  }

  /** 当前筛选条件的描述（写进导出文件头，让文件自解释）。 */
  function filterSummary() {
    if (typeof EXPLORE_BOARD === 'undefined') return '';
    const ui = EXPLORE_BOARD.state || {};
    const parts = [];
    if (ui.q) parts.push(`关键词「${ui.q}」`);
    if (ui.batch) parts.push(`批次 ${ui.batch}`);
    // ADR-0028：两轴分类。导出文件离开界面后，读者只能靠这行字知道
    // 它被什么口径筛过 —— 而这两个口径是**规则推算**，必须一并写明。
    const names = (axis, set) => [...(set || [])]
      .map((v) => (typeof SAMPLE_TAXONOMY !== 'undefined' ? SAMPLE_TAXONOMY.labelOf(axis, v) : v))
      .join('/');
    if (ui.mediums && ui.mediums.size) parts.push(`表现媒介 ${names('medium', ui.mediums)}`);
    if (ui.subjects && ui.subjects.size) parts.push(`画面主体 ${names('subject', ui.subjects)}`);
    if (ui.phrases && ui.phrases.size) parts.push(`短语 ${[...ui.phrases].join('/')}`);
    // 报告 2.5 / 2.7：新维度的筛选条件也必须写进文件头 —— 导出的数据
    // 离开界面后，读者只能靠这行字知道它被什么条件筛过。
    if (ui.decomp && ui.decomp.size) parts.push(`拆解来源 ${[...ui.decomp].join('/')}`);
    if (ui.genDates && ui.genDates.size) parts.push(`生成日期 ${[...ui.genDates].sort().join('/')}`);
    return parts.length ? parts.join(' · ') : '全部';
  }

  /* ── JSON 格式 ────────────────────────────────────────────────────── */

  /**
   * 导出为 JSON 文本。
   * @param {Array<object>} [jobs] 默认取当前筛选命中的全部作业
   */
  function toJson(jobs) {
    const list = (jobs || currentJobs()).map(rowOf);
    return JSON.stringify({
      导出时间: new Date().toISOString(),
      数据源: '研究样本库（社区作业快照）',
      来源站点: 'https://www.midjourney.com/explore?tab=top',
      筛选条件: filterSummary(),
      命中条数: list.length,
      样本: list,
    }, null, 2);
  }

  /* ── Markdown 格式 ────────────────────────────────────────────────── */

  /** Markdown 里的转义：竖线会破表格，管道要转义；换行要压平。 */
  function mdCell(v) {
    return String(v ?? '')
      .replace(/\r?\n/g, ' ')
      .replace(/\|/g, '\\|')
      .trim();
  }

  /**
   * 导出为 Markdown 文本。
   *
   * 结构：文件头（来源与筛选条件）→ 概览表（一条一行）→ 逐条详情
   * （提示词全文 + 拆解）。概览表让人扫得动，详情让人读得全。
   *
   * @param {Array<object>} [jobs] 默认取当前筛选命中的全部作业
   */
  function toMarkdown(jobs) {
    const list = (jobs || currentJobs()).map(rowOf);
    const out = [];

    out.push('# 研究样本导出');
    out.push('');
    out.push(`- 导出时间：${new Date().toLocaleString('zh-CN')}`);
    out.push('- 数据源：研究样本库（社区作业快照）');
    out.push('- 来源站点：https://www.midjourney.com/explore?tab=top');
    out.push(`- 筛选条件：${filterSummary()}`);
    out.push(`- 命中条数：${list.length}`);
    out.push('');
    out.push('> 样本的稳定标识是「引用键」。在样本库用 `samples.html#samples?job=<引用键>` 直达该样本。');
    out.push('');

    if (!list.length) {
      out.push('_当前筛选没有命中任何样本。_');
      out.push('');
      return out.join('\n');
    }

    out.push('## 概览');
    out.push('');
    out.push('| 引用键 | 生成日期 | 采集批次 | 比例 | 表现媒介 | 画面主体 | 作者 | sref | 标题 |');
    out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    // 两轴在 Markdown 里显示中文名（人读），JSON 里保留 slug（机器统计）——
    // 同一份数据，两种消费方式各自取合适的形态。
    const label = (axis, v) => (!v ? '—'
      : (typeof SAMPLE_TAXONOMY !== 'undefined' ? SAMPLE_TAXONOMY.labelOf(axis, v) : v));
    list.forEach((r) => {
      out.push(`| ${mdCell(r['引用键'])} | ${mdCell(r['生成日期'])} | ${mdCell(r['采集批次'])} | ${mdCell(r['宽高比'])} | ${mdCell(label('medium', r['表现媒介']))} | ${mdCell(label('subject', r['画面主体']))} | ${mdCell(r['作者'])} | ${mdCell(r['风格参考码'])} | ${mdCell(r['标题'])} |`);
    });
    out.push('');
    if (list.some((r) => r['分类来源'])) {
      out.push('> 表现媒介与画面主体是**规则推算**，不是人工标注：未声明 / 未判定单列一档，比例会随词表调整浮动，不可直接当研究结论引用。');
      out.push('');
    }

    out.push('## 详情');
    out.push('');
    list.forEach((r, i) => {
      out.push(`### ${i + 1}. ${r['标题'] || r['引用键']}`);
      out.push('');
      out.push(`- 引用键：\`${r['引用键']}\``);
      out.push(`- 作者：${r['作者'] || '—'}`);
      out.push(`- 宽高比：${r['宽高比'] || '—'}　版本：${r['版本'] || '—'}`);
      out.push(`- 风格参考码：${r['风格参考码'] || '—'}`);
      out.push(`- 生成日期：${r['生成日期'] || '—'}　采集批次：${r['采集批次'] || '—'}`);
      out.push(`- 表现媒介：${label('medium', r['表现媒介'])}　画面主体：${label('subject', r['画面主体'])}（规则推算，非人工标注）`);
      out.push(`- 配图数：${r['配图数']}`);
      out.push('');
      out.push('**提示词**');
      out.push('');
      out.push('```');
      out.push(r['提示词'] || '');
      out.push('```');
      out.push('');
      if (r['拆解摘要']) {
        out.push(`**拆解摘要**：${r['拆解摘要']}`);
        out.push('');
      }
      const segs = Array.isArray(r['七段拆解']) ? r['七段拆解'] : [];
      if (segs.length) {
        out.push('**七段拆解**' + (r['拆解来源'] ? `（来源：${r['拆解来源']}）` : ''));
        out.push('');
        segs.forEach((s) => {
          const head = s['段位'] ? `**${s['段位']}**` : '';
          out.push(`- ${head}${head ? '　' : ''}${mdCell(s['文本'])}`);
          if (s['备注']) out.push(`  - 备注：${mdCell(s['备注'])}`);
        });
        out.push('');
      }
    });

    return out.join('\n');
  }

  /* ── 落盘 ─────────────────────────────────────────────────────────── */

  /**
   * 触发浏览器下载。
   *
   * 用 Blob + a[download]，file:// 下同样可用（实测 Chrome 允许）。
   * 不走 fetch —— 那在 file:// 下会被 CORS 拦。
   */
  function download(text, filename, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
    return true;
  }

  /** 导出文件名：日期 + 筛选摘要，可读且不冲突。 */
  function filename(ext) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    const scope = filterSummary() === '全部' ? 'all' : 'filtered';
    return `研究样本导出-${stamp}-${scope}.${ext}`;
  }

  /* ── 对外接口 ─────────────────────────────────────────────────────── */

  return {
    currentJobs,
    filterSummary,
    rowOf,
    toJson,
    toMarkdown,
    download,
    filename,
  };
})();

if (typeof window !== 'undefined') window.SAMPLE_EXPORT = SAMPLE_EXPORT;
