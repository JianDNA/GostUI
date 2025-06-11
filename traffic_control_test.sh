#!/bin/bash

# 🧪 GOST流量控制全面测试脚本
# 测试流量重置和增量配额功能

set -e

# 配置
BACKEND_URL="http://localhost:3000"
TEST_PORT="6443"
TRAFFIC_SIZE="100"  # 每次测试100MB
QUOTA_500MB="0.5"   # 500MB配额
QUOTA_1GB="1.0"     # 1GB配额

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

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

# 获取管理员token
get_admin_token() {
    curl -s -X POST "$BACKEND_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | \
        grep -o '"token":"[^"]*"' | cut -d'"' -f4
}

# 获取用户状态
get_user_status() {
    local token=$1
    curl -s -H "Authorization: Bearer $token" "$BACKEND_URL/api/users/2"
}

# 重置用户流量
reset_user_traffic() {
    local token=$1
    log_info "🔄 重置test用户流量..."
    curl -s -H "Authorization: Bearer $token" \
        -X POST "$BACKEND_URL/api/users/2/reset-traffic"
}

# 设置用户配额
set_user_quota() {
    local token=$1
    local quota=$2
    log_info "📊 设置test用户配额为 ${quota}GB..."
    curl -s -H "Authorization: Bearer $token" \
        -X PUT "$BACKEND_URL/api/users/2" \
        -H "Content-Type: application/json" \
        -d "{\"trafficQuota\": $quota}"
}

# 增加用户配额
increase_user_quota() {
    local token=$1
    local additional_quota=$2
    log_info "📈 为test用户增加 ${additional_quota}GB 配额..."
    curl -s -H "Authorization: Bearer $token" \
        -X POST "$BACKEND_URL/api/users/2/increase-quota" \
        -H "Content-Type: application/json" \
        -d "{\"additionalQuota\": $additional_quota}"
}

# 启用转发规则
enable_forwarding_rules() {
    local token=$1
    log_info "🔛 启用test用户的转发规则..."
    curl -s -H "Authorization: Bearer $token" \
        -X PUT "$BACKEND_URL/api/forward-rules/9" \
        -H "Content-Type: application/json" \
        -d '{"isActive": true}' > /dev/null
    curl -s -H "Authorization: Bearer $token" \
        -X PUT "$BACKEND_URL/api/forward-rules/10" \
        -H "Content-Type: application/json" \
        -d '{"isActive": true}' > /dev/null
}

# 测试流量传输
test_traffic() {
    local size=$1
    local expected_success=$2
    local test_name="$3"
    
    log_test "🚀 测试流量传输: $test_name (${size}MB)"
    
    # 发送流量测试请求
    local start_time=$(date +%s)
    local response=$(curl -s -w "%{http_code}" -o /tmp/traffic_response.txt \
        "http://localhost:$TEST_PORT/api/test/traffic-custom?size=$size" 2>/dev/null || echo "000")
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # 分析响应
    if [ "$response" = "200" ]; then
        local actual_size=$(cat /tmp/traffic_response.txt | wc -c)
        local actual_mb=$((actual_size / 1024 / 1024))
        
        if [ "$expected_success" = "true" ]; then
            log_success "✅ 转发成功: ${actual_mb}MB 在 ${duration}秒内传输"
            return 0
        else
            log_error "❌ 预期失败但转发成功: ${actual_mb}MB"
            return 1
        fi
    else
        if [ "$expected_success" = "false" ]; then
            log_success "✅ 转发被正确阻止 (HTTP $response)"
            return 0
        else
            log_error "❌ 预期成功但转发失败 (HTTP $response)"
            return 1
        fi
    fi
}

# 等待系统同步
wait_for_sync() {
    log_info "⏳ 等待系统同步..."
    sleep 3
}

# 显示用户状态
show_user_status() {
    local token=$1
    local status=$(get_user_status "$token")
    local used_gb=$(echo "$status" | grep -o '"usedTrafficGB":"[^"]*"' | cut -d'"' -f4)
    local quota_gb=$(echo "$status" | grep -o '"trafficQuotaGB":[^,]*' | cut -d':' -f2)
    local usage_percent=$(echo "$status" | grep -o '"usagePercent":"[^"]*"' | cut -d'"' -f4)
    
    log_info "📊 用户状态: 已用 ${used_gb}GB / 配额 ${quota_gb}GB (${usage_percent}%)"
}

# 主测试函数
main() {
    log_info "🧪 开始GOST流量控制全面测试"
    log_info "=================================="
    
    # 获取管理员token
    local token=$(get_admin_token)
    if [ -z "$token" ]; then
        log_error "无法获取管理员token"
        exit 1
    fi
    
    log_success "✅ 获取管理员token成功"
    
    # 测试计数器
    local test_round=1
    local total_tests=0
    local passed_tests=0
    
    # ==========================================
    # 第一阶段：流量重置测试 (3轮)
    # ==========================================
    log_info ""
    log_info "🔄 第一阶段：流量重置测试 (3轮)"
    log_info "=================================="
    
    for round in 1 2 3; do
        log_info ""
        log_info "🔄 === 重置测试第 $round 轮 ==="
        
        # 1. 重置流量并设置500MB配额
        reset_user_traffic "$token" > /dev/null
        set_user_quota "$token" "$QUOTA_500MB" > /dev/null
        enable_forwarding_rules "$token"
        wait_for_sync
        show_user_status "$token"
        
        # 2. 测试正常转发 (前5次应该成功)
        for i in 1 2 3 4 5; do
            total_tests=$((total_tests + 1))
            if test_traffic "$TRAFFIC_SIZE" "true" "第${round}轮-正常转发${i}"; then
                passed_tests=$((passed_tests + 1))
            fi
            wait_for_sync
            show_user_status "$token"
        done
        
        # 3. 测试超限阻止 (第6、7次应该失败)
        for i in 6 7; do
            total_tests=$((total_tests + 1))
            if test_traffic "$TRAFFIC_SIZE" "false" "第${round}轮-超限阻止${i}"; then
                passed_tests=$((passed_tests + 1))
            fi
            wait_for_sync
            show_user_status "$token"
        done
        
        log_info "第 $round 轮重置测试完成"
    done
    
    # ==========================================
    # 第二阶段：增量配额测试 (3轮)
    # ==========================================
    log_info ""
    log_info "📈 第二阶段：增量配额测试 (3轮)"
    log_info "=================================="
    
    for round in 1 2 3; do
        log_info ""
        log_info "📈 === 增量测试第 $round 轮 ==="
        
        # 1. 重置流量并设置500MB配额
        reset_user_traffic "$token" > /dev/null
        set_user_quota "$token" "$QUOTA_500MB" > /dev/null
        enable_forwarding_rules "$token"
        wait_for_sync
        show_user_status "$token"
        
        # 2. 消耗到限额
        for i in 1 2 3 4 5; do
            test_traffic "$TRAFFIC_SIZE" "true" "第${round}轮-消耗到限额${i}" > /dev/null
            wait_for_sync
        done
        show_user_status "$token"
        
        # 3. 验证已被阻止
        total_tests=$((total_tests + 1))
        if test_traffic "$TRAFFIC_SIZE" "false" "第${round}轮-验证阻止"; then
            passed_tests=$((passed_tests + 1))
        fi
        
        # 4. 增加1GB配额
        increase_user_quota "$token" "$QUOTA_1GB" > /dev/null
        enable_forwarding_rules "$token"
        wait_for_sync
        show_user_status "$token"
        
        # 5. 测试恢复转发
        total_tests=$((total_tests + 1))
        if test_traffic "$TRAFFIC_SIZE" "true" "第${round}轮-恢复转发"; then
            passed_tests=$((passed_tests + 1))
        fi
        wait_for_sync
        show_user_status "$token"
        
        # 6. 再次增加1GB配额
        increase_user_quota "$token" "$QUOTA_1GB" > /dev/null
        enable_forwarding_rules "$token"
        wait_for_sync
        show_user_status "$token"
        
        # 7. 测试继续转发
        total_tests=$((total_tests + 1))
        if test_traffic "$TRAFFIC_SIZE" "true" "第${round}轮-继续转发"; then
            passed_tests=$((passed_tests + 1))
        fi
        wait_for_sync
        show_user_status "$token"
        
        log_info "第 $round 轮增量测试完成"
    done
    
    # ==========================================
    # 测试总结
    # ==========================================
    log_info ""
    log_info "🎯 测试总结"
    log_info "=================================="
    log_info "总测试数: $total_tests"
    log_info "通过测试: $passed_tests"
    log_info "失败测试: $((total_tests - passed_tests))"
    
    if [ $passed_tests -eq $total_tests ]; then
        log_success "🎉 所有测试通过！流量控制系统工作正常"
        exit 0
    else
        log_error "❌ 有测试失败！请检查系统状态"
        exit 1
    fi
}

# 运行主函数
main "$@"
