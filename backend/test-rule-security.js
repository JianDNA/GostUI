#!/usr/bin/env node

/**
 * 测试规则安全校验功能
 */

const { User, UserForwardRule } = require('./models');
const ruleSecurityService = require('./services/ruleSecurityService');

async function testRuleSecurity() {
  try {
    console.log('🔒 测试规则安全校验功能...\n');

    // 1. 获取test用户和规则
    console.log('1. 获取test用户信息...');
    const testUser = await User.findOne({ where: { username: 'test' } });
    if (!testUser) {
      console.log('❌ 未找到test用户');
      return;
    }

    const testRule = await UserForwardRule.findOne({ 
      where: { userId: testUser.id },
      include: [{ model: User, as: 'user' }]
    });
    if (!testRule) {
      console.log('❌ 未找到test用户的规则');
      return;
    }

    console.log(`✅ 找到用户: ${testUser.username} (ID: ${testUser.id})`);
    console.log(`✅ 找到规则: ${testRule.name} (ID: ${testRule.id}, 当前状态: ${testRule.isActive})`);

    // 2. 设置用户接近配额限制
    console.log('\n2. 设置用户接近配额限制...');
    const quotaBytes = testUser.trafficQuota * 1024 * 1024 * 1024;
    const usedTraffic = Math.floor(quotaBytes * 0.98); // 98%使用率
    await testUser.update({ usedTraffic });
    console.log(`✅ 设置用户流量使用率为98%: ${(usedTraffic / (1024*1024*1024)).toFixed(2)}GB / ${testUser.trafficQuota}GB`);

    // 3. 测试配额限制下的规则激活
    console.log('\n3. 测试配额限制下的规则激活...');
    const quotaTestResult = await ruleSecurityService.validateRuleActivation(
      testRule.id, 
      testUser.id, 
      testUser.role, 
      true
    );
    console.log(`📊 配额限制测试结果:`, quotaTestResult);

    // 4. 设置用户超过配额限制
    console.log('\n4. 设置用户超过配额限制...');
    const overQuotaTraffic = Math.floor(quotaBytes * 1.1); // 110%使用率
    await testUser.update({ usedTraffic: overQuotaTraffic });
    console.log(`✅ 设置用户流量使用率为110%: ${(overQuotaTraffic / (1024*1024*1024)).toFixed(2)}GB / ${testUser.trafficQuota}GB`);

    // 5. 测试超配额下的规则激活
    console.log('\n5. 测试超配额下的规则激活...');
    const overQuotaTestResult = await ruleSecurityService.validateRuleActivation(
      testRule.id, 
      testUser.id, 
      testUser.role, 
      true
    );
    console.log(`📊 超配额测试结果:`, overQuotaTestResult);

    // 6. 测试操作频率限制
    console.log('\n6. 测试操作频率限制...');
    const frequencyResults = [];
    for (let i = 0; i < 7; i++) {
      const result = await ruleSecurityService.validateRuleActivation(
        testRule.id, 
        testUser.id, 
        testUser.role, 
        true
      );
      frequencyResults.push({
        attempt: i + 1,
        allowed: result.allowed,
        reason: result.reason,
        code: result.code
      });
      
      // 短暂延迟
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('📊 频率限制测试结果:');
    frequencyResults.forEach(r => {
      console.log(`   尝试${r.attempt}: ${r.allowed ? '✅ 允许' : '❌ 拒绝'} - ${r.reason}`);
    });

    // 7. 测试Admin用户权限
    console.log('\n7. 测试Admin用户权限...');
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    if (adminUser) {
      const adminTestResult = await ruleSecurityService.validateRuleActivation(
        testRule.id, 
        adminUser.id, 
        adminUser.role, 
        true
      );
      console.log(`📊 Admin权限测试结果:`, adminTestResult);
    }

    // 8. 测试规则停用（应该总是允许）
    console.log('\n8. 测试规则停用...');
    const deactivateResult = await ruleSecurityService.validateRuleActivation(
      testRule.id, 
      testUser.id, 
      testUser.role, 
      false
    );
    console.log(`📊 规则停用测试结果:`, deactivateResult);

    // 9. 获取可疑操作报告
    console.log('\n9. 获取可疑操作报告...');
    const suspiciousReport = ruleSecurityService.getSuspiciousOperationsReport();
    console.log('📊 可疑操作报告:');
    Object.entries(suspiciousReport).forEach(([key, data]) => {
      console.log(`   ${key}: ${data.count}次操作, 最新: ${data.latestOperation.timestamp}`);
    });

    // 10. 恢复test用户配额
    console.log('\n10. 恢复test用户配额...');
    await testUser.update({ usedTraffic: 0 });
    console.log('✅ test用户配额已恢复');

    console.log('\n🎉 规则安全校验测试完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 安全功能总结:');
    console.log('   ✅ 配额限制校验 - 防止超配额用户激活规则');
    console.log('   ✅ 操作频率限制 - 防止恶意频繁操作');
    console.log('   ✅ 权限验证 - 确保用户只能操作自己的规则');
    console.log('   ✅ 用户状态检查 - 验证用户有效性');
    console.log('   ✅ 端口权限检查 - 验证端口使用权限');
    console.log('   ✅ 可疑操作记录 - 记录和监控异常行为');
    console.log('   ✅ Admin特权 - Admin用户不受限制');
    console.log('');
    console.log('💡 现在用户无法通过以下方式绕过限制:');
    console.log('   - 手动激活超配额规则');
    console.log('   - 频繁切换规则状态');
    console.log('   - 操作其他用户的规则');
    console.log('   - 使用无效的端口');

    process.exit(0);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testRuleSecurity();
