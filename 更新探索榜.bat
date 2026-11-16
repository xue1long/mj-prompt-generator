@echo off
REM 每日更新探索榜 —— 薄包装，只调单一入口。
REM 用途：挂到 Windows 计划任务（每天一次即可）。
REM
REM 为什么是薄包装：更新流程只有一处定义（scripts/update-explore.mjs）。
REM 本文件此前自己展开 collect -> decompose -> build 三步，漏掉了「烘焙」那一步
REM （build:webui-data），导致新采集的数据永远进不了产物，页面一直是旧数据。
REM 流程改动只改 scripts/update-explore.mjs 一处，这里不用动。
REM
REM 失败行为：采集 / 烘焙 / 构建失败 -> 退出码 1，旧产物保留，页面不会开天窗。
REM LLM 分解失败 -> 只告警不阻断，新作业走灯箱空态，其余数据照常更新。
REM 未配置 LLM 代理时可用 update:explore:no-decompose 跳过分解。

cd /d "%~dp0"

call npm run update:explore
if errorlevel 1 (
  echo.
  echo 更新失败：保留原有数据与产物，已退出。
  exit /b 1
)

echo.
echo 完成。dist\index.html 已更新。
exit /b 0
