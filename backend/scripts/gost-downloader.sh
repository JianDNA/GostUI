#!/bin/bash

# GOST 下载和管理脚本
# 用于自动下载、解压和管理 GOST 可执行文件

set -e

# 配置变量
GOST_VERSION="v3.0.0-nightly.20250530"
GOST_BASE_URL="https://github.com/go-gost/gost/releases/download"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$BACKEND_DIR/assets/gost"
CACHE_DIR="$BACKEND_DIR/cache/gost"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检测系统架构
detect_platform() {
    local os_type=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch_type=$(uname -m)
    
    case "$os_type" in
        linux*)
            OS="linux"
            ;;
        darwin*)
            OS="darwin"
            ;;
        *)
            log_error "不支持的操作系统: $os_type"
            exit 1
            ;;
    esac
    
    case "$arch_type" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        armv7l|armv6l)
            ARCH="armv7"
            ;;
        i386|i686)
            ARCH="386"
            ;;
        *)
            log_error "不支持的架构: $arch_type"
            exit 1
            ;;
    esac
    
    PLATFORM="${OS}_${ARCH}"
    log_info "检测到平台: $PLATFORM"
}

# 构建下载URL和文件名
build_download_info() {
    FILENAME="gost_${GOST_VERSION#v}_${PLATFORM}.tar.gz"
    DOWNLOAD_URL="${GOST_BASE_URL}/${GOST_VERSION}/${FILENAME}"
    EXECUTABLE_NAME="gost"
    
    if [[ "$OS" == "windows" ]]; then
        EXECUTABLE_NAME="gost.exe"
        FILENAME="gost_${GOST_VERSION#v}_${PLATFORM}.zip"
        DOWNLOAD_URL="${GOST_BASE_URL}/${GOST_VERSION}/${FILENAME}"
    fi
    
    log_info "下载文件: $FILENAME"
    log_info "下载地址: $DOWNLOAD_URL"
}

# 创建必要目录
create_directories() {
    mkdir -p "$ASSETS_DIR/$PLATFORM"
    mkdir -p "$CACHE_DIR"
    log_info "创建目录结构完成"
}

# 检查是否已存在
check_existing() {
    local target_path="$ASSETS_DIR/$PLATFORM/$EXECUTABLE_NAME"
    if [[ -f "$target_path" ]]; then
        log_info "GOST 可执行文件已存在: $target_path"
        
        # 检查版本信息（如果可能）
        if [[ -x "$target_path" ]]; then
            local version_info=$("$target_path" --version 2>/dev/null | head -1 || echo "未知版本")
            log_info "当前版本: $version_info"
        fi
        
        if [[ "$1" != "--force" ]]; then
            log_success "跳过下载，使用现有文件"
            return 0
        else
            log_warning "强制重新下载"
        fi
    fi
    return 1
}

# 下载文件
download_gost() {
    local cache_file="$CACHE_DIR/$FILENAME"
    
    log_info "开始下载 GOST..."
    
    # 检查缓存
    if [[ -f "$cache_file" && "$1" != "--force" ]]; then
        log_info "使用缓存文件: $cache_file"
    else
        log_info "从远程下载: $DOWNLOAD_URL"
        
        # 使用 curl 或 wget 下载
        if command -v curl >/dev/null 2>&1; then
            curl -L --progress-bar -o "$cache_file.tmp" "$DOWNLOAD_URL"
        elif command -v wget >/dev/null 2>&1; then
            wget --progress=bar:force -O "$cache_file.tmp" "$DOWNLOAD_URL"
        else
            log_error "未找到 curl 或 wget，无法下载文件"
            exit 1
        fi
        
        # 验证下载
        if [[ ! -f "$cache_file.tmp" || ! -s "$cache_file.tmp" ]]; then
            log_error "下载失败或文件为空"
            rm -f "$cache_file.tmp"
            exit 1
        fi
        
        mv "$cache_file.tmp" "$cache_file"
        log_success "下载完成: $cache_file"
    fi
}

# 解压文件
extract_gost() {
    local cache_file="$CACHE_DIR/$FILENAME"
    local extract_dir="$CACHE_DIR/extract_$$"
    local target_path="$ASSETS_DIR/$PLATFORM/$EXECUTABLE_NAME"
    
    log_info "解压 GOST 文件..."
    
    # 创建临时解压目录
    mkdir -p "$extract_dir"
    
    # 解压文件
    if [[ "$FILENAME" == *.tar.gz ]]; then
        tar -xzf "$cache_file" -C "$extract_dir"
    elif [[ "$FILENAME" == *.zip ]]; then
        unzip -q "$cache_file" -d "$extract_dir"
    else
        log_error "不支持的压缩格式: $FILENAME"
        rm -rf "$extract_dir"
        exit 1
    fi
    
    # 查找可执行文件
    local extracted_gost=$(find "$extract_dir" -name "$EXECUTABLE_NAME" -type f | head -1)
    
    if [[ -z "$extracted_gost" ]]; then
        log_error "在解压文件中未找到 $EXECUTABLE_NAME"
        rm -rf "$extract_dir"
        exit 1
    fi
    
    # 复制到目标位置
    cp "$extracted_gost" "$target_path"
    chmod +x "$target_path"
    
    # 清理临时目录
    rm -rf "$extract_dir"
    
    log_success "GOST 安装完成: $target_path"
}

# 验证安装
verify_installation() {
    local target_path="$ASSETS_DIR/$PLATFORM/$EXECUTABLE_NAME"
    
    if [[ ! -f "$target_path" ]]; then
        log_error "安装验证失败: 文件不存在"
        exit 1
    fi
    
    if [[ ! -x "$target_path" ]]; then
        log_error "安装验证失败: 文件不可执行"
        exit 1
    fi
    
    # 尝试获取版本信息
    local version_output=$("$target_path" --version 2>/dev/null | head -1 || echo "版本信息获取失败")
    log_success "安装验证通过"
    log_info "版本信息: $version_output"
    log_info "文件大小: $(du -h "$target_path" | cut -f1)"
}

# 清理缓存
cleanup_cache() {
    if [[ "$1" == "--clean-cache" ]]; then
        log_info "清理下载缓存..."
        rm -rf "$CACHE_DIR"
        log_success "缓存清理完成"
    fi
}

# 显示帮助信息
show_help() {
    echo "GOST 下载管理脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --force        强制重新下载，即使文件已存在"
    echo "  --clean-cache  清理下载缓存"
    echo "  --help         显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                    # 下载并安装 GOST"
    echo "  $0 --force           # 强制重新下载"
    echo "  $0 --clean-cache     # 清理缓存"
}

# 主函数
main() {
    local force_download=""
    local clean_cache=""
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                force_download="--force"
                shift
                ;;
            --clean-cache)
                clean_cache="--clean-cache"
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    log_info "开始 GOST 下载和安装流程..."
    
    # 执行主要流程
    detect_platform
    build_download_info
    create_directories
    
    if ! check_existing "$force_download"; then
        download_gost "$force_download"
        extract_gost
        verify_installation
    fi
    
    cleanup_cache "$clean_cache"
    
    log_success "GOST 管理完成！"
}

# 执行主函数
main "$@"
