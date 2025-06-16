#!/bin/bash

# 🧪 静态文件访问测试脚本

echo "🧪 静态文件访问测试"
echo "=================="

# 测试文件列表
TEST_FILES=(
    "/assets/index-75dfb4d4.js"
    "/assets/vue-55dd3248.js"
    "/assets/utils-d4f80f06.js"
    "/assets/element-plus-0a16f2db.js"
    "/assets/index-84de1c65.css"
)

BASE_URL="http://localhost:3000"

echo "🔍 测试服务器: $BASE_URL"
echo ""

# 1. 测试根路径
echo "1️⃣ 测试根路径访问"
echo "URL: $BASE_URL/"
RESPONSE=$(curl -s -I "$BASE_URL/" 2>/dev/null)
if echo "$RESPONSE" | grep -q "200 OK"; then
    echo "✅ 根路径访问正常"
    echo "Content-Type: $(echo "$RESPONSE" | grep -i content-type | cut -d' ' -f2-)"
else
    echo "❌ 根路径访问失败"
    echo "响应: $RESPONSE"
fi
echo ""

# 2. 测试静态文件
echo "2️⃣ 测试静态文件访问"
for file in "${TEST_FILES[@]}"; do
    echo "测试: $BASE_URL$file"
    
    # 检查本地文件是否存在
    LOCAL_FILE="/opt/gost-management/backend/public$file"
    if [ -f "$LOCAL_FILE" ]; then
        FILE_SIZE=$(stat -c%s "$LOCAL_FILE" 2>/dev/null || echo "unknown")
        echo "  📁 本地文件: 存在 (${FILE_SIZE} bytes)"
    else
        echo "  📁 本地文件: 不存在"
        continue
    fi
    
    # 测试HTTP访问
    RESPONSE=$(curl -s -I "$BASE_URL$file" 2>/dev/null)
    if echo "$RESPONSE" | grep -q "200 OK"; then
        echo "  ✅ HTTP访问: 正常"
        CONTENT_TYPE=$(echo "$RESPONSE" | grep -i content-type | cut -d' ' -f2- | tr -d '\r\n')
        echo "  📋 Content-Type: $CONTENT_TYPE"
        
        # 检查内容长度
        CONTENT_LENGTH=$(echo "$RESPONSE" | grep -i content-length | cut -d' ' -f2 | tr -d '\r\n')
        if [ -n "$CONTENT_LENGTH" ]; then
            echo "  📏 Content-Length: $CONTENT_LENGTH"
        fi
        
    elif echo "$RESPONSE" | grep -q "404"; then
        echo "  ❌ HTTP访问: 404 Not Found"
        
        # 测试实际返回的内容
        ACTUAL_CONTENT=$(curl -s "$BASE_URL$file" 2>/dev/null | head -c 100)
        if echo "$ACTUAL_CONTENT" | grep -q "<!DOCTYPE html>"; then
            echo "  ⚠️  返回内容: HTML页面 (应该返回静态文件)"
        else
            echo "  ⚠️  返回内容: $(echo "$ACTUAL_CONTENT" | head -c 50)..."
        fi
        
    else
        echo "  ❌ HTTP访问: 其他错误"
        echo "  📋 响应: $(echo "$RESPONSE" | head -1)"
    fi
    echo ""
done

# 3. 诊断Express配置
echo "3️⃣ Express配置诊断"
APP_JS="/opt/gost-management/backend/app.js"
if [ -f "$APP_JS" ]; then
    echo "📖 检查app.js静态文件配置:"
    
    if grep -q "express.static" "$APP_JS"; then
        echo "✅ 发现express.static配置"
        grep -n "express.static" "$APP_JS" | head -3
    else
        echo "❌ 未发现express.static配置"
    fi
    
    echo ""
    echo "📖 检查路由配置:"
    if grep -q "app.get('\*'" "$APP_JS"; then
        echo "⚠️  发现通配符路由，可能影响静态文件"
        grep -n -A2 -B2 "app.get('\*'" "$APP_JS"
    else
        echo "✅ 未发现问题的通配符路由"
    fi
else
    echo "❌ 找不到app.js文件"
fi

echo ""

# 4. 修复建议
echo "4️⃣ 修复建议"
echo "==========="

# 统计测试结果
TOTAL_FILES=${#TEST_FILES[@]}
SUCCESS_COUNT=0

for file in "${TEST_FILES[@]}"; do
    RESPONSE=$(curl -s -I "$BASE_URL$file" 2>/dev/null)
    if echo "$RESPONSE" | grep -q "200 OK"; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    fi
done

echo "📊 测试结果: $SUCCESS_COUNT/$TOTAL_FILES 文件可正常访问"

if [ $SUCCESS_COUNT -eq 0 ]; then
    echo ""
    echo "❌ 所有静态文件都无法访问，建议:"
    echo "   1. 检查Express静态文件中间件配置"
    echo "   2. 运行修复脚本: node fix-express-static.js"
    echo "   3. 重启服务: pm2 restart gost-management"
    echo "   4. 检查文件权限: chmod -R 755 /opt/gost-management/backend/public/"
elif [ $SUCCESS_COUNT -lt $TOTAL_FILES ]; then
    echo ""
    echo "⚠️  部分静态文件无法访问，建议:"
    echo "   1. 检查缺失的文件是否存在"
    echo "   2. 重新构建前端: cd frontend && npm run build"
    echo "   3. 复制构建产物: cp -r frontend/dist/* backend/public/"
else
    echo ""
    echo "🎉 所有静态文件都可以正常访问！"
    echo "   如果前端仍然无法加载，可能是其他问题"
fi
