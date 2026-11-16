/* ==========================================================================
   MJ Prompt Generator · 重设计原型 — 共享内核
   职责：主题 / 会话状态 / 参数版本兼容 / 提示词拼装 / 会话 Dock / 顶栏 / 搜索面板
   会话与界面偏好的落盘键沿用项目约定：会话 mj-session-v2，界面 mj-theme。
   ========================================================================== */

const SESSION_KEY = 'mj-session-v2';
const THEME_KEY = 'mj-theme';

/* ── 图标（单色描边，24 网格） ─────────────────────────────────────── */
const ICON_PATHS = {
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  trash: '<path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.9 12.1A1.2 1.2 0 0 0 8.6 20.2h6.8a1.2 1.2 0 0 0 1.2-1.1L17.5 7"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h7M15 17h5"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="13" cy="17" r="2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.6" cy="9.6" r="1.6"/><path d="m21 15.5-4.6-4.6L5 20.5"/>',
  reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3 8.5"/><path d="M3 3.5v5h5"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/>',
  arrowRight: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6h.01"/>',
  // 并排两列（对照视图用）
  columns: '<rect x="3" y="4" width="7.5" height="16" rx="1.5"/><rect x="13.5" y="4" width="7.5" height="16" rx="1.5"/>',
  // 齿轮（顶栏「设置」按钮）
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};
function icon(name, cls = 'ic') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* ── 配图路径：单一命名空间（报告 3.2 / ADR-0017 Round 16）─────────────
   全部配图统一走项目根 public/preview-images/ 与 public/explore/，
   不再从 webui/assets/ 走第二条路径。

   为什么：此前同一套 UI 混用两套图片来源 —— 艺术家 / 风格码 / 词库走
   webui/assets/（随前端代码入库），探索榜缩略图与官方榜配图走 ../public/
   （采集链生成物，多数不在版本库）。两套体系让「dist/ 拷走能不能用」
   这个问题没有确定答案。现在只有一套：**图都在 public/，代码都在 webui/。

   代价（明确承担）：dist/ 必须在项目根内使用，单独拷走会丢图。
   这不是缺陷而是事实 —— public/ 里 19,928 张图是采集链产物、本就不入库，
   任何「拷走即用」方案都得先把这批图纳入版本库或随包分发。
   ADR-0017 Round 4 裁决的「webui/assets/ 维持入库」至此被本条取代。

   相对路径前缀：webui/ 与 dist/ 同构，都位于项目根下一层，故同为 ../public/。 */
const PREVIEW_ROOT = '../public/preview-images/';
const EXPLORE_ROOT = '../public/explore/';

/** 词库预览图路径（缩略图，460×258）。
 *  it.preview 存的是 <分类>/<文件名>（相对 public/preview-images/）；
 *  实际指向 public/preview-images/thumbs/<分类>/ —— 缩略图在 thumbs/ 下，
 *  大图（1456×816）在 public/preview-images/<分类>/ 下，两者用途不同：
 *  卡片与画廊网格用缩略图（CSS 渲染宽度约 300 px），大图留给放大查看。 */
function vocabPreviewPath(it) {
  return PREVIEW_ROOT + 'thumbs/' + it.preview;
}

/** 艺术家 / 风格码预览图路径（320×320）。
 *
 *  数据层存的是 config/styles.yaml 的规范值 midlibrary/<id>.webp —— 那是
 *  「全量 8,960 张采集物」的路径，该目录是生成物、不入库。
 *  前端真正引用的是其中 448 张，它们另存于 public/preview-images/tracked/（入库），
 *  这样 git clone 后不跑 sync:style-images 也有图。
 *  映射只在这一处做：数据层保持与源一致，路径差异由渲染层收敛。 */
function midlibraryPreviewPath(preview) {
  return PREVIEW_ROOT + 'tracked/' + String(preview).replace(/^midlibrary\//, '');
}

/* ── 主题 ───────────────────────────────────────────────────────────── */
function initTheme() {
  // 偏好优先：新键 → 旧 Vue SPA 的 theme 键 → HTML 上的 data-theme（默认 dark）
  // 旧键只读不删，回退到旧前端时偏好仍在（ADR-0017）
  let t = null;
  try { t = localStorage.getItem(THEME_KEY) || localStorage.getItem('theme'); } catch { t = null; }
  if (t !== 'light' && t !== 'dark') t = null;
  if (!t) t = document.documentElement.dataset.theme || 'dark';
  document.documentElement.dataset.theme = t;
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* 忽略 */ }
  document.dispatchEvent(new CustomEvent('themechange'));
}

/* ── toast ──────────────────────────────────────────────────────────── */
let toastHost = null;
function toast(message, iconName = 'check') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    toastHost.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 220ms, transform 220ms';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 240);
  }, 1900);
}

async function copyText(text, label = '已复制') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
    return true;
  } catch {
    // 剪贴板被拒时退回 execCommand（file:// 与非安全上下文下仍可用）
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    toast(ok ? label : '复制失败，请手动选中复制', ok ? 'check' : 'close');
    return ok;
  }
}

/* ── 会话状态 ───────────────────────────────────────────────────────── */
/* 摄影前缀的基词（ADR-0027）：会话级可配置，留空则不带开头段。
   默认值与 shared/utils/promptBuilder.ts 的镜像实现保持一致。 */
const DEFAULT_PHOTO_PREFIX = 'photography';

/* 前缀候选（仅输入建议，不写会话、不改默认值）。
   入选判据来自拼装契约：必须能独立成段，且能接 "by <艺术家>"。
   故排除程度词（photorealistic / ultra-detailed）、裸 cinematic（会与词库
   cinematic lighting 叠成双写）、复合摄影词（与机位槽的高speed photography 等同族）。
   zh 只用于下拉里的中文对照与中文检索，绝不写进提示词 —— 写值一律用 value。 */
const PHOTO_PREFIX_OPTIONS = [
  { value: 'photography', zh: '摄影' },
  { value: 'cinematic still', zh: '电影静帧' },
  { value: 'illustration', zh: '插画' },
  { value: 'oil painting', zh: '油画' },
  { value: 'watercolor painting', zh: '水彩画' },
  { value: 'film still', zh: '电影剧照' },
  { value: 'concept art', zh: '概念艺术' },
];

/* 只要基词本身（候选值集合），用于「输入框的值是否已是候选之一」这类判定。 */
const PHOTO_PREFIX_VALUES = PHOTO_PREFIX_OPTIONS.map(o => o.value);

const SLOTS = [
  { key: 'artist', label: '艺术家', dot: 'artist' },
  { key: 'camera', label: '机位', dot: '' },
  { key: 'lighting', label: '光线', dot: '' },
  { key: 'other', label: '其他', dot: '' },
];

const session = {
  selected: [],   // { id, zh, en, position, category, ts }
  subject: '',
  photoPrefix: DEFAULT_PHOTO_PREFIX, // 摄影前缀基词；空串表示不带开头段
  params: {},
  manual: null,   // 手动改写后的最终提示词；null 表示使用自动提示词
  editing: false,
  dockOpen: false, // 窄屏下「会话明细」折叠块是否展开
  paramOpen: false, // 「展开全部参数」折叠块是否展开（renderDock 全量重建后需回填）
  /* 手机宽度（≤560px）下最终提示词条默认折叠成一行摘要。
     为什么不落盘：这是「当下这一屏怎么放」的临时取舍，不是用户的偏好；
     换台设备/换个宽度都要重新判断，存进会话只会让恢复后的状态更难解释。 */
  finalOpen: false,
};

/* 窄屏（≤980px）会话明细收进折叠块，宽屏直接铺开 */
const dockWideMq = window.matchMedia('(min-width: 981px)');
session.dockOpen = dockWideMq.matches;
dockWideMq.addEventListener('change', (e) => {
  session.dockOpen = e.matches;
  renderDock();
});

const bus = new EventTarget();
const onChange = (fn) => bus.addEventListener('change', fn);
function emitChange() { bus.dispatchEvent(new Event('change')); }

function defaultParams() {
  const values = {};
  for (const p of PARAMETERS) values[p.id] = p.default;
  values.version = String(PARAMETERS.find(p => p.id === 'version')?.default ?? '8.2');
  return values;
}

/* 旧 Vue SPA 的会话键：mj-session-v1（SessionSnapshot）；更旧的 mj-parameter-values 只存参数。
   只在新键缺失时迁移，且绝不删除旧键——旧前端仍可回退使用（ADR-0017）。 */
const LEGACY_SESSION_KEY = 'mj-session-v1';
const LEGACY_PARAMETER_KEY = 'mj-parameter-values';

function readLegacySession() {
  try {
    const raw = localStorage.getItem(LEGACY_SESSION_KEY) || localStorage.getItem(LEGACY_PARAMETER_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    const v1 = Array.isArray(s.selectedPrompts) ? s.selectedPrompts : [];
    // v1 的 SelectedPrompt 只有 promptId / text / timestamp / positionTag / categoryId；
    // 新 Dock 需要 id / zh / en / position / category / ts，缺中文名时用英文文本顶上。
    const selected = v1.map((p, i) => ({
      id: String(p.promptId ?? p.id ?? i),
      zh: String(p.text ?? p.prompt_en ?? ''),
      en: String(p.text ?? p.prompt_en ?? ''),
      position: ['artist', 'camera', 'lighting', 'other'].includes(p.positionTag) ? p.positionTag : 'other',
      category: String(p.categoryId ?? ''),
      ts: Number(p.timestamp) || Date.now() + i,
    }));
    const manual = s.isFinalPromptManuallyEdited && typeof s.finalPromptEdited === 'string' && s.finalPromptEdited
      ? s.finalPromptEdited : null;
    return {
      selected,
      subject: typeof s.subjectEnvironment === 'string' ? s.subjectEnvironment : '',
      manual,
      params: (s.parameterValues && typeof s.parameterValues === 'object') ? s.parameterValues : {},
    };
  } catch { return null; }
}

function loadSession() {
  session.photoPrefix = DEFAULT_PHOTO_PREFIX; // 迁移 / 损坏数据一律回落默认值
  let raw = null;
  try { raw = localStorage.getItem(SESSION_KEY); } catch { raw = null; }
  if (!raw) {
    const legacy = readLegacySession();
    if (legacy) {
      session.selected = legacy.selected;
      session.subject = legacy.subject;
      session.manual = legacy.manual;
      session.params = { ...defaultParams(), ...legacy.params };
      session.params.version = String(session.params.version || '8.2');
      sanitizeParams();
      saveSession();
      return;
    }
    session.params = defaultParams();
    return;
  }
  try {
    const s = JSON.parse(raw);
    session.selected = Array.isArray(s.selected) ? s.selected : [];
    session.subject = typeof s.subject === 'string' ? s.subject : '';
    session.photoPrefix = typeof s.photoPrefix === 'string' ? s.photoPrefix : DEFAULT_PHOTO_PREFIX;
    session.manual = typeof s.manual === 'string' ? s.manual : null;
    session.params = { ...defaultParams(), ...(s.params || {}) };
    session.params.version = String(session.params.version || '8.2');
    sanitizeParams();
  } catch {
    session.params = defaultParams();
  }
}

function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      selected: session.selected,
      subject: session.subject,
      photoPrefix: session.photoPrefix,
      manual: session.manual,
      params: session.params,
    }));
  } catch { /* 存储不可用时忽略 */ }
}

/* ── 参数与模型版本的兼容（镜像 shared/utils/parameterCompat.ts） ─────── */
const currentVersion = () => String(session.params.version || '8.2');

function isSupportedByVersion(param, version) {
  if (!param.versions || !param.versions.length) return true;
  if (!version) return true;
  return param.versions.includes(version);
}
function effectiveOptions(param, version) {
  if (param.type !== 'select') return [];
  if (version && param.optionsByVersion && param.optionsByVersion[version]) return param.optionsByVersion[version];
  return param.options || [];
}
function effectiveDefault(param, version) {
  if (param.type === 'select' && version && param.defaultByVersion && param.defaultByVersion[version] !== undefined) {
    return param.defaultByVersion[version];
  }
  return param.default;
}
function effectiveRange(param, version) {
  if (param.type !== 'slider') return { min: 0, max: 100, step: 1 };
  const o = version && param.rangeByVersion ? param.rangeByVersion[version] : undefined;
  if (o) return { min: o.min, max: o.max, step: o.step ?? param.step };
  return { min: param.min, max: param.max, step: param.step };
}
function sanitizeParams() {
  const v = currentVersion();
  for (const p of PARAMETERS) {
    if (!isSupportedByVersion(p, v)) { session.params[p.id] = effectiveDefault(p, v); continue; }
    if (p.type === 'select') {
      const opts = effectiveOptions(p, v);
      const cur = String(session.params[p.id] ?? '');
      if (!opts.some(o => o.value === cur)) session.params[p.id] = effectiveDefault(p, v);
    } else if (p.type === 'slider') {
      const r = effectiveRange(p, v);
      const cur = Number(session.params[p.id]);
      if (Number.isNaN(cur)) session.params[p.id] = effectiveDefault(p, v);
      else if (cur < r.min || cur > r.max) session.params[p.id] = Math.min(Math.max(cur, r.min), r.max);
    } else if (session.params[p.id] === undefined) {
      session.params[p.id] = effectiveDefault(p, v);
    }
  }
}

/* ── 最终提示词拼装（镜像 shared/utils/promptBuilder.ts） ─────────────── */
function emitParameter(param) {
  const version = currentVersion();
  if (!isSupportedByVersion(param, version)) return null;
  const raw = session.params[param.id];
  if (raw === undefined || raw === null) return null;
  const isDefault = String(raw) === String(param.default);

  if (param.type === 'checkbox') return raw === true ? param.param : null;

  if (param.type === 'select') {
    const value = String(raw);
    const opts = effectiveOptions(param, version);
    const option = opts.find(o => o.value === value);
    const flag = option?.param || param.param;
    if (param.flagFromValue) {
      if (isDefault && !param.alwaysEmit) return null;
      return `--${value}`;
    }
    if (value === '' && !param.alwaysEmit) return null;
    if (option?.flagOnly || param.flagOnly) return flag || null;
    const outValue = option?.paramValue ?? value;
    if (outValue === '' || !flag) return null;
    if (isDefault && !param.alwaysEmit) return null;
    return `${flag} ${outValue}`;
  }

  if (param.type === 'slider') {
    const value = Number(raw);
    if (Number.isNaN(value)) return null;
    if (isDefault && !param.alwaysEmit) return null;
    return `${param.param} ${value}`;
  }

  const value = String(raw).trim();
  if (!value) return null;
  if (isDefault && !param.alwaysEmit) return null;
  return `${param.param} ${value}`;
}

function paramTail() {
  const out = [];
  for (const p of PARAMETERS) {
    const s = emitParameter(p);
    if (s) out.push(s);
  }
  return out.join(' ');
}

/** 摄影前缀（ADR-0027）：基词取自会话配置，留空时整段消失。
    有艺术家时拼 `<基词> by <名字>`；基词留空则只留艺术家名。 */
function photographyPrefix(artists) {
  const base = String(session.photoPrefix ?? DEFAULT_PHOTO_PREFIX).trim();
  if (!base) return artists.length ? artists.join(', ') : '';
  return artists.length ? `${base} by ${artists.join(', ')}` : base;
}

function buildAutoPrompt() {
  const bySlot = { artist: [], camera: [], lighting: [], other: [] };
  [...session.selected].sort((a, b) => a.ts - b.ts).forEach(s => {
    (bySlot[s.position] || bySlot.other).push(s);
  });
  const artists = bySlot.artist.map(a => a.en);
  const parts = [photographyPrefix(artists)];
  if (bySlot.camera.length) parts.push(bySlot.camera.map(a => a.en).join(', '));
  const subject = session.subject.trim();
  if (subject) parts.push(subject);
  if (bySlot.lighting.length) parts.push(bySlot.lighting.map(a => a.en).join(', '));
  if (bySlot.other.length) parts.push(bySlot.other.map(a => a.en).join(', '));
  const text = parts.filter(Boolean).join(', ');
  const tail = paramTail();
  return tail ? `${text} ${tail}` : text;
}

const finalPrompt = () => (session.manual !== null ? session.manual : buildAutoPrompt());

/* 参数摘要：只列出真正会写进提示词的参数 */
function activeParamChips() {
  const version = currentVersion();
  const chips = [];
  for (const p of PARAMETERS) {
    if (!isSupportedByVersion(p, version)) continue;
    const s = emitParameter(p);
    if (s) chips.push({ id: p.id, text: s, name: p.name });
  }
  return chips;
}

/* ── 选择操作 ───────────────────────────────────────────────────────── */
function isSelected(id) { return session.selected.some(s => s.id === id); }

function togglePrompt(item) {
  // 艺术家为单选（同域约束：建议单选，多选会导致风格冲突）
  if (item.position === 'artist') {
    const had = session.selected.find(s => s.id === item.id);
    session.selected = had
      ? session.selected.filter(s => s.id !== item.id)
      : [...session.selected.filter(s => s.position !== 'artist'), { ...item, ts: Date.now() }];
  } else {
    const had = session.selected.find(s => s.id === item.id);
    session.selected = had
      ? session.selected.filter(s => s.id !== item.id)
      : [...session.selected, { ...item, ts: Date.now() }];
  }
  session.manual = null;
  saveSession();
  emitChange();
}

function removePrompt(id) {
  session.selected = session.selected.filter(s => s.id !== id);
  session.manual = null;
  saveSession();
  emitChange();
}

function movePrompt(id, dir) {
  const idx = session.selected.findIndex(s => s.id === id);
  const to = idx + dir;
  if (idx < 0 || to < 0 || to >= session.selected.length) return;
  const list = [...session.selected];
  [list[idx], list[to]] = [list[to], list[idx]];
  session.selected = list;
  saveSession();
  emitChange();
}

function clearAll() {
  session.selected = [];
  session.subject = '';
  session.photoPrefix = DEFAULT_PHOTO_PREFIX;
  session.manual = null;
  session.params = defaultParams();
  saveSession();
  emitChange();
}

/* ── 顶栏 ───────────────────────────────────────────────────────────── */
const NAV = [
  { href: 'index.html', label: '工作台' },
  // ADR-0033：艺术家 / 摄影师从工作台二级页签升为顶栏一级独立页，紧跟工作台。
  { href: 'artists.html', label: '艺术家库' },
  // ADR-0034：研究样本库 / 风格榜从工作台一级视图升为顶栏独立页，排在艺术家库后。
  { href: 'samples.html', label: '样本库' },
  { href: 'styles-top.html', label: '风格榜' },
  { href: 'gallery.html', label: '画廊' },
  { href: 'style-library.html', label: '风格库' },
  { href: 'style-types.html', label: '风格与类型库' },
];

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function renderTopbar(active) {
  const host = document.getElementById('appbar');
  if (!host) return;
  host.className = 'appbar';
  host.innerHTML = `
    <a class="skip-link" href="#page">跳到主内容</a>
    <div class="brand">
      <span class="brand-mark">MJ Prompt Generator</span>
      <span class="brand-sub">Midjourney 提示词组装台</span>
    </div>
    <nav class="mainnav" aria-label="主导航">
      ${NAV.map(n => `<a href="${n.href}"${n.href === active ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}
    </nav>
    <div class="appbar-right">
      <button class="search-trigger" type="button" data-role="open-palette" aria-label="搜索词库、艺术家与风格码">
        ${icon('search')}<span>搜索词库 / 艺术家 / 风格码</span><span class="kbd">${isMac() ? '⌘K' : 'Ctrl K'}</span>
      </button>
      <button class="icon-btn" type="button" data-role="toggle-theme" aria-label="切换明暗主题" aria-pressed="${document.documentElement.dataset.theme === 'light'}">
        ${icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')}
      </button>
      <button class="icon-btn" type="button" data-role="open-settings" aria-label="设置 LLM 代理凭据">${icon('gear')}</button>
    </div>`;
  host.querySelector('[data-role="toggle-theme"]').addEventListener('click', () => {
    toggleTheme();
    renderTopbar(active);
  });
  host.querySelector('[data-role="open-palette"]').addEventListener('click', openPalette);
  host.querySelector('[data-role="open-settings"]').addEventListener('click', openSettingsDialog);
}

/* ── 会话 Dock ──────────────────────────────────────────────────────── */
function slotGroupsHtml() {
  if (!session.selected.length) {
    return `<p class="slot-empty" style="padding:2px 0">还没选词。右侧点标签即可加入，顺序就是它们在最终提示词里的位置。</p>`;
  }
  return SLOTS.filter(slot => session.selected.some(s => s.position === slot.key)).map(slot => {
    const items = session.selected.filter(s => s.position === slot.key);
    const rows = items.map((s, i) => `
        <div class="slot-item" data-od-id="selected-${esc(s.id)}">
          <span class="txt">
            <span class="zh">${esc(s.zh)}</span>
            <span class="en">${esc(s.en)}</span>
          </span>
          <span class="slot-tools">
            <button class="mini-btn" type="button" data-move="${esc(s.id)}|-1" aria-label="上移"${i === 0 ? ' disabled' : ''}>${icon('up')}</button>
            <button class="mini-btn" type="button" data-move="${esc(s.id)}|1" aria-label="下移"${i === items.length - 1 ? ' disabled' : ''}>${icon('down')}</button>
            <button class="mini-btn danger" type="button" data-remove="${esc(s.id)}" aria-label="移除">${icon('trash')}</button>
          </span>
        </div>`).join('');
    return `
      <div class="slot-group">
        <div class="slot-head"><span class="slot-dot ${slot.dot}"></span>${slot.label}<span class="n">${items.length}</span></div>
        ${rows}
      </div>`;
  }).join('');
}

function paramControlHtml(p) {
  const v = currentVersion();
  const supported = isSupportedByVersion(p, v);
  const val = session.params[p.id];
  // 每个控件都要有可读名称：视觉上的标题是 span，读屏得靠 aria-label
  const label = `${p.name}${p.param ? `（${p.param}）` : ''}`;
  let control = '';
  if (p.type === 'select') {
    const opts = effectiveOptions(p, v);
    control = `<select class="select" id="p-${esc(p.id)}" name="${esc(p.id)}" data-param="${esc(p.id)}" aria-label="${esc(label)}"${supported ? '' : ' disabled'}>
      ${opts.map(o => `<option value="${esc(o.value)}"${String(val) === String(o.value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>`;
  } else if (p.type === 'slider') {
    const r = effectiveRange(p, v);
    control = `<input class="slider" type="range" id="p-${esc(p.id)}" name="${esc(p.id)}" data-param="${esc(p.id)}" aria-label="${esc(label)}" min="${r.min}" max="${r.max}" step="${r.step}" value="${esc(val)}"${supported ? '' : ' disabled'}>
      <div class="slider-scale"><span>${r.min}</span><span>${r.max}</span></div>`;
  } else if (p.type === 'checkbox') {
    control = `<div class="check-row"><input type="checkbox" id="p-${esc(p.id)}" name="${esc(p.id)}" data-param="${esc(p.id)}"${val ? ' checked' : ''}${supported ? '' : ' disabled'}><label for="p-${esc(p.id)}">${esc(p.label || p.name)}</label></div>`;
  } else {
    control = `<input class="text-input" type="text" id="p-${esc(p.id)}" name="${esc(p.id)}" data-param="${esc(p.id)}" aria-label="${esc(label)}" value="${esc(val ?? '')}" placeholder="${esc(p.placeholder || '')}"${supported ? '' : ' disabled'}>`;
  }
  const shown = p.type === 'checkbox' ? (val ? '开启' : '关闭') : String(val ?? '');
  return `
    <div class="param${supported ? '' : ' unavailable'}" data-od-id="param-${esc(p.id)}">
      <div class="param-top">
        <span class="param-name">${esc(p.name)}</span>
        <span class="param-flag">${esc(p.param || '—')}</span>
        ${supported ? '' : `<span class="param-badge">当前版本不可用</span>`}
        ${p.type === 'slider' || p.type === 'select' ? `<span class="param-val">${esc(shown)}</span>` : ''}
      </div>
      ${control}
      ${p.description ? `<p class="param-desc" id="desc-${esc(p.id)}">${esc(p.description)}</p>` : ''}
    </div>`;
}

function finalBarHtml() {
  const auto = buildAutoPrompt();
  const text = session.manual !== null ? session.manual : auto;
  const tail = paramTail();
  let body = text ? esc(text) : '<span class="final-empty">先在右侧选词，或写一句主体与环境</span>';
  if (text && tail) {
    const re = new RegExp(esc(tail).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    body = body.replace(re, '<span class="param-tail">$&</span>');
  }
  const chips = activeParamChips();
  const editing = session.editing;
  /* 手机宽度下默认折叠成一行摘要。理由（实测）：166px 的固定底条在 390×844 上
     占 19.7% 视口，且一级视图那 6 个按钮整片落在条带里，首屏点不到。
     折叠后高度约 50px，把底部还给内容。编辑态强制展开 —— 否则点了「改写」
     却看不见输入框。 */
  const open = session.finalOpen || editing;
  return `
    <div class="final-bar${open ? ' is-open' : ''}" id="final-bar" data-od-id="final-prompt">
      <div class="final-label">
        <span>最终提示词</span>
        <span class="meta" aria-live="polite">${text.length} 字符${session.manual !== null ? ' · 已手动改写' : ''}</span>
      </div>
      ${editing ? `
        <textarea class="textarea" id="manual-editor" aria-label="手动改写最终提示词" style="min-height:96px;font-family:var(--font-mono);font-size:12.5px">${esc(session.manual ?? auto)}</textarea>
        <div class="btn-row">
          <button class="btn btn-primary" type="button" data-role="manual-save">${icon('check')}保存改写</button>
          <button class="btn btn-secondary" type="button" data-role="manual-cancel">取消</button>
        </div>`
      : `
        <div class="final-text" id="final-text" tabindex="0" role="group" aria-label="最终提示词内容">${body}${text ? '<span class="cursor"></span>' : ''}</div>
        ${session.manual !== null ? `<div class="manual-note">${icon('pencil')}<span>已手动改写，自动提示词仍在后台计算</span></div>` : ''}
        <div class="btn-row">
          <button class="btn btn-primary" type="button" data-role="copy"${text ? '' : ' disabled'}>${icon('copy')}复制提示词</button>
          ${session.manual !== null
            ? `<button class="btn btn-secondary" type="button" data-role="manual-reset">${icon('reset')}回到自动</button>`
            : `<button class="btn btn-secondary" type="button" data-role="manual-edit"${text ? '' : ' disabled'}>${icon('pencil')}改写</button>`}
          <button class="btn btn-ghost" type="button" data-role="clear" aria-label="清空会话"${session.selected.length || session.subject || session.photoPrefix !== DEFAULT_PHOTO_PREFIX ? '' : ' disabled'}>${icon('trash')}</button>
          <button class="btn btn-secondary final-toggle" type="button" data-role="final-toggle"
            aria-expanded="${open ? 'true' : 'false'}" aria-controls="final-text">${open ? '收起' : '展开'}</button>
        </div>`}
    </div>`;
}

function renderDock() {
  const host = document.getElementById('dock');
  if (!host) return;
  const chips = activeParamChips();
  const unsupported = PARAMETERS.filter(p => !isSupportedByVersion(p, currentVersion()));

  const detail = `
      <section class="dock-section" data-od-id="dock-selected">
        <div class="dock-head"><span class="dock-title">已选提示词</span><span class="dock-count">${session.selected.length} 条</span></div>
        ${slotGroupsHtml()}
      </section>

      <section class="dock-section" data-od-id="dock-params">
        <div class="dock-head"><span class="dock-title">参数</span><span class="dock-count">${chips.length} 项生效</span></div>
        <div class="param-summary">
          ${chips.map(c => `<span class="param-chip">${esc(c.text)}</span>`).join('') || '<span class="param-chip off">无</span>'}
        </div>
        ${unsupported.length ? `<p class="dock-hint">${unsupported.length} 个参数在 ${esc(currentVersion())} 下不可用，已自动隐藏</p>` : ''}
        <details id="param-details"${session.paramOpen ? ' open' : ''}>
          <summary class="btn btn-secondary">${icon('sliders')}<span>展开全部参数</span></summary>
          <div class="param-list" style="margin-top:12px">${PARAMETERS.map(paramControlHtml).join('')}</div>
        </details>
      </section>`;

  // 宽屏直接铺开；窄屏收进折叠块，保证 DOM 顺序与视觉顺序一致
  const detailBlock = dockWideMq.matches ? detail : `
      <details class="dock-disclosure" id="dock-disclosure"${session.dockOpen ? ' open' : ''}>
        <summary>会话明细<span class="n">已选 ${session.selected.length} 条 · 参数 ${chips.length} 项</span></summary>
        <div class="dock-disclosure-body">${detail}</div>
      </details>`;

  host.innerHTML = `
    <div class="dock-scroll">
      <section class="dock-section" data-od-id="dock-subject">
        <div class="dock-head"><span class="dock-title">主体与环境</span><span class="dock-count" id="subject-count" aria-hidden="true">${session.subject.length}</span></div>
        <textarea class="textarea" id="subject-input" aria-label="主体与环境描述" placeholder="例如：a woman with long hair, in a beautiful garden with blooming flowers">${esc(session.subject)}</textarea>
        <div class="example-row" role="group" aria-label="主体与环境示例">
          ${SUBJECT_EXAMPLES.map(ex => `<button class="chip${session.subject === ex.fullText ? ' on' : ''}" type="button" data-example="${esc(ex.id)}" aria-pressed="${session.subject === ex.fullText}">${esc(ex.title)}</button>`).join('')}
        </div>
        <div class="prefix-field" data-od-id="dock-prefix">
          <label class="prefix-label" for="prefix-input">摄影前缀</label>
          <input class="text-input" id="prefix-input" type="text"
            value="${esc(session.photoPrefix)}" placeholder="留空则不带开头段"
            autocomplete="off" spellcheck="false"
            role="combobox" aria-expanded="false" aria-controls="prefix-listbox"
            aria-autocomplete="list" aria-haspopup="listbox"
            aria-label="摄影前缀基词，留空则不带开头段">
          <p class="dock-hint">默认 photography；有艺术家时拼成「前缀 by 艺术家」。点输入框可选常用媒介（按中文对照，输入英文或中文都能筛），留空则整段消失，适合把审美交给 --sref。</p>
        </div>
      </section>
      ${detailBlock}
    </div>
    ${finalBarHtml()}`;
  wireDock();
}

/* ── 摄影前缀下拉（自定义 combobox）──────────────────────────────────
   原生 <datalist> 无法「点一下就展开」（浏览器不给打开弹层的 API），所以自绘一层。
   listbox 挂在 body 下 + position: fixed：.dock-scroll 有 overflow-y: auto，
   放在 .prefix-field 内部用 absolute 会被裁切。
   开合状态与高亮索引都是纯 UI 瞬时量，不进会话、不落盘。 */

const PREFIX_LISTBOX_ID = 'prefix-listbox';
const prefixCombo = { open: false, active: -1, items: [], input: null };
let prefixComboGlobalWired = false;

/* listbox 单例：不放在 #dock 内，Dock 重绘不会销毁它。 */
function prefixListboxEl() {
  let box = document.getElementById(PREFIX_LISTBOX_ID);
  if (box) return box;
  box = document.createElement('ul');
  box.id = PREFIX_LISTBOX_ID;
  box.className = 'prefix-listbox';
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', '常用摄影前缀');
  box.hidden = true;
  document.body.appendChild(box);
  return box;
}

/* 过滤同时认英文基词与中文对照：输 "oil" 或 "油画" 都能命中 oil painting。
   中文只参与检索，不会成为写入值。 */
function matchPrefixOptions(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return PHOTO_PREFIX_OPTIONS.slice();
  return PHOTO_PREFIX_OPTIONS.filter(o =>
    o.value.toLowerCase().includes(s) || o.zh.includes(s));
}

/* q 为过滤词；highlight 为要高亮的项（默认与 q 相同）。
   两者分开：点开时当前值只是「选中项」而不是搜索词，不能拿它过滤掉其它候选。 */
function renderPrefixOptions(q, highlight) {
  const box = prefixListboxEl();
  const opts = matchPrefixOptions(q);
  const cur = String(highlight ?? q ?? '').trim();
  // items 保持「基词数组」：键盘上下键与 Enter 都直接拿它取写入值
  prefixCombo.items = opts.map(o => o.value);
  prefixCombo.active = prefixCombo.items.indexOf(cur);   // 与某项全等时默认高亮它
  if (!opts.length) {
    box.innerHTML = `<li class="prefix-opt-empty">无匹配，回车即用当前输入「${esc(cur)}」</li>`;
    return;
  }
  // 英文基词是写入值，中文只做对照；data-value 仍只放基词
  box.innerHTML = opts.map((o, i) =>
    `<li class="prefix-opt" role="option" id="prefix-opt-${i}" data-value="${esc(o.value)}" aria-selected="${i === prefixCombo.active}">` +
    `<span class="prefix-opt-en">${esc(o.value)}</span>` +
    `<span class="prefix-opt-zh">${esc(o.zh)}</span></li>`
  ).join('');
  syncPrefixActive();
}

function syncPrefixActive() {
  const box = prefixListboxEl();
  const opts = [...box.querySelectorAll('.prefix-opt')];
  opts.forEach((el, i) => el.setAttribute('aria-selected', String(i === prefixCombo.active)));
  const input = prefixCombo.input;
  if (input) {
    if (prefixCombo.active >= 0) input.setAttribute('aria-activedescendant', `prefix-opt-${prefixCombo.active}`);
    else input.removeAttribute('aria-activedescendant');
  }
  // 只在浮层内部滚动。用 scrollIntoView 会连带滚动 .dock-scroll，把输入框带跑。
  const on = opts[prefixCombo.active];
  if (!on) return;
  const br = box.getBoundingClientRect();
  const er = on.getBoundingClientRect();
  if (er.top < br.top) box.scrollTop -= (br.top - er.top);
  else if (er.bottom > br.bottom) box.scrollTop += (er.bottom - br.bottom);
}

function positionPrefixCombo() {
  const box = prefixListboxEl();
  const input = prefixCombo.input;
  if (!input) return;
  const r = input.getBoundingClientRect();
  const w = Math.max(Math.round(r.width), 180);
  box.style.width = `${w}px`;
  box.style.left = `${Math.round(Math.max(12, Math.min(r.left, window.innerWidth - w - 12)))}px`;
  const h = box.offsetHeight;
  let top = Math.round(r.bottom + 6);
  if (top + h > window.innerHeight - 12) top = Math.round(Math.max(12, r.top - h - 6));
  box.style.top = `${top}px`;
}

function openPrefixCombo() {
  const input = prefixCombo.input;
  if (!input) return;
  const box = prefixListboxEl();
  box.hidden = false;
  prefixCombo.open = true;
  input.setAttribute('aria-expanded', 'true');
  const v = String(input.value || '').trim();
  // 值恰好是候选之一 ⇒ 当作「已选中」而不是「正在搜索」，列全部 7 项并高亮它
  renderPrefixOptions(PHOTO_PREFIX_VALUES.includes(v) ? '' : v, v);
  positionPrefixCombo();
}

function closePrefixCombo() {
  const box = prefixListboxEl();
  box.hidden = true;
  prefixCombo.open = false;
  prefixCombo.active = -1;
  const input = prefixCombo.input;
  if (input) {
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
}

/* 选中一项：写值后派发 input 事件，复用「手输」那条存盘链路
   （saveSession + refreshFinalOnly），不新增第二个写入路径。 */
function pickPrefix(value) {
  const input = prefixCombo.input;
  if (!input) return;
  if (input.value !== value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  closePrefixCombo();
}

function wirePrefixCombo() {
  const input = document.getElementById('prefix-input');
  if (!input) return;
  // Dock 重绘会换节点：旧锚点失效，先把浮层关掉
  if (prefixCombo.open && prefixCombo.input && prefixCombo.input !== input) closePrefixCombo();
  prefixCombo.input = input;
  const box = prefixListboxEl();

  const show = () => { if (!prefixCombo.open) openPrefixCombo(); };
  input.addEventListener('focus', show);
  input.addEventListener('click', show);

  input.addEventListener('input', () => {
    // 存盘由 wireDock 里的监听负责，这里只管过滤
    if (!prefixCombo.open) return;
    renderPrefixOptions(input.value);
    positionPrefixCombo();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { closePrefixCombo(); return; }
    if (e.key === 'Escape') {
      if (!prefixCombo.open) return;
      e.preventDefault();
      closePrefixCombo();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!prefixCombo.open) openPrefixCombo();
      const n = prefixCombo.items.length;
      if (!n) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      prefixCombo.active = (prefixCombo.active + step + n) % n;
      syncPrefixActive();
      return;
    }
    if (e.key === 'Enter' && prefixCombo.open) {
      const v = prefixCombo.active >= 0 ? prefixCombo.items[prefixCombo.active] : null;
      if (v != null) { e.preventDefault(); pickPrefix(v); }
      else closePrefixCombo();
    }
  });

  box.addEventListener('pointerdown', (e) => e.preventDefault());   // 别让输入框先失焦
  box.addEventListener('click', (e) => {
    const li = e.target.closest('.prefix-opt');
    if (!li) return;
    pickPrefix(li.dataset.value);
    input.focus({ preventScroll: true });
  });

  if (!prefixComboGlobalWired) {
    prefixComboGlobalWired = true;
    // 滚动（含 .dock-scroll 内部）/ 尺寸变化时跟着走；capture 才能收到内部滚动
    const follow = () => { if (prefixCombo.open) positionPrefixCombo(); };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    document.addEventListener('pointerdown', (e) => {
      if (!prefixCombo.open) return;
      const boxEl = prefixListboxEl();
      if (boxEl.contains(e.target) || e.target === prefixCombo.input) return;
      closePrefixCombo();
    }, true);
  }
}

function wireDock() {
  const dock = document.getElementById('dock');
  if (!dock) return;

  const disc = dock.querySelector('#dock-disclosure');
  if (disc) disc.addEventListener('toggle', () => { session.dockOpen = disc.open; });

  // renderDock() 会整体重建 #dock 的 innerHTML；<details> 的展开态必须显式保存并回填，
  // 否则任何参数 change / emitChange 触发重绘后「展开全部参数」都会弹回收起。
  const paramDetails = dock.querySelector('#param-details');
  if (paramDetails) paramDetails.addEventListener('toggle', () => { session.paramOpen = paramDetails.open; });

  const subjectInput = dock.querySelector('#subject-input');
  if (subjectInput) {
    subjectInput.addEventListener('input', () => {
      session.subject = subjectInput.value;
      const c = dock.querySelector('#subject-count');
      if (c) c.textContent = String(subjectInput.value.length);
      saveSession();
      refreshFinalOnly();
    });
  }

  const prefixInput = dock.querySelector('#prefix-input');
  if (prefixInput) {
    // 与 #subject-input 同一策略：边输边存、只重绘最终提示词区，不重绘 Dock（避免失焦）。
    prefixInput.addEventListener('input', () => {
      session.photoPrefix = prefixInput.value;
      saveSession();
      refreshFinalOnly();
    });
    wirePrefixCombo();
  }

  dock.querySelectorAll('[data-example]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = SUBJECT_EXAMPLES.find(e => e.id === btn.dataset.example);
      if (!ex) return;
      session.subject = ex.fullText;
      session.manual = null;
      saveSession();
      renderDock();
    });
  });

  dock.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removePrompt(btn.dataset.remove));
  });
  dock.querySelectorAll('[data-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [id, dir] = btn.dataset.move.split('|');
      movePrompt(id, Number(dir));
    });
  });

  dock.querySelectorAll('[data-param]').forEach(input => {
    const id = input.dataset.param;
    const p = PARAMETERS.find(x => x.id === id);
    if (!p) return;
    const read = () => {
      if (p.type === 'checkbox') return input.checked;
      if (p.type === 'slider') return Number(input.value);
      return input.value;
    };
    const apply = (v) => {
      session.params[id] = v;
      if (id === 'version') {
        session.params.version = String(v);
        sanitizeParams();
      }
      session.manual = null;
      saveSession();
    };
    // 滑块与文本框边输边算，不重绘 Dock（重绘会打断拖拽与焦点）
    if (p.type === 'slider') {
      input.addEventListener('input', () => {
        apply(read());
        const label = input.closest('.param')?.querySelector('.param-val');
        if (label) label.textContent = String(input.value);
        refreshFinalOnly();
      });
    }
    if (p.type === 'input') {
      input.addEventListener('input', () => { apply(read()); refreshFinalOnly(); });
    }
    input.addEventListener('change', () => { apply(read()); renderDock(); });
  });

  wireFinalBar();
}

/* 最终提示词区的事件单独接线：只重绘这一块时不必重挂整个 Dock */
function wireFinalBar() {
  const bar = document.getElementById('final-bar');
  if (!bar) return;

  const copyBtn = bar.querySelector('[data-role="copy"]');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const ok = await copyText(finalPrompt(), '提示词已复制');
    if (ok) {
      bar.classList.add('flash');
      setTimeout(() => bar.classList.remove('flash'), 700);
    }
  });
  const editBtn = bar.querySelector('[data-role="manual-edit"]');
  if (editBtn) editBtn.addEventListener('click', () => {
    session.editing = true;
    renderDock();
    const ed = document.getElementById('manual-editor');
    if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
  });
  const saveBtn = bar.querySelector('[data-role="manual-save"]');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    const ed = document.getElementById('manual-editor');
    session.manual = ed ? ed.value : session.manual;
    session.editing = false;
    saveSession();
    renderDock();
    toast('已保存手动改写');
  });
  const cancelBtn = bar.querySelector('[data-role="manual-cancel"]');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    session.editing = false;
    renderDock();
  });
  const resetBtn = bar.querySelector('[data-role="manual-reset"]');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    session.manual = null;
    saveSession();
    renderDock();
    toast('已回到自动提示词');
  });
  const clearBtn = bar.querySelector('[data-role="clear"]');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (!session.selected.length && !session.subject && session.photoPrefix === DEFAULT_PHOTO_PREFIX) { toast('会话本来就是空的'); return; }
    clearAll();
    toast('会话已清空');
  });

  /* 折叠开关：只切 class 与文案，不重绘整块 —— 重绘会把正在看的滚动位置打回顶部。 */
  const toggleBtn = bar.querySelector('[data-role="final-toggle"]');
  if (toggleBtn) toggleBtn.addEventListener('click', () => {
    session.finalOpen = !session.finalOpen;
    bar.classList.toggle('is-open', session.finalOpen);
    toggleBtn.setAttribute('aria-expanded', String(session.finalOpen));
    toggleBtn.textContent = session.finalOpen ? '收起' : '展开';
  });
}

/* 只更新最终提示词区，不重绘整个 Dock（避免输入时失焦） */
function refreshFinalOnly() {
  const bar = document.getElementById('final-bar');
  if (!bar) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = finalBarHtml();
  bar.replaceWith(wrap.firstElementChild);
  wireFinalBar();
}

/* ── 全局搜索面板（⌘K） ────────────────────────────────────────────── */
let paletteIndex = null;
function ensurePaletteIndex() {
  if (paletteIndex) return paletteIndex;
  const vocab = [];
  for (const cat of VOCAB_CATEGORIES) {
    for (const g of cat.groups) for (const it of g.items) {
      vocab.push({ kind: '词条', id: it.id, zh: it.zh, en: it.en, position: cat.position, category: cat.name });
    }
  }
  paletteIndex = [
    ...vocab.map(v => ({ ...v, type: 'vocab' })),
    ...ARTISTS.map(a => ({ ...a, type: 'artist', zh: a.name, en: a.en })),
    ...STYLE_CODES.map(c => ({ ...c, type: 'code', zh: c.name, en: `--sref ${c.code}`, code: c.code })),
  ];
  return paletteIndex;
}

function openPalette() {
  const idx = ensurePaletteIndex();
  const { backdrop, close } = mountDialog(`
    <div class="sheet palette-sheet" data-od-id="search-palette">
      <div class="palette-head">
        <input class="text-input" id="palette-input" aria-label="搜索词条、艺术家与风格码"
          placeholder="搜索词条、艺术家、风格码…" autocomplete="off">
      </div>
      <div id="palette-results" class="palette-results"></div>
    </div>`, { label: '全局搜索' });

  const input = backdrop.querySelector('#palette-input');
  const results = backdrop.querySelector('#palette-results');

  const draw = (q) => {
    const query = q.trim().toLowerCase();
    const hits = (query ? idx.filter(i =>
      i.zh.toLowerCase().includes(query) || String(i.en || '').toLowerCase().includes(query)) : idx.slice(0, 40));
    const list = hits.slice(0, 60);
    results.innerHTML = list.length ? list.map(i => `
      <button class="palette-row" type="button" data-type="${i.type}" data-id="${esc(i.id)}"
        data-en="${esc(i.en || '')}" data-zh="${esc(i.zh || '')}"
        data-position="${esc(i.position || 'other')}" data-category="${esc(i.category || '')}">
        <span class="code-info">
          <span class="code-name">${esc(i.zh)}</span>
          <span class="code-sub mono">${esc(i.en || '')}</span>
        </span>
        <span class="param-badge">${i.type === 'vocab' ? '词条' : i.type === 'artist' ? '艺术家' : '风格码'}</span>
      </button>`).join('')
      : stateHtml({
          title: '没有匹配项',
          desc: '换个关键词试试，或者只输入艺术家名、风格码。',
          iconName: 'search',
          compact: true,
        });
  };
  draw('');
  input.addEventListener('input', () => draw(input.value));

  results.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    const type = btn.dataset.type;
    if (type === 'code') {
      copyText(btn.dataset.en, '风格参考已复制');
      close();
      return;
    }
    togglePrompt({
      id: btn.dataset.id,
      zh: btn.dataset.zh,
      en: btn.dataset.en,
      position: type === 'artist' ? 'artist' : (btn.dataset.position || 'other'),
      category: btn.dataset.category,
    });
    toast(type === 'artist' ? `已加入艺术家：${btn.dataset.zh}` : `已加入提示词：${btn.dataset.zh}`);
    close();
  });
  input.focus();
}

/* ── 弹层：对话框语义、焦点陷阱、焦点归还 ─────────────────────────── */
function mountDialog(html, { label, onMount, onClose } = {}) {
  const opener = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = html;
  document.body.appendChild(backdrop);

  const sheet = backdrop.querySelector('.sheet');
  if (sheet) {
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    if (label) sheet.setAttribute('aria-label', label);
  }

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const focusables = backdrop.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  const closeBtn = backdrop.querySelector('[data-role="close"]');
  if (closeBtn) closeBtn.addEventListener('click', close);

  if (onMount) onMount({ backdrop, sheet, close });
  return { backdrop, sheet, close };
}

/* ── LLM 代理设置：凭据只 POST 给本机服务写 .env（ADR-0015）───────────
   浏览器运行时不调 LLM、不把 key 存 localStorage；file:// 下 fetch 被
   CORS 硬拦（ADR-0017），降级为只读提示且绝不发起任何请求。 */
function openSettingsDialog() {
  const offline = location.protocol === 'file:';
  const endpoint = '/api/settings';

  const fields = [
    {
      key: 'baseUrl', label: 'Base URL', id: 'settings-base-url', type: 'text',
      value: 'https://api.minimax.cn/v1', placeholder: 'https://api.minimax.cn/v1',
      hint: 'LLM 代理服务地址，保存后写入本机 .env。',
    },
    {
      key: 'model', label: '模型', id: 'settings-model', type: 'text',
      value: 'MiniMax-M3.1-Flash', placeholder: 'MiniMax-M3.1-Flash',
      hint: '调用时使用的模型名。',
    },
    {
      key: 'apiKey', label: 'API Key', id: 'settings-api-key', type: 'password',
      value: '', placeholder: '留空表示不修改已有 API Key',
      hint: '密钥仅写入本机 .env，不会回填这里，也不会存进浏览器。',
    },
  ];

  const fieldHtml = (f) => `
    <div class="settings-field">
      <div class="settings-field-head">
        <label class="settings-label" for="${esc(f.id)}">${esc(f.label)}</label>
        <span class="settings-status" data-role="status-${esc(f.key)}">${esc('未配置')}</span>
      </div>
      <input class="text-input" id="${esc(f.id)}" data-role="settings-${esc(f.key)}"
        type="${esc(f.type)}" value="${esc(f.value)}" placeholder="${esc(f.placeholder)}"
        autocomplete="off" spellcheck="false">
      <p class="settings-hint">${esc(f.hint)}</p>
    </div>`;

  const offlineHtml = `
    <div class="settings-offline" data-role="settings-offline">
      <p>当前以 <code>file://</code> 方式打开，浏览器会拦截本机请求（CORS），因此无法读取或保存配置。</p>
      <p>请在项目根目录运行 <code>npm run dev</code> 启动本地服务，再通过 <code>http://127.0.0.1:5173/</code> 访问本页面。</p>
      <p>凭据只写入本机 <code>.env</code>：算力在构建期使用，浏览器运行时不会发起 LLM 请求，也不会把密钥存进浏览器。</p>
    </div>`;

  const onlineHtml = `
    <p class="settings-error" data-role="settings-error"></p>
    ${fields.map(fieldHtml).join('')}
    <p class="settings-hint">状态仅表示「是否已配置」，不会显示任何明文值。</p>`;

  const html = `
    <div class="sheet" data-od-id="settings-sheet" aria-label="LLM 代理设置">
      <div class="sheet-head">
        <div style="flex:1">
          <p class="eyebrow">LLM 代理</p>
          <h2>${esc(offline ? '设置（离线只读）' : 'LLM 代理设置')}</h2>
        </div>
        <button class="icon-btn" type="button" data-role="close" aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="sheet-body">
        ${offline ? offlineHtml : onlineHtml}
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-primary" type="button" data-role="settings-save"${offline ? ' disabled' : ''}>${icon('check')}保存</button>
          <button class="btn btn-secondary" type="button" data-role="settings-cancel">取消</button>
        </div>
      </div>
    </div>`;

  mountDialog(html, {
    label: 'LLM 代理设置',
    onMount: ({ backdrop, close }) => {
      backdrop.querySelector('[data-role="settings-cancel"]').addEventListener('click', close);
      setTimeout(() => {
        (backdrop.querySelector('[data-role="settings-baseUrl"]') ||
          backdrop.querySelector('[data-role="close"]'))?.focus();
      }, 30);

      // file:// 下绝不发起任何 fetch / GET，面板仅作只读说明
      if (offline) return;

      const errorEl = backdrop.querySelector('[data-role="settings-error"]');
      const showError = (msg) => { errorEl.textContent = msg; };
      const setStatus = (key, on) => {
        const el = backdrop.querySelector(`[data-role="status-${key}"]`);
        if (!el) return;
        el.textContent = on ? '已配置' : '未配置';
        el.classList.toggle('is-on', !!on);
      };

      // 打开面板时 GET 三个布尔（响应只有布尔，无任何明文）
      (async () => {
        try {
          const res = await fetch(endpoint, { method: 'GET' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const c = data.configured || {};
          setStatus('baseUrl', c.baseUrl);
          setStatus('model', c.model);
          setStatus('apiKey', c.apiKey);
        } catch (e) {
          showError('读取当前配置失败：' + ((e && e.message) || e));
        }
      })();

      const saveBtn = backdrop.querySelector('[data-role="settings-save"]');
      saveBtn.addEventListener('click', async () => {
        const body = {
          baseUrl: backdrop.querySelector('[data-role="settings-baseUrl"]').value.trim(),
          model: backdrop.querySelector('[data-role="settings-model"]').value.trim(),
          apiKey: backdrop.querySelector('[data-role="settings-apiKey"]').value,
        };
        saveBtn.disabled = true;
        errorEl.textContent = '';
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok) throw new Error(data.error || `保存失败（HTTP ${res.status}）`);
          toast('LLM 代理凭据已保存');
          close();
        } catch (e) {
          showError('保存失败：' + ((e && e.message) || e));
          saveBtn.disabled = false;
        }
      });
    },
  });
}

/* ── 共享片段：空状态 / 错误状态 ───────────────────────────────────── */
function stateHtml({ title, desc, iconName = 'search', action, danger, compact }) {
  return `
    <div class="state${danger ? ' state-danger' : ''}${compact ? ' state-compact' : ''}">
      <span class="state-mark">${icon(iconName)}</span>
      <span class="state-title">${esc(title)}</span>
      ${desc ? `<p class="state-desc">${esc(desc)}</p>` : ''}
      ${action ? `<button class="btn btn-secondary" type="button" data-role="state-action">${esc(action.label)}</button>` : ''}
    </div>`;
}

/* ── 图片加载 / 失败状态 ───────────────────────────────────────────── */
function markImageStates(root) {
  (root || document).querySelectorAll('img').forEach(img => {
    const holder = img.parentElement;
    if (!holder) return;
    holder.classList.remove('is-loading', 'is-failed');
    if (img.complete) {
      if (img.naturalWidth > 0) return;
      fallbackToPlate(holder);
      return;
    }
    holder.classList.add('is-loading');
    const done = () => {
      holder.classList.remove('is-loading');
      if (!img.naturalWidth) fallbackToPlate(holder);
      img.removeEventListener('load', done);
      img.removeEventListener('error', done);
    };
    img.addEventListener('load', done);
    img.addEventListener('error', done);
  });
}

/* 取不到图时落回排版版位：有名字就排名字，没有就标「图片不可用」 */
function fallbackToPlate(holder) {
  const name = holder.dataset.plateName;
  if (name) {
    holder.classList.remove('is-failed');
    holder.classList.add('is-plate');
    holder.innerHTML = `<span class="plate-name">${esc(name)}</span>`;
  } else {
    holder.classList.add('is-failed');
  }
}

/* ── 旧版 URL 契约兼容（ADR-0017 / ADR-0026 / ADR-0033 / ADR-0034） ──
   旧 Vue SPA 用 #/artists?... / #/explore?d/ar/sref/q，新版用 #artists / #explore；
   旧版另有三处页签：style-codes / gallery 是独立 HTML 页，
   styles-top / samples 现在是顶栏独立页（ADR-0034），
   artists 现在是顶栏独立页 artists.html（ADR-0033）。
   在 core.js 顶层执行：workbench.js 的 readHash() 晚于本文件加载，读到的已是新 hash。 */
function migrateLegacyHash() {
  const h = location.hash;
  if (!h.startsWith('#/')) return;
  const key = h.slice(2).split('?')[0].replace(/\/$/, '');
  const page = location.pathname.split('/').pop() || 'index.html';
  const isIndex = page === '' || page === 'index.html';

  /* ADR-0034：旧 #/styles-top、#/explore、#/samples 直接落到顶栏独立页，
     query 原样带过去（筛选状态、job 深链都不丢）。不再先跳 index.html 再由
     工作台转发 —— 少一跳，也避免旧一级视图的 DOM 被渲染出来一瞬。 */
  const standalone = {
    'styles-top': 'styles-top.html',
    explore: 'samples.html',
    samples: 'samples.html',
  };
  if (standalone[key]) {
    const qi = h.indexOf('?');
    const inner = key === 'explore' ? 'samples' : key;
    location.replace(`${standalone[key]}#${inner}${qi === -1 ? '' : h.slice(qi)}`);
    return;
  }

  const pages = { 'style-codes': 'style-library.html', gallery: 'gallery.html' };
  if (pages[key]) {
    if (page === pages[key]) {
      try { history.replaceState(null, '', '#'); } catch { location.hash = ''; }
    } else {
      location.replace(pages[key]);
    }
    return;
  }

  // ADR-0033：旧 #/artists 直接落到独立页，query 原样带过去；
  // 不再先跳 index.html#artists 再由工作台转发（少一跳，也避免首屏误判）。
  if (key === 'artists') {
    const qi = h.indexOf('?');
    location.replace(`artists.html#artists${qi === -1 ? '' : h.slice(qi)}`);
    return;
  }

  const tabs = (typeof VOCAB_CATEGORIES === 'undefined' ? [] : VOCAB_CATEGORIES.map(c => c.id))
    .concat('explore');
  const next = tabs.includes(key) ? key : (tabs[0] || 'library');
  if (!isIndex) { location.replace('index.html#' + next); return; }
  try { history.replaceState(null, '', '#' + next); } catch { location.hash = '#' + next; }
}
migrateLegacyHash();

/* ── 页面启动 ───────────────────────────────────────────────────────── */
function boot(active) {
  initTheme();
  renderTopbar(active);

  // 数据模块没加载成功时不要白屏：给一个能看懂的错误态与重试
  if (typeof PARAMETERS === 'undefined' || typeof VOCAB_CATEGORIES === 'undefined') {
    const page = document.getElementById('page');
    if (page) {
      page.innerHTML = `<div class="library-body">${stateHtml({
        title: '界面没能装起来',
        desc: '数据模块没有加载成功。确认 js/ 目录完整（data-vocab.js、data-parameters.js 等），然后重新加载。',
        iconName: 'close',
        danger: true,
        action: { label: '重新加载' },
      })}</div>`;
      const btn = page.querySelector('[data-role="state-action"]');
      if (btn) btn.addEventListener('click', () => location.reload());
    }
    return;
  }

  loadSession();
  renderDock();
  onChange(() => renderDock());
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    }
  });
}
