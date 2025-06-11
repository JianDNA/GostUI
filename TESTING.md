# 🧪 测试指南

本文档介绍 Gost 管理系统的测试方法和工具，帮助您验证系统功能和性能。

## 🚨 安全提醒

**⚠️ 重要: 测试功能仅在开发和测试环境中可用，生产环境已自动禁用！**

### 安全机制
- 🔒 **环境检测**: 自动识别运行环境并限制测试功能
- 🛡️ **API 保护**: 生产环境中的敏感操作需要特殊授权
- 📝 **操作审计**: 记录所有测试和管理操作
- 🚫 **数据保护**: 防止意外的数据丢失或服务中断

### 生产环境授权
如需在生产环境执行特殊操作：
1. 设置环境变量: `PRODUCTION_AUTH_TOKEN=your-secure-token`
2. API 请求添加头部: `X-Production-Auth: your-secure-token`
3. 所有操作都会被审计记录

## 📋 测试概述

### 测试范围
- ✅ **系统集成**: 验证所有组件正确集成
- ✅ **配置同步**: 测试 Gost 配置自动生成和同步
- ✅ **用户管理**: 验证用户权限和端口范围管理
- ✅ **规则管理**: 测试转发规则的创建和管理
- ✅ **流量统计**: 验证流量监控和统计功能
- ✅ **API 接口**: 测试所有后端 API 功能
- ✅ **前端界面**: 验证用户界面交互和数据展示

### 测试类型
- **功能测试**: 验证核心业务功能
- **集成测试**: 测试系统各部分的协作
- **性能测试**: 验证系统在不同负载下的表现
- **安全测试**: 验证权限控制和安全机制

## 🛠️ 快速测试

### 系统健康检查
```bash
# 全面系统检查
node backend/scripts/check-gost-integration.js

# 配置同步测试
node backend/test-gost-config.js

# 系统诊断
node backend/diagnose-system.js
```

### 性能基准测试
```bash
# 温和压力测试 (推荐)
node backend/debug-gentle-test.js

# 流媒体压力测试
node backend/test-streaming-pressure.js

# 极限测试 (1TB)
node backend/test-real-1tb.js
```

### API 功能测试
```bash
# 测试健康检查
curl http://localhost:3000/api/health

# 测试配置生成
curl -X GET http://localhost:3000/api/gost-config/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 测试手动同步
curl -X POST http://localhost:3000/api/gost-config/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 前端功能测试
访问以下页面验证功能：
- **仪表盘**: `http://localhost:8080/` - 查看系统概览
- **用户管理**: `http://localhost:8080/users` - 测试用户管理功能
- **规则管理**: `http://localhost:8080/rules` - 测试规则创建和编辑
- **流量统计**: `http://localhost:8080/traffic` - 验证流量监控
- **配置管理**: `http://localhost:8080/gost-config` - 测试配置同步
- **测试面板**: `http://localhost:8080/test-panel` - API 测试工具

## 🔍 测试流程

### 1. 环境验证
```bash
# 检查系统要求
node --version  # >= 16.0.0
npm --version   # >= 8.0.0

# 验证项目依赖
cd backend && npm list
cd frontend && npm list

# 初始化数据库
cd backend && npm run migrate
```

### 2. 服务启动测试
```bash
# 启动后端服务
cd backend && npm start

# 启动前端服务 (新终端)
cd frontend && npm run serve

# 验证服务状态
curl http://localhost:3000/api/health
curl http://localhost:8080
```

### 3. 功能测试清单

#### 认证功能
- [ ] 管理员登录 (admin/admin123)
- [ ] 普通用户登录
- [ ] 登录状态保持
- [ ] 自动登出

#### 用户管理
- [ ] 查看用户列表
- [ ] 创建/编辑/删除用户
- [ ] 设置端口范围
- [ ] 权限控制

#### 规则管理
- [ ] 查看规则列表
- [ ] 创建/编辑/删除规则
- [ ] 启用/禁用规则
- [ ] 批量操作

#### 配置同步
- [ ] 查看配置状态
- [ ] 手动同步配置
- [ ] 自动同步功能
- [ ] 配置对比

#### 流量统计
- [ ] 实时流量监控
- [ ] 历史数据查看
- [ ] 图表展示
- [ ] 配额管理

### 4. 配置同步测试

#### 场景 1: 自动配置生成
1. 创建用户并设置端口范围
2. 为用户创建转发规则
3. 验证配置自动生成
4. 检查端口权限验证

#### 场景 2: 实时同步
1. 通过界面创建新规则
2. 观察配置立即同步
3. 验证 Gost 服务重启
4. 检查配置文件更新

#### 场景 3: 定时同步
1. 启动自动同步
2. 修改数据库规则
3. 等待 25 秒观察同步
4. 验证配置更新

### 5. 性能测试

#### 基准测试
```bash
# 温和压力测试 (推荐新用户)
node backend/debug-gentle-test.js

# 流媒体场景测试
node backend/test-streaming-pressure.js

# 极限性能测试
node backend/test-real-1tb.js
```

#### 并发测试
```bash
# API 并发性能测试
ab -n 1000 -c 10 http://localhost:3000/api/gost-config/stats

# 流量统计并发测试
ab -n 500 -c 5 http://localhost:3000/api/traffic/stats
```

## 📊 测试报告

### 测试记录模板
```
测试日期: YYYY-MM-DD
测试环境: [开发/测试]
系统版本: [版本号]

测试结果:
✅ 系统集成检查: 通过 (26/26)
✅ 配置服务测试: 通过 (8/8)
✅ API 功能测试: 通过
✅ 前端界面测试: 通过
✅ 配置同步测试: 通过
✅ 性能基准测试: 通过

总体评估: 系统功能正常
```

### 问题记录
```
问题编号: #001
问题描述: [详细描述]
重现步骤: [步骤列表]
预期结果: [预期行为]
实际结果: [实际行为]
严重程度: [高/中/低]
状态: [待修复/已修复]
```

## 🚨 故障排除

### 常见问题

#### 配置同步失败
```bash
# 检查服务状态
curl http://localhost:3000/api/gost/status

# 查看日志
tail -f backend/logs/app.log

# 重启服务
pm2 restart gost-manager
```

#### 前端无法访问
```bash
# 检查前端服务
curl http://localhost:8080

# 检查 API 连接
curl http://localhost:3000/api/health

# 查看浏览器控制台错误
```

#### 性能测试失败
```bash
# 检查系统资源
htop
df -h

# 清理测试数据
node backend/reset-all-stats.js

# 重新运行测试
node backend/debug-gentle-test.js
```

## 🎯 测试最佳实践

### 测试策略
1. **渐进测试**: 从基础功能开始，逐步增加复杂度
2. **环境隔离**: 在专用测试环境中运行测试
3. **数据清理**: 测试完成后清理测试数据
4. **文档记录**: 记录测试结果和发现的问题

### 自动化测试
```bash
# 创建测试脚本
#!/bin/bash
echo "开始自动化测试..."

# 系统检查
node backend/scripts/check-gost-integration.js

# 配置测试
node backend/test-gost-config.js

# 性能测试
node backend/debug-gentle-test.js

echo "测试完成！"
```

### 持续集成
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'
    - name: Install dependencies
      run: |
        cd backend && npm install
        cd ../frontend && npm install
    - name: Run tests
      run: |
        node backend/scripts/check-gost-integration.js
        node backend/test-gost-config.js
```

## 📚 相关文档

- **[backend/TESTING.md](backend/TESTING.md)** - 后端测试详细指南
- **[frontend/README_API_TESTING.md](frontend/README_API_TESTING.md)** - 前端 API 测试
- **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** - 完整文档导航

---

**💡 提示**: 建议在每次部署前运行完整的测试套件，确保系统稳定性。
