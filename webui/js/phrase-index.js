/* ==========================================================================
   提示词短语索引 —— 浏览器端（报告 2.2）
   ==========================================================================

   社区作业的 prompt 是**逗号分隔的短语列表**（社区作者就是这么写的：
   "a girl, photorealistic, cinematic lighting, shot on 35mm lens"）。
   研究者想做的事是「按 prompt 片段做聚类」—— 把 971 条作业按它们**反复用了
   哪些措辞**分组，而不是按作者、按批次、按比例分组。

   本文件负责一件事：**从 prompt 里抽出短语，并算出哪些短语值得当筛选维度。**

   ## 为什么是「运行时算」而不是「构建期烘焙」

   同一个理由同 job-key.js：短语表是**由 prompt 推导出来的量**，不是采集来的事实。
   烘焙进 data-explore.js 会让「改一行筛选算法」变成「6 MB 生成物跟着漂移」，
   diff 会被采集数据的变化淹没。本文件是纯函数、无依赖，
   在运行时由 prompt 现算 —— 算法只有这一份，不存在两处漂移。

   代价是每次冷启动要扫一遍 971 条 prompt（约 25 ms，实测可接受）。
   换来的是：改阈值不用重跑采集、不用重建产物。

   ## 短语是怎么抽的

   1. **按逗号切段**（`[,;|]`）—— 社区 prompt 的天然结构就是逗号分隔的短语。
      先按标点切，再在段内取词组，能天然避开「跨短语边界的错误 n-gram」
      （比如 "no text no watermark" 这种跨段拼接出来的垃圾）。

   2. **段内取 1~3 词连续词组**，作为候选短语。

   3. **去噪**：
      · 单个功能词（the / of / and / a …）不成短语 —— 它们是语法不是措辞；
      · 多词短语里**不允许**出现功能词 —— "and white" / "of field" 这类是
        跨语义边界的拼接，不是任何人的用词习惯；
      · 全是数字的片段丢掉；
      · 词长 < 2 的丢掉（"8k" / "3d" / "35mm" 长度都 ≥ 2，能保住）。

   4. **按文档频次定阈值**：
      · 多词短语 ≥ 8 条作业用到 → 收录（实测 154 条）
      · 单个词   ≥ 20 条作业用到 → 收录（实测 417 条）
      低于阈值的多如牛毛（如 "as the"），收进来只会让下拉变成垃圾场。

   ## 为什么不用完整的 NLP 分词

   没有词库、没有词性标注器、还要在 file:// 下零依赖跑。
   逗号分段 + 停用词表已经能把 92% 的作业映射到有意义的短语上，
   而剩下的边角料（73 条作业没有命中任何收录短语）对筛选功能没有影响。

   ## 术语
   · **短语（phrase）**：一条作业里出现的、值得当筛选维度的连续措辞
   · **文档频次（df）**：有多少条作业用到这个短语
   · **收录阈值**：df 低于它就不当维度用（避免长尾噪声）
   ========================================================================== */

const PHRASE_INDEX = (() => {
  /* ── 停用词 ──────────────────────────────────────────────────────────
     只停「功能词」—— 冠词、介词、连词、代词、助动词。
     **不停任何名词 / 形容词 / 副词**：像 "grain" "editorial" "muted" 这类词
     恰恰是研究者要找的措辞信号，停掉它们等于把研究对象删了。 */
  const FUNC_WORDS = new Set([
    // 冠词 / 限定词
    'a', 'an', 'the',
    // 介词
    'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'without', 'within',
    'into', 'onto', 'over', 'under', 'above', 'below', 'across', 'along', 'around',
    'behind', 'beneath', 'beside', 'between', 'among', 'beyond', 'near', 'through',
    'during', 'against', 'about', 'after', 'before', 'toward', 'towards',
    // 连词 / 关联词
    'and', 'or', 'but', 'so', 'yet',
    // 代词
    'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they', 'them',
    'his', 'her', 'him', 'hers', 'their', 'theirs', 'our', 'ours', 'we', 'us',
    'i', 'you', 'your', 'me', 'my', 'mine',
    // 助动词 / 系动词
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
    'has', 'have', 'had', 'do', 'does', 'did',
    'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall', 'not',
    // 泛指副词 / 程度词（不带风格信息）
    'also', 'just', 'very', 'more', 'most', 'much', 'many', 'few', 'some', 'any',
    'all', 'both', 'each', 'every', 'other', 'another', 'such', 'only', 'even',
    'own', 'same', 'too', 'then', 'than', 'there', 'here',
    // 疑问词
    'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'while',
    // 泛指动词（不带风格信息）
    'get', 'got', 'make', 'made', 'use', 'used', 'using', 'see', 'seen', 'look',
    'looking', 'feel', 'feels', 'way',
    // 泛指名词
    'thing', 'things', 'like',
    // 数词
    'one', 'two', 'three',
  ]);

  /* 单个词里明显是「否定标记」而非「风格措辞」的：no watermark / no people
     里的 no 本身不带风格，但它和后面的词合起来是一个整体短语，
     所以只在单情形把它排掉，多词情形保留整段。 */
  const NEGATION_WORDS = new Set(['no']);

  /** 词元：字母数字串（保住 35mm / 8k / 3d / y2k），允许内部的连字符与撇号 */
  const TOKEN_RE = /[a-z0-9]+(?:['’-][a-z0-9]+)*/g;

  /** 多词短语的收录阈值（文档频次） */
  const MULTI_MIN_DF = 8;
  /** 单个词的收录阈值（文档频次） */
  const WORD_MIN_DF = 20;

  /** 切段符：社区 prompt 用逗号，也有人用分号与竖线 */
  const SEGMENT_RE = /[,;|]+/;

  /**
   * 一条 prompt 的候选短语集合（尚未按频次过滤）。
   * @param {string} prompt
   * @returns {Set<string>}
   */
  function candidatesOf(prompt) {
    const out = new Set();
    const text = String(prompt ?? '').toLowerCase();
    if (!text.trim()) return out;
    for (const seg of text.split(SEGMENT_RE)) {
      const words = seg.match(TOKEN_RE);
      if (!words || !words.length) continue;
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i + n <= words.length; i++) {
          const g = words.slice(i, i + n);
          // 词元太短（单字符）没研究价值
          if (g.some(w => w.length < 2)) continue;
          // 全是数字没有语义
          if (g.every(w => /^\d+$/.test(w))) continue;
          if (n === 1) {
            // 单个词：功能词与否定标记不作数
            if (FUNC_WORDS.has(g[0]) || NEGATION_WORDS.has(g[0])) continue;
          } else {
            // 多词：整组不能含功能词 —— "and white" / "of field" 是拼接噪声
            if (g.some(w => FUNC_WORDS.has(w))) continue;
          }
          out.add(g.join(' '));
        }
      }
    }
    return out;
  }

  /**
   * 建索引。
   * @param {Array<{id?:string, prompt?:string}>} jobs
   * @returns {{phrases: Array<{phrase:string, df:number}>, byJob: Map<string, string[]>, df: Map<string, number>}}
   */
  function build(jobs) {
    const list = Array.isArray(jobs) ? jobs : [];
    const df = new Map();
    /** jobId -> 该作业命中的收录短语（去重） */
    const byJob = new Map();
    /** jobId -> 候选短语集合（建索引过程中的中间产物） */
    const candByJob = new Map();

    for (const job of list) {
      const id = String(job?.id ?? '');
      const cands = candidatesOf(job?.prompt);
      candByJob.set(id, cands);
      for (const c of cands) df.set(c, (df.get(c) || 0) + 1);
    }

    // 收录：多词按 MULTI_MIN_DF，单词按 WORD_MIN_DF
    const kept = new Set();
    for (const [phrase, n] of df) {
      const isMulti = phrase.includes(' ');
      const min = isMulti ? MULTI_MIN_DF : WORD_MIN_DF;
      if (n >= min) kept.add(phrase);
    }

    for (const [id, cands] of candByJob) {
      const hit = [];
      for (const c of cands) if (kept.has(c)) hit.push(c);
      hit.sort();
      byJob.set(id, hit);
    }

    // 全局短语表：按 df 降序，同频按字典序
    const phrases = [...kept]
      .map(p => ({ phrase: p, df: df.get(p) || 0 }))
      .sort((a, b) => b.df - a.df || a.phrase.localeCompare(b.phrase));

    return { phrases, byJob, df };
  }

  /**
   * 一条作业的收录短语（对外的便捷入口）。
   * @param {{phrases:Array, byJob:Map}} index
   * @param {{id?:string}} job
   * @returns {string[]}
   */
  function phrasesOf(index, job) {
    if (!index || !index.byJob) return [];
    return index.byJob.get(String(job?.id ?? '')) || [];
  }

  /* ── 全站共享缓存 ───────────────────────────────────────────────────
     短语索引全站只有**一份**：workbench.js 的筛选源要读它、
     explore-board.js 的下拉也要读它。两处各建一次 = 白白多花 55 ms
     （实测：971 条作业构建一次 55~80 ms）。

     缓存在本模块里，而不是各文件自己存 —— 放这里才有一处真相源。 */
  let SHARED = null;
  /**
   * 取全站共享的索引（首次调用时构建）。
   * @param {Array} jobs
   * @returns {{phrases:Array, byJob:Map, df:Map}}
   */
  function shared(jobs) {
    if (!SHARED) SHARED = build(jobs);
    return SHARED;
  }

  /** 丢掉缓存（数据换了才需要；本项目是静态页面，实际用不到 —— 留着是为了测试能隔离）。 */
  function resetShared() {
    SHARED = null;
  }

  return {
    FUNC_WORDS,
    NEGATION_WORDS,
    TOKEN_RE,
    MULTI_MIN_DF,
    WORD_MIN_DF,
    SEGMENT_RE,
    candidatesOf,
    build,
    phrasesOf,
    shared,
    resetShared,
  };
})();

if (typeof window !== 'undefined') window.PHRASE_INDEX = PHRASE_INDEX;
