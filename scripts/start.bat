@echo off
echo Starting Gost Manager in production mode...

:: 切换到项目目录
cd ..

:: 创建必要的目录
echo Creating required directories...
mkdir "backend\data" 2>nul
mkdir "backend\logs" 2>nul
mkdir "backend\config" 2>nul
mkdir "backend\public" 2>nul
mkdir "backend\bin" 2>nul
mkdir "backend\backups" 2>nul

:: 检查环境文件
if not exist backend\.env.production (
    echo Error: Production environment file not found!
    echo Please create backend\.env.production with appropriate settings.
    exit /b 1
)

:: 复制生产环境配置
copy /y backend\.env.production backend\.env

:: 检查PM2是否已安装
where pm2 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing PM2 globally...
    call npm install -g pm2
    if %ERRORLEVEL% NEQ 0 (
        echo Failed to install PM2
        exit /b %ERRORLEVEL%
    )
)

:: 安装生产依赖
echo Installing backend dependencies...
cd backend
call npm install --production
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install backend dependencies
    exit /b %ERRORLEVEL%
)

:: 安装前端依赖并构建
echo Installing frontend dependencies and building...
cd ..\frontend
call npm install --production
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install frontend dependencies
    exit /b %ERRORLEVEL%
)

:: 构建前端
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Failed to build frontend
    exit /b %ERRORLEVEL%
)

:: 复制前端构建文件到后端public目录
echo Copying frontend build to backend...
xcopy /s /y "dist\*" "..\backend\public\"

:: 设置生产环境变量
set NODE_ENV=production

:: 启动PM2进程
echo Starting production server with PM2...
cd ..
call pm2 start ecosystem.config.js --env production

:: 保存PM2进程列表，确保服务器重启后自动启动
call pm2 save
call pm2 startup

echo Production server started successfully!
echo Server is running on http://localhost:3000
echo Use 'pm2 logs' to view logs
echo Use 'pm2 monit' to monitor the application

:: 设置数据库备份任务
echo Setting up database backup task...
call scripts\setup-backup-task.bat 