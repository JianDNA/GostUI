#!/bin/bash

# 测试构建检测脚本

echo "🧪 测试构建文件检测..."

# 检查当前目录
echo "📁 当前目录: $(pwd)"

# 检查frontend目录
if [ -d "frontend" ]; then
    echo "✅ frontend目录存在"
    
    # 检查dist目录
    if [ -d "frontend/dist" ]; then
        echo "✅ frontend/dist目录存在"
        
        # 检查index.html
        if [ -f "frontend/dist/index.html" ]; then
            echo "✅ frontend/dist/index.html存在"
            
            # 显示文件统计
            echo "📊 构建文件统计:"
            echo "   HTML文件: $(find frontend/dist -name "*.html" | wc -l)"
            echo "   JS文件: $(find frontend/dist -name "*.js" | wc -l)"
            echo "   CSS文件: $(find frontend/dist -name "*.css" | wc -l)"
            echo "   总大小: $(du -sh frontend/dist | cut -f1)"
            
            echo "🎉 预构建文件检测成功！"
        else
            echo "❌ frontend/dist/index.html不存在"
        fi
    else
        echo "❌ frontend/dist目录不存在"
    fi
else
    echo "❌ frontend目录不存在"
fi

echo ""
echo "📋 目录结构:"
ls -la frontend/ 2>/dev/null || echo "无法列出frontend目录"

if [ -d "frontend/dist" ]; then
    echo ""
    echo "📋 dist目录内容:"
    ls -la frontend/dist/ 2>/dev/null || echo "无法列出dist目录"
fi
