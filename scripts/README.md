# 🚀 Gost 管理系统部署脚本

本目录包含了 Gost 管理系统的自动化部署脚本，支持多种环境和部署方式。

## 📁 脚本文件

### 部署脚本

#### 1. `quick-deploy.sh` - Linux 完整部署脚本
**适用场景**: 全新的 Linux 服务器，自动安装所有依赖

**支持系统**:
- Debian 10+
- Ubuntu 18.04+
- CentOS 7+
- RHEL 7+

**功能特性**:
- ✅ 自动检测操作系统
- ✅ 安装 Node.js 18 LTS
- ✅ 安装 PM2 进程管理器
- ✅ 可选安装 Nginx 反向代理
- ✅ 自动配置防火墙
- ✅ 设置开机自启
- ✅ 完整的部署验证

**使用方法**:
```bash
# 一键部署
curl -fsSL https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.sh | sudo bash

# 或者下载后运行
wget https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.sh
sudo chmod +x quick-deploy.sh
sudo ./quick-deploy.sh
```

**部署路径**: `/opt/gost-manager/`

### 2. `simple-deploy.sh` - 简化部署脚本
**适用场景**: 已有 Node.js 环境，无需 root 权限

**前提条件**:
- Node.js 16+ 已安装
- Git 已安装
- 普通用户权限即可

**功能特性**:
- ✅ 快速部署到当前目录
- ✅ 自动检测依赖
- ✅ 支持 PM2 或直接启动
- ✅ 适合开发和测试环境

**使用方法**:
```bash
# 一键部署
curl -fsSL https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/simple-deploy.sh | bash

# 或者下载后运行
wget https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/simple-deploy.sh
chmod +x simple-deploy.sh
./simple-deploy.sh
```

**部署路径**: `./gost-manager/`

### 3. `quick-deploy.ps1` - Windows 部署脚本
**适用场景**: Windows 10/11 和 Windows Server

**功能特性**:
- ✅ 自动安装 Chocolatey
- ✅ 自动安装 Node.js 和 Git
- ✅ 自动配置防火墙规则
- ✅ 设置 Windows 服务
- ✅ 完整的部署验证

**使用方法**:
```powershell
# 以管理员身份运行 PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force
iwr -useb https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.ps1 | iex

# 或者下载后运行
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/your-repo/gost-manager/main/scripts/quick-deploy.ps1" -OutFile "quick-deploy.ps1"
.\quick-deploy.ps1
```

**部署路径**: `C:\gost-manager\`

### 停止和卸载脚本

#### 4. `stop.sh` - Linux 停止脚本
**适用场景**: 停止正在运行的 Gost 管理系统服务

**功能特性**:
- ✅ 停止 PM2 管理的应用
- ✅ 停止直接运行的 Node.js 进程
- ✅ 停止 Gost 进程
- ✅ 可选停止 Nginx 服务
- ✅ 检查端口占用状态
- ✅ 显示详细的停止状态

**使用方法**:
```bash
# 正常停止
./stop.sh

# 强制停止
./stop.sh --force

# 查看帮助
./stop.sh --help
```

#### 5. `uninstall.sh` - Linux 卸载脚本
**适用场景**: 完全卸载 Gost 管理系统及其相关组件

**功能特性**:
- ✅ 完全删除应用文件和配置
- ✅ 删除系统用户和权限
- ✅ 清理 PM2 和 Nginx 配置
- ✅ 清理防火墙规则
- ✅ 可选保留用户数据
- ✅ 可选保留依赖包
- ✅ 数据备份功能

**使用方法**:
```bash
# 完全卸载 (会询问确认)
sudo ./uninstall.sh

# 卸载但保留数据
sudo ./uninstall.sh --keep-data

# 卸载但保留依赖包
sudo ./uninstall.sh --keep-deps

# 强制卸载，不询问
sudo ./uninstall.sh --force

# 查看帮助
./uninstall.sh --help
```

#### 6. `stop.ps1` - Windows 停止脚本
**适用场景**: 停止 Windows 环境下的 Gost 管理系统

**使用方法**:
```powershell
# 正常停止
.\stop.ps1

# 强制停止
.\stop.ps1 -Force
```

#### 7. `uninstall.ps1` - Windows 卸载脚本
**适用场景**: 完全卸载 Windows 环境下的 Gost 管理系统

**使用方法**:
```powershell
# 完全卸载
.\uninstall.ps1

# 卸载但保留数据
.\uninstall.ps1 -KeepData

# 指定安装路径
.\uninstall.ps1 -InstallPath "D:\apps\gost-manager"
```

#### 8. `simple-stop.sh` - 简化停止脚本
**适用场景**: 停止使用 simple-deploy.sh 部署的应用

**使用方法**:
```bash
./simple-stop.sh
./simple-stop.sh --force
```

#### 9. `simple-uninstall.sh` - 简化卸载脚本
**适用场景**: 卸载使用 simple-deploy.sh 部署的应用

**使用方法**:
```bash
./simple-uninstall.sh
./simple-uninstall.sh --keep-data
./simple-uninstall.sh --force
```

## 🔧 脚本参数

### Linux 脚本参数
```bash
# quick-deploy.sh 支持环境变量
export REPO_URL="https://github.com/your-repo/gost-manager.git"
export APP_DIR="/custom/path"
export NODE_VERSION="18"
sudo ./quick-deploy.sh
```

### Windows 脚本参数
```powershell
# quick-deploy.ps1 支持参数
.\quick-deploy.ps1 -InstallPath "D:\apps\gost-manager" -Port 8080
.\quick-deploy.ps1 -SkipNodeInstall  # 跳过 Node.js 安装
.\quick-deploy.ps1 -Help             # 显示帮助
```

## 📋 部署后访问

### 默认访问地址
- **使用 Nginx**: `http://your-server-ip`
- **直接访问**: `http://your-server-ip:3000`
- **本地访问**: `http://localhost:3000`

### 默认账户
- **用户名**: `admin`
- **密码**: `admin123`

⚠️ **重要**: 部署完成后请立即修改默认密码！

## 🛠️ 管理命令

### Linux (使用 PM2)
```bash
# 查看应用状态
sudo -u gost-manager pm2 status

# 查看应用日志
sudo -u gost-manager pm2 logs gost-manager

# 重启应用
sudo -u gost-manager pm2 restart gost-manager

# 停止应用
sudo -u gost-manager pm2 stop gost-manager

# 删除应用
sudo -u gost-manager pm2 delete gost-manager
```

### Windows (使用 PM2)
```powershell
# 查看应用状态
pm2 status

# 查看应用日志
pm2 logs gost-manager

# 重启应用
pm2 restart gost-manager

# 停止应用
pm2 stop gost-manager
```

### 系统服务管理
```bash
# Linux - Nginx 管理
sudo systemctl status nginx
sudo systemctl restart nginx
sudo systemctl stop nginx

# 查看系统资源
htop
df -h
free -h
```

## 🔍 故障排除

### 常见问题

#### 1. 脚本下载失败
```bash
# 检查网络连接
ping github.com

# 使用代理下载
export https_proxy=http://proxy-server:port
curl -fsSL https://raw.githubusercontent.com/...
```

#### 2. 权限问题
```bash
# Linux - 确保使用 sudo
sudo ./quick-deploy.sh

# Windows - 确保以管理员身份运行
# 右键 PowerShell -> "以管理员身份运行"
```

#### 3. 端口冲突
```bash
# 检查端口占用
sudo netstat -tlnp | grep :3000
sudo lsof -i :3000

# 修改端口 (编辑 .env 文件)
PORT=8080
```

#### 4. 应用无法启动
```bash
# 查看详细日志
sudo -u gost-manager pm2 logs gost-manager --lines 50

# 检查配置文件
cat /opt/gost-manager/app/backend/.env

# 手动启动测试
cd /opt/gost-manager/app/backend
node app.js
```

### 日志文件位置

#### Linux 完整部署
- 应用日志: `/var/log/gost-manager/app.log`
- PM2 日志: `/var/log/gost-manager/pm2.log`
- Nginx 日志: `/var/log/nginx/gost-manager.access.log`

#### 简化部署
- 应用日志: `./gost-manager/logs/app.log`
- PM2 日志: `~/.pm2/logs/`

#### Windows 部署
- 应用日志: `C:\gost-manager\logs\app.log`
- PM2 日志: `C:\gost-manager\logs\pm2.log`

## 🛑 停止和卸载操作

### 停止服务

#### 完整部署环境
```bash
# 停止服务 (需要 root 权限)
sudo ./stop.sh

# 强制停止所有相关进程
sudo ./stop.sh --force
```

#### 简化部署环境
```bash
# 停止服务
./simple-stop.sh

# 强制停止
./simple-stop.sh --force
```

#### Windows 环境
```powershell
# 停止服务
.\stop.ps1

# 强制停止
.\stop.ps1 -Force
```

### 卸载系统

#### ⚠️ 重要警告
- 卸载操作不可逆，请确保已备份重要数据
- 建议先停止服务，再进行卸载
- 卸载前请确认没有其他应用依赖相同的组件

#### 完整卸载 (Linux)
```bash
# 完全卸载 (会询问确认)
sudo ./uninstall.sh

# 保留用户数据
sudo ./uninstall.sh --keep-data

# 保留依赖包 (Node.js, PM2, Nginx)
sudo ./uninstall.sh --keep-deps

# 强制卸载，不询问确认
sudo ./uninstall.sh --force

# 保留数据且强制卸载
sudo ./uninstall.sh --keep-data --force
```

#### 简化卸载 (Linux)
```bash
# 删除项目文件
./simple-uninstall.sh

# 保留数据备份
./simple-uninstall.sh --keep-data

# 强制删除
./simple-uninstall.sh --force
```

#### Windows 卸载
```powershell
# 完全卸载 (需要管理员权限)
.\uninstall.ps1

# 保留数据
.\uninstall.ps1 -KeepData

# 保留依赖包
.\uninstall.ps1 -KeepDeps

# 指定安装路径
.\uninstall.ps1 -InstallPath "D:\apps\gost-manager"

# 强制卸载
.\uninstall.ps1 -Force
```

### 数据备份和恢复

#### 手动备份重要数据
```bash
# 备份数据库
cp /opt/gost-manager/data/database.sqlite ~/gost-backup/

# 备份配置文件
cp /opt/gost-manager/config/gost-config.json ~/gost-backup/
cp /opt/gost-manager/app/backend/.env ~/gost-backup/

# 简化部署环境
cp ./gost-manager/backend/database/database.sqlite ~/gost-backup/
cp ./gost-manager/backend/.env ~/gost-backup/
```

#### 恢复数据
```bash
# 重新部署后恢复数据
cp ~/gost-backup/database.sqlite /opt/gost-manager/data/
cp ~/gost-backup/gost-config.json /opt/gost-manager/config/
cp ~/gost-backup/.env /opt/gost-manager/app/backend/

# 重启服务
sudo -u gost-manager pm2 restart gost-manager
```

## 🔄 更新应用

### 自动更新脚本
```bash
# Linux
cd /opt/gost-manager/app
sudo -u gost-manager git pull origin main
sudo -u gost-manager npm install --production
cd frontend && sudo -u gost-manager npm run build
sudo -u gost-manager pm2 restart gost-manager

# 简化版本
cd ./gost-manager
git pull origin main
npm install
cd frontend && npm run build
pm2 restart gost-manager
```

### 备份数据
```bash
# 备份数据库
cp /opt/gost-manager/data/database.sqlite /opt/gost-manager/data/database.sqlite.backup

# 备份配置
cp /opt/gost-manager/config/gost-config.json /opt/gost-manager/config/gost-config.json.backup
```

## 📞 技术支持

如果遇到部署问题：

1. **检查系统要求**是否满足
2. **查看错误日志**获取详细信息
3. **参考故障排除**章节
4. **查看完整文档**: [DEPLOYMENT.md](../DEPLOYMENT.md)

## 🔒 安全建议

1. **修改默认密码**
2. **配置 HTTPS** (使用 Let's Encrypt)
3. **定期更新系统**和应用
4. **配置防火墙**规则
5. **定期备份数据**

---

**📝 注意**: 请将脚本中的 `https://github.com/your-repo/gost-manager.git` 替换为实际的仓库地址。
