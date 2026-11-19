@echo off
chcp 65001 >nul
echo ========================================
echo PostgreSQL 安装验证和配置
echo ========================================
echo.

REM 检查 PostgreSQL 是否安装
echo [1/5] 检查 PostgreSQL 安装...
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" (
    echo ✓ PostgreSQL 16 已安装
    set PSQL="C:\Program Files\PostgreSQL\16\bin\psql.exe"
) else if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" (
    echo ✓ PostgreSQL 15 已安装
    set PSQL="C:\Program Files\PostgreSQL\15\bin\psql.exe"
) else if exist "C:\Program Files\PostgreSQL\14\bin\psql.exe" (
    echo ✓ PostgreSQL 14 已安装
    set PSQL="C:\Program Files\PostgreSQL\14\bin\psql.exe"
) else (
    echo ✗ PostgreSQL 未找到
    echo.
    echo 请先运行 install-postgres-step1.bat 下载并安装 PostgreSQL
    pause
    exit /b 1
)
echo.

REM 测试连接
echo [2/5] 测试数据库连接...
echo 请输入你在安装时设置的密码（默认建议是: postgres）
echo.
%PSQL% -U postgres -c "SELECT version();" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ 连接成功
) else (
    echo ✗ 连接失败
    echo.
    echo 可能的原因：
    echo 1. 密码不正确
    echo 2. PostgreSQL 服务未启动
    echo.
    echo 尝试启动服务...
    net start postgresql-x64-16 >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✓ 服务已启动，请重新运行此脚本
    ) else (
        echo ! 请手动检查服务状态
    )
    pause
    exit /b 1
)
echo.

REM 创建数据库
echo [3/5] 创建项目数据库...
%PSQL% -U postgres -c "SELECT 1 FROM pg_database WHERE datname='projective';" -t >temp.txt
set /p EXISTS=<temp.txt
del temp.txt

if "%EXISTS%"=="1" (
    echo ⚠ 数据库 projective 已存在，跳过创建
) else (
    %PSQL% -U postgres -c "CREATE DATABASE projective;" >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✓ 数据库 projective 创建成功
    ) else (
        echo ✗ 数据库创建失败
        pause
        exit /b 1
    )
)
echo.

REM 更新配置文件
echo [4/5] 更新项目配置...
echo 请输入你的 PostgreSQL 密码（默认: postgres）:
set /p PGPASSWORD=
if "%PGPASSWORD%"=="" set PGPASSWORD=postgres

REM 读取现有的 .env 内容
if exist "server\.env" (
    findstr /v "DATABASE_URL" server\.env > server\.env.tmp
    move /y server\.env.tmp server\.env >nul
)

REM 添加新的 DATABASE_URL
echo DATABASE_URL=postgresql://postgres:%PGPASSWORD%@localhost:5432/projective>> server\.env
echo ✓ server\.env 已更新
echo.

REM 测试项目连接
echo [5/5] 测试项目数据库连接...
%PSQL% -U postgres -d projective -c "SELECT 'OK' as status;" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ 项目数据库连接成功
) else (
    echo ✗ 连接失败
    pause
    exit /b 1
)
echo.

echo ========================================
echo ✅ PostgreSQL 配置完成！
echo ========================================
echo.
echo 数据库信息：
echo   主机: localhost
echo   端口: 5432
echo   数据库: projective
echo   用户: postgres
echo   密码: %PGPASSWORD%
echo.
echo 下一步：
echo   1. 构建后端：cd server ^&^& npm run build
echo   2. 启动后端：cd server ^&^& npm start
echo   3. 启动前端：npm run dev
echo.
echo 或者直接运行：start-local.bat
echo.
pause
