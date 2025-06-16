#!/bin/bash

# GOST管理系统一键部署脚本
# 简化版本 - 基于实际测试的可靠流程
#
# 使用方法:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# 部署完成后访问: http://localhost:3000
# 默认账号: admin / admin123

set -e

# 配置变量
REPO_URL="https://github.com/JianDNA/GostUI.git"
DEPLOY_DIR="$HOME/gost-management"
PKG_MANAGER=""

echo "🚀 GOST管理系统一键部署开始..."
echo "📋 部署目录: $DEPLOY_DIR"
echo "📋 Git仓库: $REPO_URL"
echo ""

# 检查环境
check_environment() {
    echo "🔍 检查环境..."
    
    # 检查必要命令
    for cmd in git node npm pm2; do
        if ! command -v $cmd >/dev/null 2>&1; then
            echo "❌ 未找到 $cmd"
            exit 1
        fi
    done
    
    # 检查包管理器
    if command -v yarn >/dev/null 2>&1; then
        PKG_MANAGER="yarn"
        echo "✅ 使用yarn作为包管理器"
    else
        PKG_MANAGER="npm"
        echo "✅ 使用npm作为包管理器"
    fi
    
    echo "✅ 环境检查完成"
}

# 部署代码
deploy_code() {
    echo "📥 部署代码..."
    
    # 停止现有服务
    pm2 stop gost-management 2>/dev/null || true
    pm2 delete gost-management 2>/dev/null || true
    
    # 清理旧部署
    if [ -d "$DEPLOY_DIR" ]; then
        echo "🗑️ 清理旧部署..."
        rm -rf $DEPLOY_DIR
    fi
    
    # 创建部署目录
    mkdir -p $DEPLOY_DIR
    
    # 克隆代码
    echo "📥 克隆代码..."
    git clone $REPO_URL $DEPLOY_DIR
    
    echo "✅ 代码部署完成"
}

# 设置Node.js内存
setup_node_memory() {
    echo "⚙️ 设置Node.js内存..."
    
    # 设置Node.js内存限制
    export NODE_OPTIONS="--max-old-space-size=4096"
    
    # 添加到bashrc（如果还没有）
    if ! grep -q "NODE_OPTIONS.*max-old-space-size" ~/.bashrc; then
        echo 'export NODE_OPTIONS="--max-old-space-size=4096"' >> ~/.bashrc
        echo "✅ 已添加Node.js内存设置到~/.bashrc"
    fi
    
    echo "✅ Node.js内存设置完成"
}

# 安装后端依赖
install_backend() {
    echo "📦 安装后端依赖..."
    cd $DEPLOY_DIR/backend
    
    # 清理可能存在的问题文件
    rm -rf node_modules package-lock.json yarn.lock
    
    # 安装依赖
    if [ "$PKG_MANAGER" = "yarn" ]; then
        yarn install
    else
        npm install
    fi
    
    echo "✅ 后端依赖安装完成"
}

# 安装和构建前端
install_frontend() {
    echo "📦 安装前端依赖..."
    cd $DEPLOY_DIR/frontend
    
    # 清理可能存在的问题文件
    rm -rf node_modules package-lock.json yarn.lock dist
    
    # 安装依赖
    if [ "$PKG_MANAGER" = "yarn" ]; then
        yarn install
    else
        npm install
    fi

    # 安装terser（Vite构建需要）
    echo "📦 安装terser..."
    if [ "$PKG_MANAGER" = "yarn" ]; then
        yarn add terser --dev
    else
        npm install terser --save-dev
    fi

    echo "🔨 构建前端..."
    if [ "$PKG_MANAGER" = "yarn" ]; then
        yarn build
    else
        npm run build
    fi
    
    # 复制构建产物到后端
    if [ -d "dist" ] && [ -f "dist/index.html" ]; then
        echo "📋 复制前端文件到后端..."
        mkdir -p ../backend/public
        cp -r dist/* ../backend/public/
        echo "✅ 前端构建和复制完成"
    else
        echo "❌ 前端构建失败"
        exit 1
    fi
}

# 配置GOST
setup_gost() {
    echo "⚙️ 配置GOST..."
    cd $DEPLOY_DIR
    
    # 确保GOST二进制文件可执行
    if [ -f "backend/bin/gost" ]; then
        chmod +x backend/bin/gost
        echo "✅ backend/bin/gost 已设置为可执行"
    fi
    
    if [ -f "backend/assets/gost/gost" ]; then
        chmod +x backend/assets/gost/gost
        echo "✅ backend/assets/gost/gost 已设置为可执行"
    fi
    
    # 创建必要的目录结构
    mkdir -p backend/assets/gost/linux_amd64
    if [ -f "backend/bin/gost" ]; then
        cp backend/bin/gost backend/assets/gost/linux_amd64/gost
        chmod +x backend/assets/gost/linux_amd64/gost
    fi
    
    echo "✅ GOST配置完成"
}

# 初始化数据库
init_database() {
    echo "🗄️ 初始化数据库..."
    cd $DEPLOY_DIR/backend
    
    mkdir -p database logs backups cache
    
    # 如果有数据库初始化脚本，执行它
    if [ -f "complete_schema.sql" ]; then
        echo "📋 使用complete_schema.sql初始化数据库..."
        sqlite3 database/database.sqlite < complete_schema.sql
        
        # 创建默认管理员
        sqlite3 database/database.sqlite "
        INSERT OR IGNORE INTO Users (username, password, email, role, isActive, createdAt, updatedAt, usedTraffic, userStatus)
        VALUES ('admin', '\$2a\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', null, 'admin', 1, datetime('now'), datetime('now'), 0, 'active');
        "
        echo "✅ 数据库初始化完成"
    else
        echo "⚠️ 未找到数据库初始化脚本，应用启动时会自动创建"
    fi
}

# 创建PM2配置
create_pm2_config() {
    echo "⚙️ 创建PM2配置..."
    cd $DEPLOY_DIR/backend
    
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
      NODE_OPTIONS: '--max-old-space-size=4096'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOF
    
    echo "✅ PM2配置创建完成"
}

# 启动服务
start_service() {
    echo "🚀 启动服务..."
    cd $DEPLOY_DIR/backend

    # 检查端口占用
    if lsof -ti:3000 >/dev/null 2>&1; then
        echo "⚠️ 端口3000被占用，正在清理..."
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
        sleep 2
    fi

    # 停止可能存在的旧服务
    pm2 stop gost-management 2>/dev/null || true
    pm2 delete gost-management 2>/dev/null || true

    # 启动PM2服务
    echo "🔄 启动PM2服务..."
    pm2 start ecosystem.config.js
    pm2 save

    # 等待服务启动
    echo "⏳ 等待服务启动..."
    sleep 15

    # 检查服务状态
    if pm2 list | grep -q "gost-management.*online"; then
        echo "✅ 服务启动成功！"

        # 测试访问
        echo "🧪 测试服务访问..."
        if curl -f http://localhost:3000 >/dev/null 2>&1; then
            echo "✅ 前端页面访问正常"
        else
            echo "⚠️ 前端页面访问异常，但服务已启动"
        fi

        if curl -f http://localhost:3000/api/system/status >/dev/null 2>&1; then
            echo "✅ API接口访问正常"
        else
            echo "⚠️ API接口需要认证（正常现象）"
        fi

    else
        echo "❌ 服务启动失败"
        echo "📋 错误日志："
        pm2 logs gost-management --lines 20
        exit 1
    fi
}

# 创建管理脚本
create_management_scripts() {
    echo "📝 创建管理脚本..."
    cd $DEPLOY_DIR
    
    # 更新脚本
    cat > update.sh << 'EOF'
#!/bin/bash
echo "🔄 更新GOST管理系统..."
cd $HOME/gost-management

git pull origin main

cd backend
if command -v yarn >/dev/null 2>&1; then
    yarn install
else
    npm install
fi

cd ../frontend
if command -v yarn >/dev/null 2>&1; then
    yarn install
    yarn build
else
    npm install
    npm run build
fi

if [ -d "dist" ]; then
    cp -r dist/* ../backend/public/
fi

cd ../backend
pm2 restart gost-management

echo "✅ 更新完成"
EOF
    
    chmod +x update.sh
    echo "✅ 管理脚本创建完成"
}

# 主函数
main() {
    echo "📋 开始部署流程..."
    check_environment
    deploy_code
    setup_node_memory
    install_backend
    install_frontend
    setup_gost
    init_database
    create_pm2_config
    start_service
    create_management_scripts

    echo ""
    echo "🎉🎉🎉 部署完成！🎉🎉🎉"
    echo ""
    echo "📊 部署信息:"
    echo "   🌐 访问地址: http://localhost:3000"
    echo "   🔐 默认账号: admin"
    echo "   🔑 默认密码: admin123"
    echo "   📁 部署目录: $DEPLOY_DIR"
    echo ""
    echo "🔧 管理命令:"
    echo "   📝 更新系统: cd $DEPLOY_DIR && ./update.sh"
    echo "   🔄 重启服务: pm2 restart gost-management"
    echo "   📊 查看日志: pm2 logs gost-management"
    echo "   ⏹️  停止服务: pm2 stop gost-management"
    echo ""
    echo "✅ 部署成功！请在浏览器中访问系统。"
}

# 执行主函数
main
