'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔄 开始删除 UserForwardRules 表的 isActive 字段...');
    
    try {
      // 检查字段是否存在
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (tableDescription.isActive) {
        console.log('📋 找到 isActive 字段，准备删除...');
        
        // 删除 isActive 字段
        await queryInterface.removeColumn('UserForwardRules', 'isActive');
        
        console.log('✅ 成功删除 isActive 字段');
        console.log('💡 现在 isActive 将作为计算属性工作，基于用户状态、配额等动态计算');
      } else {
        console.log('ℹ️ isActive 字段不存在，跳过删除');
      }
    } catch (error) {
      console.error('❌ 删除 isActive 字段失败:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 开始恢复 UserForwardRules 表的 isActive 字段...');
    
    try {
      // 检查字段是否已存在
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (!tableDescription.isActive) {
        console.log('📋 isActive 字段不存在，准备添加...');
        
        // 重新添加 isActive 字段
        await queryInterface.addColumn('UserForwardRules', 'isActive', {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          allowNull: false,
          comment: '是否启用（已废弃，使用计算属性）'
        });
        
        console.log('✅ 成功恢复 isActive 字段');
        console.log('⚠️ 注意：恢复后需要重新设置规则状态');
      } else {
        console.log('ℹ️ isActive 字段已存在，跳过添加');
      }
    } catch (error) {
      console.error('❌ 恢复 isActive 字段失败:', error);
      throw error;
    }
  }
};
