# 摄影词库单一来源在 config/prompts.yaml，技能包只持有导出快照

本项目要产出一个给 agent 用的 Midjourney 提示词写作技能包。GUI 侧已经有 156 条摄影术语词库（`config/prompts.yaml`），技能包需要同一份词库。决定：`config/prompts.yaml` 是摄影术语的唯一来源；技能包不复制词库，而是由 `tools/export-vocab.ts` 导出为 `skills/midjourney-prompt-writing/references/vocab-photography.md` 的静态快照（带快照日期），并由 `tests/export-vocab.test.ts` 守住"导出产物与 YAML 同步"这条不变量。技能包源码同样放在本仓库 `skills/` 下，通过 `skills install --local` 进入共享技能库，再分发到各个 agent。

## 考虑过的选项

- 在技能包里手写一份词库：两份词表会各自漂移，同一个术语出现两种英文写法，agent 拿到哪份算哪份。
- 让技能在运行时去读仓库的 YAML：技能必须能脱离本仓库独立分发到各个 agent，运行时读不到仓库。
- 技能只覆盖风格/方法论、不覆盖摄影术语：写提示词时最常用的恰恰是摄影术语，技能不能没有这一层。
- 把词库改成两份 YAML（一份给 GUI、一份给技能）：等于把"单一来源"改成"两处手工同步"，问题只是被挪了个位置。

## 后果

- 改了 `config/prompts.yaml` 必须跑 `npm run export:vocab`，否则 `npm test` 会失败（这是故意的——它就是那条不变量的守门人）。
- 生成物与手写物必须分文件：`vocab-photography.md` 是生成物，`vocab-style.md` 是手写。混在一个文件里，导出就会覆盖手写内容，而且人一眼看不出哪段是机器产的。
- `tools/` 目录归根工程（`tsconfig.json`）管，`scripts/` 归 `tsconfig.node.json` 那个项目引用管。导出脚本放 `tools/` 是因为测试要 import 它——同一个文件被两个项目同时拥有会触发 TS6305（引用项目产物未构建）。
- 技能包进共享库后是 `source_type: local`，`skills update` 不会自动更新它。要升级技能就改本仓库的 `skills/` 再重新 `skills install --local`。
