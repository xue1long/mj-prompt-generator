# 探索榜图片详情支持提示词结构分解（构建期 LLM 预生成 + 灯箱内固定结构展示）

把 `mj-prompt-decompose` 技能（第三章七段式方法论）的分解能力，固化进探索榜的图片详情弹框：点开任一作业，原始提示词下方多一个「提示词结构解析」折叠区，用固定结构展示该提示词的七段式拆解、构图五法、词库打标、铁律/误区体检与中文速读。

## 决定

- **落点**：分解结果放在 `ExploreLightbox.vue` 右侧信息区、「原始提示词」区块**下方**的常驻折叠区（`<details>` 默认收起，点击展开）。不动现有布局、不动卡片网格（`ExploreCard.vue`）。
- **算力位置**：构建期（采集之后、build 之前）用 LLM 预生成，**不**在浏览器运行时调 LLM。理由：本应用是纯前端离线 SPA（`configLoader.ts` 注释明确「运行时不发起任何请求，dist 可双击打开」），运行期既无后端也无 LLM 客户端，且密钥不能进浏览器。
- **LLM 来源**：用户自建的 **OpenAI 兼容代理**（决定 ADR-0015 选此）。工具用原生 `fetch` 直打 `${MJ_DECOMPOSE_BASE_URL}/v1/chat/completions`，**不引入 openai SDK**，零新增依赖。密钥走环境变量（`.env`，gitignore），不进仓库。
- **模型档位**：强模型（Opus/Sonnet 级），分解质量对齐 `mj-prompt-decompose` 技能的「完整版」——含铁律体检、构图五法识别、情感词判定、中文速读。代价是首次全量 942 条成本较高、跑得慢。
- **覆盖范围与节奏**：**增量**。首次运行分解全部 942 条（一次性成本）；之后每次采集只分解「自上次以来新增的 job id」。这样日常采集几乎零新增成本、不会触发限流。支持 `--all` 强制全量重算（版本升级或补数据时用）。
- **数据边界**：分解是**派生数据**，存独立文件 `config/explore-decomposed.yaml`（按 `jobId` 关联），**绝不写进 `explore.yaml`**——采集脚本 `collect-explore.ts:826` 整体覆盖重写 `explore.yaml`，写进去下次采集即丢失。派生文件缺失时灯箱自动退化为只显示原始提示词（不报错、不空白）。
- **构建期内联**：在 `scripts/yamlConfigPlugin.ts` 增加第 5 个虚拟模块 `EXPLORE_DECOMPOSED_CONFIG`（沿用 `readOptional` 语义：文件不存在则 `null`）。`configLoader.ts` 暴露 `getExploreDecomposedConfig()`；`exploreStore.ts` 加载后建成 `Map<jobId, ExploreJobDecomposition>`，灯箱按 `job.id` 查询。
- **固定结构（schema）**：LLM 返回严格 JSON，由灯箱确定性渲染。字段如下（完整 TypeScript 类型见 `types/explore.ts` 新增的 `ExploreJobDecomposition`）：

  ```text
  ExploreJobDecomposition {
    jobId: string
    schemaVersion: 1
    methodologyVersion: 'v8.2'        // 与技能基线一致；升级方法论时据此判断是否需 --all 重算
    framework: '人物画像' | '物体描述' | null
    segments: PromptSegment[]         // 七段式：①主体 ②动作状态 ③细节环境 ④构图镜头 ⑤光线色彩 ⑥风格审美 ⑦参数尾
    composition: string[]             // 命中的构图五法（rule of thirds / 留白 / 中心对称 / 引导线 / 框架构图），未命中为空
    tags: {                           // 词库打标（确定性关键词命中，LLM 标出命中的词）
      style: string[]
      lighting: string[]
      angle: string[]
      emotion: string[]
    }
    paramTail: {                      // 参数尾：text 为原文片段，params 由确定性解析（--ar/--s/--v/--style/--no 等）
      text: string
      params: { name: string; value: string }[]
    }
    health: HealthCheck[]             // 铁律/误区体检：R1~R5 铁律 + M1~M? 常见误区，ok=false 标红
    summary: string                   // 中文速读（一句话）
    model: string                    // 实际生成所用模型，便于追溯
    generatedAt: string              // ISO 时间戳
  }
  PromptSegment { code: '1'|'2'|'3'|'4'|'5'|'6'|'7'; module: string; text: string; note?: string }
  HealthCheck  { id: string; ok: boolean; note?: string }
  ```
- **灯箱渲染结构**（折叠区展开后自上而下）：框架判定徽标 → 七段式表格（段号｜模块｜命中片段｜备注）→ 构图五法 chips（空则显示「未命中」）→ 词库打标 chips（风格/视角灯光/情感，分组）→ 参数尾（有则列出 `--ar` 等）→ 铁律/误区体检（逐条，违规标红）→ 中文速读。
- **与技能单一来源**：`tools/decompose-explore.ts` 的分解提示词直接复用 `mj-prompt-decompose/SKILL.md` 的方法论（七段式 + 两套框架 + 构图五法 + 词库 + 铁律 + 误区）。技能是「人读/深学」入口，构建工具是「批量固化」入口，两者共享同一套方法论文本，避免漂移。
- **流水线接线**：`更新探索榜.bat` 改为「采集 → 分解 → 构建」三步；`package.json` 的 `update:explore` 同步改为 `collect:explore && decompose:explore && build`，新增 `decompose:explore` 脚本（沿用 `node tools/decompose-explore.ts`）。

## 考虑过的选项

- **浏览器内规则解析（不调 LLM）**：零成本、离线、瞬时、全 942 条可用。但只能做到「标准版」（七段分段 + 参数尾 + 关键词打标），做不了完整版的铁律体检/构图五法/情感词判定（这些是真·LLM 软判断）。用户明确要「完整版对齐技能」，故否决；保留为未来无网环境下的降级方案。
- **直接把分解写进 `explore.yaml`**：最省事，但 `collect-explore.ts` 每次采集整体覆盖重写该文件，分解数据次日即丢失。否决，改为独立派生文件。
- **每次采集都全量重算 942 条**：实现简单，但每日 942 次 LLM 调用必然触发限流/烧钱，且绝大多数作业是历史重复。否决，改为增量（仅新增 job）。
- **浏览器运行时调 LLM**：能做到最新，但破坏「离线双击即用」前提、暴露 API 密钥、且本应用无任何后端。否决。
- **构建期用 WorkBuddy 里的我（Agent）来生成**：质量最高，但 `更新探索榜.bat` 在 Node/Windows 下独立跑，调不到 WorkBuddy 会话；且无法纳入无人值守的每日计划任务。否决，改为独立调用用户自建代理。
- **引入 openai SDK 依赖**：类型友好，但多一个依赖与版本约束；用户代理是 OpenAI 兼容协议，原生 `fetch` + JSON 足矣。否决，零依赖。

## 后果

- **新增构建期依赖（外部）**：每日采集链路多了一个外部调用点（你的 LLM 代理）。代理不可达时 `decompose:explore` 应**失败即中止**（不写派生文件、不影响已有快照），不应让 `update:explore` 把页面搞坏。
- **新增环境变量与 `.env`**：`MJ_DECOMPOSE_BASE_URL` / `MJ_DECOMPOSE_API_KEY` / `MJ_DECOMPOSE_MODEL`。需把 `.env` 加进 `.gitignore` 并提供 `.env.example`。密钥绝不进仓库。
- **首次运行成本**：全量 942 条强模型调用，可能耗时数分钟到十几分钟（受代理并发与速率限制）。用 `--limit` 可先小批量验证，再放开。
- **派生文件进构建产物**：`explore-decomposed.yaml` 内联进 `dist`，体积随作业数增长（纯文本 JSON，可控）。文件缺失时灯箱优雅降级为仅原始提示词。
- **方法论升级需重算**：若 `mj-prompt-decompose` 的方法论升级（如到 V8.3），旧分解的 `methodologyVersion` 仍是 `v8.2`；工具按 `methodologyVersion` 差异识别过期项，`--all` 可全量刷新。
- **新增文件清单**：`tools/decompose-explore.ts`（新）、`config/explore-decomposed.yaml`（生成物）、`.env.example`（新）；改动：`scripts/yamlConfigPlugin.ts`、`src/utils/configLoader.ts`、`src/stores/exploreStore.ts`、`src/components/Explore/ExploreLightbox.vue`、`src/types/explore.ts`、`package.json`、`更新探索榜.bat`、`.gitignore`、`mj-prompt-decompose/SKILL.md`（补一句「构建工具复用此方法论」）。

---

## 修订 2026-11-07：新增「会话内逐条精拆」质量覆盖层

**背景**：`.env` 与代理密钥始终未提供，构建期 LLM 链路无法运行；为让 942 条都有结构区，先用 `tools/rule-decompose.mjs` 生成了 939 条确定性规则解析。用户验收后明确要求「逐条精拆」，即不接受规则版在框架判定、构图法归属、体检理由与中文速读上的降级。

**决策**：新增一条**与构建期链路并行的会话内精拆通道**，不改动上面任何构建期约定。

| 项 | 决定 |
|---|---|
| 算力 | WorkBuddy 会话内的 Agent 逐条读原文，按 `mj-prompt-decompose/SKILL.md` 第四节「完整版工作流」判断 |
| 节奏 | 分片 + 断点续跑。每批 25 条写入 `config/decompose-parts/part-NNN.json`，分片文件本身即断点，无需 progress 文件 |
| 工具 | `tools/fine-decompose.mjs`（`--status` / `--next N` / `--batch K` / `--ids`）、`tools/merge-fine-parts.mjs`（契约校验 + 质量守门 + 合并） |
| 优先级 | `手工精拆 > 逐条精拆 > 规则兜底`，按 `jobId` 覆盖；未覆盖的条目继续显示规则版，不出现空白 |
| 质量守门 | 合并前强制校验：七段 note ≥4 条具体理解、体检 note ≥6 条具体理由、中文速读不得是词表拼接。防止把规则模板伪装成精拆 |
| 展示 | 灯箱结构区按 `decomposition.model` 显示来源徽章（手工精拆 / 逐条精拆 / 规则解析），免责说明同步显示实际分解方式 |

**与第 52 行的关系**：第 52 行否决的是「**构建期**自动调用会话里的 Agent」——`.bat` 在 Node/Windows 下独立运行、无人值守，确实调不到会话，该判断**依然成立**。本修订是会话内的人工质量覆盖层，产物落盘供构建期内联，不接入每日采集链路，两者不构成冲突。

**仍未变更**：`decompose-explore.ts` 的增量判据仍是 `jobId + schemaVersion + methodologyVersion`。日后若填了 `.env` 跑 API，已精拆的条目不会被重算；要强制覆盖需 `--all`。方法论基线升级到 V8.3 时同理。
