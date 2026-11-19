# 🐳 Docker Desktop 安装指南（Windows）

Docker 不是必需的，但安装后可以：
- 快速启动各种开发环境（数据库、Redis、Nginx 等）
- 容器化部署应用
- 与团队共享一致的开发环境

---

## 📥 下载 Docker Desktop

**官方下载页**：
https://www.docker.com/products/docker-desktop/

**直接下载**：
https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe

**系统要求**：
- Windows 10 64位：专业版、企业版或教育版（Build 19041 或更高）
- Windows 11 64位：家庭版或专业版
- 需要启用 WSL 2（Windows Subsystem for Linux 2）

---

## 🔧 安装步骤

### 1. 启用 WSL 2

以**管理员身份**打开 PowerShell，执行：

```powershell
# 启用 WSL
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

# 启用虚拟机平台
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# 重启电脑
Restart-Computer
```

重启后，继续以管理员身份打开 PowerShell：

```powershell
# 设置 WSL 2 为默认版本
wsl --set-default-version 2

# 安装 Ubuntu（可选，但推荐）
wsl --install -d Ubuntu
```

### 2. 安装 Docker Desktop

1. 双击 `Docker Desktop Installer.exe`
2. 勾选 **"Use WSL 2 instead of Hyper-V"**
3. 勾选 **"Add shortcut to desktop"**（可选）
4. 点击 "OK" 开始安装
5. 安装完成后，点击 "Close and restart"

### 3. 首次启动

1. 打开 Docker Desktop
2. 接受服务条款
3. 跳过登录（可以不注册账号）
4. 等待 Docker 引擎启动（托盘图标变成绿色）

### 4. 验证安装

打开 PowerShell 或 Git Bash：

```bash
# 检查版本
docker --version
# 应该显示：Docker version 24.x.x

docker-compose --version
# 应该显示：Docker Compose version 2.x.x

# 运行测试容器
docker run hello-world
# 应该显示：Hello from Docker!
```

---

## 🚀 用 Docker 运行 PostgreSQL（可选）

如果你安装了 Docker，可以用它运行 PostgreSQL，而不用安装 PostgreSQL：

### 方法1：命令行启动

```bash
docker run -d \
  --name projective-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=projective \
  -p 5432:5432 \
  -v projective-data:/var/lib/postgresql/data \
  postgres:16
```

### 方法2：docker-compose（推荐）

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    container_name: projective-postgres
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: projective
    ports:
      - "5432:5432"
    volumes:
      - projective-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  projective-data:
```

启动：

```bash
docker-compose up -d
```

停止：

```bash
docker-compose down
```

---

## 📝 Docker 常用命令

```bash
# 查看运行中的容器
docker ps

# 查看所有容器（包括停止的）
docker ps -a

# 启动容器
docker start projective-postgres

# 停止容器
docker stop projective-postgres

# 删除容器
docker rm projective-postgres

# 查看日志
docker logs projective-postgres

# 进入容器
docker exec -it projective-postgres psql -U postgres -d projective
```

---

## 🎯 Docker 的优势

### 对比传统安装 PostgreSQL

| 特性 | Docker | 传统安装 |
|------|--------|----------|
| 安装速度 | ⚡ 快（1条命令） | 🐢 慢（需要下载安装包） |
| 多版本共存 | ✅ 容易（不同端口） | ❌ 困难（容易冲突） |
| 卸载干净 | ✅ 完全（删除容器即可） | ❌ 留下残留文件 |
| 跨平台 | ✅ 一致（Win/Mac/Linux） | ❌ 不同平台配置不同 |
| 学习成本 | 📚 需要学 Docker | 📖 只需学 PostgreSQL |

---

## ⚠️ 常见问题

### Q1: Docker Desktop 启动慢

**原因**：WSL 2 首次启动需要时间

**解决**：
- 等待 1-2 分钟
- 检查 WSL 是否正常：`wsl --list --verbose`

### Q2: 端口冲突（5432 被占用）

**解决**：
```bash
# 检查谁占用了端口
netstat -ano | findstr :5432

# 修改 Docker 容器端口映射
docker run -p 5433:5432 ...
# 连接时用：localhost:5433
```

### Q3: Docker Desktop 占用内存大

**解决**：
1. 打开 Docker Desktop
2. Settings → Resources
3. 降低 Memory 和 CPU 限制
4. 点击 "Apply & Restart"

### Q4: WSL 2 安装失败

**解决**：
- 确保 Windows 版本符合要求
- 在 BIOS 中启用虚拟化（VT-x/AMD-V）
- 更新 Windows 到最新版本

---

## 🎓 学习资源

- **Docker 官方教程**：https://docs.docker.com/get-started/
- **Docker Compose 文档**：https://docs.docker.com/compose/
- **PostgreSQL Docker 镜像**：https://hub.docker.com/_/postgres

---

## 💡 我的建议

### 现在（本地开发）
1. ✅ 先安装 PostgreSQL（传统方式）
2. ⏳ Docker 可以稍后学习

### 以后（部署和团队协作）
1. 学习 Docker 基础
2. 用 Docker Compose 管理开发环境
3. 部署时用 Docker 容器化

**原因**：
- PostgreSQL 是你马上需要的
- Docker 是锦上添花，不着急
- 等熟悉了 PostgreSQL，再学 Docker 更容易理解

---

需要安装 Docker？运行：
```bash
start https://www.docker.com/products/docker-desktop/
```

或者先专注于 PostgreSQL，Docker 以后再说！
