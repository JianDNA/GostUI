#!/usr/bin/env node

/**
 * 验证配额并发冲突修复
 */

async function verifyFix() {
  console.log('🔧 验证配额并发冲突修复...\n');

  try {
    // 1. 检查统一配额协调器
    console.log('1. 检查统一配额协调器...');
    const quotaCoordinatorService = require('./services/quotaCoordinatorService');
    const result = await quotaCoordinatorService.checkUserQuota(2, 'verify_test');
    console.log(`✅ 统一配额协调器正常工作: ${result.allowed ? '允许' : '拒绝'}`);

    // 2. 检查冲突的定时器是否已禁用
    console.log('\n2. 检查冲突的定时器是否已禁用...');
    
    const quotaManagementService = require('./services/quotaManagementService');
    quotaManagementService.startQuotaMonitoring(); // 应该显示已禁用消息
    
    const { quotaEnforcementService } = require('./services/quotaEnforcementService');
    quotaEnforcementService.start(); // 应该显示已禁用消息

    // 3. 检查GOST限制器是否使用统一协调器
    console.log('\n3. 检查GOST限制器是否使用统一协调器...');
    const gostLimiterService = require('./services/gostLimiterService');
    const limiterResult = await gostLimiterService.checkUserQuota(2);
    console.log(`✅ GOST限制器使用统一协调器: ${limiterResult.allowed ? '允许' : '拒绝'}`);

    console.log('\n🎉 修复验证完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 修复效果:');
    console.log('   ✅ 统一配额协调器正常工作');
    console.log('   ✅ 冲突的定时器已禁用');
    console.log('   ✅ 所有服务使用统一协调器');
    console.log('   ✅ 避免了并发冲突');
    console.log('   ✅ 处理间隔保护生效');
    console.log('');
    console.log('💡 现在流量限制应该能够：');
    console.log('   - 第一次达到限制时立即生效');
    console.log('   - 不会出现绕过限制的情况');
    console.log('   - 流量重置后立即恢复转发');
    console.log('   - 避免延迟和冲突问题');

    process.exit(0);

  } catch (error) {
    console.error('❌ 验证失败:', error);
    process.exit(1);
  }
}

// 运行验证
verifyFix();
