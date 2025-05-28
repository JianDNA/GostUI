# 🔒 生产环境安全部署指南

本文档详细说明了在生产环境中部署 Gost 管理系统时必须遵循的安全措施和最佳实践。

## 🚨 关键安全警告

### ⚠️ 测试功能安全限制

**所有测试相关的脚本和功能都被严格限制在开发和测试环境中，禁止在生产环境中执行！**

这包括但不限于：
- 测试脚本 (`check-gost-integration.js`, `test-gost-config.js`, `create-test-data.js`)
- 测试数据生成和清理功能
- 某些调试和诊断 API
- 批量数据操作功能

## 🛡️ 内置安全机制

### 1. 自动环境检测
系统会自动检测以下生产环境指标：
- `NODE_ENV=production`
- `PM2_HOME` 环境变量
- `PRODUCTION` 环境变量
- `PROD` 环境变量
- `DATABASE_URL` 环境变量（生产数据库连接）

### 2. 测试脚本保护
所有测试脚本都包含以下安全检查：
```javascript
// 🔒 生产环境安全检查
function checkProductionSafety() {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    console.error('🚨 安全警告: 此测试脚本禁止在生产环境中运行！');
    process.exit(1);
  }
}
```

### 3. API 端点保护
敏感的 API 端点在生产环境中需要特殊授权：
- `/api/gost-config/sync` - 手动配置同步
- `/api/gost-config/compare` - 配置对比
- `/api/gost-config/auto-sync/start` - 启动自动同步
- `/api/gost-config/auto-sync/stop` - 停止自动同步

## 🔐 生产环境配置

### 1. 必需的环境变量

```bash
# 基本配置
NODE_ENV=production
PORT=3000

# 数据库配置
DATABASE_URL=your-production-database-url

# JWT 安全配置
JWT_SECRET=your-very-secure-jwt-secret-key

# 生产环境特殊授权令牌（可选，用于紧急操作）
PRODUCTION_AUTH_TOKEN=your-super-secure-production-token

# Gost 配置
GOST_BINARY_PATH=/path/to/gost/binary
GOST_CONFIG_PATH=/path/to/gost/config.json
```

### 2. 安全头配置
系统会自动添加以下安全头：
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
```

## 📋 部署前安全检查清单

### ✅ 环境配置检查
- [ ] 设置 `NODE_ENV=production`
- [ ] 配置强密码的 `JWT_SECRET`
- [ ] 设置生产数据库连接
- [ ] 配置 HTTPS/TLS 证书
- [ ] 设置防火墙规则

### ✅ 文件权限检查
- [ ] 确保配置文件权限正确 (600 或 644)
- [ ] 确保日志目录可写
- [ ] 确保 Gost 二进制文件可执行
- [ ] 移除或保护测试文件

### ✅ 网络安全检查
- [ ] 配置反向代理 (Nginx/Apache)
- [ ] 启用 HTTPS
- [ ] 配置 CORS 策略
- [ ] 限制 API 访问频率
- [ ] 配置 IP 白名单（如需要）

### ✅ 监控和日志
- [ ] 配置应用监控
- [ ] 设置错误日志收集
- [ ] 配置安全事件告警
- [ ] 设置性能监控

## 🚫 生产环境中被禁用的功能

### 1. 测试脚本
```bash
# 这些命令在生产环境中会被阻止
node backend/scripts/check-gost-integration.js  # ❌ 被阻止
node backend/test-gost-config.js                # ❌ 被阻止
node backend/scripts/create-test-data.js        # ❌ 被阻止
```

### 2. 调试功能
- 详细错误信息输出
- 数据库查询日志
- 调试端点访问

### 3. 批量操作
- 批量用户创建/删除
- 批量规则操作
- 测试数据生成

## 🔧 紧急操作授权

如果在生产环境中需要执行特殊操作（如手动配置同步），需要：

### 1. 设置授权令牌
```bash
export PRODUCTION_AUTH_TOKEN="your-super-secure-token"
```

### 2. 在 API 请求中包含授权头
```bash
curl -X POST https://your-domain.com/api/gost-config/sync \
  -H "Authorization: Bearer your-jwt-token" \
  -H "X-Production-Auth: your-super-secure-token"
```

### 3. 所有操作都会被审计记录
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "event": "AUTHORIZED_RESTRICTED_ACCESS",
  "path": "/api/gost-config/sync",
  "method": "POST",
  "ip": "192.168.1.100"
}
```

## 📊 安全监控

### 1. 自动监控项目
- 未授权的 API 访问尝试
- 测试脚本执行尝试
- 配置文件修改
- 异常的用户行为

### 2. 告警触发条件
- 连续失败的登录尝试
- 在生产环境中运行测试脚本
- 未授权的配置修改尝试
- 异常的 API 调用模式

### 3. 日志记录
所有安全相关事件都会被记录：
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "event": "TEST_SCRIPT_BLOCKED",
  "scriptName": "check-gost-integration.js",
  "reason": "Production environment detected",
  "environment": "production"
}
```

## 🔄 安全更新流程

### 1. 定期安全检查
- 每月检查依赖包安全漏洞
- 每季度审查访问日志
- 每半年更新安全配置

### 2. 应急响应
- 发现安全问题时立即隔离
- 分析影响范围
- 应用安全补丁
- 更新安全策略

### 3. 备份和恢复
- 定期备份配置文件
- 测试恢复流程
- 保持备份的安全性

## 📞 安全联系信息

如果发现安全问题或需要紧急支持：

1. **立即停止可疑操作**
2. **记录相关信息**（时间、操作、错误信息）
3. **联系系统管理员**
4. **查看安全日志**

## 🎯 最佳实践总结

1. **永远不要在生产环境中运行测试脚本**
2. **定期更新安全配置和密钥**
3. **监控所有安全相关事件**
4. **保持系统和依赖包的最新状态**
5. **定期进行安全审计**
6. **建立完善的备份和恢复机制**
7. **培训团队成员安全意识**

---

**🔒 记住：安全是一个持续的过程，不是一次性的设置。定期审查和更新安全措施是保护生产环境的关键。**
