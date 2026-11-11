/**
 * 提示词相关类型定义
 */

/** 单个提示词项 */
export interface PromptItem {
  /** 唯一标识 */
  id: string
  /**
   * 中文提示词（显示用）。
   * 风格条目没有中文名——上游只给原文名，这种条目缺省这一项，
   * 界面回落到用 prompt_en 显示。
   */
  prompt_zh?: string
  /** 英文提示词（实际使用） */
  prompt_en: string
  /**
   * 说明（显示用）。
   * 手写词库可写"适用于 xxx 场景"；风格条目放上游简介——
   * 上游不给中文名，这段简介是认出"他是谁、擅长什么"的唯一线索。
   */
  description?: string
  /** 风格描述（风格条目的详情里展示：上游对这张风格画面的观察） */
  observation?: string
  /** 预览图路径（相对于 public/preview-images/） */
  preview?: string
  /** 生成示例图的提示词（可选，如果配置了则在预览窗口中显示） */
  generationPrompt?: string
  /** 原站页面（风格条目的署名与回链用；手写条目没有） */
  sourceUrl?: string
  /** 是否已被上游实测（风格条目才有，筛选维度「只看实测」） */
  testedMark?: boolean
  /** 是否编辑精选（风格条目才有，筛选维度「编辑精选」） */
  isPick?: boolean
  /** 分面词 slug（风格条目才有，组内任一、组间全部） */
  terms?: string[]
  /** 主色 slug（风格条目才有，按占比降序） */
  colours?: string[]
}

/** 二级子分类 */
export interface PromptSubCategory {
  /** 子分类ID */
  id: string
  /** 子分类名称 */
  name: string
  /** 该子分类下的提示词列表 */
  prompts: PromptItem[]
}

/** 分类特殊属性 */
export interface CategorySpecial {
  /** 是否是艺术家分类 */
  isArtist?: boolean
  /** 单选建议提示（如"建议单选，多选可能导致风格冲突"） */
  singleSelectionHint?: string
  /** 在提示词生成中的位置标识 */
  positionTag?: 'artist' | 'camera' | 'lighting' | 'other'
}

/** 提示词分类（支持二级分类） */
export interface PromptCategory {
  /** 分类ID */
  id: string
  /** 分类名称 */
  name: string
  /** 图标名称（可选） */
  icon?: string
  /** 分类特殊属性（可选） */
  special?: CategorySpecial
  /** 该分类下的提示词列表（一级分类，可选，向后兼容） */
  prompts?: PromptItem[]
  /** 二级子分类（可选） */
  subCategories?: PromptSubCategory[]
}

/** 主体环境示例 */
export interface SubjectEnvironmentExample {
  /** 示例ID */
  id: string
  /** 示例标题 */
  title: string
  /** 主体描述 */
  subject: string
  /** 环境描述 */
  environment: string
  /** 完整文本（subject + environment） */
  fullText: string
}

/** 提示词配置文件结构 */
export interface PromptsConfig {
  /** 分类列表 */
  categories: PromptCategory[]
  /** 主体环境示例列表（可选） */
  subjectEnvironmentExamples?: SubjectEnvironmentExample[]
}

/** 已选择的提示词（支持子分类和位置标签） */
export interface SelectedPrompt {
  /** 分类ID */
  categoryId: string
  /** 子分类ID（可选，如果是二级分类） */
  subCategoryId?: string
  /** 提示词ID */
  promptId: string
  /** 提示词文本 */
  text: string
  /** 选中的时间戳（用于排序） */
  timestamp: number
  /** 分类位置标签（用于智能组合，继承自category.special.positionTag） */
  positionTag?: string
}
