'use strict';

/**
 * 🌐 添加普通用户外部访问控制配置
 *
 * 此迁移添加系统配置项来控制普通用户的转发规则是否允许外部访问
 *
 * 功能说明:
 * - allowUserExternalAccess: 控制普通用户转发规则的外部访问权限
 * - true: 普通用户规则监听所有接口 (0.0.0.0 / [::])
 * - false: 普通用户规则仅监听本地接口 (127.0.0.1 / [::1])
 * - 管理员用户不受此配置限制，始终允许外部访问
 *
 * 创建时间: 2025-06-17
 *
 * ⚠️ 执行方式说明:
 * - 新部署: 通过 complete_schema.sql 自动包含此配置
 * - 系统更新: 通过 smart-update.sh 自动检查和添加配置
 * - 手动执行: node backend/run-single-migration.js 20250617063000-add-user-external-access-config.js
 *
 * 📋 此迁移文件主要用于:
 * 1. 记录配置变更历史
 * 2. 提供手动执行选项
 * 3. 支持配置回滚操作
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🌐 添加普通用户外部访问控制配置...');
      
      // 检查 SystemConfigs 表是否存在
      const tables = await queryInterface.showAllTables({ transaction });
      if (!tables.includes('SystemConfigs')) {
        console.log('⚠️ SystemConfigs 表不存在，跳过配置添加');
        await transaction.commit();
        return;
      }
      
      // 检查配置是否已存在
      const [existingConfigs] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as count FROM SystemConfigs WHERE key = 'allowUserExternalAccess'",
        { transaction }
      );
      
      if (existingConfigs[0].count > 0) {
        console.log('✅ allowUserExternalAccess 配置已存在，跳过添加');
        await transaction.commit();
        return;
      }
      
      // 添加外部访问控制配置
      await queryInterface.bulkInsert('SystemConfigs', [{
        key: 'allowUserExternalAccess',
        value: 'true',
        description: '允许普通用户的转发规则被外部访问。true=监听所有接口(0.0.0.0)，false=仅本地访问(127.0.0.1)。管理员用户不受限制。',
        category: 'security',
        updatedBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      }], { transaction });
      
      console.log('✅ 已添加 allowUserExternalAccess 配置');
      console.log('   - 默认值: true (允许外部访问)');
      console.log('   - 分类: security');
      console.log('   - 说明: 控制普通用户转发规则的外部访问权限');
      
      // 验证配置添加成功
      const [newConfig] = await queryInterface.sequelize.query(
        "SELECT * FROM SystemConfigs WHERE key = 'allowUserExternalAccess'",
        { transaction }
      );
      
      if (newConfig.length > 0) {
        console.log('🔍 配置验证成功:');
        console.log(`   - Key: ${newConfig[0].key}`);
        console.log(`   - Value: ${newConfig[0].value}`);
        console.log(`   - Category: ${newConfig[0].category}`);
      }
      
      await transaction.commit();
      console.log('🎉 普通用户外部访问控制配置添加完成！');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ 添加外部访问控制配置失败:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 回滚普通用户外部访问控制配置...');
      
      // 删除配置项
      await queryInterface.sequelize.query(
        "DELETE FROM SystemConfigs WHERE key = 'allowUserExternalAccess'",
        { transaction }
      );
      
      console.log('✅ 已删除 allowUserExternalAccess 配置');
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ 回滚外部访问控制配置失败:', error);
      throw error;
    }
  }
};
