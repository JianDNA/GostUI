# GOST管理系统部署指南

## 📋 部署模式说明

### 🔨 构建模式

#### 1. 预构建模式 (推荐)
- **优点**: 部署速度快，服务器资源消耗少
- **适用**: 生产环境，低配置服务器
- **流程**: 本地构建 → 提交到Git → 服务器使用预构建文件

#### 2. 服务器端构建模式
- **优点**: 始终使用最新代码构建
- **适用**: 开发环境，高配置服务器
- **流程**: 服务器拉取代码 → 安装依赖 → 构建前端

### 🚀 部署类型

#### 1. 初始化部署
- 全新安装系统
- 创建默认管理员账户
- 初始化数据库和配置

#### 2. 更新部署
- 保留用户数据和配置
- 更新代码和依赖
- 自动备份和恢复

## 📝 详细部署流程

### 步骤1: 本地准备 (可选但推荐)

```bash
# 在开发机器上构建前端
cd frontend
npm run build  # 或 yarn build

# 提交构建结果
cd ..
git add frontend/dist/
git commit -m "build: 更新前端构建产物"
git push

# 或使用便捷脚本
chmod +x commit-with-build.sh
./commit-with-build.sh
```

### 步骤2: 服务器部署

```bash
# 在服务器上克隆项目
git clone https://github.com/JianDNA/GostUI.git
cd GostUI

# 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

### 步骤3: 选择配置

部署脚本会询问：
1. **构建模式**: 预构建文件 vs 服务器端构建
2. **部署确认**: 显示部署信息并确认

### 步骤4: 验证部署

```bash
# 运行测试脚本
./test-deployment.sh

# 手动验证
curl http://localhost:3000
pm2 status
```

## 🔄 更新流程

### 日常更新

```bash
cd ~/gost-management
./update.sh
```

更新脚本会：
1. 自动备份用户数据
2. 拉取最新代码
3. 更新依赖
4. 恢复用户数据
5. 重启服务

### 强制重新部署

```bash
# 完全清理并重新部署
rm -rf ~/gost-management
./deploy.sh
```

⚠️ **注意**: 这会清除所有用户数据

## 📁 文件结构

```
GostUI/
├── deploy.sh              # 主部署脚本
├── update.sh              # 更新脚本
├── build-frontend.sh      # 本地构建脚本
├── test-deployment.sh     # 部署测试脚本
├── backend/               # 后端代码
│   ├── public/           # 前端文件部署位置
│   ├── database/         # 数据库文件
│   └── config/           # 配置文件
├── frontend/             # 前端源码
│   └── dist/            # 构建产物 (Git跟踪)
└── docs/                # 文档
```

## 🔧 配置说明

### 环境变量

```bash
# Node.js内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
```

### PM2配置

```javascript
// ecosystem.config.js
{
  name: 'gost-management',
  script: 'app.js',
  env: {
    NODE_ENV: 'production',
    PORT: 3000
  }
}
```

## 🛠️ 故障排除

### 常见问题

1. **前端构建失败**
   ```bash
   # 使用预构建模式
   cd frontend
   npm run build        # 本地构建
   cd ..
   git add frontend/dist/
   git commit -m "build: 更新构建产物"
   git push             # 推送到仓库
   ./deploy.sh          # 选择预构建模式
   ```

2. **内存不足**
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

3. **端口占用**
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

4. **PM2服务异常**
   ```bash
   pm2 logs gost-management
   pm2 restart gost-management
   ```

### 数据恢复

如果更新失败，可以从备份恢复：

```bash
# 查找备份目录
ls /tmp/gost-*backup*

# 恢复数据库
cp /tmp/gost-backup-*/database.sqlite ~/gost-management/backend/database/

# 重启服务
pm2 restart gost-management
```

## 📊 性能优化

### 服务器要求

- **最低配置**: 1GB RAM, 1 CPU核心
- **推荐配置**: 2GB RAM, 2 CPU核心
- **高负载**: 4GB RAM, 4 CPU核心

### 优化建议

1. **使用预构建模式** - 减少服务器资源消耗
2. **定期清理日志** - 避免磁盘空间不足
3. **监控内存使用** - 设置PM2内存限制
4. **备份策略** - 定期备份数据库

## 🔐 安全建议

1. **修改默认密码** - 首次登录后立即修改
2. **定期备份** - 设置自动备份策略
3. **更新系统** - 定期运行更新脚本
4. **监控日志** - 检查异常访问

## 📞 获取帮助

- 查看日志: `pm2 logs gost-management`
- 运行测试: `./test-deployment.sh`
- 查看文档: `QUICK_START.md`, `DEPLOY.md`
- GitHub Issues: 提交问题和建议
