import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { yamlConfigPlugin } from './scripts/yamlConfigPlugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), yamlConfigPlugin()],
  // 本地运行：生产构建用相对路径，dist/index.html 可以直接双击打开
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    open: true,
    watch: {
      // 编辑器/工具的原子写临时目录（.<name>.<pid>.<uuid>.tmpdir）在 Windows 上
      // 会让 chokidar 抛 EBUSY，未捕获的 error 事件会直接杀掉 dev server
      ignored: ['**/.*/**', '**/.*.tmpdir/**']
    }
  },
  build: {
    // 预览图保持为独立文件，便于在 dist 里直接查看
    assetsInlineLimit: 4096
  }
})
