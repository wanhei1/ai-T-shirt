# AI T-Shirt 设计平台

现代化的 AI 驱动 T 恤定制平台，采用 **Next.js 14** + **Express.js** + **PostgreSQL** + **ComfyUI** 架构。用户可以完成「选择款式 → 设计画布 → 预览下单」的全流程，支持 AI 图像生成、虚拟试穿、素材上传、订单保存与个人资料管理。

> 🌐 生产环境：https://vercel.com/wanhei1s-projects/v0-t-shirt-design-editor
> 🖥️ 自托管服务器：http://api.bit810.cn（3090 GPU 服务器）

---

## 🚀 快速开始

### 本地开发

```bash
# 1. 克隆仓库
git clone git@github.com:wanhei1/ai-T-shirt.git
cd ai-T-shirt

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp backend/.env.example backend/.env       # 填入数据库 URL、JWT_SECRET 等
cp frontend/.env.local.example frontend/.env.local  # 填入 API URL、ComfyUI 地址

# 4. 构建并启动
cd shared && npm run build && cd ..
npm run dev   # 前后端并行启动
```

### 服务器部署（PM2）

```bash
# 1. 构建
npm run build:backend
cd frontend && npm run build && cd ..

# 2. 使用 PM2 启动（推荐）
pm2 start ecosystem.config.js
pm2 save

# 3. 验证
pm2 status
curl http://localhost:8189/health   # 后端
curl http://localhost:3000          # 前端
```

默认端口：Frontend `:3000`，Backend `:8189`，ComfyUI `:8188`（服务器上由 junrong 进程运行）。

---

## ✨ 功能亮点

- **三步设计流程**：选择款式与配色 → 画布设计 → 预览确认
- **AI 图像生成**：接入 ComfyUI，支持 txt2img / img2img 多种风格
- **虚拟试穿**：CatVTON 模型，上传模特照 + 服装图即可试穿（开发中）
- **背景任务队列**：RabbitMQ + Worker 异步处理耗时任务
- **多语言界面**：中 / 英双语（Shadcn UI + Tailwind CSS）
- **JWT 鉴权**：注册、登录、资料更新、订单记录
- **CI/CD**：GitHub Actions 自动化测试、安全扫描、DB 迁移检查

---

## 🧱 架构概览

```
custom-tshirt-designer/
├─ frontend/          # Next.js 14 (App Router) 前端
│  ├─ app/            # 路由、三步向导、API Routes
│  ├─ components/     # UI、设计工具、状态卡片
│  ├─ contexts/       # 语言、认证上下文
│  └─ lib/            # API 客户端、ComfyUI 客户端
├─ backend/           # Express.js + pg REST API
│  ├─ src/
│  │  ├─ app.ts       # Express 主入口
│  │  ├─ worker.ts    # 后台任务 Worker（RabbitMQ）
│  │  ├─ queue/       # 消息队列与任务定义
│  │  ├─ controllers/ # 业务控制器（含 AI 生图、虚拟试穿）
│  │  ├─ routes/      # REST 路由
│  │  ├─ models/      # 数据模型
│  │  └─ release/     # 数据库迁移与发布检查
│  └─ dist/           # 编译输出
├─ shared/            # 跨端常量、类型、工具
├─ docs/              # 详细文档（部署、架构、运维手册）
├─ scripts/           # 运维脚本（密钥扫描、备份等）
├─ .github/workflows/ # CI/CD 流水线
└─ ecosystem.config.js # PM2 进程配置（单源）
```

### 系统架构图

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser   │────▶│  Next.js     │────▶│  Express.js  │
│             │     │  Frontend    │     │  Backend     │
│             │     │  :3000       │     │  :8189       │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              │                 │                 │
                         ┌────▼────┐     ┌──────▼──────┐  ┌──────▼──────┐
                         │PostgreSQL│     │   RabbitMQ  │  │  ComfyUI    │
                         │         │     │   Queue     │  │  :8188      │
                         └─────────┘     └──────┬──────┘  └─────────────┘
                                                │
                                         ┌──────▼──────┐
                                         │   Worker    │
                                         │ (GPU 生图)  │
                                         └─────────────┘
```

---

## 🖥️ 前端（`frontend/`）

**技术栈**：Next.js 14 App Router、TypeScript、Tailwind CSS、Shadcn UI、React Hook Form、Zod

| 页面 | 路径 | 功能 |
|------|------|------|
| 设计向导 | `app/design/page.tsx` | 选择款式、颜色、尺码 |
| 设计画布 | `app/design/editor/page.tsx` | 拖拽式编辑，支持正背面、缩放、旋转 |
| 预览下单 | `app/design/preview/` | 预览订单、提交到后端 |
| 认证 | `app/auth/*` | 注册、登录 |
| 个人中心 | `app/profile/*` | 资料管理、订单历史 |

**设计工具**：
- `components/design-tools/ai-generator.tsx` — ComfyUI AI 生图，多风格与进度反馈
- `components/design-tools/image-uploader.tsx` — 上传自定义素材
- 文字编辑、颜色/字体选择、元素显示开关等

---

## 🔙 后端（`backend/`）

**技术栈**：Express.js、TypeScript、pg、jsonwebtoken、bcrypt、RabbitMQ

### 核心模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 主服务 | `src/app.ts` | Express 入口，连接 DB，注册路由 |
| Worker | `src/worker.ts` | 后台任务消费者（AI 生图、虚拟试穿） |
| 控制器 | `src/controllers/` | aiController（ComfyUI）、orderController、userController |
| 消息队列 | `src/queue/` | RabbitMQ 连接、任务定义、Worker 注册 |
| 数据库迁移 | `src/release/` | 增量迁移与发布检查 |

### REST API

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/` | 健康检查，返回版本与时间戳 |
| `GET` | `/health` | API 状态，含 uptime、DB 连接 |
| `POST` | `/api/register` | 注册，返回 JWT |
| `POST` | `/api/login` | 登录，校验邮箱与密码 |
| `GET` | `/api/profile` | 获取资料（需 Bearer Token） |
| `PUT` | `/api/profile` | 更新用户名（含唯一性校验） |
| `POST` | `/api/orders` | 新建订单（JSONB 存储） |
| `GET` | `/api/orders` | 订单列表 |

---

## 🤖 AI 生图与虚拟试穿

### ComfyUI 集成

1. `AIGenerator` 通过 `/api/generate-image` 调用后端
2. 后端通过 ComfyUI Client 组装工作流，投递到 ComfyUI `/prompt`
3. 轮询 `/history` 获取结果，成功返回图片，失败回退占位图
4. `ComfyUIStatusCard` 提供健康检查与启动指引

### 虚拟试穿（CatVTON）

- 基于 CatVTON 模型，上传模特照 + 服装图即可生成试穿效果
- 当前状态：DensePose 导入失败，待修复

---

## ⚙️ 环境变量

| 范围 | 文件 | 关键变量 |
|------|------|----------|
| 根目录 | `.env.local.example` | Monorepo 通用配置 |
| 前端 | `frontend/.env.local.example` | `NEXT_PUBLIC_API_URL`（逗号分隔多地址） |
| 后端 | `backend/.env.example` | `DATABASE_URL`、`JWT_SECRET`、`COMFYUI_URL` |

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

---

## 🔄 CI/CD（GitHub Actions）

| Workflow | 触发条件 | 功能 |
|----------|----------|------|
| Secret Scan | PR / push to main | gitleaks 密钥扫描（含 .gitleaks.toml 白名单） |
| Functional Gate | PR 触及 frontend/backend | 启动 PG 容器 → env 校验 → 功能测试 |
| DB Release Gate | PR 触及 backend | 构建后端 → DB 迁移检查 |
| Billing Reconciliation | 每日 02:20 UTC | 生产数据库账单对账 |
| Security Readiness | PR | 环境变量安全校验 |
| DR Readiness | 手动 | 灾难恢复就绪检查 |

---

## 🛠️ PM2 进程管理

```bash
# ecosystem.config.js 是 PM2 配置的唯一来源
pm2 start ecosystem.config.js
pm2 save              # 持久化进程列表
pm2 status            # 查看状态
pm2 logs tshirt-backend
pm2 restart tshirt-worker
```

### 进程列表

| 进程名 | 入口 | 说明 |
|--------|------|------|
| tshirt-backend | `backend/dist/app.js` | Express API 服务 |
| tshirt-frontend | `next start -p 3000` | Next.js 前端 |
| tshirt-worker | `backend/dist/worker.js` | 后台任务 Worker |

---

## 🔧 故障排查

| 问题 | 排查方法 |
|------|----------|
| 后端启动失败 | `pm2 logs tshirt-backend --lines 50`，检查 `DATABASE_URL` |
| AI 生图失败 | 确认 ComfyUI 运行中：`curl http://127.0.0.1:8188/system_stats` |
| Worker 卡死 | `pm2 restart tshirt-worker`，检查 RabbitMQ 连接 |
| 虚拟试穿 400 | CatVTON DensePose 导入失败，待修复 |
| DB 迁移失败 | `npm run release:db:check` 查看详细错误 |
| CI Secret Scan 失败 | 检查 `.gitleaks.toml` 白名单是否覆盖 |

---

## 📚 文档索引

| 文档 | 内容 |
|------|------|
| `docs/COMFYUI_README.md` | ComfyUI 集成详解 |
| `docs/VERCEL_DEPLOYMENT.md` | Vercel 部署步骤 |
| `docs/databasereadme.md` | PostgreSQL 初始化与连接 |
| `docs/deployment/` | 部署指南 |
| `docs/development/` | 开发环境搭建 |
| `docs/architecture/` | 架构设计文档 |
| `CONTRIBUTING.md` | 贡献规范与提交流程 |

---

## 🤝 贡献

1. Fork → Branch → PR
2. 确保 CI 通过（Secret Scan + Functional Gate + DB Release Gate）
3. 查看 `CONTRIBUTING.md` 获取详细规范
4. 维护者脚本：`merge-pr.sh` / `merge-pr.ps1` 加速合并

---

*AI T-Shirt 设计平台 — 让每个人都能设计自己的衣服。*
