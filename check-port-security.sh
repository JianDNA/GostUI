#!/bin/bash

# GOST管理系统端口安全检查脚本
# 用于检查所有端口的安全配置状态

# set -e  # 注释掉，避免脚本在检查过程中意外退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 安全检查结果
SECURITY_ISSUES=0
WARNINGS=0
INFO_ITEMS=0

# 记录安全问题
log_issue() {
    echo -e "${RED}❌ $1${NC}"
    ((SECURITY_ISSUES++))
}

# 记录警告
log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}

# 记录信息
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
    ((INFO_ITEMS++))
}

# 记录正常状态
log_ok() {
    echo -e "${GREEN}✅ $1${NC}"
}

# 检查GOST WebAPI安全性
check_gost_webapi() {
    echo -e "${BLUE}🔍 检查GOST WebAPI安全配置...${NC}"
    
    CONFIG_FILE="backend/config/gost-config.json"
    if [[ -f "$CONFIG_FILE" ]]; then
        # 查找api部分的addr配置
        API_ADDR=$(grep -A 4 '"api"' "$CONFIG_FILE" | grep '"addr"' | head -1 | sed 's/.*"addr":\s*"\([^"]*\)".*/\1/' 2>/dev/null || echo "")

        if [[ "$API_ADDR" == ":18080" ]]; then
            log_issue "GOST WebAPI监听所有接口 ($API_ADDR) - 存在严重安全风险"
            echo "   风险: 外部用户可访问 http://您的IP:18080/api/config"
            echo "   修复: 运行 ./deploy.sh 或 ./smart-update.sh 自动修复"
        elif [[ "$API_ADDR" == "127.0.0.1:18080" ]]; then
            log_ok "GOST WebAPI仅监听本地接口 ($API_ADDR)"
        elif [[ -n "$API_ADDR" ]]; then
            log_warning "GOST WebAPI监听地址: $API_ADDR"
        else
            log_info "未找到GOST WebAPI配置"
        fi
    else
        log_info "GOST配置文件不存在: $CONFIG_FILE"
    fi
}

# 检查GOST插件配置
check_gost_plugins() {
    echo -e "${BLUE}🔍 检查GOST插件安全配置...${NC}"

    CONFIG_FILE="backend/config/gost-config.json"
    if [[ -f "$CONFIG_FILE" ]]; then
        # 检查观察器配置
        if grep -q "localhost:3000/api/gost-plugin/observer" "$CONFIG_FILE" 2>/dev/null; then
            log_ok "观察器配置安全（通过主服务端口3000）"
        else
            log_info "观察器配置未找到或配置异常"
        fi

        # 检查限制器配置
        if grep -q "localhost:3000/api/gost-plugin/limiter" "$CONFIG_FILE" 2>/dev/null; then
            log_ok "限制器配置安全（通过主服务端口3000）"
        else
            log_info "限制器配置未找到或配置异常"
        fi
    fi
}

# 检查端口监听状态
check_port_listening() {
    echo -e "${BLUE}🔍 检查端口监听状态...${NC}"
    
    if command -v netstat >/dev/null 2>&1; then
        # 检查18080端口（GOST WebAPI）
        LISTEN_18080=$(netstat -tln 2>/dev/null | grep :18080 | head -1 || echo "")
        if [[ -n "$LISTEN_18080" ]]; then
            if echo "$LISTEN_18080" | grep -q "127.0.0.1:18080"; then
                log_ok "端口18080仅监听本地接口"
            elif echo "$LISTEN_18080" | grep -q "0.0.0.0:18080"; then
                log_issue "端口18080监听所有接口 - 存在严重安全风险"
                echo "   风险: 外部用户可访问GOST WebAPI"
            else
                log_warning "端口18080监听状态: $LISTEN_18080"
            fi
        else
            log_info "端口18080未监听（服务可能未启动）"
        fi
        
        # 检查18081端口（观察器）
        LISTEN_18081=$(netstat -tln 2>/dev/null | grep :18081 | head -1 || echo "")
        if [[ -n "$LISTEN_18081" ]]; then
            if echo "$LISTEN_18081" | grep -q "127.0.0.1:18081"; then
                log_ok "端口18081仅监听本地接口"
            elif echo "$LISTEN_18081" | grep -q "0.0.0.0:18081"; then
                log_issue "端口18081监听所有接口 - 存在安全风险"
            else
                log_warning "端口18081监听状态: $LISTEN_18081"
            fi
        else
            log_info "端口18081未监听（观察器服务可能未启动）"
        fi
        
        # 检查3000端口（主Web服务）
        LISTEN_3000=$(netstat -tln 2>/dev/null | grep :3000 | head -1 || echo "")
        if [[ -n "$LISTEN_3000" ]]; then
            log_ok "端口3000正常监听（主Web服务）"
        else
            log_info "端口3000未监听（主服务可能未启动）"
        fi
        
        # 检查其他可疑端口
        echo -e "${BLUE}🔍 检查其他端口...${NC}"
        SUSPICIOUS_PORTS=$(netstat -tln 2>/dev/null | grep -E ":18082|:18083|:18084|:18085|:18086|:18087|:18088|:18089|:18090" || echo "")
        if [[ -n "$SUSPICIOUS_PORTS" ]]; then
            log_warning "发现其他18xxx端口监听:"
            echo "$SUSPICIOUS_PORTS" | while read line; do
                echo "   $line"
            done
        else
            log_ok "未发现其他可疑端口监听"
        fi
        
    elif command -v ss >/dev/null 2>&1; then
        log_info "使用ss命令检查端口（netstat不可用）"

        # 检查18080端口
        LISTEN_18080=$(ss -tln 2>/dev/null | grep :18080 | head -1 || true)
        if [[ -n "$LISTEN_18080" ]]; then
            if echo "$LISTEN_18080" | grep -q "127.0.0.1:18080"; then
                log_ok "端口18080仅监听本地接口"
            elif echo "$LISTEN_18080" | grep -q "0.0.0.0:18080"; then
                log_issue "端口18080监听所有接口 - 存在严重安全风险"
            else
                log_warning "端口18080监听状态: $LISTEN_18080"
            fi
        else
            log_info "端口18080未监听（服务可能未启动）"
        fi

        # 检查18081端口
        LISTEN_18081=$(ss -tln 2>/dev/null | grep :18081 | head -1 || true)
        if [[ -n "$LISTEN_18081" ]]; then
            if echo "$LISTEN_18081" | grep -q "127.0.0.1:18081"; then
                log_ok "端口18081仅监听本地接口"
            elif echo "$LISTEN_18081" | grep -q "0.0.0.0:18081"; then
                log_issue "端口18081监听所有接口 - 存在安全风险"
            else
                log_warning "端口18081监听状态: $LISTEN_18081"
            fi
        else
            log_info "端口18081未监听（观察器服务可能未启动）"
        fi

        # 检查3000端口
        LISTEN_3000=$(ss -tln 2>/dev/null | grep :3000 | head -1 || true)
        if [[ -n "$LISTEN_3000" ]]; then
            log_ok "端口3000正常监听（主Web服务）"
        else
            log_info "端口3000未监听（主服务可能未启动）"
        fi
    else
        log_warning "无法检查端口监听状态（netstat和ss都不可用）"
    fi
}

# 检查防火墙配置
check_firewall() {
    echo -e "${BLUE}🔍 检查防火墙配置...${NC}"
    
    # 检查ufw
    if command -v ufw >/dev/null 2>&1; then
        UFW_STATUS=$(ufw status 2>/dev/null | head -1 || echo "")
        if echo "$UFW_STATUS" | grep -q "Status: active"; then
            log_ok "ufw防火墙已启用"
            
            # 检查18080端口规则
            UFW_RULES=$(ufw status numbered 2>/dev/null || echo "")
            if echo "$UFW_RULES" | grep -q "18080.*DENY"; then
                log_ok "ufw已配置阻止外部访问端口18080"
            else
                log_warning "ufw未配置端口18080访问限制"
            fi
        else
            log_warning "ufw防火墙未启用"
        fi
    else
        log_info "ufw防火墙未安装"
    fi
    
    # 检查iptables
    if command -v iptables >/dev/null 2>&1; then
        IPTABLES_RULES=$(iptables -L 2>/dev/null | grep -i "18080" || echo "")
        if [[ -n "$IPTABLES_RULES" ]]; then
            if echo "$IPTABLES_RULES" | grep -q "DROP\|REJECT"; then
                log_ok "iptables已配置端口18080访问限制"
            else
                log_info "iptables端口18080规则: $IPTABLES_RULES"
            fi
        else
            log_info "iptables未配置端口18080规则"
        fi
    else
        log_info "iptables不可用"
    fi
}

# 生成安全报告
generate_security_report() {
    echo ""
    echo -e "${BLUE}📊 端口安全检查报告${NC}"
    echo "=================================="
    echo -e "检查时间: $(date)"
    echo -e "安全问题: ${RED}$SECURITY_ISSUES${NC}"
    echo -e "警告信息: ${YELLOW}$WARNINGS${NC}"
    echo -e "信息项目: ${BLUE}$INFO_ITEMS${NC}"
    echo ""
    
    if [[ $SECURITY_ISSUES -eq 0 && $WARNINGS -eq 0 ]]; then
        echo -e "${GREEN}🎉 端口安全状态优秀！${NC}"
    elif [[ $SECURITY_ISSUES -eq 0 ]]; then
        echo -e "${YELLOW}⚠️  发现 $WARNINGS 个警告，建议关注${NC}"
    else
        echo -e "${RED}🚨 发现 $SECURITY_ISSUES 个安全问题，需要立即处理！${NC}"
        echo ""
        echo -e "${BLUE}🔧 修复建议:${NC}"
        echo "1. 运行自动修复: ./deploy.sh 或 ./smart-update.sh"
        echo "2. 配置防火墙: sudo ufw deny 18080/tcp"
        echo "3. 重启服务: pm2 restart gost-management"
        echo "4. 重新检查: ./check-port-security.sh"
    fi
    
    echo ""
    echo -e "${BLUE}💡 安全建议:${NC}"
    echo "1. 定期运行此脚本检查端口安全状态"
    echo "2. 确保只有必要的端口对外开放"
    echo "3. 使用防火墙限制敏感端口的外部访问"
    echo "4. 监控系统日志，关注异常访问"
}

# 主函数
main() {
    echo -e "${GREEN}🔒 GOST管理系统端口安全检查${NC}"
    echo "   版本: 1.0.0"
    echo "   功能: 全面检查端口安全配置状态"
    echo ""
    
    # 执行各项安全检查
    check_gost_webapi
    echo ""
    
    check_gost_plugins
    echo ""
    
    check_port_listening
    echo ""

    check_firewall
    echo ""

    # 生成报告
    generate_security_report
}

# 运行主函数
main "$@"
