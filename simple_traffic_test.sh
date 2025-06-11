#!/bin/bash

# 简化的流量控制测试脚本
# 专注于验证基本的配额设置和流量控制功能

set -e

# 配置
ADMIN_TOKEN=""
BASE_URL="http://localhost:3000"
TEST_PORT="6443"
ADMIN_PORT="9080"

echo "[INFO] 🧪 开始简化流量控制测试"
echo "[INFO] =================================="

# 获取管理员token
echo "[INFO] 🔑 获取管理员token..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$ADMIN_TOKEN" ]; then
  echo "[ERROR] ❌ 获取管理员token失败"
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

# 函数：获取用户状态
get_user_status() {
  echo "[MONITOR] 📊 获取用户状态..."
  curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/api/users" | \
    grep -A20 '"username":"test"' | head -10
}

# 函数：设置用户配额（GB单位）
set_user_quota_gb() {
  local quota_gb="$1"
  echo "[INFO] 📊 设置test用户配额为 ${quota_gb}GB..."
  local response=$(curl -s -X PUT "$BASE_URL/api/users/2" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"trafficQuota\": $quota_gb}")
  echo "[DEBUG] 配额设置响应: $response"
  echo "[INFO] ⏳ 等待系统同步 3秒..."
  sleep 3
}

# 函数：重置用户流量
reset_user_traffic() {
  echo "[INFO] 🔄 重置test用户流量..."
  local response=$(curl -s -X POST "$BASE_URL/api/users/2/reset-traffic" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json")
  echo "[DEBUG] 重置响应: $response"
  echo "[INFO] ⏳ 等待系统同步 3秒..."
  sleep 3
}

# 函数：传输指定大小的数据
transfer_data() {
  local size_mb="$1"
  local description="$2"
  echo "[TEST] 🚀 传输数据: $description (${size_mb}MB)"
  
  local start_time=$(date +%s)
  if curl -s --max-time 30 "http://localhost:$TEST_PORT/api/test/traffic-custom?size=$size_mb" > /dev/null 2>&1; then
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo "[SUCCESS] ✅ 传输成功: ${size_mb}MB 在 ${duration}秒内完成"
    return 0
  else
    echo "[ERROR] ❌ 传输失败"
    return 1
  fi
}

echo ""
echo "[INFO] 🔄 ========== 测试1: 基本配额设置和重置 =========="

# 设置500MB配额
set_user_quota_gb "0.5"
get_user_status

# 重置流量
reset_user_traffic
get_user_status

# 检查重置后转发是否可用
if check_forward "$TEST_PORT" "重置后检查"; then
  echo "[SUCCESS] ✅ 重置后转发立即可用"
else
  echo "[ERROR] ❌ 重置后转发不可用"
fi

echo ""
echo "[INFO] 🔄 ========== 测试2: 流量传输和限制 =========="

# 传输100MB数据
transfer_data "100" "第1次传输"
sleep 2
get_user_status

# 传输200MB数据
transfer_data "200" "第2次传输"
sleep 2
get_user_status

# 传输300MB数据（应该超过500MB限制）
transfer_data "300" "第3次传输（应该被限制）"
sleep 2
get_user_status

# 检查超限后转发是否被禁用
if check_forward "$TEST_PORT" "超限后检查"; then
  echo "[WARNING] ⚠️ 超限后转发仍然可用"
else
  echo "[SUCCESS] ✅ 超限后转发被正确禁用"
fi

echo ""
echo "[INFO] 🔄 ========== 测试3: 配额增加 =========="

# 增加配额到1GB
set_user_quota_gb "1.0"
get_user_status

# 检查增加配额后转发是否恢复
if check_forward "$TEST_PORT" "增加配额后检查"; then
  echo "[SUCCESS] ✅ 增加配额后转发立即恢复"
else
  echo "[ERROR] ❌ 增加配额后转发仍然不可用"
fi

echo ""
echo "[INFO] 🔄 ========== 测试4: Admin用户不受影响 =========="

# 确保admin用户始终正常
if check_forward "$ADMIN_PORT" "admin用户检查"; then
  echo "[SUCCESS] ✅ admin用户未受影响"
else
  echo "[CRITICAL] 🚨 admin用户受到影响！"
fi

echo ""
echo "[SUCCESS] 🎯 简化测试完成！"
echo "[INFO] 请检查以上输出，确认系统行为是否符合预期"
