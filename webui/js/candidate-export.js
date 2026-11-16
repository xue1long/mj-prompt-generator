/* ==========================================================================
   候选词条导出（报告 2.6 / 第 12 步）
   --------------------------------------------------------------------------
   把「候选词条清单」导出成独立文件，让研究结论能带着证据走。

   ## 为什么需要它

   候选词条的价值在于**对照**：一份清单说「社区高频用这 12 个措辞，
   你的词库一个都没覆盖」，不带出处就只是断言，带出处才是证据。

   所以导出里**必须有出处引用键** —— 引用键（报告 2.1 的 <id8>-<hash4>）
   是本项目对外的稳定标识，回到工作台时用
   `#samples?job=<引用键>` 直达那条样本。

   ## 两种格式

   · JSON —— 给工具消费（外部脚本、统计、进一步处理）。
   · Markdown —— 给人读（贴进笔记、论文、周报）。

   两者内容同源：同一份条数、同一份字段，只是排版不同。
   与 webui/js/sample-export.js 同一个形态（那个导出样本，这个导出词条）。

   ## 导出的条数口径

   = **当前筛选命中的全部候选**，不是当前显示的 120 条。
   页面分页，只导出已显示的部分会静默丢数据 —— 那比不导出更危险。
   ========================================================================== */

const CANDIDATE_EXPORT = (() => {
  /* ── 字段取值 ─────────────────────────────────────────────────────── */

  /** 候选词条的一行（JSON 与 Markdown 共用这一份）。 */
  function rowOf(c) {
    return {
      措辞: String(c?.phrase || ''),
      归一化: String(c?.norm || c?.phrase || ''),
      频次: Number(c?.df) || 0,
      词库覆盖: String(c?.status || ''),
      词库覆盖说明: String(c?.statusLabel || ''),
      词库对应: (c?.matches || []).map((m) => ({
        中文: String(m?.zh || ''),
        英文: String(m?.en || ''),
      })),
      重合词元: (c?.viaTokens || []).slice(),
      出处数: Number(c?.sourceCount) || 0,
      出处引用键: (c?.sources || []).slice(),
    };
  }

  /* ── 命中集合 ─────────────────────────────────────────────────────── */

  /** 当前筛选命中的全部候选（全量，非分页后的显示部分）。 */
  function currentCandidates() {
    if (typeof CANDIDATE_VIEW === 'undefined') return [];
    const all = CANDIDATE_VIEW.matches();
    return Array.isArray(all) ? all : [];
  }

  /** 当前筛选条件的描述（写进导出文件头，让文件自解释）。 */
  function filterSummary() {
    if (typeof CANDIDATE_VIEW === 'undefined') return '';
    const ui = CANDIDATE_VIEW.state || {};
    const parts = [];
    if (ui.q) parts.push(`关键词「${ui.q}」`);
    if (ui.status && ui.status.size) {
      const labels = typeof CANDIDATE_VOCAB !== 'undefined'
        ? [...ui.status].map((s) => CANDIDATE_VOCAB.STATUS_LABEL[s] || s)
        : [...ui.status];
      parts.push(`词库覆盖 ${labels.join('/')}`);
    }
    if (ui.minDf) parts.push(`频次 ≥ ${ui.minDf}`);
    return parts.length ? parts.join(' · ') : '全部';
  }

  /* ── JSON 格式 ────────────────────────────────────────────────────── */

  /**
   * 导出为 JSON 文本。
   * @param {Array<object>} [candidates] 默认取当前筛选命中的全部候选
   */
  function toJson(candidates) {
    const list = (candidates || currentCandidates()).map(rowOf);
    const byStatus = { exact: 0, near: 0, missing: 0 };
    for (const c of (candidates || currentCandidates())) {
      if (byStatus[c.status] !== undefined) byStatus[c.status]++;
    }
    return JSON.stringify({
      导出时间: new Date().toISOString(),
      数据源: '候选词条（社区高频措辞 × 词库覆盖对照）',
      证据来源: 'https://www.midjourney.com/explore?tab=top',
      假设来源: 'config/prompts.yaml（提示词库）',
      筛选条件: filterSummary(),
      命中条数: list.length,
      三态分布: byStatus,
      候选词条: list,
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
   * （措辞 + 覆盖状态 + 词库对应 + 出处引用键）。概览表让人扫得动，
   * 详情让人读得全。
   *
   * @param {Array<object>} [candidates] 默认取当前筛选命中的全部候选
   */
  function toMarkdown(candidates) {
    const src = candidates || currentCandidates();
    const list = src.map(rowOf);
    const out = [];

    out.push('# 候选词条导出');
    out.push('');
    out.push(`- 导出时间：${new Date().toLocaleString('zh-CN')}`);
    out.push('- 数据源：候选词条（社区高频措辞 × 词库覆盖对照）');
    out.push('- 证据来源：https://www.midjourney.com/explore?tab=top');
    out.push('- 假设来源：`config/prompts.yaml`（提示词库）');
    out.push(`- 筛选条件：${filterSummary()}`);
    out.push(`- 命中条数：${list.length}`);
    out.push('');
    out.push('> 措辞的稳定标识是**出处引用键**。在样本库用 `samples.html#samples?job=<引用键>` 直达那条社区样本。');
    out.push('');

    if (!list.length) {
      out.push('_当前筛选没有命中任何候选词条。_');
      out.push('');
      return out.join('\n');
    }

    // 三态概览
    const byStatus = { exact: 0, near: 0, missing: 0 };
    for (const c of src) if (byStatus[c.status] !== undefined) byStatus[c.status]++;
    const LABEL = typeof CANDIDATE_VOCAB !== 'undefined'
      ? CANDIDATE_VOCAB.STATUS_LABEL
      : { exact: '已在词库', near: '词库有近义', missing: '词库未覆盖' };
    out.push('## 覆盖情况概览');
    out.push('');
    out.push(`- ${LABEL.exact}：${byStatus.exact} 条`);
    out.push(`- ${LABEL.near}：${byStatus.near} 条`);
    out.push(`- ${LABEL.missing}：${byStatus.missing} 条（社区高频用、词库完全没有 —— 最值得考虑进词库的一类）`);
    out.push('');

    out.push('## 概览');
    out.push('');
    out.push('| 措辞 | 频次 | 词库覆盖 | 词库对应 | 出处数 |');
    out.push('| --- | --- | --- | --- | --- |');
    list.forEach((r) => {
      const names = r['词库对应'].map((m) => m['中文'] || m['英文']).join('、');
      out.push(`| ${mdCell(r['措辞'])} | ${r['频次']} | ${mdCell(r['词库覆盖说明'])} | ${mdCell(names) || '—'} | ${r['出处数']} |`);
    });
    out.push('');

    out.push('## 详情');
    out.push('');
    list.forEach((r, i) => {
      out.push(`### ${i + 1}. ${r['措辞']}`);
      out.push('');
      out.push(`- 频次：${r['频次']} 条社区作业`);
      out.push(`- 词库覆盖：**${r['词库覆盖说明']}**`);
      if (r['词库对应'].length) {
        out.push('- 词库对应条目：');
        for (const m of r['词库对应']) out.push(`  - ${m['中文'] || '—'}（${m['英文']}）`);
      }
      if (r['重合词元'].length) {
        out.push(`- 重合词元：${r['重合词元'].map((t) => `\`${t}\``).join('、')}`);
      }
      out.push(`- 出处（${r['出处数']} 条引用键）：`);
      if (r['出处引用键'].length) {
        for (const k of r['出处引用键']) out.push(`  - \`${k}\``);
      } else {
        out.push('  - （无）');
      }
      out.push('');
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
    return `候选词条导出-${stamp}-${scope}.${ext}`;
  }

  return {
    currentCandidates,
    filterSummary,
    rowOf,
    toJson,
    toMarkdown,
    download,
    filename,
  };
})();

if (typeof window !== 'undefined') window.CANDIDATE_EXPORT = CANDIDATE_EXPORT;
