/* ==========================================================================
   候选词条引擎（报告 2.6 / 第 12 步）
   ==========================================================================

   词库（`config/prompts.yaml` 的 156 条）是**待验证的假设集**，
   社区作业（971 条）是**证据集**。两者要能对质 —— 这就是本文件。

   ## 它回答什么问题

   「社区里反复出现的表述，有哪些是词库该有却没有的？」

   具体输出每条候选词条的四件事：
     · **措辞**（phrase）—— 社区作者实际写的原文
     · **频次**（df）—— 有多少条作业用到它
     · **出处**（引用键）—— 哪些作业用了它（可回指、可深链）
     · **与词库的关系**（三态）—— 这是最有价值的一列

   ## 三态差异标记：为什么不是简单的「在/不在」

   实测（971 条作业 / 156 条词库）：
     · **精确命中** 9 条（5.8%）—— 词库原样写了这句话
     · **词元级重合** 25.6% —— 词库写了相近的词（"close-up" vs "close up"）
     · **词库条目零出现** 71 / 156（45.5%）—— 假设集里有一半在证据集里找不到

   所以「在不在」这个二值判断会骗人：
     · 只看精确命中 → 5.8% 的命中率会让人误以为词库完全没用
     · 只看零命中 → 会漏掉「词库已有但社区不常用」这类**反向**信号
       （社区 571 条收录短语里，有 425 条词库完全没覆盖 —— 这是真缺口；
        但反过来，词库 71 条零出现也提示**假设集可能过窄或已过时**）

   三态因此是：
     · **已在词库**（exact）      —— 词库原样有这句话
     · **词库有近义**（near）      —— 词库有词元级重合的相近表述
     · **词库未覆盖**（missing）    —— 词库零重合 ⇒ 这是**真缺口**，是候选词条的主力

   ## 为什么运行时现算（而不是构建期烘焙）

   同一个理由同 phrase-index.js：候选词条是**由 prompt 推导出来的量**，
   不是采集来的事实。烘焙进 data-explore.js 会让「改一行阈值」变成
   「6 MB 生成物跟着漂移」，diff 会被采集数据的变化淹没。

   本文件是纯函数、无 DOM、无依赖（只读入参），因此可以被 vitest
   直接 import 做单元测试。

   ## 与 PHRASE_INDEX 的关系

   **短语从哪来**：全部复用 `PHRASE_INDEX`（同一个抽取算法、同一套阈值），
   不复刻 —— 复刻就会两处漂移。本文件只做**第二件事**：把已抽出的短语
   与词库对质，标出差异。

   代价：PHRASE_INDEX 抽的是「措辞」（含大量内容词：background 281 / hair 159
   / eyes 148），而词库是**摄影技术词**（快门 / 景深 / 镜头 / 光线 / 艺术家）。
   两者语义层不同 ⇒ 命中率天然低。这是事实，不是 bug —— 界面上如实呈现。

   ## 两个必须记住的实现约定

   1. **跨 realm 的 Map 不能用 instanceof 判定**（实测坑）。本文件被单测
      用 `vm` 加载时，`PHRASE_INDEX.build()` 返回的 Map 属于 vm realm，
      在宿主 realm 里 `instanceof Map === false` ⇒ 若照惯例写
      `byJob instanceof Map ? byJob : new Map()`，会静默把入参换成空 Map，
      结果是「出处全空」而不是报错。故本文件一律用 `asMap()` 做**鸭子类型**
      判定（见下）。

   2. **引用键必须由完整作业对象算出**。`JOB_KEY.keyOf` 的哈希段来自
      归一化后的 prompt，只有 id 算不出真键。故 `validateVocab` 与 `build`
      都要求传入完整的作业列表，绝不自己造 `{ id }` 假对象。
   ========================================================================== */

const CANDIDATE_VOCAB = (() => {
  /* ── 差异状态 ──────────────────────────────────────────────────────── */
  const STATUS = {
    /** 词库原样有这句话 */
    EXACT: 'exact',
    /** 词库有词元级重合的相近表述 */
    NEAR: 'near',
    /** 词库零重合 —— 真缺口 */
    MISSING: 'missing',
  };

  const STATUS_LABEL = {
    exact: '已在词库',
    near: '词库有近义',
    missing: '词库未覆盖',
  };

  /* ── 归一化与切词 ────────────────────────────────────────────────────
     **连字符视为词分隔**：词库写 "close-up"，社区写 "close up" ——
     这是同一句话的两种排版，不该判成「词库未覆盖」。同理 "ultra-detailed"
     与 "ultra detailed"。各类横线（- ‐ ‑ ‒ – — _）统一按空格处理。

     切词：字母数字串，保留撇号（"don't" / "artist's" 不该被劈开）。 */
  const SEP_RE = /[\s\-‐‑‒–—_]+/;
  const TOKEN_RE = /[a-z0-9]+(?:['’][a-z0-9]+)*/g;

  /** 归一化：转小写 + 横线/连字符转空格 + 折叠空白。 */
  function normalize(s) {
    return String(s ?? '')
      .toLowerCase()
      .trim()
      .replace(SEP_RE, ' ')
      .replace(/\s+/g, ' ');
  }

  /** 切词（先归一化再切）。 */
  function tokenize(s) {
    return normalize(s).match(TOKEN_RE) || [];
  }

  /**
   * 鸭子类型的 Map 判定 —— **不要用 instanceof**（见文件头约定 1）。
   * 跨 realm 的 Map、原型被改过的 Map、Map 子类都能正确识别；
   * 普通对象也会被顺手转成 Map（宽容入参，不让调用方踩坑）。
   * @param {any} v
   * @returns {Map<any, any>}
   */
  function asMap(v) {
    if (!v) return new Map();
    if (typeof v.get === 'function' && typeof v.entries === 'function') return v;
    if (typeof v === 'object') {
      const m = new Map();
      for (const k of Object.keys(v)) m.set(k, v[k]);
      return m;
    }
    return new Map();
  }

  /**
   * 词元集合签名：把一句话压成「词元的有序无关集合」。
   *
   * 用途 —— 让「精确命中」不依赖词序。词库写 "blue light"，社区写
   * "light blue"，说的是同一件事。没有签名的话，两个方向会得出矛盾结论：
   * build() 说「已在词库」、validateVocab() 说「词库没被用到」。
   *
   * 签名 = 词元排序后用 U+0001 连接（不用空格：短语里不会有分隔符，
   * 但签名是内部键，宁可用一个绝不会出现在词元里的字符）。
   *
   * @param {string} s
   * @returns {string}
   */
  function signature(s) {
    const toks = normalize(s).match(TOKEN_RE) || [];
    if (!toks.length) return '';
    return [...new Set(toks)].sort().join('\u0001');
  }

  /**
   * 词库条目的规范化与词元切分。
   * @param {Array<{zh?:string,en?:string}>} items
   * @returns {{entries: Array<{zh:string,en:string,norm:string,sig:string,tokens:string[]}>,
   *            tokenMap: Map<string, Array<{zh:string,en:string}>>,
   *            exactMap: Map<string, {zh:string,en:string}>,
   *            sigMap: Map<string, {zh:string,en:string}>}}
   */
  function buildVocabIndex(items) {
    const list = Array.isArray(items) ? items : [];
    const entries = [];
    const tokenMap = new Map();
    const exactMap = new Map();
    const sigMap = new Map();
    for (const it of list) {
      const en = String(it?.en || '').toLowerCase().trim();
      if (!en) continue;
      const zh = String(it?.zh || '').trim();
      const norm = normalize(en);
      if (!norm) continue;
      const tokens = norm.match(TOKEN_RE) || [];
      const sig = signature(en);
      const entry = { zh, en, norm, sig, tokens };
      entries.push(entry);
      if (!exactMap.has(norm)) exactMap.set(norm, { zh, en });
      if (sig && !sigMap.has(sig)) sigMap.set(sig, { zh, en });
      for (const tk of tokens) {
        if (!tokenMap.has(tk)) tokenMap.set(tk, []);
        tokenMap.get(tk).push(entry);
      }
    }
    return { entries, tokenMap, exactMap, sigMap };
  }

  /**
   * 词库的规范化表述集合（用于精确匹配）。
   * @param {Array} items
   * @returns {Set<string>}
   */
  function vocabPhrases(items) {
    const set = new Set();
    for (const it of Array.isArray(items) ? items : []) {
      const en = String(it?.en || '').toLowerCase().trim();
      if (!en) continue;
      const norm = normalize(en);
      if (!norm) continue;
      set.add(norm);
      // 也收录单词元形式（词库里 "360 panorama" 匹配社区的 "panorama" 时用）
      const toks = norm.match(TOKEN_RE) || [];
      if (toks.length === 1) set.add(toks[0]);
    }
    return set;
  }

  /**
   * 一条候选词条的差异判定。
   *
   * @param {string} phrase
   * @param {Set<string>} exactSet 词库表述集合（已归一化）
   * @param {Map<string, Array>} tokenMap 词库词元 -> 条目
   * @param {Map<string, {zh:string,en:string}>} [sigMap] 词库词元集合签名 -> 条目
   * @returns {{status:string, matches:Array<{zh:string,en:string}>, viaTokens:string[]}}
   */
  function classify(phrase, exactSet, tokenMap, sigMap) {
    const p = normalize(phrase);
    if (!p) return { status: STATUS.MISSING, matches: [], viaTokens: [] };

    // 精确命中 ①：整句相同（归一化后）
    if (exactSet && typeof exactSet.has === 'function' && exactSet.has(p)) {
      return { status: STATUS.EXACT, matches: [], viaTokens: [] };
    }
    // 精确命中 ②：词元集合与某条词库条目完全相同（词序无关）
    //   —— 与 validateVocab 用的是同一把尺子（signature），两个方向不会打架。
    const sig = signature(p);
    const sigEntry = sigMap && typeof sigMap.get === 'function' ? sigMap.get(sig) : null;
    if (sig && sigEntry) {
      return { status: STATUS.EXACT, matches: [sigEntry], viaTokens: [] };
    }

    const toks = p.match(TOKEN_RE) || [];
    const viaTokens = [];
    const matches = [];
    const seen = new Set();
    const map = asMap(tokenMap);
    for (const tk of toks) {
      const hits = map.get(tk);
      if (!hits || !hits.length) continue;
      viaTokens.push(tk);
      for (const h of hits) {
        const k = h.en;
        if (seen.has(k)) continue;
        seen.add(k);
        matches.push({ zh: h.zh, en: h.en });
      }
    }

    if (!viaTokens.length) {
      // 词库零重合 —— 真缺口
      return { status: STATUS.MISSING, matches: [], viaTokens: [] };
    }
    return { status: STATUS.NEAR, matches, viaTokens };
  }

  /**
   * 建候选词条清单。
   *
   * @param {Array<{phrase:string, df:number}>} phrases PHRASE_INDEX 的收录短语
   * @param {Map<string, string[]>} byJob 作业 id -> 命中的短语
   * @param {Array<{id?:string, prompt?:string}>} jobs 作业列表（按 id 索引）
   * @param {Array<{zh?:string,en?:string}>} vocabItems 词库条目（扁平化后的）
   * @param {{keyOf?: (job:any)=>string}} [opts] 引用键计算器（复用 JOB_KEY）
   * @returns {{candidates: Array, byStatus: {exact:number, near:number, missing:number}}}
   */
  function build(phrases, byJob, jobs, vocabItems, opts = {}) {
    const list = Array.isArray(phrases) ? phrases : [];
    const jobList = Array.isArray(jobs) ? jobs : [];
    const byJobMap = asMap(byJob);
    const { entries, tokenMap, exactMap, sigMap } = buildVocabIndex(vocabItems);
    const exactSet = vocabPhrases(vocabItems);
    const keyOf = typeof opts.keyOf === 'function' ? opts.keyOf : (j) => String(j?.id || '').slice(0, 8);

    // 作业 id -> 引用键（出处用）。**必须由完整作业对象算**（哈希段来自 prompt）。
    const keyByJobId = new Map();
    for (const j of jobList) {
      const id = String(j?.id ?? '');
      if (!id) continue;
      keyByJobId.set(id, keyOf(j));
    }

    // 短语 -> 作业 id 列表（byJob 是「作业 -> 短语」，这里反查）
    const jobsByPhrase = new Map();
    for (const [jobId, ps] of byJobMap) {
      const arr = Array.isArray(ps) ? ps : [];
      for (const p of arr) {
        if (!jobsByPhrase.has(p)) jobsByPhrase.set(p, []);
        jobsByPhrase.get(p).push(jobId);
      }
    }

    const candidates = [];
    const byStatus = { exact: 0, near: 0, missing: 0 };

    for (const item of list) {
      // **phrase 保留社区原文**（显示用），norm 是归一化形式（匹配用）。
      // 不把 "close-up" 显示成 "close up" —— 原文是证据，形态本身也是信息。
      const raw = String(item?.phrase ?? '').toLowerCase().trim();
      const phrase = normalize(raw);
      if (!phrase) continue;
      const df = Number(item?.df) || 0;
      const cls = classify(phrase, exactSet, tokenMap, sigMap);
      const jobIds = jobsByPhrase.get(raw) || jobsByPhrase.get(phrase) || [];
      // 出处：引用键列表（去重、保持稳定顺序）
      const sources = [];
      const seenKey = new Set();
      for (const jid of jobIds) {
        const k = keyByJobId.get(jid);
        if (!k || seenKey.has(k)) continue;
        seenKey.add(k);
        sources.push(k);
      }
      sources.sort();
      byStatus[cls.status] = (byStatus[cls.status] || 0) + 1;
      const matches = cls.matches.length
        ? cls.matches
        : (exactMap.get(phrase) ? [exactMap.get(phrase)] : []);
      candidates.push({
        phrase: raw || phrase,
        norm: phrase,
        df,
        status: cls.status,
        statusLabel: STATUS_LABEL[cls.status] || cls.status,
        matches,
        viaTokens: cls.viaTokens,
        sources,
        sourceCount: sources.length,
      });
    }

    // 按 df 降序；同频按字典序（与 PHRASE_INDEX 的排序口径一致）
    candidates.sort((a, b) => b.df - a.df || a.phrase.localeCompare(b.phrase));

    return { candidates, byStatus, vocabCount: entries.length };
  }

  /**
   * 词库条目的反向查询：哪些社区作业用过这条词库的表述？
   *
   * 用途 —— 「词库条目在社区里的验证情况」。这是**假设集被证据集检验**
   * 的方向：不是只看社区有什么缺，也看词库有什么站不住。
   *
   * @param {Array<{phrase:string, df:number}>} phrases
   * @param {Map<string, string[]>} byJob 作业 id -> 命中的短语
   * @param {Array<{id?:string, prompt?:string}>} jobs 完整作业列表（算引用键用）
   * @param {Array<{zh?:string,en?:string}>} vocabItems
   * @param {{keyOf?: (job:any)=>string}} [opts]
   * @returns {Array<{zh:string,en:string,matched:boolean,df:number,sources:string[]}>}
   */
  function validateVocab(phrases, byJob, jobs, vocabItems, opts = {}) {
    const list = Array.isArray(phrases) ? phrases : [];
    const jobList = Array.isArray(jobs) ? jobs : [];
    const byJobMap = asMap(byJob);
    const { entries, tokenMap } = buildVocabIndex(vocabItems);
    const keyOf = typeof opts.keyOf === 'function' ? opts.keyOf : (j) => String(j?.id || '').slice(0, 8);

    // 作业 id -> 引用键（**由完整作业对象算**）
    const keyByJobId = new Map();
    for (const j of jobList) {
      const id = String(j?.id ?? '');
      if (!id) continue;
      keyByJobId.set(id, keyOf(j));
    }
    // 兜底：作业列表没给全时，用 byJob 的键反推（只能算 id 段，弱但不为空）
    for (const jobId of byJobMap.keys()) {
      const id = String(jobId ?? '');
      if (!id || keyByJobId.has(id)) continue;
      keyByJobId.set(id, keyOf({ id }));
    }

    // 社区短语 -> 归一化后的短语集合 + 签名集合
    const phraseNorm = new Set();
    const phraseSig = new Map();   // 签名 -> 归一化短语（词序不同的多个形态归到一处）
    const phraseList = [];
    for (const p of list) {
      const n = normalize(p?.phrase);
      if (!n) continue;
      phraseNorm.add(n);
      const sig = signature(n);
      if (sig && !phraseSig.has(sig)) phraseSig.set(sig, n);
      phraseList.push({ phrase: n, df: Number(p?.df) || 0 });
    }
    phraseList.sort((a, b) => b.df - a.df || a.phrase.localeCompare(b.phrase));

    // 作业 id -> 命中的社区短语（反查）
    const jobsByPhrase = new Map();
    for (const [jobId, ps] of byJobMap) {
      const arr = Array.isArray(ps) ? ps : [];
      for (const p of arr) {
        const n = normalize(p);
        if (!n) continue;
        if (!jobsByPhrase.has(n)) jobsByPhrase.set(n, []);
        jobsByPhrase.get(n).push(jobId);
      }
    }

    const out = [];
    for (const entry of entries) {
      // **是否被用到用签名口径** —— 与 classify() 的精确命中判定同尺子。
      // 若这里用「整句相同」，词库 "blue light" 会被判「社区没写过」，
      // 而 build() 又因社区的 "light blue" 判它「已在词库」⇒ 两个方向打架。
      const matched = phraseNorm.has(entry.norm) || (entry.sig ? phraseSig.has(entry.sig) : false);
      const sources = [];
      if (matched) {
        // 收集**所有**签名相同的社区形态的出处（词序不同也是同一句话）
        const forms = new Set();
        if (phraseNorm.has(entry.norm)) forms.add(entry.norm);
        const alt = entry.sig ? phraseSig.get(entry.sig) : null;
        if (alt) forms.add(alt);
        const seen = new Set();
        for (const form of forms) {
          for (const jobId of jobsByPhrase.get(form) || []) {
            const k = keyByJobId.get(jobId);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            sources.push(k);
          }
        }
        sources.sort();
      }
      // 词元级出现在哪些社区短语里（最多列 12 条，按 df 降序）
      const inPhrases = [];
      for (const pl of phraseList) {
        const toks = pl.phrase.match(TOKEN_RE) || [];
        if (!entry.tokens.some((tk) => toks.includes(tk))) continue;
        inPhrases.push(pl.phrase);
        if (inPhrases.length >= 12) break;
      }
      out.push({
        zh: entry.zh,
        en: entry.en,
        norm: entry.norm,
        sig: entry.sig,
        matched,
        df: matched ? sources.length : 0,
        sources,
        tokens: entry.tokens,
        inPhrases,
        viaTokens: entry.tokens.filter((tk) => tokenMap.has(tk)),
      });
    }
    // 站得住的排前面
    out.sort((a, b) => (b.matched ? 1 : 0) - (a.matched ? 1 : 0) || b.df - a.df || a.en.localeCompare(b.en));
    return out;
  }

  return {
    STATUS,
    STATUS_LABEL,
    TOKEN_RE,
    SEP_RE,
    normalize,
    tokenize,
    signature,
    asMap,
    buildVocabIndex,
    vocabPhrases,
    classify,
    build,
    validateVocab,
  };
})();

if (typeof window !== 'undefined') window.CANDIDATE_VOCAB = CANDIDATE_VOCAB;
