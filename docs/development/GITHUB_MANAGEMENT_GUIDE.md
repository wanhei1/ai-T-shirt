# 📋 GitHub 贡献管理指南

这个指南将教你如何查看、评估和处理其他人提交到你GitHub仓库的贡献。

## 🔍 1. 检查是否有新的贡献

### 方法一：GitHub网页界面

1. **访问你的仓库**：https://github.com/wanhei1/v0-t-shirt-design-editor
2. **查看Pull Requests标签**：
   - 点击 "Pull requests" 标签
   - 绿色数字表示待处理的PR数量
   - 红色数字表示关闭的PR数量

3. **查看Issues标签**：
   - 点击 "Issues" 标签
   - 查看bug报告、功能建议等

### 方法二：命令行检查

```bash
# 进入项目目录
cd "e:\BIT_file\year4\FUZHUANG\custom-tshirt-designer"

# 获取最新的远程信息
git fetch origin

# 查看所有远程分支
git branch -r

# 查看最近的提交历史
git log --oneline --graph --all -10

# 检查是否有未合并的远程分支
git branch -r --no-merged main
```

## 📥 2. 查看Pull Request详情

### GitHub网页操作

1. **点击特定的PR**
2. **查看PR信息**：
   - 标题和描述
   - 修改的文件数量
   - 添加/删除的代码行数
   - 作者信息和提交时间

3. **查看代码变更**：
   - 点击 "Files changed" 标签
   - 绿色行：新增的代码
   - 红色行：删除的代码
   - 可以在任意行添加评论

4. **查看对话记录**：
   - "Conversation" 标签显示讨论历史
   - 可以看到代码审查意见

### 命令行查看

```bash
# 查看PR的详细信息（需要先获取PR到本地分支）
git fetch origin pull/PR_NUMBER/head:pr-PR_NUMBER

# 例如：获取PR #3
git fetch origin pull/3/head:pr-3

# 切换到PR分支查看
git checkout pr-3

# 查看这个PR的修改
git diff main..pr-3

# 查看PR的提交历史
git log main..pr-3 --oneline
```

## ✅ 3. 评估贡献质量

### 检查清单

- [ ] **代码质量**
  - 代码风格是否一致
  - 是否有明显的bug
  - 是否遵循项目的编码规范

- [ ] **功能完整性**
  - 新功能是否完整实现
  - 是否破坏现有功能
  - 是否需要额外的测试

- [ ] **文档更新**
  - 是否更新了相关文档
  - README是否需要修改
  - 是否添加了必要的注释

- [ ] **安全性**
  - 是否引入安全漏洞
  - 是否暴露敏感信息
  - 依赖包是否安全

## 🧪 4. 测试贡献

### 本地测试步骤

```bash
# 1. 切换到PR分支
git checkout pr-PR_NUMBER

# 2. 安装依赖（如果有新的依赖）
bun install

# 3. 运行开发服务器
bun run dev

# 4. 运行测试（如果有）
bun run test

# 5. 检查构建是否正常
bun run build
```

### 功能测试

1. **手动测试新功能**
2. **检查现有功能是否正常**
3. **测试边界情况**
4. **在不同浏览器中测试**

## 💬 5. 提供反馈

### 在GitHub上评论

```markdown
# 示例评论模板

## 👍 好的地方
- 代码实现清晰
- 功能符合需求

## 🔧 需要改进
- 第25行：建议使用更具描述性的变量名
- 缺少错误处理机制

## 🧪 测试结果
- [x] 功能正常工作
- [x] 没有破坏现有功能
- [ ] 需要添加单元测试

## 📝 建议
请考虑添加以下内容：
1. 更详细的错误消息
2. 输入验证
3. 文档更新
```

### 请求修改

如果需要作者修改代码：

1. **具体指出问题**
2. **提供改进建议**
3. **解释为什么需要修改**
4. **可以提供示例代码**

## ✅ 6. 合并Pull Request

### 使用自动化脚本

```bash
# Windows PowerShell
.\merge-pr.ps1 PR_NUMBER

# Linux/Mac
./merge-pr.sh PR_NUMBER
```

### 手动合并

```bash
# 1. 确保在main分支
git checkout main

# 2. 拉取最新代码
git pull origin main

# 3. 合并PR分支
git merge pr-PR_NUMBER

# 4. 推送到远程
git push origin main

# 5. 删除本地PR分支
git branch -d pr-PR_NUMBER
```

### GitHub网页合并

1. **点击 "Merge pull request" 绿色按钮**
2. **选择合并方式**：
   - **Create a merge commit**：保留完整历史
   - **Squash and merge**：压缩为单个提交
   - **Rebase and merge**：线性历史

3. **添加合并信息**
4. **确认合并**

## ❌ 7. 拒绝Pull Request

### 何时拒绝PR

- 不符合项目方向
- 代码质量过低且作者不愿意改进
- 存在严重安全问题
- 重复的功能

### 礼貌拒绝的方式

```markdown
感谢你的贡献！

虽然这个PR有一些好的想法，但目前不太适合合并到主分支，原因如下：

1. [具体原因]
2. [具体原因]

建议：
- [改进建议]
- [替代方案]

欢迎继续参与项目，可以考虑：
- 提交issue讨论功能需求
- 关注我们的roadmap
- 参与其他开放的issue
```

## 📊 8. 监控和维护

### 定期检查

```bash
# 每天或每周运行，检查新的贡献
git fetch origin
git log --oneline --graph origin/main ^main

# 检查是否有新的远程分支
git branch -r --no-merged main
```

### GitHub通知设置

1. **访问仓库设置**
2. **Notifications**
3. **配置通知偏好**：
   - Pull requests
   - Issues
   - Releases

## 🛠️ 9. 自动化工具

### GitHub Actions

可以设置自动化流程：
- 自动运行测试
- 代码质量检查
- 自动合并满足条件的PR

### Bot集成

- **Dependabot**：自动更新依赖
- **CodeQL**：安全扫描
- **Stale**：管理长期未活动的issue/PR

## 🔗 10. 有用的资源

- [GitHub官方文档](https://docs.github.com/)
- [Git命令参考](https://git-scm.com/docs)
- [开源项目维护指南](https://opensource.guide/maintaining/)

---

💡 **提示**：建议将这个检查流程制作成checklist，每次处理PR时都按照步骤执行，确保不遗漏重要环节。