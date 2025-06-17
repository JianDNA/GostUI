'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // 检查 isActive 列是否存在
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (tableDescription.isActive) {
        console.log('🔧 移除 UserForwardRules 表中的 isActive 列...');
        
        // 移除 isActive 列
        await queryInterface.removeColumn('UserForwardRules', 'isActive');
        
        console.log('✅ 成功移除 isActive 列');
      } else {
        console.log('✅ isActive 列不存在，无需移除');
      }
    } catch (error) {
      console.error('❌ 移除 isActive 列失败:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // 检查 isActive 列是否存在
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (!tableDescription.isActive) {
        console.log('🔧 恢复 UserForwardRules 表中的 isActive 列...');
        
        // 恢复 isActive 列
        await queryInterface.addColumn('UserForwardRules', 'isActive', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否启用'
        });
        
        console.log('✅ 成功恢复 isActive 列');
      } else {
        console.log('✅ isActive 列已存在，无需恢复');
      }
    } catch (error) {
      console.error('❌ 恢复 isActive 列失败:', error);
      throw error;
    }
  }
};
