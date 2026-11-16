/**
 * 从 config/ 生成静态 WebUI 的数据 JS（ADR-0017 第二步）。
 *
 * 输入（只读，均不修改）：
 *   config/explore.yaml              957 条作业 / 7 批次 + source / batches / aspects
 *   config/explore-decomposed.yaml   942 条七段拆解（文件扩展名是 .yaml，内容是 JSON）；缺的走灯箱空态
 *   config/styles-top.yaml           200 个官方风格码 × 8 题材
 *   config/types.yaml                风格与类型库快照：1,180 条类型条目（2026-11 新增）
 *   public/explore/thumbs             探索榜缩略图（配图源，路径写进产物）
 *   public/preview-images/…          官方榜配图（配图源，路径写进产物）
 *
 * 输出（覆盖生成）：
 *   webui/js/data-explore.js
 *   webui/js/data-stylestop.js
 *   webui/js/data-types.js
 *
 * 用法：
 *   npm run build:webui-data                      两域全量配图（唯一模式）
 *   node scripts/build-webui-data.mjs --only=explore
 *                                                校验两域，但只写 data-explore.js（风格榜产物不动）
 *   node scripts/build-webui-data.mjs --dry-run  只统计不写文件
 *
 * 配图模式（报告 3.2 / ADR-0017 Round 16）：**只有一种** —— 全部走 ../public/ 相对路径，
 * 不复制文件、零体积增长。原先的 --images=sample（webui/assets 抽样图）与 --images=explore-public
 * 两路分支已废弃：抽样图零引用，且两套图片命名空间让「dist/ 拷走能不能用」没有确定答案。
 * 代价明确承担：产物依赖项目根 public/，dist/ 脱离项目根单独分发会丢图。
 *
 * 原则：不杜撰。源数据里没有的字段一律置空，不用样本里推测的值填充；
 *      源数据里有的字段（如 sref）如实透传，不因旧结论而丢弃。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { jobKeys } from '../tools/job-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = path.join(ROOT, 'config');
const OUT_DIR = path.join(ROOT, 'webui', 'js');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
/** --only=<域>：校验照跑，但只写该域的数据产物，避免重建另一个域时带上无关变更。 */
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
/** 配图模式：单一命名空间后恒为 public（报告 3.2 / ADR-0017 Round 16）。
 *  --images=sample 与 --images=explore-public 已随抽样模式一并废弃。 */
const mode = 'public';

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
const typesPath = path.join(CFG, 'types.yaml');
const stylesPath = path.join(CFG, 'styles.yaml');
for (const p of [exploreYamlPath, decomposedPath, stylesTopPath, typesPath, stylesPath]) {
  must(fs.existsSync(p), `缺少输入文件：${p}`);
}

const explore = yaml.load(fs.readFileSync(exploreYamlPath, 'utf8'));
/* 派生文件统一写 JSON（见 tools/decompose-explore.ts 的 writeOutput 说明）。
   这里用容错解析：先按 JSON 读，读不动再退回 YAML。
   容错不是掩盖格式漂移——漂移会在这里被明确报出来，而不是像原来那样
   「跑一次 decompose:explore → 构建期 JSON.parse 抛错」，错误现场离原因很远。 */
const decomposedText = fs.readFileSync(decomposedPath, 'utf8');
let decomposed;
try {
  decomposed = JSON.parse(decomposedText);
} catch (jsonErr) {
  try {
    decomposed = yaml.load(decomposedText);
    console.warn(
      `[build-webui-data] 警告：${path.basename(decomposedPath)} 内容是 YAML，` +
        '已容错读入。但派生文件应统一写 JSON（tools/decompose-explore.ts / ' +
        'rule-decompose.mjs / merge-fine-parts.mjs），请检查哪个写者没跟上。'
    );
  } catch (yamlErr) {
    must(false, `${path.basename(decomposedPath)} 解析失败（JSON 与 YAML 都不行）：${(jsonErr).message}`);
  }
}
const stylesTop = yaml.load(fs.readFileSync(stylesTopPath, 'utf8'));
const types = yaml.load(fs.readFileSync(typesPath, 'utf8'));
const styles = yaml.load(fs.readFileSync(stylesPath, 'utf8'));

must(Array.isArray(explore.jobs) && explore.jobs.length > 0, 'explore.yaml 里没有 jobs');
must(Array.isArray(decomposed.jobs), 'explore-decomposed.yaml 里没有 jobs');
must(Array.isArray(stylesTop.entries), 'styles-top.yaml 里没有 entries');
must(Array.isArray(types.entries) && types.entries.length > 0, 'types.yaml 里没有 entries');
must(Array.isArray(styles.codes) && styles.codes.length > 0, 'styles.yaml 里没有 codes');
must(Array.isArray(styles.artists) && styles.artists.length > 0, 'styles.yaml 里没有 artists');
must(Array.isArray(styles.categories) && styles.categories.length > 0, 'styles.yaml 里没有 categories');

const decById = new Map(decomposed.jobs.map((j) => [j.jobId, j]));
const unmatched = explore.jobs.filter((j) => !decById.has(j.id)).length;

/* 稳定引用键（报告 2.1）：构建期一次性算出并断言零碰撞。
   碰撞是硬错误 —— 键是研究结论引用作业的唯一依据，撞了就等于两条作业互相顶替。 */
const exploreJobKeys = jobKeys(explore.jobs);
must(
  new Set(exploreJobKeys).size === exploreJobKeys.length,
  '作业引用键不唯一（jobKeys 内部已检测，这里是第二道防线）'
);

/** 把源 YAML 里的相对图片路径，转成 webui/ 下可用的路径。
 *
 *  单一命名空间（报告 3.2 / ADR-0017 Round 16）：配图只走项目根 public/。
 *  原先还有一路「sample 抽样模式」——从 webui/assets/explore|styles-top 取图。
 *  该模式已于第 9 步废弃：抽样图零引用（当前产物一条都不引它们），
 *  且它让「图片来源」出现两套命名空间，无法回答「dist/ 拷走能不能用」。
 *  现在图片路径一律是 ../public/…，唯一例外是没有图的条目（取不到就返回 null）。
 *
 *  midlibrary 那一族（艺术家 / 风格码 / 类型条目）走 **tracked/**：
 *  public/preview-images/midlibrary/ 是 gitignored 的生成物，
 *  直接引用它等于「clone 后所有图都失效」（ADR-0032）。
 *  tracked/ 是入库目录，前端统一经 core.js 的 midlibraryPreviewPath() 解析。
 */
function pickImage(raw, kind) {
  if (kind === 'explore') return '../public/explore/' + raw.split(path.sep).join('/');
  if (kind === 'midlibrary') {
    return '../public/preview-images/tracked/' + String(raw).replace(/^midlibrary\//, '').split(path.sep).join('/');
  }
  return '../public/preview-images/' + raw.split(path.sep).join('/');
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
    // 注意：这里**不写**稳定引用键（报告 2.1）。键是由 id 与 prompt 推导出来的量，
    // 不是采集来的事实 —— 烘焙进产物会让「改一行前端代码」变成「6 MB 生成物跟着漂移」。
    // 键由浏览器端运行时算（webui/js/job-key.js），构建期在此处只做零碰撞断言。
    title: j.title ?? '',
    prompt: j.prompt ?? '',
    author: j.author ?? '',
    aspect: j.aspect ?? '',
    version: j.version ?? '',
    batch: j.batch ?? '',
    // 风格参考码：源数据 config/explore.yaml 里真实采集到的字段（上游 prompt.styleRef，
    // 由 tools/collect-explore.ts 的 styleRefsOf() 提取）。缺失就是缺失，不杜撰、不补默认值。
    sref: j.sref ?? null,
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
  mode,
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
  mode,
  withImages: entries.filter((e) => Object.keys(e.images).length > 0).length,
  total: entries.length,
  imageFiles: entries.reduce((s, e) => s + Object.keys(e.images).length, 0),
  sourceFiles: stylesTop.entries.reduce((s, e) => s + Object.keys(e.images || {}).length, 0),
};

/* ── 风格与类型库 ───────────────────────────────────────────────────────
   上游 4 个条目类型类（流派与艺术运动 / 通用修饰 / 技法 / 标题）的 1,180 条。

   与 artists / codes 两条老链不同，这条链**没有现成的生成脚本**
   （README 第三节记着这个缺口）：data-artists.js 与 data-stylecodes.js
   至今是手工产物。这里补上生成链，让类型库与风格库同源同法。

   字段一律如实透传：tested / publicDomain 从 manifest 来，
   terms / colours 从 details.json 来，intro / observation 从 details 的
   a / o 来。缺失即空，不杜撰。 */
const typeEntries = types.entries.map((e) => ({
  id: e.id,
  name: e.name,
  cat: e.category,
  kind: e.kind,
  en: e.promptEn,
  preview: e.preview ? pickImage(e.preview, 'midlibrary') : null,
  url: e.sourceUrl,
  tested: !!e.testedMark,
  publicDomain: !!e.isPublicDomain,
  terms: e.terms || [],
  colours: e.colours || [],
  intro: e.intro || '',
  observation: e.observation || '',
  // 条目创建时间（毫秒，来自 ULID 前 10 位）。
  // 上游的 "Newly tested" 排的是实测时间，那个量在快照里不存在；
  // 这里只能给「收录时间」，页面上的排序项也据此命名，不冒充实测时间。
  createdAt: Number(e.createdAt) || 0,
}));

const TYPE_IMAGE_STATS = {
  mode,
  withImages: typeEntries.filter((e) => !!e.preview).length,
  total: typeEntries.length,
  imageFiles: typeEntries.filter((e) => !!e.preview).length,
  sourceFiles: types.entries.filter((e) => !!e.preview).length,
};

/* 类型库的分面词表与色表：按上游分组顺序落，组内按中文名排。
   词 → 组的映射表（TYPE_TERM_GROUP）由页面侧按 slug 反查，
   这里只把「词在哪个组」这一事实烘焙进产物，避免页面侧再抄一份词表。 */
const typeTermGroups = (types.termGroups || []).map((g) => ({
  id: g.id,
  name: g.name,
  terms: g.terms.map((t) => ({ slug: t.slug, label: t.label })),
}));

const typeColours = (types.colours || []).map((c) => ({
  slug: c.slug,
  name: c.name,
  hex: c.hex,
}));

/* ── 风格库（风格参考码）────────────────────────────────────────────────
   4,638 条 --sref 码。此前的 webui/js/data-stylecodes.js 是**手工产物**，
   与源 config/styles.yaml 并不一致：terms 被截断到 4 个、colours 截断到 3 个、
   preview 只留 120 条、isPick 整个丢掉、testedMark 的映射有 3,949 条对不上。
   那份手工产物让「分面词恒为 4 个」看起来像上游的数据结构（其实是本地截断），
   直接导致「组间全部」的可行性被误判。

   现在改成从 styles.yaml 全量生成，字段如实透传（ADR-0032）。 */

const styleCodes = styles.codes.map((c) => ({
  id: c.id,
  name: c.name,
  code: c.code,
  preview: c.preview ? pickImage(c.preview, 'midlibrary') : null,
  url: c.sourceUrl,
  tested: !!c.testedMark,
  pick: !!c.isPick,
  terms: c.terms || [],
  colours: c.colours || [],
  // 简介：上游风格码的 a 字段实测 0/4,638 覆盖（上游没给），所以这里基本是空串。
  intro: c.intro || '',
  // 风格描述：上游 o 字段，4,638/4,638 全有 —— 卡片副行与详情弹层用它。
  observation: c.observation || '',
  // 条目创建时间（毫秒，来自 ULID 前 10 位）：排序「最新收录」依赖它。
  createdAt: Number(c.createdAt) || 0,
}));

const STYLE_IMAGE_STATS = {
  mode,
  withImages: styleCodes.filter((c) => !!c.preview).length,
  total: styleCodes.length,
  imageFiles: styleCodes.filter((c) => !!c.preview).length,
  sourceFiles: styles.codes.filter((c) => !!c.preview).length,
};

/* 风格码的分面词表与色表：**只列实际被用到的**。
   上游词表有 68 词（10 组）/ 96 色，但风格码只用到 41 词（6 组）/ 94 色 ——
   其余的词点了必然 0 条，列出来只是噪音（类型库页用全量词表 + 零计数置灰，
   那是另一套取舍：它的数据把 10 组都用上了）。 */
const usedCodeTerms = new Set();
for (const c of styleCodes) for (const t of c.terms) usedCodeTerms.add(t);
const usedCodeColours = new Set();
for (const c of styleCodes) for (const t of c.colours) usedCodeColours.add(t);

const styleTermGroups = (styles.termGroups || [])
  .map((g) => ({
    id: g.id,
    name: g.name,
    terms: (g.terms || []).filter((t) => usedCodeTerms.has(t.slug)),
  }))
  .filter((g) => g.terms.length > 0);

const styleColours = (styles.colours || []).filter((c) => usedCodeColours.has(c.slug));

/* ── 艺术家库（艺术家 / 摄影师）────────────────────────────────────────
   4,322 条。此前的 webui/js/data-artists.js 是**手工产物**，与源
   config/styles.yaml 严重不一致：terms 截到前 6（源最多 15）、
   colours 截到前 4（源最多 9）、intro 截到 420 字符（源最长 1,580）、
   observation 截到 320 字符（源最长 452）、preview 只留 328 条
   （源 4,322 条全有，图片文件已在 tracked/）。这份截断产物让
   「分面词最多 6 个」「只有 328 条带图」看起来像上游事实（其实不是），
   直接导致筛选语义与配图覆盖被误判（ADR-0033）。

   现在改成从 styles.yaml 全量生成。全局名保持 ARTISTS / TERM_GROUPS /
   COLOURS / ARTIST_CATEGORIES 不变 —— core.js 的全局搜索仍在用 ARTISTS。 */

const artists = styles.artists.map((a) => ({
  id: a.id,
  name: a.name,
  cat: a.category,
  en: a.promptEn,
  preview: a.preview ? pickImage(a.preview, 'midlibrary') : null,
  url: a.sourceUrl,
  tested: !!a.testedMark,
  pick: !!a.isPick,
  terms: a.terms || [],
  colours: a.colours || [],
  // 简介与风格描述都如实透传，不在构建期截断（历史事故就是在这里截的）。
  intro: a.intro || '',
  observation: a.observation || '',
}));

const ARTIST_IMAGE_STATS = {
  mode,
  withImages: artists.filter((a) => !!a.preview).length,
  total: artists.length,
  imageFiles: artists.filter((a) => !!a.preview).length,
  sourceFiles: styles.artists.filter((a) => !!a.preview).length,
};

/* 分面词表与色表同样**只列实际被用到的**，与风格库同一口径。 */
const usedArtistTerms = new Set();
for (const a of artists) for (const t of a.terms) usedArtistTerms.add(t);
const usedArtistColours = new Set();
for (const a of artists) for (const c of a.colours) usedArtistColours.add(c);

const artistTermGroups = (styles.termGroups || [])
  .map((g) => ({
    id: g.id,
    name: g.name,
    terms: (g.terms || []).filter((t) => usedArtistTerms.has(t.slug)),
  }))
  .filter((g) => g.terms.length > 0);

const artistColours = (styles.colours || []).filter((c) => usedArtistColours.has(c.slug));

/* ── 产物 ─────────────────────────────────────────────────────────── */
function safeJson(v) {
  return JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function render(pairs) {
  const banner = [
    '// 生成物 —— 请勿手改。',
    '// 由 scripts/build-webui-data.mjs 从 config/*.yaml 生成（npm run build:webui-data）。',
    `// 配图模式：${mode}（唯一模式；public 依赖项目根，单独分发 dist/ 会丢图）`,
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
  {
    file: 'data-types.js',
    text: render([
      ['TYPE_CATEGORIES', types.categories],
      ['TYPE_TERM_GROUPS', typeTermGroups],
      ['TYPE_COLOURS', typeColours],
      ['TYPE_ENTRIES', typeEntries],
      ['TYPE_IMAGE_STATS', TYPE_IMAGE_STATS],
      ['TYPE_SOURCE', types.source],
    ]),
    probe: '({entries:TYPE_ENTRIES.length,cats:TYPE_CATEGORIES.length,groups:TYPE_TERM_GROUPS.length,colours:TYPE_COLOURS.length,stats:TYPE_IMAGE_STATS,imgs:TYPE_ENTRIES.map(e=>e.preview).filter(Boolean),terms:TYPE_ENTRIES.flatMap(e=>e.terms),coloursUsed:TYPE_ENTRIES.flatMap(e=>e.colours),tested:TYPE_ENTRIES.filter(e=>e.tested).length,publicDomain:TYPE_ENTRIES.filter(e=>e.publicDomain).length,withTime:TYPE_ENTRIES.filter(e=>e.createdAt>0).length})',
  },
  {
    file: 'data-stylecodes.js',
    text: render([
      ['STYLE_TERM_GROUPS', styleTermGroups],
      ['STYLE_COLOURS', styleColours],
      ['STYLE_CODES', styleCodes],
      ['STYLE_IMAGE_STATS', STYLE_IMAGE_STATS],
      ['STYLE_SOURCE', styles.source],
    ]),
    probe: '({entries:STYLE_CODES.length,groups:STYLE_TERM_GROUPS.length,colours:STYLE_COLOURS.length,stats:STYLE_IMAGE_STATS,imgs:STYLE_CODES.map(c=>c.preview).filter(Boolean),terms:STYLE_CODES.flatMap(c=>c.terms),coloursUsed:STYLE_CODES.flatMap(c=>c.colours),tested:STYLE_CODES.filter(c=>c.tested).length,pick:STYLE_CODES.filter(c=>c.pick).length,withObs:STYLE_CODES.filter(c=>c.observation).length,withTime:STYLE_CODES.filter(c=>c.createdAt>0).length})',
  },
  {
    file: 'data-artists.js',
    text: render([
      ['ARTIST_CATEGORIES', styles.categories],
      ['TERM_GROUPS', artistTermGroups],
      ['COLOURS', artistColours],
      ['ARTISTS', artists],
      ['ARTIST_IMAGE_STATS', ARTIST_IMAGE_STATS],
      ['ARTIST_SOURCE', styles.source],
    ]),
    /* 长度统计是守门用的：历史事故把 terms 截到 6 / colours 截到 4 /
       intro 截到 420 / observation 截到 320 / preview 只留 328。
       只比条数抓不住这种「条目在、字段被削」的截断。 */
    probe: '({artistCats:ARTIST_CATEGORIES.length,entries:ARTISTS.length,groups:TERM_GROUPS.length,colours:COLOURS.length,stats:ARTIST_IMAGE_STATS,imgs:ARTISTS.map(a=>a.preview).filter(Boolean),terms:ARTISTS.flatMap(a=>a.terms),coloursUsed:ARTISTS.flatMap(a=>a.colours),tested:ARTISTS.filter(a=>a.tested).length,pick:ARTISTS.filter(a=>a.pick).length,withIntro:ARTISTS.filter(a=>a.intro).length,withObs:ARTISTS.filter(a=>a.observation).length,termMax:Math.max(...ARTISTS.map(a=>a.terms.length)),colMax:Math.max(...ARTISTS.map(a=>a.colours.length)),introMax:Math.max(...ARTISTS.map(a=>a.intro.length)),obsMax:Math.max(...ARTISTS.map(a=>a.observation.length))})',
  },
];

/* 两阶段：先把全部产物校验完，再统一落盘。
   否则第二个产物校验失败时，第一个坏文件已经写进去了。 */
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
    // 守门：sref 必须与源快照条数一致。历史事故——构建期把 j.sref 硬编码成 null，
    // 而源数据实际有值，导致「只看有 sref」筛选恒空、界面误报「源数据未采集 sref」。
    // 这里把条数钉死，任何再次丢弃都会在构建期失败。
    const srcSref = explore.jobs.filter((j) => j.sref).length;
    must(r.sref === srcSref, `${out.file} sref 条数与源快照不符：产物 ${r.sref} != 源 ${srcSref}`);
    // 守门：稳定引用键必须每条都有、且全表唯一。键是研究结论引用作业的唯一依据，
    // 缺失或重复都会让「结论挂到证据上」这件事失效（报告 2.1）。
    // 引用键零碰撞已由上面的 exploreJobKeys 断言保证（构建期跑的是浏览器端同一份算法）。
    // 这里只钉住条数：键不是采集来的事实，不烘焙进产物，由浏览器端运行时算。
  } else if (r.artistCats !== undefined) {
    /* 艺术家库：条数、分面覆盖、配图、文本长度全部与源快照一致。
       历史事故是「条目在、字段被削」—— 只比条数抓不住，所以这里把
       terms / colours / intro / observation 的最大长度也钉死（ADR-0033）。 */
    must(r.entries === styles.artists.length, `${out.file} 艺术家条数不符：${r.entries} != ${styles.artists.length}`);
    must(r.artistCats === styles.categories.length, `${out.file} 艺术家类别数不符`);
    must(r.groups === artistTermGroups.length, `${out.file} 分面词组数不符`);
    must(r.colours === artistColours.length, `${out.file} 主色数不符`);
    const knownArtistTerms = new Set();
    for (const g of artistTermGroups) for (const t of g.terms) knownArtistTerms.add(t.slug);
    const unknownArtistTerms = [...new Set(r.terms)].filter((s) => !knownArtistTerms.has(s));
    must(unknownArtistTerms.length === 0, `${out.file} 有 ${unknownArtistTerms.length} 个分面词不在词表里，例如 ${unknownArtistTerms.slice(0, 3).join(', ')}`);
    const knownArtistColours = new Set(artistColours.map((c) => c.slug));
    const unknownArtistColours = [...new Set(r.coloursUsed)].filter((s) => !knownArtistColours.has(s));
    must(unknownArtistColours.length === 0, `${out.file} 有 ${unknownArtistColours.length} 个主色不在色表里，例如 ${unknownArtistColours.slice(0, 3).join(', ')}`);
    // 配图：源 4,322 条全有，产物必须同样全有（图片文件已在 tracked/）
    const srcArtistImgs = styles.artists.filter((a) => !!a.preview).length;
    must(r.stats.withImages === srcArtistImgs, `${out.file} 配图条数与源快照不符：${r.stats.withImages} != ${srcArtistImgs}`);
    // 字段长度：任何再次截断都会在构建期失败
    const maxOf = (arr, fn) => arr.reduce((m, x) => Math.max(m, fn(x)), 0);
    must(r.termMax === maxOf(styles.artists, (a) => (a.terms || []).length), `${out.file} 分面词被截断（产物最多 ${r.termMax} 个）`);
    must(r.colMax === maxOf(styles.artists, (a) => (a.colours || []).length), `${out.file} 主色被截断（产物最多 ${r.colMax} 个）`);
    must(r.introMax === maxOf(styles.artists, (a) => (a.intro || '').length), `${out.file} 简介被截断（产物最长 ${r.introMax} 字符）`);
    must(r.obsMax === maxOf(styles.artists, (a) => (a.observation || '').length), `${out.file} 风格描述被截断（产物最长 ${r.obsMax} 字符）`);
    const srcArtistTested = styles.artists.filter((a) => a.testedMark).length;
    const srcArtistPick = styles.artists.filter((a) => a.isPick).length;
    must(r.tested === srcArtistTested, `${out.file} 实测条数与源快照不符：${r.tested} != ${srcArtistTested}`);
    must(r.pick === srcArtistPick, `${out.file} 精选条数与源快照不符：${r.pick} != ${srcArtistPick}`);
    must(r.withIntro === styles.artists.filter((a) => !!a.intro).length, `${out.file} 有简介的条数不符`);
    must(r.withObs === styles.artists.filter((a) => !!a.observation).length, `${out.file} 有风格描述的条数不符`);
  } else if (r.pick !== undefined) {
    /* 风格码：条数、开关、分面覆盖都要与源快照一致。
       这条链历史上踩过「手工产物截断分面」的坑 —— terms 被砍到 4 个、
       colours 被砍到 3 个、preview 只留 120 条、isPick 整个丢掉。
       所以这里把每一项都钉死，任何再次截断都会在构建期失败。 */
    must(r.entries === styles.codes.length, `${out.file} 风格码数不符：${r.entries} != ${styles.codes.length}`);
    must(r.groups === styleTermGroups.length, `${out.file} 分面词组数不符`);
    must(r.colours === styleColours.length, `${out.file} 主色数不符`);
    const knownCodeTerms = new Set();
    for (const g of styleTermGroups) for (const t of g.terms) knownCodeTerms.add(t.slug);
    const unknownCodeTerms = [...new Set(r.terms)].filter((s) => !knownCodeTerms.has(s));
    must(unknownCodeTerms.length === 0, `${out.file} 有 ${unknownCodeTerms.length} 个分面词不在词表里，例如 ${unknownCodeTerms.slice(0, 3).join(', ')}`);
    const knownCodeColours = new Set(styleColours.map((c) => c.slug));
    const unknownCodeColours = [...new Set(r.coloursUsed)].filter((s) => !knownCodeColours.has(s));
    must(unknownCodeColours.length === 0, `${out.file} 有 ${unknownCodeColours.length} 个主色不在色表里，例如 ${unknownCodeColours.slice(0, 3).join(', ')}`);
    // 开关如实透传：条数必须与源快照一致
    const srcCodeTested = styles.codes.filter((c) => c.testedMark).length;
    const srcCodePick = styles.codes.filter((c) => c.isPick).length;
    must(r.tested === srcCodeTested, `${out.file} 实测条数与源快照不符：产物 ${r.tested} != 源 ${srcCodeTested}`);
    must(r.pick === srcCodePick, `${out.file} 编辑精选条数与源快照不符：产物 ${r.pick} != 源 ${srcCodePick}`);
    // 风格描述与创建时间：卡片副行、排序都依赖它，条数必须对得上
    const srcCodeObs = styles.codes.filter((c) => !!c.observation).length;
    const srcCodeTime = styles.codes.filter((c) => Number(c.createdAt) > 0).length;
    must(r.withObs === srcCodeObs, `${out.file} 有风格描述的条数与源快照不符：产物 ${r.withObs} != 源 ${srcCodeObs}`);
    must(r.withTime === srcCodeTime, `${out.file} 有创建时间的条数与源快照不符：产物 ${r.withTime} != 源 ${srcCodeTime}`);
  } else if (r.terms !== undefined) {
    /* 类型库：条数、分类数、分面词表、主色表都要与源快照一致。
       分面覆盖是这套数据的命门（历史上 artists 侧踩过「产物截断分面」的坑），
       所以这里把「条目里出现的每个 term / colour 都必须在词表里」钉死。 */
    must(r.entries === types.entries.length, `${out.file} 类型条目数不符：${r.entries} != ${types.entries.length}`);
    must(r.cats === types.categories.length, `${out.file} 分类数不符`);
    must(r.groups === (types.termGroups || []).length, `${out.file} 分面词组数不符`);
    must(r.colours === (types.colours || []).length, `${out.file} 主色数不符`);
    const knownTerms = new Set();
    for (const g of types.termGroups || []) for (const t of g.terms) knownTerms.add(t.slug);
    const unknownTerms = [...new Set(r.terms)].filter((s) => !knownTerms.has(s));
    must(unknownTerms.length === 0, `${out.file} 有 ${unknownTerms.length} 个分面词不在词表里，例如 ${unknownTerms.slice(0, 3).join(', ')}`);
    const knownColours = new Set((types.colours || []).map((c) => c.slug));
    const unknownColours = [...new Set(r.coloursUsed)].filter((s) => !knownColours.has(s));
    must(unknownColours.length === 0, `${out.file} 有 ${unknownColours.length} 个主色不在色表里，例如 ${unknownColours.slice(0, 3).join(', ')}`);
    // 开关如实透传：条数必须与源快照一致，不能在构建期被悄悄丢掉
    const srcTested = types.entries.filter((e) => e.testedMark).length;
    const srcPublicDomain = types.entries.filter((e) => e.isPublicDomain).length;
    must(r.tested === srcTested, `${out.file} 实测条数与源快照不符：产物 ${r.tested} != 源 ${srcTested}`);
    must(r.publicDomain === srcPublicDomain, `${out.file} 公有领域条数与源快照不符：产物 ${r.publicDomain} != 源 ${srcPublicDomain}`);
    // 创建时间也要如实透传：有时间的条数必须与源快照一致（排序依赖它）
    const srcWithTime = types.entries.filter((e) => Number(e.createdAt) > 0).length;
    must(r.withTime === srcWithTime, `${out.file} 有创建时间的条数与源快照不符：产物 ${r.withTime} != 源 ${srcWithTime}`);
  } else {
    must(r.entries === stylesTop.entries.length, `${out.file} 风格码数不符`);
  }

  const willWrite = !dryRun && (!only || out.file === `data-${only}.js`);
  const s = r.stats;
  must(s && s.total > 0, `${out.file} 统计缺失或条目数为 0`);
  // 逆向防护：0/N 的配图一定是坏数据（源快照本就带图，抽不到说明链路断了）。
  // 只告警不中止 —— 上面的逐条 imageExists 硬校验已经拦住了「引用了不存在的文件」，
  // 这里拦的是「一条都没引用上」这种上游整体缺失的情况，保留诊断能力而非阻断构建。
  if (s.withImages === 0) {
    console.warn(
      `[build-webui-data] 警告：${out.file} 0/${s.total} 条有配图 —— 检查 public/ 下的图是否还在（采集链产物不入版本库，git clone 后需先跑采集）`
    );
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

console.log(`[build-webui-data] 配图模式 ${mode}（唯一模式）${dryRun ? '（dry-run，未写文件）' : ''}`);
console.log(`  配图来源：探索榜 ../public/explore/ / 风格榜 ../public/preview-images/`);
console.log(`  探索榜 ${line('', EXPLORE_IMAGE_STATS)}`);
console.log(`  批次 ${explore.batches.length} / 比例 ${explore.aspects.length} / 拆解匹配 ${explore.jobs.length - unmatched}（未匹配 ${unmatched}）`);
console.log(`  风格榜 ${line('', STYLES_TOP_IMAGE_STATS)}`);
console.log(`  风格库 ${line('', STYLE_IMAGE_STATS)} · 分面词组 ${styleTermGroups.length} 个 / 分面词 ${styleTermGroups.reduce((n, g) => n + g.terms.length, 0)} 个 / 主色 ${styleColours.length} 个`);
console.log(`  类型库 ${line('', TYPE_IMAGE_STATS)} · 分类 ${types.categories.length} 个 · 分面词 ${typeTermGroups.reduce((n, g) => n + g.terms.length, 0)} 个 / 主色 ${typeColours.length} 个`);
console.log(`  艺术家库 ${line('', ARTIST_IMAGE_STATS)} · 类别 ${styles.categories.length} 个 · 分面词 ${artistTermGroups.reduce((n, g) => n + g.terms.length, 0)} 个 / 主色 ${artistColours.length} 个`);
console.log(`  sref：源数据 ${jobs.filter((j) => j.sref).length} 条带真实风格参考码（透传，不杜撰）`);
console.log('  注意：../public/ 相对路径只在项目根内有效，单独分发 dist/ 会丢图。');
if (!dryRun) {
  const written = outputs.filter((o) => !only || o.file === `data-${only}.js`)
    .map((o) => 'webui/js/' + o.file).join('、');
  console.log(`  已写入 ${written}；随后跑 npm run build 同步到 dist/`);
}
