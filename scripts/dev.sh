#!/bin/bash

# 确保脚本在出错时退出
set -e

# 创建必要的目录
mkdir -p backend/data
mkdir -p backend/logs
mkdir -p backend/config

# 检查环境文件
if [ ! -f backend/.env ]; then
  echo "Creating .env file from example..."
  cp backend/.env.example backend/.env
fi

# 安装依赖
echo "Installing backend dependencies..."
cd backend
npm install

echo "Installing frontend dependencies..."
cd ../frontend
npm install

# 启动开发服务器
echo "Starting development servers..."
cd ../backend
npm run dev & # 后台运行后端服务

cd ../frontend
npm run serve # 前台运行前端服务 