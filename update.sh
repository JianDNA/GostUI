#!/bin/bash

# GOST管理系统更新脚本
# 用于更新现有部署

set -e

DEPLOY_DIR="$HOME/gost-management"

echo "🔄 GOST管理系统更新开始..."

# 检查是否存在现有部署
if [ ! -d "$DEPLOY_DIR" ] || [ ! -f "$DEPLOY_DIR/backend/app.js" ]; then
    echo "❌ 未找到现有部署，请先运行初始化部署"
    echo "💡 运行: ./deploy.sh"
    exit 1
fi

echo "📋 当前部署目录: $DEPLOY_DIR"

# 检查服务状态
if pm2 list | grep -q "gost-management.*online"; then
    echo "✅ 检测到运行中的服务"
    SERVICE_RUNNING=true
else
    echo "⚠️ 服务未运行"
    SERVICE_RUNNING=false
fi

# 确认更新
echo ""
echo "⚠️ 更新将会："
echo "   - 拉取最新代码"
echo "   - 保留用户数据和配置"
echo "   - 重新安装依赖"
echo "   - 重启服务"
echo ""

read -p "🤔 确认开始更新？(y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 更新已取消"
    exit 0
fi

# 备份关键数据
echo "💾 备份关键数据..."
BACKUP_DIR="/tmp/gost-update-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 备份数据库
if [ -f "$DEPLOY_DIR/backend/database/database.sqlite" ]; then
    cp "$DEPLOY_DIR/backend/database/database.sqlite" "$BACKUP_DIR/"
    echo "✅ 数据库已备份"
fi

# 备份配置
if [ -f "$DEPLOY_DIR/backend/config/config.js" ]; then
    cp "$DEPLOY_DIR/backend/config/config.js" "$BACKUP_DIR/"
    echo "✅ 配置文件已备份"
fi

# 备份GOST配置
if [ -f "$DEPLOY_DIR/backend/config/gost-config.json" ]; then
    cp "$DEPLOY_DIR/backend/config/gost-config.json" "$BACKUP_DIR/"
    echo "✅ GOST配置已备份"
fi

echo "📁 备份目录: $BACKUP_DIR"

# 停止服务
if [ "$SERVICE_RUNNING" = true ]; then
    echo "🛑 停止服务..."
    pm2 stop gost-management
fi

# 更新代码
echo "📥 更新代码..."
cd "$DEPLOY_DIR"
git fetch origin
git reset --hard origin/main

# 检查构建模式
echo "🤔 选择前端更新模式:"
echo "   1) 使用预构建文件 (推荐)"
echo "   2) 服务器端重新构建"
echo ""

if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    echo "✅ 检测到预构建文件"
    read -p "请选择模式 (1/2) [默认: 1]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[2]$ ]]; then
        BUILD_MODE="server"
    else
        BUILD_MODE="local"
    fi
else
    echo "⚠️ 未检测到预构建文件，将使用服务器端构建"
    BUILD_MODE="server"
fi

# 更新后端依赖
echo "📦 更新后端依赖..."
cd backend
rm -rf node_modules package-lock.json yarn.lock

if command -v yarn >/dev/null 2>&1; then
    yarn install --production
else
    npm install --only=production
fi

# 处理前端
echo "📦 处理前端..."
cd ../frontend

if [ "$BUILD_MODE" = "local" ]; then
    echo "📋 使用预构建文件..."
    if [ -d "dist" ] && [ -f "dist/index.html" ]; then
        mkdir -p ../backend/public
        rm -rf ../backend/public/*
        cp -r dist/* ../backend/public/
        echo "✅ 前端文件更新完成"
    else
        echo "❌ 预构建文件不完整，切换到服务器端构建"
        BUILD_MODE="server"
    fi
fi

if [ "$BUILD_MODE" = "server" ]; then
    echo "🔨 服务器端构建前端..."
    rm -rf node_modules package-lock.json yarn.lock dist
    
    export NODE_OPTIONS="--max-old-space-size=4096"
    
    if command -v yarn >/dev/null 2>&1; then
        yarn install
        yarn add terser --dev
        yarn build
    else
        npm install
        npm install terser --save-dev
        npm run build
    fi
    
    if [ -d "dist" ] && [ -f "dist/index.html" ]; then
        mkdir -p ../backend/public
        rm -rf ../backend/public/*
        cp -r dist/* ../backend/public/
        echo "✅ 前端构建和更新完成"
    else
        echo "❌ 前端构建失败"
        exit 1
    fi
fi

# 恢复备份的数据
echo "🔄 恢复用户数据..."
cd ../backend

if [ -f "$BACKUP_DIR/database.sqlite" ]; then
    mkdir -p database
    cp "$BACKUP_DIR/database.sqlite" database/
    echo "✅ 数据库已恢复"
fi

if [ -f "$BACKUP_DIR/config.js" ]; then
    mkdir -p config
    cp "$BACKUP_DIR/config.js" config/
    echo "✅ 配置文件已恢复"
fi

if [ -f "$BACKUP_DIR/gost-config.json" ]; then
    mkdir -p config
    cp "$BACKUP_DIR/gost-config.json" config/
    echo "✅ GOST配置已恢复"
fi

# 启动服务
echo "🚀 启动服务..."
pm2 start ecosystem.config.js 2>/dev/null || pm2 restart gost-management

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
if pm2 list | grep -q "gost-management.*online"; then
    echo "✅ 服务启动成功！"
    
    # 测试访问
    if command -v curl >/dev/null 2>&1; then
        if curl -f -s http://localhost:3000 >/dev/null; then
            echo "✅ 前端页面访问正常"
        else
            echo "⚠️ 前端页面访问异常"
        fi
    fi
    
    echo ""
    echo "🎉 更新完成！"
    echo "🌐 访问地址: http://localhost:3000"
    echo "📁 备份目录: $BACKUP_DIR"
    echo ""
    echo "💡 如果遇到问题，可以从备份目录恢复数据"
    
else
    echo "❌ 服务启动失败"
    echo "📋 查看日志: pm2 logs gost-management"
    exit 1
fi
