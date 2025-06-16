#!/bin/bash

# 🚀 GOST管理系统 - 超简单一键部署脚本

echo "🚀 GOST管理系统 - 一键部署"
echo "================================"

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo "❌ 请使用root用户运行此脚本"
    echo "💡 使用命令: sudo bash quick-deploy.sh"
    exit 1
fi

# 下载并执行部署脚本
echo "📥 下载部署脚本..."

# 尝试多种下载方式
if command -v wget >/dev/null 2>&1; then
    wget -O server-deploy-from-git.sh https://raw.githubusercontent.com/JianDNA/GostUI/main/server-deploy-from-git.sh
elif command -v curl >/dev/null 2>&1; then
    curl -o server-deploy-from-git.sh https://raw.githubusercontent.com/JianDNA/GostUI/main/server-deploy-from-git.sh
else
    echo "❌ 需要wget或curl来下载部署脚本"
    echo "💡 请先安装: apt update && apt install -y wget curl"
    exit 1
fi

# 检查下载是否成功
if [ ! -f "server-deploy-from-git.sh" ]; then
    echo "❌ 部署脚本下载失败"
    echo "💡 请检查网络连接或手动下载脚本"
    exit 1
fi

# 给脚本执行权限
chmod +x server-deploy-from-git.sh

echo "✅ 部署脚本下载完成"
echo ""
echo "🚀 开始自动部署..."
echo ""

# 执行部署脚本
./server-deploy-from-git.sh

echo ""
echo "🎉 部署完成！"
echo ""
echo "📋 访问信息:"
echo "   🌐 网址: http://$(hostname -I | awk '{print $1}'):3000"
echo "   👤 用户名: admin"
echo "   🔑 密码: admin123"
echo ""
echo "📊 管理命令:"
echo "   查看状态: pm2 list"
echo "   查看日志: pm2 logs gost-management"
echo "   重启服务: pm2 restart gost-management"
echo "   更新系统: /opt/gost-management/update.sh"
echo ""
echo "🎊 享受使用GOST管理系统！"
