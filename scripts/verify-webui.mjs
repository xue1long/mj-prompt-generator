/**
 * 静态 WebUI 冒烟校验（ADR-0017）。
 *
 * 不依赖 dev server：直接以 file:// 打开 webui/ 下的页面。
 *   npm run verify                           校验源码 webui/
 *   node scripts/verify-webui.mjs --dist    校验构建产物 dist/
 *
 * 覆盖：四屏渲染、全量数据契约、筛选无假空态、分页、配图覆盖与空态降级、会话 / 主题 / 旧 hash
 * 迁移、窄屏回归基线。窄屏页签遮挡是既有缺陷，只登记不断言失败（见 ADR-0017）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const useDist = process.argv.includes('--dist');
const WEBUI = path.join(ROOT, useDist ? 'dist' : 'webui');
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
const fileUrl = (name) => pathToFileURL(path.join(WEBUI, name)).href;
const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 800, height: 600 };

/* sref 的期望条数：直接数源快照 config/explore.yaml，不写死数字。
   采集后条数会变，断言跟着变 —— 这正是原来写死 0 会把 bug 固化下来的教训。 */
function expectedSrefCount() {
  const src = path.join(ROOT, 'config', 'explore.yaml');
  if (!fs.existsSync(src)) return -1;
  const text = fs.readFileSync(src, 'utf8');
  return (text.match(/^\s*sref\s*:/gm) || []).length;
}
const EXPECT_SREF = expectedSrefCount();

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
function note(name, detail = '') {
  console.log(`NOTE  ${name}${detail ? '  — ' + detail : ''}`);
}

async function openPage(browser, name, hash = '', viewport = DESKTOP) {
  const page = await browser.newPage();
  // 桌面视口下页签中心点可点击；≤980px 单栏时固定底条会盖住页签（既有缺陷）。
  await page.setViewport(viewport);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => errs.push('reqfail: ' + r.url().slice(-100)));
  await page.goto(fileUrl(name) + hash, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 700));
  return { page, errs };
}

async function main() {
  if (!executablePath) throw new Error('未找到 Chrome / Edge，无法运行浏览器校验');
  if (!fs.existsSync(path.join(WEBUI, 'index.html'))) {
    throw new Error(`${useDist ? 'dist/' : 'webui/'} 不存在${useDist ? '，先跑 npm run build' : ''}`);
  }
  console.log(`目标：${WEBUI}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--allow-file-access-from-files', '--no-sandbox', '--disable-gpu'],
  });

  try {
    /* 1. 三屏渲染 + 零错误（每屏的所有交互做完后才判定零错误） */
    for (const name of ['index.html', 'gallery.html', 'style-library.html']) {
      const { page, errs } = await openPage(browser, name);
      const info = await page.evaluate(() => ({
        appbar: document.querySelector('#appbar')?.children.length || 0,
        dock: document.querySelector('#dock')?.children.length || 0,
        pageEl: document.querySelector('#page')?.children.length || 0,
      }));
      check(`${name} 渲染`, info.appbar > 0 && info.dock > 0 && info.pageEl > 0, JSON.stringify(info));

      if (name === 'index.html') {
        // 一级视图（报告 4.2）与二级页签分开断言。
        // 数量不写死：断言「DOM 里的数量 == 代码里声明的数量」。
        // 写死数字会把「加一个视图」变成「改一处断言」——那正是原写法的毛病。
        const tabCounts = await page.evaluate(() => ({
          views: document.querySelectorAll('[data-view]').length,
          declaredViews: (typeof VIEWS !== 'undefined' ? VIEWS.length : -1),
          subTabs: document.querySelectorAll('[data-tab]').length,
          declaredSubTabs: (typeof LIBRARY_TABS !== 'undefined' ? LIBRARY_TABS.length : -1),
        }));
        check('一级视图数与声明一致',
          tabCounts.views === tabCounts.declaredViews && tabCounts.views > 0,
          `实际 ${tabCounts.views} / 声明 ${tabCounts.declaredViews}`);
        check('提示词库二级页签数与声明一致',
          tabCounts.subTabs === tabCounts.declaredSubTabs && tabCounts.subTabs > 0,
          `实际 ${tabCounts.subTabs} / 声明 ${tabCounts.declaredSubTabs}`);

        // 4.2：探索榜升为一级视图 —— 一级视图里必须有 samples，且二级页签里没有 explore
        // 2.2：对照视图也是一级视图（用户拍板，见 ADR-0021）
        const viewIds = await page.evaluate(() =>
          [...document.querySelectorAll('[data-view]')].map(b => b.dataset.view));
        check('研究样本库是一级视图',
          viewIds.includes('samples'), viewIds.join(','));
        check('对照是一级视图',
          viewIds.includes('compare'), viewIds.join(','));
        check('二级页签里没有「探索榜」（它已升为一级视图）',
          !(await page.evaluate(() => !!document.querySelector('[data-tab="explore"]'))));

        /* 2. 全量数据契约（config/*.yaml → js/data-*.js） */
        // 单一真相源：产物自带的统计对象与数组长度；采集后无需改任何数字。
        const data = await page.evaluate(() => ({
          jobs: typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS.length : -1,
          batches: typeof EXPLORE_BATCHES !== 'undefined' ? EXPLORE_BATCHES.length : -1,
          aspects: typeof EXPLORE_ASPECTS !== 'undefined' ? EXPLORE_ASPECTS.length : -1,
          imageMode: typeof EXPLORE_IMAGE_STATS !== 'undefined' ? EXPLORE_IMAGE_STATS.mode : '?',
          withImages: typeof EXPLORE_IMAGE_STATS !== 'undefined' ? EXPLORE_IMAGE_STATS.withImages : -1,
          total: typeof EXPLORE_IMAGE_STATS !== 'undefined' ? EXPLORE_IMAGE_STATS.total : -1,
          totalJobs: typeof EXPLORE_BATCHES !== 'undefined'
            ? EXPLORE_BATCHES.reduce((s, b) => s + b.jobs, 0) : -1,
          decomp: typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS.filter((j) => j.decomposition).length : -1,
          noDecomp: typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS.filter((j) => !j.decomposition).length : -1,
          sref: typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS.filter((j) => j.sref).length : -1,
        }));
        check('探索榜作业数 = 数据源统计', data.jobs > 0 && data.jobs === data.total && data.jobs === data.totalJobs,
          `作业 ${data.jobs} / 统计 ${data.total} / 批次合计 ${data.totalJobs}`);
        check('七段拆解与待精拆数自洽', data.decomp > 0 && data.decomp + data.noDecomp === data.jobs,
          `有拆解 ${data.decomp} / 待精拆 ${data.noDecomp} / 共 ${data.jobs}`);
        check('探索榜配图为 public 全量', data.imageMode === 'public' && data.withImages === data.total,
          `${data.imageMode} / ${data.withImages} / ${data.total}`);
        // sref 如实透传：源快照有值就有值，无值就是 null。历史事故——构建期硬编码 null，
        // 断言也跟着写成 0，等于把 bug 固化成验收标准。现改为与源数据条数比对。
        check('sref 如实透传（非杜撰、非丢弃）', data.sref === EXPECT_SREF, `实际 ${data.sref} / 期望 ${EXPECT_SREF}`);

        /* 3. 研究样本库（一级视图）：分页、筛选、占位、灯箱 */
        await page.click('#view-samples');
        await page.waitForSelector('.job-card', { timeout: 15000 });
        const board = await page.evaluate(() => ({
          cards: document.querySelectorAll('.job-card').length,
          plates: document.querySelectorAll('.job-thumbs .img-plate').length,
          chips: document.querySelector('.head-meta')?.textContent.replace(/\s+/g, ' ').trim() || '',
          batches: [...document.querySelectorAll('#ex-batch option')].filter((o) => o.value).length,
          aspects: [...document.querySelectorAll('#ex-aspect option')].filter((o) => o.value).length,
          more: !!document.querySelector('[data-role="ex-more"]'),
          srefBtn: !!document.querySelector('#ex-sref'),
          srefNote: (document.querySelector('.toolbar')?.textContent || '').includes('源数据未采集 sref'),
          badImgs: [...document.querySelectorAll('img')].filter((i) => {
            const s = i.getAttribute('src');
            return !s || s === 'undefined';
          }).length,
        }));
        check('首屏分页 60 条', board.cards === 60 && board.more, `实际 ${board.cards} 条`);
        check('探索榜配图全覆盖（无占位）', board.plates === 0, `${board.plates} 个占位`);
        check('全量作业 / 批次 / 配图如实标注',
          board.chips.includes(`作业 ${data.jobs} / ${data.totalJobs}`)
          && board.chips.includes(`批次 ${board.batches} / ${data.batches}`)
          && board.chips.includes(`配图 ${data.withImages} / ${data.total}`),
          board.chips);
        check('批次 / 比例下拉与数据源一致', board.batches === data.batches && board.aspects === data.aspects,
          `${board.batches} / ${board.aspects}`);
        // sref 控件按数据实际情况二选一：有值 → 可用筛选按钮；无值 → 提示「源数据未采集」。
        // 历史事故——构建期把 sref 丢弃成 null，前端只剩提示语；断言却写成「不该有按钮」，
        // 等于把断链固化成验收标准。现改为与实际数据一致的分支断言。
        check('sref 控件与数据一致',
          EXPECT_SREF > 0 ? (board.srefBtn && !board.srefNote) : (!board.srefBtn && board.srefNote),
          `源 sref ${EXPECT_SREF} 条 / 有按钮 ${board.srefBtn} / 有提示 ${board.srefNote}`);
        check('无破图 img', board.badImgs === 0, `实际 ${board.badImgs}`);

        /* sref 筛选端到端可用：点按钮后命中数 == 源数据条数，且展示的每张卡片都带 sref 标记。
           这条是断链事故的直接回归防线——数据被丢弃时，按钮要么不出现、要么点了筛不出东西。 */
        if (EXPECT_SREF > 0 && board.srefBtn) {
          await page.click('#ex-sref');
          await new Promise((r) => setTimeout(r, 250));
          const srefFiltered = await page.evaluate(() => ({
            count: parseInt(document.querySelector('.toolbar .dock-count')?.textContent || '0', 10),
            cards: document.querySelectorAll('.job-card').length,
            tagged: document.querySelectorAll('.job-card .sref').length,
          }));
          check('「只看有 sref」筛选可用且结果正确',
            srefFiltered.count === EXPECT_SREF && srefFiltered.tagged === srefFiltered.cards,
            `命中 ${srefFiltered.count} / 期望 ${EXPECT_SREF} / 卡片 ${srefFiltered.cards} / 带 sref 标记 ${srefFiltered.tagged}`);
          await page.click('#ex-sref'); // 复位，避免影响后续筛选断言
          await new Promise((r) => setTimeout(r, 200));
        }

        await page.click('[data-role="ex-more"]');
        await new Promise((r) => setTimeout(r, 200));
        const afterMore = await page.$$eval('.job-card', (els) => els.length);
        check('加载更多 +60', afterMore === 120, `实际 ${afterMore}`);

        /* ── 2.2 新增：sref 码筛选 + 提示词短语筛选（多选下拉）────────────
           这两个维度是「按码值筛选」与「按片段聚类」的落点。
           断言口径：筛出的卡片数 == 源数据里真正含该码/该短语的条数，
           且 URL 里带上了对应参数（ADR-0010：hash 是筛选的唯一来源）。 */
        /* 短语下拉是**懒加载**的（报告 2.2：571 条短语全内联会让 toolbar 涨到 177 KB）。
           展开 <details> 会触发 toggle → 懒加载把选项注进 DOM —— 断言前必须先展开。
           （实测 Chrome：给 details.open 赋值也会触发 toggle，不必真的点 summary。） */
        await page.evaluate(() => {
          const det = document.querySelector('#ex-phrase');
          if (det) det.open = true;
        });
        await new Promise((r) => setTimeout(r, 600));

        const multi = await page.evaluate(() => {
          const codes = new Map();
          for (const j of EXPLORE_JOBS) {
            for (const c of String(j.sref || '').split(/\s+/).filter(Boolean)) {
              codes.set(c, (codes.get(c) || 0) + 1);
            }
          }
          // 找出现次数最多的码（>1 才有筛选意义）
          let top = null, topN = 0;
          for (const [c, n] of codes) if (n > topN) { top = c; topN = n; }
          const idx = PHRASE_INDEX.build(EXPLORE_JOBS);
          const p0 = idx.phrases[0];
          return {
            topCode: top, topCodeN: topN,
            topPhrase: p0 ? p0.phrase : '', topPhraseN: p0 ? p0.df : 0,
            phraseTotal: idx.phrases.length,
            codeTotal: codes.size,
            hasSrefMsel: !!document.querySelector('#ex-srefcode'),
            hasPhraseMsel: !!document.querySelector('#ex-phrase'),
            mselOptions: document.querySelectorAll('#ex-srefcode .msel-row').length,
            phraseOptions: document.querySelectorAll('#ex-phrase .msel-row').length,
          };
        });
        check('sref 码下拉存在且列出全部唯一码',
          multi.hasSrefMsel && multi.mselOptions === multi.codeTotal && multi.codeTotal > 0,
          `选项 ${multi.mselOptions} / 唯一码 ${multi.codeTotal}`);
        check('短语下拉存在且列出全部收录短语',
          multi.hasPhraseMsel && multi.phraseOptions === multi.phraseTotal && multi.phraseTotal > 0,
          `选项 ${multi.phraseOptions} / 短语表 ${multi.phraseTotal}`);

        /* sref 码筛选：勾选出现最多的那个码，卡片数应等于源数据里含该码的条数 */
        if (multi.topCode) {
          const codeFiltered = await page.evaluate(async (code) => {
            const box = document.querySelector(`#ex-srefcode .msel-row input[value="${code}"]`);
            if (!box) return { picked: false };
            document.querySelector('#ex-srefcode').open = true;
            box.checked = true;
            box.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 350));
            const expect = EXPLORE_JOBS.filter((j) =>
              String(j.sref || '').split(/\s+/).filter(Boolean).includes(code)).length;
            return {
              picked: true,
              count: parseInt(document.querySelector('.toolbar .dock-count')?.textContent || '0', 10),
              cards: document.querySelectorAll('.job-card').length,
              expect,
              hash: location.hash,
            };
          }, multi.topCode);
          check('按 sref 码筛选结果与源数据一致',
            codeFiltered.picked && codeFiltered.count === codeFiltered.expect,
            `命中 ${codeFiltered.count} / 期望 ${codeFiltered.expect}`);
          check('按 sref 码筛选进 URL（srefCode=）',
            String(codeFiltered.hash || '').includes('srefCode='), codeFiltered.hash);
          // 复位
          await page.evaluate(async (code) => {
            const box = document.querySelector(`#ex-srefcode .msel-row input[value="${code}"]`);
            if (box) { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); }
            await new Promise((r) => setTimeout(r, 250));
          }, multi.topCode);
        }

        /* 短语筛选：勾选最高频短语，卡片数应等于它的 df */
        if (multi.topPhrase) {
          const phraseFiltered = await page.evaluate(async (phrase) => {
            const det = document.querySelector('#ex-phrase');
            if (!det) return { picked: false };
            // 先展开 → 等懒加载把选项注进 DOM → 才找得到 checkbox
            det.open = true;
            await new Promise((r) => setTimeout(r, 300));
            const box = document.querySelector(`#ex-phrase .msel-row input[value="${CSS.escape(phrase)}"]`);
            if (!box) return { picked: false };
            box.checked = true;
            box.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 400));
            const idx = PHRASE_INDEX.build(EXPLORE_JOBS);
            const entry = idx.phrases.find((p) => p.phrase === phrase);
            const expect = entry ? entry.df : 0;
            return {
              picked: true,
              count: parseInt(document.querySelector('.toolbar .dock-count')?.textContent || '0', 10),
              expect,
              hash: location.hash,
            };
          }, multi.topPhrase);
          check('按短语筛选结果与 df 一致',
            phraseFiltered.picked && phraseFiltered.count === phraseFiltered.expect,
            `命中 ${phraseFiltered.count} / 期望 ${phraseFiltered.expect}`);
          check('按短语筛选进 URL（phrase=）',
            String(phraseFiltered.hash || '').includes('phrase='), phraseFiltered.hash);
          // 复位
          await page.evaluate(async (phrase) => {
            const det = document.querySelector('#ex-phrase');
            if (det) { det.open = true; await new Promise((r) => setTimeout(r, 200)); }
            const box = document.querySelector(`#ex-phrase .msel-row input[value="${CSS.escape(phrase)}"]`);
            if (box) { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); }
            await new Promise((r) => setTimeout(r, 250));
          }, multi.topPhrase);
        }

        /* ── 2.2 新增：对照视图（勾选两条 → 并排比较）──────────────────
           对照视图是独立一级视图；URL 形态 #compare?a=<引用键>&b=<引用键>。 */
        const cmpPicked = await page.evaluate(async () => {
          const boxes = [...document.querySelectorAll('.ex-card__cmp input[data-ex-cmp]')].slice(0, 2);
          if (boxes.length < 2) return { ok: false, reason: '首屏不足两个可勾选卡片' };
          boxes[0].checked = true;
          boxes[0].dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 250));
          const boxes2 = [...document.querySelectorAll('.ex-card__cmp input[data-ex-cmp]')].slice(0, 2);
          boxes2[1].checked = true;
          boxes2[1].dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 250));
          return {
            ok: true,
            bar: !!document.querySelector('[data-od-id="cmp-bar"]'),
            goBtn: !!document.querySelector('#ex-go-compare'),
            goDisabled: document.querySelector('#ex-go-compare')?.disabled ?? true,
          };
        });
        check('勾选两条后出现对照条与「去对照」入口',
          cmpPicked.ok && cmpPicked.bar && cmpPicked.goBtn && !cmpPicked.goDisabled,
          JSON.stringify(cmpPicked));

        const cmpView = await page.evaluate(async () => {
          const btn = document.querySelector('#ex-go-compare');
          if (!btn) return { ok: false, reason: '没有「去对照」按钮' };
          btn.click();
          await new Promise((r) => setTimeout(r, 500));
          return {
            ok: true,
            hash: location.hash,
            isCompareView: !!document.querySelector('[data-od-id="compare-head"]'),
            sides: document.querySelectorAll('.cmp-side').length,
            diffToks: document.querySelectorAll('.cmp-tok--only').length,
            metaRows: document.querySelectorAll('.cmp-meta tbody tr').length,
            decompRows: document.querySelectorAll('.cmp-decomp tbody tr').length,
            imgs: document.querySelectorAll('.cmp-side .job-sheet-imgs img').length,
            aParam: new URLSearchParams(location.hash.split('?')[1] || '').get('a'),
            bParam: new URLSearchParams(location.hash.split('?')[1] || '').get('b'),
          };
        });
        check('对照视图是独立一级视图',
          cmpView.ok && cmpView.isCompareView, cmpView.reason || cmpView.hash);
        check('对照 URL 形态为 #compare?a=…&b=…',
          String(cmpView.hash || '').startsWith('#compare?') && !!cmpView.aParam && !!cmpView.bParam,
          cmpView.hash);
        check('对照视图并排渲染两条',
          cmpView.sides === 2 && cmpView.imgs > 0, `侧栏 ${cmpView.sides} / 图 ${cmpView.imgs}`);
        check('对照视图有措辞差异 / 元数据 / 拆解三块',
          cmpView.metaRows === 5 && cmpView.decompRows === 7,
          `元数据 ${cmpView.metaRows} 行 / 拆解 ${cmpView.decompRows} 行`);

        /* 对照链接可分享：直接用 URL 打开另一条作业，仍能并排 */
        const cmpReload = await page.evaluate(async () => {
          const h = location.hash;
          location.hash = '#samples';
          await new Promise((r) => setTimeout(r, 300));
          location.hash = h;
          await new Promise((r) => setTimeout(r, 500));
          return {
            hash: location.hash,
            sides: document.querySelectorAll('.cmp-side').length,
            isCompare: !!document.querySelector('[data-od-id="compare-head"]'),
          };
        });
        check('对照链接可分享（重进 URL 仍并排）',
          cmpReload.isCompare && cmpReload.sides === 2,
          `${cmpReload.hash} / 侧栏 ${cmpReload.sides}`);

        // 回样本库，避免影响后续断言
        await page.evaluate(() => { location.hash = '#samples'; });
        await new Promise((r) => setTimeout(r, 300));

        /* 灯箱：选首屏里有七段拆解的作业（11-08 新增 15 条尚无拆解，另测空态分支） */
        const decomJob = await page.evaluate(() => {
          for (const c of document.querySelectorAll('.job-card[data-job]')) {
            const j = typeof EXPLORE_JOBS !== 'undefined'
              ? EXPLORE_JOBS.find((x) => x.id === c.dataset.job) : null;
            if (j?.decomposition && j.thumbs.length) return c.dataset.job;
          }
          return null;
        });
        await page.click(`.job-card[data-job="${decomJob}"]`);
        await page.waitForSelector('.job-sheet', { timeout: 8000 });
        const sheet = await page.evaluate((id) => {
          const job = typeof EXPLORE_JOBS !== 'undefined'
            ? EXPLORE_JOBS.find((x) => x.id === id) : null;
          const src = job?.decomposition?.source || '';
          const expect = {
            '手工精拆': '手工精拆 · 已验收基准',
            '逐条精拆': 'LLM 逐条精拆',
            '规则解析': '规则解析 · 未精拆',
            '未标注': '来源未标注',
          }[src] || '';
          const badge = document.querySelector('.job-sheet [data-role="decomp-source"]')?.textContent.trim() || '';
          return {
            rows: document.querySelectorAll('.decomp-row').length,
            imgs: document.querySelector('.job-sheet-imgs')?.children.length || 0,
            source: src,
            badge,
            badgeOk: !!expect && badge === expect,
          };
        }, decomJob);
        check('灯箱七段拆解可用', sheet.rows > 0 && sheet.imgs > 0 && sheet.badgeOk, JSON.stringify(sheet));

        /* 2.1 稳定引用键：灯箱里展示的键必须与数据一致，且能反查到这条作业。
           键是研究结论引用作业的唯一依据 —— 展示错了或对不上，结论就挂错证据。 */
        const refKey = await page.evaluate((id) => {
          const job = typeof EXPLORE_JOBS !== 'undefined'
            ? EXPLORE_JOBS.find((x) => x.id === id) : null;
          const expected = job && typeof JOB_KEY !== 'undefined' ? JOB_KEY.keyOf(job) : '';
          const shown = document.querySelector('.job-sheet code')?.textContent?.trim() || '';
          return {
            expected,
            shown,
            match: shown && shown === expected,
            byKey: expected ? EXPLORE_JOBS.filter((j) => JOB_KEY.keyOf(j) === expected).length : -1,
            hasCopyKey: !!document.querySelector('.job-sheet [data-role="copy-key"]'),
            hasCopyLink: !!document.querySelector('.job-sheet [data-role="copy-link"]'),
          };
        }, decomJob);
        check('灯箱展示的引用键与数据一致且唯一',
          refKey.match && refKey.byKey === 1 && refKey.hasCopyKey && refKey.hasCopyLink,
          JSON.stringify(refKey));

        /* 3.1 逐段送入「主体与环境」：空段无按钮 / 单段送入 / 多段追加 / 灯箱常开 */
        const segCase = await page.evaluate((id) => {
          const job = typeof EXPLORE_JOBS !== 'undefined'
            ? EXPLORE_JOBS.find((j) => j.id === id) : null;
          const segs = job?.decomposition?.segments || [];
          return {
            nonEmpty: segs.map((s, i) => ({ i, text: String(s.text ?? '').trim() })).filter((x) => x.text),
            emptyCount: segs.filter((s) => !String(s.text ?? '').trim()).length,
            total: segs.length,
          };
        }, decomJob);
        const btnIdx = await page.$$eval('.decomp-row [data-seg-action]',
          (els) => els.map((e) => Number(e.dataset.segIndex)));
        check('空段不显示送入按钮',
          segCase.total === 7 && segCase.emptyCount > 0
            && JSON.stringify(btnIdx) === JSON.stringify(segCase.nonEmpty.map((x) => x.i)),
          `按钮 ${btnIdx.length} 个 / 空段 ${segCase.emptyCount} 个 / 共 ${segCase.total} 段`);

        await page.evaluate(() => {
          const ta = document.getElementById('subject-input');
          if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        await new Promise((r) => setTimeout(r, 450)); // 等 .decomp-row 的 rise 动画结束再真实点击
        const first = segCase.nonEmpty[0];
        const second = segCase.nonEmpty[1];
        if (first) {
          await page.click(`.job-sheet [data-seg-index="${first.i}"]`);
          const afterFirst = await page.$eval('#subject-input', (el) => el.value);
          check('点击拆解段送入左栏', afterFirst === first.text,
            `期望 ${JSON.stringify(first.text)} / 实际 ${JSON.stringify(afterFirst)}`);
          if (second) {
            await page.click(`.job-sheet [data-seg-index="${second.i}"]`);
            const afterSecond = await page.$eval('#subject-input', (el) => el.value);
            check('再点一段按 ", " 追加', afterSecond === `${first.text}, ${second.text}`,
              `期望 ${JSON.stringify(first.text + ', ' + second.text)} / 实际 ${JSON.stringify(afterSecond)}`);
          } else {
            check('再点一段按 ", " 追加', false, '首条作业非空段不足 2 个');
          }
        } else {
          check('点击拆解段送入左栏', false, '未找到非空拆解段');
          check('再点一段按 ", " 追加', false, '未找到非空拆解段');
        }

        const stillOpen = await page.evaluate(() => !!document.querySelector('.job-sheet'));
        check('逐段送入后灯箱常开且零错误', stillOpen && errs.length === 0,
          `灯箱 ${stillOpen} / 错误 ${errs.length}`);
        await page.click('.job-sheet [data-role="close"]');

        /* 无拆解作业（若有）：按其真实批次筛选，验证灯箱走空态且零运行时错误。
           批次键从数据取，不写死日期；若日后补齐全部拆解，退化为验证有拆解作业的灯箱。 */
        const sheetTarget = await page.evaluate(() => {
          const jobs = typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS : [];
          const j = jobs.find((x) => !x.decomposition) || jobs.find((x) => x.decomposition);
          if (!j) return null;
          return { id: j.id, batch: j.batch, rows: j.decomposition ? j.decomposition.segments.length : 0 };
        });
        if (!sheetTarget) {
          check('灯箱拆解/空态与数据一致且不报错', false, '未找到可测作业');
        } else {
          await page.select('#ex-batch', sheetTarget.batch);
          await new Promise((r) => setTimeout(r, 250));
          await page.waitForSelector(`.job-card[data-job="${sheetTarget.id}"]`, { timeout: 8000 });
          const errsBeforeSheet = errs.length;
          await page.click(`.job-card[data-job="${sheetTarget.id}"]`);
          await page.waitForSelector('.job-sheet', { timeout: 8000 });
          await new Promise((r) => setTimeout(r, 350));
          const targetSheet = await page.evaluate(() => ({
            rows: document.querySelectorAll('.job-sheet .decomp-row').length,
            imgs: document.querySelectorAll('.job-sheet-imgs img').length,
            badge: document.querySelector('.job-sheet [data-role="decomp-source"]')?.textContent.trim() || '',
            badImgs: [...document.querySelectorAll('.job-sheet-imgs img')]
              .filter((i) => !i.getAttribute('src') || i.getAttribute('src') === 'undefined').length,
          }));
          check('灯箱拆解/空态与数据一致且不报错',
            targetSheet.rows === sheetTarget.rows && targetSheet.imgs === 4 && targetSheet.badImgs === 0
              // 有拆解必须出现来源徽章；无拆解走空态，不得出现徽章
              && (sheetTarget.rows === 0 ? targetSheet.badge === '' : targetSheet.badge.length > 0)
              && errs.length === errsBeforeSheet,
            JSON.stringify(targetSheet) + ` / 期望行 ${sheetTarget.rows} / 批次 ${sheetTarget.batch}`
              + ` / 新增错误 ${errs.length - errsBeforeSheet}`);
          await page.click('.job-sheet [data-role="close"]');
          await page.select('#ex-batch', '');
        }

        /* 所有下拉选项均有结果（不出现假空态） */
        const countText = () => page.$eval('.toolbar .dock-count', (el) => parseInt(el.textContent, 10));
        const options = await page.evaluate(() => ({
          batches: [...document.querySelectorAll('#ex-batch option')].filter((o) => o.value).map((o) => o.value),
          aspects: [...document.querySelectorAll('#ex-aspect option')].filter((o) => o.value).map((o) => o.value),
        }));
        const empty = [];
        for (const v of options.batches) {
          await page.select('#ex-batch', v);
          if (!(await countText() > 0)) empty.push('batch=' + v);
        }
        await page.select('#ex-batch', '');
        for (const v of options.aspects) {
          await page.select('#ex-aspect', v);
          if (!(await countText() > 0)) empty.push('aspect=' + v);
        }
        await page.select('#ex-aspect', '');
        check('所有下拉选项均有结果', empty.length === 0, empty.join(', '));

        /* 4. 旧会话 mj-session-v1 → v2 迁移 */
        await page.evaluate(() => {
          localStorage.removeItem('mj-session-v2');
          localStorage.setItem('mj-session-v1', JSON.stringify({
            selectedPrompts: [{
              categoryId: 'lighting', subCategoryId: 'light-color', promptId: 'soft-light',
              text: 'soft natural light', timestamp: 1700000000000, positionTag: 'lighting',
            }],
            subjectEnvironment: 'a quiet library, morning',
            parameterValues: { version: '8.2', ar: '16:9' },
            finalPromptEdited: 'my manually edited prompt --v 8.2',
            isFinalPromptManuallyEdited: true,
          }));
        });
        await page.reload({ waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 500));
        const migrated = await page.evaluate(() => {
          let v2 = null;
          try { v2 = JSON.parse(localStorage.getItem('mj-session-v2') || 'null'); } catch { v2 = null; }
          return {
            v2,
            legacyKept: localStorage.getItem('mj-session-v1') !== null,
            subject: document.querySelector('#subject-input')?.value || '',
            finalText: document.querySelector('#final-text')?.textContent || '',
          };
        });
        check('会话迁移写入 v2', !!migrated.v2 && migrated.v2.selected?.length === 1,
          migrated.v2 ? `selected=${migrated.v2.selected.length}` : 'v2 为空');
        check('会话字段映射正确',
          migrated.v2?.selected?.[0]?.en === 'soft natural light'
          && migrated.v2?.selected?.[0]?.position === 'lighting'
          && migrated.v2?.subject === 'a quiet library, morning'
          && migrated.v2?.manual === 'my manually edited prompt --v 8.2',
          JSON.stringify(migrated.v2?.selected?.[0] || {}));
        check('旧键未被删除（可回退）', migrated.legacyKept);
        check('迁移后界面恢复', migrated.subject === 'a quiet library, morning'
          && migrated.finalText.includes('my manually edited prompt'), migrated.finalText.slice(0, 80));

        /* 5. 旧主题键 theme → mj-theme */
        await page.evaluate(() => {
          localStorage.removeItem('mj-theme');
          localStorage.setItem('theme', 'light');
        });
        await page.reload({ waitUntil: 'load' });
        const theme = await page.evaluate(() => document.documentElement.dataset.theme);
        check('主题偏好迁移', theme === 'light', `实际 ${theme}`);

        /* 5.1 「展开全部参数」折叠态回归：任何参数 change 都会 renderDock() 全量重建 #dock，
           展开态若没保存 / 回填就会弹回收起（ADR-0017 Round 6）。双向都验，防止修成永远展开。 */
        const setParamOpen = (want) => page.evaluate((w) => {
          const d = document.querySelector('#param-details');
          if (!d) return false;
          if (d.open !== w) d.querySelector('summary').click();
          return d.open === w;
        }, want);
        const flipSelect = async () => {
          const opts = await page.evaluate(() => {
            const s = document.querySelector('#param-details select:not([disabled])');
            return s ? { cur: s.value, values: [...s.options].map((o) => o.value) } : null;
          });
          if (!opts) return false;
          const next = opts.values.find((v) => v !== opts.cur);
          if (next === undefined) return false;
          await page.select('#param-details select:not([disabled])', next);
          await new Promise((r) => setTimeout(r, 150));
          return true;
        };
        const paramOpen = () => page.evaluate(() => document.querySelector('#param-details')?.open === true);

        const expandedBefore = await setParamOpen(true);
        const flippedOpen = await flipSelect();
        check('展开全部参数后改选项仍保持展开',
          expandedBefore && flippedOpen && await paramOpen(),
          `改前 ${expandedBefore} / 改后 ${await paramOpen()} / 已改选项 ${flippedOpen}`);

        const collapsedBefore = await setParamOpen(false);
        await flipSelect();
        check('手动收起后改选项仍保持收起',
          collapsedBefore && !(await paramOpen()),
          `收起前 ${collapsedBefore} / 改后仍收起 ${!(await paramOpen())}`);
      }

      if (name === 'style-library.html') {
        await page.click('#style-tab-top');
        await new Promise((r) => setTimeout(r, 300));
        const top = await page.evaluate(() => ({
          cards: document.querySelectorAll('.sref-card').length,
          plates: document.querySelectorAll('.sref-card .img-plate').length,
          chips: document.querySelector('.head-meta')?.textContent.replace(/\s+/g, ' ').trim() || '',
          badImgs: [...document.querySelectorAll('img')].filter((i) => {
            const s = i.getAttribute('src');
            return !s || s === 'undefined';
          }).length,
        }));
        const topData = await page.evaluate(() => ({
          entries: typeof STYLES_TOP_ENTRIES !== 'undefined' ? STYLES_TOP_ENTRIES.length : -1,
          total: typeof STYLES_TOP_IMAGE_STATS !== 'undefined' ? STYLES_TOP_IMAGE_STATS.total : -1,
          withImages: typeof STYLES_TOP_IMAGE_STATS !== 'undefined' ? STYLES_TOP_IMAGE_STATS.withImages : -1,
        }));
        check('官方风格榜数据源与统计一致', topData.entries > 0 && topData.entries === topData.total,
          `条目 ${topData.entries} / 统计 ${topData.total}`);
        check('官方风格榜全量渲染', top.cards === topData.total, `实际 ${top.cards} / 期望 ${topData.total}`);
        // 每个无配图条目渲染 2 个占位（主图版位 + 题材样图版位），与统计差额对应。
        check('官方榜占位数量与统计一致', top.plates === 2 * (topData.total - topData.withImages),
          `占位 ${top.plates} / 期望 ${2 * (topData.total - topData.withImages)}`);
        check('官方榜配图如实标注', top.chips.includes(`官方榜配图 ${topData.withImages} / ${topData.total}`), top.chips);
        check('官方榜无破图 img', top.badImgs === 0, `实际 ${top.badImgs}`);
      }

      check(`${name} 零运行时错误`, errs.length === 0, errs.slice(0, 3).join(' | '));
      await page.close();
    }

    /* 6. 旧独立页 explore.html 跳转到研究样本库一级视图（报告 4.2） */
    {
      const { page } = await openPage(browser, 'explore.html');
      let ok = false;
      try {
        await page.waitForFunction(() => location.hash === '#samples' && !!document.querySelector('#view-samples'), { timeout: 8000 });
        ok = true;
      } catch { /* 超时即失败 */ }
      check('explore.html 跳转到 #samples', ok, await page.evaluate(() => location.hash));
      await page.close();
    }

    /* 7. 旧页签深链 #/explore?... → #samples（报告 4.2：探索榜升为一级视图）
       旧的 #explore 仍要能用 —— 重定向到研究样本库，不报错、不静默。 */
    {
      const { page } = await openPage(browser, 'index.html', '#/explore?d=2026-11-05&ar=9:16');
      const state = await page.evaluate(() => ({
        hash: location.hash,
        active: document.querySelector('#view-samples')?.getAttribute('aria-selected'),
      }));
      check('旧探索榜深链重定向到研究样本库',
        state.hash === '#explore' && state.active === 'true', JSON.stringify(state));
      await page.close();
    }

    /* 7a. 统一筛选引擎 + 一级视图（报告 3.4 / 4.2）
       筛选状态以 URL hash 为唯一来源（ADR-0010）：刷新 / 后退 / 分享都能复现。 */
    {
      /* 7a-1. 研究样本库：选批次 → URL 带参数 → 刷新后复现 */
      const { page } = await openPage(browser, 'index.html', '#samples');
      await page.waitForSelector('#ex-batch', { timeout: 15000 });

      const batchValue = await page.evaluate(() => {
        const sel = document.querySelector('#ex-batch');
        const opt = [...sel.options].find((o) => o.value);
        return opt ? opt.value : '';
      });
      await page.select('#ex-batch', batchValue);
      await new Promise((r) => setTimeout(r, 600));

      const afterFilter = await page.evaluate(() => ({
        hash: location.hash,
        batch: document.querySelector('#ex-batch')?.value,
        cards: document.querySelectorAll('.job-card').length,
        total: (typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS.length : 0),
      }));
      check('筛选状态进 URL（batch=）',
        afterFilter.hash.includes('batch='), afterFilter.hash);
      check('筛选真的生效（卡片数少于全量）',
        afterFilter.cards > 0 && afterFilter.cards < afterFilter.total,
        `${afterFilter.cards} / ${afterFilter.total}`);
      await page.close();

      // 用同一个 hash 重新打开 —— 验证「刷新后复现」
      const { page: page2 } = await openPage(browser, 'index.html', afterFilter.hash);
      await page2.waitForSelector('#ex-batch', { timeout: 15000 });
      const afterReload = await page2.evaluate(() => ({
        view: document.querySelector('[data-view][aria-selected="true"]')?.dataset.view,
        batch: document.querySelector('#ex-batch')?.value,
        cards: document.querySelectorAll('.job-card').length,
      }));
      check('刷新后筛选被复现（仍在研究样本库）',
        afterReload.view === 'samples' && afterReload.batch === batchValue,
        `view=${afterReload.view} batch=${afterReload.batch}`);
      check('刷新后结果数一致',
        afterReload.cards === afterFilter.cards,
        `${afterFilter.cards} → ${afterReload.cards}`);
      await page2.close();

      /* 7a-2. 提示词库侧：分面词筛选也进 URL */
      {
        const { page: p3 } = await openPage(browser, 'index.html', '#artists');
        await p3.waitForSelector('[data-toggle="facets"]', { timeout: 15000 });
        await p3.evaluate(() => document.querySelector('[data-toggle="facets"]').click());
        await new Promise((r) => setTimeout(r, 600));
        const hasTerms = await p3.evaluate(() => document.querySelectorAll('[data-term]').length);
        check('分面板渲染出分面词', hasTerms > 0, `${hasTerms} 个`);

        await p3.evaluate(() => document.querySelector('[data-term]')?.click());
        await new Promise((r) => setTimeout(r, 600));
        const libHash = await p3.evaluate(() => location.hash);
        check('分面词筛选进 URL（terms=）', libHash.includes('terms='), libHash);
        await p3.close();
      }

      /* 7a-3. 不认识的参数被丢弃并提示（ADR-0010：不静默忽略） */
      {
        // toast 只活 1.9 秒 —— openPage 已经等了 700ms，这里不能再等
        const { page: p4 } = await openPage(browser, 'index.html', '#samples?zzz=1&q=portrait');
        await p4.waitForSelector('#ex-search', { timeout: 15000 });
        const unknown = await p4.evaluate(() => ({
          ignored: (typeof ui !== 'undefined' && ui.ignoredParams) ? ui.ignoredParams : null,
          q: (typeof ui !== 'undefined') ? ui.q : null,
          hash: location.hash,
          toast: document.querySelector('.toast')?.textContent || '',
        }));
        check('不支持的参数被记录',
          Array.isArray(unknown.ignored) && unknown.ignored.includes('zzz'),
          JSON.stringify(unknown.ignored));
        check('支持的参数照常生效',
          unknown.q === 'portrait', String(unknown.q));
        check('不支持的参数有提示（不静默忽略）',
          unknown.toast.includes('忽略'), unknown.toast.replace(/\s+/g, ' ').trim().slice(0, 60));
        await p4.close();
      }

      /* 7a-4. 引擎本体：URL 往返一致（build → parse 得到同一状态） */
      {
        const { page: p5 } = await openPage(browser, 'index.html', '#samples');
        const roundTrip = await p5.evaluate(() => {
          const src = EXPLORE_FILTER_SOURCE;
          const st = {
            q: 'portrait',
            dims: { batch: '2026-11-10', aspect: '1:1', sref: true },
          };
          const hash = FILTER_ENGINE.buildHash(src, 'samples', st);
          const parsed = FILTER_ENGINE.parseHash(src, hash);
          return {
            hash,
            same: FILTER_ENGINE.sameState(parsed.state, st),
            ignored: parsed.ignored,
          };
        });
        check('筛选引擎 URL 往返一致', roundTrip.same === true, roundTrip.hash);
        check('引擎往返不产生被丢弃参数', roundTrip.ignored.length === 0,
          JSON.stringify(roundTrip.ignored));
        await p5.close();
      }
    }

    /* 7b. 作业稳定引用键 + 深链直达（报告 2.1）
        #explore?job=<key> 应当直接打开那条作业的灯箱 ——
        这是「研究结论能挂到具体证据上」的技术前提。 */
    {
      // 先开一个普通页面取一个带拆解的作业键
      const anyKey = await (async () => {
        const { page } = await openPage(browser, 'index.html', '#samples');
        const k = await page.evaluate(() => {
          if (typeof EXPLORE_JOBS === 'undefined') return null;
          const j = EXPLORE_JOBS.find((x) => x.decomposition && x.thumbs.length);
          return j && typeof JOB_KEY !== 'undefined' ? JOB_KEY.keyOf(j) : null;
        });
        await page.close();
        return k;
      })();

      if (!anyKey) {
        check('作业引用键深链直达', false, '数据里找不到带拆解的作业');
      } else {
        const { page } = await openPage(browser, 'index.html', `#samples?job=${encodeURIComponent(anyKey)}`);
        let opened = false;
        try {
          await page.waitForSelector('.job-sheet', { timeout: 8000 });
          opened = true;
        } catch { /* 超时即失败 */ }
        const deep = await page.evaluate((k) => ({
          shownKey: document.querySelector('.job-sheet code')?.textContent?.trim() || '',
          hash: location.hash,
          job: k,
        }), anyKey);
        check('作业引用键深链直达灯箱',
          opened && deep.shownKey === anyKey && deep.hash.includes('job='),
          `键 ${anyKey} / 页面显示 ${deep.shownKey} / hash ${deep.hash}`);

        // 关闭灯箱后 URL 应清掉 job 参数（否则地址栏留着已关掉的引用）
        await page.evaluate(() => document.querySelector('.job-sheet [data-role="close"]')?.click());
        await new Promise((r) => setTimeout(r, 300));
        const afterClose = await page.evaluate(() => location.hash);
        check('关闭灯箱后 URL 清掉 job 参数', !afterClose.includes('job='), `hash = ${afterClose}`);
        await page.close();
      }
    }

    /* 7c. 研究记录与结论落盘（报告 2.3 / 第 6 步）——
       观察记录与结论存在本机 IndexedDB：一条样本 ↔ 多条观察（可打标签），
       结论单独一层、指向它依据的样本集合。断言覆盖：
         · 灯箱能写观察记录，且记录真的落库
         · 研究视图能看到记录、按标签聚合
         · 结论能建、能挂样本
         · 灯箱里能看到这条样本的观察与结论
         · 存储不可用时如实提示，不静默
       注意：断言跑完会清空本机研究库（这是测试数据，不是用户数据）。 */
    {
      const { page } = await openPage(browser, 'index.html', '#samples');
      const key = await page.evaluate(() => {
        if (typeof EXPLORE_JOBS === 'undefined' || typeof JOB_KEY === 'undefined') return null;
        const j = EXPLORE_JOBS.find((x) => x.decomposition && x.thumbs.length);
        return j ? JOB_KEY.keyOf(j) : null;
      });

      if (!key) {
        check('研究记录：数据里找不到带拆解的作业', false, '无法取到引用键');
      } else {
        // 清场：断言用固定样本，不能污染用户已有的研究数据
        await page.evaluate(async () => {
          try { await RESEARCH_DB.clearAll(); } catch { /* 忽略 */ }
        });

        // 存储可用性
        const storeStatus = await page.evaluate(() => RESEARCH_DB.status());
        check('研究数据层可用（IndexedDB）', storeStatus.available === true, JSON.stringify(storeStatus));

        // 走完整 UI 路径：灯箱 → 写观察 → 保存
        await page.evaluate((k) => { location.hash = `#samples?job=${encodeURIComponent(k)}`; }, key);
        let sheetOk = false;
        try {
          await page.waitForSelector('.job-sheet [data-role="write-note"]', { timeout: 8000 });
          sheetOk = true;
        } catch { /* 超时即失败 */ }
        check('灯箱有「写观察」入口', sheetOk, `引用键 ${key}`);

        await page.evaluate(() => document.querySelector('.job-sheet [data-role="write-note"]')?.click());
        let dialogOk = false;
        try {
          await page.waitForSelector('[data-od-id="note-sheet"] #rv-note-body', { timeout: 8000 });
          dialogOk = true;
        } catch { /* 超时即失败 */ }
        check('观察记录弹层可打开', dialogOk);

        await page.evaluate(() => {
          const b = document.querySelector('#rv-note-body');
          const t = document.querySelector('#rv-note-tags');
          if (b) b.value = 'verify 断言写入的观察';
          if (t) t.value = '断言标签';
        });
        await page.evaluate(() => document.querySelector('[data-od-id="note-sheet"] [data-role="save"]')?.click());
        await new Promise((r) => setTimeout(r, 700));

        const stored = await page.evaluate(async (k) => {
          const rows = await RESEARCH_DB.notesByJob(k);
          return { n: rows.length, body: rows[0]?.body || '', tags: rows[0]?.tags || [] };
        }, key);
        check('观察记录真的落库且挂在该样本上',
          stored.n === 1 && stored.body.includes('verify 断言写入的观察') && stored.tags.includes('断言标签'),
          JSON.stringify({ n: stored.n, tags: stored.tags }));

        // 灯箱里的计数与列表要跟着刷新（保存发生在嵌套弹层里，靠 researchchange 事件同步）
        const inSheet = await page.evaluate(() => ({
          count: document.querySelector('.job-sheet [data-role="note-count"]')?.textContent || '',
          list: document.querySelector('.job-sheet [data-role="note-list"]')?.textContent || '',
        }));
        check('灯箱显示该样本的观察记录',
          /观察 1/.test(inSheet.count) && inSheet.list.includes('verify 断言写入的观察'),
          inSheet.count.trim());

        // 研究视图：能看到记录 + 标签聚合
        await page.evaluate(() => { location.hash = '#research'; });
        await new Promise((r) => setTimeout(r, 900));
        const rv = await page.evaluate(() => ({
          head: document.querySelector('[data-od-id="research-head"]')?.textContent || '',
          cards: document.querySelectorAll('[data-rv-note]').length,
          tags: [...document.querySelectorAll('[data-rv-tag]')].map((b) => b.textContent.trim()),
          body: document.querySelector('[data-od-id="research-notes"]')?.textContent || '',
        }));
        check('研究视图显示观察记录',
          rv.cards === 1 && rv.body.includes('verify 断言写入的观察') && /观察记录 1 条/.test(rv.head),
          `卡片 ${rv.cards} / 标签 ${JSON.stringify(rv.tags)}`);
        check('研究视图按标签聚合',
          rv.tags.some((t) => t.includes('断言标签')),
          JSON.stringify(rv.tags));

        // 结论：能建、能挂样本
        await page.evaluate(() => document.querySelector('[data-rv-new-conclusion]')?.click());
        let cOk = false;
        try {
          await page.waitForSelector('[data-od-id="conclusion-sheet"] #rv-c-body', { timeout: 8000 });
          cOk = true;
        } catch { /* 超时即失败 */ }
        check('结论弹层可打开', cOk);

        await page.evaluate((k) => {
          const body = document.querySelector('#rv-c-body');
          const keys = document.querySelector('#rv-c-keys');
          const title = document.querySelector('#rv-c-title');
          if (title) title.value = 'verify 断言结论';
          if (body) body.value = 'verify 断言写入的结论';
          if (keys) keys.value = k;
        }, key);
        await page.evaluate(() => document.querySelector('[data-od-id="conclusion-sheet"] [data-role="save"]')?.click());
        await new Promise((r) => setTimeout(r, 700));

        const cons = await page.evaluate(async (k) => {
          const all = await RESEARCH_DB.allConclusions();
          const byJob = await RESEARCH_DB.conclusionsByJob(k);
          return { total: all.length, byJob: byJob.length, keys: all[0]?.jobKeys || [] };
        }, key);
        check('结论落库并挂上依据的样本',
          cons.total === 1 && cons.byJob === 1 && cons.keys[0] === key,
          JSON.stringify(cons.keys));

        // 结论视图
        await page.evaluate(() => document.querySelector('[data-rv-section="conclusions"]')?.click());
        await new Promise((r) => setTimeout(r, 600));
        const cView = await page.evaluate(() => ({
          n: document.querySelectorAll('[data-rv-conclusion]').length,
          text: document.querySelector('[data-od-id="research-conclusions"]')?.textContent || '',
        }));
        check('结论视图显示结论与其依据样本',
          cView.n === 1 && /依据 1 条样本/.test(cView.text),
          `结论 ${cView.n} 条`);

        // 统计
        const st = await page.evaluate(async () => await RESEARCH_DB.stats());
        check('研究数据统计正确',
          st.notes === 1 && st.conclusions === 1 && st.jobs === 1,
          JSON.stringify(st));

        // 导出
        const exp = await page.evaluate(() => {
          try {
            const o = JSON.parse(RESEARCH_VIEW.exportJson());
            return { ok: true, notes: o['观察记录'].length, cons: o['结论'].length };
          } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
        });
        check('研究数据可导出为 JSON',
          exp.ok && exp.notes === 1 && exp.cons === 1,
          JSON.stringify(exp));

        // 灯箱里能看到结论（依据集合包含这条样本的结论）
        await page.evaluate((k) => { location.hash = `#samples?job=${encodeURIComponent(k)}`; }, key);
        await new Promise((r) => setTimeout(r, 900));
        const sheetAll = await page.evaluate(() => document.querySelector('[data-role="note-list"]')?.textContent || '');
        check('灯箱同时显示该样本的观察与结论',
          sheetAll.includes('verify 断言写入的观察') && sheetAll.includes('verify 断言写入的结论'),
          sheetAll.replace(/\s+/g, ' ').trim().slice(0, 90));

        // 清场：断言数据不留给用户
        await page.evaluate(async () => { try { await RESEARCH_DB.clearAll(); } catch { /* 忽略 */ } });
        await page.close();
      }
    }

    /* 8. 旧风格码深链跨页跳转到 style-library.html */
    {
      const { page } = await openPage(browser, 'index.html', '#/style-codes?pick=1');
      let ok = false;
      try {
        await page.waitForFunction(() => location.pathname.endsWith('style-library.html'), { timeout: 8000 });
        ok = true;
      } catch { /* 超时即失败 */ }
      check('旧风格码深链跨页跳转', ok, await page.evaluate(() => location.pathname.split('/').pop()));
      await page.close();
    }

    /* 9. 窄屏回归基线（Q11）：只断言渲染与零错误，遮挡作为已知缺陷登记、不计失败 */
    for (const name of ['index.html', 'style-library.html']) {
      const { page, errs } = await openPage(browser, name, '', NARROW);
      const info = await page.evaluate(() => {
        // 一级视图（报告 4.2）：窄屏遮挡的探测对象从旧页签改为一級视图按钮
        const tab = document.querySelector('#view-samples');
        let blocked = false;
        let hitTag = 'none';
        if (tab) {
          const r = tab.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit) {
            hitTag = hit.tagName + '.' + (typeof hit.className === 'string' ? hit.className : '');
            blocked = hit !== tab && !tab.contains(hit);
          }
        }
        return {
          appbar: document.querySelector('#appbar')?.children.length || 0,
          dock: document.querySelector('#dock')?.children.length || 0,
          pageEl: document.querySelector('#page')?.children.length || 0,
          blocked, hitTag,
        };
      });
      check(`${name} 800×600 渲染`, info.appbar > 0 && info.dock > 0 && info.pageEl > 0,
        JSON.stringify({ appbar: info.appbar, dock: info.dock, pageEl: info.pageEl }));
      check(`${name} 800×600 零运行时错误`, errs.length === 0, errs.slice(0, 3).join(' | '));
      if (name === 'index.html') {
        note('窄屏页签遮挡（既有缺陷，不计失败）',
          `${info.blocked ? '仍存在' : '已消失'} · 命中 ${info.hitTag} · 修复留待单独视觉轮次`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL: ' + e.message);
  process.exitCode = 1;
});
