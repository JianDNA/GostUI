#!/bin/bash

# 🔍 静态文件问题调试脚本

echo "🔍 静态文件问题调试"
echo "==================="

DEPLOY_DIR="/opt/gost-management"

if [ ! -d "$DEPLOY_DIR" ]; then
    echo "❌ 部署目录不存在: $DEPLOY_DIR"
    exit 1
fi

cd $DEPLOY_DIR

echo "📁 检查文件结构..."
echo "当前目录: $(pwd)"
echo ""

# 1. 检查backend/public目录
echo "🔍 1. 检查backend/public目录结构"
if [ -d "backend/public" ]; then
    echo "✅ backend/public 存在"
    echo "📋 目录内容:"
    ls -la backend/public/
    echo ""
    
    if [ -d "backend/public/assets" ]; then
        echo "✅ backend/public/assets 存在"
        echo "📋 assets目录内容:"
        ls -la backend/public/assets/ | head -10
        echo ""
        
        # 检查关键文件
        echo "🔍 检查关键文件:"
        for file in "index-75dfb4d4.js" "vue-55dd3248.js" "utils-d4f80f06.js" "element-plus-0a16f2db.js" "index-84de1c65.css"; do
            if [ -f "backend/public/assets/$file" ]; then
                echo "✅ $file 存在 ($(stat -c%s backend/public/assets/$file) bytes)"
            else
                echo "❌ $file 不存在"
            fi
        done
    else
        echo "❌ backend/public/assets 不存在"
    fi
else
    echo "❌ backend/public 不存在"
fi

echo ""

# 2. 检查文件权限
echo "🔍 2. 检查文件权限"
if [ -f "backend/public/assets/index-75dfb4d4.js" ]; then
    echo "📋 index-75dfb4d4.js 权限:"
    ls -la backend/public/assets/index-75dfb4d4.js
    
    echo "📋 文件内容预览 (前50字符):"
    head -c 50 backend/public/assets/index-75dfb4d4.js
    echo ""
else
    echo "❌ 关键文件不存在"
fi

echo ""

# 3. 检查Express服务状态
echo "🔍 3. 检查Express服务"
if pm2 list | grep -q "gost-management.*online"; then
    echo "✅ PM2服务运行中"
    
    # 测试静态文件访问
    echo "🧪 测试静态文件访问:"
    
    # 测试根路径
    echo "测试 http://localhost:3000/"
    if curl -f -s -I http://localhost:3000/ | head -1; then
        echo "✅ 根路径访问正常"
    else
        echo "❌ 根路径访问失败"
    fi
    
    # 测试静态文件
    echo "测试 http://localhost:3000/assets/index-75dfb4d4.js"
    RESPONSE=$(curl -s -I http://localhost:3000/assets/index-75dfb4d4.js)
    if echo "$RESPONSE" | grep -q "200 OK"; then
        echo "✅ 静态文件访问正常"
    elif echo "$RESPONSE" | grep -q "404"; then
        echo "❌ 静态文件404错误"
        echo "响应头:"
        echo "$RESPONSE"
    else
        echo "❌ 静态文件访问异常"
        echo "响应:"
        echo "$RESPONSE"
    fi
    
    # 检查Content-Type
    echo ""
    echo "🔍 检查Content-Type:"
    curl -s -I http://localhost:3000/assets/index-75dfb4d4.js | grep -i content-type || echo "无Content-Type头"
    
else
    echo "❌ PM2服务未运行"
fi

echo ""

# 4. 检查可能的问题
echo "🔍 4. 问题诊断"

# 检查是否有.htaccess或nginx配置
if [ -f "backend/public/.htaccess" ]; then
    echo "⚠️ 发现.htaccess文件，可能影响静态文件服务"
fi

# 检查文件大小
if [ -f "backend/public/assets/index-75dfb4d4.js" ]; then
    FILE_SIZE=$(stat -c%s backend/public/assets/index-75dfb4d4.js)
    if [ "$FILE_SIZE" -lt 1000 ]; then
        echo "⚠️ JS文件大小异常小 ($FILE_SIZE bytes)，可能是空文件或错误文件"
        echo "文件内容:"
        cat backend/public/assets/index-75dfb4d4.js
    else
        echo "✅ JS文件大小正常 ($FILE_SIZE bytes)"
    fi
fi

echo ""

# 5. 修复建议
echo "🛠️ 修复建议"
echo "============"

if [ ! -f "backend/public/assets/index-75dfb4d4.js" ]; then
    echo "❌ 关键文件缺失，建议:"
    echo "   1. 重新构建前端: cd frontend && npm run build"
    echo "   2. 复制构建产物: cp -r frontend/dist/* backend/public/"
    echo "   3. 重启服务: pm2 restart gost-management"
elif [ ! -r "backend/public/assets/index-75dfb4d4.js" ]; then
    echo "❌ 文件权限问题，建议:"
    echo "   chmod -R 755 backend/public/"
    echo "   chown -R \$USER:\$USER backend/public/"
else
    echo "📋 文件存在且可读，可能是Express配置问题"
    echo "   建议检查app.js中的静态文件中间件配置"
fi

echo ""
echo "🔧 快速修复命令:"
echo "cd $DEPLOY_DIR"
echo "chmod -R 755 backend/public/"
echo "pm2 restart gost-management"
echo "pm2 logs gost-management --lines 20"
