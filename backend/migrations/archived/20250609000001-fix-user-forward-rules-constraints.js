'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔧 开始修复 UserForwardRules 表约束...');
      
      // 1. 检查表是否存在
      const tables = await queryInterface.showAllTables({ transaction });
      if (!tables.includes('UserForwardRules')) {
        console.log('⚠️ UserForwardRules 表不存在，跳过修复');
        await transaction.commit();
        return;
      }
      
      // 2. 检查当前表结构
      console.log('📋 检查当前表结构...');
      const tableDescription = await queryInterface.describeTable('UserForwardRules', { transaction });
      console.log('当前字段:', Object.keys(tableDescription).join(', '));
      
      // 3. 备份现有数据
      console.log('💾 备份现有数据...');
      const [existingData] = await queryInterface.sequelize.query(
        'SELECT * FROM UserForwardRules',
        { transaction }
      );
      console.log(`📊 找到 ${existingData.length} 条现有记录`);
      
      // 4. 创建新的表结构（正确的约束）
      console.log('🔨 创建临时表...');
      await queryInterface.createTable('UserForwardRules_new', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'Users',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: '用户ID（允许一个用户有多个规则）'
        },
        ruleUUID: {
          type: Sequelize.STRING(36),
          allowNull: false,
          unique: true,
          comment: '规则唯一标识符'
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '规则名称'
        },
        sourcePort: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          comment: '源端口（全局唯一）'
        },
        targetAddress: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: '目标地址（格式：host:port）'
        },
        protocol: {
          type: Sequelize.STRING(10),
          allowNull: false,
          defaultValue: 'tcp',
          comment: '协议类型'
        },
        isActive: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否启用'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '规则描述'
        },
        usedTraffic: {
          type: Sequelize.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '已使用流量（字节）'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }, { 
        transaction,
        comment: '用户转发规则表（修复版）'
      });
      
      // 5. 迁移数据到新表
      if (existingData.length > 0) {
        console.log('📦 迁移数据到新表...');
        
        for (const row of existingData) {
          // 确保每条记录都有 ruleUUID
          const ruleUUID = row.ruleUUID || require('uuid').v4();
          
          await queryInterface.sequelize.query(`
            INSERT INTO UserForwardRules_new 
            (id, userId, ruleUUID, name, sourcePort, targetAddress, protocol, isActive, description, usedTraffic, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, {
            replacements: [
              row.id,
              row.userId,
              ruleUUID,
              row.name,
              row.sourcePort,
              row.targetAddress,
              row.protocol || 'tcp',
              row.isActive !== undefined ? row.isActive : true,
              row.description,
              row.usedTraffic || 0,
              row.createdAt || new Date(),
              row.updatedAt || new Date()
            ],
            transaction
          });
        }
        
        console.log(`✅ 成功迁移 ${existingData.length} 条记录`);
      }
      
      // 6. 删除旧表
      console.log('🗑️ 删除旧表...');
      await queryInterface.dropTable('UserForwardRules', { transaction });
      
      // 7. 重命名新表
      console.log('🔄 重命名新表...');
      await queryInterface.renameTable('UserForwardRules_new', 'UserForwardRules', { transaction });
      
      // 8. 创建索引
      console.log('📇 创建索引...');
      
      // 用户ID索引（非唯一，允许一个用户有多个规则）
      await queryInterface.addIndex('UserForwardRules', ['userId'], {
        name: 'idx_user_forward_rules_user_id',
        transaction
      });
      
      // 活跃状态索引
      await queryInterface.addIndex('UserForwardRules', ['isActive'], {
        name: 'idx_user_forward_rules_active',
        transaction
      });
      
      // 用户+活跃状态组合索引
      await queryInterface.addIndex('UserForwardRules', ['userId', 'isActive'], {
        name: 'idx_user_forward_rules_user_active',
        transaction
      });
      
      // 9. 验证修复结果
      console.log('✅ 验证修复结果...');
      const [finalCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM UserForwardRules',
        { transaction }
      );
      console.log(`📊 最终记录数: ${finalCount[0].count}`);
      
      await transaction.commit();
      console.log('🎉 UserForwardRules 表约束修复完成！');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ 修复失败，已回滚:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('⏪ 回滚 UserForwardRules 表约束修复...');
      
      // 注意：这个回滚操作比较复杂，因为我们修复了错误的约束
      // 在实际生产环境中，可能需要更仔细的回滚策略
      console.log('⚠️ 警告：此迁移的回滚可能会重新引入约束问题');
      console.log('⚠️ 建议：如需回滚，请手动检查数据完整性');
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ 回滚失败:', error);
      throw error;
    }
  }
};
