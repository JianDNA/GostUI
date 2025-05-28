#!/bin/bash

# Gost 管理系统停止脚本
# 用于停止正在运行的 Gost 管理系统服务
#
# 使用方法:
# ./stop.sh [选项]
# 
# 选项:
#   --force     强制停止所有相关进程
#   --help      显示帮助信息

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置变量
APP_NAME="gost-manager"
APP_USER="gost-manager"
APP_DIR="/opt/gost-manager"

# 参数解析
FORCE_STOP=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_STOP=true
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

# 显示帮助信息
show_help() {
    echo "Gost 管理系统停止脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --force     强制停止所有相关进程"
    echo "  --help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                # 正常停止服务"
    echo "  $0 --force        # 强制停止所有进程"
    echo ""
}

# 显示横幅
show_banner() {
    echo -e "${BLUE}"
    echo "=================================================="
    echo "    Gost 管理系统停止脚本"
    echo "=================================================="
    echo -e "${NC}"
}

# 检查是否为 root 用户（某些操作需要）
check_permissions() {
    if [ "$EUID" -ne 0 ] && [ -d "$APP_DIR" ]; then
        log_warn "某些操作可能需要 root 权限"
        log_info "如果遇到权限问题，请使用 sudo 运行此脚本"
    fi
}

# 停止 PM2 管理的应用
stop_pm2_app() {
    log_step "停止 PM2 管理的应用..."
    
    # 检查是否安装了 PM2
    if ! command -v pm2 >/dev/null 2>&1; then
        log_info "PM2 未安装，跳过 PM2 应用停止"
        return
    fi
    
    # 检查是否有 gost-manager 用户
    if id "$APP_USER" >/dev/null 2>&1; then
        # 使用 gost-manager 用户停止
        if sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -q "$APP_NAME"; then
            log_info "停止 PM2 应用 ($APP_NAME)..."
            sudo -u "$APP_USER" pm2 stop "$APP_NAME" 2>/dev/null || true
            sudo -u "$APP_USER" pm2 delete "$APP_NAME" 2>/dev/null || true
            log_success "PM2 应用已停止"
        else
            log_info "未找到 PM2 应用 ($APP_NAME)"
        fi
    else
        # 使用当前用户停止
        if pm2 list 2>/dev/null | grep -q "$APP_NAME"; then
            log_info "停止 PM2 应用 ($APP_NAME)..."
            pm2 stop "$APP_NAME" 2>/dev/null || true
            pm2 delete "$APP_NAME" 2>/dev/null || true
            log_success "PM2 应用已停止"
        else
            log_info "未找到 PM2 应用 ($APP_NAME)"
        fi
    fi
}

# 停止直接运行的 Node.js 进程
stop_nodejs_processes() {
    log_step "停止 Node.js 进程..."
    
    # 查找相关的 Node.js 进程
    PIDS=$(pgrep -f "node.*app.js\|node.*gost-manager" 2>/dev/null || true)
    
    if [ -n "$PIDS" ]; then
        log_info "找到 Node.js 进程: $PIDS"
        
        if [ "$FORCE_STOP" = true ]; then
            log_warn "强制终止 Node.js 进程..."
            echo "$PIDS" | xargs -r kill -9 2>/dev/null || true
        else
            log_info "正常终止 Node.js 进程..."
            echo "$PIDS" | xargs -r kill -TERM 2>/dev/null || true
            
            # 等待进程正常退出
            sleep 3
            
            # 检查是否还有进程存在
            REMAINING_PIDS=$(pgrep -f "node.*app.js\|node.*gost-manager" 2>/dev/null || true)
            if [ -n "$REMAINING_PIDS" ]; then
                log_warn "强制终止剩余进程: $REMAINING_PIDS"
                echo "$REMAINING_PIDS" | xargs -r kill -9 2>/dev/null || true
            fi
        fi
        
        log_success "Node.js 进程已停止"
    else
        log_info "未找到相关的 Node.js 进程"
    fi
}

# 停止 Gost 进程
stop_gost_processes() {
    log_step "停止 Gost 进程..."
    
    # 查找 Gost 进程
    GOST_PIDS=$(pgrep -f "gost" 2>/dev/null || true)
    
    if [ -n "$GOST_PIDS" ]; then
        log_info "找到 Gost 进程: $GOST_PIDS"
        
        if [ "$FORCE_STOP" = true ]; then
            log_warn "强制终止 Gost 进程..."
            echo "$GOST_PIDS" | xargs -r kill -9 2>/dev/null || true
        else
            log_info "正常终止 Gost 进程..."
            echo "$GOST_PIDS" | xargs -r kill -TERM 2>/dev/null || true
            
            # 等待进程正常退出
            sleep 2
            
            # 检查是否还有进程存在
            REMAINING_GOST_PIDS=$(pgrep -f "gost" 2>/dev/null || true)
            if [ -n "$REMAINING_GOST_PIDS" ]; then
                log_warn "强制终止剩余 Gost 进程: $REMAINING_GOST_PIDS"
                echo "$REMAINING_GOST_PIDS" | xargs -r kill -9 2>/dev/null || true
            fi
        fi
        
        log_success "Gost 进程已停止"
    else
        log_info "未找到 Gost 进程"
    fi
}

# 停止 Nginx (如果配置了 gost-manager 站点)
stop_nginx() {
    log_step "检查 Nginx 配置..."
    
    if ! command -v nginx >/dev/null 2>&1; then
        log_info "Nginx 未安装，跳过"
        return
    fi
    
    # 检查是否有 gost-manager 的 Nginx 配置
    if [ -f "/etc/nginx/sites-available/gost-manager" ] || [ -f "/etc/nginx/conf.d/gost-manager.conf" ]; then
        log_info "发现 Gost Manager 的 Nginx 配置"
        
        read -p "是否停止 Nginx 服务? [y/N]: " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "停止 Nginx 服务..."
            if systemctl is-active --quiet nginx 2>/dev/null; then
                sudo systemctl stop nginx
                log_success "Nginx 已停止"
            else
                log_info "Nginx 未运行"
            fi
        else
            log_info "保持 Nginx 运行"
        fi
    else
        log_info "未找到 Gost Manager 的 Nginx 配置"
    fi
}

# 检查端口占用
check_ports() {
    log_step "检查端口占用..."
    
    PORTS=(3000 80 443)
    
    for port in "${PORTS[@]}"; do
        if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
            PROCESS=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | head -1)
            log_warn "端口 $port 仍被占用: $PROCESS"
        else
            log_info "端口 $port 已释放"
        fi
    done
}

# 显示停止状态
show_status() {
    log_step "检查服务状态..."
    
    echo ""
    echo "=== 服务状态检查 ==="
    
    # 检查 PM2 状态
    if command -v pm2 >/dev/null 2>&1; then
        echo "PM2 应用状态:"
        if id "$APP_USER" >/dev/null 2>&1; then
            sudo -u "$APP_USER" pm2 list 2>/dev/null | grep -E "(App name|$APP_NAME)" || echo "  无 PM2 应用运行"
        else
            pm2 list 2>/dev/null | grep -E "(App name|$APP_NAME)" || echo "  无 PM2 应用运行"
        fi
    fi
    
    # 检查进程状态
    echo ""
    echo "相关进程:"
    PROCESSES=$(pgrep -f "node.*app.js\|node.*gost-manager\|gost" 2>/dev/null || true)
    if [ -n "$PROCESSES" ]; then
        ps aux | grep -E "node.*app.js|node.*gost-manager|gost" | grep -v grep || true
    else
        echo "  无相关进程运行"
    fi
    
    # 检查端口状态
    echo ""
    echo "端口监听状态:"
    netstat -tlnp 2>/dev/null | grep -E ":3000 |:80 |:443 " || echo "  无相关端口监听"
    
    echo ""
}

# 主函数
main() {
    if [ "$SHOW_HELP" = true ]; then
        show_help
        exit 0
    fi
    
    show_banner
    check_permissions
    
    log_info "开始停止 Gost 管理系统..."
    echo ""
    
    stop_pm2_app
    stop_nodejs_processes
    stop_gost_processes
    stop_nginx
    
    echo ""
    check_ports
    show_status
    
    echo ""
    log_success "Gost 管理系统停止完成！"
    
    if [ "$FORCE_STOP" = true ]; then
        log_warn "使用了强制停止模式"
    fi
    
    echo ""
    log_info "如需重新启动，请运行相应的启动脚本"
    log_info "如需完全卸载，请运行: ./uninstall.sh"
}

# 错误处理
trap 'log_error "停止过程中发生错误"; exit 1' ERR

# 运行主函数
main "$@"
