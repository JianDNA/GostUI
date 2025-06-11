#!/bin/bash

# 🔍 详细调试流量控制系统测试脚本
# 实时监控每个步骤的系统状态

set -e

# 配置
BASE_URL="http://localhost:3000"
TEST_USER_ID=2
TEST_USER_NAME="test"
QUOTA_LIMIT_MB=500
TRANSFER_SIZE_MB=100

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

log_debug() {
    echo -e "${PURPLE}[DEBUG]${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# 获取认证token
get_token() {
    log_info "获取管理员认证token..."
    TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

    if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
        log_error "获取token失败"
        exit 1
    fi
    log_success "Token获取成功"
}

# 获取详细用户状态
get_detailed_user_status() {
    local user_data=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/users" | \
        jq ".[] | select(.username == \"$TEST_USER_NAME\")")

    local username=$(echo "$user_data" | jq -r '.username')
    local status=$(echo "$user_data" | jq -r '.userStatus')
    local used_traffic=$(echo "$user_data" | jq -r '.usedTraffic')
    local quota=$(echo "$user_data" | jq -r '.trafficQuota')
    local used_mb=$(echo "scale=2; $used_traffic / 1024 / 1024" | bc)
    local quota_mb=$(echo "scale=0; $quota * 1024" | bc)
    local percentage=$(echo "scale=1; $used_traffic * 100 / ($quota * 1024 * 1024 * 1024)" | bc)

    echo "用户: $username | 状态: $status | 已用: ${used_mb}MB | 配额: ${quota_mb}MB | 使用率: ${percentage}%"
}

# 获取规则状态
get_rules_status() {
    curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/user-forward-rules" | \
        jq -r ".groupedRules[] | select(.username == \"$TEST_USER_NAME\") | .rules[] | \"端口 \(.sourcePort): \(.name) - \(if .isActive then \"活跃\" else \"禁用\" end)\""
}

# 检查端口连通性
check_port_connectivity() {
    local port="$1"
    log_debug "检查端口 $port 连通性..."

    local response=$(timeout 5 curl -s -w "%{http_code}" -o /dev/null --connect-timeout 3 "http://localhost:$port/api/test/traffic-custom?size=1" 2>/dev/null || echo "000")

    if [ "$response" = "200" ]; then
        log_success "端口 $port 可连接"
        return 0
    else
        log_warning "端口 $port 不可连接 (HTTP: $response)"
        return 1
    fi
}

# 重置用户流量
reset_user_traffic() {
    local reason="$1"
    log_info "重置用户 $TEST_USER_NAME 的流量..."

    local result=$(curl -s -X POST "$BASE_URL/api/users/$TEST_USER_ID/reset-traffic" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"reason\":\"$reason\"}" | jq -r '.success')

    if [ "$result" = "true" ]; then
        log_success "流量重置成功"
        sleep 3  # 等待系统处理
        return 0
    else
        log_error "流量重置失败"
        return 1
    fi
}

# 执行流量测试
test_traffic_transfer() {
    local size_mb="$1"
    local test_name="$2"

    log_info "[$test_name] 开始传输 ${size_mb}MB 数据..."

    # 记录开始时间
    local start_time=$(date +%s.%N)

    # 执行传输
    local response=$(curl -s -w "%{http_code}:%{size_download}:%{time_total}" -o /dev/null \
        "http://localhost:6443/api/test/traffic-custom?size=$size_mb" 2>/dev/null || echo "000:0:0")

    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)

    # 解析响应
    IFS=':' read -r http_code download_size transfer_time <<< "$response"

    if [ "$http_code" = "200" ] && [ "$download_size" -gt 1000000 ]; then
        local speed_mbps=$(echo "scale=2; $download_size / 1024 / 1024 / $transfer_time" | bc)
        log_success "[$test_name] 传输成功: ${size_mb}MB, 耗时: ${transfer_time}s, 速度: ${speed_mbps}MB/s"
        return 0
    else
        log_error "[$test_name] 传输失败: HTTP $http_code, 下载: $download_size bytes"
        return 1
    fi
}

# 显示完整状态
show_full_status() {
    local step_name="$1"
    echo -e "\n${PURPLE}=== [$step_name] 系统状态 ===${NC}"
    get_detailed_user_status
    get_rules_status
    echo ""

    # 检查端口连通性
    check_port_connectivity 6443
    check_port_connectivity 2365
    echo ""
}

# 等待并检查状态变化
wait_and_check() {
    local step_name="$1"
    local wait_seconds="${2:-5}"

    log_info "等待 ${wait_seconds} 秒，检查状态变化..."
    sleep "$wait_seconds"
    show_full_status "$step_name"
}

# 主测试流程
main() {
    log_section "🔍 开始详细调试测试"

    # 获取认证
    get_token

    # 显示初始状态
    show_full_status "初始状态"

    # ==================== 详细测试流程 ====================

    log_section "🔄 第1步：重置用户流量"
    reset_user_traffic "详细调试测试"
    wait_and_check "流量重置后" 3

    log_section "📊 第2步：小量传输测试 (50MB)"
    test_traffic_transfer 50 "小量测试"
    wait_and_check "50MB传输后" 3

    log_section "📊 第3步：中量传输测试 (100MB)"
    test_traffic_transfer 100 "中量测试"
    wait_and_check "100MB传输后" 3

    log_section "📊 第4步：继续传输测试 (100MB)"
    test_traffic_transfer 100 "继续测试1"
    wait_and_check "200MB传输后" 3

    log_section "📊 第5步：继续传输测试 (100MB)"
    test_traffic_transfer 100 "继续测试2"
    wait_and_check "300MB传输后" 3

    log_section "📊 第6步：继续传输测试 (100MB)"
    test_traffic_transfer 100 "继续测试3"
    wait_and_check "400MB传输后" 3

    log_section "📊 第7步：接近限制传输测试 (100MB)"
    test_traffic_transfer 100 "接近限制"
    wait_and_check "500MB传输后" 5

    log_section "📊 第8步：超限制传输测试 (100MB)"
    log_warning "此次传输可能会被阻止或导致用户被禁用"
    if test_traffic_transfer 100 "超限制测试"; then
        log_warning "传输成功，检查是否触发配额控制..."
    else
        log_info "传输被阻止，这是预期行为"
    fi
    wait_and_check "600MB传输后" 5

    log_section "📊 第9步：验证禁用状态"
    log_info "尝试再次传输，验证是否真的被禁用..."
    if test_traffic_transfer 50 "禁用验证"; then
        log_error "❌ 用户被禁用后仍能传输，系统异常！"
    else
        log_success "✅ 用户被正确禁用，无法传输"
    fi
    wait_and_check "禁用验证后" 3

    log_section "🔄 第10步：重置并验证恢复"
    reset_user_traffic "恢复测试"
    wait_and_check "重置后" 3

    log_section "📊 第11步：验证恢复后的传输"
    if test_traffic_transfer 50 "恢复验证"; then
        log_success "✅ 用户恢复后可以正常传输"
    else
        log_error "❌ 用户恢复后仍无法传输，系统异常！"
    fi
    wait_and_check "恢复验证后" 3

    log_section "🎉 测试完成"
    log_info "详细调试测试已完成，请检查所有结果"
}

# 运行主程序
main "$@"
