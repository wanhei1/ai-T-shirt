# 基于 system-design-primer 的“可规模化稳定运行”差距评估（2026-04-03）

## 1. 评估说明
本报告基于 `donnemartin/system-design-primer` 的核心主题进行独立对照评估，重点关注以下维度：

- Performance vs Scalability
- Latency vs Throughput
- Availability vs Consistency
- Load Balancer / Reverse Proxy / Stateless
- Database growth & HA strategy
- Cache strategy
- Asynchronism / Queue / Back pressure
- Observability / SLO / Alerting
- Security baseline

目标是回答一个问题：当前系统距离“可规模化稳定运行”还差什么。

---

## 2. 当前状态摘要（结论先行）

系统已从“能跑”进入“有基础工程治理”的阶段，但尚未达到“可规模化稳定运行”。

已具备的关键基础：
- 队列和异步链路已建立（RabbitMQ + 独立 worker）
- 任务状态支持 Redis 持久化（并有受控回退策略）
- 基础限流、队列阈值和过载返回已落地
- 已暴露 metrics，并具备结构化日志和 requestId

仍缺的关键能力：
- 状态型依赖的生产级高可用（DB/MQ/Redis 托管或集群化故障切换）
- 从“采集指标”到“自动告警与SLO闭环”的运维体系
- 容量管理、压测基线、故障演练（GameDay）
- 数据层中长期扩展策略（读写分离、归档、冷热分层）

一句话判断：
- 当前是“可运行 + 局部可扩展”，还不是“可规模化稳定运行”。

---

## 3. 对照 system-design-primer 的差距清单

## P0（优先补齐，直接影响稳定性）

### 3.1 高可用拓扑不完整（大部分已解决）
现状：
- 已提供可执行 HA 拓扑：`2x API + 2x Worker + Nginx LB + readiness`，并将迁移独立为 one-shot `migrate` job。
- 已新增依赖层 HA 演练编排（PostgreSQL 主备、RabbitMQ 多节点、Redis Sentinel）与应用侧多端点故障切换（`DATABASE_URLS` / `RABBITMQ_URLS` / `REDIS_URLS`）。

风险：
- 本地/自建 HA 仍需要运维治理（备份、监控、自动故障转移策略、演练）。
- 生产稳定性仍更建议托管 HA 服务承接。

Primer 映射：
- Availability patterns（active-passive / active-active）
- Load balancer + horizontal scaling

已完成：
- API 双实例 + L7 负载均衡 + `GET /health/ready` 就绪探针。
- Worker 多副本并行消费，迁移从 API 启动链路中剥离。
- DB/MQ/Redis 多端点连接探测与故障切换能力。
- 依赖层 HA 演练编排与运行脚本。

剩余建议（依赖层）：
- PostgreSQL 优先迁移到托管高可用（或主备 + 自动故障转移）。
- RabbitMQ/Redis 使用托管方案或哨兵/集群，避免单机故障域。

你要做的 8 件事

替换所有示例密钥
在 docker-compose.ha.yml 和 docker-compose.deps-ha.yml 里把示例密码全部换成真实强密码（JWT、DB、Rabbit、Redis）。

选定依赖层 HA 方案
二选一即可：

托管版（推荐）：云厂商 PostgreSQL HA + Redis HA + RabbitMQ 托管
自建版：继续基于 docker-compose.deps-ha.yml 演练并完善自动切换
配置多端点连接变量
在你的真实环境里设置：
DATABASE_URLS
RABBITMQ_URLS
REDIS_URLS
示例格式在 .env.example。
跑一次迁移并验证
先执行 npm run migrate:backend，再启动服务，确保迁移和启动链路在你的环境都通过。

启动并验证 HA 拓扑

启动应用层 HA：npm run dev:infra:ha
验证就绪探针：/health/ready
验证 LB 入口：/health
实现代码在 app.ts。
做一次故障切换演练（必须）
手工停一个 API、停一个 Redis 节点、停一个 Rabbit 节点，确认业务是否连续、恢复是否符合预期。

把监控告警补齐
当前你还差“指标到告警闭环”。下一步按 SYSTEM_DESIGN_PRIMER_GAP_ANALYSIS_2026-04-03.md 的 3.2 做告警规则（5xx、P95、队列深度、任务失败率、依赖可达性）。

更新部署文档为你的最终方案
把你实际采用的托管服务地址、切换流程、回滚流程写进 README.md 和运维文档，避免只停留在本地演练。

如果你愿意，我下一步可以直接帮你生成一份“生产环境变量模板 + 演练SOP（一步一步命令）”。

### 3.2 观测“有数据”但缺“告警与SLO闭环”（已解决）
现状：
- 已补齐依赖观测指标：`dependency_up`（DB/MQ/Redis 可达性）与 `dependency_check_duration_seconds`（探测延迟）。
- 已补齐队列排队时长指标：`job_queue_wait_duration_seconds`，可直接用于队列等待 SLO。
- 已落地告警规则文件：`backend/monitoring/prometheus/rules/tshirt-alerts.yml`（API/队列/AI/依赖四类）。
- 已落地值班与告警路由模板：`backend/monitoring/alertmanager/alertmanager.yml`。
- 已落地 SLO 与响应文档：`docs/SLO_TARGETS.md`、`docs/OBSERVABILITY_ONCALL_RUNBOOK.md`、`docs/ALERTING_SETUP.md`。

闭环说明：
- 指标采集：应用定时探测依赖状态 + 请求/队列/AI 指标。
- 自动告警：Prometheus 规则触发 + Alertmanager 分级路由。
- 响应流程：按值班 runbook 分级处置并复盘。
- SLO 治理：按误差预算约束发布节奏。

剩余建议（生产落地）：
- 将 Alertmanager webhook 替换为企业 IM/电话网关并完成演练。
- 将告警规则接入实际 Prometheus 实例并做 1 次故障演习验收。

### 3.3 容量管理缺位（缺压测基线和扩容阈值）（已解决）
现状：
- 已落地三类标准化压测脚本（k6）：
  - API 同步读写：`scripts/perf/k6/api-sync-rw.js`
  - AI 异步入队/出队：`scripts/perf/k6/ai-async-queue.js`
  - 依赖异常注入探针：`scripts/perf/k6/dependency-chaos.js`
- 已落地可执行压测入口与一键套件：
  - `npm run perf:api-sync-rw`
  - `npm run perf:ai-async`
  - `npm run perf:dependency-chaos` / `npm run perf:dependency-chaos:inject`
  - `npm run perf:capacity-suite`
- 已落地容量基线与扩容阈值文档：
  - `docs/CAPACITY_BASELINE_AND_SCALING.md`
  - `docs/CAPACITY_BASELINE_REPORT_TEMPLATE.md`

闭环说明：
- 压测标准化：统一脚本 + 统一 summary 导出（`artifacts/perf/<timestamp>`）。
- 基线可复现：每次执行形成结构化结果，可做版本对比。
- 扩容可执行：定义了 API/Worker 扩缩容触发阈值、冷却时间、发布门禁。

剩余建议（生产落地）：
- 将压测结果接入 CI 的定时任务（至少每周一次），自动生成基线报告。
- 将扩容阈值映射到实际 HPA/弹性策略并完成一次演练验收。

---

## P1（1-3 周内，影响扩展效率和长期稳定）

### 3.4 数据层扩展策略尚不完整（已解决）
现状：
- 已落地读写分离能力：
  - 主库：`DATABASE_URL` / `DATABASE_URLS`
  - 读库（可选）：`DATABASE_READ_URL` / `DATABASE_READ_URLS`
  - 读密集接口可自动走读库（未配置读库时回退主库）。
- 已落地冷热分层基础：新增 `orders_archive` 冷数据表与索引。
- 已落地索引审计与慢查询治理脚本：`npm run db:index-audit`。
- 已落地归档执行脚本（默认 dry-run）：`npm run db:archive-orders`。
- 已落地分区迁移流程文档：`docs/DATA_LAYER_SCALING_STRATEGY.md`。

Primer 映射：
- Database（replication / partition / SQL tuning / denormalization）

闭环说明：
- 读写分离：降低主库查询压力，读流量可横向扩展。
- 冷热分层：历史订单可归档，控制主表膨胀与备份窗口。
- 索引与慢查询：有可执行审计脚本，支持持续优化。
- 分区演进：提供低风险分阶段迁移策略（shadow table + backfill + cutover）。

剩余建议（生产落地）：
- 为 `db:index-audit` 建立固定审计节奏（至少每周一次）。
- 在低峰窗口执行归档任务并记录性能收益（表大小、备份耗时、查询延迟）。

### 3.5 缓存策略仍偏“局部优化”，未形成全局策略（已解决）
现状：
- 已落地 Top N 热点接口 cache-aside（`/gallery`、`/gallery/:designId`、`/cart`、`/orders`、`/orders/summary`、`/admin/orders`、`/memberships/me`、`/memberships/transactions/me`）。
- 已统一 TTL 配置与环境变量治理（`*_CACHE_TTL_SECONDS`）。
- 已统一主动失效触发点：订单创建/结算、购物车变更、会员变更、商城发布。
- 已补齐缓存指标与看板查询：`cache_requests_total`、`cache_backsource_total` + 按路由命中率/回源率 PromQL。
- 已补齐告警：`CacheHitRateLow`（15m 命中率低于阈值）。

Primer 映射：
- Cache（cache-aside / invalidation / TTL）

闭环说明：
- 策略文档：`docs/CACHE_STRATEGY_AND_SLOS.md` 明确 Top N、TTL、失效点与一致性优先级。
- 代码落地：`backend/src/routes/index.ts` 统一读穿缓存与写后主动失效。
- 可观测闭环：`docs/SLO_TARGETS.md` 新增缓存面板，`backend/monitoring/prometheus/rules/tshirt-alerts.yml` 新增缓存命中率告警。

剩余建议（生产落地）：
- 按周复盘 Top N 路由命中率，基于真实流量微调 TTL 与失效范围。
- 对高并发 key 逐步引入防击穿手段（singleflight/互斥重建）。

运行一次 db:index-audit + 缓存指标基线采样，给出首版 TTL 调优建议。
增加“缓存击穿保护”（singleflight/互斥重建）到最热点 key。
补一个小型压测场景，验证 cache hit ratio 和 DB 回源下降幅度。
### 3.6 多环境一致性与发布策略可进一步工程化（已解决）
现状：
- 已落地发布策略门禁工作流：`.github/workflows/release-rollout-gate.yml`（支持 canary / blue-green）。
- 已落地发布守门脚本：`backend/src/release/slo-rollout-guard.ts`，基于真实 `/metrics` 采样判定是否允许推广。
- 已落地自动回滚触发能力：门禁失败时可向 `RELEASE_ROLLBACK_WEBHOOK_URL` 发回滚事件。
- 已落地标准化发布文档：`docs/RELEASE_STRATEGY_CANARY_BLUEGREEN.md`。

Primer 映射：
- Availability + reliability engineering（变更即风险源）

闭环说明：
- 发布前一致性：`release:preflight` 统一执行严格环境校验 + 数据库发布校验。
- 发布中判据：以 SLO 阈值和劣化阈值进行 canary/blue-green 自动判定。
- 发布后兜底：失败自动触发回滚 webhook（可选），避免人工反应延迟。

判据（可配置环境变量）：
- `RELEASE_MAX_ERROR_RATE`（默认 2%）
- `RELEASE_MAX_API_P95_SECONDS`（默认 1.0s）
- `RELEASE_MAX_QUEUE_WAIT_P95_SECONDS`（默认 120s）
- `RELEASE_MIN_DEPENDENCY_UP_RATIO`（默认 1.0）
- 相对劣化阈值：`RELEASE_MAX_*_DEGRADATION_RATIO`

剩余建议（生产落地）：
- 将 rollback webhook 接到实际发布编排器（K8s/负载均衡控制器）完成自动回切。
- 对每次发布保留 gate 结果归档，形成周度变更稳定性复盘数据。

---

## P2（中期，提升上限与运营效率）

### 3.7 业务层多区域与灾备能力尚未规划
现状：
- 尚未形成多可用区/跨区域容灾目标（RTO/RPO）。

建议：
- 给出分级目标：
  - 核心交易链路 RTO/RPO
  - AI 异步链路 RTO/RPO
- 从“同城多可用区”开始，逐步演进至跨区域备份恢复演练。

### 3.8 成本可观测与容量成本模型不足
现状：
- 关注功能和稳定性，成本指标（单任务成本、峰值成本）未成为常规看板。

建议：
- 建立单位业务成本模型：每 1000 次生成/试衣的资源成本。
- 将扩容策略和成本阈值联动，避免盲目 over-provision。

---

## 4. 你现在“已经有”的能力（避免重复投入）

以下能力已具备或已部分具备，可作为下一阶段基座：

- 队列与异步链路：
  - RabbitMQ 队列消费 + 独立 worker 进程
- 任务状态可恢复：
  - Redis Job State Repository（可持久化任务状态、进度、日志）
- 背压与限流：
  - 队列阈值与 429/503 + Retry-After
- 可观测性基础：
  - `/metrics` 导出、HTTP/队列/ComfyUI 指标、结构化日志
- 错误语义：
  - 标准化错误体（code/message/details/requestId）

这意味着：下一步不应再投入“是否需要队列/指标”之类基础讨论，而应投入“HA、SLO告警、容量工程、灾备”的系统化建设。

---

## 5. 30-60-90 天路线图（建议）

### 30 天（先稳住）
- 完成 API 双实例 + LB 健康检查。
- 建立生产告警最小集（5xx/P95/队列深度/任务失败率/依赖健康）。
- 输出第一版容量基线（压测报告 + 扩容阈值）。

### 60 天（可扩展）
- 数据层完成慢查询治理与冷热分层方案。
- 完成缓存策略白名单化（Top N 热点接口）并上线命中率看板。
- 发布流程引入金丝雀或蓝绿，接入回滚判据。

### 90 天（可规模化稳定运行）
- MQ/Redis/DB 达到无单点目标（托管 HA 或等效自建 HA）。
- 完成一次全链路故障演练（含复盘和改进闭环）。
- SLO 运行至少一个完整周期，并以误差预算驱动发布节奏。

---

## 6. 目标验收标准（达到“可规模化稳定运行”）

满足以下条件可判定进入该阶段：

- 架构层：关键组件无单点，故障可自动切换或快速人工切换。
- 观测层：指标、日志、告警、值班、复盘形成闭环。
- 运行层：有容量基线与扩容策略，峰值时可预测、可降级、可恢复。
- 数据层：数据增长有明确分层、归档、索引和恢复策略。
- 交付层：发布、回滚、变更风险控制标准化。

---

## 7. 最终判断

相较 system-design-primer 的“可扩展 + 高可用 + 可运维”标准，
你当前系统已完成“基础可靠性建设”，但尚差“高可用拓扑 + SLO 驱动运维 + 容量与灾备工程化”三件大事。

优先完成这三件事后，系统才会从“工程上可运行”跃迁到“业务上可规模化稳定运行”。
