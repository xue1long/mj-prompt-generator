# 筛选状态以 URL hash 为准，localStorage 只管会话

风格库有 8,960 条，光靠分类 tab 和全局搜索翻不动，所以引入了筛选。筛选一旦存在，就必须回答「筛选状态存在哪」：本项目原本只有 localStorage 会话快照（`mj-session-v1`），没有路由。决定：**筛选状态以 URL hash 为唯一来源**（`#/style-codes?pick=1&q=ghibli`），localStorage 继续只存会话（已选提示词、主体环境、参数值）；URL 里出现该 tab 不支持的参数一律**丢弃并修正 URL**，同时在界面上提示一次。

## 考虑过的选项

- 筛选也进 localStorage：刷新能恢复，但**不能分享、不能后退**，也无法从一条链接复现某个筛选视图；而且会和会话快照混在一起，过期清理变复杂。
- 双写（hash + localStorage）并让 localStorage 兜底：两个真相源，谁覆盖谁取决于加载顺序，最终一定会漂移。
- 完全不碰 URL：改动最小，但筛选结果就只是「一次性视图」，用户关掉页面就再也回不到同一组条件。

## 后果

- tab 与 hash 双向同步：`n-tabs` 的 `v-model:value` 挂到 `activeTab`，变化时写 hash；`hashchange` 时反向解析并切 tab。**从 hash 恢复的阶段必须禁止回写**（实现里用 `hashReady` 闸门），否则深链会被首屏的默认 tab 冲掉。
- 从 hash 切 tab 也会走到「切换 tab」这条路径，所以「已忽略的筛选参数」提示**不能挂在 tab 切换上清除**——那样会刚提示完就自己抹掉（实现时踩到过，改为只在用户关提示、改筛选、重置时清）。
- 不可筛的 tab（画廊、各摄影分类）会把筛选相关的 hash 清空，避免刷新后跳回可筛 tab。
- 冒烟验证里刷新改用 `domcontentloaded` 等待：风格库几百张懒加载图片会让 `networkidle2` 等不到「网络空闲」，那反映的是图片没加载完，不是应用没起来。
- hash 契约的白名单只写在该 tab 允许的参数上（`artists` 没有 `pick`，`style-library` 才有），由 `tests/filterHash.test.ts` 守住。
