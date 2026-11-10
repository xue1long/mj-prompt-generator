/**
 * 作业稳定引用键 —— 构建期入口（报告 2.1）。
 *
 * **算法本体只有一份**：`webui/js/job-key.js`（浏览器端纯函数，无依赖）。
 * 本文件通过 vm 加载它，再包一层「批量 + 碰撞检测」的构建期用法。
 *
 * 为什么不直接把算法抄两份：
 * 键是引用的唯一依据，两处实现一旦漂移，「构建期断言零碰撞」就守不住
 * 「运行时算出来的键」—— 断言会为一个浏览器里根本不存在的键背书。
 * 所以这里**加载同一份代码**，不是复述它的逻辑。
 *
 * 构造与理由见 `webui/js/job-key.js` 的文件头注释（算法本体在那儿）。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALGO_FILE = path.join(ROOT, 'webui', 'js', 'job-key.js');

/** 加载浏览器端的键算法（同一份代码，不是复刻）。 */
function loadAlgo() {
  const text = fs.readFileSync(ALGO_FILE, 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(text + '\n;globalThis.__JOB_KEY = JOB_KEY;', ctx, { timeout: 5000 });
  if (!ctx.__JOB_KEY) throw new Error(`键算法加载失败：${ALGO_FILE}`);
  return ctx.__JOB_KEY;
}

const algo = loadAlgo();

export const normalizePrompt = algo.normalizePrompt;
export const fnv1a = algo.fnv1a;

/** 一条作业的引用键。与浏览器端逐字节一致。 */
export function jobKey(job) {
  return algo.keyOf(job);
}

/**
 * 批量生成并**检测碰撞**。
 *
 * 同一批数据里若两个作业算出同一个键 → 抛错中止构建。
 * 理由：键是引用的唯一依据，撞了就等于两条作业互相顶替，
 * 研究结论会挂到错误的证据上 —— 这类错误必须在构建期炸掉，
 * 不能带到运行期才发现。
 *
 * @param {Array<{id?: string, prompt?: string}>} jobs
 * @returns {string[]} 与输入等长的键数组
 */
export function jobKeys(jobs) {
  const keys = jobs.map((j) => algo.keyOf(j));
  const seen = new Map();
  const collisions = [];
  keys.forEach((k, i) => {
    if (seen.has(k)) collisions.push({ key: k, first: seen.get(k), second: i });
    else seen.set(k, i);
  });
  if (collisions.length) {
    const detail = collisions
      .slice(0, 5)
      .map((c) => `${c.key}（#${c.first} 与 #${c.second}）`)
      .join('、');
    throw new Error(
      `作业引用键碰撞 ${collisions.length} 组，参考键必须唯一：${detail}` +
        (collisions.length > 5 ? ' …' : '')
    );
  }
  return keys;
}
