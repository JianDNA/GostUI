#!/bin/bash

# Gost 管理系统卸载脚本
# 用于完全卸载 Gost 管理系统及其相关组件
#
# 使用方法:
# ./uninstall.sh [选项]
# 
# 选项:
#   --keep-data     保留用户数据和配置
#   --keep-deps     保留依赖包 (Node.js, PM2, Nginx)
#   --force         强制卸载，不询问确认
#   --help          显示帮助信息

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# 配置变量
APP_NAME="gost-manager"
APP_USER="gost-manager"
APP_DIR="/opt/gost-manager"
LOG_DIR="/var/log/gost-manager"

# 参数解析
KEEP_DATA=false
KEEP_DEPS=false
FORCE_UNINSTALL=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --keep-data)
            KEEP_DATA=true
            shift
            ;;
        --keep-deps)
            KEEP_DEPS=true
            shift
            ;;
        --force)
            FORCE_UNINSTALL=true
            shift
            ;;
        --help)
            SHOW_HELP=true
            shift
            ;;
        *)
            echo "未知参数: $1"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_danger() {
    echo -e "${RED}[DANGER]${NC} $1"
}

# 显示帮助信息
show_help() {
    echo "Gost 管理系统卸载脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --keep-data     保留用户数据和配置文件"
    echo "  --keep-deps     保留依赖包 (Node.js, PM2, Nginx)"
    echo "  --force         强制卸载，不询问确认"
    echo "  --help          显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                      # 完全卸载 (会询问确认)"
    echo "  $0 --keep-data          # 卸载但保留数据"
    echo "  $0 --keep-deps          # 卸载但保留依赖包"
    echo "  $0 --force              # 强制卸载，不询问"
    echo "  $0 --keep-data --force  # 保留数据且强制卸载"
    echo ""
    echo "警告: 卸载操作不可逆，请确保已备份重要数据！"
    echo ""
}

# 显示横幅
show_banner() {
    echo -e "${RED}"
    echo "=================================================="
    echo "    Gost 管理系统卸载脚本"
    echo "    ⚠️  警告: 此操作将删除所有相关文件！"
    echo "=================================================="
    echo -e "${NC}"
}

# 检查权限
check_permissions() {
    if [ "$EUID" -ne 0 ]; then
        log_error "此脚本需要 root 权限运行"
        log_info "请使用: sudo $0"
        exit 1
    fi
}

# 确认卸载
confirm_uninstall() {
    if [ "$FORCE_UNINSTALL" = true ]; then
        log_warn "强制卸载模式，跳过确认"
        return
    fi
    
    echo ""
    log_danger "⚠️  警告: 即将卸载 Gost 管理系统！"
    echo ""
    echo "将要删除的内容:"
    echo "  📁 应用目录: $APP_DIR"
    echo "  📁 日志目录: $LOG_DIR"
    echo "  👤 系统用户: $APP_USER"
    echo "  🔧 PM2 应用: $APP_NAME"
    echo "  🌐 Nginx 配置: gost-manager"
    
    if [ "$KEEP_DATA" = false ]; then
        echo "  💾 用户数据: 数据库和配置文件"
    else
        echo "  💾 用户数据: 将保留"
    fi
    
    if [ "$KEEP_DEPS" = false ]; then
        echo "  📦 依赖包: Node.js, PM2, Nginx (将询问是否删除)"
    else
        echo "  📦 依赖包: 将保留"
    fi
    
    echo ""
    log_danger "此操作不可逆！请确保已备份重要数据！"
    echo ""
    
    read -p "确定要继续卸载吗? 请输入 'YES' 确认: " -r
    if [ "$REPLY" != "YES" ]; then
        log_info "卸载已取消"
        exit 0
    fi
    
    echo ""
    log_warn "开始卸载..."
    sleep 2
}

# 停止所有服务
stop_services() {
    log_step "停止所有相关服务..."
    
    # 运行停止脚本
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/stop.sh" ]; then
        log_info "运行停止脚本..."
        bash "$SCRIPT_DIR/stop.sh" --force
    else
        log_warn "未找到停止脚本，手动停止服务..."
        
        # 手动停止 PM2 应用
        if command -v pm2 >/dev/null 2>&1; then
            if id "$APP_USER" >/dev/null 2>&1; then
                sudo -u "$APP_USER" pm2 stop "$APP_NAME" 2>/dev/null || true
                sudo -u "$APP_USER" pm2 delete "$APP_NAME" 2>/dev/null || true
            else
                pm2 stop "$APP_NAME" 2>/dev/null || true
                pm2 delete "$APP_NAME" 2>/dev/null || true
            fi
        fi
        
        # 强制终止相关进程
        pkill -f "node.*app.js\|node.*gost-manager\|gost" 2>/dev/null || true
    fi
    
    log_success "服务停止完成"
}

# 删除 PM2 配置
remove_pm2_config() {
    log_step "删除 PM2 配置..."
    
    if command -v pm2 >/dev/null 2>&1; then
        # 删除 PM2 startup 配置
        if id "$APP_USER" >/dev/null 2>&1; then
            sudo -u "$APP_USER" pm2 unstartup 2>/dev/null || true
        else
            pm2 unstartup 2>/dev/null || true
        fi
        
        # 删除保存的 PM2 配置
        if [ -f "/home/$APP_USER/.pm2/dump.pm2" ]; then
            rm -f "/home/$APP_USER/.pm2/dump.pm2"
        fi
        
        log_success "PM2 配置已删除"
    else
        log_info "PM2 未安装，跳过"
    fi
}

# 删除 Nginx 配置
remove_nginx_config() {
    log_step "删除 Nginx 配置..."
    
    if command -v nginx >/dev/null 2>&1; then
        # 删除站点配置
        if [ -f "/etc/nginx/sites-available/gost-manager" ]; then
            rm -f "/etc/nginx/sites-available/gost-manager"
            log_info "删除 Nginx 站点配置"
        fi
        
        if [ -L "/etc/nginx/sites-enabled/gost-manager" ]; then
            rm -f "/etc/nginx/sites-enabled/gost-manager"
            log_info "删除 Nginx 站点链接"
        fi
        
        # CentOS/RHEL 配置
        if [ -f "/etc/nginx/conf.d/gost-manager.conf" ]; then
            rm -f "/etc/nginx/conf.d/gost-manager.conf"
            log_info "删除 Nginx 配置文件"
        fi
        
        # 测试 Nginx 配置
        if nginx -t 2>/dev/null; then
            systemctl reload nginx 2>/dev/null || true
            log_success "Nginx 配置已删除并重载"
        else
            log_warn "Nginx 配置测试失败，请手动检查"
        fi
    else
        log_info "Nginx 未安装，跳过"
    fi
}

# 删除应用文件
remove_application_files() {
    log_step "删除应用文件..."
    
    if [ -d "$APP_DIR" ]; then
        if [ "$KEEP_DATA" = true ]; then
            log_info "保留数据模式，备份用户数据..."
            
            # 创建备份目录
            BACKUP_DIR="/tmp/gost-manager-backup-$(date +%Y%m%d_%H%M%S)"
            mkdir -p "$BACKUP_DIR"
            
            # 备份数据库
            if [ -f "$APP_DIR/data/database.sqlite" ]; then
                cp "$APP_DIR/data/database.sqlite" "$BACKUP_DIR/"
                log_info "数据库已备份到: $BACKUP_DIR/database.sqlite"
            fi
            
            # 备份配置
            if [ -f "$APP_DIR/config/gost-config.json" ]; then
                cp "$APP_DIR/config/gost-config.json" "$BACKUP_DIR/"
                log_info "Gost 配置已备份到: $BACKUP_DIR/gost-config.json"
            fi
            
            if [ -f "$APP_DIR/app/backend/.env" ]; then
                cp "$APP_DIR/app/backend/.env" "$BACKUP_DIR/"
                log_info "环境配置已备份到: $BACKUP_DIR/.env"
            fi
            
            log_success "数据备份完成: $BACKUP_DIR"
        fi
        
        # 删除应用目录
        log_info "删除应用目录: $APP_DIR"
        rm -rf "$APP_DIR"
        log_success "应用文件已删除"
    else
        log_info "应用目录不存在，跳过"
    fi
}

# 删除日志文件
remove_log_files() {
    log_step "删除日志文件..."
    
    if [ -d "$LOG_DIR" ]; then
        log_info "删除日志目录: $LOG_DIR"
        rm -rf "$LOG_DIR"
        log_success "日志文件已删除"
    else
        log_info "日志目录不存在，跳过"
    fi
}

# 删除系统用户
remove_system_user() {
    log_step "删除系统用户..."
    
    if id "$APP_USER" >/dev/null 2>&1; then
        log_info "删除用户: $APP_USER"
        userdel "$APP_USER" 2>/dev/null || true
        
        # 删除用户主目录（如果存在）
        if [ -d "/home/$APP_USER" ]; then
            rm -rf "/home/$APP_USER"
            log_info "删除用户主目录: /home/$APP_USER"
        fi
        
        log_success "系统用户已删除"
    else
        log_info "系统用户不存在，跳过"
    fi
}

# 清理防火墙规则
cleanup_firewall() {
    log_step "清理防火墙规则..."
    
    # UFW 规则
    if command -v ufw >/dev/null 2>&1; then
        ufw --force delete allow 3000/tcp 2>/dev/null || true
        log_info "删除 UFW 规则 (端口 3000)"
    fi
    
    # Firewalld 规则
    if command -v firewall-cmd >/dev/null 2>&1; then
        firewall-cmd --permanent --remove-port=3000/tcp 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        log_info "删除 Firewalld 规则 (端口 3000)"
    fi
    
    # Windows 防火墙规则 (如果在 WSL 中)
    if command -v netsh.exe >/dev/null 2>&1; then
        netsh.exe advfirewall firewall delete rule name="Gost Manager - Port 3000" 2>/dev/null || true
        log_info "删除 Windows 防火墙规则"
    fi
    
    log_success "防火墙规则清理完成"
}

# 询问是否删除依赖包
remove_dependencies() {
    if [ "$KEEP_DEPS" = true ]; then
        log_info "保留依赖包模式，跳过依赖包删除"
        return
    fi
    
    log_step "处理依赖包..."
    
    echo ""
    log_warn "以下依赖包可能被其他应用使用："
    
    # 检查 PM2
    if command -v pm2 >/dev/null 2>&1; then
        echo "  📦 PM2 (进程管理器)"
        if [ "$FORCE_UNINSTALL" = false ]; then
            read -p "是否删除 PM2? [y/N]: " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                npm uninstall -g pm2 2>/dev/null || true
                log_info "PM2 已删除"
            fi
        fi
    fi
    
    # 检查 Nginx
    if command -v nginx >/dev/null 2>&1; then
        echo "  📦 Nginx (Web 服务器)"
        if [ "$FORCE_UNINSTALL" = false ]; then
            read -p "是否删除 Nginx? [y/N]: " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                systemctl stop nginx 2>/dev/null || true
                systemctl disable nginx 2>/dev/null || true
                
                if [ -f /etc/debian_version ]; then
                    apt remove --purge -y nginx nginx-common 2>/dev/null || true
                elif [ -f /etc/redhat-release ]; then
                    if command -v dnf >/dev/null 2>&1; then
                        dnf remove -y nginx 2>/dev/null || true
                    else
                        yum remove -y nginx 2>/dev/null || true
                    fi
                fi
                log_info "Nginx 已删除"
            fi
        fi
    fi
    
    # Node.js 通常不建议删除，因为可能被其他应用使用
    if command -v node >/dev/null 2>&1; then
        echo "  📦 Node.js (JavaScript 运行时)"
        log_warn "Node.js 可能被其他应用使用，建议保留"
        if [ "$FORCE_UNINSTALL" = false ]; then
            read -p "确定要删除 Node.js 吗? [y/N]: " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                if [ -f /etc/debian_version ]; then
                    apt remove --purge -y nodejs npm 2>/dev/null || true
                elif [ -f /etc/redhat-release ]; then
                    if command -v dnf >/dev/null 2>&1; then
                        dnf remove -y nodejs npm 2>/dev/null || true
                    else
                        yum remove -y nodejs npm 2>/dev/null || true
                    fi
                fi
                log_info "Node.js 已删除"
            fi
        fi
    fi
}

# 显示卸载结果
show_uninstall_result() {
    echo ""
    echo -e "${GREEN}=================================================="
    echo "🗑️  Gost 管理系统卸载完成！"
    echo "=================================================="
    echo -e "${NC}"
    
    echo "已删除的内容:"
    echo "  ✅ 应用文件和目录"
    echo "  ✅ 系统用户和权限"
    echo "  ✅ PM2 配置和进程"
    echo "  ✅ Nginx 配置文件"
    echo "  ✅ 防火墙规则"
    echo "  ✅ 日志文件"
    
    if [ "$KEEP_DATA" = true ]; then
        echo ""
        echo "保留的数据:"
        echo "  💾 用户数据已备份到 /tmp/gost-manager-backup-*"
    fi
    
    if [ "$KEEP_DEPS" = true ]; then
        echo ""
        echo "保留的依赖:"
        echo "  📦 Node.js, PM2, Nginx 等依赖包"
    fi
    
    echo ""
    log_success "卸载完成！感谢使用 Gost 管理系统。"
    
    if [ "$KEEP_DATA" = true ]; then
        echo ""
        log_info "如需重新安装，可以恢复备份的数据文件"
    fi
}

# 主函数
main() {
    if [ "$SHOW_HELP" = true ]; then
        show_help
        exit 0
    fi
    
    show_banner
    check_permissions
    confirm_uninstall
    
    echo ""
    log_info "开始卸载 Gost 管理系统..."
    
    stop_services
    remove_pm2_config
    remove_nginx_config
    remove_application_files
    remove_log_files
    remove_system_user
    cleanup_firewall
    remove_dependencies
    
    show_uninstall_result
}

# 错误处理
trap 'log_error "卸载过程中发生错误"; exit 1' ERR

# 运行主函数
main "$@"
