#!/bin/bash

# 🔍 检查前端构建质量脚本

echo "🔍 检查前端构建质量"
echo "==================="

DEPLOY_DIR="/opt/gost-management"
cd $DEPLOY_DIR

echo "📋 1. 检查关键JS文件内容"
echo "========================"

# 检查主要JS文件的内容
JS_FILES=(
    "backend/public/assets/index-75dfb4d4.js"
    "backend/public/assets/vue-55dd3248.js"
    "backend/public/assets/utils-d4f80f06.js"
)

for file in "${JS_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "📄 检查文件: $file"
        FILE_SIZE=$(stat -c%s "$file")
        echo "   大小: $FILE_SIZE bytes"
        
        # 检查文件开头
        echo "   开头内容:"
        head -c 200 "$file" | tr -d '\n' | sed 's/.\{80\}/&\n/g'
        echo ""
        
        # 检查是否包含错误信息
        if grep -q "Error\|error\|ERROR" "$file"; then
            echo "   ⚠️  文件可能包含错误信息"
            grep -n "Error\|error\|ERROR" "$file" | head -3
        else
            echo "   ✅ 文件内容看起来正常"
        fi
        
        # 检查是否是有效的JavaScript
        if head -c 50 "$file" | grep -q "import\|export\|function\|var\|const\|let"; then
            echo "   ✅ 包含有效的JavaScript语法"
        else
            echo "   ⚠️  可能不是有效的JavaScript文件"
        fi
        
        echo ""
    else
        echo "❌ 文件不存在: $file"
    fi
done

echo "📋 2. 检查index.html内容"
echo "======================="

INDEX_FILE="backend/public/index.html"
if [ -f "$INDEX_FILE" ]; then
    echo "📄 index.html 内容:"
    cat "$INDEX_FILE"
    echo ""
    
    # 检查是否包含正确的资源引用
    echo "🔍 资源引用检查:"
    if grep -q "assets/index-75dfb4d4.js" "$INDEX_FILE"; then
        echo "✅ 包含主JS文件引用"
    else
        echo "❌ 缺少主JS文件引用"
    fi
    
    if grep -q "assets/vue-55dd3248.js" "$INDEX_FILE"; then
        echo "✅ 包含Vue文件引用"
    else
        echo "❌ 缺少Vue文件引用"
    fi
    
    if grep -q "assets/index-84de1c65.css" "$INDEX_FILE"; then
        echo "✅ 包含CSS文件引用"
    else
        echo "❌ 缺少CSS文件引用"
    fi
else
    echo "❌ index.html 不存在"
fi

echo ""
echo "📋 3. 测试JavaScript语法"
echo "======================="

# 测试主JS文件是否可以被Node.js解析
MAIN_JS="backend/public/assets/index-75dfb4d4.js"
if [ -f "$MAIN_JS" ]; then
    echo "🧪 测试主JS文件语法..."
    
    # 创建临时测试文件
    cat > /tmp/test-js.js << 'EOF'
try {
    const fs = require('fs');
    const content = fs.readFileSync(process.argv[2], 'utf8');
    
    // 检查是否包含基本的模块语法
    if (content.includes('import') || content.includes('export')) {
        console.log('✅ 包含ES6模块语法');
    }
    
    // 检查文件大小
    if (content.length < 1000) {
        console.log('⚠️  文件内容过短，可能不完整');
        console.log('内容预览:', content.substring(0, 200));
    } else {
        console.log('✅ 文件大小正常');
    }
    
    // 检查是否包含Vue相关内容
    if (content.includes('Vue') || content.includes('vue')) {
        console.log('✅ 包含Vue相关内容');
    } else {
        console.log('⚠️  未发现Vue相关内容');
    }
    
} catch (error) {
    console.log('❌ 文件读取或解析错误:', error.message);
}
EOF
    
    node /tmp/test-js.js "$MAIN_JS"
    rm /tmp/test-js.js
else
    echo "❌ 主JS文件不存在"
fi

echo ""
echo "📋 4. 检查前端构建时间"
echo "===================="

echo "📅 文件修改时间:"
ls -la backend/public/assets/ | grep -E "\.(js|css)$" | head -5

echo ""
echo "📋 5. 建议的修复方案"
echo "=================="

echo "如果前端仍然无法加载，请尝试以下方案："
echo ""
echo "方案1: 重新构建前端"
echo "  cd frontend"
echo "  rm -rf node_modules dist"
echo "  npm install"
echo "  npm run build"
echo "  cp -r dist/* ../backend/public/"
echo "  pm2 restart gost-management"
echo ""
echo "方案2: 清除浏览器缓存"
echo "  - 按 Ctrl+Shift+R 强制刷新"
echo "  - 或在开发者工具中清空缓存"
echo ""
echo "方案3: 检查浏览器控制台"
echo "  - 按 F12 打开开发者工具"
echo "  - 查看 Console 标签页的错误信息"
echo "  - 查看 Network 标签页的网络请求"
