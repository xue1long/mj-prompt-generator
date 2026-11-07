# 配置在构建期内联，运行时零请求

上游用 `fetch` 在运行时读取 `public/config/*.yaml`。这带来两个问题：`file://` 直接打开 `dist/index.html` 时会被浏览器的 CORS 规则拦掉，配置根本加载不出来；YAML 的语法错误也要等用户打开页面才暴露。决定用自建 Vite 插件（`scripts/yamlConfigPlugin.ts`）在构建期解析 YAML 并内联成 `virtual:app-config` 虚拟模块，`config/` 目录同时移出 `public/`。

## 考虑过的选项

- 保留 fetch 并要求用户起本地服务器：放弃"双击即用"这个交付形态。
- 构建时把 YAML 转成 JS 挂到 `window`：能解决 CORS，但没有类型收益，且拿不到编译期检查。

## 后果

- 产物里不再有独立的 YAML 副本，改 YAML 必须重新构建（开发模式有文件监听与整页刷新）。
- YAML 的结构错误在 `npm run build` 阶段就会失败，而不是等到用户打开页面。
