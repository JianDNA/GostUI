'use strict';

/**
 * 移除系统级别流量统计相关的表，保留用户和规则级流量统计
 *
 * 清理内容：
 * 1. 删除 TrafficHourly 表（小时级流量统计）
 * 2. 删除 SpeedMinutely 表（分钟级网速统计）
 * 3. 删除 TrafficLog 表（详细流量日志）
 *
 * 保留内容：
 * 1. Users.usedTraffic 字段（用户总流量统计）
 * 2. UserForwardRules.usedTraffic 字段（规则级流量统计）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🧹 开始清理系统级别流量统计相关数据...');
    
    try {
      // 1. 删除 TrafficHourly 表
      const trafficHourlyExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('TrafficHourly')
      );
      
      if (trafficHourlyExists) {
        await queryInterface.dropTable('TrafficHourly');
        console.log('✅ 删除 TrafficHourly 表成功');
      } else {
        console.log('⏭️ TrafficHourly 表不存在，跳过删除');
      }

      // 2. 删除 SpeedMinutely 表
      const speedMinutelyExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('SpeedMinutely') || tables.includes('speed_minutely')
      );
      
      if (speedMinutelyExists) {
        // 尝试删除两种可能的表名
        try {
          await queryInterface.dropTable('SpeedMinutely');
          console.log('✅ 删除 SpeedMinutely 表成功');
        } catch (error) {
          await queryInterface.dropTable('speed_minutely');
          console.log('✅ 删除 speed_minutely 表成功');
        }
      } else {
        console.log('⏭️ SpeedMinutely 表不存在，跳过删除');
      }

      // 3. 删除 TrafficLog 表
      const trafficLogExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('TrafficLog') || tables.includes('TrafficLogs')
      );
      
      if (trafficLogExists) {
        try {
          await queryInterface.dropTable('TrafficLog');
          console.log('✅ 删除 TrafficLog 表成功');
        } catch (error) {
          await queryInterface.dropTable('TrafficLogs');
          console.log('✅ 删除 TrafficLogs 表成功');
        }
      } else {
        console.log('⏭️ TrafficLog 表不存在，跳过删除');
      }

      console.log('🎉 系统级别流量统计清理完成！');
      console.log('📊 保留的流量统计：');
      console.log('   - Users.usedTraffic (用户总流量)');
      console.log('   - Users.trafficQuota (用户流量配额)');
      console.log('   - UserForwardRules.usedTraffic (规则级流量)');
      
    } catch (error) {
      console.error('❌ 清理系统级别流量统计失败:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ 此迁移不支持回滚，因为数据已被删除');
    console.log('如需恢复，请重新运行相关的创建迁移');
    
    // 不实现回滚，因为数据已被删除
    // 如果需要恢复，用户需要重新运行相关的创建迁移
  }
};
