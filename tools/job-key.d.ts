/** 为 tools/job-key.mjs 补类型声明，避免 IDE / vue-tsc 隐式 any。 */
export declare function normalizePrompt(prompt: unknown): string;
export declare function fnv1a(str: string): string;
export declare function jobKey(job: { id?: string; prompt?: string } | null | undefined): string;
export declare function jobKeys(
  jobs: Array<{ id?: string; prompt?: string }>
): string[];
