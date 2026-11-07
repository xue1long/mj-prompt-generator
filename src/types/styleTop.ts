/**
 * 官方风格榜（Midjourney styles_top）类型。
 *
 * styles_top 是 Midjourney 官方 styles_top 榜单的衍生快照，由
 * tools/build-styles-top.ts 从隔壁 ai-video-imge-prompts 仓的
 * exports/styles_top/ 生成，不是手写词库。
 *
 * 数据形态与 Midlibrary 完全不同：
 * - 没有艺术家、没有提示词、没有分面词 / 主色；
 * - 每个风格码配 8 张题材示例图（人像 / 风景 / 静物 / 咖啡 / 树 / 屋 / 动物 / 街景）；
 * - 唯一可用动作是「抄一个 --sref 码」。
 * 因此单独成模块，不复用 style.ts 的 StylesConfig（避免污染分面模型）。
 */

/** 一种题材（8 种之一） */
export interface StylesTopKind {
  /** 题材 id（与源站缩略图文件名一致） */
  id: string
  /** 中文名 */
  label: string
}

/** 一个风格码条目 */
export interface StylesTopEntry {
  /** 唯一标识（裸数字码，与 _srefs.txt 一致） */
  id: string
  /** 码本身（填进 --sref 的值） */
  code: string
  /** 展示用全码（Midjourney 详情页形态：0_<code>） */
  display: string
  /** 题材 → 预览图相对路径（相对于 public/preview-images/）；只收源站实际存在的档 */
  images: Partial<Record<string, string>>
}

/** 官方风格榜配置（config/styles-top.yaml 的结构） */
export interface StylesTopConfig {
  /** 数据来源与授权说明 */
  source: {
    /** 来源标识 */
    name: string
    /** 来源地址 */
    url: string
    /** 授权说明 */
    license: string
    /** 快照生成日期 */
    generatedAt: string
    /** 风格码条数 */
    count: number
  }
  /** 8 种题材（中文名 + 序号稳定） */
  kinds: StylesTopKind[]
  /** 风格码条目 */
  entries: StylesTopEntry[]
}
