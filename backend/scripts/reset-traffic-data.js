/**
 * 重置流量数据脚本
 * 
 * 功能说明:
 * 1. 清理所有虚假的测试流量数据
 * 2. 重置用户流量使用量为0
 * 3. 清理时序数据库中的测试数据
 * 4. 保留用户账户和转发规则
 */

const { sequelize, models } = require('../services/dbService');
const { User, UserForwardRule, TrafficHourly, SpeedMinutely } = models;

async function resetTrafficData() {
  try {
    console.log('🧹 开始重置流量数据...');

    // 确保数据库连接
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    const transaction = await sequelize.transaction();

    try {
      // 1. 重置所有用户的流量使用量
      console.log('🔄 重置用户流量使用量...');
      
      const updateResult = await User.update(
        {
          usedTraffic: 0,
          lastTrafficReset: new Date(),
          userStatus: 'active' // 重置状态为活跃
        },
        {
          where: {},
          transaction
        }
      );

      console.log(`✅ 已重置 ${updateResult[0]} 个用户的流量数据`);

      // 2. 清理时序流量数据
      console.log('🗑️ 清理时序流量数据...');
      
      const deletedTrafficRecords = await TrafficHourly.destroy({
        where: {},
        transaction
      });

      console.log(`✅ 已删除 ${deletedTrafficRecords} 条流量记录`);

      // 3. 清理网速数据
      console.log('🗑️ 清理网速数据...');
      
      const deletedSpeedRecords = await SpeedMinutely.destroy({
        where: {},
        transaction
      });

      console.log(`✅ 已删除 ${deletedSpeedRecords} 条网速记录`);

      // 4. 清理 Redis 缓存中的流量数据
      console.log('🧹 清理 Redis 缓存...');
      
      try {
        const multiInstanceCacheService = require('../services/multiInstanceCacheService');
        // 触发缓存同步
        await multiInstanceCacheService.syncCache();
        console.log('✅ 多实例缓存已更新');
      } catch (error) {
        console.warn('⚠️ 清理缓存失败:', error.message);
      }

      await transaction.commit();

      // 5. 验证清理结果
      console.log('🔍 验证清理结果...');
      
      const users = await User.findAll({
        attributes: ['id', 'username', 'role', 'usedTraffic', 'trafficQuota']
      });

      console.log('\n📊 清理后的用户状态:');
      for (const user of users) {
        const usedGB = (user.usedTraffic / (1024 * 1024 * 1024)).toFixed(2);
        const quotaGB = user.trafficQuota || 'Unlimited';
        console.log(`   ${user.username} (${user.role}): ${usedGB}GB / ${quotaGB}GB`);
      }

      // 统计信息
      const stats = {
        totalUsers: await User.count(),
        activeUsers: await User.count({ where: { isActive: true } }),
        totalRules: await UserForwardRule.count(),
        trafficRecords: await TrafficHourly.count(),
        speedRecords: await SpeedMinutely.count()
      };

      console.log('\n📈 系统统计:');
      console.log(`   总用户数: ${stats.totalUsers}`);
      console.log(`   活跃用户: ${stats.activeUsers}`);
      console.log(`   转发规则: ${stats.totalRules}`);
      console.log(`   流量记录: ${stats.trafficRecords}`);
      console.log(`   网速记录: ${stats.speedRecords}`);

      console.log('\n🎉 流量数据重置完成！');
      console.log('\n✅ 现在显示的将是真实的流量使用情况:');
      console.log('   - 所有用户流量使用量已重置为 0');
      console.log('   - 历史流量记录已清空');
      console.log('   - 网速记录已清空');
      console.log('   - 用户账户和转发规则保持不变');
      console.log('   - 新的流量统计将从实际使用开始记录');

      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ 重置流量数据失败:', error);
    return false;
  } finally {
    await sequelize.close();
  }
}

/**
 * 仅重置用户流量使用量，保留历史记录
 */
async function resetUserTrafficOnly() {
  try {
    console.log('🔄 仅重置用户流量使用量...');

    await sequelize.authenticate();
    
    const updateResult = await User.update(
      {
        usedTraffic: 0,
        lastTrafficReset: new Date(),
        userStatus: 'active'
      },
      {
        where: {}
      }
    );

    console.log(`✅ 已重置 ${updateResult[0]} 个用户的流量使用量`);

    // 更新缓存
    try {
      const multiInstanceCacheService = require('../services/multiInstanceCacheService');
      await multiInstanceCacheService.syncCache();
      console.log('✅ 缓存已更新');
    } catch (error) {
      console.warn('⚠️ 更新缓存失败:', error.message);
    }

    return true;
  } catch (error) {
    console.error('❌ 重置用户流量失败:', error);
    return false;
  } finally {
    await sequelize.close();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('🧹 流量数据重置脚本');
  console.log('=====================================');
  console.log('选择操作:');
  console.log('1. 完全重置 (清理所有流量数据和历史记录)');
  console.log('2. 仅重置用户流量使用量 (保留历史记录)');
  
  // 默认执行完全重置
  const operation = process.argv[2] || 'full';
  
  if (operation === 'user-only') {
    resetUserTrafficOnly()
      .then(success => {
        if (success) {
          console.log('\n🎉 用户流量重置完成');
          process.exit(0);
        } else {
          console.log('\n❌ 重置失败');
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('❌ 脚本执行失败:', error);
        process.exit(1);
      });
  } else {
    resetTrafficData()
      .then(success => {
        if (success) {
          console.log('\n🎉 完全重置完成，现在显示真实流量数据');
          process.exit(0);
        } else {
          console.log('\n❌ 重置失败');
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('❌ 脚本执行失败:', error);
        process.exit(1);
      });
  }
}

module.exports = { resetTrafficData, resetUserTrafficOnly };
