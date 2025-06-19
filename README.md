# 🚀 GOST管理系统

一个现代化的Web界面GOST代理服务器管理平台，提供直观的用户界面来管理和监控GOST代理服务。

## ✨ 主要特性

- 🎯 **多用户管理** - 支持管理员和普通用户角色
- 🔧 **可视化配置** - 直观的转发规则配置界面
- 📊 **实时监控** - 流量统计和性能监控
- 🔄 **智能更新** - 保留数据的无缝更新机制
- 🛡️ **安全认证** - JWT认证和权限控制
- 🚀 **一键部署** - 全自动化部署脚本

## 🛠️ 技术栈

**前端**: Vue 3 + Element Plus + Vite + ECharts  
**后端**: Node.js + Express + SQLite + PM2

## 🚀 快速开始

### ⚡ 一键部署 (推荐)
```bash
# 一键下载并准备部署
curl -fsSL https://raw.githubusercontent.com/JianDNA/GostUI/main/quick-deploy.sh | bash
cd GostUI
./gost-manager.sh
```

### 📦 手动部署
```bash
# 下载最新代码
curl -L -o GostUI.zip https://github.com/JianDNA/GostUI/archive/refs/heads/main.zip
unzip GostUI.zip
mv GostUI-main GostUI
cd GostUI

# 修复脚本权限并运行管理脚本
./scripts/tools/fix-script-permissions.sh
./gost-manager.sh
```

### 🎯 管理脚本功能
- 🚀 **一键部署** - 全自动部署，清理旧环境
- 🔄 **智能更新** - 保留数据的智能更新
- ⚙️ **修改端口** - 自定义服务端口（持久化）
- 🔐 **修改密码** - 修改管理员密码
- 💾 **数据备份** - 备份数据库和配置文件
- 🔄 **数据还原** - 还原备份的数据

### 📋 环境要求
- **操作系统**: Linux (Ubuntu/CentOS/Debian)
- **Node.js**: >= 18.0.0 (推荐 20.x LTS)
- **内存**: >= 2GB
- **磁盘**: >= 1GB 可用空间

### 🔧 环境准备 (如需要)
```bash
# Ubuntu/Debian - 安装Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# CentOS/RHEL - 安装Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# 安装PM2进程管理器
sudo npm install -g pm2

# 验证安装
node -v && npm -v && pm2 -v
```

### 🎉 部署完成
- 🌐 **访问地址**: http://localhost:3000
- 🔐 **默认账号**: admin
- 🔑 **默认密码**: admin123

## 🔧 系统管理

### 🎯 管理脚本
```bash
cd ~/GostUI
./gost-manager.sh
```

**主要功能：**
- 🚀 一键部署 - 全自动部署
- 🔄 智能更新 - 保留数据的智能更新
- ⚙️ 修改端口 - 自定义服务端口
- 🔐 修改密码 - 修改管理员密码
- 💾 数据备份 - 备份数据库和配置
- 🔄 数据还原 - 从备份恢复数据

## 🔄 系统更新

### 智能更新 (推荐)
```bash
cd ~/GostUI
./smart-update.sh
```

### 手动更新
```bash
# 下载最新代码
cd ~
rm -rf GostUI
curl -L -o GostUI.zip https://github.com/JianDNA/GostUI/archive/refs/heads/main.zip
unzip GostUI.zip
mv GostUI-main GostUI
cd GostUI

# 修复权限并运行智能更新
./scripts/tools/fix-script-permissions.sh
./smart-update.sh
```

**智能更新特点：**
- ✅ 无冲突 - 自动处理代码冲突
- ✅ 数据保护 - 自动备份和恢复用户数据
- ✅ 智能下载 - ZIP下载，速度更快，体积更小

## 🔧 常用命令

```bash
# 服务管理
pm2 restart gost-management  # 重启服务
pm2 logs gost-management     # 查看日志
pm2 status                   # 查看状态

# 日志清理
./scripts/tools/cleanup-logs.sh
```

## 📁 项目结构

```
GostUI/
├── gost-manager.sh         # 主管理脚本入口
├── smart-update.sh         # 智能更新入口
├── deploy.sh               # 部署脚本入口
├── quick-deploy.sh         # 一键部署脚本
├── scripts/                # 脚本目录
│   ├── core/              # 核心管理脚本
│   ├── tools/             # 工具脚本
│   └── dev/               # 开发工具
├── docs/                   # 文档目录
├── backend/                # 后端代码
├── frontend/              # 前端代码
└── README.md              # 项目文档
```

## 🛠️ 故障排除

### 常见问题
```bash
# 脚本权限问题
./scripts/tools/fix-script-permissions.sh

# 端口占用
lsof -ti:3000 | xargs kill -9

# 服务重启
pm2 restart gost-management

# 查看日志
pm2 logs gost-management
```

## 📞 获取帮助

- **GitHub Issues**: [提交问题](https://github.com/JianDNA/GostUI/issues)
- **查看日志**: `pm2 logs gost-management`
- **重启服务**: `pm2 restart gost-management`

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。
