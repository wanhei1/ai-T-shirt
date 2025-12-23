# 自定义 T 恤设计编辑器

现代化的 AI 驱动 T 恤定制平台，采用 **Next.js 14** + **Express.js** + **PostgreSQL** 架构。用户可以完成「选择款式 → 设计画布 → 预览下单」的全流程，支持 AI 图像生成、素材上传、订单保存与个人资料管理。

> 生产环境示例：https://vercel.com/wanhei1s-projects/v0-t-shirt-design-editor

## ✨ 功能亮点
- 三步设计流程：选择款式与配色 → 画布设计 → 预览确认
- 设计画布支持文字、上传图片、AI 生成图像（ComfyUI）
- 多语言界面（中 / 英）与响应式 UI（Shadcn UI + Tailwind CSS）
- JWT 鉴权：注册、登录、资料更新、订单记录
- 后端自动建表并接入 PostgreSQL（Neon 推荐）
- 健康检查、ComfyUI 状态检测、订单 JSON 序列化存档

## 🧱 架构概览

```
custom-tshirt-designer/
├─ frontend/      # Next.js 14 (App Router) 前端
│  ├─ app/        # 路由、三步向导、API Routes
│  ├─ components/ # UI、设计工具、状态卡片
│  ├─ contexts/   # 语言、认证上下文
│  └─ lib/        # API 客户端、ComfyUI 客户端、工作流工具
├─ backend/       # Express.js + pg 的 REST API
│  ├─ src/config/ # 数据库连接等配置
│  ├─ src/routes/ # /api/login、/api/orders 等路由
│  └─ src/models/ # UserModel、OrderModel
├─ shared/        # 跨端常量、类型、工具
├─ docs/          # 额外文档（部署、数据库、结构说明等）
└─ package.json   # Monorepo 根配置与组合脚本
```

### 组件协同

```
[浏览器]
   │  Next.js App Router (SSR/CSR)
   ├─▶ /api/generate-image → ComfyUI (可选)
   └─▶ apiClient → Express 后端 → PostgreSQL
                    │
                    └─ shared 库复用常量/类型
```

## 🖥️ 前端（`frontend/`）
- **技术栈**：Next.js 14 App Router、TypeScript、Tailwind CSS、Shadcn UI、Embla Carousel、React Hook Form、Zod、Sonner Toast
- **核心页面**
  - `app/design/page.tsx`：选择款式、颜色、尺码（向导第 1 步）
  - `app/design/editor/page.tsx`：拖拽式设计画布，支持正背面、缩放、旋转
  - `app/design/preview`：预览订单、提交到后端
  - `app/auth/*`、`app/profile/*`：认证与资料管理
- **设计工具**
  - `components/design-tools/ai-generator.tsx`：ComfyUI 接入，支持多风格与进度反馈
  - `components/design-tools/image-uploader.tsx`：上传自定义素材
  - 文字编辑、颜色/字体选择、元素显示开关等高级交互
- **状态管理**
  - `contexts/language-context.tsx`：中英文切换
  - `contexts/auth-context.tsx`：登录态持久化与 token 管理
  - `lib/api-client.ts`：多 Base URL 探测、健康检查、自动附带 JWT

## 🔙 后端（`backend/`）
- **技术栈**：Express.js、TypeScript、pg、jsonwebtoken、bcrypt
- **应用入口**：`src/app.ts`
  - 加载环境变量、配置 CORS、JSON 解析、健康检查端点
  - 连接 PostgreSQL 并自动建立 `users` / `orders` 表
  - 注入路由 `createRoutes(pool)`，若数据库不可用则返回 503 友好提示
- **路由层**：`src/routes/index.ts`
  - `/api/register`、`/api/login`、`/api/profile`（含更新）
  - `/api/orders`（创建、列表）
  - `authenticate` 中间件解码 JWT 并注入 `req.userId`
- **模型层**：`src/models/index.ts`
  - `UserModel`：邮箱 / 用户名唯一校验，支持更新资料
  - `OrderModel`：JSONB 存储订单项、设计元素、配送信息

## 🔄 核心业务流程

### 设计与下单
1. 选择款式/颜色/尺码并持久到 `localStorage`
2. 设计画布中添加文字、上传图片或调用 AI 生成图
3. 预览页整合 `selections + elements` 并展示价格明细
4. 调用 `apiClient.createOrder` 将订单数据 POST 至 `/api/orders`
5. 后端校验 JWT、写入数据库，返回订单编号与时间戳

### AI 图像生成（ComfyUI）
1. `AIGenerator` 通过 `/api/generate-image` API Route 调用后端
2. `lib/simple-comfyui-client.ts` 组装工作流，投递到 ComfyUI `/prompt`
3. 轮询 `/history` 获取结果，成功返回图片地址，失败回退占位图并展示错误
4. `ComfyUIStatusCard` 提供健康检查与启动指引

### 鉴权与个人资料
1. `AuthContext` 管理 token（localStorage `authToken`）
2. API 请求自动附带 Bearer Token；后端使用 `authenticate` 中间件校验
3. `/api/profile` 支持读取与更新用户名（冲突时返回 409）

## ⚙️ 环境变量

| 范围 | 文件 | 说明 |
| ---- | ---- | ---- |
| 根目录 | `.env.local.example` | Monorepo 通用示例配置 |
| 前端 | `frontend/.env.local.example` | `NEXT_PUBLIC_API_URL` 支持多个备选地址（逗号分隔） |
| 后端 | `backend/.env.example` | `DATABASE_URL`、`JWT_SECRET`、`FRONTEND_URL`、`EXPRESS_JSON_LIMIT` |

```bash
# 准备配置文件
cp frontend/.env.local.example frontend/.env.local
cp backend/.env.example backend/.env

# 常用变量
NEXT_PUBLIC_API_URL=http://localhost:8189
DATABASE_URL=postgres://user:password@host:5432/tshirts
JWT_SECRET=please-change-me
COMFYUI_URL=http://127.0.0.1:8188
```

## 🚀 本地运行

```bash
# 安装所有依赖
npm run install:all

# 启动前后端（并行）
npm run dev

# 单独启动
npm run dev:frontend
npm run dev:backend

# 构建
npm run build          # 前后端
npm run build:frontend
npm run build:backend
```

默认端口：Frontend http://localhost:3000，Backend http://localhost:8189。

## 🔌 REST API 摘要

| 方法 | 路径 | 描述 |
| ---- | ---- | ---- |
| `GET /` | 健康检查 | 返回版本与时间戳 |
| `GET /health` | API 状态 | 包含 uptime、数据库连接结果 |
| `POST /api/register` | 注册 | 创建用户并返回 JWT |
| `POST /api/login` | 登录 | 校验邮箱与密码，返回 JWT |
| `GET /api/profile` | 获取资料 | 需要 Bearer Token |
| `PUT /api/profile` | 更新资料 | 修改用户名（含唯一性校验） |
| `POST /api/orders` | 新建订单 | 存储订单、设计及配送 JSON |
| `GET /api/orders` | 订单列表 | 返回当前用户的订单历史 |

更多细节详见 `backend/README.md` 与 `docs/api.md`。

## 🤖 ComfyUI 集成与排障
- `frontend/components/comfyui-status-card.tsx`：实时展示连接状态与启动指南
- `frontend/lib/simple-comfyui-client.ts`：封装工作流、轮询历史、断线回退
- `/api/generate-image`：统一处理成功 / 失败响应，失败时返回占位图与错误描述
- 常见问题
  1. 检查 `COMFYUI_URL` 是否可访问（默认 127.0.0.1:8188）
  2. 查看后端日志确认数据库和 ComfyUI 连接是否成功
  3. 使用界面上的“刷新状态”按钮重新检测

## 📚 更多文档
- `docs/PROJECT_STRUCTURE.md` — 前端与目录结构详解
- `docs/VERCEL_DEPLOYMENT.md` — Vercel 部署步骤
- `docs/databasereadme.md` — PostgreSQL 初始化与连接指南
- `FRONTEND_COMPONENTS_README.md` — UI 组件说明
- `README-ssh-access.md` — 从 SSH 公钥申请到服务器登录

## 🤝 贡献与后续
- 查看 `CONTRIBUTING.md` 获取开发规范与提交流程
- 维护者脚本：`merge-pr.sh` / `merge-pr.ps1` 可加速合并 PR
- 欢迎在 Issues / PR 中提出：设计工具增强、订单管理、支付接入、协同设计等想法

---

如需了解更多部署、架构或故障排查资讯，请结合 `docs/` 目录阅读。期待你的反馈，一起完善这套 AI 定制服装平台。
