#!/bin/bash

# 测试不同性能模式的观察器周期
echo "🧪 测试不同性能模式的观察器周期"

# 获取认证token
echo "📝 获取认证token..."
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 获取token失败"
  exit 1
fi

echo "✅ Token获取成功"

# 测试高性能模式 (30秒周期)
echo ""
echo "🚀 测试高性能模式 (期望观察器周期: 30秒)"
curl -s -X POST http://localhost:3000/api/performance-config/apply-preset \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"presetName":"highPerformance","description":"测试高性能模式30秒周期"}' > /dev/null

echo "⏳ 等待5秒让配置生效..."
sleep 5

# 测试平衡模式 (120秒周期)
echo ""
echo "⚖️ 测试平衡模式 (期望观察器周期: 120秒)"
curl -s -X POST http://localhost:3000/api/performance-config/apply-preset \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"presetName":"balanced","description":"测试平衡模式120秒周期"}' > /dev/null

echo "⏳ 等待5秒让配置生效..."
sleep 5

# 测试高可用模式 (300秒周期)
echo ""
echo "🛡️ 测试高可用模式 (期望观察器周期: 300秒)"
curl -s -X POST http://localhost:3000/api/performance-config/apply-preset \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"presetName":"highAvailability","description":"测试高可用模式300秒周期"}' > /dev/null

echo "⏳ 等待5秒让配置生效..."
sleep 5

echo ""
echo "✅ 测试完成！请查看后端日志中的观察器周期配置信息"
echo "🔍 查找日志中的 '🔧 使用观察器周期配置' 信息"
