# 🎨 T恤设计器前端组件包 - 快速使用指南

## 📦 这个包包含什么？

这是一个完整的T恤设计器前端组件包，包含：

- ✅ **53个组件文件** - 完整的React/Next.js组件库
- ✅ **5个页面文件** - 设计流程的所有页面
- ✅ **UI组件库** - 基于shadcn/ui的完整组件系统
- ✅ **样式系统** - Tailwind CSS + 主题支持
- ✅ **TypeScript支持** - 完整的类型定义
- ✅ **配置文件** - Next.js、PostCSS等配置
- ✅ **详细文档** - 组件说明和使用指南

**总大小**: 0.29 MB (压缩后)，包含90个文件

## 🚀 三种使用方式

### 方式1: 快速启动 (推荐)

**Windows用户:**
```cmd
# 解压ZIP文件后，双击运行
quick-start.bat
```

**Linux/Mac用户:**
```bash
# 解压ZIP文件后，在终端运行
chmod +x quick-start.sh
./quick-start.sh
```

### 方式2: 手动安装

```bash
# 1. 解压ZIP文件到目标目录
# 2. 进入目录
cd your-extracted-folder

# 3. 安装依赖
bun install
# 或者使用 npm install 或 pnpm install

# 4. 启动开发服务器
bun run dev
# 或者使用 npm run dev 或 pnpm dev
```

### 方式3: 集成到现有项目

```bash
# 1. 复制需要的组件到你的项目
cp -r components/* your-project/components/
cp -r app/* your-project/app/

# 2. 复制配置文件
cp tailwind.config.ts your-project/
cp components.json your-project/

# 3. 安装依赖（查看package.json中的dependencies）
```

## 📁 核心文件说明

```
📦 组件包/
├── 🏠 app/                     # Next.js页面
│   ├── page.tsx               # 首页
│   ├── layout.tsx             # 布局
│   └── design/                # 设计页面
│       ├── page.tsx          # T恤选择
│       ├── editor/page.tsx   # 设计编辑器
│       └── preview/page.tsx  # 预览页面
├── 🧩 components/             # React组件
│   ├── design-tools/          # 设计工具
│   │   ├── ai-generator.tsx  # AI图像生成
│   │   └── image-uploader.tsx # 图像上传
│   └── ui/                    # 基础UI组件 (53个)
├── 🎨 styles/                 # 样式文件
├── 📷 public/                 # 静态资源
├── ⚙️ 配置文件               # Next.js, TypeScript等
└── 📚 文档文件               # 详细说明文档
```

## 🔧 主要功能

### 🎯 T恤设计流程
1. **选择T恤** - 款式、颜色、尺码
2. **添加设计** - AI生成或上传图像  
3. **编辑设计** - 拖拽、缩放、旋转
4. **预览确认** - 3D预览效果
5. **保存导出** - 设计文件导出

### 🤖 AI图像生成
- ComfyUI集成 - 专业AI图像生成
- 多种艺术风格 - 卡通、写实、抽象等
- 预设提示词 - 快速生成创意设计
- 实时状态监控 - 生成进度显示

### 📤 图像上传
- 拖拽上传 - 直观的用户体验
- 多格式支持 - JPG, PNG, GIF, SVG
- 预览功能 - 上传前预览效果
- 大小限制 - 自动压缩和验证

### 🎨 UI组件库
- **53个组件** - 按钮、输入框、对话框等
- **响应式设计** - 支持所有设备尺寸
- **主题支持** - 明亮/暗黑模式切换
- **无障碍设计** - 符合WCAG标准

## 🔗 外部依赖

这个组件包需要以下外部服务：

### ComfyUI (AI图像生成)
- **默认地址**: `http://82.157.19.21:8188/`
- **配置方式**: 环境变量 `COMFYUI_URL`
- **功能**: AI图像生成和处理

### 图像上传API
- **默认端点**: `/api/upload-image`
- **功能**: 处理用户上传的图像文件

## ⚙️ 环境配置

创建 `.env.local` 文件：

```env
# ComfyUI配置
COMFYUI_URL=http://82.157.19.21:8188/

# 其他配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🎯 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript 5.0+
- **样式**: Tailwind CSS 3.4+
- **组件**: shadcn/ui + Radix UI
- **包管理**: Bun (推荐) / npm / pnpm
- **部署**: Vercel (推荐) / 其他平台

## 📱 浏览器支持

- ✅ Chrome 90+
- ✅ Firefox 90+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ 移动浏览器

## 🚨 常见问题

### Q: 启动后看不到AI生成功能？
A: 检查ComfyUI服务器是否可访问，确认环境变量配置正确。

### Q: 上传功能不工作？
A: 检查上传API端点是否正确，查看浏览器控制台错误信息。

### Q: 样式显示异常？
A: 确保正确安装了Tailwind CSS依赖，检查PostCSS配置。

### Q: TypeScript报错？
A: 运行 `bun run build` 检查类型错误，确保所有依赖已安装。

## 📚 详细文档

- 📖 **[FRONTEND_COMPONENTS_README.md](./FRONTEND_COMPONENTS_README.md)** - 详细组件说明
- 🤝 **[CONTRIBUTING.md](./CONTRIBUTING.md)** - 贡献指南
- 🏗️ **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** - 项目结构

## 🆘 获取帮助

- 🐛 报告问题: [GitHub Issues](https://github.com/wanhei1/v0-t-shirt-design-editor/issues)
- 💬 讨论交流: [GitHub Discussions](https://github.com/wanhei1/v0-t-shirt-design-editor/discussions)
- 📧 联系维护者: [@wanhei1](https://github.com/wanhei1)

---

🎉 **享受T恤设计的乐趣吧！** 如果你喜欢这个组件包，别忘了给项目点个星标 ⭐