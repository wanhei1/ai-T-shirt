# 前端独立部署指南

## 📌 问题说明

当前项目是一个 monorepo（前后端在一起），Vercel 部署时会因为以下原因失败：
- Vercel 不知道应该构建哪个目录
- 根目录的 `package.json` 包含了 workspace 配置
- 后端代码和依赖导致构建混淆

## ✅ 解决方案

将前端代码独立到一个新的 GitHub 仓库，让 Vercel 专门部署前端。

## 🚀 部署步骤

### 步骤 1: 创建前端独立仓库

1. **在 GitHub 上创建新仓库**
   - 仓库名称：`t-shirt-designer-frontend`（或你喜欢的名称）
   - 设置为 Public 或 Private
   - 不要初始化 README

2. **准备前端代码包**
   
   在项目根目录运行：
   ```powershell
   # 运行准备脚本
   .\prepare-frontend-deploy.ps1
   ```

   这会创建一个 `frontend-deploy` 目录，包含所有需要的文件。

### 步骤 2: 推送到新仓库

```powershell
# 进入前端部署目录
cd frontend-deploy

# 初始化 git
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial frontend deployment setup"

# 添加远程仓库（替换为你的仓库地址）
git remote add origin https://github.com/你的用户名/t-shirt-designer-frontend.git

# 推送
git push -u origin main
```

### 步骤 3: 在 Vercel 部署

1. **登录 Vercel**
   - 访问 [vercel.com](https://vercel.com)
   - 使用 GitHub 账号登录

2. **导入项目**
   - 点击 "Add New Project"
   - 选择你的新仓库 `t-shirt-designer-frontend`
   - Vercel 会自动检测到这是一个 Next.js 项目

3. **配置环境变量**（可选）
   
   如果需要连接后端 API，添加以下环境变量：
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.com
   NEXT_PUBLIC_COMFYUI_URL=http://82.157.19.21:8188
   ```

4. **部署**
   - 点击 "Deploy"
   - 等待构建完成（约 2-3 分钟）

### 步骤 4: 验证部署

1. 访问 Vercel 提供的 URL
2. 测试前端功能是否正常
3. 检查 API 连接（如果有后端）

## 📁 前端部署包内容

`frontend-deploy` 目录包含：
```
frontend-deploy/
├── app/                    # Next.js App Router
├── components/             # React 组件
├── hooks/                  # React Hooks
├── lib/                    # 工具函数和客户端
├── public/                 # 静态资源
├── styles/                 # 样式文件
├── types/                  # TypeScript 类型
├── components.json         # shadcn/ui 配置
├── next.config.mjs         # Next.js 配置
├── package.json            # 独立的依赖配置
├── tsconfig.json           # TypeScript 配置
├── postcss.config.mjs      # PostCSS 配置
├── tailwind.config.ts      # Tailwind CSS 配置
├── .gitignore              # Git 忽略文件
└── README.md               # 前端说明文档
```

## 🔄 后续更新流程

当你修改前端代码后：

1. **同步代码到部署目录**：
   ```powershell
   .\prepare-frontend-deploy.ps1
   ```

2. **提交并推送**：
   ```powershell
   cd frontend-deploy
   git add .
   git commit -m "Update frontend"
   git push
   ```

3. **自动部署**：
   - Vercel 会自动检测到代码变化
   - 自动触发新的构建和部署

## 🔧 配置文件说明

### vercel.json
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "npm install"
}
```

### .env.local.example
包含需要的环境变量示例，在 Vercel 控制台配置实际值。

## ⚠️ 注意事项

1. **API 路由**：
   - 前端的 `/app/api` 路由会在 Vercel 上作为 Serverless Functions 运行
   - 确保这些路由不依赖本地服务

2. **环境变量**：
   - 客户端可访问的变量需要 `NEXT_PUBLIC_` 前缀
   - 服务端变量不需要前缀

3. **ComfyUI 连接**：
   - 本地 ComfyUI (127.0.0.1) 在 Vercel 上无法访问
   - 需要使用公网可访问的 ComfyUI 服务器
   - 或者使用云端 ComfyUI 服务（RunPod、Replicate 等）

4. **构建限制**：
   - Vercel 免费版有构建时间限制（45秒）
   - 如果构建超时，考虑优化依赖或升级计划

## 🐛 常见问题

### 构建失败
- 检查 `package.json` 中的依赖是否正确
- 查看 Vercel 构建日志中的具体错误

### 页面 404
- 确认 Next.js 路由配置正确
- 检查 `next.config.mjs` 中的配置

### API 连接失败
- 验证环境变量是否正确设置
- 检查 CORS 配置（如果有后端）

## 📞 需要帮助？

- [Vercel 文档](https://vercel.com/docs)
- [Next.js 部署文档](https://nextjs.org/docs/deployment)
- 查看项目的其他文档文件

## 🎉 完成！

按照以上步骤，你的前端应该能够成功部署到 Vercel 了！
