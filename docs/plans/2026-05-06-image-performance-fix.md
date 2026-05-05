# 图片加载性能优化 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 修复图片加载慢和个人中心订单加载不出来的问题

**Architecture:** 
- 后端：summary 端点排除 base64 大字段，新增 thumbnail_url 字段
- 前端：profile 页改用 summary API，主页用 next/image + lazy loading
- 数据库：orders 表新增 thumbnail_url 列（存缩略图 URL），后续可迁移 base64 到 OSS

**Tech Stack:** Express.js, PostgreSQL, Next.js 14, next/image

---

## 问题根因

1. `canvas.toDataURL()` 生成的 base64 直接存入 DB（每张 2-10MB）
2. `getOrders()` 返回所有字段含 base64，一次传输几十 MB
3. `getOrderSummariesByUserId` 仍 SELECT canvas_front/canvas_back
4. 前端用 `<img src={base64}>` 直接加载 MB 级数据到 DOM
5. profile 页调用 `getOrders()` 而非 `getOrderSummaries()`

---

## Task 1: 后端 — 排除 summary 端点的大字段

**Objective:** getOrderSummariesByUserId 不再返回 canvas_front/canvas_back/design 中的 base64 数据

**Files:**
- Modify: `backend/src/models/index.ts` (getOrderSummariesByUserId 方法)

**Step 1: 修改 SELECT 语句**

当前代码（约 line 233）:
```sql
SELECT id, created_at, status, payment_status, payment_channel, payment_order_id, 
       paid_at, refund_status, refunded_at, sku_snapshot, production_slot_date, 
       production_due_at, promised_ship_at, canvas_front, canvas_back
FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
```

改为:
```sql
SELECT id, created_at, status, payment_status, payment_channel, payment_order_id, 
       paid_at, refund_status, refunded_at, sku_snapshot, production_slot_date, 
       production_due_at, promised_ship_at,
       CASE WHEN canvas_front IS NOT NULL THEN LEFT(canvas_front, 50) ELSE NULL END as canvas_front_preview,
       CASE WHEN canvas_back IS NOT NULL THEN LEFT(canvas_back, 50) ELSE NULL END as canvas_back_preview
FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
```

注意：这里只是快速修复。LEFT(canvas_front, 50) 会截断 base64 但保留 "data:image/png;base64," 前缀，让前端知道有图。更好的方案是后续加 thumbnail_url 列。

**Step 2: 验证**

```bash
cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer
npm run build:backend
curl -s http://localhost:8189/orders/summary -H "Authorization: Bearer <token>" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Orders: {len(d.get(\"orders\",[]))}'); [print(f'  #{o[\"id\"]} keys: {list(o.keys())}') for o in d.get('orders',[])[:2]]"
```

**Step 3: Commit**
```bash
git add backend/src/models/index.ts
git commit -m "fix(backend): exclude base64 images from order summary endpoint"
```

---

## Task 2: 前端 — profile 页改用 getOrderSummaries

**Objective:** profile 页不再拉取全量订单数据，改用轻量 summary API

**Files:**
- Modify: `frontend/app/profile/page.tsx` (fetchOrders 函数)

**Step 1: 修改 fetchOrders**

当前代码（约 line 289）:
```typescript
const response = await apiClient.getOrders();
setOrders(response.orders || []);
```

改为:
```typescript
const response = await apiClient.getOrderSummaries(30);
setOrders(response.orders || []);
```

**Step 2: 修改 thumbnail 渲染逻辑**

当前代码（约 line 960-970）尝试从 `design.elements[].content` 提取 base64 缩略图。改为：
- 如果有 `canvas_front_preview`（截断的 base64），显示占位图标
- 否则显示 "X 个元素" 占位

```typescript
// 替换 thumbnailSrc 逻辑
const thumbnailSrc = order.canvas_front_preview && order.canvas_front_preview.length > 60
  ? order.canvas_front  // 完整 base64（如果 summary 返回了）
  : null;
```

实际上更好的做法：summary 不返回 base64，直接用占位图标。

**Step 3: 验证**

```bash
cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer
npm run build:frontend
# 打开浏览器访问 /profile，确认订单列表快速加载
```

**Step 4: Commit**
```bash
git add frontend/app/profile/page.tsx
git commit -m "fix(frontend): use order summaries in profile page for faster loading"
```

---

## Task 3: 前端 — 主页改用 getOrderSummaries + next/image

**Objective:** 主页订单预览使用 summary API 并优化图片加载

**Files:**
- Modify: `frontend/app/page.tsx` (myOrders 加载逻辑和图片渲染)

**Step 1: 修改 orders 加载**

找到主页中加载 myOrders 的 useEffect，改为调用 `getOrderSummaries(10)`

**Step 2: 图片用 next/image + lazy loading**

将 `<img src={preview.front}>` 改为:
```tsx
import NextImage from "next/image";

<NextImage
  src={preview.front}
  alt="design preview"
  width={200}
  height={200}
  unoptimized
  loading="lazy"
  className="rounded object-cover"
/>
```

**Step 3: Commit**
```bash
git add frontend/app/page.tsx
git commit -m "fix(frontend): optimize homepage image loading with summaries and next/image"
```

---

## Task 4: 后端 — 新增 /orders/:id/thumbnail 端点（可选）

**Objective:** 提供独立的缩略图端点，前端可按需加载

**Files:**
- Modify: `backend/src/routes/index.ts`
- Modify: `backend/src/models/index.ts`

**Step 1: 新增模型方法**

```typescript
async getOrderThumbnail(orderId: number, userId: number) {
  const query = `SELECT canvas_front FROM orders WHERE id = $1 AND user_id = $2`;
  const result = await this.pool.query(query, [orderId, userId]);
  if (!result.rows[0]?.canvas_front) return null;
  // 返回 base64 的前 100 字符用于判断类型
  return result.rows[0].canvas_front;
}
```

**Step 2: 新增路由**

```typescript
router.get('/orders/:id/thumbnail', authenticate, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) return res.status(400).json({ message: 'Invalid order ID' });
    const thumb = await orderReadModel.getOrderThumbnail(orderId, req.userId as number);
    if (!thumb) return res.status(404).json({ message: 'Thumbnail not found' });
    // 解析 data URL 并返回图片
    const match = thumb.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return res.status(500).json({ message: 'Invalid image data' });
    const buffer = Buffer.from(match[2], 'base64');
    res.setHeader('Content-Type', match[1]);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error) {
    console.error('Thumbnail error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
```

**Step 3: Commit**
```bash
git add backend/src/routes/index.ts backend/src/models/index.ts
git commit -m "feat(backend): add order thumbnail endpoint for lazy loading"
```

---

## Task 5: 前端 — 订单缩略图改用 thumbnail API

**Objective:** 订单列表缩略图通过独立端点按需加载，不再内联 base64

**Files:**
- Modify: `frontend/app/profile/page.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/lib/api-client.ts` (新增 getThumbnailUrl 方法)

**Step 1: api-client 新增方法**

```typescript
getThumbnailUrl(orderId: number | string): string {
  return `${this.baseUrl}/api/orders/${orderId}/thumbnail`;
}
```

**Step 2: profile 页缩略图改用 URL**

```tsx
<img
  src={apiClient.getThumbnailUrl(order.id)}
  alt={`order-${order.id}`}
  className="h-16 w-16 rounded object-cover"
  loading="lazy"
/>
```

**Step 3: Commit**
```bash
git add frontend/app/profile/page.tsx frontend/app/page.tsx frontend/lib/api-client.ts
git commit -m "fix(frontend): use thumbnail API for order preview images"
```

---

## Task 6: 构建验证 + PM2 重启

**Objective:** 确认所有修改编译通过并部署

**Step 1: 构建**
```bash
cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer
npm run build:backend
cd frontend && npm run build && cd ..
```

**Step 2: 重启 PM2**
```bash
pm2 restart tshirt-backend
pm2 restart tshirt-frontend
pm2 status
```

**Step 3: 验证**
```bash
curl -s http://localhost:8189/health
curl -s http://localhost:3000 | head -5
```

**Step 4: 推送**
```bash
git add -A
git commit -m "chore: build and verify all performance fixes"
git push origin main
```

---

## 验证清单

- [ ] profile 页订单列表 < 2 秒加载完成
- [ ] 主页订单预览正常显示
- [ ] 缩略图通过 /orders/:id/thumbnail 端点加载
- [ ] 构建无报错
- [ ] PM2 进程正常运行
