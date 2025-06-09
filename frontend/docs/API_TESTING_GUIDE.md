# API 测试指南

## 📋 概述

本文档介绍了前端项目中的 API 测试功能，包括不同的 API 模式、流量测试工具和开发调试功能。

## 🔧 API 配置模式

### 支持的模式

#### 1. **直连模式 (direct)**
- **地址**: `http://localhost:3000/api`
- **用途**: 开发调试
- **特点**: 直接连接后端服务，不经过任何代理
- **适用场景**: 日常开发、功能测试

#### 2. **GOST 代理模式 (gost)**
- **地址**: `http://localhost:6443/api`
- **用途**: 流量统计测试
- **特点**: 所有请求通过 GOST 端口 6443 代理
- **适用场景**: 验证流量统计功能、测试 GOST 配置

#### 3. **生产模式 (production)**
- **地址**: `/api`
- **用途**: 生产部署
- **特点**: 使用相对路径，适合生产环境
- **适用场景**: 正式部署环境

### 模式切换方法

#### 方法一：环境变量
```bash
# 设置环境变量
VUE_APP_API_MODE=gost npm run serve
```

#### 方法二：本地存储
```javascript
// 在浏览器控制台中执行
localStorage.setItem('api_mode', 'gost');
// 刷新页面生效
```

#### 方法三：开发工具函数
```javascript
// 启用流量测试模式
window.apiDevTools.enableTrafficTest();

// 切换回直连模式
window.apiDevTools.disableTrafficTest();
```

## 🧪 流量测试功能

### 测试接口列表

| 接口路径 | 功能 | 数据大小 | 用途 |
|---------|------|----------|------|
| `/test/status` | 测试状态检查 | - | 验证测试接口可用性 |
| `/test/help` | 帮助信息 | - | 获取测试接口说明 |
| `/test/traffic-1mb` | 1MB 流量测试 | 1,048,576 字节 | 小流量测试 |
| `/test/traffic-5mb` | 5MB 流量测试 | 5,242,880 字节 | 中等流量测试 |
| `/test/traffic-10mb` | 10MB 流量测试 | 10,485,760 字节 | 大流量测试 |
| `/test/traffic-custom?size=X` | 自定义流量测试 | X MB | 自定义大小测试 |

### 推荐测试场景

#### 1. **小流量测试**
```javascript
// 测试 1MB 流量
window.apiDevTools.testTrafficEndpoint(1);
```
- **目的**: 验证基础流量统计功能
- **预期**: 生成精确的 1MB 数据
- **观察**: 仪表盘流量统计增加

#### 2. **中等流量测试**
```javascript
// 测试 5MB 流量
window.apiDevTools.testTrafficEndpoint(5);
```
- **目的**: 测试中等流量处理能力
- **预期**: 生成精确的 5MB 数据
- **观察**: 流量趋势图表变化

#### 3. **大流量测试**
```javascript
// 测试 10MB 流量
window.apiDevTools.testTrafficEndpoint(10);
```
- **目的**: 验证大流量统计准确性
- **预期**: 生成精确的 10MB 数据
- **观察**: 用户流量配额变化

#### 4. **自定义流量测试**
```javascript
// 测试 2.5MB 流量
window.apiDevTools.testTrafficEndpoint(2.5);
```
- **目的**: 测试任意大小流量
- **预期**: 生成指定大小的数据
- **观察**: 流量统计页面数据

## 🛠️ 开发工具函数

### 全局对象

在开发环境下，以下对象会自动暴露到全局：

```javascript
// API 开发工具
window.apiDevTools

// 当前 API 配置信息
window.apiConfig
```

### 可用方法

#### 1. **查看当前配置**
```javascript
window.apiDevTools.showConfig();
// 输出当前 API 模式、地址、描述等信息
```

#### 2. **启用流量测试**
```javascript
window.apiDevTools.enableTrafficTest();
// 切换到 GOST 代理模式，启用流量统计测试
```

#### 3. **禁用流量测试**
```javascript
window.apiDevTools.disableTrafficTest();
// 切换回直连模式，停止流量测试
```

#### 4. **测试流量接口**
```javascript
// 测试指定大小的流量
window.apiDevTools.testTrafficEndpoint(size);

// 示例
window.apiDevTools.testTrafficEndpoint(1);    // 1MB
window.apiDevTools.testTrafficEndpoint(5);    // 5MB
window.apiDevTools.testTrafficEndpoint(2.5);  // 2.5MB
```

## 📊 流量测试工作流程

### 完整测试流程

1. **准备阶段**
   ```javascript
   // 1. 查看当前配置
   window.apiDevTools.showConfig();
   
   // 2. 启用流量测试模式
   window.apiDevTools.enableTrafficTest();
   
   // 3. 刷新页面
   location.reload();
   ```

2. **执行测试**
   ```javascript
   // 4. 执行不同大小的流量测试
   await window.apiDevTools.testTrafficEndpoint(1);
   await window.apiDevTools.testTrafficEndpoint(5);
   await window.apiDevTools.testTrafficEndpoint(10);
   ```

3. **观察结果**
   - 打开仪表盘页面，观察流量统计变化
   - 查看流量统计页面，验证详细数据
   - 检查用户管理页面，确认流量配额更新

4. **恢复设置**
   ```javascript
   // 5. 测试完成后切换回直连模式
   window.apiDevTools.disableTrafficTest();
   location.reload();
   ```

## 🔍 故障排除

### 常见问题

#### 1. **GOST 代理连接失败**
- **现象**: 切换到 GOST 模式后 API 请求失败
- **原因**: GOST 服务未启动或端口 6443 不可用
- **解决**: 检查 GOST 服务状态，确保端口 6443 正常工作

#### 2. **流量统计不更新**
- **现象**: 执行流量测试后统计数据没有变化
- **原因**: 可能是缓存问题或统计延迟
- **解决**: 等待几秒后刷新页面，或检查后端日志

#### 3. **模式切换不生效**
- **现象**: 切换 API 模式后仍使用旧配置
- **原因**: 需要刷新页面才能应用新配置
- **解决**: 执行 `location.reload()` 刷新页面

### 调试技巧

#### 1. **查看网络请求**
```javascript
// 在浏览器开发者工具的 Network 标签页中
// 观察请求的实际地址是否正确
```

#### 2. **检查控制台日志**
```javascript
// API 配置变化会在控制台输出日志
// 查找以 🔧、🧪、📊 开头的日志信息
```

#### 3. **验证 GOST 状态**
```javascript
// 检查 GOST 服务状态
fetch('http://localhost:3000/api/gost/status')
  .then(r => r.json())
  .then(data => console.log('GOST 状态:', data));
```

## 🚀 最佳实践

### 开发建议

1. **日常开发**: 使用直连模式 (direct)
2. **流量测试**: 使用 GOST 模式 (gost)
3. **生产部署**: 使用生产模式 (production)

### 测试建议

1. **渐进测试**: 从小流量开始，逐步增加到大流量
2. **多次测试**: 重复执行相同测试，验证一致性
3. **观察延迟**: 流量统计可能有几秒延迟，耐心等待
4. **清理数据**: 测试完成后可以清理测试数据

### 安全注意事项

1. **生产环境**: 测试功能仅在开发环境启用
2. **端口安全**: 确保测试端口不对外暴露
3. **数据清理**: 定期清理测试产生的流量数据

## 📝 更新日志

- **v1.0.0**: 初始版本，支持基础 API 模式切换
- **v1.1.0**: 添加流量测试功能
- **v1.2.0**: 增加开发工具函数
- **v1.3.0**: 完善错误处理和日志记录

---

**注意**: 本文档描述的测试功能仅在开发环境下可用，生产环境会自动禁用相关功能以确保安全性。
