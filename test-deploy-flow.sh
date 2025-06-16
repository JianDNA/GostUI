#!/bin/bash

# 测试部署流程脚本

echo "🧪 测试部署流程..."

# 模拟部署环境
TEST_DIR="/tmp/test-gost-deploy"
REPO_URL="https://github.com/JianDNA/GostUI.git"

# 清理测试目录
if [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
fi

echo "📁 创建测试目录: $TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "📥 克隆项目..."
git clone "$REPO_URL" .

echo "🔍 检查预构建文件..."
if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    echo "✅ 预构建文件存在"
    echo "📊 文件统计:"
    echo "   HTML: $(find frontend/dist -name "*.html" | wc -l)"
    echo "   JS: $(find frontend/dist -name "*.js" | wc -l)"
    echo "   CSS: $(find frontend/dist -name "*.css" | wc -l)"
    echo "   大小: $(du -sh frontend/dist | cut -f1)"
else
    echo "❌ 预构建文件不存在"
fi

echo ""
echo "📋 测试完成"
echo "💡 现在可以运行: cd $TEST_DIR && ./deploy.sh"

# 清理
echo "🧹 清理测试目录..."
cd /
rm -rf "$TEST_DIR"
