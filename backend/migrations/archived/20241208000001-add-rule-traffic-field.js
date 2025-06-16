'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 开始添加规则流量统计字段...');
    
    try {
      // 检查表是否存在
      const tableExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('UserForwardRules')
      );

      if (!tableExists) {
        console.log('❌ UserForwardRules 表不存在，请先运行创建表的迁移');
        throw new Error('UserForwardRules table does not exist');
      }

      // 检查字段是否已存在
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (!tableDescription.usedTraffic) {
        // 添加 usedTraffic 字段
        await queryInterface.addColumn('UserForwardRules', 'usedTraffic', {
          type: Sequelize.BIGINT,
          defaultValue: 0,
          allowNull: false,
          comment: '规则已使用流量 (字节)'
        });
        
        console.log('✅ 成功添加 usedTraffic 字段到 UserForwardRules 表');
      } else {
        console.log('⏭️ usedTraffic 字段已存在，跳过添加');
      }

      // 创建流量统计相关的索引（如果不存在）
      try {
        await queryInterface.addIndex('UserForwardRules', ['usedTraffic'], {
          name: 'idx_user_forward_rules_used_traffic'
        });
        console.log('✅ 创建 usedTraffic 索引成功');
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('⏭️ usedTraffic 索引已存在，跳过创建');
        } else {
          console.warn('⚠️ 创建 usedTraffic 索引失败:', error.message);
        }
      }

      // 为现有规则初始化流量数据为 0（如果字段是新添加的）
      if (!tableDescription.usedTraffic) {
        const [results] = await queryInterface.sequelize.query(
          'UPDATE UserForwardRules SET usedTraffic = 0 WHERE usedTraffic IS NULL'
        );
        console.log(`✅ 初始化了现有规则的流量数据`);
      }
      
    } catch (error) {
      console.error('❌ 添加规则流量字段失败:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始移除规则流量统计字段...');
    
    try {
      // 检查字段是否存在
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (tableDescription.usedTraffic) {
        // 移除索引
        try {
          await queryInterface.removeIndex('UserForwardRules', 'idx_user_forward_rules_used_traffic');
          console.log('✅ 移除 usedTraffic 索引成功');
        } catch (error) {
          console.warn('⚠️ 移除 usedTraffic 索引失败:', error.message);
        }

        // 移除 usedTraffic 字段
        await queryInterface.removeColumn('UserForwardRules', 'usedTraffic');
        console.log('✅ 成功移除 usedTraffic 字段');
      } else {
        console.log('⏭️ usedTraffic 字段不存在，跳过移除');
      }
      
    } catch (error) {
      console.error('❌ 移除规则流量字段失败:', error);
      throw error;
    }
  }
};
