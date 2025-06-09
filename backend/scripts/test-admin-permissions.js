/**
 * 测试管理员权限脚本
 */

const { sequelize, models } = require('../services/dbService');
const { User } = models;

async function testAdminPermissions() {
  try {
    console.log('🧪 开始测试管理员权限...');
    console.log('=====================================');

    // 确保数据库连接
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    // 查找 admin 用户
    const adminUser = await User.findOne({
      where: { username: 'admin' }
    });

    if (!adminUser) {
      console.log('❌ 未找到 admin 用户');
      return false;
    }

    console.log('✅ 找到 admin 用户');
    console.log(`   ID: ${adminUser.id}`);
    console.log(`   用户名: ${adminUser.username}`);
    console.log(`   角色: ${adminUser.role}`);
    console.log(`   状态: ${adminUser.isActive ? '激活' : '禁用'}`);
    console.log(`   过期时间: ${adminUser.expiryDate || '无'}`);

    // 检查是否为管理员
    const isAdmin = adminUser.role === 'admin';
    console.log(`\n🔍 管理员权限检查:`);
    console.log(`   是否为管理员: ${isAdmin ? '✅ 是' : '❌ 否'}`);
    console.log(`   账户是否激活: ${adminUser.isActive ? '✅ 是' : '❌ 否'}`);

    // 检查端口范围
    console.log(`\n🔍 端口权限检查:`);
    if (adminUser.portRangeStart && adminUser.portRangeEnd) {
      console.log(`   端口范围: ${adminUser.portRangeStart}-${adminUser.portRangeEnd}`);
    } else {
      console.log(`   端口范围: 无限制 (管理员特权)`);
    }

    // 检查流量限制
    console.log(`\n🔍 流量权限检查:`);
    console.log(`   流量配额: ${adminUser.trafficQuota || '无限制'}`);
    console.log(`   已用流量: ${adminUser.usedTraffic || 0}`);

    // 获取所有用户统计
    console.log(`\n📊 用户统计:`);
    const allUsers = await User.findAll({
      attributes: ['username', 'role', 'isActive']
    });

    console.log(`总用户数: ${allUsers.length}`);
    allUsers.forEach(user => {
      console.log(`- ${user.username} (${user.role}) - ${user.isActive ? '激活' : '禁用'}`);
    });

    console.log('\n🎉 管理员权限测试完成');
    console.log('=====================================');

    if (isAdmin) {
      console.log('✅ 所有测试通过，admin 用户权限正常');
      console.log('✅ 测试面板应该在前端显示');
    } else {
      console.log('❌ admin 用户权限异常');
      console.log('❌ 测试面板不会在前端显示');
    }

    return true;
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return false;
  }
}

if (require.main === module) {
  testAdminPermissions()
    .then(success => {
      if (success) {
        console.log('\n🎉 测试成功');
        process.exit(0);
      } else {
        console.log('\n❌ 测试失败');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = testAdminPermissions;
