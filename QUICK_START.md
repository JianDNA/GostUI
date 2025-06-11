# ⚡ 快速部署指南

在 5 分钟内快速部署 Gost 管理系统到您的服务器。

## 🚀 一键部署 (推荐)

### 🐧 Linux 服务器
**适用于**: 全新的 Linux 服务器 (Debian/Ubuntu/CentOS)
**要求**: Root 权限 + 互联网连接

```bash
# 一键完整部署
curl -fsSL https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.sh | sudo bash
```

### 🔧 已有 Node.js 环境
**适用于**: 已安装 Node.js 16+ 的环境
**要求**: 普通用户权限即可

```bash
# 简化部署
curl -fsSL https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/simple-deploy.sh | bash
```

### 🪟 Windows 系统
**适用于**: Windows 10/11 和 Windows Server
**要求**: 管理员权限

```powershell
# 以管理员身份运行 PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force
iwr -useb https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.ps1 | iex
```

## ✅ 部署完成

### 访问系统
- **地址**: `http://your-server-ip:3000`
- **账户**: admin / admin123
- **⚠️ 重要**: 登录后立即修改默认密码！

### 验证部署
```bash
# 检查服务状态
curl http://localhost:3000/api/health

# 查看应用状态
pm2 status
```

## 📋 手动部署 (可选)

如果您需要自定义配置或一键脚本无法满足需求，可以选择手动部署。

### 🔧 环境准备
```bash
# Debian/Ubuntu
sudo apt update && sudo apt install -y curl wget git nodejs npm

# CentOS/RHEL
sudo yum update -y && sudo yum install -y curl wget git nodejs npm

# 安装 PM2
sudo npm install -g pm2
```

### 📦 部署应用
```bash
# 1. 克隆项目
git clone https://github.com/your-repo/gost-manager.git
cd gost-manager

# 2. 安装依赖
cd backend && npm install --production
cd ../frontend && npm install && npm run build

# 3. 配置环境
cp backend/.env.example backend/.env
# 编辑 .env 文件，修改必要的配置

# 4. 初始化数据库
cd backend && npm run migrate

# 5. 启动服务
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

### ⚙️ 基础配置
```bash
# 编辑配置文件
nano backend/.env

# 必需配置项
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secure-secret-key
DATABASE_PATH=./database/database.sqlite
```

## 🌐 配置反向代理 (可选)

如果需要使用域名或 80 端口访问，可以配置 Nginx：

```bash
# 安装 Nginx
sudo apt install -y nginx  # Debian/Ubuntu
sudo yum install -y nginx  # CentOS/RHEL

# 创建配置文件
sudo tee /etc/nginx/sites-available/gost-manager << 'EOF'
server {
    listen 80;
    server_name your-domain.com;  # 替换为您的域名

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/gost-manager /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

## 🔧 管理命令

### 应用管理
```bash
# 查看状态
pm2 status

# 重启应用
pm2 restart gost-manager

# 查看日志
pm2 logs gost-manager

# 停止应用
pm2 stop gost-manager
```

### 系统检查
```bash
# 测试 API
curl http://localhost:3000/api/health

# 查看端口
sudo netstat -tlnp | grep :3000

# 查看系统资源
htop
```

## 🚨 故障排除

### 常见问题
```bash
# 应用无法启动
pm2 logs gost-manager --lines 50

# 端口被占用
sudo lsof -i :3000

# 权限问题
sudo chown -R $USER:$USER ./gost-manager

# 重新安装依赖
cd gost-manager/backend && npm install
```

## 🔐 安全配置

### 必须修改
1. **默认密码**: 登录后立即修改 admin/admin123
2. **JWT 密钥**: 修改 `.env` 中的 `JWT_SECRET`
3. **防火墙**: 只开放必要端口

### HTTPS 配置 (推荐)
```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com
```

## 🛑 停止和卸载

### 停止服务
```bash
# 使用脚本停止
./scripts/stop.sh          # Linux 完整环境
./scripts/simple-stop.sh   # Linux 简化环境
.\scripts\stop.ps1         # Windows

# 手动停止
pm2 stop gost-manager
```

### 卸载系统
⚠️ **警告**: 卸载前请备份重要数据！

```bash
# 使用脚本卸载
sudo ./scripts/uninstall.sh --keep-data  # 保留数据
./scripts/simple-uninstall.sh           # 简化卸载

# 手动卸载
pm2 delete gost-manager
rm -rf ./gost-manager
```

## 📚 更多文档

- 📖 **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** - 完整文档导航
- 🔧 **[DEPLOYMENT.md](DEPLOYMENT.md)** - 详细部署指南
- 🔒 **[PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md)** - 安全配置
- 🧪 **[TESTING.md](TESTING.md)** - 测试和验证
- 🛑 **[STOP_UNINSTALL_GUIDE.md](STOP_UNINSTALL_GUIDE.md)** - 停止卸载指南

## 💬 获取帮助

遇到问题时：
1. 📋 查看 [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) 找到相关文档
2. 🔍 检查日志文件: `pm2 logs gost-manager`
3. 🧪 运行诊断: `node backend/diagnose-system.js`
4. 📖 参考故障排除章节

---

**🎉 部署完成！访问 `http://your-server-ip:3000` 开始使用！**
