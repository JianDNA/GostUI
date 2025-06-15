/**
 * 检查端口映射状态
 */

async function checkPortMapping() {
  console.log('🔍 检查端口映射状态...\n');

  try {
    // 1. 检查多实例缓存服务
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');

    console.log('1. 获取端口用户映射...');
    const portMapping = await multiInstanceCacheService.getPortUserMapping();

    console.log('📊 端口用户映射:');
    if (Object.keys(portMapping).length === 0) {
      console.log('❌ 端口映射为空！');
      
      // 尝试刷新缓存
      console.log('🔄 尝试刷新端口映射缓存...');
      await multiInstanceCacheService.refreshPortUserMapping();
      
      const refreshedMapping = await multiInstanceCacheService.getPortUserMapping();
      console.log('📊 刷新后的端口映射:');
      if (Object.keys(refreshedMapping).length === 0) {
        console.log('❌ 刷新后仍然为空');
      } else {
        Object.entries(refreshedMapping).forEach(([port, userInfo]) => {
          console.log(`  端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
        });
      }
    } else {
      Object.entries(portMapping).forEach(([port, userInfo]) => {
        console.log(`  端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
      });
    }

    // 2. 检查特定端口6443
    console.log('\n2. 检查端口6443的映射...');
    const currentMapping = await multiInstanceCacheService.getPortUserMapping();
    if (currentMapping[6443]) {
      console.log('✅ 端口6443映射正常:', currentMapping[6443]);
    } else {
      console.log('❌ 端口6443没有映射');
    }

    // 3. 检查数据库中的规则
    console.log('\n3. 检查数据库中的转发规则...');
    const { UserForwardRule, User } = require('./models');

    const rule6443 = await UserForwardRule.findOne({
      where: { sourcePort: 6443 },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'isActive', 'userStatus', 'role', 'expiryDate', 'trafficQuota', 'usedTraffic']
      }]
    });

    if (rule6443) {
      console.log('✅ 端口6443规则存在:');
      console.log(`  规则ID: ${rule6443.id}`);
      console.log(`  规则名: ${rule6443.name}`);
      console.log(`  用户ID: ${rule6443.userId}`);
      console.log(`  用户名: ${rule6443.user?.username}`);
      console.log(`  用户状态: ${rule6443.user?.userStatus}`);
      console.log(`  用户激活: ${rule6443.user?.isActive}`);
      console.log(`  规则激活: ${rule6443.isActive}`);
      console.log(`  流量配额: ${rule6443.user?.trafficQuota}GB`);
      console.log(`  已用流量: ${rule6443.user?.usedTraffic} 字节`);
    } else {
      console.log('❌ 端口6443规则不存在');
    }

  } catch (error) {
    console.error('❌ 检查失败:', error);
  } finally {
    process.exit(0);
  }
}

checkPortMapping();
