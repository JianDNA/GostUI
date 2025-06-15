# 🚀 GOST 代理管理系统 - 发布准备指南

## 📋 概述

本指南将帮助你完成项目的发布前准备工作，包括项目清理、数据库初始化和发布包生成。

## 🎯 发布准备步骤

### 1. 完整发布准备（推荐）

执行完整的发布准备流程：

```bash
cd backend
node scripts/prepare-for-release.js
```

这将执行以下操作：
- ✅ 清理调试和测试文件
- ✅ 重新初始化数据库
- ✅ 检查项目依赖
- ✅ 验证构建
- ✅ 生成发布包

### 2. 分步执行

如果你想分步执行，可以使用以下命令：

#### 2.1 项目清理

```bash
cd backend
node scripts/clean-project-for-release.js
```

清理内容：
- 🧹 调试文件（*.log, debug-*, test-*）
- 🧹 临时文件（.DS_Store, *.tmp, *.bak）
- 🧹 开发配置（.env.development）
- 🧹 日志文件
- 📦 归档旧脚本文件

#### 2.2 数据库初始化

```bash
cd backend
node scripts/init-production-database.js
```

初始化内容：
- 💾 备份现有数据库
- 🗑️ 清空所有表
- 🏗️ 重新创建表结构
- 👤 创建默认管理员（admin/admin123）
- ⚙️ 初始化系统配置

### 3. 选择性执行

如果你想跳过某些步骤：

```bash
# 跳过项目清理
node scripts/prepare-for-release.js --skip-clean

# 跳过数据库初始化
node scripts/prepare-for-release.js --skip-db-init

# 跳过两者
node scripts/prepare-for-release.js --skip-clean --skip-db-init

# 详细输出
node scripts/prepare-for-release.js --verbose
```

## 📊 执行结果

### 清理报告

执行完成后，你会在以下位置找到报告：

- `backend/scripts/clean-report.json` - 项目清理报告
- `backend/backups/init_report_*.json` - 数据库初始化报告

### 数据库备份

原有数据库会自动备份到：
- `backend/backups/database_backup_*.sqlite`

### 发布包

发布包会生成在项目根目录的上级目录：
- `../gost-proxy-manager-v1.0.0-*/`

## 🎯 发布包内容

生成的发布包包含：

```
gost-proxy-manager-v1.0.0-*/
├── backend/                 # 后端代码
│   ├── app.js              # 主程序
│   ├── package.json        # 依赖配置
│   ├── database/           # 初始化数据库
│   └── ...
├── frontend/dist/          # 前端构建产物
├── start.sh               # 启动脚本
├── README.md              # 使用说明
└── RELEASE_INFO.json      # 发布信息
```

## 🚀 部署使用

### 1. 解压发布包

```bash
tar -xzf gost-proxy-manager-v1.0.0-*.tar.gz
cd gost-proxy-manager-v1.0.0-*
```

### 2. 安装依赖并启动

```bash
# 使用启动脚本（推荐）
./start.sh

# 或手动启动
cd backend
npm install --production
node app.js
```

### 3. 访问系统

- 🌐 Web 界面：http://localhost:3000
- 👤 默认账户：admin / admin123

## ⚠️ 重要提醒

### 数据库初始化警告

**⚠️ 数据库初始化会清空所有现有数据！**

- 现有数据会自动备份到 `backend/backups/` 目录
- 只保留默认管理员账户（admin/admin123）
- 所有用户数据、规则、流量统计都会被清空

### 安全建议

1. **修改默认密码**：首次登录后立即修改管理员密码
2. **备份数据库**：定期备份生产数据库
3. **检查权限**：确保数据库文件权限正确设置

## 🔧 故障排除

### 常见问题

1. **权限错误**
   ```bash
   chmod +x backend/scripts/*.js
   chmod +x start.sh
   ```

2. **依赖安装失败**
   ```bash
   cd backend
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **数据库初始化失败**
   ```bash
   # 检查数据库目录权限
   ls -la backend/database/
   
   # 手动创建目录
   mkdir -p backend/database
   ```

4. **端口占用**
   ```bash
   # 检查端口占用
   lsof -i :3000
   
   # 修改配置文件中的端口
   ```

## 📞 技术支持

如果在发布准备过程中遇到问题：

1. 检查 `backend/scripts/clean-report.json` 中的错误信息
2. 查看 `backend/backups/init_report_*.json` 中的初始化详情
3. 检查控制台输出的错误信息

## 📝 版本信息

- **系统版本**：1.0.0
- **Node.js 要求**：>= 14.0.0
- **数据库**：SQLite 3
- **默认端口**：3000

---

🎉 **恭喜！你的 GOST 代理管理系统已准备好发布！**
