/**
 * 检查用户配额状态
 */

async function checkUserQuota() {
  console.log('🔍 检查用户配额状态...\n');

  try {
    const { User, UserForwardRule } = require('./models');

    // 1. 检查test用户的详细信息
    console.log('1. 检查test用户的详细信息...');
    const user = await User.findOne({
      where: { username: 'test' },
      attributes: ['id', 'username', 'isActive', 'userStatus', 'role', 'expiryDate', 'trafficQuota', 'usedTraffic', 'portRangeStart', 'portRangeEnd', 'additionalPorts']
    });

    if (!user) {
      console.log('❌ test用户不存在');
      return;
    }

    console.log('📊 用户基本信息:');
    console.log(`  用户ID: ${user.id}`);
    console.log(`  用户名: ${user.username}`);
    console.log(`  激活状态: ${user.isActive}`);
    console.log(`  用户状态: ${user.userStatus}`);
    console.log(`  角色: ${user.role}`);
    console.log(`  过期时间: ${user.expiryDate}`);
    console.log(`  流量配额: ${user.trafficQuota}GB`);
    console.log(`  已用流量: ${user.usedTraffic} 字节`);

    // 2. 检查流量配额计算
    console.log('\n2. 检查流量配额计算...');
    const limitBytes = user.getTrafficLimitBytes();
    const isExceeded = user.isTrafficExceeded();
    const usagePercent = user.getTrafficUsagePercent();
    const remainingBytes = user.getRemainingTrafficBytes();

    console.log(`  配额限制: ${limitBytes} 字节 (${(limitBytes/1024/1024).toFixed(2)}MB)`);
    console.log(`  是否超限: ${isExceeded}`);
    console.log(`  使用百分比: ${usagePercent.toFixed(2)}%`);
    console.log(`  剩余流量: ${remainingBytes} 字节 (${(remainingBytes/1024/1024).toFixed(2)}MB)`);

    // 3. 检查用户是否过期
    console.log('\n3. 检查用户过期状态...');
    const isExpired = user.isExpired ? user.isExpired() : false;
    console.log(`  是否过期: ${isExpired}`);

    // 4. 检查规则状态
    console.log('\n4. 检查端口6443规则状态...');
    const rule = await UserForwardRule.findOne({
      where: { sourcePort: 6443 },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'isActive', 'userStatus', 'role', 'expiryDate', 'trafficQuota', 'usedTraffic', 'portRangeStart', 'portRangeEnd', 'additionalPorts']
      }]
    });

    if (rule) {
      console.log(`  规则ID: ${rule.id}`);
      console.log(`  规则名: ${rule.name}`);
      console.log(`  用户ID: ${rule.userId}`);
      
      // 检查计算属性
      const computedIsActive = rule.getComputedIsActive();
      console.log(`  计算的isActive: ${computedIsActive}`);
      
      // 逐步检查每个条件
      console.log('\n  详细检查:');
      console.log(`    用户激活: ${rule.user.isActive}`);
      console.log(`    用户状态: ${rule.user.userStatus}`);
      console.log(`    用户角色: ${rule.user.role}`);
      
      if (rule.user.role !== 'admin') {
        const userIsExpired = rule.user.isExpired ? rule.user.isExpired() : false;
        console.log(`    用户过期: ${userIsExpired}`);
        
        const userTrafficExceeded = rule.user.isTrafficExceeded ? rule.user.isTrafficExceeded() : false;
        console.log(`    流量超限: ${userTrafficExceeded}`);
      }
    } else {
      console.log('❌ 端口6443规则不存在');
    }

  } catch (error) {
    console.error('❌ 检查失败:', error);
  } finally {
    process.exit(0);
  }
}

checkUserQuota();
