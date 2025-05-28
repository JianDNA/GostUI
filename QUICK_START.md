# ⚡ Gost 管理系统快速部署指南

本指南帮助您在 5 分钟内快速部署 Gost 管理系统到 Linux 服务器。

## 🚀 一键部署 (推荐)

### Linux 服务器完整部署
适用于全新的 Linux 服务器，自动安装所有依赖。

**前提条件**: Linux 服务器 (Debian/Ubuntu/CentOS) + Root 权限 + 互联网连接

```bash
# 下载并运行完整部署脚本
curl -fsSL https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.sh | sudo bash

# 或者手动下载后运行
wget https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.sh
sudo chmod +x quick-deploy.sh
sudo ./quick-deploy.sh
```

### 简化部署 (已有 Node.js 环境)
适用于已安装 Node.js 16+ 的环境，无需 root 权限。

```bash
# 下载并运行简化部署脚本
curl -fsSL https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/simple-deploy.sh | bash

# 或者手动下载后运行
wget https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/simple-deploy.sh
chmod +x simple-deploy.sh
./simple-deploy.sh
```

### Windows 一键部署
适用于 Windows 10/11 和 Windows Server。

```powershell
# 以管理员身份运行 PowerShell，然后执行：
Set-ExecutionPolicy Bypass -Scope Process -Force
iwr -useb https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.ps1 | iex

# 或者下载后运行
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.ps1" -OutFile "quick-deploy.ps1"
.\quick-deploy.ps1
```

## 📋 手动部署 (5 分钟)

### 步骤 1: 环境准备 (2 分钟)
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y  # Debian/Ubuntu
# sudo yum update -y                    # CentOS/RHEL

# 安装基础工具 (nginx 是可选的)
sudo apt install -y curl wget git unzip build-essential
# sudo apt install -y nginx  # 可选：如果需要反向代理

# 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2
```

### 步骤 2: 准备环境 (1 分钟)
```bash
# 创建目录
sudo mkdir -p /opt/gost-manager
cd /opt/gost-manager

# 注意：Gost 二进制文件已包含在项目中，无需额外下载
# 项目包含：backend/assets/gost/gost-linux 和 backend/assets/gost/gost-windows.exe

# 创建用户
sudo useradd -r -s /bin/false gost-manager
sudo mkdir -p /opt/gost-manager/{app,logs,config,data}
sudo mkdir -p /var/log/gost-manager
sudo chown -R gost-manager:gost-manager /opt/gost-manager
sudo chown -R gost-manager:gost-manager /var/log/gost-manager
```

### 步骤 3: 部署应用 (2 分钟)
```bash
# 克隆代码 (替换为您的仓库地址)
cd /opt/gost-manager
sudo git clone https://github.com/your-repo/gost-manager.git app
sudo chown -R gost-manager:gost-manager app

# 安装依赖
cd app/backend
sudo -u gost-manager npm install --production

cd ../frontend
sudo -u gost-manager npm install
sudo -u gost-manager npm run build

# 创建环境配置
sudo -u gost-manager tee /opt/gost-manager/app/backend/.env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_PATH=/opt/gost-manager/data/database.sqlite
JWT_SECRET=change-this-to-a-secure-secret-key
GOST_BINARY_PATH=/opt/gost-manager/app/backend/bin/gost
GOST_CONFIG_PATH=/opt/gost-manager/config/gost-config.json
LOG_LEVEL=info
LOG_FILE=/var/log/gost-manager/app.log
EOF

# 创建 PM2 配置
sudo -u gost-manager tee /opt/gost-manager/app/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'gost-manager',
    script: './backend/app.js',
    cwd: '/opt/gost-manager/app',
    env: { NODE_ENV: 'production', PORT: 3000 },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '500M',
    error_file: '/var/log/gost-manager/pm2-error.log',
    out_file: '/var/log/gost-manager/pm2-out.log',
    log_file: '/var/log/gost-manager/pm2.log'
  }]
};
EOF

# 初始化数据库
cd /opt/gost-manager/app/backend
sudo -u gost-manager NODE_ENV=production npm run migrate

# 启动应用
cd /opt/gost-manager/app
sudo -u gost-manager pm2 start ecosystem.config.js
sudo -u gost-manager pm2 save
```

### 步骤 4: 配置 Nginx (可选 - 1 分钟)
**注意**: 如果您选择直接使用 IP:3000 访问，可以跳过此步骤。

```bash
# 创建 Nginx 配置
sudo tee /etc/nginx/sites-available/gost-manager << 'EOF'
server {
    listen 80;
    server_name _;  # 替换为您的域名

    location / {
        root /opt/gost-manager/app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 启用站点
sudo ln -s /etc/nginx/sites-available/gost-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 配置防火墙 (可选)
# 如果使用 Nginx:
# sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp
# 如果直接访问应用:
# sudo ufw allow 3000/tcp
# sudo ufw --force enable
```

## ✅ 验证部署

### 检查服务状态
```bash
# 检查应用状态
sudo -u gost-manager pm2 status

# 检查 Nginx 状态
sudo systemctl status nginx

# 检查端口监听
sudo netstat -tlnp | grep -E ':(80|3000) '

# 测试 API
curl http://localhost:3000/api/health
```

### 访问系统
1. 打开浏览器访问：
   - 使用 Nginx: `http://your-server-ip`
   - 直接访问: `http://your-server-ip:3000`
2. 使用默认管理员账户登录：
   - 用户名：`admin`
   - 密码：`admin123`

## 🔧 常用命令

### 应用管理
```bash
# 查看状态
sudo -u gost-manager pm2 status

# 重启应用
sudo -u gost-manager pm2 restart gost-manager

# 查看日志
sudo -u gost-manager pm2 logs gost-manager

# 停止应用
sudo -u gost-manager pm2 stop gost-manager
```

### 系统管理
```bash
# 重启 Nginx
sudo systemctl restart nginx

# 查看系统资源
htop

# 查看磁盘使用
df -h

# 查看内存使用
free -h
```

## 🚨 故障排除

### 应用无法启动
```bash
# 查看详细日志
sudo -u gost-manager pm2 logs gost-manager --lines 50

# 检查权限
ls -la /opt/gost-manager/app/backend/

# 检查环境变量
cat /opt/gost-manager/app/backend/.env
```

### 无法访问网页
```bash
# 检查 Nginx 配置
sudo nginx -t

# 检查端口监听
sudo netstat -tlnp | grep :80

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log
```

### API 无响应
```bash
# 测试后端连接
curl http://127.0.0.1:3000/api/health

# 检查应用日志
tail -f /var/log/gost-manager/app.log

# 重启应用
sudo -u gost-manager pm2 restart gost-manager
```

## 🔐 安全建议

### 立即修改的配置
1. **修改默认密码**：登录后立即修改 admin 用户密码
2. **更新 JWT 密钥**：修改 `.env` 文件中的 `JWT_SECRET`
3. **配置 HTTPS**：使用 Let's Encrypt 获取免费 SSL 证书
4. **设置防火墙**：只开放必要的端口

### 配置 HTTPS (可选)
```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取 SSL 证书 (替换为您的域名)
sudo certbot --nginx -d your-domain.com

# 设置自动续期
sudo crontab -e
# 添加：0 12 * * * /usr/bin/certbot renew --quiet
```

## 🛑 停止和卸载

### 停止服务
```bash
# Linux - 完整部署环境
sudo ./scripts/stop.sh

# Linux - 简化部署环境
./scripts/simple-stop.sh

# Windows
.\scripts\stop.ps1
```

### 卸载系统
⚠️ **警告**: 卸载操作不可逆，请确保已备份重要数据！

```bash
# Linux - 完整卸载
sudo ./scripts/uninstall.sh

# Linux - 卸载但保留数据
sudo ./scripts/uninstall.sh --keep-data

# Linux - 简化卸载
./scripts/simple-uninstall.sh

# Windows - 完整卸载
.\scripts\uninstall.ps1

# Windows - 卸载但保留数据
.\scripts\uninstall.ps1 -KeepData
```

### 数据备份
```bash
# 手动备份重要数据
mkdir -p ~/gost-backup
cp /opt/gost-manager/data/database.sqlite ~/gost-backup/
cp /opt/gost-manager/config/gost-config.json ~/gost-backup/
cp /opt/gost-manager/app/backend/.env ~/gost-backup/
```

## 📚 更多资源

- 📖 **完整部署指南**：[DEPLOYMENT.md](DEPLOYMENT.md)
- 🔒 **安全配置**：[PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md)
- 🧪 **测试指南**：[TESTING.md](TESTING.md)
- 📋 **API 文档**：[README.md](README.md)
- 🛠️ **脚本说明**：[scripts/README.md](scripts/README.md)

## 💬 获取帮助

如果遇到问题：
1. 查看日志文件获取错误信息
2. 参考故障排除章节
3. 查看完整的部署文档
4. 检查系统要求是否满足

---

**🎉 恭喜！您的 Gost 管理系统已成功部署！**
