#!/bin/bash

# Gost 管理系统管理脚本
# 提供统一的管理入口，包括部署、停止、卸载等操作
#
# 使用方法:
# ./manage.sh <命令> [选项]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# 显示横幅
show_banner() {
    echo -e "${CYAN}"
    echo "=================================================="
    echo "    Gost 管理系统统一管理脚本"
    echo "=================================================="
    echo -e "${NC}"
}

# 显示帮助信息
show_help() {
    echo "Gost 管理系统统一管理脚本"
    echo ""
    echo "用法: $0 <命令> [选项]"
    echo ""
    echo "可用命令:"
    echo ""
    echo "  📦 部署相关:"
    echo "    deploy          完整部署 (需要 root 权限)"
    echo "    simple-deploy   简化部署 (已有 Node.js 环境)"
    echo ""
    echo "  🛑 停止相关:"
    echo "    stop            停止服务"
    echo "    simple-stop     简化停止"
    echo ""
    echo "  🗑️  卸载相关:"
    echo "    uninstall       完全卸载 (需要 root 权限)"
    echo "    simple-uninstall 简化卸载"
    echo ""
    echo "  📊 状态相关:"
    echo "    status          查看服务状态"
    echo "    logs            查看日志"
    echo ""
    echo "  🔧 维护相关:"
    echo "    backup          备份数据"
    echo "    restore         恢复数据"
    echo "    update          更新应用"
    echo ""
    echo "  ℹ️  信息相关:"
    echo "    help            显示此帮助信息"
    echo "    version         显示版本信息"
    echo ""
    echo "选项:"
    echo "  --force         强制执行，不询问确认"
    echo "  --keep-data     保留用户数据 (卸载时)"
    echo "  --keep-deps     保留依赖包 (卸载时)"
    echo ""
    echo "示例:"
    echo "  $0 deploy                    # 完整部署"
    echo "  $0 simple-deploy             # 简化部署"
    echo "  $0 stop --force              # 强制停止"
    echo "  $0 uninstall --keep-data     # 卸载但保留数据"
    echo "  $0 status                    # 查看状态"
    echo "  $0 backup                    # 备份数据"
    echo ""
}

# 检查脚本是否存在
check_script() {
    local script_name="$1"
    local script_path="$SCRIPT_DIR/$script_name"
    
    if [ ! -f "$script_path" ]; then
        log_error "脚本不存在: $script_path"
        log_info "请确保所有脚本文件都在 scripts 目录中"
        exit 1
    fi
    
    if [ ! -x "$script_path" ]; then
        chmod +x "$script_path"
        log_info "已设置脚本执行权限: $script_name"
    fi
    
    echo "$script_path"
}

# 执行部署
run_deploy() {
    log_step "执行完整部署..."
    local script_path=$(check_script "quick-deploy.sh")
    
    if [ "$EUID" -ne 0 ]; then
        log_error "完整部署需要 root 权限"
        log_info "请使用: sudo $0 deploy"
        exit 1
    fi
    
    bash "$script_path" "$@"
}

# 执行简化部署
run_simple_deploy() {
    log_step "执行简化部署..."
    local script_path=$(check_script "simple-deploy.sh")
    bash "$script_path" "$@"
}

# 执行停止
run_stop() {
    log_step "停止服务..."
    local script_path=$(check_script "stop.sh")
    
    if [ -d "/opt/gost-manager" ]; then
        # 完整部署环境
        if [ "$EUID" -ne 0 ]; then
            log_warn "建议使用 root 权限运行停止脚本"
            log_info "如果遇到权限问题，请使用: sudo $0 stop"
        fi
        bash "$script_path" "$@"
    else
        # 可能是简化部署环境
        log_info "未检测到完整部署环境，尝试简化停止..."
        run_simple_stop "$@"
    fi
}

# 执行简化停止
run_simple_stop() {
    log_step "执行简化停止..."
    local script_path=$(check_script "simple-stop.sh")
    bash "$script_path" "$@"
}

# 执行卸载
run_uninstall() {
    log_step "执行卸载..."
    local script_path=$(check_script "uninstall.sh")
    
    if [ "$EUID" -ne 0 ]; then
        log_error "卸载需要 root 权限"
        log_info "请使用: sudo $0 uninstall"
        exit 1
    fi
    
    bash "$script_path" "$@"
}

# 执行简化卸载
run_simple_uninstall() {
    log_step "执行简化卸载..."
    local script_path=$(check_script "simple-uninstall.sh")
    bash "$script_path" "$@"
}

# 查看状态
show_status() {
    log_step "查看服务状态..."
    
    echo ""
    echo "=== 系统状态检查 ==="
    
    # 检查 PM2 状态
    if command -v pm2 >/dev/null 2>&1; then
        echo ""
        echo "PM2 应用状态:"
        if id "gost-manager" >/dev/null 2>&1; then
            sudo -u gost-manager pm2 list 2>/dev/null || pm2 list 2>/dev/null || echo "  无 PM2 应用运行"
        else
            pm2 list 2>/dev/null || echo "  无 PM2 应用运行"
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
    
    # 检查服务状态
    echo ""
    echo "系统服务状态:"
    if systemctl is-active --quiet nginx 2>/dev/null; then
        echo "  ✅ Nginx: 运行中"
    else
        echo "  ❌ Nginx: 未运行"
    fi
    
    echo ""
}

# 查看日志
show_logs() {
    log_step "查看应用日志..."
    
    # 检查是否为完整部署
    if [ -d "/opt/gost-manager" ]; then
        echo "=== 完整部署环境日志 ==="
        
        if [ -f "/var/log/gost-manager/app.log" ]; then
            echo ""
            echo "应用日志 (最后 20 行):"
            tail -20 "/var/log/gost-manager/app.log"
        fi
        
        if command -v pm2 >/dev/null 2>&1; then
            echo ""
            echo "PM2 日志:"
            sudo -u gost-manager pm2 logs gost-manager --lines 10 2>/dev/null || true
        fi
        
    elif [ -d "./gost-manager" ]; then
        echo "=== 简化部署环境日志 ==="
        
        if [ -f "./gost-manager/logs/app.log" ]; then
            echo ""
            echo "应用日志 (最后 20 行):"
            tail -20 "./gost-manager/logs/app.log"
        fi
        
        if command -v pm2 >/dev/null 2>&1; then
            echo ""
            echo "PM2 日志:"
            pm2 logs gost-manager --lines 10 2>/dev/null || true
        fi
    else
        log_warn "未找到应用目录，无法显示日志"
    fi
}

# 备份数据
backup_data() {
    log_step "备份用户数据..."
    
    BACKUP_DIR="./gost-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # 检查完整部署环境
    if [ -d "/opt/gost-manager" ]; then
        log_info "检测到完整部署环境"
        
        if [ -f "/opt/gost-manager/data/database.sqlite" ]; then
            cp "/opt/gost-manager/data/database.sqlite" "$BACKUP_DIR/"
            log_info "数据库已备份"
        fi
        
        if [ -f "/opt/gost-manager/config/gost-config.json" ]; then
            cp "/opt/gost-manager/config/gost-config.json" "$BACKUP_DIR/"
            log_info "Gost 配置已备份"
        fi
        
        if [ -f "/opt/gost-manager/app/backend/.env" ]; then
            cp "/opt/gost-manager/app/backend/.env" "$BACKUP_DIR/"
            log_info "环境配置已备份"
        fi
        
    elif [ -d "./gost-manager" ]; then
        log_info "检测到简化部署环境"
        
        if [ -f "./gost-manager/backend/database/database.sqlite" ]; then
            cp "./gost-manager/backend/database/database.sqlite" "$BACKUP_DIR/"
            log_info "数据库已备份"
        fi
        
        if [ -f "./gost-manager/backend/.env" ]; then
            cp "./gost-manager/backend/.env" "$BACKUP_DIR/"
            log_info "环境配置已备份"
        fi
        
        if [ -f "./gost-manager/backend/config/gost-config.json" ]; then
            cp "./gost-manager/backend/config/gost-config.json" "$BACKUP_DIR/"
            log_info "Gost 配置已备份"
        fi
    else
        log_error "未找到应用目录，无法备份"
        exit 1
    fi
    
    log_success "数据备份完成: $BACKUP_DIR"
}

# 显示版本信息
show_version() {
    echo "Gost 管理系统管理脚本 v1.0.0"
    echo "支持的操作系统: Linux (Debian/Ubuntu/CentOS/RHEL)"
    echo "支持的部署方式: 完整部署、简化部署"
    echo ""
    echo "脚本列表:"
    ls -la "$SCRIPT_DIR"/*.sh 2>/dev/null | grep -E "\.(sh)$" || echo "  无可用脚本"
}

# 主函数
main() {
    if [ $# -eq 0 ]; then
        show_banner
        show_help
        exit 0
    fi
    
    local command="$1"
    shift
    
    case "$command" in
        deploy)
            show_banner
            run_deploy "$@"
            ;;
        simple-deploy)
            show_banner
            run_simple_deploy "$@"
            ;;
        stop)
            show_banner
            run_stop "$@"
            ;;
        simple-stop)
            show_banner
            run_simple_stop "$@"
            ;;
        uninstall)
            show_banner
            run_uninstall "$@"
            ;;
        simple-uninstall)
            show_banner
            run_simple_uninstall "$@"
            ;;
        status)
            show_banner
            show_status
            ;;
        logs)
            show_banner
            show_logs
            ;;
        backup)
            show_banner
            backup_data
            ;;
        help|--help|-h)
            show_banner
            show_help
            ;;
        version|--version|-v)
            show_version
            ;;
        *)
            log_error "未知命令: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
