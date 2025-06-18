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
chmod +x gost-manager.sh
./gost-manager.sh
```

管理脚本功能：
- 🚀 **一键部署** - 全自动部署，清理旧环境
- 🔄 **智能更新** - 保留数据的智能更新
- 🔧 **手动更新** - 异常情况下的手动更新
- ⚙️ **修改端口** - 自定义服务端口（持久化）
- 🔐 **修改密码** - 修改管理员密码
- 💾 **数据备份** - 备份数据库和配置文件
- 🔄 **数据还原** - 还原备份的数据

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

#### 4. 防火墙配置 (可选)

```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 3000/tcp
sudo ufw allow ssh
sudo ufw --force enable

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload

# 验证端口开放
sudo netstat -tlnp | grep :3000
```

#### 5. 配置系统资源 (可选)

```bash
# 增加文件描述符限制
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# 优化内存使用 (低内存服务器)
echo 'export NODE_OPTIONS="--max-old-space-size=2048"' >> ~/.bashrc
source ~/.bashrc
```

### 传统部署方式

如果您不想使用管理脚本，也可以直接使用部署脚本：

```bash
# 克隆项目
git clone https://github.com/JianDNA/GostUI.git
cd GostUI

# 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

#### 🔍 部署前环境检查

部署脚本会自动检查以下环境：

```bash
# 手动检查环境 (可选)
node -v        # 需要 >= 18.0.0
npm -v         # 需要 >= 9.0.0
pm2 -v         # 需要已安装
git --version  # 需要已安装
python3 --version  # 需要已安装 (编译native模块)

# 检查系统资源
free -h        # 检查内存 (需要 >= 2GB)
df -h          # 检查磁盘空间 (需要 >= 1GB)
```

如果环境检查失败，请参考上面的 **📋 环境准备** 部分。

> **💡 提示**: 部署脚本会自动安装缺失的系统工具，但Node.js和PM2需要手动安装。

#### 🚀 自动部署流程

部署脚本会自动：
- ✅ **环境检查** - 验证Node.js、npm、git等依赖
- ✅ **依赖安装** - 自动安装缺失的系统工具
- ✅ **构建模式选择** - 预构建/服务器端构建
- ✅ **前端构建** - 安装依赖并构建前端项目
- ✅ **数据库初始化** - 创建数据库和默认数据
- ✅ **服务配置** - 配置PM2和系统服务
- ✅ **安全配置** - 自动配置GOST安全设置
- ✅ **服务启动** - 启动并验证服务状态

### 部署完成后
- 🌐 **访问地址**: http://localhost:3000
- 🔐 **默认账号**: admin
- 🔑 **默认密码**: admin123

## 🔧 系统管理

### 🎯 集成管理脚本（推荐）

使用集成管理脚本可以方便地进行各种操作：

```bash
cd ~/GostUI
./gost-manager.sh
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

## 🔄 传统更新方式

### 智能更新
```bash
# 一键智能更新 - 完全傻瓜式操作
cd ~/GostUI
chmod +x smart-update.sh
./smart-update.sh
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
chmod +x smart-update.sh
./smart-update.sh
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
./deploy.sh
```

## 📝 开发工作流

### 本地开发
```bash
# 前端开发
cd frontend
npm run dev

# 后端开发
cd backend
npm start
```

### 构建和提交
```bash
# 方式一：手动构建
cd frontend
npm run build
cd ..
git add .
git commit -m "feat: 添加新功能"
git push

# 方式二：使用便捷脚本
chmod +x commit-with-build.sh
./commit-with-build.sh
```

## 🔧 管理命令

```bash
# 进入部署目录
cd ~/gost-management

# 服务管理
pm2 restart gost-management  # 重启服务
pm2 stop gost-management     # 停止服务
pm2 logs gost-management     # 查看日志
pm2 status                   # 查看状态

# 系统管理
./gost-manager.sh            # 集成管理脚本 (推荐)
./smart-update.sh            # 智能更新
```

## 📁 项目结构

```
GostUI/
├── gost-manager.sh         # 集成管理脚本 (推荐)
├── deploy.sh               # 主部署脚本
├── smart-update.sh         # 智能更新脚本
├── commit-with-build.sh    # 构建提交脚本
├── backend/                # 后端代码
│   ├── routes/            # API路由
│   ├── models/            # 数据模型
│   ├── services/          # 业务逻辑
│   ├── public/            # 前端文件部署位置
│   ├── database/          # 数据库文件
│   └── app.js             # 后端入口
├── frontend/              # 前端代码
│   ├── src/               # 源代码
│   ├── dist/              # 构建产物 (Git跟踪)
│   └── vite.config.js     # 构建配置
└── README.md              # 项目文档
```

## 🔄 部署模式

### 预构建模式 (推荐)
- **优点**: 部署速度快，服务器资源消耗少
- **适用**: 生产环境，低配置服务器
- **流程**: 本地构建 → 提交到Git → 服务器使用预构建文件

### 服务器端构建模式
- **优点**: 始终使用最新代码构建
- **适用**: 开发环境，高配置服务器
- **流程**: 服务器拉取代码 → 安装依赖 → 构建前端

## 🛠️ 故障排除

### 常见问题

#### 🔧 环境相关问题

1. **Node.js版本过低**
   ```bash
   # 检查当前版本
   node -v

   # 如果版本 < 18.0.0，卸载旧版本并重新安装
   sudo apt remove -y nodejs npm  # Ubuntu/Debian
   sudo yum remove -y nodejs npm  # CentOS/RHEL

   # 使用NodeSource安装最新版本
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs  # Ubuntu/Debian
   # 或
   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
   sudo yum install -y nodejs  # CentOS/RHEL

   # 验证安装
   node -v && npm -v
   ```

2. **npm权限问题**
   ```bash
   # 方法1: 使用NVM (推荐)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   source ~/.bashrc
   nvm install --lts && nvm use --lts

   # 方法2: 修复npm权限
   sudo chown -R $(whoami) ~/.npm
   sudo chown -R $(whoami) /usr/lib/node_modules

   # 方法3: 配置npm使用用户目录
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'
   echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc
   ```

3. **PM2未安装或无法找到**
   ```bash
   # 检查npm全局路径
   npm config get prefix
   npm list -g --depth=0

   # 重新安装PM2
   npm uninstall -g pm2 2>/dev/null
   npm install -g pm2

   # 如果仍然找不到，检查PATH
   echo $PATH
   which pm2 || echo "PM2 not found in PATH"

   # 手动添加npm全局bin目录到PATH
   echo 'export PATH=$(npm config get prefix)/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc
   ```

4. **编译错误 (native模块)**
   ```bash
   # Ubuntu/Debian
   sudo apt install -y build-essential python3-dev

   # CentOS/RHEL
   sudo yum groupinstall -y "Development Tools"
   sudo yum install -y python3-devel

   # 清理并重新安装
   rm -rf node_modules package-lock.json
   npm install
   ```

#### 🚀 部署相关问题

5. **前端构建失败**
   ```bash
   # 使用预构建模式
   cd frontend && npm run build
   git add frontend/dist/ && git commit -m "build: 更新构建产物"
   git push
   ./deploy.sh  # 选择预构建模式
   ```

6. **内存不足**
   ```bash
   # 临时设置
   export NODE_OPTIONS="--max-old-space-size=4096"

   # 永久设置
   echo 'export NODE_OPTIONS="--max-old-space-size=4096"' >> ~/.bashrc
   source ~/.bashrc
   ```

7. **端口占用**
   ```bash
   # 检查端口占用
   lsof -ti:3000
   netstat -tln | grep :3000

   # 强制释放端口
   lsof -ti:3000 | xargs kill -9
   ```

8. **服务异常**
   ```bash
   # 查看详细日志
   pm2 logs gost-management --lines 50

   # 重启服务
   pm2 restart gost-management

   # 完全重新加载
   pm2 reload gost-management
   ```

#### 🌐 网络相关问题

9. **无法访问GitHub**
   ```bash
   # 测试网络连接
   curl -I https://github.com

   # 配置Git代理 (如果需要)
   git config --global http.proxy http://proxy:port
   git config --global https.proxy https://proxy:port
   ```

10. **npm下载缓慢**
    ```bash
    # 使用国内镜像
    npm config set registry https://registry.npmmirror.com

    # 验证配置
    npm config get registry

    # 恢复官方源
    npm config set registry https://registry.npmjs.org
    ```

### 数据恢复
```bash
# 查找备份目录
ls /tmp/gost-*backup*

# 恢复数据库
cp /tmp/gost-backup-*/database.sqlite ~/gost-management/backend/database/

# 重启服务
pm2 restart gost-management
```

### 已知问题修复

系统已自动修复以下问题：

#### ✅ 管理员流量限额显示问题
- **问题**: 管理员用户界面显示1GB流量限额
- **修复**: 管理员用户现在正确显示"无限制"
- **自动修复**: `smart-update.sh` 和 `deploy.sh` 会自动处理

#### ✅ 系统配置API 404错误
- **问题**: `/api/system-config/allowUserExternalAccess` 返回404
- **修复**: 自动添加缺失的系统配置
- **自动修复**: 部署和更新脚本会自动检查并修复配置

> **注意**: 所有修复都已集成到现有的部署和更新脚本中，无需执行额外的修复脚本。

## 📊 性能优化

### 服务器配置建议
- **最低配置**: 1GB RAM, 1 CPU核心
- **推荐配置**: 2GB RAM, 2 CPU核心
- **高负载**: 4GB RAM, 4 CPU核心

### 优化建议
1. 使用预构建模式减少服务器资源消耗
2. 定期清理日志避免磁盘空间不足
3. 监控内存使用设置PM2内存限制
4. 定期备份数据库

## 🔐 安全建议

### 🛡️ 自动安全保护
**系统已内置自动安全保护机制！**

✅ **部署时自动保护**: 每次运行 `./deploy.sh` 都会自动配置GOST WebAPI安全设置
✅ **更新时自动修复**: 每次运行 `./smart-update.sh` 都会自动检查并修复安全配置
✅ **无需手动操作**: 系统会自动确保GOST WebAPI仅监听本地接口

### 🔒 安全特性
1. **GOST WebAPI保护** - 自动配置为仅本地访问 (127.0.0.1:18080)
2. **外部访问阻止** - 外部用户无法访问 `http://您的IP:18080/api/config`
3. **配置自动修复** - 部署和更新时自动检查并修复安全配置
4. **安全验证** - 部署完成后自动进行安全验证

### 🛡️ 安全检查清单
1. **✅ GOST WebAPI保护** - 系统自动配置（仅本地访问）
2. **✅ 观察器服务保护** - 端口18081仅本地访问
3. **✅ 限制器服务保护** - 通过主服务3000端口访问
4. **🔐 修改默认密码** - 首次登录后立即修改
5. **🛡️ 防火墙配置** - 建议配置系统防火墙
6. **💾 定期备份** - 设置自动备份策略
7. **🔄 更新系统** - 定期运行 `./smart-update.sh`
8. **📊 监控日志** - 检查异常访问
9. **🔍 端口安全检查** - 定期运行 `./check-port-security.sh`

### 🔍 端口安全检查
```bash
# 检查所有端口的安全状态
./check-port-security.sh

# 查看详细的端口监听情况
netstat -tln | grep -E ":3000|:18080|:18081"
```

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

### 提交规范
- `feat:` 新功能
- `fix:` 修复bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `build:` 构建产物更新

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 获取帮助

- 📋 查看日志: `pm2 logs gost-management`
- 🔍 安全检查: `./check-port-security.sh`
- 📚 查看文档: `DEPLOYMENT.md`
- 🐛 提交问题: [GitHub Issues](https://github.com/JianDNA/GostUI/issues)

---

**💡 提示**: 首次部署建议使用一键部署脚本，它会自动处理所有复杂的配置和依赖问题。
