/**
 * 派生文件（config/explore-decomposed.yaml）的格式契约 —— 单一来源。
 *
 * 背景（2026-11-10，第 3 步）：
 *   此前有三个工具写同一个派生文件，格式互斥 ——
 *     tools/decompose-explore.ts   用 yaml.dump 写 YAML
 *     tools/rule-decompose.mjs     用 JSON.stringify 写 JSON
 *     tools/merge-fine-parts.mjs   用 JSON.stringify 写 JSON
 *   而构建期 scripts/build-webui-data.mjs 用 JSON.parse 读，
 *   跑一次 decompose:explore 就会产出 YAML，让构建链在 JSON.parse 上直接抛错，
 *   而错误现场离原因很远。
 *
 * 本模块把「派生文件写 JSON + 顶层 model 如实统计各来源」抽成共用实现，
 * 三个写者共用，避免同一契约在三处各写一遍、各写错一遍。
 *
 * 文件名沿用 .yaml 是历史遗留（扩展名与内容不符）。不单独改名，避免牵动
 * 采集链与 git 历史；读方一律走容错解析，格式判定看内容不看扩展名。
 */

/** 派生文件统一写 JSON。 */
export const DECOMPOSED_FORMAT = 'json';

/**
 * 如实统计各来源条数，生成顶层 model 描述。
 *
 * 顶层 model 是「这批数据由哪几路构成」的元信息。每条目的 model 字段才是
 * 前端分层依据（build-webui-data.mjs 的 modelSource）。
 *
 * 不写死「手工 + LLM + 规则」三段——那会漏掉真实构成（也可能在某路为 0 时
 * 谎报）。按实际 model 值分组统计，不杜撰。
 */
export function describeSources(jobs) {
  const counts = new Map();
  for (const j of jobs || []) {
    const key = String(j?.model ?? '未标注');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size === 0) return '';
  if (counts.size === 1) {
    const [only] = [...counts.entries()];
    return `${only[1]} 条 ${only[0]}`;
  }
  const parts = [...counts.entries()].map(([k, n]) => `${n} 条 ${k}`);
  return `混合：${parts.join(' + ')}`;
}

/**
 * 序列化派生配置为 JSON 文本。
 *
 * **必须是纯 JSON，不带注释头** —— JSON 规范里 `//` 注释不合法，
 * `JSON.parse` 会直接抛错。当前主文件就是纯 JSON（无任何 `//` 行），
 * 任何写者加注释头都会破坏这个契约，让所有读方（以及编辑器插件、
 * 第三方脚本）读不了。故来源信息由 `model` 字段承载，不靠注释。
 *
 * 统一由本函数产出，保证三个写者的缩进、末尾换行完全一致 ——
 * 这直接影响 git diff 的可读性。
 */
export function serializeDecomposed(config) {
  return JSON.stringify(config, null, 2) + '\n';
}

/** 派生文件的来源说明（写进 `model` 字段，不进注释）。 */
export const DECOMPOSED_HEADER_HINT =
  '派生数据，按 jobId 关联 config/explore.yaml；采集脚本覆盖快照不影响本文件。';
