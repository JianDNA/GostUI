#!/bin/bash

# 🧪 综合流量控制测试脚本 - 实时监控版本

set -e

# 配置
BACKEND_URL="http://localhost:3000"
TEST_PORT="6443"
TRAFFIC_SIZE="100"  # 每次测试100MB
QUOTA_LIMIT="500"   # 基础限额500MB
EXPECTED_TRANSFERS=15  # 预期转发15次(1500MB)，超出限制3倍

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_warning() {
    echo -e "${PURPLE}[WARNING]${NC} $1"
}

log_monitor() {
    echo -e "${CYAN}[MONITOR]${NC} $1"
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
    local response=$(curl -s -H "Authorization: Bearer $token" \
        -X POST "$BACKEND_URL/api/users/2/reset-traffic")
    echo "$response"
}

# 设置用户配额
set_user_quota() {
    local token=$1
    local quota_gb=$2
    log_info "📊 设置test用户配额为 ${quota_gb}GB..."
    curl -s -H "Authorization: Bearer $token" \
        -X PUT "$BACKEND_URL/api/users/2" \
        -H "Content-Type: application/json" \
        -d "{\"trafficQuota\": $quota_gb}" > /dev/null
}

# 恢复用户状态（从暂停状态恢复）
restore_user_status() {
    local token=$1
    log_info "🔓 恢复test用户状态..."
    curl -s -H "Authorization: Bearer $token" \
        -X PUT "$BACKEND_URL/api/users/2" \
        -H "Content-Type: application/json" \
        -d '{"userStatus": "active"}' > /dev/null
}

# 增加用户配额
increase_user_quota() {
    local token=$1
    local additional_gb=$2
    
    # 获取当前配额
    local status=$(get_user_status "$token")
    local current_quota=$(echo "$status" | grep -o '"trafficQuotaGB":[^,]*' | cut -d':' -f2)
    local new_quota=$(echo "$current_quota + $additional_gb" | bc)
    
    log_info "📈 增加test用户配额: ${current_quota}GB -> ${new_quota}GB (+${additional_gb}GB)"
    curl -s -H "Authorization: Bearer $token" \
        -X PUT "$BACKEND_URL/api/users/2" \
        -H "Content-Type: application/json" \
        -d "{\"trafficQuota\": $new_quota}" > /dev/null
}

# 测试流量传输
test_traffic() {
    local size=$1
    local test_name="$2"
    
    log_test "🚀 测试流量传输: $test_name (${size}MB)"
    
    # 发送流量测试请求
    local start_time=$(date +%s)
    local response=$(timeout 30 curl -s -w "%{http_code}" -o /tmp/traffic_response.txt \
        "http://localhost:$TEST_PORT/api/test/traffic-custom?size=$size" 2>/dev/null || echo "000")
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # 分析响应
    if [ "$response" = "200" ]; then
        local actual_size=$(cat /tmp/traffic_response.txt | wc -c)
        local actual_mb=$((actual_size / 1024 / 1024))
        log_success "✅ 转发成功: ${actual_mb}MB 在 ${duration}秒内传输"
        return 0
    else
        log_error "❌ 转发失败 (HTTP $response)"
        return 1
    fi
}

# 显示用户状态
show_user_status() {
    local token=$1
    local status=$(get_user_status "$token")
    local used_gb=$(echo "$status" | grep -o '"usedTrafficGB":"[^"]*"' | cut -d'"' -f4)
    local quota_gb=$(echo "$status" | grep -o '"trafficQuotaGB":[^,]*' | cut -d':' -f2)
    local usage_percent=$(echo "$status" | grep -o '"usagePercent":"[^"]*"' | cut -d'"' -f4)
    local user_status=$(echo "$status" | grep -o '"userStatus":"[^"]*"' | cut -d'"' -f4)
    
    log_monitor "📊 用户状态: ${user_status} | 已用 ${used_gb}GB / 配额 ${quota_gb}GB (${usage_percent}%)"
}

# 等待系统同步
wait_for_sync() {
    local seconds=${1:-3}
    log_info "⏳ 等待系统同步 ${seconds}秒..."
    sleep $seconds
}

# 检查转发是否可用
check_forwarding_available() {
    local response=$(timeout 5 curl -s -w "%{http_code}" -o /dev/null \
        "http://localhost:$TEST_PORT/api/test/traffic-custom?size=1" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        log_success "✅ 转发端口可用"
        return 0
    else
        log_error "❌ 转发端口不可用 (HTTP $response)"
        return 1
    fi
}

# 执行流量重置测试轮次
run_reset_round() {
    local round=$1
    local token=$2
    
    log_info ""
    log_info "🔄 ========== 重置测试轮次 $round =========="
    
    # 1. 重置流量和恢复用户状态
    reset_user_traffic "$token" > /dev/null
    restore_user_status "$token"
    set_user_quota "$token" "0.5"  # 500MB
    wait_for_sync 5
    show_user_status "$token"
    
    # 2. 检查转发是否立即可用
    log_test "🔍 检查重置后转发是否立即可用..."
    if check_forwarding_available; then
        log_success "✅ 重置后转发立即可用"
    else
        log_error "❌ 重置后转发不可用 - 这是一个BUG！"
    fi
    
    # 3. 进行流量传输测试
    local success_count=0
    local total_transferred=0
    
    for i in $(seq 1 $EXPECTED_TRANSFERS); do
        log_test "第${i}次传输 (目标: 超出限制到1500MB)"
        
        if test_traffic "$TRAFFIC_SIZE" "轮次${round}-传输${i}"; then
            success_count=$((success_count + 1))
            total_transferred=$((total_transferred + TRAFFIC_SIZE))
        else
            log_warning "传输失败，可能已达到限制"
            break
        fi
        
        wait_for_sync 2
        show_user_status "$token"
        
        # 检查是否应该被限制
        if [ $total_transferred -gt 700 ]; then
            log_warning "⚠️ 已传输${total_transferred}MB，超出预期限制(500MB+200MB容差)"
        fi
    done
    
    log_info "📊 轮次${round}结果: 成功传输 ${success_count}/${EXPECTED_TRANSFERS} 次，总计 ${total_transferred}MB"
    
    # 4. 检查最终状态
    wait_for_sync 3
    show_user_status "$token"
    
    # 5. 验证转发是否被正确禁用
    log_test "🔍 检查超限后转发是否被禁用..."
    if ! check_forwarding_available; then
        log_success "✅ 超限后转发被正确禁用"
    else
        log_error "❌ 超限后转发仍然可用 - 这是一个严重BUG！"
    fi
}

# 执行配额增加测试轮次
run_increase_round() {
    local round=$1
    local token=$2
    
    log_info ""
    log_info "📈 ========== 配额增加测试轮次 $round =========="
    
    # 1. 增加1GB配额并恢复用户状态
    increase_user_quota "$token" "1"
    restore_user_status "$token"
    wait_for_sync 5
    show_user_status "$token"
    
    # 2. 检查增加配额后转发是否立即可用
    log_test "🔍 检查增加配额后转发是否立即可用..."
    if check_forwarding_available; then
        log_success "✅ 增加配额后转发立即可用"
    else
        log_error "❌ 增加配额后转发不可用 - 这是一个BUG！"
    fi
    
    # 3. 进行流量传输测试直到再次超限
    local success_count=0
    local total_transferred=0
    
    for i in $(seq 1 $EXPECTED_TRANSFERS); do
        log_test "第${i}次传输 (目标: 再次超出新限制)"
        
        if test_traffic "$TRAFFIC_SIZE" "增加轮次${round}-传输${i}"; then
            success_count=$((success_count + 1))
            total_transferred=$((total_transferred + TRAFFIC_SIZE))
        else
            log_warning "传输失败，可能已达到新限制"
            break
        fi
        
        wait_for_sync 2
        show_user_status "$token"
    done
    
    log_info "📊 增加轮次${round}结果: 成功传输 ${success_count}/${EXPECTED_TRANSFERS} 次，总计 ${total_transferred}MB"
    
    # 4. 检查最终状态
    wait_for_sync 3
    show_user_status "$token"
    
    # 5. 验证转发是否被正确禁用
    log_test "🔍 检查再次超限后转发是否被禁用..."
    if ! check_forwarding_available; then
        log_success "✅ 再次超限后转发被正确禁用"
    else
        log_error "❌ 再次超限后转发仍然可用 - 这是一个严重BUG！"
    fi
}

# 主测试函数
main() {
    log_info "🧪 开始综合流量控制测试"
    log_info "=========================================="
    log_info "测试配置:"
    log_info "  - 基础配额: ${QUOTA_LIMIT}MB"
    log_info "  - 每次传输: ${TRAFFIC_SIZE}MB"
    log_info "  - 预期传输次数: ${EXPECTED_TRANSFERS} (总计1500MB)"
    log_info "  - 允许容差: 200MB (最多700MB)"
    log_info ""
    
    # 获取管理员token
    local token=$(get_admin_token)
    if [ -z "$token" ]; then
        log_error "无法获取管理员token"
        exit 1
    fi
    
    log_success "✅ 获取管理员token成功"
    
    # 执行3轮重置测试
    for round in 1 2 3; do
        run_reset_round $round "$token"
        log_info "⏸️ 轮次间隔等待..."
        sleep 5
    done
    
    # 执行3轮配额增加测试
    for round in 1 2 3; do
        run_increase_round $round "$token"
        log_info "⏸️ 轮次间隔等待..."
        sleep 5
    done
    
    log_info ""
    log_success "🎯 综合测试完成！"
    log_info "请检查以上输出和后端日志，确认："
    log_info "1. 重置/增加配额后转发立即可用"
    log_info "2. 超限后转发被正确禁用"
    log_info "3. 流量统计与实际传输匹配"
    log_info "4. 系统响应及时，无延迟"
    log_info "5. GOST策略不影响admin用户(9080端口)"
}

# 运行主函数
main "$@"
