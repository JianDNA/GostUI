#!/bin/bash

# GOST管理系统 - 主入口脚本
# 这是一个便捷的入口脚本，调用实际的管理脚本

echo "🚀 GOST管理系统"
echo "================================"

# 检查脚本目录是否存在
if [ ! -f "scripts/core/gost-manager.sh" ]; then
    echo "❌ 找不到管理脚本"
    echo "💡 请确保在项目根目录运行此脚本"
    echo "💡 或者运行: ./scripts/tools/fix-script-permissions.sh"
    exit 1
fi

# 调用实际的管理脚本
echo "📋 启动主管理脚本..."
exec ./scripts/core/gost-manager.sh "$@"
