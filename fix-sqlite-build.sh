#!/bin/bash

# 🔧 修复SQLite构建问题脚本

echo "🔧 修复SQLite构建问题"
echo "===================="

# 1. 安装构建工具
echo "📦 安装构建工具..."
sudo apt update
sudo apt install -y build-essential python3-dev node-gyp

echo "✅ 构建工具安装完成"

# 2. 检查部署目录
DEPLOY_DIR="/opt/gost-management"
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "❌ 部署目录不存在: $DEPLOY_DIR"
    exit 1
fi

cd $DEPLOY_DIR

# 3. 重新安装后端依赖
echo "📦 重新安装后端依赖..."
cd backend

# 清理旧的安装
rm -rf node_modules package-lock.json

# 尝试安装
echo "🔄 尝试标准安装..."
npm install --only=production --no-bin-links || {
    echo "⚠️ 标准安装失败，尝试备用方案..."
    
    # 尝试使用预编译二进制
    echo "🔄 尝试使用预编译二进制..."
    npm install --only=production --no-bin-links --prefer-offline --no-audit || {
        echo "⚠️ 预编译安装失败，尝试跳过可选依赖..."
        
        # 尝试跳过可选依赖
        npm install --only=production --no-bin-links --no-optional || {
            echo "❌ 所有安装方式都失败了"
            echo "💡 尝试手动处理better-sqlite3..."
            
            # 手动处理better-sqlite3
            npm install --only=production --no-bin-links --ignore-scripts
            
            # 尝试单独安装better-sqlite3
            echo "🔄 单独安装better-sqlite3..."
            npm install better-sqlite3 --build-from-source || {
                echo "⚠️ better-sqlite3安装失败，使用替代方案..."
                
                # 使用sqlite3替代
                npm uninstall better-sqlite3
                npm install sqlite3 --no-bin-links || {
                    echo "❌ 无法安装任何SQLite驱动"
                    exit 1
                }
            }
        }
    }
}

echo "✅ 后端依赖安装完成"

# 4. 检查关键依赖
echo "🔍 检查关键依赖..."
if [ -d "node_modules/better-sqlite3" ]; then
    echo "✅ better-sqlite3 已安装"
elif [ -d "node_modules/sqlite3" ]; then
    echo "✅ sqlite3 已安装"
else
    echo "❌ 没有可用的SQLite驱动"
    exit 1
fi

# 5. 构建前端
echo "🔨 构建前端..."
cd ../frontend

# 清理前端环境
rm -rf node_modules dist package-lock.json

# 安装前端依赖
npm install --no-bin-links || {
    echo "❌ 前端依赖安装失败"
    exit 1
}

# 构建前端
npm run build || {
    echo "❌ 前端构建失败"
    exit 1
}

# 复制到后端
if [ -d "dist" ]; then
    rm -rf ../backend/public
    mkdir -p ../backend/public
    cp -r dist/* ../backend/public/
    echo "✅ 前端构建完成"
else
    echo "❌ 前端构建产物不存在"
    exit 1
fi

# 6. 启动服务
echo "🚀 启动服务..."
cd ../backend

# 创建PM2配置
cat > ecosystem.config.js << 'EOF'
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
      PORT: 3000,
      LOG_LEVEL: 'error'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOF

# 创建必要目录
mkdir -p logs database backups cache

# 停止旧服务
pm2 delete gost-management 2>/dev/null || echo "没有旧服务"

# 启动新服务
pm2 start ecosystem.config.js
pm2 save

echo "⏳ 等待服务启动..."
sleep 10

# 7. 检查服务状态
if pm2 list | grep -q "gost-management.*online"; then
    echo "✅ 服务启动成功！"
    
    # 测试访问
    if curl -f -s http://localhost:3000 >/dev/null; then
        echo "✅ HTTP访问正常"
    else
        echo "⚠️ HTTP访问异常"
    fi
    
    echo ""
    echo "🎉 修复完成！"
    echo "🌐 访问地址: http://localhost:3000"
    echo "🔐 默认账号: admin / admin123"
    
else
    echo "❌ 服务启动失败"
    echo "📋 查看错误日志:"
    pm2 logs gost-management --lines 20
    exit 1
fi
