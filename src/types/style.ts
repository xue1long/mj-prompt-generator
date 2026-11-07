/**
 * 风格库类型。
 *
 * 风格库（config/styles.yaml）是 Midlibrary 风格库的导出快照，
 * 由 tools/build-styles.ts 生成，不是手写词库。
 *
 * 两种条目：
 * - 风格条目（StyleArtist）：一位艺术家 / 摄影师 / 设计师，进词库参与组装；
 * - 风格参考码（StyleCode）：一个 --sref 码，是参数，只进参数区。
 */

/** 风格条目：一位艺术家 / 摄影师 / 设计师 */
export interface StyleArtist {
  /** 唯一标识（上游条目 id） */
  id: string
  /** 原文名（上游只提供原文名，没有中文名） */
  name: string
  /** 所属画师类目 */
  category: string
  /** 进入提示词的英文写法（已剥掉 "by " 前缀与版本参数） */
  promptEn: string
  /** 上游原始提示词行（只作展示） */
  sourcePrompt: string
  /** 预览图路径（相对于 public/preview-images/） */
  preview?: string
  /** 原站页面（署名与回链用） */
  sourceUrl: string
  /** 是否已被上游实测（筛选维度「只看实测」） */
  testedMark: boolean
  /** 是否编辑精选（筛选维度「编辑精选」） */
  isPick: boolean
  /** 分面词 slug（组内任一、组间全部） */
  terms: string[]
  /** 主色 slug，按占比降序（筛选维度「主色」） */
  colours: string[]
  /** 简介：他是谁、擅长什么（上游详情层 a 字段，4311/4322 覆盖） */
  intro?: string
  /** 风格描述：这张风格图画面的样子（上游详情层 o 字段，4322/4322 覆盖） */
  observation?: string
}

/** 风格参考码条目 */
export interface StyleCode {
  /** 唯一标识（上游条目 id） */
  id: string
  /** 风格名 */
  name: string
  /** 码本身（填进 --sref 的值） */
  code: string
  /** 所属类目 */
  category: string
  /** 进入最终提示词的写法 */
  promptEn: string
  /** 上游原始提示词行（只作展示） */
  sourcePrompt: string
  /** 预览图路径（相对于 public/preview-images/） */
  preview?: string
  /** 原站页面（署名与回链用） */
  sourceUrl: string
  /** 是否已被上游实测（筛选维度「只看实测」） */
  testedMark: boolean
  /** 是否编辑精选（筛选维度「编辑精选」） */
  isPick: boolean
  /** 分面词 slug（组内任一、组间全部） */
  terms: string[]
  /** 主色 slug，按占比降序（筛选维度「主色」） */
  colours: string[]
}

/** 画师类目 */
export interface StyleCategory {
  /** 类目 id */
  id: string
  /** 中文名 */
  name: string
  /** 该类目下的条目数 */
  count: number
}

/** 一个分面词 */
export interface StyleTerm {
  slug: string
  label: string
}

/** 一组分面词（组内任一，组间全部） */
export interface StyleTermGroup {
  id: string
  name: string
  terms: StyleTerm[]
}

/** 一个主色（hex 仅用于画色块） */
export interface StyleColour {
  slug: string
  name: string
  hex: string
}

/** 风格库配置（config/styles.yaml 的结构） */
export interface StylesConfig {
  /** 数据来源与授权说明 */
  source: {
    /** 来源站点名 */
    name: string
    /** 来源地址 */
    url: string
    /** 授权说明（署名 + 回链的条件） */
    license: string
    /** 快照生成日期 */
    generatedAt: string
    /** 有分面数据的条目占比（采集完成时应为 100） */
    facetCoverage: number
  }
  /** 画师类目 */
  categories: StyleCategory[]
  /** 分面词组（组内任一、组间全部） */
  termGroups: StyleTermGroup[]
  /** 主色 */
  colours: StyleColour[]
  /** 风格条目 */
  artists: StyleArtist[]
  /** 风格参考码 */
  codes: StyleCode[]
}
