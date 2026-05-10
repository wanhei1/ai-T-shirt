# Admin Panel Refactoring Plan

> 目标：将 1274 行的单文件 admin 页面拆分为多页面 + 侧边栏导航架构

---

## 当前状态

- 单文件: `frontend/app/admin/page.tsx` (1274 行)
- 32 个 useState 变量
- 4 个独立数据源 (orders, products, reconciliation, aiBudget)
- 所有功能平铺在一个页面

## 目标架构

```
frontend/app/admin/
├── layout.tsx              ← 侧边栏导航 + 权限检查 (新)
├── page.tsx                ← 重定向到 /admin/dashboard
├── dashboard/
│   └── page.tsx            ← 概览 Dashboard (新)
├── orders/
│   └── page.tsx            ← 订单管理 (新)
├── products/
│   └── page.tsx            ← 商品/SKU 管理 (新)
├── billing/
│   └── page.tsx            ← 对账中心 (新)
└── settings/
    └── page.tsx            ← 系统设置 (新)

frontend/components/admin/
├── admin-sidebar.tsx       ← 侧边栏导航组件 (新)
├── admin-header.tsx        ← 顶部栏 (新)
└── types.ts                ← 共享类型定义 (新)
```

## 侧边栏导航项

| 图标 | 标签 | 路由 | 对应原页面区块 |
|------|------|------|---------------|
| 📊 | 概览 | /admin/dashboard | 今日预算看板 + 对账摘要 |
| 📦 | 订单管理 | /admin/orders | 订单列表 + 筛选 + 状态变更 |
| 🛍️ | 商品/SKU | /admin/products | 商品列表 + SKU 配置 + 产能 |
| 💰 | 对账中心 | /admin/billing | 账务对账看板 |
| ⚙️ | 系统设置 | /admin/settings | 管理员账号 |

---

## Phase 1 — 共享基础设施

### 1.1 创建类型定义文件
**文件**: `frontend/components/admin/types.ts`
- 从 page.tsx 提取 AdminOrder, ReconciliationReport, AiBudgetTodayReport, SampleTableRow 等类型
- 导出供所有子页面使用

### 1.2 创建 admin layout
**文件**: `frontend/app/admin/layout.tsx`
- 权限检查 (useAuth → is_admin)
- 未登录重定向 /auth
- 非管理员重定向 /
- 包含 AdminSidebar + AdminHeader
- `<Outlet />` 渲染子页面

### 1.3 创建侧边栏组件
**文件**: `frontend/components/admin/admin-sidebar.tsx`
- 响应式：桌面固定侧边栏，移动端可折叠
- 当前路由高亮
- 5 个导航项

---

## Phase 2 — 拆分页面

### 2.1 Dashboard 页面
**文件**: `frontend/app/admin/dashboard/page.tsx`
**数据源**: aiBudget + reconciliation 摘要
**UI 组件**:
- 今日订单数 (从 orders summary 获取)
- 今日 AI 预算使用看板 (loadAiBudget)
- 对账摘要 (loadReconciliation)
- 快捷入口卡片

**从原页面提取**:
- loadAiBudget (L327-337)
- loadReconciliation (L315-325)
- 今日预算 Card (L887-960)
- 对账看板 Card (L966-1060)

### 2.2 订单管理页面
**文件**: `frontend/app/admin/orders/page.tsx`
**数据源**: orders
**UI 组件**:
- 状态筛选 tabs (全部/待处理/处理中/运输中/已送达)
- 订单卡片列表 (含用户信息、金额、状态)
- 状态变更下拉
- 发货操作

**从原页面提取**:
- loadOrders (L294-305)
- handleStatusChange (L590-594)
- handleShip (L580-588)
- 订单列表渲染 (L1042-1270)
- 状态筛选逻辑 (L611-621)

### 2.3 商品/SKU 管理页面
**文件**: `frontend/app/admin/products/page.tsx`
**数据源**: products
**UI 组件**:
- 商品列表 + 创建表单
- SKU 配置表
- 产能配置

**从原页面提取**:
- loadProducts (L339-350)
- handleCreateProduct (L432-470)
- handleCreateSku (L474-520)
- handleSaveSku (L380-395)
- handleCapacitySave (L411-430)
- SKU/产能配置 Card (L647-885)

### 2.4 对账中心页面
**文件**: `frontend/app/admin/billing/page.tsx`
**数据源**: reconciliation
**UI 组件**:
- 对账报告详情
- 异常样本表格
- SQL 复制功能

**从原页面提取**:
- loadReconciliation (L315-325)
- copySql (L577-588)
- 对账看板完整渲染 (L966-1060)

### 2.5 系统设置页面
**文件**: `frontend/app/admin/settings/page.tsx`
**数据源**: admin credentials
**UI 组件**:
- 管理员账号管理
- (预留) 角色权限
- (预留) 操作日志

---

## Phase 3 — 清理

### 3.1 删除旧 page.tsx
- 确认所有功能已迁移到子页面
- 删除或重定向到 /admin/dashboard

### 3.2 更新 api-client.ts
- 如有需要，添加新端点 (目前复用现有 API)

---

## 实施顺序

1. **types.ts** → 共享类型 (5 min)
2. **admin-sidebar.tsx** → 侧边栏组件 (15 min)
3. **layout.tsx** → admin 布局 (10 min)
4. **dashboard/page.tsx** → 概览页 (15 min)
5. **orders/page.tsx** → 订单页 (20 min)
6. **products/page.tsx** → 商品页 (20 min)
7. **billing/page.tsx** → 对账页 (10 min)
8. **settings/page.tsx** → 设置页 (5 min)
9. **清理旧 page.tsx** → 重定向 (5 min)
10. **构建验证** → npm run build + PM2 (5 min)

**预估总时间**: ~2 小时

---

## 风险点

1. **Next.js App Router**: 子页面需要独立的 `page.tsx`，不能用动态 import 替代
2. **共享状态**: 各页面独立加载数据，不共享状态（符合 Next.js 约定）
3. **响应式**: 侧边栏在移动端需要折叠/抽屉模式
4. **路由守卫**: layout.tsx 中的权限检查要覆盖所有子路由
