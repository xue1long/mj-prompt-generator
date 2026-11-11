import { defineConfig } from 'vite'
import { resolve } from 'path'
import { yamlConfigPlugin } from './scripts/yamlConfigPlugin'

/**
 * 测试配置（vitest）。
 *
 * 第 11 步（报告 3.5）删除了 Vue 版前端后，原 `vite.config.ts` 的职责一分为二：
 *   · 「跑 dev server / 打包 Vue 应用」—— 随 Vue 实现一起退役。
 *     静态 WebUI 由 `npm run build`（scripts/build-webui.mjs）自建，不经 vite。
 *   · 「提供 vitest 需要的 config 虚拟模块 + 路径别名 + 缓存目录」—— 仍然需要，
 *     因此本文件接管这两项职责。
 *
 * 为什么还需要 yamlConfigPlugin：
 *   tests/config.test.ts 与 tests/promptBuilder.test.ts 直接
 *   `import { PROMPTS_CONFIG } from 'virtual:app-config'`，
 *   这个虚拟模块把 config/*.yaml 在构建期内联（runtime 零请求，file:// 双击即用）。
 *   它是 Vite 插件，vitest 复用 vite 的插件管线，所以继续挂载。
 *
 * 为什么 alias 放在 test.alias 而不是 resolve.alias：
 *   vitest 2.x 的模块解析走 `test.alias`；写在 `resolve.alias` 里只影响
 *   vite 的应用构建管线，vitest 自己读不到 —— 表现为
 *   「Cannot find module '@/utils/xxx'」而 vite 侧探针却能看到别名。
 *   这个坑在第 11 步实测踩过一次，故在此注明。
 *
 * 为什么 @/ 指向 shared/：
 *   纯逻辑层（shared/types + shared/utils）从 src/ 迁出后，tests/ 的
 *   8 个测试文件仍按 `@/types` / `@/utils/*` import —— alias 指向 shared/，
 *   测试代码零改动。
 *
 * 关于 cacheDir：
 *   Vitest 的 SSR transform 缓存默认写到系统 Temp 目录。Windows 上那个目录
 *   常被其它进程占用/清理，写入会抛 EPERM —— 而 vitest 对单个文件的
 *   transform 失败是「跳过该文件」而非「整体报错」，表现为
 *   「测试文件数忽多忽少、用例数随机少几十个」（实测 6 次里丢 2 次）。
 *   把缓存固定到项目内，绕开系统 Temp 的竞争。
 */
export default defineConfig({
  plugins: [yamlConfigPlugin()],
  test: {
    alias: {
      '@': resolve(__dirname, 'shared'),
    },
  },
  cacheDir: resolve(__dirname, 'node_modules/.cache/vite'),
})
