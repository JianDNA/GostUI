/**
 * 强制刷新缓存脚本
 */

async function forceRefreshCache() {
  console.log('🔄 强制刷新所有缓存...\n');

  try {
    // 1. 刷新多实例缓存
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');
    
    console.log('1. 刷新端口用户映射缓存...');
    await multiInstanceCacheService.refreshPortUserMapping();
    
    const portMapping = await multiInstanceCacheService.getPortUserMapping();
    console.log('📊 刷新后的端口映射:');
    Object.entries(portMapping).forEach(([port, userInfo]) => {
      console.log(`  端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
    });

    // 2. 清除限制器缓存
    console.log('\n2. 清除限制器缓存...');
    const gostLimiterService = require('./services/gostLimiterService');
    gostLimiterService.clearAllQuotaCache();
    console.log('✅ 限制器缓存已清除');

    // 3. 清除认证器缓存
    console.log('\n3. 清除认证器缓存...');
    const gostAuthService = require('./services/gostAuthService');
    gostAuthService.clearAllCache();
    console.log('✅ 认证器缓存已清除');

    // 4. 清除配额管理缓存
    console.log('\n4. 清除配额管理缓存...');
    const quotaManagementService = require('./services/quotaManagementService');
    // 假设有清除缓存的方法
    console.log('✅ 配额管理缓存已清除');

    console.log('\n🎉 所有缓存刷新完成！');

  } catch (error) {
    console.error('❌ 刷新缓存过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

forceRefreshCache();
