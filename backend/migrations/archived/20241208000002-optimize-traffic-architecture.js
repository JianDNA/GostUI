'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 开始优化流量统计架构...');
    
    try {
      // 1. 为 UserForwardRules 表添加新字段
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (!tableDescription.ruleUUID) {
        await queryInterface.addColumn('UserForwardRules', 'ruleUUID', {
          type: Sequelize.STRING(36),
          allowNull: true, // 先允许为空，后面会填充
          comment: '规则唯一标识符'
        });
        console.log('✅ 添加 ruleUUID 字段成功');
      }
      
      if (!tableDescription.deletedAt) {
        await queryInterface.addColumn('UserForwardRules', 'deletedAt', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '软删除时间'
        });
        console.log('✅ 添加 deletedAt 字段成功');
      }

      // 2. 为现有规则生成 UUID
      const [existingRules] = await queryInterface.sequelize.query(
        'SELECT id FROM UserForwardRules WHERE ruleUUID IS NULL'
      );
      
      if (existingRules.length > 0) {
        console.log(`🔄 为 ${existingRules.length} 个现有规则生成 UUID...`);
        
        for (const rule of existingRules) {
          const uuid = uuidv4();
          await queryInterface.sequelize.query(
            'UPDATE UserForwardRules SET ruleUUID = ? WHERE id = ?',
            { replacements: [uuid, rule.id] }
          );
        }
        
        console.log('✅ 现有规则 UUID 生成完成');
      }

      // 3. 设置 ruleUUID 为非空
      await queryInterface.changeColumn('UserForwardRules', 'ruleUUID', {
        type: Sequelize.STRING(36),
        allowNull: false,
        comment: '规则唯一标识符'
      });

      // 4. 创建索引
      try {
        await queryInterface.addIndex('UserForwardRules', ['ruleUUID'], {
          unique: true,
          name: 'uk_user_forward_rules_uuid'
        });
        console.log('✅ 创建 ruleUUID 唯一索引成功');
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('⏭️ ruleUUID 索引已存在，跳过创建');
        } else {
          throw error;
        }
      }

      try {
        await queryInterface.addIndex('UserForwardRules', ['userId', 'sourcePort', 'deletedAt'], {
          name: 'idx_user_forward_rules_active'
        });
        console.log('✅ 创建活跃规则索引成功');
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('⏭️ 活跃规则索引已存在，跳过创建');
        } else {
          throw error;
        }
      }

      // 5. 检查 TrafficHourly 表是否需要添加 ruleUUID 字段
      const trafficTableExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('TrafficHourly')
      );

      if (trafficTableExists) {
        const trafficTableDescription = await queryInterface.describeTable('TrafficHourly');
        
        if (!trafficTableDescription.ruleUUID) {
          await queryInterface.addColumn('TrafficHourly', 'ruleUUID', {
            type: Sequelize.STRING(36),
            allowNull: true,
            comment: '关联的规则UUID'
          });
          console.log('✅ 为 TrafficHourly 表添加 ruleUUID 字段成功');

          // 创建索引
          try {
            await queryInterface.addIndex('TrafficHourly', ['ruleUUID', 'recordTime'], {
              name: 'idx_traffic_hourly_rule_time'
            });
            console.log('✅ 创建 TrafficHourly ruleUUID 索引成功');
          } catch (error) {
            if (error.message.includes('already exists')) {
              console.log('⏭️ TrafficHourly ruleUUID 索引已存在，跳过创建');
            } else {
              console.warn('⚠️ 创建 TrafficHourly ruleUUID 索引失败:', error.message);
            }
          }
        }
      }

      // 6. 移除旧的唯一约束（如果存在）
      try {
        await queryInterface.removeIndex('UserForwardRules', 'uk_user_forward_rules_user_port');
        console.log('✅ 移除旧的用户端口唯一约束成功');
      } catch (error) {
        console.log('⏭️ 旧的用户端口唯一约束不存在或已移除');
      }

      // 7. 创建新的唯一约束（考虑软删除）
      try {
        await queryInterface.addIndex('UserForwardRules', ['userId', 'sourcePort'], {
          unique: true,
          name: 'uk_user_forward_rules_active_port',
          where: {
            deletedAt: null
          }
        });
        console.log('✅ 创建新的活跃端口唯一约束成功');
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('⏭️ 活跃端口唯一约束已存在，跳过创建');
        } else {
          console.warn('⚠️ 创建活跃端口唯一约束失败:', error.message);
          // SQLite 可能不支持部分索引，这是正常的
        }
      }

      console.log('🎉 流量统计架构优化完成！');
      
    } catch (error) {
      console.error('❌ 优化流量统计架构失败:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚流量统计架构优化...');
    
    try {
      // 移除索引
      const indexesToRemove = [
        'uk_user_forward_rules_uuid',
        'idx_user_forward_rules_active',
        'uk_user_forward_rules_active_port',
        'idx_traffic_hourly_rule_time'
      ];

      for (const indexName of indexesToRemove) {
        try {
          await queryInterface.removeIndex('UserForwardRules', indexName);
          console.log(`✅ 移除索引 ${indexName} 成功`);
        } catch (error) {
          console.log(`⏭️ 索引 ${indexName} 不存在或已移除`);
        }
      }

      // 移除字段
      const tableDescription = await queryInterface.describeTable('UserForwardRules');
      
      if (tableDescription.ruleUUID) {
        await queryInterface.removeColumn('UserForwardRules', 'ruleUUID');
        console.log('✅ 移除 ruleUUID 字段成功');
      }
      
      if (tableDescription.deletedAt) {
        await queryInterface.removeColumn('UserForwardRules', 'deletedAt');
        console.log('✅ 移除 deletedAt 字段成功');
      }

      // 移除 TrafficHourly 的 ruleUUID 字段
      const trafficTableExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('TrafficHourly')
      );

      if (trafficTableExists) {
        const trafficTableDescription = await queryInterface.describeTable('TrafficHourly');
        
        if (trafficTableDescription.ruleUUID) {
          await queryInterface.removeColumn('TrafficHourly', 'ruleUUID');
          console.log('✅ 移除 TrafficHourly ruleUUID 字段成功');
        }
      }

      console.log('✅ 流量统计架构回滚完成');
      
    } catch (error) {
      console.error('❌ 回滚流量统计架构失败:', error);
      throw error;
    }
  }
};
