# 🎨 T恤设计器前端组件打包脚本
# 作者: T恤设计器团队
# 版本: 1.0.0
# 用途: 将前端组件打包成ZIP文件以便分发和复用

param(
    [string]$OutputPath = ".\frontend-components-package",
    [string]$ZipName = "t-shirt-designer-frontend-components",
    [switch]$IncludeNodeModules = $false,
    [switch]$Help
)

if ($Help) {
    Write-Host "🎨 T恤设计器前端组件打包脚本" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:" -ForegroundColor Yellow
    Write-Host "  .\package-frontend.ps1 [选项]"
    Write-Host ""
    Write-Host "选项:" -ForegroundColor Yellow
    Write-Host "  -OutputPath <路径>     指定输出目录 (默认: .\frontend-components-package)"
    Write-Host "  -ZipName <名称>        指定ZIP文件名 (默认: t-shirt-designer-frontend-components)"
    Write-Host "  -IncludeNodeModules    包含node_modules目录 (默认: 不包含)"
    Write-Host "  -Help                  显示此帮助信息"
    Write-Host ""
    Write-Host "示例:" -ForegroundColor Green
    Write-Host "  .\package-frontend.ps1"
    Write-Host "  .\package-frontend.ps1 -OutputPath '.\dist' -ZipName 'my-components'"
    exit 0
}

# 颜色输出函数
function Write-ColorText {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

function Write-Step {
    param([string]$Text)
    Write-ColorText "🔸 $Text" "Cyan"
}

function Write-Success {
    param([string]$Text)
    Write-ColorText "✅ $Text" "Green"
}

function Write-Warning {
    param([string]$Text)
    Write-ColorText "⚠️  $Text" "Yellow"
}

function Write-Error {
    param([string]$Text)
    Write-ColorText "❌ $Text" "Red"
}

# 检查当前目录是否为项目根目录
function Test-ProjectRoot {
    $requiredFiles = @("package.json", "next.config.mjs", "components.json")
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            Write-Error "未找到 $file 文件，请确保在项目根目录运行此脚本"
            return $false
        }
    }
    return $true
}

# 创建目录
function New-DirectoryIfNotExists {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        Write-Step "创建目录: $Path"
    }
}

# 复制文件或目录
function Copy-ItemSafely {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$Description
    )
    
    if (Test-Path $Source) {
        Copy-Item -Path $Source -Destination $Destination -Recurse -Force
        Write-Step "复制 $Description"
        return $true
    } else {
        Write-Warning "$Description 不存在，跳过: $Source"
        return $false
    }
}

# 获取项目信息
function Get-ProjectInfo {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    return @{
        Name = $packageJson.name
        Version = $packageJson.version
        Description = $packageJson.description
    }
}

# 创建包信息文件
function New-PackageInfo {
    param([string]$DestPath, [hashtable]$ProjectInfo)
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $packageInfo = @"
# 📦 T恤设计器前端组件包

## 包信息
- **包名**: $($ProjectInfo.Name)
- **版本**: $($ProjectInfo.Version)
- **描述**: $($ProjectInfo.Description)
- **打包时间**: $timestamp
- **打包机器**: $env:COMPUTERNAME
- **打包用户**: $env:USERNAME

## 包含内容
- ✅ React/Next.js 组件
- ✅ UI组件库 (shadcn/ui)
- ✅ 样式文件和主题
- ✅ TypeScript类型定义
- ✅ 工具函数和Hooks
- ✅ 静态资源文件
- ✅ 配置文件
- ✅ 详细文档

## 使用说明
1. 解压ZIP文件到目标项目
2. 安装依赖: ``bun install``
3. 启动开发服务器: ``bun run dev``
4. 查看 FRONTEND_COMPONENTS_README.md 获取详细说明

## 支持
- 📧 技术支持: [GitHub Issues](https://github.com/wanhei1/v0-t-shirt-design-editor/issues)
- 📚 文档: [项目文档](https://github.com/wanhei1/v0-t-shirt-design-editor)
"@

    $packageInfo | Out-File -FilePath "$DestPath\PACKAGE_INFO.md" -Encoding UTF8
}

# 主函数
function Main {
    Write-ColorText "🎨 T恤设计器前端组件打包工具" "Magenta"
    Write-ColorText "================================================" "Magenta"
    Write-Host ""

    # 检查项目根目录
    if (-not (Test-ProjectRoot)) {
        exit 1
    }

    # 获取项目信息
    $projectInfo = Get-ProjectInfo
    Write-Step "检测到项目: $($projectInfo.Name) v$($projectInfo.Version)"

    # 创建输出目录
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $finalOutputPath = "$OutputPath-$timestamp"
    $zipFilePath = "$ZipName-$timestamp.zip"

    Write-Step "输出目录: $finalOutputPath"
    Write-Step "ZIP文件: $zipFilePath"

    if (Test-Path $finalOutputPath) {
        Remove-Item -Path $finalOutputPath -Recurse -Force
    }
    New-DirectoryIfNotExists $finalOutputPath

    Write-Host ""
    Write-ColorText "📁 开始复制文件..." "Yellow"

    # 核心前端文件夹
    $frontendFolders = @{
        "app" = "Next.js应用路由和页面"
        "components" = "React组件库"
        "hooks" = "自定义React Hooks"
        "lib" = "工具库和实用函数"
        "styles" = "样式文件"
        "public" = "静态资源文件"
    }

    foreach ($folder in $frontendFolders.Keys) {
        Copy-ItemSafely $folder "$finalOutputPath\$folder" $frontendFolders[$folder]
    }

    # 配置文件
    $configFiles = @{
        "package.json" = "依赖配置"
        "next.config.mjs" = "Next.js配置"
        "tailwind.config.ts" = "Tailwind CSS配置"
        "tsconfig.json" = "TypeScript配置"
        "components.json" = "组件配置"
        "postcss.config.mjs" = "PostCSS配置"
        ".eslintrc.json" = "ESLint配置"
    }

    foreach ($file in $configFiles.Keys) {
        Copy-ItemSafely $file "$finalOutputPath\$file" $configFiles[$file]
    }

    # 文档文件
    $docFiles = @{
        "README.md" = "项目说明文档"
        "FRONTEND_COMPONENTS_README.md" = "组件详细说明"
        "CONTRIBUTING.md" = "贡献指南"
        "PROJECT_STRUCTURE.md" = "项目结构说明"
    }

    foreach ($file in $docFiles.Keys) {
        Copy-ItemSafely $file "$finalOutputPath\$file" $docFiles[$file]
    }

    # 可选：复制 node_modules
    if ($IncludeNodeModules) {
        Write-Step "包含 node_modules 目录..."
        Copy-ItemSafely "node_modules" "$finalOutputPath\node_modules" "Node.js依赖包"
        Copy-ItemSafely "bun.lockb" "$finalOutputPath\bun.lockb" "Bun锁定文件"
    } else {
        Write-Warning "跳过 node_modules 目录 (使用 -IncludeNodeModules 参数包含)"
        Copy-ItemSafely "bun.lockb" "$finalOutputPath\bun.lockb" "Bun锁定文件"
    }

    # 创建包信息文件
    Write-Step "生成包信息文件"
    New-PackageInfo $finalOutputPath $projectInfo

    # 创建快速启动脚本
    Write-Step "创建快速启动脚本"
    $quickStartScript = @'
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
'@
    $quickStartScript | Out-File -FilePath "$finalOutputPath\quick-start.sh" -Encoding UTF8

    $quickStartScriptWindows = @'
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
'@
    $quickStartScriptWindows | Out-File -FilePath "$finalOutputPath\quick-start.bat" -Encoding UTF8

    Write-Host ""
    Write-ColorText "📊 生成统计信息..." "Yellow"

    # 统计信息
    $stats = @{
        TotalFiles = (Get-ChildItem -Path $finalOutputPath -Recurse -File).Count
        TotalSize = [math]::Round((Get-ChildItem -Path $finalOutputPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
        ComponentFiles = (Get-ChildItem -Path "$finalOutputPath\components" -Recurse -Filter "*.tsx" -ErrorAction SilentlyContinue).Count
        PageFiles = (Get-ChildItem -Path "$finalOutputPath\app" -Recurse -Filter "*.tsx" -ErrorAction SilentlyContinue).Count
    }

    Write-ColorText "📈 包统计信息:" "Green"
    Write-Host "   • 总文件数: $($stats.TotalFiles)"
    Write-Host "   • 总大小: $($stats.TotalSize) MB"
    Write-Host "   • 组件文件: $($stats.ComponentFiles)"
    Write-Host "   • 页面文件: $($stats.PageFiles)"

    Write-Host ""
    Write-ColorText "🗜️  创建ZIP文件..." "Yellow"

    # 创建ZIP文件
    try {
        if (Test-Path $zipFilePath) {
            Remove-Item $zipFilePath -Force
        }
        
        Compress-Archive -Path "$finalOutputPath\*" -DestinationPath $zipFilePath -CompressionLevel Optimal
        $zipSize = [math]::Round((Get-Item $zipFilePath).Length / 1MB, 2)
        
        Write-Success "ZIP文件创建成功!"
        Write-Host "   📁 文件路径: $zipFilePath"
        Write-Host "   📊 文件大小: $zipSize MB"
        
    } catch {
        Write-Error "创建ZIP文件失败: $($_.Exception.Message)"
        exit 1
    }

    Write-Host ""
    Write-ColorText "🎉 打包完成!" "Green"
    Write-ColorText "================================================" "Magenta"
    Write-Host ""
    Write-ColorText "📋 包含内容:" "Cyan"
    Write-Host "   ✅ 完整的React/Next.js组件库"
    Write-Host "   ✅ UI组件 (shadcn/ui + 自定义组件)"
    Write-Host "   ✅ 页面组件和路由"
    Write-Host "   ✅ 样式和主题系统"
    Write-Host "   ✅ TypeScript类型定义"
    Write-Host "   ✅ 配置文件"
    Write-Host "   ✅ 详细文档"
    Write-Host "   ✅ 快速启动脚本"
    
    Write-Host ""
    Write-ColorText "🚀 使用方法:" "Yellow"
    Write-Host "   1. 解压 $zipFilePath"
    Write-Host "   2. 运行 quick-start.bat (Windows) 或 quick-start.sh (Linux/Mac)"
    Write-Host "   3. 或手动执行: bun install && bun run dev"
    Write-Host ""
    Write-ColorText "📚 查看 FRONTEND_COMPONENTS_README.md 获取详细使用说明" "Cyan"

    # 清理临时目录选项
    Write-Host ""
    $cleanup = Read-Host "是否删除临时目录 '$finalOutputPath'? (y/N)"
    if ($cleanup -eq 'y' -or $cleanup -eq 'Y') {
        Remove-Item -Path $finalOutputPath -Recurse -Force
        Write-Success "临时目录已清理"
    } else {
        Write-Step "保留临时目录: $finalOutputPath"
    }
}

# 执行主函数
try {
    Main
} catch {
    Write-Error "打包过程中发生错误: $($_.Exception.Message)"
    Write-Host "错误详情: $($_.Exception.StackTrace)" -ForegroundColor Red
    exit 1
}