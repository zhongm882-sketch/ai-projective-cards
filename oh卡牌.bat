@echo off
chcp 65001 >nul
title OH 卡牌 - AI 投射卡探索

:: ========================================================
::  OH 卡牌 - AI 投射卡探索 一键启动脚本
::  ========================================================
::
::  使用方法：
::  1. 双击此文件即可启动
::  2. 脚本会自动检测端口 3001 是否被占用
::  3. 如果端口被占用，会提示你选择处理方式
::  4. 服务启动后会自动打开默认浏览器
::
::  前置要求：
::  - 已安装 Node.js (推荐 v18 或更高版本)
::  - 已运行 npm install 安装依赖
::  - 已配置 .env.local 文件中的 API Key
::
::  作者：OH 卡牌项目组
::  版本：1.0
::
:: ========================================================

cd /d "%~dp0"
set PORT=3001

:START
cls
echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║     🃏   OH 卡牌 - AI 投射卡探索                          ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

:: 检查 Node.js 是否安装
echo [1/5] 检查 Node.js 环境...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误：未找到 Node.js，请先安装 Node.js
    echo 📥 下载地址：https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo ✅ Node.js 版本：%NODE_VER%

:: 检查依赖是否安装
echo.
echo [2/5] 检查项目依赖...
if not exist "node_modules" (
    echo ⚠️  未找到 node_modules，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败！
        echo.
        pause
        exit /b 1
    )
)
echo ✅ 依赖检查完成

:: 检查 .env.local 文件
echo.
echo [3/5] 检查配置文件...
if not exist ".env.local" (
    echo ⚠️  未找到 .env.local，从示例文件创建...
    if exist ".env.local.example" (
        copy ".env.local.example" ".env.local" >nul
        echo ✅ 已创建 .env.local
        echo.
        echo 📝 请编辑 .env.local 填入你的 API Key 后重新运行此脚本
        echo.
        pause
        exit /b 0
    ) else (
        echo ❌ 未找到 .env.local.example
        echo.
        pause
        exit /b 1
    )
) else (
    echo ✅ 配置文件已就绪
)

:: 检测端口占用
echo.
echo [4/5] 检测端口 %PORT%...
netstat -ano | findstr ":%PORT% " >nul
if %errorlevel% equ 0 (
    echo ⚠️  端口 %PORT% 已被占用！
    echo.
    echo 请选择：
    echo   1. 使用其他端口
    echo   2. 退出
    echo.
    set /p CHOICE="请输入选项 (1/2): "
    if "!CHOICE!"=="1" (
        set /p PORT="请输入新的端口号: "
        goto START
    ) else (
        echo 再见！
        exit /b 0
    )
)
echo ✅ 端口 %PORT% 可用

:: 启动服务
echo.
echo [5/5] 启动服务...
echo.
echo 🚀 正在启动 Next.js 开发服务器...
echo 📍 访问地址：http://localhost:%PORT%
echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║     ✅  准备就绪！即将启动服务...                         ║
echo ║                                                           ║
echo ║     🌐  访问地址：http://localhost:%PORT%                   ║
echo ║                                                           ║
echo ║     📖  服务启动后请在浏览器中打开上面的地址               ║
echo ║     📖  按 Ctrl+C 可以停止服务                             ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo 3 秒后自动打开浏览器并启动服务...
timeout /t 3 >nul

:: 打开浏览器
start "" "http://localhost:%PORT%"

echo.
echo 📜 实时日志（按 Ctrl+C 停止）：
echo ──────────────────────────────────────────────────────────────────────
echo.

:: 启动服务
call npm run dev -- -p %PORT%

echo.
echo 服务已停止
pause
