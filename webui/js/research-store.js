/* ==========================================================================
   研究数据层 —— 本地 IndexedDB（报告 2.3 / 第 6 步）

   存两类东西：
     · 观察记录（note）：一条研究样本 ↔ 多条观察（笔记、假设、标签）
     · 结论（conclusion）：一段文字 + 它依据的样本引用键集合

   ## 为什么是 IndexedDB 而不是 localStorage

   实测（本机 Chrome，file:// 协议）：
     · localStorage 可用，但写满约 5042 KB 即 QuotaExceededError（约 4.9 MB）
     · IndexedDB 可用，写入 20000 条 1 KB 记录（20 MB）未触顶
   研究笔记是长文本且会持续增长，localStorage 必然触顶 —— 报告 4.1 已点名此问题。

   ## 为什么 file:// 下能用

   实测：file:// 下 indexedDB.open 成功、建表成功、读写成功、索引查询成功；
   且**不同目录路径共享同一个库**（origin 均为 file://）。
   所以 4 个 HTML 页（index / gallery / style-library / explore）可以共用一个库。

   ## 为什么引用键而不是内部 id

   观察记录挂的是**引用键**（报告 2.1 的 `<id8>-<hash4>`），不是上游 UUID：
   引用键是本项目对外的稳定标识，研究结论与笔记都用它，
   而库里的作业数据会随每日采集增减，UUID 不适合作为笔记的锚。

   ## 与第 10 步（4.1 本地数据层）的关系

   本文件是**数据层的第一个落地**，只覆盖「观察记录 + 结论」两类实体。
   第 10 步会在同一个库上扩展作业/拆解的索引与查询下沉 —— 库名与
   store 命名刻意留出余量（`mj-research`），届时不需要推翻本文件。
   ========================================================================== */

const RESEARCH_DB = (() => {
  const DB_NAME = 'mj-research';
  const DB_VERSION = 1;

  const STORE_NOTES = 'notes';
  const STORE_CONCLUSIONS = 'conclusions';

  /** 观察记录：一条笔记挂在一条样本上。 */
  /*  { id, jobKey, body, tags[], createdAt, updatedAt }
     jobKey = 引用键（报告 2.1）；不是上游 UUID。
     tags  是多值字段，byTag 索引支持「按标签聚合」。 */
  /* 结论：指向它依据的样本集合。 */
  /*  { id, title, body, jobKeys[], createdAt, updatedAt }
     jobKeys = 引用键数组 —— 结论的依据就是这些键。 */

  let dbPromise = null;
  let unavailableReason = null;

  /** IndexedDB 是否可用（隐私模式 / 老浏览器可能不可用）。 */
  function available() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  /** 打开（并升级）数据库。失败时记下原因，不抛给调用方 —— 界面要能如实提示而不是白屏。 */
  function open() {
    if (!available()) {
      unavailableReason = '当前浏览器环境不支持 IndexedDB（可能处于隐私模式）';
      return Promise.reject(new Error(unavailableReason));
    }
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        unavailableReason = `打开数据库失败：${(e && e.message) || e}`;
        reject(new Error(unavailableReason));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          const s = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
          s.createIndex('byJob', 'jobKey', { unique: false });
          s.createIndex('byTs', 'createdAt', { unique: false });
          // 多值索引：一个标签 → 所有带它的记录
          s.createIndex('byTag', 'tags', { unique: false, multiEntry: true });
        }
        if (!db.objectStoreNames.contains(STORE_CONCLUSIONS)) {
          const s = db.createObjectStore(STORE_CONCLUSIONS, { keyPath: 'id' });
          s.createIndex('byTs', 'createdAt', { unique: false });
          s.createIndex('byJob', 'jobKeys', { unique: false, multiEntry: true });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          // 别的标签页要升级版本 → 让出，避免阻塞对方
          try { db.close(); } catch { /* 忽略 */ }
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        unavailableReason = `打开数据库失败：${(req.error && req.error.message) || '未知错误'}`;
        dbPromise = null;
        reject(new Error(unavailableReason));
      };
      req.onblocked = () => {
        unavailableReason = '数据库被另一个标签页占用，请关闭其他打开本项目的标签页后重试';
        dbPromise = null;
        reject(new Error(unavailableReason));
      };
    });
    return dbPromise;
  }

  /** 把 IDBRequest 包成 Promise。 */
  function toPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 请求失败'));
    });
  }

  /** 在一个 store 上跑一次事务。 */
  async function tx(storeName, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (e) {
        reject(e);
        return;
      }
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('事务失败'));
      transaction.onabort = () => reject(transaction.error || new Error('事务被中止'));
      try {
        result = fn(transaction.objectStore(storeName));
      } catch (e) {
        try { transaction.abort(); } catch { /* 忽略 */ }
        reject(e);
      }
    });
  }

  const now = () => Date.now();

  /** 生成一条记录 id。用时间戳 + 随机段，避免同毫秒碰撞。 */
  function newId(prefix) {
    const r = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${now().toString(36)}-${r}`;
  }

  /* ── 观察记录 ─────────────────────────────────────────────────────── */

  /** 某条样本的全部观察记录（按时间倒序）。 */
  async function notesByJob(jobKey) {
    const key = String(jobKey || '').trim();
    if (!key) return [];
    const db = await open();
    const t = db.transaction(STORE_NOTES, 'readonly');
    const idx = t.objectStore(STORE_NOTES).index('byJob');
    const rows = await toPromise(idx.getAll(key));
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /** 全部观察记录（按时间倒序）。 */
  async function allNotes() {
    const db = await open();
    const t = db.transaction(STORE_NOTES, 'readonly');
    const rows = await toPromise(t.objectStore(STORE_NOTES).getAll());
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /** 按标签取记录（多值索引精确匹配）。 */
  async function notesByTag(tag) {
    const key = String(tag || '').trim();
    if (!key) return [];
    const db = await open();
    const t = db.transaction(STORE_NOTES, 'readonly');
    const idx = t.objectStore(STORE_NOTES).index('byTag');
    const rows = await toPromise(idx.getAll(key));
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /**
   * 新建一条观察记录。
   * @param {{jobKey: string, body: string, tags?: string[]}} input
   */
  async function addNote(input) {
    const jobKey = String(input?.jobKey || '').trim();
    const body = String(input?.body || '').trim();
    if (!jobKey) throw new Error('观察记录必须挂在一条样本上（缺少引用键）');
    if (!body) throw new Error('观察记录内容不能为空');
    const tags = normalizeTags(input?.tags);
    const ts = now();
    const rec = { id: newId('n'), jobKey, body, tags, createdAt: ts, updatedAt: ts };
    await tx(STORE_NOTES, 'readwrite', (s) => { s.put(rec); });
    return rec;
  }

  /**
   * 更新一条观察记录。
   *
   * 刻意用「读事务 → 写事务」两步，而不是在一个事务里 await get 再 put：
   * IndexedDB 事务在 await 之后可能因微任务让出而失活（规范允许浏览器
   * 自动提交），那样后续的 put 会抛 TransactionInactiveError。
   * 两步法每个事务内部都是同步完成的，不依赖这个脆弱时序。
   */
  async function updateNote(id, patch) {
    const db = await open();
    const readTx = db.transaction(STORE_NOTES, 'readonly');
    const cur = await toPromise(readTx.objectStore(STORE_NOTES).get(id));
    if (!cur) throw new Error(`观察记录不存在：${id}`);
    const next = {
      ...cur,
      body: patch?.body === undefined ? cur.body : String(patch.body).trim(),
      tags: patch?.tags === undefined ? cur.tags : normalizeTags(patch.tags),
      updatedAt: now(),
    };
    if (!next.body) throw new Error('观察记录内容不能为空');
    await tx(STORE_NOTES, 'readwrite', (s) => { s.put(next); });
    return next;
  }

  /** 删除一条观察记录。 */
  async function deleteNote(id) {
    await tx(STORE_NOTES, 'readwrite', (s) => { s.delete(id); });
    return true;
  }

  /* ── 结论 ─────────────────────────────────────────────────────────── */

  /** 全部结论（按时间倒序）。 */
  async function allConclusions() {
    const db = await open();
    const t = db.transaction(STORE_CONCLUSIONS, 'readonly');
    const rows = await toPromise(t.objectStore(STORE_CONCLUSIONS).getAll());
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /** 依据了某条样本的全部结论。 */
  async function conclusionsByJob(jobKey) {
    const key = String(jobKey || '').trim();
    if (!key) return [];
    const db = await open();
    const t = db.transaction(STORE_CONCLUSIONS, 'readonly');
    const idx = t.objectStore(STORE_CONCLUSIONS).index('byJob');
    const rows = await toPromise(idx.getAll(key));
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /**
   * 新建一条结论。
   * @param {{title?: string, body: string, jobKeys?: string[]}} input
   */
  async function addConclusion(input) {
    const body = String(input?.body || '').trim();
    if (!body) throw new Error('结论内容不能为空');
    const title = String(input?.title || '').trim();
    const jobKeys = normalizeKeys(input?.jobKeys);
    const ts = now();
    const rec = { id: newId('c'), title, body, jobKeys, createdAt: ts, updatedAt: ts };
    await tx(STORE_CONCLUSIONS, 'readwrite', (s) => { s.put(rec); });
    return rec;
  }

  /** 更新一条结论。同样走「读事务 → 写事务」两步，理由见 updateNote。 */
  async function updateConclusion(id, patch) {
    const db = await open();
    const readTx = db.transaction(STORE_CONCLUSIONS, 'readonly');
    const cur = await toPromise(readTx.objectStore(STORE_CONCLUSIONS).get(id));
    if (!cur) throw new Error(`结论不存在：${id}`);
    const next = {
      ...cur,
      title: patch?.title === undefined ? cur.title : String(patch.title).trim(),
      body: patch?.body === undefined ? cur.body : String(patch.body).trim(),
      jobKeys: patch?.jobKeys === undefined ? cur.jobKeys : normalizeKeys(patch.jobKeys),
      updatedAt: now(),
    };
    if (!next.body) throw new Error('结论内容不能为空');
    await tx(STORE_CONCLUSIONS, 'readwrite', (s) => { s.put(next); });
    return next;
  }

  /** 删除一条结论。 */
  async function deleteConclusion(id) {
    await tx(STORE_CONCLUSIONS, 'readwrite', (s) => { s.delete(id); });
    return true;
  }

  /* ── 聚合 ─────────────────────────────────────────────────────────── */

  /**
   * 全部标签及其使用次数（降序）。
   * 报告 2.3 要求「支持按标签聚合」—— 这里是聚合的唯一口径。
   */
  async function tagCounts() {
    const notes = await allNotes();
    const counts = new Map();
    notes.forEach((n) => {
      (n.tags || []).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag, 'zh-CN'));
  }

  /** 统计概览：多少条观察、多少条结论、涉及多少条样本。 */
  async function stats() {
    const [notes, conclusions] = await Promise.all([allNotes(), allConclusions()]);
    const jobs = new Set();
    notes.forEach((n) => { if (n.jobKey) jobs.add(n.jobKey); });
    conclusions.forEach((c) => (c.jobKeys || []).forEach((k) => jobs.add(k)));
    return { notes: notes.length, conclusions: conclusions.length, jobs: jobs.size };
  }

  /* ── 工具 ─────────────────────────────────────────────────────────── */

  /** 标签归一化：去空白、去重、保序。 */
  function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    const seen = new Set();
    const out = [];
    tags.forEach((t) => {
      const s = String(t ?? '').trim();
      if (!s) return;
      const k = s.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(s);
    });
    return out;
  }

  /** 引用键归一化：去空白、去重、保序。 */
  function normalizeKeys(keys) {
    if (!Array.isArray(keys)) return [];
    const seen = new Set();
    const out = [];
    keys.forEach((k) => {
      const s = String(k ?? '').trim();
      if (!s) return;
      const lower = s.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      out.push(s);
    });
    return out;
  }

  /** 存储是否可用（供界面如实提示）。 */
  function status() {
    // reason 必须始终是字符串：从未探测过时也要说清楚「为什么看起来可用」——
    // available 只是「环境里有 indexedDB 这个全局」，不代表真的能打开。
    const reason = unavailableReason
      || (available() ? '' : '当前浏览器环境不支持 IndexedDB（可能处于隐私模式）');
    return { available: available(), reason };
  }

  /** 清空全部研究数据（危险操作，界面需二次确认）。 */
  async function clearAll() {
    await tx(STORE_NOTES, 'readwrite', (s) => { s.clear(); });
    await tx(STORE_CONCLUSIONS, 'readwrite', (s) => { s.clear(); });
    return true;
  }

  return {
    DB_NAME,
    DB_VERSION,
    STORE_NOTES,
    STORE_CONCLUSIONS,
    open,
    notesByJob,
    allNotes,
    notesByTag,
    addNote,
    updateNote,
    deleteNote,
    allConclusions,
    conclusionsByJob,
    addConclusion,
    updateConclusion,
    deleteConclusion,
    tagCounts,
    stats,
    status,
    clearAll,
    normalizeTags,
    normalizeKeys,
  };
})();

// 挂到 window：顶层 const 不进 window 全局，但探针与测试需要直接拿到这个对象。
// 正式页面里靠 <script> 的顶层 const 词法作用域使用（与 JOB_KEY 同构）。
if (typeof window !== 'undefined') window.RESEARCH_DB = RESEARCH_DB;
