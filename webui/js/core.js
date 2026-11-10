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
};
function icon(name, cls = 'ic') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

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
const SLOTS = [
  { key: 'artist', label: '艺术家', dot: 'artist' },
  { key: 'camera', label: '机位', dot: '' },
  { key: 'lighting', label: '光线', dot: '' },
  { key: 'other', label: '其他', dot: '' },
];

const session = {
  selected: [],   // { id, zh, en, position, category, ts }
  subject: '',
  params: {},
  manual: null,   // 手动改写后的最终提示词；null 表示使用自动提示词
  editing: false,
  dockOpen: false, // 窄屏下「会话明细」折叠块是否展开
  paramOpen: false, // 「展开全部参数」折叠块是否展开（renderDock 全量重建后需回填）
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
      manual: session.manual,
      params: session.params,
    }));
  } catch { /* 存储不可用时忽略 */ }
}

/* ── 参数与模型版本的兼容（镜像 src/utils/parameterCompat.ts） ─────── */
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

/* ── 最终提示词拼装（镜像 src/utils/promptBuilder.ts） ─────────────── */
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

function buildAutoPrompt() {
  const bySlot = { artist: [], camera: [], lighting: [], other: [] };
  [...session.selected].sort((a, b) => a.ts - b.ts).forEach(s => {
    (bySlot[s.position] || bySlot.other).push(s);
  });
  const artists = bySlot.artist.map(a => a.en);
  const parts = [artists.length ? `photography by ${artists.join(', ')}` : 'photography'];
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
  session.manual = null;
  session.params = defaultParams();
  saveSession();
  emitChange();
}

/* ── 顶栏 ───────────────────────────────────────────────────────────── */
const NAV = [
  { href: 'index.html', label: '工作台' },
  { href: 'gallery.html', label: '画廊' },
  { href: 'style-library.html', label: '风格库' },
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
    </div>`;
  host.querySelector('[data-role="toggle-theme"]').addEventListener('click', () => {
    toggleTheme();
    renderTopbar(active);
  });
  host.querySelector('[data-role="open-palette"]').addEventListener('click', openPalette);
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
  return `
    <div class="final-bar" id="final-bar" data-od-id="final-prompt">
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
          <button class="btn btn-ghost" type="button" data-role="clear" aria-label="清空会话"${session.selected.length || session.subject ? '' : ' disabled'}>${icon('trash')}</button>
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
      </section>
      ${detailBlock}
    </div>
    ${finalBarHtml()}`;
  wireDock();
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
    if (!session.selected.length && !session.subject) { toast('会话本来就是空的'); return; }
    clearAll();
    toast('会话已清空');
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

/* ── 旧版 URL 契约兼容（ADR-0017） ───────────────────────────────────
   旧 Vue SPA 用 #/artists?... / #/explore?d/ar/sref/q，新版用 #artists / #explore；
   旧版另有三处页签 style-codes / styles-top / gallery，新版是独立 HTML 页。
   在 core.js 顶层执行：workbench.js 的 readHash() 晚于本文件加载，读到的已是新 hash。 */
function migrateLegacyHash() {
  const h = location.hash;
  if (!h.startsWith('#/')) return;
  const key = h.slice(2).split('?')[0].replace(/\/$/, '');
  const page = location.pathname.split('/').pop() || 'index.html';
  const isIndex = page === '' || page === 'index.html';

  const pages = { 'style-codes': 'style-library.html', 'styles-top': 'style-library.html', gallery: 'gallery.html' };
  if (pages[key]) {
    if (page === pages[key]) {
      try { history.replaceState(null, '', '#'); } catch { location.hash = ''; }
    } else {
      location.replace(pages[key]);
    }
    return;
  }

  const tabs = (typeof VOCAB_CATEGORIES === 'undefined' ? [] : VOCAB_CATEGORIES.map(c => c.id))
    .concat('artists', 'explore');
  const next = tabs.includes(key) ? key : 'artists';
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
