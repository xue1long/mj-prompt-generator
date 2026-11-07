/**
 * 冒烟验证：用本机 Chrome/Edge 真实渲染应用，检查关键功能。
 *
 * 需要：npm i -D puppeteer-core，且本机装有 Chrome 或 Edge。
 * 用法：npm run dev（另开一个终端）后执行 npm run verify
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

const root = process.cwd()
const executablePath = CHROME_CANDIDATES.find(p => fs.existsSync(p))

if (!executablePath) {
  console.error('未找到 Chrome / Edge，无法执行冒烟验证。')
  process.exit(2)
}

/**
 * 开发服务器没起就跳过它，只验证构建产物。
 * Vite 默认只绑定 localhost（在本机解析到 ::1），所以两个地址都要试，
 * 否则会出现「dev-server 目标被静默跳过、只验了上次的 dist」的情况。
 */
async function isReachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

const DEV_URLS = [
  'http://127.0.0.1:5173/',
  'http://localhost:5173/',
  'http://127.0.0.1:5174/',
  'http://localhost:5174/',
  'http://127.0.0.1:5175/',
  'http://localhost:5175/',
]
const targets = []
for (const devUrl of DEV_URLS) {
  if (await isReachable(devUrl)) {
    targets.push({ name: 'dev-server', url: devUrl })
    break
  }
}
if (!targets.length) {
  console.log('（开发服务器未启动，跳过 dev-server 目标）')
}
targets.push({
  name: 'file-protocol',
  url: pathToFileURL(path.join(root, 'dist', 'index.html')).href,
})

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--allow-file-access-from-files', '--no-sandbox'],
})

let failed = false

for (const target of targets) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 950 })

  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('requestfailed', r =>
    errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`)
  )

  await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 1200))

  // ---- 基础渲染 + 组装 ----
  const report = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const q = sel => document.querySelector(sel)
    const qa = sel => [...document.querySelectorAll(sel)]
    const finalPromptValue = () => {
      const area = qa('textarea').find(t => t.value && t.value.includes('photography'))
      return area ? area.value : ''
    }
    const unsupportedFlags = () =>
      qa('.parameter-item.is-unsupported .param-flag').map(e => e.textContent.trim())

    // 参数区默认是收起的：先展开再做断言
    const toggle = q('[data-role="parameter-panel-toggle"]')
    let panelExpanded = false
    if (toggle) {
      if (toggle.getAttribute('aria-expanded') === 'false') {
        toggle.click()
        await sleep(500)
      }
      panelExpanded = toggle.getAttribute('aria-expanded') === 'true'
    }

    const out = {
      mounted: !!q('.app-container'),
      tabLabels: qa('.n-tabs-tab').map(t => t.textContent.trim()),
      paramCount: qa('.parameter-item').length,
      unsupported: unsupportedFlags(),
      panelExpanded,
      splitterFound: !!q('.column-splitter'),
      finalPrompt: '',
      subjectTyped: false,
      tagAdded: false,
      afterSwitch: { unsupported: [], finalPrompt: '' },
      restored: { selectedItems: [], subject: '' },
      style: { code: '', inputValue: '', finalPrompt: '' },
      artistPrompt: '',
    }

    // 主体与环境输入
    const textarea = q('.subject-environment-input textarea')
    if (textarea) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set
      setter.call(textarea, 'a woman with long hair, in a beautiful garden')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(500)
      out.subjectTyped = true
    }

    // 选一个提示词标签
    const tab = qa('.n-tabs-tab').find(t => t.textContent.includes('快门速度'))
    if (tab) {
      tab.click()
      await sleep(600)
      const tag = q('.prompt-tag')
      if (tag) {
        tag.click()
        await sleep(600)
        out.tagAdded = true
      }
    }
    out.finalPrompt = finalPromptValue()

    // 切换模型版本到 V7，检查联动
    // 按 data-param-id 精确定位，不依赖"版本恰好排在参数表第一位"
    const versionSelect = q('[data-param-id="version"] .n-base-selection')
    if (versionSelect) {
      versionSelect.click()
      await sleep(500)
      const option = qa('.n-base-select-option').find(o => o.textContent.includes('V7'))
      if (option) {
        option.click()
        await sleep(700)
        out.afterSwitch.unsupported = unsupportedFlags()
        out.afterSwitch.finalPrompt = finalPromptValue()
      }
    }

    // ---- 风格库 ----
    // 风格参考码是参数：点「填入 --sref」后应落到参数框，并出现在最终提示词里
    const styleTab = qa('.n-tabs-tab').find(t => t.textContent.includes('风格参考码'))
    if (styleTab) {
      styleTab.click()
      await sleep(900)
      const card = q('.code-card')
      if (card) {
        const code = card.querySelector('.code-value')?.textContent.trim() ?? ''
        const fillBtn = [...card.querySelectorAll('button')].find(b =>
          b.textContent.includes('填入')
        )
        if (fillBtn) fillBtn.click()
        await sleep(700)
        const srefInput = q('[data-param-id="styleRef"] input')
        out.style.code = code
        out.style.inputValue = srefInput ? srefInput.value : ''
        out.style.finalPrompt = finalPromptValue()
      }
    }

    // 风格条目进词库：搜到艺术家并选中，最终提示词应是「photography by <名字>」
    const searchInput = q('.prompt-search input')
    if (searchInput) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      setter.call(searchInput, 'Puuung')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(700)
      const result = q('.result-item')
      if (result) {
        result.click()
        await sleep(700)
      }
      out.artistPrompt = finalPromptValue()
    }

    // ---- 筛选：URL 即状态 ----
    const visible = sel => qa(sel).find(el => el.offsetParent !== null)
    const activeTabText = () => q('.n-tabs-tab--active')?.textContent ?? ''
    /** 等标签页真的切过去再读，别用固定 sleep（dev 模式下大类目渲染慢） */
    const waitForTab = async keyword => {
      for (let i = 0; i < 60; i++) {
        if (activeTabText().includes(keyword)) return true
        await sleep(100)
      }
      return false
    }
    const readFilter = () => ({
      count: (visible('.filter-count')?.textContent ?? '').trim(),
      cards: qa('.code-card').length,
      hash: location.hash,
    })

    out.filters = { pick: null, tested: null, ignored: '' }

    location.hash = '#/style-codes?pick=1'
    out.filters.pickTabOk = await waitForTab('风格参考码')
    await sleep(400)
    out.filters.pick = readFilter()

    location.hash = '#/artists?tested=1'
    out.filters.testedTabOk = await waitForTab('艺术家')
    await sleep(400)
    out.filters.tested = readFilter()

    location.hash = '#/style-codes?category=painters'
    out.filters.ignoredTabOk = await waitForTab('风格参考码')
    await sleep(400)
    out.filters.ignored = (q('.ignored-alert')?.textContent ?? '').trim()

    // ---- 分面筛选：组内任一、组间全部 ----
    const facetCounts = {}
    const readFacet = async (hash, key) => {
      location.hash = hash
      await waitForTab('风格参考码')
      await sleep(500)
      facetCounts[key] = (visible('.filter-count')?.textContent ?? '').trim()
    }
    await readFacet('#/style-codes?term=detailed', 'termDetailed')
    await readFacet('#/style-codes?colour=blue', 'colourBlue')
    await readFacet('#/style-codes?term=detailed&colour=blue', 'termAndColour')
    await readFacet('#/style-codes?term=characters&term=landscapes', 'groupOr')
    await readFacet('#/style-codes?term=detailed&term=characters', 'crossGroupAnd')
    facetCounts.termChips = qa('.facet-chip').length
    facetCounts.swatches = qa('.swatch').length
    out.facets = facetCounts

    return out
  })

  // ---- 页签内容要能滚 ----
  // 艺术家页有 4000 多条，内容高度远超视口：页签容器必须自己可滚，
  // 否则超出的部分被卡片裁掉，页面看着正常却滚不动。
  //
  // 判据用「结构 + 键盘滚动」，不用鼠标滚轮：无头 Chrome 的合成器不产生
  // 滚轮滚动，测出来时灵时不灵（真机 Chrome 实测滚动正常）。键盘滚动走
  // 主线程，在无头环境里稳定，能真实反映容器可不可滚。
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.n-tabs-tab')].find(t =>
      t.textContent.includes('艺术家')
    )
    tab?.click()
  })
  await new Promise(r => setTimeout(r, 1200))
  const scrollState = await page.evaluate(() => {
    const pane = document.querySelector('.tabs-container .n-tabs-pane-wrapper')
    if (!pane) return null
    pane.scrollTop = 0
    pane.focus()
    const cs = getComputedStyle(pane)
    return {
      overflowY: cs.overflowY,
      maxScroll: pane.scrollHeight - pane.clientHeight,
    }
  })
  let artistScrolled = false
  if (scrollState) {
    for (let attempt = 0; attempt < 3 && !artistScrolled; attempt++) {
      await page.keyboard.press('PageDown')
      await new Promise(r => setTimeout(r, 600))
      artistScrolled = await page.evaluate(() => {
        const pane = document.querySelector('.tabs-container .n-tabs-pane-wrapper')
        return pane ? pane.scrollTop > 0 : false
      })
      if (!artistScrolled) {
        await page.evaluate(() => {
          const pane = document.querySelector('.tabs-container .n-tabs-pane-wrapper')
          if (pane) pane.scrollTop = 0
        })
      }
    }
    scrollState.scrollable = ['auto', 'scroll'].includes(scrollState.overflowY) && scrollState.maxScroll > 100
  }

  // ---- 艺术家页：卡片网格 ----
  // 4000 多条要用卡片铺开：图 + 一句简介 + 逐条回链，
  // 这三样是"认得出他是谁"的全部依据，缺一样都算回归。
  const artistGrid = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const qa = sel => [...document.querySelectorAll(sel)]
    const pane = document.querySelector('.tabs-container .n-tabs-pane-wrapper')
    const bar = document.querySelector('.category-filter')
    const cards = qa('.artist-card')
    const styleCard = cards.find(c => c.querySelector('.source-link'))

    // 筛选条吸顶：滚下去它要留在页签容器顶上
    if (pane) pane.scrollTop = 2000
    await sleep(300)
    const sticky =
      !!bar &&
      !!pane &&
      Math.abs(bar.getBoundingClientRect().top - pane.getBoundingClientRect().top) < 4
    if (pane) pane.scrollTop = 0
    await sleep(200)

    const out = {
      cardCount: cards.length,
      styleCards: cards.filter(c => c.querySelector('.source-link')).length,
      subtitle: styleCard?.querySelector('.card-subtitle')?.textContent.trim() ?? '',
      name: styleCard?.querySelector('.card-name')?.textContent.trim() ?? '',
      backlink: styleCard?.querySelector('.source-link')?.getAttribute('href') ?? '',
      colourDots: qa('.artist-card .colour-dot').length,
      sticky,
      selectPrompt: '',
      modalLabels: [],
    }

    // 点卡片 = 选中：最终提示词里应出现「photography by <名字>」
    if (styleCard) {
      styleCard.click()
      await sleep(700)
      const area = qa('textarea').find(t => t.value && t.value.includes('photography'))
      out.selectPrompt = area ? area.value : ''

      // 详情弹窗：风格条目要能看到简介与风格描述
      styleCard.querySelector('.action-btn')?.click()
      await sleep(600)
      const modal = document.querySelector('.n-modal')
      out.modalLabels = modal
        ? [...modal.querySelectorAll('.info-label')].map(e => e.textContent.trim())
        : []
    }
    return out
  })

  // ---- 会话持久化：刷新后应恢复 ----
  // 用 domcontentloaded 而不是 networkidle2：风格库里几百张懒加载图片会让
  // networkidle2 长时间等不到"网络空闲"，那是图片没加载完，不是应用没起来。
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await new Promise(r => setTimeout(r, 1500))
  const restored = await page.evaluate(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
    const qa = sel => [...document.querySelectorAll(sel)]
    // 刷新后若 hash 把标签页带到风格库，主体输入框根本不在 DOM 里：
    // 先切回「主体与环境」再读，否则读到的是"没恢复"的假象
    const subjectTab = qa('.n-tabs-tab').find(tab => tab.textContent.includes('主体与环境'))
    if (subjectTab) {
      subjectTab.click()
      await sleep(400)
    }
    return {
      selectedItems: qa('.selected-item .item-text').map(e => e.textContent.trim()),
      subject: document.querySelector('.subject-environment-input textarea')?.value ?? '',
    }
  })

  await page.screenshot({
    path: path.join(root, 'docs', 'screenshots', `${target.name}.png`),
  })

  // ---- 探索榜：顶层独立页面 ----
  // 它不是提示词库里的一个页签：整屏独占，左栏不出现。
  // 网格粒度是**作业**（一条作业一张卡，卡内带四格缩略图条），
  // 四格图要真的加载出来（本地图在 public/explore/thumbs/）。
  await page.evaluate(() => {
    location.hash = '#/explore'
  })
  await new Promise(r => setTimeout(r, 1500))
  const explore = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const qa = sel => [...document.querySelectorAll(sel)]
    const q = sel => document.querySelector(sel)
    const out = {
      pageVisible: !!q('.explore-page'),
      workbenchHidden: !q('.content-grid'),
      cardCount: qa('.explore-card').length,
      loadedImages: 0,
      aspectBadges: qa('.explore-card .badge-aspect').length,
      srefBadges: qa('.explore-card .badge-sref').length,
      cardTitles: qa('.explore-card .card-title').length,
      stripCells: qa('.explore-card .strip-cell').length,
      downloadBtns: qa('.explore-card .download-btn').length,
      moreButton: !![...qa('button')].find(b => b.textContent.includes('加载更多')),
      resultCount: (q('.result-count')?.textContent ?? '').trim(),
      hash: location.hash,
      mainBefore: '',
      mainAfter: '',
      switched: false,
      lightboxStripCells: 0,
      lightboxStageIndex: '',
      lightboxPrompt: '',
      lightboxHasFill: false,
      conflictButtons: [],
      srefCode: '',
      srefFillClicked: false,
      filteredHash: '',
      filteredResultText: '',
      totalResultText: '',
    }

    // 主图是懒加载的，等一会儿再数（dev 模式下图片是按需请求的）
    for (let i = 0; i < 40 && out.loadedImages === 0; i++) {
      await sleep(250)
      out.loadedImages = qa('.explore-card .main-image img').filter(
        im => im.complete && im.naturalWidth > 0
      ).length
    }

    // 1) 卡片内切主图：点第 2 格，主图应换成 _1.webp
    const firstCard = q('.explore-card')
    if (firstCard) {
      out.mainBefore = firstCard.querySelector('.main-image img')?.getAttribute('src') ?? ''
      const cells = firstCard.querySelectorAll('.strip-cell')
      if (cells[1]) {
        cells[1].click()
        await sleep(500)
        out.mainAfter = firstCard.querySelector('.main-image img')?.getAttribute('src') ?? ''
        out.switched = out.mainBefore !== out.mainAfter && out.mainAfter.includes('_1.webp')
      }
    }

    // 2) 筛选（先筛后开灯箱：灯箱是模态，会挡住下拉框）
    const totalText = (q('.result-count')?.textContent ?? '').trim()
    const aspectSelect = q('.aspect-select .n-base-selection')
    if (aspectSelect) {
      aspectSelect.click()
      await sleep(700)
      const option = qa('.n-base-select-option').find(o => o.textContent.includes('9:16'))
      if (option) {
        option.click()
        await sleep(900)
        out.filteredHash = location.hash
        out.filteredResultText = (q('.result-count')?.textContent ?? '').trim()
        out.totalResultText = totalText
      }
    }

    // 3) 点主图开灯箱，且灯箱要定位到刚才选中的那一格
    const openCard = qa('.explore-card').find(c => c.querySelector('.badge-sref')) ?? q('.explore-card')
    if (openCard) {
      const cells = openCard.querySelectorAll('.strip-cell')
      // 先切到第 3 格，再点主图 → 灯箱应停在第 3 格
      if (cells[2]) {
        cells[2].click()
        await sleep(400)
      }
      openCard.querySelector('.main-image img')?.click()
      await sleep(1000)
    }
    const modal = qa('.n-modal').find(m => m.querySelector('.main-image'))
    if (modal) {
      out.lightboxStripCells = modal.querySelectorAll('.strip-cell').length
      out.lightboxStageIndex = (modal.querySelector('.stage-index')?.textContent ?? '').trim()
      out.lightboxPrompt = (modal.querySelector('.prompt-text')?.textContent ?? '').trim()
      out.lightboxHasFill = !![...modal.querySelectorAll('button')].find(b =>
        b.textContent.includes('填入主体与环境')
      )
      out.srefCode = modal.querySelector('.sref-code')?.textContent.trim() ?? ''
      const fillSref = [...modal.querySelectorAll('button')].find(b =>
        b.textContent.includes('填入 --sref')
      )
      if (fillSref) {
        fillSref.click()
        await sleep(600)
        out.srefFillClicked = true
      }
      // 主体与环境已经有内容（前面的步骤填过）：应弹出「覆盖还是追加」
      const fillSubject = [...modal.querySelectorAll('button')].find(b =>
        b.textContent.includes('填入主体与环境')
      )
      if (fillSubject) {
        fillSubject.click()
        await sleep(700)
        const conflict = qa('.n-modal').find(m => m.textContent.includes('覆盖'))
        out.conflictButtons = conflict
          ? [...conflict.querySelectorAll('button')].map(b => b.textContent.trim())
          : []
        if (conflict) {
          const append = [...conflict.querySelectorAll('button')].find(b =>
            b.textContent.includes('追加')
          )
          append?.click()
          await sleep(600)
        }
      }
    }
    return out
  })

  // 回工作台看「主体与环境」是不是真的被填上了
  const exploreSubject = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const qa = sel => [...document.querySelectorAll(sel)]
    const q = sel => document.querySelector(sel)
    location.hash = '#/artists'
    await sleep(1200)
    const subjectTab = qa('.n-tabs-tab').find(tab => tab.textContent.includes('主体与环境'))
    if (subjectTab) {
      subjectTab.click()
      await sleep(500)
    }
    // 参数区默认收起，展开才能读到 --sref 落到哪了
    const toggle = q('[data-role="parameter-panel-toggle"]')
    if (toggle && toggle.getAttribute('aria-expanded') === 'false') {
      toggle.click()
      await sleep(600)
    }
    const area = qa('textarea').find(t => t.value && t.value.includes('photography'))
    return {
      subject: q('.subject-environment-input textarea')?.value ?? '',
      finalPrompt: area ? area.value : '',
      srefInput: q('[data-param-id="styleRef"] input')?.value ?? '',
      workbenchVisible: !!q('.content-grid'),
    }
  })
  await page.evaluate(() => {
    location.hash = '#/explore'
  })
  await new Promise(r => setTimeout(r, 1200))

  // ---- 顶部导航：工作台 / 探索榜 ----
  const nav = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const qa = sel => [...document.querySelectorAll(sel)]
    const navBtns = qa('.page-nav .nav-btn')
    const out = {
      buttons: navBtns.map(b => b.textContent.trim()),
      toWorkbench: false,
      toExplore: false,
    }
    const workbench = navBtns.find(b => b.textContent.includes('工作台'))
    const explore = navBtns.find(b => b.textContent.includes('探索榜'))
    if (workbench) {
      workbench.click()
      await sleep(900)
      out.toWorkbench = !!document.querySelector('.content-grid')
    }
    if (explore) {
      explore.click()
      await sleep(1200)
      out.toExplore = !!document.querySelector('.explore-page')
    }
    return out
  })

  await page.screenshot({
    path: path.join(root, 'docs', 'screenshots', `${target.name}-explore.png`),
  })

  // ---- 判定 ----
  const problems = []
  if (!report.mounted) problems.push('应用未挂载')
  if (!report.panelExpanded) problems.push('参数区未能展开')
  if (!report.splitterFound) problems.push('未找到左右栏分割条')
  if (report.paramCount !== 24) problems.push(`参数数量应为 24，实际 ${report.paramCount}`)
  if (!report.subjectTyped) problems.push('未找到主体与环境输入框')
  if (!report.tagAdded) problems.push('未找到提示词标签')
  if (!report.finalPrompt.includes('--v 8.2')) problems.push('最终提示词缺少 --v 8.2')
  if (!report.finalPrompt.includes('--ar 16:9')) problems.push('最终提示词缺少 --ar 16:9')
  if (!report.finalPrompt.includes('highspeed photography'))
    problems.push('最终提示词未包含选中的提示词')

  // V8.2 下应被禁用的参数
  for (const flag of ['--q', '--oref', '--ow', '--turbo']) {
    if (!report.unsupported.includes(flag)) {
      problems.push(`V8.2 下 ${flag} 应被标记为不可用`)
    }
  }
  for (const flag of ['--ar', '--s', '--raw', '--tile', '--edit', '--hd']) {
    if (report.unsupported.includes(flag)) {
      problems.push(`V8.2 下 ${flag} 不应被标记为不可用`)
    }
  }

  // 切到 V7 后的联动：--oref/--q 变为可用，--hd/--edit 变为不可用
  if (!report.afterSwitch.finalPrompt.includes('--v 7')) {
    problems.push('切换到 V7 后最终提示词未更新为 --v 7')
  }
  for (const flag of ['--oref', '--q']) {
    if (report.afterSwitch.unsupported.includes(flag)) {
      problems.push(`切换到 V7 后 ${flag} 不应被标记为不可用`)
    }
  }
  for (const flag of ['--hd', '--edit']) {
    if (!report.afterSwitch.unsupported.includes(flag)) {
      problems.push(`切换到 V7 后 ${flag} 应被标记为不可用`)
    }
  }

  // 会话持久化
  if (!restored.selectedItems.includes('highspeed photography')) {
    problems.push('刷新后未恢复已选提示词')
  }
  if (!restored.subject.includes('a woman with long hair')) {
    problems.push('刷新后未恢复主体与环境')
  }

  // 风格库：风格参考码进参数区，风格条目进词库
  if (!report.style.code) {
    problems.push('风格参考码页签没有卡片')
  } else {
    if (report.style.inputValue !== report.style.code) {
      problems.push(
        `「填入 --sref」没有写进参数框（框里是 ${report.style.inputValue || '空'}）`
      )
    }
    if (!report.style.finalPrompt.includes(`--sref ${report.style.code}`)) {
      problems.push('最终提示词缺少 --sref ' + report.style.code)
    }
  }
  if (!report.artistPrompt.includes('photography by Puuung')) {
    problems.push('风格条目没有进摄影前缀（期望 photography by Puuung）')
  }

  // 筛选：URL 即状态，两种口径的条数要对得上
  const filters = report.filters ?? {}
  if (!filters.pickTabOk || !filters.testedTabOk || !filters.ignoredTabOk) {
    problems.push('hash 没能切到对应的标签页')
  }
  if (filters.pick?.count !== '554 条') {
    problems.push(`#/style-codes?pick=1 应为 554 条，实际 ${filters.pick?.count}`)
  }
  if (filters.tested?.count !== '450 条') {
    problems.push(`#/artists?tested=1 应为 450 条，实际 ${filters.tested?.count}`)
  }
  if (!String(filters.ignored).includes('category')) {
    problems.push('URL 里的非法筛选参数（category）没有被提示')
  }

  // 分面筛选：组内任一、组间全部，条数要对得上实测
  const facets = report.facets ?? {}
  const facetExpect = {
    termDetailed: '3629 条',
    colourBlue: '824 条',
    termAndColour: '602 条',
    groupOr: '4261 条',
    crossGroupAnd: '2673 条',
  }
  for (const [key, expected] of Object.entries(facetExpect)) {
    if (facets[key] !== expected) {
      problems.push(`分面 ${key} 应为 ${expected}，实际 ${facets[key]}`)
    }
  }
  if (facets.termChips !== 68) problems.push(`分面词应有 68 个，实际 ${facets.termChips}`)
  if (facets.swatches !== 96) problems.push(`主色应有 96 个，实际 ${facets.swatches}`)

  // 页签内容可滚：艺术家页内容远高于视口，容器必须自己可滚
  if (!scrollState) {
    problems.push('没找到页签内容容器')
  } else {
    if (!['auto', 'scroll'].includes(scrollState.overflowY)) {
      problems.push(`页签容器 overflow-y 是 ${scrollState.overflowY}，装不下溢出内容`)
    }
    if (scrollState.maxScroll <= 0) problems.push('艺术家页内容没有溢出，页签容器无从滚起')
    if (!artistScrolled) problems.push('艺术家页页签容器推不动（键盘滚动无效）')
  }

  // 艺术家页卡片网格：图、简介、回链、吸顶、选中
  if (!artistGrid.cardCount) {
    problems.push('艺术家页没有渲染卡片')
  }
  if (!artistGrid.styleCards) {
    problems.push('艺术家页没有带回链的风格卡片（逐条回链是许可条件）')
  }
  if (!artistGrid.subtitle) {
    problems.push('风格卡片上没有简介（认不出他是谁）')
  }
  if (!artistGrid.backlink.includes('midlibrary.io/library/')) {
    problems.push(`风格卡片的回链不对：${artistGrid.backlink || '(空)'}`)
  }
  if (!artistGrid.colourDots) {
    problems.push('风格卡片上没有主色角标')
  }
  if (!artistGrid.sticky) {
    problems.push('艺术家页的筛选条没有吸顶')
  }
  if (!artistGrid.selectPrompt.includes('photography by')) {
    problems.push('点卡片没有把风格选进最终提示词')
  }
  for (const label of ['简介', '风格描述']) {
    if (!artistGrid.modalLabels.includes(label)) {
      problems.push(`详情弹窗里没有「${label}」`)
    }
  }

  // 探索榜：独立页面 + 作业卡 + 缩略图条 + 灯箱 + 填入
  if (!explore.pageVisible) problems.push('探索榜页面没有渲染')
  if (!explore.workbenchHidden) problems.push('探索榜页面没有独占整屏（工作台左栏仍在）')
  if (!explore.cardCount) problems.push('探索榜没有渲染作业卡片')
  if (!explore.loadedImages) problems.push('探索榜的主图没有加载出来')
  if (!explore.aspectBadges) problems.push('探索榜卡片上没有宽高比角标')
  if (!explore.cardTitles) problems.push('探索榜卡片上没有标题（提示词截断）')
  if (explore.stripCells < explore.cardCount * 4) {
    problems.push(`卡片上的四格缩略图条不完整（${explore.stripCells} / ${explore.cardCount * 4}）`)
  }
  if (!explore.downloadBtns) problems.push('卡片上没有下载按钮')
  if (!explore.switched) {
    problems.push(`点缩略图没有切主图（${explore.mainBefore} → ${explore.mainAfter}）`)
  }
  if (!explore.moreButton) problems.push('探索榜没有「加载更多」（一次铺开上千条会拖死浏览器）')
  if (!explore.resultCount) problems.push('探索榜没有显示作业条数')
  if (explore.lightboxStripCells !== 4) {
    problems.push(`灯箱里的缩略图条应是四格，实际 ${explore.lightboxStripCells}`)
  }
  if (!explore.lightboxStageIndex.includes('第 3')) {
    problems.push(`灯箱没有定位到点开的那一格（现在是「${explore.lightboxStageIndex}」）`)
  }
  if (explore.lightboxPrompt.length < 20) problems.push('灯箱里没有完整提示词')
  if (!explore.lightboxHasFill) problems.push('灯箱里没有「填入主体与环境」')
  if (!explore.conflictButtons.some(b => b.includes('覆盖')) ||
      !explore.conflictButtons.some(b => b.includes('追加'))) {
    problems.push('主体与环境已有内容时没有让用户选「覆盖还是追加」')
  }
  if (!exploreSubject.subject.includes('a woman with long hair')) {
    problems.push('追加后主体与环境的原有内容丢了')
  }
  if (!exploreSubject.workbenchVisible) problems.push('从探索榜回不到工作台')
  if (!explore.filteredHash) {
    problems.push('比例筛选没有生效（hash 里没有 ar 参数）')
  } else if (!explore.filteredHash.includes('ar=')) {
    problems.push(`比例筛选没有进 hash：${explore.filteredHash}`)
  }
  // 卡片数会被分页截断（一次只铺 60 条），要比"命中作业数"
  const filteredTotal = Number((explore.filteredResultText.match(/(\d+)/) ?? [])[1] ?? 0)
  const allTotal = Number((explore.totalResultText.match(/(\d+)/) ?? [])[1] ?? 0)
  if (allTotal && filteredTotal >= allTotal) {
    problems.push(`比例筛选后命中作业数没有减少（${filteredTotal} / ${allTotal}）`)
  }
  if (explore.srefFillClicked && explore.srefCode) {
    if (!exploreSubject.srefInput.includes(explore.srefCode.split(' ')[0])) {
      problems.push(
        `「填入 --sref」没有写进参数框（框里是 ${exploreSubject.srefInput || '空'}，期望 ${explore.srefCode}）`
      )
    }
    if (!exploreSubject.finalPrompt.includes(`--sref ${explore.srefCode.split(' ')[0]}`)) {
      problems.push('最终提示词里没有探索榜带来的 --sref')
    }
  }

  if (!nav.buttons.some(b => b.includes('工作台')) || !nav.buttons.some(b => b.includes('探索榜'))) {
    problems.push(`顶部缺少页面入口：${nav.buttons.join('/') || '(无)'}`)
  }
  if (!nav.toWorkbench) problems.push('点「工作台」没有回到提示词库')
  if (!nav.toExplore) problems.push('点「探索榜」没有打开探索榜页面')

  if (errors.length) problems.push(`页面报错: ${errors.slice(0, 3).join(' | ')}`)

  console.log(`\n===== ${target.name} (${target.url}) =====`)
  console.log('挂载:', report.mounted, '| 参数数:', report.paramCount, '| 参数区已展开:', report.panelExpanded, '| 分割条:', report.splitterFound)
  console.log('标签页:', report.tabLabels.join(' / '))
  console.log('V8.2 下不可用:', report.unsupported.join(', ') || '(无)')
  console.log('V8.2 最终提示词:', report.finalPrompt)
  console.log('切到 V7 后不可用:', report.afterSwitch.unsupported.join(', ') || '(无)')
  console.log('V7 最终提示词:', report.afterSwitch.finalPrompt)
  console.log('刷新后恢复:', restored.selectedItems.join(', ') || '(无)', '| 主体:', restored.subject || '(无)')
  console.log('风格参考码:', report.style.code || '(无)', '| 参数框:', report.style.inputValue || '(空)')
  console.log('风格条目后提示词:', report.artistPrompt || '(无)')
  console.log('筛选 pick=1:', filters.pick?.count, '| hash:', filters.pick?.hash)
  console.log('筛选 tested=1:', filters.tested?.count, '| hash:', filters.tested?.hash)
  console.log('非法参数提示:', filters.ignored || '(无)')
  console.log(
    '艺术家页滚动:',
    artistScrolled ? '可滚' : '滚不动',
    '| 可滚距离:', scrollState?.maxScroll ?? '(无)',
    '| overflow-y:', scrollState?.overflowY ?? '(无)'
  )
  console.log(
    '艺术家卡片:', artistGrid.cardCount,
    '| 风格卡:', artistGrid.styleCards,
    '| 主色角标:', artistGrid.colourDots,
    '| 吸顶:', artistGrid.sticky ? '是' : '否'
  )
  console.log('卡片样例:', artistGrid.name, '|', artistGrid.subtitle.slice(0, 40), '| 回链:', artistGrid.backlink)
  console.log('点卡片后提示词:', artistGrid.selectPrompt || '(无)', '| 详情弹窗:', artistGrid.modalLabels.join('/'))
  console.log(
    '分面 term=detailed:', facets.termDetailed,
    '| colour=blue:', facets.colourBlue,
    '| 两者与:', facets.termAndColour
  )
  console.log(
    '分面 同组或:', facets.groupOr,
    '| 跨组与:', facets.crossGroupAnd,
    '| 词/色块:', facets.termChips, '/', facets.swatches
  )
  console.log(
    '探索榜: 作业卡', explore.cardCount,
    '| 主图已加载', explore.loadedImages,
    '| 标题', explore.cardTitles,
    '| 缩略图格', explore.stripCells,
    '| 下载按钮', explore.downloadBtns,
    '| sref 角标', explore.srefBadges,
    '|', explore.resultCount
  )
  console.log(
    '卡片切主图:', explore.switched ? '是' : '否',
    '|', (explore.mainBefore || '').split('/').pop(), '→', (explore.mainAfter || '').split('/').pop()
  )
  console.log(
    '灯箱: 缩略图格', explore.lightboxStripCells,
    '| 定位', explore.lightboxStageIndex || '(无)',
    '| 提示词长度', explore.lightboxPrompt.length,
    '| 冲突按钮', explore.conflictButtons.join('/') || '(无)',
    '| sref 码', explore.srefCode || '(无)'
  )
  console.log(
    '探索榜筛选: hash', explore.filteredHash || '(无)',
    '| 命中作业', explore.filteredResultText || '(无)',
    '| 全量', explore.totalResultText || '(无)',
    '| 参数框 sref:', exploreSubject.srefInput || '(无)'
  )
  console.log(
    '顶部导航:', nav.buttons.join('/') || '(无)',
    '| 切工作台:', nav.toWorkbench ? '是' : '否',
    '| 切探索榜:', nav.toExplore ? '是' : '否'
  )
  console.log(problems.length ? '❌ 问题: ' + problems.join('；') : '✅ 全部通过')

  if (problems.length) failed = true

  await page.close()
}

await browser.close()
process.exit(failed ? 1 : 0)
