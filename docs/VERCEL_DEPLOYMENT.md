# Vercel 部署指南

## 🚀 本地与 Vercel 环境差异

### 问题原因
本地环境可以访问 `127.0.0.1:8188` (您的本地 ComfyUI)，但 Vercel 云环境无法访问您的本地网络。

## 💡 解决方案

### 方案 1：使用云端 ComfyUI 服务 (推荐)

1. **使用 RunPod 等云服务**：
   ```bash
   # 在 Vercel 中设置环境变量
   COMFYUI_URL=12345-port-8188.proxy.runpod.net
   ```

2. **使用 Google Colab**：
   - 启动 ComfyUI with ngrok
   - 获取公网地址：`abcd1234.ngrok.io`
   - 设置环境变量：`COMFYUI_URL=abcd1234.ngrok.io`

3. **自建云服务器**：
   - 在 AWS/Azure/GCP 部署 ComfyUI
   - 配置公网访问和安全组
   - 设置环境变量

### 方案 2：纯前端模式 (简单)

如果暂时不需要 AI 功能，项目会自动使用占位符图像。

## 🔧 Vercel 环境变量配置

1. **登录 Vercel 控制台**
2. **进入项目设置**
3. **Environment Variables**
4. **添加变量**：
   ```
   Key: COMFYUI_URL
   Value: http://82.157.19.21:8188
   ```

## 🔍 调试步骤

1. **检查健康状态**：
   访问 `https://your-app.vercel.app/api/generate-image`
   
2. **查看环境信息**：
   响应会显示环境类型和服务器地址
   
3. **检查日志**：
   在 Vercel Functions 日志中查看连接错误

## 📋 云服务推荐

### RunPod (推荐)
- 成本低，按使用付费
- 提供预配置的 ComfyUI 模板
- 自动提供公网访问地址

### Google Colab
- 免费版本可用
- 需要定期重启
- 适合测试和开发

### Replicate
- API 调用方式
- 需要修改代码集成
- 更稳定但成本较高

## 🛠️ 本地测试

```bash
# 设置环境变量后测试
curl http://localhost:3000/api/generate-image

# 查看连接状态
curl "http://localhost:3000/api/generate-image?health=true"
```