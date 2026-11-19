# 🚀 部署到腾讯云指南

## 📋 准备工作

### 需要的资源
- 腾讯云服务器（推荐配置：2核4G，Ubuntu 20.04+）
- 域名（可选，用于 HTTPS）

---

## 🗄️ 第一步：安装 PostgreSQL

SSH 登录腾讯云服务器后执行：

```bash
# 1. 更新系统
sudo apt update && sudo apt upgrade -y

# 2. 安装 PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# 3. 检查是否安装成功
psql --version
# 应该显示：psql (PostgreSQL) 14.x 或更高

# 4. 启动服务并设置开机自启
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl status postgresql
# 应该显示 active (running)
```

---

## 🔐 第二步：创建数据库和用户

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 在 PostgreSQL 命令行中执行：
```

```sql
-- 创建数据库
CREATE DATABASE projective;

-- 创建用户（把 'your_secure_password' 改成强密码）
CREATE USER projective_user WITH PASSWORD 'your_secure_password';

-- 授权
GRANT ALL PRIVILEGES ON DATABASE projective TO projective_user;

-- 切换到 projective 数据库
\c projective

-- 授予 schema 权限
GRANT ALL ON SCHEMA public TO projective_user;

-- 退出
\q
```

---

## 🌐 第三步：配置远程访问

### 3.1 修改 PostgreSQL 配置

```bash
# 找到配置文件位置
sudo -u postgres psql -c "SHOW config_file;"

# 编辑配置（替换成上面显示的路径）
sudo nano /etc/postgresql/14/main/postgresql.conf
```

找到这一行：
```
#listen_addresses = 'localhost'
```

改成：
```
listen_addresses = '*'
```

保存退出（Ctrl+X，然后 Y，然后 Enter）。

### 3.2 修改访问控制

```bash
# 编辑 pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

在文件**末尾**添加：
```
# 允许密码认证（建议只允许特定 IP）
host    all             all             0.0.0.0/0               md5
```

**更安全的做法**（只允许你的办公室/家庭 IP）：
```
host    all             all             你的IP/32               md5
```

保存退出。

### 3.3 重启 PostgreSQL

```bash
sudo systemctl restart postgresql
```

---

## 🔥 第四步：配置防火墙

### 4.1 服务器防火墙（UFW）

```bash
# 允许 PostgreSQL 端口
sudo ufw allow 5432/tcp

# 允许 HTTP/HTTPS（部署后端 API 时需要）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 允许 SSH（确保不会把自己锁在外面）
sudo ufw allow 22/tcp

# 启用防火墙
sudo ufw enable
sudo ufw status
```

### 4.2 腾讯云安全组

在腾讯云控制台：

1. 进入 **云服务器** → 选择你的实例
2. 点击 **安全组**
3. 点击 **修改规则**
4. 添加**入站规则**：

| 协议 | 端口 | 来源 | 说明 |
|------|------|------|------|
| TCP | 5432 | 你的IP/32 | PostgreSQL（推荐） |
| TCP | 5432 | 0.0.0.0/0 | PostgreSQL（不安全） |
| TCP | 4000 | 0.0.0.0/0 | 后端 API |
| TCP | 80 | 0.0.0.0/0 | HTTP |
| TCP | 443 | 0.0.0.0/0 | HTTPS |

**安全建议**：PostgreSQL 端口只对你的开发机 IP 开放，不要对全世界开放。

---

## 🧪 第五步：测试连接

在**本地电脑**上测试：

```bash
# 方法1：用 psql 客户端
psql "postgresql://projective_user:your_secure_password@你的腾讯云IP:5432/projective"

# 方法2：用 curl 测试端口
curl -v telnet://你的腾讯云IP:5432

# 如果连接成功，应该能看到 PostgreSQL 的响应
```

---

## 📦 第六步：部署后端到腾讯云

### 6.1 安装 Node.js

```bash
# 安装 nvm（Node 版本管理器）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载配置
source ~/.bashrc

# 安装 Node.js 18+
nvm install 18
nvm use 18
node --version  # 应该显示 v18.x
```

### 6.2 上传代码

**方法1：用 Git（推荐）**

```bash
# 在服务器上
cd /var/www  # 或你喜欢的目录
git clone https://github.com/你的用户名/ai-projective-cards.git
cd ai-projective-cards/server
```

**方法2：用 SCP 上传**

```bash
# 在本地电脑上
scp -r server/ root@你的腾讯云IP:/var/www/ai-projective-cards/
```

### 6.3 配置环境变量

```bash
cd /var/www/ai-projective-cards/server

# 创建 .env 文件
nano .env
```

填入以下内容（**替换实际的值**）：

```bash
# 数据库连接
DATABASE_URL=postgresql://projective_user:your_secure_password@localhost:5432/projective

# 加密密钥（从本地 server/.env 复制，或重新生成）
CONTENT_ENCRYPTION_KEY=你的64位十六进制密钥
JWT_SECRET=你的64位十六进制密钥

# 管理员 Token（从本地 server/.env 复制）
ADMIN_TOKEN=你的管理员Token

# CORS 来源（你的前端域名）
CORS_ORIGINS=https://你的域名.com

# 端口
PORT=4000

# 生产模式
NODE_ENV=production
```

**重新生成密钥**（如果需要）：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

保存退出。

### 6.4 安装依赖并构建

```bash
npm install
npm run build
```

### 6.5 用 PM2 启动服务

```bash
# 安装 PM2（进程管理器）
npm install -g pm2

# 启动后端
pm2 start dist/index.js --name projective-backend

# 设置开机自启
pm2 startup
# 按照提示执行命令

pm2 save

# 查看状态
pm2 status
pm2 logs projective-backend
```

---

## 🌍 第七步：配置反向代理（可选但推荐）

用 Nginx 做反向代理，可以：
- 支持 HTTPS
- 隐藏后端端口
- 更好的性能

```bash
# 安装 Nginx
sudo apt install nginx -y

# 创建配置文件
sudo nano /etc/nginx/sites-available/projective
```

填入：

```nginx
server {
    listen 80;
    server_name api.你的域名.com;  # 或直接用 IP

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/projective /etc/nginx/sites-enabled/
sudo nginx -t  # 测试配置
sudo systemctl restart nginx
```

---

## 🔒 第八步：配置 HTTPS（推荐）

用 Let's Encrypt 免费证书：

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 自动配置 HTTPS
sudo certbot --nginx -d api.你的域名.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 🖥️ 第九步：更新前端配置

在**本地**的 `.env.local` 中：

```bash
# 开发环境（连接到腾讯云数据库）
BACKEND_URL=http://你的腾讯云IP:4000

# 或者如果配置了 Nginx 和域名
BACKEND_URL=https://api.你的域名.com

# AI 配置保持不变
AI_PROVIDER=deepseek
AI_API_KEY=你的Key
AI_MODEL=deepseek-v4-flash
```

重启本地前端：

```bash
npm run dev
```

---

## ✅ 第十步：验证部署

### 测试后端

```bash
# 健康检查
curl http://你的腾讯云IP:4000/health
# 应该返回：{"ok":true}

# 测试管理接口
curl -H "Authorization: Bearer 你的ADMIN_TOKEN" \
  http://你的腾讯云IP:4000/admin/stats
```

### 测试完整流程

1. 访问本地前端：http://localhost:3001
2. 开始一次探索
3. 检查腾讯云上的数据：
   ```bash
   sudo -u postgres psql -d projective -c "SELECT COUNT(*) FROM explorations;"
   ```

---

## 📊 常用管理命令

### PostgreSQL

```bash
# 查看所有数据库
sudo -u postgres psql -l

# 连接到 projective 数据库
sudo -u postgres psql -d projective

# 查看表
\dt

# 查看探索记录数量
SELECT COUNT(*) FROM explorations;

# 查看最近的主题
SELECT theme, count FROM theme_stats ORDER BY last_seen DESC LIMIT 10;

# 备份数据库
sudo -u postgres pg_dump projective > backup_$(date +%Y%m%d).sql

# 恢复数据库
sudo -u postgres psql projective < backup_20240804.sql
```

### PM2

```bash
# 查看日志
pm2 logs projective-backend

# 重启服务
pm2 restart projective-backend

# 停止服务
pm2 stop projective-backend

# 查看资源占用
pm2 monit
```

---

## 🔐 安全加固建议

### 1. 修改 PostgreSQL 默认端口

```bash
sudo nano /etc/postgresql/14/main/postgresql.conf
# 改 port = 5432 为 port = 15432
sudo systemctl restart postgresql
```

### 2. 使用 SSL 连接

```bash
# 在 PostgreSQL 配置中启用 SSL
sudo nano /etc/postgresql/14/main/postgresql.conf
# ssl = on

# 生成自签名证书（或使用 Let's Encrypt）
sudo -u postgres openssl req -new -x509 -days 365 -nodes \
  -text -out /etc/postgresql/14/main/server.crt \
  -keyout /etc/postgresql/14/main/server.key

sudo chmod 600 /etc/postgresql/14/main/server.key
sudo chown postgres:postgres /etc/postgresql/14/main/server.*
```

连接串改成：
```
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

### 3. 限制 SSH 登录

```bash
# 禁用 root 密码登录，只允许密钥
sudo nano /etc/ssh/sshd_config
# PermitRootLogin prohibit-password
# PasswordAuthentication no

sudo systemctl restart sshd
```

---

## 🐛 常见问题

### Q1: 无法连接到数据库

```bash
# 检查 PostgreSQL 是否运行
sudo systemctl status postgresql

# 检查端口是否监听
sudo netstat -tuln | grep 5432

# 查看日志
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### Q2: 权限错误

```sql
-- 重新授权
sudo -u postgres psql -d projective
GRANT ALL ON SCHEMA public TO projective_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO projective_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO projective_user;
```

### Q3: 后端启动失败

```bash
# 查看详细日志
pm2 logs projective-backend --lines 100

# 手动启动查看错误
cd /var/www/ai-projective-cards/server
node dist/index.js
```

---

## 💰 成本估算

### 腾讯云最低配置

- 轻量应用服务器：2核2G，60GB SSD
- 流量：1TB/月
- **约 ¥50-80/月**

### 优化成本

- 使用按量付费（开发阶段）
- 申请学生优惠（如果是学生）
- 使用国内的其他云服务（阿里云、华为云）

---

## 🎯 快速开始（最小化版本）

如果你只是想快速测试：

```bash
# 1. 安装 PostgreSQL
sudo apt install postgresql -y

# 2. 创建数据库
sudo -u postgres createdb projective

# 3. 启动后端（在本地 server 目录）
DATABASE_URL=postgresql://postgres@你的腾讯云IP/projective npm start
```

---

## 📞 需要帮助？

如果遇到问题，提供以下信息：
- 服务器系统版本：`lsb_release -a`
- PostgreSQL 版本：`psql --version`
- Node.js 版本：`node --version`
- 错误日志：`pm2 logs` 或具体报错信息
