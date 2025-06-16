#!/bin/bash

# 🔨 强制重新构建前端脚本
# 专门用于解决前端加载问题

echo "🔨 强制重新构建前端"
echo "==================="

DEPLOY_DIR="/opt/gost-management"

if [ ! -d "$DEPLOY_DIR" ]; then
    echo "❌ 部署目录不存在: $DEPLOY_DIR"
    exit 1
fi

cd $DEPLOY_DIR

echo "📋 当前目录: $(pwd)"
echo ""

# 1. 停止服务
echo "🛑 停止服务..."
pm2 stop gost-management 2>/dev/null || echo "服务未运行"

# 2. 完全清空前端文件
echo "🗑️ 完全清空前端文件..."
if [ -d "backend/public" ]; then
    echo "📋 备份现有前端文件..."
    mv backend/public backend/public.backup.$(date +%s)
    echo "✅ 已备份到 backend/public.backup.$(date +%s)"
fi

# 3. 检查前端源码
if [ ! -d "frontend" ]; then
    echo "❌ 前端源码目录不存在"
    echo "💡 请确保Git仓库包含frontend目录"
    exit 1
fi

echo "✅ 前端源码目录存在"

# 4. 进入前端目录
cd frontend

# 5. 完全清理前端环境
echo "🧹 完全清理前端环境..."
rm -rf node_modules
rm -rf dist
rm -f package-lock.json
rm -rf .vite
rm -rf .cache

echo "✅ 前端环境清理完成"

# 6. 检查package.json
if [ ! -f "package.json" ]; then
    echo "❌ package.json 不存在"
    exit 1
fi

echo "✅ package.json 存在"
echo "📋 package.json 内容预览:"
head -20 package.json

# 7. 安装依赖
echo ""
echo "📦 重新安装前端依赖..."
npm install --no-bin-links --verbose || {
    echo "❌ 依赖安装失败"
    echo "💡 尝试使用不同的安装方式..."
    
    # 尝试清理npm缓存
    npm cache clean --force
    
    # 尝试使用legacy-peer-deps
    npm install --no-bin-links --legacy-peer-deps || {
        echo "❌ 所有安装方式都失败了"
        exit 1
    }
}

echo "✅ 依赖安装成功"

# 8. 检查依赖
echo "📋 检查关键依赖..."
if [ -d "node_modules/vue" ]; then
    echo "✅ Vue 已安装"
else
    echo "❌ Vue 未安装"
fi

if [ -d "node_modules/vite" ]; then
    echo "✅ Vite 已安装"
else
    echo "❌ Vite 未安装"
fi

# 9. 构建前端
echo ""
echo "🔨 构建前端项目..."
npm run build --verbose || {
    echo "❌ 前端构建失败"
    echo "📋 查看构建日志..."
    
    # 尝试显示更详细的错误信息
    echo "💡 尝试调试构建..."
    npm run build -- --debug || {
        echo "❌ 调试构建也失败了"
        exit 1
    }
}

echo "✅ 前端构建成功"

# 10. 检查构建产物
echo ""
echo "🔍 检查构建产物..."
if [ ! -d "dist" ]; then
    echo "❌ dist目录不存在"
    exit 1
fi

if [ ! -f "dist/index.html" ]; then
    echo "❌ dist/index.html 不存在"
    exit 1
fi

echo "✅ 构建产物检查通过"

# 显示构建产物信息
echo "📋 构建产物信息:"
ls -la dist/
echo ""
if [ -d "dist/assets" ]; then
    echo "📋 assets目录内容:"
    ls -la dist/assets/ | head -10
    
    JS_COUNT=$(find dist/assets -name "*.js" | wc -l)
    CSS_COUNT=$(find dist/assets -name "*.css" | wc -l)
    echo "📊 统计: JS文件 $JS_COUNT 个, CSS文件 $CSS_COUNT 个"
else
    echo "❌ assets目录不存在"
    exit 1
fi

# 11. 复制到后端
echo ""
echo "📋 复制构建产物到后端..."
cd ..
mkdir -p backend/public
cp -r frontend/dist/* backend/public/

echo "✅ 复制完成"

# 12. 验证复制结果
echo ""
echo "🔍 验证复制结果..."
if [ -f "backend/public/index.html" ]; then
    echo "✅ backend/public/index.html 存在"
else
    echo "❌ backend/public/index.html 不存在"
    exit 1
fi

if [ -d "backend/public/assets" ]; then
    BACKEND_JS_COUNT=$(find backend/public/assets -name "*.js" | wc -l)
    echo "✅ backend/public/assets 存在 (包含 $BACKEND_JS_COUNT 个JS文件)"
else
    echo "❌ backend/public/assets 不存在"
    exit 1
fi

# 13. 设置权限
echo "🔧 设置文件权限..."
chmod -R 755 backend/public/

# 14. 重启服务
echo ""
echo "🚀 重启服务..."
cd backend
pm2 restart gost-management

echo "⏳ 等待服务启动..."
sleep 10

# 15. 测试访问
echo ""
echo "🧪 测试访问..."
if curl -f -s http://localhost:3000 >/dev/null; then
    echo "✅ HTTP访问正常"
else
    echo "❌ HTTP访问失败"
fi

# 测试静态文件
if curl -f -s http://localhost:3000/assets/ >/dev/null 2>&1; then
    echo "✅ 静态文件访问正常"
else
    echo "⚠️ 静态文件访问可能有问题"
fi

echo ""
echo "🎉 前端重新构建完成！"
echo ""
echo "📊 结果总结:"
echo "   🌐 访问地址: http://localhost:3000"
echo "   🔐 默认账号: admin / admin123"
echo "   📁 前端文件: backend/public/"
echo "   📋 JS文件数: $BACKEND_JS_COUNT"
echo ""
echo "💡 如果仍然有问题，请:"
echo "   1. 清除浏览器缓存 (Ctrl+Shift+R)"
echo "   2. 检查浏览器开发者工具的Console和Network标签"
echo "   3. 查看PM2日志: pm2 logs gost-management"
