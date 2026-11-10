/**
 * 测试收集守卫（vitest 的 Windows/沙箱 EPERM 防护）。
 *
 * ## 为什么需要它
 *
 * vitest 把 SSR transform 缓存写到临时目录。某些环境下那个写入会抛 `EPERM`
 * —— 在 WorkBuddy 里是它的 fs shim（app.asar.unpacked/cli/vendor/shim/
 * node-brokered-fs-shim.cjs 的 `tryBrokerFileToken`）对随机命名目录的写操作
 * 偶尔失败。而 vitest 对**单个文件**的 transform 失败是「跳过该文件」而不是
 * 「整体报错」—— 结果就是：
 *
 *     Test Files  14 passed (14)      ← 明明磁盘上有 15 个测试文件
 *     Tests       253 passed (253)    ← 静默少跑 25 个用例
 *
 * 静默少跑比失败更危险：CI 会变绿，而实际没跑的用例没人知道。
 * （实测 6 次里丢 2 次。）
 *
 * ## 它做什么
 *
 * 1. 临时目录（TEMP/TMP/TMPDIR）改到项目内 —— 绕开系统 Temp 的占用竞争；
 * 2. 跑 vitest，核对**实际收集的测试文件数**与**磁盘上的测试文件数**；
 * 3. 不等就**自动重跑**（最多 3 次）—— 该故障是间歇性的，重跑通常就过；
 * 4. 连续失败则**明确报错并以非零码退出** —— 绝不静默少跑后还报成功。
 *
 * 用法：node scripts/test-guard.mjs [额外的 vitest 参数...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const MAX_ATTEMPTS = 3;

/* 临时目录改到项目内。
   系统 Temp 常被其它进程占用/清理；而随机命名的子目录在 WorkBuddy 的 fs shim
   下也会被 broker 机制偶尔拒写。项目内的临时目录在 node_modules 下，
   已被 gitignore 覆盖。 */
const TMP_DIR = path.join(ROOT, 'node_modules/.cache/tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });
const env = { ...process.env, TEMP: TMP_DIR, TMP: TMP_DIR, TMPDIR: TMP_DIR };

/** 磁盘上的测试文件（递归）。 */
function testFilesOnDisk() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.test\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(path.relative(ROOT, p));
    }
  };
  if (fs.existsSync(TESTS_DIR)) walk(TESTS_DIR);
  return out.sort();
}

/** vitest 实际收集到的测试文件（从 verbose 输出里抓路径）。 */
function collectedFiles(stdout) {
  const set = new Set();
  for (const m of stdout.matchAll(/tests[\\/]([A-Za-z0-9_.-]+\.test\.(?:ts|tsx|js|mjs))/g)) {
    set.add(path.join('tests', m[1]));
  }
  return [...set].sort();
}

const onDisk = testFilesOnDisk();
console.log(`[test-guard] 磁盘上的测试文件：${onDisk.length} 个`);

let last = null;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const res = spawnSync(
    'npx',
    ['vitest', 'run', '--reporter=verbose', ...process.argv.slice(2)],
    { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'], shell: true, encoding: 'utf8', env },
  );

  const stdout = (res.stdout || '') + (res.stderr || '');
  process.stdout.write(res.stdout || '');
  if (res.stderr) process.stderr.write(res.stderr);

  const collected = collectedFiles(stdout);
  console.log(`[test-guard] vitest 实际收集：${collected.length} 个（第 ${attempt}/${MAX_ATTEMPTS} 次尝试）`);

  if (collected.length === onDisk.length) {
    console.log('[test-guard] ✓ 收集完整，结果可信。');
    process.exit(res.status ?? 0);
  }

  last = { collected, status: res.status, missing: onDisk.filter((f) => !collected.includes(f)) };
  if (attempt < MAX_ATTEMPTS) {
    console.log(`[test-guard] ⚠ 收集不完整（少了 ${last.missing.length} 个文件），重跑…`);
  }
}

console.error('\n[test-guard] ❌ 连续 ' + MAX_ATTEMPTS + ' 次都收集不完整 —— 本次结果不可信。');
console.error(`[test-guard]    未收集：${last.missing.join('、')}`);
console.error('[test-guard]    常见原因：临时目录写入被拒（EPERM）。');
console.error('[test-guard]    处理：清空临时目录后重跑；或手动执行 `npx vitest run` 观察。');
process.exit(1);
