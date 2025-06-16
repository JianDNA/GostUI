# 🎨 前端开发指南

Gost 管理系统前端基于 Vue 3 + Element Plus 构建，提供现代化的用户界面和丰富的交互功能。

## 🚀 快速开始

### 环境要求
- Node.js 16+
- npm 8+

### 安装和启动
```bash
# 安装依赖
npm install

# 开发模式启动
npm run serve

# 构建生产版本
npm run build

# 代码检查
npm run lint
```

## 📁 项目结构

```
frontend/
├── src/
│   ├── components/     # 公共组件
│   ├── views/          # 页面组件
│   ├── router/         # 路由配置
│   ├── store/          # 状态管理
│   ├── utils/          # 工具函数
│   ├── styles/         # 样式文件
│   └── config/         # 配置文件
├── public/             # 静态资源
└── docs/               # 文档
```

## 🎯 核心功能

### 主要页面
- **Dashboard** - 仪表盘和概览
- **UserManagement** - 用户管理
- **RuleManagement** - 规则管理
- **TrafficStats** - 流量统计
- **GostConfig** - Gost 配置管理
- **TestPanel** - API 测试面板 (管理员)

### 核心组件
- **Layout** - 主布局组件
- **Navbar** - 导航栏
- **Sidebar** - 侧边栏
- **Charts** - 图表组件
- **DataTable** - 数据表格

## 🔧 技术栈

### 核心框架
- **Vue 3** - 前端框架
- **Element Plus** - UI 组件库
- **Vue Router** - 路由管理
- **Vuex** - 状态管理

### 工具库
- **Axios** - HTTP 客户端
- **ECharts** - 数据可视化
- **Chart.js** - 图表库
- **Moment.js** - 时间处理

### 开发工具
- **Vue CLI** - 项目脚手架
- **ESLint** - 代码检查
- **Prettier** - 代码格式化

## 🧪 API 测试功能

### 测试模式
- **Direct 模式**: 直连后端 API
- **GOST 模式**: 通过 GOST 代理测试流量统计
- **Production 模式**: 生产环境配置

### 开发工具
```javascript
// 全局测试工具 (开发环境)
window.apiDevTools.showConfig();           // 查看配置
window.apiDevTools.enableTrafficTest();    // 启用流量测试
window.apiDevTools.testTrafficEndpoint(5); // 执行 5MB 测试
window.apiDevTools.disableTrafficTest();   // 禁用流量测试
```

### 测试面板
管理员用户可以访问专用的测试面板，提供：
- API 模式切换
- 流量测试工具
- 系统状态检查
- 开发工具快捷访问

## ⚙️ 配置说明

### 环境配置
```javascript
// vue.config.js
module.exports = {
  devServer: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
};
```

### API 配置
```javascript
// src/config/api.js
const API_MODES = {
  direct: 'http://localhost:3000/api',      // 开发调试
  gost: 'http://localhost:6443/api',        // 流量测试
  production: '/api'                        // 生产环境
};
```

### 路由配置
```javascript
// src/router/index.js
const routes = [
  { path: '/', component: Dashboard },
  { path: '/users', component: UserManagement, meta: { requiresAuth: true } },
  { path: '/rules', component: RuleManagement, meta: { requiresAuth: true } },
  { path: '/traffic', component: TrafficStats, meta: { requiresAuth: true } },
  { path: '/gost-config', component: GostConfig, meta: { requiresAdmin: true } },
  { path: '/test-panel', component: TestPanel, meta: { requiresAdmin: true } }
];
```

## 🎨 样式和主题

### Element Plus 主题
```scss
// src/styles/element-variables.scss
$--color-primary: #409EFF;
$--color-success: #67C23A;
$--color-warning: #E6A23C;
$--color-danger: #F56C6C;
```

### 自定义样式
```scss
// src/styles/global.scss
.dashboard-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

.data-table {
  .el-table__header {
    background-color: #f5f7fa;
  }
}
```

## 📊 状态管理

### Vuex Store 结构
```javascript
// src/store/index.js
export default new Vuex.Store({
  modules: {
    user,      // 用户状态
    gost,      // Gost 服务状态
    rules,     // 规则状态
    traffic,   // 流量数据状态
    config     // 配置状态
  }
});
```

### 状态使用示例
```javascript
// 在组件中使用
import { mapState, mapActions } from 'vuex';

export default {
  computed: {
    ...mapState('user', ['currentUser', 'isAuthenticated']),
    ...mapState('traffic', ['stats', 'chartData'])
  },
  methods: {
    ...mapActions('user', ['login', 'logout']),
    ...mapActions('traffic', ['fetchStats', 'updateStats'])
  }
};
```

## 🔍 开发调试

### 开发模式
```bash
# 启动开发服务器
npm run serve

# 启用详细日志
VUE_APP_LOG_LEVEL=debug npm run serve

# 启用 API 测试模式
VUE_APP_API_MODE=gost npm run serve
```

### 调试工具
- **Vue DevTools** - Vue 组件调试
- **浏览器开发者工具** - 网络请求和控制台
- **API 测试面板** - 内置的 API 测试工具

## 🚀 构建和部署

### 构建命令
```bash
# 生产构建
npm run build

# 构建分析
npm run build --report

# 预览构建结果
npm run preview
```

### 部署配置
```javascript
// vue.config.js
module.exports = {
  publicPath: process.env.NODE_ENV === 'production' ? '/gost-manager/' : '/',
  outputDir: 'dist',
  assetsDir: 'static',
  productionSourceMap: false
};
```

## 🛡️ 安全注意事项

1. **API 密钥**: 不要在前端代码中硬编码敏感信息
2. **路由守卫**: 确保敏感页面需要适当的权限
3. **XSS 防护**: 使用 v-html 时要谨慎
4. **CSRF 保护**: 配置适当的 CSRF 令牌

## 📚 相关文档

- **[README_API_TESTING.md](README_API_TESTING.md)** - API 测试功能指南

## 🔧 常用命令

```bash
# 开发
npm run serve              # 启动开发服务器
npm run build              # 构建生产版本
npm run lint               # 代码检查
npm run lint:fix           # 自动修复代码问题

# 测试
npm run test:unit          # 单元测试
npm run test:e2e           # 端到端测试
```

---

**💡 提示**: 开发时建议安装 Vue DevTools 浏览器扩展，以便更好地调试 Vue 组件和状态。
