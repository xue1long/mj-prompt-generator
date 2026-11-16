# ADR-0030：资料库真相源改为项目文件（落盘 + 烘焙）

> **状态**：accepted（2026-11-13）
> **决策来源**：grill-with-docs 第 3–4 轮，用户「按你推荐选择」（Q1–Q7 全按推荐默认值）
> **部分取代**：[ADR-0029](0029-materials-library-as-top-level-view.md) —— 只替换存储层；视图、术语、异质性判据、去重、筛选与导出边界继续有效
> **配套**：`docs/资料库落盘烘焙实施方案.md`（实施清单与验证矩阵）、`CONTEXT.md`、`README.md`

## 决定

资料库的**真相源**从「浏览器 IndexedDB」移到**项目文件**：

- 条目：`data/materials/items/<id>.json`，一条一文件，**入库**；删除用 `<id>.deleted.json` 墓碑。
- 配图：`public/materials/<id>_<n>.webp`，统一 640px / q80，**入库**，文件名由服务端生成。
- **写**：`npm run dev` 下的本机 `/api/materials`（复用 `serve-webui.mjs` 的 `/api/settings` 范式）；CLI `npm run import:materials -- <清单.json> <图片目录>` 作批量兜底，与 HTTP 共用同一份写入函数。
- **读**：`scripts/build-materials-data.mjs` 烘焙出 `webui/js/data-materials.js`，由 `<script>` 同步加载 —— 与 `data-explore.js` 同构，**运行时不 fetch 数据**。
- **浏览**：`file://` 双击仍可浏览 / 筛选 / 导出，但资料库**只读**；编辑需 `npm run dev`。

一句话：不改「双击即用」，改的是「双击时能不能写」。

## 为什么难逆转

1. **撤销了刚 accepted 的破例**。ADR-0029 把 `blob:` 配图写成「配图命名空间唯一」的第一个例外，并同步改了 `CONTEXT.md` 与 `verify-webui.mjs:1341` 的豁免。本 ADR 收回该例外，恢复 `../public/` 唯一前缀。两次架构口径翻转必须留痕，否则下一个人会从代码里读出矛盾。
2. **重定义了 Q5 的定位**。Q5「保持 `file://`」原本被实现成「双击即可编辑」。现在明确为「双击只读 / 服务可写」——这是用户可见的工作流变化，不是内部重构。
3. **确立了 git 同步粒度**。一条一文件 + 墓碑是为了把多设备合并冲突缩到「同一条目被同时改」，且「A 删 B 改」不会让条目复活。改成单个 `materials.json` 会静默放大冲突面。

## 理由链

| 环节 | 依据 |
|---|---|
| 第一性 | 数据要抗「换设备 / 清站点数据」，必须**离开浏览器 origin** 成为真实文件。`persist()` / OPFS 都还在 origin 内，救不了这两种丢失（联网检索 + 本机 `file://` 实测） |
| 系统层 | 项目已有单一数据主线 `config/*.yaml → build:webui-data → webui/js/data-*.js → 静态前端只读`；资料库并入这条线 = 单一真相源，留在 IndexedDB + 外部备份 = 第二套平行体系 |
| 不推翻的约束 | ADR-0022:23 精确措辞禁的是「同一产物在 `file://` 下运行时按需读文件」，不是「项目不许有服务」。`npm run dev` / `preview` 自 ADR-0017 起就存在，Node 内置 http、只绑 127.0.0.1 |
| 既有先例 | `serve-webui.mjs:129-215` 的 `/api/settings` 写 `.env`，含 Origin 白名单 / 字段白名单 / 8KB 上限 / 备份回退；`core.js:1137` 用 `location.protocol === 'file:'` 做只读降级 |
| Q1 裁决 | 服务写接口为主、CLI 兜底；两者共用 `scripts/materials-api.mjs`，禁止两套落盘逻辑 |
| Q3 裁决 | 配图入库，落盘时用项目已有的 `sharp` 压成 640px / q80（对齐 `collect-explore.ts:437-447` 的 mid 档）。这改写了 ADR-0029「只存原始 Blob」的承诺 |
| Q7 裁决 | ADR-0029 部分取代，本 ADR 取 0030；LLM 凭据草案顺延 0031 |

## 具体落地

| 项 | 内容 |
|---|---|
| 新增 | `scripts/build-materials-data.mjs`（扫描 / 校验 / 两阶段烘焙）、`scripts/materials-api.mjs`（落盘 + 原子写 + 压缩 + HTTP handler）、`scripts/import-materials.mjs`（CLI）、`webui/js/materials-api.js`（前端读产物 + 写接口客户端）、`webui/js/data-materials.js`（生成物）、`data/materials/README.md` |
| 删除 | `webui/js/materials-store.js`（IndexedDB `mj-materials` 版）。**不主动删用户浏览器里的旧库** —— 浏览器无权替用户清数据，只在 README 注明它已成无引用的遗留库 |
| 改动 | `serve-webui.mjs`（+1 import、+1 路由分支）、`webui/index.html`（+1 数据产物 script、换模块名）、`webui/js/materials-view.js`（数据源 / 图片路径 / 写路径 / 只读禁用）、`webui/css/app.css`（只读提示条）、`.gitignore`（`data/` → `data/*` + `!data/materials/`）、`package.json`（两个 script）、`scripts/verify-webui.mjs`（第 11 组改只读版、新增第 12 组 http 端到端） |
| 零改动 | `webui/js/workbench.js` —— 实测它只调 `MATERIALS_VIEW` 的 8 个方法，签名未变；`research-store.js` 零改动；`scripts/build-webui.mjs` 守门零改动（新产物自带 `../public/` 引用） |

### 易漏的三个系统级约束

1. `.gitignore:34` 原为 `data/` 整目录忽略。**保留整行再加 `!data/materials/` 无效**（父目录被忽略时 negation 不生效），必须改成 `data/*` 再放行。已用 `git check-ignore` 实测。
2. `npm run preview`（`--dist`）服务的是复制产物，而烘焙只写 `webui/js/`。**放开会写造成「盘上数据已更新、页面还是旧产物」的假象**，故 handler 在 `useDist === true` 时对所有非 GET 返回 403。
3. 读路径没有任何 fetch。烘焙产物用 `<script>` 同步加载，与 `data-explore.js` 完全同构，因此不违反 ADR-0022:23。

### 刻意不复用 `build-webui-data.mjs`

不是「嫌它慢」，是**契约不同**：`:59-61` 强制三份 config 齐全、`:244/:256` 按 `r.jobs` / `r.entries` 二分硬编码、`:262` 要求 `total > 0`，而资料库允许为空、目录可不存在、每次编辑都要增量跑。把它改造成「用户可空、高频增量写」会污染它原本「构建期全量校验、不杜撰」的守门语义。代价只有约 10 行 `render()` 模板重复，**刻意接受**。

### 去重口径的修正（实施期发现）

Q11 判据是「规范化提示词 + 图片文件名集合」，但落盘后的文件名由**服务端生成**，不再是清单里的原始名 —— 服务端无法复现这个判据。因此去重统一放在**导入侧**（GUI 的 `addEntries()` 与 CLI 的 `seen` 集合，都用 `originalNames`），服务端 `saveItem()` 不做隐式跳过。`dedupeKey` 在两侧各有一份等价的 5 行纯函数：为 5 行引入跨 classic-script / ESM 的模块系统是净增复杂度。

### 与实施方案的两处等价简化（登记，不是遗漏）

1. **墓碑**：方案写「`<id>.deleted.json` 独立文件」，实现是「删除时删 `<id>.json` + 写 `<id>.deleted.json`，烘焙时墓碑优先」—— 语义等价，且避免条目 JSON 残留在盘上。
2. **图片挂载**：方案写「POST /images 只落盘、再由前端提交条目」，实现改为「一次 POST 完成压缩 + 落盘 + 挂到条目 + 烘焙」，少一次往返、少一个「图在盘上但没人引用」的中间态。
3. **CLI 清单格式**：只支持 JSON（数组或 `{items:[...]}`）+ 图片目录；CSV / Markdown 解析只存在于 WebUI，不为 CLI 复制第二份解析器。

## 考虑过的选项

| 选项 | 否决理由 |
|---|---|
| `navigator.storage.persist()` / OPFS | 仍在 origin 存储桶内，换设备无解；本机 `file://` 实测 `persist() === false` |
| 完整备份包（JSON 内嵌 base64）/ FSA 目录句柄 | 能解决「会丢」，但留下「IndexedDB 主 + 文件副」两套副本，长期要自己维护同步与冲突；FSA 还限 Chromium、每次会话可能要重新授权 |
| 改单文件 `materials.json` | git 冲突面大；`build-webui-data.mjs` 的既有契约会被污染 |
| 云端后端 / 账号同步 | 与 `file://` 零依赖硬约束冲突 |
| 完全放弃 `file://`、只保留服务模式 | 不必要。`dist/` 双击仍可完整浏览七个视图，只读降级只影响「写」 |

## 后果

- **ADR-0029 部分取代**：其 `:26` 破例、`:28` 固有代价、`:39` Q5 落地、`:45-67` 存储层、`:87` 否决理由、`:122` 不做清单中的对应条目，只作历史记录。
- **`CONTEXT.md`** 删除 `blob:` 例外条款、恢复配图命名空间唯一，补资料库术语（真相源是项目文件）与「烘焙」术语。
- **`README.md`** 修正「存本机 IndexedDB / 不联网、不上传」两处已失效陈述，新增编辑工作流。
- **`.gitignore`**：`data/materials/` 与 `public/materials/` 入库 ⇒ 换设备靠 `git clone` 即可带走资料与配图；代价是仓库体积随资料增长（Q3 已用 640px/q80 压缩兜底）。
- **安全面扩大**：从纯静态变成有写接口。仅绑 127.0.0.1 + Origin 白名单 + 20MB 体上限 + 字段白名单 + 文件名白名单 + 路径前缀校验，六项缺一不可。
- **`file://` 下看不到刚编辑的内容**：产物是上一次烘焙的快照，只读态顶部明确标注，不制造「数据丢了」的错觉。

## 验证记录（2026-11-13）

| 项 | 结果 |
|---|---|
| `tests/materials.test.ts` | **22/22 通过**（原 18 例 + 落盘契约 4 例） |
| `npm test`（收集守卫 20 文件全收集） | 388 用例 / **384 通过、4 失败**；4 个失败全在 `candidateVocab.test.ts`（写死 971 条旧快照，现 1012 条），与本次改动正交 |
| `npm run build` | 通过；`dist/` 35 文件 / 27 JS；命名空间守门通过；`diff -rq webui dist` 差异 0 |
| `npm run verify`（源码） | **179/181**；第 11 组只读版 12 条、第 12 组 http 端到端 13 条全过（含条目/图片真实落盘、烘焙刷新、`../public/materials/` 图片 `naturalWidth>0`、跨 Origin 403、preview 只读守门 2 条、精确清理） |
| `verify --dist` | **179/181**，同源 2 红 |
| 既有红 | 「拆解缺口归零」「拆解来源分层」因今天 15:01 采集后 41 条新作业无拆解而失败；`candidateVocab.test.ts` 4 例同因语料基线漂移。**均未代改** |

## 明确不做的事

- 不做云端同步 / 账号 / 多用户 / 实时协同；不做 `file://` 下的运行时 fetch。
- 不做图片前档/大图两档重编码（落盘时只压一档 640px/q80）；不做 Git LFS、不做容量自动清理。
- 不做七段拆解、四格补齐、转研究样本、LLM；资料库与研究样本库仍**永久隔离**。
- 不自动删除用户浏览器里遗留的 `mj-materials` IndexedDB 库。
- 不改每日采集链、拆解链、`config/explore.yaml` 与 `public/explore/` 目录结构。
- 不生成可分享的资料库深链（条目没有引用键）；导出仍只带图片文件名、不含二进制。
