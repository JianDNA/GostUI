#!/bin/bash

echo "🔍 检查Git仓库中的dist目录..."

# 临时目录
TEMP_DIR="/tmp/check-gost-dist"
REPO_URL="https://github.com/JianDNA/GostUI.git"

# 清理临时目录
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

echo "📥 克隆仓库..."
git clone "$REPO_URL" .

echo ""
echo "🔍 检查frontend目录结构:"
ls -la frontend/

echo ""
echo "🔍 检查是否有dist目录:"
if [ -d "frontend/dist" ]; then
    echo "✅ dist目录存在"
    echo "📊 dist目录内容:"
    ls -la frontend/dist/
    
    echo ""
    echo "🔍 检查index.html:"
    if [ -f "frontend/dist/index.html" ]; then
        echo "✅ index.html存在"
        echo "📏 文件大小: $(du -h frontend/dist/index.html | cut -f1)"
    else
        echo "❌ index.html不存在"
    fi
    
    echo ""
    echo "📊 dist目录统计:"
    echo "   HTML文件: $(find frontend/dist -name "*.html" | wc -l)"
    echo "   JS文件: $(find frontend/dist -name "*.js" | wc -l)"
    echo "   CSS文件: $(find frontend/dist -name "*.css" | wc -l)"
    echo "   总大小: $(du -sh frontend/dist | cut -f1)"
else
    echo "❌ dist目录不存在"
fi

echo ""
echo "🔍 检查.gitignore文件:"
if [ -f "frontend/.gitignore" ]; then
    echo "📋 frontend/.gitignore内容:"
    cat frontend/.gitignore
    echo ""
    if grep -q "dist" frontend/.gitignore; then
        echo "⚠️ dist目录被.gitignore忽略"
    else
        echo "✅ dist目录未被.gitignore忽略"
    fi
else
    echo "⚠️ frontend/.gitignore不存在"
fi

echo ""
echo "🔍 检查根目录.gitignore:"
if [ -f ".gitignore" ]; then
    echo "📋 根目录.gitignore内容:"
    cat .gitignore
    echo ""
    if grep -q "dist" .gitignore; then
        echo "⚠️ dist目录被根目录.gitignore忽略"
    else
        echo "✅ dist目录未被根目录.gitignore忽略"
    fi
else
    echo "⚠️ 根目录.gitignore不存在"
fi

# 清理
cd /
rm -rf "$TEMP_DIR"

echo ""
echo "✅ 检查完成"
