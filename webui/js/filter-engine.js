/* ==========================================================================
   统一筛选引擎（报告 3.4）
   --------------------------------------------------------------------------
   背景：本项目此前有 **4 套各写各的**筛选实现 ——
     · workbench.js      艺术家侧：分面词 + 主色 + 只看实测 + 搜索
     · explore-board.js  探索榜侧：批次 + 比例 + 只看有 sref + 搜索（无计数、无分面）
     · style-library.js  风格库侧：搜索
     · gallery.js        画廊侧：分类 + 搜索
   每加一个数据源就多一套 —— 这正是报告 3.4 说的「重复」。

   本文件把「筛选」抽成 **一个引擎 + 一套 URL 契约**，四个数据源共用。

   ── 设计要点 ────────────────────────────────────────────────────────────

   1. **一个维度注册表**：每个数据源声明自己有哪些筛选维度（名字、类型、
      取值来源）。引擎据此决定「哪些参数允许出现在 URL 里」。

   2. **URL 是筛选状态的唯一来源**（沿用 ADR-0010）：
      形态 `#<页签>?<参数>&<参数>`，与既有的 `#explore?job=<引用键>`
      是同一个形态（页签 id + query），不引入第二套写法。
      不认识的参数**丢弃并记下来**（用于提示一次），不静默忽略。

   3. **组内任一 / 组间全部**（分面语义）：
      同一维度组内的多个取值是「或」（任一命中即可），
      不同维度组之间是「与」（全部满足）。
      这条语义此前只存在于艺术家侧，现由引擎统一承载。

      3a. **多组维度**（grouped multi，2026-11 风格与类型库）：
           分面词天然分 10 组（风格质量 / 主题 / 技法…），而「组内任一、
           组间全部」要求：**同一组内多值取或，跨组取与**。
           这与「一个 multi 维度多值一律取或」不同，因此维度可声明
           `groupOf(item, value)`：返回该取值所属的组 id。
           引擎据此把选中值按组切分，逐组判或、跨组判与。
           未声明 groupOf 的 multi 维度行为不变（全部取值取或）。

   4. **分面计数**：每个维度的每个取值给出「有多少条命中它」，
      供界面显示计数。计数在**当前其它维度的筛选下**计算（经典分面行为：
      选了 A 组后，B 组的计数反映 A 选中后的结果）。

   5. **纯函数、无依赖**：不碰 DOM、不碰 window，可被 `vm` 加载做单元测试
      （与 tools/job-key.mjs 加载 webui/js/job-key.js 同一手法 ——
      算法本体只有一份，不复刻）。
   ========================================================================== */

const FILTER_ENGINE = (() => {
  /* ── 参数类型 ────────────────────────────────────────────────────────
     q      自由文本
     enum   单选（批次、比例、分类）
     bool   开关（只看有 sref、只看实测）
     multi  多选（分面词、主色）—— 同一参数重复出现即多选 */
  const PARAM_TYPES = { q: 'q', enum: 'enum', bool: 'bool', multi: 'multi' };

  /* ── 维度定义 ─────────────────────────────────────────────────────────
     一个「筛选源」= 一组维度 + 一份条目集合 + 怎么取某条目的某维度值。

     dims: [
       { key, type, label?, options?: () => [{value,label,count?}],
         valuesOf?: (item) => string[]   —— multi 类型必填
         valueOf?: (item) => string      —— enum 类型必填
         activeOf?: (item) => boolean    —— bool 类型必填
         matchOf?: (item, text) => boolean —— q 类型必填
         groupOf?: (value) => string     —— multi 类型可选：取值所属组 id。
                                          声明后按「组内任一、组间全部」匹配。
       }
     ] */
  function source(id, dims) {
    return { id, dims };
  }

  /** 维度按 key 索引 */
  function dimsOf(src) {
    const map = new Map();
    for (const d of src.dims) map.set(d.key, d);
    return map;
  }

  /* ── 状态 ────────────────────────────────────────────────────────────
     状态是一个纯对象：{ q: string, dims: { key: value | string[] | boolean } }
     默认值由维度的 type 推出：q → ''，enum → ''，bool → false，multi → [] */
  function emptyState(src) {
    const dims = {};
    for (const d of src.dims) {
      // q 维度的权威位置是 state.q（顶层），不在 dims 里 —— 避免两处真相源
      if (d.type === 'q') continue;
      dims[d.key] = d.type === 'multi' ? [] : (d.type === 'bool' ? false : '');
    }
    return { q: '', dims };
  }

  function cloneState(st) {
    const dims = {};
    for (const [k, v] of Object.entries(st.dims || {})) {
      dims[k] = Array.isArray(v) ? [...v] : v;
    }
    return { q: st.q || '', dims };
  }

  /** 两个状态是否等价（用于「筛选没变就别重渲染」） */
  function sameState(a, b) {
    if ((a.q || '') !== (b.q || '')) return false;
    const keys = new Set([...Object.keys(a.dims || {}), ...Object.keys(b.dims || {})]);
    for (const k of keys) {
      const x = (a.dims || {})[k];
      const y = (b.dims || {})[k];
      if (Array.isArray(x) || Array.isArray(y)) {
        const xs = [...(x || [])].map(String).sort();
        const ys = [...(y || [])].map(String).sort();
        if (xs.length !== ys.length || xs.some((v, i) => v !== ys[i])) return false;
      } else if ((x || '') !== (y || '')) return false;
    }
    return true;
  }

  /* ── 匹配 ────────────────────────────────────────────────────────────
     组内任一（multi / 同一 multi 维度内的多个值）：任一命中即可
     组间全部（不同维度之间）：全部满足
     q：自由文本，任一维度的 matchOf 命中即可

     **多组维度**（声明了 groupOf 的 multi）：
     分面词分 10 组，「组内任一、组间全部」指的是
     「同组的多值取或、跨组取与」，不是「该维度所有取值取或」。
     所以这里把选中值按组切分：每组内部任一命中即过该组，
     所有组都过了才算命中该维度。 */
  function multiMatches(d, item, val) {
    const have = d.valuesOf(item) || [];
    if (!d.groupOf) return have.some(v => val.includes(v));
    // 按组切分选中值
    const groups = new Map();
    for (const v of val) {
      const g = d.groupOf(v) || '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(v);
    }
    for (const [, picked] of groups) {
      if (!have.some(v => picked.includes(v))) return false;
    }
    return true;
  }

  function matches(src, item, state) {
    for (const d of src.dims) {
      const val = (state.dims || {})[d.key];
      if (d.type === 'bool') {
        if (val && !d.activeOf(item)) return false;
        continue;
      }
      if (d.type === 'enum') {
        if (val && d.valueOf(item) !== val) return false;
        continue;
      }
      if (d.type === 'multi') {
        if (!val || !val.length) continue;
        if (!multiMatches(d, item, val)) return false;
        continue;
      }
      if (d.type === 'q') {
        const text = (state.q || '').trim().toLowerCase();
        if (text && !d.matchOf(item, text)) return false;
        continue;
      }
    }
    return true;
  }

  /** 全部条目里命中当前筛选的 */
  function filter(src, items, state) {
    return items.filter(item => matches(src, item, state));
  }

  /* ── 分面计数 ────────────────────────────────────────────────────────
     计数在「**其它维度**的当前筛选下」计算 —— 经典分面行为：
     选了 A 组后，B 组显示的是 A 选中后还剩多少条。
     维度自己的那组不参与计算（否则恒等于自己）。

     多组维度的计数口径与 A/B 档文档一致：
     「选项上的数字 = 在当前条件基础上再打开该项会得到的条数」。
     即把该值加进它所属组后，整条筛选链的结果条数。 */
  function counts(src, items, state, dimKey) {
    const dimMap = dimsOf(src);
    const target = dimMap.get(dimKey);
    if (!target) return new Map();
    // 用「除掉目标维度」的筛选来算
    const probe = cloneState(state);
    probe.dims[dimKey] = target.type === 'multi' ? [] : (target.type === 'bool' ? false : '');
    const map = new Map();
    if (target.type === 'multi' && target.groupOf) {
      // 多组维度：逐个候选值试算（把值加进它所属组后，整链的结果条数）
      const candidates = new Set();
      for (const item of items) {
        if (!matches(src, item, probe)) continue;
        for (const v of target.valuesOf(item) || []) candidates.add(v);
      }
      for (const v of candidates) {
        const probe2 = cloneState(state);
        const cur = probe2.dims[dimKey] || [];
        probe2.dims[dimKey] = cur.includes(v) ? cur : [...cur, v];
        map.set(v, items.filter(item => matches(src, item, probe2)).length);
      }
      return map;
    }
    for (const item of items) {
      if (!matches(src, item, probe)) continue;
      if (target.type === 'multi') {
        for (const v of target.valuesOf(item) || []) map.set(v, (map.get(v) || 0) + 1);
      } else if (target.type === 'enum') {
        const v = target.valueOf(item);
        if (v !== undefined && v !== null && v !== '') map.set(v, (map.get(v) || 0) + 1);
      }
    }
    return map;
  }

  /* ── URL 契约 ────────────────────────────────────────────────────────
     形态：#<页签>?q=xxx&batch=11-10&term=a&term=b
     · 页签 id 在前，query 在后（与既有的 #explore?job=<key> 同形态）
     · 同一 multi 维度重复出现即多选
     · bool 参数出现即 1（其他取值视为未生效，不算被丢弃）
     · 不认识的参数 → 丢弃并记进 ignored（界面提示一次） */

  /** 解析 hash → { tab, state, ignored } */
  function parseHash(src, hash) {
    const raw = String(hash || '').replace(/^#\/?/, '');
    const q = raw.indexOf('?');
    const path = (q === -1 ? raw : raw.slice(0, q)).trim();
    const query = q === -1 ? '' : raw.slice(q + 1);
    const parsed = parseQuery(src, query);
    parsed.tab = path || null;
    return parsed;
  }

  /**
   * 只解析 query 串（不含页签）。
   * 用于「调用方已经自己拆好了页签与 query」的场景 —— 避免重复拆分。
   */
  function parseQuery(src, query) {
    const result = { tab: null, state: emptyState(src), ignored: [] };
    const dimMap = dimsOf(src);
    const params = new URLSearchParams(String(query || '').replace(/^\?/, ''));
    const seen = new Set();
    for (const key of params.keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      const d = dimMap.get(key);
      if (!d) {
        result.ignored.push(key);
        continue;
      }
      if (d.type === 'q') {
        result.state.q = (params.get('q') || '').trim();
        continue;
      }
      if (d.type === 'multi') {
        result.state.dims[key] = params.getAll(key)
          .map(v => String(v).trim())
          .filter(Boolean);
        continue;
      }
      if (d.type === 'bool') {
        result.state.dims[key] = (params.get(key) || '').trim() === '1';
        continue;
      }
      // enum：单选，取第一个非空
      result.state.dims[key] = (params.get(key) || '').trim();
    }
    return result;
  }

  /** 生成 hash → '#<页签>?...'（无生效条件时只留页签） */
  function buildHash(src, tab, state) {
    const params = new URLSearchParams();
    const q = (state.q || '').trim();
    if (q) params.append('q', q);
    for (const d of src.dims) {
      if (d.type === 'q') continue;
      const val = (state.dims || {})[d.key];
      if (d.type === 'multi') {
        for (const v of val || []) params.append(d.key, String(v));
      } else if (d.type === 'bool') {
        if (val) params.append(d.key, '1');
      } else if (val) {
        params.append(d.key, String(val));
      }
    }
    const query = params.toString();
    return `#${tab}${query ? `?${query}` : ''}`;
  }

  /** 状态是否「空」（用于判断该不该写 URL / 该显示默认视图） */
  function isEmpty(src, state) {
    if ((state.q || '').trim()) return false;
    for (const d of src.dims) {
      if (d.type === 'q') continue;
      const val = (state.dims || {})[d.key];
      if (d.type === 'multi') { if (val && val.length) return false; }
      else if (d.type === 'bool') { if (val) return false; }
      else if (val) return false;
    }
    return true;
  }

  return {
    PARAM_TYPES,
    source,
    dimsOf,
    emptyState,
    cloneState,
    sameState,
    matches,
    multiMatches,
    filter,
    counts,
    parseHash,
    parseQuery,
    buildHash,
    isEmpty,
  };
})();

if (typeof window !== 'undefined') window.FILTER_ENGINE = FILTER_ENGINE;
