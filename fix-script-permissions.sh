#!/bin/bash

# 脚本权限修复工具
# 确保所有关键脚本都有正确的执行权限和格式

echo "🔧 修复脚本权限和格式"
echo "================================"

# 当前目录
CURRENT_DIR=$(pwd)
echo "📁 工作目录: $CURRENT_DIR"

# 关键脚本列表
CRITICAL_SCRIPTS=(
    "gost-manager.sh"
    "smart-update.sh" 
    "deploy.sh"
    "cleanup-logs.sh"
    "commit-with-build.sh"
    "check-port-security.sh"
    "fix-script-permissions.sh"
)

echo ""
echo "🔍 检查关键脚本..."

# 修复关键脚本
for script in "${CRITICAL_SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        echo "🔧 处理: $script"
        
        # 检查当前权限
        if [ -x "$script" ]; then
            echo "  ✅ 已有执行权限"
        else
            echo "  ⚠️ 缺少执行权限"
        fi
        
        # 修复格式（清除CRLF）
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
        
    else
        echo "⚠️ 未找到: $script"
    fi
    echo ""
done

echo "🔍 检查所有.sh文件..."

# 修复所有.sh文件
find . -maxdepth 1 -name "*.sh" -type f -print0 | while IFS= read -r -d '' file; do
    filename=$(basename "$file")
    
    # 跳过已处理的关键脚本
    skip=false
    for critical in "${CRITICAL_SCRIPTS[@]}"; do
        if [ "$filename" = "$critical" ]; then
            skip=true
            break
        fi
    done
    
    if [ "$skip" = false ]; then
        echo "🔧 处理其他脚本: $filename"
        
        # 修复格式和权限
        if tr -d '\r' < "$file" > "$file.tmp" 2>/dev/null; then
            mv "$file.tmp" "$file"
            chmod +x "$file" 2>/dev/null
            echo "  ✅ 已处理"
        else
            echo "  ⚠️ 处理失败"
            rm -f "$file.tmp"
        fi
    fi
done

echo ""
echo "📊 最终状态检查:"
echo "================================"

# 显示所有.sh文件的权限状态
for script in *.sh 2>/dev/null; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo "✅ $script (可执行)"
        else
            echo "❌ $script (不可执行)"
        fi
    fi
done

echo ""
echo "✅ 脚本权限修复完成！"
echo ""
echo "💡 使用建议:"
echo "   - 每次Git拉取代码后运行此脚本"
echo "   - 如果脚本无法执行，先运行: bash fix-script-permissions.sh"
echo "   - 建议将此脚本加入到更新流程中"
