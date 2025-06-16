# 🚀 GOST管理系统 - Git部署指南

## 📋 **第1步：本地准备Git仓库**

### 1.1 初始化Git
```bash
cd /home/y/vmshare/gost/GostUI

# 初始化Git仓库
git init

# 添加所有文件
git add .

# 查看将要提交的文件
git status

# 提交
git commit -m "Initial commit: GOST管理系统"
```

### 1.2 创建GitHub仓库
1. 登录 [GitHub](https://github.com)
2. 点击右上角 "+" → "New repository"
3. 仓库名：`gost-management`
4. 设置为 **Private**（私有仓库）
5. **不要**勾选 "Add a README file"
6. **不要**勾选 "Add .gitignore"
7. 点击 "Create repository"

### 1.3 推送到GitHub
```bash
# 添加远程仓库（替换为你的实际仓库地址）
git remote add origin https://github.com/你的用户名/gost-management.git

# 推送到远程仓库
git push -u origin main
```

## 🚀 **第2步：服务器部署**

### 2.1 上传部署脚本
```bash
# 在本地执行（上传脚本到服务器）
scp server-deploy-from-git.sh root@你的服务器IP:/root/
```

### 2.2 修改配置并部署
```bash
# 登录服务器
ssh root@你的服务器IP

# 修改部署脚本中的Git仓库地址
nano server-deploy-from-git.sh

# 找到这一行：
# GIT_REPO="https://github.com/your-username/gost-management.git"
# 替换为你的实际仓库地址：
# GIT_REPO="https://github.com/你的用户名/gost-management.git"

# 保存并退出（Ctrl+X, Y, Enter）

# 执行部署
chmod +x server-deploy-from-git.sh
./server-deploy-from-git.sh
```

## 🎯 **预期部署输出**

```bash
🚀 开始从Git部署GOST管理系统...
🔍 检查环境...
✅ 环境检查完成
📥 部署代码...
📦 安装依赖...
🔨 构建前端...
✅ 前端构建完成并集成到后端
⚙️ 配置应用...
🚀 启动服务...
✅ 服务启动成功！

🌐 访问地址: http://localhost:3000
🔐 默认账号: admin / admin123
✅ 前端页面访问正常
✅ API接口访问正常

🎉 Git部署完成！
```

## 📊 **部署后管理**

### 查看服务状态
```bash
pm2 list
pm2 logs gost-management
pm2 monit
```

### 更新代码
```bash
# 本地提交新代码后
git add .
git commit -m "更新说明"
git push origin main

# 在服务器上更新
/opt/gost-management/update.sh
```

## 🌐 **访问系统**

- **地址**: `http://你的服务器IP:3000`
- **账号**: `admin`
- **密码**: `admin123`

## 🆘 **常见问题**

### 1. Git克隆失败
```bash
# 检查网络
ping github.com

# 如果是私有仓库，需要配置访问权限
# 方法1：使用Personal Access Token
# 方法2：配置SSH密钥
```

### 2. 前端构建失败
```bash
# 检查Node.js版本
node -v  # 需要 >= 16.0.0

# 手动构建
cd /opt/gost-management/frontend
npm install
npm run build
```

### 3. 服务启动失败
```bash
# 查看详细日志
pm2 logs gost-management --lines 50

# 检查端口占用
netstat -tlnp | grep 3000
```

### 4. 无法访问
```bash
# 检查防火墙
sudo ufw status
sudo ufw allow 3000

# 检查服务状态
pm2 list
curl http://localhost:3000
```

## 🔒 **安全建议**

1. **使用私有仓库**: 避免代码泄露
2. **配置SSH密钥**: 避免每次输入密码
3. **定期更新**: 保持系统最新
4. **备份数据**: 定期备份数据库

## 📱 **移动端访问**

系统支持移动端访问，直接用手机浏览器打开：
`http://你的服务器IP:3000`

---

**🎉 现在你有了完整的Git部署方案！**

**优势**:
- ✅ 版本控制完整
- ✅ 自动构建前端
- ✅ 一键更新部署
- ✅ 标准化流程
