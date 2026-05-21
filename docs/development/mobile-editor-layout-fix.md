# 手机端编辑器页面布局优化

**日期**: 2026-05-20  
**页面**: `/design/editor` (http://82.157.19.21:8478/design/editor)  
**问题**: 手机端进入编辑器页面看不到「生成图片」按钮，布局不合理

---

## 修改文件

- `frontend/app/design/editor/page.tsx`
- `frontend/components/design-tools/ai-generator.tsx`

---

## 改动内容

### 1. AI 面板自动展开（page.tsx）

```tsx
// 修改前
const [mobileToolOpen, setMobileToolOpen] = useState(false)

// 修改后：手机端自动展开
const [mobileToolOpen, setMobileToolOpen] = useState(() => {
  if (typeof window === "undefined") return false
  return window.innerWidth < 768
})
```

### 2. 面板最大高度提升（page.tsx）

```tsx
// 修改前
max-h-[50vh]

// 修改后
max-h-[65vh]
```

### 3. 顶部导航栏重组（page.tsx）

**手机端导航栏**：← | 男/女 | 📷 | → | 🔍- | 🔍+ | 前/后

- 去掉了 2/3 步骤指示器
- 去掉了 M 尺码显示
- 保留了男/女选择、换脸按钮
- 合并了原控制栏的缩放和前后切换按钮

### 4. 设计工具栏位置调整（page.tsx）

**手机端**：工具栏从底部移到 T恤上方

```
[Header: ← 男/女 📷 → 🔍- 🔍+ 前/后]
[Tools: ⭐AI | T文字 | ⬆上传 | 📷换脸]
[T恤画布]
```

- 删除了手机端底部工具栏
- 工具栏改为在控制栏位置显示

### 5. 换脸功能集成（page.tsx）

新增「换脸」Tab，包含：

- **功能说明**：上传人脸照片，AI 自动换到试穿效果图
- **使用步骤**：4 步教程
- **上传按钮**：点击上传人脸照片
- **已上传状态**：显示预览和删除按钮

### 6. AIGenerator 组件紧凑模式（ai-generator.tsx）

新增 `compact` prop，手机端自动启用：

```tsx
interface AIGeneratorProps {
  onImageGenerated: (imageUrl: string) => void
  compact?: boolean  // 新增
}
```

**紧凑模式下的变化**：
- 隐藏描述文字（CardDescription）
- 提示词输入框 3行 → 2行
- 隐藏「按 Ctrl+Enter 生成」提示
- 标题和内容区域间距缩小
- 风格选择器下拉项隐藏描述文字

### 7. 手机端 T恤画布固定（page.tsx）

```tsx
// T恤画布：固定高度 50vh
<div className={`${isMobile ? "h-[50vh]" : "flex-1"} p-4 bg-muted/20 overflow-auto`}>

// 主内容区：可滚动
<div className={`flex-1 flex flex-col min-w-0 ${isMobile ? "order-1 overflow-auto" : ""}`}>

// T恤容器：手机端去掉 min-h-full
<div className={`${isMobile ? "" : "min-h-full"} w-full mx-auto flex items-center justify-center`}>
```

### 8. 控制栏精简（page.tsx）

手机端控制栏变化：

- 隐藏标题文字（"经典版型T恤-白色"）
- 缩放控件：只保留 +/- 按钮，隐藏百分比
- 前后切换：「前面(0)」→「前」，「背面」→「后」
- 内边距减小：`p-4` → `px-2 py-2`

### 9. 提示文案更新（page.tsx）

```tsx
// 空画布提示语
{isMobile
  ? translate({ zh: "使用上方工具栏添加元素", en: "Use the toolbar above to add elements" })
  : translate({ zh: "使用左侧工具添加元素", en: "Use the tools on the left to add elements" })}
```

---

## 手机端最终布局

```
┌─────────────────────────────────┐
│ ← | 男/女 | 📷 | → | 🔍- | 🔍+ | 前/后 │  ← 顶部导航栏
├─────────────────────────────────┤
│ ⭐AI | T文字 | ⬆上传 | 📷换脸    │  ← 设计工具栏
├─────────────────────────────────┤
│                                 │
│         T恤画布 (50vh)           │  ← 固定高度，始终可见
│                                 │
├─────────────────────────────────┤
│ [AI/换脸/文字/上传 面板]         │  ← 从底部滑出 (max-h 65vh)
└─────────────────────────────────┘
```

---

## 桌面端不受影响

所有改动都在 `isMobile` 条件下生效，桌面端布局保持不变。
