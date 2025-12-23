# 🎨 T恤设计器前端组件说明文档

## 📋 概述

这个前端组件包包含了T恤设计器应用的所有核心UI组件、页面和样式文件。使用React、Next.js 14、TypeScript和Tailwind CSS构建，提供了完整的T恤设计体验。

## 📁 项目结构

```
frontend-components/
├── app/                          # Next.js 应用路由
│   ├── globals.css              # 全局样式
│   ├── layout.tsx               # 根布局组件
│   ├── page.tsx                 # 首页
│   ├── design/                  # 设计页面路由
│   │   ├── page.tsx            # T恤选择页面
│   │   ├── editor/             # 设计编辑器
│   │   │   └── page.tsx        # 编辑器主页面
│   │   └── preview/            # 预览页面
│   │       └── page.tsx        # 预览主页面
│   └── api/                    # API路由（后端相关）
├── components/                  # React组件库
│   ├── comfyui-status-card.tsx # ComfyUI状态卡片
│   ├── theme-provider.tsx      # 主题提供器
│   ├── design-tools/           # 设计工具组件
│   │   ├── ai-generator.tsx    # AI图像生成器
│   │   └── image-uploader.tsx  # 图像上传器
│   └── ui/                     # 基础UI组件（shadcn/ui）
├── hooks/                      # React自定义Hook
├── lib/                        # 工具库
├── styles/                     # 样式文件
└── public/                     # 静态资源
```

## 🧩 核心组件详解

### 1. 页面组件 (app/)

#### 🏠 `app/page.tsx` - 首页
- **功能**: 应用入口页面，展示产品介绍和导航
- **特性**: 
  - 响应式设计
  - 现代化UI布局
  - 快速导航到设计器

#### 👕 `app/design/page.tsx` - T恤选择页面
- **功能**: T恤样式选择和基础配置
- **特性**:
  - 多种T恤款式选择（经典款、修身款、宽松款）
  - 颜色选择器
  - 尺码选择
  - 价格显示
  - 导航到编辑器

#### ✏️ `app/design/editor/page.tsx` - 设计编辑器
- **功能**: 主要的T恤设计界面
- **特性**:
  - 拖拽式设计界面
  - 实时预览
  - 工具栏集成
  - 撤销/重做功能
  - 保存设计功能

#### 👀 `app/design/preview/page.tsx` - 预览页面
- **功能**: 最终设计预览和确认
- **特性**:
  - 高保真预览
  - 3D效果展示
  - 订单信息
  - 购买流程

### 2. 设计工具组件 (components/design-tools/)

#### 🤖 `ai-generator.tsx` - AI图像生成器
- **功能**: 使用ComfyUI生成AI图像作为T恤设计
- **核心特性**:
  - 文本提示输入
  - 预设提示建议
  - 多种艺术风格选择
  - 实时生成状态显示
  - 生成历史记录
- **关键功能**:
  ```typescript
  interface AIGeneratorProps {
    onImageGenerated: (imageUrl: string) => void
  }
  ```
- **支持的风格**: 
  - 卡通风格
  - 写实风格
  - 抽象艺术
  - 简约设计
  - 复古风格

#### 📤 `image-uploader.tsx` - 图像上传器
- **功能**: 本地图像上传和管理
- **核心特性**:
  - 拖拽上传
  - 文件选择上传
  - 上传进度显示
  - 图像预览
  - 格式验证
  - 大小限制
- **支持格式**: JPG, PNG, GIF, SVG
- **界面特性**:
  ```typescript
  interface ImageUploaderProps {
    onImageUploaded: (imageUrl: string) => void
  }
  ```

### 3. 状态组件 (components/)

#### 📊 `comfyui-status-card.tsx` - ComfyUI状态卡片
- **功能**: 显示ComfyUI服务器连接状态
- **特性**:
  - 实时连接状态检测
  - 服务器健康状况
  - 错误信息显示
  - 重连功能

#### 🎨 `theme-provider.tsx` - 主题提供器
- **功能**: 管理应用主题（明亮/暗黑模式）
- **特性**:
  - 系统主题检测
  - 主题切换
  - 本地存储记忆

### 4. UI组件库 (components/ui/)

基于 **shadcn/ui** 构建的完整UI组件库，包含：

#### 表单组件
- `button.tsx` - 各种样式的按钮
- `input.tsx` - 输入框
- `textarea.tsx` - 文本区域
- `select.tsx` - 下拉选择
- `checkbox.tsx` - 复选框
- `radio-group.tsx` - 单选按钮组
- `slider.tsx` - 滑块
- `switch.tsx` - 开关

#### 展示组件
- `card.tsx` - 卡片容器
- `badge.tsx` - 标签徽章
- `avatar.tsx` - 头像
- `progress.tsx` - 进度条
- `skeleton.tsx` - 骨架屏
- `separator.tsx` - 分隔线

#### 交互组件
- `dialog.tsx` - 对话框
- `alert-dialog.tsx` - 确认对话框
- `popover.tsx` - 弹出框
- `tooltip.tsx` - 工具提示
- `dropdown-menu.tsx` - 下拉菜单
- `context-menu.tsx` - 右键菜单

#### 布局组件
- `accordion.tsx` - 手风琴
- `tabs.tsx` - 标签页
- `collapsible.tsx` - 可折叠面板
- `resizable.tsx` - 可调整大小面板
- `scroll-area.tsx` - 滚动区域

#### 导航组件
- `navigation-menu.tsx` - 导航菜单
- `breadcrumb.tsx` - 面包屑
- `pagination.tsx` - 分页
- `sidebar.tsx` - 侧边栏

#### 数据展示
- `table.tsx` - 表格
- `chart.tsx` - 图表
- `calendar.tsx` - 日历
- `carousel.tsx` - 轮播图

## 🔧 工具和Hook

### Hooks (hooks/)
- `use-mobile.ts` - 移动设备检测
- `use-toast.ts` - 通知消息管理

### 工具库 (lib/)
- `utils.ts` - 通用工具函数，包含classNames合并等

## 🎨 样式系统

### 全局样式 (app/globals.css)
- Tailwind CSS基础样式
- 自定义CSS变量
- 主题颜色定义
- 响应式断点

### 设计系统特性
- **颜色系统**: 基于HSL的语义化颜色
- **排版**: 统一的字体和间距
- **组件**: 一致的设计语言
- **动画**: 流畅的交互动效
- **响应式**: 移动优先的设计

## 📱 响应式设计

所有组件都支持响应式设计：
- **移动设备** (sm): 640px以下
- **平板设备** (md): 768px以下
- **桌面设备** (lg): 1024px以上
- **大屏设备** (xl): 1280px以上

## 🚀 使用方法

### 1. 安装依赖
```bash
bun install
```

### 2. 开发模式
```bash
bun run dev
```

### 3. 构建生产版本
```bash
bun run build
```

## 🔌 集成说明

### ComfyUI集成
- AI图像生成通过ComfyUI API实现
- 支持自定义提示和风格参数
- 实时生成状态监控

### 文件上传
- 支持多种图像格式
- 客户端压缩和预览
- 服务器端存储管理

## 🎯 主要功能流程

### 设计流程
1. **选择T恤** → 款式、颜色、尺码选择
2. **添加设计** → AI生成或上传图像
3. **编辑设计** → 位置、大小、旋转调整
4. **预览确认** → 最终效果预览
5. **下单购买** → 订单处理流程

### 组件交互
```typescript
// 主要数据流
Design Selection → Design Editor → Preview → Checkout
     ↓               ↓              ↓         ↓
  T恤配置         图像添加        最终确认    订单处理
```

## 🔧 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript 5.0+
- **样式**: Tailwind CSS 3.4+
- **组件**: shadcn/ui + Radix UI
- **图标**: Lucide React
- **状态管理**: React Hook + Context
- **构建工具**: Turbopack (开发) / Webpack (生产)

## 📦 依赖关系

### 核心依赖
- `react` / `react-dom` - React框架
- `next` - Next.js框架
- `typescript` - TypeScript支持

### UI依赖
- `@radix-ui/*` - 无障碍UI组件
- `tailwindcss` - CSS框架
- `lucide-react` - 图标库
- `class-variance-authority` - 样式变体管理

### 开发依赖
- `@types/*` - TypeScript类型定义
- `eslint` - 代码检查
- `prettier` - 代码格式化

## 🚀 部署说明

这些组件可以：
1. **独立部署** - 作为完整的Next.js应用
2. **集成使用** - 单独提取组件使用
3. **自定义修改** - 根据需求调整样式和功能

## 📝 维护说明

### 添加新组件
1. 在`components/`下创建新文件
2. 遵循现有的TypeScript接口规范
3. 使用Tailwind CSS进行样式设计
4. 添加必要的props类型定义

### 修改现有组件
1. 保持向后兼容性
2. 更新相应的TypeScript接口
3. 测试响应式表现
4. 更新相关文档

## 🔗 相关链接

- [Next.js 文档](https://nextjs.org/docs)
- [shadcn/ui 组件库](https://ui.shadcn.com)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [TypeScript 文档](https://www.typescriptlang.org/docs)

---

💡 **提示**: 这个组件包是一个完整的T恤设计器前端解决方案，可以直接使用或作为其他项目的参考。所有组件都经过精心设计，支持现代浏览器和移动设备。