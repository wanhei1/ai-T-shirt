@echo off
rem 快速启动脚本 (Windows)

echo 🎨 T恤设计器前端组件包
echo ========================

rem 检查是否安装了 bun
where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未找到 bun，请先安装 bun: https://bun.sh
    pause
    exit /b 1
)

echo 📦 安装依赖中...
bun install

echo 🚀 启动开发服务器...
bun run dev
