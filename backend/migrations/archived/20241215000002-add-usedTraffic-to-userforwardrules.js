'use strict';

/**
 * 为 UserForwardRules 表添加 usedTraffic 字段
 * 
 * 这个字段用于记录每个转发规则的已使用流量（字节）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🔧 开始为 UserForwardRules 表添加 usedTraffic 字段...');

      // 检查表是否存在
      const tableExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('UserForwardRules')
      );
      
      if (!tableExists) {
        console.log('⚠️ UserForwardRules 表不存在，跳过添加字段');
        return;
      }

      // 检查字段是否已存在
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (tableDescription.usedTraffic) {
        console.log('⏭️ usedTraffic 字段已存在，跳过添加');
        return;
      }

      // 添加 usedTraffic 字段
      await queryInterface.addColumn('UserForwardRules', 'usedTraffic', {
        type: Sequelize.BIGINT,
        defaultValue: 0,
        allowNull: false,
        comment: '规则已使用流量 (字节)'
      });

      console.log('✅ 成功为 UserForwardRules 表添加 usedTraffic 字段');

    } catch (error) {
      console.error('❌ 添加 usedTraffic 字段失败:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔧 开始从 UserForwardRules 表删除 usedTraffic 字段...');

      // 检查表是否存在
      const tableExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('UserForwardRules')
      );
      
      if (!tableExists) {
        console.log('⚠️ UserForwardRules 表不存在，跳过删除字段');
        return;
      }

      // 检查字段是否存在
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (!tableDescription.usedTraffic) {
        console.log('⏭️ usedTraffic 字段不存在，跳过删除');
        return;
      }

      // 删除 usedTraffic 字段
      await queryInterface.removeColumn('UserForwardRules', 'usedTraffic');

      console.log('✅ 成功从 UserForwardRules 表删除 usedTraffic 字段');

    } catch (error) {
      console.error('❌ 删除 usedTraffic 字段失败:', error);
      throw error;
    }
  }
};
