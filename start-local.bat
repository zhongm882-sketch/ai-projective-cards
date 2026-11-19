@echo off
chcp 65001 >nul
title AI 投射卡 - 本地开发环境

echo.
echo ========================================
echo   AI 投射卡 - 本地开发环境
echo ========================================
echo.

REM 检查 PostgreSQL
if not exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" (
    if not exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" (
        echo ✗ PostgreSQL 未安装
        echo.
        echo 请先运行：
        echo   1. install-postgres-step1.bat  （下载安装）
        echo   2. install-postgres-step2.bat  （配置数据库）
        echo.
        pause
        exit /b 1
    )
)

REM 检查 server/.env
if not exist "server\.env" (
    echo ✗ server\.env 未配置
    echo.
    echo 请先运行：install-postgres-step2.bat
    echo.
    pause
    exit /b 1
)

REM 检查 .env.local
if not exist ".env.local" (
    echo ⚠ .env.local 未配置
    echo.
    echo 创建默认配置...
    (
        echo # 后端地址
        echo BACKEND_URL=http://localhost:4000
        echo.
        echo # AI 配置（请填写你的 API Key）
        echo AI_PROVIDER=deepseek
        echo AI_API_KEY=
        echo AI_MODEL=deepseek-chat
    ) > .env.local
    echo ✓ 已创建 .env.local
    echo.
    echo ⚠ 请编辑 .env.local 填写你的 AI_API_KEY
    echo.
    pause
)

REM 检查后端是否已构建
if not exist "server\dist\index.js" (
    echo [构建后端]
    cd server
    call npm run build
    if errorlevel 1 (
        echo ✗ 后端构建失败
        pause
        exit /b 1
    )
    cd ..
    echo ✓ 后端构建完成
    echo.
)

echo ========================================
echo 启动服务...
echo ========================================
echo.

REM 启动后端
echo [后端] 正在启动 http://localhost:4000
start "AI投射卡-后端" cmd /k "cd /d %~dp0server && npm start"
timeout /t 3 /nobreak >nul

REM 启动前端
echo [前端] 正在启动 http://localhost:3001
start "AI投射卡-前端" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ========================================
echo ✅ 启动完成！
echo ========================================
echo.
echo 服务地址：
echo   前端: http://localhost:3001
echo   后端: http://localhost:4000
echo.
echo 管理后台：
echo   统计: http://localhost:4000/admin/stats
echo   Token: <ADMIN_TOKEN_见server/.env>
echo.
echo 关闭窗口会停止所有服务
echo.
echo 按任意键打开浏览器...
pause >nul

start http://localhost:3001

echo.
echo 提示: 关闭此窗口将停止所有服务
echo.
pause
