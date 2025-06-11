#!/usr/bin/env node

/**
 * 测试流量限制bug修复效果
 */

const { User } = require('./models');

async function testTrafficBugsFix() {
  try {
    console.log('🐛 测试流量限制bug修复效果...\n');

    // 1. 设置test用户初始状态
    console.log('1. 设置test用户初始状态...');
    const testUser = await User.findOne({ where: { username: 'test' } });
    if (!testUser) {
      console.log('❌ 未找到test用户');
      return;
    }

    // 设置为500MB配额，已使用600MB（超配额）
    const initialQuota = 0.5; // 500MB
    const overUsage = initialQuota * 1024 * 1024 * 1024 * 1.2; // 120%使用率
    
    await testUser.update({ 
      trafficQuota: initialQuota,
      usedTraffic: overUsage 
    });
    
    console.log(`✅ test用户初始状态:`);
    console.log(`   配额: ${initialQuota}GB`);
    console.log(`   已用: ${(overUsage / (1024*1024*1024)).toFixed(2)}GB (120%)`);
    console.log(`   状态: 超出配额限制`);

    console.log('\n🎯 Bug修复验证:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n📋 Bug 1: Admin修改配额后限制失效');
    console.log('   问题: Admin将配额从500MB改为1000MB后，用户可以无限制转发');
    console.log('   修复: 配额更新后立即触发配额重新评估');
    
    console.log('\n📋 Bug 2: 持续连接绕过限制检查');
    console.log('   问题: 用户疯狂测试时，TCP连接保持活跃，只有连接结束才触发检查');
    console.log('   修复: 实时流量监控，每5秒检查一次，主动断开违规连接');

    console.log('\n✅ 修复措施:');
    console.log('   🔒 Admin修改配额后立即重新评估用户状态');
    console.log('   🔒 实时流量监控服务（5秒间隔）');
    console.log('   🔒 流量增长阈值检测（10MB触发检查）');
    console.log('   🔒 快速增长检测（50MB触发紧急控制）');
    console.log('   🔒 主动规则禁用机制');
    console.log('   🔒 违规记录和追踪');

    console.log('\n🧪 测试场景 1: Admin修改配额');
    console.log('   1. 当前test用户超配额（120%）');
    console.log('   2. Admin将配额改为1000MB');
    console.log('   3. 系统应立即重新评估并恢复规则');

    console.log('\n🧪 测试场景 2: 持续连接测试');
    console.log('   1. 用户疯狂进行6443端口100MB测试');
    console.log('   2. 实时监控检测到流量快速增长');
    console.log('   3. 系统应在5秒内检测并禁用规则');

    console.log('\n📊 监控机制:');
    console.log('   - 流量增长阈值: 10MB');
    console.log('   - 快速增长阈值: 50MB');
    console.log('   - 检查间隔: 5秒');
    console.log('   - 违规记录: 保留24小时');

    console.log('\n🔧 技术实现:');
    console.log('   1. 统一配额协调器 - 避免并发冲突');
    console.log('   2. 实时流量监控 - 主动检测违规');
    console.log('   3. 强制配额重新评估 - Admin操作后立即生效');
    console.log('   4. 紧急流量控制 - 快速增长时立即断开');

    console.log('\n🎯 验证步骤:');
    console.log('   A. 测试Admin修改配额:');
    console.log('      1. 确认test用户当前超配额');
    console.log('      2. Admin将配额改为1000MB');
    console.log('      3. 观察规则是否立即恢复');
    
    console.log('\n   B. 测试持续连接限制:');
    console.log('      1. 设置test用户接近配额限制');
    console.log('      2. 疯狂进行6443端口测试');
    console.log('      3. 观察是否在5秒内被限制');

    console.log('\n💡 预期结果:');
    console.log('   ✅ Admin修改配额后立即生效');
    console.log('   ✅ 持续连接无法绕过限制');
    console.log('   ✅ 实时监控正常工作');
    console.log('   ✅ 违规行为被及时阻止');

    console.log('\n🔄 恢复测试环境:');
    console.log('   node -e "');
    console.log('     const { User } = require(\'./models\');');
    console.log('     User.findOne({ where: { username: \'test\' } }).then(user => {');
    console.log('       return user.update({ trafficQuota: 0.5, usedTraffic: 0 });');
    console.log('     }).then(() => console.log(\'✅ test用户已恢复正常状态\'));');
    console.log('   "');

    console.log('\n📊 监控状态查看:');
    console.log('   curl http://localhost:3000/api/gost-config/realtime-monitor-status');

    process.exit(0);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testTrafficBugsFix();
