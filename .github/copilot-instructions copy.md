
# 🤖 AI 执行手册 — ai-T-shirt 项目安全上线（方案A）

## 📌 你的任务
将已在服务器上的 ai-T-shirt 项目完成以下工作：
1. 安全加固（必须先做）
2. 用 pm2 保活前后端服务
3. 用 cpolar 暴露到公网
4. 验证全流程可访问

执行时**严格按 Phase 顺序**，每个 Phase 完成后告诉我结果再继续。

---

## 🗂️ 项目信息

- **仓库**：https://github.com/wanhei1/ai-T-shirt
- **项目根目录**：`custom-tshirt-designer/`（以实际路径为准）
- **架构**：
  ```
  custom-tshirt-designer/
  ├─ frontend/      # Next.js 14 App Router（需要 Node 进程运行，不是静态文件）
  ├─ backend/       # Express.js + TypeScript + pg
  ├─ shared/        # 跨端类型与常量
  └─ package.json   # monorepo 根
  ```
- **端口规划**：
  | 服务 | 端口 | 对外暴露 |
  |------|------|---------|
  | Next.js 前端 | 3000 | ✅ 通过 cpolar |
  | Express 后端 | 8189 | ✅ 通过 cpolar |
  | PostgreSQL | 5432 | ❌ 仅本地 |
  | ComfyUI | 8188 | ❌ 仅本地 |

---

## ⚠️ 执行前提示 AI 的规则

1. 所有命令在**实验室服务器**上执行，不是本地开发机
2. 遇到 `[需要人工填写]` 标记，停下来问我要信息，不要猜测
3. 每个 Phase 结束后输出验证结果，确认通过再进入下一 Phase
4. 不要删除或覆盖 `.env` 文件，只做追加或修改指定字段
5. 所有文件修改前先备份：`cp 文件名 文件名.bak`

---

## 🔐 Phase 1：安全加固（必须最先做）

### 1.1 生成强 JWT_SECRET

```bash
# 生成随机强密钥，复制输出结果
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

将输出值写入 `backend/.env`：
```bash
# 找到 JWT_SECRET 这行并替换（不要用 please-change-me）
sed -i "s/JWT_SECRET=.*/JWT_SECRET=上一步生成的值/" backend/.env

# 验证已修改
grep JWT_SECRET backend/.env
```

### 1.2 确认 PostgreSQL 只监听本地

```bash
# 检查监听地址
sudo -u postgres psql -c "SHOW listen_addresses;"

# 如果结果不是 localhost 或 127.0.0.1，执行以下修复：
PGCONF=$(sudo find /etc/postgresql -name "postgresql.conf" | head -1)
sudo cp $PGCONF $PGCONF.bak
sudo sed -i "s/listen_addresses = .*/listen_addresses = 'localhost'/" $PGCONF
sudo systemctl restart postgresql

# 验证修复
sudo -u postgres psql -c "SHOW listen_addresses;"
```

### 1.3 确认 ComfyUI 只监听本地

```bash
# 检查 ComfyUI 是否在运行及其监听地址
ss -tlnp | grep 8188

# 如果显示 0.0.0.0:8188，找到 ComfyUI 启动脚本并加参数：
# python main.py --listen 127.0.0.1 --port 8188
# 重启 ComfyUI 进程
```

### 1.4 给 Express 加限流

在 `backend/` 目录下：

```bash
cd backend
npm install express-rate-limit
```

打开 `backend/src/app.ts`，在文件顶部 import 区域添加：
```typescript
import rateLimit from 'express-rate-limit'
```

在 `app.use(cors(...))` 之后添加：
```typescript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 20,
  message: { error: '请求过于频繁，请稍后再试' }
})
app.use('/api/login', authLimiter)
app.use('/api/register', authLimiter)
```

### 1.5 收紧 CORS（暂时保留 localhost，cpolar 地址在 Phase 3 后补充）

在 `backend/src/app.ts` 找到 cors 配置，确保格式如下：
```typescript
app.use(cors({
  origin: [
    'http://localhost:3000',
    // cpolar 前端地址将在 Phase 3 完成后补充
  ],
  credentials: true
}))
```

### ✅ Phase 1 验证
```bash
# 确认 JWT_SECRET 不是默认值
grep JWT_SECRET backend/.env | grep -v "please-change-me" && echo "✅ JWT_SECRET 已更新" || echo "❌ 请检查"

# 确认 PostgreSQL 本地监听
sudo -u postgres psql -c "SHOW listen_addresses;" 2>/dev/null && echo "✅ PostgreSQL 正常" || echo "❌ 请检查"

# 确认 8188 没有对外暴露
ss -tlnp | grep 8188 | grep -v "127.0.0.1" && echo "❌ ComfyUI 暴露了，请修复" || echo "✅ ComfyUI 安全"
```

**Phase 1 全部通过后，告诉我结果，再继续 Phase 2。**

---

## 🔧 Phase 2：构建并用 pm2 保活服务

### 2.1 检查环境

```bash
# 检查 Node.js 版本（需要 >= 18）
node -v

# 检查 pm2 是否已安装
pm2 -v || npm install -g pm2

# 检查数据库连接
cd backend
node -e "
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1').then(() => { console.log('✅ 数据库连接正常'); process.exit(0); }).catch(e => { console.log('❌ 数据库连接失败:', e.message); process.exit(1); });
"
cd ..
```

### 2.2 安装依赖并构建

```bash
cd custom-tshirt-designer  # 进入项目根目录（以实际路径为准）

# 安装所有依赖
npm run install:all

# 构建前后端
npm run build
```

构建成功的标志：
- `backend/dist/app.js` 文件存在
- `frontend/.next/` 目录存在

```bash
# 验证构建产物
ls backend/dist/app.js && echo "✅ 后端构建成功" || echo "❌ 后端构建失败"
ls frontend/.next && echo "✅ 前端构建成功" || echo "❌ 前端构建失败"
```

### 2.3 用 pm2 启动服务

```bash
# 启动后端
pm2 start backend/dist/app.js --name "tshirt-backend" --cwd backend

# 启动前端
pm2 start node_modules/.bin/next \
  --name "tshirt-frontend" \
  --cwd frontend \
  -- start -p 3000

# 保存进程列表并设置开机自启
pm2 save
pm2 startup
# ⚠️ 执行 pm2 startup 输出的那条 sudo 命令（人工执行）
```

### 2.4 本地验证

```bash
# 等待 3 秒让服务启动
sleep 3

# 检查 pm2 状态（两个服务都应该是 online）
pm2 status

# 后端健康检查
curl -s http://localhost:8189/health | head -c 200

# 前端响应检查
curl -s http://localhost:3000 | head -c 100
```

### ✅ Phase 2 验证
```bash
pm2 status | grep -E "tshirt-backend|tshirt-frontend"
# 两行都显示 online 才算通过
```

**Phase 2 全部通过后，告诉我结果，再继续 Phase 3。**

---

## 🌐 Phase 3：cpolar 内网穿透

### 3.1 安装 cpolar

```bash
curl -L https://www.cpolar.com/static/downloads/install-release-cpolar.sh | sudo bash
cpolar version  # 验证安装成功
```

### 3.2 认证

```bash
# 需要人工提供：登录 https://www.cpolar.com 后台获取 authtoken
cpolar authtoken [需要人工填写: 你的authtoken]
```

### 3.3 创建配置文件

```bash
mkdir -p ~/.cpolar
cat > ~/.cpolar/cpolar.yml << 'EOF'
authtoken: [需要人工填写: 你的authtoken]
tunnels:
  tshirt-frontend:
    proto: http
    addr: 3000
  tshirt-backend:
    proto: http
    addr: 8189
EOF
```

### 3.4 启动并设为系统服务

```bash
sudo systemctl enable cpolar
sudo systemctl start cpolar

# 等待 5 秒
sleep 5

# 查看分配到的公网地址
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool | grep public_url
```

记录输出的两个地址：
- `前端地址`：对应 3000 端口的 `https://xxxx.cpolar.cn`
- `后端地址`：对应 8189 端口的 `https://xxxx.cpolar.cn`

### 3.5 更新前端环境变量

```bash
# 将后端 cpolar 地址写入前端环境变量
# 把下面的 URL 替换为上一步获取的后端地址
sed -i "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://[后端cpolar地址].cpolar.cn|" frontend/.env.local

# 验证
grep NEXT_PUBLIC_API_URL frontend/.env.local
```

### 3.6 更新后端 CORS 白名单

在 `backend/src/app.ts` 的 cors origin 数组中补充前端 cpolar 地址：
```typescript
origin: [
  'http://localhost:3000',
  'https://[前端cpolar地址].cpolar.cn'  // 替换为实际地址
]
```

### 3.7 重新构建并重启

```bash
npm run build
pm2 restart all
sleep 3
pm2 status
```

### ✅ Phase 3 验证

```bash
# 检查 cpolar 服务状态
sudo systemctl status cpolar | grep Active

# 检查隧道地址
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool | grep public_url

# 用 cpolar 后端地址测试 API
curl -s https://[后端cpolar地址].cpolar.cn/health
```

**Phase 3 全部通过后，告诉我两个 cpolar 地址，再继续 Phase 4。**

---

## ✅ Phase 4：端到端验证

```bash
# 1. pm2 全部 online
pm2 status

# 2. 后端 API 可访问
curl -s https://[后端cpolar地址].cpolar.cn/health

# 3. 注册接口可用
curl -s -X POST https://[后端cpolar地址].cpolar.cn/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","username":"testuser"}' \
  | head -c 200

# 4. 前端页面可访问（返回 HTML 说明正常）
curl -s https://[前端cpolar地址].cpolar.cn | grep -o "<title>.*</title>"
```

所有检查通过后，输出以下信息供记录：

```
========================================
🎉 部署完成
前端访问地址：https://[前端cpolar地址].cpolar.cn
后端 API 地址：https://[后端cpolar地址].cpolar.cn
部署时间：[当前时间]
========================================
```

---

## 🔄 日常维护速查（AI 随时可执行）

```bash
# 查看服务状态
pm2 status

# 重启所有服务
pm2 restart all

# 查看后端日志（最近50行）
pm2 logs tshirt-backend --lines 50 --nostream

# 查看前端日志
pm2 logs tshirt-frontend --lines 50 --nostream

# 重启 cpolar
sudo systemctl restart cpolar

# 查看当前 cpolar 地址
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool | grep public_url

# 拉取最新代码并重新部署
git pull && npm run build && pm2 restart all
```

---

## 🚨 故障排查决策树（AI 按此流程排查）

```
用户反映访问不了
│
├─ pm2 status 有 errored？
│   ├─ 是 → pm2 logs 查报错原因 → 通常是环境变量缺失或端口占用
│   └─ 否 ↓
│
├─ curl localhost:3000 能通？
│   ├─ 否 → pm2 restart tshirt-frontend
│   └─ 是 ↓
│
├─ curl localhost:8189/health 能通？
│   ├─ 否 → pm2 restart tshirt-backend → 查数据库是否在线
│   └─ 是 ↓
│
├─ cpolar 地址能访问？
│   ├─ 否 → sudo systemctl restart cpolar → 等10秒 → 重新获取地址
│   └─ 是 ↓
│
└─ 前端白屏？
    └─ 检查 NEXT_PUBLIC_API_URL 是否和当前 cpolar 后端地址一致
       → 不一致则更新 .env.local → npm run build:frontend → pm2 restart tshirt-frontend
```
```

---

**使用方式：**

把这个文件内容复制给任何 AI（Copilot Chat、Cursor、Claude），说一句：

> **"请按照这份文档，从 Phase 1 开始帮我执行部署，每个 Phase 完成后等我确认"**

AI 就会按顺序逐步执行，遇到需要人工提供的信息会停下来问你。