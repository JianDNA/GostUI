#!/bin/bash

# GOST管理系统部署测试脚本
# 用于验证部署是否成功

echo "🧪 开始测试GOST管理系统部署..."

# 测试服务状态
echo "📊 检查PM2服务状态..."
if pm2 list | grep -q "gost-management.*online"; then
    echo "✅ PM2服务运行正常"
else
    echo "❌ PM2服务未运行"
    pm2 list
    exit 1
fi

# 测试端口监听
echo "🔍 检查端口3000监听状态..."
if lsof -ti:3000 >/dev/null 2>&1; then
    echo "✅ 端口3000正在监听"
else
    echo "❌ 端口3000未监听"
    exit 1
fi

# 测试前端页面
echo "🌐 测试前端页面访问..."
if curl -f -s http://localhost:3000 >/dev/null; then
    echo "✅ 前端页面访问正常"
else
    echo "❌ 前端页面访问失败"
    exit 1
fi

# 测试API接口
echo "🔌 测试API接口..."
API_RESPONSE=$(curl -s http://localhost:3000/api/system/status)
if [[ "$API_RESPONSE" == *"未提供认证令牌"* ]]; then
    echo "✅ API接口正常 (需要认证)"
else
    echo "⚠️ API接口响应异常: $API_RESPONSE"
fi

# 检查数据库
echo "🗄️ 检查数据库..."
if [ -f "$HOME/gost-management/backend/database/database.sqlite" ]; then
    echo "✅ 数据库文件存在"
else
    echo "❌ 数据库文件不存在"
    exit 1
fi

# 检查前端文件
echo "📁 检查前端文件..."
if [ -f "$HOME/gost-management/backend/public/index.html" ]; then
    echo "✅ 前端文件存在"
    
    # 检查关键资源
    ASSET_COUNT=$(find $HOME/gost-management/backend/public/assets -name "*.js" 2>/dev/null | wc -l)
    if [ "$ASSET_COUNT" -gt 5 ]; then
        echo "✅ 前端资源文件完整 ($ASSET_COUNT 个JS文件)"
    else
        echo "⚠️ 前端资源文件可能不完整 ($ASSET_COUNT 个JS文件)"
    fi
else
    echo "❌ 前端文件不存在"
    exit 1
fi

# 检查GOST二进制
echo "⚙️ 检查GOST二进制文件..."
if [ -f "$HOME/gost-management/backend/assets/gost/linux_amd64/gost" ]; then
    echo "✅ GOST二进制文件存在"
    if [ -x "$HOME/gost-management/backend/assets/gost/linux_amd64/gost" ]; then
        echo "✅ GOST二进制文件可执行"
    else
        echo "⚠️ GOST二进制文件不可执行"
    fi
else
    echo "⚠️ GOST二进制文件不存在"
fi

# 检查日志
echo "📋 检查服务日志..."
if pm2 logs gost-management --lines 5 | grep -q "服务器已启动"; then
    echo "✅ 服务启动日志正常"
else
    echo "⚠️ 服务启动日志异常，显示最近日志："
    pm2 logs gost-management --lines 10
fi

echo ""
echo "🎉 部署测试完成！"
echo ""
echo "📊 测试结果总结:"
echo "   🌐 前端页面: http://localhost:3000"
echo "   🔐 默认账号: admin / admin123"
echo "   📁 部署目录: $HOME/gost-management"
echo ""
echo "🔧 如果发现问题，请检查："
echo "   📋 PM2日志: pm2 logs gost-management"
echo "   📁 部署目录: ls -la $HOME/gost-management"
echo "   🔍 端口占用: lsof -ti:3000"
echo ""
