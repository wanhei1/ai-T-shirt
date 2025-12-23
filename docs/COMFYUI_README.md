# Custom T-Shirt Designer - ComfyUI 集成

这个项目现在支持使用 ComfyUI 进行 AI 图像生成！

## 🚀 ComfyUI 集成功能

### ✨ 主要特性
- **完整的 ComfyUI API 客户端** - 基于官方 API 文档实现
- **智能回退机制** - ComfyUI 不可用时自动使用占位符
- **多种艺术风格** - 支持写实、卡通、动漫、抽象、极简、复古风格
- **专用 T 恤工作流** - 针对服装设计优化的生成参数
- **实时状态追踪** - 显示生成进度和错误信息
- **健康检查 API** - 监控 ComfyUI 服务器状态

### 🎨 支持的艺术风格

| 风格 | 描述 | 优化参数 |
|------|------|----------|
| **写实 (Realistic)** | 照片级真实感 | 25步骤, CFG=7.5, DPM++2M |
| **卡通 (Cartoon)** | 彩色有趣的插画风格 | 20步骤, CFG=8.0, Euler |
| **动漫 (Anime)** | 日式动漫风格 | 20步骤, CFG=7.0, DPM++2M |
| **抽象 (Abstract)** | 抽象艺术风格 | 30步骤, CFG=9.0, Euler A |
| **极简 (Minimalist)** | 简洁现代设计 | 15步骤, CFG=6.0, Euler |
| **复古 (Vintage)** | 复古经典外观 | 25步骤, CFG=8.5, DPM++2M |

## 🛠️ 设置指南

### 1. 安装 ComfyUI
```bash
# 克隆 ComfyUI 仓库
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# 安装依赖
pip install -r requirements.txt

# 启动 ComfyUI（默认端口 8188）
python main.py
```

### 2. 配置环境变量
```bash
# 复制示例配置文件
cp .env.example .env.local

# 编辑配置
nano .env.local
```

```env
# ComfyUI 服务器地址
COMFYUI_URL=127.0.0.1:8188

# 模型文件名（放在 ComfyUI/models/checkpoints/ 目录）
COMFYUI_MODEL=v1-5-pruned-emaonly.ckpt
```

### 3. 下载模型
将 Stable Diffusion 模型文件放入 ComfyUI 的 `models/checkpoints/` 目录：

推荐模型：
- **v1-5-pruned-emaonly.ckpt** - 基础 SD 1.5 模型
- **sd_xl_base_1.0.safetensors** - 高质量 SDXL 模型

### 4. 启动项目
```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev
```

## 🧪 测试 ComfyUI 连接

访问健康检查端点来验证连接：
```
GET http://localhost:3000/api/generate-image
```

响应示例：
```json
{
  "status": "ok",
  "comfyUIAvailable": true,
  "serverAddress": "127.0.0.1:8188"
}
```

## 🎯 使用方法

1. **打开 AI 生成器**: 在设计页面点击 "AI Image Generator"
2. **输入描述**: 描述您想要的 T 恤设计
3. **选择风格**: 选择合适的艺术风格
4. **生成图像**: 点击生成按钮或按 Ctrl+Enter
5. **查看结果**: 生成的图像会显示在下方

### 提示词建议

#### 🔥 好的提示词示例
- "A fierce dragon with colorful flames, suitable for T-shirt"
- "Minimalist mountain landscape with geometric shapes"
- "Cute cartoon cat wearing sunglasses, vector style"
- "Abstract watercolor splash in vibrant rainbow colors"

#### ❌ 避免的内容
- 包含文字的设计（会被过滤）
- 过于复杂的背景
- 低质量或模糊的要求

## 🚨 故障排除

### ComfyUI 连接问题
```bash
# 检查 ComfyUI 是否运行
curl http://localhost:8188/queue

# 检查防火墙设置
# 确保端口 8188 未被阻止
```

### 常见错误

| 错误信息 | 解决方案 |
|----------|----------|
| "ComfyUI server is not available" | 确保 ComfyUI 正在运行在正确端口 |
| "Generation timeout" | 增加 COMFYUI_TIMEOUT 设置 |
| "Model not found" | 检查模型文件是否在正确目录 |

### 日志调试
```bash
# 查看开发服务器日志
bun run dev

# ComfyUI 日志在其终端窗口中显示
```

## 🔧 高级配置

### 自定义工作流
您可以修改 `lib/tshirt-workflows.ts` 来创建自定义的生成工作流。

### 环境变量完整列表
```env
COMFYUI_URL=127.0.0.1:8188          # ComfyUI 服务器地址
COMFYUI_MODEL=v1-5-pruned-emaonly.ckpt  # 默认模型
COMFYUI_TIMEOUT=300000               # 生成超时（毫秒）
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License