/**
 * 强制修复配额设置
 */

async function forceFixQuota() {
  console.log('🔧 强制修复配额设置...\n');

  try {
    // 1. 直接使用SQL修改数据库
    const { sequelize } = require('./models');
    
    console.log('1. 使用SQL直接修改数据库...');
    
    // 直接执行SQL，绕过模型验证
    await sequelize.query(`
      UPDATE Users 
      SET trafficQuota = 0.1, usedTraffic = 0 
      WHERE id = 2
    `);
    
    console.log('✅ SQL修改完成');

    // 2. 验证修改结果
    console.log('\n2. 验证修改结果...');
    const [results] = await sequelize.query(`
      SELECT id, username, trafficQuota, usedTraffic 
      FROM Users 
      WHERE id = 2
    `);
    
    const user = results[0];
    console.log('📊 修改后的用户信息:');
    console.log(`   用户ID: ${user.id}`);
    console.log(`   用户名: ${user.username}`);
    console.log(`   配额: ${user.trafficQuota}GB`);
    console.log(`   已用流量: ${user.usedTraffic} bytes`);
    console.log(`   配额字节数: ${user.trafficQuota * 1024 * 1024 * 1024} bytes`);

    // 3. 清除所有缓存
    console.log('\n3. 清除所有缓存...');
    const quotaManagementService = require('./services/quotaManagementService');
    const gostLimiterService = require('./services/gostLimiterService');
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');
    
    quotaManagementService.clearAllQuotaCache();
    gostLimiterService.clearAllQuotaCache();
    await multiInstanceCacheService.refreshPortUserMapping();
    
    console.log('✅ 缓存已清除');

    // 4. 验证配额服务
    console.log('\n4. 验证配额服务...');
    const quotaStatus = await quotaManagementService.checkUserQuotaStatus(2);
    console.log('📊 配额服务返回:');
    console.log(`   状态: ${quotaStatus.status}`);
    console.log(`   允许访问: ${quotaStatus.allowed}`);
    console.log(`   使用率: ${quotaStatus.usagePercentage}%`);
    console.log(`   配额字节: ${quotaStatus.quotaBytes} bytes`);
    console.log(`   配额GB: ${(quotaStatus.quotaBytes / (1024*1024*1024)).toFixed(3)}GB`);

    if (quotaStatus.quotaBytes === 107374182.4) { // 0.1GB in bytes
      console.log('✅ 配额设置正确 (100MB)');
    } else {
      console.log('❌ 配额设置仍然不正确');
    }

    console.log('\n✅ 强制修复完成！');

  } catch (error) {
    console.error('❌ 强制修复失败:', error);
  } finally {
    process.exit(0);
  }
}

forceFixQuota();
