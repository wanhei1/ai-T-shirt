# T恤设计师项目 - PR合并脚本 (PowerShell版本)
# 使用方法: .\merge-pr.ps1 PR_NUMBER

param(
    [Parameter(Mandatory=$true)]
    [int]$PRNumber
)

# 颜色函数
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Green { Write-ColorOutput Green $args }
function Write-Yellow { Write-ColorOutput Yellow $args }
function Write-Red { Write-ColorOutput Red $args }
function Write-Blue { Write-ColorOutput Blue $args }

Write-Blue "🔄 正在处理 PR #$PRNumber..."

try {
    # 确保在main分支
    Write-Yellow "📍 切换到main分支..."
    git checkout main
    if ($LASTEXITCODE -ne 0) { throw "切换到main分支失败" }

    # 拉取最新代码
    Write-Yellow "⬇️ 拉取最新代码..."
    git pull origin main
    if ($LASTEXITCODE -ne 0) { throw "拉取最新代码失败" }

    # 获取PR
    Write-Yellow "📥 获取 PR #$PRNumber..."
    git fetch origin pull/$PRNumber/head:pr-$PRNumber
    if ($LASTEXITCODE -ne 0) { throw "获取PR失败" }
    
    git checkout pr-$PRNumber
    if ($LASTEXITCODE -ne 0) { throw "切换到PR分支失败" }

    Write-Green "✅ PR信息:"
    git log --oneline pr-$PRNumber ^main

    Write-Host ""
    Write-Green "📊 文件更改统计:"
    git diff --stat main..pr-$PRNumber

    Write-Host ""
    Write-Green "📝 详细更改:"
    git diff main..pr-$PRNumber

    Write-Host ""
    Write-Yellow "🤔 是否要合并此PR？"
    Write-Blue "输入选项:"
    Write-Host "  " -NoNewline; Write-Green "y" -NoNewline; Write-Host " - 是，合并PR"
    Write-Host "  " -NoNewline; Write-Green "t" -NoNewline; Write-Host " - 先测试，再决定"
    Write-Host "  " -NoNewline; Write-Red "n" -NoNewline; Write-Host " - 否，取消合并"

    $choice = Read-Host "请选择 (y/t/n)"

    switch ($choice.ToLower()) {
        "t" {
            Write-Yellow "🧪 启动测试模式..."
            Write-Blue "💡 请手动测试功能，测试完成后："
            Write-Host "  - 如果测试通过，运行: " -NoNewline; Write-Green "git checkout main && git merge pr-$PRNumber && git push origin main"
            Write-Host "  - 如果测试失败，运行: " -NoNewline; Write-Red "git checkout main && git branch -D pr-$PRNumber"
            Write-Host ""
            Write-Yellow "🚀 启动开发服务器进行测试..."
            bun run dev
        }
        "y" {
            Write-Green "✅ 正在合并 PR #$PRNumber..."
            
            # 切换到main分支
            git checkout main
            if ($LASTEXITCODE -ne 0) { throw "切换到main分支失败" }
            
            # 合并PR
            git merge pr-$PRNumber
            if ($LASTEXITCODE -ne 0) { throw "合并PR失败" }
            
            # 推送到远程
            Write-Yellow "📤 推送到远程仓库..."
            git push origin main
            if ($LASTEXITCODE -ne 0) { throw "推送失败" }
            
            # 清理本地分支
            Write-Yellow "🧹 清理本地分支..."
            git branch -d pr-$PRNumber
            
            Write-Green "🎉 PR #$PRNumber 已成功合并！"
            Write-Blue "📝 不要忘记在GitHub上关闭PR（如果没有自动关闭）"
        }
        default {
            Write-Red "❌ 合并已取消"
            git checkout main
            git branch -D pr-$PRNumber 2>$null
            Write-Yellow "🧹 已清理临时分支"
        }
    }
}
catch {
    Write-Red "❌ 错误: $_"
    Write-Yellow "🔄 正在清理..."
    git checkout main 2>$null
    git branch -D pr-$PRNumber 2>$null
    exit 1
}