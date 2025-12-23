# 🎨 前端UI改造指南 - 衣图AI风格

## 📋 项目概述

**目标**: 将现有的T恤设计器前端界面改造成衣图AI（YiTuAI）的视觉风格和用户体验

**参考网站**: 
- 主页: https://yituai.co/index.php
- 关于页面: https://yituai.co/about.php  
- 店铺页面: https://yituai.co/about_store.php
- 设计页面: https://yituai.co/design.php

## 🎯 设计风格分析

### 核心视觉元素

1. **主色调配色方案**
   - 主要颜色: 明亮的薄荷绿/青绿色 `#40E0D0` (背景)
   - 强调色: 鲜艳的洋红色/粉色 `#FF1493`
   - 辅助色: 明黄色 `#FFD700`
   - 文字色: 黑色 `#000000` 和白色 `#FFFFFF`
   - 卡片背景: 纯白色 `#FFFFFF` 带阴影

2. **字体和排版**
   - 使用粗体中文字体，现代感强
   - 大号标题，层次分明
   - 中英文混排
   - 价格使用醒目的字体大小

3. **插画风格**
   - 卡通风格的中国龙元素
   - 鲜艳的色彩搭配
   - 涂鸦/街头艺术风格
   - 动态的视觉效果

### UI组件特点

1. **导航栏**
   - 黑色背景
   - 明黄色Logo和品牌标识
   - 简洁的导航菜单
   - 用户和购物车图标

2. **按钮设计**
   - 圆角矩形按钮
   - 明亮的背景色
   - 白色文字
   - hover效果

3. **卡片设计**
   - 白色背景
   - 圆角设计
   - 投影效果
   - 清晰的内容层次

4. **产品展示**
   - 网格布局
   - 产品图片居中
   - 价格信息突出
   - 简洁的产品信息

## 🛠️ 技术改造要求

### 颜色系统重构

```css
/* 新的颜色变量 */
:root {
  /* 主色调 */
  --primary-mint: #40E0D0;
  --primary-pink: #FF1493; 
  --primary-yellow: #FFD700;
  
  /* 中性色 */
  --black: #000000;
  --white: #FFFFFF;
  --gray-light: #F8F9FA;
  --gray-medium: #6C757D;
  
  /* 功能色 */
  --success: #28A745;
  --warning: #FFC107;
  --error: #DC3545;
  
  /* 背景色 */
  --bg-primary: var(--primary-mint);
  --bg-secondary: var(--white);
  --bg-card: var(--white);
  
  /* 文字色 */
  --text-primary: var(--black);
  --text-secondary: var(--white);
  --text-muted: var(--gray-medium);
}
```

### 组件改造清单

#### 1. 导航栏组件 (`app/layout.tsx`)
- **背景**: 改为黑色
- **Logo**: 使用明黄色，添加衣图AI风格Logo
- **导航菜单**: 白色文字，简洁布局
- **用户图标**: 右上角用户和购物车图标

#### 2. 首页组件 (`app/page.tsx`)
- **Hero区域**: 薄荷绿背景
- **主标题**: "让AI智能将您的想法变成现实"
- **CTA按钮**: "开始设计" 按钮，使用粉色背景
- **插画元素**: 添加卡通龙图案装饰
- **特色介绍**: 三步流程（选择→设计→享受）

#### 3. 设计选择页面 (`app/design/page.tsx`)
- **标题**: "畅销商品"
- **产品网格**: 2x2或4列布局
- **产品卡片**: 白色背景，圆角，阴影
- **价格显示**: 醒目的价格标签 "¥173.00"
- **产品分类**: 男士经典T恤、女士经典T恤等

#### 4. 设计编辑器 (`app/design/editor/page.tsx`)
- **工具栏**: 顶部黑色工具栏
- **画布区域**: 中央T恤预览
- **侧边栏**: AI生成和上传工具
- **颜色选择器**: 鲜艳的色彩选项

#### 5. UI基础组件更新

**按钮组件** (`components/ui/button.tsx`):
```typescript
// 新增变体
mint: "bg-primary-mint hover:bg-primary-mint/90 text-black",
pink: "bg-primary-pink hover:bg-primary-pink/90 text-white",
yellow: "bg-primary-yellow hover:bg-primary-yellow/90 text-black"
```

**卡片组件** (`components/ui/card.tsx`):
```typescript
// 添加阴影和圆角样式
"bg-white rounded-xl shadow-lg border-0"
```

#### 6. 特色功能组件

**步骤指示器组件**:
```typescript
interface StepIndicatorProps {
  steps: Array<{
    number: number;
    title: string;
    description: string;
    icon: ReactNode;
  }>;
}
```

**产品网格组件**:
```typescript
interface ProductGridProps {
  products: Array<{
    id: string;
    name: string;
    price: number;
    image: string;
    category: string;
  }>;
}
```

## 📝 给AI的具体指令

### 指令模板

```
请将我的T恤设计器前端改造成衣图AI的风格。我提供了以下资料:

1. **参考网站截图** (已提供)
   - 衣图AI主页界面
   - 产品展示页面
   - 设计流程页面

2. **现有前端组件包** (已打包)
   - 包含53个UI组件
   - 5个主要页面
   - 完整的TypeScript定义
   - 详细文档说明

3. **设计要求**:
   - 采用薄荷绿(#40E0D0) + 粉色(#FF1493) + 黄色(#FFD700)的配色
   - 使用卡通龙元素作为品牌标识
   - 产品价格统一为¥173.00
   - 三步设计流程: 选择→设计→享受
   - 黑色导航栏配明黄色Logo

4. **保持的功能**:
   - AI图像生成 (ComfyUI集成)
   - 图像上传功能
   - T恤预览和编辑
   - 响应式设计

请完整改造所有页面和组件，确保视觉风格完全对标衣图AI网站。
```

### 详细改造说明

#### 页面级改造

1. **首页改造** (`app/page.tsx`)
```
- Hero区域使用薄荷绿渐变背景
- 主标题改为"让AI智能将您的想法变成现实"
- 添加卡通龙插画元素
- CTA按钮改为粉色"开始设计"
- 添加三个特色卡片(快速交付、质量保证、客户服务)
- 底部添加三步流程说明
```

2. **产品选择页** (`app/design/page.tsx`)
```
- 页面标题改为"畅销商品"
- 产品网格改为4列布局
- 每个产品卡片添加白色背景和阴影
- 价格统一显示为"¥173.00"
- 产品分类: 男士经典T恤、男士经典T恤、女士经典T恤、女士经典T恤
- 产品图片使用"YOUR ART HERE"占位符
```

3. **设计编辑器** (`app/design/editor/page.tsx`)
```
- 顶部添加黑色工具栏
- 左侧工具面板使用白色背景
- AI生成器保持现有功能，但UI样式更新
- 颜色选择器使用衣图AI的鲜艳配色
- 添加龙元素装饰
```

#### 组件级改造

1. **布局组件** (`app/layout.tsx`)
```
- 导航栏改为黑色背景
- Logo区域使用明黄色"衣图AI"品牌
- 右侧添加用户和购物车图标
- 导航菜单: 主页、信息、设计、店铺、登录、联系我们
```

2. **按钮组件** (`components/ui/button.tsx`)
```
- 添加mint、pink、yellow三个新变体
- 默认使用圆角样式
- 添加适当的hover效果
```

3. **卡片组件** (`components/ui/card.tsx`)
```
- 默认白色背景
- 添加阴影效果 shadow-lg
- 圆角改为 rounded-xl
- 移除边框 border-0
```

### 文件修改优先级

**高优先级** (核心页面):
1. `app/layout.tsx` - 导航栏
2. `app/page.tsx` - 首页
3. `app/design/page.tsx` - 产品选择
4. `components/ui/button.tsx` - 按钮样式
5. `app/globals.css` - 全局样式和颜色变量

**中优先级** (功能页面):
1. `app/design/editor/page.tsx` - 设计编辑器
2. `components/design-tools/ai-generator.tsx` - AI生成器
3. `components/ui/card.tsx` - 卡片组件

**低优先级** (细节优化):
1. 其他UI组件样式调整
2. 响应式布局优化
3. 动画效果添加

### 资源需求

1. **图片资源**
   - 衣图AI风格Logo (SVG格式)
   - 卡通龙装饰元素
   - 产品模型图片
   - 背景纹理或图案

2. **字体资源**
   - 中文粗体字体
   - 英文现代字体

3. **图标资源**
   - 用户图标
   - 购物车图标
   - 社交媒体图标

## ✅ 验收标准

改造完成后应该达到:

1. **视觉一致性**: 与衣图AI官网风格高度相似
2. **功能完整性**: 所有原有功能正常工作
3. **响应式设计**: 在各种设备上正常显示
4. **性能表现**: 加载速度和交互流畅度不下降
5. **用户体验**: 界面直观易用，符合中国用户习惯

请AI严格按照这个指南进行改造，确保每个细节都符合衣图AI的设计风格！