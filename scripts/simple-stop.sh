#!/bin/bash

# Gost 管理系统简化停止脚本
# 适用于使用 simple-deploy.sh 部署的环境
#
# 使用方法:
# ./simple-stop.sh [选项]

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置变量
APP_NAME="gost-manager"
INSTALL_DIR="./gost-manager"

# 参数解析
FORCE_STOP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_STOP=true
            shift
            ;;
        --help)
            echo "Gost 管理系统简化停止脚本"
            echo ""
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --force     强制停止所有相关进程"
            echo "  --help      显示此帮助信息"
            echo ""
            exit 0
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

# 显示横幅
show_banner() {
    echo -e "${BLUE}"
    echo "=================================================="
    echo "    Gost 管理系统简化停止脚本"
    echo "=================================================="
    echo -e "${NC}"
}

# 停止 PM2 应用
stop_pm2_app() {
    log_step "停止 PM2 应用..."
    
    if ! command -v pm2 >/dev/null 2>&1; then
        log_info "PM2 未安装，跳过"
        return
    fi
    
    if pm2 list 2>/dev/null | grep -q "$APP_NAME"; then
        log_info "停止 PM2 应用 ($APP_NAME)..."
        pm2 stop "$APP_NAME" 2>/dev/null || true
        pm2 delete "$APP_NAME" 2>/dev/null || true
        log_success "PM2 应用已停止"
    else
        log_info "未找到 PM2 应用 ($APP_NAME)"
    fi
}

# 停止直接运行的进程
stop_direct_processes() {
    log_step "停止直接运行的进程..."
    
    # 查找相关进程
    PIDS=$(pgrep -f "node.*app.js\|node.*gost-manager" 2>/dev/null || true)
    
    if [ -n "$PIDS" ]; then
        log_info "找到 Node.js 进程: $PIDS"
        
        if [ "$FORCE_STOP" = true ]; then
            log_warn "强制终止进程..."
            echo "$PIDS" | xargs -r kill -9 2>/dev/null || true
        else
            log_info "正常终止进程..."
            echo "$PIDS" | xargs -r kill -TERM 2>/dev/null || true
            sleep 2
            
            # 检查是否还有进程
            REMAINING_PIDS=$(pgrep -f "node.*app.js\|node.*gost-manager" 2>/dev/null || true)
            if [ -n "$REMAINING_PIDS" ]; then
                log_warn "强制终止剩余进程: $REMAINING_PIDS"
                echo "$REMAINING_PIDS" | xargs -r kill -9 2>/dev/null || true
            fi
        fi
        
        log_success "进程已停止"
    else
        log_info "未找到相关进程"
    fi
}

# 停止 Gost 进程
stop_gost_processes() {
    log_step "停止 Gost 进程..."
    
    GOST_PIDS=$(pgrep -f "gost" 2>/dev/null || true)
    
    if [ -n "$GOST_PIDS" ]; then
        log_info "找到 Gost 进程: $GOST_PIDS"
        
        if [ "$FORCE_STOP" = true ]; then
            echo "$GOST_PIDS" | xargs -r kill -9 2>/dev/null || true
        else
            echo "$GOST_PIDS" | xargs -r kill -TERM 2>/dev/null || true
            sleep 1
            
            REMAINING_GOST_PIDS=$(pgrep -f "gost" 2>/dev/null || true)
            if [ -n "$REMAINING_GOST_PIDS" ]; then
                echo "$REMAINING_GOST_PIDS" | xargs -r kill -9 2>/dev/null || true
            fi
        fi
        
        log_success "Gost 进程已停止"
    else
        log_info "未找到 Gost 进程"
    fi
}

# 检查状态
check_status() {
    log_step "检查停止状态..."
    
    # 检查进程
    PROCESSES=$(pgrep -f "node.*app.js\|node.*gost-manager\|gost" 2>/dev/null || true)
    if [ -n "$PROCESSES" ]; then
        log_warn "仍有进程运行: $PROCESSES"
    else
        log_success "所有相关进程已停止"
    fi
    
    # 检查端口
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        log_warn "端口 3000 仍被占用"
    else
        log_info "端口 3000 已释放"
    fi
}

# 主函数
main() {
    show_banner
    
    log_info "开始停止 Gost 管理系统..."
    echo ""
    
    stop_pm2_app
    stop_direct_processes
    stop_gost_processes
    
    echo ""
    check_status
    
    echo ""
    log_success "Gost 管理系统停止完成！"
    
    if [ "$FORCE_STOP" = true ]; then
        log_warn "使用了强制停止模式"
    fi
    
    echo ""
    log_info "如需重新启动，请运行: cd $INSTALL_DIR && npm start"
    log_info "如需完全删除，请运行: ./simple-uninstall.sh"
}

# 运行主函数
main "$@"
