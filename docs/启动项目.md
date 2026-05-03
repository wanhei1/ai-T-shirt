1. 准备环境
需要安装并可用：

node + npm
PostgreSQL（本地 5432）
RabbitMQ（5672，管理端 15672）
Conda（用于 ComfyUI 虚拟环境）
2. 进入项目并安装依赖

3. 配置环境变量

后端 .env（关键项）

前端 .env.local（关键项）

4. 启动基础服务

4.1 启动 RabbitMQ

如果你机器是旧版：

4.2 确认 PostgreSQL 在 5432 运行

5. 启动 ComfyUI（必须用 comfyui 虚拟环境）
新终端执行：

6. 启动前后端（两种方式）

方式 A：一条命令并行启动（推荐）

这会启动：

后端：8185
前端：3007
方式 B：分开启动（便于看日志）
终端1：

终端2：

7. 健康检查（启动后执行）

都成功就说明主链路正常。

8. 访问地址

前端：http://localhost:3007
后端：http://localhost:8185
RabbitMQ 管理：http://localhost:15672（xxyopen / test123456）
ComfyUI：http://127.0.0.1:8188
9. 生产模式启动（可选）

cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer
npm run build
npm run start
10. 常见问题速查

npm run ev 报错：命令写错，正确是 npm run dev
API 超时：确认 8185 在监听，且前端已重启
文生图失败：确认 ComfyUI 在 comfyui 环境中运行，8188/system_stats 可访问
RabbitMQ 认证失败：检查 RABBITMQ_URL 不是截断值（不要写成 amqp://xxy）