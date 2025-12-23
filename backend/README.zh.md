# 后端项目

本项目提供用户注册和登录能力，并与 Neon 数据库连接，用于安全存储用户信息。

## 项目结构

```
backend-project
├── src
│   ├── config          # 配置文件
│   │   └── database.ts # 数据库连接设置
│   ├── controllers     # 请求处理逻辑
│   │   └── index.ts    # 用户注册与登录的控制器
│   ├── middleware      # 中间件函数
│   │   └── auth.ts     # 身份验证中间件
│   ├── models          # 数据模型
│   │   └── index.ts    # 与数据库交互的用户模型
│   ├── routes          # API 路由
│   │   └── index.ts    # 路由配置
│   ├── services        # 业务逻辑
│   │   └── index.ts    # 处理用户操作的服务
│   ├── utils           # 工具函数
│   │   └── index.ts    # 密码处理相关工具
│   └── app.ts          # 应用入口
├── .env                # 环境变量配置
├── package.json        # 依赖与脚本
├── tsconfig.json       # TypeScript 配置
└── README.md           # 项目文档
```

## 功能特点

- 用户注册与登录
- 安全的密码处理
- 身份验证中间件
- 连接 Neon 数据库

## 快速开始

1. 克隆仓库。
2. 使用 `npm install` 安装依赖。（如果你使用 Bun，可运行 `bun install`。）
3. 在 `.env` 文件中配置所需的环境变量。
4. 通过 `npm start` 启动应用。（开发模式可使用 `npm run dev` 或 `bun run dev`。）

## 贡献指南

欢迎贡献代码！如有改进建议或发现问题，请提交 Issue 或 Pull Request。
