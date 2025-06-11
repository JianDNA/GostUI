#!/usr/bin/env node

/**
 * 演示安全漏洞修复效果
 */

const { User } = require('./models');

async function demoSecurityFix() {
  try {
    console.log('🔒 演示规则安全漏洞修复效果...\n');

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
    console.log(`   状态: 超出配额限制`);

    console.log('\n🎯 现在请尝试以下操作来验证安全修复:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n📋 修复前的漏洞:');
    console.log('   ❌ 用户可以手动开启被禁用的转发规则');
    console.log('   ❌ 系统没有实时配额校验');
    console.log('   ❌ 存在时间窗口可以绕过限制');
    console.log('   ❌ 缺乏操作频率限制');
    console.log('   ❌ 没有可疑操作监控');

    console.log('\n✅ 修复后的安全机制:');
    console.log('   🔒 规则激活前强制配额校验');
    console.log('   🔒 95%配额使用率预警保护');
    console.log('   🔒 操作频率限制 (1分钟内最多5次)');
    console.log('   🔒 可疑操作记录和监控');
    console.log('   🔒 多层安全检查机制');
    console.log('   🔒 详细的安全日志');

    console.log('\n🧪 测试步骤:');
    console.log('   1. 登录test用户账户');
    console.log('   2. 进入"规则管理"页面');
    console.log('   3. 尝试开启任何被禁用的转发规则');
    console.log('   4. 观察系统的安全响应');

    console.log('\n📊 预期结果:');
    console.log('   ✅ 规则激活被拒绝');
    console.log('   ✅ 显示详细的拒绝原因');
    console.log('   ✅ 记录可疑操作');
    console.log('   ✅ 前端显示安全提示');
    console.log('   ✅ 后端日志记录尝试');

    console.log('\n💡 安全提示消息示例:');
    console.log('   "⚠️ 无法激活规则: 流量配额限制: quota_exceeded: 110.0%"');
    console.log('   "🔒 安全校验失败: 流量使用率过高，为避免立即超限，暂时禁止激活规则"');

    console.log('\n🔄 恢复正常状态:');
    console.log('   - 重置test用户流量配额');
    console.log('   - 规则将可以正常激活');

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
    console.error('❌ 演示失败:', error);
    process.exit(1);
  }
}

// 运行演示
demoSecurityFix();
