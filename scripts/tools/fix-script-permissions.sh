#!/bin/bash

# 脚本权限修复工具
# 确保所有脚本都有正确的执行权限和格式

echo "🔧 修复脚本权限和格式"
echo "================================"

# 当前目录
CURRENT_DIR=$(pwd)
echo "📁 工作目录: $CURRENT_DIR"

# 检查是否在项目根目录
if [ ! -d "scripts" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    echo "💡 当前目录应包含 scripts/ 目录"
    exit 1
fi

echo "🔍 修复所有脚本文件..."

# 修复所有 .sh 文件的权限和格式
# 1. 修复根目录的入口脚本
for script in *.sh; do
    if [ -f "$script" ]; then
        echo "🔧 处理根目录脚本: $script"

        # 修复格式（移除Windows换行符）
        if tr -d '\r' < "$script" > "$script.tmp" 2>/dev/null; then
            mv "$script.tmp" "$script"
            echo "  ✅ 格式已修复"
        else
            echo "  ⚠️ 格式修复失败"
            rm -f "$script.tmp"
        fi

        # 设置执行权限
        if chmod +x "$script" 2>/dev/null; then
            echo "  ✅ 权限已设置"
        else
            echo "  ❌ 权限设置失败"
        fi
    fi
done

# 2. 修复scripts目录下的脚本
find scripts -name "*.sh" -type f | while read -r script; do
    echo "🔧 处理: $script"

    # 修复格式（移除Windows换行符）
    if tr -d '\r' < "$script" > "$script.tmp" 2>/dev/null; then
        mv "$script.tmp" "$script"
        echo "  ✅ 格式已修复"
    else
        echo "  ⚠️ 格式修复失败"
        rm -f "$script.tmp"
    fi

    # 设置执行权限
    if chmod +x "$script" 2>/dev/null; then
        echo "  ✅ 权限已设置"
    else
        echo "  ❌ 权限设置失败"
    fi
done

echo ""
echo "📊 最终状态检查:"
echo "================================"

# 显示所有脚本的权限状态
# 1. 检查根目录脚本
for script in *.sh; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo "✅ $script (可执行)"
        else
            echo "❌ $script (不可执行)"
        fi
    fi
done

# 2. 检查scripts目录脚本
find scripts -name "*.sh" -type f | while read -r script; do
    if [ -x "$script" ]; then
        echo "✅ $script (可执行)"
    else
        echo "❌ $script (不可执行)"
    fi
done

echo ""
echo "✅ 脚本权限修复完成！"
echo ""
echo "🚀 现在可以使用以下命令:"
echo "   ./gost-manager.sh                 # 主管理脚本 (推荐)"
echo "   ./smart-update.sh                 # 智能更新脚本"
echo "   ./deploy.sh                       # 部署脚本"
echo "   ./scripts/tools/cleanup-logs.sh   # 日志清理"
echo ""
echo "💡 使用建议:"
echo "   - 每次ZIP下载解压后运行此脚本"
echo "   - 如果脚本无法执行，先运行: bash scripts/tools/fix-script-permissions.sh"


