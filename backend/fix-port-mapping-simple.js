const { UserForwardRule, User } = require('./models');

async function fixPortMapping() {
  try {
    console.log('🔍 检查6443端口规则...');
    
    // 查询6443端口规则
    const rule = await UserForwardRule.findOne({
      where: { sourcePort: 6443 },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'role', 'userStatus']
      }]
    });
    
    if (!rule) {
      console.log('❌ 6443端口规则不存在');
      return;
    }
    
    console.log('✅ 6443端口规则存在:');
    console.log(`  规则ID: ${rule.id}`);
    console.log(`  规则名: ${rule.name}`);
    console.log(`  用户ID: ${rule.userId}`);
    console.log(`  用户名: ${rule.user?.username}`);
    console.log(`  用户状态: ${rule.user?.userStatus}`);
    console.log(`  流量: ${rule.usedTraffic} 字节`);
    
    // 强制刷新缓存
    console.log('\n🔄 强制刷新端口映射缓存...');
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');
    await multiInstanceCacheService.refreshPortUserMapping();
    
    // 检查缓存结果
    const portMapping = multiInstanceCacheService.getPortUserMapping();
    console.log(`\n📊 当前端口映射: ${Object.keys(portMapping).length}个端口`);
    
    Object.entries(portMapping).forEach(([port, userInfo]) => {
      console.log(`  端口${port}: 用户${userInfo.username} (ID: ${userInfo.userId})`);
    });
    
    if (portMapping['6443']) {
      console.log('\n✅ 6443端口映射已修复!');
    } else {
      console.log('\n❌ 6443端口映射仍然缺失');
    }
    
  } catch (error) {
    console.error('❌ 修复失败:', error);
  } finally {
    process.exit(0);
  }
}

fixPortMapping();
