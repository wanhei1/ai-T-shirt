# 计划：连接 AI 文生图 + AI 模特试穿 到 PM2 系统

## 目标
让 PM2 管理的 tshirt-backend 能够调用 ComfyUI 服务，实现：
1. AI 文生图 (Text-to-Image) — POST `/generate`
2. AI 模特试穿 (Virtual Try-On) — POST `/jobs` (type: "virtual-tryon")

## 当前状态
- tshirt-backend: PM2 运行中 (端口 8189) ✓
- tshirt-frontend: PM2 运行中 (端口 3000) ✓
- Redis: 运行中 ✓
- RabbitMQ: Docker 运行中 ✓
- ComfyUI: **离线** (端口 8188 不可达)
- ComfyUI venv: 缺少依赖 (pyyaml, typing_extensions 等)

## 需要解决的问题

### 问题 1: ComfyUI venv 依赖不完整
- 现象: `No module named 'yaml'`, `No module named 'typing_extensions'`
- 方案: 重新安装 ComfyUI requirements.txt

### 问题 2: ComfyUI 启动配置
- 需要确定 GPU 分配 (当前 GPU 5, 6 空闲)
- 需要确定启动参数 (--listen, --port, --cuda-device)

### 问题 3: 模型文件确认
- 文生图模型: Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors ✓ (已存在)
- CatVTON 模型: ✓ (已存在)
- SD1.5 Inpaint 模型: ✓ (已存在)
- VAE 模型: ✓ (已存在)

### 问题 4: ComfyUI 自定义节点
- ComfyUI_CatVTON_Wrapper: 需要确认是否已安装
- 其他自定义节点依赖

## 执行步骤

### Step 1: 修复 ComfyUI venv 依赖
```bash
cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer
ComfyUI/.venv/bin/pip install -r ComfyUI/requirements.txt
```
预计时间: 2-5 分钟

### Step 2: 启动 ComfyUI
```bash
CUDA_VISIBLE_DEVICES=5 ComfyUI/.venv/bin/python ComfyUI/main.py \
  --listen 0.0.0.0 \
  --port 8188 \
  --cuda-device 0
```
预计时间: 30-60 秒

### Step 3: 验证 ComfyUI 连接
```bash
curl -sf http://127.0.0.1:8188/system_stats
```
预期输出: JSON 包含 GPU 信息

### Step 4: 验证后端 Worker 连接
```bash
# 检查后端日志
pm2 logs tshirt-backend --lines 20
```
预期: 无 ComfyUI 连接错误

### Step 5: 端到端测试 - 文生图
```bash
curl -X POST http://localhost:8189/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cute cat wearing a t-shirt"}'
```
预期: 返回生成的图片 URL

### Step 6: 端到端测试 - 虚拟试穿
```bash
curl -X POST http://localhost:8189/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "virtual-tryon",
    "payload": {
      "personDataUrl": "data:image/png;base64,...",
      "clothDataUrl": "data:image/png;base64,..."
    }
  }'
```
预期: 返回 job ID，状态变为 completed

### Step 7: 配置 ComfyUI 开机自启 (可选)
- 创建 ComfyUI 启动脚本
- 添加到 crontab @reboot 或 PM2 ecosystem

## 风险与注意事项

1. **依赖安装可能耗时较长** — torch 等大包需要下载
2. **GPU 显存** — ComfyUI + SDXL 模型约需 8-12GB 显存，GPU 5 (24GB) 足够
3. **CatVTON 节点依赖** — 需要 detectron2, DensePose 等，可能需要额外安装
4. **ComfyUI 版本兼容性** — 确保自定义节点与 ComfyUI 版本匹配

## 验收标准
- [ ] ComfyUI 端口 8188 可访问
- [ ] POST `/generate` 返回生成图片
- [ ] POST `/jobs` (virtual-tryon) 返回试穿结果
- [ ] PM2 进程无错误日志
