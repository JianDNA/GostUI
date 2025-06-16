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

## 🚀 快速部署

### 环境要求
- **操作系统**: Linux (Ubuntu/CentOS/Debian)
- **Node.js**: >= 14.0.0
- **内存**: >= 2GB (推荐4GB)
- **磁盘**: >= 1GB 可用空间

### 一键部署 (推荐)

```bash
# 克隆项目
git clone https://github.com/JianDNA/GostUI.git
cd GostUI

# 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

部署脚本会自动：
- ✅ 检查环境依赖
- ✅ 安装必要工具
- ✅ 选择构建模式
- ✅ 安装依赖包
- ✅ 构建前端项目
- ✅ 配置数据库
- ✅ 启动服务

### 部署完成后
- 🌐 **访问地址**: http://localhost:3000
- 🔐 **默认账号**: admin
- 🔑 **默认密码**: admin123

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

### 服务器更新
```bash
# 更新现有部署 (保留用户数据)
cd ~/gost-management
./update.sh

# 重新初始化部署 (清除所有数据)
rm -rf ~/gost-management
./deploy.sh
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
./update.sh                  # 更新系统
./test-deployment.sh         # 测试部署
```

## 📁 项目结构

```
GostUI/
├── deploy.sh                # 主部署脚本
├── update.sh               # 更新脚本
├── commit-with-build.sh    # 构建提交脚本
├── test-deployment.sh      # 部署测试脚本
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
└── docs/                  # 文档
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

1. **前端构建失败**
   ```bash
   # 使用预构建模式
   cd frontend && npm run build
   git add frontend/dist/ && git commit -m "build: 更新构建产物"
   git push
   ./deploy.sh  # 选择预构建模式
   ```

2. **内存不足**
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

3. **端口占用**
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

4. **服务异常**
   ```bash
   pm2 logs gost-management
   pm2 restart gost-management
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

1. **修改默认密码** - 首次登录后立即修改
2. **定期备份** - 设置自动备份策略
3. **更新系统** - 定期运行更新脚本
4. **监控日志** - 检查异常访问

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
- 🧪 运行测试: `./test-deployment.sh`
- 📚 查看文档: `QUICK_START.md`
- 🐛 提交问题: [GitHub Issues](https://github.com/JianDNA/GostUI/issues)

---

**💡 提示**: 首次部署建议使用一键部署脚本，它会自动处理所有复杂的配置和依赖问题。
