# 📁 脚本目录结构

这个目录包含了GOST管理系统的所有脚本文件，按功能分类组织。

## 🗂️ 目录结构

```
scripts/
├── core/           # 核心管理脚本
│   ├── deploy.sh           # 一键部署脚本
│   ├── gost-manager.sh     # 主管理脚本（集成菜单）
│   └── smart-update.sh     # 智能更新脚本
├── tools/          # 工具脚本
│   ├── check-port-security.sh     # 端口安全检查
│   ├── cleanup-logs.sh            # 日志清理工具
│   ├── fix-script-permissions.sh  # 脚本权限修复
│   └── force-port-restart.sh      # 强制端口重启
└── dev/            # 开发工具
    └── commit-with-build.sh       # 自动构建并提交
```

## 🚀 使用方法

### 核心脚本

```bash
# 主管理脚本（推荐）
./scripts/core/gost-manager.sh

# 一键部署
./scripts/core/deploy.sh

# 智能更新
./scripts/core/smart-update.sh
```

### 工具脚本

```bash
# 修复脚本权限
./scripts/tools/fix-script-permissions.sh

# 清理日志
./scripts/tools/cleanup-logs.sh

# 检查端口安全
./scripts/tools/check-port-security.sh

# 强制重启端口
./scripts/tools/force-port-restart.sh
```

### 开发工具

```bash
# 自动构建并提交
./scripts/dev/commit-with-build.sh
```

## 💡 便捷入口

项目根目录提供了便捷的入口脚本：

```bash
# 这些脚本会自动调用对应的核心脚本
./gost-manager.sh    # 等同于 ./scripts/core/gost-manager.sh
./smart-update.sh    # 等同于 ./scripts/core/smart-update.sh
./deploy.sh          # 等同于 ./scripts/core/deploy.sh
```

## 🔧 权限管理

如果遇到脚本无法执行的问题，请运行：

```bash
# 修复所有脚本权限
./scripts/tools/fix-script-permissions.sh

# 或者手动修复
find scripts -name "*.sh" -type f -exec chmod +x {} \;
```

## 📋 脚本说明

### 核心脚本

- **deploy.sh**: 完整的一键部署脚本，支持初始部署和更新部署
- **gost-manager.sh**: 集成管理界面，包含所有常用功能
- **smart-update.sh**: 智能更新脚本，自动处理冲突和数据保护

### 工具脚本

- **fix-script-permissions.sh**: 修复所有脚本的执行权限和格式
- **cleanup-logs.sh**: 清理系统日志，防止磁盘空间不足
- **check-port-security.sh**: 检查端口安全配置
- **force-port-restart.sh**: 强制重启指定端口的服务

### 开发工具

- **commit-with-build.sh**: 自动构建前端并提交到Git

## 🎯 最佳实践

1. **使用便捷入口**: 优先使用根目录的入口脚本
2. **权限检查**: 每次拉取代码后运行权限修复脚本
3. **规范命名**: 所有脚本都使用 `.sh` 扩展名
4. **目录结构**: 按功能分类存放脚本文件
