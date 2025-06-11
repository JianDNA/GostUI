#!/bin/bash

# 🧪 流量控制系统综合测试脚本
# 测试流量重置和增量配额的完整流程

set -e

# 配置
BASE_URL="http://localhost:3000"
TEST_USER_ID=2
TEST_USER_NAME="test"
QUOTA_LIMIT_MB=500
TRANSFER_SIZE_MB=100
TARGET_TRANSFER_MB=1500  # 超过限制3倍才进行下一轮

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

# 获取用户状态
get_user_status() {
    curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/users" | \
        jq ".[] | select(.username == \"$TEST_USER_NAME\") | {username: .username, userStatus: .userStatus, usedTraffic: .usedTraffic, trafficQuota: .trafficQuota}"
}

# 获取规则状态
get_rules_status() {
    curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/user-forward-rules" | \
        jq ".groupedRules[] | select(.username == \"$TEST_USER_NAME\") | {username: .username, rules: [.rules[] | {name: .name, sourcePort: .sourcePort, isActive: .isActive}]}"
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
        sleep 2  # 等待系统处理
    else
        log_error "流量重置失败"
        return 1
    fi
}

# 增加用户流量配额
increase_user_quota() {
    local additional_gb="$1"
    local reason="$2"
    log_info "为用户 $TEST_USER_NAME 增加 ${additional_gb}GB 流量配额..."

    # 获取当前配额
    local current_quota=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/users" | \
        jq ".[] | select(.username == \"$TEST_USER_NAME\") | .trafficQuota")

    local new_quota=$(echo "$current_quota + $additional_gb" | bc)

    local result=$(curl -s -X PUT "$BASE_URL/api/users/$TEST_USER_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"trafficQuota\":$new_quota}" | jq -r '.success')

    if [ "$result" = "true" ]; then
        log_success "配额增加成功: ${current_quota}GB -> ${new_quota}GB"
        sleep 2  # 等待系统处理
    else
        log_error "配额增加失败"
        return 1
    fi
}

# 执行流量测试
test_traffic_transfer() {
    local size_mb="$1"
    local expected_success="$2"  # true/false

    log_info "测试传输 ${size_mb}MB 数据 (期望成功: $expected_success)..."

    local start_time=$(date +%s)
    local response=$(curl -s -w "%{http_code}" -o /tmp/transfer_response.txt \
        "http://localhost:6443/api/test/traffic-custom?size=$size_mb")
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    local http_code="${response: -3}"
    local response_size=$(stat -c%s /tmp/transfer_response.txt 2>/dev/null || echo 0)

    if [ "$http_code" = "200" ] && [ "$response_size" -gt 1000000 ]; then
        if [ "$expected_success" = "true" ]; then
            log_success "传输成功: ${size_mb}MB, 耗时: ${duration}s, 响应大小: $response_size bytes"
            return 0
        else
            log_error "❌ 意外成功: 期望失败但传输成功了!"
            return 1
        fi
    else
        if [ "$expected_success" = "false" ]; then
            log_success "传输正确被阻止: HTTP $http_code, 响应大小: $response_size bytes"
            return 0
        else
            log_error "❌ 意外失败: 期望成功但传输失败了! HTTP $http_code"
            return 1
        fi
    fi
}

# 显示当前状态
show_current_status() {
    log_info "=== 当前系统状态 ==="
    echo "用户状态:"
    get_user_status
    echo -e "\n规则状态:"
    get_rules_status
    echo ""
}

# 等待用户确认
wait_for_confirmation() {
    echo -e "\n${YELLOW}请检查后端日志，按回车继续下一步...${NC}"
    read -r
}

# 主测试流程
main() {
    log_section "🚀 开始流量控制系统综合测试"

    # 获取认证
    get_token

    # 显示初始状态
    log_section "📊 初始状态检查"
    show_current_status
    wait_for_confirmation

    # ==================== 第一阶段：流量重置测试 (3轮) ====================
    for round in {1..3}; do
        log_section "🔄 第 $round 轮流量重置测试"

        # 重置流量
        reset_user_traffic "第${round}轮重置测试"
        show_current_status

        log_info "开始传输测试，目标: 传输 ${TARGET_TRANSFER_MB}MB (超过 ${QUOTA_LIMIT_MB}MB 限制)"

        local transferred_mb=0
        local transfer_count=0

        # 持续传输直到达到目标或被阻止
        while [ $transferred_mb -lt $TARGET_TRANSFER_MB ]; do
            transfer_count=$((transfer_count + 1))
            log_info "第 $transfer_count 次传输 (已传输: ${transferred_mb}MB)"

            # 判断是否应该成功
            local expected_success="true"
            if [ $transferred_mb -gt $QUOTA_LIMIT_MB ]; then
                expected_success="false"
            fi

            if test_traffic_transfer $TRANSFER_SIZE_MB "$expected_success"; then
                if [ "$expected_success" = "true" ]; then
                    transferred_mb=$((transferred_mb + TRANSFER_SIZE_MB))
                else
                    log_success "✅ 流量控制正常工作，传输被正确阻止"
                    break
                fi
            else
                log_error "❌ 流量控制异常!"
                show_current_status
                wait_for_confirmation
                break
            fi

            # 显示当前状态
            show_current_status

            # 短暂等待
            sleep 1
        done

        log_info "第 $round 轮测试完成，实际传输: ${transferred_mb}MB"
        wait_for_confirmation
    done

    # ==================== 第二阶段：增量配额测试 (3轮) ====================
    for round in {1..3}; do
        log_section "📈 第 $round 轮增量配额测试"

        # 重置流量作为起点
        reset_user_traffic "第${round}轮增量测试起点"
        show_current_status

        # 增加1GB配额
        increase_user_quota 1 "第${round}轮增量测试"
        show_current_status

        log_info "开始传输测试，目标: 传输 ${TARGET_TRANSFER_MB}MB"

        local transferred_mb=0
        local transfer_count=0
        local current_quota_mb=$((QUOTA_LIMIT_MB + 1000))  # 500MB + 1GB

        # 持续传输直到达到目标或被阻止
        while [ $transferred_mb -lt $TARGET_TRANSFER_MB ]; do
            transfer_count=$((transfer_count + 1))
            log_info "第 $transfer_count 次传输 (已传输: ${transferred_mb}MB, 当前限额: ${current_quota_mb}MB)"

            # 判断是否应该成功
            local expected_success="true"
            if [ $transferred_mb -gt $current_quota_mb ]; then
                expected_success="false"
            fi

            if test_traffic_transfer $TRANSFER_SIZE_MB "$expected_success"; then
                if [ "$expected_success" = "true" ]; then
                    transferred_mb=$((transferred_mb + TRANSFER_SIZE_MB))
                else
                    log_success "✅ 流量控制正常工作，传输被正确阻止"
                    break
                fi
            else
                log_error "❌ 流量控制异常!"
                show_current_status
                wait_for_confirmation
                break
            fi

            # 显示当前状态
            show_current_status

            # 短暂等待
            sleep 1
        done

        log_info "第 $round 轮增量测试完成，实际传输: ${transferred_mb}MB"
        wait_for_confirmation
    done

    log_section "🎉 测试完成"
    log_info "请检查所有测试结果和后端日志"
}

# 运行主程序
main "$@"
