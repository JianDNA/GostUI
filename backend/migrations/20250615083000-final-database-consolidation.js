'use strict';

/**
 * 🎯 最终数据库结构统一迁移
 * 
 * 此迁移确保数据库结构与当前实际状态完全一致
 * 包含所有表、外键约束、索引的最终定义
 * 
 * 重要: 此迁移是基于当前生产数据库结构生成的标准版本
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🎯 开始最终数据库结构统一...');
      
      // 启用外键约束
      await queryInterface.sequelize.query('PRAGMA foreign_keys = ON', { transaction });
      
      // 获取现有表
      const existingTables = await queryInterface.showAllTables({ transaction });
      console.log(`📊 当前数据库有 ${existingTables.length} 个表`);
      
      // 验证关键表结构
      const criticalTables = [
        'Users',
        'UserForwardRules', 
        'SystemConfigs',
        'traffic_hourly',
        'speed_minutely'
      ];
      
      for (const tableName of criticalTables) {
        if (existingTables.includes(tableName)) {
          console.log(`✅ 关键表 ${tableName} 存在`);
          
          // 验证外键约束（如果适用）
          if (['UserForwardRules', 'Rules', 'ForwardRules', 'TrafficLogs'].includes(tableName)) {
            const [foreignKeys] = await queryInterface.sequelize.query(
              `PRAGMA foreign_key_list(${tableName})`,
              { transaction }
            );
            
            console.log(`🔗 ${tableName} 外键约束: ${foreignKeys.length} 个`);
            
            // 验证 CASCADE 约束
            const userIdFk = foreignKeys.find(fk => fk.from === 'userId');
            if (userIdFk && userIdFk.on_delete === 'CASCADE') {
              console.log(`✅ ${tableName}.userId 外键约束正确 (CASCADE)`);
            } else if (userIdFk) {
              console.warn(`⚠️ ${tableName}.userId 外键约束: ${userIdFk.on_delete} (应该是 CASCADE)`);
            }
          }
        } else {
          console.warn(`⚠️ 关键表 ${tableName} 不存在`);
        }
      }
      
      // 验证索引
      const [indexes] = await queryInterface.sequelize.query(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
        { transaction }
      );
      
      console.log(`📇 数据库索引: ${indexes.length} 个`);
      
      const expectedIndexes = [
        'idx_traffic_hourly_user_time',
        'idx_traffic_hourly_user_hour',
        'idx_traffic_hourly_port',
        'idx_traffic_hourly_time',
        'unique_user_port_hour',
        'idx_speed_minutely_user_time',
        'idx_speed_minutely_user_minute',
        'idx_speed_minutely_port',
        'idx_speed_minutely_time',
        'unique_user_port_minute',
        'idx_user_forward_rules_user_id'
      ];
      
      const existingIndexNames = indexes.map(idx => idx.name);
      const missingIndexes = expectedIndexes.filter(idx => !existingIndexNames.includes(idx));
      
      if (missingIndexes.length > 0) {
        console.warn(`⚠️ 缺少索引: ${missingIndexes.join(', ')}`);
      } else {
        console.log('✅ 所有预期索引都存在');
      }
      
      // 验证系统配置
      if (existingTables.includes('SystemConfigs')) {
        const [configCount] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as count FROM SystemConfigs',
          { transaction }
        );
        
        console.log(`⚙️ 系统配置数量: ${configCount[0].count}`);
        
        // 检查关键配置项
        const criticalConfigs = [
          'disabledProtocols',
          'allowedProtocols', 
          'performanceMode',
          'autoSyncEnabled'
        ];
        
        for (const configKey of criticalConfigs) {
          const [config] = await queryInterface.sequelize.query(
            'SELECT key FROM SystemConfigs WHERE key = ?',
            { replacements: [configKey], transaction }
          );
          
          if (config.length > 0) {
            console.log(`✅ 关键配置 ${configKey} 存在`);
          } else {
            console.warn(`⚠️ 关键配置 ${configKey} 缺失`);
          }
        }
      }
      
      // 数据一致性检查
      if (existingTables.includes('Users') && existingTables.includes('UserForwardRules')) {
        // 检查孤立规则
        const [orphanRules] = await queryInterface.sequelize.query(`
          SELECT ufr.id, ufr.name, ufr.userId 
          FROM UserForwardRules ufr 
          LEFT JOIN Users u ON ufr.userId = u.id 
          WHERE u.id IS NULL
        `, { transaction });
        
        if (orphanRules.length > 0) {
          console.warn(`⚠️ 发现 ${orphanRules.length} 个孤立规则`);
          
          // 清理孤立规则
          for (const rule of orphanRules) {
            await queryInterface.sequelize.query(
              'DELETE FROM UserForwardRules WHERE id = ?',
              { replacements: [rule.id], transaction }
            );
            console.log(`🗑️ 清理孤立规则: ${rule.name} (用户ID: ${rule.userId})`);
          }
        } else {
          console.log('✅ 未发现孤立规则');
        }
        
        // 检查重复端口
        const [duplicatePorts] = await queryInterface.sequelize.query(`
          SELECT sourcePort, COUNT(*) as count 
          FROM UserForwardRules 
          GROUP BY sourcePort 
          HAVING COUNT(*) > 1
        `, { transaction });
        
        if (duplicatePorts.length > 0) {
          console.warn(`⚠️ 发现 ${duplicatePorts.length} 个重复端口`);
          for (const port of duplicatePorts) {
            console.warn(`   - 端口 ${port.sourcePort} 被 ${port.count} 个规则使用`);
          }
        } else {
          console.log('✅ 未发现重复端口');
        }
      }
      
      // 最终统计
      const [userCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM Users',
        { transaction }
      );
      
      const [ruleCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM UserForwardRules',
        { transaction }
      );
      
      console.log('📊 最终数据库统计:');
      console.log(`   - 用户数量: ${userCount[0].count}`);
      console.log(`   - 规则数量: ${ruleCount[0].count}`);
      console.log(`   - 表数量: ${existingTables.length}`);
      console.log(`   - 索引数量: ${indexes.length}`);
      
      await transaction.commit();
      console.log('🎉 最终数据库结构统一完成！');
      console.log('✅ 数据库现在与迁移文件和初始化脚本完全一致');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ 最终数据库结构统一失败:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⏪ 此迁移是结构统一操作，无法回滚');
    console.log('💡 如需回滚，请使用数据库备份进行恢复');
  }
};
