#!/usr/bin/env node

const { User, UserForwardRule } = require('./models');

async function debugRuleActive() {
  console.log('🔍 调试规则激活状态\n');

  try {
    console.log('📥 获取用户信息...');
    // 获取用户和规则
    const user = await User.findByPk(2);
    if (!user) {
      console.log('❌ 用户不存在');
      return;
    }

    console.log('📥 获取规则信息...');
    const rules = await UserForwardRule.findAll({
      where: { userId: 2 },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'userStatus', 'isActive', 'expiryDate', 'role', 'trafficQuota', 'usedTraffic']
      }]
    });

    console.log('👤 用户信息:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - 用户名: ${user.username}`);
    console.log(`   - 角色: ${user.role}`);
    console.log(`   - isActive: ${user.isActive}`);
    console.log(`   - userStatus: ${user.userStatus}`);
    console.log(`   - 过期时间: ${user.expiryDate || '无'}`);
    console.log(`   - 是否过期: ${user.isExpired()}`);
    console.log(`   - 流量配额: ${user.trafficQuota}GB`);
    console.log(`   - 已用流量: ${(user.usedTraffic / 1024 / 1024 / 1024).toFixed(6)}GB`);
    console.log(`   - 流量超限: ${user.isTrafficExceeded()}`);
    console.log(`   - 可用服务: ${user.canUseService()}`);

    console.log('\n📋 规则详细检查:');

    for (const rule of rules) {
      console.log(`\n🔧 规则: ${rule.name} (端口${rule.sourcePort})`);

      // 手动执行计算属性的每个步骤
      const user = rule.user;

      console.log(`   步骤1 - 用户基本状态:`);
      console.log(`     - user.isActive: ${user.isActive}`);
      console.log(`     - user.userStatus: ${user.userStatus}`);
      console.log(`     - 基本状态检查: ${user.isActive && user.userStatus === 'active'}`);

      console.log(`   步骤2 - 用户过期检查:`);
      console.log(`     - user.role: ${user.role}`);
      console.log(`     - user.expiryDate: ${user.expiryDate || '无'}`);
      console.log(`     - user.isExpired(): ${user.isExpired ? user.isExpired() : 'N/A'}`);
      const expiredCheck = user.role === 'admin' || !user.isExpired || !user.isExpired();
      console.log(`     - 过期检查通过: ${expiredCheck}`);

      console.log(`   步骤3 - 端口范围检查:`);
      console.log(`     - rule.sourcePort: ${rule.sourcePort}`);
      console.log(`     - user.portRangeStart: ${user.portRangeStart}`);
      console.log(`     - user.portRangeEnd: ${user.portRangeEnd}`);
      const portCheck = user.role === 'admin' || user.isPortInRange(rule.sourcePort);
      console.log(`     - 端口检查通过: ${portCheck}`);

      console.log(`   计算属性结果:`);
      console.log(`     - getComputedIsActive(): ${rule.getComputedIsActive()}`);
      console.log(`     - isActive (getter): ${rule.isActive}`);

      // 异步检查
      try {
        const asyncResult = await rule.getComputedIsActiveAsync();
        console.log(`     - getComputedIsActiveAsync(): ${asyncResult}`);
      } catch (error) {
        console.log(`     - getComputedIsActiveAsync() 错误: ${error.message}`);
      }
    }

    // 检查配额服务
    console.log('\n🔍 配额服务检查:');
    try {
      const quotaCoordinatorService = require('./services/quotaCoordinatorService');
      const quotaResult = await quotaCoordinatorService.checkUserQuota(2, 'debug_check');
      console.log(`   - 配额协调器结果: ${JSON.stringify(quotaResult, null, 2)}`);
    } catch (error) {
      console.log(`   - 配额协调器错误: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ 调试失败:', error);
  }
}

// 运行调试
if (require.main === module) {
  debugRuleActive().then(() => process.exit(0));
}

module.exports = debugRuleActive;
