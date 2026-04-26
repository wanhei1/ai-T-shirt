# bit810 域名上线收口执行单

目标：在保留 `www.bit810.cn` AI 功能可用的前提下，收紧端口暴露与上线风险。

## 1. 目标拓扑

1. `www.bit810.cn` -> 前端（HTTPS 443）。
2. `api.bit810.cn` -> 后端 API（HTTPS 443，反代到 8185/8189）。
3. ComfyUI (`8188`) 仅后端内网访问，不对公网开放。

## 2. DNS 规划

1. 保留 `www.bit810.cn` 现有记录。
2. 新增 `api.bit810.cn`：
- 记录类型：A 或 CNAME。
- 指向：后端网关/服务器。
3. TTL：建议 300 秒（切换阶段），稳定后可调高。

## 3. 服务器端口与安全组

公网开放：

1. 80/tcp（可选，仅跳转到 443）。
2. 443/tcp（必须）。

公网关闭：

1. 8188/tcp（ComfyUI）。
2. 8189/tcp（内部服务端口，若走反代则无需公网）。
3. 其他非必要端口。

验收：

1. `https://www.bit810.cn` 可访问。
2. `https://api.bit810.cn/health` 可访问。
3. `http://<公网IP>:8188` 与 `http://<公网IP>:8189` 应无法访问。

## 4. 反向代理建议（Nginx）

1. 为 `www.bit810.cn` 配置站点（前端 upstream）。
2. 为 `api.bit810.cn` 配置站点（后端 upstream）。
3. 全站 HTTP -> HTTPS 跳转。
4. 打开访问日志与错误日志。

## 5. 应用配置（本项目）

前端：

1. `NEXT_PUBLIC_API_URL=https://api.bit810.cn`
2. 保持 `AI_DIRECT_COMFYUI=false`（推荐）
3. 不使用公网 `NEXT_PUBLIC_COMFYUI_URL` 指向 `:8188`

后端：

1. `FRONTEND_URL=https://www.bit810.cn`
2. `COMFYUI_URL=http://127.0.0.1:8188` 或内网地址
3. 保持 AI 能力由后端队列/作业链路调用

## 6. 联调验证步骤

1. 前台触发一次 AI 生成，确认成功。
2. 管理端新增商品/SKU，确认成功。
3. 支付链路最小闭环跑通（创建意图 -> 回调 -> 状态更新）。
4. 物流与售后链路各跑 1 次。

## 7. Day 7 前置检查

1. `npm run migrate:verify`
2. `npm run release:guard`（需补齐 `RELEASE_CANDIDATE_METRICS_URL`）
3. `npm run dr:readiness`
4. `npm run billing:reconcile`

## 8. 常见误区

1. 误区：关掉 8188 公网后前台 AI 就不能用。
- 说明：只要后端到 ComfyUI 的内部链路通，前台依然可用。

2. 误区：直接给前端配置公网 8188 更快。
- 风险：会绕过后端鉴权与限流，增加滥用与攻击面。

3. 误区：本地压测结果可以直接做上线结论。
- 说明：Day 7 闸门应在云端接近生产拓扑执行。
