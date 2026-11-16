# ADR-0035：采集 `stylize` / `chaos`，并把「未记录」与 `0` 分开

- 状态：已采纳（2026-11-16）
- 触发：报告 2.8 遗留项「采集侧补参数」，以及第 15 步的只读探针结论

## 背景

报告 2.8 的结论原本是「参数维度在社区数据上完全失效」，依据有两条：`version` 967/967 全是 `8.2`（零区分度），正文里 `--` 的命中全是破折号误伤。

第 15 步加了只读探针 `node tools/collect-explore.ts --probe` 之后结论反转：**上游把参数拆成了结构字段，是本项目只声明 4 个字段把其余丢掉了**。探针 200 条实测：

| 字段 | 非空 | 样例 |
|---|---:|---|
| `chaos` | 69 / 200（34.5%） | `5` |
| `stylize` | 47 / 200（23.5%） | `50` |
| `no` | 19 | `["desert, sand, green vegetation, …"]` |
| `exp` | 15 | `60` |
| `weird` | 7 | `8` |
| `sw` | 4 | `250` |
| `seed` | 3 | `2483904851` |
| `quality` / `stop` / `imageWeight` / `params` / `sv` / `pv` / `ev` / `dw` / `batchSize` / `depthRef` / `editRef` / `visibility` | 0 | 字段存在但恒为空 |

## 裁决

### 1. 只加 `stylize` 与 `chaos`

别的字段有值也不加。理由：`stylize` / `chaos` 是**作者主动调审美倾向**的两个旋钮，能回答「社区偏好强风格化还是弱风格化」；`exp` / `weird` / `sw` 覆盖率更低（7.5% / 3.5% / 2%），单独加等于给研究加噪声。`no`（负向提示词）有 19 条，语义上是另一类数据（排除项而非参数），真要研究应另立一步。

### 2. 只接受有限数字，`null` 不折成 `0`

```ts
function numericParam(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
```

`--stylize 0` 是真实取值（关掉风格化）。若把 `null`（作者没写）折成 `0`，两种完全不同的结论就再也分不开，而且不可逆。字符串 `"250"` 也不转数字：上游哪天改了类型，应当在这里暴露，而不是被静默转成看似正常的数。

### 3. 缺失就整键不写

`toExploreJob` 用条件展开写入（`...(stylize === undefined ? {} : { stylize })`），内存对象里就**没有这个键**，不是写个 `undefined` 占位 —— 否则 `'stylize' in job`、`Object.keys()`、`JSON.stringify()` 与 yaml 会各说各话（实测踩到：写 `undefined` 时 `in` 判 true，而 dump 出来又没这个键）。

`js-yaml` dump 对 `undefined` 值同样会整键跳过（实测 `{stylize: 0, chaos: undefined}` → 只剩 `stylize: 0`，往返稳定），所以「快照里没有这个键」= 没记录，有键就是真值。

烘焙进产物时反过来写成 `null`：产物是 JS 字面量，`undefined` 会被丢掉，键消失后无法区分「构建期漏写字段」与「采集没记录」。前端一律用 `typeof x === 'number'` 判有值。

### 4. 界面分两层说

- **单条**：灯箱新增「上游参数」块。有值显示 `--stylize 50`；没值明说「未记录」，不显示 `0`，也不显示 MJ 默认值 `100`。
- **整批**：`param-caveat` 从「参数维度**不可研究**」改为覆盖率陈述，数字**运行时现算**：
  - 有条目有值 → 「本快照 1044 条里 stylize 有值 N 条、chaos 有值 M 条，其余是上游没给值，不是 0」
  - 一条都没有 → 「本快照全部未记录（采集于这两个字段接入之前），不代表社区没写过参数」

旧文案必须消失，这是硬要求 —— 它现在是一句假话。

### 5. 探针样例取首个**非空**值

原实现取首个出现的值，而 `stylize` 首条恰好是 `null`，于是样例永远显示 `null`，回答不了「有值时是数字还是字符串」——而字段类型全靠这一眼。改为首个非空值优先；「存在但恒为空」由已有的 `filled=0` 列表达，不必让样例再复述一遍。

## 未选方案

| 方案 | 为什么不做 |
|---|---|
| 一次补齐 14 个参数 | 11 个恒空；剩下 3 个覆盖率 <8%。加了不产生结论，只增加 schema 面积与断言 |
| `null` 折成 `0` | 把「没写」写成「写了 0」，不可逆 |
| 缺失补 MJ 默认值 100 | 把默认值当作者选择，是最典型的伪造 |
| 覆盖率写死进文案（如 47/200） | 那是探针 5 页口径，不是全量；重采后必漂，等于埋一条假陈述 |
| 只报「出现次数」不报「非空」 | 已实测会误判：只探 1 页时 `stylize` / `chaos` 恰好全 `null`，结论会反转成「上游不给」 |
| 顺带重采 971 条 | 会改快照与批次分布，属独立一步，需单独确认 |

## 后果

- **当前快照整批未记录**（0/1044）。这不是 bug，是采集时间的边界：字段接入前采的数据事后无法补。界面如实标「未记录」，重采后新作业才有值。
- 重采后样本是「新作业有值、老作业没有」，**不能拿有值的子集当全量分布**。做参数分析时必须以 `stylize != null` 为分母。
- 探针的 23.5% / 34.5% 是 200 条单页口径，不能外推到全库。

## 回退

- `shared/types/explore.ts`：删 `stylize` / `chaos` 两字段。
- `tools/collect-explore.ts`：删 `ExploreApiJob.prompt` 的两字段与 `numericParam()`，`toExploreJob` 去掉两行映射；探针的「首非空样例」逻辑可保留（它本身是修 bug）。
- `scripts/build-webui-data.mjs`：删产物里的两行。
- `webui/js/explore-board.js`：删 `paramCoverage()` / `upstreamParamsHtml()` / `paramCaveatHtml()` 及其调用，`param-caveat` 恢复原文案。
- `scripts/verify-webui.mjs`：删「stylize / chaos 只有数字或 null 两种形态」断言，灯箱断言恢复为「不可研究 + 8.2」。
- 数据：无需回退 —— 本轮**没有重采**，`config/explore.yaml` 未变。
