#!/usr/bin/env node
/**
 * 探索榜每日更新的**唯一入口**（见 ADR-0017 Round 11）。
 *
 * 四步固定顺序：
 *   1. 采集     node tools/collect-explore.ts        写 config/explore.yaml + 下载配图
 *   2. 分解     node tools/decompose-explore.ts      写 config/explore-decomposed.yaml（要 LLM）
 *   3. 烘焙     node scripts/build-webui-data.mjs    config/*.yaml → webui/js/data-*.js
 *   4. 构建     node scripts/build-webui.mjs         webui/ → dist/
 *
 * 为什么要有这个编排脚本（而不是在 package.json 里写 `&&` 链）：
 *   ① 「分解失败不阻断采集链」无法用 `&&` 表达 —— 分解要调 LLM，代理挂了
 *      不应该让当天新采集的数据也进不了产物；
 *   ② 之前 `更新探索榜.bat` 是三步展开（collect → decompose → build），**漏了
 *      烘焙那一步**，导致新采集的数据永远进不了 `webui/js/data-*.js` —— 页面
 *      一直是旧数据。单一入口从根上消除这种「两处流程定义各漏一步」的问题；
 *   ③ 失败分级需要按步骤判断，shell 的 `&&` / `||` 表达不了。
 *
 * 失败分级：
 *   - 采集失败 → 致命（没有新快照，后面全无意义）
 *   - 分解失败 → **警告，不阻断**。新作业走灯箱空态（既有机制）。
 *     若分解因「缺 .env」失败，会明确提示配置方式。
 *   - 烘焙失败 → 致命（产物会与源数据不一致，不能放出去）
 *   - 构建失败 → 致命（dist/ 不完整）
 *
 * 用法：
 *   node scripts/update-explore.mjs                   # 完整四步
 *   node scripts/update-explore.mjs --skip-decompose  # 跳过分解（无 LLM 代理时）
 *   node scripts/update-explore.mjs --collect-only    # 只采集，不动任何产物
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipDecompose = args.includes('--skip-decompose');
const collectOnly = args.includes('--collect-only');

const node = process.execPath;

/** 派生文件路径（分解步骤的写入目标，也是备份/回滚的对象）。 */
const DERIVED = path.join(ROOT, 'config', 'explore-decomposed.yaml');
/** 备份目录（node_modules 下，被 .gitignore 忽略，不会污染仓库）。 */
const BACKUP_DIR = path.join(ROOT, 'node_modules', '.cache', 'mj-update-backup');

function run(label, cmd, cmdArgs) {
  console.log(`\n── ${label} ──`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (out) console.log(out);
  if (err) console.error(err);
  return { code: r.status ?? -1, out, err };
}

function fatal(msg) {
  console.error(`\n[update-explore] 致命错误：${msg}`);
  process.exit(1);
}

/**
 * 备份派生文件。
 *
 * 为什么要备份：分解步骤会重写 config/explore-decomposed.yaml，而该文件里躺着
 * 942 条人工/LLM 精拆成果（3 手工 + 50 LLM + 889 规则）。虽然 writeOutput 用的是
 * 标准原子写（tmp → rename），失败不会留半成品，且版本过滤实测一条不丢 ——
 * 但「万一」不能靠嘴说：有备份才敢把分解放进每日默认链。
 */
function backupDerived(tag) {
  if (!fs.existsSync(DERIVED)) return null;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_DIR, `explore-decomposed.${stamp}.${tag}.bak`);
    fs.copyFileSync(DERIVED, dest);
    console.log(`[update-explore] 已备份派生文件 → ${path.relative(ROOT, dest)}`);
    return dest;
  } catch (error) {
    console.warn(`[update-explore] 警告：备份派生文件失败（${error.message}），继续。`);
    return null;
  }
}

/** 分解失败时回滚到备份，确保精拆成果不受损。 */
function rollbackDerived(backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) return;
  try {
    fs.copyFileSync(backupPath, DERIVED);
    console.warn('[update-explore] 已回滚派生文件到分解前的备份。');
  } catch (error) {
    console.warn(`[update-explore] 警告：回滚失败（${error.message}），请手工检查备份目录。`);
  }
}

/* ── 1. 采集 ─────────────────────────────────────────────────────────── */
const collect = run('1/4 采集探索榜', node, ['tools/collect-explore.ts']);
if (collect.code !== 0) {
  fatal(
    `采集失败（退出码 ${collect.code}）。旧快照与旧图保留，页面不会开天窗。` +
      '若因 Cloudflare / 网络被拦，重试即可。'
  );
}

if (collectOnly) {
  console.log('\n── 完成 ──');
  console.log('只采集完成（快照与配图已更新），未烘焙、未构建。');
  console.log('需要产物就再跑一次不带 --collect-only 的 update:explore。');
  process.exit(0);
}

/* ── 2. 分解（失败不阻断）──────────────────────────────────────────────── */
let decompose = null;
if (skipDecompose) {
  console.log('\n── 2/4 分解 ──\n已跳过（--skip-decompose）');
} else {
  const backup = backupDerived('pre-decompose');
  decompose = run('2/4 分解新增作业的提示词（LLM）', node, ['tools/decompose-explore.ts']);
  if (decompose.code !== 0) {
    rollbackDerived(backup);
    const missingEnv = /MJ_DECOMPOSE_(BASE_URL|API_KEY|MODEL)/.test(decompose.err + decompose.out);
    console.warn(
      `\n[update-explore] 警告：分解失败（退出码 ${decompose.code}），**不阻断本次更新**。` +
        '新采集的作业会在灯箱里走空态（不显示拆解），其余数据照常更新。'
    );
    if (missingEnv) {
      console.warn(
        '[update-explore] 原因多半是没配 LLM 代理：复制 .env.example 为 .env，填好 ' +
          'MJ_DECOMPOSE_BASE_URL / MJ_DECOMPOSE_API_KEY / MJ_DECOMPOSE_MODEL。' +
          '也可以直接用 --skip-decompose 跳过这一步。'
      );
    }
  }
}

/* ── 3. 烘焙 ─────────────────────────────────────────────────────────── */
const bake = run('3/4 烘焙数据产物', node, ['scripts/build-webui-data.mjs', '--images=public']);
if (bake.code !== 0) {
  fatal(`烘焙失败（退出码 ${bake.code}）。产物会与源数据不一致，已中止，不更新 dist/。`);
}

/* ── 4. 构建 ─────────────────────────────────────────────────────────── */
const build = run('4/4 构建 dist/', node, ['scripts/build-webui.mjs']);
if (build.code !== 0) {
  fatal(`构建失败（退出码 ${build.code}）。`);
}

/* ── 汇总 ────────────────────────────────────────────────────────────── */
console.log('\n── 完成 ──');
if (decompose && decompose.code !== 0) {
  console.log('更新完成，但**分解那一步失败**（新作业走灯箱空态）。');
} else if (skipDecompose) {
  console.log('更新完成（本次跳过了分解）。');
} else {
  console.log('更新完成。');
}
console.log('产物：dist/index.html（双击即可用）');
