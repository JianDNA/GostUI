# 🚀 GOST代理管理系统

一个基于Vue.js + Node.js的现代化GOST代理管理系统，提供直观的Web界面来管理GOST代理服务。

## ✨ 主要功能

- 🎯 **用户管理**: 多用户支持，角色权限控制
- 🔀 **规则管理**: 端口转发规则的增删改查
- 📊 **流量监控**: 实时流量统计和图表展示
- ⚙️ **系统配置**: 性能模式、同步设置等
- 🔄 **自动同步**: GOST配置自动同步和热加载
- 💾 **数据持久化**: SQLite数据库存储
- 🌐 **现代界面**: 基于Element Plus的响应式UI

## 🚀 一键部署

### 方法1：超简单部署（推荐）

```bash
# 下载并执行一键部署脚本
wget -O quick-deploy.sh https://raw.githubusercontent.com/JianDNA/GostUI/main/quick-deploy.sh
sudo bash quick-deploy.sh
```

### 方法2：手动部署

```bash
# 1. 下载部署脚本
wget https://raw.githubusercontent.com/JianDNA/GostUI/main/server-deploy-from-git.sh

# 2. 执行部署
chmod +x server-deploy-from-git.sh
sudo ./server-deploy-from-git.sh
```

## 📋 系统要求

- **操作系统**: Linux (Ubuntu/Debian/CentOS)
- **Node.js**: 14.0+ (脚本会自动安装)
- **内存**: 最少512MB
- **磁盘**: 最少1GB可用空间

## 🌐 访问系统

部署完成后：

- **访问地址**: `http://服务器IP:3000`
- **默认账号**: `admin`
- **默认密码**: `admin123`

## 📊 管理命令

```bash
# 查看服务状态
pm2 list

# 查看日志
pm2 logs gost-management

# 重启服务
pm2 restart gost-management

# 更新系统
/opt/gost-management/update.sh
```

## 🔧 故障排除

### 前端页面卡在加载状态

如果部署后访问页面一直显示"正在加载 Gost 管理系统..."，请运行以下命令：

```bash
# 诊断问题
cd /opt/gost-management
./diagnose-deployment.sh

# 修复前端加载问题
./fix-frontend-loading.sh
```

### 常见问题解决

1. **前端文件缺失**
   ```bash
   cd /opt/gost-management
   ./fix-frontend-loading.sh
   ```

2. **服务未启动**
   ```bash
   cd /opt/gost-management/backend
   pm2 start ecosystem.config.js
   ```

3. **端口被占用**
   ```bash
   # 检查端口占用
   netstat -tlnp | grep :3000
   # 如果需要，杀死占用进程
   sudo kill -9 <PID>
   ```

4. **GOST二进制文件问题**
   ```bash
   # 检查GOST文件
   ls -la /opt/gost-management/backend/bin/gost
   # 设置执行权限
   chmod +x /opt/gost-management/backend/bin/gost
   ```

## 🔧 开发环境

### 后端开发

```bash
cd backend
npm install
npm run dev
```

### 前端开发

```bash
cd frontend
npm install
npm run dev
```

## 📁 项目结构

```
├── backend/                 # 后端代码
│   ├── app.js              # 主应用文件
│   ├── routes/             # API路由
│   ├── services/           # 业务服务
│   ├── models/             # 数据模型
│   ├── scripts/            # 工具脚本
│   └── config/             # 配置文件
├── frontend/               # 前端代码
│   ├── src/                # 源代码
│   ├── public/             # 静态资源
│   └── dist/               # 构建产物
└── server-deploy-from-git.sh # 部署脚本
```

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

---

**🎉 享受使用GOST管理系统！**
