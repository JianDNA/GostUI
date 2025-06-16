#!/bin/bash

# Git提交脚本 - 包含前端构建产物
# 用于在提交代码时同时提交构建结果

set -e

echo "📝 Git提交 (包含前端构建)"

# 检查是否在Git仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ 当前目录不是Git仓库"
    exit 1
fi

# 检查是否有未提交的更改
if git diff --quiet && git diff --cached --quiet; then
    echo "⚠️ 没有检测到代码更改"
    read -p "🤔 是否仅重新构建前端？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 操作已取消"
        exit 0
    fi
    BUILD_ONLY=true
else
    BUILD_ONLY=false
fi

# 检查前端目录
if [ ! -d "frontend" ]; then
    echo "❌ 未找到frontend目录"
    exit 1
fi

# 进入前端目录并构建
echo "🔨 构建前端..."
cd frontend

# 检查package.json
if [ ! -f "package.json" ]; then
    echo "❌ 未找到frontend/package.json"
    exit 1
fi

# 设置Node.js内存
export NODE_OPTIONS="--max-old-space-size=4096"

# 构建前端
if command -v yarn >/dev/null 2>&1 && [ -f "yarn.lock" ]; then
    echo "📦 使用yarn构建..."
    yarn build
elif command -v npm >/dev/null 2>&1; then
    echo "📦 使用npm构建..."
    npm run build
else
    echo "❌ 未找到npm或yarn"
    exit 1
fi

# 检查构建结果
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "❌ 前端构建失败"
    exit 1
fi

echo "✅ 前端构建成功"

# 返回根目录
cd ..

# 添加所有更改到Git
echo "📤 添加文件到Git..."

if [ "$BUILD_ONLY" = true ]; then
    # 仅添加构建文件
    git add frontend/dist/

    if git diff --cached --quiet; then
        echo "⚠️ 构建文件没有变更"
        exit 0
    fi

    # 提交构建文件
    COMMIT_MSG="build: 更新前端构建产物 $(date '+%Y-%m-%d %H:%M:%S')"
    git commit -m "$COMMIT_MSG"
    echo "✅ 构建文件已提交"
else
    # 添加所有更改
    git add .

    # 获取提交信息
    echo ""
    echo "📝 请输入提交信息:"
    read -p "提交信息: " COMMIT_MSG

    if [ -z "$COMMIT_MSG" ]; then
        echo "❌ 提交信息不能为空"
        exit 1
    fi

    # 提交所有更改
    git commit -m "$COMMIT_MSG"
    echo "✅ 代码和构建文件已提交"
fi

# 询问是否推送
echo ""
read -p "🚀 是否推送到远程仓库？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push
    echo "✅ 已推送到远程仓库"
else
    echo "💡 稍后可以使用 'git push' 推送到远程仓库"
fi

echo ""
echo "🎉 操作完成！"
echo "💡 现在可以在服务器上使用预构建模式部署"
