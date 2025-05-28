# 🛑 Gost 管理系统停止和卸载指南

本文档详细介绍如何安全地停止和卸载 Gost 管理系统。

## 📋 概述

我们提供了完整的停止和卸载解决方案，支持不同的部署环境：

- **完整部署环境** - 使用 `quick-deploy.sh` 部署的系统
- **简化部署环境** - 使用 `simple-deploy.sh` 部署的系统
- **Windows 环境** - 使用 PowerShell 脚本部署的系统

## 🛠️ 可用脚本

### Linux 脚本
- `stop.sh` - 完整环境停止脚本
- `uninstall.sh` - 完整环境卸载脚本
- `simple-stop.sh` - 简化环境停止脚本
- `simple-uninstall.sh` - 简化环境卸载脚本
- `manage.sh` - 统一管理脚本

### Windows 脚本
- `stop.ps1` - Windows 停止脚本
- `uninstall.ps1` - Windows 卸载脚本

## 🛑 停止服务

### 方法一：使用统一管理脚本 (推荐)
```bash
# 自动检测环境并停止
./scripts/manage.sh stop

# 强制停止
./scripts/manage.sh stop --force

# 查看状态
./scripts/manage.sh status
```

### 方法二：直接使用停止脚本

#### Linux 完整部署环境
```bash
# 正常停止
sudo ./scripts/stop.sh

# 强制停止所有相关进程
sudo ./scripts/stop.sh --force

# 查看帮助
./scripts/stop.sh --help
```

#### Linux 简化部署环境
```bash
# 正常停止
./scripts/simple-stop.sh

# 强制停止
./scripts/simple-stop.sh --force
```

#### Windows 环境
```powershell
# 正常停止
.\scripts\stop.ps1

# 强制停止
.\scripts\stop.ps1 -Force

# 查看帮助
.\scripts\stop.ps1 -Help
```

### 停止脚本功能

#### 完整停止脚本 (`stop.sh`) 功能：
- ✅ 停止 PM2 管理的应用
- ✅ 停止直接运行的 Node.js 进程
- ✅ 停止 Gost 进程
- ✅ 可选停止 Nginx 服务
- ✅ 检查端口占用状态
- ✅ 显示详细的停止状态

#### 简化停止脚本 (`simple-stop.sh`) 功能：
- ✅ 停止 PM2 应用
- ✅ 停止直接运行的进程
- ✅ 停止 Gost 进程
- ✅ 检查停止状态

## 🗑️ 卸载系统

### ⚠️ 重要警告

**卸载操作不可逆！请在卸载前：**
1. 备份重要数据
2. 确认没有其他应用依赖相同组件
3. 停止所有相关服务

### 数据备份

#### 自动备份
```bash
# 使用管理脚本备份
./scripts/manage.sh backup
```

#### 手动备份
```bash
# 创建备份目录
mkdir -p ~/gost-backup

# 完整部署环境
cp /opt/gost-manager/data/database.sqlite ~/gost-backup/
cp /opt/gost-manager/config/gost-config.json ~/gost-backup/
cp /opt/gost-manager/app/backend/.env ~/gost-backup/

# 简化部署环境
cp ./gost-manager/backend/database/database.sqlite ~/gost-backup/
cp ./gost-manager/backend/.env ~/gost-backup/
cp ./gost-manager/backend/config/gost-config.json ~/gost-backup/
```

### 卸载方法

#### 方法一：使用统一管理脚本 (推荐)
```bash
# 完全卸载
sudo ./scripts/manage.sh uninstall

# 简化卸载
./scripts/manage.sh simple-uninstall
```

#### 方法二：直接使用卸载脚本

#### Linux 完整卸载
```bash
# 完全卸载 (会询问确认)
sudo ./scripts/uninstall.sh

# 卸载但保留用户数据
sudo ./scripts/uninstall.sh --keep-data

# 卸载但保留依赖包 (Node.js, PM2, Nginx)
sudo ./scripts/uninstall.sh --keep-deps

# 强制卸载，不询问确认
sudo ./scripts/uninstall.sh --force

# 保留数据且强制卸载
sudo ./scripts/uninstall.sh --keep-data --force

# 查看帮助
./scripts/uninstall.sh --help
```

#### Linux 简化卸载
```bash
# 删除项目文件
./scripts/simple-uninstall.sh

# 保留数据备份
./scripts/simple-uninstall.sh --keep-data

# 强制删除
./scripts/simple-uninstall.sh --force
```

#### Windows 卸载
```powershell
# 完全卸载 (需要管理员权限)
.\scripts\uninstall.ps1

# 保留数据
.\scripts\uninstall.ps1 -KeepData

# 保留依赖包
.\scripts\uninstall.ps1 -KeepDeps

# 指定安装路径
.\scripts\uninstall.ps1 -InstallPath "D:\apps\gost-manager"

# 强制卸载
.\scripts\uninstall.ps1 -Force

# 查看帮助
.\scripts\uninstall.ps1 -Help
```

### 卸载脚本功能

#### 完整卸载脚本 (`uninstall.sh`) 功能：
- ✅ 停止所有相关服务
- ✅ 删除应用文件和配置
- ✅ 删除系统用户和权限
- ✅ 清理 PM2 和 Nginx 配置
- ✅ 清理防火墙规则
- ✅ 可选保留用户数据
- ✅ 可选保留依赖包
- ✅ 自动数据备份功能

#### 简化卸载脚本 (`simple-uninstall.sh`) 功能：
- ✅ 停止相关服务
- ✅ 删除项目文件
- ✅ 可选数据备份
- ✅ 清理 PM2 配置

## 📊 状态检查

### 检查服务状态
```bash
# 使用管理脚本
./scripts/manage.sh status

# 手动检查
sudo -u gost-manager pm2 status  # PM2 状态
sudo systemctl status nginx      # Nginx 状态
sudo netstat -tlnp | grep :3000  # 端口状态
ps aux | grep gost               # 进程状态
```

### 查看日志
```bash
# 使用管理脚本
./scripts/manage.sh logs

# 手动查看
tail -f /var/log/gost-manager/app.log        # 应用日志
tail -f /var/log/nginx/gost-manager.error.log # Nginx 错误日志
sudo -u gost-manager pm2 logs gost-manager   # PM2 日志
```

## 🔄 数据恢复

如果需要重新安装并恢复数据：

### 1. 重新部署系统
```bash
# 使用相应的部署脚本
./scripts/quick-deploy.sh
# 或
./scripts/simple-deploy.sh
```

### 2. 恢复备份数据
```bash
# 完整部署环境
cp ~/gost-backup/database.sqlite /opt/gost-manager/data/
cp ~/gost-backup/gost-config.json /opt/gost-manager/config/
cp ~/gost-backup/.env /opt/gost-manager/app/backend/

# 简化部署环境
cp ~/gost-backup/database.sqlite ./gost-manager/backend/database/
cp ~/gost-backup/.env ./gost-manager/backend/
cp ~/gost-backup/gost-config.json ./gost-manager/backend/config/
```

### 3. 重启服务
```bash
# 完整部署环境
sudo -u gost-manager pm2 restart gost-manager

# 简化部署环境
pm2 restart gost-manager
```

## 🚨 故障排除

### 常见问题

#### 1. 权限不足
```bash
# 确保使用正确的权限
sudo ./scripts/stop.sh      # 完整环境需要 root
./scripts/simple-stop.sh    # 简化环境使用普通用户
```

#### 2. 进程无法停止
```bash
# 使用强制停止
sudo ./scripts/stop.sh --force
./scripts/simple-stop.sh --force
```

#### 3. 文件删除失败
```bash
# 检查文件权限
ls -la /opt/gost-manager/
sudo chown -R root:root /opt/gost-manager/

# 强制删除
sudo rm -rf /opt/gost-manager/
```

#### 4. 端口仍被占用
```bash
# 查找占用进程
sudo lsof -i :3000
sudo netstat -tlnp | grep :3000

# 强制终止进程
sudo kill -9 <PID>
```

### 清理残留文件

如果卸载脚本未能完全清理，可以手动清理：

```bash
# 删除应用目录
sudo rm -rf /opt/gost-manager/
sudo rm -rf /var/log/gost-manager/

# 删除用户
sudo userdel gost-manager
sudo rm -rf /home/gost-manager/

# 清理 Nginx 配置
sudo rm -f /etc/nginx/sites-available/gost-manager
sudo rm -f /etc/nginx/sites-enabled/gost-manager
sudo rm -f /etc/nginx/conf.d/gost-manager.conf

# 清理防火墙规则
sudo ufw delete allow 3000/tcp
sudo firewall-cmd --permanent --remove-port=3000/tcp
sudo firewall-cmd --reload

# 清理 PM2 配置
pm2 delete gost-manager
pm2 save
```

## 📞 技术支持

如果在停止或卸载过程中遇到问题：

1. **查看脚本帮助**: `./scripts/stop.sh --help`
2. **检查日志文件**: `./scripts/manage.sh logs`
3. **查看系统状态**: `./scripts/manage.sh status`
4. **参考故障排除**章节
5. **手动清理残留文件**

## 🎯 最佳实践

1. **停止前备份**: 始终在停止服务前备份重要数据
2. **逐步操作**: 先停止服务，再进行卸载
3. **检查依赖**: 卸载前确认其他应用不依赖相同组件
4. **保留日志**: 保留日志文件以便问题排查
5. **测试恢复**: 在测试环境中验证备份和恢复流程

---

**🔒 记住：安全第一，数据无价。在执行任何破坏性操作前，请务必备份重要数据！**
