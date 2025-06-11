# 🧪 前端 API 测试指南

前端项目集成了强大的 API 测试功能，支持多种测试模式和流量测试工具。

## 🚀 快速开始

### 管理员测试面板
管理员登录后，在侧边栏可以看到 **🛠️ 测试面板** 菜单项，提供可视化的测试界面。

### 开发者控制台工具
在开发环境下，打开浏览器控制台，使用全局测试工具：

```javascript
// 查看当前 API 配置
window.apiDevTools.showConfig();

// 启用流量测试模式
window.apiDevTools.enableTrafficTest();

// 执行流量测试
window.apiDevTools.testTrafficEndpoint(5); // 5MB 测试

// 切换回直连模式
window.apiDevTools.disableTrafficTest();
```

## 🔧 API 模式

| 模式 | 地址 | 用途 | 特点 |
|------|------|------|------|
| **direct** | `http://localhost:3000/api` | 开发调试 | 直连后端，不经过代理 |
| **gost** | `http://localhost:6443/api` | 流量测试 | 通过 GOST 代理，可统计流量 |
| **production** | `/api` | 生产环境 | 相对路径，适合部署 |

### 模式切换
```javascript
// 方法一：环境变量
VUE_APP_API_MODE=gost npm run serve

// 方法二：本地存储
localStorage.setItem('api_mode', 'gost');

// 方法三：开发工具
window.apiDevTools.enableTrafficTest();
```

## 🧪 流量测试

### 测试接口
| 接口 | 数据大小 | 用途 |
|------|----------|------|
| `/test/traffic-1mb` | 1MB | 小流量测试 |
| `/test/traffic-5mb` | 5MB | 中等流量测试 |
| `/test/traffic-10mb` | 10MB | 大流量测试 |
| `/test/traffic-custom?size=X` | X MB | 自定义测试 |

### 测试流程
1. **准备**: 切换到 GOST 模式
2. **执行**: 运行流量测试
3. **观察**: 查看仪表盘统计变化
4. **验证**: 检查流量统计页面数据
5. **恢复**: 切换回直连模式

### 测试示例
```javascript
// 完整测试流程
async function runTrafficTest() {
  // 1. 启用流量测试
  window.apiDevTools.enableTrafficTest();
  location.reload();

  // 2. 执行测试
  await window.apiDevTools.testTrafficEndpoint(1);
  await window.apiDevTools.testTrafficEndpoint(5);
  await window.apiDevTools.testTrafficEndpoint(10);

  // 3. 恢复设置
  window.apiDevTools.disableTrafficTest();
  location.reload();
}
```

## 📊 测试面板功能

### API 配置管理
- 实时显示当前 API 模式和配置
- 一键切换不同模式
- 自动提示刷新页面

### 流量测试工具
- 预设测试场景按钮
- 自定义流量大小测试
- 测试结果记录和导出

### 系统状态检查
- 后端服务状态
- GOST 服务状态
- 数据库连接状态

## 🔍 故障排除

### 常见问题
```javascript
// GOST 连接失败
// 检查 GOST 服务状态
fetch('http://localhost:3000/api/gost/status')
  .then(r => r.json())
  .then(data => console.log('GOST 状态:', data));

// 流量统计不更新
// 等待几秒后刷新页面

// 模式切换不生效
// 执行页面刷新
location.reload();
```

### 调试技巧
1. **网络请求**: 查看浏览器 Network 标签页
2. **控制台日志**: 查找 🔧、🧪、📊 开头的日志
3. **状态检查**: 使用测试面板的系统状态功能

## 🛡️ 安全说明

- ✅ 测试功能仅对管理员用户可见
- ✅ 开发工具仅在开发环境启用
- ✅ 生产环境自动禁用测试功能
- ✅ 测试端口不对外暴露

## 🎯 最佳实践

1. **日常开发**: 使用 direct 模式
2. **流量测试**: 使用 gost 模式
3. **生产部署**: 使用 production 模式
4. **渐进测试**: 从小流量开始测试
5. **数据清理**: 测试后清理测试数据

---

**📖 详细文档**: 查看 `docs/API_TESTING_GUIDE.md` 获取完整的技术文档。
