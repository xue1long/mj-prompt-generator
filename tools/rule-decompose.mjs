#!/usr/bin/env node
/**
 * 探索榜提示词的确定性规则分解器。
 *
 * 用途：把 config/explore.yaml 的全部作业按第三章七段式方法论生成结构分解，
 * 写入 config/explore-decomposed.yaml，供探索榜灯箱展示。
 *
 * 单一来源：构图五法信号词、四类词库全部从
 *   .workbuddy/skills/mj-prompt-decompose/SKILL.md「## 二、方法论速查」解析得到，
 * 不在这里维护第二份词表。改方法论只改 SKILL.md。
 *
 * 边界：这是确定性关键词匹配，不是 LLM 判断。框架判定、构图法归属为启发式推断，
 * 中文速读为词表拼接。已有的手工精拆条目按 jobId 保留，不被覆盖。
 *
 * 输出格式：JSON。派生文件 config/explore-decomposed.yaml 由全部写者统一写 JSON
 * （另两个写者是 tools/decompose-explore.ts 与 tools/merge-fine-parts.mjs）。
 * 文件名沿用 .yaml 是历史遗留，读方走容错解析，不靠扩展名判格式。
 *
 * 用法：
 *   node tools/rule-decompose.mjs --dry-run          # 只统计，不写文件
 *   node tools/rule-decompose.mjs --limit 20         # 只处理前 20 条（调试）
 *   node tools/rule-decompose.mjs                    # 全量补齐
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describeSources, serializeDecomposed } from './decomposed-format.mjs'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = path.join(ROOT, 'config', 'explore.yaml')
const OUTPUT = path.join(ROOT, 'config', 'explore-decomposed.yaml')

const METHODOLOGY_VERSION = 'v8.2'
const SCHEMA_VERSION = 1
const MODEL = 'WorkBuddy 规则解析 v1（确定性关键词匹配，非 LLM）'
const SEGMENT_MODULES = ['主体', '动作 / 状态', '细节与环境', '构图与镜头', '光线与色彩', '风格与审美', '参数尾']

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const limitIdx = argv.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? Math.max(1, Number(argv[limitIdx + 1]) || 0) : Infinity

// ── 方法论读取（唯一来源） ─────────────────────────────────

export function loadMethodology(root = ROOT) {
  const skillPath = path.join(root, '.workbuddy', 'skills', 'mj-prompt-decompose', 'SKILL.md')
  const md = fs.readFileSync(skillPath, 'utf8')
  const start = md.indexOf('## 二、方法论速查')
  const end = md.indexOf('## 三、')
  if (start < 0 || end < 0) throw new Error('SKILL.md 缺少第二章标题，无法截取方法论')
  const section = md.slice(start, end)
  for (const marker of ['七段式', '构图五法', '5 条铁律', '常见误区', 'V8.2']) {
    if (!section.includes(marker)) throw new Error(`SKILL.md 第二章缺少关键段落：${marker}`)
  }

  // 2.3 构图五法：表格行 `| ① 三分法 | \`rule of thirds\`, \`...\` |`
  const composition = []
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*[①②③④⑤]\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/)
    if (!m) continue
    const signals = [...m[2].matchAll(/`([^`]+)`/g)].map(x => x[1].toLowerCase().trim()).filter(Boolean)
    if (signals.length) composition.push({ label: m[1].trim(), signals })
  }
  if (composition.length !== 5) throw new Error(`构图五法应解析出 5 条，实际 ${composition.length} 条`)

  // 2.4 词库：按 `- **标题**：词条` 逐行解析。
  // 「画风/游戏/艺术家/镜头感/情感」用逗号分隔，「视角与灯光」用斜杠分隔，两者都要支持。
  const dict = { style: [], lighting: [], angle: [], emotion: [] }
  const splitTerms = text => text.split(/\s*[,/]\s*/).map(s => s.trim()).filter(s => s.length > 2)
  let found = 0
  for (const line of section.split('\n')) {
    const m = line.match(/^- \*\*(.+?)\*\*：(.+)$/)
    if (!m) continue
    const [, title, body] = m
    if (/画风|游戏|艺术家|镜头感/.test(title)) {
      dict.style.push(...splitTerms(body))
      found++
    } else if (/情感词/.test(title)) {
      dict.emotion.push(...splitTerms(body))
      found++
    } else if (/视角与灯光/.test(title)) {
      // 形如：景别（a / b）；机位（c / d）；焦段（…）；光线（…）；色调（…）
      for (const group of body.split(/[；;]/)) {
        const g = group.match(/^([^（(]+)[（(]([^）)]+)[）)]/)
        if (!g) continue
        const bucket = /景别|机位|焦段/.test(g[1]) ? 'angle' : /光线|色调/.test(g[1]) ? 'lighting' : null
        if (bucket) dict[bucket].push(...splitTerms(g[2]))
      }
      found++
    }
  }
  if (found < 6) throw new Error(`SKILL.md 2.4 词库解析不完整，只识别到 ${found} 组`)
  if (dict.lighting.length < 12 || dict.angle.length < 15) {
    throw new Error(`视角/灯光词库解析异常：lighting=${dict.lighting.length} angle=${dict.angle.length}`)
  }

  for (const key of Object.keys(dict)) dict[key] = [...new Set(dict[key].map(t => t.toLowerCase()))]
  return { section, composition, dict }
}

// ── 文本工具 ──────────────────────────────────────────────

/** 归一化成「空格包裹的小写字母数字串」，用于词边界匹配 */
function normalize(text) {
  return ' ' + String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '
}

/** 词库命中：要求完整词边界，避免 art 命中 cartoon */
function hitTerms(text, terms) {
  const hay = normalize(text)
  const hits = []
  for (const term of terms) {
    const needle = normalize(term).trim()
    if (needle.length < 3) continue
    if (hay.includes(' ' + needle + ' ')) hits.push(term)
  }
  return [...new Set(hits)]
}

function clip(text, max = 150) {
  const t = String(text).replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.slice(0, max - 1) + '…'
}

/** 合并某一段的命中单元，限制数量与长度，避免灯箱表格被撑爆 */
function joinUnits(units, extra = []) {
  const all = [...units, ...extra]
  const uniq = [...new Set(all.map(u => clip(u)).filter(Boolean))]
  const kept = uniq.slice(0, 3)
  const text = kept.join('；')
  const overflow = uniq.length - kept.length
  return overflow > 0 ? `${text}；…（另有 ${overflow} 个短语见原文）` : text
}

// ── 参数尾 ────────────────────────────────────────────────

export function parseParamTail(prompt) {
  const idx = prompt.search(/\s--[a-z]/)
  if (idx < 0) return { text: '', params: [], body: prompt.trim() }
  const body = prompt.slice(0, idx).trim()
  const text = prompt.slice(idx).trim()
  const params = text.split(/\s+(?=--[a-z])/).map(part => {
    const m = part.match(/^(--[a-z][a-z0-9-]*)\s*([\s\S]*)$/)
    return m ? { name: m[1].toLowerCase(), value: m[2].trim() } : { name: part.toLowerCase(), value: '' }
  })
  return { text, params, body }
}

// ── 单元切分与分类 ────────────────────────────────────────

const RE = {
  // 只保留明确的镜头信号；center / frame / diagonal 等弱词交给构图法判定，避免把细节句误归到 ④
  shot: /\b(shot|shots|angle|lens|composition|framing|close-?up|medium shot|full body|wide shot|wide-?angle|perspective|camera|focal|depth of field|bokeh|rule of thirds|\d+mm|bird'?s[- ]eye|eye level|low angle|high angle|dutch angle|top[- ]down|overhead|anamorphic|portrait shot|bust shot)\b/i,
  light: /\b(light|lighting|lit|glow|neon|hour|shadows?|palette|tones?|colors?|colours?|warm|cool|golden|backlit|rim light|volumetric|softbox|daylight|sunlight|ambient|dark|bright|muted|desaturated|monochrome|pastel|hue|saturation|exposure|overcast|sunny|diffused|flat soft|faded blacks?|high contrast)\b/i,
  style: /\b(style|aesthetic|painting|watercolor|illustration|render|photorealistic|realistic|cinematic|anime|3d|digital art|concept art|surreal|minimalist|vintage|retro|cyberpunk|fantasy|hyperrealistic|detailed|8k|high resolution|film grain|poster|collage|ukiyo-e|baroque|art nouveau|photography|photograph|film still|grain|texture|editorial|fashion|oil|ink|sketch|cartoon|pixel|claymation|embroidery|stained glass|matte|brushwork|fine art|elegant|delicate|grainy|coquette|hand-?drawn|typography)\b/i,
  action: /\b(wearing|wear|stands?|standing|sitting|running|holding|hold|looking|look|smiling|walking|walk|lying|floating|flying|dancing|hugging|kissing|reaches|turns?|turned|galloping|moving|hangs?|clasped|draping|crowning|blurs?|expression|calm|happy|sad|melancholic|serene|ominous|nostalgic|lonely|tender|playful|gazing|waiting|sleeping|crying|laughing|kneeling|leaning|posed?|captured)\b/i,
  env: /\b(background|in a|on a|at a|scene|room|street|city|forest|sky|night|day|rain|snow|interior|exterior|surrounded|behind|beside|field|wall|floor|window|table|garden|beach|mountain|water|building|station|bedroom|kitchen|bathroom|palace|atrium|weather|cloud|sun|moon|tree|leaves|flowers|space|edges|set against|landscape|architecture|pool|bench|rug|shutter)\b/i,
}

/** 镜头类短语（用于把首句里的景别词也补进 ④ 段） */
const LENS_PHRASE = /\b([a-z-]*\s?shot|[\d]+mm(?:\s+[a-z-]*lens)?|bird'?s[- ]eye view|eye level|low angle|high angle|wide angle|depth of field|rule of thirds|full body|close-?up|medium shot|top[- ]down|anamorphic lens|centered composition|balanced composition)\b/gi

function splitUnits(body) {
  return body
    .replace(/\s+/g, ' ')
    .split(/,\s*|\.\s+|\s*;\s*|\s+[—–]\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 1)
}

function classify(unit) {
  if (RE.shot.test(unit)) return 4
  if (RE.light.test(unit)) return 5
  if (RE.style.test(unit)) return 6
  if (RE.action.test(unit)) return 2
  if (RE.env.test(unit)) return 3
  return 3
}

// ── 体检（判据对齐 SKILL.md 2.5 / 2.6 / 2.7） ────────────

const JUNK_RE = /\b(8k|masterpiece|best quality|ultra[- ]detailed|hyper[- ]detailed|high resolution|extremely detailed|award winning|trending on artstation)\b/gi
const PERSON_RE = /\b(woman|women|man|men|girl|boy|person|people|character|figure|cat|dog|horse|jockey|couple|child|kid|face|portrait)\b/gi

function healthOf(prompt, body, paramTail) {
  const h = []
  const push = (id, ok, note) => h.push({ id, ok, note })
  const sentences = (body.match(/\.\s+[A-Z]/g) || []).length + (/\b(is|are|was|were|has|have|wears|wearing)\s/i.test(body) ? 1 : 0)

  push('R1', sentences === 0, sentences === 0
    ? '名词短语为主，未检出完整描述句'
    : `检出 ${sentences} 处完整描述句 / 系动词结构，偏离「名词短语优先」（复杂场景可控）`)

  const frontLoaded = isFrontLoaded(body)
  push('R2', !frontLoaded, frontLoaded
    ? '风格 / 景别词抢在主体前，主体权重被分走（社区常见写法）'
    : '主体位于首个短语，权重保住')

  const chinesePunct = /[，：；（）「」『』、。！？]/.test(prompt)
  push('R3', !chinesePunct, paramTail.params.length === 0
    ? chinesePunct ? '正文含中文标点，MJ 解析可能失败' : '正文无参数尾，不存在参数错位或中文标点；比例由上游作业字段承载'
    : chinesePunct ? '参数区含中文标点，不符合「全英文半角」' : '参数统一在末尾、全英文半角')

  const noParam = paramTail.params.find(p => p.name === '--no')
  push('R4', true, noParam ? '使用 --no 做减法' : '无排除项，未使用 --no')

  const junk = [...prompt.matchAll(JUNK_RE)].map(m => m[0])
  const junkKinds = new Set(junk.map(s => s.toLowerCase())).size
  push('R5', junkKinds < 2, junkKinds >= 2
    ? `检出画质堆料词 ${junkKinds} 种（${[...new Set(junk)].slice(0, 4).join(' / ')}），V6 之后收益有限`
    : junk.length ? `含 1 处画质词（${junk[0]}），未构成堆料` : '未见画质堆料词')

  push('M1', !chinesePunct, chinesePunct ? '含中文标点，MJ 解析可能失败' : '全文英文半角标点')
  const persons = [...new Set((prompt.match(PERSON_RE) || []).map(s => s.toLowerCase()))]
  const manySubjects = persons.length >= 3 || /\b(group of|crowd of|couple of|pair of|three identical|two .{0,20} and)\b/i.test(prompt)
  push('M2', !manySubjects, manySubjects
    ? `检出多个主体词（${persons.slice(0, 5).join(' / ')}），注意力可能被均分`
    : '单主体或主体明确')

  const quoted = /[""][^""]{3,}[""]/.test(prompt)
  const wantsText = quoted && /\b(text|typography|phrase|word|lettering|script|written|saying|logo|exact)\b/i.test(prompt)
  push('M3', !wantsText, wantsText ? '要求画面出现准确文字，MJ 出字不可靠，建议后期合成' : '未要求画面出现准确文字')
  push('M4', !/\b(8k|masterpiece|best quality)\b/i.test(prompt), /\b(8k|masterpiece|best quality)\b/i.test(prompt)
    ? '堆砌 8k / masterpiece / best quality，V6 之后基本失效' : '未堆砌 8k / masterpiece / best quality')

  const cjk = (prompt.match(/[\u4e00-\u9fa5]/g) || []).length
  push('M5', cjk < 10, cjk >= 10 ? `含 ${cjk} 个中文字符的长句，理解精度低于英文` : '无中文长句')

  push('V1', !/\w::\d/.test(prompt), /\w::\d/.test(prompt)
    ? '出现 :: 权重语法，V7+ 已完全移除，V8.2 下无效' : '未出现 :: 权重语法（V7+ 已移除）')
  if (/\b--style\s+raw\b/i.test(prompt)) {
    push('V2', false, '--style raw 仅 V5/V6 有效，V7+ 应改用 --raw')
  }
  push('V3', !(noParam && /[\s,]/.test(noParam.value)), noParam && /[\s,]/.test(noParam.value)
    ? `--no ${clip(noParam.value, 40)} 含多个词，会被逐词独立审核，可能误伤` : '未使用 --no，无逐词审核误伤风险')
  if (/\s--(q|oref|cref)\b/i.test(prompt)) {
    push('V4', false, '--q / --oref / --cref 在 V8.1+ 已移除或由 --edit 取代')
  }
  return h
}

function isFrontLoaded(body) {
  const head = body.slice(0, 60)
  return /^(a |an |the )?(cinematic|photorealistic|ultra|stylized|vintage|minimal|vertical|horizontal|bust shot|close-?up|full body|wide|hyper-?realistic)/i.test(head)
    || /^(a |an |the )?[a-z-]+ (oil painting|watercolor|photograph|illustration|poster) of/i.test(head)
}

// ── 中文速读（词表拼接，不伪装成 LLM 判断） ───────────────

const ZH = {
  woman: '女性', women: '女性', man: '男性', men: '男性', girl: '女孩', boy: '男孩',
  couple: '情侣', person: '人物', people: '人群', character: '角色', child: '儿童', kid: '小孩',
  portrait: '肖像', face: '面部', hair: '发丝', eyes: '眼睛', skin: '肤质', hands: '手部',
  cat: '猫', cats: '猫', dog: '狗', dogs: '狗', pug: '巴哥犬', fox: '狐狸',
  horse: '马', horses: '马', jockey: '骑师', jockeys: '骑师', bird: '鸟', flower: '花', flowers: '花',
  leaves: '落叶', sky: '天空', autumn: '秋日', winter: '冬日', summer: '夏日', spring: '春日',
  water: '水', sea: '海', mountain: '山', forest: '森林', garden: '花园', field: '田野',
  bedroom: '卧室', bathroom: '浴室', kitchen: '厨房', room: '室内', station: '车站',
  subway: '地铁', street: '街道', city: '城市', palace: '宫殿', interior: '室内',
  background: '背景', poster: '海报', typography: '字体设计', logo: '标志',
  sticker: '贴纸', product: '产品', book: '书', ribbon: '缎带', christmas: '圣诞',
  watercolor: '水彩', 'oil painting': '油画', painting: '绘画', illustration: '插画',
  cartoon: '卡通', photography: '摄影', photograph: '照片', photorealistic: '写实',
  realistic: '写实', cinematic: '电影感', film: '胶片', grain: '颗粒', vintage: '复古',
  minimalist: '极简', elegant: '优雅', delicate: '细腻', pastel: '粉彩', surreal: '超现实',
  collage: '拼贴', anime: '动漫', cyberpunk: '赛博朋克', fashion: '时装',
  editorial: '杂志大片', coquette: '少女感', 'fine art': '纯艺术', texture: '质感',
  soft: '柔和', 'soft light': '柔光', 'natural daylight': '自然光', daylight: '日光',
  sunlight: '阳光', golden: '金色', warm: '暖调', cool: '冷调', dark: '暗调',
  bright: '明亮', muted: '低饱和', desaturated: '去饱和', monochrome: '单色',
  shadows: '阴影', glow: '光晕', neon: '霓虹', overcast: '阴天', dramatic: '戏剧性',
  'close-up': '特写', 'full body': '全身', 'bust shot': '半身', 'wide shot': '广角',
  'low angle': '低机位', 'high angle': '高机位', 'eye level': '平视',
  standing: '站立', sitting: '坐着', walking: '行走', holding: '手持',
  waiting: '等待', hugging: '相拥', kissing: '接吻', looking: '凝视', smiling: '微笑',
  wearing: '穿着', running: '奔跑', sleeping: '睡眠',
  white: '白色', black: '黑色', blue: '蓝色', green: '绿色', red: '红色', pink: '粉色',
  cream: '米白', ivory: '象牙白', gray: '灰色', brown: '棕色', orange: '橙色',
  yellow: '黄色', silver: '银色', purple: '紫色', beige: '米色', taupe: '灰褐',
  glass: '玻璃', wooden: '木质', paper: '纸质', metal: '金属', marble: '大理石',
  linen: '亚麻', leather: '皮革', crystal: '水晶', ceramic: '陶瓷',
  studio: '影棚', camera: '相机', composition: '构图', atmosphere: '氛围',
  visible: '可见', natural: '自然', subtle: '细腻', clean: '干净', simple: '简洁',
  large: '大尺寸', tiny: '微小', deep: '深邃', flat: '平涂', loose: '松散',
  thin: '纤细', round: '圆形', pale: '苍白',
  expression: '表情', features: '五官', head: '头部', body: '身体',
  night: '夜晚', moon: '月亮', cloud: '云', snow: '雪', rain: '雨',
  fog: '雾', tree: '树', grass: '草地', window: '窗', wall: '墙',
  floor: '地板', ceiling: '天花板', table: '桌', lamp: '灯', bed: '床',
}
const ZH_ORDER = Object.keys(ZH).sort((a, b) => b.length - a.length)

/** 按词在原文里的出现顺序输出中文，避免速读词序错乱 */
function zhHits(text, max = 6) {
  const hay = normalize(text)
  const found = []
  for (const key of ZH_ORDER) {
    const needle = normalize(key).trim()
    if (needle.length < 2) continue
    const at = hay.indexOf(' ' + needle + ' ')
    if (at >= 0 && !found.some(f => f.zh === ZH[key])) found.push({ at, zh: ZH[key] })
  }
  return found.sort((a, b) => a.at - b.at).slice(0, max).map(f => f.zh)
}

const SUBJECT_ZH = new Set(['女性', '男性', '女孩', '男孩', '情侣', '人物', '人群', '角色', '儿童', '小孩',
  '肖像', '猫', '狗', '巴哥犬', '狐狸', '马', '骑师', '鸟', '花', '海报', '贴纸', '产品', '标志',
  '绘画', '插画', '照片', '室内', '卧室', '浴室', '厨房', '车站', '城市', '宫殿', '田野', '森林'])
const COLOR_ZH = new Set(['白色', '黑色', '蓝色', '绿色', '红色', '粉色', '米白', '象牙白', '灰色', '棕色',
  '橙色', '黄色', '银色', '紫色', '米色', '灰褐', '金色', '暖调', '冷调', '暗调',
  '低饱和', '去饱和', '单色', '苍白', '粉彩'])

function summarize(body, units, tags, job) {
  // 主体只认主体名词；颜色单独聚成一组，避免速读变成颜色词堆砌
  const subjectWords = zhHits(units[0] || body.slice(0, 120), 5).filter(x => SUBJECT_ZH.has(x)).slice(0, 2)
  const subject = subjectWords.length ? subjectWords : ['画面主体']
  const concepts = zhHits(body, 16).filter(x => !subject.includes(x))
  const extra = []
  for (const term of [...tags.style, ...tags.lighting, ...tags.angle]) {
    for (const z of zhHits(term, 2)) {
      if (!subject.includes(z) && !concepts.includes(z) && !extra.includes(z)) extra.push(z)
    }
  }
  const all = [...concepts, ...extra]
  const nonColor = all.filter(x => !COLOR_ZH.has(x)).slice(0, 4)
  const colors = all.filter(x => COLOR_ZH.has(x)).slice(0, 2)
  const modifiers = [...nonColor, ...(colors.length ? [colors.join('、') + '配色'] : [])]
  const parts = [subject.join('、')]
  if (modifiers.length) parts.push(modifiers.join('、'))
  parts.push(`${job.aspect} 画幅`)
  return parts.join('，') + '。'
}

// ── 单条分解 ──────────────────────────────────────────────

export function decomposeJob(job, methodology) {
  const { composition, dict } = methodology
  const prompt = job.prompt || ''
  const paramTail = parseParamTail(prompt)
  const body = paramTail.body
  const units = splitUnits(body)
  const buckets = { 2: [], 3: [], 4: [], 5: [], 6: [] }
  for (const unit of units.slice(1)) buckets[classify(unit)].push(unit)

  // 首单元整体视为主体（铁律 2）；其中的景别/焦段短语另补进 ④
  const lensHits = [...new Set([...(body.matchAll(LENS_PHRASE))].map(m => m[0].trim()))].slice(0, 4)
  const angleTerms = hitTerms(body, dict.angle).slice(0, 4)

  const tags = {
    style: hitTerms(body, dict.style).slice(0, 8),
    lighting: hitTerms(body, dict.lighting).slice(0, 8),
    angle: [...new Set([...hitTerms(body, dict.angle), ...lensHits])].slice(0, 8),
    emotion: hitTerms(body, dict.emotion).slice(0, 8),
  }

  const comp = []
  for (const rule of composition) {
    if (rule.signals.some(s => normalize(body).includes(normalize(s).trim()))) comp.push(rule.label)
  }
  // 社区 prompt 很少写教材原词，补几条等价表达，明确标「推断」
  const weak = [
    { label: '三分法（推断）', re: /\b(off[- ]center|left of center|right of center|slightly left|rule of thirds)\b/i },
    { label: '框架式（推断）', re: /\b(framed? (by|through)|frames the|thin .{0,12} border|white border)\b/i },
    { label: '留白 / 负空间（推断）', re: /\b(generous space|negative space|empty space|clean background|plain background)\b/i },
    { label: '引导线（推断）', re: /\b(diagonal|diagonally|leading lines|strong vertical lines|deep perspective)\b/i },
    { label: '对称式（推断）', re: /\b(symmetrical|symmetry|balanced composition|centered subject|perfectly centered)\b/i },
  ]
  for (const w of weak) {
    if (w.re.test(body) && !comp.some(c => c.startsWith(w.label.replace('（推断）', '')))) comp.push(w.label)
  }

  const framework = /\b(woman|women|man|men|girl|boy|person|people|portrait|couple|face|character|warrior|jockey|she|he|her|his)\b/i.test(body)
    ? '人物画像'
    : /\b(product|logo|sticker|poster|object|still life|icon|bottle|package|typography|building|interior|architecture)\b/i.test(body)
      ? '物体描述'
      : null

  const frontLoaded = isFrontLoaded(body)
  const segText = {
    1: clip(units[0] || body, 140),
    2: joinUnits(buckets[2]),
    3: joinUnits(buckets[3]),
    4: joinUnits(buckets[4], [...lensHits, ...angleTerms, ...tags.angle.slice(0, 2)]),
    5: joinUnits(buckets[5], tags.lighting.slice(0, 2)),
    6: joinUnits(buckets[6], tags.style.slice(0, 3)),
    7: paramTail.text,
  }
  const segNote = {
    1: frontLoaded ? '风格 / 景别词前置，主体在首短语内但权重被分走' : '首个短语视为主体，位置最前（铁律 2）',
    2: buckets[2].length ? `命中动作 / 状态信号词 ${buckets[2].length} 处` : '未检出显式动作或状态词',
    3: buckets[3].length ? `场景 / 周边元素，共 ${buckets[3].length} 个短语` : '未检出独立环境段',
    4: (lensHits.length + angleTerms.length) ? `镜头信号：${[...lensHits, ...angleTerms].slice(0, 3).join(' / ')}` : '未检出景别 / 机位 / 焦段信号',
    5: buckets[5].length ? `光线 / 色调信号 ${buckets[5].length} 处` : '未检出显式光线或色调词',
    6: buckets[6].length ? `风格 / 媒介信号 ${buckets[6].length} 处，词库命中见下方` : '未检出显式风格词',
    7: paramTail.params.length
      ? `${paramTail.params.length} 个参数；版本有效性见体检 V 项`
      : `正文未写 --ar / --v 等参数；${job.aspect} 与${job.sref ? ' sref ' + job.sref + ' ' : '风格参考'}由上游作业字段承载`,
  }

  const segments = SEGMENT_MODULES.map((module, i) => ({
    code: String(i + 1),
    module,
    text: segText[i + 1] || '',
    note: segNote[i + 1],
  }))

  return {
    jobId: job.id,
    schemaVersion: SCHEMA_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    framework,
    segments,
    composition: comp,
    tags,
    paramTail: { text: paramTail.text, params: paramTail.params },
    health: healthOf(prompt, body, paramTail),
    summary: summarize(body, units, tags, job),
    model: MODEL,
    generatedAt: new Date().toISOString(),
  }
}

// ── 主流程 ────────────────────────────────────────────────

function main() {
  const methodology = loadMethodology(ROOT)
  const snapshot = yaml.load(fs.readFileSync(SNAPSHOT, 'utf8'))
  const jobs = snapshot.jobs || []
  const existing = fs.existsSync(OUTPUT)
    ? (yaml.load(fs.readFileSync(OUTPUT, 'utf8')) || { jobs: [] })
    : { jobs: [] }

  const handmade = new Map(
    (existing.jobs || [])
      .filter(x => String(x.model || '').includes('手工'))
      .map(x => [x.jobId, x])
  )

  const target = jobs.slice(0, LIMIT)
  const generated = []
  let kept = 0
  for (const job of target) {
    if (handmade.has(job.id)) { kept++; continue }
    generated.push(decomposeJob(job, methodology))
  }

  // 保留 LIMIT 之外、快照里仍存在的旧条目（避免 --limit 调试时误删数据）
  const targetIds = new Set(target.map(j => j.id))
  const untouched = (existing.jobs || []).filter(x => !targetIds.has(x.jobId) && jobs.some(j => j.id === x.jobId))
  const merged = [...handmade.values(), ...untouched.filter(x => !handmade.has(x.jobId)), ...generated]
  const order = new Map(jobs.map((j, i) => [j.id, i]))
  merged.sort((a, b) => (order.get(a.jobId) ?? 1e9) - (order.get(b.jobId) ?? 1e9))

  const stats = {
    snapshotJobs: jobs.length,
    generated: generated.length,
    keptHandmade: kept,
    untouched: untouched.length,
    merged: merged.length,
    missingAfter: jobs.filter(j => !merged.some(x => x.jobId === j.id)).length,
    withParams: generated.filter(x => x.paramTail.params.length).length,
    withComposition: generated.filter(x => x.composition.length).length,
    withFramework: generated.filter(x => x.framework).length,
    withAngleTags: generated.filter(x => x.tags.angle.length).length,
    withLightingTags: generated.filter(x => x.tags.lighting.length).length,
    healthFails: generated.reduce((n, x) => n + x.health.filter(h => !h.ok).length, 0),
    dictSizes: Object.fromEntries(Object.entries(methodology.dict).map(([k, v]) => [k, v.length])),
    compositionRules: methodology.composition.length,
  }
  console.log(JSON.stringify(stats, null, 2))

  if (LIMIT !== Infinity) {
    console.log('\n[抽样] 前 6 条生成结果：')
    generated.slice(0, 6).forEach(x => {
      console.log('  ' + x.jobId.slice(0, 8) + ' | ' + x.framework + ' | ' + x.summary)
      console.log('    ① ' + clip(x.segments[0].text, 76))
      console.log('    ④ ' + clip(x.segments[3].text, 76) + ' | ⑥ ' + clip(x.segments[5].text, 76))
    })
  }

  if (DRY_RUN) { console.log('\nDRY_RUN: 未写入文件'); return }

  const config = {
    methodologyVersion: METHODOLOGY_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    // 顶层 model 是元信息说明。措辞与 decompose-explore.ts 对齐（共用
    // tools/decomposed-format.mjs 的 describeSources），避免同一文件在不同
    // 写者手里出现不同口径的「混合：…」。每条目的 model 字段才是前端分层依据
    // （build-webui-data.mjs 的 modelSource）。
    model: describeSources(merged),
    jobs: merged,
  }
  const tmp = OUTPUT + '.tmp'
  fs.writeFileSync(tmp, serializeDecomposed(config), 'utf8')
  fs.renameSync(tmp, OUTPUT)
  console.log(`\nWROTE ${OUTPUT} (${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2)} MB)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
