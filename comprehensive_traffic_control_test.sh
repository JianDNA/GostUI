#!/bin/bash

# 全面流量控制测试脚本
# 测试重置和增加配额的完整流程

set -e

# 配置
ADMIN_TOKEN=""
BASE_URL="http://localhost:3000"
TEST_PORT="6443"
ADMIN_PORT="9080"
TRANSFER_SIZE="100"  # 每次传输100MB
QUOTA_LIMIT="500"    # 基础配额500MB
TARGET_TRANSFER="1500" # 目标传输1500MB (超出限制3倍)

echo "[INFO] 🧪 开始全面流量控制测试"
echo "[INFO] ========================================"
echo "[INFO] 测试配置:"
echo "[INFO]   - 基础配额: ${QUOTA_LIMIT}MB"
echo "[INFO]   - 每次传输: ${TRANSFER_SIZE}MB"
echo "[INFO]   - 目标传输: ${TARGET_TRANSFER}MB (超出限制)"
echo "[INFO]   - 测试端口: $TEST_PORT (test用户)"
echo "[INFO]   - 管理端口: $ADMIN_PORT (admin用户)"
echo ""

# 获取管理员token
echo "[INFO] 🔑 获取管理员token..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$ADMIN_TOKEN" ]; then
  echo "[ERROR] ❌ 获取管理员token失败"
  echo "[DEBUG] 登录响应: $LOGIN_RESPONSE"
  exit 1
fi
echo "[SUCCESS] ✅ 获取管理员token成功"

# 函数：检查转发是否可用
check_forward() {
  local port="$1"
  local description="$2"
  echo "[TEST] 🔍 检查端口${port}转发: $description"

  if curl -s --max-time 3 "http://localhost:${port}/api/test-forward" > /dev/null 2>&1; then
    echo "[SUCCESS] ✅ 端口${port}转发可用"
    return 0
  else
    echo "[ERROR] ❌ 端口${port}转发不可用"
    return 1
  fi
}

# 函数：获取用户详细状态
get_user_status() {
  local response=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/api/users")
  echo "$response" | grep -A20 -B5 '"username":"test"' | head -30
}

# 函数：重置用户流量
reset_user_traffic() {
  echo "[INFO] 🔄 重置test用户流量..."
  local response=$(curl -s -X POST "$BASE_URL/api/users/2/reset-traffic" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json")
  echo "[DEBUG] 重置响应: $response"
  echo "[INFO] ⏳ 等待系统同步 5秒..."
  sleep 5
}

# 函数：设置用户配额
set_user_quota() {
  local quota_mb="$1"
  echo "[INFO] 📊 设置test用户配额为 ${quota_mb}MB..."
  # 转换为GB（API需要GB单位）
  local quota_gb=$(echo "scale=3; $quota_mb / 1024" | bc)
  local response=$(curl -s -X PUT "$BASE_URL/api/users/2" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"trafficQuota\": $quota_gb}")
  echo "[DEBUG] 配额设置响应: $response"
  echo "[INFO] ⏳ 等待系统同步 5秒..."
  sleep 5
}

# 函数：增加用户配额
increase_user_quota() {
  local additional_mb="$1"
  echo "[INFO] 📈 为test用户增加 ${additional_mb}MB 配额..."

  # 获取当前配额（GB单位）
  local current_response=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/api/users")
  local current_quota_gb=$(echo "$current_response" | grep -A10 '"username":"test"' | grep -o '"trafficQuota":[0-9.]*' | cut -d':' -f2)

  if [ -z "$current_quota_gb" ]; then
    echo "[ERROR] ❌ 无法获取当前配额"
    return 1
  fi

  # 转换为MB进行计算
  local current_quota_mb=$(echo "scale=0; $current_quota_gb * 1024" | bc)
  local new_quota_mb=$((current_quota_mb + additional_mb))
  local new_quota_gb=$(echo "scale=3; $new_quota_mb / 1024" | bc)

  echo "[INFO] 当前配额: ${current_quota_mb}MB, 新配额: ${new_quota_mb}MB"

  local response=$(curl -s -X PUT "$BASE_URL/api/users/2" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"trafficQuota\": $new_quota_gb}")
  echo "[DEBUG] 配额增加响应: $response"
  echo "[INFO] ⏳ 等待系统同步 5秒..."
  sleep 5
}

# 函数：执行流量传输测试
traffic_test() {
  local round_name="$1"
  local target_mb="$2"

  echo "[TEST] 🚀 开始流量传输测试: $round_name"
  echo "[TEST] 目标传输: ${target_mb}MB"

  local transferred=0
  local attempt=1
  local max_attempts=$((target_mb / TRANSFER_SIZE + 5)) # 允许一些额外尝试

  while [ $transferred -lt $target_mb ] && [ $attempt -le $max_attempts ]; do
    echo "[TEST] 第${attempt}次传输 (已传输: ${transferred}MB, 目标: ${target_mb}MB)"

    # 检查admin端口是否正常（确保不影响正常用户）
    if ! check_forward "$ADMIN_PORT" "admin用户正常性检查"; then
      echo "[CRITICAL] 🚨 admin用户受到影响！测试失败！"
      return 1
    fi

    # 尝试传输
    echo "[TEST] 🚀 测试流量传输: ${round_name}-传输${attempt} (${TRANSFER_SIZE}MB)"
    local start_time=$(date +%s)

    if curl -s --max-time 10 "http://localhost:$TEST_PORT/api/test/traffic-custom?size=$TRANSFER_SIZE" > /dev/null 2>&1; then
      local end_time=$(date +%s)
      local duration=$((end_time - start_time))
      transferred=$((transferred + TRANSFER_SIZE))
      echo "[SUCCESS] ✅ 转发成功: ${TRANSFER_SIZE}MB 在 ${duration}秒内传输"

      # 等待系统处理
      echo "[INFO] ⏳ 等待系统同步 2秒..."
      sleep 2

      # 显示当前状态
      echo "[MONITOR] 📊 当前用户状态:"
      get_user_status | head -5

    else
      echo "[ERROR] ❌ 转发失败 (HTTP错误或超时)"
      echo "[WARNING] 传输失败，可能已达到限制"
      break
    fi

    attempt=$((attempt + 1))
  done

  echo "[INFO] 📊 ${round_name}结果: 成功传输 ${transferred}MB (目标: ${target_mb}MB)"

  # 最终状态检查
  echo "[INFO] ⏳ 等待系统同步 3秒..."
  sleep 3
  echo "[MONITOR] 📊 最终用户状态:"
  get_user_status | head -10

  # 检查超限后转发是否被禁用
  echo "[TEST] 🔍 检查超限后转发是否被禁用..."
  if check_forward "$TEST_PORT" "超限后状态检查"; then
    echo "[WARNING] ⚠️ 超限后转发仍然可用 - 可能存在问题"
  else
    echo "[SUCCESS] ✅ 超限后转发被正确禁用"
  fi

  # 确保admin用户不受影响
  if check_forward "$ADMIN_PORT" "admin用户最终检查"; then
    echo "[SUCCESS] ✅ admin用户未受影响"
  else
    echo "[CRITICAL] 🚨 admin用户受到影响！"
  fi

  echo "[INFO] ⏸️ 轮次间隔等待..."
  sleep 3

  return 0
}

echo ""
echo "[INFO] 🔄 ========== 第一阶段: 重置测试 (3轮) =========="

for round in 1 2 3; do
  echo ""
  echo "[INFO] 🔄 ========== 重置测试轮次 $round =========="

  # 设置基础配额并重置
  set_user_quota "$QUOTA_LIMIT"
  reset_user_traffic

  echo "[MONITOR] 📊 重置后用户状态:"
  get_user_status | head -5

  # 检查重置后转发是否立即可用
  echo "[TEST] 🔍 检查重置后转发是否立即可用..."
  if check_forward "$TEST_PORT" "重置后立即检查"; then
    echo "[SUCCESS] ✅ 重置后转发立即可用"
  else
    echo "[ERROR] ❌ 重置后转发不可用 - 这是一个BUG！"
  fi

  # 执行流量传输测试
  traffic_test "重置轮次$round" "$TARGET_TRANSFER"
done

echo ""
echo "[INFO] 📈 ========== 第二阶段: 配额增加测试 (3轮) =========="

for round in 1 2 3; do
  echo ""
  echo "[INFO] 📈 ========== 配额增加测试轮次 $round =========="

  # 设置基础配额并重置
  set_user_quota "$QUOTA_LIMIT"
  reset_user_traffic

  echo "[MONITOR] 📊 初始状态:"
  get_user_status | head -5

  # 先传输到限制
  traffic_test "增加轮次${round}-初始" "$TARGET_TRANSFER"

  # 增加配额
  increase_user_quota 1024  # 增加1GB

  echo "[MONITOR] 📊 增加配额后状态:"
  get_user_status | head -5

  # 检查增加配额后转发是否立即可用
  echo "[TEST] 🔍 检查增加配额后转发是否立即可用..."
  if check_forward "$TEST_PORT" "增加配额后立即检查"; then
    echo "[SUCCESS] ✅ 增加配额后转发立即可用"
  else
    echo "[ERROR] ❌ 增加配额后转发不可用 - 这是一个BUG！"
  fi

  # 再次传输到新限制
  traffic_test "增加轮次${round}-再次" "$TARGET_TRANSFER"
done

echo ""
echo "[SUCCESS] 🎯 全面测试完成！"
echo "[INFO] 请检查以上输出和后端日志，确认："
echo "[INFO] 1. 重置/增加配额后转发立即可用"
echo "[INFO] 2. 超限后转发被正确禁用"
echo "[INFO] 3. 流量统计与实际传输匹配"
echo "[INFO] 4. 系统响应及时，无延迟"
echo "[INFO] 5. GOST策略不影响admin用户(${ADMIN_PORT}端口)"
