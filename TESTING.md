# 🧪 Gost 管理系统测试指南

本文档详细介绍了 Gost 管理系统的测试方法、测试工具和测试流程。

## 🚨 重要安全警告

### 🔒 生产环境安全限制

**⚠️ 所有测试脚本和测试功能都被严格限制在开发和测试环境中运行，禁止在生产环境中执行！**

#### 安全措施：
1. **环境检测**: 所有测试脚本都会自动检测运行环境
2. **自动阻止**: 在生产环境中运行测试脚本会立即终止并显示安全警告
3. **API 保护**: 生产环境中的敏感 API 需要特殊授权令牌
4. **审计日志**: 所有尝试在生产环境中运行测试的行为都会被记录

#### 被保护的功能：
- ❌ 测试脚本执行 (`check-gost-integration.js`, `test-gost-config.js`, `create-test-data.js`)
- ❌ 测试数据生成和清理
- ❌ 配置对比 API (需要特殊授权)
- ❌ 手动同步 API (需要特殊授权)
- ❌ 批量数据操作

#### 如果需要在生产环境中执行特殊操作：
1. 设置环境变量 `PRODUCTION_AUTH_TOKEN=your-secure-token`
2. 在 API 请求中添加头部 `X-Production-Auth: your-secure-token`
3. 所有操作都会被审计记录

**🛡️ 这些安全措施确保生产环境的数据安全，防止意外的数据丢失或服务中断。**

## 📋 测试概述

### 测试范围
- ✅ **Gost 配置自动同步系统**
- ✅ **用户管理和权限控制**
- ✅ **转发规则管理**
- ✅ **数据库操作和模型关联**
- ✅ **API 接口功能**
- ✅ **前端界面交互**
- ✅ **系统集成测试**

### 测试类型
- **单元测试**: 测试单个组件和函数
- **集成测试**: 测试系统各部分的集成
- **功能测试**: 测试完整的业务功能
- **性能测试**: 测试系统性能和响应时间
- **兼容性测试**: 测试与原有系统的兼容性

## 🛠️ 测试工具

### 自动化测试脚本

#### 1. 系统集成检查脚本
```bash
# 检查所有核心组件和配置
node backend/scripts/check-gost-integration.js
```

**功能说明**:
- 检查核心文件存在性
- 验证目录结构完整性
- 测试配置文件格式
- 验证数据库连接
- 检查模型关联关系
- 验证服务方法完整性

**预期结果**:
```
✅ 成功项目: 26
⚠️  警告项目: 0
❌ 错误项目: 0
🎉 所有检查通过！Gost 集成配置正确。
```

#### 2. Gost 配置服务测试脚本
```bash
# 测试配置生成和同步功能
node backend/test-gost-config.js
```

**功能说明**:
- 测试配置生成功能
- 验证配置哈希计算
- 测试配置保存和读取
- 验证配置比较逻辑
- 测试手动同步功能
- 检查统计信息获取

**预期结果**:
```
✅ 所有测试通过！Gost 配置服务工作正常。
```

### 手动测试工具

#### 1. API 测试工具
推荐使用 Postman 或 curl 进行 API 测试：

```bash
# 测试配置生成 API
curl -X GET http://localhost:3000/api/gost-config/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 测试手动同步 API
curl -X POST http://localhost:3000/api/gost-config/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 测试配置统计 API
curl -X GET http://localhost:3000/api/gost-config/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 2. 前端测试
访问以下页面进行功能测试：
- 主页面: `http://localhost:8080`
- 用户管理: `http://localhost:8080/admin`
- 转发规则: `http://localhost:8080/rules`
- Gost 配置: `http://localhost:8080/gost-config`

## 🔍 详细测试流程

### 1. 环境准备测试

#### 步骤 1: 系统依赖检查
```bash
# 检查 Node.js 版本
node --version  # 应该 >= 16.0.0

# 检查 npm 版本
npm --version   # 应该 >= 8.0.0

# 检查项目依赖
cd backend && npm list
cd frontend && npm list
```

#### 步骤 2: 数据库初始化测试
```bash
cd backend
npm run migrate  # 运行数据库迁移
```

**验证点**:
- 数据库文件创建成功
- 所有表结构正确创建
- 默认管理员用户创建成功

### 2. 后端服务测试

#### 步骤 1: 启动后端服务
```bash
cd backend
npm start
```

**验证点**:
- 服务在端口 3000 启动成功
- 数据库连接正常
- Gost 服务初始化成功
- 配置同步服务自动启动

#### 步骤 2: API 功能测试

**认证测试**:
```bash
# 登录测试
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**配置同步测试**:
```bash
# 获取配置统计
curl -X GET http://localhost:3000/api/gost-config/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# 手动同步
curl -X POST http://localhost:3000/api/gost-config/sync \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. 前端界面测试

#### 步骤 1: 启动前端服务
```bash
cd frontend
npm run serve
```

#### 步骤 2: 功能测试清单

**登录功能**:
- [ ] 使用正确凭据登录成功
- [ ] 使用错误凭据登录失败
- [ ] 登录状态保持
- [ ] 自动登出功能

**用户管理功能**:
- [ ] 查看用户列表
- [ ] 创建新用户
- [ ] 编辑用户信息
- [ ] 设置用户端口范围
- [ ] 删除用户

**转发规则管理**:
- [ ] 查看规则列表
- [ ] 创建新规则
- [ ] 编辑现有规则
- [ ] 启用/禁用规则
- [ ] 删除规则
- [ ] 批量操作

**Gost 配置管理**:
- [ ] 查看配置状态
- [ ] 手动同步配置
- [ ] 启动/停止自动同步
- [ ] 查看配置对比
- [ ] 查看同步日志

### 4. 配置同步系统测试

#### 测试场景 1: 自动配置生成
1. 创建一个新用户并设置端口范围
2. 为该用户创建转发规则
3. 检查生成的配置是否包含新规则
4. 验证端口权限检查是否正确

#### 测试场景 2: 定时同步
1. 启动自动同步
2. 修改数据库中的规则
3. 等待 25 秒观察是否自动同步
4. 检查 Gost 配置文件是否更新

#### 测试场景 3: 实时触发同步
1. 通过 Web 界面创建新规则
2. 观察是否立即触发同步
3. 检查配置文件是否立即更新
4. 验证 Gost 服务是否重启

#### 测试场景 4: 配置比较
1. 手动修改配置文件
2. 通过 API 获取配置对比
3. 验证差异检测是否正确
4. 执行同步操作恢复配置

### 5. 性能测试

#### 配置生成性能测试
```bash
# 创建大量测试数据
node backend/scripts/create-test-data.js

# 测试配置生成时间
time node backend/test-gost-config.js
```

#### 并发访问测试
使用 Apache Bench 或类似工具测试并发访问：
```bash
# 测试 API 并发性能
ab -n 1000 -c 10 http://localhost:3000/api/gost-config/stats
```

### 6. 兼容性测试

#### 原有功能兼容性
1. 验证原有的 Gost 服务管理功能
2. 检查原有的配置文件读写逻辑
3. 确认原有的 API 接口仍然可用
4. 验证数据库迁移的向后兼容性

#### 配置文件兼容性
1. 使用原有的配置文件启动系统
2. 验证新系统能正确读取旧配置
3. 检查配置更新后的格式兼容性

## 📊 测试报告模板

### 测试执行记录
```
测试日期: YYYY-MM-DD
测试人员: [姓名]
测试环境: [开发/测试/生产]
系统版本: [版本号]

测试结果:
✅ 系统集成检查: 通过 (26/26)
✅ 配置服务测试: 通过 (8/8)
✅ API 功能测试: 通过 (15/15)
✅ 前端界面测试: 通过 (20/20)
✅ 配置同步测试: 通过 (4/4)
✅ 性能测试: 通过
✅ 兼容性测试: 通过

总体评估: 系统功能正常，可以投入使用
```

### 问题记录模板
```
问题编号: #001
问题描述: [详细描述]
重现步骤:
1. [步骤1]
2. [步骤2]
3. [步骤3]

预期结果: [预期的结果]
实际结果: [实际的结果]
严重程度: [高/中/低]
状态: [待修复/已修复/已验证]
```

## 🚨 常见问题排查

### 问题 1: 配置同步失败
**症状**: 手动同步返回错误
**排查步骤**:
1. 检查数据库连接
2. 验证用户权限
3. 查看服务日志
4. 检查 Gost 服务状态

### 问题 2: 自动同步不工作
**症状**: 定时同步没有触发
**排查步骤**:
1. 检查自动同步是否启动
2. 查看定时器状态
3. 检查系统资源使用
4. 验证配置变化检测

### 问题 3: 前端页面无法访问
**症状**: Gost 配置页面显示 404
**排查步骤**:
1. 检查路由配置
2. 验证用户权限
3. 检查前端构建
4. 查看浏览器控制台错误

## 📈 持续集成测试

### GitHub Actions 配置示例
```yaml
name: Test Gost Management System

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

    - name: Run integration tests
      run: node backend/scripts/check-gost-integration.js

    - name: Run config service tests
      run: node backend/test-gost-config.js
```

## 🎯 测试最佳实践

1. **自动化优先**: 尽可能使用自动化测试脚本
2. **测试隔离**: 每个测试应该独立运行
3. **数据清理**: 测试后清理测试数据
4. **文档更新**: 及时更新测试文档
5. **持续监控**: 定期运行完整测试套件

---

**注意**: 在生产环境中运行测试前，请确保备份重要数据并在测试环境中充分验证。
