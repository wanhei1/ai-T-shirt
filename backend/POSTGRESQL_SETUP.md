# 🐘 PostgreSQL 本地安装指南

## Windows 安装方法

### 方法1: 使用 Chocolatey (推荐)
```powershell
# 1. 安装 Chocolatey (如果没有)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 2. 安装 PostgreSQL
choco install postgresql --params '/Password:yourpassword'

# 3. 启动服务
Start-Service postgresql-x64-16
```

### 方法2: 官方安装器
1. 访问: https://www.postgresql.org/download/windows/
2. 下载并运行安装器
3. 设置密码（记住这个密码）
4. 默认端口: 5432

### 方法3: 使用 Docker (最简单)
```powershell
# 拉取并运行 PostgreSQL
docker run --name postgres-tshirt -e POSTGRES_PASSWORD=yourpassword -e POSTGRES_DB=tshirt_designer -p 5432:5432 -d postgres:15

# 检查是否运行
docker ps
```

## 本地数据库配置

安装完成后，在 `.env` 文件中使用：

```bash
# 本地 PostgreSQL 连接
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/tshirt_designer

# 或使用组件形式
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tshirt_designer
DB_USER=postgres
DB_PASSWORD=yourpassword
```

## 验证安装

```powershell
# 检查服务状态
Get-Service -Name "postgresql*"

# 检查端口
netstat -an | Select-String "5432"

# 连接测试
psql -U postgres -h localhost -p 5432
```