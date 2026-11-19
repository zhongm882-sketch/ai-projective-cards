@echo off
chcp 65001 >nul
echo ========================================
echo   AI 投射卡数据查看工具
echo ========================================
echo.

set PGPASSWORD=change-me
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"

echo [1] 用户统计
%PSQL% -U postgres -h localhost -p 5432 -d projective -c "SELECT COUNT(*) as 用户总数 FROM users;"
echo.

echo [2] 设备统计
%PSQL% -U postgres -h localhost -p 5432 -d projective -c "SELECT COUNT(*) as 设备总数 FROM devices;"
echo.

echo [3] 探索记录统计
%PSQL% -U postgres -h localhost -p 5432 -d projective -c "SELECT COUNT(*) as 探索总数 FROM explorations;"
echo.

echo [4] 报告统计
%PSQL% -U postgres -h localhost -p 5432 -d projective -c "SELECT COUNT(*) as 报告总数 FROM reports;"
echo.

echo [5] 最近的用户（前10个）
%PSQL% -U postgres -h localhost -p 5432 -d projective -c "SELECT id, email, created_at FROM users ORDER BY created_at DESC LIMIT 10;"
echo.

echo [6] 最近的探索（前10个）
%PSQL% -U postgres -h localhost -p 5432 -d projective -c "SELECT id, card_image_url, created_at FROM explorations ORDER BY created_at DESC LIMIT 10;"
echo.

echo [7] 热门主题（前10个）
%PSQL% -U postgres -h localhost -p 5432 -d projective -c "SELECT theme, COUNT(*) as 次数 FROM report_themes GROUP BY theme ORDER BY 次数 DESC LIMIT 10;"
echo.

echo ========================================
echo 按任意键退出...
pause >nul
