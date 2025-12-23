#!/bin/bash

# T恤设计师项目 - PR合并脚本
# 使用方法: ./merge-pr.sh PR_NUMBER

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PR_NUMBER=$1

if [ -z "$PR_NUMBER" ]; then
    echo -e "${RED}❌ 错误: 请提供PR编号${NC}"
    echo -e "${BLUE}使用方法: ./merge-pr.sh PR_NUMBER${NC}"
    echo -e "${BLUE}例如: ./merge-pr.sh 3${NC}"
    exit 1
fi

echo -e "${BLUE}🔄 正在处理 PR #$PR_NUMBER...${NC}"

# 确保在main分支
echo -e "${YELLOW}📍 切换到main分支...${NC}"
git checkout main

# 拉取最新代码
echo -e "${YELLOW}⬇️ 拉取最新代码...${NC}"
git pull origin main

# 获取PR
echo -e "${YELLOW}📥 获取 PR #$PR_NUMBER...${NC}"
git fetch origin pull/$PR_NUMBER/head:pr-$PR_NUMBER
git checkout pr-$PR_NUMBER

echo -e "${GREEN}✅ PR信息:${NC}"
# 显示PR的提交信息
git log --oneline pr-$PR_NUMBER ^main

echo ""
echo -e "${GREEN}📊 文件更改统计:${NC}"
# 显示更改的文件
git diff --stat main..pr-$PR_NUMBER

echo ""
echo -e "${GREEN}📝 详细更改:${NC}"
# 显示详细差异
git diff main..pr-$PR_NUMBER

echo ""
echo -e "${YELLOW}🤔 是否要合并此PR？${NC}"
echo -e "${BLUE}输入选项:${NC}"
echo -e "  ${GREEN}y${NC} - 是，合并PR"
echo -e "  ${GREEN}t${NC} - 先测试，再决定"
echo -e "  ${RED}n${NC} - 否，取消合并"

read -p "请选择 (y/t/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Tt]$ ]]; then
    echo -e "${YELLOW}🧪 启动测试模式...${NC}"
    echo -e "${BLUE}💡 请手动测试功能，测试完成后：${NC}"
    echo -e "  - 如果测试通过，运行: ${GREEN}git checkout main && git merge pr-$PR_NUMBER && git push origin main${NC}"
    echo -e "  - 如果测试失败，运行: ${RED}git checkout main && git branch -D pr-$PR_NUMBER${NC}"
    echo ""
    echo -e "${YELLOW}🚀 启动开发服务器进行测试...${NC}"
    bun run dev
elif [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}✅ 正在合并 PR #$PR_NUMBER...${NC}"
    
    # 切换到main分支
    git checkout main
    
    # 合并PR
    git merge pr-$PR_NUMBER
    
    # 推送到远程
    echo -e "${YELLOW}📤 推送到远程仓库...${NC}"
    git push origin main
    
    # 清理本地分支
    echo -e "${YELLOW}🧹 清理本地分支...${NC}"
    git branch -d pr-$PR_NUMBER
    
    echo -e "${GREEN}🎉 PR #$PR_NUMBER 已成功合并！${NC}"
    echo -e "${BLUE}📝 不要忘记在GitHub上关闭PR（如果没有自动关闭）${NC}"
else
    echo -e "${RED}❌ 合并已取消${NC}"
    git checkout main
    git branch -D pr-$PR_NUMBER 2>/dev/null || true
    echo -e "${YELLOW}🧹 已清理临时分支${NC}"
fi