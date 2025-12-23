#!/bin/bash
# 快速启动脚本 (Linux/Mac)

echo "🎨 T恤设计器前端组件包"
echo "========================"

# 检查是否安装了 bun
if ! command -v bun &> /dev/null; then
    echo "❌ 未找到 bun，请先安装 bun: https://bun.sh"
    exit 1
fi

echo "📦 安装依赖中..."
bun install

echo "🚀 启动开发服务器..."
bun run dev
