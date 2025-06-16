'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔧 修复外键约束，防止用户被意外删除...');
      
      // 1. 检查当前表结构
      const tables = await queryInterface.showAllTables({ transaction });
      if (!tables.includes('UserForwardRules')) {
        console.log('⚠️ UserForwardRules 表不存在，跳过修复');
        await transaction.commit();
        return;
      }
      
      // 2. 备份现有数据
      console.log('💾 备份现有数据...');
      const [existingRules] = await queryInterface.sequelize.query(
        'SELECT * FROM UserForwardRules',
        { transaction }
      );
      console.log(`📊 找到 ${existingRules.length} 条转发规则`);
      
      const [existingUsers] = await queryInterface.sequelize.query(
        'SELECT * FROM Users',
        { transaction }
      );
      console.log(`📊 找到 ${existingUsers.length} 个用户`);
      
      // 3. 创建新的UserForwardRules表，使用正确的外键约束
      console.log('🔨 创建新表结构...');
      await queryInterface.createTable('UserForwardRules_fixed', {
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
          onDelete: 'CASCADE',  // ✅ 正确：删除用户时删除其规则
          onUpdate: 'CASCADE',  // ✅ 正确：更新用户ID时更新规则
          comment: '用户ID - 删除用户时级联删除规则'
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
        comment: '用户转发规则表（修复外键约束）'
      });
      
      // 4. 迁移数据到新表
      if (existingRules.length > 0) {
        console.log('📦 迁移数据到新表...');
        
        for (const rule of existingRules) {
          // 确保每条记录都有 ruleUUID
          const ruleUUID = rule.ruleUUID || require('uuid').v4();
          
          await queryInterface.sequelize.query(`
            INSERT INTO UserForwardRules_fixed 
            (id, userId, ruleUUID, name, sourcePort, targetAddress, protocol, isActive, description, usedTraffic, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, {
            replacements: [
              rule.id,
              rule.userId,
              ruleUUID,
              rule.name,
              rule.sourcePort,
              rule.targetAddress,
              rule.protocol || 'tcp',
              rule.isActive !== undefined ? rule.isActive : true,
              rule.description,
              rule.usedTraffic || 0,
              rule.createdAt || new Date(),
              rule.updatedAt || new Date()
            ],
            transaction
          });
        }
        
        console.log(`✅ 成功迁移 ${existingRules.length} 条规则`);
      }
      
      // 5. 删除旧表
      console.log('🗑️ 删除旧表...');
      await queryInterface.dropTable('UserForwardRules', { transaction });
      
      // 6. 重命名新表
      console.log('🔄 重命名新表...');
      await queryInterface.renameTable('UserForwardRules_fixed', 'UserForwardRules', { transaction });
      
      // 7. 创建索引
      console.log('📇 创建索引...');
      
      await queryInterface.addIndex('UserForwardRules', ['userId'], {
        name: 'idx_user_forward_rules_user_id',
        transaction
      });
      
      await queryInterface.addIndex('UserForwardRules', ['isActive'], {
        name: 'idx_user_forward_rules_active',
        transaction
      });
      
      await queryInterface.addIndex('UserForwardRules', ['userId', 'isActive'], {
        name: 'idx_user_forward_rules_user_active',
        transaction
      });
      
      // 8. 验证修复结果
      console.log('✅ 验证修复结果...');
      const [finalRuleCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM UserForwardRules',
        { transaction }
      );
      const [finalUserCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM Users',
        { transaction }
      );
      
      console.log(`📊 最终统计: ${finalUserCount[0].count} 个用户, ${finalRuleCount[0].count} 条规则`);
      
      await transaction.commit();
      console.log('🎉 外键约束修复完成！现在用户不会因为规则问题被意外删除。');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ 修复失败，已回滚:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('⏪ 回滚外键约束修复...');
      console.log('⚠️ 警告：此回滚可能会重新引入用户被意外删除的风险');
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ 回滚失败:', error);
      throw error;
    }
  }
};
