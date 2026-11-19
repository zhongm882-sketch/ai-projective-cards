# 本地 PostgreSQL 安装指南（Windows）

## 方法1：官方安装包（推荐）

### 1. 下载 PostgreSQL

访问：https://www.postgresql.org/download/windows/

或直接下载：https://www.enterprisedb.com/downloads/postgres-postgresql-downloads

**推荐版本**：PostgreSQL 16.x（最新稳定版）

点击 **Windows x86-64** 下载。

### 2. 安装步骤

1. 双击安装包 `postgresql-16.x-windows-x64.exe`
2. 点击 "Next"
3. **Installation Directory**：保持默认 `C:\Program Files\PostgreSQL\16`
4. **Select Components**：全选（默认）
5. **Data Directory**：保持默认 `C:\Program Files\PostgreSQL\16\data`
6. **Password**：设置 postgres 用户密码（**记住这个密码！**）
   - 建议用简单的，比如：`postgres`（仅本地开发）
7. **Port**：保持默认 `5432`
8. **Locale**：选择 `Chinese, China` 或 `Default locale`
9. 点击 "Next" 完成安装
10. 取消勾选 "Launch Stack Builder"，点击 "Finish"

### 3. 验证安装

打开 **PowerShell** 或 **命令提示符**：

```bash
# 检查版本
"C:\Program Files\PostgreSQL\16\bin\psql.exe" --version

# 应该显示：psql (PostgreSQL) 16.x
```

### 4. 添加到环境变量（可选，方便后续使用）

1. 右键"此电脑" → "属性"
2. 点击"高级系统设置"
3. 点击"环境变量"
4. 在"系统变量"中找到 `Path`，双击编辑
5. 点击"新建"，添加：`C:\Program Files\PostgreSQL\16\bin`
6. 点击"确定"保存

重启终端后，可以直接使用 `psql` 命令。

---

## 方法2：Chocolatey（如果你用包管理器）

```powershell
# 以管理员身份运行 PowerShell
choco install postgresql

# 启动服务
net start postgresql-x64-16
```

---

## 创建项目数据库

### 方法1：用图形界面（pgAdmin）

1. 打开 **pgAdmin 4**（安装时自动安装的）
2. 右键 "Databases" → "Create" → "Database"
3. Name：`projective`
4. 点击 "Save"

### 方法2：用命令行

打开 PowerShell 或 Git Bash：

```bash
# 连接到 PostgreSQL（用你安装时设置的密码）
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

# 在 psql 命令行中执行：
CREATE DATABASE projective;

# 退出
\q
```

---

## 验证数据库创建成功

```bash
# 连接到 projective 数据库
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d projective

# 应该看到：projective=#
# 输入 \q 退出
```

---

## 配置连接串

在项目的 `server/.env` 中，确认连接串为：

```bash
DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/projective
```

如果你的密码是 `postgres`，那就是：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/projective
```

---

## 🎉 完成！

现在你有了：
- ✅ PostgreSQL 16 安装在本地
- ✅ `projective` 数据库已创建
- ✅ 可以启动后端了

下一步：启动后端服务

---

## 常见问题

### Q1: 安装时提示端口 5432 被占用

**解决**：
1. 检查是否已经安装过 PostgreSQL
2. 卸载旧版本，或者在安装时选择其他端口（如 5433）
3. 如果选了其他端口，记得在 `DATABASE_URL` 中也改成对应端口

### Q2: 忘记密码

**解决**：
1. 找到 `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
2. 把所有 `md5` 改成 `trust`
3. 重启 PostgreSQL 服务：
   ```powershell
   net stop postgresql-x64-16
   net start postgresql-x64-16
   ```
4. 连接后重设密码：
   ```sql
   ALTER USER postgres WITH PASSWORD '新密码';
   ```
5. 把 `pg_hba.conf` 改回 `md5`
6. 再次重启服务

### Q3: 服务没有启动

```powershell
# 启动服务
net start postgresql-x64-16

# 查看服务状态
sc query postgresql-x64-16

# 设置开机自启
sc config postgresql-x64-16 start= auto
```

---

## 图形界面工具（可选）

除了自带的 pgAdmin，还可以用：

- **DBeaver**：https://dbeaver.io/ （免费，功能强大）
- **DataGrip**：https://www.jetbrains.com/datagrip/ （付费，但功能最全）
- **Postbird**：https://github.com/Paxa/postbird （轻量级）

---

需要帮助？提供错误信息，我会帮你解决！
