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
        // 2.6：候选词条是「假设集 × 证据集」的对质界面，也是一级视图（ADR-0024）
        check('候选词条是一级视图',
          viewIds.includes('candidates'), viewIds.join(','));
        // ADR-0026：官方风格榜升为第六个一级视图
        check('风格榜是一级视图',
          viewIds.includes('styles-top'), viewIds.join(','));
        // ADR-0029：资料库是第七个一级视图（独立数据集，不是样本库的页签或导入表单）
        check('资料库是一级视图',
          viewIds.includes('materials'), viewIds.join(','));
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

        /* 3. 研究样本库（一级视图）：分页、筛选、占位、灯箱 */
        await page.click('#view-samples');
        await page.waitForSelector('.job-card', { timeout: 15000 });
        const board = await page.evaluate(() => ({
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
        const axisSum = await page.evaluate(() => {
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
        const axisFiltered = await page.evaluate(async () => {
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
        await page.evaluate(async () => {
          const box = document.querySelector('#ex-subject .msel-row input[value="person"]');
          if (box) { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); }
          await new Promise((r) => setTimeout(r, 300));
        });

        await page.click('[data-role="ex-more"]');
        await new Promise((r) => setTimeout(r, 200));
        const afterMore = await page.$$eval('.job-card', (els) => els.length);
        check('加载更多 +60', afterMore === 120, `实际 ${afterMore}`);

        /* ── 2.2 提示词短语筛选（多选下拉，懒加载）──────────────────────
           断言口径：筛出的卡片数 == 源数据里真正含该短语的条数，
           且 URL 里带上了对应参数（ADR-0010：hash 是筛选的唯一来源）。
           逐条穷举的选项不内联：571 条短语全塞进 toolbar 会让它涨到 177 KB。 */
        await page.evaluate(() => {
          const det = document.querySelector('#ex-phrase');
          if (det) det.open = true;
        });
        await new Promise((r) => setTimeout(r, 600));

        const multi = await page.evaluate(() => {
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

        /* 灯箱：选首屏里有七段拆解的作业。
           第 13 步已用规则解析补齐全部缺口（942 → 971），因此下面的「空态分支」
           断言会退化为验证有拆解作业的灯箱 —— 那段逻辑本来就是自洽的。 */
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

        /* ── 7a-2b. 拆解分层与生成日期（报告 2.5 / 2.7 / 第 13 步）──────────
           三件事各守一条：
             1. 拆解来源下拉的三项计数之和 == 全部作业数（缺口归零，且分层不重不漏）
             2. 「只看可信拆解」= 手工 + 逐条，点一下 URL 里就是这两项，刷新能复现
             3. 生成日期的下拉计数 == 真的点下去筛出的条数（批次与生成日是两个口径，
                口径错的症状正是「显示的数和筛出的数对不上」）
           参数维度（2.8）另守一条：灯箱必须把「不可研究」说清楚。 */
        {
          await page.evaluate(() => { location.hash = '#samples'; });
          await new Promise((r) => setTimeout(r, 400));

          const decompUi = await page.evaluate(() => {
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
          const trusted = await page.evaluate(async () => {
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
          await page.goto(fileUrl('index.html') + trustedHash, { waitUntil: 'load', timeout: 30000 });
          await new Promise((r) => setTimeout(r, 800));
          const trustedReload = await page.evaluate(() => ({
            checked: [...document.querySelectorAll('#ex-decomp input:checked')].length,
            count: parseInt(document.querySelector('.toolbar .dock-count').textContent, 10),
            view: document.querySelector('[data-view][aria-selected="true"]')?.dataset.view,
          }));
          check('刷新后拆解来源筛选被复现',
            trustedReload.checked === 2 && trustedReload.count === trusted.count
              && trustedReload.view === 'samples',
            `view=${trustedReload.view} / ${trustedReload.count} 条 / 勾 ${trustedReload.checked}`);

          // 生成日期：下拉计数必须等于真的筛出来的条数
          await page.evaluate(() => { location.hash = '#samples'; });
          await new Promise((r) => setTimeout(r, 500));
          const dateProbe = await page.evaluate(async () => {
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
          const paramNote = await page.evaluate(async () => {
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
        const countText = () => page.$eval('.toolbar .dock-count', (el) => parseInt(el.textContent, 10));
        const options = await page.evaluate(() => ({
          batches: [...document.querySelectorAll('#ex-batch option')].filter((o) => o.value).map((o) => o.value),
          mediums: [...document.querySelectorAll('#ex-medium .msel-row input')].map((e) => e.value),
          subjects: [...document.querySelectorAll('#ex-subject .msel-row input')].map((e) => e.value),
        }));
        const empty = [];
        for (const v of options.batches) {
          await page.select('#ex-batch', v);
          if (!(await countText() > 0)) empty.push('batch=' + v);
        }
        await page.select('#ex-batch', '');

        const toggleAxis = async (id, value, on) => {
          await page.evaluate(([mid, mv, mon]) => {
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

    /* 4b. 官方风格榜收编为工作台一级视图（ADR-0026）
       旧断言挂在 style-library.html 的 #style-tab-top 上；tab 已删，
       同一批数据契约改在 index.html#styles-top 上验。 */
    {
      const { page, errs } = await openPage(browser, 'index.html', '#styles-top');
      const top = await page.evaluate(() => ({
        activeView: typeof ui !== 'undefined' ? ui.view : '',
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
      const { page } = await openPage(browser, 'index.html', '#samples');
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
        const candGoto = await pc3.evaluate(async () => {
          const btn = document.querySelector('[data-cand-goto]');
          if (!btn) return { ok: false, reason: '没有可点的出处' };
          btn.click();
          await new Promise((r) => setTimeout(r, 700));
          return { ok: true, hash: location.hash, isSamples: !!document.querySelector('[data-od-id="explore-head"]') };
        });
        check('点引用键能跳到研究样本库并直达该样本',
          candGoto.ok && candGoto.hash.includes('#samples?job=') && candGoto.isSamples,
          candGoto.hash);
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
        const { page: p5 } = await openPage(browser, 'index.html', '#samples');
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

    /* 8b. 旧风格榜深链直达工作台风格榜视图（ADR-0026）
       旧实现用 location.replace 丢掉 hash，而 styleUi.tab 又不进 URL —— 深链本来就断。 */
    {
      const { page } = await openPage(browser, 'index.html', '#/styles-top');
      const ok = await page.evaluate(() => ({
        path: location.pathname.split('/').pop(),
        hash: location.hash,
        view: typeof ui !== 'undefined' ? ui.view : '',
        cards: document.querySelectorAll('.sref-card').length,
      }));
      check('旧风格榜深链直达工作台风格榜视图',
        ok.path === 'index.html' && ok.hash === '#styles-top' && ok.view === 'styles-top' && ok.cards > 0,
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
          // 一级视图（报告 4.2）：探测对象是这 7 个按钮，不是旧页签
          const ids = ['view-library', 'view-samples', 'view-candidates', 'view-compare', 'view-research', 'view-styles-top', 'view-materials'];
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
            /* 手机宽度是硬要求：7 个按钮首屏全在、全可点（此时它们确实都在首屏内）。 */
            check(`${tag} 一级视图按钮全部可点`, info.visible === 7 && info.covered.length === 0,
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
