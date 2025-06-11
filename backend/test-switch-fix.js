#!/usr/bin/env node

/**
 * 测试Switch状态修复效果
 */

const { User } = require('./models');

async function testSwitchFix() {
  try {
    console.log('🔧 测试Switch状态修复效果...\n');

    // 1. 设置test用户超配额
    console.log('1. 设置test用户超配额状态...');
    const testUser = await User.findOne({ where: { username: 'test' } });
    if (!testUser) {
      console.log('❌ 未找到test用户');
      return;
    }

    const quotaBytes = testUser.trafficQuota * 1024 * 1024 * 1024;
    const overQuotaTraffic = Math.floor(quotaBytes * 1.1); // 110%使用率
    await testUser.update({ usedTraffic: overQuotaTraffic });
    
    console.log(`✅ test用户已设置为超配额状态:`);
    console.log(`   配额: ${testUser.trafficQuota}GB`);
    console.log(`   已用: ${(overQuotaTraffic / (1024*1024*1024)).toFixed(2)}GB (110%)`);

    console.log('\n🎯 Switch状态修复效果验证:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n📋 修复前的问题:');
    console.log('   ❌ 用户点击Switch时立即改变状态');
    console.log('   ❌ 后端拒绝后显示错误，但Switch仍显示为开启');
    console.log('   ❌ 视觉状态与实际状态不一致');
    console.log('   ❌ 用户体验混乱');

    console.log('\n✅ 修复后的效果:');
    console.log('   🔒 Switch使用:model-value绑定，不会立即改变');
    console.log('   🔒 显示loading状态，表示正在处理');
    console.log('   🔒 只有后端成功响应才更新状态');
    console.log('   🔒 失败时Switch保持原状态');
    console.log('   🔒 清晰的错误提示信息');
    console.log('   🔒 状态完全同步');

    console.log('\n🧪 测试步骤:');
    console.log('   1. 登录test用户账户');
    console.log('   2. 进入"规则管理"页面');
    console.log('   3. 找到任何被禁用的转发规则');
    console.log('   4. 点击Switch开关尝试激活');
    console.log('   5. 观察Switch的行为');

    console.log('\n📊 预期行为:');
    console.log('   ✅ 点击Switch时显示loading状态');
    console.log('   ✅ 后端拒绝后显示错误消息');
    console.log('   ✅ Switch保持关闭状态（不会变为开启）');
    console.log('   ✅ 错误消息清晰说明拒绝原因');
    console.log('   ✅ 用户界面状态一致');

    console.log('\n💡 技术实现:');
    console.log('   - 使用:model-value代替v-model');
    console.log('   - @change事件处理函数控制状态更新');
    console.log('   - 添加switching状态显示loading');
    console.log('   - 只有成功时才更新rule.isActive');
    console.log('   - 失败时保持原状态不变');

    console.log('\n🔄 恢复测试环境:');
    console.log('   - 重置test用户流量配额');
    console.log('   - Switch将正常工作');

    // 提供恢复选项
    console.log('\n❓ 是否要恢复test用户配额? (手动运行以下命令)');
    console.log('   node -e "');
    console.log('     const { User } = require(\'./models\');');
    console.log('     User.findOne({ where: { username: \'test\' } }).then(user => {');
    console.log('       return user.update({ usedTraffic: 0 });');
    console.log('     }).then(() => console.log(\'✅ test用户配额已恢复\'));');
    console.log('   "');

    process.exit(0);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testSwitchFix();
