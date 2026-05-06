# 手机适配实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 让网站在手机浏览器上可用且体验良好（375px+）

**Architecture:** 分 4 个阶段逐步修复，每阶段独立可回滚。优先修复影响最大的导航栏和编辑器，再处理细节。

**Tech Stack:** Next.js, Tailwind CSS, React, TypeScript

**Rollback:** 每个 Task 完成后独立 commit，出问题 `git revert <commit>` 即可回滚单个 Task。

---

## 阶段 1：导航栏手机适配（最高优先级）

### Task 1.1：创建移动端汉堡菜单组件

**Objective:** 用已有的 Sheet 组件创建移动端侧边栏导航

**Files:**
- Create: `frontend/components/mobile-nav.tsx`
- Modify: `frontend/components/navbar.tsx`

**Step 1:** 在 `navbar.tsx` 中导入 `useIsMobile` hook 和 Sheet 组件

```tsx
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
```

**Step 2:** 创建 `mobile-nav.tsx`，包含汉堡按钮 + Sheet 侧边栏，列出所有导航项（商城、设计、订单、个人中心、登录/退出）

**Step 3:** 在 `navbar.tsx` 中：
- 桌面端（`hidden md:flex`）：保持现有布局
- 移动端（`md:hidden`）：显示汉堡菜单按钮

**Step 4:** 验证
- 浏览器缩小到 375px 宽度
- 点击汉堡按钮，侧边栏滑出
- 所有导航项可点击，触摸目标 ≥ 44px

**Step 5:** Commit
```bash
git add frontend/components/mobile-nav.tsx frontend/components/navbar.tsx
git commit -m "feat: add mobile hamburger menu navigation"
```

---

### Task 1.2：增加导航栏触摸目标尺寸

**Objective:** 所有按钮/链接触摸区域 ≥ 44x44px

**Files:**
- Modify: `frontend/components/navbar.tsx`
- Modify: `frontend/components/mobile-nav.tsx`

**Step 1:** 桌面端按钮从 `size="sm"` 改为 `size="default"`

**Step 2:** 移动端 Sheet 内的导航项使用 `py-3 px-4` 间距

**Step 3:** 用户名文本加 `truncate max-w-[120px]`

**Step 4:** 验证 + Commit

---

## 阶段 2：设计编辑器手机适配（关键功能）

### Task 2.1：编辑器移动端布局 — 侧边栏变底部抽屉

**Objective:** 手机上工具面板从左侧固定 320px 改为底部可收起抽屉

**Files:**
- Modify: `frontend/app/design/editor/page.tsx`

**Step 1:** 导入 `useIsMobile` 和 Sheet 组件

**Step 2:** 用 `useIsMobile()` 判断设备类型

**Step 3:** 移动端布局改为：
```
┌──────────────────┐
│    Header        │
├──────────────────┤
│                  │
│   Canvas Area    │
│                  │
├──────────────────┤
│  Bottom Toolbar  │  ← 工具图标行（文字/AI/上传/颜色）
│  (可展开抽屉)     │  ← 点击展开详细工具面板
└──────────────────┘
```

**Step 4:** 桌面端保持现有布局不变

**Step 5:** 验证
- 手机视图：画布占满屏幕宽度
- 底部工具栏可点击展开
- 展开后工具面板覆盖画布下方

**Step 6:** Commit

---

### Task 2.2：添加触摸事件支持

**Objective:** 设计元素支持触摸拖拽/缩放/旋转

**Files:**
- Modify: `frontend/app/design/editor/page.tsx`

**Step 1:** 创建统一的指针事件处理函数（兼容鼠标+触摸）

```tsx
// 将 handleMouseDown/handleMouseMove/handleMouseUp
// 统一为 handlePointerDown/handlePointerMove/handlePointerUp
// 使用 pointerdown/pointermove/pointerup 事件
```

**Step 2:** Canvas 容器添加 `touch-action: none` CSS 防止浏览器拦截

**Step 3:** 移动端拖拽手柄从 16px 增大到 32px

**Step 4:** 验证
- 手机上能拖动设计元素
- 手机上能缩放/旋转元素
- 桌面端鼠标操作不受影响

**Step 5:** Commit

---

### Task 2.3：编辑器 Header 移动端适配

**Objective:** Header 在窄屏幕上不溢出

**Files:**
- Modify: `frontend/app/design/editor/page.tsx`

**Step 1:** Step 标签（"Step 2 of 3"）在移动端隐藏文字只显示数字

**Step 2:** "Continue to Preview" 按钮在移动端改为图标按钮

**Step 3:** 模型性别切换按钮间距缩小

**Step 4:** 验证 + Commit

---

## 阶段 3：内容页面细节修复

### Task 3.1：产品选择页图片高度适配

**Objective:** 手机上产品预览图不超出屏幕

**Files:**
- Modify: `frontend/app/design/page.tsx`

**Step 1:** 产品图片高度从 `h-[520px] md:h-[600px]` 改为 `h-[280px] sm:h-[400px] md:h-[520px] lg:h-[600px]`

**Step 2:** 进度步骤添加 `flex-wrap` 或移动端隐藏文字标签

**Step 3:** 验证 + Commit

---

### Task 3.2：商城详情页触摸目标修复

**Objective:** 所有按钮 ≥ 44px

**Files:**
- Modify: `frontend/app/shop/[orderId]/page.tsx`

**Step 1:** 缩放按钮从 `h-7 px-2` 改为 `h-11 px-3 min-w-[44px]`

**Step 2:** 验证 + Commit

---

### Task 3.3：全局触摸目标审查

**Objective:** 确保所有交互元素满足 44px 最小触摸区域

**Files:**
- Modify: `frontend/app/cart/page.tsx`（数量按钮）
- Modify: `frontend/app/profile/page.tsx`（订单操作按钮）

**Step 1:** 搜索所有 `size="sm"` 的 Button，检查是否在触摸密集区域

**Step 2:** 触摸密集区域的按钮改为 `size="default"` 或添加 min-height

**Step 3:** 验证 + Commit

---

## 阶段 4：Viewport 和收尾

### Task 4.1：添加显式 Viewport 配置

**Objective:** 确保移动端 viewport 正确配置

**Files:**
- Modify: `frontend/app/layout.tsx`

**Step 1:** 添加 viewport 导出

```tsx
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};
```

**Step 2:** 验证 + Commit

---

### Task 4.2：添加移动端 CSS 优化

**Objective:** 防止移动端常见 CSS 问题

**Files:**
- Modify: `frontend/app/globals.css`

**Step 1:** 添加防止 300ms 点击延迟
```css
* { touch-action: manipulation; }
```

**Step 2:** Canvas 区域排除（设置 `touch-action: none`）

**Step 3:** 验证 + Commit

---

## 总控流程

```
Phase 1 (导航) → Phase 2 (编辑器) → Phase 3 (细节) → Phase 4 (收尾)
    ↓                 ↓                  ↓                ↓
  每个 Task          每个 Task           每个 Task        每个 Task
  Code Review       Code Review        Code Review      Code Review
  测试通过           测试通过            测试通过          测试通过
  独立 Commit        独立 Commit         独立 Commit       独立 Commit
```

## 回滚策略

- 每个 Task 独立 commit → `git revert <commit-hash>` 回滚单个 Task
- 每个 Phase 完成后做一次整体测试
- 出问题立即回滚，不影响其他 Phase

## 测试检查清单

每个 Task 完成后检查：
- [ ] Chrome DevTools 手机模拟器（iPhone SE / iPhone 14）
- [ ] 真机测试（如果有）
- [ ] 桌面端功能不受影响
- [ ] 所有按钮触摸区域 ≥ 44px
- [ ] 无水平滚动条
- [ ] 图片正常加载（通过 /backend/ 代理）

## 预计工时

| Phase | Tasks | 预计时间 |
|-------|-------|---------|
| Phase 1: 导航栏 | 2 tasks | 15 min |
| Phase 2: 编辑器 | 3 tasks | 25 min |
| Phase 3: 细节 | 3 tasks | 10 min |
| Phase 4: 收尾 | 2 tasks | 5 min |
| **总计** | **10 tasks** | **~55 min** |

---

**Plan complete. Ready to execute — shall I proceed with Phase 1?**
