# 🚀 Gost 管理系统 Linux 服务器部署指南

本文档详细介绍如何在 Debian/CentOS/Ubuntu 等 Linux 服务器上部署 Gost 管理系统。

## 📋 系统要求

### 最低配置
- **CPU**: 1 核心
- **内存**: 1GB RAM
- **存储**: 10GB 可用空间
- **操作系统**: Debian 10+, Ubuntu 18.04+, CentOS 7+, RHEL 7+

### 推荐配置
- **CPU**: 2+ 核心
- **内存**: 2GB+ RAM
- **存储**: 20GB+ 可用空间
- **网络**: 稳定的互联网连接

## 🛠️ 环境准备

### 1. 更新系统包

#### Debian/Ubuntu
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip build-essential
```

#### CentOS/RHEL
```bash
sudo yum update -y
sudo yum install -y curl wget git unzip gcc gcc-c++ make
# 或者在 CentOS 8+ / RHEL 8+
sudo dnf update -y
sudo dnf install -y curl wget git unzip gcc gcc-c++ make
```

### 2. 安装 Node.js

#### 方法 1: 使用 NodeSource 仓库 (推荐)
```bash
# 安装 Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs  # Debian/Ubuntu

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

#### 方法 2: 使用 NVM (Node Version Manager)
```bash
# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# 安装并使用 Node.js 18
nvm install 18
nvm use 18
nvm alias default 18
```

#### 验证安装
```bash
node --version  # 应该显示 v18.x.x
npm --version   # 应该显示 9.x.x 或更高
```

### 3. 安装 PM2 (进程管理器)
```bash
sudo npm install -g pm2
pm2 --version
```

### 4. 安装 Nginx (可选 - 反向代理)
**注意**: Nginx 是可选的，您可以直接使用 IP:端口 访问应用。

#### Debian/Ubuntu
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

#### CentOS/RHEL
```bash
sudo yum install -y nginx
# 或者 CentOS 8+
sudo dnf install -y nginx

sudo systemctl enable nginx
sudo systemctl start nginx
```

## 📦 准备 Gost 二进制文件

### 1. Gost 二进制文件说明
**重要**: 本项目已经包含了 Gost 二进制文件，无需额外下载！

- Linux 版本：`backend/assets/gost/gost-linux`
- Windows 版本：`backend/assets/gost/gost-windows.exe`

系统会根据运行环境自动选择合适的二进制文件。

### 2. 创建用户和目录
```bash
# 创建专用用户
sudo useradd -r -s /bin/false gost-manager

# 创建必要目录
sudo mkdir -p /opt/gost-manager/{app,logs,config,data}
sudo mkdir -p /var/log/gost-manager

# 设置权限
sudo chown -R gost-manager:gost-manager /opt/gost-manager
sudo chown -R gost-manager:gost-manager /var/log/gost-manager
```

## 📁 部署应用代码

### 1. 克隆或上传代码
```bash
# 方法 1: 从 Git 仓库克隆
cd /opt/gost-manager
sudo git clone https://your-repo-url.git app
sudo chown -R gost-manager:gost-manager app

# 方法 2: 上传代码包
# 将代码包上传到服务器，然后解压到 /opt/gost-manager/app
```

### 2. 安装依赖
```bash
cd /opt/gost-manager/app

# 安装后端依赖
cd backend
sudo -u gost-manager npm install --production

# 安装前端依赖并构建
cd ../frontend
sudo -u gost-manager npm install
sudo -u gost-manager npm run build
```

## ⚙️ 配置环境

### 1. 创建环境配置文件
```bash
sudo -u gost-manager tee /opt/gost-manager/app/backend/.env << 'EOF'
# 生产环境配置
NODE_ENV=production
PORT=3000

# 数据库配置
DATABASE_PATH=/opt/gost-manager/data/database.sqlite

# JWT 配置 (请更改为强密码)
JWT_SECRET=your-very-secure-jwt-secret-key-change-this

# Gost 配置 (使用项目内置的二进制文件)
GOST_BINARY_PATH=/opt/gost-manager/app/backend/bin/gost
GOST_CONFIG_PATH=/opt/gost-manager/config/gost-config.json

# 日志配置
LOG_LEVEL=info
LOG_FILE=/var/log/gost-manager/app.log

# 生产环境特殊授权令牌 (可选)
PRODUCTION_AUTH_TOKEN=your-super-secure-production-token
EOF
```

### 2. 创建 PM2 配置文件
```bash
sudo -u gost-manager tee /opt/gost-manager/app/ecosystem.config.js << 'EOF'
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
```

### 3. 配置 Nginx (可选)
**注意**: 如果您选择直接使用 IP:端口 访问，可以跳过此步骤。

```bash
sudo tee /etc/nginx/sites-available/gost-manager << 'EOF'
server {
    listen 80;
    server_name your-domain.com;  # 替换为您的域名或 IP

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
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # 日志
    access_log /var/log/nginx/gost-manager.access.log;
    error_log /var/log/nginx/gost-manager.error.log;
}
EOF

# 启用站点
sudo ln -s /etc/nginx/sites-available/gost-manager /etc/nginx/sites-enabled/
sudo nginx -t  # 测试配置
sudo systemctl reload nginx
```

## 🔐 SSL/HTTPS 配置 (推荐)

### 使用 Let's Encrypt (免费 SSL)
```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx  # Debian/Ubuntu
sudo yum install -y certbot python3-certbot-nginx  # CentOS/RHEL

# 获取 SSL 证书
sudo certbot --nginx -d your-domain.com

# 设置自动续期
sudo crontab -e
# 添加以下行：
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 🚀 启动服务

### 1. 初始化数据库
```bash
cd /opt/gost-manager/app/backend
sudo -u gost-manager NODE_ENV=production npm run migrate
```

### 2. 启动应用
```bash
cd /opt/gost-manager/app
sudo -u gost-manager pm2 start ecosystem.config.js
sudo -u gost-manager pm2 save
sudo -u gost-manager pm2 startup
```

### 3. 设置开机自启
```bash
# 为 root 用户设置 PM2 开机自启
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u gost-manager --hp /home/gost-manager
```

## 🔧 防火墙配置 (可选)

**注意**: 防火墙配置是可选的，取决于您的服务器安全策略。

### 如果使用 Nginx (端口 80/443)
#### UFW (Ubuntu/Debian)
```bash
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

#### Firewalld (CentOS/RHEL)
```bash
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 如果直接访问应用 (端口 3000)
#### UFW (Ubuntu/Debian)
```bash
sudo ufw allow ssh
sudo ufw allow 3000/tcp
sudo ufw --force enable
```

#### Firewalld (CentOS/RHEL)
```bash
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## 📊 监控和日志

### 1. 查看应用状态
```bash
# PM2 状态
sudo -u gost-manager pm2 status
sudo -u gost-manager pm2 logs

# 系统服务状态
sudo systemctl status nginx
```

### 2. 日志文件位置
```bash
# 应用日志
tail -f /var/log/gost-manager/app.log
tail -f /var/log/gost-manager/pm2.log

# Nginx 日志
tail -f /var/log/nginx/gost-manager.access.log
tail -f /var/log/nginx/gost-manager.error.log

# 系统日志
sudo journalctl -u nginx -f
```

### 3. 设置日志轮转
```bash
sudo tee /etc/logrotate.d/gost-manager << 'EOF'
/var/log/gost-manager/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 gost-manager gost-manager
    postrotate
        sudo -u gost-manager pm2 reloadLogs
    endscript
}
EOF
```

## 🔄 更新和维护

### 1. 应用更新流程
```bash
# 1. 备份当前版本
sudo cp -r /opt/gost-manager/app /opt/gost-manager/app.backup.$(date +%Y%m%d)

# 2. 拉取新代码
cd /opt/gost-manager/app
sudo -u gost-manager git pull origin main

# 3. 更新依赖
cd backend
sudo -u gost-manager npm install --production

cd ../frontend
sudo -u gost-manager npm install
sudo -u gost-manager npm run build

# 4. 重启应用
sudo -u gost-manager pm2 restart gost-manager
```

### 2. 数据库备份
```bash
# 创建备份脚本
sudo tee /opt/gost-manager/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/gost-manager/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库
cp /opt/gost-manager/data/database.sqlite $BACKUP_DIR/database_$DATE.sqlite

# 备份配置
cp /opt/gost-manager/config/gost-config.json $BACKUP_DIR/gost-config_$DATE.json

# 清理 30 天前的备份
find $BACKUP_DIR -name "*.sqlite" -mtime +30 -delete
find $BACKUP_DIR -name "*.json" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

sudo chmod +x /opt/gost-manager/backup.sh

# 设置定时备份
sudo crontab -e
# 添加以下行（每天凌晨 2 点备份）：
# 0 2 * * * /opt/gost-manager/backup.sh >> /var/log/gost-manager/backup.log 2>&1
```

## 🚨 故障排除

### 常见问题

#### 1. 应用无法启动
```bash
# 检查日志
sudo -u gost-manager pm2 logs gost-manager

# 检查端口占用
sudo netstat -tlnp | grep :3000

# 检查权限
ls -la /opt/gost-manager/app/backend/
```

#### 2. Nginx 502 错误
```bash
# 检查后端是否运行
curl http://127.0.0.1:3000/api/health

# 检查 Nginx 配置
sudo nginx -t

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log
```

#### 3. 数据库权限问题
```bash
# 检查数据库文件权限
ls -la /opt/gost-manager/data/

# 修复权限
sudo chown -R gost-manager:gost-manager /opt/gost-manager/data/
```

### 性能优化

#### 1. 系统优化
```bash
# 增加文件描述符限制
echo "gost-manager soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "gost-manager hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# 优化内核参数
sudo tee -a /etc/sysctl.conf << 'EOF'
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 5000
EOF

sudo sysctl -p
```

#### 2. PM2 集群模式 (多核服务器)
```bash
# 修改 ecosystem.config.js
sudo -u gost-manager tee /opt/gost-manager/app/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'gost-manager',
      script: './backend/app.js',
      cwd: '/opt/gost-manager/app',
      instances: 'max',  // 使用所有 CPU 核心
      exec_mode: 'cluster',
      // ... 其他配置保持不变
    }
  ]
};
EOF

# 重启应用
sudo -u gost-manager pm2 restart gost-manager
```

## 📞 技术支持

如果遇到部署问题：

1. **检查日志文件**获取详细错误信息
2. **验证系统要求**确保满足最低配置
3. **检查网络连接**确保能访问外部资源
4. **查看防火墙设置**确保端口开放正确

## 🔧 高级配置

### 1. 配置 Redis (可选，用于会话存储)
```bash
# 安装 Redis
sudo apt install -y redis-server  # Debian/Ubuntu
sudo yum install -y redis         # CentOS/RHEL

# 启动 Redis
sudo systemctl enable redis
sudo systemctl start redis

# 修改应用配置以使用 Redis
sudo -u gost-manager tee -a /opt/gost-manager/app/backend/.env << 'EOF'

# Redis 配置 (可选)
REDIS_URL=redis://localhost:6379
SESSION_STORE=redis
EOF
```

### 2. 配置数据库连接池
```bash
# 在 .env 文件中添加数据库优化配置
sudo -u gost-manager tee -a /opt/gost-manager/app/backend/.env << 'EOF'

# 数据库连接池配置
DB_POOL_MAX=10
DB_POOL_MIN=2
DB_POOL_ACQUIRE=30000
DB_POOL_IDLE=10000
EOF
```

### 3. 配置邮件通知 (可选)
```bash
# 添加邮件配置
sudo -u gost-manager tee -a /opt/gost-manager/app/backend/.env << 'EOF'

# 邮件配置 (可选)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
EOF
```

## 🛡️ 安全加固

### 1. 系统安全
```bash
# 禁用 root SSH 登录
sudo sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# 安装 fail2ban 防止暴力破解
sudo apt install -y fail2ban  # Debian/Ubuntu
sudo yum install -y epel-release && sudo yum install -y fail2ban  # CentOS

# 配置 fail2ban
sudo tee /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
EOF

sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 2. 应用安全
```bash
# 设置更严格的文件权限
sudo chmod 600 /opt/gost-manager/app/backend/.env
sudo chmod 755 /opt/gost-manager/app/backend/
sudo chmod -R 644 /opt/gost-manager/app/frontend/dist/

# 创建安全配置文件
sudo -u gost-manager tee /opt/gost-manager/app/backend/security.json << 'EOF'
{
  "rateLimiting": {
    "windowMs": 900000,
    "max": 100
  },
  "cors": {
    "origin": ["https://your-domain.com"],
    "credentials": true
  },
  "helmet": {
    "contentSecurityPolicy": {
      "directives": {
        "defaultSrc": ["'self'"],
        "styleSrc": ["'self'", "'unsafe-inline'"],
        "scriptSrc": ["'self'"],
        "imgSrc": ["'self'", "data:", "https:"]
      }
    }
  }
}
EOF
```

## 📈 监控和告警

### 1. 安装监控工具
```bash
# 安装 htop 和 iotop
sudo apt install -y htop iotop nethogs  # Debian/Ubuntu
sudo yum install -y htop iotop nethogs  # CentOS/RHEL

# 安装 Node.js 监控工具
sudo npm install -g pm2-logrotate
sudo -u gost-manager pm2 install pm2-logrotate
```

### 2. 配置系统监控脚本
```bash
sudo tee /opt/gost-manager/monitor.sh << 'EOF'
#!/bin/bash

LOG_FILE="/var/log/gost-manager/monitor.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# 检查应用状态
APP_STATUS=$(sudo -u gost-manager pm2 jlist | jq -r '.[0].pm2_env.status' 2>/dev/null)
if [ "$APP_STATUS" != "online" ]; then
    echo "[$DATE] ALERT: Application is not running (Status: $APP_STATUS)" >> $LOG_FILE
    # 这里可以添加邮件或短信通知
fi

# 检查内存使用
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
if (( $(echo "$MEMORY_USAGE > 80" | bc -l) )); then
    echo "[$DATE] WARNING: High memory usage: ${MEMORY_USAGE}%" >> $LOG_FILE
fi

# 检查磁盘使用
DISK_USAGE=$(df /opt/gost-manager | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo "[$DATE] WARNING: High disk usage: ${DISK_USAGE}%" >> $LOG_FILE
fi

# 检查 Nginx 状态
if ! systemctl is-active --quiet nginx; then
    echo "[$DATE] ALERT: Nginx is not running" >> $LOG_FILE
fi

echo "[$DATE] Monitor check completed" >> $LOG_FILE
EOF

sudo chmod +x /opt/gost-manager/monitor.sh

# 设置定时监控 (每 5 分钟)
sudo crontab -e
# 添加以下行：
# */5 * * * * /opt/gost-manager/monitor.sh
```

## 🔄 自动化部署脚本

### 创建一键部署脚本
```bash
sudo tee /opt/gost-manager/deploy.sh << 'EOF'
#!/bin/bash

set -e

echo "🚀 开始部署 Gost 管理系统..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    log_error "请使用 root 用户运行此脚本"
    exit 1
fi

# 检测操作系统
if [ -f /etc/debian_version ]; then
    OS="debian"
    log_info "检测到 Debian/Ubuntu 系统"
elif [ -f /etc/redhat-release ]; then
    OS="redhat"
    log_info "检测到 CentOS/RHEL 系统"
else
    log_error "不支持的操作系统"
    exit 1
fi

# 更新系统
log_info "更新系统包..."
if [ "$OS" = "debian" ]; then
    apt update && apt upgrade -y
    apt install -y curl wget git unzip build-essential nginx
elif [ "$OS" = "redhat" ]; then
    yum update -y
    yum install -y curl wget git unzip gcc gcc-c++ make nginx
fi

# 安装 Node.js
log_info "安装 Node.js..."
if [ "$OS" = "debian" ]; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
elif [ "$OS" = "redhat" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    yum install -y nodejs
fi

# 安装 PM2
log_info "安装 PM2..."
npm install -g pm2

# 创建用户和目录
log_info "创建用户和目录..."
useradd -r -s /bin/false gost-manager 2>/dev/null || true
mkdir -p /opt/gost-manager/{app,logs,config,data}
mkdir -p /var/log/gost-manager
chown -R gost-manager:gost-manager /opt/gost-manager
chown -R gost-manager:gost-manager /var/log/gost-manager

# 下载 Gost
log_info "下载 Gost 二进制文件..."
GOST_VERSION="3.0.0-rc8"
cd /tmp
wget -q https://github.com/go-gost/gost/releases/download/v${GOST_VERSION}/gost_${GOST_VERSION}_linux_amd64.tar.gz
tar -xzf gost_${GOST_VERSION}_linux_amd64.tar.gz
mv gost /usr/local/bin/
chmod +x /usr/local/bin/gost

log_info "✅ 基础环境安装完成！"
log_info "请按照文档继续配置应用代码和环境变量。"
EOF

sudo chmod +x /opt/gost-manager/deploy.sh
```

## 🧪 部署验证

### 创建部署验证脚本
```bash
sudo tee /opt/gost-manager/verify-deployment.sh << 'EOF'
#!/bin/bash

echo "🔍 验证部署状态..."

# 检查服务状态
echo "1. 检查系统服务..."
systemctl is-active --quiet nginx && echo "✅ Nginx 运行正常" || echo "❌ Nginx 未运行"

# 检查应用状态
echo "2. 检查应用状态..."
sudo -u gost-manager pm2 jlist | jq -r '.[0].pm2_env.status' 2>/dev/null | grep -q "online" && echo "✅ 应用运行正常" || echo "❌ 应用未运行"

# 检查端口监听
echo "3. 检查端口监听..."
netstat -tlnp | grep -q ":80 " && echo "✅ HTTP 端口 (80) 监听正常" || echo "❌ HTTP 端口未监听"
netstat -tlnp | grep -q ":3000 " && echo "✅ 应用端口 (3000) 监听正常" || echo "❌ 应用端口未监听"

# 检查 API 响应
echo "4. 检查 API 响应..."
curl -s http://localhost:3000/api/health >/dev/null && echo "✅ API 响应正常" || echo "❌ API 无响应"

# 检查前端文件
echo "5. 检查前端文件..."
[ -f "/opt/gost-manager/app/frontend/dist/index.html" ] && echo "✅ 前端文件存在" || echo "❌ 前端文件缺失"

# 检查数据库
echo "6. 检查数据库..."
[ -f "/opt/gost-manager/data/database.sqlite" ] && echo "✅ 数据库文件存在" || echo "❌ 数据库文件缺失"

# 检查日志文件
echo "7. 检查日志文件..."
[ -f "/var/log/gost-manager/app.log" ] && echo "✅ 应用日志正常" || echo "❌ 应用日志缺失"

echo "🎉 部署验证完成！"
EOF

sudo chmod +x /opt/gost-manager/verify-deployment.sh
```

## 📚 快速命令参考

### 常用管理命令
```bash
# 应用管理
sudo -u gost-manager pm2 status                    # 查看应用状态
sudo -u gost-manager pm2 restart gost-manager      # 重启应用
sudo -u gost-manager pm2 logs gost-manager         # 查看应用日志
sudo -u gost-manager pm2 monit                     # 监控应用

# 服务管理
sudo systemctl status nginx                        # 查看 Nginx 状态
sudo systemctl restart nginx                       # 重启 Nginx
sudo systemctl reload nginx                        # 重载 Nginx 配置

# 日志查看
tail -f /var/log/gost-manager/app.log              # 应用日志
tail -f /var/log/nginx/gost-manager.access.log     # 访问日志
tail -f /var/log/nginx/gost-manager.error.log      # 错误日志

# 系统监控
htop                                                # 系统资源监控
sudo netstat -tlnp                                 # 端口监听状态
sudo ss -tlnp                                      # 端口监听状态 (新版)
df -h                                               # 磁盘使用情况
free -h                                             # 内存使用情况
```

### 快速故障排除
```bash
# 应用无法启动
sudo -u gost-manager pm2 logs gost-manager --lines 50
sudo -u gost-manager pm2 restart gost-manager

# Nginx 502 错误
sudo nginx -t
curl http://127.0.0.1:3000/api/health
sudo systemctl restart nginx

# 权限问题
sudo chown -R gost-manager:gost-manager /opt/gost-manager
sudo chmod 600 /opt/gost-manager/app/backend/.env

# 端口占用
sudo netstat -tlnp | grep :3000
sudo lsof -i :3000
```

## 🎯 部署检查清单

### 部署前检查
- [ ] 服务器满足最低配置要求
- [ ] 域名 DNS 解析正确
- [ ] 防火墙端口开放 (80, 443, 22)
- [ ] SSL 证书准备就绪 (如使用 HTTPS)

### 部署过程检查
- [ ] Node.js 18+ 安装成功
- [ ] PM2 安装成功
- [ ] Nginx 安装并启动
- [ ] Gost 二进制文件下载并可执行
- [ ] 用户和目录创建成功
- [ ] 应用代码部署完成
- [ ] 依赖包安装成功
- [ ] 前端构建成功

### 部署后检查
- [ ] 应用启动成功 (PM2 状态为 online)
- [ ] Nginx 配置正确并重载
- [ ] 数据库初始化成功
- [ ] API 接口响应正常
- [ ] 前端页面可访问
- [ ] SSL 证书配置正确 (如使用)
- [ ] 日志文件正常写入
- [ ] 监控脚本配置完成

---

**🎉 部署完成后，您可以通过浏览器访问 `http://your-domain.com` 来使用 Gost 管理系统！**

**📞 如需技术支持，请查看日志文件并参考故障排除章节。**
