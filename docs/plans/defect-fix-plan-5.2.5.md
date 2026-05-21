# 5.2.5 已知缺陷修复计划

**日期**: 2026-05-20  
**范围**: 虚拟试穿模块已知缺陷  
**方法**: 代码审计 + 总控调度子代理执行

---

## 审计结果总览

| 编号 | 问题 | 严重度 | 审计结论 | 修复优先级 |
|------|------|--------|---------|-----------|
| A | 结果未持久化 | 🔴 严重 | 确认。Redis 24h TTL，无 DB 持久化 | P0 |
| B | 模型冷启动慢 | 🟡 中等 | 确认。每次请求重新加载模型到 GPU | P1 |
| C | 无错误重试 | 🟡 中等 | **已修复**。try-on 和 AI 共享相同重试机制 | 无需修复 |

---

## 问题 A：结果未持久化（🔴）

### 现状

```
Worker 完成 → { imageUrl: "data:image/png;base64,..." }
           → 存入 Redis hash (job:virtual-tryon:{id})
           → 设置 TTL = 24h
           → 24h 后 Redis key 过期，结果永久丢失
```

**涉及文件**：
- `backend/src/queue/state-repository.ts` (L233-237) — TTL 设置
- `backend/src/queue/workers.ts` (L857 runTryOnJob) — 结果返回
- `backend/src/routes/index.ts` (L1141) — 入队
- `backend/src/utils/asset-storage.ts` — 磁盘存储工具（未使用）
- `backend/src/db/startup-migrations.ts` — 无 tryon_results 表

### 修复方案

**混合方案（推荐）**：

1. **Worker 端**：将 base64 图片存到磁盘，返回文件路径而非完整 data URL
   - 使用已有的 `asset-storage.ts` 工具
   - 修改 `runTryOnJob()` 返回 `{ imageUrl: "/storage/tryon/xxx.png" }`

2. **DB 持久化**：新增 `virtual_tryon_results` 表
   ```sql
   CREATE TABLE virtual_tryon_results (
       id SERIAL PRIMARY KEY,
       job_id VARCHAR(64) UNIQUE NOT NULL,
       result_image_url TEXT NOT NULL,
       cloth_type VARCHAR(16),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. **查询降级**：`GET /jobs/:queue/:id` 先查 Redis，失败则查 DB

### 代码改动范围

| 文件 | 改动 |
|------|------|
| `backend/src/db/startup-migrations.ts` | 新增建表迁移 |
| `backend/src/queue/workers.ts` | `runTryOnJob` 返回文件路径 + 写 DB |
| `backend/src/routes/index.ts` | 查询降级到 DB |
| `backend/src/utils/asset-storage.ts` | 新增 `saveTryOnResult()` 方法 |

---

## 问题 B：模型冷启动慢（🟡）

### 现状

```
用户请求 → ComfyUI 收到 workflow JSON
         → LoadCatVTONPipeline 节点每次创建新实例
         → 从磁盘加载 UNet (3.4GB) + VAE (335MB) + 注意力权重
         → 首次请求耗时 20-40s
```

**涉及文件**：
- `ComfyUI/custom_nodes/ComfyUI-CatVTON/__init__.py` (L181-301) — 节点定义
- `ComfyUI/custom_nodes/ComfyUI-CatVTON/model/pipeline.py` — 重型 __init__

### 修复方案

**单例缓存（推荐）**：

在 `__init__.py` 中添加模块级缓存：

```python
_PIPELINE_CACHE = {}
_AUTOMASKER_CACHE = {}

# LoadCatVTONPipeline.load() 中：
cache_key = (sd15_inpaint_path, catvton_path, mixed_precision, vae_path)
if cache_key in _PIPELINE_CACHE:
    return (_PIPELINE_CACHE[cache_key],)
# ... 原有加载逻辑 ...
_PIPELINE_CACHE[cache_key] = pipeline
return (pipeline,)
```

**预期效果**：首次 20-40s → 后续请求 <1s

### 代码改动范围

| 文件 | 改动 |
|------|------|
| `ComfyUI/custom_nodes/ComfyUI-CatVTON/__init__.py` | 添加 `_PIPELINE_CACHE` + `_AUTOMASKER_CACHE` |

---

## 问题 C：无错误重试（✅ 已修复）

### 审计结论

重试机制**已存在且正常工作**：

- try-on 和 AI 共享相同重试配置
- `buildJobOptions()` 返回 `attempts: 3`
- Worker 失败后指数退避重试（base=5s, max=60s, 25% jitter）
- 最终失败标记为 `"failed"` 状态

### 残留小问题（非阻塞）

1. `buildJobOptions()` 中 `backoff/removeOnComplete/removeOnFail` 是死代码（BullMQ 风格，AMQP 实现不消费）
2. `sleep(retryDelayMs)` 阻塞 worker 线程
3. 无 dead-letter queue

**建议**：清理死代码，暂不做重大改动。

---

## 执行计划

### 阶段 1：问题 A — 结果持久化（总控 + 子代理）

**子代理任务**：
1. 创建 DB 迁移脚本（`startup-migrations.ts`）
2. 修改 `workers.ts` 的 `runTryOnJob` 返回文件路径
3. 修改 `workers.ts` 的 `processMessage` 写 DB
4. 修改 `routes/index.ts` 的查询降级
5. 新增 `asset-storage.ts` 的 `saveTryOnResult()` 方法

**验证**：
- 执行一次试穿 → 检查磁盘文件
- 等待 24h+ → 检查 DB 记录仍在
- Redis 过期后 → 检查 API 仍能返回结果

### 阶段 2：问题 B — 模型缓存（总控 + 子代理）

**子代理任务**：
1. 修改 `ComfyUI/custom_nodes/ComfyUI-CatVTON/__init__.py` 添加缓存

**验证**：
- 首次请求：20-40s（正常）
- 第二次请求：<1s（验证缓存生效）

### 阶段 3：清理（低优先级）

**子代理任务**：
1. 清理 `buildJobOptions()` 死代码
2. 评估 `sleep()` 阻塞问题

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 磁盘空间增长 | 试穿图片 ~0.8MB/张 | 定期清理脚本（保留 30 天） |
| 模型缓存内存占用 | GPU VRAM ~4GB 常驻 | CatVTON 已占用，无额外开销 |
| DB 迁移失败 | 新表创建失败 | 先备份，迁移可回滚 |
