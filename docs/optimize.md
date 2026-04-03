# 基于 System Design Primer 的系统问题诊断（当前项目）

## 1. 诊断范围
本报告基于 `donnemartin/system-design-primer` 的核心维度进行评估：
- Performance vs Scalability
- Availability vs Consistency
- Queue / Asynchronism / Back Pressure
- Database / Schema / Data Growth
- Cache
- Security
- Observability

结合当前代码实现，对你项目（前端 + 后端 + RabbitMQ + ComfyUI + PostgreSQL）做了“现状问题 + 优先级 + 落地建议”。

---

## 2. 当前系统结构（一句话）
系统是“单后端进程 + RabbitMQ 队列 + ComfyUI 推理 + PostgreSQL 单库”的架构，能跑通业务，但在可用性、扩展性、可观测性和安全治理上还处于早期阶段。

---

## 3. 主要问题（按严重级别）

## P0（优先立即处理）

### 3.1 任务状态存储在内存，重启即丢（可靠性风险）
现状：
- 任务状态和日志保存在进程内 `Map`（jobStore）。
- 进程重启后，历史 job 状态、进度、失败原因都会丢失。

影响：
- 用户侧查询 job 状态可能出现“任务还在跑但状态查不到”。
- 运维无法回溯失败任务，排障成本高。

Primer 映射：
- Asynchronism / Message Queue：消息可靠投递之外，还要有可恢复的状态存储。

建议：
- 将 job metadata（state/progress/result/error）落到 Redis 或 PostgreSQL。
- 保留“RabbitMQ 负责传输，DB/Redis 负责状态”的职责分离。

### 3.2 缺少背压与限流策略，峰值下会雪崩
现状：
- 有队列，但没有明确的“入队限速、队列长度阈值、过载时 429/503 策略”。
- 高并发时，AI 任务会堆积，响应时延失控。

影响：
- 请求延迟指数增长。
- 用户体验“请求成功但长期无结果”。

Primer 映射：
- Back Pressure：必须在系统过载时主动拒绝新流量。

建议：
- 增加 per-user/per-IP 速率限制。
- 设置队列长度上限，超过阈值立即返回 503 + retry-after。
- 对重试策略引入指数退避和抖动。

### 3.3 密钥和凭据治理不足（安全风险）
现状：
- 环境配置中出现真实密码/密钥样式配置，存在误提交和泄漏风险。

影响：
- 一旦仓库/日志泄漏，数据库和鉴权风险很高。

Primer 映射：
- Security：最小权限、密钥隔离、传输和存储安全。

建议：
- 立即轮换 JWT secret、DB 密码、MQ 密码。
- 仅保留 `.env.example` 模板，敏感值放部署平台密钥管理。
- 增加 secret scan（如 gitleaks）到 CI。

---

## P1（1-2 周内处理）

### 3.4 可观测性薄弱：缺少统一指标与链路追踪
现状：
- 主要依赖 console 日志。
- 缺少标准化 metrics（QPS、P95、失败率、队列深度、任务耗时）。

影响：
- 线上故障定位慢，无法做容量规划。

Primer 映射：
- Scale the design：识别瓶颈需要监控数据支持。

建议：
- 接入结构化日志（JSON）。
- 增加 Prometheus 指标：
  - HTTP 请求数/延迟分位
  - job enqueue/dequeue/fail
  - queue depth
  - ComfyUI 调用耗时与错误率

### 3.5 前后端错误语义不稳定，容易“静默失败”
现状：
- 部分 GET 在鉴权失败时被客户端逻辑降级成 `null`。

影响：
- 页面表现为“空数据”而不是明确错误，掩盖真实故障。

Primer 映射：
- Reliability：错误要可见、可区分、可恢复。

建议：
- 统一错误码和错误体结构（code/message/details/requestId）。
- 保留鉴权失败语义，不建议统一吞掉为 null。

### 3.6 启动时自动迁移策略风险偏高
现状：
- 后端启动包含大量 DDL/ALTER 逻辑。

影响：
- 多实例并发启动时可能出现迁移竞争。
- 上线变更不可控，回滚困难。

Primer 映射：
- Availability patterns：变更路径要可控，避免把“启动”变成高风险操作。

建议：
- 引入独立迁移流程（一次性 migration job）。
- 应用启动阶段只做健康检查，不做重迁移。

### 3.7 AI 与 API 同进程，故障域耦合
现状：
- AI 任务消费和 API 在同一服务生命周期里。

影响：
- 推理侧故障可能影响 API SLA。

Primer 映射：
- Application layer：职责拆分降低爆炸半径（blast radius）。

建议：
- 将 worker 进程与 API 进程分离部署。
- 分别扩缩容，独立监控和告警。

---

## P2（中期优化）

### 3.8 缓存层缺失，热点读会直接打数据库
现状：
- 主要读请求直接命中 PostgreSQL。

影响：
- 热点页和高频接口在增长后易触发 DB 瓶颈。

Primer 映射：
- Cache：用 cache-aside 降低读放大。

建议：
- 从“热点只读接口”开始加 Redis cache-aside。
- 先加短 TTL，再逐步细化失效策略。

### 3.9 大 JSON/图片相关数据增长可能导致存储与查询压力
现状：
- 设计数据、canvas 快照等字段体量较大。

影响：
- 表膨胀、备份恢复慢、I/O 压力增大。

Primer 映射：
- Database / SQL tuning：避免把大对象长期放核心交易表。

建议：
- 大文件转对象存储（S3/OSS），DB 存 URL + 元数据。
- 对高频筛选字段建立专用索引与归档策略。

---

## 4. 分阶段整改路线图

### 阶段 A（本周）
- 密钥轮换与仓库脱敏。
- 增加限流、队列阈值、过载返回策略。
- 将任务状态从内存迁移到可持久化存储（最小可用版）。

### 阶段 B（下周）
- API/Worker 分离部署。
- 建立统一错误码体系。
- 接入基础监控（QPS、P95、队列长度、任务失败率）。

### 阶段 C（2-4 周）
- 引入缓存层（热点接口）。
- 建立迁移流水线（替代启动时大规模 DDL）。
- 优化大字段存储策略与归档。

---

## 5. 建议的目标 SLO（先有目标再优化）
- API 可用性：99.9%
- 核心页面接口 P95：< 300ms（不含 AI 任务）
- AI 异步任务成功率：> 98%
- AI 任务排队等待 P95：< 30s（超载时明确返回 503）

---

## 6. 结论
你现在系统“功能链路完整”，但还属于“可运行”阶段，不是“可规模化稳定运行”阶段。
根据 system-design-primer 的标准，最关键短板是：
- 异步任务可恢复性
- 过载治理（背压/限流）
- 安全与可观测性

优先把这三件事做完，再做缓存和深度性能优化，收益最大。

---

## 7. 与当前代码的逐项对照（已核对）

### 7.1 任务状态易丢失（已确认）
- 位置：`backend/src/queue/queues.ts`
- 现状：`jobStore` 使用进程内 `Map` 保存 job state/progress/result/logs。
- 结论：进程重启、发布、崩溃后任务状态不可恢复。

### 7.2 API 与 Worker 耦合（已确认）
- 位置：`backend/src/app.ts`
- 现状：应用启动时直接 `startJobWorkers()`，同一进程承载 HTTP 与队列消费。
- 结论：ComfyUI/RabbitMQ 波动会放大到 API 可用性。

### 7.3 启动期自动 DDL（已确认）
- 位置：`backend/src/app.ts`
- 现状：启动时执行多段 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE`。
- 结论：多实例并发启动时变更风险高，发布窗口不可控。

### 7.4 错误语义被吞（已确认）
- 位置：`frontend/lib/api-client.ts`
- 现状：401/部分 403 的 GET 请求会返回 `null`，前端可能表现为空数据。
- 结论：故障可观测性差，用户难以判断是“无数据”还是“鉴权失败”。

### 7.5 背压机制缺失（已确认）
- 位置：`backend/src/routes/index.ts` + `backend/src/queue/queues.ts`
- 现状：支持入队和状态查询，但缺少队列长度阈值、限流、熔断返回策略。
- 结论：高峰时延会线性恶化，用户体验不可控。

---

## 8. 目标架构（不推翻重来，最小改造）

目标：保留 RabbitMQ + ComfyUI 主链路，补齐“可恢复、可观测、可限流”。

### 8.1 组件职责
- API 服务：鉴权、参数校验、入队、查询任务状态（不跑重推理）
- Worker 服务：仅消费队列并执行 ComfyUI/CatVTON 任务
- PostgreSQL：业务主数据（用户、订单、会员）
- Redis（新增）：任务状态与短期缓存（queue stats、热点读取）
- RabbitMQ：异步传输与削峰

### 8.2 关键原则
- RabbitMQ 管消息，不承担完整状态回溯。
- 任务状态写入 Redis（TTL）并可选异步落库到 PostgreSQL。
- API 过载时主动拒绝，返回 429/503 + `Retry-After`。

---

## 9. 两周可落地方案（按优先级）

## Week 1（P0，必须完成）

### 9.1 任务状态持久化（Redis）
- 改造点：
  - 在 `backend/src/queue/queues.ts` 抽象 `JobStateRepository`。
  - 默认实现从内存 `Map` 切到 Redis Hash：
    - key: `job:{queue}:{id}`
    - fields: `state,progress,result,failedReason,attemptsMade,maxAttempts,createdAt,finishedAt,logs`
  - 列表查询用 `zset` 或 `set` 维护索引。
- 验收：
  - 重启 API 后，`/api/jobs/:queue/:id` 仍能查到历史状态。
  - 任务日志仍可回看最近 N 条。

### 9.2 背压 + 限流
- 改造点：
  - 在 `backend/src/routes/index.ts` 的 `/jobs`、`/generate` 接口前加入：
    - IP 限流（如 60 req/min）
    - 用户级 AI 入队限流（如 10 req/min）
  - 入队前读取队列深度，超过阈值直接返回 503：
    - `code: QUEUE_OVERLOADED`
    - `Retry-After: 15`
- 验收：
  - 压测时 API 不雪崩；达到阈值后可稳定拒绝流量。

### 9.3 密钥治理
- 改造点：
  - 轮换 `JWT_SECRET`、DB/MQ 密码。
  - 清理仓库中的真实敏感值，仅保留 `.env.example`。
  - CI 加 `gitleaks` 扫描。
- 验收：
  - 新旧密钥切换成功，历史泄漏值失效。

## Week 2（P1，强烈建议完成）

### 9.4 API / Worker 进程拆分
- 改造点：
  - API 进程：不启动 worker。
  - Worker 进程：独立入口（仅 `startJobWorkers()`）。
  - 部署与监控分开。
- 验收：
  - 停掉 worker 时 API 健康检查仍通过。

### 9.5 统一错误模型
- 改造点：
  - 后端统一返回结构：
    - `{ code, message, details, requestId }`
  - 前端 `api-client` 不再将鉴权失败 GET 静默置 `null`，改为抛错并由页面明确展示。
- 验收：
  - 401/403/429/503 在 UI 可区分、可提示。

### 9.6 基础可观测性
- 改造点：
  - 接入结构化日志（JSON）。
  - 增加指标：
    - `http_requests_total`
    - `http_request_duration_ms`
    - `jobs_enqueued_total`
    - `jobs_failed_total`
    - `queue_depth`
    - `comfyui_request_duration_ms`
- 验收：
  - 能看见每小时失败率、P95、队列堆积趋势。

---

## 10. 中期（2-6 周）

### 10.1 启动期迁移改流水线
- 把 `backend/src/app.ts` 内 DDL 迁移到独立 migration 工具（如 node-pg-migrate）。
- 发布前执行 migration，应用启动只做连接和健康检查。

当前进度（已落地）：
- 已支持 migration-only 模式：`MIGRATION_ONLY=true` 时仅执行迁移并退出，不启动 API。
- 已新增迁移脚本：`backend npm run migrate` / `migrate:prod`。
- 已新增安全启动脚本：`start:safe` / `dev:safe`，默认显式 `RUN_STARTUP_MIGRATIONS=false`。
- 已新增生产保护阀：生产环境下默认禁止 API 常规启动执行迁移，避免误操作（可通过 `ALLOW_STARTUP_MIGRATIONS_IN_PRODUCTION=true` 在应急窗口临时放开）。
- 已将启动迁移实现抽离为独立模块：`backend/src/db/startup-migrations.ts`，`app.ts` 仅保留编排逻辑。
- 已增加最小迁移执行记录：`schema_migrations`（当前记录项：`startup_bootstrap_v1`），便于后续平滑升级到版本化 migration 工具。
- 已新增迁移状态查看命令：`npm run migrate:status`（根目录）/ `backend npm run migrate:status`，可在发布后快速核验迁移执行记录。
- 已新增迁移结构校验命令：`npm run migrate:verify`，会自动检查关键表和字段完整性，失败时返回非 0 退出码，可直接接入 CI/CD。
- 已增强迁移结构校验：`migrate:verify` 现已覆盖关键索引与唯一约束检查。
- 已新增一键发布前数据库门禁：`npm run release:db:check`（migrate -> status -> verify）。
- 已新增 CI 数据库发布门禁：`.github/workflows/db-release-gate.yml` 自动执行 `release:db:check`。
- 已升级 Secret Scan 为严格阻断：CI 执行 `scripts/scan-secrets.sh`，并产出 SARIF 报告工件。
- 已新增运行时环境安全守卫：API/Worker 启动前校验弱密钥和高风险配置（`security:validate-env`）。
- 已新增功能总门禁 CI：`.github/workflows/functional-gate.yml` 自动执行 `verify:functional`。
- 已新增严格生产环境安全门禁：`.github/workflows/security-readiness.yml` 自动执行 `security:validate-env:strict`。
- 已新增密钥轮换执行手册：`docs/SECURITY_KEY_ROTATION_RUNBOOK.md`（含验证与回滚流程）。
- 已新增弱密钥拒绝回归测试：`Security Readiness` 包含反向用例，验证弱生产配置会被 env guard 拦截。
- 已新增发布前预检命令：`release:preflight`（严格环境校验 + DB 门禁），并纳入 `Functional Gate` 前置步骤。
- 已新增密钥轮换验收工作流：`.github/workflows/key-rotation-verification.yml`（手动触发，读取生产 secrets 进行严格校验）。
- 已新增轮换审计模板：`docs/SECURITY_ROTATION_EVIDENCE_TEMPLATE.md`，用于留存执行与验证证据。

### 10.2 热点缓存（Redis cache-aside）
- 首批接口：`/api/gallery`、`/api/memberships/me`（短 TTL）。
- 命中率目标 > 60%，降低数据库读压。

### 10.3 大对象外置
- `canvas_front/canvas_back` 与大型设计快照改为对象存储 URL。
- DB 仅存元数据、hash 和引用。

---

## 11. 里程碑验收指标（可直接用于周会）

### M1（Week 1 结束）
- 任务状态重启不丢失。
- AI 入队过载返回 503 + Retry-After。
- 敏感信息完成轮换并开启 secret scan。

### M2（Week 2 结束）
- API / Worker 拆分完成并独立部署。
- 错误码统一，前端不再“静默空数据”。
- 可观测大盘可看 QPS、P95、失败率、队列深度。

### M3（第 4-6 周）
- migration 流水线取代启动 DDL。
- 热点缓存上线。
- 大对象外置改造完成一期。

---

## 12. 最小实施清单（本周直接开工）

1. 新建 `backend/src/queue/state-repository.ts`，封装 Redis 任务状态读写。
2. 改造 `backend/src/queue/queues.ts`，移除内存 `jobStore` 主路径（仅保留兜底）。
3. 在 `backend/src/routes/index.ts` 为 `/jobs`、`/generate` 加限流与队列阈值判断。
4. 在 `frontend/lib/api-client.ts` 去掉 GET 401/403 返回 `null` 的静默逻辑。
5. 为错误返回增加 `code/requestId` 并前端透出。
6. 将 `startJobWorkers()` 从 `backend/src/app.ts` 分离到独立 worker 入口。

以上 6 项完成后，系统会从“能跑”提升到“可恢复、可控压、可定位问题”的稳定阶段。

---

## 13. 已完成事项（持续更新）

- [x] 任务状态持久化改造：引入 Redis 任务状态仓储，支持内存兜底与强制共享状态模式。
- [x] 背压与限流：`/jobs`、`/generate` 已接入 IP/用户限流与队列阈值过载拒绝。
- [x] API / Worker 进程拆分：提供独立 worker 入口与脚本，支持单独部署。
- [x] 统一错误模型：后端返回 `code/message/details/requestId`，前端透出错误码与请求 ID。
- [x] 基础可观测性：接入结构化日志、Prometheus 指标与 `/metrics` 受保护导出。
- [x] 启动迁移风险收敛：支持 migration-only、safe 启动脚本与生产误操作保护阀。
- [x] 迁移实现模块化：DDL 从 `app.ts` 抽离到 `backend/src/db/startup-migrations.ts`。
- [x] 迁移记录与查询：新增 `schema_migrations`、`migrate:status`。
- [x] 迁移发布门禁：新增 `migrate:verify`（表/字段/索引/约束）与 `release:db:check` 一键流程。
- [x] 一键功能核验流程：新增 `npm run verify:functional`（build + DB gate + tests-if-present）。
- [x] 运行时环境安全守卫：新增 `security:validate-env` 并接入 API/Worker 启动链路。
- [ ] 密钥轮换执行：`JWT_SECRET`、DB、MQ 生产凭据轮换与旧凭据失效（需在部署平台执行）。
- [x] 密钥轮换手册：已补齐 `docs/SECURITY_KEY_ROTATION_RUNBOOK.md`，支持标准化执行与回滚。
- [x] 密钥轮换验收工作流：新增 `Key Rotation Verification`，支持轮换后手动触发验收。
- [x] 密钥轮换审计模板：新增 `docs/SECURITY_ROTATION_EVIDENCE_TEMPLATE.md`。
- [x] Secret scan 严格门禁：CI 已强阻断扫描并产出 `gitleaks.sarif` 报告。
- [x] 数据库发布门禁 CI：新增 `DB Release Gate` workflow 自动执行迁移与结构校验。
- [x] 功能总门禁 CI：新增 `Functional Gate` workflow 自动执行 `verify:functional`。
- [x] 严格生产环境门禁 CI：新增 `Security Readiness` workflow 自动执行生产策略环境校验。
- [x] 弱密钥拒绝回归测试：CI 已验证弱生产密钥会被 `security:validate-env:strict` 拒绝。
- [x] 发布前预检命令：新增 `release:preflight`，统一执行严格环境与数据库门禁检查。
