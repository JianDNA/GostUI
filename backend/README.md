# 🔧 后端开发指南

Gost 管理系统后端基于 Node.js + Express 构建，提供完整的 API 服务和 Gost 集成功能。

## 🚀 快速开始

### 环境要求
- Node.js 16+
- npm 8+
- SQLite 3 (自动安装)

### 安装和启动
```bash
# 安装依赖
npm install

# 初始化数据库
npm run migrate

# 开发模式启动
npm run dev

# 生产模式启动
npm start
```

## 📁 项目结构

```
backend/
├── app.js              # 应用入口
├── config/             # 配置文件
├── middleware/         # 中间件
├── models/             # 数据模型
├── routes/             # API 路由
├── services/           # 业务逻辑
├── migrations/         # 数据库迁移
├── scripts/            # 官方工具脚本
│   └── archive/        # 已归档测试脚本
└── docs/               # 技术文档
```

## 🔌 核心功能

### API 路由
- `/api/auth/*` - 用户认证
- `/api/users/*` - 用户管理
- `/api/rules/*` - 规则管理
- `/api/user-forward-rules/*` - 用户转发规则
- `/api/gost/*` - Gost 服务管理
- `/api/gost-config/*` - 配置同步
- `/api/traffic/*` - 流量统计
- `/api/quota/*` - 配额管理

### 核心服务
- **GostService** - Gost 进程管理
- **GostConfigService** - 配置自动同步
- **TrafficService** - 流量统计
- **UserService** - 用户管理
- **QuotaManagementService** - 配额管理

## 🧪 测试和调试

### 脚本组织

项目中的脚本按照用途和重要性进行了组织：

1. **核心系统脚本** - app.js, package.json 等
2. **官方脚本** - scripts/目录下的系统维护脚本
3. **有价值的诊断与测试脚本** - 根目录下保留的重要测试脚本
4. **归档脚本** - 移动到scripts/archive/目录的次要脚本

详细说明请参阅 [SCRIPTS_README.md](SCRIPTS_README.md)

### 系统诊断
```bash
# 系统健康检查
node scripts/check-gost-integration.js

# 配置同步测试
node test-cache-sync-system.js

# 系统诊断
node diagnose-system.js
```

### 性能测试
```bash
# 温和压力测试
node debug-gentle-test.js

# 流媒体压力测试
node test-streaming-pressure.js

# 极限测试 (1TB)
node test-real-1tb.js
```

### 数据管理
```bash
# 创建测试用户
node create-test-users.js

# 重置统计数据
node reset-all-stats.js

# 检查数据库状态
node check-table-structure.js
```

## 📊 监控和日志

### 日志文件
- 应用日志: `logs/app.log`
- 错误日志: `logs/error.log`
- 流量日志: `logs/traffic-debug.log`

### 性能监控
```bash
# 查看应用状态
pm2 status

# 查看实时日志
pm2 logs gost-manager

# 监控系统资源
pm2 monit
```

## 🔧 配置说明

### 环境变量 (.env)
```bash
# 基础配置
NODE_ENV=development
PORT=3000
JWT_SECRET=your-secret-key

# 数据库
DATABASE_PATH=./database/database.sqlite

# Gost 配置
GOST_BINARY_PATH=./bin/gost
GOST_CONFIG_PATH=./config/gost-config.json

# 日志配置
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

### 数据库配置
```javascript
// config/database.js
module.exports = {
  dialect: 'sqlite',
  storage: process.env.DATABASE_PATH || './database/database.sqlite',
  logging: process.env.NODE_ENV === 'development' ? console.log : false
};
```

## 🛠️ 开发工具

### 可用脚本
```bash
npm run dev          # 开发模式 (nodemon)
npm start            # 生产模式
npm run migrate      # 运行数据库迁移
npm run test         # 运行测试
npm run check-env    # 检查环境配置
```

### 脚本维护
```bash
# 基础清理 - 删除废弃脚本
node cleanup-scripts.js

# 增强清理 - 整理和归档脚本
node enhanced-cleanup.js
```

### 调试模式
```bash
# 启用详细日志
LOG_LEVEL=debug npm run dev

# 启用 SQL 日志
DB_LOGGING=true npm run dev
```

## 📚 技术文档

### 架构设计
- **[TRAFFIC_ARCHITECTURE_DESIGN.md](docs/TRAFFIC_ARCHITECTURE_DESIGN.md)** - 流量架构设计
- **[PERFORMANCE_ANALYSIS.md](docs/PERFORMANCE_ANALYSIS.md)** - 性能分析报告
- **[THROTTLE_SYNC_OPTIMIZATION.md](docs/THROTTLE_SYNC_OPTIMIZATION.md)** - 同步优化方案

### 测试指南
- **[TESTING.md](TESTING.md)** - 后端测试指南
- **[SCRIPTS_README.md](SCRIPTS_README.md)** - 脚本组织说明

## 🔒 安全注意事项

1. **生产环境**: 测试脚本在生产环境中自动禁用
2. **敏感配置**: JWT_SECRET 等敏感信息不要提交到版本控制
3. **API 保护**: 生产环境中的敏感 API 需要特殊授权
4. **日志安全**: 避免在日志中记录敏感信息

## 🚨 故障排除

### 常见问题
```bash
# 端口被占用
lsof -i :3000

# 数据库锁定
rm database/database.sqlite-wal
rm database/database.sqlite-shm

# 权限问题
chmod +x bin/gost

# 依赖问题
rm -rf node_modules && npm install
```

### 获取帮助
1. 查看应用日志
2. 运行系统诊断脚本
3. 检查环境配置
4. 参考主项目文档

---

**💡 提示**: 开发时建议使用 `npm run dev` 启动，支持热重载和详细日志。
