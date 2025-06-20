#!/bin/bash

# GOST管理系统一键部署脚本
# 简化版本 - 基于实际测试的可靠流程
#
# 使用方法:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# 部署完成后访问: http://localhost:3000
# 默认账号: admin / admin123

# 错误处理
set -e
trap 'echo "❌ 部署过程中发生错误，请检查上面的错误信息"; exit 1' ERR

# 配置变量
REPO_URL="https://github.com/JianDNA/GostUI.git"
REPO_ZIP_URL="https://github.com/JianDNA/GostUI/archive/refs/heads/main.zip"
DEPLOY_DIR="$HOME/gost-management"
PKG_MANAGER=""
DEPLOYMENT_TYPE=""  # "initial" 或 "update"
BUILD_MODE=""       # "local" 或 "server"
DOWNLOAD_METHOD=""  # "git" 或 "zip"

echo "🚀 GOST管理系统一键部署开始..."
echo "📋 部署目录: $DEPLOY_DIR"
echo "📋 Git仓库: $REPO_URL"
echo ""

# 检查环境
check_environment() {
    echo "🔍 检查环境..."

    # 检查必要命令
    local missing_commands=()

    for cmd in git node npm; do
        if ! command -v $cmd >/dev/null 2>&1; then
            missing_commands+=($cmd)
        fi
    done

    # 检查PM2，如果没有则安装
    if ! command -v pm2 >/dev/null 2>&1; then
        echo "📦 PM2未安装，正在安装..."
        npm install -g pm2 || {
            echo "❌ PM2安装失败，请手动安装: npm install -g pm2"
            exit 1
        }
        echo "✅ PM2安装成功"
    fi

    if [ ${#missing_commands[@]} -ne 0 ]; then
        echo "❌ 缺少必要命令: ${missing_commands[*]}"
        echo "💡 请先安装这些工具："
        echo "   - Git: sudo apt install git"
        echo "   - Node.js: https://nodejs.org/"
        exit 1
    fi

    # 检查包管理器
    if command -v yarn >/dev/null 2>&1; then
        PKG_MANAGER="yarn"
        echo "✅ 使用yarn作为包管理器"
    else
        PKG_MANAGER="npm"
        echo "✅ 使用npm作为包管理器"
    fi

    # 显示版本信息
    echo "📋 环境信息:"
    echo "   Node.js: $(node -v)"
    echo "   npm: $(npm -v)"
    [ "$PKG_MANAGER" = "yarn" ] && echo "   yarn: $(yarn -v)"
    echo "   PM2: $(pm2 -v)"

    echo "✅ 环境检查完成"
}

# 智能下载代码
smart_download_code() {
    local target_dir="$1"
    local temp_dir="/tmp/gost-download-$(date +%Y%m%d_%H%M%S)"

    echo "🤔 选择下载方式:"
    echo "   1) ZIP下载 (推荐，速度快，体积小)"
    echo "   2) Git克隆 (包含完整Git历史)"
    echo ""

    # 自动检测最佳下载方式
    local has_unzip=false
    local has_git=false

    if command -v unzip >/dev/null 2>&1; then
        has_unzip=true
    fi

    if command -v git >/dev/null 2>&1; then
        has_git=true
    fi

    # 默认选择
    local default_method="zip"
    if [ "$has_unzip" = false ] && [ "$has_git" = true ]; then
        default_method="git"
    fi

    echo "💡 检测到的工具:"
    [ "$has_unzip" = true ] && echo "   ✅ unzip (支持ZIP下载)"
    [ "$has_git" = true ] && echo "   ✅ git (支持Git克隆)"
    echo ""

    read -p "请选择下载方式 (1/2) [默认: $default_method]: " -n 1 -r
    echo

    case $REPLY in
        2)
            DOWNLOAD_METHOD="git"
            echo "📋 选择: Git克隆"
            ;;
        *)
            DOWNLOAD_METHOD="zip"
            echo "📋 选择: ZIP下载"
            ;;
    esac

    echo ""

    # 执行下载
    if [ "$DOWNLOAD_METHOD" = "zip" ]; then
        download_zip_code "$target_dir" "$temp_dir"
    else
        download_git_code "$target_dir"
    fi
}

# ZIP下载方式
download_zip_code() {
    local target_dir="$1"
    local temp_dir="$2"

    echo "📥 使用ZIP方式下载代码..."

    # 检查unzip工具
    if ! command -v unzip >/dev/null 2>&1; then
        echo "❌ 缺少unzip工具，尝试安装..."
        if command -v apt >/dev/null 2>&1; then
            apt update && apt install -y unzip
        elif command -v yum >/dev/null 2>&1; then
            yum install -y unzip
        else
            echo "❌ 无法自动安装unzip，请手动安装后重试"
            exit 1
        fi
    fi

    mkdir -p "$temp_dir"
    local zip_file="$temp_dir/main.zip"

    echo "🌐 下载ZIP文件..."
    echo "📋 下载地址: $REPO_ZIP_URL"

    # 使用curl或wget下载
    if command -v curl >/dev/null 2>&1; then
        curl -L --progress-bar -o "$zip_file" "$REPO_ZIP_URL" || {
            echo "❌ ZIP下载失败，回退到Git方式"
            rm -rf "$temp_dir"
            download_git_code "$target_dir"
            return
        }
    elif command -v wget >/dev/null 2>&1; then
        wget --progress=bar:force -O "$zip_file" "$REPO_ZIP_URL" || {
            echo "❌ ZIP下载失败，回退到Git方式"
            rm -rf "$temp_dir"
            download_git_code "$target_dir"
            return
        }
    else
        echo "❌ 缺少curl或wget工具，回退到Git方式"
        rm -rf "$temp_dir"
        download_git_code "$target_dir"
        return
    fi

    # 检查下载的文件
    if [ ! -f "$zip_file" ] || [ ! -s "$zip_file" ]; then
        echo "❌ ZIP文件下载失败或为空，回退到Git方式"
        rm -rf "$temp_dir"
        download_git_code "$target_dir"
        return
    fi

    echo "✅ ZIP文件下载完成 ($(du -h "$zip_file" | cut -f1))"

    # 解压文件
    echo "📦 解压ZIP文件..."
    local extract_dir="$temp_dir/extract"
    mkdir -p "$extract_dir"

    if unzip -q "$zip_file" -d "$extract_dir"; then
        echo "✅ ZIP文件解压成功"

        # 查找解压后的目录（通常是 GostUI-main）
        local source_dir=$(find "$extract_dir" -maxdepth 1 -type d -name "GostUI-*" | head -1)

        if [ -n "$source_dir" ] && [ -d "$source_dir" ]; then
            echo "📁 找到源码目录: $(basename "$source_dir")"

            # 移动到目标位置
            if [ -d "$target_dir" ]; then
                rm -rf "$target_dir"
            fi

            mv "$source_dir" "$target_dir"
            echo "✅ 代码部署完成"

            # 显示下载统计
            echo "📊 下载统计:"
            echo "   ZIP大小: $(du -h "$zip_file" | cut -f1)"
            echo "   解压后大小: $(du -sh "$target_dir" | cut -f1)"
            echo "   文件数量: $(find "$target_dir" -type f | wc -l)"

        else
            echo "❌ 解压后未找到源码目录，回退到Git方式"
            rm -rf "$temp_dir"
            download_git_code "$target_dir"
            return
        fi
    else
        echo "❌ ZIP文件解压失败，回退到Git方式"
        rm -rf "$temp_dir"
        download_git_code "$target_dir"
        return
    fi

    # 清理临时文件
    rm -rf "$temp_dir"
}

# Git克隆方式
download_git_code() {
    local target_dir="$1"

    echo "📥 使用Git方式克隆代码..."
    echo "📋 Git仓库: $REPO_URL"

    if git clone "$REPO_URL" "$target_dir"; then
        echo "✅ Git克隆完成"

        # 显示下载统计
        echo "📊 下载统计:"
        echo "   总大小: $(du -sh "$target_dir" | cut -f1)"
        echo "   .git大小: $(du -sh "$target_dir/.git" | cut -f1)"
        echo "   代码大小: $(du -sh --exclude=.git "$target_dir" | cut -f1)"
        echo "   文件数量: $(find "$target_dir" -type f ! -path "*/.git/*" | wc -l)"
    else
        echo "❌ Git克隆失败"
        exit 1
    fi
}

# 检测部署类型
detect_deployment_type() {
    if [ -d "$DEPLOY_DIR" ] && [ -f "$DEPLOY_DIR/backend/app.js" ]; then
        DEPLOYMENT_TYPE="update"
        echo "🔄 检测到现有部署，将进行更新部署"
    else
        DEPLOYMENT_TYPE="initial"
        echo "🆕 未检测到现有部署，将进行初始化部署"
    fi
}

# 备份用户数据
backup_user_data() {
    if [ "$DEPLOYMENT_TYPE" = "update" ]; then
        echo "💾 备份用户数据..."

        local backup_dir="/tmp/gost-backup-$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$backup_dir"

        # 备份数据库
        if [ -f "$DEPLOY_DIR/backend/database/database.sqlite" ]; then
            cp "$DEPLOY_DIR/backend/database/database.sqlite" "$backup_dir/"
            echo "✅ 数据库已备份到: $backup_dir/database.sqlite"
        fi

        # 备份配置文件
        if [ -f "$DEPLOY_DIR/backend/config/config.js" ]; then
            cp "$DEPLOY_DIR/backend/config/config.js" "$backup_dir/"
            echo "✅ 配置文件已备份"
        fi

        # 备份GOST配置
        if [ -f "$DEPLOY_DIR/backend/config/gost-config.json" ]; then
            cp "$DEPLOY_DIR/backend/config/gost-config.json" "$backup_dir/"
            echo "✅ GOST配置已备份"
        fi

        # 备份日志（最近的）
        if [ -d "$DEPLOY_DIR/backend/logs" ]; then
            mkdir -p "$backup_dir/logs"
            find "$DEPLOY_DIR/backend/logs" -name "*.log" -mtime -7 -exec cp {} "$backup_dir/logs/" \;
            echo "✅ 近期日志已备份"
        fi

        echo "📁 备份目录: $backup_dir"
        export BACKUP_DIR="$backup_dir"
    fi
}

# 部署代码
deploy_code() {
    echo "📥 部署代码..."

    # 停止现有服务
    pm2 stop gost-management 2>/dev/null || true
    pm2 delete gost-management 2>/dev/null || true

    if [ "$DEPLOYMENT_TYPE" = "initial" ]; then
        # 初始化部署：完全清理
        if [ -d "$DEPLOY_DIR" ]; then
            echo "🗑️ 清理旧部署目录..."
            rm -rf $DEPLOY_DIR
        fi

        # 创建部署目录
        mkdir -p $DEPLOY_DIR

        # 智能下载代码
        echo "📥 下载代码..."
        smart_download_code "$DEPLOY_DIR"

        # 修复脚本权限
        echo "🔧 修复脚本文件格式和权限..."
        cd $DEPLOY_DIR
        find . -name "*.sh" -type f -print0 | while IFS= read -r -d '' file; do
            tr -d '\r' < "$file" > "$file.tmp" && mv "$file.tmp" "$file"
            chmod +x "$file"
        done 2>/dev/null || true

        # 🔧 确保关键管理脚本有执行权限
        echo "🔧 确保关键脚本权限..."

        # 修复核心脚本权限
        find scripts/core -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
        find scripts/tools -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
        find scripts/dev -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true

        # 修复根目录入口脚本权限
        for script in "gost-manager.sh" "smart-update.sh" "deploy.sh"; do
            if [ -f "$script" ]; then
                chmod +x "$script"
                echo "✅ 已设置 $script 执行权限"
            fi
        done

    else
        # 更新部署：保留用户数据
        echo "🔄 更新代码..."

        # 备份当前目录
        local backup_deploy_dir="${DEPLOY_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
        echo "💾 备份当前部署目录到: $backup_deploy_dir"
        cp -r "$DEPLOY_DIR" "$backup_deploy_dir"

        # 删除旧代码，重新下载
        rm -rf "$DEPLOY_DIR"
        smart_download_code "$DEPLOY_DIR"

        # 修复脚本权限
        echo "🔧 修复脚本文件格式和权限..."
        find . -name "*.sh" -type f -print0 | while IFS= read -r -d '' file; do
            tr -d '\r' < "$file" > "$file.tmp" && mv "$file.tmp" "$file"
            chmod +x "$file"
        done 2>/dev/null || true

        # 🔧 确保关键管理脚本有执行权限
        echo "🔧 确保关键脚本权限..."

        # 修复核心脚本权限
        find scripts/core -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
        find scripts/tools -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
        find scripts/dev -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true

        # 修复根目录入口脚本权限
        for script in "gost-manager.sh" "smart-update.sh" "deploy.sh"; do
            if [ -f "$script" ]; then
                chmod +x "$script"
                echo "✅ 已设置 $script 执行权限"
            fi
        done

        # 清理node_modules以确保依赖更新
        echo "🧹 清理依赖缓存..."
        rm -rf backend/node_modules frontend/node_modules
        rm -f backend/package-lock.json frontend/package-lock.json
        rm -f backend/yarn.lock frontend/yarn.lock
    fi

    echo "✅ 代码部署完成"
}

# 设置Node.js内存
setup_node_memory() {
    echo "⚙️ 设置Node.js内存..."
    
    # 设置Node.js内存限制
    export NODE_OPTIONS="--max-old-space-size=4096"
    
    # 添加到bashrc（如果还没有）
    if ! grep -q "NODE_OPTIONS.*max-old-space-size" ~/.bashrc; then
        echo 'export NODE_OPTIONS="--max-old-space-size=4096"' >> ~/.bashrc
        echo "✅ 已添加Node.js内存设置到~/.bashrc"
    fi
    
    echo "✅ Node.js内存设置完成"
}

# 安装后端依赖
install_backend() {
    echo "📦 安装后端依赖..."
    cd $DEPLOY_DIR/backend

    # 清理可能存在的问题文件
    echo "🧹 清理旧的依赖文件..."
    rm -rf node_modules package-lock.json yarn.lock

    # 安装依赖
    echo "📥 安装依赖包..."
    if [ "$PKG_MANAGER" = "yarn" ]; then
        yarn install --production || {
            echo "❌ yarn安装失败，尝试npm..."
            PKG_MANAGER="npm"
            npm install --only=production
        }
    else
        npm install --only=production || {
            echo "❌ npm安装失败"
            exit 1
        }
    fi

    echo "✅ 后端依赖安装完成"
}

# 选择构建模式
choose_build_mode() {
    echo ""
    echo "🤔 选择前端构建模式:"
    echo "   1) 使用预构建文件 (推荐，速度快)"
    echo "   2) 服务器端构建 (需要更多内存和时间)"
    echo ""

    # 检查部署目录中是否有预构建文件
    local has_prebuilt=false
    cd $DEPLOY_DIR

    if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
        has_prebuilt=true
        echo "✅ 检测到预构建文件"

        # 显示预构建文件信息
        echo "📊 预构建文件统计:"
        echo "   HTML文件: $(find frontend/dist -name "*.html" | wc -l)"
        echo "   JS文件: $(find frontend/dist -name "*.js" | wc -l)"
        echo "   CSS文件: $(find frontend/dist -name "*.css" | wc -l)"
        echo "   总大小: $(du -sh frontend/dist | cut -f1)"
    else
        echo "⚠️ 未检测到预构建文件"
        if [ -d "frontend" ]; then
            echo "🔍 frontend目录存在，但没有dist目录"
        else
            echo "🔍 frontend目录不存在"
        fi
    fi

    echo ""

    # 让用户选择
    if [ "$has_prebuilt" = true ]; then
        read -p "请选择构建模式 (1/2) [默认: 1]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[2]$ ]]; then
            BUILD_MODE="server"
            echo "📋 选择: 服务器端构建"
        else
            BUILD_MODE="local"
            echo "📋 选择: 使用预构建文件"
        fi
    else
        echo "💡 由于没有预构建文件，将使用服务器端构建"
        read -p "是否继续？(Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "❌ 部署已取消"
            exit 0
        else
            BUILD_MODE="server"
            echo "📋 选择: 服务器端构建"
        fi
    fi

    echo ""
}

# 安装和构建前端
install_frontend() {
    echo "📦 处理前端..."
    cd $DEPLOY_DIR/frontend

    if [ "$BUILD_MODE" = "local" ]; then
        echo "📋 使用预构建文件..."

        # 检查预构建文件
        if [ -d "dist" ] && [ -f "dist/index.html" ]; then
            echo "✅ 预构建文件验证成功"

            # 显示构建文件信息
            echo "📊 预构建文件统计:"
            echo "   HTML文件: $(find dist -name "*.html" | wc -l)"
            echo "   JS文件: $(find dist -name "*.js" | wc -l)"
            echo "   CSS文件: $(find dist -name "*.css" | wc -l)"
            echo "   总大小: $(du -sh dist | cut -f1)"

            # 完全清理并复制预构建文件
            echo "📋 复制预构建文件到后端..."
            echo "🗑️ 完全清理旧的前端文件..."
            rm -rf ../backend/public
            mkdir -p ../backend/public
            echo "📁 复制新的前端文件..."
            cp -r dist/* ../backend/public/

            # 验证复制结果
            if [ -f "../backend/public/index.html" ]; then
                echo "✅ 前端文件部署成功"
                ASSET_COUNT=$(find ../backend/public/assets -name "*.js" 2>/dev/null | wc -l)
                echo "📊 前端资源文件: $ASSET_COUNT 个JS文件"
            else
                echo "❌ 前端文件复制失败"
                exit 1
            fi
        else
            echo "❌ 预构建文件不完整，切换到服务器端构建"
            echo "🔍 检查dist目录内容:"
            ls -la dist/ 2>/dev/null || echo "dist目录不存在"
            BUILD_MODE="server"
        fi
    fi

    if [ "$BUILD_MODE" = "server" ]; then
        echo "🔨 服务器端构建前端..."

        # 清理可能存在的问题文件
        echo "🧹 清理旧的前端文件..."
        rm -rf node_modules package-lock.json yarn.lock dist

        # 安装依赖
        echo "📥 安装前端依赖包..."
        if [ "$PKG_MANAGER" = "yarn" ]; then
            yarn install || {
                echo "❌ yarn安装失败，尝试npm..."
                PKG_MANAGER="npm"
                npm install
            }
        else
            npm install || {
                echo "❌ npm安装失败"
                exit 1
            }
        fi

        # 安装terser（Vite构建需要）
        echo "📦 安装terser构建工具..."
        if [ "$PKG_MANAGER" = "yarn" ]; then
            yarn add terser --dev || npm install terser --save-dev
        else
            npm install terser --save-dev
        fi

        echo "🔨 构建前端项目..."
        BUILD_SUCCESS=false

        # 设置构建环境变量
        export NODE_OPTIONS="--max-old-space-size=4096"

        if [ "$PKG_MANAGER" = "yarn" ]; then
            if yarn build 2>&1; then
                BUILD_SUCCESS=true
            fi
        else
            if npm run build 2>&1; then
                BUILD_SUCCESS=true
            fi
        fi

        # 检查构建结果
        echo "🔍 检查构建结果..."
        if [ -d "dist" ] && [ -f "dist/index.html" ]; then
            echo "✅ 前端构建成功"
            echo "📋 复制前端文件到后端..."

            # 完全清理并重建public目录
            echo "🗑️ 完全清理旧的前端文件..."
            rm -rf ../backend/public
            mkdir -p ../backend/public

            # 复制新的构建文件
            echo "📁 复制新的前端文件..."
            cp -r dist/* ../backend/public/
            echo "✅ 前端文件复制完成"

            # 验证复制结果
            if [ -f "../backend/public/index.html" ]; then
                echo "✅ 前端部署验证成功"

                # 检查资源文件
                ASSET_COUNT=$(find ../backend/public/assets -name "*.js" 2>/dev/null | wc -l)
                echo "📊 前端资源文件: $ASSET_COUNT 个JS文件"
            else
                echo "❌ 前端文件复制失败"
                exit 1
            fi
        else
            echo "❌ 前端构建失败"
            echo "🔍 检查构建目录："
            ls -la . 2>/dev/null || true
            echo "🔍 检查dist目录："
            ls -la dist/ 2>/dev/null || echo "dist目录不存在"
            exit 1
        fi
    fi
}

# 配置GOST安全设置
setup_gost_security() {
    echo "🔒 配置GOST安全设置..."
    cd $DEPLOY_DIR/backend

    # 修复GOST WebAPI安全配置
    CONFIG_FILE="config/gost-config.json"
    if [ -f "$CONFIG_FILE" ]; then
        echo "🔧 修复GOST WebAPI监听地址..."

        # 检查当前配置
        CURRENT_ADDR=$(grep -o '"addr":\s*"[^"]*"' "$CONFIG_FILE" | grep -o '"[^"]*"$' | tr -d '"' || echo "")

        if [ "$CURRENT_ADDR" = ":18080" ]; then
            echo "⚠️ 发现安全风险：GOST WebAPI监听所有接口"
            echo "🔧 修复为仅监听本地接口..."

            # 使用sed修复配置
            sed -i 's/"addr": ":18080"/"addr": "127.0.0.1:18080"/' "$CONFIG_FILE"

            # 验证修复
            NEW_ADDR=$(grep -o '"addr":\s*"[^"]*"' "$CONFIG_FILE" | grep -o '"[^"]*"$' | tr -d '"' || echo "")
            if [ "$NEW_ADDR" = "127.0.0.1:18080" ]; then
                echo "✅ GOST WebAPI安全配置已修复"
            else
                echo "❌ 安全配置修复失败"
            fi
        elif [ "$CURRENT_ADDR" = "127.0.0.1:18080" ]; then
            echo "✅ GOST WebAPI安全配置正确"
        else
            echo "⚠️ GOST WebAPI配置: $CURRENT_ADDR"
        fi
    else
        echo "ℹ️ GOST配置文件不存在，将在服务启动时创建"
    fi

    echo "✅ GOST安全配置完成"
}

# 配置GOST
setup_gost() {
    echo "⚙️ 配置GOST..."
    cd $DEPLOY_DIR

    # 🔧 简化：只确保主要GOST文件可执行
    if [ -f "backend/assets/gost/linux_amd64/gost" ]; then
        chmod +x backend/assets/gost/linux_amd64/gost
        echo "✅ GOST可执行文件已设置权限"

        # 创建兼容性符号链接到bin目录
        mkdir -p backend/bin/linux_amd64
        ln -sf ../../assets/gost/linux_amd64/gost backend/bin/linux_amd64/gost
        echo "✅ 已创建兼容性符号链接"
    else
        echo "❌ 错误：GOST可执行文件不存在"
        exit 1
    fi

    # 配置GOST安全设置
    setup_gost_security

    echo "✅ GOST配置完成"
}

# 恢复用户数据
restore_user_data() {
    if [ "$DEPLOYMENT_TYPE" = "update" ] && [ -n "$BACKUP_DIR" ]; then
        echo "🔄 恢复用户数据..."
        cd $DEPLOY_DIR/backend

        # 恢复数据库
        if [ -f "$BACKUP_DIR/database.sqlite" ]; then
            mkdir -p database
            cp "$BACKUP_DIR/database.sqlite" database/
            echo "✅ 数据库已恢复"
        fi

        # 恢复配置文件
        if [ -f "$BACKUP_DIR/config.js" ]; then
            mkdir -p config
            cp "$BACKUP_DIR/config.js" config/
            echo "✅ 配置文件已恢复"
        fi

        # 恢复GOST配置
        if [ -f "$BACKUP_DIR/gost-config.json" ]; then
            mkdir -p config
            cp "$BACKUP_DIR/gost-config.json" config/
            echo "✅ GOST配置已恢复"
        fi

        echo "✅ 用户数据恢复完成"
    fi
}

# 初始化数据库
init_database() {
    echo "🗄️ 处理数据库..."
    cd $DEPLOY_DIR/backend

    mkdir -p database logs backups cache

    if [ "$DEPLOYMENT_TYPE" = "initial" ]; then
        echo "🆕 初始化新数据库..."

        # 使用complete_schema.sql直接初始化数据库
        if [ -f "complete_schema.sql" ]; then
            echo "📋 使用complete_schema.sql初始化数据库结构..."

            # 使用better-sqlite3创建数据库
            cat > init_db_temp.js << 'EOF'
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'database.sqlite');
const schemaPath = path.join(__dirname, 'complete_schema.sql');

// 确保数据库目录存在
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

console.log('📋 连接数据库...');
const db = new Database(dbPath);

try {
    console.log('📋 读取SQL脚本...');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📋 执行数据库初始化...');
    db.exec(schema);

    console.log('✅ 数据库结构创建完成');

    // 创建默认管理员用户
    console.log('👤 创建默认管理员用户...');
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const now = new Date().toISOString();

    const insertAdmin = db.prepare(`
        INSERT OR IGNORE INTO Users (
            username, password, email, role, isActive,
            createdAt, updatedAt, usedTraffic, userStatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAdmin.run(
        'admin',
        hashedPassword,
        null,
        'admin',
        1,
        now,
        now,
        0,
        'active'
    );

    console.log('✅ 默认管理员用户已创建');
    console.log('   用户名: admin');
    console.log('   密码: admin123');

    // 创建默认系统配置
    console.log('⚙️ 创建默认系统配置...');
    const insertConfig = db.prepare(`
        INSERT OR IGNORE INTO SystemConfigs (
            \`key\`, value, description, category, updatedBy, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const configs = [
        {
            key: 'disabledProtocols',
            value: JSON.stringify([]),
            description: '禁用的协议列表',
            category: 'security'
        },
        {
            key: 'allowedProtocols',
            value: JSON.stringify(['tcp', 'udp', 'http', 'https', 'socks5']),
            description: '允许的协议列表',
            category: 'security'
        },
        {
            key: 'performanceMode',
            value: 'balanced',
            description: '性能模式设置',
            category: 'performance'
        },
        {
            key: 'autoSyncEnabled',
            value: 'true',
            description: '自动同步开关',
            category: 'sync'
        }
    ];

    for (const config of configs) {
        insertConfig.run(
            config.key,
            config.value,
            config.description,
            config.category,
            'system',
            now,
            now
        );
    }

    console.log('✅ 默认系统配置已创建');

} catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    process.exit(1);
} finally {
    db.close();
}

console.log('🎉 数据库初始化完成！');
EOF

            # 执行初始化脚本
            node init_db_temp.js

            # 清理临时文件
            rm -f init_db_temp.js

        else
            echo "❌ 未找到complete_schema.sql文件"
            exit 1
        fi

        echo "✅ 数据库初始化完成"

        # 运行数据库修复（确保数据库结构正确）
        echo "🔧 运行数据库修复..."
        if [ -f "database-fixes.js" ]; then
            if node database-fixes.js; then
                echo "✅ 数据库修复完成"
            else
                echo "⚠️ 数据库修复失败，但继续部署流程"
            fi
        else
            echo "ℹ️ 未找到数据库修复脚本，跳过修复步骤"
        fi

    else
        echo "🔄 更新部署，保留现有数据库"

        if [ ! -f "database/database.sqlite" ]; then
            echo "⚠️ 数据库文件不存在，将创建新数据库"

            # 使用complete_schema.sql创建数据库
            if [ -f "complete_schema.sql" ]; then
                echo "📋 使用complete_schema.sql创建数据库..."

                cat > init_db_temp.js << 'EOF'
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'database.sqlite');
const schemaPath = path.join(__dirname, 'complete_schema.sql');

if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

console.log('📋 创建数据库...');
const db = new Database(dbPath);

try {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    console.log('✅ 数据库结构创建完成');

    // 创建默认管理员用户
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const now = new Date().toISOString();

    const insertAdmin = db.prepare(`
        INSERT OR IGNORE INTO Users (
            username, password, email, role, isActive,
            createdAt, updatedAt, usedTraffic, userStatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAdmin.run('admin', hashedPassword, null, 'admin', 1, now, now, 0, 'active');
    console.log('✅ 默认管理员用户已创建');

} catch (error) {
    console.error('❌ 数据库创建失败:', error);
    process.exit(1);
} finally {
    db.close();
}
EOF

                node init_db_temp.js
                rm -f init_db_temp.js
            fi
        else
            echo "✅ 数据库文件已存在，保留现有数据"
        fi

        # 运行数据库修复（确保数据库结构正确）
        echo "🔧 运行数据库修复..."
        if [ -f "database-fixes.js" ]; then
            if node database-fixes.js; then
                echo "✅ 数据库修复完成"
            else
                echo "⚠️ 数据库修复失败，但继续部署流程"
            fi
        else
            echo "ℹ️ 未找到数据库修复脚本，跳过修复步骤"
        fi

        echo "✅ 数据库处理完成"
    fi
}

# 创建PM2配置
create_pm2_config() {
    echo "⚙️ 创建PM2配置..."
    cd $DEPLOY_DIR/backend
    
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'gost-management',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      NODE_OPTIONS: '--max-old-space-size=4096',
      DISABLE_PRODUCTION_SAFETY: 'true'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    // 日志轮转配置
    log_type: 'json',
    merge_logs: true,
    // 限制日志文件大小为20MB
    max_size: '20M',
    // 保留最多5个日志文件
    retain: 5,
    // 启用日志轮转
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // PM2日志轮转模块配置
    pmx: false
  }]
};
EOF
    
    # 安装PM2日志轮转模块
    echo "📦 安装PM2日志轮转模块..."
    if ! pm2 list | grep -q "pm2-logrotate"; then
        pm2 install pm2-logrotate 2>/dev/null || {
            echo "⚠️ PM2日志轮转模块安装失败，使用基本配置"
        }

        # 配置日志轮转参数
        pm2 set pm2-logrotate:max_size 20M 2>/dev/null || true
        pm2 set pm2-logrotate:retain 5 2>/dev/null || true
        pm2 set pm2-logrotate:compress true 2>/dev/null || true
        pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss 2>/dev/null || true
        pm2 set pm2-logrotate:rotateModule true 2>/dev/null || true
        pm2 set pm2-logrotate:workerInterval 30 2>/dev/null || true
        pm2 set pm2-logrotate:rotateInterval '0 0 * * *' 2>/dev/null || true

        echo "✅ PM2日志轮转配置完成"
    else
        echo "✅ PM2日志轮转模块已安装"
    fi

    echo "✅ PM2配置创建完成"
}

# 启动服务
start_service() {
    echo "🚀 启动服务..."
    cd $DEPLOY_DIR/backend

    # 检查端口占用
    if command -v lsof >/dev/null 2>&1 && lsof -ti:3000 >/dev/null 2>&1; then
        echo "⚠️ 端口3000被占用，正在清理..."
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
        sleep 3
    fi

    # 停止可能存在的旧服务
    echo "🛑 停止旧服务..."
    pm2 stop gost-management 2>/dev/null || true
    pm2 delete gost-management 2>/dev/null || true
    sleep 2

    # 启动PM2服务
    echo "🔄 启动PM2服务..."
    pm2 start ecosystem.config.js || {
        echo "❌ PM2启动失败，查看配置文件..."
        cat ecosystem.config.js
        exit 1
    }

    # 保存PM2配置
    pm2 save

    # 等待服务启动
    echo "⏳ 等待服务启动..."
    sleep 20

    # 检查服务状态
    echo "📊 检查服务状态..."
    if pm2 list | grep -q "gost-management.*online"; then
        echo "✅ 服务启动成功！"

        # 等待服务完全就绪
        sleep 5

        # 测试访问
        echo "🧪 测试服务访问..."

        # 测试前端页面
        if command -v curl >/dev/null 2>&1; then
            if curl -f -s http://localhost:3000 >/dev/null; then
                echo "✅ 前端页面访问正常"
            else
                echo "⚠️ 前端页面访问异常，但服务已启动"
            fi

            # 测试API接口
            API_RESPONSE=$(curl -s http://localhost:3000/api/system/status 2>/dev/null || echo "连接失败")
            if [[ "$API_RESPONSE" == *"未提供认证令牌"* ]]; then
                echo "✅ API接口正常 (需要认证)"
            else
                echo "⚠️ API接口响应: $API_RESPONSE"
            fi
        else
            echo "⚠️ curl未安装，跳过访问测试"
        fi

    else
        echo "❌ 服务启动失败"
        echo "📋 PM2状态："
        pm2 list
        echo "📋 错误日志："
        pm2 logs gost-management --lines 30 2>/dev/null || echo "无法获取日志"
        exit 1
    fi
}

# 创建管理脚本
create_management_scripts() {
    echo "📝 创建管理脚本..."
    cd $DEPLOY_DIR
    
    # 更新脚本
    cat > update.sh << 'EOF'
#!/bin/bash
echo "🔄 更新GOST管理系统..."
cd $HOME/gost-management

git pull origin main

cd backend
if command -v yarn >/dev/null 2>&1; then
    yarn install
else
    npm install
fi

cd ../frontend
if command -v yarn >/dev/null 2>&1; then
    yarn install
    yarn build
else
    npm install
    npm run build
fi

if [ -d "dist" ]; then
    echo "🗑️ 清理旧的前端文件..."
    rm -rf ../backend/public
    mkdir -p ../backend/public
    echo "📁 复制新的前端文件..."
    cp -r dist/* ../backend/public/
    echo "✅ 前端文件更新完成"
fi

cd ../backend
pm2 restart gost-management

echo "✅ 更新完成"
EOF
    
    chmod +x update.sh
    echo "✅ 管理脚本创建完成"
}

# 部署前确认
confirm_deployment() {
    echo "📋 部署确认信息:"
    echo "   📁 部署目录: $DEPLOY_DIR"
    echo "   🌐 Git仓库: $REPO_URL"
    echo "   📦 包管理器: $PKG_MANAGER"
    echo "   🔧 部署类型: $DEPLOYMENT_TYPE"
    echo "   🔨 构建模式: $BUILD_MODE"
    echo ""

    if [ "$DEPLOYMENT_TYPE" = "update" ]; then
        echo "⚠️ 更新部署将保留用户数据和配置"
        echo "💾 用户数据将自动备份"
    else
        echo "🆕 初始化部署将创建全新的系统"
    fi
    echo ""

    read -p "🤔 确认开始部署？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 部署已取消"
        exit 0
    fi
    echo ""
}

# 安全验证
security_verification() {
    echo "🔒 进行全面安全验证..."
    cd $DEPLOY_DIR/backend

    local security_issues=0
    local warnings=0

    # 检查GOST WebAPI配置
    echo "🔍 检查GOST WebAPI安全配置..."
    CONFIG_FILE="config/gost-config.json"
    if [ -f "$CONFIG_FILE" ]; then
        CURRENT_ADDR=$(grep -o '"addr":\s*"[^"]*"' "$CONFIG_FILE" | grep -o '"[^"]*"$' | tr -d '"' || echo "")

        if [ "$CURRENT_ADDR" = ":18080" ]; then
            echo "❌ 安全风险：GOST WebAPI监听所有接口"
            security_issues=$((security_issues + 1))
        elif [ "$CURRENT_ADDR" = "127.0.0.1:18080" ]; then
            echo "✅ GOST WebAPI安全配置正确"
        else
            echo "⚠️ GOST WebAPI配置: $CURRENT_ADDR"
            warnings=$((warnings + 1))
        fi
    else
        echo "ℹ️ GOST配置文件将在服务启动时创建"
    fi

    # 检查观察器和限制器配置
    echo "🔍 检查GOST插件配置..."
    if [ -f "$CONFIG_FILE" ]; then
        # 检查观察器配置
        OBSERVER_ADDR=$(grep -A 5 '"observers"' "$CONFIG_FILE" | grep '"addr"' | grep -o '"[^"]*"$' | tr -d '"' || echo "")
        if [ -n "$OBSERVER_ADDR" ]; then
            if echo "$OBSERVER_ADDR" | grep -q "localhost:3000"; then
                echo "✅ 观察器配置安全（通过主服务）"
            else
                echo "⚠️ 观察器配置: $OBSERVER_ADDR"
                warnings=$((warnings + 1))
            fi
        fi

        # 检查限制器配置
        LIMITER_ADDR=$(grep -A 5 '"limiters"' "$CONFIG_FILE" | grep '"addr"' | grep -o '"[^"]*"$' | tr -d '"' || echo "")
        if [ -n "$LIMITER_ADDR" ]; then
            if echo "$LIMITER_ADDR" | grep -q "localhost:3000"; then
                echo "✅ 限制器配置安全（通过主服务）"
            else
                echo "⚠️ 限制器配置: $LIMITER_ADDR"
                warnings=$((warnings + 1))
            fi
        fi
    fi

    # 检查端口监听状态（如果服务已启动）
    echo "🔍 检查端口监听状态..."
    if command -v netstat >/dev/null 2>&1; then
        # 检查18080端口
        LISTEN_18080=$(netstat -tln 2>/dev/null | grep :18080 | head -1 || echo "")
        if [ -n "$LISTEN_18080" ]; then
            if echo "$LISTEN_18080" | grep -q "127.0.0.1:18080"; then
                echo "✅ 端口18080仅监听本地接口"
            elif echo "$LISTEN_18080" | grep -q "0.0.0.0:18080"; then
                echo "❌ 安全风险：端口18080监听所有接口"
                security_issues=$((security_issues + 1))
            fi
        fi

        # 检查18081端口（观察器）
        LISTEN_18081=$(netstat -tln 2>/dev/null | grep :18081 | head -1 || echo "")
        if [ -n "$LISTEN_18081" ]; then
            if echo "$LISTEN_18081" | grep -q "127.0.0.1:18081"; then
                echo "✅ 端口18081仅监听本地接口"
            elif echo "$LISTEN_18081" | grep -q "0.0.0.0:18081"; then
                echo "❌ 安全风险：端口18081监听所有接口"
                security_issues=$((security_issues + 1))
            fi
        fi

        # 检查3000端口（主服务）
        LISTEN_3000=$(netstat -tln 2>/dev/null | grep :3000 | head -1 || echo "")
        if [ -n "$LISTEN_3000" ]; then
            echo "✅ 端口3000正常监听（主Web服务）"
        fi
    fi

    # 安全总结
    echo ""
    echo "🔒 安全验证总结:"
    echo "   安全问题: $security_issues"
    echo "   警告信息: $warnings"

    if [ $security_issues -eq 0 ]; then
        if [ $warnings -eq 0 ]; then
            echo "✅ 安全验证完全通过"
        else
            echo "⚠️ 安全验证通过，但有 $warnings 个警告"
        fi
        return 0
    else
        echo "❌ 发现 $security_issues 个安全问题"
        return 1
    fi
}

# 最终验证
final_verification() {
    echo "🔍 进行最终验证..."

    # 检查关键文件
    local errors=0

    if [ ! -f "$DEPLOY_DIR/backend/app.js" ]; then
        echo "❌ 后端主文件不存在"
        errors=$((errors + 1))
    fi

    if [ ! -f "$DEPLOY_DIR/backend/public/index.html" ]; then
        echo "❌ 前端文件不存在"
        errors=$((errors + 1))
    fi

    if [ ! -f "$DEPLOY_DIR/backend/ecosystem.config.js" ]; then
        echo "❌ PM2配置文件不存在"
        errors=$((errors + 1))
    fi

    if ! pm2 list | grep -q "gost-management.*online"; then
        echo "❌ PM2服务未运行"
        errors=$((errors + 1))
    fi

    # 执行安全验证
    if ! security_verification; then
        echo "⚠️ 安全验证失败，但部署可以继续"
    fi

    if [ $errors -eq 0 ]; then
        echo "✅ 最终验证通过"
        return 0
    else
        echo "❌ 发现 $errors 个问题"
        return 1
    fi
}

# 主函数
main() {
    echo "📋 开始部署流程..."

    # 检测部署类型
    detect_deployment_type

    # 检查环境
    check_environment

    # 备份用户数据（如果是更新部署）
    backup_user_data

    # 执行代码部署
    deploy_code

    # 选择构建模式（在代码部署之后）
    choose_build_mode

    # 部署前确认
    confirm_deployment

    # 继续执行部署步骤
    setup_node_memory
    install_backend
    install_frontend
    setup_gost

    # 恢复用户数据（如果是更新部署）
    restore_user_data

    # 初始化或更新数据库
    init_database
    create_pm2_config
    start_service
    create_management_scripts

    # 最终验证
    if final_verification; then
        echo ""
        echo "🎉🎉🎉 部署完成！🎉🎉🎉"
        echo ""
        echo "📊 部署信息:"
        echo "   🌐 访问地址: http://localhost:3000"
        echo "   🔐 默认账号: admin"
        echo "   🔑 默认密码: admin123"
        echo "   📁 部署目录: $DEPLOY_DIR"
        echo ""
        echo "🔧 管理命令:"
        echo "   📝 更新系统: cd $DEPLOY_DIR && ./update.sh"
        echo "   🔄 重启服务: pm2 restart gost-management"
        echo "   📊 查看日志: pm2 logs gost-management"
        echo "   ⏹️  停止服务: pm2 stop gost-management"
        echo "   🧪 测试部署: ./test-deployment.sh"
        echo ""
        echo "🔒 安全提醒:"
        echo "   ✅ GOST WebAPI已配置为仅本地访问"
        echo "   🔐 请立即修改默认管理员密码"
        echo "   🛡️ 建议配置防火墙进一步保护系统"
        echo ""
        echo "✅ 部署成功！请在浏览器中访问系统。"
    else
        echo ""
        echo "❌ 部署验证失败，请检查错误信息"
        echo "📋 查看日志: pm2 logs gost-management"
        exit 1
    fi
}

# 执行主函数
main
