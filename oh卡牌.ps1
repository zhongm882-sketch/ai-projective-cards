# ========================================================
#  OH 卡牌 - AI 投射卡探索 一键启动脚本
#  ========================================================
#
#  使用方法：
#  1. 右键此文件 → "使用 PowerShell 运行"
#  2. 或者在 PowerShell 中执行：.\oh卡牌.ps1
#  3. 脚本会自动检测端口 3001 是否被占用
#  4. 如果端口被占用，会提示你选择处理方式
#  5. 服务启动后会自动打开浏览器
#
#  前置要求：
#  - 已安装 Node.js (推荐 v18 或更高版本)
#  - 已运行 npm install 安装依赖
#  - 已配置 .env.local 文件中的 API Key
#
#  首次运行可能需要执行：
#  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#
#  作者：OH 卡牌项目组
#  版本：1.0
#
# ========================================================

param(
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# 显示欢迎界面
function Show-Welcome {
    Clear-Host
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                           ║" -ForegroundColor Cyan
    Write-Host "║     🃏   OH 卡牌 - AI 投射卡探索                          ║" -ForegroundColor Cyan
    Write-Host "║                                                           ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

# 检查 Node.js
function Test-NodeJS {
    Write-Host "[1/5] 检查 Node.js 环境..." -ForegroundColor Yellow
    try {
        $nodeVer = node -v 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Node.js not found"
        }
        Write-Host "✅ Node.js 版本：$nodeVer" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "❌ 错误：未找到 Node.js，请先安装 Node.js" -ForegroundColor Red
        Write-Host "📥 下载地址：https://nodejs.org/" -ForegroundColor Gray
        return $false
    }
}

# 检查依赖
function Test-Dependencies {
    Write-Host ""
    Write-Host "[2/5] 检查项目依赖..." -ForegroundColor Yellow
    if (-not (Test-Path "node_modules")) {
        Write-Host "⚠️  未找到 node_modules，正在安装依赖..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ 依赖安装失败！" -ForegroundColor Red
            return $false
        }
    }
    Write-Host "✅ 依赖检查完成" -ForegroundColor Green
    return $true
}

# 检查配置文件
function Test-Config {
    Write-Host ""
    Write-Host "[3/5] 检查配置文件..." -ForegroundColor Yellow
    if (-not (Test-Path ".env.local")) {
        Write-Host "⚠️  未找到 .env.local，从示例文件创建..." -ForegroundColor Yellow
        if (Test-Path ".env.local.example") {
            Copy-Item ".env.local.example" ".env.local"
            Write-Host "✅ 已创建 .env.local" -ForegroundColor Green
            Write-Host ""
            Write-Host "📝 提示：请在 .env.local 中填入 AI_API_KEY 后重新运行此脚本" -ForegroundColor Yellow
            Write-Host ""
            Read-Host "按回车键退出"
            exit 1
        } else {
            Write-Host "❌ 未找到 .env.local.example" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "✅ 配置文件已就绪" -ForegroundColor Green
    }
    return $true
}

# 检测并处理端口占用
function Test-Port {
    param([int]$CheckPort)
    Write-Host ""
    Write-Host "[4/5] 检测端口 $CheckPort..." -ForegroundColor Yellow

    $portInUse = $false
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $CheckPort)
        $listener.Start()
        $listener.Stop()
    } catch {
        $portInUse = $true
    }

    if ($portInUse) {
        Write-Host "⚠️  端口 $CheckPort 已被占用！" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "请选择：" -ForegroundColor White
        Write-Host "  1. 终止占用端口的进程并继续" -ForegroundColor Gray
        Write-Host "  2. 使用其他端口" -ForegroundColor Gray
        Write-Host "  3. 退出" -ForegroundColor Gray
        Write-Host ""

        $choice = Read-Host "请输入选项 (1/2/3)"

        switch ($choice) {
            "1" {
                $processes = Get-NetTCPConnection -LocalPort $CheckPort -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
                if ($processes) {
                    foreach ($pid in $processes) {
                        if ($pid -ne 0) {
                            try {
                                Stop-Process -Id $pid -Force
                                Write-Host "✅ 已终止进程 PID: $pid" -ForegroundColor Green
                            } catch {
                                Write-Host "❌ 无法终止进程 PID: $pid" -ForegroundColor Red
                            }
                        }
                    }
                    Start-Sleep -Seconds 1
                }
            }
            "2" {
                $newPort = Read-Host "请输入新的端口号"
                return [int]$newPort
            }
            default {
                Write-Host "再见！" -ForegroundColor Gray
                exit 0
            }
        }
    }

    Write-Host "✅ 端口 $CheckPort 可用" -ForegroundColor Green
    return $CheckPort
}

# 等待服务就绪
function Wait-ServerReady {
    param([string]$Url, [int]$TimeoutSeconds = 60)
    Write-Host ""
    Write-Host "[5/5] 启动服务..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🚀 正在启动 Next.js 开发服务器..." -ForegroundColor Cyan
    Write-Host "📍 访问地址：$Url" -ForegroundColor Gray
    Write-Host "⏰ 等待服务就绪..." -ForegroundColor Gray
    Write-Host ""

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 302 -or $response.StatusCode -eq 301) {
                return $true
            }
        } catch {
            # 请求失败，继续等待
        }
        Write-Host "⏳ 等待服务启动... ($([math]::Floor($stopwatch.Elapsed.TotalSeconds))s)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
    return $false
}

# 主函数
function Main {
    Show-Welcome

    if (-not (Test-NodeJS)) {
        Read-Host "按回车键退出"
        exit 1
    }

    if (-not (Test-Dependencies)) {
        Read-Host "按回车键退出"
        exit 1
    }

    if (-not (Test-Config)) {
        Read-Host "按回车键退出"
        exit 1
    }

    $global:Port = Test-Port -CheckPort $Port
    $url = "http://localhost:$global:Port"

    # 启动后台进程
    $process = Start-Process -FilePath "npm" -ArgumentList "run", "dev", "--", "-p", $global:Port -NoNewWindow -PassThru -WorkingDirectory $ScriptDir

    # 等待服务就绪
    if (Wait-ServerReady -Url $url) {
        Write-Host ""
        Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║                                                           ║" -ForegroundColor Green
        Write-Host "║     ✅  服务启动成功！                                     ║" -ForegroundColor Green
        Write-Host "║                                                           ║" -ForegroundColor Green
        Write-Host "║     🌐  访问地址：$url" -ForegroundColor Green
        while ("$url".Length -lt 55) { $url += " " }
        Write-Host "║                                                           ║" -ForegroundColor Green
        Write-Host "║     📖  按 Ctrl+C 停止服务                                 ║" -ForegroundColor Green
        Write-Host "║                                                           ║" -ForegroundColor Green
        Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
        Write-Host ""

        # 打开浏览器
        Write-Host "🌐 正在打开浏览器..." -ForegroundColor Cyan
        Start-Process $url

        Write-Host ""
        Write-Host "📜 实时日志：" -ForegroundColor Gray
        Write-Host "──────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
        Write-Host ""

        # 等待进程结束
        $process.WaitForExit()
    } else {
        Write-Host ""
        Write-Host "❌ 服务启动超时，请检查日志" -ForegroundColor Red
        if ($process -and !$process.HasExited) {
            $process.Kill()
        }
        Read-Host "按回车键退出"
        exit 1
    }
}

# 清理事件
function Cleanup {
    Write-Host ""
    Write-Host "👋 正在停止服务..." -ForegroundColor Yellow
    if ($global:process -and !$global:process.HasExited) {
        try {
            $global:process.Kill()
        } catch {}
    }
    Write-Host "✅ 服务已停止，再见！" -ForegroundColor Green
}

# 注册清理事件
try {
    Main
} finally {
    Cleanup
}
