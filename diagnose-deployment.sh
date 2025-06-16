#!/bin/bash

# 🔍 部署问题诊断脚本
# 用于快速诊断服务器部署后的各种问题

echo "🔍 GOST管理系统部署诊断"
echo "======================="

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

echo "📊 系统信息:"
echo "   部署目录: $DEPLOY_DIR"
echo "   当前用户: $(whoami)"
echo "   系统时间: $(date)"
echo ""

# 1. 检查基础环境
echo "🔍 1. 基础环境检查"
echo "=================="

# Node.js
if command -v node >/dev/null 2>&1; then
    echo "✅ Node.js: $(node -v)"
else
    echo "❌ Node.js 未安装"
fi

# npm
if command -v npm >/dev/null 2>&1; then
    echo "✅ npm: $(npm -v)"
else
    echo "❌ npm 未安装"
fi

# PM2
if command -v pm2 >/dev/null 2>&1; then
    echo "✅ PM2: $(pm2 -v)"
else
    echo "❌ PM2 未安装"
fi

# Git
if command -v git >/dev/null 2>&1; then
    echo "✅ Git: $(git --version)"
else
    echo "❌ Git 未安装"
fi

echo ""

# 2. 检查项目文件
echo "🔍 2. 项目文件检查"
echo "=================="

# 后端文件
if [ -f "backend/app.js" ]; then
    echo "✅ 后端主文件存在"
else
    echo "❌ 后端主文件不存在"
fi

if [ -f "backend/package.json" ]; then
    echo "✅ 后端package.json存在"
else
    echo "❌ 后端package.json不存在"
fi

# 前端文件
if [ -d "backend/public" ]; then
    echo "✅ 前端public目录存在"
    
    if [ -f "backend/public/index.html" ]; then
        echo "✅ 前端index.html存在"
    else
        echo "❌ 前端index.html不存在"
    fi
    
    if [ -d "backend/public/assets" ]; then
        JS_COUNT=$(find backend/public/assets -name "*.js" 2>/dev/null | wc -l)
        CSS_COUNT=$(find backend/public/assets -name "*.css" 2>/dev/null | wc -l)
        echo "✅ 前端assets目录存在 (JS: $JS_COUNT, CSS: $CSS_COUNT)"
    else
        echo "❌ 前端assets目录不存在"
    fi
else
    echo "❌ 前端public目录不存在"
fi

# GOST文件
if [ -f "backend/bin/gost" ]; then
    echo "✅ GOST二进制文件存在"
    if backend/bin/gost -V 2>/dev/null; then
        echo "✅ GOST可执行"
    else
        echo "⚠️ GOST无法执行"
    fi
else
    echo "❌ GOST二进制文件不存在"
fi

echo ""

# 3. 检查服务状态
echo "🔍 3. 服务状态检查"
echo "=================="

# PM2状态
if pm2 list | grep -q "$SERVICE_NAME"; then
    PM2_STATUS=$(pm2 list | grep "$SERVICE_NAME" | awk '{print $10}')
    echo "✅ PM2服务存在，状态: $PM2_STATUS"
    
    if [ "$PM2_STATUS" = "online" ]; then
        echo "✅ 服务运行正常"
    else
        echo "❌ 服务状态异常"
        echo "📋 最近日志:"
        pm2 logs $SERVICE_NAME --lines 10 --nostream
    fi
else
    echo "❌ PM2服务不存在"
fi

# 端口检查
if netstat -tlnp 2>/dev/null | grep -q ":3000"; then
    echo "✅ 端口3000已监听"
else
    echo "❌ 端口3000未监听"
fi

echo ""

# 4. 检查网络访问
echo "🔍 4. 网络访问检查"
echo "=================="

# HTTP访问测试
if curl -f -s -m 5 http://localhost:3000 >/dev/null; then
    echo "✅ HTTP访问正常"
else
    echo "❌ HTTP访问失败"
fi

# API访问测试
if curl -f -s -m 5 http://localhost:3000/api/system/status >/dev/null; then
    echo "✅ API访问正常"
else
    echo "❌ API访问失败"
fi

echo ""

# 5. 检查数据库
echo "🔍 5. 数据库检查"
echo "================"

if [ -f "backend/database/database.sqlite" ]; then
    echo "✅ SQLite数据库文件存在"
    
    # 检查表结构
    TABLE_COUNT=$(sqlite3 backend/database/database.sqlite "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
    echo "✅ 数据库表数量: $TABLE_COUNT"
    
    if [ "$TABLE_COUNT" -gt 0 ]; then
        echo "✅ 数据库已初始化"
    else
        echo "⚠️ 数据库可能未初始化"
    fi
else
    echo "❌ SQLite数据库文件不存在"
fi

echo ""

# 6. 总结和建议
echo "🔍 6. 诊断总结"
echo "=============="

ISSUES=0

# 检查关键问题
if [ ! -f "backend/public/index.html" ]; then
    echo "❌ 关键问题: 前端文件缺失"
    echo "   解决方案: 运行 ./fix-frontend-loading.sh"
    ISSUES=$((ISSUES + 1))
fi

if ! pm2 list | grep -q "$SERVICE_NAME.*online"; then
    echo "❌ 关键问题: 服务未运行"
    echo "   解决方案: cd backend && pm2 start ecosystem.config.js"
    ISSUES=$((ISSUES + 1))
fi

if ! netstat -tlnp 2>/dev/null | grep -q ":3000"; then
    echo "❌ 关键问题: 端口未监听"
    echo "   解决方案: 检查服务配置和防火墙"
    ISSUES=$((ISSUES + 1))
fi

if [ "$ISSUES" -eq 0 ]; then
    echo "🎉 未发现关键问题，系统应该可以正常访问"
    echo ""
    echo "🌐 访问地址: http://$(hostname -I | awk '{print $1}'):3000"
    echo "🔐 默认账号: admin / admin123"
else
    echo "⚠️ 发现 $ISSUES 个关键问题，请按照上述建议修复"
fi
