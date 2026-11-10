/**
 * 从 config/ 生成静态 WebUI 的数据 JS（ADR-0017 第二步）。
 *
 * 输入（只读，均不修改）：
 *   config/explore.yaml              957 条作业 / 7 批次 + source / batches / aspects
 *   config/explore-decomposed.yaml   942 条七段拆解（文件扩展名是 .yaml，内容是 JSON）；缺的走灯箱空态
 *   config/styles-top.yaml           200 个官方风格码 × 8 题材
 *   webui/assets/explore|styles-top  抽样图（决定 sample 模式下哪些卡片有配图）
 *
 * 输出（覆盖生成）：
 *   webui/js/data-explore.js
 *   webui/js/data-stylestop.js
 *
 * 用法：
 *   npm run build:webui-data                      默认 public：两域全量（package.json 已带 --images=public）
 *   node scripts/build-webui-data.mjs            不带 flag = sample，两域都用 webui/assets 抽样；
 *                                                styles-top 抽样图已与现行 200 码不匹配，会被覆盖率守门中止
 *                                                （dry-run / --only 旁路只告警，不中止）
 *   node scripts/build-webui-data.mjs --images=explore-public
 *                                                只把探索榜配图改为 ../public/ 全量（风格榜仍 sample）
 *   node scripts/build-webui-data.mjs --images=public
 *                                                两域都改为 ../public/ 相对路径（不复制文件、零体积增长，
 *                                                但 dist/ 脱离项目根后图片会失效）
 *   node scripts/build-webui-data.mjs --only=explore
 *                                                校验两域，但只写 data-explore.js（风格榜产物不动）
 *   node scripts/build-webui-data.mjs --dry-run  只统计不写文件
 *
 * 原则：不杜撰。源数据里没有的字段（如 sref）一律置空，不用样本里推测的值填充。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = path.join(ROOT, 'config');
const OUT_DIR = path.join(ROOT, 'webui', 'js');
const ASSETS = path.join(ROOT, 'webui', 'assets');

const args = process.argv.slice(2);
const mode = args.includes('--images=public')
  ? 'public'
  : args.includes('--images=explore-public') ? 'explore-public' : 'sample';
const dryRun = args.includes('--dry-run');
/** --only=<域>：校验照跑，但只写该域的数据产物，避免重建另一个域时带上无关变更。 */
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
/** 按域决定配图来源：explore-public 只让探索榜走 ../public 全量，风格榜维持抽样。 */
const publicFor = (kind) => mode === 'public' || (mode === 'explore-public' && kind === 'explore');
const modeFor = (kind) => (publicFor(kind) ? 'public' : 'sample');

function must(cond, msg) {
  if (!cond) {
    console.error('[build-webui-data] ' + msg);
    process.exit(1);
  }
}

/* ── 读源 ─────────────────────────────────────────────────────────── */
const exploreYamlPath = path.join(CFG, 'explore.yaml');
const decomposedPath = path.join(CFG, 'explore-decomposed.yaml');
const stylesTopPath = path.join(CFG, 'styles-top.yaml');
for (const p of [exploreYamlPath, decomposedPath, stylesTopPath]) {
  must(fs.existsSync(p), `缺少输入文件：${p}`);
}

const explore = yaml.load(fs.readFileSync(exploreYamlPath, 'utf8'));
const decomposed = JSON.parse(fs.readFileSync(decomposedPath, 'utf8'));
const stylesTop = yaml.load(fs.readFileSync(stylesTopPath, 'utf8'));

must(Array.isArray(explore.jobs) && explore.jobs.length > 0, 'explore.yaml 里没有 jobs');
must(Array.isArray(decomposed.jobs), 'explore-decomposed.yaml 里没有 jobs');
must(Array.isArray(stylesTop.entries), 'styles-top.yaml 里没有 entries');

const decById = new Map(decomposed.jobs.map((j) => [j.jobId, j]));
const unmatched = explore.jobs.filter((j) => !decById.has(j.id)).length;

const sampleSets = {
  explore: new Set(fs.readdirSync(path.join(ASSETS, 'explore'))),
  'styles-top': new Set(fs.readdirSync(path.join(ASSETS, 'styles-top'))),
};
const sampleDirs = { explore: 'assets/explore', 'styles-top': 'assets/styles-top' };

/** 把源 YAML 里的相对图片路径，转成 webui/ 下可用的路径；sample 模式下取不到就返回 null。 */
function pickImage(raw, kind) {
  const base = path.basename(raw);
  if (publicFor(kind)) {
    const prefix = kind === 'explore' ? '../public/explore/' : '../public/preview-images/';
    return prefix + raw.split(path.sep).join('/');
  }
  return sampleSets[kind].has(base) ? `${sampleDirs[kind]}/${base}` : null;
}

/** 路径相对 webui/ 解析，验证图片确实存在。 */
function imageExists(rel) {
  return fs.existsSync(path.resolve(ROOT, 'webui', rel));
}

/* ── 探索榜 ───────────────────────────────────────────────────────── */
/* 拆解来源：主数据 model 是长描述，前端只需三种短标签来「如实区分」精拆与规则解析。
   此前本脚本只挑 7 个字段，把 model 丢了，导致灯箱里规则版与 LLM 精拆版长得一模一样。 */
const modelSource = (m) => {
  const s = String(m ?? '');
  if (s.includes('手工')) return '手工精拆';
  if (s.includes('逐条精拆')) return '逐条精拆';
  if (s.includes('规则解析')) return '规则解析';
  return '未标注';
};

const jobs = explore.jobs.map((j) => {
  const thumbs = (j.thumbs || []).map((t) => pickImage(t, 'explore')).filter(Boolean);
  const d = decById.get(j.id);
  return {
    id: j.id,
    title: j.title ?? '',
    prompt: j.prompt ?? '',
    author: j.author ?? '',
    aspect: j.aspect ?? '',
    version: j.version ?? '',
    batch: j.batch ?? '',
    // 源数据（prompt / paramTail / tags）均未采集 sref；原型样本里那 2 个值是杜撰，不继承。
    sref: null,
    time: j.enqueueTime ?? null,
    thumbs,
    decomposition: d
      ? {
          source: modelSource(d.model),
          framework: d.framework ?? '',
          summary: d.summary ?? '',
          segments: d.segments ?? [],
          composition: d.composition ?? [],
          tags: d.tags ?? {},
          paramTail: d.paramTail ?? { text: '', params: [] },
          health: d.health ?? [],
        }
      : null,
  };
});

const EXPLORE_IMAGE_STATS = {
  mode: modeFor('explore'),
  withImages: jobs.filter((j) => j.thumbs.length > 0).length,
  total: jobs.length,
  imageFiles: jobs.reduce((s, j) => s + j.thumbs.length, 0),
  sourceFiles: explore.jobs.reduce((s, j) => s + (j.thumbs || []).length, 0),
};

/* ── 官方风格榜 ───────────────────────────────────────────────────── */
const entries = stylesTop.entries.map((e) => {
  const images = {};
  for (const [kind, raw] of Object.entries(e.images || {})) {
    const p = pickImage(raw, 'styles-top');
    if (p) images[kind] = p;
  }
  return {
    code: String(e.code ?? e.id ?? ''),
    display: e.display ?? `0_${e.code}`,
    images,
  };
});

const STYLES_TOP_IMAGE_STATS = {
  mode: modeFor('styles-top'),
  withImages: entries.filter((e) => Object.keys(e.images).length > 0).length,
  total: entries.length,
  imageFiles: entries.reduce((s, e) => s + Object.keys(e.images).length, 0),
  sourceFiles: stylesTop.entries.reduce((s, e) => s + Object.keys(e.images || {}).length, 0),
};

/* ── 产物 ─────────────────────────────────────────────────────────── */
function safeJson(v) {
  return JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function render(pairs) {
  const banner = [
    '// 生成物 —— 请勿手改。',
    '// 由 scripts/build-webui-data.mjs 从 config/*.yaml 生成（npm run build:webui-data）。',
    `// 配图模式：${mode}（探索榜 ${modeFor('explore')} / 风格榜 ${modeFor('styles-top')}；public 依赖项目根，单独分发 dist/ 会丢图）`,
    `// 生成时间：${new Date().toISOString()}`,
    '',
  ].join('\n');
  return banner + pairs.map(([k, v]) => `const ${k} = ${safeJson(v)};`).join('\n') + '\n';
}

const outputs = [
  {
    file: 'data-explore.js',
    text: render([
      ['EXPLORE_SOURCE', explore.source],
      ['EXPLORE_BATCHES', explore.batches],
      ['EXPLORE_ASPECTS', explore.aspects],
      ['EXPLORE_JOBS', jobs],
      ['EXPLORE_IMAGE_STATS', EXPLORE_IMAGE_STATS],
    ]),
    probe: '({jobs:EXPLORE_JOBS.length,batches:EXPLORE_BATCHES.length,aspects:EXPLORE_ASPECTS.length,stats:EXPLORE_IMAGE_STATS,thumbs:EXPLORE_JOBS.flatMap(j=>j.thumbs),withDecomp:EXPLORE_JOBS.filter(j=>j.decomposition).length,sref:EXPLORE_JOBS.filter(j=>j.sref).length})',
  },
  {
    file: 'data-stylestop.js',
    text: render([
      ['STYLES_TOP_KINDS', stylesTop.kinds],
      ['STYLES_TOP_ENTRIES', entries],
      ['STYLES_TOP_IMAGE_STATS', STYLES_TOP_IMAGE_STATS],
    ]),
    probe: '({entries:STYLES_TOP_ENTRIES.length,kinds:STYLES_TOP_KINDS.length,stats:STYLES_TOP_IMAGE_STATS,imgs:STYLES_TOP_ENTRIES.flatMap(e=>Object.values(e.images))})',
  },
];

/* 两阶段：先把全部产物校验完，再统一落盘。
   否则 sample 模式下第二个产物校验失败时，第一个坏文件已经写进去了。 */
const pending = [];
for (const out of outputs) {
  new vm.Script(out.text, { filename: out.file }); // 语法自检
  const ctx = {};
  vm.createContext(ctx);
  const r = vm.runInContext(out.text + '\n;' + out.probe, ctx, { timeout: 10000 });
  const refs = r.thumbs || r.imgs || [];
  const missing = refs.filter((p) => !imageExists(p));
  must(missing.length === 0, `${out.file} 有 ${missing.length} 个图片路径不存在，例如 ${missing.slice(0, 3).join(', ')}`);
  if (r.jobs !== undefined) {
    must(r.jobs === explore.jobs.length, `${out.file} 作业数不符：${r.jobs} != ${explore.jobs.length}`);
    must(r.withDecomp === explore.jobs.length - unmatched, '拆解数据条数不符');
  } else {
    must(r.entries === stylesTop.entries.length, `${out.file} 风格码数不符`);
  }

  const willWrite = !dryRun && (!only || out.file === `data-${only}.js`);
  const s = r.stats;
  must(s && s.total > 0, `${out.file} 统计缺失或条目数为 0`);
  // 逆向防护：sample 抽样图与源快照 basename 全不匹配时，会静默产出 0/N 的坏数据。
  // 只在「真要写这个文件」时中止；dry-run 与 --only 旁路仅告警，保留诊断能力。
  if (s.mode === 'sample' && s.withImages === 0) {
    const msg = `${out.file}：sample 模式下 0/${s.total} 条有配图 —— webui/assets 抽样图与当前源快照 basename 全不匹配。改跑 --images=public，或先重做抽样图`;
    if (willWrite) must(false, msg);
    else console.warn(`[build-webui-data] 警告（不写该文件，未中止）：${msg}`);
  }
  if (willWrite) pending.push(out);
}
if (!dryRun) {
  for (const out of pending) {
    fs.writeFileSync(path.join(OUT_DIR, out.file), out.text, 'utf8');
  }
}

/* ── 报告 ─────────────────────────────────────────────────────────── */
const line = (label, s) =>
  `${label}：${s.total} 条 / 有配图 ${s.withImages} 条 / 引用 ${s.imageFiles} 张（源 ${s.sourceFiles} 张）`;

console.log(`[build-webui-data] 模式 ${mode}${dryRun ? '（dry-run，未写文件）' : ''}`);
console.log(`  配图来源：探索榜 ${modeFor('explore')} / 风格榜 ${modeFor('styles-top')}`);
console.log(`  探索榜 ${line('', EXPLORE_IMAGE_STATS)}`);
console.log(`  批次 ${explore.batches.length} / 比例 ${explore.aspects.length} / 拆解匹配 ${explore.jobs.length - unmatched}（未匹配 ${unmatched}）`);
console.log(`  风格榜 ${line('', STYLES_TOP_IMAGE_STATS)}`);
console.log(`  sref：源数据未采集，全部为 null（不继承原型样本里的 2 个杜撰值）`);
if (mode !== 'sample') {
  console.log('  注意：../public/ 相对路径只在项目根内有效，单独分发 dist/ 会丢图。');
}
if (!dryRun) {
  const written = outputs.filter((o) => !only || o.file === `data-${only}.js`)
    .map((o) => 'webui/js/' + o.file).join('、');
  console.log(`  已写入 ${written}；随后跑 npm run build 同步到 dist/`);
}
