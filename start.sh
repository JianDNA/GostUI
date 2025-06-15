#!/bin/bash

echo "🚀 启动 GOST 代理管理系统"
echo "================================"
echo ""
echo "📋 系统信息:"
echo "   - 版本: 1.0.0"
echo "   - 端口: 3000"
echo "   - 数据库: SQLite"
echo ""
echo "👤 默认管理员账户:"
echo "   - 用户名: admin"
echo "   - 密码: admin123"
echo ""
echo "🌐 访问地址: http://localhost:3000"
echo ""
echo "正在启动服务..."
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js (>= 14.0.0)"
    exit 1
fi

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="14.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ 错误: Node.js 版本过低，当前版本: $NODE_VERSION，要求版本: >= $REQUIRED_VERSION"
    exit 1
fi

# 进入后端目录
cd backend

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install --production
fi

# 启动服务
echo "🚀 启动服务..."
node app.js
