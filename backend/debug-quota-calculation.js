/**
 * 配额计算调试脚本
 */

async function debugQuotaCalculation() {
  console.log('🔍 开始配额计算调试...\n');

  try {
    // 1. 直接查询数据库
    const { User } = require('./models');
    
    console.log('1. 直接查询数据库中的用户信息...');
    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'trafficQuota', 'usedTraffic', 'isActive', 'userStatus']
    });

    console.log('📊 数据库中的用户信息:');
    users.forEach(user => {
      console.log(`  用户${user.id} (${user.username}):`);
      console.log(`    角色: ${user.role}`);
      console.log(`    状态: ${user.userStatus} (活跃: ${user.isActive})`);
      console.log(`    配额: ${user.trafficQuota}GB`);
      console.log(`    已用: ${user.usedTraffic} bytes`);
      
      if (user.trafficQuota && user.trafficQuota > 0) {
        const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
        const usagePercentage = (user.usedTraffic / quotaBytes * 100).toFixed(2);
        console.log(`    使用率: ${usagePercentage}%`);
      }
    });

    // 2. 测试配额管理服务
    console.log('\n2. 测试配额管理服务...');
    const quotaManagementService = require('./services/quotaManagementService');
    
    // 清除缓存
    if (typeof quotaManagementService.clearAllQuotaCache === 'function') {
      quotaManagementService.clearAllQuotaCache();
    } else {
      console.log('⚠️ 配额管理服务没有clearAllQuotaCache方法');
    }
    
    for (const user of users) {
      console.log(`\n检查用户${user.id} (${user.username}):`);
      const quotaStatus = await quotaManagementService.checkUserQuotaStatus(user.id);
      
      console.log(`  状态: ${quotaStatus.status}`);
      console.log(`  允许访问: ${quotaStatus.allowed}`);
      console.log(`  告警级别: ${quotaStatus.alertLevel}`);
      console.log(`  使用率: ${quotaStatus.usagePercentage}%`);
      console.log(`  原因: ${quotaStatus.reason}`);
      
      if (quotaStatus.usedTraffic !== undefined) {
        console.log(`  已用流量: ${quotaStatus.usedTraffic} bytes`);
      }
      if (quotaStatus.quotaBytes !== undefined) {
        console.log(`  配额字节: ${quotaStatus.quotaBytes} bytes`);
      }
    }

    // 3. 测试限制器服务
    console.log('\n3. 测试限制器服务...');
    const gostLimiterService = require('./services/gostLimiterService');
    
    // 清除缓存
    gostLimiterService.clearAllQuotaCache();
    
    for (const user of users) {
      console.log(`\n测试用户${user.id} (${user.username}) 的限制器:`);
      
      const limiterRequest = {
        scope: 'client',
        service: `forward-tcp-${user.id === 1 ? '6443' : '2999'}`,
        network: 'tcp',
        addr: 'test.com:443',
        client: `user_${user.id}`,
        src: '127.0.0.1:12345'
      };
      
      const limiterResponse = await gostLimiterService.handleLimiterRequest(limiterRequest);
      console.log(`  限制器响应: in=${limiterResponse.in}, out=${limiterResponse.out}`);
    }

  } catch (error) {
    console.error('❌ 调试过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

debugQuotaCalculation();
