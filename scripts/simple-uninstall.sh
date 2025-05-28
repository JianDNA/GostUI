#!/bin/bash

# Gost 管理系统简化卸载脚本
# 适用于使用 simple-deploy.sh 部署的环境
#
# 使用方法:
# ./simple-uninstall.sh [选项]

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
KEEP_DATA=false
FORCE_UNINSTALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --keep-data)
            KEEP_DATA=true
            shift
            ;;
        --force)
            FORCE_UNINSTALL=true
            shift
            ;;
        --help)
            echo "Gost 管理系统简化卸载脚本"
            echo ""
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --keep-data     保留用户数据和配置文件"
            echo "  --force         强制卸载，不询问确认"
            echo "  --help          显示此帮助信息"
            echo ""
            echo "示例:"
            echo "  $0                # 完全删除 (会询问确认)"
            echo "  $0 --keep-data    # 删除但保留数据"
            echo "  $0 --force        # 强制删除，不询问"
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

log_danger() {
    echo -e "${RED}[DANGER]${NC} $1"
}

# 显示横幅
show_banner() {
    echo -e "${RED}"
    echo "=================================================="
    echo "    Gost 管理系统简化卸载脚本"
    echo "    ⚠️  警告: 此操作将删除项目文件！"
    echo "=================================================="
    echo -e "${NC}"
}

# 确认卸载
confirm_uninstall() {
    if [ "$FORCE_UNINSTALL" = true ]; then
        log_warn "强制卸载模式，跳过确认"
        return
    fi
    
    echo ""
    log_danger "⚠️  警告: 即将删除 Gost 管理系统！"
    echo ""
    echo "将要删除的内容:"
    echo "  📁 项目目录: $INSTALL_DIR"
    echo "  🔧 PM2 应用: $APP_NAME"
    
    if [ "$KEEP_DATA" = false ]; then
        echo "  💾 用户数据: 数据库和配置文件"
    else
        echo "  💾 用户数据: 将备份保留"
    fi
    
    echo ""
    log_danger "此操作不可逆！"
    echo ""
    
    read -p "确定要继续吗? 请输入 'yes' 确认: " -r
    if [ "$REPLY" != "yes" ]; then
        log_info "卸载已取消"
        exit 0
    fi
    
    echo ""
    log_warn "开始卸载..."
    sleep 1
}

# 停止服务
stop_services() {
    log_step "停止服务..."
    
    # 运行简化停止脚本
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/simple-stop.sh" ]; then
        log_info "运行停止脚本..."
        bash "$SCRIPT_DIR/simple-stop.sh" --force
    else
        log_warn "未找到停止脚本，手动停止..."
        
        # 手动停止
        if command -v pm2 >/dev/null 2>&1; then
            pm2 stop "$APP_NAME" 2>/dev/null || true
            pm2 delete "$APP_NAME" 2>/dev/null || true
        fi
        
        pkill -f "node.*app.js\|node.*gost-manager\|gost" 2>/dev/null || true
    fi
    
    log_success "服务停止完成"
}

# 备份数据
backup_data() {
    if [ "$KEEP_DATA" = false ]; then
        return
    fi
    
    log_step "备份用户数据..."
    
    if [ ! -d "$INSTALL_DIR" ]; then
        log_warn "项目目录不存在，跳过备份"
        return
    fi
    
    # 创建备份目录
    BACKUP_DIR="./gost-manager-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # 备份数据库
    if [ -f "$INSTALL_DIR/backend/database/database.sqlite" ]; then
        cp "$INSTALL_DIR/backend/database/database.sqlite" "$BACKUP_DIR/"
        log_info "数据库已备份"
    fi
    
    # 备份配置
    if [ -f "$INSTALL_DIR/backend/.env" ]; then
        cp "$INSTALL_DIR/backend/.env" "$BACKUP_DIR/"
        log_info "环境配置已备份"
    fi
    
    if [ -f "$INSTALL_DIR/backend/config/gost-config.json" ]; then
        cp "$INSTALL_DIR/backend/config/gost-config.json" "$BACKUP_DIR/"
        log_info "Gost 配置已备份"
    fi
    
    log_success "数据备份完成: $BACKUP_DIR"
}

# 删除项目文件
remove_project_files() {
    log_step "删除项目文件..."
    
    if [ -d "$INSTALL_DIR" ]; then
        log_info "删除项目目录: $INSTALL_DIR"
        rm -rf "$INSTALL_DIR"
        log_success "项目文件已删除"
    else
        log_info "项目目录不存在，跳过"
    fi
}

# 清理 PM2 配置
cleanup_pm2() {
    log_step "清理 PM2 配置..."
    
    if ! command -v pm2 >/dev/null 2>&1; then
        log_info "PM2 未安装，跳过"
        return
    fi
    
    # 删除保存的配置
    if [ -f "$HOME/.pm2/dump.pm2" ]; then
        # 检查是否只有我们的应用
        if pm2 list 2>/dev/null | grep -q "No process"; then
            rm -f "$HOME/.pm2/dump.pm2"
            log_info "删除 PM2 配置文件"
        else
            log_info "PM2 中还有其他应用，保留配置文件"
        fi
    fi
    
    log_success "PM2 清理完成"
}

# 显示卸载结果
show_uninstall_result() {
    echo ""
    echo -e "${GREEN}=================================================="
    echo "🗑️  Gost 管理系统卸载完成！"
    echo "=================================================="
    echo -e "${NC}"
    
    echo "已删除的内容:"
    echo "  ✅ 项目文件和目录"
    echo "  ✅ PM2 应用配置"
    echo "  ✅ 相关进程"
    
    if [ "$KEEP_DATA" = true ]; then
        echo ""
        echo "保留的数据:"
        echo "  💾 用户数据已备份到 ./gost-manager-backup-*"
    fi
    
    echo ""
    log_success "卸载完成！"
    
    if [ "$KEEP_DATA" = true ]; then
        echo ""
        log_info "如需重新安装，可以恢复备份的数据文件"
    fi
    
    echo ""
    log_info "如需重新安装，请运行部署脚本"
}

# 主函数
main() {
    show_banner
    confirm_uninstall
    
    echo ""
    log_info "开始卸载 Gost 管理系统..."
    
    stop_services
    backup_data
    remove_project_files
    cleanup_pm2
    
    show_uninstall_result
}

# 错误处理
trap 'log_error "卸载过程中发生错误"; exit 1' ERR

# 运行主函数
main "$@"
