# T-shirt design editor

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/wanhei1s-projects/v0-t-shirt-design-editor)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/projects/yvQIuJ8vycj)

## 快速开始

1. **安装依赖**

   ```bash
   bun install
   ```

2. **启动开发服务器**

   ```bash
   bun run dev
   ```

   默认访问地址：http://localhost:3000

## 🤝 贡献指南

欢迎贡献代码！请查看我们的贡献指南：

- 📖 [贡献指南 (CONTRIBUTING.md)](./CONTRIBUTING.md)
- 🚀 [部署文档 (VERCEL_DEPLOYMENT.md)](./VERCEL_DEPLOYMENT.md)
- 🗄️ [数据库设置 (databasereadme.md)](./databasereadme.md)

### 快速贡献流程

1. **Fork此项目**
2. **创建功能分支**: `git checkout -b feature/amazing-feature`
3. **提交更改**: `git commit -m 'feat: 添加新功能'`
4. **推送分支**: `git push origin feature/amazing-feature`
5. **创建Pull Request**

## 📁 项目管理最佳实践

### ✅ 应该提交到Git的文件

- ✅ **源代码文件** (`.ts`, `.tsx`, `.js`, `.jsx`)
- ✅ **配置文件** (`package.json`, `tsconfig.json`, `next.config.mjs`)
- ✅ **锁定文件** (`bun.lock`, `package-lock.json`)
- ✅ **文档文件** (`README.md`, `CONTRIBUTING.md`)
- ✅ **静态资源** (`public/` 目录下的图片、图标等)

### ❌ 不应该提交到Git的文件

- ❌ **依赖目录** (`node_modules/`, `venv/`, `env/`)
- ❌ **构建文件** (`.next/`, `build/`, `dist/`)
- ❌ **环境变量** (`.env.local`, `.env.production`)
- ❌ **缓存文件** (`__pycache__/`, `*.pyc`, `.cache/`)
- ❌ **IDE配置** (`.vscode/`, `.idea/`)

### 🔒 环境变量管理

```bash
# 本地开发 (.env.local - 不会被提交)
COMFYUI_URL=http://82.157.19.21:8188
DATABASE_URL=your-local-database-url

# 生产环境 (在Vercel Dashboard中配置)
COMFYUI_URL=http://82.157.19.21:8188
DATABASE_URL=your-production-database-url
```

### 🚀 Vercel部署流程

1. **代码推送** → GitHub仓库更新
2. **自动触发** → Vercel检测到更改
3. **依赖安装** → 根据`package.json`自动安装
4. **项目构建** → `bun run build`
5. **自动部署** → 发布到CDN

> 💡 **提示**: Vercel会自动创建自己的Node.js环境，不需要上传本地的`node_modules/`或虚拟环境文件。

## Overview

This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

## Deployment

Your project is live at:

**[https://vercel.com/wanhei1s-projects/v0-t-shirt-design-editor](https://vercel.com/wanhei1s-projects/v0-t-shirt-design-editor)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/projects/yvQIuJ8vycj](https://v0.app/chat/projects/yvQIuJ8vycj)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## 🛠️ 开发工具和脚本

### 维护者工具

- **`merge-pr.sh`** (Linux/Mac) - 自动化PR合并脚本
- **`merge-pr.ps1`** (Windows) - PowerShell版本的PR合并脚本

```bash
# 使用示例
./merge-pr.sh 3      # 合并PR #3 (Linux/Mac)
.\merge-pr.ps1 3     # 合并PR #3 (Windows)
```

### 常用开发命令

```bash
# 安装依赖
bun install

# 开发服务器
bun run dev

# 构建项目
bun run build

# 启动生产服务器
bun run start

# 代码检查
bun run lint
```

## 🔍 故障排除

### ComfyUI连接问题

如果遇到ComfyUI连接问题：

1. **检查环境变量**：确保`COMFYUI_URL`配置正确
2. **健康检查**：访问 `/api/generate-image` (GET请求)
3. **详细诊断**：访问 `/api/test-comfyui`
4. **本地测试**：确保ComfyUI服务器可以从外网访问

### Vercel部署问题

1. **检查构建日志**：在Vercel Dashboard查看详细错误
2. **环境变量**：确保在Vercel中正确配置环境变量
3. **依赖问题**：检查`package.json`和`bun.lock`是否最新

## 📚 相关文档

- 📁 [项目结构说明](./PROJECT_STRUCTURE.md)
- 🤝 [详细贡献指南](./CONTRIBUTING.md)
- � [GitHub管理指南](./GITHUB_MANAGEMENT_GUIDE.md)
- �🚀 [Vercel部署指南](./VERCEL_DEPLOYMENT.md)
- 🗄️ [数据库设置教程](./databasereadme.md)

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件（如果存在）。

## 🆘 获取帮助

- 🐛 [报告Bug](https://github.com/wanhei1/v0-t-shirt-design-editor/issues)
- 💡 [功能建议](https://github.com/wanhei1/v0-t-shirt-design-editor/issues)
- 📧 联系维护者：[@wanhei1](https://github.com/wanhei1)