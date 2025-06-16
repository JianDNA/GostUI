#!/bin/bash

# 🚀 服务器Git部署脚本

# 配置变量
GIT_REPO="https://github.com/JianDNA/GostUI.git"  # 公开仓库，无需登录
PROJECT_NAME="gost-management"
DEPLOY_DIR="/opt/${PROJECT_NAME}"
SERVICE_NAME="gost-management"

echo "🚀 开始从Git部署GOST管理系统..."
echo "仓库地址: $GIT_REPO"
echo "部署目录: $DEPLOY_DIR"

# 检查环境
check_environment() {
    echo "🔍 检查环境..."
    
    # 检查Git
    if ! command -v git >/dev/null 2>&1; then
        echo "📦 安装Git..."
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update && sudo apt-get install -y git
        elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y git
        else
            echo "❌ 无法自动安装Git，请手动安装"
            exit 1
        fi
    fi
    
    # 检查Node.js
    if ! command -v node >/dev/null 2>&1; then
        echo "📦 安装Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        echo "❌ Node.js版本过低，需要 >= 16.0.0"
        exit 1
    fi
    
    # 检查PM2
    if ! command -v pm2 >/dev/null 2>&1; then
        echo "📦 安装PM2..."
        sudo npm install -g pm2
    fi
    
    echo "✅ 环境检查完成"
    echo "   Git: $(git --version)"
    echo "   Node.js: $(node -v)"
    echo "   npm: $(npm -v)"
    echo "   PM2: $(pm2 -v)"
}

# 克隆或更新代码
deploy_code() {
    echo "📥 部署代码..."
    
    # 停止旧服务
    echo "🛑 停止旧服务..."
    pm2 delete $SERVICE_NAME 2>/dev/null || echo "没有运行的服务"
    
    # 创建部署目录
    sudo mkdir -p $DEPLOY_DIR
    sudo chown $USER:$USER $DEPLOY_DIR
    
    if [ -d "$DEPLOY_DIR/.git" ]; then
        echo "🔄 更新现有代码..."
        cd $DEPLOY_DIR
        git fetch origin
        git reset --hard origin/main
        git clean -fd
    else
        echo "📥 克隆新代码..."
        rm -rf $DEPLOY_DIR
        git clone $GIT_REPO $DEPLOY_DIR
        cd $DEPLOY_DIR
    fi
    
    echo "✅ 代码部署完成"
}

# 安装依赖
install_dependencies() {
    echo "📦 安装依赖..."
    cd $DEPLOY_DIR
    
    # 后端依赖
    if [ -d "backend" ]; then
        echo "📦 安装后端依赖..."
        cd backend
        npm install --only=production
        cd ..
    fi
    
    # 前端构建
    if [ -d "frontend" ]; then
        echo "🔨 构建前端..."
        cd frontend
        npm install
        npm run build
        
        # 将构建产物复制到后端public目录
        if [ -d "dist" ]; then
            rm -rf ../backend/public
            mkdir -p ../backend/public
            cp -r dist/* ../backend/public/
            echo "✅ 前端构建完成并集成到后端"
        fi
        cd ..
    fi
    
    echo "✅ 依赖安装完成"
}

# 配置GOST二进制文件
setup_gost() {
    echo "⚙️ 配置GOST二进制文件..."
    cd $DEPLOY_DIR

    # 检查GOST文件是否存在
    if [ -f "backend/bin/gost" ]; then
        echo "✅ 发现backend/bin/gost"
        chmod +x backend/bin/gost
    else
        echo "⚠️ backend/bin/gost 不存在"
    fi

    if [ -f "backend/assets/gost/gost" ]; then
        echo "✅ 发现backend/assets/gost/gost"
        chmod +x backend/assets/gost/gost
    else
        echo "⚠️ backend/assets/gost/gost 不存在"
    fi

    # 如果bin目录下没有gost，尝试从assets复制
    if [ ! -f "backend/bin/gost" ] && [ -f "backend/assets/gost/gost" ]; then
        echo "📋 从assets复制gost到bin目录"
        cp backend/assets/gost/gost backend/bin/
        chmod +x backend/bin/gost
    fi

    # 如果assets下没有gost，尝试从bin复制
    if [ ! -f "backend/assets/gost/gost" ] && [ -f "backend/bin/gost" ]; then
        echo "📋 从bin复制gost到assets目录"
        mkdir -p backend/assets/gost
        cp backend/bin/gost backend/assets/gost/
        chmod +x backend/assets/gost/gost
    fi

    # 验证GOST是否可用
    if [ -f "backend/bin/gost" ]; then
        echo "🧪 测试GOST版本..."
        if backend/bin/gost -V 2>/dev/null; then
            echo "✅ GOST配置完成"
        else
            echo "⚠️ GOST可能无法正常运行，但继续部署"
        fi
    else
        echo "❌ 未找到GOST二进制文件"
        echo "💡 请确保Git仓库中包含GOST二进制文件"
        echo "   - backend/bin/gost"
        echo "   - backend/assets/gost/gost"
    fi
}

# 配置应用
configure_app() {
    echo "⚙️ 配置应用..."
    cd $DEPLOY_DIR
    
    # 创建必要目录
    mkdir -p backend/logs backend/database backend/backups backend/cache
    
    # 修复models/index.js（如果需要）
    if [ -f "backend/models/index.js" ]; then
        echo "🔧 检查models/index.js配置..."
        if ! grep -q "config.database" backend/models/index.js; then
            echo "🔧 修复models/index.js..."
            cat > backend/models/index.js << 'EOF'
const { Sequelize } = require('sequelize');
const config = require('../config/config');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sequelize = new Sequelize(config.database);
const db = {};

try {
  const modelFiles = ['User', 'Rule', 'ForwardRule', 'UserForwardRule', 'SystemConfig'];
  modelFiles.forEach(modelName => {
    try {
      const modelFile = `./${modelName}.js`;
      if (fs.existsSync(path.join(__dirname, modelFile))) {
        db[modelName] = require(modelFile)(sequelize, Sequelize.DataTypes);
        console.log(`✅ 模型 ${modelName} 加载成功`);
      }
    } catch (error) {
      console.log(`⚠️ 模型 ${modelName} 加载失败:`, error.message);
    }
  });
} catch (error) {
  console.log('❌ 模型加载错误:', error.message);
}

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;
module.exports = db;
EOF
        fi
    fi
    
    # 确保app.js正确服务静态文件
    if [ -f "backend/app.js" ]; then
        if ! grep -q "express.static" backend/app.js; then
            echo "🔧 配置静态文件服务..."
            sed -i '/app.use.*express.json/a\
// 服务前端静态文件\
app.use(express.static(path.join(__dirname, "public")));' backend/app.js
            
            if ! grep -q "const path = require('path')" backend/app.js; then
                sed -i '1i const path = require("path");' backend/app.js
            fi
        fi
    fi
    
    # 创建PM2配置
    cat > backend/ecosystem.config.js << 'EOF'
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
    
    echo "✅ 应用配置完成"
}

# 启动服务
start_service() {
    echo "🚀 启动服务..."
    cd $DEPLOY_DIR/backend
    
    # 启动PM2服务
    pm2 start ecosystem.config.js
    pm2 save
    
    # 设置开机自启
    pm2 startup
    
    echo "⏳ 等待服务启动..."
    sleep 15
    
    # 检查服务状态
    if pm2 list | grep -q "gost-management.*online"; then
        echo "✅ 服务启动成功！"
        echo ""
        echo "🌐 访问地址: http://localhost:3000"
        echo "🔐 默认账号: admin / admin123"
        echo ""
        
        # 测试访问
        if curl -f http://localhost:3000 >/dev/null 2>&1; then
            echo "✅ 前端页面访问正常"
        else
            echo "⚠️ 前端页面访问异常"
        fi
        
        if curl -f http://localhost:3000/api/system/status >/dev/null 2>&1; then
            echo "✅ API接口访问正常"
        else
            echo "⚠️ API接口访问异常"
        fi
        
    else
        echo "❌ 服务启动失败"
        echo "📋 查看错误日志:"
        pm2 logs gost-management --lines 30
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
cd /opt/gost-management
git pull origin main
cd backend
npm install --only=production
cd ../frontend
npm install
npm run build
rm -rf ../backend/public
mkdir -p ../backend/public
cp -r dist/* ../backend/public/
cd ../backend
pm2 restart gost-management
echo "✅ 更新完成"
EOF
    
    chmod +x *.sh
    echo "✅ 管理脚本创建完成"
}

# 主函数
main() {
    check_environment
    deploy_code
    install_dependencies
    setup_gost
    configure_app
    start_service
    create_management_scripts
    
    echo ""
    echo "🎉 Git部署完成！"
    echo ""
    echo "📊 管理命令:"
    echo "   更新代码: $DEPLOY_DIR/update.sh"
    echo ""
    echo "🌐 访问地址: http://$(hostname -I | awk '{print $1}'):3000"
    echo "🔐 默认账号: admin / admin123"
}

# 执行主函数
main "$@"
