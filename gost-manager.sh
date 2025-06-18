#!/bin/bash

# GOST管理系统 - 主入口脚本
# 提供一键部署、智能更新、配置管理等功能

echo "🚀 GOST管理系统 - 主控制台"
echo "================================"
echo "💡 选择您需要的操作"
echo ""

# 配置文件路径
CONFIG_DIR="/root/.gost-manager"
PORT_CONFIG_FILE="$CONFIG_DIR/port.conf"
BACKUP_DIR="/root/gost-backups"

# 确保配置目录存在
mkdir -p "$CONFIG_DIR"

# 获取当前配置的端口
get_current_port() {
    if [ -f "$PORT_CONFIG_FILE" ]; then
        cat "$PORT_CONFIG_FILE"
    else
        echo "3000"
    fi
}

# 保存端口配置
save_port_config() {
    local port=$1
    echo "$port" > "$PORT_CONFIG_FILE"
    echo "✅ 端口配置已保存到: $PORT_CONFIG_FILE"
}

# 显示主菜单
show_menu() {
    local current_port=$(get_current_port)
    echo "🤔 请选择操作:"
    echo "   1) 一键部署 (推荐)"
    echo "   2) 智能更新 (推荐) [默认]"
    echo "   3) 手动更新 (如果智能更新异常或者失败，请尝试本方法)"
    echo "   4) 修改端口 (当前: $current_port)"
    echo "   5) 修改管理员密码"
    echo "   6) 备份数据库和配置文件 (多次备份将覆盖)"
    echo "   7) 还原数据库和备份文件"
    echo "   8) 退出"
    echo ""
}

# 确认操作
confirm_action() {
    local action=$1
    echo "⚠️ 确认要执行: $action ?"
    echo "💡 此操作可能会影响当前运行的服务"
    echo ""
    read -p "请输入 'yes' 确认继续: " -r
    if [ "$REPLY" != "yes" ]; then
        echo "❌ 操作已取消"
        return 1
    fi
    return 0
}

# 1. 一键部署
deploy_system() {
    echo "🚀 一键部署 GOST管理系统"
    echo "================================"

    # 保存当前目录
    local original_dir=$(pwd)

    if ! confirm_action "一键部署"; then
        return 1
    fi

    echo "🧹 清理旧环境..."
    cd ~

    # 停止可能运行的服务
    pm2 stop gost-management 2>/dev/null || true
    pm2 delete gost-management 2>/dev/null || true

    # 删除原有目录
    rm -rf GostUI
    rm -rf gost-management

    echo "✅ 旧环境清理完成"
    echo ""

    # 克隆最新代码
    echo "📥 获取最新代码..."
    if ! git clone https://github.com/JianDNA/GostUI.git; then
        echo "❌ 代码获取失败"
        cd "$original_dir"  # 失败时返回原始目录
        return 1
    fi

    cd GostUI
    
    # 修复脚本格式和权限
    echo "🔧 修复脚本文件格式和权限..."
    find . -name "*.sh" -type f -print0 | while IFS= read -r -d '' file; do
        tr -d '\r' < "$file" > "$file.tmp" && mv "$file.tmp" "$file"
        chmod +x "$file"
    done 2>/dev/null || true

    # 🔧 确保关键管理脚本有执行权限
    echo "🔧 确保关键脚本权限..."
    for script in "gost-manager.sh" "smart-update.sh" "deploy.sh" "cleanup-logs.sh"; do
        if [ -f "$script" ]; then
            chmod +x "$script"
            echo "✅ 已设置 $script 执行权限"
        fi
    done
    
    # 执行部署
    echo "🔧 开始部署..."
    if ./deploy.sh; then
        echo "✅ 部署完成！"

        # 应用端口配置
        local custom_port=$(get_current_port)
        if [ "$custom_port" != "3000" ]; then
            echo "🔧 应用自定义端口配置: $custom_port"
            apply_port_config "$custom_port"
        fi

        echo ""
        echo "🌐 访问地址: http://localhost:$(get_current_port)"
        echo "🔐 默认账号: admin / admin123"

        # 返回原始目录
        cd "$original_dir"
    else
        echo "❌ 部署失败"
        cd "$original_dir"  # 失败时也返回原始目录
        return 1
    fi
}

# 2. 智能更新
smart_update() {
    echo "🔄 智能更新 GOST管理系统"
    echo "================================"
    
    if [ ! -f "smart-update.sh" ]; then
        echo "❌ 请在GostUI项目根目录运行此脚本"
        echo "💡 或者选择一键部署来初始化项目"
        return 1
    fi
    
    ./smart-update.sh
}

# 3. 手动更新
manual_update() {
    echo "🔧 手动更新 GOST管理系统"
    echo "================================"

    # 保存当前目录
    local original_dir=$(pwd)

    if ! confirm_action "手动更新"; then
        return 1
    fi

    local deploy_dir="/root/gost-management"

    if [ ! -d "$deploy_dir" ]; then
        echo "❌ 未找到部署目录: $deploy_dir"
        echo "💡 请先执行一键部署"
        return 1
    fi
    
    echo "💾 备份数据库..."
    local backup_file="$deploy_dir/backend/database/database.sqlite.backup.$(date +%s)"
    if [ -f "$deploy_dir/backend/database/database.sqlite" ]; then
        cp "$deploy_dir/backend/database/database.sqlite" "$backup_file"
        echo "✅ 数据库已备份到: $backup_file"
    fi
    
    echo "🛑 停止服务..."
    pm2 stop gost-management 2>/dev/null || true
    
    echo "📥 拉取最新代码..."
    cd "$deploy_dir"

    # 确保获取最新的远程代码
    echo "🔄 获取远程更新..."
    if ! git fetch origin main; then
        echo "❌ 获取远程代码失败"
        return 1
    fi

    # 显示将要更新的内容
    echo "📋 检查更新内容..."
    local commits_behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
    if [ "$commits_behind" -gt 0 ]; then
        echo "📦 发现 $commits_behind 个新提交"
        echo "🔍 最新提交:"
        git log --oneline -3 origin/main 2>/dev/null || true
    else
        echo "ℹ️ 当前已是最新版本"
    fi

    echo ""
    echo "🔄 应用最新代码..."
    if ! git reset --hard origin/main; then
        echo "❌ 代码更新失败"
        return 1
    fi

    echo "✅ 代码更新完成"

    # 修复脚本格式
    echo "🔧 修复脚本文件格式..."
    find . -name "*.sh" -type f -print0 | while IFS= read -r -d '' file; do
        tr -d '\r' < "$file" > "$file.tmp" && mv "$file.tmp" "$file"
        chmod +x "$file"
    done 2>/dev/null || true

    # 🔧 确保关键管理脚本有执行权限
    echo "🔧 确保关键脚本权限..."
    for script in "gost-manager.sh" "smart-update.sh" "deploy.sh" "cleanup-logs.sh"; do
        if [ -f "$script" ]; then
            chmod +x "$script"
            echo "✅ 已设置 $script 执行权限"
        fi
    done
    
    echo "🔧 运行数据库修复..."
    cd backend
    if [ -f "database-fixes.js" ]; then
        echo "📋 发现数据库修复脚本，开始执行..."
        if node database-fixes.js; then
            echo "✅ 数据库修复完成"
        else
            echo "⚠️ 数据库修复失败，但继续更新流程"
        fi
    else
        echo "ℹ️ 未找到数据库修复脚本，跳过修复步骤"
    fi

    # 检查并运行新迁移
    echo ""
    echo "🔄 检查并运行新迁移..."

    # 检查外部访问控制配置迁移
    echo "📝 检查外部访问控制配置..."
    CONFIG_EXISTS=$(sqlite3 database/database.sqlite "SELECT COUNT(*) FROM SystemConfigs WHERE key = 'allowUserExternalAccess';" 2>/dev/null || echo "0")

    if [ "$CONFIG_EXISTS" = "0" ]; then
        echo "🚀 添加外部访问控制配置..."
        sqlite3 database/database.sqlite "
        INSERT OR IGNORE INTO SystemConfigs (key, value, description, category, updatedBy, createdAt, updatedAt)
        VALUES ('allowUserExternalAccess', 'true', '允许普通用户的转发规则被外部访问。true=监听所有接口(0.0.0.0)，false=仅本地访问(127.0.0.1)。管理员用户不受限制。', 'security', 'system', datetime('now'), datetime('now'));
        " 2>/dev/null && echo "✅ 外部访问控制配置添加完成" || echo "⚠️ 外部访问控制配置添加失败"
    else
        echo "ℹ️ 外部访问控制配置已存在，跳过添加"
    fi

    # 安装后端依赖
    echo ""
    echo "📦 安装后端依赖..."
    if [ -f "package.json" ]; then
        echo "🔄 安装Node.js依赖..."
        if command -v yarn >/dev/null 2>&1; then
            yarn install --production --no-bin-links
        else
            npm install --production --no-bin-links
        fi
        echo "✅ 后端依赖安装完成"
    else
        echo "⚠️ 未找到package.json，跳过依赖安装"
    fi

    # 确保PM2日志轮转配置
    echo "🔧 检查PM2日志轮转配置..."
    pm2 set pm2-logrotate:max_size 20M 2>/dev/null || true
    pm2 set pm2-logrotate:retain 5 2>/dev/null || true

    echo "🚀 重启服务..."
    pm2 restart gost-management

    # 验证服务状态
    echo ""
    echo "🔍 验证服务状态..."
    sleep 3

    if pm2 list | grep -q "gost-management.*online"; then
        echo "✅ 服务运行正常"

        # 检查端口监听
        local current_port=$(get_current_port)
        if netstat -tln | grep -q ":$current_port"; then
            echo "✅ 端口$current_port监听正常"
        else
            echo "⚠️ 端口$current_port未监听，可能需要等待服务完全启动"
        fi

        echo ""
        echo "✅ 手动更新完成！"
        echo "🌐 访问地址: http://localhost:$current_port"

        # 返回原始目录
        cd "$original_dir"
    else
        echo "❌ 服务启动失败"
        echo "📋 查看错误日志:"
        pm2 logs gost-management --lines 10

        # 失败时也返回原始目录
        cd "$original_dir"
    fi
}

# 4. 修改端口
change_port() {
    echo "🔧 修改系统端口"
    echo "================================"
    
    local current_port=$(get_current_port)
    echo "当前端口: $current_port"
    echo ""
    
    read -p "请输入新的端口号 (1024-65535): " -r new_port
    
    # 验证端口号
    if ! [[ "$new_port" =~ ^[0-9]+$ ]] || [ "$new_port" -lt 1024 ] || [ "$new_port" -gt 65535 ]; then
        echo "❌ 无效的端口号，请输入1024-65535之间的数字"
        return 1
    fi
    
    # 检查端口是否被占用
    if netstat -tln | grep -q ":$new_port "; then
        echo "❌ 端口 $new_port 已被占用，请选择其他端口"
        return 1
    fi
    
    if ! confirm_action "修改端口为 $new_port"; then
        return 1
    fi
    
    # 保存端口配置
    save_port_config "$new_port"
    
    # 应用端口配置
    apply_port_config "$new_port"
    
    echo "✅ 端口修改完成！"
    echo "🌐 新的访问地址: http://localhost:$new_port"
}

# 应用端口配置
apply_port_config() {
    local port=$1
    local deploy_dir="/root/gost-management"

    # 保存当前目录
    local original_dir=$(pwd)

    if [ ! -d "$deploy_dir" ]; then
        echo "⚠️ 部署目录不存在，端口配置将在下次部署时生效"
        return 0
    fi
    
    echo "🔧 应用端口配置..."
    
    # 更新环境变量文件
    local env_file="$deploy_dir/backend/.env"
    if [ -f "$env_file" ]; then
        # 更新或添加PORT配置
        if grep -q "^PORT=" "$env_file"; then
            sed -i "s/^PORT=.*/PORT=$port/" "$env_file"
        else
            echo "PORT=$port" >> "$env_file"
        fi
    else
        # 创建.env文件
        echo "PORT=$port" > "$env_file"
    fi
    
    # 更新PM2配置文件
    local pm2_config="$deploy_dir/backend/ecosystem.config.js"
    if [ -f "$pm2_config" ]; then
        # 使用sed更新端口配置
        sed -i "s/PORT: [0-9]*/PORT: $port/g" "$pm2_config"
        sed -i "s/port: [0-9]*/port: $port/g" "$pm2_config"
    fi
    
    # 确保PM2日志轮转配置
    echo "🔧 检查PM2日志轮转配置..."
    pm2 set pm2-logrotate:max_size 20M 2>/dev/null || true
    pm2 set pm2-logrotate:retain 5 2>/dev/null || true

    # 重启服务
    echo "🔄 重启服务以应用新端口..."
    cd "$deploy_dir/backend"
    pm2 restart gost-management 2>/dev/null || pm2 start ecosystem.config.js

    echo "✅ 端口配置已应用"

    # 返回原始目录
    cd "$original_dir"
}

# 5. 修改管理员密码
change_admin_password() {
    echo "🔐 修改管理员密码"
    echo "================================"

    # 保存当前目录
    local original_dir=$(pwd)

    local deploy_dir="/root/gost-management"
    local db_file="$deploy_dir/backend/database/database.sqlite"

    if [ ! -f "$db_file" ]; then
        echo "❌ 未找到数据库文件: $db_file"
        echo "💡 请先执行一键部署"
        return 1
    fi

    echo "当前管理员用户: admin"
    echo ""

    # 获取新密码
    read -s -p "请输入新密码: " new_password
    echo ""
    read -s -p "请再次确认密码: " confirm_password
    echo ""

    if [ "$new_password" != "$confirm_password" ]; then
        echo "❌ 两次输入的密码不一致"
        return 1
    fi

    if [ ${#new_password} -lt 6 ]; then
        echo "❌ 密码长度至少6位"
        return 1
    fi

    if ! confirm_action "修改管理员密码"; then
        return 1
    fi

    echo "🔧 更新密码..."

    # 使用稳定可靠的方法：Node.js生成哈希 + sqlite3更新数据库
    local backend_dir="$deploy_dir/backend"

    # 检查后端目录和依赖
    if [ ! -d "$backend_dir" ] || [ ! -f "$backend_dir/package.json" ]; then
        echo "❌ 未找到后端目录或package.json"
        echo "💡 请先执行一键部署"
        cd "$original_dir"
        return 1
    fi

    # 生成密码哈希
    echo "🔧 生成安全密码哈希..."
    cd "$backend_dir"

    local password_hash=$(node -e "
        try {
            const bcrypt = require('bcryptjs');
            const hash = bcrypt.hashSync('$new_password', 10);
            console.log(hash);
        } catch (error) {
            console.error('Hash generation failed:', error.message);
            process.exit(1);
        }
    " 2>/dev/null)

    if [ -z "$password_hash" ]; then
        echo "❌ 无法生成密码哈希"
        echo "💡 可能是bcryptjs模块未安装，尝试安装..."

        # 尝试安装bcryptjs
        if npm install bcryptjs --no-bin-links --silent 2>/dev/null; then
            echo "✅ bcryptjs模块安装成功，重新生成哈希..."
            password_hash=$(node -e "
                const bcrypt = require('bcryptjs');
                const hash = bcrypt.hashSync('$new_password', 10);
                console.log(hash);
            " 2>/dev/null)
        fi

        if [ -z "$password_hash" ]; then
            echo "❌ 密码哈希生成失败"
            echo "💡 建议直接在Web界面中修改密码"
            cd "$original_dir"
            return 1
        fi
    fi

    # 直接更新数据库
    echo "🔄 更新数据库中的密码..."
    if sqlite3 "$db_file" "UPDATE Users SET password = '$password_hash', updatedAt = datetime('now') WHERE username = 'admin';" 2>/dev/null; then
        local admin_exists=$(sqlite3 "$db_file" "SELECT COUNT(*) FROM Users WHERE username = 'admin';" 2>/dev/null)

        if [ "$admin_exists" = "1" ]; then
            echo "✅ 管理员密码修改成功！"
            echo "🔐 新密码已生效，请使用新密码登录"
            echo ""
            echo "📋 登录信息:"
            echo "   用户名: admin"
            echo "   新密码: $new_password"
            echo "   访问地址: http://localhost:$(get_current_port)"
            echo ""
            echo "💡 密码已使用与系统相同的bcryptjs加密方式存储"

            # 返回原始目录
            cd "$original_dir"
        else
            echo "❌ 未找到admin用户"
            cd "$original_dir"
            return 1
        fi
    else
        echo "❌ 数据库更新失败"
        echo "💡 请检查数据库文件权限和完整性"
        cd "$original_dir"
        return 1
    fi
}

# 6. 备份数据库和配置文件
backup_data() {
    echo "💾 备份数据库和配置文件"
    echo "================================"

    local deploy_dir="/root/gost-management"

    if [ ! -d "$deploy_dir" ]; then
        echo "❌ 未找到部署目录: $deploy_dir"
        echo "💡 请先执行一键部署"
        return 1
    fi

    # 创建备份目录
    mkdir -p "$BACKUP_DIR"

    # 清理旧备份
    if [ -d "$BACKUP_DIR" ]; then
        rm -rf "$BACKUP_DIR"/*
    fi

    echo "📁 备份目录: $BACKUP_DIR"
    echo "🔄 开始备份..."

    # 备份数据库
    if [ -f "$deploy_dir/backend/database/database.sqlite" ]; then
        cp "$deploy_dir/backend/database/database.sqlite" "$BACKUP_DIR/"
        echo "✅ 数据库已备份"
    fi

    # 备份配置文件
    if [ -f "$deploy_dir/backend/.env" ]; then
        cp "$deploy_dir/backend/.env" "$BACKUP_DIR/"
        echo "✅ 环境配置已备份"
    fi

    if [ -f "$deploy_dir/backend/config/config.js" ]; then
        mkdir -p "$BACKUP_DIR/config"
        cp "$deploy_dir/backend/config/config.js" "$BACKUP_DIR/config/"
        echo "✅ 应用配置已备份"
    fi

    if [ -f "$deploy_dir/backend/config/gost-config.json" ]; then
        mkdir -p "$BACKUP_DIR/config"
        cp "$deploy_dir/backend/config/gost-config.json" "$BACKUP_DIR/config/"
        echo "✅ GOST配置已备份"
    fi

    # 备份端口配置
    if [ -f "$PORT_CONFIG_FILE" ]; then
        mkdir -p "$BACKUP_DIR/manager-config"
        cp "$PORT_CONFIG_FILE" "$BACKUP_DIR/manager-config/"
        echo "✅ 端口配置已备份"
    fi

    # 备份PM2配置
    if [ -f "$deploy_dir/backend/ecosystem.config.js" ]; then
        mkdir -p "$BACKUP_DIR/config"
        cp "$deploy_dir/backend/ecosystem.config.js" "$BACKUP_DIR/config/"
        echo "✅ PM2配置已备份"
    fi

    # 创建备份信息文件
    cat > "$BACKUP_DIR/backup-info.txt" << EOF
GOST管理系统备份信息
==================
备份时间: $(date)
备份目录: $BACKUP_DIR
源目录: $deploy_dir
当前端口: $(get_current_port)

备份内容:
- database.sqlite (数据库)
- .env (环境配置)
- config/ (应用配置)
- manager-config/ (管理器配置)

还原方法:
运行 gost-manager.sh 选择选项7进行还原
EOF

    echo ""
    echo "✅ 备份完成！"
    echo "📁 备份位置: $BACKUP_DIR"
    echo "📋 备份信息: $BACKUP_DIR/backup-info.txt"
    echo ""
    echo "💡 提示: 多次备份将覆盖之前的备份文件"
}

# 7. 还原数据库和备份文件
restore_data() {
    echo "🔄 还原数据库和备份文件"
    echo "================================"

    # 保存当前目录
    local original_dir=$(pwd)

    local deploy_dir="/root/gost-management"

    # 检查部署目录
    if [ ! -d "$deploy_dir" ]; then
        echo "❌ 警告: 未找到部署目录 $deploy_dir"
        echo "💡 请先执行一键部署来初始化项目"
        echo "❌ 还原操作已停止"
        return 1
    fi

    # 检查备份目录
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        echo "❌ 未找到备份文件"
        echo "📁 备份目录: $BACKUP_DIR"
        echo "💡 请先执行备份操作"
        return 1
    fi

    echo "📁 备份目录: $BACKUP_DIR"
    echo "📁 部署目录: $deploy_dir"
    echo ""

    # 显示备份信息
    if [ -f "$BACKUP_DIR/backup-info.txt" ]; then
        echo "📋 备份信息:"
        cat "$BACKUP_DIR/backup-info.txt"
        echo ""
    fi

    echo "⚠️ 警告: 还原操作将覆盖当前的数据库和配置文件！"
    echo "💡 建议在还原前先进行当前数据的备份"
    echo ""

    read -p "请输入 'yes' 确认继续还原操作: " -r
    if [ "$REPLY" != "yes" ]; then
        echo "❌ 还原操作已取消"
        return 1
    fi

    echo "🛑 停止服务..."
    pm2 stop gost-management 2>/dev/null || true

    echo "🔄 开始还原..."

    # 还原数据库
    if [ -f "$BACKUP_DIR/database.sqlite" ]; then
        cp "$BACKUP_DIR/database.sqlite" "$deploy_dir/backend/database/"
        echo "✅ 数据库已还原"
    fi

    # 还原配置文件
    if [ -f "$BACKUP_DIR/.env" ]; then
        cp "$BACKUP_DIR/.env" "$deploy_dir/backend/"
        echo "✅ 环境配置已还原"
    fi

    if [ -f "$BACKUP_DIR/config/config.js" ]; then
        mkdir -p "$deploy_dir/backend/config"
        cp "$BACKUP_DIR/config/config.js" "$deploy_dir/backend/config/"
        echo "✅ 应用配置已还原"
    fi

    if [ -f "$BACKUP_DIR/config/gost-config.json" ]; then
        mkdir -p "$deploy_dir/backend/config"
        cp "$BACKUP_DIR/config/gost-config.json" "$deploy_dir/backend/config/"
        echo "✅ GOST配置已还原"
    fi

    if [ -f "$BACKUP_DIR/config/ecosystem.config.js" ]; then
        cp "$BACKUP_DIR/config/ecosystem.config.js" "$deploy_dir/backend/"
        echo "✅ PM2配置已还原"
    fi

    # 还原端口配置
    if [ -f "$BACKUP_DIR/manager-config/port.conf" ]; then
        mkdir -p "$CONFIG_DIR"
        cp "$BACKUP_DIR/manager-config/port.conf" "$PORT_CONFIG_FILE"
        echo "✅ 端口配置已还原"
    fi

    echo "🚀 重启服务..."
    cd "$deploy_dir/backend"
    pm2 restart gost-management 2>/dev/null || pm2 start ecosystem.config.js

    echo ""
    echo "✅ 还原完成！"
    echo "🌐 访问地址: http://localhost:$(get_current_port)"
    echo "🔐 请使用备份时的账号密码登录"

    # 返回原始目录
    cd "$original_dir"
}

# 主循环
main() {
    while true; do
        show_menu
        read -p "请选择 (1-8) [默认: 2]: " -n 1 -r
        echo
        echo ""

        case $REPLY in
            1)
                deploy_system
                ;;
            3)
                manual_update
                ;;
            4)
                change_port
                ;;
            5)
                change_admin_password
                ;;
            6)
                backup_data
                ;;
            7)
                restore_data
                ;;
            8)
                echo "👋 再见！"
                exit 0
                ;;
            ""|2)
                smart_update
                ;;
            *)
                echo "❌ 无效选择，请输入1-8"
                ;;
        esac

        echo ""
        echo "================================"
        read -p "按回车键继续..." -r
        echo ""
    done
}

# 检查运行环境
check_environment() {
    # 检查必要命令
    local missing_commands=()

    for cmd in git node npm pm2 sqlite3; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_commands+=("$cmd")
        fi
    done

    if [ ${#missing_commands[@]} -gt 0 ]; then
        echo "❌ 缺少必要的命令: ${missing_commands[*]}"
        echo "💡 请先安装缺少的软件包"
        echo ""
        echo "安装建议:"
        echo "  sudo apt update"
        echo "  sudo apt install -y git nodejs npm sqlite3"
        echo "  sudo npm install -g pm2"
        echo ""
        exit 1
    fi
}

# 显示欢迎信息
show_welcome() {
    echo "📋 系统信息:"
    echo "   🖥️  操作系统: $(uname -s)"
    echo "   🔧 Node.js: $(node -v 2>/dev/null || echo '未安装')"
    echo "   📦 npm: $(npm -v 2>/dev/null || echo '未安装')"
    echo "   ⚙️  PM2: $(pm2 -v 2>/dev/null || echo '未安装')"
    echo "   📁 配置目录: $CONFIG_DIR"
    echo "   💾 备份目录: $BACKUP_DIR"
    echo ""

    # 检查服务状态
    if pm2 list 2>/dev/null | grep -q "gost-management.*online"; then
        local current_port=$(get_current_port)
        echo "✅ 服务状态: 运行中"
        echo "🌐 访问地址: http://localhost:$current_port"
    else
        echo "⚠️ 服务状态: 未运行"
    fi
    echo ""
}

# 脚本入口
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    # 检查运行环境
    check_environment

    # 显示欢迎信息
    show_welcome

    # 进入主循环
    main
fi
