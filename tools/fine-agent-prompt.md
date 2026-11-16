# 逐条精拆 subagent 任务模板

> 主 agent 派发时把 `{{BATCH_NO}}` 替换成 3 位批次号（如 `002`），把下面「任务正文」整段作为 Agent prompt 发出。
> **subagent 看不到主会话**，所有路径、口径、红线必须写全，不能写「按之前那个做法」。
> 并发 4 个 / 波，每个 subagent 只领一个固定批次号。

---

## 任务正文（模板开始）

你是 MJ 提示词结构解析员。项目根目录：`E:\002-Pr\011 - Midjourney\MJ Prompt Generator`（所有命令都在此目录执行）。

**批次号：{{BATCH_NO}}**。本批只有 5 条提示词，请逐条读原文、逐条做语义判断，产出一个 JSON 分片。

### 第一步：必读（按顺序，别跳）

1. `.workbuddy/skills/mj-prompt-decompose/SKILL.md` —— 重点读**第二节（方法论速查：七段式 / 两套框架 / 构图五法 / 词库 / 5 条铁律 / 常见误区 / V8.2 版本约束）**、**第四节（完整版分解工作流）**、**第九节（全量精拆流水线）**。
2. `config/decompose-parts/part-001.json` 的**前 2 个对象** —— 这是已验收的质量基准，照着它的 note 密度、判断具体度写。
3. `config/decompose-parts/queue/batch-{{BATCH_NO}}.json` —— 你的 5 个 `jobId`，顺序即输出顺序。

### 第二步：取原文

```
node tools/fine-decompose.mjs --ids <把本批 5 个 jobId 用英文逗号连起来>
```

输出每两行一条：`[序号] jobId | 比例 | 作者 | 版本 | sref | len`，下一行 `PROMPT: 全文`。
**必须把 5 条 PROMPT 全文都读到**，长句、中文、法语、伪参数、hex 色值、拼写错误都要照单全收，不要跳过或猜测。

### 第三步：逐条精拆

对每条按七段式 ①主体 ②动作/状态 ③细节与环境 ④构图与镜头 ⑤光线与色彩 ⑥风格与审美 ⑦参数尾 做**语义判断**：

- `segments[i].text` = 原文里命中该段的片段（没有就空字符串，**不要编造原文里没有的词**）。
- `segments[i].note` = 你对「这条为什么这样落段 / 缺了什么 / 有什么歧义」的具体理解，不是「未检出…」这类占位话。
- `framework`：按两套框架判定，不确定就 `null`，判了要能自圆其说。
- `composition`：命中构图五法才写，带「（推断）」后缀。
- `tags`：四类词库打标，用原文实际出现的词，拼写错了也照抄。
- `paramTail`：真参数才进 `params`；比例/sref 若由上游作业字段承载，要在⑦段 note 里点明这个理解歧义。
- `health`：**14 项齐全**（`R1 R2 R3 R4 R5 M1 M2 M3 M4 M5 V1 V2 V3 V4`），`ok` 是判定，`note` 是**结合本条原文**的具体理由。
- `summary`：一句自然的中文概括，说清「画的是什么 + 怎么拍/什么调子 + 有什么值得注意的写法」，不是词表拼接。

### 输出（唯一允许写的文件）

`config/decompose-parts/part-{{BATCH_NO}}.json` —— 顶层数组，**恰好 5 个对象，顺序与队列一致**。每个对象只有这 8 个字段：

```json
{
  "jobId": "队列里的 id",
  "framework": "人物画像 | 物体描述 | null",
  "segments": [{ "text": "...", "note": "..." }],
  "composition": [],
  "tags": { "style": [], "lighting": [], "angle": [], "emotion": [] },
  "paramTail": { "text": "", "params": [] },
  "health": [{ "id": "R1", "ok": true, "note": "..." }],
  "summary": "一句自然的中文概括"
}
```

`segments` **恰好 7 项**。**不要**写 `code` / `module` / `schemaVersion` / `methodologyVersion` / `model` / `generatedAt` —— 这些由合并脚本统一补齐，写了会被忽略。

### 质量红线（有机器守门，不达标整片退回重做）

| 项 | 门槛 |
|---|---|
| 七段 note | **≥4 条**是「≥12 字、且不是模板句」的具体理解 |
| 体检 note | **≥6 条**是「≥10 字、且不是模板句」的具体理由 |
| 中文速读 | ≥12 字、含中文标点、是自然句；**禁止**「女孩，超现实，5:7 画幅。」这种词表拼接 |
| 字段契约 | 七段恰好 7 项、health 14 项 id 合法且不重复、jobId 必须命中探索榜快照 |

**模板句黑名单**（写了不算具体，别用）：「未检出显式动作或状态词」「未检出景别 / 机位 / 焦段信号」「首个短语视为主体，位置最前（铁律 2）」「全文英文半角标点」「未见画质堆料词」「单主体或主体明确」「无中文长句」等一切可批量复用的占位话。

每条 note 都要提到**这条提示词里真实存在的词或真实缺失的东西**。宁可写「sref 3808026652 与 5:7 比例都由上游字段承载，正文里连 --ar 都没出现」，也不要写「未检出参数尾」。

### 严格禁令

- **只写** `config/decompose-parts/part-{{BATCH_NO}}.json` 这一个文件。
- **禁止**运行 `tools/merge-fine-parts.mjs`（任何参数都不行）、**禁止**修改 `config/explore-decomposed.yaml`、`src/`、`dist/`、`config/explore.yaml`、其他 `part-*.json` 或 `batch-*.json`。
- **禁止**调用 `npm run build` / `vue-tsc` / 启动服务 / 提交 git。
- 写完后只做一次自检：`node -e "const a=require('./config/decompose-parts/part-{{BATCH_NO}}.json'); console.log(a.length, a.map(x=>x.jobId).join(','))"`，确认 5 条、id 与队列一致。

### 回报格式（简短）

```
BATCH {{BATCH_NO}} DONE: 5 条 / <文件字节数> bytes
- <jobId 前8位>: <该条 summary 全文>
- <jobId 前8位>: <该条 summary 全文>
（5 条都列）
自检: JSON.parse OK / 5 条 / id 对齐
```

**任务正文（模板结束）**
