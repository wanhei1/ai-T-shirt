# 🤝 贡献指南 (CONTRIBUTING.md)

欢迎为 **T恤设计师项目** 贡献代码！本文档将指导你如何正确地向此项目提交代码。

## 📋 目录

- [准备工作](#准备工作)
- [贡献流程](#贡献流程)
- [代码规范](#代码规范)
- [提交Pull Request](#提交pull-request)
- [项目维护者指南](#项目维护者指南)

## 🚀 准备工作

### 1. Fork 项目

1. 访问项目页面：https://github.com/wanhei1/v0-t-shirt-design-editor
2. 点击右上角的 **"Fork"** 按钮
3. 选择你的GitHub账户进行Fork

### 2. 克隆你的Fork

```bash
# 克隆你Fork的仓库
git clone https://github.com/YOUR_USERNAME/v0-t-shirt-design-editor.git
cd v0-t-shirt-design-editor

# 添加原项目为上游仓库
git remote add upstream https://github.com/wanhei1/v0-t-shirt-design-editor.git
```

### 3. 安装依赖

```bash
# 使用bun安装依赖（推荐）
bun install

# 或使用npm
npm install
```

### 4. 启动开发服务器

```bash
bun run dev
```

## 🔄 贡献流程

### 步骤1: 同步最新代码

```bash
# 获取上游仓库的最新更改
git fetch upstream

# 切换到main分支
git checkout main

# 合并上游的更改
git merge upstream/main

# 推送到你的fork
git push origin main
```

### 步骤2: 创建功能分支

```bash
# 创建并切换到新分支（使用描述性名称）
git checkout -b feature/your-feature-name

# 例如：
git checkout -b feature/add-user-authentication
git checkout -b fix/comfyui-connection-issue
git checkout -b docs/update-api-documentation
```

### 步骤3: 进行开发

- 编写代码
- 遵循项目的代码规范
- 确保功能正常工作
- 编写必要的测试

### 步骤4: 提交更改

```bash
# 添加更改的文件
git add .

# 提交更改（使用清晰的提交信息）
git commit -m "feat: 添加用户认证功能"

# 推送到你的fork
git push origin feature/your-feature-name
```

## 📝 代码规范

### 提交信息格式

使用以下格式编写提交信息：

```
类型: 简短描述

详细描述（可选）

关闭的issue（可选）
Closes #123
```

**提交类型：**
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建工具或辅助工具的变动

**示例：**
```bash
git commit -m "feat: 添加AI图像生成功能"
git commit -m "fix: 修复ComfyUI连接超时问题"
git commit -m "docs: 更新部署指南"
```

### 代码风格

- 使用TypeScript
- 遵循ESLint配置
- 使用Prettier格式化代码
- 组件使用函数式组件和React Hooks

## 📤 提交Pull Request

### 1. 创建Pull Request

1. 访问你的fork页面
2. 点击 **"Compare & pull request"** 按钮
3. 或者直接访问：https://github.com/wanhei1/v0-t-shirt-design-editor/compare

### 2. 填写PR信息

**标题格式：**
```
[类型] 简短描述
```

**例如：**
- `[Feature] 添加用户认证系统`
- `[Fix] 修复ComfyUI连接问题`
- `[Docs] 更新贡献指南`

**描述模板：**
```markdown
## 📋 更改说明
简要描述你的更改内容

## 🔧 更改类型
- [ ] 新功能
- [ ] Bug修复
- [ ] 文档更新
- [ ] 代码重构
- [ ] 性能优化

## 📸 截图（如适用）
添加相关截图

## ✅ 测试检查
- [ ] 本地测试通过
- [ ] 代码符合规范
- [ ] 文档已更新

## 📝 其他说明
其他需要说明的内容
```

### 3. 等待审核

- 项目维护者会审核你的PR
- 可能会提出修改建议
- 根据反馈进行调整

## 👨‍💼 项目维护者指南（给 wanhei1）

### 审核Pull Request

#### 1. 获取PR到本地

```bash
# 方法1: 使用PR编号
git fetch origin pull/PR_NUMBER/head:pr-PR_NUMBER
git checkout pr-PR_NUMBER

# 例如PR #3:
git fetch origin pull/3/head:pr-3
git checkout pr-3
```

#### 2. 审核代码

```bash
# 查看更改的文件
git show --stat

# 查看详细差异
git diff main..pr-3

# 查看提交历史
git log --oneline pr-3 ^main
```

#### 3. 测试功能

```bash
# 启动开发服务器测试
bun run dev

# 运行测试（如果有）
bun run test
```

#### 4. 合并PR

```bash
# 切换到main分支
git checkout main

# 确保main是最新的
git pull origin main

# 合并PR
git merge pr-3

# 推送到远程
git push origin main

# 清理本地分支
git branch -d pr-3
```

#### 5. 在GitHub上关闭PR

合并完成后，在GitHub上的PR会自动标记为已合并。

### 快速合并脚本

创建一个脚本 `merge-pr.sh`：

```bash
#!/bin/bash
PR_NUMBER=$1

if [ -z "$PR_NUMBER" ]; then
    echo "使用方法: ./merge-pr.sh PR_NUMBER"
    exit 1
fi

echo "🔄 获取 PR #$PR_NUMBER..."
git fetch origin pull/$PR_NUMBER/head:pr-$PR_NUMBER
git checkout pr-$PR_NUMBER

echo "📋 显示更改："
git show --stat
git log --oneline pr-$PR_NUMBER ^main

echo "继续合并吗？(y/N)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    git checkout main
    git pull origin main
    git merge pr-$PR_NUMBER
    git push origin main
    git branch -d pr-$PR_NUMBER
    echo "✅ PR #$PR_NUMBER 已成功合并！"
else
    echo "❌ 合并已取消"
fi
```

## 🚨 注意事项

### 贡献者注意

- **不要直接推送到main分支**
- **始终从最新的main分支创建功能分支**
- **保持提交历史整洁**
- **测试你的更改**

### 维护者注意

- **审核所有代码更改**
- **确保功能正常工作**
- **检查是否符合项目规范**
- **更新文档（如需要）**

## 🤔 需要帮助？

- 查看现有的 [Issues](https://github.com/wanhei1/v0-t-shirt-design-editor/issues)
- 创建新的Issue描述问题或建议
- 联系项目维护者 @wanhei1

## 📄 许可证

通过贡献代码，你同意你的贡献将在项目的许可证下发布。

---

感谢你的贡献！🎉