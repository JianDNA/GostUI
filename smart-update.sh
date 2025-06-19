#!/bin/bash

# GOST管理系统 - 智能更新入口脚本
# 这是一个便捷的入口脚本，调用实际的更新脚本

echo "🔄 GOST管理系统智能更新"
echo "================================"

# 检查脚本目录是否存在
if [ ! -f "scripts/core/smart-update.sh" ]; then
    echo "❌ 找不到更新脚本"
    echo "💡 请确保在项目根目录运行此脚本"
    echo "💡 或者运行: ./scripts/tools/fix-script-permissions.sh"
    exit 1
fi

# 调用实际的更新脚本
echo "📋 启动智能更新脚本..."
exec ./scripts/core/smart-update.sh "$@"
