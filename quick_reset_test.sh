#!/bin/bash

# 快速配额重置测试脚本
# 测试配额重置后转发是否立即可用

set -e

# 配置
ADMIN_TOKEN=""
BASE_URL="http://localhost:3000"
TEST_PORT="6443"

echo "[INFO] 🧪 开始快速配额重置测试"
echo "[INFO] =================================="

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
  local description="$1"
  echo "[TEST] 🔍 检查转发是否可用: $description"

  if curl -s --max-time 3 "http://localhost:$TEST_PORT/api/test-forward" > /dev/null 2>&1; then
    echo "[SUCCESS] ✅ 转发端口可用"
    return 0
  else
    echo "[ERROR] ❌ 转发端口不可用"
    return 1
  fi
}

# 函数：获取用户状态
get_user_status() {
  local response=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/api/users")
  local status=$(echo "$response" | grep -o '"userStatus":"[^"]*"' | grep 'test' -A5 -B5 | head -1 | cut -d'"' -f4)
  echo "状态: $status"
}

# 函数：重置用户流量
reset_user_traffic() {
  echo "[INFO] 🔄 重置test用户流量..."
  curl -s -X POST "$BASE_URL/api/users/2/reset-traffic" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" > /dev/null
  echo "[INFO] ⏳ 等待系统同步 3秒..."
  sleep 3
}

# 函数：设置用户配额
set_user_quota() {
  local quota_gb="$1"
  echo "[INFO] 📊 设置test用户配额为 ${quota_gb}GB..."
  curl -s -X PUT "$BASE_URL/api/users/2" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"trafficQuota\": $((quota_gb * 1024 * 1024 * 1024))}" > /dev/null
  echo "[INFO] ⏳ 等待系统同步 3秒..."
  sleep 3
}

echo ""
echo "[INFO] 🔄 ========== 测试1: 配额重置后立即可用性 =========="

# 检查当前状态
echo "[MONITOR] 📊 当前用户状态: $(get_user_status)"

# 重置流量
reset_user_traffic

# 检查重置后状态
echo "[MONITOR] 📊 重置后用户状态: $(get_user_status)"

# 立即检查转发是否可用
if check_forward "重置后立即检查"; then
  echo "[SUCCESS] ✅ 配额重置后转发立即可用 - 修复成功！"
else
  echo "[ERROR] ❌ 配额重置后转发不可用 - 仍有问题"
fi

echo ""
echo "[INFO] 🔄 ========== 测试2: 配额增加后立即可用性 =========="

# 设置较小配额并重置
set_user_quota 0.1
reset_user_traffic

echo "[MONITOR] 📊 小配额状态: $(get_user_status)"

# 增加配额
set_user_quota 2

echo "[MONITOR] 📊 增加配额后状态: $(get_user_status)"

# 立即检查转发是否可用
if check_forward "配额增加后立即检查"; then
  echo "[SUCCESS] ✅ 配额增加后转发立即可用 - 修复成功！"
else
  echo "[ERROR] ❌ 配额增加后转发不可用 - 仍有问题"
fi

echo ""
echo "[SUCCESS] 🎯 快速测试完成！"
echo "[INFO] 如果看到两个 ✅ 修复成功，说明问题已解决"
