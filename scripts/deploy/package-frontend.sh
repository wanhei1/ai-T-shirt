#!/bin/bash

# 🎨 T恤设计器前端组件打包脚本 (Linux/Mac版本)
# 作者: T恤设计器团队
# 版本: 1.0.0
# 用途: 将前端组件打包成ZIP文件以便分发和复用

# 默认参数
OUTPUT_PATH="./frontend-components-package"
ZIP_NAME="t-shirt-designer-frontend-components"
INCLUDE_NODE_MODULES=false
HELP=false

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --output-path)
            OUTPUT_PATH="$2"
            shift 2
            ;;
        --zip-name)
            ZIP_NAME="$2"
            shift 2
            ;;
        --include-node-modules)
            INCLUDE_NODE_MODULES=true
            shift
            ;;
        --help|-h)
            HELP=true
            shift
            ;;
        *)
            echo -e "${RED}❌ 未知参数: $1${NC}"
            exit 1
            ;;
    esac
done

# 显示帮助信息
if [ "$HELP" = true ]; then
    echo -e "${CYAN}🎨 T恤设计器前端组件打包脚本${NC}"
    echo ""
    echo -e "${YELLOW}用法:${NC}"
    echo "  ./package-frontend.sh [选项]"
    echo ""
    echo -e "${YELLOW}选项:${NC}"
    echo "  --output-path <路径>        指定输出目录 (默认: ./frontend-components-package)"
    echo "  --zip-name <名称>           指定ZIP文件名 (默认: t-shirt-designer-frontend-components)"
    echo "  --include-node-modules      包含node_modules目录 (默认: 不包含)"
    echo "  --help, -h                  显示此帮助信息"
    echo ""
    echo -e "${GREEN}示例:${NC}"
    echo "  ./package-frontend.sh"
    echo "  ./package-frontend.sh --output-path './dist' --zip-name 'my-components'"
    exit 0
fi

# 输出函数
write_step() {
    echo -e "${CYAN}🔸 $1${NC}"
}

write_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

write_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

write_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 检查项目根目录
test_project_root() {
    local required_files=("package.json" "next.config.mjs" "components.json")
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            write_error "未找到 $file 文件，请确保在项目根目录运行此脚本"
            return 1
        fi
    done
    return 0
}

# 创建目录
create_directory() {
    if [ ! -d "$1" ]; then
        mkdir -p "$1"
        write_step "创建目录: $1"
    fi
}

# 安全复制文件或目录
copy_item_safely() {
    local source="$1"
    local destination="$2"
    local description="$3"
    
    if [ -e "$source" ]; then
        cp -r "$source" "$destination"
        write_step "复制 $description"
        return 0
    else
        write_warning "$description 不存在，跳过: $source"
        return 1
    fi
}

# 获取项目信息
get_project_info() {
    local name=$(grep '"name"' package.json | sed 's/.*"name".*:.*"\(.*\)".*/\1/')
    local version=$(grep '"version"' package.json | sed 's/.*"version".*:.*"\(.*\)".*/\1/')
    local description=$(grep '"description"' package.json | sed 's/.*"description".*:.*"\(.*\)".*/\1/')
    
    echo "$name|$version|$description"
}

# 创建包信息文件
create_package_info() {
    local dest_path="$1"
    local project_info="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local hostname=$(hostname)
    local username=$(whoami)
    
    IFS='|' read -r name version description <<< "$project_info"
    
    cat > "$dest_path/PACKAGE_INFO.md" << EOF
# 📦 T恤设计器前端组件包

## 包信息
- **包名**: $name
- **版本**: $version
- **描述**: $description
- **打包时间**: $timestamp
- **打包机器**: $hostname
- **打包用户**: $username

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
2. 安装依赖: \`bun install\`
3. 启动开发服务器: \`bun run dev\`
4. 查看 FRONTEND_COMPONENTS_README.md 获取详细说明

## 支持
- 📧 技术支持: [GitHub Issues](https://github.com/wanhei1/v0-t-shirt-design-editor/issues)
- 📚 文档: [项目文档](https://github.com/wanhei1/v0-t-shirt-design-editor)
EOF
}

# 主函数
main() {
    echo -e "${MAGENTA}🎨 T恤设计器前端组件打包工具${NC}"
    echo -e "${MAGENTA}================================================${NC}"
    echo ""

    # 检查必要工具
    if ! command -v zip &> /dev/null; then
        write_error "未找到 zip 命令，请安装 zip 工具"
        exit 1
    fi

    # 检查项目根目录
    if ! test_project_root; then
        exit 1
    fi

    # 获取项目信息
    local project_info=$(get_project_info)
    IFS='|' read -r name version description <<< "$project_info"
    write_step "检测到项目: $name v$version"

    # 创建输出目录
    local timestamp=$(date '+%Y%m%d-%H%M%S')
    local final_output_path="${OUTPUT_PATH}-${timestamp}"
    local zip_file_path="${ZIP_NAME}-${timestamp}.zip"

    write_step "输出目录: $final_output_path"
    write_step "ZIP文件: $zip_file_path"

    if [ -d "$final_output_path" ]; then
        rm -rf "$final_output_path"
    fi
    create_directory "$final_output_path"

    echo ""
    echo -e "${YELLOW}📁 开始复制文件...${NC}"

    # 核心前端文件夹
    declare -A frontend_folders=(
        ["app"]="Next.js应用路由和页面"
        ["components"]="React组件库"
        ["hooks"]="自定义React Hooks"
        ["lib"]="工具库和实用函数"
        ["styles"]="样式文件"
        ["public"]="静态资源文件"
    )

    for folder in "${!frontend_folders[@]}"; do
        copy_item_safely "$folder" "$final_output_path/$folder" "${frontend_folders[$folder]}"
    done

    # 配置文件
    declare -A config_files=(
        ["package.json"]="依赖配置"
        ["next.config.mjs"]="Next.js配置"
        ["tailwind.config.ts"]="Tailwind CSS配置"
        ["tsconfig.json"]="TypeScript配置"
        ["components.json"]="组件配置"
        ["postcss.config.mjs"]="PostCSS配置"
        [".eslintrc.json"]="ESLint配置"
    )

    for file in "${!config_files[@]}"; do
        copy_item_safely "$file" "$final_output_path/$file" "${config_files[$file]}"
    done

    # 文档文件
    declare -A doc_files=(
        ["README.md"]="项目说明文档"
        ["FRONTEND_COMPONENTS_README.md"]="组件详细说明"
        ["CONTRIBUTING.md"]="贡献指南"
        ["PROJECT_STRUCTURE.md"]="项目结构说明"
    )

    for file in "${!doc_files[@]}"; do
        copy_item_safely "$file" "$final_output_path/$file" "${doc_files[$file]}"
    done

    # 可选：复制 node_modules
    if [ "$INCLUDE_NODE_MODULES" = true ]; then
        write_step "包含 node_modules 目录..."
        copy_item_safely "node_modules" "$final_output_path/node_modules" "Node.js依赖包"
        copy_item_safely "bun.lockb" "$final_output_path/bun.lockb" "Bun锁定文件"
    else
        write_warning "跳过 node_modules 目录 (使用 --include-node-modules 参数包含)"
        copy_item_safely "bun.lockb" "$final_output_path/bun.lockb" "Bun锁定文件"
    fi

    # 创建包信息文件
    write_step "生成包信息文件"
    create_package_info "$final_output_path" "$project_info"

    # 创建快速启动脚本
    write_step "创建快速启动脚本"
    cat > "$final_output_path/quick-start.sh" << 'EOF'
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
EOF

    chmod +x "$final_output_path/quick-start.sh"

    cat > "$final_output_path/quick-start.bat" << 'EOF'
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
EOF

    echo ""
    echo -e "${YELLOW}📊 生成统计信息...${NC}"

    # 统计信息
    local total_files=$(find "$final_output_path" -type f | wc -l)
    local total_size=$(du -sm "$final_output_path" | cut -f1)
    local component_files=$(find "$final_output_path/components" -name "*.tsx" 2>/dev/null | wc -l)
    local page_files=$(find "$final_output_path/app" -name "*.tsx" 2>/dev/null | wc -l)

    echo -e "${GREEN}📈 包统计信息:${NC}"
    echo "   • 总文件数: $total_files"
    echo "   • 总大小: ${total_size} MB"
    echo "   • 组件文件: $component_files"
    echo "   • 页面文件: $page_files"

    echo ""
    echo -e "${YELLOW}🗜️  创建ZIP文件...${NC}"

    # 创建ZIP文件
    if [ -f "$zip_file_path" ]; then
        rm -f "$zip_file_path"
    fi

    cd "$final_output_path" && zip -r "../$zip_file_path" . > /dev/null 2>&1
    cd ..

    if [ $? -eq 0 ]; then
        local zip_size=$(du -sm "$zip_file_path" | cut -f1)
        write_success "ZIP文件创建成功!"
        echo "   📁 文件路径: $zip_file_path"
        echo "   📊 文件大小: ${zip_size} MB"
    else
        write_error "创建ZIP文件失败"
        exit 1
    fi

    echo ""
    echo -e "${GREEN}🎉 打包完成!${NC}"
    echo -e "${MAGENTA}================================================${NC}"
    echo ""
    echo -e "${CYAN}📋 包含内容:${NC}"
    echo "   ✅ 完整的React/Next.js组件库"
    echo "   ✅ UI组件 (shadcn/ui + 自定义组件)"
    echo "   ✅ 页面组件和路由"
    echo "   ✅ 样式和主题系统"
    echo "   ✅ TypeScript类型定义"
    echo "   ✅ 配置文件"
    echo "   ✅ 详细文档"
    echo "   ✅ 快速启动脚本"
    
    echo ""
    echo -e "${YELLOW}🚀 使用方法:${NC}"
    echo "   1. 解压 $zip_file_path"
    echo "   2. 运行 ./quick-start.sh (Linux/Mac) 或 quick-start.bat (Windows)"
    echo "   3. 或手动执行: bun install && bun run dev"
    echo ""
    echo -e "${CYAN}📚 查看 FRONTEND_COMPONENTS_README.md 获取详细使用说明${NC}"

    # 清理临时目录选项
    echo ""
    read -p "是否删除临时目录 '$final_output_path'? (y/N): " cleanup
    if [[ $cleanup =~ ^[Yy]$ ]]; then
        rm -rf "$final_output_path"
        write_success "临时目录已清理"
    else
        write_step "保留临时目录: $final_output_path"
    fi
}

# 执行主函数
main "$@"