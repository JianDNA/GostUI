# Gost 管理系统

一个基于 Vue 3 + Node.js 的 Gost 代理服务管理平台，提供可视化的界面来管理和监控 Gost 代理服务。

## 📋 项目概述

本项目是一个完整的 Gost 代理服务管理解决方案，包含前端管理界面和后端 API 服务，支持：

- 🚀 Gost 服务的启动、停止、重启
- 🔄 **Gost 配置自动同步系统** (新增)
- 📊 实时流量监控和统计
- 🔧 代理规则的可视化管理
- 👥 用户权限和端口范围管理
- 📈 数据可视化图表
- 🔐 JWT 身份认证
- ⚡ 实时配置更新和服务重启

## 🏗️ 项目架构

```
gost/
├── backend/                 # 后端服务 (Node.js + Express)
│   ├── assets/             # Gost 二进制文件
│   ├── bin/                # 可执行文件
│   ├── config/             # 配置文件
│   ├── database/           # 数据库文件
│   ├── middleware/         # 中间件
│   ├── migrations/         # 数据库迁移
│   ├── models/             # 数据模型
│   ├── routes/             # API 路由
│   ├── services/           # 业务逻辑服务
│   └── app.js              # 应用入口
├── frontend/               # 前端应用 (Vue 3 + Element Plus)
│   ├── src/
│   │   ├── components/     # 组件
│   │   ├── router/         # 路由配置
│   │   ├── store/          # 状态管理
│   │   ├── utils/          # 工具函数
│   │   └── views/          # 页面组件
│   └── package.json
├── scripts/                # 部署和管理脚本
└── README.md
```

## 🛠️ 技术栈

### 后端技术栈
- **Node.js** - 运行时环境
- **Express.js** - Web 框架
- **Sequelize** - ORM 数据库操作
- **SQLite** - 数据库
- **JWT** - 身份认证
- **bcrypt** - 密码加密
- **PM2** - 进程管理

### 前端技术栈
- **Vue 3** - 前端框架
- **Element Plus** - UI 组件库
- **Vue Router** - 路由管理
- **Vuex** - 状态管理
- **Axios** - HTTP 客户端
- **ECharts** - 数据可视化
- **Chart.js** - 图表库

## 📦 安装部署

### 环境要求
- Node.js >= 16.0.0
- npm >= 8.0.0
- PM2 (生产环境)

### 快速开始

1. **克隆项目**
```bash
git clone <repository-url>
cd gost
```

2. **安装依赖**
```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

3. **配置环境**
```bash
# 复制并编辑配置文件
cp backend/config/config.example.js backend/config/config.js
# 根据需要修改配置
```

4. **初始化数据库**
```bash
cd backend
npm run migrate
```

5. **开发环境启动**
```bash
# 启动后端服务 (端口 3000)
cd backend
npm run dev

# 启动前端服务 (端口 8080)
cd frontend
npm run serve
```

6. **生产环境部署**
```bash
# 使用提供的脚本一键部署
./scripts/start.bat  # Windows
./scripts/start.sh   # Linux/macOS
```

## 🔧 配置说明

### 后端配置 (backend/config/config.js)
```javascript
module.exports = {
  server: {
    port: 3000,                    // 服务端口
    env: 'development'             // 环境
  },
  jwt: {
    secret: 'your-secret-key',     // JWT 密钥
    expiresIn: '24h'               // Token 过期时间
  },
  database: {
    dialect: 'sqlite',             // 数据库类型
    storage: './database/database.sqlite'
  },
  gost: {
    configPath: './config/gost-config.json',  // Gost 配置文件
    binaryPath: './bin/gost'                  // Gost 可执行文件
  }
};
```

### 前端配置 (frontend/vue.config.js)
```javascript
module.exports = {
  devServer: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',  // 后端服务地址
        changeOrigin: true
      }
    }
  }
};
```

## 📊 数据库设计

### 主要数据表

#### Users (用户表)
- id: 主键
- username: 用户名
- email: 邮箱
- password: 密码 (bcrypt 加密)
- role: 角色 (admin/user)
- isActive: 是否激活
- createdAt/updatedAt: 时间戳

#### ForwardRule (转发规则表)
- id: 主键
- name: 规则名称
- sourcePort: 源端口
- targetHost: 目标主机
- targetPort: 目标端口
- protocol: 协议 (tcp/udp/tls)
- isActive: 是否启用
- userId: 用户ID (外键)

#### TrafficLog (流量日志表)
- id: 主键
- ruleId: 规则ID (外键)
- bytesIn: 入站流量
- bytesOut: 出站流量
- connections: 连接数
- timestamp: 时间戳

## 🔌 API 接口

### 认证接口
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/profile` - 获取用户信息

### Gost 服务管理
- `GET /api/gost/status` - 获取服务状态
- `POST /api/gost/start` - 启动服务
- `POST /api/gost/stop` - 停止服务
- `POST /api/gost/restart` - 重启服务
- `GET /api/gost/config` - 获取配置
- `PUT /api/gost/config` - 更新配置

### Gost 配置自动同步 (新增)
- `GET /api/gost-config/generate` - 生成当前配置
- `GET /api/gost-config/current` - 获取持久化配置
- `POST /api/gost-config/sync` - 手动同步配置
- `GET /api/gost-config/stats` - 获取配置统计
- `POST /api/gost-config/auto-sync/start` - 启动自动同步
- `POST /api/gost-config/auto-sync/stop` - 停止自动同步
- `GET /api/gost-config/compare` - 配置对比

### 用户转发规则管理 (新增)
- `GET /api/user-forward-rules` - 获取用户转发规则列表
- `POST /api/user-forward-rules` - 创建转发规则
- `PUT /api/user-forward-rules/:id` - 更新转发规则
- `DELETE /api/user-forward-rules/:id` - 删除转发规则
- `POST /api/user-forward-rules/:id/toggle` - 启用/禁用规则
- `DELETE /api/user-forward-rules/batch` - 批量删除规则

### 规则管理 (旧版)
- `GET /api/rules` - 获取规则列表
- `POST /api/rules` - 创建规则
- `PUT /api/rules/:id` - 更新规则
- `DELETE /api/rules/:id` - 删除规则
- `POST /api/rules/:id/toggle` - 启用/禁用规则

### 流量统计
- `GET /api/traffic/stats` - 获取流量统计
- `GET /api/traffic/logs` - 获取流量日志
- `GET /api/traffic/chart` - 获取图表数据

### 用户管理 (管理员)
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户

## 🎨 前端页面

### 主要页面组件

#### Dashboard (仪表盘)
- 服务状态概览
- 实时流量监控
- 规则统计图表
- 系统资源使用情况

#### RuleManagement (规则管理)
- 规则列表展示
- 添加/编辑规则表单
- 规则启用/禁用操作
- 批量操作功能

#### TrafficStats (流量统计)
- 流量趋势图表
- 规则流量排行
- 历史数据查询
- 数据导出功能

#### UserManagement (用户管理)
- 用户列表管理
- 权限分配
- 用户状态管理
- 端口范围分配

#### GostConfig (Gost 配置管理) - 新增
- 配置状态监控
- 手动同步操作
- 配置对比显示
- 同步日志查看
- 自动同步控制

#### Login (登录页面)
- 用户登录表单
- 记住密码功能
- 登录状态保持

### 组件结构
```
src/
├── components/
│   └── layout/
│       ├── Layout.vue      # 主布局组件
│       ├── Navbar.vue      # 导航栏
│       └── Sidebar.vue     # 侧边栏
├── views/
│   ├── Dashboard.vue       # 仪表盘
│   ├── Login.vue          # 登录页
│   ├── RuleManagement.vue # 规则管理
│   ├── TrafficStats.vue   # 流量统计
│   └── UserManagement.vue # 用户管理
└── store/modules/
    ├── user.js            # 用户状态
    ├── gost.js            # Gost 服务状态
    ├── rules.js           # 规则状态
    └── traffic.js         # 流量数据状态
```


## 🚀 核心功能

### Gost 配置自动同步系统 ⭐ (新增核心功能)

#### 🔄 自动配置生成
- **智能配置生成**: 根据数据库中有效用户的转发规则自动生成 Gost 配置
- **协议支持**: 支持 TCP、UDP、TLS 协议的端口转发
- **排序优化**: 按协议和端口排序，确保配置的一致性和可比较性
- **权限验证**: 自动验证用户端口权限，只包含用户允许范围内的端口

#### ⏰ 定时同步机制
- **智能对比**: 每 25 秒自动检查数据库配置与当前 Gost 配置的差异
- **高效比较**: 使用 SHA256 哈希值进行高效的配置比较
- **按需更新**: 只有在配置发生变化时才更新 Gost 服务
- **自动重启**: 配置更新后自动重启 Gost 服务以应用新配置

#### ⚡ 实时触发同步
- **即时响应**: 用户创建、更新、删除转发规则时立即触发配置同步
- **端口变更**: 用户端口范围变更时自动同步配置
- **用户管理**: 用户删除时自动清理相关配置
- **批量操作**: 批量操作后统一触发同步

#### 🎛️ Web 管理界面
- **状态监控**: 实时显示配置状态和统计信息
- **手动同步**: 支持手动触发配置同步
- **配置对比**: 可视化显示当前配置与生成配置的差异
- **同步日志**: 详细的同步操作日志记录
- **控制面板**: 启动/停止自动同步功能

### Gost 服务管理
- **服务控制**: 支持启动、停止、重启 Gost 服务
- **配置管理**: 可视化编辑 Gost 配置文件
- **状态监控**: 实时显示服务运行状态和进程信息
- **日志查看**: 查看 Gost 服务运行日志

### 代理规则管理
- **规则创建**: 支持 TCP/UDP/TLS 协议的端口转发规则
- **规则编辑**: 可视化编辑现有规则
- **批量操作**: 支持批量启用/禁用规则
- **规则验证**: 自动验证规则配置的有效性

### 流量监控
- **实时监控**: 实时显示各规则的流量使用情况
- **历史统计**: 查看历史流量数据和趋势
- **图表展示**: 使用 ECharts 展示流量数据
- **数据导出**: 支持导出流量统计报告

### 用户权限管理
- **角色管理**: 支持管理员和普通用户角色
- **权限控制**: 基于角色的访问控制
- **用户管理**: 管理员可以管理用户账户
- **安全认证**: JWT Token 身份验证

## 📱 界面预览

### 仪表盘
- 服务状态卡片显示
- 流量统计图表
- 最近活动日志
- 快速操作按钮

### 规则管理页面
- 规则列表表格
- 搜索和过滤功能
- 添加/编辑规则对话框
- 批量操作工具栏

### 流量统计页面
- 时间范围选择器
- 流量趋势折线图
- 规则流量饼图
- 详细数据表格

## 🔒 安全特性

### 身份认证
- JWT Token 认证
- 密码 bcrypt 加密
- 登录状态保持
- 自动登出机制

### 权限控制
- 基于角色的访问控制 (RBAC)
- API 接口权限验证
- 前端路由守卫
- 敏感操作二次确认

### 数据安全
- SQL 注入防护
- XSS 攻击防护
- CSRF 保护
- 输入数据验证

## 🛡️ 系统监控

### 服务监控
- Gost 进程状态监控
- 系统资源使用监控
- 服务健康检查
- 异常告警机制

### 日志管理
- 应用日志记录
- 错误日志追踪
- 操作审计日志
- 日志轮转管理

## 📈 性能优化

### 前端优化
- 组件懒加载
- 路由懒加载
- 图片懒加载
- 代码分割

### 后端优化
- 数据库连接池
- API 响应缓存
- 静态资源压缩
- 请求限流

## 🔧 开发工具

### 代码质量
- ESLint 代码检查
- Prettier 代码格式化
- Git Hooks 预提交检查
- 单元测试覆盖

### 调试工具
- Vue DevTools
- Node.js 调试器
- 网络请求监控
- 性能分析工具

## 📚 部署方案

### 开发环境
`ash
# 后端开发服务器
cd backend && npm run dev

# 前端开发服务器
cd frontend && npm run serve
`

### 生产环境
`ash
# 构建前端
cd frontend && npm run build

# 启动生产服务器
cd backend && npm start

# 使用 PM2 管理进程
pm2 start ecosystem.config.js
`

### Docker 部署
`dockerfile
# 多阶段构建
FROM node:16-alpine AS builder
# ... 构建步骤

FROM node:16-alpine AS production
# ... 生产环境配置
`

## 🧪 测试指南

### 🚨 生产环境安全警告

**⚠️ 重要: 所有测试脚本和测试功能都被严格限制在开发和测试环境中运行！**

- 🔒 **自动环境检测**: 测试脚本会自动检测运行环境并阻止在生产环境中执行
- 🛡️ **API 保护**: 生产环境中的敏感 API 需要特殊授权令牌
- 📝 **审计日志**: 所有尝试在生产环境中运行测试的行为都会被记录
- 🚫 **严格限制**: 防止意外的数据丢失或服务中断

### 快速测试 (仅限开发/测试环境)
```bash
# 系统集成检查
node backend/scripts/check-gost-integration.js

# Gost 配置服务测试
node backend/test-gost-config.js

# 创建测试数据（性能测试）
node backend/scripts/create-test-data.js

# 清理测试数据
node backend/scripts/create-test-data.js --cleanup
```

**注意**: 如果在生产环境中运行上述命令，会看到如下安全警告：
```
🚨 安全警告: 此测试脚本禁止在生产环境中运行！
   当前环境: production
   请在开发或测试环境中运行此脚本。
```

### 测试覆盖范围
- ✅ **系统集成测试**: 验证所有组件正确集成
- ✅ **配置同步测试**: 测试自动配置生成和同步
- ✅ **API 功能测试**: 验证所有 API 接口
- ✅ **前端界面测试**: 测试用户界面交互
- ✅ **性能测试**: 大数据量下的系统性能
- ✅ **兼容性测试**: 与原有系统的兼容性

### 详细测试文档
查看 [TESTING.md](TESTING.md) 获取完整的测试指南和最佳实践。

## 🚀 生产环境部署

### Linux 服务器部署
查看 [DEPLOYMENT.md](DEPLOYMENT.md) 获取详细的 Linux 服务器部署指南，包括：

- 📋 **系统要求和环境准备**
- 🛠️ **自动化安装脚本**
- ⚙️ **配置文件和环境变量**
- 🔐 **SSL/HTTPS 配置**
- 🛡️ **安全加固措施**
- 📊 **监控和日志管理**
- 🔄 **自动化部署和更新**

### 安全部署指南
查看 [PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md) 了解生产环境安全最佳实践。

## 🤝 贡献指南

### 开发流程
1. Fork 项目仓库
2. 创建功能分支
3. 提交代码更改
4. 运行测试套件
5. 创建 Pull Request
6. 代码审查和合并

### 代码规范
- 遵循 ESLint 配置
- 使用 Prettier 格式化
- 编写单元测试
- 更新文档说明
- 运行集成测试

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 联系方式

- 项目维护者: [Jonathan]
- 邮箱: [your.email@example.com]
- 项目地址: [GitHub Repository URL]

## 🙏 致谢

感谢以下开源项目的支持：
- [Gost](https://github.com/ginuerzh/gost) - 强大的代理工具
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Element Plus](https://element-plus.org/) - Vue 3 组件库
- [Express.js](https://expressjs.com/) - Node.js Web 框架
