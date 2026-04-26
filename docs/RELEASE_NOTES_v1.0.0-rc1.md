# v1.0.0-rc1 Release Draft

发布日期：2026-04-07
标签：v1.0.0-rc1
类型：Release Candidate

## 本次版本概览

本次 RC 聚焦于可收费电商最小闭环能力补齐与上线前收口能力建设，覆盖支付、履约、售后、按单生产主数据、管理端运营面板，以及上线闸门与运维脚本体系。

## 主要功能与改进

### 1. 支付闭环与状态可追溯

- 支持支付意图创建与支付回调处理。
- 增强支付状态机与幂等处理，降低重复回调引发的数据不一致风险。
- 增加支付事件留存能力，便于排障、追溯与重放。

### 2. 履约闭环

- 增加发货与物流追踪主链路。
- 管理端可录入和更新物流状态。
- 用户侧可查看订单物流信息。

### 3. 售后与退款最小闭环

- 支持售后申请、管理端审核与状态推进。
- 退款状态联动与可追踪性增强。

### 4. 按单生产能力（零库存模式）

- 新增商品与 SKU 主数据模型。
- 支持每日产能配额配置与排产约束。
- 支持承诺发货时间相关字段，增强交付预期可管理性。

### 5. 管理端运营能力增强

- 新增 SKU 列表维护能力：改价、上下架、SLA 调整。
- 新增每日产能配置面板。
- 新增商品与 SKU 快速初始化表单。
- 新增快速复制上一条 SKU 参数能力，提升同款多尺码初始化效率。

### 6. 上线收口与运维可观测性

- 补充对账、DR 就绪检查、成本观测相关脚本与工作流。
- 完善上线闸门模板与 Go/No-Go 报告模板。

## 变更范围（模块级）

- Backend：路由、模型、迁移校验、发布守卫、DR 与对账检查。
- Frontend：管理端页面、用户订单展示、API 客户端类型与调用补全。
- Docs：上线缺口清单、DR 与成本观测文档、Go/No-Go 模板。
- CI/CD：新增多项运维与巡检工作流。

## 已知风险与当前结论

当前结论：No-Go（临时）。

阻塞项：

1. 发布守卫未通过：缺少 RELEASE_CANDIDATE_METRICS_URL。
2. 24 小时压测证据未提交。
3. 故障注入演练证据未提交。

非阻塞但建议收敛：

1. DR 就绪检查虽通过，但存在若干放宽配置项，建议在正式放量前逐项收敛。

## 升级与验证建议

发布前建议按顺序完成：

1. 配置发布守卫依赖环境变量并重跑发布守卫。
2. 执行 24 小时压测并落盘产物。
3. 执行 Day 7 故障注入演练并记录恢复时长。
4. 更新 Go/No-Go 报告并完成签审。

## 相关文档

- docs/LAUNCH_MASTER_PLAN.md
- docs/README_L1_LAUNCH_GAP_CHECKLIST.md
- docs/GO_NO_GO_REPORT_TEMPLATE.md
- docs/GO_NO_GO_REPORT_FILLABLE.md
- docs/DR_RUNBOOK.md
- docs/COST_OBSERVABILITY_AND_UNIT_ECONOMICS.md

## 建议发布文案（可直接粘贴到 GitHub Release）

This release candidate finalizes the core launch-readiness flow for a chargeable custom apparel e-commerce MVP, including payment, fulfillment, after-sales, make-to-order production controls, and admin initialization workflows.

Current status is temporary No-Go pending final release guard metrics wiring, 24h load test evidence, and fault-injection evidence closure.
