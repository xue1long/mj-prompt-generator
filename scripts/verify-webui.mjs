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
        const tabs = await page.$$eval('[role="tab"]', (els) => els.length);
        check('工作台 6 个页签', tabs === 6, `实际 ${tabs}`);

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

        /* 3. 探索榜页签：分页、筛选、占位、灯箱 */
        await page.click('#tab-explore');
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

    /* 6. 旧独立页 explore.html 跳转到工作台探索榜页签 */
    {
      const { page } = await openPage(browser, 'explore.html');
      let ok = false;
      try {
        await page.waitForFunction(() => location.hash === '#explore' && !!document.querySelector('#tab-explore'), { timeout: 8000 });
        ok = true;
      } catch { /* 超时即失败 */ }
      check('explore.html 跳转到 #explore', ok, await page.evaluate(() => location.hash));
      await page.close();
    }

    /* 7. 旧页签深链 #/explore?... → #explore */
    {
      const { page } = await openPage(browser, 'index.html', '#/explore?d=2026-11-05&ar=9:16');
      const state = await page.evaluate(() => ({
        hash: location.hash,
        active: document.querySelector('#tab-explore')?.getAttribute('aria-selected'),
      }));
      check('旧探索榜深链重定向', state.hash === '#explore' && state.active === 'true', JSON.stringify(state));
      await page.close();
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
        const tab = document.querySelector('#tab-explore');
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
