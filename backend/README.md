# 后端开发

基于 Node.js + Express 构建的 API 服务和 Gost 集成。

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产模式
npm start

# 数据库迁移
npm run migrate
```

## 项目结构

```
backend/
├── app.js              # 应用入口
├── routes/             # API 路由
├── services/           # 业务逻辑
├── models/             # 数据模型
├── middleware/         # 中间件
├── config/             # 配置文件
├── database/           # 数据库文件
├── migrations/         # 数据库迁移
└── scripts/            # 工具脚本
```

## 核心功能

### API 路由
- `/api/auth/*` - 用户认证
- `/api/users/*` - 用户管理
- `/api/rules/*` - 规则管理
- `/api/gost/*` - Gost 服务管理
- `/api/traffic/*` - 流量统计

### 核心服务
- **GostService** - Gost 进程管理
- **GostConfigService** - 配置自动同步
- **TrafficService** - 流量统计
- **UserService** - 用户管理

## 开发工具

### 可用脚本
```bash
npm run dev          # 开发模式 (nodemon)
npm start            # 生产模式
npm run migrate      # 运行数据库迁移
npm test             # 运行测试
```

### 调试模式
```bash
# 启用详细日志
LOG_LEVEL=debug npm run dev

# 启用 SQL 日志
DB_LOGGING=true npm run dev
```

## 监控和日志

### 日志文件
- 应用日志: `logs/app.log`
- 错误日志: `logs/error.log`

### 性能监控
```bash
# 查看应用状态
pm2 status

# 查看实时日志
pm2 logs gost-management

# 监控系统资源
pm2 monit
```

## 故障排除

### 常见问题
```bash
# 端口被占用
lsof -i :3000

# 数据库锁定
rm database/database.sqlite-wal
rm database/database.sqlite-shm

# GOST可执行文件问题
./deploy.sh  # 重新下载GOST

# 依赖问题
rm -rf node_modules && npm install
```
