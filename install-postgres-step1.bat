@echo off
echo ========================================
echo PostgreSQL 16 安装助手
echo ========================================
echo.
echo 正在打开下载页面...
echo.
echo 请下载：PostgreSQL 16.x Windows x86-64
echo.

start https://www.enterprisedb.com/downloads/postgres-postgresql-downloads

echo.
echo ========================================
echo 下载说明：
echo ========================================
echo.
echo 1. 在打开的网页中，找到 PostgreSQL 16.x
echo 2. 点击 "Windows x86-64" 下载按钮
echo 3. 下载大小约 250 MB
echo.
echo 下载完成后，按照以下步骤安装：
echo.
echo ----------------------------------------
echo 安装步骤：
echo ----------------------------------------
echo.
echo 1. 双击下载的安装包（postgresql-16.x-windows-x64.exe）
echo.
echo 2. 点击 "Next" 继续
echo.
echo 3. 安装位置：保持默认 C:\Program Files\PostgreSQL\16
echo.
echo 4. 组件选择：全选（默认）
echo.
echo 5. 数据目录：保持默认
echo.
echo 6. **重要** 设置密码：
echo    输入: postgres
echo    确认: postgres
echo    （这是本地开发密码，简单好记）
echo.
echo 7. 端口：保持默认 5432
echo.
echo 8. 区域设置：选择 "Default locale" 或 "Chinese, China"
echo.
echo 9. 点击 "Next" 完成安装（大约需要 3-5 分钟）
echo.
echo 10. 安装完成后，取消勾选 "Launch Stack Builder"
echo.
echo ----------------------------------------
echo 安装完成后，运行：
echo   install-postgres-step2.bat
echo ----------------------------------------
echo.
pause
