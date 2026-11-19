@echo off
chcp 65001 >nul
title PostgreSQL 安装监测器

:CHECK_LOOP
cls
echo ========================================
echo PostgreSQL 安装监测器
echo ========================================
echo.
echo 正在检查 PostgreSQL 安装状态...
echo.

REM 检查 PostgreSQL 16
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" (
    echo ✓ PostgreSQL 16 已安装！
    echo.
    echo 自动进入配置步骤...
    timeout /t 2 /nobreak >nul
    call install-postgres-step2.bat
    exit /b 0
)

REM 检查 PostgreSQL 15
if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" (
    echo ✓ PostgreSQL 15 已安装！
    echo.
    echo 自动进入配置步骤...
    timeout /t 2 /nobreak >nul
    call install-postgres-step2.bat
    exit /b 0
)

REM 检查 PostgreSQL 14
if exist "C:\Program Files\PostgreSQL\14\bin\psql.exe" (
    echo ✓ PostgreSQL 14 已安装！
    echo.
    echo 自动进入配置步骤...
    timeout /t 2 /nobreak >nul
    call install-postgres-step2.bat
    exit /b 0
)

echo ⏳ PostgreSQL 尚未安装
echo.
echo 请完成以下步骤：
echo 1. 下载：https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
echo 2. 双击安装包
echo 3. 密码设置为：postgres
echo 4. 等待安装完成
echo.
echo 本窗口会自动检测安装完成...
echo.
echo 按 Ctrl+C 退出监测
echo.

timeout /t 10 /nobreak >nul
goto CHECK_LOOP
