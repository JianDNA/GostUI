# 脚本目录说明

本文档介绍了后端服务中的脚本组织结构与使用方法。

## 脚本组织结构

系统中的脚本按照用途和重要性分为几类：

### 1. 核心系统脚本

这些是系统运行所必需的核心脚本：

- `app.js` - 主应用入口点
- `package.json` - 项目配置
- `package-lock.json` - 依赖锁定

### 2. 官方脚本（/scripts目录）

scripts目录包含系统维护和部署所需的官方脚本：

- `init-gost.js` - 初始化GOST服务
- `install-gost.js` - 安装GOST二进制文件
- `check-environment.js` - 环境检查工具
- `init-db.js` - 数据库初始化
- `check-db.js` - 数据库检查
- 等其他维护脚本

### 3. 有价值的诊断与测试脚本

这些脚本对系统维护、诊断和测试特别有价值：

- `diagnose-system.js` - 系统诊断工具
- `check-migration-status.js` - 迁移状态检查
- `check-port-mapping.js` - 端口映射检查
- `fix-port-mapping.js` - 端口映射修复
- `create-test-users.js` - 创建测试用户
- `force-refresh-cache.js` - 强制刷新缓存
- `debug-observer-simple.js` - 简单观察器测试
- `test-observer-simple.js` - 观察器测试
- `debug-observer-detailed.js` - 详细观察器调试
- `test-streaming-pressure.js` - 流媒体压力测试
- `test-real-1tb.js` - 1TB极限测试
- `test-port-security.js` - 端口安全测试
- `test-performance-config.js` - 性能配置测试
- `test-quota-basic.js` - 基础配额测试
- `test-cache-sync-system.js` - 缓存同步系统测试
- `diagnose-quota-issue.js` - 配额问题诊断
- `reset-admin-password.js` - 重置管理员密码

### 4. 归档脚本（/scripts/archive目录）

不常用但可能有特定用途的脚本已被移动到archive目录。这些脚本主要包括：

- 特定功能测试脚本
- 阶段性开发测试脚本
- 历史兼容性测试脚本
- 特殊场景模拟脚本

需要时可以从archive目录调用这些脚本。

## 常用测试脚本使用指南

### 系统诊断

```bash
# 诊断系统问题
node diagnose-system.js
```

### 观察器测试

```bash
# 简单观察器测试
node debug-observer-simple.js

# 详细观察器测试
node debug-observer-detailed.js
```

### 性能测试

```bash
# 流媒体压力测试（2.5分钟）
node test-streaming-pressure.js

# 1TB大流量测试（约12分钟）
node test-real-1tb.js
```

### 安全与配额测试

```bash
# 端口安全测试
node test-port-security.js

# 配额基础功能测试
node test-quota-basic.js
```

## 脚本维护

我们提供了两个脚本用于维护脚本库：

```bash
# 基础清理 - 删除废弃脚本
node cleanup-scripts.js

# 增强清理 - 整理和归档脚本
node enhanced-cleanup.js
```

## 建议

1. 部署前运行 `diagnose-system.js` 进行系统检查
2. 使用官方脚本进行日常维护操作
3. 对特定功能进行测试时，优先使用保留的关键测试脚本
4. 如需特殊测试场景，可以从archive目录调用相应脚本 