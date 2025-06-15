@echo off
echo 🚀 启动 GOST 代理管理系统
echo ================================
echo.
echo 📋 系统信息:
echo    - 版本: 1.0.0
echo    - 端口: 3000
echo    - 数据库: SQLite
echo.
echo 👤 默认管理员账户:
echo    - 用户名: admin
echo    - 密码: admin123
echo.
echo 🌐 访问地址: http://localhost:3000
echo.
echo 正在启动服务...
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 Node.js，请先安装 Node.js ^(^>= 14.0.0^)
    pause
    exit /b 1
)

REM 进入后端目录
cd backend

REM 检查依赖
if not exist "node_modules" (
    echo 📦 安装依赖...
    npm install --production
)

REM 启动服务
echo 🚀 启动服务...
node app.js

pause
