#!/bin/bash

# Gost 管理系统简化部署脚本
# 适用于已有 Node.js 环境的服务器
# 
# 使用方法:
# curl -fsSL https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/simple-deploy.sh | bash
# 或者:
# wget https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/simple-deploy.sh
# chmod +x simple-deploy.sh
# ./simple-deploy.sh

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置变量
APP_NAME="gost-manager"
INSTALL_DIR="./gost-manager"
REPO_URL="https://github.com/your-repo/gost-manager.git"  # 请替换为实际的仓库地址
PORT=3000

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 显示横幅
show_banner() {
    echo -e "${BLUE}"
    echo "=================================================="
    echo "    Gost 管理系统简化部署脚本"
    echo "    适用于已有 Node.js 环境的服务器"
    echo "=================================================="
    echo -e "${NC}"
}

# 检查依赖
check_dependencies() {
    log_step "检查依赖..."
    
    # 检查 Node.js
    if ! command -v node >/dev/null 2>&1; then
        log_error "未找到 Node.js，请先安装 Node.js 16+ 版本"
        log_info "安装方法: https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        log_error "Node.js 版本过低 (当前: $(node --version))，需要 16+ 版本"
        exit 1
    fi
    log_info "Node.js 版本: $(node --version) ✓"
    
    # 检查 npm
    if ! command -v npm >/dev/null 2>&1; then
        log_error "未找到 npm"
        exit 1
    fi
    log_info "npm 版本: $(npm --version) ✓"
    
    # 检查 Git
    if ! command -v git >/dev/null 2>&1; then
        log_error "未找到 Git，请先安装 Git"
        exit 1
    fi
    log_info "Git 版本: $(git --version) ✓"
    
    log_info "依赖检查完成"
}

# 克隆代码
clone_code() {
    log_step "下载应用代码..."
    
    if [ -d "$INSTALL_DIR" ]; then
        log_warn "目录 $INSTALL_DIR 已存在"
        read -p "是否删除并重新下载? [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            log_info "使用现有目录"
            cd "$INSTALL_DIR"
            git pull origin main
            return
        fi
    fi
    
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    log_info "代码下载完成"
}

# 安装依赖
install_dependencies() {
    log_step "安装依赖..."
    
    # 安装后端依赖
    log_info "安装后端依赖..."
    cd backend
    npm install
    
    # 安装前端依赖并构建
    log_info "安装前端依赖..."
    cd ../frontend
    npm install
    
    log_info "构建前端..."
    npm run build
    
    cd ..
    log_info "依赖安装完成"
}

# 设置 Gost 二进制文件
setup_gost() {
    log_step "设置 Gost 二进制文件..."
    
    # 检查操作系统
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        GOST_SOURCE="backend/assets/gost/gost-linux"
        GOST_TARGET="backend/bin/gost"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        GOST_SOURCE="backend/assets/gost/gost-linux"  # Mac 使用 Linux 版本
        GOST_TARGET="backend/bin/gost"
    else
        log_warn "不支持的操作系统: $OSTYPE"
        log_info "请手动设置 Gost 二进制文件"
        return
    fi
    
    if [ -f "$GOST_SOURCE" ]; then
        mkdir -p "$(dirname "$GOST_TARGET")"
        cp "$GOST_SOURCE" "$GOST_TARGET"
        chmod +x "$GOST_TARGET"
        log_info "Gost 二进制文件设置完成"
    else
        log_warn "未找到 Gost 二进制文件: $GOST_SOURCE"
        log_info "系统将在运行时自动处理"
    fi
}

# 创建环境配置
create_env() {
    log_step "创建环境配置..."
    
    # 生成随机密钥
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)
    PRODUCTION_TOKEN=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p -c 16)
    
    cat > backend/.env << EOF
# 环境配置
NODE_ENV=development
PORT=$PORT

# 数据库配置
DATABASE_PATH=../database/database.sqlite

# JWT 配置
JWT_SECRET=$JWT_SECRET

# Gost 配置
GOST_BINARY_PATH=./bin/gost
GOST_CONFIG_PATH=../config/gost-config.json

# 日志配置
LOG_LEVEL=info
LOG_FILE=../logs/app.log

# 生产环境特殊授权令牌 (可选)
PRODUCTION_AUTH_TOKEN=$PRODUCTION_TOKEN
EOF

    log_info "环境配置创建完成"
}

# 初始化数据库
init_database() {
    log_step "初始化数据库..."
    
    cd backend
    npm run migrate
    cd ..
    
    log_info "数据库初始化完成"
}

# 启动应用
start_app() {
    log_step "启动应用..."
    
    # 检查是否安装了 PM2
    if command -v pm2 >/dev/null 2>&1; then
        log_info "使用 PM2 启动应用..."
        
        # 创建 PM2 配置
        cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'gost-manager',
    script: './backend/app.js',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
};
EOF
        
        pm2 start ecosystem.config.js
        pm2 save
        
        log_info "应用已通过 PM2 启动"
        log_info "管理命令:"
        log_info "  查看状态: pm2 status"
        log_info "  查看日志: pm2 logs gost-manager"
        log_info "  重启应用: pm2 restart gost-manager"
        log_info "  停止应用: pm2 stop gost-manager"
        
    else
        log_info "直接启动应用..."
        log_warn "建议安装 PM2 进行进程管理: npm install -g pm2"
        
        cd backend
        echo "启动应用中... (按 Ctrl+C 停止)"
        node app.js &
        APP_PID=$!
        cd ..
        
        log_info "应用已启动 (PID: $APP_PID)"
        log_info "停止应用: kill $APP_PID"
    fi
}

# 显示结果
show_result() {
    echo
    echo -e "${GREEN}=================================================="
    echo "🎉 Gost 管理系统部署完成！"
    echo "=================================================="
    echo -e "${NC}"
    
    echo "📋 访问信息:"
    echo "   🌐 Web 界面: http://localhost:$PORT"
    echo "   👤 默认账户: admin"
    echo "   🔑 默认密码: admin123"
    echo
    
    echo "📁 项目路径:"
    echo "   应用目录: $(pwd)"
    echo "   配置文件: $(pwd)/backend/.env"
    echo
    
    echo "🔧 开发命令:"
    echo "   启动后端: cd backend && npm start"
    echo "   启动前端: cd frontend && npm run serve"
    echo "   构建前端: cd frontend && npm run build"
    echo
    
    echo "🔒 安全提醒:"
    echo "   1. 请立即登录并修改默认密码"
    echo "   2. 生产环境请修改 NODE_ENV=production"
    echo "   3. 定期备份数据库文件"
    echo
    
    log_info "部署完成！请访问 Web 界面开始使用。"
}

# 主函数
main() {
    show_banner
    check_dependencies
    clone_code
    install_dependencies
    setup_gost
    create_env
    init_database
    
    echo
    log_step "选择启动方式:"
    echo "1) 使用 PM2 启动 (推荐，用于生产环境)"
    echo "2) 直接启动 (用于开发测试)"
    echo "3) 跳过启动 (手动启动)"
    read -p "请选择 [1-3]: " -n 1 -r
    echo
    
    case $REPLY in
        1)
            if ! command -v pm2 >/dev/null 2>&1; then
                log_info "安装 PM2..."
                npm install -g pm2
            fi
            start_app
            ;;
        2)
            start_app
            ;;
        3)
            log_info "跳过自动启动"
            ;;
        *)
            log_info "无效选择，跳过启动"
            ;;
    esac
    
    show_result
}

# 错误处理
trap 'log_error "部署过程中发生错误"; exit 1' ERR

# 运行主函数
main "$@"
