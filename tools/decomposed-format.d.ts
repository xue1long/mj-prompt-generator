/**
 * tools/decomposed-format.mjs 的类型声明。
 *
 * 该模块是派生文件格式契约的单一来源，被 decompose-explore.ts（TS）、
 * rule-decompose.mjs、merge-fine-parts.mjs（均为 JS）共用。
 * tools/ 不在 tsconfig 的 include 范围内，但补上声明可避免 IDE / vue-tsc
 * 把 JS 模块隐式 any 化。
 */

export declare const DECOMPOSED_FORMAT: 'json';

/** 如实统计各来源条数，生成顶层 model 描述。 */
export declare function describeSources(
  jobs: Array<{ model?: string | null }> | null | undefined
): string;

/** 序列化派生配置为纯 JSON 文本（不带注释头）。 */
export declare function serializeDecomposed(config: unknown): string;

/** 派生文件的来源说明（写进 `model` 字段，不进注释）。 */
export declare const DECOMPOSED_HEADER_HINT: string;
