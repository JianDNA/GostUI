# GOST管理系统

一个基于Web的GOST代理管理系统，提供用户友好的界面来管理GOST代理服务器。

## ✨ 功能特性

- 🚀 现代化的Web界面
- 👥 用户管理系统
- 📊 流量统计和监控
- ⚙️ GOST配置管理
- 🔧 转发规则管理
- 📈 性能监控
- 🔐 安全认证
- 🎯 一键部署脚本
- 🔄 智能更新机制

## 🛠️ 技术栈

### 前端
- Vue 3 + Composition API
- Element Plus UI框架
- Vite 构建工具
- Axios HTTP客户端
- ECharts 图表库

### 后端
- Node.js + Express
- SQLite 数据库
- Better-SQLite3 驱动
- PM2 进程管理

## 🚀 快速开始

### 🎯 一键管理脚本（推荐）

我们提供了集成的管理脚本，包含部署、更新、配置管理等所有功能：

```bash
# 1. 克隆项目
git clone https://github.com/JianDNA/GostUI.git
cd GostUI

# 2. 运行管理脚本
./gost-manager
```

管理脚本功能：
- 🚀 **一键部署** - 全自动部署，清理旧环境
- 🔄 **智能更新** - 保留数据的智能更新
- 🔧 **手动更新** - 异常情况下的手动更新
- ⚙️ **修改端口** - 自定义服务端口（持久化）
- 🔐 **修改密码** - 修改管理员密码
- 💾 **数据备份** - 备份数据库和配置文件
- 🔄 **数据还原** - 还原备份的数据
- 🧹 **日志管理** - 自动日志轮转和清理（20MB限制）

### 环境要求
- **操作系统**: Linux (Ubuntu/CentOS/Debian)
- **Node.js**: >= 18.0.0 (推荐 20.x LTS)
- **内存**: >= 2GB (推荐4GB)
- **磁盘**: >= 1GB 可用空间
- **网络**: 需要访问GitHub和npm仓库

### 📋 环境准备

#### 1. 安装Node.js

**方式一: 使用NodeSource官方仓库 (推荐)**

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# CentOS/RHEL/Rocky Linux
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node -v    # 应显示 v20.x.x
npm -v     # 应显示 10.x.x
```

**方式二: 使用包管理器 (快速)**

```bash
# Ubuntu/Debian (可能版本较旧)
sudo apt update && sudo apt install -y nodejs npm

# CentOS/RHEL (可能版本较旧)
sudo yum install -y nodejs npm

# 检查版本，如果 < 18.0.0 请使用方式一
node -v
```

**方式三: 使用NVM (开发环境推荐)**

```bash
# 安装NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# 安装最新LTS版本
nvm install --lts
nvm use --lts

# 验证安装
node -v && npm -v
```

#### 2. 安装必要工具

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y git curl wget build-essential python3

# CentOS/RHEL/Rocky Linux
sudo yum update
sudo yum groupinstall -y "Development Tools"
sudo yum install -y git curl wget python3

# 验证安装
git --version
curl --version
```

#### 3. 安装PM2进程管理器

```bash
# 全局安装PM2
sudo npm install -g pm2

# 验证安装
pm2 -v

# 设置PM2开机自启 (可选，生产环境推荐)
pm2 startup
# 按照提示执行返回的命令
```



## 🔧 系统管理

### 🎯 集成管理脚本（推荐）

使用集成管理脚本可以方便地进行各种操作：

```bash
cd ~/GostUI
./gost-manager
```

管理脚本提供以下功能：

#### 📋 主要功能
1. **一键部署** - 全自动部署，自动清理旧环境
2. **智能更新** - 保留数据的智能更新（默认选项）
3. **手动更新** - 异常情况下的手动更新
4. **修改端口** - 自定义服务端口，配置持久化
5. **修改管理员密码** - 安全地修改admin密码
6. **备份数据库和配置** - 完整备份所有重要数据
7. **还原数据库和配置** - 从备份恢复数据

#### 🔧 配置管理
- **端口配置**: 修改后的端口会持久化保存，重启和更新后仍然有效
- **密码管理**: 支持安全的密码修改，使用bcrypt加密
- **数据备份**: 自动备份到 `/root/gost-backups` 目录
- **配置还原**: 支持完整的配置和数据还原

#### 💾 备份和还原
- **备份位置**: `/root/gost-backups/`
- **备份内容**: 数据库、环境配置、应用配置、GOST配置、端口配置
- **还原保护**: 还原前会检查部署目录，需要手动确认
- **安全提示**: 还原操作会覆盖现有数据，需要输入'yes'确认

#### 🧹 日志管理
- **自动轮转**: PM2日志文件自动轮转，最大20MB
- **文件保留**: 保留最近5个日志文件，自动压缩
- **应用日志**: 应用程序日志限制20MB，自动轮转
- **手动清理**: 提供cleanup-logs.sh脚本手动清理
- **智能备份**: 清理时保留最后1000行重要日志

## 🔄 传统更新方式

### 智能更新
```bash
# 一键智能更新 - 完全傻瓜式操作
cd ~/GostUI
./smart-update
```

### 手动更新
```bash
# 手动更新
cd ~
# 1. 删除原有目录
rm -rf GostUI
# 2. 克隆最新代码
git clone https://github.com/JianDNA/GostUI.git
# 3. 运行智能更新脚本
cd ~/GostUI
./smart-update
```

智能更新特点：
- ✅ **无Git冲突** - 自动处理所有代码冲突
- ✅ **数据保护** - 自动备份和恢复用户数据
- ✅ **配置修复** - 自动修复系统配置缺失
- ✅ **Bug修复** - 自动修复管理员流量显示和系统配置问题
- ✅ **服务管理** - 自动重启服务并验证

### 重新部署
```bash
# 完全重新部署 (会清除所有数据)
rm -rf ~/gost-management
./deploy
```

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
