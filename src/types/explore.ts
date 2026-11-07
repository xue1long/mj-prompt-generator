/**
 * 探索榜类型。
 *
 * 探索榜（config/explore.yaml）是 Midjourney 官网 Explore 榜的快照，
 * 由 tools/collect-explore.ts 每日采集生成，不是手写词库。
 *
 * 领域单位是「作业」：一条社区生成 = 一条原始提示词 + 四格成图 + 作者名。
 * 作业是别人做好的成品，不是能拼进提示词的片段（见 CONTEXT.md 与 ADR-0013）。
 */

/** 一条作业 */
export interface ExploreJob {
  /** 唯一标识（上游作业 id） */
  id: string
  /** 原始提示词全文（社区作者写的，不是本项目的词库条目） */
  prompt: string
  /** 标题 = 提示词截断到 81 字（卡片上显示的那行） */
  title: string
  /** 作者显示名（上游账号名是 UUID 的，已在入库前换成「匿名作者」） */
  author: string
  /** 作者原始账号 id（上游是 UUID，没有可用的公开主页链接） */
  authorId?: string
  /** 宽高比（上游声明值，如 "9:16"；与真实像素一致） */
  aspect: string
  /** 生成时的模型版本 */
  version: string
  /** 入队时间（毫秒时间戳）——唯一的排序依据，上游没有热度分 */
  enqueueTime: number
  /** 采集批次日期（YYYY-MM-DD） */
  batch: string
  /** 风格参考码（可填进 --sref）。挂的是图片型风格参考时没有数字码 */
  sref?: string
  /** 四格缩略图路径（相对于 public/explore/） */
  thumbs: string[]
  /** 四格灯箱大图路径（640px，相对于 public/explore/） */
  mids: string[]
}

/** 一格成图：作业四格里的一格 */
export interface ExploreItem {
  /** 唯一标识（`<作业id>_<格号>`） */
  id: string
  /** 所属作业 */
  jobId: string
  /** 格号（0~3） */
  index: number
  /** 缩略图路径（相对于 public/explore/） */
  thumb: string
  /** 所属作业（卡片上要用作者名与风格参考码角标） */
  job: ExploreJob
}

/** 一个采集批次（一天一份） */
export interface ExploreBatch {
  /** 批次日期（YYYY-MM-DD） */
  key: string
  /** 显示名（MM-DD） */
  name: string
  /** 该批次的作业数 */
  jobs: number
  /** 该批次的成图数 */
  images: number
}

/** 一种宽高比 */
export interface ExploreAspect {
  /** 宽高比（上游声明值，如 "9:16"） */
  key: string
  /** 显示名（竖版 9:16 之类） */
  name: string
  /** 成图数 */
  count: number
}

/** 探索榜配置（config/explore.yaml 的结构） */
export interface ExploreConfig {
  /** 数据来源与授权说明 */
  source: {
    /** 来源站点名 */
    name: string
    /** 来源地址 */
    url: string
    /** 授权说明（署名 + 回链的条件） */
    license: string
    /** 快照生成时间 */
    generatedAt: string
    /** 保留窗口（天） */
    windowDays: number
    /** 本次从上游取到的作业数（过滤前） */
    fetched: number
    /** 入库前被丢弃的作业数（提示词过短等） */
    dropped: number
  }
  /** 采集批次 */
  batches: ExploreBatch[]
  /** 宽高比 */
  aspects: ExploreAspect[]
  /** 作业 */
  jobs: ExploreJob[]
}

// ── 提示词结构分解（构建期 LLM 预生成，见 ADR-0015） ──────────
//
// 这是 config/explore-decomposed.yaml 里的派生数据，按 jobId 关联
// explore.yaml 的作业；**不要**把它写进 explore.yaml（采集脚本会整体覆盖）。
// 方法论基线是 V8.2，与 .workbuddy/skills/mj-prompt-decompose/SKILL.md 同源。

/** 七段式里的一段 */
export interface PromptSegment {
  /** 段号 ①~⑦ */
  code: '1' | '2' | '3' | '4' | '5' | '6' | '7'
  /** 模块名（主体 / 动作状态 / 细节与环境 / …） */
  module: string
  /** 命中的提示词片段（英文社区 prompt 保留原词） */
  text: string
  /** 备注：是否最前 / 命中哪条构图法 / 参数在 V8.2 下是否有效等 */
  note?: string
}

/** 词库打标：命中第三章词库的词，保留原文 */
export interface PromptTagGroup {
  /** 画风 / 媒介 / 流派 / 镜头感 */
  style: string[]
  /** 光线 / 色调 */
  lighting: string[]
  /** 景别 / 机位 / 焦段 */
  angle: string[]
  /** 情感词 */
  emotion: string[]
}

/** 一条铁律 / 误区 / 版本约束的体检结果 */
export interface HealthCheck {
  /** R1~R5 铁律 · M1~M5 常见误区 · V1~V4 V8.2 版本约束 */
  id: string
  /** 是否合规 */
  ok: boolean
  /** 违规或合规说明 */
  note?: string
}

/** 尾部参数（由构建工具从原文确定性解析，不交给 LLM 判断） */
export interface PromptParam {
  /** 含 `--` 的参数名 */
  name: string
  /** 取值；无取值的开关型参数为空串 */
  value: string
}

/** 一条作业的提示词结构分解结果 */
export interface ExploreJobDecomposition {
  /** 关联的作业 id */
  jobId: string
  /** schema 版本；结构变更时 +1，旧数据会被判为过期并重算 */
  schemaVersion: number
  /** 方法论基线（如 'v8.2'）；升级时旧数据会被判为过期并重算 */
  methodologyVersion: string
  /** 整体框架判定（推断） */
  framework: '人物画像' | '物体描述' | null
  /** 七段式拆解 */
  segments: PromptSegment[]
  /** 命中的构图五法 */
  composition: string[]
  /** 词库打标 */
  tags: PromptTagGroup
  /** 参数尾 */
  paramTail: {
    /** 原文里的参数片段 */
    text: string
    /** 逐项解析出的参数 */
    params: PromptParam[]
  }
  /** 铁律 / 误区 / 版本约束体检 */
  health: HealthCheck[]
  /** 中文速读（一句话） */
  summary: string
  /** 生成所用模型 */
  model: string
  /** ISO 时间戳 */
  generatedAt: string
}

/** config/explore-decomposed.yaml 的结构（生成物） */
export interface ExploreDecomposedConfig {
  /** 方法论基线 */
  methodologyVersion: string
  /** schema 版本 */
  schemaVersion: number
  /** 生成时间 */
  generatedAt: string
  /** 生成所用模型 */
  model: string
  /** 分解结果（按 jobId 关联 explore.yaml 的 jobs） */
  jobs: ExploreJobDecomposition[]
}
