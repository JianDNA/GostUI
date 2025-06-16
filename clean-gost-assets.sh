#!/bin/bash

# 🧹 清理GOST资源文件脚本

echo "🧹 开始清理GOST资源文件..."

cd /home/y/vmshare/gost/GostUI

# 显示清理前的大小
echo "📊 清理前项目大小:"
du -sh .

echo ""
echo "📊 assets/gost 目录详情:"
du -sh backend/assets/gost/* 2>/dev/null || echo "目录不存在"

echo ""
echo "🗑️ 开始清理多余的GOST文件..."

# 检测服务器架构
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

echo "🔍 检测到系统: $OS, 架构: $ARCH"

# 确定需要保留的文件
if [ "$OS" = "linux" ]; then
    if [ "$ARCH" = "x86_64" ]; then
        KEEP_DIR="linux_amd64"
        KEEP_BINARY="gost"  # 通常是linux_amd64版本
        echo "✅ 保留Linux AMD64版本"
    elif [ "$ARCH" = "i386" ] || [ "$ARCH" = "i686" ]; then
        KEEP_DIR="linux_386"
        KEEP_BINARY="gost"
        echo "✅ 保留Linux 386版本"
    else
        KEEP_DIR="linux_amd64"  # 默认保留amd64
        KEEP_BINARY="gost"
        echo "⚠️ 未知架构，默认保留Linux AMD64版本"
    fi
else
    KEEP_DIR="linux_amd64"  # 默认保留Linux版本
    KEEP_BINARY="gost"
    echo "⚠️ 非Linux系统，默认保留Linux AMD64版本"
fi

# 进入assets/gost目录
cd backend/assets/gost

# 备份需要保留的文件
echo "💾 备份需要保留的文件..."
mkdir -p /tmp/gost_backup

# 保留基本文档
cp LICENSE README.md README_en.md /tmp/gost_backup/ 2>/dev/null || true

# 保留对应架构的二进制文件
if [ -d "$KEEP_DIR" ]; then
    cp -r "$KEEP_DIR" /tmp/gost_backup/
    echo "✅ 已备份 $KEEP_DIR"
fi

# 保留主要的gost二进制文件
if [ -f "$KEEP_BINARY" ]; then
    cp "$KEEP_BINARY" /tmp/gost_backup/
    echo "✅ 已备份 $KEEP_BINARY"
fi

# 删除所有文件
echo "🗑️ 删除所有GOST文件..."
rm -rf *

# 恢复需要保留的文件
echo "📦 恢复必要文件..."
cp -r /tmp/gost_backup/* .

# 清理临时备份
rm -rf /tmp/gost_backup

echo "✅ GOST资源文件清理完成"

# 检查bin目录
cd ../../../bin
echo ""
echo "📁 检查bin目录:"
ls -la

# 只保留Linux版本的gost
if [ -f "gost.exe" ]; then
    echo "🗑️ 删除Windows版本的gost.exe"
    rm -f gost.exe
fi

# 确保gost二进制文件有执行权限
if [ -f "gost" ]; then
    chmod +x gost
    echo "✅ 设置gost执行权限"
fi

# 返回项目根目录
cd ../../

echo ""
echo "📊 清理后项目大小:"
du -sh .

echo ""
echo "📁 清理后的assets/gost目录:"
ls -la backend/assets/gost/

echo ""
echo "📁 清理后的bin目录:"
ls -la backend/bin/

echo ""
echo "🎉 清理完成！项目大小显著减少"
echo ""
echo "💡 建议更新.gitignore，避免将来再次包含这些大文件:"
echo "   backend/assets/gost/*.tar.gz"
echo "   backend/assets/gost/*.zip"
echo "   backend/assets/gost/windows_*"
echo "   backend/assets/gost/linux_386  # 如果不需要32位支持"
