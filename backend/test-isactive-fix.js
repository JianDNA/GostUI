#!/usr/bin/env node

const { User, UserForwardRule } = require('./models');

async function testIsActiveFix() {
  console.log('🧪 测试 isActive 计算属性修复\n');

  try {
    // 获取test用户和规则
    const user = await User.findByPk(2);
    if (!user) {
      console.error('❌ 测试用户不存在');
      return;
    }

    const rules = await UserForwardRule.findAll({
      where: { userId: 2 },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'userStatus', 'isActive', 'expiryDate', 'role', 'trafficQuota', 'usedTraffic', 'portRangeStart', 'portRangeEnd']
      }]
    });

    console.log('👤 用户详细信息:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - 用户名: ${user.username}`);
    console.log(`   - 角色: ${user.role}`);
    console.log(`   - isActive (数据库): ${user.isActive}`);
    console.log(`   - userStatus: ${user.userStatus}`);
    console.log(`   - 过期时间: ${user.expiryDate || '无'}`);
    console.log(`   - 端口范围: ${user.portRangeStart}-${user.portRangeEnd}`);
    console.log(`   - 流量配额: ${user.trafficQuota}GB`);
    console.log(`   - 已用流量: ${(user.usedTraffic / 1024 / 1024 / 1024).toFixed(6)}GB`);
    console.log(`   - 使用率: ${((user.usedTraffic / user.getTrafficLimitBytes()) * 100).toFixed(2)}%`);

    console.log('\n🔍 用户状态检查方法:');
    console.log(`   - isExpired(): ${user.isExpired()}`);
    console.log(`   - isTrafficExceeded(): ${user.isTrafficExceeded()}`);
    console.log(`   - canUseService(): ${user.canUseService()}`);

    console.log('\n📋 规则 isActive 状态检查:');
    
    for (const rule of rules) {
      console.log(`\n🔧 规则: ${rule.name} (端口${rule.sourcePort})`);
      
      const user = rule.user;
      
      // 手动执行每个检查步骤
      console.log(`   步骤1 - 用户基本状态:`);
      const basicCheck = user.isActive && user.userStatus === 'active';
      console.log(`     - user.isActive: ${user.isActive}`);
      console.log(`     - user.userStatus: ${user.userStatus}`);
      console.log(`     - 基本状态检查: ${basicCheck}`);
      
      console.log(`   步骤2 - 用户过期检查:`);
      const expiredCheck = user.role === 'admin' || !user.isExpired();
      console.log(`     - user.role: ${user.role}`);
      console.log(`     - user.isExpired(): ${user.isExpired()}`);
      console.log(`     - 过期检查通过: ${expiredCheck}`);
      
      console.log(`   步骤3 - 端口范围检查:`);
      const portCheck = user.role === 'admin' || user.isPortInRange(rule.sourcePort);
      console.log(`     - rule.sourcePort: ${rule.sourcePort}`);
      console.log(`     - user.portRangeStart: ${user.portRangeStart}`);
      console.log(`     - user.portRangeEnd: ${user.portRangeEnd}`);
      console.log(`     - user.isPortInRange(): ${user.isPortInRange(rule.sourcePort)}`);
      console.log(`     - 端口检查通过: ${portCheck}`);
      
      console.log(`   步骤4 - 流量配额检查:`);
      const trafficCheck = user.role === 'admin' || !user.isTrafficExceeded();
      console.log(`     - user.isTrafficExceeded(): ${user.isTrafficExceeded()}`);
      console.log(`     - 流量检查通过: ${trafficCheck}`);
      
      console.log(`   最终结果:`);
      console.log(`     - 所有检查通过: ${basicCheck && expiredCheck && portCheck && trafficCheck}`);
      console.log(`     - getComputedIsActive(): ${rule.getComputedIsActive()}`);
      console.log(`     - isActive (getter): ${rule.isActive}`);
      
      // 检查数据库中的 isActive 字段（如果存在）
      const dbIsActive = rule.getDataValue('isActive');
      console.log(`     - 数据库 isActive: ${dbIsActive !== undefined ? dbIsActive : '不存在(计算属性)'}`);
    }

    // 测试不同场景
    console.log('\n🧪 测试不同场景:');
    
    // 场景1: 模拟用户过期
    console.log('\n📝 场景1: 模拟用户过期');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() - 1); // 昨天过期
    
    // 临时修改用户过期时间
    const originalExpiryDate = user.expiryDate;
    user.expiryDate = futureDate;
    
    console.log(`   - 设置过期时间为: ${futureDate.toLocaleString()}`);
    console.log(`   - user.isExpired(): ${user.isExpired()}`);
    
    for (const rule of rules) {
      console.log(`   - 规则 ${rule.name} isActive: ${rule.isActive}`);
    }
    
    // 恢复原始过期时间
    user.expiryDate = originalExpiryDate;
    
    // 场景2: 模拟流量超限
    console.log('\n📝 场景2: 模拟流量超限');
    const originalUsedTraffic = user.usedTraffic;
    user.usedTraffic = user.getTrafficLimitBytes() + 1000000; // 超过配额1MB
    
    console.log(`   - 设置已用流量为: ${(user.usedTraffic / 1024 / 1024 / 1024).toFixed(6)}GB`);
    console.log(`   - user.isTrafficExceeded(): ${user.isTrafficExceeded()}`);
    
    for (const rule of rules) {
      console.log(`   - 规则 ${rule.name} isActive: ${rule.isActive}`);
    }
    
    // 恢复原始流量
    user.usedTraffic = originalUsedTraffic;
    
    console.log('\n🎉 测试完成');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  testIsActiveFix().then(() => process.exit(0));
}

module.exports = testIsActiveFix;
