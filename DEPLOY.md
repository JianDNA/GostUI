# GOST管理系统部署指南

## 🚀 一键部署

### 前置要求
- Linux系统 (Ubuntu/CentOS/Debian)
- Node.js >= 14.0.0
- npm 或 yarn
- PM2 (全局安装: `npm install -g pm2`)
- Git

### 快速部署
```bash
# 1. 克隆项目
git clone https://github.com/JianDNA/GostUI.git
cd GostUI

# 2. 运行一键部署脚本
chmod +x deploy.sh
./deploy.sh

# 3. 验证部署结果 (可选)
chmod +x test-deployment.sh
./test-deployment.sh
```

### 部署完成后
- 🌐 访问地址: http://localhost:3000
- 🔐 默认账号: admin
- 🔑 默认密码: admin123

## 📋 部署流程说明

### 自动执行的步骤：
1. **部署确认** - 显示部署信息并确认
2. **环境检查** - 检查Node.js、npm等必要工具，自动安装PM2
3. **代码部署** - 从Git仓库克隆最新代码
4. **Node.js内存设置** - 设置构建所需的内存限制
5. **后端依赖安装** - 安装后端npm依赖 (包括better-sqlite3)
6. **前端依赖安装** - 安装前端npm依赖和terser
7. **前端构建** - 使用Vite构建前端项目
8. **文件复制** - 将构建产物复制到后端public目录
9. **GOST配置** - 设置GOST二进制文件权限
10. **数据库初始化** - 创建SQLite数据库和默认用户
11. **PM2配置** - 创建生产环境PM2配置
12. **服务启动** - 启动PM2服务并测试访问
13. **最终验证** - 验证所有组件是否正常工作

## 🔧 管理命令

```bash
# 进入部署目录
cd ~/gost-management

# 更新系统
./update.sh

# PM2管理命令
pm2 restart gost-management  # 重启服务
pm2 stop gost-management     # 停止服务
pm2 logs gost-management     # 查看日志
pm2 status                   # 查看状态
```

## 🛠️ 手动部署 (如果自动部署失败)

```bash
# 1. 克隆代码
git clone https://github.com/JianDNA/GostUI.git
cd GostUI

# 2. 设置Node.js内存
export NODE_OPTIONS="--max-old-space-size=4096"

# 3. 安装后端依赖
cd backend
npm install

# 4. 安装前端依赖
cd ../frontend
npm install
npm install terser --save-dev

# 5. 构建前端
npm run build

# 6. 复制前端文件
mkdir -p ../backend/public
cp -r dist/* ../backend/public/

# 7. 启动后端
cd ../backend
npm start
```

## 🔍 故障排除

### 常见问题：

1. **端口3000被占用**
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

2. **前端构建失败 (缺少terser)**
   ```bash
   cd frontend
   npm install terser --save-dev
   ```

3. **SQLite编译失败**
   - 脚本会自动使用better-sqlite3
   - 如果仍有问题，检查系统是否有build-essential

4. **PM2服务启动失败**
   ```bash
   pm2 logs gost-management
   ```

5. **内存不足**
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

## 📁 目录结构

```
~/gost-management/
├── backend/           # 后端代码
│   ├── public/       # 前端构建产物
│   ├── database/     # SQLite数据库
│   ├── logs/         # 日志文件
│   └── ...
├── frontend/         # 前端源码
│   ├── dist/        # 构建产物
│   └── ...
└── update.sh        # 更新脚本
```

## 🔄 更新系统

```bash
cd ~/gost-management
./update.sh
```

更新脚本会自动：
- 拉取最新代码
- 安装新依赖
- 重新构建前端
- 重启服务

## 📞 技术支持

如果部署过程中遇到问题：
1. 检查系统日志: `pm2 logs gost-management`
2. 确认环境要求是否满足
3. 尝试手动部署流程
4. 查看GitHub Issues获取帮助
