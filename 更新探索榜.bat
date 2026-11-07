@echo off
REM 每日更新探索榜：采集 Midjourney 探索榜 -> 生成快照 -> 分解新增提示词 -> 重新构建
REM 用途：挂到 Windows 计划任务（每天一次即可）。
REM 失败时保留上一份快照、旧图与旧分解数据，不会让页面开天窗。

cd /d "%~dp0"

echo [1/3] 采集探索榜...
call npm run collect:explore
if errorlevel 1 (
  echo 采集失败：保留原有数据，退出。
  exit /b 1
)

echo [2/3] 分解新增作业的提示词...
call npm run decompose:explore
if errorlevel 1 (
  echo 分解失败：保留上一份分解数据，退出。
  echo 请检查 .env 里的 MJ_DECOMPOSE_BASE_URL / MJ_DECOMPOSE_API_KEY / MJ_DECOMPOSE_MODEL。
  exit /b 1
)

echo [3/3] 重新构建...
call npm run build
if errorlevel 1 (
  echo 构建失败。
  exit /b 1
)

echo 完成。dist\index.html 已更新。
exit /b 0
