#!/bin/bash

# Gost 管理系统一键部署脚本
# 支持 Debian/Ubuntu/CentOS/RHEL
# 
# 使用方法:
# curl -fsSL https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.sh | sudo bash
# 或者:
# wget https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.sh
# sudo chmod +x quick-deploy.sh
# sudo ./quick-deploy.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 配置变量
APP_NAME="gost-manager"
APP_DIR="/opt/gost-manager"
APP_USER="gost-manager"
LOG_DIR="/var/log/gost-manager"
REPO_URL="https://github.com/your-repo/gost-manager.git"  # 请替换为实际的仓库地址
NODE_VERSION="18"

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

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# 显示横幅
show_banner() {
    echo -e "${CYAN}"
    echo "=================================================="
    echo "    Gost 管理系统一键部署脚本"
    echo "    支持 Debian/Ubuntu/CentOS/RHEL"
    echo "=================================================="
    echo -e "${NC}"
}

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 用户运行此脚本"
        log_info "使用方法: sudo $0"
        exit 1
    fi
}

# 检测操作系统
detect_os() {
    log_step "检测操作系统..."
    
    if [ -f /etc/debian_version ]; then
        OS="debian"
        if grep -q "Ubuntu" /etc/os-release; then
            DISTRO="ubuntu"
        else
            DISTRO="debian"
        fi
        log_info "检测到 ${DISTRO^} 系统"
    elif [ -f /etc/redhat-release ]; then
        OS="redhat"
        if grep -q "CentOS" /etc/redhat-release; then
            DISTRO="centos"
        else
            DISTRO="rhel"
        fi
        log_info "检测到 ${DISTRO^} 系统"
    else
        log_error "不支持的操作系统"
        log_info "支持的系统: Debian, Ubuntu, CentOS, RHEL"
        exit 1
    fi
}

# 更新系统包
update_system() {
    log_step "更新系统包..."
    
    if [ "$OS" = "debian" ]; then
        apt update && apt upgrade -y
        apt install -y curl wget git unzip build-essential jq bc
    elif [ "$OS" = "redhat" ]; then
        if command -v dnf >/dev/null 2>&1; then
            dnf update -y
            dnf install -y curl wget git unzip gcc gcc-c++ make jq bc
        else
            yum update -y
            yum install -y curl wget git unzip gcc gcc-c++ make jq bc
        fi
    fi
    
    log_success "系统包更新完成"
}

# 安装 Node.js
install_nodejs() {
    log_step "安装 Node.js ${NODE_VERSION}..."
    
    # 检查是否已安装
    if command -v node >/dev/null 2>&1; then
        NODE_CURRENT=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_CURRENT" -ge "$NODE_VERSION" ]; then
            log_info "Node.js 已安装 (版本: $(node --version))"
            return
        fi
    fi
    
    if [ "$OS" = "debian" ]; then
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
    elif [ "$OS" = "redhat" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
        if command -v dnf >/dev/null 2>&1; then
            dnf install -y nodejs
        else
            yum install -y nodejs
        fi
    fi
    
    # 验证安装
    if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
        log_success "Node.js 安装成功 (版本: $(node --version))"
    else
        log_error "Node.js 安装失败"
        exit 1
    fi
}

# 安装 PM2
install_pm2() {
    log_step "安装 PM2..."
    
    if command -v pm2 >/dev/null 2>&1; then
        log_info "PM2 已安装 (版本: $(pm2 --version))"
        return
    fi
    
    npm install -g pm2
    
    if command -v pm2 >/dev/null 2>&1; then
        log_success "PM2 安装成功 (版本: $(pm2 --version))"
    else
        log_error "PM2 安装失败"
        exit 1
    fi
}

# 创建用户和目录
create_user_and_dirs() {
    log_step "创建用户和目录..."
    
    # 创建用户
    if ! id "$APP_USER" >/dev/null 2>&1; then
        useradd -r -s /bin/false "$APP_USER"
        log_info "创建用户: $APP_USER"
    else
        log_info "用户已存在: $APP_USER"
    fi
    
    # 创建目录
    mkdir -p "$APP_DIR"/{app,logs,config,data}
    mkdir -p "$LOG_DIR"
    
    # 设置权限
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$LOG_DIR"
    
    log_success "用户和目录创建完成"
}

# 克隆应用代码
clone_application() {
    log_step "下载应用代码..."
    
    if [ -d "$APP_DIR/app/.git" ]; then
        log_info "应用代码已存在，更新中..."
        cd "$APP_DIR/app"
        sudo -u "$APP_USER" git pull origin main
    else
        log_info "克隆应用代码..."
        cd "$APP_DIR"
        sudo -u "$APP_USER" git clone "$REPO_URL" app
    fi
    
    chown -R "$APP_USER:$APP_USER" "$APP_DIR/app"
    log_success "应用代码下载完成"
}

# 安装应用依赖
install_dependencies() {
    log_step "安装应用依赖..."
    
    # 安装后端依赖
    cd "$APP_DIR/app/backend"
    log_info "安装后端依赖..."
    sudo -u "$APP_USER" npm install --production
    
    # 安装前端依赖并构建
    cd "$APP_DIR/app/frontend"
    log_info "安装前端依赖..."
    sudo -u "$APP_USER" npm install
    log_info "构建前端..."
    sudo -u "$APP_USER" npm run build
    
    log_success "依赖安装完成"
}

# 设置 Gost 二进制文件权限
setup_gost_binary() {
    log_step "设置 Gost 二进制文件..."
    
    # 检查 Gost 二进制文件是否存在
    GOST_LINUX="$APP_DIR/app/backend/assets/gost/gost-linux"
    GOST_BIN_DIR="$APP_DIR/app/backend/bin"
    
    if [ -f "$GOST_LINUX" ]; then
        mkdir -p "$GOST_BIN_DIR"
        cp "$GOST_LINUX" "$GOST_BIN_DIR/gost"
        chmod +x "$GOST_BIN_DIR/gost"
        chown "$APP_USER:$APP_USER" "$GOST_BIN_DIR/gost"
        log_success "Gost 二进制文件设置完成"
    else
        log_warn "未找到 Gost 二进制文件: $GOST_LINUX"
        log_info "系统将在运行时自动处理 Gost 二进制文件"
    fi
}

# 创建环境配置
create_env_config() {
    log_step "创建环境配置..."
    
    # 生成随机 JWT 密钥
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)
    
    sudo -u "$APP_USER" tee "$APP_DIR/app/backend/.env" > /dev/null << EOF
# 生产环境配置
NODE_ENV=production
PORT=3000

# 数据库配置
DATABASE_PATH=$APP_DIR/data/database.sqlite

# JWT 配置
JWT_SECRET=$JWT_SECRET

# Gost 配置
GOST_BINARY_PATH=$APP_DIR/app/backend/bin/gost
GOST_CONFIG_PATH=$APP_DIR/config/gost-config.json

# 日志配置
LOG_LEVEL=info
LOG_FILE=$LOG_DIR/app.log

# 生产环境特殊授权令牌 (可选)
PRODUCTION_AUTH_TOKEN=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p -c 16)
EOF

    chmod 600 "$APP_DIR/app/backend/.env"
    chown "$APP_USER:$APP_USER" "$APP_DIR/app/backend/.env"
    
    log_success "环境配置创建完成"
}

# 创建 PM2 配置
create_pm2_config() {
    log_step "创建 PM2 配置..."
    
    sudo -u "$APP_USER" tee "$APP_DIR/app/ecosystem.config.js" > /dev/null << 'EOF'
module.exports = {
  apps: [
    {
      name: 'gost-manager',
      script: './backend/app.js',
      cwd: '/opt/gost-manager/app',
      user: 'gost-manager',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      error_file: '/var/log/gost-manager/pm2-error.log',
      out_file: '/var/log/gost-manager/pm2-out.log',
      log_file: '/var/log/gost-manager/pm2.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/app/ecosystem.config.js"
    log_success "PM2 配置创建完成"
}

# 初始化数据库
init_database() {
    log_step "初始化数据库..."
    
    cd "$APP_DIR/app/backend"
    sudo -u "$APP_USER" NODE_ENV=production npm run migrate
    
    log_success "数据库初始化完成"
}

# 启动应用
start_application() {
    log_step "启动应用..."
    
    cd "$APP_DIR/app"
    sudo -u "$APP_USER" pm2 start ecosystem.config.js
    sudo -u "$APP_USER" pm2 save
    
    # 设置开机自启
    env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" --silent
    
    log_success "应用启动完成"
}

# 询问是否安装 Nginx
ask_nginx() {
    echo
    log_step "Nginx 配置 (可选)"
    echo -e "${YELLOW}是否安装和配置 Nginx 反向代理？${NC}"
    echo "选择 'y' 可以通过 80 端口访问 (http://your-ip)"
    echo "选择 'n' 需要通过 3000 端口访问 (http://your-ip:3000)"
    read -p "安装 Nginx? [y/N]: " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_nginx
    else
        log_info "跳过 Nginx 安装，您可以通过 http://your-ip:3000 访问应用"
    fi
}

# 安装和配置 Nginx
install_nginx() {
    log_step "安装 Nginx..."
    
    if [ "$OS" = "debian" ]; then
        apt install -y nginx
    elif [ "$OS" = "redhat" ]; then
        if command -v dnf >/dev/null 2>&1; then
            dnf install -y nginx
        else
            yum install -y nginx
        fi
    fi
    
    # 创建 Nginx 配置
    tee /etc/nginx/sites-available/gost-manager > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    # 前端静态文件
    location / {
        root /opt/gost-manager/app/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # 日志
    access_log /var/log/nginx/gost-manager.access.log;
    error_log /var/log/nginx/gost-manager.error.log;
}
EOF

    # 启用站点
    if [ -d "/etc/nginx/sites-enabled" ]; then
        ln -sf /etc/nginx/sites-available/gost-manager /etc/nginx/sites-enabled/
    else
        # CentOS/RHEL 没有 sites-enabled 目录
        cp /etc/nginx/sites-available/gost-manager /etc/nginx/conf.d/gost-manager.conf
    fi
    
    # 测试配置
    nginx -t
    
    # 启动 Nginx
    systemctl enable nginx
    systemctl restart nginx
    
    log_success "Nginx 安装和配置完成"
}

# 验证部署
verify_deployment() {
    log_step "验证部署..."
    
    sleep 5  # 等待服务启动
    
    # 检查应用状态
    if sudo -u "$APP_USER" pm2 jlist | jq -r '.[0].pm2_env.status' 2>/dev/null | grep -q "online"; then
        log_success "✅ 应用运行正常"
    else
        log_error "❌ 应用未运行"
    fi
    
    # 检查端口监听
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        log_success "✅ 应用端口 (3000) 监听正常"
    else
        log_error "❌ 应用端口未监听"
    fi
    
    # 检查 API 响应
    if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
        log_success "✅ API 响应正常"
    else
        log_warn "⚠️ API 无响应 (可能需要等待更长时间)"
    fi
    
    # 检查 Nginx (如果安装了)
    if systemctl is-active --quiet nginx 2>/dev/null; then
        log_success "✅ Nginx 运行正常"
        if netstat -tlnp 2>/dev/null | grep -q ":80 "; then
            log_success "✅ HTTP 端口 (80) 监听正常"
        fi
    fi
}

# 显示部署结果
show_result() {
    echo
    echo -e "${GREEN}=================================================="
    echo "🎉 Gost 管理系统部署完成！"
    echo "=================================================="
    echo -e "${NC}"
    
    # 获取服务器 IP
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "your-server-ip")
    
    echo "📋 访问信息:"
    if systemctl is-active --quiet nginx 2>/dev/null; then
        echo "   🌐 Web 界面: http://$SERVER_IP"
    else
        echo "   🌐 Web 界面: http://$SERVER_IP:3000"
    fi
    echo "   👤 默认账户: admin"
    echo "   🔑 默认密码: admin123"
    echo
    
    echo "🔧 管理命令:"
    echo "   查看状态: sudo -u $APP_USER pm2 status"
    echo "   查看日志: sudo -u $APP_USER pm2 logs gost-manager"
    echo "   重启应用: sudo -u $APP_USER pm2 restart gost-manager"
    echo "   停止应用: sudo -u $APP_USER pm2 stop gost-manager"
    echo
    
    echo "📁 重要路径:"
    echo "   应用目录: $APP_DIR/app"
    echo "   配置文件: $APP_DIR/app/backend/.env"
    echo "   日志目录: $LOG_DIR"
    echo "   数据目录: $APP_DIR/data"
    echo
    
    echo "🔒 安全提醒:"
    echo "   1. 请立即登录并修改默认密码"
    echo "   2. 考虑配置 HTTPS (使用 Let's Encrypt)"
    echo "   3. 定期备份数据库文件"
    echo
    
    log_success "部署完成！请访问 Web 界面开始使用。"
}

# 主函数
main() {
    show_banner
    check_root
    detect_os
    update_system
    install_nodejs
    install_pm2
    create_user_and_dirs
    clone_application
    install_dependencies
    setup_gost_binary
    create_env_config
    create_pm2_config
    init_database
    start_application
    ask_nginx
    verify_deployment
    show_result
}

# 错误处理
trap 'log_error "部署过程中发生错误，请检查日志"; exit 1' ERR

# 运行主函数
main "$@"
