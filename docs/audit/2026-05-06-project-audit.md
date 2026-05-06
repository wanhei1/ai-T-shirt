# yituai (衣推) — 全栈项目审计报告

> 审计日期：2026-05-06 | 代码版本：b2ee6b9

---

## 一、项目概览

**yituai** 是一个 AI 定制 T 恤电商平台。用户可通过 AI 生成、文字编辑、图片上传设计 T 恤，下单购买，支持支付宝支付。

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16.1.6 + React 18 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | PostgreSQL (本地, 20 表, 79 索引) |
| 消息队列 | RabbitMQ (ai-image / virtual-tryon 两个队列) |
| 缓存/状态 | Redis |
| AI 推理 | ComfyUI (Juggernaut-XL 模型, port 8188) |
| 虚拟试穿 | CatVTON pipeline |
| 部署 | PM2 (3 进程) + FRP 内网穿透 |
| 支付 | 支付宝二维码 (手动确认) |

### 规模

- 后端 API：**48 个路由**
- 数据库：**20 张表, 220+ 列, 79 个索引**
- 前端页面：**11 个路由**
- Worker：**2 个队列** (AI 生图 + 虚拟试穿)
- 代码量：后端 ~37K 行, 前端 ~27K 行

---

## 二、系统架构

### 2.1 进程架构

```
┌─────────────────────────────────────────────────────────┐
│                    PM2 Cluster                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ tshirt-      │  │ tshirt-      │  │ tshirt-      │  │
│  │ frontend     │  │ backend      │  │ worker       │  │
│  │ :3000        │  │ :8189        │  │ (无端口)      │  │
│  │ Next.js SSR  │  │ Express API  │  │ RabbitMQ     │  │
│  │ + /backend/  │  │ + 48 routes  │  │ consumer     │  │
│  │   proxy      │  │              │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
          │           ┌─────┴─────┐     ┌─────┴─────┐
          │           │ PostgreSQL │     │ RabbitMQ  │
          │           │ :5432      │     │ :5672     │
          │           │ 20 tables  │     │ 2 queues  │
          │           └───────────┘     └─────┬─────┘
          │                                   │
          │         ┌───────────┐       ┌─────┴─────┐
          │         │  Redis    │       │ ComfyUI   │
          │         │  :6379    │       │ :8188     │
          │         │ Job state │       │ AI 推理    │
          │         └───────────┘       └───────────┘
          │
    ┌─────┴─────┐
    │ FRP frpc  │
    │ 3000→8478 │
    └───────────┘
```

### 2.2 请求流转

```
用户浏览器/手机
    │
    ├─ HTTP :8478 (FRP) ──→ :3000 (Next.js)
    │                           │
    │                           ├─ SSR → 后端 :8189 (server-side)
    │                           └─ Client JS → /backend/api/* 代理 → :8189
    │
    ├─ HTTP :8189 (直连) ──→ Express API
    │                           │
    │                           ├─ 认证: JWT Bearer token
    │                           ├─ 业务逻辑
    │                           ├─ PostgreSQL 查询
    │                           ├─ Redis 缓存
    │                           └─ 入队 → RabbitMQ
    │
    └─ WebSocket/HTTP ──→ ComfyUI :8188
                              │
                              └─ Worker 消费 RabbitMQ → 调用 ComfyUI → 写回结果
```

---

## 三、API 路由清单 (48 个)

### 公开路由 (7 个)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/register` | 用户注册 |
| POST | `/login` | 用户登录 |
| GET | `/gallery` | 公开商城列表 (分页/分类/搜索/排序) |
| GET | `/gallery/:id` | 商城详情 |
| GET | `/gallery/:id/thumbnail` | 商城缩略图 (二进制) |
| POST | `/payments/webhook/:channel` | 支付回调 (HMAC 验签) |
| POST | `/ops/alerts/ticket` | 告警 webhook |

### 用户路由 (27 个)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/profile` | 个人信息 + 会员 |
| PUT | `/profile` | 更新用户名 |
| POST | `/orders` | 创建订单 (幂等) |
| GET | `/orders` | 订单列表 |
| GET | `/orders/summary` | 订单摘要 (轻量) |
| GET | `/orders/:id/thumbnail` | 订单缩略图 |
| GET | `/orders/:id/tracking` | 物流追踪 |
| POST | `/payments/create-intent` | 创建支付意向 |
| GET | `/cart` | 购物车列表 |
| POST | `/cart` | 添加购物车 |
| PUT | `/cart/:id` | 更新购物车 |
| DELETE | `/cart/:id` | 删除购物车项 |
| POST | `/cart/clear` | 清空购物车 |
| POST | `/cart/checkout` | 结算 (幂等) |
| POST | `/generate` | AI 生图 (入队) |
| POST | `/jobs` | 通用任务入队 |
| GET | `/jobs/:queue/stats` | 队列统计 |
| GET | `/jobs/:queue/:id` | 任务状态 |
| POST | `/gallery/publish` | 发布到商城 |
| GET | `/memberships/me` | 当前会员 |
| GET | `/memberships/transactions/me` | 会员交易记录 |
| POST | `/memberships` | 购买会员 |
| GET | `/referrals/me` | 邀请统计 |
| POST | `/referrals/redeem` | 兑换邀请码 |
| POST | `/after-sales` | 创建售后 |
| GET | `/after-sales/me` | 我的售后 |
| GET | `/debug/category` | 调试: 分类规范化 |

### 管理员路由 (14 个)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/orders` | 全部订单 |
| PUT | `/admin/orders/:id/status` | 更新订单状态 |
| POST | `/admin/orders/:id/ship` | 创建发货 |
| PUT | `/admin/shipments/:id` | 更新物流 |
| GET | `/admin/after-sales` | 全部售后 |
| PUT | `/admin/after-sales/:id` | 审核售后 |
| GET | `/admin/products` | 产品列表 |
| POST | `/admin/products` | 创建产品 |
| POST | `/admin/product-skus` | 创建 SKU |
| PUT | `/admin/product-skus/:id` | 更新 SKU |
| PUT | `/admin/production-capacity/:date` | 设置产能 |
| GET | `/admin/reconciliation/latest` | 账单对账 |
| GET | `/admin/ai-budget/today` | AI 预算用量 |
| PUT | `/admin/credentials` | 修改管理员密码 |

---

## 四、数据库 ER 关系

### 核心实体

```
users ──1:N──→ orders ──1:1──→ shipments
  │               │
  │               ├──1:N──→ after_sales_requests
  │               │
  │               └──1:1──→ order_idempotency_keys
  │
  ├──1:1──→ memberships ──1:N──→ membership_transactions
  │
  ├──1:N──→ cart_items
  │
  ├──1:N──→ all_designs ──1:N──→ design_usage_rewards
  │
  ├──1:N──→ referral_redemptions (inviter ←→ invitee)
  │
  └──1:N──→ payment_events

products ──1:N──→ product_skus ──?──→ orders (via sku_id)
production_capacity_daily (独立)
ai_budget_daily_counters (独立, 按天/操作/用户)
schema_migrations (独立)
```

### 20 张表

| 表名 | 列数 | 行数 | 说明 |
|------|------|------|------|
| users | 9 | 1 | 用户 (含 is_admin, 邀请码) |
| orders | 27 | 4 | 订单 (含 canvas_front/back base64) |
| memberships | 13 | 1 | 会员 (余额制) |
| membership_transactions | 9 | 10 | 会员交易流水 |
| all_designs | 10 | 4 | 设计作品库 |
| cart_items | 15 | 0 | 购物车 |
| design_usage_rewards | 7 | 0 | 设计师奖励 |
| payment_events | 10 | 0 | 支付事件日志 |
| order_idempotency_keys | 11 | 4 | 幂等键 |
| referral_redemptions | 7 | 0 | 邀请记录 |
| products | 6 | 1 | 产品 |
| product_skus | 11 | 0 | SKU 变体 |
| shipments | 9 | 0 | 物流 |
| after_sales_requests | 15 | 0 | 售后 |
| orders_archive | 17 | 0 | 订单归档 |
| design_snapshots | 11 | 0 | 设计快照 |
| global_designs | 9 | 0 | 全局设计 (legacy) |
| production_capacity_daily | 6 | 0 | 每日产能 |
| ai_budget_daily_counters | 9 | 21 | AI 预算计数器 |
| schema_migrations | 4 | 0 | 迁移记录 |

---

## 五、Worker 队列系统

### 架构

```
API Route ──enqueueJob()──→ RabbitMQ ──consumer──→ Worker Process
                                                      │
                                          ┌───────────┴───────────┐
                                          │                       │
                                     ai-image 队列          virtual-tryon 队列
                                          │                       │
                                     ComfyUI API            CatVTON pipeline
                                          │                       │
                                     生成结果写回             试穿结果写回
                                     Redis/内存               Redis/内存
```

### 两个队列

| 队列 | 并发 | 处理逻辑 |
|------|------|----------|
| `ai-image` | 1 | 构建 prompt → 选择 style config → ComfyUI workflow → 轮询结果 → 返回图片 |
| `virtual-tryon` | 1 | 加载人物图 + 服装图 → AutoMasker → CatVTON 推理 → 保存结果 |

### AI 生图 Style 配置

- realistic, cartoon, anime, abstract, minimalist, vintage
- 中文关键词 → 英文翻译
- 支持 ArgosTranslate workflow

---

## 六、前端页面

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | Hero + 功能展示 + 会员方案 + 商城轮播 |
| `/auth` | 登录/注册 | 表单验证 (zod) |
| `/design` | 产品选择 | 款式/颜色/尺码 |
| `/design/editor` | 设计编辑器 | 拖拽/缩放/旋转/AI 生图/文字/上传 |
| `/design/preview` | 预览下单 | 试穿预览 + 地址 + 支付 |
| `/shop` | 商城 | 分类/搜索/排序/缩略图 |
| `/shop/[orderId]` | 订单详情 | 画布预览 + 物流 |
| `/cart` | 购物车 | 数量/删除/结算 |
| `/profile` | 个人中心 | 订单列表/会员/邀请 |
| `/membership` | 会员 | 方案选择/购买 |
| `/admin` | 后台管理 | 订单/产品/物流/售后/对账 |

---

## 七、上线缺口清单 🔴

### 严重 (Must Fix)

| # | 问题 | 影响 | 修复建议 |
|---|------|------|----------|
| 1 | **NODE_ENV=development** | 性能差, 错误信息泄露 | 改为 `production` |
| 2 | **密码明文存储?** | 安全 | 确认 bcryptjs 已正确 hash |
| 3 | **JWT_SECRET 在 .env** | 泄露风险 | 使用环境变量注入, 不入 git |
| 4 | **RabbitMQ 默认密码** (`test123456`) | 安全 | 更改密码 |
| 5 | **canvas_front/back base64 存数据库** | 性能瓶颈 | 迁移到对象存储 (S3/MinIO) |
| 6 | **无 HTTPS** | 中间人攻击 | Caddy 已装, 配置 TLS |
| 7 | **admin 页面无路由守卫** | 非管理员可访问前端代码 | 加 middleware.ts |

### 中等 (Should Fix)

| # | 问题 | 影响 | 修复建议 |
|---|------|------|----------|
| 8 | **双重认证客户端** (auth-api.ts + api-client.ts) | Token 键名不一致 | 统一为一个 |
| 9 | **双重 ComfyUI 客户端** | 代码重复 | 统一为一个 |
| 10 | **Worker 硬编码路径** | 不可移植 | 使用环境变量 |
| 11 | **无队列清理机制** | Redis 内存增长 | 添加 TTL 清理 |
| 12 | **PM2 7 次重启** | 稳定性 | 检查崩溃日志 |
| 13 | **63GB 备份文件** | 磁盘空间 | 迁移到外部存储 |
| 14 | **FRP 不代理后端** | 安全 (8189 暴露) | 添加后端代理或关闭直接访问 |
| 15 | **前端 Next.js API 路由绕过后端** | 绕过认证/限流 | 统一走后端 API |

### 低 (Nice to Have)

| # | 问题 | 影响 | 修复建议 |
|---|------|------|----------|
| 16 | **无数据库备份策略** | 数据丢失风险 | pg_dump 定时备份 |
| 17 | **无日志聚合** | 排查困难 | 已有 ES+Kibana, 接入 winston |
| 18 | **无 API 文档** | 开发效率 | 添加 Swagger/OpenAPI |
| 19 | **无 E2E 测试** | 回归风险 | Playwright/Cypress |
| 20 | **无 rate limit 全局限流** | DDoS | 添加全局限流中间件 |

---

## 八、Bug 清单 🐛

| # | 严重度 | 位置 | 描述 |
|---|--------|------|------|
| 1 | 🔴 High | admin page | 非管理员可看到前端代码, 仅后端拒绝 |
| 2 | 🔴 High | auth | Token 存储键名不一致 (`token` vs `authToken`) |
| 3 | 🟡 Med | orders list | `getAllOrders` 加载完整 base64 (已修复) |
| 4 | 🟡 Med | mobile | 设计编辑器无触摸事件 (已修复) |
| 5 | 🟡 Med | mobile | 导航栏无汉堡菜单 (已修复) |
| 6 | 🟡 Med | ¥NaN | `getOrderSummariesByUserId` 缺 total 列 (已修复) |
| 7 | 🟡 Med | thumbnail | 手机访问 127.0.0.1 缩略图 (已修复) |
| 8 | 🟡 Med | gallery | 商城图片加载 base64 (已修复) |
| 9 | 🟢 Low | downloadImage | admin 页下载缩略图可能跨域失败 |
| 10 | 🟢 Low | design editor | `design` JSONB 中的 canvas snapshots 仍是 base64 |

---

## 九、数据流概要

### 用户下单流程

```
1. /design           → 选择款式/颜色/尺码
2. /design/editor    → 设计 (AI生图/文字/上传) → Canvas 渲染
3. /design/preview   → 预览试穿效果 → 填写地址
4. POST /orders      → 创建订单 (幂等) → 扣除会员余额
5. 展示支付宝二维码    → 用户扫码 → 手动确认
6. POST /payments/create-intent → 记录支付意向
7. GET /profile      → 查看订单状态
```

### AI 生图流程

```
1. POST /generate    → 校验会员 + 产能 → 入队 ai-image
2. Worker 消费       → 构建 ComfyUI workflow → 调用 ComfyUI API
3. ComfyUI 渲染      → 返回图片
4. Worker 写回       → Redis 状态更新
5. 前端轮询 GET /jobs/:queue/:id → 获取结果
```

### 虚拟试穿流程

```
1. POST /jobs (type: virtual-tryon) → 校验预算 + 产能 → 入队
2. Worker 消费       → 加载人物图 + 服装图
3. CatVTON pipeline  → AutoMasker → 推理 → 保存
4. 结果写回          → 前端轮询获取
```

---

*审计完成。所有图表见同目录 HTML 文件。*
