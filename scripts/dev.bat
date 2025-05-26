@echo off

REM 创建必要的目录
mkdir backend\data 2>nul
mkdir backend\logs 2>nul
mkdir backend\config 2>nul

REM 检查环境文件
if not exist backend\.env (
    echo Creating .env file from example...
    copy backend\.env.example backend\.env
)

REM 安装依赖
echo Installing backend dependencies...
cd backend
call npm install

echo Installing frontend dependencies...
cd ..\frontend
call npm install

REM 启动开发服务器
echo Starting development servers...
start "Backend Server" cmd /k "cd backend && npm run dev"
start "Frontend Server" cmd /k "cd frontend && npm run serve" 