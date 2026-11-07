# 版本兼容关系写进 YAML，而不是写进代码

同一个参数在不同 Midjourney 版本下的可用性与取值范围并不相同：`--q` 只在 V6/V7 存在且 V7 取值为 1/2/4，`--oref`/`--ow` 只在 V7 存在，`--hd`/`--sd` 只在 V8.1+ 存在，`--iw` 在 Niji 7 的上限是 2 而在 V7/V8.1 是 3。决定把这些关系表达在 `config/parameters.yaml` 里（`versions` / `optionsByVersion` / `defaultByVersion` / `rangeByVersion`），由 `src/utils/parameterCompat.ts` 负责解释，代码中不出现任何版本 × 参数的硬编码矩阵。

## 考虑过的选项

- 代码里维护一张兼容矩阵：数据被拆到两处，参数一多就会漂移。
- 不做联动，只在界面上提示：用户仍然能把无效参数勾选进最终提示词，问题没被解决。

## 后果

- YAML 的 schema 变复杂，需要测试守住"配置里引用的模型版本都存在"这一条不变量。
- 新增参数时，忘记写 `versions` 就等于默认在所有版本可用——这是刻意的默认值：多数参数确实是全版本通用。
