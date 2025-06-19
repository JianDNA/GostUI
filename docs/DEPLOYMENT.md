# GOST管理系统 - 部署指南

## 🚀 快速部署

### 环境要求
- **操作系统**: Linux (Ubuntu/CentOS/Debian)
- **Node.js**: >= 18.0.0 (推荐 20.x LTS)
- **内存**: >= 2GB (推荐4GB)
- **磁盘**: >= 1GB 可用空间
- **网络**: 需要访问GitHub和npm仓库

> **注意**: 详细的环境准备步骤请参考 [README.md](README.md#-环境准备)

### 一键部署

#### 📦 ZIP下载方式 (推荐，更快)
```bash
# 下载项目
curl -L -o GostUI.zip https://github.com/JianDNA/GostUI/archive/refs/heads/main.zip
unzip GostUI.zip
mv GostUI-main GostUI
cd GostUI

# 修复脚本权限
./scripts/tools/fix-script-permissions.sh

# 运行部署脚本
./deploy.sh
```

#### 🔧 Git克隆方式 (适合开发者)
```bash
# 克隆项目
git clone https://github.com/JianDNA/GostUI.git
cd GostUI

# 修复脚本权限（推荐）
./scripts/tools/fix-script-permissions.sh

# 运行部署脚本
./deploy.sh
```

## 🔄 更新部署

### 智能更新 (推荐)
```bash
# 一键智能更新 - 完全傻瓜式操作
cd ~/GostUI
./scripts/tools/fix-script-permissions.sh  # 确保脚本权限正确
./smart-update.sh
```

**智能更新特点：**
- ✅ **无Git冲突** - 使用临时目录下载最新代码
- ✅ **数据保护** - 自动备份和恢复所有用户数据
- ✅ **配置修复** - 自动检查并修复系统配置缺失
- ✅ **服务管理** - 自动停止、更新、重启服务
- ✅ **完整验证** - 自动验证更新结果
- ✅ **智能下载** - 优先使用ZIP下载，速度更快，体积更小

### 重新部署
```bash
# 完全重新部署 (会清除所有数据)
rm -rf ~/gost-management
./deploy.sh
```

## 📝 开发流程

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
# 使用便捷脚本
chmod +x commit-with-build.sh
./commit-with-build.sh

# 或手动构建
cd frontend
npm run build
cd ..
git add .
git commit -m "feat: 新功能"
git push
```

## 🔧 管理命令

### PM2服务管理
```bash
pm2 status                   # 查看状态
pm2 restart gost-management  # 重启服务
pm2 logs gost-management     # 查看日志
pm2 stop gost-management     # 停止服务
```

### 系统管理
```bash
./smart-update.sh            # 智能更新 (推荐)
```

## 🛠️ 故障排除

### 构建失败
```bash
# 使用预构建模式
cd frontend && npm run build
git add frontend/dist/ && git commit -m "build: 更新构建"
git push
./deploy.sh  # 选择预构建模式
```

### 服务异常
```bash
pm2 logs gost-management     # 查看日志
pm2 restart gost-management # 重启服务
```

### 脚本权限问题
```bash
# 如果遇到 "Permission denied" 或 "No such file or directory"
cd ~/GostUI
./scripts/tools/fix-script-permissions.sh

# 或手动修复
find scripts -name "*.sh" -type f -exec chmod +x {} \;
chmod +x *.sh
```

### 端口占用
```bash
lsof -ti:3000 | xargs kill -9
```

### 数据恢复
```bash
# 查找备份
ls /tmp/gost-*backup*

# 恢复数据库
cp /tmp/gost-backup-*/database.sqlite ~/gost-management/backend/database/
pm2 restart gost-management
```

## 📊 部署结果

### 成功标志
- ✅ PM2服务运行正常
- ✅ 端口3000可访问
- ✅ 前端页面加载正常
- ✅ API接口响应正常

### 访问信息
- 🌐 **地址**: http://localhost:3000
- 🔐 **账号**: admin
- 🔑 **密码**: admin123

## 💡 最佳实践

1. **生产环境使用预构建模式**
2. **定期备份数据库**
3. **监控服务状态**
4. **及时更新系统**
5. **修改默认密码**

## 📞 获取帮助

- 查看日志: `pm2 logs gost-management`
- 提交问题: GitHub Issues
- 项目文档: README.md
