# 5.1.6 AI 生图模块已知缺陷修复计划

**日期**: 2026-05-20

---

## 审计结果

| 缺陷 | 严重度 | 审计结论 | 修复方案 |
|------|--------|---------|---------|
| 结果仅写 Redis | 🔴 High | 确认。与试穿相同问题 | DB 表 + 磁盘存储 + 查询降级 |
| 并发 = 1 | 🟡 Med | 已有 env var 配置，单 GPU 下并发=1 正确 | 更新 .env 文档 |
| Worker 硬编码路径 | 🟡 Med | 11 处硬编码，env var 已支持但未文档化 | 新增 COMFYUI_ROOT + 文档化 |

---

## 修复 1：结果持久化（🔴）

### 改动范围

| 文件 | 改动 |
|------|------|
| `startup-migrations.ts` | 新增 `ai_image_results` 表 |
| `asset-storage.ts` | 新增 `saveAiResult()` 方法 |
| `workers.ts` | processMessage 中 AI 队列完成后存磁盘 + 写 DB |
| `routes/index.ts` | 查询降级扩展到 AI 队列 |

---

## 修复 2：并发配置（🟡）

### 改动范围

| 文件 | 改动 |
|------|------|
| `backend/.env` | 文档化 `JOB_CONCURRENCY_AI` 和 `JOB_CONCURRENCY_TRYON` |
| `backend/.env.example` | 添加说明注释 |

**注意**: 单 GPU 下并发=1 是正确的，不改值。

---

## 修复 3：硬编码路径（🟡）

### 改动范围

| 文件 | 改动 |
|------|------|
| `workers.ts` | 新增 `COMFYUI_ROOT` 环境变量，替换硬编码路径前缀 |
| `backend/.env` | 新增 `COMFYUI_ROOT` 配置 |
| `backend/.env.example` | 添加说明 |
