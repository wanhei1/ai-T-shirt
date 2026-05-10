# YITUAI（T 恤设计平台）完整工作进度报告

> 最后更新: 2026-05-10

## 项目信息

- **仓库**: https://github.com/wanhei1/ai-T-shirt
- **本地路径**: `/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/`
- **服务器**: 82.157.19.21（3090 服务器）
- **技术栈**: Next.js 14 + Express.js + PostgreSQL + RabbitMQ + Redis + ComfyUI

---

## 当前运行状态

| 服务 | 端口 | PM2 状态 | PID |
|------|------|----------|-----|
| tshirt-backend | 127.0.0.1:8189 | ✅ online | 3118 |
| tshirt-frontend | 127.0.0.1:3000 | ✅ online | 3130 |
| PostgreSQL | 127.0.0.1:5432 | ✅ 运行中 | — |
| Redis | 127.0.0.1:6379（已加密码） | ✅ 运行中 | — |
| RabbitMQ | 127.0.0.1:5672（独立 vhost） | ✅ 运行中 | — |
| ComfyUI | 127.0.0.1:8188 | ⚠️ 需手动启动 | — |

---

## 已完成工作

### 一、功能开发（10 个 commit）

| Commit | 说明 |
|--------|------|
| `e75dec9` | fix: 修复订单汇总 SQL + 移动端缩略图 |
| `cfe1bec` | fix: 商城页面图片用 API 端点替代 base64 |
| `739aef3` | feat: 移动端汉堡菜单导航 |
| `04bd596` | feat: 编辑器移动端布局 + 触摸事件 |
| `3a65cf5` | feat: 移动端响应式修复（Phase 3+4） |
| `0f8217b` | feat: 下单后支付宝二维码支付 |
| `b2ee6b9` | perf: 后台订单 API 排除 base64 画布数据 |

### 二、安全加固（5 个 commit）

| Commit | 说明 |
|--------|------|
| `48e0755` | security: 前端 API 路由强制认证 + 速率限制 + 后端权限加固 |
| `21f117c` | security: 服务绑定 127.0.0.1 + 删除 test-comfyui 路由 |
| `22f5905` | chore: 4 个 GitHub Actions 工作流改为手动触发 |
| （未提交） | repo cleanup 分支 6 个 commit（见下方） |

### 三、仓库整理（chore/repo-cleanup 分支，6 个 commit，已推送）

| Commit | 说明 |
|--------|------|
| `016be0e` | chore: .gitignore 补充 *.log, uploads/ |
| `f25e6cd` | chore: 移除 zip 归档 + frontend-components-package |
| `741a0e6` | docs: 20 个散落文件归类到 docs/ |
| `02d89c8` | build: ecosystem.config.js PM2 统一配置（已 revert） |
| `5225272` | docs: 代码卫生报告（ts-prune + depcheck） |
| `6898f91` | docs: .env.example + README 快速开始 + .gitignore 修复 |

### 四、安全审计 sudo 待办（全部完成 ✅）

| 待办 | 状态 | 日期 |
|------|------|------|
| Express/Next.js 绑定 127.0.0.1 | ✅ | 2026-05-06 |
| 删除 /api/test-comfyui 危险路由 | ✅ | 2026-05-06 |
| RabbitMQ 独立用户 tshirt + vhost tshirt | ✅ | 2026-05-10 |
| Redis 加密码 | ✅ | 2026-05-10 |
| frp 移除后端公网暴露 | ✅ | 2026-05-10 |

---

## 未完成 / 待跟进

| 项目 | 优先级 | 说明 |
|------|--------|------|
| repo-cleanup 分支合并 | 高 | 已推送，等你在 GitHub 创建 PR 并合并 |
| 下单验证 bug | 中 | designData.elements 为空数组导致下单失败，排查中断未修复 |
| ComfyUI 启动脚本 | 中 | 需通过 junrong 的 conda 环境启动，尚未写入自动化 |
| simple-comfyui-client.ts 硬编码 IP | 低 | frontend/lib/ 中仍有 `82.157.19.21:8188` 引用 |
| build cache 清理 | 低 | .next-tyx/.next-junrong 有删除路由的残留引用 |

---

## 关键配置备忘

```bash
# 启动 ComfyUI
source /usrhome/junrong/miniconda3/etc/profile.d/conda.sh && \
conda activate /usrhome/junrong/miniconda3/envs/comfyui && \
cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI && \
python main.py

# PM2 管理
pm2 reload tshirt-backend --update-env
pm2 reload tshirt-frontend --update-env
pm2 save

# frp（a1 用户管理）
sudo systemctl restart frpc
```

---

## 服务器基础设施（novel-* Docker 栈，非本项目）

| 服务 | 端口 | 说明 |
|------|------|------|
| novel-elasticsearch | 9200 | 小说项目，未使用 |
| novel-kibana | 5601 | 小说项目，未使用 |
| novel-rabbitmq | 5672 | T 恤项目共用，已独立 vhost |
| novel-mysql | 3307 | 小说项目，未使用 |
| novel-nacos-server | 8848 | 小说项目，未使用 |
| novel-xxl-job-admin | 8080 | 小说项目，未使用 |
