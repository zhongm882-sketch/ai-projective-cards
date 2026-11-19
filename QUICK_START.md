# 🚀 快速启动指南

## 方法1：通过 Neon Web 界面（最简单）

### 步骤1：创建数据库
1. 访问 https://console.neon.tech/app/projects
2. 点击 "New Project"
3. 项目名称填：`ai-projective-cards`
4. 点击 "Create Project"

### 步骤2：获取连接字符串
1. 在项目页面，找到 "Connection Details"
2. 选择 "Pooled connection"
3. 复制连接字符串（类似这样）：
   ```
   postgresql://neondb_owner:npg_xxx@ep-xxx.aws.neon.tech/neondb?sslmode=require
   ```

### 步骤3：更新配置
运行下面的命令，把连接字符串粘贴进去：

```bash
# Windows
notepad server\.env

# 或者用任何文本编辑器打开
# d:\项目\ai-projective-cards\server\.env
```

找到第4行，替换为你的连接字符串：
```
DATABASE_URL=你的连接字符串
```

保存文件。

### 步骤4：启动后端
```bash
# 在项目根目录运行
start-backend.bat
```

或手动运行：
```bash
cd server
npm run build
npm start
```

### 步骤5：启动前端
打开新的终端：
```bash
npm run dev
```

---

## 方法2：我来帮你配置（告诉我连接字符串）

如果你已经在 Neon 创建了项目，把连接字符串发给我，我帮你：
1. 更新 `server/.env`
2. 运行构建
3. 启动服务

---

## 验证是否成功

后端启动成功的标志：
```
✓ 数据库迁移完成
{"level":30,"msg":"Server listening at http://0.0.0.0:4000"}
```

前端访问 `http://localhost:3000`，如果能看到首页就成功了！

---

## 如果不想用数据库

你也可以纯本地模式运行（不启动后端）：

```bash
# 只启动前端
npm run dev

# 在设置页填写 AI Key
# 数据只保存在浏览器 localStorage
```

---

你想用哪种方法？
