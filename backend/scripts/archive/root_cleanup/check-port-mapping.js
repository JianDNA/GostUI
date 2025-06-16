/**
 * 检查端口用户映射
 */

async function checkPortMapping() {
  console.log('🔍 检查端口用户映射...\n');

  try {
    // 1. 检查多实例缓存服务
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');

    console.log('1. 获取端口用户映射...');
    const portMapping = await multiInstanceCacheService.getPortUserMapping();

    console.log('📊 端口用户映射:');
    Object.entries(portMapping).forEach(([port, userInfo]) => {
      console.log(`  端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
    });

    // 2. 检查数据库中的规则
    console.log('\n2. 检查数据库中的转发规则...');
    const { UserForwardRule, User } = require('./models');

    // 获取所有规则，通过计算属性判断是否激活
    const allRules = await UserForwardRule.findAll({
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'isActive', 'userStatus', 'role', 'expiryDate']
      }]
    });

    // 过滤出激活的规则
    const rules = allRules.filter(rule => rule.isActive);

    // 获取用户信息
    const users = await User.findAll({
      attributes: ['id', 'username']
    });
    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = user.username;
    });

    console.log('📊 数据库中的活跃规则:');
    rules.forEach(rule => {
      const username = userMap[rule.userId] || 'unknown';
      console.log(`  规则${rule.id}: 端口${rule.sourcePort} -> 用户${rule.userId} (${username})`);
    });

    // 3. 检查特定端口
    console.log('\n3. 检查端口2999的映射...');
    if (portMapping[2999]) {
      console.log('✅ 端口2999映射正常:', portMapping[2999]);
    } else {
      console.log('❌ 端口2999没有映射');

      // 尝试手动刷新缓存
      console.log('🔄 尝试刷新端口映射缓存...');
      await multiInstanceCacheService.refreshPortUserMapping();

      const refreshedMapping = await multiInstanceCacheService.getPortUserMapping();
      if (refreshedMapping[2999]) {
        console.log('✅ 刷新后端口2999映射正常:', refreshedMapping[2999]);
      } else {
        console.log('❌ 刷新后端口2999仍然没有映射');
      }
    }

    // 4. 检查用户2的规则
    console.log('\n4. 检查用户2的规则...');
    const user2Rules = rules.filter(rule => rule.userId === 2);
    console.log(`📊 用户2的规则数量: ${user2Rules.length}`);
    user2Rules.forEach(rule => {
      console.log(`  规则${rule.id}: 端口${rule.sourcePort} -> ${rule.targetAddress}:${rule.targetPort} (活跃: ${rule.isActive})`);
    });

  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

checkPortMapping();
