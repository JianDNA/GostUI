/**
 * 直接查询数据库检查流量统计
 */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)}${units[unitIndex]}`;
}

async function checkTrafficDirect() {
  try {
    console.log('🔍 直接查询数据库检查流量统计...\n');

    const { User, UserForwardRule } = require('./models');

    // 查询用户流量
    console.log('👥 用户流量统计:');
    const users = await User.findAll({
      attributes: ['id', 'username', 'usedTraffic', 'trafficQuota'],
      order: [['id', 'ASC']]
    });

    let totalUserTraffic = 0;
    users.forEach(user => {
      const traffic = user.usedTraffic || 0;
      totalUserTraffic += traffic;
      console.log(`  ${user.username}: ${formatBytes(traffic)} / ${user.trafficQuota || 'unlimited'}GB`);
    });

    console.log(`  总用户流量: ${formatBytes(totalUserTraffic)}`);

    // 查询规则流量
    console.log('\n📋 规则流量统计:');
    const rules = await UserForwardRule.findAll({
      attributes: ['id', 'name', 'sourcePort', 'userId', 'usedTraffic'],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'isActive', 'userStatus', 'role']
      }],
      order: [['sourcePort', 'ASC']]
    });

    let totalRuleTraffic = 0;
    let activeRuleCount = 0;
    rules.forEach(rule => {
      const traffic = rule.usedTraffic || 0;
      const isActive = rule.isActive; // 使用计算属性
      const status = isActive ? '✅' : '❌';
      totalRuleTraffic += traffic;
      if (isActive) activeRuleCount++;
      console.log(`  端口${rule.sourcePort} (用户${rule.userId}) ${status}: ${formatBytes(traffic)} - ${rule.name}`);
    });

    console.log(`  总规则流量: ${formatBytes(totalRuleTraffic)}`);
    console.log(`  活跃规则数: ${activeRuleCount}/${rules.length}`);

    // 分析结果
    console.log('\n📊 流量统计分析:');
    if (totalUserTraffic > 0) {
      console.log('✅ 用户流量统计正常工作');
    } else {
      console.log('❌ 用户流量统计异常');
    }

    if (totalRuleTraffic > 0) {
      console.log('✅ 规则流量统计正常工作');
    } else {
      console.log('❌ 规则流量统计异常');
    }

    if (totalUserTraffic > 0 && totalRuleTraffic > 0) {
      const ratio = totalUserTraffic / totalRuleTraffic;
      console.log(`📈 用户/规则流量比例: ${ratio.toFixed(3)}x`);

      if (Math.abs(ratio - 1.0) < 0.1) {
        console.log('✅ 流量统计一致性良好');
      } else {
        console.log('⚠️ 流量统计存在差异');
      }
    }

    // 检查最近更新时间
    console.log('\n⏰ 最近更新检查:');
    const recentUsers = await User.findAll({
      attributes: ['username', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      limit: 3
    });

    recentUsers.forEach(user => {
      const timeDiff = Date.now() - new Date(user.updatedAt).getTime();
      const secondsAgo = Math.floor(timeDiff / 1000);
      console.log(`  ${user.username}: ${secondsAgo}秒前更新`);
    });

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
  } finally {
    process.exit(0);
  }
}

checkTrafficDirect();
