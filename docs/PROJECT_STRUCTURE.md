# 📁 项目结构

```
custom-tshirt-designer/
├── 📄 README.md                    # 项目主要说明
├── 📄 CONTRIBUTING.md              # 贡献指南（新增）
├── 📄 VERCEL_DEPLOYMENT.md         # Vercel部署指南
├── 📄 databasereadme.md            # 数据库设置指南
├── 📄 package.json                 # 项目依赖配置
├── 📄 .env.local                   # 本地环境变量
├── 🛠️ merge-pr.sh                  # PR合并脚本（Linux/Mac）
├── 🛠️ merge-pr.ps1                 # PR合并脚本（Windows）
├── 📂 app/                         # Next.js应用目录
│   ├── 📄 page.tsx                 # 主页面
│   ├── 📄 layout.tsx               # 布局组件
│   ├── 📂 api/                     # API路由
│   │   ├── 📂 generate-image/      # AI图像生成API
│   │   └── 📂 test-comfyui/        # ComfyUI连接测试API
│   ├── 📂 design/                  # 设计相关页面
│   └── 📂 ...
├── 📂 components/                  # React组件
│   ├── 📂 ui/                      # UI基础组件
│   └── 📂 design-tools/            # 设计工具组件
├── 📂 lib/                         # 工具库
│   ├── 📄 simple-comfyui-client.ts # ComfyUI客户端
│   └── 📄 utils.ts                 # 工具函数
└── 📂 public/                      # 静态资源
    └── 🖼️ *.jpg                     # T恤样机图片
```

## 📚 文档说明

| 文件 | 用途 | 目标读者 |
|------|------|----------|
| `README.md` | 项目概览和快速开始 | 所有用户 |
| `CONTRIBUTING.md` | 详细贡献指南 | 贡献者 |
| `VERCEL_DEPLOYMENT.md` | 部署配置说明 | 开发者/维护者 |
| `databasereadme.md` | 数据库设置教程 | 开发者 |

## 🛠️ 维护者工具

| 工具 | 平台 | 用途 |
|------|------|------|
| `merge-pr.sh` | Linux/Mac | 快速合并PR |
| `merge-pr.ps1` | Windows | 快速合并PR |

## 🚀 常用命令

### 开发命令
```bash
bun install          # 安装依赖
bun run dev          # 启动开发服务器
bun run build        # 构建项目
bun run start        # 启动生产服务器
```

### Git工作流
```bash
# 贡献者流程
git checkout -b feature/new-feature
git commit -m "feat: 添加新功能"
git push origin feature/new-feature

# 维护者流程
./merge-pr.sh 3      # 合并PR #3 (Linux/Mac)
.\merge-pr.ps1 3     # 合并PR #3 (Windows)
```