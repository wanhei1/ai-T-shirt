# Canvas Base64 历史迁移 Dry-Run 方案

> 生成日期：2026-05-21
> 状态：**仅文档，未执行任何迁移操作**

---

## 1. 当前历史 base64 统计

### 1.1 数据库概览

| 表 | 总行数 | canvas_front base64 | canvas_back base64 | canvas_front URL | canvas_back URL | 表大小 |
|---|---|---|---|---|---|---|
| orders | 62 | 25 | 25 | 0 | 0 | 161 MB |
| all_designs | 60 | 23 | 23 | 0 | 0 | 121 MB |
| cart_items | 0 | 0 | 0 | 0 | 0 | 40 kB |

**关键发现**：
- 所有现有 canvas 数据均为 **旧 base64 格式**（`data:image/...;base64,...`）
- 0 条记录使用新的 URL 格式（`/assets/...`）
- cart_items 表为空，无需迁移

### 1.2 Base64 数据量

| 指标 | orders | all_designs | 合计 |
|---|---|---|---|
| Base64 字符总量 | 23.1 MB | 21.3 MB | **44.4 MB** |
| 预计解码后文件数 | 50 | 46 | **96** |
| 预计解码后总大小 | 17.3 MB | 16.0 MB | **33.3 MB** |
| 单条最大 front | 1178 KB | 1178 KB | — |
| 单条最大 back | 1084 KB | 1084 KB | — |

### 1.3 Top 10 最大记录

| # | 表 | ID | Front (KB) | Back (KB) | Total (KB) | 日期 |
|---|---|---|---|---|---|---|
| 1 | all_designs | 2 | 1169 | 1084 | 2253 | 2026-01-17 |
| 2 | orders | 39 | 1169 | 1084 | 2253 | 2026-01-17 |
| 3 | orders | 38 | 1168 | 1045 | 2213 | 2026-01-17 |
| 4 | all_designs | 1 | 1168 | 1045 | 2213 | 2026-01-17 |
| 5 | orders | 48 | 1047 | 1043 | 2089 | 2026-01-18 |
| 6 | all_designs | 47 | 1047 | 1043 | 2089 | 2026-01-18 |
| 7 | orders | 40 | 1178 | 708 | 1887 | 2026-01-17 |
| 8 | all_designs | 40 | 1178 | 708 | 1887 | 2026-01-17 |
| 9 | all_designs | 42 | 1162 | 698 | 1860 | 2026-01-17 |
| 10 | orders | 42 | 1162 | 698 | 1860 | 2026-01-17 |

### 1.4 磁盘资产目录

```
backend/storage/assets/
├── 文件数: 43
├── 总大小: 32.3 MB
└── 全部为新写入链路产出（order-*, ai-* 前缀）
```

---

## 2. 外置化覆盖面审计结果

### 2.1 写入路径审计表

| 写入路径 | 文件位置 | 调用 externalizeImageDataUrls | context 名称 | 结论 |
|---|---|---|---|---|
| 直接创建订单 | routes/index.ts:~1605 | ✅ 是 | order-canvas | 安全 |
| 订单创建 + all_designs | routes/index.ts:~1709 | ✅ 是（共享 canvasExternalized） | order-canvas | 安全 |
| 购物车结算 → 订单 | routes/index.ts:~3053 | ✅ 是 | checkout-canvas | 安全 |
| 购物车结算 → all_designs | routes/index.ts:~3146 | ✅ 是（共享 canvasExternalized） | checkout-canvas | 安全 |
| 购物车添加 | routes/index.ts:~2807 | ✅ 是 | cart-canvas | 安全 |
| 购物车更新 | routes/index.ts:~2856 | ⚠️ 不涉及 canvas | — | 仅更新 quantity/publishToAll |
| 发布到商城 | routes/index.ts:~866 | ✅ 是 | gallery-canvas | 安全 |
| 管理员修改订单状态 | routes/index.ts:~3639 | ⚠️ 不涉及 canvas | — | 仅更新 status |

### 2.2 读取路径审计（缩略图端点）

| 端点 | 修复前 | 修复后 |
|---|---|---|
| `GET /gallery/:designId/thumbnail` | ❌ 仅处理 base64，URL 格式返回 500 | ✅ 支持 base64 + URL |
| `GET /orders/:id/thumbnail` | ❌ 仅处理 base64，URL 格式返回 500 | ✅ 支持 base64 + URL |
| `GET /admin/orders/:id/thumbnail` | ❌ 仅处理 base64，URL 格式返回 500 | ✅ 支持 base64 + URL |

### 2.3 本轮修复

**发现遗漏**：3 个缩略图端点仅处理 base64 格式，新写入的 URL 格式会导致 500 错误。

**修复内容**：
- 新增 `serveCanvasThumbnail()` 辅助函数（routes/index.ts）
- 支持两种格式：base64 data URL 和 `/assets/...` 文件路径
- URL 格式从 `backend/storage/assets/` 读取磁盘文件
- 3 个端点全部改用新辅助函数

**修改文件**：
- `backend/src/routes/index.ts` — 新增 `readFile` import + `serveCanvasThumbnail` + 3 处端点修改

---

## 3. 迁移执行方案

### 3.1 迁移原则

1. **先备份，后操作**：每次迁移前必须备份数据库
2. **渐进式**：先测试 1 条，验证通过后再批量
3. **不清空旧字段**：迁移后保留原始 base64 作为回滚保障
4. **验证优先**：每次迁移后验证页面显示正常

### 3.2 建议迁移顺序

#### Phase 1: 单条测试（all_designs）

```bash
# 1. 备份
pg_dump tshirt_db | gzip > /usrhome/tyx/backup/tshirt-postgres/pre-migration-$(date +%Y%m%d).sql.gz

# 2. 迁移 1 条 all_designs（选择 ID 最小的）
# 脚本逻辑：
#   a. SELECT canvas_front, canvas_back FROM all_designs WHERE id = 1
#   b. 解码 base64 → 写入 backend/storage/assets/all-designs-{date}-{uuid}.png
#   c. UPDATE all_designs SET canvas_front = '/assets/xxx.png', canvas_back = '/assets/yyy.png' WHERE id = 1

# 3. 验证
curl -sf http://localhost:8189/gallery/1/thumbnail  # 应返回 200 + image/png
# 浏览器访问商城页面确认图片正常显示
```

#### Phase 2: 单条测试（orders）

```bash
# 同样流程，选择 orders 中 ID 最小的有 canvas 的记录
# 验证：
curl -sf http://localhost:8189/admin/orders/{id}/thumbnail  # 应返回 200
```

#### Phase 3: 小批量（5 条）

```bash
# 按 ID 升序迁移 5 条
# 每条迁移后验证缩略图端点
```

#### Phase 4: 全量迁移

```bash
# 迁移剩余所有 base64 记录
# orders: ~20 条, all_designs: ~18 条
```

### 3.3 迁移脚本伪代码

```javascript
// migrate-canvas-base64.js — 迁移时创建此脚本
async function migrateRow(table, id, storageDir) {
    const result = await pool.query(
        `SELECT canvas_front, canvas_back FROM ${table} WHERE id = $1`,
        [id]
    );
    const row = result.rows[0];
    if (!row) return;

    const updates = {};
    for (const col of ['canvas_front', 'canvas_back']) {
        const val = row[col];
        if (!val || !val.startsWith('data:image')) continue;

        // 解码 base64
        const match = val.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) continue;
        const ext = match[1].split('/')[1] || 'png';
        const buffer = Buffer.from(match[2], 'base64');

        // 写入磁盘
        const fileName = `${table}-${id}-${col}-${Date.now()}.${ext}`;
        const filePath = path.join(storageDir, fileName);
        await fs.promises.writeFile(filePath, buffer);

        updates[col] = `/assets/${fileName}`;
    }

    if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
        await pool.query(
            `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $1`,
            [id, ...Object.values(updates)]
        );
    }
}
```

### 3.4 预期收益

| 指标 | 迁移前 | 迁移后 |
|---|---|---|
| orders 表大小 | 161 MB | ~5 MB（仅保留元数据） |
| all_designs 表大小 | 121 MB | ~5 MB |
| 磁盘资产文件 | 43 个 (32 MB) | ~139 个 (~65 MB) |
| 缩略图响应时间 | 解码 base64 (~10ms) | 读磁盘文件 (~1ms) |

---

## 4. 回滚方案

### 4.1 未清空旧 base64（推荐）

迁移后 **不清空** `canvas_front`/`canvas_back` 的原始 base64 值。

回滚方式：
- 后端代码中 `serveCanvasThumbnail()` 已支持两种格式
- 只需将 URL 格式字段改回 base64 值即可
- 或者：在 UPDATE 时保留旧值到新列（如 `canvas_front_legacy`）

### 4.2 已清空旧 base64

如果已执行清空（`UPDATE ... SET canvas_front = NULL WHERE canvas_front LIKE 'data:image%'`）：
- 从每日备份恢复：`pg_restore` 对应时间点的备份
- 备份保留 14 天（crontab: `0 3 * * *`）

### 4.3 清空释放空间

清空旧 base64 后，PostgreSQL 不会立即释放磁盘空间：
```sql
-- 方案 A: VACUUM（不锁表，缓慢释放）
VACUUM FULL orders;
VACUUM FULL all_designs;

-- 方案 B: 重写表（锁表，彻底释放）
ALTER TABLE orders RENAME TO orders_old;
CREATE TABLE orders AS SELECT * FROM orders_old WHERE true;
-- 重建索引、约束...
DROP TABLE orders_old;
```

**注意**：`VACUUM FULL` 会锁表，建议在低峰期执行。

---

## 5. 注意事项

1. **orders 和 all_designs 的 canvas 数据高度重复**（同一设计同时存两张表），迁移时可共享磁盘文件
2. **所有 base64 数据来自 2026-01-17 ~ 2026-01-18**，是项目早期数据
3. **cart_items 为空**，无需迁移
4. **新写入链路已正常工作**，无需修改 `asset-storage.ts`
5. **缩略图端点已修复**，迁移前后均可正常工作

---

## 6. 扫描工具

```bash
# 查看最新统计
node scripts/scan-canvas-base64.js

# 查看 top 20 最大记录
node scripts/scan-canvas-base64.js --top 20
```

---

## 附录：禁止事项确认

- ✅ 未执行全量迁移
- ✅ 未清空 orders/all_designs/cart_items 旧 base64
- ✅ 未删除任何文件
- ✅ 未改 SKU/库存/产能
- ✅ 未改支付宝/支付流程
- ✅ 未改 AI 图片结果存储链路
- ✅ 未重构 asset-storage.ts
