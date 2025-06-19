#!/bin/bash

# GOST管理系统 - 一键快速部署脚本
# 使用ZIP下载方式，更快更轻量

echo "🚀 GOST管理系统 - 一键快速部署"
echo "================================"
echo "💡 使用ZIP下载方式，速度更快，体积更小"
echo ""

# 检查必要工具
echo "🔍 检查必要工具..."

# 检查curl
if ! command -v curl >/dev/null 2>&1; then
    echo "❌ 缺少curl工具"
    echo "💡 安装命令："
    echo "   Ubuntu/Debian: sudo apt install -y curl"
    echo "   CentOS/RHEL:   sudo yum install -y curl"
    exit 1
fi

# 检查unzip
if ! command -v unzip >/dev/null 2>&1; then
    echo "❌ 缺少unzip工具"
    echo "💡 安装命令："
    echo "   Ubuntu/Debian: sudo apt install -y unzip"
    echo "   CentOS/RHEL:   sudo yum install -y unzip"
    exit 1
fi

echo "✅ 工具检查完成"
echo ""

# 设置变量
DOWNLOAD_URL="https://github.com/JianDNA/GostUI/archive/refs/heads/main.zip"
ZIP_FILE="GostUI-main.zip"
EXTRACT_DIR="GostUI-main"
TARGET_DIR="GostUI"

# 确保在正确的工作目录
WORK_DIR="$HOME"
cd "$WORK_DIR" || {
    echo "❌ 无法进入工作目录: $WORK_DIR"
    exit 1
}

echo "📁 工作目录: $(pwd)"

# 清理旧文件
if [ -d "$TARGET_DIR" ]; then
    echo "🧹 发现现有目录，正在清理..."
    rm -rf "$TARGET_DIR"
fi

if [ -f "$ZIP_FILE" ]; then
    echo "🧹 清理旧的ZIP文件..."
    rm -f "$ZIP_FILE"
fi

# 下载最新代码
echo "📥 下载最新代码..."
echo "📋 下载地址: $DOWNLOAD_URL"

if curl -L --progress-bar -o "$ZIP_FILE" "$DOWNLOAD_URL"; then
    echo "✅ 下载完成"
    
    # 检查文件大小
    if [ -f "$ZIP_FILE" ] && [ -s "$ZIP_FILE" ]; then
        file_size=$(du -h "$ZIP_FILE" | cut -f1)
        echo "📊 文件大小: $file_size"
    else
        echo "❌ 下载的文件为空或不存在"
        exit 1
    fi
else
    echo "❌ 下载失败"
    echo "💡 请检查网络连接或尝试手动下载："
    echo "   $DOWNLOAD_URL"
    exit 1
fi

# 解压文件
echo ""
echo "📦 解压文件..."
if unzip -q "$ZIP_FILE"; then
    echo "✅ 解压完成"
    
    # 重命名目录
    if [ -d "$EXTRACT_DIR" ]; then
        mv "$EXTRACT_DIR" "$TARGET_DIR"
        echo "✅ 目录重命名完成"
    else
        echo "❌ 解压后未找到预期目录: $EXTRACT_DIR"
        exit 1
    fi
else
    echo "❌ 解压失败"
    exit 1
fi

# 清理ZIP文件
rm -f "$ZIP_FILE"
echo "🧹 已清理临时文件"

# 进入项目目录
cd "$TARGET_DIR" || {
    echo "❌ 无法进入项目目录"
    exit 1
}

echo ""
echo "🔧 修复脚本权限..."
if [ -f "scripts/tools/fix-script-permissions.sh" ]; then
    bash scripts/tools/fix-script-permissions.sh
else
    echo "⚠️ 权限修复脚本不存在，手动设置权限..."
    find scripts -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
    chmod +x *.sh 2>/dev/null || true
fi

echo ""
echo "✅ 快速部署准备完成！"
echo ""
echo "📊 下载统计:"
echo "   项目大小: $(du -sh . | cut -f1)"
echo "   文件数量: $(find . -type f | wc -l)"
echo ""
echo "🚀 接下来请选择："
echo "   1) 运行主管理脚本: ./gost-manager.sh"
echo "   2) 直接部署:       ./deploy.sh"
echo "   3) 智能更新:       ./smart-update.sh"
echo ""
echo "💡 推荐使用主管理脚本，它包含所有功能的集成菜单"
