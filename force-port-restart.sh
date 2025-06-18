#!/bin/bash

# 强制端口重启脚本 - 确保端口配置真正生效

echo "🔧 强制端口重启脚本"
echo "================================"

# 检查参数
if [ $# -ne 1 ]; then
    echo "❌ 用法: $0 <端口号>"
    echo "💡 例如: $0 30305"
    exit 1
fi

PORT=$1
DEPLOY_DIR="/root/gost-management"
BACKEND_DIR="$DEPLOY_DIR/backend"

# 验证端口号
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
    echo "❌ 无效的端口号: $PORT"
    echo "💡 请输入1024-65535之间的数字"
    exit 1
fi

echo "🎯 目标端口: $PORT"
echo "📁 后端目录: $BACKEND_DIR"

# 检查目录
if [ ! -d "$BACKEND_DIR" ]; then
    echo "❌ 后端目录不存在: $BACKEND_DIR"
    exit 1
fi

cd "$BACKEND_DIR"

echo ""
echo "🛑 步骤1: 完全停止服务..."
pm2 stop gost-management 2>/dev/null || true
pm2 delete gost-management 2>/dev/null || true
sleep 3

echo ""
echo "🔧 步骤2: 更新配置文件..."

# 更新.env文件
echo "📝 更新.env文件..."
if [ -f ".env" ]; then
    if grep -q "^PORT=" ".env"; then
        sed -i "s/^PORT=.*/PORT=$PORT/" ".env"
    else
        echo "PORT=$PORT" >> ".env"
    fi
else
    echo "PORT=$PORT" > ".env"
fi
echo "✅ .env文件已更新"

# 重新创建PM2配置文件
echo "📝 重新创建PM2配置文件..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'gost-management',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: $PORT,
      NODE_OPTIONS: '--max-old-space-size=4096',
      DISABLE_PRODUCTION_SAFETY: 'true'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    log_type: 'json',
    merge_logs: true,
    max_size: '20M',
    retain: 5,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    pmx: false
  }]
};
EOF
echo "✅ PM2配置文件已重新创建"

echo ""
echo "🚀 步骤3: 启动服务..."

# 确保logs目录存在
mkdir -p logs

# 启动服务
echo "🔄 启动PM2服务..."
if pm2 start ecosystem.config.js; then
    echo "✅ PM2服务启动成功"
else
    echo "❌ PM2启动失败，查看错误..."
    pm2 logs gost-management --lines 10
    exit 1
fi

echo ""
echo "⏳ 步骤4: 等待服务启动..."
sleep 8

echo ""
echo "🔍 步骤5: 验证配置和端口..."

# 检查PM2状态
echo "📊 PM2状态:"
pm2 list | grep gost-management

# 检查环境变量
echo ""
echo "🔍 检查PM2环境变量..."
PM2_PORT=$(pm2 env 0 2>/dev/null | grep "^PORT:" | cut -d' ' -f2)
if [ "$PM2_PORT" = "$PORT" ]; then
    echo "✅ PM2环境变量PORT=$PM2_PORT 正确"
else
    echo "❌ PM2环境变量PORT=$PM2_PORT 不正确，期望$PORT"
    echo "📋 完整环境变量:"
    pm2 env 0 | grep PORT
    exit 1
fi

# 检查端口监听
echo ""
echo "🔍 检查端口监听..."
if command -v ss >/dev/null 2>&1; then
    if ss -tlnp | grep ":$PORT "; then
        echo "✅ 端口 $PORT 正在监听"
    else
        echo "❌ 端口 $PORT 未监听"
        echo "📋 服务日志:"
        pm2 logs gost-management --lines 15
        exit 1
    fi
elif command -v netstat >/dev/null 2>&1; then
    if netstat -tlnp | grep ":$PORT "; then
        echo "✅ 端口 $PORT 正在监听"
    else
        echo "❌ 端口 $PORT 未监听"
        echo "📋 服务日志:"
        pm2 logs gost-management --lines 15
        exit 1
    fi
else
    echo "⚠️ 无法检查端口状态（缺少ss/netstat命令）"
    echo "📋 请手动检查: curl http://localhost:$PORT"
fi

echo ""
echo "🎉 端口重启完成！"
echo "🌐 访问地址: http://localhost:$PORT"
echo ""
echo "💡 如果仍有问题，请检查:"
echo "   1. 防火墙设置"
echo "   2. 服务日志: pm2 logs gost-management"
echo "   3. 配置文件: cat .env && cat ecosystem.config.js"
