/**
 * 静态 WebUI 冒烟校验（ADR-0017）。
 *
 * 不依赖 dev server：直接以 file:// 打开 webui/ 下的页面。
 *   npm run verify                           校验源码 webui/
 *   node scripts/verify-webui.mjs --dist    校验构建产物 dist/
 *
 * 覆盖：四屏渲染、全量数据契约、筛选无假空态、分页、配图覆盖与空态降级、会话 / 主题 / 旧 hash
 * 迁移、窄屏回归基线。「首屏可见的一级视图按钮必须点得到」是**断言**，不是 NOTE：
 * 此前用 elementFromPoint 判遮挡，元素在视口外时它返回 null，把「在视口外」误判成
 * 「已消失」，掩盖了 166px 固定底条盖住按钮的实情（见第 9 组）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';

/** 第 12 组起本机服务用：让 OS 分配一个空闲端口，避免撞上用户已开的 5173。 */
function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

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
/* 真正的手机宽度。此前只用 800×600 当「窄屏」，恰好漏掉了固定底条盖住
   一级视图按钮的区间（见第 9 组断言）。 */
const MOBILE = { width: 390, height: 844 };

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

async function openPage(browser, name, hash = '', viewport = DESKTOP) {
  const page = await browser.newPage();
  // 桌面视口下页签中心点可点击；≤560px 固定底条已折叠成一行，不再遮挡导航。
  await page.setViewport(viewport);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => errs.push('reqfail: ' + r.url().slice(-100)));

  /* toast 观察器（先于页面脚本执行就挂上）。
     toast 只活 1.9 s，而 goto 等的是 load 事件 —— 页面脚本越多 load 越晚，
     「load 之后固定等 700 ms 再查 toast」就会在 toast 已过期后才查，
     断言变成赌运气（实测：加 3 个 script 标签后从偶发失败变成稳定失败）。
     改成**记录出现过的所有 toast**，断言就不依赖它现在还在不在 DOM 里。 */
  await page.evaluateOnNewDocument(() => {
    window.__toasts = [];
    const push = (txt) => { try { window.__toasts.push(String(txt || '')); } catch { /* 忽略 */ } };
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains('toast')) push(n.textContent);
        }
      }
    /* 观察目标必须是 document 而不是 document.documentElement ——
       evaluateOnNewDocument 在「文档已建、元素树还没长出来」时执行，
       此刻 documentElement 仍是 null，observe(null) 会抛 TypeError。 */
    }).observe(document, { childList: true, subtree: true });
  });

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
    /* 1. 三屏渲染 + 零错误（每屏的所有交互做完后才判定零错误）
       ADR-0034：样本库 / 风格榜升为顶栏独立页，纳入三屏循环基线。 */
    for (const name of ['index.html', 'samples.html', 'styles-top.html', 'gallery.html', 'style-library.html']) {
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

        // 2.2 / 2.4 / 2.6 / 2.9：对照、研究笔记、候选词条、资料库仍是一级视图。
        // ADR-0034：样本库 / 风格榜已升为顶栏独立页，不再进 VIEWS。
        const viewIds = await page.evaluate(() =>
          [...document.querySelectorAll('[data-view]')].map(b => b.dataset.view));
        check('对照是一级视图',
          viewIds.includes('compare'), viewIds.join(','));
        check('候选词条是一级视图',
          viewIds.includes('candidates'), viewIds.join(','));
        check('资料库是一级视图',
          viewIds.includes('materials'), viewIds.join(','));
        check('样本库 / 风格榜已移出工作台一级视图（ADR-0034）',
          !viewIds.includes('samples') && !viewIds.includes('styles-top'), viewIds.join(','));
        check('二级页签里没有「探索榜」（它已升为独立页）',
          !(await page.evaluate(() => !!document.querySelector('[data-tab="explore"]'))));

        // ADR-0034：顶栏顺序 + 工作台路标。这是本次迁移的核心验收。
        const nav = await page.evaluate(() => ({
          labels: [...document.querySelectorAll('.mainnav a')].map(a => a.textContent.trim()),
          sampleLink: !!document.querySelector('[data-od-id="samples-nav-link"]'),
          styleLink: !!document.querySelector('[data-od-id="styles-top-nav-link"]'),
        }));
        const expectNav = ['工作台', '艺术家库', '样本库', '风格榜', '画廊', '风格库', '风格与类型库'];
        check('顶栏顺序 = 工作台 → 艺术家库 → 样本库 → 风格榜 → 画廊 → 风格库 → 风格与类型库',
          JSON.stringify(nav.labels) === JSON.stringify(expectNav), nav.labels.join(' / '));
        check('工作台一级视图条末尾留样本库 / 风格榜路标',
          nav.sampleLink && nav.styleLink,
          `样本库 ${nav.sampleLink} / 风格榜 ${nav.styleLink}`);

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
        /* 第 13 步：缺口必须归零。规则解析已补齐全部缺失项，
           所以「待精拆」从 29 变成 0 —— 这里钉住它，避免以后采集到新作业后
           悄悄退回去（界面不会报错，只是灯箱空着，没人发现）。 */
        check('拆解缺口归零（第 13 步）', data.noDecomp === 0,
          `仍有 ${data.noDecomp} 条无拆解`);
        check('探索榜配图为 public 全量', data.imageMode === 'public' && data.withImages === data.total,
          `${data.imageMode} / ${data.withImages} / ${data.total}`);
        // sref 如实透传：源快照有值就有值，无值就是 null。历史事故——构建期硬编码 null，
        // 断言也跟着写成 0，等于把 bug 固化成验收标准。现改为与源数据条数比对。
        check('sref 如实透传（非杜撰、非丢弃）', data.sref === EXPECT_SREF, `实际 ${data.sref} / 期望 ${EXPECT_SREF}`);

        /* 3. 研究样本库（ADR-0034 顶栏独立页）：分页、筛选、占位、灯箱
           整组在 samples.html 上跑；index.html 的 page 保留给后续会话 / 参数断言。 */
        const { page: sp, errs: spErrs } = await openPage(browser, 'samples.html', '#samples');
        await sp.waitForSelector('.job-card', { timeout: 15000 });
        const board = await sp.evaluate(() => ({
          cards: document.querySelectorAll('.job-card').length,
          plates: document.querySelectorAll('.job-thumbs .img-plate').length,
          chips: document.querySelector('.head-meta')?.textContent.replace(/\s+/g, ' ').trim() || '',
          batches: [...document.querySelectorAll('#ex-batch option')].filter((o) => o.value).length,
          mediumOpts: document.querySelectorAll('#ex-medium .msel-row').length,
          subjectOpts: document.querySelectorAll('#ex-subject .msel-row').length,
          mediumLabel: document.querySelector('#ex-medium .msel-label')?.textContent || '',
          subjectLabel: document.querySelector('#ex-subject .msel-label')?.textContent || '',
          taxHint: document.querySelector('#ex-medium')?.getAttribute('title') || '',
          /* ADR-0028 下线的四个控件。留着空壳比删掉更糟 —— 用户会以为筛选坏了。 */
          legacy: ['#ex-aspect', '#ex-sref', '#ex-srefcode', '#ex-decomp-trusted']
            .filter((s) => document.querySelector(s)),
          more: !!document.querySelector('[data-role="ex-more"]'),
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
        check('批次下拉与数据源一致', board.batches === data.batches,
          `${board.batches} / ${data.batches}`);
        check('已下线的筛选控件不再出现', board.legacy.length === 0, board.legacy.join(','));
        /* 两轴分类控件：档位必须来自 SAMPLE_TAXONOMY（不在这里另抄一份），
           且标签常驻「规则推算」后缀 —— tooltip 不会被截图带走（ADR-0028）。 */
        check('两轴分类控件存在且标明「规则推算」',
          board.mediumOpts === 7 && board.subjectOpts === 7
          && board.mediumLabel.includes('表现媒介') && board.mediumLabel.includes('规则推算')
          && board.subjectLabel.includes('画面主体') && board.subjectLabel.includes('规则推算')
          && board.taxHint.includes('规则推算'),
          JSON.stringify(board));
        /* 分面计数不重不漏：各档之和必须等于作业总数。
           「每层单值互斥」是这个恒等式成立的前提（ADR-0028）——
           哪天规则改成一条多处命中，这条会先红。
           注意读的是 .msel-n（计数），不是 .msel-row（选项）。 */
        const axisSum = await sp.evaluate(() => {
          const nums = (sel) => [...document.querySelectorAll(sel)]
            .map((e) => parseInt(e.textContent, 10) || 0);
          return {
            medium: nums('#ex-medium .msel-n').reduce((a, b) => a + b, 0),
            subject: nums('#ex-subject .msel-n').reduce((a, b) => a + b, 0),
            total: EXPLORE_JOBS.length,
          };
        });
        check('两轴分面计数之和 = 作业总数（不重不漏）',
          axisSum.medium === axisSum.total && axisSum.subject === axisSum.total,
          JSON.stringify(axisSum));
        check('无破图 img', board.badImgs === 0, `实际 ${board.badImgs}`);

        /* 两轴筛选端到端：勾「人像 / 人物」后命中数必须等于该档的分类计数。
           期望值用 SAMPLE_TAXONOMY 现算，不写死数字 —— 词表调一次数字就变。 */
        const axisFiltered = await sp.evaluate(async () => {
          const det = document.querySelector('#ex-subject');
          if (!det) return { picked: false };
          det.open = true;
          const box = document.querySelector('#ex-subject .msel-row input[value="person"]');
          if (!box) return { picked: false };
          box.checked = true;
          box.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 450));
          const expect = EXPLORE_JOBS.filter((j) => SAMPLE_TAXONOMY.subjectOf(j) === 'person').length;
          return {
            picked: true,
            count: parseInt(document.querySelector('.toolbar .dock-count')?.textContent || '0', 10),
            expect,
            hash: location.hash,
          };
        });
        check('按画面主体筛选结果与分类计数一致',
          axisFiltered.picked && axisFiltered.count === axisFiltered.expect,
          `命中 ${axisFiltered.count} / 期望 ${axisFiltered.expect}`);
        check('按画面主体筛选进 URL（subject=）',
          String(axisFiltered.hash || '').includes('subject=person'), axisFiltered.hash);
        // 复位，避免影响后续断言
        await sp.evaluate(async () => {
          const box = document.querySelector('#ex-subject .msel-row input[value="person"]');
          if (box) { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); }
          await new Promise((r) => setTimeout(r, 300));
        });

        await sp.click('[data-role="ex-more"]');
        await new Promise((r) => setTimeout(r, 200));
        const afterMore = await sp.$$eval('.job-card', (els) => els.length);
        check('加载更多 +60', afterMore === 120, `实际 ${afterMore}`);

        /* ── 2.2 提示词短语筛选（多选下拉，懒加载）──────────────────────
           断言口径：筛出的卡片数 == 源数据里真正含该短语的条数，
           且 URL 里带上了对应参数（ADR-0010：hash 是筛选的唯一来源）。
           逐条穷举的选项不内联：571 条短语全塞进 toolbar 会让它涨到 177 KB。 */
        await sp.evaluate(() => {
          const det = document.querySelector('#ex-phrase');
          if (det) det.open = true;
        });
        await new Promise((r) => setTimeout(r, 600));

        const multi = await sp.evaluate(() => {
          const idx = PHRASE_INDEX.build(EXPLORE_JOBS);
          const p0 = idx.phrases[0];
          return {
            topPhrase: p0 ? p0.phrase : '',
            phraseTotal: idx.phrases.length,
            hasPhraseMsel: !!document.querySelector('#ex-phrase'),
            phraseOptions: document.querySelectorAll('#ex-phrase .msel-row').length,
          };
        });
        check('短语下拉存在且列出全部收录短语',
          multi.hasPhraseMsel && multi.phraseOptions === multi.phraseTotal && multi.phraseTotal > 0,
          `选项 ${multi.phraseOptions} / 短语表 ${multi.phraseTotal}`);

        /* 短语筛选：勾选最高频短语，卡片数应等于它的 df */
        if (multi.topPhrase) {
          const phraseFiltered = await sp.evaluate(async (phrase) => {
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
          await sp.evaluate(async (phrase) => {
            const det = document.querySelector('#ex-phrase');
            if (det) { det.open = true; await new Promise((r) => setTimeout(r, 200)); }
            const box = document.querySelector(`#ex-phrase .msel-row input[value="${CSS.escape(phrase)}"]`);
            if (box) { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); }
            await new Promise((r) => setTimeout(r, 250));
          }, multi.topPhrase);
        }

        /* ── 2.2 新增：对照视图（勾选两条 → 并排比较）──────────────────
           对照视图是独立一级视图；URL 形态 #compare?a=<引用键>&b=<引用键>。 */
        const cmpPicked = await sp.evaluate(async () => {
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

        /* ADR-0034：样本库独立页点「去对照」跨页跳回工作台的对照一级视图。
           先在 sp 上钩住跳转目标，再用新页打开同一 URL 验证并排渲染。 */
        const cmpNav = await Promise.all([
          sp.waitForNavigation({ timeout: 15000 }).catch(() => null),
          sp.evaluate(() => {
            const btn = document.querySelector('#ex-go-compare');
            if (!btn) return false;
            btn.click();
            return true;
          }),
        ]);
        const cmpUrl = sp.url();
        const cmpHash = new URL(cmpUrl).hash;
        check('样本库「去对照」跨页跳回工作台',
          cmpNav[0] && cmpUrl.endsWith(`index.html${cmpHash}`) && cmpHash.startsWith('#compare?'),
          cmpUrl);
        const aParam = new URLSearchParams(cmpHash.split('?')[1] || '').get('a');
        const bParam = new URLSearchParams(cmpHash.split('?')[1] || '').get('b');
        check('对照 URL 形态为 #compare?a=…&b=…',
          !!aParam && !!bParam, cmpHash);
        const { page: cp } = await openPage(browser, 'index.html', cmpHash);
        const cmpView = await cp.evaluate(() => ({
          isCompareView: !!document.querySelector('[data-od-id="compare-head"]'),
          sides: document.querySelectorAll('.cmp-side').length,
          metaRows: document.querySelectorAll('.cmp-meta tbody tr').length,
          decompRows: document.querySelectorAll('.cmp-decomp tbody tr').length,
          imgs: document.querySelectorAll('.cmp-side .job-sheet-imgs img').length,
        }));
        check('对照视图是工作台一级视图',
          cmpView.isCompareView, JSON.stringify(cmpView));
        check('对照视图并排渲染两条',
          cmpView.sides === 2 && cmpView.imgs > 0, `侧栏 ${cmpView.sides} / 图 ${cmpView.imgs}`);
        check('对照视图有措辞差异 / 元数据 / 拆解三块',
          cmpView.metaRows === 5 && cmpView.decompRows === 7,
          `元数据 ${cmpView.metaRows} 行 / 拆解 ${cmpView.decompRows} 行`);
        await cp.close();

        /* 对照链接可分享：同一 URL 在独立新页打开仍并排（cp 已验证），
           这里再开一次确认无状态残留。 */
        const { page: cp2 } = await openPage(browser, 'index.html', cmpHash);
        const cmpReload = await cp2.evaluate(() => ({
          hash: location.hash,
          sides: document.querySelectorAll('.cmp-side').length,
          isCompare: !!document.querySelector('[data-od-id="compare-head"]'),
        }));
        check('对照链接可分享（重进 URL 仍并排）',
          cmpReload.isCompare && cmpReload.sides === 2,
          `${cmpReload.hash} / 侧栏 ${cmpReload.sides}`);
        await cp2.close();

        // sp 已被跨页导航到 index.html#compare；重新打开 samples.html 继续后续灯箱断言
        await sp.goto(fileUrl('samples.html') + '#samples', { waitUntil: 'load', timeout: 30000 });
        await sp.waitForSelector('.job-card', { timeout: 15000 });

        /* 灯箱：选首屏里有七段拆解的作业。
           第 13 步已用规则解析补齐全部缺口（942 → 971），因此下面的「空态分支」
           断言会退化为验证有拆解作业的灯箱 —— 那段逻辑本来就是自洽的。 */
        const decomJob = await sp.evaluate(() => {
          for (const c of document.querySelectorAll('.job-card[data-job]')) {
            const j = typeof EXPLORE_JOBS !== 'undefined'
              ? EXPLORE_JOBS.find((x) => x.id === c.dataset.job) : null;
            if (j?.decomposition && j.thumbs.length) return c.dataset.job;
          }
          return null;
        });
        await sp.click(`.job-card[data-job="${decomJob}"]`);
        await sp.waitForSelector('.job-sheet', { timeout: 8000 });
        const sheet = await sp.evaluate((id) => {
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
        const refKey = await sp.evaluate((id) => {
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
        const segCase = await sp.evaluate((id) => {
          const job = typeof EXPLORE_JOBS !== 'undefined'
            ? EXPLORE_JOBS.find((j) => j.id === id) : null;
          const segs = job?.decomposition?.segments || [];
          return {
            nonEmpty: segs.map((s, i) => ({ i, text: String(s.text ?? '').trim() })).filter((x) => x.text),
            emptyCount: segs.filter((s) => !String(s.text ?? '').trim()).length,
            total: segs.length,
          };
        }, decomJob);
        const btnIdx = await sp.$$eval('.decomp-row [data-seg-action]',
          (els) => els.map((e) => Number(e.dataset.segIndex)));
        check('空段不显示送入按钮',
          segCase.total === 7 && segCase.emptyCount > 0
            && JSON.stringify(btnIdx) === JSON.stringify(segCase.nonEmpty.map((x) => x.i)),
          `按钮 ${btnIdx.length} 个 / 空段 ${segCase.emptyCount} 个 / 共 ${segCase.total} 段`);

        await sp.evaluate(() => {
          const ta = document.getElementById('subject-input');
          if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        await new Promise((r) => setTimeout(r, 450)); // 等 .decomp-row 的 rise 动画结束再真实点击
        const first = segCase.nonEmpty[0];
        const second = segCase.nonEmpty[1];
        if (first) {
          await sp.click(`.job-sheet [data-seg-index="${first.i}"]`);
          const afterFirst = await sp.$eval('#subject-input', (el) => el.value);
          check('点击拆解段送入左栏', afterFirst === first.text,
            `期望 ${JSON.stringify(first.text)} / 实际 ${JSON.stringify(afterFirst)}`);
          if (second) {
            await sp.click(`.job-sheet [data-seg-index="${second.i}"]`);
            const afterSecond = await sp.$eval('#subject-input', (el) => el.value);
            check('再点一段按 ", " 追加', afterSecond === `${first.text}, ${second.text}`,
              `期望 ${JSON.stringify(first.text + ', ' + second.text)} / 实际 ${JSON.stringify(afterSecond)}`);
          } else {
            check('再点一段按 ", " 追加', false, '首条作业非空段不足 2 个');
          }
        } else {
          check('点击拆解段送入左栏', false, '未找到非空拆解段');
          check('再点一段按 ", " 追加', false, '未找到非空拆解段');
        }

        const stillOpen = await sp.evaluate(() => !!document.querySelector('.job-sheet'));
        check('逐段送入后灯箱常开且零错误', stillOpen && errs.length === 0,
          `灯箱 ${stillOpen} / 错误 ${errs.length}`);
        await sp.click('.job-sheet [data-role="close"]');

        /* 无拆解作业（若有）：按其真实批次筛选，验证灯箱走空态且零运行时错误。
           批次键从数据取，不写死日期；若日后补齐全部拆解，退化为验证有拆解作业的灯箱。 */
        const sheetTarget = await sp.evaluate(() => {
          const jobs = typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS : [];
          const j = jobs.find((x) => !x.decomposition) || jobs.find((x) => x.decomposition);
          if (!j) return null;
          return { id: j.id, batch: j.batch, rows: j.decomposition ? j.decomposition.segments.length : 0 };
        });
        if (!sheetTarget) {
          check('灯箱拆解/空态与数据一致且不报错', false, '未找到可测作业');
        } else {
          await sp.select('#ex-batch', sheetTarget.batch);
          await new Promise((r) => setTimeout(r, 250));
          await sp.waitForSelector(`.job-card[data-job="${sheetTarget.id}"]`, { timeout: 8000 });
          const errsBeforeSheet = errs.length;
          await sp.click(`.job-card[data-job="${sheetTarget.id}"]`);
          await sp.waitForSelector('.job-sheet', { timeout: 8000 });
          await new Promise((r) => setTimeout(r, 350));
          const targetSheet = await sp.evaluate(() => ({
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
          await sp.click('.job-sheet [data-role="close"]');
          await sp.select('#ex-batch', '');
        }

        /* ── 7a-2b. 拆解分层与生成日期（报告 2.5 / 2.7 / 第 13 步）──────────
           三件事各守一条：
             1. 拆解来源下拉的三项计数之和 == 全部作业数（缺口归零，且分层不重不漏）
             2. 「只看可信拆解」= 手工 + 逐条，点一下 URL 里就是这两项，刷新能复现
             3. 生成日期的下拉计数 == 真的点下去筛出的条数（批次与生成日是两个口径，
                口径错的症状正是「显示的数和筛出的数对不上」）
           参数维度（2.8）另守一条：灯箱必须把「不可研究」说清楚。 */
        {
          await sp.evaluate(() => { location.hash = '#samples'; });
          await new Promise((r) => setTimeout(r, 400));

          const decompUi = await sp.evaluate(() => {
            const jobs = typeof EXPLORE_JOBS !== 'undefined' ? EXPLORE_JOBS : [];
            const counts = [...document.querySelectorAll('#ex-decomp .msel-n')].map((e) => parseInt(e.textContent, 10) || 0);
            const values = [...document.querySelectorAll('#ex-decomp input')].map((e) => e.value);
            const trustedCount = jobs.filter((j) => {
              const s = j.decomposition && j.decomposition.source;
              return s === '手工精拆' || s === '逐条精拆';
            }).length;
            return {
              hasSel: !!document.querySelector('#ex-decomp'),
              values,
              counts,
              sum: counts.reduce((a, b) => a + b, 0),
              total: jobs.length,
              trustedCount,
              // 「无拆解」不该出现在选项里 —— 缺口已归零（971/971 都有拆解）
              hasNoDecomp: values.includes('无拆解'),
            };
          });
          check('拆解来源下拉存在且分层不重不漏',
            decompUi.hasSel && decompUi.sum === decompUi.total && !decompUi.hasNoDecomp,
            `选项 ${decompUi.values.join('/')} = ${decompUi.counts.join('+')} = ${decompUi.sum} / 作业 ${decompUi.total}`);

          /* 直接勾两项（ADR-0028 删掉了「只看可信拆解」快捷开关 —— 它只是
             decomp 多选的一种写法，独立按钮会引出「开关开着、多选里又勾了规则解析」
             的矛盾态）。这里守的是多选本身与 URL 契约。 */
          const trusted = await sp.evaluate(async () => {
            const det = document.querySelector('#ex-decomp');
            det.open = true;
            for (const v of ['手工精拆', '逐条精拆']) {
              const box = [...det.querySelectorAll('input')].find((e) => e.value === v);
              if (box) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
              await new Promise((r) => setTimeout(r, 320));
            }
            await new Promise((r) => setTimeout(r, 350));
            return {
              hash: location.hash,
              checked: [...document.querySelectorAll('#ex-decomp input:checked')].map((e) => e.value),
              count: parseInt(document.querySelector('.toolbar .dock-count').textContent, 10),
              rows: document.querySelectorAll('[data-job]').length,
            };
          });
          check('拆解来源可多选，勾两项后 URL 带两个 decomp',
            trusted.checked.length === 2
              && trusted.checked.includes('手工精拆') && trusted.checked.includes('逐条精拆')
              && trusted.hash.includes('decomp=') && trusted.count === decompUi.trustedCount,
            `${trusted.count} 条（期望 ${decompUi.trustedCount}）/ ${trusted.hash.slice(0, 80)}`);
          check('收窄后列表与计数一致',
            trusted.rows > 0 && trusted.rows === Math.min(trusted.count, 60),
            `${trusted.rows} 行`);

          // 刷新复现（URL 是多选本身，不是独立开关位）
          const trustedHash = trusted.hash;
          await sp.goto(fileUrl('samples.html') + trustedHash, { waitUntil: 'load', timeout: 30000 });
          await new Promise((r) => setTimeout(r, 800));
          const trustedReload = await sp.evaluate(() => ({
            checked: [...document.querySelectorAll('#ex-decomp input:checked')].length,
            count: parseInt(document.querySelector('.toolbar .dock-count').textContent, 10),
            view: document.querySelector('[data-od-id="explore-head"]') ? 'samples' : '',
          }));
          check('刷新后拆解来源筛选被复现',
            trustedReload.checked === 2 && trustedReload.count === trusted.count
              && trustedReload.view === 'samples',
            `view=${trustedReload.view} / ${trustedReload.count} 条 / 勾 ${trustedReload.checked}`);

          // 生成日期：下拉计数必须等于真的筛出来的条数
          await sp.evaluate(() => { location.hash = '#samples'; });
          await new Promise((r) => setTimeout(r, 500));
          const dateProbe = await sp.evaluate(async () => {
            const row = document.querySelector('#ex-gendate .msel-row');
            if (!row) return { ok: false };
            const box = row.querySelector('input');
            const expect = parseInt(row.querySelector('.msel-n').textContent, 10) || 0;
            box.checked = true;
            box.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 450));
            const got = parseInt(document.querySelector('.toolbar .dock-count').textContent, 10) || 0;
            const rows = document.querySelectorAll('[data-job]').length;
            const hash = location.hash;
            // 全选清掉，别污染后面的断言
            const clear = document.querySelector('#ex-gendate [data-msel-clear]');
            if (clear) clear.click();
            await new Promise((r) => setTimeout(r, 350));
            return { ok: true, date: box.value, expect, got, rows, hash };
          });
          check('生成日期筛选：下拉计数与真实命中一致',
            dateProbe.ok && dateProbe.expect === dateProbe.got && dateProbe.rows === Math.min(dateProbe.got, 60)
              && dateProbe.hash.includes('genDate=') && /^\d{4}-\d{2}-\d{2}$/.test(dateProbe.date),
            `${dateProbe.date} 期望 ${dateProbe.expect} 实得 ${dateProbe.got} / ${dateProbe.rows} 行`);

          // 参数维度如实说明（2.8）
          const paramNote = await sp.evaluate(async () => {
            const card = document.querySelector('.job-card[data-job]');
            if (!card) return { ok: false, reason: '没有卡片' };
            card.click();
            await new Promise((r) => setTimeout(r, 700));
            const caveat = document.querySelector('[data-od-id="param-caveat"]');
            const text = caveat ? caveat.textContent.replace(/\s+/g, ' ').trim() : '';
            const sheetHtml = document.querySelector('.job-sheet')?.innerHTML || '';
            const out = {
              ok: true,
              hasCaveat: !!caveat,
              mentionsUnresearchable: text.includes('不可研究'),
              mentionsVersionFlat: text.includes('8.2'),
              // 渲染层不能漏出 markdown 星号（模板里手滑写 **x** 就会原样显示）
              starLeak: (sheetHtml.match(/\*\*/g) || []).length,
            };
            document.querySelector('.job-sheet [data-role="close"]')?.click();
            return out;
          });
          check('灯箱把「参数维度不可研究」说清楚',
            paramNote.ok && paramNote.hasCaveat && paramNote.mentionsUnresearchable
              && paramNote.mentionsVersionFlat && paramNote.starLeak === 0,
            paramNote.reason || `说明 ${paramNote.hasCaveat} / 星号泄漏 ${paramNote.starLeak}`);
        }

        /* 所有筛选选项均有结果（不出现假空态）。
           ADR-0028：36 个比例选项不再可筛，改成两轴的 14 个档位 ——
           除「未声明 / 未判定」外，每档都必须至少命中 1 条，否则就是词表写错了
           （选项在界面上灰掉，用户会以为数据坏了而不是规则漏了）。 */
        const countText = () => sp.$eval('.toolbar .dock-count', (el) => parseInt(el.textContent, 10));
        const options = await sp.evaluate(() => ({
          batches: [...document.querySelectorAll('#ex-batch option')].filter((o) => o.value).map((o) => o.value),
          mediums: [...document.querySelectorAll('#ex-medium .msel-row input')].map((e) => e.value),
          subjects: [...document.querySelectorAll('#ex-subject .msel-row input')].map((e) => e.value),
        }));
        const empty = [];
        for (const v of options.batches) {
          await sp.select('#ex-batch', v);
          if (!(await countText() > 0)) empty.push('batch=' + v);
        }
        await sp.select('#ex-batch', '');

        const toggleAxis = async (id, value, on) => {
          await sp.evaluate(([mid, mv, mon]) => {
            const box = [...document.querySelectorAll(`#${mid} .msel-row input`)]
              .find((e) => e.value === mv);
            if (box && box.checked !== mon) {
              box.checked = mon;
              box.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, [id, value, on]);
          await new Promise((r) => setTimeout(r, 220));
        };
        for (const [id, list, tag] of [['ex-medium', options.mediums, 'medium'], ['ex-subject', options.subjects, 'subject']]) {
          for (const v of list) {
            await toggleAxis(id, v, true);
            if (!(await countText() > 0)) empty.push(`${tag}=${v}`);
            await toggleAxis(id, v, false);
          }
        }
        check('所有筛选选项均有结果', empty.length === 0, empty.join(', '));
        check('样本库独立页零运行时错误', spErrs.length === 0, spErrs.slice(0, 3).join(' | '));
        await sp.close();

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
        // ADR-0026：官方榜已收编进工作台，独立页只留风格参考码，不留幽灵 tab / chip。
        const legacy = await page.evaluate(() => ({
          topTab: !!document.querySelector('#style-tab-top'),
          codes: typeof STYLE_CODES !== 'undefined' ? STYLE_CODES.length : -1,
          srefCards: document.querySelectorAll('.sref-card').length,
          chips: document.querySelector('.head-meta')?.textContent.replace(/\s+/g, ' ').trim() || '',
        }));
        check('独立页只保留风格参考码（官方榜已收编）',
          !legacy.topTab && legacy.codes > 0 && legacy.srefCards === 0 && !legacy.chips.includes('官方榜'),
          JSON.stringify(legacy));
      }

      check(`${name} 零运行时错误`, errs.length === 0, errs.slice(0, 3).join(' | '));
      await page.close();
    }

    /* 4b. 官方风格榜（ADR-0026 定义 / ADR-0034 迁为顶栏独立页）
       同一批数据契约改在 styles-top.html 上验。 */
    {
      const { page, errs } = await openPage(browser, 'styles-top.html');
      const top = await page.evaluate(() => ({
        activeView: document.title.includes('风格榜') ? 'styles-top' : '',
        head: document.querySelector('[data-od-id="styles-top-head"] h1')?.textContent.trim() || '',
        cards: document.querySelectorAll('.sref-card').length,
        plates: document.querySelectorAll('.sref-card .img-plate').length,
        chips: document.querySelector('.head-meta')?.textContent.replace(/\s+/g, ' ').trim() || '',
        kindCount: typeof STYLES_TOP_KINDS !== 'undefined' ? STYLES_TOP_KINDS.length : -1,
        expectedKinds: typeof STYLES_TOP_KINDS !== 'undefined' ? STYLES_TOP_KINDS.map(k => k.id) : [],
        // 每张卡都必须渲染全部 8 个题材，不能只截前 4 个。
        kindCounts: [...document.querySelectorAll('.sref-card')].reduce((m, c) => {
          const n = c.querySelectorAll('.sref-kind-row .kind-thumb').length;
          m[n] = (m[n] || 0) + 1;
          return m;
        }, {}),
        badImgs: [...document.querySelectorAll('img')].filter((i) => {
          const s = i.getAttribute('src');
          return !s || s === 'undefined';
        }).length,
        // 8 张题材缩略图必须排成一行：4×2 或溢出都会破坏「点缩略图看上方大图」的对照。
        // 缺 grid 时各占整卡宽溢出，卡片高度从 ~330px 膨胀到 500px 以上（见 ADR-0026）。
        kindLayout: (() => {
          const card = document.querySelector('.sref-card');
          if (!card) return null;
          const r = card.getBoundingClientRect();
          const thumbs = [...card.querySelectorAll('.sref-kind-row .kind-thumb')];
          const rects = thumbs.map((b) => b.getBoundingClientRect());
          return {
            n: thumbs.length,
            kinds: thumbs.map((b) => b.dataset.kind || ''),
            rows: new Set(rects.map((b) => Math.round(b.top))).size,
            cardW: Math.round(r.width),
            cardH: Math.round(r.height),
            widths: rects.map((b) => Math.round(b.width)),
            maxRight: Math.round(Math.max(...rects.map((b) => b.right)) - r.left),
          };
        })(),
        // 两个功能按钮必须并排且都不溢出卡片（默认 .btn 尺寸会把 6 字文案挤出去）。
        actions: (() => {
          const card = document.querySelector('.sref-card');
          if (!card) return null;
          const r = card.getBoundingClientRect();
          const apply = card.querySelector('[data-apply-sref]');
          const copy = card.querySelector('[data-copy-sref]');
          const ar = apply && apply.getBoundingClientRect();
          const cr = copy && copy.getBoundingClientRect();
          return {
            applyText: apply ? apply.textContent.replace(/\s+/g, '').trim() : '',
            copyText: copy ? copy.textContent.replace(/\s+/g, '').trim() : '',
            applyCode: apply ? apply.dataset.applySref : '',
            copyCode: copy ? copy.dataset.copySref : '',
            cardCode: card.dataset.code || '',
            sameRow: !!(ar && cr && Math.round(ar.top) === Math.round(cr.top)),
            maxRight: ar && cr ? Math.round(Math.max(ar.right, cr.right) - r.left) : -1,
            cardW: Math.round(r.width),
            overflow: !!(apply && apply.scrollWidth > apply.clientWidth + 1) ||
                      !!(copy && copy.scrollWidth > copy.clientWidth + 1),
          };
        })(),
      }));
      const topData = await page.evaluate(() => ({
        entries: typeof STYLES_TOP_ENTRIES !== 'undefined' ? STYLES_TOP_ENTRIES.length : -1,
        total: typeof STYLES_TOP_IMAGE_STATS !== 'undefined' ? STYLES_TOP_IMAGE_STATS.total : -1,
        withImages: typeof STYLES_TOP_IMAGE_STATS !== 'undefined' ? STYLES_TOP_IMAGE_STATS.withImages : -1,
      }));
      check('#styles-top 直达风格榜视图',
        top.activeView === 'styles-top' && top.head === '风格榜', `${top.activeView} / ${top.head}`);
      check('8 张题材缩略图全量排成一行且卡片高度未膨胀',
        top.kindCount === 8 &&
        top.kindLayout && top.kindLayout.n === top.kindCount &&
        top.kindLayout.kinds.join(',') === top.expectedKinds.join(',') &&
        top.kindLayout.rows === 1 &&
        (top.kindCounts[top.kindCount] || 0) === top.cards &&
        top.kindLayout.widths.every((w) => w > 0 && w < top.kindLayout.cardW / 8) &&
        top.kindLayout.maxRight <= top.kindLayout.cardW &&
        top.kindLayout.cardH < 400,
        JSON.stringify({ layout: top.kindLayout, counts: top.kindCounts, cards: top.cards }));
      // 交互：点第 3 张缩略图，上方主图应换成该题材，并只留一个选中态。
      const preview = await page.evaluate(() => {
        const card = document.querySelector('.sref-card');
        if (!card) return null;
        const thumbs = [...card.querySelectorAll('.kind-thumb')];
        const target = thumbs[2];
        if (!target) return null;
        const before = card.querySelector('.sref-main')?.getAttribute('src') || '';
        target.click();
        const main = card.querySelector('.sref-main');
        return {
          before,
          after: main?.getAttribute('src') || '',
          expected: target.dataset.previewSrc || '',
          alt: main?.getAttribute('alt') || '',
          label: card.querySelector('.sref-main-label')?.textContent.trim() || '',
          expectedLabel: target.dataset.label || '',
          active: card.querySelectorAll('.kind-thumb.is-active').length,
          pressed: [...card.querySelectorAll('.kind-thumb')]
            .filter((b) => b.getAttribute('aria-pressed') === 'true').length,
          activeIsTarget: target.classList.contains('is-active'),
        };
      });
      check('点击题材缩略图在上方主图展示',
        preview && preview.before !== preview.expected &&
        preview.after === preview.expected &&
        preview.alt.includes(preview.expectedLabel) &&
        preview.label === preview.expectedLabel &&
        preview.active === 1 && preview.pressed === 1 && preview.activeIsTarget,
        JSON.stringify(preview));
      check('风格榜卡片两个功能按钮并排且不溢出',
        top.actions && top.actions.applyText === '套用到工作台' &&
        top.actions.copyText === '复制参考码' &&
        top.actions.applyCode === top.actions.cardCode &&
        top.actions.copyCode === top.actions.cardCode &&
        top.actions.sameRow && top.actions.maxRight <= top.actions.cardW &&
        !top.actions.overflow,
        JSON.stringify(top.actions));

      /* 双按钮职责边界：apply 写进会话的 styleRef 参数位（左栏 Dock 同步），
         copy 只进剪贴板，不能改动会话。apply 与 explore-board.js 的 fill-sref
         共用同一参数位（ADR-0013 / ADR-0016）。 */
      const applyResult = await page.evaluate(async () => {
        // 起点可复现：清掉同 origin 下前序断言可能留下的会话态。
        session.params.styleRef = '';
        session.manual = null;
        saveSession();
        emitChange();
        const card = document.querySelector('.sref-card');
        const btn = card && card.querySelector('[data-apply-sref]');
        if (!btn) return null;
        const code = btn.dataset.applySref;
        const before = String(session.params.styleRef || '');
        const toastBase = Array.isArray(window.__toasts) ? window.__toasts.length : 0;
        btn.click();
        await new Promise((r) => setTimeout(r, 80));
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('mj-session-v2') || 'null'); } catch { /* 忽略 */ }
        return {
          code, before,
          after: String(session.params.styleRef || ''),
          saved: saved && saved.params ? String(saved.params.styleRef ?? '') : null,
          chips: document.querySelector('.param-summary')?.textContent.replace(/\s+/g, ' ').trim() || '',
          input: document.querySelector('#p-styleRef')?.value ?? null,
          prompt: typeof finalPrompt === 'function' ? finalPrompt() : '',
          newToasts: (Array.isArray(window.__toasts) ? window.__toasts : []).slice(toastBase),
        };
      });
      check('套用到工作台把风格码写进 --sref 参数位',
        applyResult && applyResult.before === '' &&
        applyResult.after === applyResult.code && applyResult.saved === applyResult.code &&
        applyResult.chips.includes(`--sref ${applyResult.code}`) &&
        applyResult.input === applyResult.code &&
        applyResult.prompt.includes(`--sref ${applyResult.code}`) &&
        applyResult.newToasts.some((t) => t.includes('已套用') && t.includes(applyResult.code)),
        JSON.stringify(applyResult));

      const copyResult = await page.evaluate(async () => {
        let copied = null;
        try {
          // file:// 下 navigator.clipboard 常不可用；打桩记录 copyText 实际写入的文本。
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async (t) => { copied = t; } },
          });
        } catch { return { stub: false }; }
        const btn = document.querySelector('.sref-card [data-copy-sref]');
        if (!btn) return { stub: true, btn: false };
        const code = btn.dataset.copySref;
        const before = String(session.params.styleRef || '');
        const toastBase = Array.isArray(window.__toasts) ? window.__toasts.length : 0;
        btn.click();
        await new Promise((r) => setTimeout(r, 80));
        return {
          stub: true, btn: true, code, before, copied,
          after: String(session.params.styleRef || ''),
          newToasts: (Array.isArray(window.__toasts) ? window.__toasts : []).slice(toastBase),
        };
      });
      check('复制参考码只复制文本、不改工作台会话',
        copyResult && copyResult.stub && copyResult.btn &&
        copyResult.copied === `--sref ${copyResult.code}` &&
        copyResult.after === copyResult.before &&
        copyResult.newToasts.some((t) => t.includes('风格参考已复制')),
        JSON.stringify(copyResult));

      // 复位会话，避免 file:// 共享 localStorage 污染后续断言。
      await page.evaluate(() => {
        session.params.styleRef = '';
        saveSession();
        emitChange();
      });
      check('官方风格榜数据源与统计一致', topData.entries > 0 && topData.entries === topData.total,
        `条目 ${topData.entries} / 统计 ${topData.total}`);
      check('官方风格榜全量渲染', top.cards === topData.total, `实际 ${top.cards} / 期望 ${topData.total}`);
      check('官方榜占位数量与统计一致', top.plates === 2 * (topData.total - topData.withImages),
        `占位 ${top.plates} / 期望 ${2 * (topData.total - topData.withImages)}`);
      check('官方榜配图如实标注', top.chips.includes(`官方榜配图 ${topData.withImages} / ${topData.total}`), top.chips);
      check('官方榜无破图 img', top.badImgs === 0, `实际 ${top.badImgs}`);
      check('风格榜视图零运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
      await page.close();
    }

    /* 4c. 摄影前缀可配置（ADR-0027）
       基词是会话字段而非常量；留空时整段消失；刷新复现；清空会话复位。 */
    {
      const { page, errs } = await openPage(browser, 'index.html');
      // 起点干净：前序断言可能在 file:// 共享的 localStorage 里留下手动改写与旧参数。
      await page.evaluate(() => {
        session.selected = [];
        session.subject = '';
        session.manual = null;
        session.photoPrefix = 'photography';
        saveSession();
        emitChange();
      });
      const base = await page.evaluate(() => ({
        input: document.querySelector('#prefix-input')?.value ?? null,
        session: session.photoPrefix,
        prompt: typeof finalPrompt === 'function' ? finalPrompt() : '',
        saved: (() => { try { return JSON.parse(localStorage.getItem('mj-session-v2') || 'null')?.photoPrefix ?? null; } catch { return null; } })(),
      }));
      check('摄影前缀控件与默认基词 photography',
        base.input === 'photography' && base.session === 'photography' &&
        base.saved === 'photography' && base.prompt.startsWith('photography'),
        JSON.stringify(base));

      // 自定义 combobox：点输入框即展开。原生 datalist 做不到，故已整体移除。
      const combo0 = await page.evaluate(() => {
        const el = document.querySelector('#prefix-input');
        return {
          role: el?.getAttribute('role') ?? null,
          controls: el?.getAttribute('aria-controls') ?? null,
          expanded: el?.getAttribute('aria-expanded') ?? null,
          listAttr: el?.getAttribute('list') ?? null,
          datalists: document.querySelectorAll('datalist').length,
        };
      });
      check('前缀输入框是 combobox 且无原生 datalist',
        combo0.role === 'combobox' && combo0.controls === 'prefix-listbox' &&
        combo0.expanded === 'false' && combo0.listAttr === null && combo0.datalists === 0,
        JSON.stringify(combo0));

      const comboOpen = await page.evaluate(async () => {
        const el = document.querySelector('#prefix-input');
        el.click();
        await new Promise((r) => setTimeout(r, 60));
        const box = document.getElementById('prefix-listbox');
        const opts = box ? [...box.querySelectorAll('.prefix-opt')] : [];
        const br = box?.getBoundingClientRect();
        const ir = el.getBoundingClientRect();
        const banned = ['cinematic', 'photorealistic', 'ultra-detailed', 'portrait photography', 'shot on 35mm'];
        return {
          hidden: box ? box.hidden : null,
          expanded: el.getAttribute('aria-expanded'),
          n: opts.length,
          values: opts.map((o) => o.dataset.value),
          selected: opts.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.dataset.value),
          parentIsBody: box?.parentElement === document.body,
          position: box ? getComputedStyle(box).position : null,
          below: br && ir ? Math.round(br.top) >= Math.round(ir.bottom) : null,
          inViewport: br ? br.left >= 0 && br.right <= window.innerWidth + 1 : null,
          bannedHits: opts.map((o) => o.dataset.value).filter((v) => banned.includes(v)),
        };
      });
      check('点输入框即展开下拉：7 项、当前值高亮、挂 body 且定位在框下方',
        comboOpen.hidden === false && comboOpen.expanded === 'true' && comboOpen.n === 7 &&
        comboOpen.values[0] === 'photography' && comboOpen.selected.join() === 'photography' &&
        comboOpen.parentIsBody === true && comboOpen.position === 'fixed' &&
        comboOpen.below === true && comboOpen.inViewport === true &&
        comboOpen.bannedHits.length === 0,
        JSON.stringify(comboOpen));

      // 输入过滤 + 键盘选中：写入仍只有 session.photoPrefix 一个来源。
      const comboPick = await page.evaluate(async () => {
        const el = document.querySelector('#prefix-input');
        const box = document.getElementById('prefix-listbox');
        el.value = 'oil';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 60));
        const filtered = [...box.querySelectorAll('.prefix-opt')].map((o) => o.dataset.value);
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((r) => setTimeout(r, 60));
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('mj-session-v2') || 'null'); } catch { /* 忽略 */ }
        return {
          filtered,
          input: el.value,
          session: session.photoPrefix,
          saved: saved?.photoPrefix ?? null,
          prompt: finalPrompt(),
          closed: box.hidden,
          expanded: el.getAttribute('aria-expanded'),
        };
      });
      check('输入过滤 + ↓/Enter 选中并落盘',
        comboPick.filtered.length === 1 && comboPick.filtered[0] === 'oil painting' &&
        comboPick.input === 'oil painting' && comboPick.session === 'oil painting' &&
        comboPick.saved === 'oil painting' && comboPick.prompt.startsWith('oil painting') &&
        comboPick.closed === true && comboPick.expanded === 'false',
        JSON.stringify(comboPick));

      // 中文对照：每项右侧带中文，中文可当检索词，但 data-value（写入值）必须是纯英文基词。
      const comboZh = await page.evaluate(async () => {
        const el = document.querySelector('#prefix-input');
        const box = document.getElementById('prefix-listbox');
        const read = () => [...box.querySelectorAll('.prefix-opt')].map((o) => ({
          v: o.dataset.value,
          en: o.querySelector('.prefix-opt-en')?.textContent ?? '',
          zh: o.querySelector('.prefix-opt-zh')?.textContent ?? '',
        }));
        el.click();
        await new Promise((r) => setTimeout(r, 50));
        const all = read();
        el.value = '油画';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 50));
        const zhFiltered = read();
        const open = box.hidden === false;
        // 还原，避免影响后续断言
        el.value = 'oil painting';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
        return { all, zhFiltered, open };
      });
      check('下拉每项带中文对照且中文可检索，写入值仍为纯英文',
        comboZh.all.length === 7 &&
        comboZh.all.every((o) => o.en === o.v) &&
        comboZh.all.every((o) => /^[\x20-\x7e]+$/.test(o.v)) &&
        comboZh.all.every((o) => /^[\u4e00-\u9fa5]+$/.test(o.zh)) &&
        comboZh.all.some((o) => o.v === 'oil painting' && o.zh === '油画') &&
        comboZh.open === true &&
        comboZh.zhFiltered.length === 1 && comboZh.zhFiltered[0].v === 'oil painting',
        JSON.stringify(comboZh));

      // Esc 与点外部都只关闭浮层、不改值。
      const comboDismiss = await page.evaluate(async () => {
        const el = document.querySelector('#prefix-input');
        const box = document.getElementById('prefix-listbox');
        el.value = 'illustration';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.click();
        await new Promise((r) => setTimeout(r, 50));
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
        const afterEsc = box.hidden;
        el.click();
        await new Promise((r) => setTimeout(r, 50));
        const reopened = !box.hidden;
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
        return {
          afterEsc,
          reopened,
          afterOutside: box.hidden,
          value: el.value,
          session: session.photoPrefix,
        };
      });
      check('Esc 与点击外部只关闭下拉、不改值',
        comboDismiss.afterEsc === true && comboDismiss.reopened === true &&
        comboDismiss.afterOutside === true &&
        comboDismiss.value === 'illustration' && comboDismiss.session === 'illustration',
        JSON.stringify(comboDismiss));

      // 自定义输入：无匹配时如实提示，回车只关闭、不篡改用户输入。
      const comboCustom = await page.evaluate(async () => {
        const el = document.querySelector('#prefix-input');
        const box = document.getElementById('prefix-listbox');
        el.value = 'my own baseline';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.click();
        await new Promise((r) => setTimeout(r, 50));
        const empty = box.querySelector('.prefix-opt-empty');
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('mj-session-v2') || 'null'); } catch { /* 忽略 */ }
        return {
          emptyText: empty ? empty.textContent : null,
          closed: box.hidden,
          input: el.value,
          session: session.photoPrefix,
          saved: saved?.photoPrefix ?? null,
          prompt: finalPrompt(),
        };
      });
      check('自定义输入无匹配时如实提示、回车不改写',
        !!comboCustom.emptyText && comboCustom.emptyText.includes('无匹配') &&
        comboCustom.closed === true && comboCustom.input === 'my own baseline' &&
        comboCustom.session === 'my own baseline' && comboCustom.saved === 'my own baseline' &&
        comboCustom.prompt.startsWith('my own baseline'),
        JSON.stringify(comboCustom));

      // 改基词：input 事件只重绘最终提示词区，不重绘 Dock（节点与焦点都不丢）。
      const custom = await page.evaluate(async () => {
        const el = document.querySelector('#prefix-input');
        if (!el) return null;
        el.focus();
        el.value = 'cinematic still';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('mj-session-v2') || 'null'); } catch { /* 忽略 */ }
        return {
          sameNode: document.querySelector('#prefix-input') === el,
          focused: document.activeElement === el,
          value: el.value,
          session: session.photoPrefix,
          saved: saved?.photoPrefix ?? null,
          prompt: finalPrompt(),
          finalText: document.querySelector('#final-text')?.textContent || '',
        };
      });
      check('自定义基词即时生效、不重绘 Dock 且落盘',
        custom && custom.sameNode && custom.focused &&
        custom.value === 'cinematic still' && custom.session === 'cinematic still' &&
        custom.saved === 'cinematic still' &&
        custom.prompt.startsWith('cinematic still') &&
        custom.finalText.includes('cinematic still'),
        JSON.stringify(custom));

      await page.reload({ waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 500));
      const reloaded = await page.evaluate(() => ({
        input: document.querySelector('#prefix-input')?.value ?? null,
        session: session.photoPrefix,
        prompt: finalPrompt(),
      }));
      check('前缀配置随会话持久化（刷新复现）',
        reloaded.input === 'cinematic still' && reloaded.session === 'cinematic still' &&
        reloaded.prompt.startsWith('cinematic still'),
        JSON.stringify(reloaded));

      // 留空：开头段消失，提示词从主体开始。
      const empty = await page.evaluate(async () => {
        const el = document.querySelector('#prefix-input');
        const subject = document.querySelector('#subject-input');
        if (!el || !subject) return null;
        subject.value = 'a quiet library';
        subject.dispatchEvent(new Event('input', { bubbles: true }));
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
        return { session: session.photoPrefix, prompt: finalPrompt() };
      });
      check('基词留空时开头段消失',
        empty && empty.session === '' &&
        !empty.prompt.includes('photography') && !empty.prompt.includes('cinematic') &&
        empty.prompt.startsWith('a quiet library'),
        JSON.stringify(empty));

      // 有艺术家时按「基词 by 名字」拼；基词留空只留名字。直接验拼装函数（不绕 UI 选词）。
      const withArtist = await page.evaluate(() => {
        const backup = { selected: session.selected, prefix: session.photoPrefix };
        try {
          session.selected = [{ id: 't1', zh: '尼克·奈特', en: 'Nick Knight', position: 'artist', category: '艺术家', ts: Date.now() }];
          session.photoPrefix = 'illustration';
          const a = buildAutoPrompt();
          session.photoPrefix = '';
          const b = buildAutoPrompt();
          return { a, b };
        } finally {
          session.selected = backup.selected;
          session.photoPrefix = backup.prefix;
          saveSession();
          emitChange();
        }
      });
      check('有艺术家时按基词拼接 / 留空只留艺术家名',
        withArtist.a.startsWith('illustration by Nick Knight') &&
        withArtist.b.startsWith('Nick Knight, a quiet library') &&
        !withArtist.b.includes('by '),
        JSON.stringify(withArtist));

      // 只改了前缀时「清空会话」按钮必须可用，点击后复位默认基词。
      const cleared = await page.evaluate(async () => {
        const btn = document.querySelector('[data-role="clear"]');
        const enabled = btn ? !btn.disabled : false;
        if (btn) btn.click();
        await new Promise((r) => setTimeout(r, 60));
        return {
          enabled,
          prefix: session.photoPrefix,
          input: document.querySelector('#prefix-input')?.value ?? null,
          prompt: finalPrompt(),
        };
      });
      check('清空会话把前缀复位为 photography',
        cleared.enabled && cleared.prefix === 'photography' &&
        cleared.input === 'photography' && cleared.prompt.startsWith('photography'),
        JSON.stringify(cleared));

      const jsErrs = errs.filter((e) => !e.startsWith('reqfail:'));
      check('摄影前缀视图零运行时错误', jsErrs.length === 0, jsErrs.slice(0, 3).join(' | '));
      await page.close();
    }

    /* 5a. 配图真实加载（报告 3.2 / ADR-0017 Round 16：单一图片命名空间）
       此前只断言了「src 不是 undefined」，那抓不到路径写错 —— src 是个合法字符串时，
       破图照样发生。改造后图片一律走 ../public/…，这里直接问浏览器「这张图真的加载出来了吗」。

       判据用 `complete && naturalWidth === 0`：complete 为 false 是懒加载还没进视口，
       不是破图；complete 为 true 而 naturalWidth 为 0 才是真的加载失败。 */
    for (const name of ['index.html', 'gallery.html', 'style-library.html']) {
      const { page } = await openPage(browser, name);
      // 滚一遍触发懒加载，让视口外的图也进入加载判定
      await page.evaluate(async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 30));
        }
        window.scrollTo(0, 0);
      });
      await new Promise((r) => setTimeout(r, 2000));
      const imgs = await page.evaluate(() => {
        const all = [...document.querySelectorAll('img')];
        const broken = all.filter((i) => i.complete && i.naturalWidth === 0);
        return {
          total: all.length,
          broken: broken.length,
          samples: broken.slice(0, 3).map((i) => i.getAttribute('src')),
          // 全部图片都应指向 ../public/ —— 不允许再有第二条图片命名空间
          offNamespace: all.filter((i) => {
            const s = i.getAttribute('src') || '';
            // ADR-0030：撤销 blob: 破例，恢复「配图命名空间唯一 ../public/」。
            return s && !s.startsWith('../public/');
          }).length,
        };
      });
      check(`${name} 配图真实加载（无加载失败）`, imgs.broken === 0,
        `共 ${imgs.total} 张 / 失败 ${imgs.broken}${imgs.samples.length ? ' · ' + imgs.samples.join(', ') : ''}`);
      check(`${name} 配图路径全在 ../public/ 命名空间`, imgs.offNamespace === 0,
        `越界 ${imgs.offNamespace} 张`);
      await page.close();
    }

    /* 5b. 研究样本导出（报告 4.1 / 第 10 步）
       断言的不是「按钮存在」，而是导出的**内容**对不对 ——
       关键一条：导出的是筛选命中的**全部**，不是屏幕上分页后显示的那些。
       页面默认只渲染 60 条，若导出只覆盖已渲染部分，会静默丢数据 ——
       那比不导出更危险，所以这条必须断言。 */
    {
      const { page } = await openPage(browser, 'samples.html', '#samples');
      await page.waitForSelector('[data-od-id="export-menu"]', { timeout: 8000 });

      const ex = await page.evaluate(() => {
        const jobs = SAMPLE_EXPORT.currentJobs();
        const shown = document.querySelectorAll('[data-job]').length;
        const j = JSON.parse(SAMPLE_EXPORT.toJson(jobs));
        const md = SAMPLE_EXPORT.toMarkdown(jobs);
        const first = j['样本'][0] || {};
        return {
          formats: [...document.querySelectorAll('[data-export-format]')].map((b) => b.dataset.exportFormat).sort(),
          matched: jobs.length,
          shown,
          jsonHit: j['命中条数'],
          jsonLen: j['样本'].length,
          hasKey: !!first['引用键'],
          hasPrompt: !!first['提示词'],
          hasDate: /^\d{4}-\d{2}-\d{2}$/.test(String(first['生成日期'] || '')),
          mdHeader: md.startsWith('# 研究样本导出'),
          mdRows: (md.match(/^### \d+\./gm) || []).length,
          mdHasKey: md.includes(first['引用键']),
          mdHasPrompt: md.includes(String(first['提示词'] || '').slice(0, 40)),
        };
      });

      check('研究样本库有 JSON 与 Markdown 两种导出格式',
        ex.formats.length === 2 && ex.formats.includes('json') && ex.formats.includes('markdown'),
        JSON.stringify(ex.formats));
      check('导出条数 = 筛选命中全量（不是分页后显示的部分）',
        ex.matched === ex.jsonHit && ex.jsonLen === ex.matched && ex.shown < ex.matched,
        `命中 ${ex.matched} / 导出 ${ex.jsonLen} / 页面显示 ${ex.shown}`);
      check('导出内容含引用键与提示词（可回指、可读）',
        ex.hasKey && ex.hasPrompt && ex.mdHasKey && ex.mdHasPrompt,
        `key=${ex.hasKey} prompt=${ex.hasPrompt}`);
      check('导出含真实生成日期（与采集批次区分）',
        ex.hasDate, `生成日期=${ex.hasDate}`);
      check('Markdown 详情段数与命中条数一致',
        ex.mdHeader && ex.mdRows === ex.matched,
        `MD ${ex.mdRows} 段 / 命中 ${ex.matched}`);

      // 筛选联动：加一个批次筛选后，导出条数必须随之变化
      const filtered = await page.evaluate(() => {
        const before = SAMPLE_EXPORT.currentJobs().length;
        EXPLORE_BOARD.state.batch = '2026-11-01';
        const after = SAMPLE_EXPORT.currentJobs().length;
        const j = JSON.parse(SAMPLE_EXPORT.toJson());
        EXPLORE_BOARD.state.batch = '';
        const restored = SAMPLE_EXPORT.currentJobs().length;
        return { before, after, restored, summary: j['筛选条件'], jsonLen: j['样本'].length };
      });
      check('导出随筛选变化（导出的是筛选结果，不是全表）',
        filtered.after < filtered.before && filtered.jsonLen === filtered.after && filtered.restored === filtered.before,
        JSON.stringify(filtered));

      await page.close();
    }

    /* 6. 旧独立页 explore.html 跳转到研究样本库独立页（ADR-0034） */
    {
      const { page } = await openPage(browser, 'explore.html');
      let ok = false;
      try {
        await page.waitForFunction(() => location.pathname.endsWith('samples.html')
          && location.hash === '#samples' && !!document.querySelector('[data-od-id="explore-head"]'),
          { timeout: 8000 });
        ok = true;
      } catch { /* 超时即失败 */ }
      check('explore.html 跳转到 samples.html#samples', ok, await page.evaluate(() => location.href));
      await page.close();
    }

    /* 7. 旧页签深链 #/explore?... → samples.html#samples（ADR-0034）
       旧 #/explore 仍要能用 —— 原样带 query 重定向到样本库独立页。 */
    {
      const { page } = await openPage(browser, 'index.html', '#/explore?d=2026-11-05&ar=9:16');
      const state = await page.evaluate(() => ({
        path: location.pathname.split('/').pop(),
        hash: location.hash,
        head: !!document.querySelector('[data-od-id="explore-head"]'),
      }));
      check('旧探索榜深链原样带 query 跳到样本库独立页',
        state.path === 'samples.html' && state.hash === '#samples?d=2026-11-05&ar=9:16' && state.head,
        JSON.stringify(state));
      await page.close();
    }

    /* 7a. 统一筛选引擎 + 一级视图（报告 3.4 / 4.2）
       筛选状态以 URL hash 为唯一来源（ADR-0010）：刷新 / 后退 / 分享都能复现。 */
    {
      /* 7a-1. 研究样本库：选批次 → URL 带参数 → 刷新后复现 */
      const { page } = await openPage(browser, 'samples.html', '#samples');
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
      const { page: page2 } = await openPage(browser, 'samples.html', afterFilter.hash);
      await page2.waitForSelector('#ex-batch', { timeout: 15000 });
      const afterReload = await page2.evaluate(() => ({
        view: document.querySelector('[data-od-id="explore-head"]') ? 'samples' : '',
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

      /* 7a-2. 艺术家库侧：分面词筛选也进 URL
         ADR-0033：原工作台 #artists 页签已升为独立页 artists.html。
         旧深链 index.html#artists 现在会带参数重定向过去，所以这里直接测新页。 */
      {
        const { page: p3 } = await openPage(browser, 'artists.html');
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
        const { page: p4 } = await openPage(browser, 'samples.html', '#samples?zzz=1&q=portrait');
        await p4.waitForSelector('#ex-search', { timeout: 15000 });
        const unknown = await p4.evaluate(() => ({
          ignored: (typeof SAMPLES_DIAG !== 'undefined') ? SAMPLES_DIAG.ignoredParams : null,
          q: (typeof SAMPLES_DIAG !== 'undefined') ? SAMPLES_DIAG.q : null,
          hash: location.hash,
          toast: document.querySelector('.toast')?.textContent || '',
          // 观察器记录的全部 toast（含已过期的）—— 断言不依赖它现在还在 DOM 里
          toasts: Array.isArray(window.__toasts) ? window.__toasts : [],
        }));
        check('不支持的参数被记录',
          Array.isArray(unknown.ignored) && unknown.ignored.includes('zzz'),
          JSON.stringify(unknown.ignored));
        check('支持的参数照常生效',
          unknown.q === 'portrait', String(unknown.q));
        check('不支持的参数有提示（不静默忽略）',
          [unknown.toast, ...unknown.toasts].some((t) => t.includes('忽略')),
          (unknown.toast || unknown.toasts.join(' | ')).replace(/\s+/g, ' ').trim().slice(0, 60));
        await p4.close();
      }

      /* ── 7a-3b. 候选词条视图（报告 2.6 / 第 12 步）────────────────────
         候选词条是「社区高频措辞 × 词库覆盖」的对照界面（ADR-0024）。
         断言要点：一级视图身份 / 三态标记真实 / 筛选进 URL / 刷新复现 /
         出处可回指 / 导出两种格式都出内容。 */
      {
        const { page: pc } = await openPage(browser, 'index.html', '#candidates');
        await pc.waitForSelector('.cand-table', { timeout: 20000 });

        const candBasic = await pc.evaluate(() => {
          const built = typeof CANDIDATE_VIEW !== 'undefined' ? CANDIDATE_VIEW.built() : null;
          return {
            isView: !!document.querySelector('[data-od-id="candidate-head"]'),
            rows: document.querySelectorAll('.cand-row').length,
            badges: document.querySelectorAll('.cand-badge').length,
            exact: document.querySelectorAll('.cand-badge.is-exact').length,
            near: document.querySelectorAll('.cand-badge.is-near').length,
            missing: document.querySelectorAll('.cand-badge.is-missing').length,
            total: built ? built.candidates.length : -1,
            dfOk: built ? built.candidates.every((c) => c.df === c.sourceCount) : false,
            srcOk: built ? built.candidates.some((c) => c.sourceCount > 0) : false,
            exportMenu: !!document.querySelector('[data-od-id="candidate-export-menu"]'),
          };
        });
        check('候选词条是一级视图',
          candBasic.isView, `视图头 ${candBasic.isView ? '有' : '无'}`);
        check('候选词条清单有行且总数与引擎一致',
          candBasic.rows > 0 && candBasic.rows === Math.min(candBasic.total, 120),
          `渲染 ${candBasic.rows} 行 / 引擎 ${candBasic.total} 条`);
        check('三态标记都出现在界面上',
          candBasic.exact > 0 && candBasic.near > 0 && candBasic.missing > 0,
          `exact ${candBasic.exact} / near ${candBasic.near} / missing ${candBasic.missing}`);
        check('候选的频次与出处条数口径一致',
          candBasic.dfOk && candBasic.srcOk,
          `df==sourceCount ${candBasic.dfOk} / 有出处 ${candBasic.srcOk}`);
        check('候选词条有导出菜单',
          candBasic.exportMenu, '');

        // 三态筛选 → 进 URL → 刷新复现
        await pc.evaluate(() => document.querySelector('[data-cand-status="missing"]')?.click());
        await new Promise((r) => setTimeout(r, 600));
        const candHash = await pc.evaluate(() => location.hash);
        check('候选词条筛选进 URL（status=）',
          candHash.includes('status=missing'), candHash);
        const candFiltered = await pc.evaluate(() => ({
          rows: document.querySelectorAll('.cand-row').length,
          badges: [...document.querySelectorAll('.cand-badge')].map((b) => b.className),
        }));
        check('筛选后只剩「词库未覆盖」',
          candFiltered.rows > 0 && candFiltered.badges.every((c) => c.includes('is-missing')),
          `${candFiltered.rows} 行`);
        await pc.close();

        const { page: pc2 } = await openPage(browser, 'index.html', candHash);
        await pc2.waitForSelector('.cand-table', { timeout: 20000 });
        const candReload = await pc2.evaluate(() => ({
          view: document.querySelector('[data-view][aria-selected="true"]')?.dataset.view,
          rows: document.querySelectorAll('.cand-row').length,
          allMissing: [...document.querySelectorAll('.cand-badge')].every((b) => b.className.includes('is-missing')),
        }));
        check('刷新后候选词条筛选被复现',
          candReload.view === 'candidates' && candReload.rows === candFiltered.rows && candReload.allMissing,
          `view=${candReload.view} / ${candReload.rows} 行`);
        await pc2.close();

        // 出处可回指：点「N 条出处」→ 弹层列出样本 → 点引用键跳到样本库
        const { page: pc3 } = await openPage(browser, 'index.html', '#candidates');
        await pc3.waitForSelector('.cand-table', { timeout: 20000 });
        const srcSheet = await pc3.evaluate(async () => {
          const btn = document.querySelector('[data-cand-sources]');
          if (!btn) return { ok: false, reason: '没有出处按钮' };
          btn.click();
          await new Promise((r) => setTimeout(r, 500));
          const sheet = document.querySelector('[data-od-id="cand-sources"]');
          const keys = [...document.querySelectorAll('[data-cand-goto]')].map((b) => b.dataset.candGoto);
          return {
            ok: true,
            sheet: !!sheet,
            cards: keys.length,
            keyShape: keys.every((k) => /^[0-9a-f]{8}-[0-9a-z]{4}$/.test(k)),
          };
        });
        check('点出处能打开出处弹层并列出样本',
          srcSheet.ok && srcSheet.sheet && srcSheet.cards > 0 && srcSheet.keyShape,
          srcSheet.reason || `${srcSheet.cards} 条出处`);
        /* ADR-0034：点引用键跨页跳到样本库独立页，并直达该样本灯箱。 */
        const candJump = await Promise.all([
          pc3.waitForNavigation({ timeout: 15000 }).catch(() => null),
          pc3.evaluate(() => {
            const btn = document.querySelector('[data-cand-goto]');
            if (!btn) return false;
            btn.click();
            return true;
          }),
        ]);
        const jumpUrl = pc3.url();
        check('点引用键能跳到研究样本库并直达该样本',
          candJump[0] && jumpUrl.includes('samples.html#samples?job='), jumpUrl);
        if (candJump[0]) {
          const sheetOk = await pc3.waitForSelector('.job-sheet', { timeout: 8000 }).then(() => true).catch(() => false);
          check('跨页跳转后样本灯箱自动打开', sheetOk, jumpUrl);
        }
        await pc3.close();

        // 导出两种格式都出内容（内容在页面里算，不落盘）
        const { page: pc4 } = await openPage(browser, 'index.html', '#candidates');
        await pc4.waitForSelector('.cand-table', { timeout: 20000 });
        const candExport = await pc4.evaluate(() => {
          if (typeof CANDIDATE_EXPORT === 'undefined') return { ok: false, reason: '导出模块未加载' };
          const list = CANDIDATE_EXPORT.currentCandidates();
          const json = CANDIDATE_EXPORT.toJson(list);
          const md = CANDIDATE_EXPORT.toMarkdown(list);
          let parsed = null;
          try { parsed = JSON.parse(json); } catch { /* 解析失败 */ }
          return {
            ok: true,
            n: list.length,
            jsonLen: json.length,
            mdLen: md.length,
            jsonRows: parsed ? (parsed['候选词条'] || []).length : -1,
            jsonCount: parsed ? parsed['命中条数'] : -1,
            mdHasTable: md.includes('| 措辞 | 频次 |'),
            mdHasKeys: md.includes('#samples?job='),
          };
        });
        check('候选词条 JSON 导出可解析且条数一致',
          candExport.ok && candExport.jsonRows === candExport.n && candExport.jsonCount === candExport.n,
          candExport.reason || `${candExport.jsonRows} 行 / ${candExport.jsonLen} 字节`);
        check('候选词条 Markdown 导出有概览表与深链说明',
          candExport.mdHasTable && candExport.mdHasKeys && candExport.mdLen > 0,
          `${candExport.mdLen} 字节`);
        await pc4.close();
      }

      /* 7a-4. 引擎本体：URL 往返一致（build → parse 得到同一状态） */
      {
        const { page: p5 } = await openPage(browser, 'samples.html', '#samples');
        const roundTrip = await p5.evaluate(() => {
          const src = EXPLORE_FILTER_SOURCE;
          // ADR-0028：往返用的维度换成两轴分类（多选 + 枚举），
          // 旧的 aspect / sref 已下线，写在这里会让往返天然对不上。
          const st = {
            q: 'portrait',
            dims: { batch: '2026-11-10', medium: ['realistic', 'illustration'], subject: ['person'] },
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
        const { page } = await openPage(browser, 'samples.html', '#samples');
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
      const { page } = await openPage(browser, 'samples.html', '#samples');
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

        /* ADR-0034：研究视图仍在工作台，样本库已是独立页 —— 观察已落 IndexedDB，
           另开工作台页读同一份数据（file:// 同源）。 */
        await page.close();
        const { page: rp } = await openPage(browser, 'index.html', '#research');
        await rp.waitForSelector('[data-od-id="research-head"]', { timeout: 12000 });

        // 研究视图：能看到记录 + 标签聚合
        const rv = await rp.evaluate(() => ({
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
        await rp.evaluate(() => document.querySelector('[data-rv-new-conclusion]')?.click());
        let cOk = false;
        try {
          await rp.waitForSelector('[data-od-id="conclusion-sheet"] #rv-c-body', { timeout: 8000 });
          cOk = true;
        } catch { /* 超时即失败 */ }
        check('结论弹层可打开', cOk);

        await rp.evaluate((k) => {
          const body = document.querySelector('#rv-c-body');
          const keys = document.querySelector('#rv-c-keys');
          const title = document.querySelector('#rv-c-title');
          if (title) title.value = 'verify 断言结论';
          if (body) body.value = 'verify 断言写入的结论';
          if (keys) keys.value = k;
        }, key);
        await rp.evaluate(() => document.querySelector('[data-od-id="conclusion-sheet"] [data-role="save"]')?.click());
        await new Promise((r) => setTimeout(r, 700));

        const cons = await rp.evaluate(async (k) => {
          const all = await RESEARCH_DB.allConclusions();
          const byJob = await RESEARCH_DB.conclusionsByJob(k);
          return { total: all.length, byJob: byJob.length, keys: all[0]?.jobKeys || [] };
        }, key);
        check('结论落库并挂上依据的样本',
          cons.total === 1 && cons.byJob === 1 && cons.keys[0] === key,
          JSON.stringify(cons.keys));

        // 结论视图
        await rp.evaluate(() => document.querySelector('[data-rv-section="conclusions"]')?.click());
        await new Promise((r) => setTimeout(r, 600));
        const cView = await rp.evaluate(() => ({
          n: document.querySelectorAll('[data-rv-conclusion]').length,
          text: document.querySelector('[data-od-id="research-conclusions"]')?.textContent || '',
        }));
        check('结论视图显示结论与其依据样本',
          cView.n === 1 && /依据 1 条样本/.test(cView.text),
          `结论 ${cView.n} 条`);

        // 统计
        const st = await rp.evaluate(async () => await RESEARCH_DB.stats());
        check('研究数据统计正确',
          st.notes === 1 && st.conclusions === 1 && st.jobs === 1,
          JSON.stringify(st));

        // 导出
        const exp = await rp.evaluate(() => {
          try {
            const o = JSON.parse(RESEARCH_VIEW.exportJson());
            return { ok: true, notes: o['观察记录'].length, cons: o['结论'].length };
          } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
        });
        check('研究数据可导出为 JSON',
          exp.ok && exp.notes === 1 && exp.cons === 1,
          JSON.stringify(exp));

        // 灯箱里能看到结论（依据集合包含这条样本的结论）—— 回样本库独立页
        const { page: sp2 } = await openPage(browser, 'samples.html', `#samples?job=${encodeURIComponent(key)}`);
        await sp2.waitForSelector('.job-sheet [data-role="note-list"]', { timeout: 12000 });
        const sheetAll = await sp2.evaluate(() => document.querySelector('[data-role="note-list"]')?.textContent || '');
        check('灯箱同时显示该样本的观察与结论',
          sheetAll.includes('verify 断言写入的观察') && sheetAll.includes('verify 断言写入的结论'),
          sheetAll.replace(/\s+/g, ' ').trim().slice(0, 90));

        // 清场：断言数据不留给用户
        await rp.evaluate(async () => { try { await RESEARCH_DB.clearAll(); } catch { /* 忽略 */ } });
        await sp2.close();
        await rp.close();
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

    /* 8b. 旧风格榜深链直达顶栏独立页（ADR-0034）
       旧 #/styles-top 与 index.html#styles-top 都自动跳到 styles-top.html。 */
    {
      const { page } = await openPage(browser, 'index.html', '#/styles-top');
      const ok = await page.evaluate(() => ({
        path: location.pathname.split('/').pop(),
        hash: location.hash,
        head: document.querySelector('[data-od-id="styles-top-head"] h1')?.textContent.trim() || '',
        cards: document.querySelectorAll('.sref-card').length,
      }));
      check('旧风格榜深链直达风格榜独立页',
        ok.path === 'styles-top.html' && ok.hash === '#styles-top' && ok.head === '风格榜' && ok.cards > 0,
        JSON.stringify(ok));
      await page.close();
    }

    /* 9. 窄屏回归基线（Q11）
       「一级视图按钮被固定底条盖住」以前只登记 NOTE，判定写成 `hit && hit!==tab`。
       elementFromPoint 在元素滚出视口时返回 null，于是「在视口外」被当成「已消失」；
       实测 800×600 下按钮中心点正在视口外（y=619 > 600），NOTE 一直报「已消失」，
       而 390×844 下它被 166px 的固定条整片盖住 —— 首屏根本点不到。
       现在升级为断言，口径是「**首屏可见**的按钮必须点得到」：
       只检查中心点落在视口内的按钮；视口外的（文档比屏幕长，属正常）不计。 */
    for (const vp of [MOBILE, NARROW]) {
      for (const name of ['index.html', 'style-library.html']) {
        const { page, errs } = await openPage(browser, name, '', vp);
        const info = await page.evaluate(() => {
          // 一级视图（ADR-0034）：样本库 / 风格榜已升为顶栏独立页，剩 5 个按钮
          const ids = ['view-library', 'view-candidates', 'view-compare', 'view-research', 'view-materials'];
          const covered = [];
          let visible = 0;
          for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) continue;
            const b = el.getBoundingClientRect();
            const cx = b.left + b.width / 2;
            const cy = b.top + b.height / 2;
            if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) continue;
            visible += 1;
            const hit = document.elementFromPoint(cx, cy);
            if (!hit || (hit !== el && !el.contains(hit))) {
              covered.push({
                id,
                by: hit ? hit.tagName + '.' + String(hit.className).slice(0, 20) : 'null',
                cy: Math.round(cy),
              });
            }
          }
          const bar = document.getElementById('final-bar');
          return {
            visible,
            covered,
            barH: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
            appbar: document.querySelector('#appbar')?.children.length || 0,
            dock: document.querySelector('#dock')?.children.length || 0,
            pageEl: document.querySelector('#page')?.children.length || 0,
          };
        });
        const tag = `${name} ${vp.width}×${vp.height}`;
        check(`${tag} 渲染`, info.appbar > 0 && info.dock > 0 && info.pageEl > 0,
          JSON.stringify({ appbar: info.appbar, dock: info.dock, pageEl: info.pageEl }));
        check(`${tag} 零运行时错误`, errs.length === 0, errs.slice(0, 3).join(' | '));
        if (name === 'index.html') {
          if (vp === MOBILE) {
            /* 手机宽度是硬要求：ADR-0034 后一级视图剩 5 个，全部首屏可见、全可点。 */
            check(`${tag} 一级视图按钮全部可点`, info.visible === 5 && info.covered.length === 0,
              `可见 ${info.visible} 个 · 底条 ${info.barH}px · ` +
                (info.covered.length ? JSON.stringify(info.covered.slice(0, 3)) : '全部可点'));
          } else {
            /* 800×600 只有 600px 高，会话区就占 455px，导航天然落在折叠线下方 ——
               这里要求的是「底条必须保持折叠」，防止它退回 166px 再把导航整片压住。
               按钮是否在首屏交给手机那一条守。 */
            check(`${tag} 底条保持折叠`, info.barH <= 80, `底条 ${info.barH}px`);
          }
        }
        await page.close();
      }
    }
    /* 10. 顶栏设置面板（file:// 降级只读）
       契约字面串：data-role=open-settings / [role=dialog][aria-label="LLM 代理设置"] /
       data-role=settings-save / data-role=settings-offline 含 npm run dev。
       file:// 下无 dev server，面板只能降级只读：保存按钮不可用或不存在，
       且点击过程不得新增 requestfailed（:61 已捕获，这里显式复核）。 */
    {
      const { page, errs } = await openPage(browser, 'index.html');
      const errsBefore = errs.length;
      const reqfailBefore = errs.filter((e) => e.startsWith('reqfail:')).length;
      const hasTrigger = (await page.$('[data-role="open-settings"]')) !== null;
      check('顶栏存在设置入口 [data-role="open-settings"]', hasTrigger);

      if (hasTrigger) {
        await page.click('[data-role="open-settings"]');
        await new Promise((r) => setTimeout(r, 200));
      }
      const panel = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="LLM 代理设置"]');
        const offline = document.querySelector('[data-role="settings-offline"]');
        const save = document.querySelector('[data-role="settings-save"]');
        const visible = (el) => {
          if (!el || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden';
        };
        return {
          dialogOpen: visible(dialog),
          offlineText: offline ? (offline.textContent || '') : '',
          saveUnavailable: !save || save.disabled || save.getAttribute('aria-disabled') === 'true',
        };
      });
      check('点击设置入口后面板打开 [role=dialog][aria-label=LLM 代理设置]', panel.dialogOpen);
      check('file:// 下降级容器文案含 npm run dev',
        panel.offlineText.includes('npm run dev'), panel.offlineText.slice(0, 80));
      check('file:// 下保存按钮不可用或不存在', panel.saveUnavailable);
      const reqfailAfter = errs.filter((e) => e.startsWith('reqfail:')).length;
      check('设置面板交互零新增 requestfailed', reqfailAfter === reqfailBefore,
        `点击前 ${reqfailBefore} / 点击后 ${reqfailAfter}`);
      check('设置面板交互零新增运行时错误', errs.length === errsBefore,
        errs.slice(errsBefore).join(' | '));
      await page.close();
    }

    /* 11. 资料库视图（ADR-0030 落盘版）
       file:// 下资料库是**只读浏览**：验证视图完整、烘焙产物已加载、写入口禁用、
       配图全在 ../public/、筛选与 URL 状态。真正的写入链在第 12 组用 http 跑。 */
    {
      const { page, errs } = await openPage(browser, 'index.html', '#materials');
      const base = await page.evaluate(() => ({
        selected: document.querySelector('#view-materials')?.getAttribute('aria-selected'),
        head: !!document.querySelector('[data-od-id="materials-head"]'),
        toolbar: !!document.querySelector('[data-od-id="materials-toolbar"]'),
        chips: !!document.querySelector('[data-od-id="materials-chips"]'),
        body: !!(document.querySelector('[data-od-id="materials-grid"]')
          || document.querySelector('[data-od-id="materials-empty"]')),
        importBtn: !!document.querySelector('[data-mat-import]'),
        importDisabled: document.querySelector('[data-mat-import]')?.disabled === true,
        readonlyBanner: !!document.querySelector('[data-od-id="materials-readonly"]'),
        dims: window.MATERIALS_VIEW ? MATERIALS_VIEW.source().dims.map((d) => d.key) : [],
        api: window.MATERIALS_API ? MATERIALS_API.status() : null,
        // 产物是顶层 const（全局词法绑定），不会挂到 window 上，必须用 typeof 判定。
        itemsIsArray: typeof MATERIALS_ITEMS !== 'undefined' && Array.isArray(MATERIALS_ITEMS),
        imageBase: typeof MATERIALS_SOURCE !== 'undefined' ? MATERIALS_SOURCE.imageBase : '',
        offNs: [...document.querySelectorAll('.mat-thumbs img')]
          .filter((i) => { const s = i.getAttribute('src') || ''; return s && !s.startsWith('../public/'); }).length,
      }));
      check('资料库视图已激活', base.selected === 'true', `aria-selected=${base.selected}`);
      check('资料库三段式与已选条件条渲染完整',
        base.head && base.toolbar && base.chips && base.body,
        JSON.stringify({ head: base.head, toolbar: base.toolbar, chips: base.chips, body: base.body }));
      check('资料库有导入入口且 file:// 下只读禁用', base.importBtn && base.importDisabled,
        JSON.stringify({ exists: base.importBtn, disabled: base.importDisabled }));
      check('只读提示条可见', base.readonlyBanner);
      check('资料库声明 5 个筛选维度',
        JSON.stringify(base.dims) === JSON.stringify(['q', 'hasImage', 'source', 'tags', 'date']),
        base.dims.join(','));
      check('资料库烘焙产物已加载（MATERIALS_ITEMS 是数组）',
        base.itemsIsArray && !!base.api, JSON.stringify(base.api));
      check('file:// 下判定为只读', !!base.api && base.api.editable === false, JSON.stringify(base.api));
      check('配图命名空间唯一（撤销 blob: 破例）',
        base.offNs === 0 && base.imageBase === '../public/materials/',
        `offNs=${base.offNs} base=${base.imageBase}`);
      check('资料库激活零运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));

      // disabled 按钮点不动：抽屉不该打开
      await page.evaluate(() => { const b = document.querySelector('[data-mat-import]'); if (b) b.click(); });
      await new Promise((r) => setTimeout(r, 150));
      check('只读态点导入不打开抽屉', (await page.$('[data-od-id="materials-import"]')) === null);

      await page.evaluate(() => { location.hash = '#materials?hasImage=1'; });
      await new Promise((r) => setTimeout(r, 400));
      const urlState = await page.evaluate(() => ({
        hash: location.hash,
        hasImage: window.MATERIALS_VIEW ? MATERIALS_VIEW.dims().hasImage : null,
      }));
      check('资料库筛选参数进 URL 并回填状态',
        urlState.hash.includes('hasImage=1') && urlState.hasImage === true,
        JSON.stringify(urlState));
      await page.close();
    }

    /* 12. 资料库落盘写入链（ADR-0030）
       file:// 只读，真正的写入只能在 http 模式下验：随机端口起本机服务 →
       /api/materials 写一条 + 一张图 → 回查文件与烘焙产物 → 浏览器里看得到图
       → DELETE 精确清理。只碰本组自己造的 id，不动用户存量。
       末尾外加一条 preview(--dist) 只读守门：起 --dist 服务，写必须 403。 */
    {
      const port = await freePort();
      const srv = spawn(process.execPath, ['scripts/serve-webui.mjs', `--port=${port}`], {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let srvLog = '';
      srv.stdout.on('data', (d) => { srvLog += d.toString(); });
      srv.stderr.on('data', (d) => { srvLog += d.toString(); });
      const base = `http://127.0.0.1:${port}`;
      const dataFile = path.join(ROOT, 'webui', 'js', 'data-materials.js');
      const itemsDir = path.join(ROOT, 'data', 'materials', 'items');
      const imagesDir = path.join(ROOT, 'public', 'materials');
      const prompt = `verify 落盘断言 ${Date.now()}`;
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      let id = '';
      let file = '';
      try {
        let ready = false;
        for (let i = 0; i < 40; i++) {
          try { const r = await fetch(base + '/api/materials'); if (r.ok) { ready = true; break; } } catch { /* 未起 */ }
          await new Promise((r) => setTimeout(r, 150));
        }
        check('本机服务 /api/materials 可达', ready, srvLog.trim().slice(0, 120));
        if (!ready) throw new Error('服务未就绪');

        const status = await (await fetch(base + '/api/materials')).json();
        check('http 模式下资料库可编辑', status.ok === true && status.editable === true, JSON.stringify(status));

        const post = await fetch(base + '/api/materials/items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: { prompt, source: 'manual', tags: ['verify'] } }),
        });
        const created = await post.json();
        check('POST 写入一条资料', post.status === 200 && created.ok === true, JSON.stringify(created).slice(0, 160));
        id = (created.item && created.item.id) || '';
        check('条目 JSON 真实落盘', !!id && fs.existsSync(path.join(itemsDir, id + '.json')), String(id));
        check('烘焙产物同步刷新', fs.readFileSync(dataFile, 'utf8').includes(prompt));

        const img = await fetch(base + '/api/materials/images', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: id, name: 'verify-1x1.png', dataUrl: `data:image/png;base64,${png}` }),
        });
        const shot = await img.json();
        file = shot.file || '';
        check('图片压缩落盘并被条目引用',
          img.status === 200 && shot.ok === true && !!file && fs.existsSync(path.join(imagesDir, file)),
          JSON.stringify({ status: img.status, file }));
        check('条目 JSON 里引用了该图片',
          !!id && JSON.parse(fs.readFileSync(path.join(itemsDir, id + '.json'), 'utf8')).images.includes(file));

        const page = await browser.newPage();
        await page.setViewport(DESKTOP);
        await page.goto(base + '/index.html#materials', { waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 600));
        const seen = await page.evaluate((p) => {
          const cards = [...document.querySelectorAll('.mat-card')];
          const imgs = [...document.querySelectorAll('.mat-thumbs img')];
          return {
            hit: cards.some((c) => (c.textContent || '').includes(p)),
            editable: window.MATERIALS_API ? MATERIALS_API.status().editable : null,
            src: imgs.map((i) => i.getAttribute('src') || ''),
            loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
          };
        }, prompt);
        check('http 页面可见新条目且判定可编辑', seen.hit && seen.editable === true,
          JSON.stringify({ hit: seen.hit, editable: seen.editable }));
        check('配图走 ../public/materials/ 且真实加载',
          seen.src.length > 0 && seen.src.every((s) => s.startsWith('../public/materials/')) && seen.loaded >= 1,
          JSON.stringify(seen.src));
        await page.close();

        const forbidden = await fetch(base + '/api/materials/items', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
          body: JSON.stringify({ prompt: 'should be blocked' }),
        });
        check('跨 Origin 写入被拒 403', forbidden.status === 403, String(forbidden.status));

        // preview(--dist) 必须只读：它服务的是 dist/ 复制产物，烘焙只写 webui/js/，
        // 开放写会造成「盘上已更新、页面还是旧数据」的假象（ADR-0030）。
        // dist/ 不存在时先建一次，避免让 verify 依赖「先手动 build」这个隐含前提。
        if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
          execFileSync(process.execPath, ['scripts/build-webui.mjs'], { cwd: ROOT, stdio: 'ignore' });
        }
        const distPort = await freePort();
        const distSrv = spawn(process.execPath, ['scripts/serve-webui.mjs', `--port=${distPort}`, '--dist'], {
          cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
        });
        try {
          const distBase = `http://127.0.0.1:${distPort}`;
          let distReady = false;
          for (let i = 0; i < 40; i++) {
            try { const r = await fetch(distBase + '/api/materials'); if (r.ok) { distReady = true; break; } } catch { /* 未起 */ }
            await new Promise((r) => setTimeout(r, 150));
          }
          const distStatus = distReady ? await (await fetch(distBase + '/api/materials')).json() : {};
          check('preview(--dist) 模式判定为只读', distReady && distStatus.editable === false,
            JSON.stringify(distStatus));
          const distPost = await fetch(distBase + '/api/materials/items', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item: { prompt: 'preview 模式不应写入' } }),
          });
          check('preview 模式拒绝写入 403', distPost.status === 403, String(distPost.status));
        } finally {
          distSrv.kill();
        }

        const del = await fetch(base + `/api/materials/items/${id}`, { method: 'DELETE' });
        check('DELETE 清理成功', del.ok, String(del.status));
      } catch (err) {
        check('第 12 组无致命异常', false, err.message);
      } finally {
        srv.kill();
        // 精确清理：只删本组造的条目 / 墓碑 / 图片，绝不清空用户资料目录
        if (id) {
          fs.rmSync(path.join(itemsDir, id + '.json'), { force: true });
          fs.rmSync(path.join(itemsDir, id + '.deleted.json'), { force: true });
        }
        if (file) fs.rmSync(path.join(imagesDir, file), { force: true });
        try {
          const mod = await import('./build-materials-data.mjs');
          mod.rebuild({ log: () => {} });
        } catch { /* 清理失败会在下一条断言里暴露 */ }
        check('断言写入的数据已精确清理', !fs.readFileSync(dataFile, 'utf8').includes(prompt));
      }
    }

    /* 13. 风格与类型库独立页（2026-11）
       独立页，不是工作台一级视图 —— 所以它不进 VIEWS，只挂 NAV。
       这一组把「独立页」当成一个契约来守：
         · 页面能渲染、零运行时错误、顶栏有第 4 个入口
         · 数据契约：条目数 / 分类数 / 分面组数 / 主色数 与源快照一致
         · 筛选语义：**组内任一、组间全部**（多组维度 groupOf 的真正含义）
         · 排序：A→Z 与「最新收录」（口径 = 创建时间倒序，不是实测时间）
         · 会话动作：加进提示词走 other 槽（多选累加，不是 artist 的单选互斥）
         · 深链往返：URL hash 是筛选状态的唯一来源（ADR-0010）
         · 窄屏回归：新顶栏多一个入口，390×844 下不得溢出 */
    {
      const { page, errs } = await openPage(browser, 'style-types.html');

      const info = await page.evaluate(() => ({
        appbar: document.querySelector('#appbar')?.children.length || 0,
        dock: document.querySelector('#dock')?.children.length || 0,
        pageEl: document.querySelector('#page')?.children.length || 0,
        navLinks: [...document.querySelectorAll('.mainnav a')].map(a => a.getAttribute('href')),
        // 数据契约
        entries: typeof TYPE_ENTRIES !== 'undefined' ? TYPE_ENTRIES.length : -1,
        cats: typeof TYPE_CATEGORIES !== 'undefined' ? TYPE_CATEGORIES.length : -1,
        groups: typeof TYPE_TERM_GROUPS !== 'undefined' ? TYPE_TERM_GROUPS.length : -1,
        colours: typeof TYPE_COLOURS !== 'undefined' ? TYPE_COLOURS.length : -1,
        imageMode: typeof TYPE_IMAGE_STATS !== 'undefined' ? TYPE_IMAGE_STATS.mode : '?',
        withImages: typeof TYPE_IMAGE_STATS !== 'undefined' ? TYPE_IMAGE_STATS.withImages : -1,
        totalImages: typeof TYPE_IMAGE_STATS !== 'undefined' ? TYPE_IMAGE_STATS.total : -1,
        tested: typeof TYPE_ENTRIES !== 'undefined' ? TYPE_ENTRIES.filter(e => e.tested).length : -1,
        pub: typeof TYPE_ENTRIES !== 'undefined' ? TYPE_ENTRIES.filter(e => e.publicDomain).length : -1,
        withTime: typeof TYPE_ENTRIES !== 'undefined' ? TYPE_ENTRIES.filter(e => e.createdAt > 0).length : -1,
        cards: document.querySelectorAll('.artist-card').length,
        count: document.querySelector('.toolbar .dock-count')?.textContent.trim() || '',
      }));
      check('风格与类型库 渲染', info.appbar > 0 && info.dock > 0 && info.pageEl > 0,
        JSON.stringify({ appbar: info.appbar, dock: info.dock, pageEl: info.pageEl }));
      check('风格与类型库 零运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
      check('顶栏含「风格与类型库」入口',
        info.navLinks.includes('style-types.html'), info.navLinks.join(','));

      /* 数据契约：条数写死会随上游采集漂移，所以对着页内数据自洽性断言，
         再单独钉住「配图全覆盖」与「每条都有创建时间」两条不变量。 */
      check('类型库 数据装载完整', info.entries > 0 && info.cats === 4 && info.groups > 0 && info.colours > 0,
        `条目 ${info.entries} / 分类 ${info.cats} / 分面组 ${info.groups} / 主色 ${info.colours}`);
      check('类型库 配图为 public 全量', info.imageMode === 'public' && info.withImages === info.totalImages && info.withImages === info.entries,
        `${info.imageMode} / ${info.withImages} / ${info.totalImages}`);
      check('类型库 每条都有创建时间（最新收录口径有据）', info.withTime === info.entries,
        `${info.withTime} / ${info.entries}`);
      check('类型库 首屏卡片与总数一致', info.cards > 0 && info.cards <= info.entries && info.count === `${info.entries.toLocaleString('zh-CN')} 条`,
        `卡片 ${info.cards} · 计数「${info.count}」`);

      /* 筛选语义：组内任一、组间全部
         口径从数据现算，不用写死数字：
           · 单组多值 → 并集（OR）
           · 跨组多值 → 交集（AND）
         页面显示的条数必须与引擎现算一致。
         三个分面词：a、b 同组，c 异组。
           本项目语义：(a ∨ b) ∧ c
           上游平铺 AND：a ∧ b ∧ c        ← 对照组，用来证明两者确实不同 */
      const sem = await page.evaluate(() => {
        const g1 = TYPE_TERM_GROUPS[0];
        const g2 = TYPE_TERM_GROUPS.find(g => g.id !== g1.id);
        const a = g1.terms[0].slug;
        const b = g1.terms[1] ? g1.terms[1].slug : g1.terms[0].slug;
        const c = g2.terms[0].slug;
        const has = (e, s) => (e.terms || []).includes(s);
        const sameGroupUnion = TYPE_ENTRIES.filter(e => has(e, a) || has(e, b)).length;
        const crossGroupAnd = TYPE_ENTRIES.filter(e => has(e, a) && has(e, c)).length;
        const projectSem = TYPE_ENTRIES.filter(e => (has(e, a) || has(e, b)) && has(e, c)).length;
        const upstreamFlat = TYPE_ENTRIES.filter(e => has(e, a) && has(e, b) && has(e, c)).length;
        return { a, b, c, sameGroupUnion, crossGroupAnd, projectSem, upstreamFlat };
      });
      const readCount = async (args) => {
        const { page: p } = await openPage(browser, 'style-types.html', args);
        const txt = await p.evaluate(() => document.querySelector('.toolbar .dock-count')?.textContent.trim() || '');
        await p.close();
        return Number((txt.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''));
      };
      const nOr = await readCount(`#style-types?terms=${sem.a}&terms=${sem.b}`);
      const nAnd = await readCount(`#style-types?terms=${sem.a}&terms=${sem.c}`);
      const nThree = await readCount(`#style-types?terms=${sem.a}&terms=${sem.b}&terms=${sem.c}`);
      check('类型库 组内多值取并集', nOr === sem.sameGroupUnion,
        `页面 ${nOr} / 期望 ${sem.sameGroupUnion}（${sem.a} ∪ ${sem.b}）`);
      check('类型库 跨组多值取交集', nAnd === sem.crossGroupAnd,
        `页面 ${nAnd} / 期望 ${sem.crossGroupAnd}（${sem.a} ∧ ${sem.c}）`);
      check('类型库 三词 = (同组并集) ∧ 跨组', nThree === sem.projectSem,
        `页面 ${nThree} / 期望 ${sem.projectSem}（(${sem.a} ∨ ${sem.b}) ∧ ${sem.c}）`);
      check('类型库 语义 ≠ 上游平铺 AND（本项目更宽）', nThree !== sem.upstreamFlat,
        `本项目 ${nThree} · 上游平铺 ${sem.upstreamFlat}`);

      /* 分面面板：必须能打开、必须按组分组列出分面词 */
      const panel = await page.evaluate(async () => {
        location.hash = '#style-types';
        await new Promise(r => setTimeout(r, 120));
        const btn = document.querySelector('[data-toggle="facets"]');
        if (!btn) return { ok: false };
        btn.click();
        await new Promise(r => setTimeout(r, 150));
        const p = document.querySelector('#type-facet-panel');
        return {
          ok: !!p,
          catBtns: p ? p.querySelectorAll('[data-cat]').length : 0,
          termBtns: p ? p.querySelectorAll('[data-term]').length : 0,
          colourBtns: p ? p.querySelectorAll('[data-colour]').length : 0,
          groupHeads: p ? p.querySelectorAll('.slot-head').length : 0,
        };
      });
      check('类型库 分面面板可打开且分维度齐全',
        panel.ok && panel.catBtns === 5 && panel.termBtns > 0 && panel.colourBtns > 0,
        JSON.stringify(panel));

      /* 详情弹层：必须有真实入口 —— 写好但没人能打开的弹层是死代码。
         入口是卡片右上角的「详情」按钮（data-detail）。 */
      const sheet = await page.evaluate(async () => {
        const btn = document.querySelector('[data-detail]');
        if (!btn) return { hasBtn: false };
        btn.click();
        await new Promise(r => setTimeout(r, 250));
        const s = document.querySelector('[data-od-id="type-sheet"]');
        return {
          hasBtn: true,
          open: !!s,
          name: s?.querySelector('.artist-sheet-name')?.textContent.trim() || '',
          hasCopy: !!s?.querySelector('[data-role="copy"]'),
          hasAdd: !!s?.querySelector('[data-role="add"]'),
          hasBacklink: !!s?.querySelector('a[href*="midlibrary.io"]'),
          blocks: s ? s.querySelectorAll('.artist-sheet-block').length : 0,
        };
      });
      check('类型库 详情弹层有入口且能打开',
        sheet.hasBtn && sheet.open && sheet.name.length > 0,
        JSON.stringify(sheet));
      check('类型库 详情弹层含复制/加进/回链三件套',
        sheet.hasCopy && sheet.hasAdd && sheet.hasBacklink,
        `复制 ${sheet.hasCopy} · 加进 ${sheet.hasAdd} · 回链 ${sheet.hasBacklink}`);
      // 关掉弹层，别挡住后面的用例
      await page.evaluate(async () => {
        const close = document.querySelector('[data-od-id="type-sheet"] [data-role="close"]');
        if (close) close.click();
        await new Promise(r => setTimeout(r, 200));
      });
      const sheetClosed = await page.evaluate(() => !document.querySelector('[data-od-id="type-sheet"]'));
      check('类型库 详情弹层可关闭', sheetClosed);

      /* 两个右上角按钮不能重叠（.artist-more 是右上角绝对定位） */
      const overlap = await page.evaluate(() => {
        const d = document.querySelector('[data-detail]');
        const c = document.querySelector('[data-copy]');
        if (!d || !c) return { ok: false };
        const a = d.getBoundingClientRect();
        const b = c.getBoundingClientRect();
        const hit = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        return { ok: true, hit, a: [Math.round(a.left), Math.round(a.right)], b: [Math.round(b.left), Math.round(b.right)] };
      });
      check('类型库 卡片「详情」与「复制」按钮不重叠', overlap.ok && overlap.hit === false,
        JSON.stringify(overlap));

      /* 「复制提示词」：用户钦定的动作之一，必须真的复制了英文写法。
         捕获口径：navigator.clipboard.writeText（file:// 下不弹权限框）+ copy 事件。 */
      const copyRes = await page.evaluate(async () => {
        window.__copied = [];
        const orig = navigator.clipboard && navigator.clipboard.writeText;
        if (orig) {
          navigator.clipboard.writeText = (t) => { window.__copied.push(String(t)); return orig.call(navigator.clipboard, t); };
        }
        document.addEventListener('copy', (e) => {
          try { window.__copied.push(e.clipboardData.getData('text')); } catch { /* 忽略 */ }
        }, true);
        const btn = document.querySelector('[data-copy]');
        const id = btn?.dataset.copy || '';
        const expected = (TYPE_ENTRIES.find(x => x.id === id) || {}).en || '';
        btn.click();
        await new Promise(r => setTimeout(r, 250));
        return { id, expected, copied: window.__copied };
      });
      check('类型库「复制提示词」复制的是英文写法',
        copyRes.copied.length > 0 && copyRes.copied.includes(copyRes.expected),
        `期望「${copyRes.expected}」· 实得 ${JSON.stringify(copyRes.copied)}`);

      /* 排序：A→Z 与「最新收录」
         「最新收录」口径 = 创建时间倒序（不是上游的实测时间，快照里没有那个字段）。 */
      const sortRes = await page.evaluate(async () => {
        const out = {};
        location.hash = '#style-types';
        await new Promise(r => setTimeout(r, 120));
        const sel = document.querySelector('#type-sort');
        sel.value = 'az';
        sel.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 120));
        out.az = [...document.querySelectorAll('.artist-name')].slice(0, 5).map(n => n.textContent.trim());
        out.azSorted = out.az.every((v, i) => i === 0 || out.az[i - 1].localeCompare(v, 'en') <= 0);
        sel.value = 'new';
        sel.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 120));
        out.newFirst = [...document.querySelectorAll('.artist-name')].slice(0, 5).map(n => n.textContent.trim());
        out.hash = location.hash;
        out.sortOpts = [...document.querySelectorAll('#type-sort option')].map(o => o.value);
        return out;
      });
      check('类型库 A→Z 排序生效', sortRes.azSorted, sortRes.az.join(' | '));
      check('类型库 排序项只有 A→Z 与最新收录',
        JSON.stringify(sortRes.sortOpts) === JSON.stringify(['az', 'new']),
        JSON.stringify(sortRes.sortOpts));
      check('类型库 最新收录写进 URL 且可复现', sortRes.hash.includes('sort=new'), sortRes.hash);

      // 最新收录的首条 = 全库创建时间最大者（页内现算，不用写死名字）
      // 比较器必须与页面一致：创建时间倒序 + 同时间按名称升序（漏掉 tiebreak 会算错）
      const newest = await page.evaluate(() => {
        const top = [...TYPE_ENTRIES].sort((a, b) =>
          (b.createdAt || 0) - (a.createdAt || 0) || String(a.name).localeCompare(String(b.name)))[0];
        return { name: top.name, at: top.createdAt };
      });
      check('类型库 最新收录首条 = 创建时间最新者', sortRes.newFirst[0] === newest.name,
        `页面「${sortRes.newFirst[0]}」 / 现算「${newest.name}」`);

      /* 会话动作：加进提示词走 other 槽（多选累加）
         注意 session 是 core.js 的顶层 const —— 它是全局词法绑定，不挂 window，
         所以只能直接引用 `session`，不能写 `window.session`。
         清场必须走 puppeteer 的 page.reload()，不能在 evaluate 里调 location.reload()
         —— 那会销毁执行上下文，evaluate 直接抛 "Execution context was destroyed"。

         清场要删**三个**键，不只是 v2：第 4 组在 localStorage 里留了旧键
         `mj-session-v1`，而 core.js 的 loadSession() 在没有 v2 键时会读 v1
         并迁移 —— 只删 v2 的话，v1 里那条 lighting 会被迁回来，断言里
         就凭空多出一个非 other 槽的选中项。 */
      const clearSession = async (pg) => {
        await pg.evaluate(() => {
          for (const k of ['mj-session-v2', 'mj-session-v1', 'mj-parameter-values']) {
            try { localStorage.removeItem(k); } catch { /* 忽略 */ }
          }
        });
      };
      await clearSession(page);
      await page.reload({ waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 700));
      const sessionRes = await page.evaluate(async () => {
        const cards = [...document.querySelectorAll('[data-item-id]')].slice(0, 2);
        cards[0].click();
        await new Promise(r => setTimeout(r, 100));
        cards[1].click();
        await new Promise(r => setTimeout(r, 200));
        const sel = typeof session !== 'undefined' && session.selected ? session.selected : [];
        return {
          count: sel.length,
          positions: sel.map(s => s.position),
          ids: sel.map(s => s.id),
          final: (document.querySelector('#final-bar')?.textContent || '').replace(/\s+/g, ' ').trim(),
        };
      });
      check('类型库 加进提示词可多选累加（other 槽）',
        sessionRes.count === 2 && sessionRes.positions.every(p => p === 'other'),
        JSON.stringify({ count: sessionRes.count, positions: sessionRes.positions }));
      check('类型库 选中项出现在最终提示词里',
        sessionRes.ids.length > 0 && sessionRes.final.length > 0, sessionRes.final);
      // 清场：别把选中状态留给用户
      await clearSession(page);

      /* 深链往返：hash 是唯一状态源（ADR-0010） */
      const deep = await page.evaluate(async () => {
        const cat = TYPE_CATEGORIES[0].id;
        location.hash = `#style-types?cat=${cat}&tested=1`;
        await new Promise(r => setTimeout(r, 150));
        const expected = TYPE_ENTRIES.filter(e => e.cat === cat && e.tested).length;
        const shown = Number((document.querySelector('.toolbar .dock-count')?.textContent || '0').replace(/[^\d]/g, ''));
        const pressed = document.querySelector('[data-toggle="tested"]')?.getAttribute('aria-pressed');
        return { expected, shown, pressed, hash: location.hash };
      });
      check('类型库 深链往返复现筛选状态',
        deep.shown === deep.expected && deep.pressed === 'true' && deep.hash.includes('cat='),
        JSON.stringify(deep));

      await page.close();
    }

    /* 14. 风格库独立页（2026-11 · ADR-0032）
       风格库此前只有「搜索」一个筛选维度，卡片也是一套独立的 code-* 样式 ——
       与「风格与类型库」页不一致。本轮把两边对齐：分面补齐、卡片形态统一。
       这一组把对齐结果当成契约来守：
         · 页面能渲染、零运行时错误
         · 数据契约：条目数 / 分面组数 / 分面词数 / 主色数 与页内数据自洽
         · 筛选语义：**组内任一、组间全部**（与类型库页同一套引擎语义）
         · 主色维度多选取并集
         · 开关：只看实测 / 只看精选
         · 排序：A→Z 与「最新收录」（口径 = 创建时间倒序，不是实测时间）
         · 卡片：与类型库页同形态（artist-card + 两个右上角按钮），缩略图 1:1
         · 详情弹层：风格描述 / 分面词 / 主色 + 复制 --sref + 上游回链
         · 深链往返：URL hash 是筛选状态的唯一来源（ADR-0010） */
    {
      const { page, errs } = await openPage(browser, 'style-library.html');

      const info = await page.evaluate(() => ({
        appbar: document.querySelector('#appbar')?.children.length || 0,
        dock: document.querySelector('#dock')?.children.length || 0,
        pageEl: document.querySelector('#page')?.children.length || 0,
        navLinks: [...document.querySelectorAll('.mainnav a')].map(a => a.getAttribute('href')),
        // 数据契约
        codes: typeof STYLE_CODES !== 'undefined' ? STYLE_CODES.length : -1,
        groups: typeof STYLE_TERM_GROUPS !== 'undefined' ? STYLE_TERM_GROUPS.length : -1,
        terms: typeof STYLE_TERM_GROUPS !== 'undefined'
          ? STYLE_TERM_GROUPS.reduce((a, g) => a + g.terms.length, 0) : -1,
        colours: typeof STYLE_COLOURS !== 'undefined' ? STYLE_COLOURS.length : -1,
        imageMode: typeof STYLE_IMAGE_STATS !== 'undefined' ? STYLE_IMAGE_STATS.mode : '?',
        withImages: typeof STYLE_IMAGE_STATS !== 'undefined' ? STYLE_IMAGE_STATS.withImages : -1,
        totalImages: typeof STYLE_IMAGE_STATS !== 'undefined' ? STYLE_IMAGE_STATS.total : -1,
        tested: typeof STYLE_CODES !== 'undefined' ? STYLE_CODES.filter(c => c.tested).length : -1,
        pick: typeof STYLE_CODES !== 'undefined' ? STYLE_CODES.filter(c => c.pick).length : -1,
        withTime: typeof STYLE_CODES !== 'undefined' ? STYLE_CODES.filter(c => c.createdAt > 0).length : -1,
        withPreview: typeof STYLE_CODES !== 'undefined' ? STYLE_CODES.filter(c => c.preview).length : -1,
        withObs: typeof STYLE_CODES !== 'undefined' ? STYLE_CODES.filter(c => c.observation).length : -1,
        cards: document.querySelectorAll('.artist-card').length,
        count: document.querySelector('.toolbar .dock-count')?.textContent.trim() || '',
        // 卡片形态：与类型库页同套 class（不是另一套 code-* 样式）
        cardClass: document.querySelector('.artist-card')?.className || '',
        hasPick: !!document.querySelector('.artist-card .artist-pick'),
        moreBtns: document.querySelectorAll('.artist-card .artist-more').length,
        hasDetail: !!document.querySelector('[data-detail]'),
        hasCopy: !!document.querySelector('[data-copy]'),
        hasCopySref: !!document.querySelector('[data-copy-sref]'),
        // 缩略图：上游图是 320×320 正方形，版位必须是 1:1
        thumb: (() => {
          const img = document.querySelector('.artist-thumb img');
          if (!img) return null;
          const r = img.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), nat: img.naturalWidth + 'x' + img.naturalHeight };
        })(),
      }));
      check('风格库 渲染', info.appbar > 0 && info.dock > 0 && info.pageEl > 0,
        JSON.stringify({ appbar: info.appbar, dock: info.dock, pageEl: info.pageEl }));
      check('风格库 零运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
      check('顶栏含「风格库」入口', info.navLinks.includes('style-library.html'), info.navLinks.join(','));

      /* 数据契约：条数写死会随上游采集漂移，所以对着页内数据自洽性断言，
         再单独钉住几条不变量（配图全覆盖 / 每条都有创建时间 / 每条都有风格描述）。 */
      check('风格库 数据装载完整', info.codes > 0 && info.groups > 0 && info.terms > 0 && info.colours > 0,
        `条目 ${info.codes} / 分面组 ${info.groups} / 分面词 ${info.terms} / 主色 ${info.colours}`);
      check('风格库 配图为 public 全量',
        info.imageMode === 'public' && info.withImages === info.totalImages && info.withImages === info.codes,
        `${info.imageMode} / ${info.withImages} / ${info.totalImages}`);
      check('风格库 每条都有创建时间（最新收录口径有据）', info.withTime === info.codes,
        `${info.withTime} / ${info.codes}`);
      check('风格库 每条都有风格描述（充当地图简介行）', info.withObs === info.codes,
        `${info.withObs} / ${info.codes}`);
      check('风格库 每条都有参考图路径', info.withPreview === info.codes,
        `${info.withPreview} / ${info.codes}`);
      check('风格库 首屏卡片与总数一致',
        info.cards > 0 && info.cards <= info.codes && info.count === `${info.codes.toLocaleString('zh-CN')} 条`,
        `卡片 ${info.cards} · 计数「${info.count}」`);

      /* 卡片形态：与「风格与类型库」页同套 artist-* class（ADR-0032） */
      check('风格库 卡片沿用 artist-card / artist-pick 外壳',
        info.cardClass.includes('artist-card') && info.hasPick,
        `class="${info.cardClass}"`);
      check('风格库 卡片右上角有两个按钮（详情 + 复制）',
        info.moreBtns >= 2 && info.hasDetail && info.hasCopy,
        `.artist-more ${info.moreBtns} 个 · 详情 ${info.hasDetail} · 复制 ${info.hasCopy}`);
      check('风格库 整卡可点（复制 --sref）', info.hasCopySref, 'data-copy-sref');
      check('风格库 缩略图为 1:1 正方形版位',
        !!info.thumb && info.thumb.w === info.thumb.h,
        info.thumb ? `${info.thumb.w}×${info.thumb.h}（原图 ${info.thumb.nat}）` : '无缩略图');

      /* 筛选语义：组内任一、组间全部（与类型库页同一套引擎语义）
         口径从数据现算，不用写死数字：
           · 单组多值 → 并集（OR）
           · 跨组多值 → 交集（AND）
         三个分面词：a、b 同组，c 异组。
           本项目语义：(a ∨ b) ∧ c
           上游平铺 AND：a ∧ b ∧ c        ← 对照组，用来证明两者确实不同 */
      const sem = await page.evaluate(() => {
        const g1 = STYLE_TERM_GROUPS[0];
        const g2 = STYLE_TERM_GROUPS.find(g => g.id !== g1.id);
        const a = g1.terms[0].slug;
        const b = g1.terms[1] ? g1.terms[1].slug : g1.terms[0].slug;
        const c = g2.terms[0].slug;
        const has = (e, s) => (e.terms || []).includes(s);
        const hasC = (e, s) => (e.colours || []).includes(s);
        const col0 = STYLE_COLOURS[0].slug;
        const col1 = STYLE_COLOURS[1] ? STYLE_COLOURS[1].slug : col0;
        return {
          a, b, c, col0, col1,
          sameGroupUnion: STYLE_CODES.filter(e => has(e, a) || has(e, b)).length,
          crossGroupAnd: STYLE_CODES.filter(e => has(e, a) && has(e, c)).length,
          projectSem: STYLE_CODES.filter(e => (has(e, a) || has(e, b)) && has(e, c)).length,
          upstreamFlat: STYLE_CODES.filter(e => has(e, a) && has(e, b) && has(e, c)).length,
          colUnion: STYLE_CODES.filter(e => hasC(e, col0) || hasC(e, col1)).length,
          colOne: STYLE_CODES.filter(e => hasC(e, col0)).length,
        };
      });
      const readStyleCount = async (args) => {
        const { page: p } = await openPage(browser, 'style-library.html', args);
        const txt = await p.evaluate(() => document.querySelector('.toolbar .dock-count')?.textContent.trim() || '');
        await p.close();
        return Number((txt.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''));
      };
      const nOr = await readStyleCount(`#style-library?terms=${sem.a}&terms=${sem.b}`);
      const nAnd = await readStyleCount(`#style-library?terms=${sem.a}&terms=${sem.c}`);
      const nThree = await readStyleCount(`#style-library?terms=${sem.a}&terms=${sem.b}&terms=${sem.c}`);
      check('风格库 组内多值取并集', nOr === sem.sameGroupUnion,
        `页面 ${nOr} / 期望 ${sem.sameGroupUnion}（${sem.a} ∪ ${sem.b}）`);
      check('风格库 跨组多值取交集', nAnd === sem.crossGroupAnd,
        `页面 ${nAnd} / 期望 ${sem.crossGroupAnd}（${sem.a} ∧ ${sem.c}）`);
      check('风格库 三词 = (同组并集) ∧ 跨组', nThree === sem.projectSem,
        `页面 ${nThree} / 期望 ${sem.projectSem}（(${sem.a} ∨ ${sem.b}) ∧ ${sem.c}）`);
      check('风格库 语义 ≠ 上游平铺 AND（本项目更宽）', nThree !== sem.upstreamFlat,
        `本项目 ${nThree} · 上游平铺 ${sem.upstreamFlat}`);

      /* 主色维度：多选取并集（同维度内没有 groupOf） */
      const nColUnion = await readStyleCount(`#style-library?colours=${sem.col0}&colours=${sem.col1}`);
      const nColOne = await readStyleCount(`#style-library?colours=${sem.col0}`);
      check('风格库 主色多选取并集', nColUnion === sem.colUnion,
        `页面 ${nColUnion} / 期望 ${sem.colUnion}（${sem.col0} ∪ ${sem.col1}）`);
      check('风格库 单主色取交集', nColOne === sem.colOne,
        `页面 ${nColOne} / 期望 ${sem.colOne}（${sem.col0}）`);

      /* 分面面板：必须能打开、必须按组分组列出分面词与主色，
         且面板上的计数必须等于现算值（分面计数口径：加候选值后整链的结果条数）。 */
      const panel = await page.evaluate(async () => {
        location.hash = '#style-library';
        await new Promise(r => setTimeout(r, 120));
        const btn = document.querySelector('[data-toggle="facets"]');
        if (!btn) return { ok: false };
        btn.click();
        await new Promise(r => setTimeout(r, 250));
        const p = document.querySelector('#style-facet-panel');
        if (!p) return { ok: false, missing: true };
        const termRows = [...p.querySelectorAll('[data-term]')].map(b => ({
          slug: b.dataset.term,
          shown: Number((b.querySelector('.en')?.textContent || '0').replace(/[^\d]/g, '')),
          real: STYLE_CODES.filter(e => (e.terms || []).includes(b.dataset.term)).length,
        }));
        const colourRows = [...p.querySelectorAll('[data-colour]')].map(b => ({
          slug: b.dataset.colour,
          shown: Number((b.getAttribute('title') || '').match(/(\d[\d,]*)/)?.[1]?.replace(/,/g, '') || 0),
          real: STYLE_CODES.filter(e => (e.colours || []).includes(b.dataset.colour)).length,
        }));
        return {
          ok: true,
          termBtns: termRows.length,
          colourBtns: colourRows.length,
          groupHeads: p.querySelectorAll('.slot-head').length,
          termMismatch: termRows.filter(r => r.shown !== r.real).length,
          colourMismatch: colourRows.filter(r => r.shown !== r.real).length,
          // 面板只列实际用到的词与色：零计数不该出现（列出来点了必然空）
          zeroTerms: termRows.filter(r => r.real === 0).length,
          zeroColours: colourRows.filter(r => r.real === 0).length,
        };
      });
      check('风格库 分面面板可打开且分维度齐全',
        panel.ok && panel.termBtns > 0 && panel.colourBtns > 0 && panel.groupHeads === info.groups,
        JSON.stringify({ termBtns: panel.termBtns, colourBtns: panel.colourBtns, groupHeads: panel.groupHeads }));
      check('风格库 分面计数与现算一致',
        panel.termMismatch === 0 && panel.colourMismatch === 0,
        `分面词不符 ${panel.termMismatch} 个 · 主色不符 ${panel.colourMismatch} 个`);
      check('风格库 分面只列实际用到的词与色（无零计数项）',
        panel.zeroTerms === 0 && panel.zeroColours === 0,
        `零计数词 ${panel.zeroTerms} · 零计数色 ${panel.zeroColours}`);

      /* 开关：只看实测 / 只看精选 */
      const toggles = await page.evaluate(async () => {
        const read = () => document.querySelector('.toolbar .dock-count')?.textContent.trim() || '';
        const out = { before: read() };
        const testedBtn = document.querySelector('[data-toggle="tested"]');
        testedBtn.click();
        await new Promise(r => setTimeout(r, 200));
        out.tested = read();
        out.testedHash = location.hash;
        out.testedPressed = testedBtn.getAttribute('aria-pressed');
        document.querySelector('[data-toggle="pick"]').click();
        await new Promise(r => setTimeout(r, 200));
        out.both = read();
        out.bothHash = location.hash;
        document.querySelector('[data-toggle="tested"]').click();
        await new Promise(r => setTimeout(r, 200));
        out.pickOnly = read();
        return out;
      });
      const expectTested = await page.evaluate(() => STYLE_CODES.filter(c => c.tested).length);
      const expectPick = await page.evaluate(() => STYLE_CODES.filter(c => c.pick).length);
      const expectBoth = await page.evaluate(() => STYLE_CODES.filter(c => c.tested && c.pick).length);
      check('风格库 只看实测生效',
        toggles.tested === `${expectTested.toLocaleString('zh-CN')} 条` && toggles.testedPressed === 'true',
        `页面「${toggles.tested}」/ 期望「${expectTested.toLocaleString('zh-CN')} 条」· hash ${toggles.testedHash}`);
      check('风格库 只看精选生效',
        toggles.pickOnly === `${expectPick.toLocaleString('zh-CN')} 条`,
        `页面「${toggles.pickOnly}」/ 期望「${expectPick.toLocaleString('zh-CN')} 条」`);
      check('风格库 实测 + 精选可叠加',
        toggles.both === `${expectBoth.toLocaleString('zh-CN')} 条`
        && toggles.bothHash.includes('tested=1') && toggles.bothHash.includes('pick=1'),
        `页面「${toggles.both}」/ 期望「${expectBoth.toLocaleString('zh-CN')} 条」· hash ${toggles.bothHash}`);

      /* 详情弹层：必须有真实入口 —— 写好但没人能打开的弹层是死代码。
         入口是卡片右上角的「详情」按钮（data-detail）。
         风格码是**参数**不是提示词片段（ADR-0009），所以没有「加进提示词」，
         取而代之的是「复制 --sref」+ 上游回链。 */
      const sheet = await page.evaluate(async () => {
        location.hash = '#style-library';
        await new Promise(r => setTimeout(r, 150));
        const btn = document.querySelector('[data-detail]');
        if (!btn) return { hasBtn: false };
        btn.click();
        await new Promise(r => setTimeout(r, 300));
        const s = document.querySelector('[data-od-id="code-sheet"]');
        return {
          hasBtn: true,
          open: !!s,
          name: s?.querySelector('.artist-sheet-name')?.textContent.trim() || '',
          heads: s ? [...s.querySelectorAll('.artist-sheet-block h3')].map(h => h.textContent.trim()) : [],
          copyText: s?.querySelector('[data-role="copy"]')?.textContent.trim() || '',
          hasCopy: !!s?.querySelector('[data-role="copy"]'),
          hasAdd: !!s?.querySelector('[data-role="add"]'),
          hasBacklink: !!s?.querySelector('a[href*="midlibrary.io"]'),
          terms: s ? s.querySelectorAll('.term').length : 0,
          swatches: s ? s.querySelectorAll('.swatches .swatch').length : 0,
          blocks: s ? s.querySelectorAll('.artist-sheet-block').length : 0,
          created: (s?.textContent || '').includes('按创建时间，非实测时间'),
        };
      });
      check('风格库 详情弹层有入口且能打开',
        sheet.hasBtn && sheet.open && sheet.name.length > 0,
        JSON.stringify({ open: sheet.open, name: sheet.name }));
      check('风格库 详情弹层含风格描述 / 分面词 / 主色',
        sheet.heads.includes('风格描述') && sheet.heads.includes('分面词') && sheet.heads.includes('主色'),
        sheet.heads.join(' | '));
      check('风格库 详情弹层含复制 --sref 与上游回链',
        sheet.hasCopy && sheet.hasBacklink && sheet.copyText.includes('--sref'),
        `${sheet.copyText} · 回链 ${sheet.hasBacklink}`);
      check('风格库 详情弹层没有「加进提示词」（风格码是参数不是片段）',
        sheet.hasAdd === false, `加进 ${sheet.hasAdd}`);
      check('风格库 详情弹层标注收录口径（创建时间，非实测时间）',
        sheet.created === true, `收录口径标注 ${sheet.created}`);
      // 关掉弹层，别挡住后面的用例
      await page.evaluate(async () => {
        const close = document.querySelector('[data-od-id="code-sheet"] [data-role="close"]');
        if (close) close.click();
        await new Promise(r => setTimeout(r, 200));
      });
      const sheetClosed = await page.evaluate(() => !document.querySelector('[data-od-id="code-sheet"]'));
      check('风格库 详情弹层可关闭', sheetClosed);

      /* 两个右上角按钮不能重叠（.artist-more 是右上角绝对定位） */
      const overlap = await page.evaluate(() => {
        const d = document.querySelector('[data-detail]');
        const c = document.querySelector('[data-copy]');
        if (!d || !c) return { ok: false };
        const a = d.getBoundingClientRect();
        const b = c.getBoundingClientRect();
        const hit = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        return { ok: true, hit, a: [Math.round(a.left), Math.round(a.right)], b: [Math.round(b.left), Math.round(b.right)] };
      });
      check('风格库 卡片「详情」与「复制」按钮不重叠', overlap.ok && overlap.hit === false,
        JSON.stringify(overlap));

      /* 「复制」：风格码复制的是 `--sref <码>` 写法（不是裸码）。
         捕获口径：navigator.clipboard.writeText（file:// 下不弹权限框）+ copy 事件。 */
      const copyRes = await page.evaluate(async () => {
        window.__copied = [];
        const orig = navigator.clipboard && navigator.clipboard.writeText;
        if (orig) {
          navigator.clipboard.writeText = (t) => { window.__copied.push(String(t)); return orig.call(navigator.clipboard, t); };
        }
        document.addEventListener('copy', (e) => {
          try { window.__copied.push(e.clipboardData.getData('text')); } catch { /* 忽略 */ }
        }, true);
        const btn = document.querySelector('[data-copy]');
        const id = btn?.dataset.copy || '';
        const expected = '--sref ' + ((STYLE_CODES.find(x => x.id === id) || {}).code || '');
        btn.click();
        await new Promise(r => setTimeout(r, 250));
        return { id, expected, copied: window.__copied };
      });
      check('风格库「复制」复制的是 --sref 写法',
        copyRes.copied.length > 0 && copyRes.copied.includes(copyRes.expected),
        `期望「${copyRes.expected}」· 实得 ${JSON.stringify(copyRes.copied)}`);

      /* 排序：A→Z 与「最新收录」
         「最新收录」口径 = 创建时间倒序（不是上游的实测时间，快照里没有那个字段）。 */
      const sortRes = await page.evaluate(async () => {
        const out = {};
        location.hash = '#style-library';
        await new Promise(r => setTimeout(r, 150));
        const sel = document.querySelector('#style-sort');
        sel.value = 'az';
        sel.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 200));
        out.az = [...document.querySelectorAll('.artist-name')].slice(0, 5).map(n => n.textContent.trim());
        out.azSorted = out.az.every((v, i) => i === 0 || out.az[i - 1].localeCompare(v, 'en') <= 0);
        sel.value = 'new';
        sel.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 200));
        out.newFirst = [...document.querySelectorAll('.artist-name')].slice(0, 5).map(n => n.textContent.trim());
        out.hash = location.hash;
        out.sortOpts = [...document.querySelectorAll('#style-sort option')].map(o => o.value);
        return out;
      });
      check('风格库 A→Z 排序生效', sortRes.azSorted, sortRes.az.join(' | '));
      check('风格库 排序项只有 A→Z 与最新收录',
        JSON.stringify(sortRes.sortOpts) === JSON.stringify(['az', 'new']),
        JSON.stringify(sortRes.sortOpts));
      check('风格库 最新收录写进 URL 且可复现', sortRes.hash.includes('sort=new'), sortRes.hash);

      // 最新收录的首条 = 全库创建时间最大者（页内现算，不用写死名字）
      // 比较器必须与页面一致：创建时间倒序 + 同时间按名称升序。
      // 风格码里同日创建的有一大把（末批 2026-10-25 同毫秒就有多条），
      // 漏掉 tiebreak 会算出一个「创建时间同样最新、但名字更靠后」的条目。
      const newest = await page.evaluate(() => {
        const top = [...STYLE_CODES].sort((a, b) =>
          (b.createdAt || 0) - (a.createdAt || 0) || String(a.name).localeCompare(String(b.name)))[0];
        return { name: top.name, at: top.createdAt };
      });
      check('风格库 最新收录首条 = 创建时间最新者', sortRes.newFirst[0] === newest.name,
        `页面「${sortRes.newFirst[0]}」 / 现算「${newest.name}」`);

      /* 搜索：按名称或码命中 */
      const searchRes = await page.evaluate(async () => {
        location.hash = '#style-library';
        await new Promise(r => setTimeout(r, 150));
        const inp = document.querySelector('#style-search');
        inp.value = 'Acheron';
        inp.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 250));
        return {
          count: document.querySelector('.toolbar .dock-count')?.textContent.trim() || '',
          names: [...document.querySelectorAll('.artist-name')].map(n => n.textContent.trim()),
          hash: location.hash,
        };
      });
      check('风格库 搜索按名称命中并写进 URL',
        searchRes.names.length > 0 && searchRes.names.every(n => /acheron/i.test(n))
        && searchRes.hash.includes('q='),
        `${searchRes.count} · ${searchRes.names.join(' | ')} · ${searchRes.hash}`);

      /* 深链往返：hash 是唯一状态源（ADR-0010） */
      const deep = await page.evaluate(async () => {
        const terms = STYLE_TERM_GROUPS[0].terms.slice(0, 2).map(t => t.slug);
        const q = `#style-library?terms=${terms[0]}&terms=${terms[1]}&tested=1&pick=1&sort=new`;
        location.hash = q;
        await new Promise(r => setTimeout(r, 300));
        // 同组两个词是「组内任一」（OR），不是 AND —— 口径必须与引擎一致
        const expected = STYLE_CODES.filter(c => c.tested && c.pick
          && ((c.terms || []).includes(terms[0]) || (c.terms || []).includes(terms[1]))).length;
        const shown = Number((document.querySelector('.toolbar .dock-count')?.textContent || '0').replace(/[^\d]/g, ''));
        // 分面面板要打开才读得到 [data-term] 的选中态
        const facetsBtn = document.querySelector('[data-toggle="facets"]');
        if (facetsBtn.getAttribute('aria-pressed') !== 'true') {
          facetsBtn.click();
          await new Promise(r => setTimeout(r, 250));
        }
        return {
          expected, shown,
          testedPressed: document.querySelector('[data-toggle="tested"]')?.getAttribute('aria-pressed'),
          pickPressed: document.querySelector('[data-toggle="pick"]')?.getAttribute('aria-pressed'),
          sortVal: document.querySelector('#style-sort')?.value,
          termsOn: [...document.querySelectorAll('[data-term][aria-pressed="true"]')].map(b => b.dataset.term),
          hash: location.hash,
        };
      });
      check('风格库 深链往返复现筛选状态',
        deep.shown === deep.expected && deep.testedPressed === 'true' && deep.pickPressed === 'true'
        && deep.sortVal === 'new' && deep.termsOn.length === 2,
        JSON.stringify(deep));

      await page.close();
    }

    /* 15. 艺术家库独立页（2026-11 / ADR-0033）
       原工作台「提示词库 → 艺术家 / 摄影师」二级页签升为顶栏一级独立页。
       必须同时守住三件事：① 数据链不再截断（历史上 terms 截 6 / colours 截 4 /
       文本截 420、320 / 3,994 条配图路径丢失）；② 筛选语义对齐引擎（分面 groupOf、
       类别 enum 进 URL）；③ 旧深链仍能到达新页，工作台原位置留下路标。 */
    {
      const { page, errs } = await openPage(browser, 'artists.html');
      const info = await page.evaluate(() => ({
        appbar: document.querySelector('#appbar')?.children.length || 0,
        dock: document.querySelector('#dock')?.children.length || 0,
        pageEl: document.querySelector('#page')?.children.length || 0,
        navLinks: [...document.querySelectorAll('.mainnav a')].map(a => a.getAttribute('href')),
        title: document.querySelector('[data-od-id="artist-head"] h1')?.textContent.trim(),
        chips: [...document.querySelectorAll('.head-meta .param-chip')].map(x => x.textContent.trim()),
        count: document.querySelector('.toolbar .dock-count')?.textContent.trim(),
        cards: document.querySelectorAll('[data-od-id^="artist-card-"]').length,
        cats: document.querySelectorAll('[data-artist-cat]').length,
        detailBtns: document.querySelectorAll('.artist-card .artist-more[data-detail]').length,
        copyBtns: document.querySelectorAll('.artist-card [data-copy]').length,
        data: {
          total: ARTISTS.length,
          tested: ARTISTS.filter(a => a.tested).length,
          withPreview: ARTISTS.filter(a => !!a.preview).length,
          cats: ARTIST_CATEGORIES.length,
          groups: TERM_GROUPS.length,
          terms: TERM_GROUPS.reduce((n, g) => n + g.terms.length, 0),
          colours: COLOURS.length,
          termMax: Math.max(...ARTISTS.map(a => a.terms.length)),
          colMax: Math.max(...ARTISTS.map(a => a.colours.length)),
          introMax: Math.max(...ARTISTS.map(a => a.intro.length)),
          obsMax: Math.max(...ARTISTS.map(a => a.observation.length)),
        },
      }));
      check('艺术家库 渲染', info.appbar > 0 && info.dock > 0 && info.pageEl > 0,
        JSON.stringify({ appbar: info.appbar, dock: info.dock, pageEl: info.pageEl }));
      check('艺术家库 零运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
      check('顶栏含「艺术家库」入口且共 7 个（ADR-0034 加样本库/风格榜）',
        info.navLinks.includes('artists.html') && info.navLinks.length === 7, info.navLinks.join(','));
      check('艺术家库 头部标题与统计',
        info.title === '艺术家库' && info.chips.length === 4
        && info.chips.some(s => s.startsWith('带参考图')), info.chips.join(' | '));
      /* 逆向防护：与第 14 组不同，这里不写死 4,322 / 68 / 87 —— 采集后条数会变。
         钉住的是「不再被截断」这个不变量：全量配图、字段长度超过历史截断上限。 */
      const d = info.data;
      check('艺术家库 数据链无截断',
        d.total > 0 && d.withPreview === d.total && d.termMax > 6 && d.colMax > 4
        && d.introMax > 420 && d.obsMax > 320 && d.tested > 0 && d.cats > 0,
        JSON.stringify(d));
      check('艺术家库 首屏卡片与按钮',
        info.cards === 48 && info.detailBtns === 48 && info.copyBtns === 0,
        `卡片 ${info.cards} · 详情 ${info.detailBtns} · 复制 ${info.copyBtns}`);

      // 分面板：只列实际用到的词与色，数量必须与词表声明一致
      await page.click('[data-toggle="facets"]');
      await new Promise(r => setTimeout(r, 200));
      const facetInfo = await page.evaluate(() => ({
        panel: !!document.querySelector('#artist-facet-panel'),
        declTerms: TERM_GROUPS.reduce((n, g) => n + g.terms.length, 0),
        declColours: COLOURS.length,
        terms: document.querySelectorAll('[data-term]').length,
        colours: document.querySelectorAll('[data-colour]').length,
      }));
      check('艺术家库 分面面板打开且词色齐全',
        facetInfo.panel && facetInfo.terms === facetInfo.declTerms && facetInfo.colours === facetInfo.declColours,
        JSON.stringify(facetInfo));

      // 分组语义：同组取或 > 跨组取与 > 上游平铺 AND（三者必须能区分）
      const sem = await page.evaluate(() => {
        /* 固定一组能区分三种语义的词：同组 expressive / baroque 取或，
           跨组再与 subject 的 scenes 取与。条数现算、不写死 —— 数据变化后
           断言仍校验「并集 > 交集 > 平铺 AND」这个不变量。
           （反过来把 baroque 放在 a 位会得到 cross = flat = 4，测不出差别。） */
        const a = 'expressive', b = 'baroque', c = 'scenes';
        const has = (x, s) => (x.terms || []).includes(s);
        return {
          a, b, c,
          union: ARTISTS.filter(x => has(x, a) || has(x, b)).length,
          cross: ARTISTS.filter(x => has(x, a) && has(x, c)).length,
          flat: ARTISTS.filter(x => has(x, a) && has(x, b) && has(x, c)).length,
        };
      });
      check('艺术家库 同组并集 / 跨组交集 / 平铺 AND 三者可区分',
        sem.union > sem.cross && sem.cross > sem.flat, JSON.stringify(sem));

      // enum 类别：进 URL，计数与现算一致
      const catRes = await page.evaluate(async () => {
        const btn = document.querySelector('[data-artist-cat="photographers"]');
        const expected = ARTISTS.filter(a => a.cat === 'photographers').length;
        btn.click();
        await new Promise(r => setTimeout(r, 200));
        return {
          expected,
          shown: Number((document.querySelector('.toolbar .dock-count')?.textContent || '0').replace(/[^\d]/g, '')),
          hash: location.hash,
          active: document.querySelector('[data-artist-cat][aria-pressed="true"]')?.dataset.artistCat,
        };
      });
      check('艺术家库 类别筛选进 URL 且计数正确',
        catRes.shown === catRes.expected && catRes.hash.includes('artistCat=photographers')
        && catRes.active === 'photographers', JSON.stringify(catRes));

      // 只看实测：bool 维度，计数与现算一致
      const testedRes = await page.evaluate(async () => {
        location.hash = '#artists';
        await new Promise(r => setTimeout(r, 150));
        document.querySelector('[data-toggle="tested"]').click();
        await new Promise(r => setTimeout(r, 200));
        return {
          expected: ARTISTS.filter(a => a.tested).length,
          shown: Number((document.querySelector('.toolbar .dock-count')?.textContent || '0').replace(/[^\d]/g, '')),
          hash: location.hash,
          pressed: document.querySelector('[data-toggle="tested"]')?.getAttribute('aria-pressed'),
        };
      });
      check('艺术家库 只看实测生效',
        testedRes.shown === testedRes.expected && testedRes.hash.includes('tested=1')
        && testedRes.pressed === 'true', JSON.stringify(testedRes));

      // 会话槽位：整卡点击写入 position:'artist'（单选互斥），头部提示同步
      // 清三键：旧会话迁移会带回 mj-session-v1，污染「单选后只有一个选中项」的断言。
      await page.evaluate(() => {
        for (const k of ['mj-session-v2', 'mj-session-v1', 'mj-parameter-values']) {
          try { localStorage.removeItem(k); } catch { /* 忽略 */ }
        }
      });
      await page.reload({ waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 500));
      const pickRes = await page.evaluate(async () => {
        const cards = [...document.querySelectorAll('.artist-card [data-item-id]')].slice(0, 2);
        cards[0].click();
        await new Promise(r => setTimeout(r, 80));
        cards[1].click();
        await new Promise(r => setTimeout(r, 150));
        const sel = (typeof session !== 'undefined' && session.selected) ? session.selected : [];
        return {
          count: sel.length,
          positions: sel.map(s => s.position),
          only: sel[0] ? sel[0].id === cards[1].dataset.itemId : false,
          on: cards[1].getAttribute('aria-pressed'),
          slot: document.querySelector('[data-od-id="artist-slot"]')?.textContent.trim(),
        };
      });
      check('艺术家库 整卡加进提示词且艺术家槽单选互斥',
        pickRes.count === 1 && pickRes.positions[0] === 'artist' && pickRes.only
        && pickRes.on === 'true' && pickRes.slot && pickRes.slot !== '当前艺术家：未选',
        JSON.stringify(pickRes));

      // 详情弹层：五段内容 + 加入按钮 + 上游回链；没有复制按钮（复制是风格码的动作）
      const sheetRes = await page.evaluate(async () => {
        document.querySelector('.artist-card [data-detail]').click();
        await new Promise(r => setTimeout(r, 150));
        const sheet = document.querySelector('[data-od-id="artist-sheet"]');
        return {
          open: !!sheet,
          blocks: [...(sheet?.querySelectorAll('.artist-sheet-block h3') || [])].map(h => h.textContent.trim()),
          pick: !!sheet?.querySelector('[data-role="pick"]'),
          copy: !!sheet?.querySelector('[data-role="copy"]'),
          link: !!sheet?.querySelector('a[href*="midlibrary.io"]'),
        };
      });
      check('艺术家库 详情弹层五件套 + 加入按钮 + 回链',
        sheetRes.open && ['简介', '风格描述', '分面词', '主色', '提示词写法']
          .every(x => sheetRes.blocks.includes(x))
        && sheetRes.pick && sheetRes.link && !sheetRes.copy, JSON.stringify(sheetRes));
      const closed = await page.evaluate(async () => {
        document.querySelector('[data-od-id="artist-sheet"] [data-role="close"]')?.click();
        await new Promise(r => setTimeout(r, 150));
        return !document.querySelector('[data-od-id="artist-sheet"]');
      });
      check('艺术家库 详情弹层可关闭', closed, String(closed));

      // 排序：默认有图在前不写 sort；A→Z 写 sort=az 且首条按名称升序
      const sortRes = await page.evaluate(async () => {
        const out = {};
        location.hash = '#artists';
        await new Promise(r => setTimeout(r, 150));
        out.defaultHash = location.hash;
        const sel = document.querySelector('#artist-sort');
        out.opts = [...sel.options].map(o => o.value);
        sel.value = 'az';
        sel.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 200));
        out.names = [...document.querySelectorAll('.artist-name')].slice(0, 5).map(n => n.textContent.trim());
        out.sorted = out.names.every((v, i) => i === 0 || out.names[i - 1].localeCompare(v, 'en') <= 0);
        out.hash = location.hash;
        return out;
      });
      check('艺术家库 排序只有「默认 / A→Z」（无创建时间，不编造最新收录）',
        JSON.stringify(sortRes.opts) === JSON.stringify(['curated', 'az']), JSON.stringify(sortRes.opts));
      check('艺术家库 A→Z 生效且写进 URL',
        sortRes.sorted && sortRes.hash.includes('sort=az') && !sortRes.defaultHash.includes('sort='),
        JSON.stringify(sortRes));

      // 深链往返：hash 是唯一状态源（ADR-0010）
      {
        const { page: p2 } = await openPage(browser, 'artists.html', '#artists?artistCat=photographers&tested=1&sort=az');
        const deep = await p2.evaluate(() => ({
          expected: ARTISTS.filter(a => a.cat === 'photographers' && a.tested).length,
          shown: Number((document.querySelector('.toolbar .dock-count')?.textContent || '0').replace(/[^\d]/g, '')),
          cat: document.querySelector('[data-artist-cat][aria-pressed="true"]')?.dataset.artistCat,
          tested: document.querySelector('[data-toggle="tested"]')?.getAttribute('aria-pressed'),
          sort: document.querySelector('#artist-sort')?.value,
        }));
        check('艺术家库 深链往返复现类别 / 实测 / 排序',
          deep.shown === deep.expected && deep.cat === 'photographers'
          && deep.tested === 'true' && deep.sort === 'az', JSON.stringify(deep));
        await p2.close();
      }

      // 旧链兼容：index.html#artists?... 带参数落到新页；#/artists 更旧契约同样可达
      for (const [hash, mustInclude] of [['#artists?q=monet', 'q=monet'], ['#/artists?terms=baroque', 'terms=baroque']]) {
        const { page: p3 } = await openPage(browser, 'index.html', hash);
        await new Promise(r => setTimeout(r, 500));
        const redirected = await p3.evaluate(() => ({
          path: location.pathname.split('/').pop(),
          hash: location.hash,
          title: document.querySelector('h1')?.textContent.trim(),
        }));
        check(`艺术家库 旧链 ${hash} 带参数重定向`,
          redirected.path === 'artists.html' && redirected.hash.includes(mustInclude)
          && redirected.title === '艺术家库', JSON.stringify(redirected));
        await p3.close();
      }

      // 工作台侧：页签已删，只留路标与可点计数
      {
        const { page: wb } = await openPage(browser, 'index.html');
        const left = await wb.evaluate(() => ({
          path: location.pathname.split('/').pop() + location.hash,
          tabs: [...document.querySelectorAll('[data-tab]')].map(b => b.dataset.tab),
          navHref: document.querySelector('[data-od-id="artist-nav-link"]')?.getAttribute('href'),
          countHref: document.querySelector('[data-od-id="artist-count-link"]')?.getAttribute('href'),
        }));
        check('工作台 艺术家页签已迁出且留下路标与计数链接',
          left.path === 'index.html' && left.tabs.length === 4 && !left.tabs.includes('artists')
          && left.navHref === 'artists.html' && left.countHref === 'artists.html', JSON.stringify(left));
        await wb.close();
      }
      await page.close();
    }

    /* 13b. 风格与类型库 / 风格库 / 艺术家库 窄屏回归
       顶栏现有 7 个入口（ADR-0034 新增「样本库」「风格榜」），要确认：
         · 390×844 下首屏可见的入口可点、不被固定底条盖住
         · 其余入口可横向滚动到达（导航本身就是 overflow-x:auto，不要求 7 项全挤进首屏）
         · 文档没有横向溢出（scrollWidth 不超过视口）—— 这是真实回归的判据
       与第 9 组的口径一致：只看「首屏可见」的按钮是否点得到。
       三个独立页共用同一套顶栏，所以逐页跑 —— 只跑一个就漏掉其它页的回归。 */
    for (const pageName of ['style-types.html', 'style-library.html', 'artists.html']) {
      for (const vp of [MOBILE, NARROW]) {
        const { page, errs } = await openPage(browser, pageName, '', vp);
        const info = await page.evaluate(() => {
          const nav = document.querySelector('.mainnav');
          const links = [...document.querySelectorAll('.mainnav a')];
          const covered = [];
          let visible = 0;
          for (const el of links) {
            const b = el.getBoundingClientRect();
            const cx = b.left + b.width / 2;
            const cy = b.top + b.height / 2;
            if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) continue;
            visible += 1;
            const hit = document.elementFromPoint(cx, cy);
            if (!hit || (hit !== el && !el.contains(hit))) {
              covered.push({ t: (el.textContent || '').trim(), by: hit ? hit.tagName : 'null', cy: Math.round(cy) });
            }
          }
          const bar = document.getElementById('final-bar');
          return {
            visible,
            covered,
            viewportH: window.innerHeight,
            barH: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
            navOverflow: nav ? nav.scrollWidth - nav.clientWidth : -1,
            docOverflow: document.documentElement.scrollWidth - window.innerWidth,
            links: links.length,
            appbar: document.querySelector('#appbar')?.children.length || 0,
            dock: document.querySelector('#dock')?.children.length || 0,
            pageEl: document.querySelector('#page')?.children.length || 0,
          };
        });
        const tag = `${pageName.replace('.html', '')} ${vp.width}×${vp.height}`;
        check(`${tag} 渲染`, info.appbar > 0 && info.dock > 0 && info.pageEl > 0,
          JSON.stringify({ appbar: info.appbar, dock: info.dock, pageEl: info.pageEl }));
        check(`${tag} 零运行时错误`, errs.length === 0, errs.slice(0, 3).join(' | '));
        /* 7 项在 390px 下必然有若干项要横滚才可见（导航 overflow-x:auto）。
           elementFromPoint 在横滚容器的右边缘会命中 sticky header —— 那是
           「需要横滚才到得了」，不是 bug。真正要防的是被**固定底条**盖住：
           只把落在底条区（cy > innerHeight - barH）的遮挡判失败。 */
        check(`${tag} 主导航首屏可见项可点`,
          info.visible >= 4 && !info.covered.some((c) => c.cy > info.viewportH - info.barH),
          `可见 ${info.visible}/${info.links} · ` + (info.covered.length ? JSON.stringify(info.covered) : '全部可点'));
        check(`${tag} 顶栏无横向溢出`, info.docOverflow <= 0,
          `文档溢出 ${info.docOverflow}px · 导航溢出 ${info.navOverflow}px`);
        await page.close();
      }
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
