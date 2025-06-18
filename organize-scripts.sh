#!/bin/bash

# 脚本目录整理工具
# 将项目文件整理成更优雅的目录结构

echo "🗂️ GOST管理系统 - 脚本目录整理工具"
echo "================================"

# 检查是否在正确的目录
if [ ! -f "gost-manager.sh" ] || [ ! -f "smart-update.sh" ]; then
    echo "❌ 请在GostUI项目根目录运行此脚本"
    exit 1
fi

echo "📁 当前目录: $(pwd)"
echo ""

# 创建新的目录结构
echo "🔧 创建目录结构..."

# 核心脚本目录
mkdir -p scripts/core
mkdir -p scripts/tools
mkdir -p scripts/dev

# 文档目录
mkdir -p docs

# 备份目录
mkdir -p .backups

echo "✅ 目录结构已创建"
echo ""

# 移动核心管理脚本
echo "📦 整理核心管理脚本..."
mv gost-manager.sh scripts/core/ 2>/dev/null || true
mv smart-update.sh scripts/core/ 2>/dev/null || true
mv deploy.sh scripts/core/ 2>/dev/null || true

# 移动工具脚本
echo "🛠️ 整理工具脚本..."
mv cleanup-logs.sh scripts/tools/ 2>/dev/null || true
mv check-port-security.sh scripts/tools/ 2>/dev/null || true
mv fix-script-permissions.sh scripts/tools/ 2>/dev/null || true
mv force-port-restart.sh scripts/tools/ 2>/dev/null || true

# 移动开发工具
echo "⚙️ 整理开发工具..."
mv commit-with-build.sh scripts/dev/ 2>/dev/null || true

# 移动文档
echo "📚 整理文档..."
mv DEPLOYMENT.md docs/ 2>/dev/null || true
mv OPTIMIZATION_SUMMARY.md docs/ 2>/dev/null || true
mv SECURITY-IMPROVEMENTS-LOG.md docs/ 2>/dev/null || true
mv EXTERNAL-ACCESS-CONTROL-DEVELOPMENT-LOG.md docs/ 2>/dev/null || true

# 清理临时文件和备份
echo "🧹 清理临时文件..."
mv temp-fix-permissions.sh .backups/ 2>/dev/null || true
mv *.backup.* .backups/ 2>/dev/null || true

# 创建便捷的启动脚本
echo "🚀 创建便捷启动脚本..."

# 主管理脚本的快捷方式
cat > gost-manager << 'EOF'
#!/bin/bash
# GOST管理系统 - 主管理脚本快捷方式
cd "$(dirname "$0")"
exec ./scripts/core/gost-manager.sh "$@"
EOF
chmod +x gost-manager

# 智能更新脚本的快捷方式
cat > smart-update << 'EOF'
#!/bin/bash
# GOST管理系统 - 智能更新脚本快捷方式
cd "$(dirname "$0")"
exec ./scripts/core/smart-update.sh "$@"
EOF
chmod +x smart-update

# 部署脚本的快捷方式
cat > deploy << 'EOF'
#!/bin/bash
# GOST管理系统 - 部署脚本快捷方式
cd "$(dirname "$0")"
exec ./scripts/core/deploy.sh "$@"
EOF
chmod +x deploy

# 创建工具脚本索引
cat > scripts/tools/README.md << 'EOF'
# 🛠️ 工具脚本

这个目录包含各种实用工具脚本：

## 📋 脚本列表

- **cleanup-logs.sh** - 日志清理工具
- **check-port-security.sh** - 端口安全检查工具
- **fix-script-permissions.sh** - 脚本权限修复工具
- **force-port-restart.sh** - 强制端口重启工具

## 🚀 使用方法

```bash
# 从项目根目录运行
./scripts/tools/cleanup-logs.sh
./scripts/tools/check-port-security.sh
./scripts/tools/fix-script-permissions.sh
./scripts/tools/force-port-restart.sh 30305
```

## 💡 提示

所有工具脚本都可以独立运行，无需额外依赖。
EOF

# 创建核心脚本索引
cat > scripts/core/README.md << 'EOF'
# 🎯 核心管理脚本

这个目录包含GOST管理系统的核心脚本：

## 📋 脚本列表

- **gost-manager.sh** - 主管理脚本（集成菜单）
- **smart-update.sh** - 智能更新脚本
- **deploy.sh** - 一键部署脚本

## 🚀 快捷使用

项目根目录提供了便捷的快捷方式：

```bash
# 使用快捷方式（推荐）
./gost-manager    # 等同于 ./scripts/core/gost-manager.sh
./smart-update    # 等同于 ./scripts/core/smart-update.sh
./deploy          # 等同于 ./scripts/core/deploy.sh

# 直接调用
./scripts/core/gost-manager.sh
./scripts/core/smart-update.sh
./scripts/core/deploy.sh
```
EOF

# 创建开发工具索引
cat > scripts/dev/README.md << 'EOF'
# ⚙️ 开发工具

这个目录包含开发和维护相关的工具：

## 📋 工具列表

- **commit-with-build.sh** - 自动构建并提交脚本

## 🚀 使用方法

```bash
./scripts/dev/commit-with-build.sh
```
EOF

echo ""
echo "📊 整理完成！新的目录结构:"
echo "================================"
tree -a -I '.git' . 2>/dev/null || find . -type f -name ".*" -prune -o -type f -print | sort

echo ""
echo "🎉 脚本目录整理完成！"
echo ""
echo "📋 新的使用方式:"
echo "   ./gost-manager    # 主管理脚本"
echo "   ./smart-update    # 智能更新"
echo "   ./deploy          # 一键部署"
echo ""
echo "🛠️ 工具脚本位置:"
echo "   ./scripts/tools/  # 各种实用工具"
echo ""
echo "📚 文档位置:"
echo "   ./docs/           # 所有文档文件"
echo ""
echo "💡 提示: 快捷方式保持了原有的使用习惯，同时目录结构更加清晰！"
