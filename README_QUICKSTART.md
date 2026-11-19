# 🚀 快速开始指南

## 📋 三步启动本地开发环境

### 第1步：安装 PostgreSQL

运行：
```bash
install-postgres-step1.bat
```

这会：
- 打开 PostgreSQL 官网下载页
- 显示详细的安装说明

**关键点**：安装时设置密码为 `postgres`（方便记忆）

---

### 第2步：配置数据库

安装完 PostgreSQL 后，运行：
```bash
install-postgres-step2.bat
```

这会自动：
- ✅ 检查 PostgreSQL 是否安装成功
- ✅ 创建 `projective` 数据库
- ✅ 更新 `server/.env` 配置
- ✅ 测试数据库连接

---

### 第3步：启动服务

运行：
```bash
start-local.bat
```

这会自动：
- ✅ 构建后端（首次运行）
- ✅ 启动后端（http://localhost:4000）
- ✅ 启动前端（http://localhost:3001）
- ✅ 打开浏览器

---

## 🎯 现在可以做什么

### 测试完整功能
1. 访问 http://localhost:3001
2. 点击"开始探索"
3. 完成6轮问答
4. 查看生成的报告
5. 注册账号，数据自动同步

### 查看管理后台
```bash
# 方法1：浏览器访问（需要插件如 ModHeader 添加 Header）
# URL: http://localhost:4000/admin/stats
# Header: Authorization: Bearer <ADMIN_TOKEN_见server/.env>

# 方法2：用 curl
curl -H "Authorization: Bearer <ADMIN_TOKEN_见server/.env>" http://localhost:4000/admin/stats
```

---

## 📂 文件说明

| 文件 | 用途 |
|------|------|
| `install-postgres-step1.bat` | 下载并安装 PostgreSQL |
| `install-postgres-step2.bat` | 配置数据库 |
| `start-local.bat` | 一键启动开发环境 |
| `server/.env` | 后端配置（数据库、密钥） |
| `.env.local` | 前端配置（AI Key、后端地址） |

---

## 🔧 配置 AI Key

编辑 `.env.local`：

```bash
AI_PROVIDER=deepseek
AI_API_KEY=sk-你的key
AI_MODEL=deepseek-chat
```

或者在前端设置页面填写。

---

## ⚙️ 手动启动（如果不想用脚本）

### 启动后端
```bash
cd server
npm run build  # 首次或修改代码后
npm start
```

### 启动前端
```bash
npm run dev
```

---

## 🐛 常见问题

### Q1: PostgreSQL 安装失败

**查看**：`INSTALL_POSTGRES.md` 的常见问题部分

### Q2: 端口被占用

**后端端口冲突**（4000）：
```bash
# 查看占用
netstat -ano | findstr :4000

# 或者修改端口
# 编辑 server/.env，改成：PORT=4001
```

**前端端口冲突**（3001）：
```bash
# Next.js 会自动尝试 3002, 3003...
```

### Q3: 数据库连接失败

**检查 PostgreSQL 服务**：
```bash
# 启动服务
net start postgresql-x64-16

# 查看状态
sc query postgresql-x64-16
```

### Q4: AI 调用失败

**检查**：
- `.env.local` 中的 `AI_API_KEY` 是否正确
- API Key 是否有余额
- 网络能否访问 DeepSeek

---

## 📚 更多文档

- **部署到腾讯云**：`DEPLOY_TENCENT.md`
- **本地开发（无数据库）**：`LOCAL_DEV.md`
- **PostgreSQL 安装详解**：`INSTALL_POSTGRES.md`
- **Docker 安装（可选）**：`INSTALL_DOCKER.md`
- **测试报告**：`TEST_REPORT.md`

---

## 🎉 第一次使用？

按顺序执行：

1. ✅ `install-postgres-step1.bat` → 安装 PostgreSQL
2. ✅ `install-postgres-step2.bat` → 配置数据库
3. ✅ 编辑 `.env.local` → 填写 AI Key
4. ✅ `start-local.bat` → 启动服务
5. ✅ 访问 http://localhost:3001 → 开始探索

---

## 💡 提示

- **关闭窗口**会停止所有服务
- **修改代码后**需要重启服务才能生效
- **数据保存在本地 PostgreSQL**，不会丢失
- **以后部署到腾讯云**，只需要改配置，数据可以导出导入

---

需要帮助？查看对应的 `.md` 文档，或提供错误信息！
