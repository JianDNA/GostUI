# 部署指南

## 📋 脚本说明

### 核心脚本
- **`deploy.sh`** - 主部署脚本，支持初始化和更新部署
- **`update.sh`** - 专用更新脚本，保留用户数据
- **`commit-with-build.sh`** - 本地构建和提交脚本
- **`test-deployment.sh`** - 部署验证脚本

## 🚀 部署流程

### 1. 初始部署
```bash
git clone https://github.com/JianDNA/GostUI.git
cd GostUI
chmod +x deploy.sh
./deploy.sh
```

### 2. 选择构建模式
- **预构建模式** (推荐): 使用Git中的构建文件，速度快
- **服务器构建模式**: 在服务器上构建，需要更多资源

### 3. 部署类型
- **初始化部署**: 全新安装，创建默认用户
- **更新部署**: 保留用户数据，更新代码

## 🔄 更新流程

### 日常更新
```bash
cd ~/gost-management
./update.sh
```

### 强制重新部署
```bash
rm -rf ~/gost-management
./deploy.sh
```

## 📝 开发流程

### 本地开发
```bash
# 修改代码后构建
cd frontend
npm run build

# 提交代码和构建文件
cd ..
git add .
git commit -m "feat: 新功能"
git push
```

### 使用便捷脚本
```bash
./commit-with-build.sh
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
./update.sh                  # 更新系统
./test-deployment.sh         # 测试部署
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

- 运行测试: `./test-deployment.sh`
- 查看日志: `pm2 logs gost-management`
- 提交问题: GitHub Issues
