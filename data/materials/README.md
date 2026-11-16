# 资料库真相源

这里是**资料库的数据真相源**（ADR-0030），与研究样本库的 `config/*.yaml` 同级：

- `items/<id>.json` —— 一条资料条目一个文件。一条一文件是为了让多设备 git 合并的冲突面缩到「同一条目被同时修改」。
- `items/<id>.deleted.json` —— 删除墓碑。烘焙时优先于同名条目，避免「A 删了、B 又改了」把条目复活。
- `../../public/materials/*.webp` —— 配图，统一 640px / q80，文件名由服务端生成，客户端不可控。

## 不要手改

浏览器端的 `webui/js/data-materials.js` 是**构建期烘焙产物**（`npm run build:materials`），不是数据源。
编辑请在 WebUI 里做：

```bash
npm run dev        # http://127.0.0.1:5173/ ，资料库可编辑
```

以 `file://` 双击打开 `dist/index.html` 时资料库是**只读**的 —— 能浏览、筛选、导出，不能增删改。
每次编辑成功后，写接口会自动重跑烘焙；若烘焙失败，界面会明确提示手动补跑，不会静默假装保存成功。

## 手工 / 批量导入

```bash
npm run build:materials                     # 只重烘焙
node scripts/import-materials.mjs <清单> <图片目录>
```

## 入库说明

`.gitignore` 里 `data/*` 忽略本地采集产物，但 `!data/materials/` 放行本目录 —— 这些文件**要进版本库**，
换设备靠 `git clone` 就能把资料与配图带走。`public/materials/` 同样入库。
