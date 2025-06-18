#!/bin/bash

# 临时权限修复脚本 - 用于紧急修复脚本权限问题

echo "🔧 紧急修复脚本权限"
echo "================================"

# 检查当前目录
if [ ! -f "gost-manager.sh" ]; then
    echo "❌ 请在GostUI项目根目录运行此脚本"
    echo "💡 正确的运行方式:"
    echo "   cd ~/GostUI"
    echo "   bash temp-fix-permissions.sh"
    exit 1
fi

echo "📁 当前目录: $(pwd)"
echo ""

# 关键脚本列表
SCRIPTS=(
    "gost-manager.sh"
    "smart-update.sh"
    "deploy.sh"
    "cleanup-logs.sh"
    "fix-script-permissions.sh"
    "check-port-security.sh"
    "commit-with-build.sh"
    "temp-fix-permissions.sh"
)

echo "🔧 修复脚本权限和格式..."

for script in "${SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        echo "处理: $script"
        
        # 修复格式（清除CRLF）
        if command -v dos2unix >/dev/null 2>&1; then
            dos2unix "$script" 2>/dev/null
        else
            tr -d '\r' < "$script" > "$script.tmp" && mv "$script.tmp" "$script"
        fi
        
        # 设置执行权限
        chmod +x "$script"
        
        # 验证权限
        if [ -x "$script" ]; then
            echo "✅ $script - 权限已设置"
        else
            echo "❌ $script - 权限设置失败"
        fi
    else
        echo "⚠️ 未找到: $script"
    fi
done

echo ""
echo "📊 最终权限状态:"
echo "================================"

for script in *.sh; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo "✅ $script (可执行)"
        else
            echo "❌ $script (不可执行)"
        fi
    fi
done

echo ""
echo "✅ 权限修复完成！"
echo ""
echo "🚀 现在可以运行:"
echo "   ./gost-manager.sh"
echo "   ./smart-update.sh"
echo "   ./deploy.sh"
echo ""
echo "💡 如果问题仍然存在，请检查:"
echo "   1. 文件系统是否支持执行权限"
echo "   2. 是否有足够的权限修改文件"
echo "   3. 文件是否被其他程序锁定"
