@echo off
echo Starting Gost Manager in development mode...

:: 切换到项目目录
cd ..

:: 创建必要的目录
echo Creating required directories...
mkdir "backend\data" 2>nul
mkdir "backend\logs" 2>nul
mkdir "backend\config" 2>nul
mkdir "backend\public" 2>nul
mkdir "backend\bin" 2>nul

:: 检查环境文件
if not exist backend\.env (
    echo Creating .env file...
    (
        echo PORT=3000
        echo NODE_ENV=development
        echo JWT_SECRET=dev-jwt-secret
        echo JWT_EXPIRES_IN=24h
    ) > backend\.env
)

:: 安装后端依赖
echo Installing backend dependencies...
cd backend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install backend dependencies
    exit /b %ERRORLEVEL%
)

:: 安装前端依赖
echo Installing frontend dependencies...
cd ..\frontend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install frontend dependencies
    exit /b %ERRORLEVEL%
)

:: 设置开发环境变量
set NODE_ENV=development
set PORT=3000
set JWT_SECRET=dev-jwt-secret

:: 启动开发服务器
echo Starting development servers...
cd ..\backend
start "Backend Server" cmd /k "npm run dev"
cd ..\frontend
start "Frontend Server" cmd /k "npm run serve"

echo Development servers started successfully!
echo Backend API: http://localhost:3000
echo Frontend Dev Server: http://localhost:8080

:: 保持窗口打开
pause 