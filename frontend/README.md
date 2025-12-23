# 前端应用（Next.js）

本目录包含定制 T 恤平台的 Next.js 前端。应用提供完整的设计流程、账号管理，并与后端 API 深度整合。

> 📘 需要英文版文档？请查看 [`README.en.md`](./README.en.md)。

## ✨ 核心特性

- 集成 AI 辅助与手动设计工具，支持多种定制方式
- 支持注册、登录、个人资料维护等认证流程
- 基于 Tailwind CSS 与 Radix UI 构建的响应式界面
- 通过 `NEXT_PUBLIC_API_URL` 与后端 API 交互
- 提供 ComfyUI 连接状态卡片与接口连通性测试组件

## 🛠️ 技术栈

- **框架：** Next.js 14（App Router）
- **样式：** Tailwind CSS、Shadcn UI 组件、Embla Carousel
- **状态与表单：** React Hook Form、Zod 校验、自定义 React Context
- **图表与体验：** Recharts、Lucide 图标、Sonner 全局提示

## 📁 目录结构

```
frontend/
├── app/                 # 路由（App Router）
│   ├── page.tsx         # 首页
│   ├── auth/            # 认证页面
│   ├── design/          # 设计工作流界面
│   └── profile/         # 用户中心
├── components/          # 可复用 UI / 业务组件
├── contexts/            # React Context（如 AuthContext）
├── hooks/               # 自定义 Hooks
├── lib/                 # API 客户端、工具函数、工作流配置
├── public/              # 静态资源
├── styles/              # 全局样式
└── types/               # TypeScript 类型定义
```

## ⚙️ 环境变量

创建 `frontend/.env.local`（已被 git 忽略），并配置：

```dotenv
# 后端 API 基础地址
NEXT_PUBLIC_API_URL=http://localhost:3002
```

如果后端部署在其他域名或端口，请同步更新该值。

## 🚀 开发启动

安装依赖（推荐使用 Bun）：

```bash
bun install
```

启动开发服务器：

```bash
bun run dev
```

默认访问地址：[http://localhost:3000](http://localhost:3000)

### 常用脚本

```bash
bun run build   # 生产构建
bun run start   # 启动生产模式（需先构建）
bun run lint    # 执行 ESLint 检查
```

## 🔗 后端接口依赖

前端默认调用以下后端接口（详细说明见 `backend/README.md`）：

- `POST /api/auth/register` – 注册账号
- `POST /api/auth/login` – 用户登录并获取 JWT
- `GET /api/profile` – 获取当前用户信息（需携带 Authorization 头）
- `POST /api/designs` – 保存设计数据

请确保后端服务运行在 `NEXT_PUBLIC_API_URL` 对应的地址。

## 🧪 测试账号

- 邮箱：`yeesiangku@gmail.com`
- 密码：`123456`

可直接登录验证认证流程，无需重复注册。

## 🤝 贡献指南

1. Fork 仓库并克隆到本地。
2. 创建功能分支：`git checkout -b feat/amazing-ui`
3. 提交修改：`git commit -m "feat: 优化首页文案"`
4. 推送并发起 Pull Request。

提交前请运行 `bun run lint` 并确保项目可以成功构建。

## 📄 许可证

本项目使用 MIT 许可证。详情请参阅仓库根目录的 `LICENSE` 文件（如已提供）。
