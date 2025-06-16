#!/bin/bash

# 🔧 前端加载问题修复脚本
# 专门用于解决服务器部署后前端卡在加载页面的问题

echo "🔧 前端加载问题修复脚本"
echo "=========================="

# 配置变量
DEPLOY_DIR="/opt/gost-management"
SERVICE_NAME="gost-management"

# 检查部署目录
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "❌ 部署目录不存在: $DEPLOY_DIR"
    echo "💡 请先运行部署脚本"
    exit 1
fi

cd $DEPLOY_DIR

echo "🔍 诊断前端问题..."

# 1. 检查前端文件状态
echo "📁 检查前端文件状态..."
if [ -d "backend/public" ]; then
    echo "✅ public目录存在"
    
    if [ -f "backend/public/index.html" ]; then
        echo "✅ index.html存在"
        
        # 检查index.html内容
        if grep -q "assets/" backend/public/index.html; then
            echo "✅ index.html包含资源引用"
        else
            echo "⚠️ index.html可能缺少资源引用"
        fi
    else
        echo "❌ index.html不存在"
    fi
    
    # 检查assets目录
    if [ -d "backend/public/assets" ]; then
        JS_COUNT=$(find backend/public/assets -name "*.js" | wc -l)
        CSS_COUNT=$(find backend/public/assets -name "*.css" | wc -l)
        echo "✅ assets目录存在 (JS: $JS_COUNT, CSS: $CSS_COUNT)"
        
        if [ "$JS_COUNT" -lt 5 ]; then
            echo "⚠️ JS文件数量可能不足"
        fi
    else
        echo "❌ assets目录不存在"
    fi
else
    echo "❌ public目录不存在"
fi

# 2. 检查服务状态
echo ""
echo "🔍 检查服务状态..."
if pm2 list | grep -q "$SERVICE_NAME.*online"; then
    echo "✅ PM2服务运行正常"
    
    # 检查端口
    if netstat -tlnp | grep -q ":3000"; then
        echo "✅ 端口3000已监听"
    else
        echo "❌ 端口3000未监听"
    fi
else
    echo "❌ PM2服务未运行"
fi

# 3. 测试HTTP访问
echo ""
echo "🔍 测试HTTP访问..."
if curl -f -s http://localhost:3000 >/dev/null; then
    echo "✅ HTTP访问正常"
else
    echo "❌ HTTP访问失败"
fi

# 4. 修复方案
echo ""
echo "🛠️ 开始修复..."

# 方案1: 重新从Git获取前端文件
if [ -d ".git" ]; then
    echo "📥 重新获取前端文件..."
    
    # 备份当前public目录
    if [ -d "backend/public" ]; then
        mv backend/public backend/public.backup.$(date +%s)
        echo "📋 已备份当前public目录"
    fi
    
    # 重置Git状态
    git checkout HEAD -- backend/public/ 2>/dev/null || echo "⚠️ Git重置失败"
    
    # 检查是否成功获取
    if [ -f "backend/public/index.html" ]; then
        echo "✅ 成功从Git获取前端文件"
    else
        echo "❌ Git中没有前端文件，尝试构建..."
        
        # 方案2: 重新构建前端
        if [ -d "frontend" ]; then
            echo "🔨 重新构建前端..."
            cd frontend
            
            # 清理并重新安装依赖
            rm -rf node_modules package-lock.json
            npm install --no-bin-links || {
                echo "❌ 依赖安装失败"
                cd ..
                exit 1
            }
            
            # 构建
            npm run build || {
                echo "❌ 构建失败"
                cd ..
                exit 1
            }
            
            # 复制构建产物
            if [ -d "dist" ]; then
                mkdir -p ../backend/public
                cp -r dist/* ../backend/public/
                echo "✅ 前端重新构建完成"
            fi
            
            cd ..
        else
            echo "❌ 无法修复：既没有Git中的前端文件，也没有frontend源码"
            exit 1
        fi
    fi
else
    echo "⚠️ 不是Git仓库，无法从Git获取文件"
fi

# 5. 验证修复结果
echo ""
echo "🔍 验证修复结果..."

if [ -f "backend/public/index.html" ] && [ -d "backend/public/assets" ]; then
    JS_COUNT=$(find backend/public/assets -name "*.js" | wc -l)
    if [ "$JS_COUNT" -ge 5 ]; then
        echo "✅ 前端文件修复成功"
        
        # 重启服务
        echo "🔄 重启服务..."
        cd backend
        pm2 restart $SERVICE_NAME
        
        echo "⏳ 等待服务启动..."
        sleep 10
        
        # 最终测试
        if curl -f -s http://localhost:3000 >/dev/null; then
            echo "🎉 修复完成！前端应该可以正常访问了"
            echo ""
            echo "🌐 访问地址: http://localhost:3000"
            echo "🔐 默认账号: admin / admin123"
        else
            echo "⚠️ 服务重启后仍无法访问，请检查日志"
            pm2 logs $SERVICE_NAME --lines 20
        fi
    else
        echo "❌ 前端文件仍不完整"
        exit 1
    fi
else
    echo "❌ 修复失败"
    exit 1
fi
