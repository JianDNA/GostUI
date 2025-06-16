/**
 * 数据库迁移: 添加流量管理相关字段
 * 
 * 说明:
 * 1. 利用现有的 trafficQuota 字段 (GB 单位)
 * 2. 添加 usedTraffic 字段记录已使用流量 (字节单位)
 * 3. 添加 lastTrafficReset 字段记录流量重置时间
 * 4. 添加 userStatus 字段用于缓存同步
 * 5. 创建必要的索引提高查询性能
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 开始添加流量管理字段...');

      // 检查表是否存在
      const tableExists = await queryInterface.showAllTables().then(tables => 
        tables.includes('Users')
      );

      if (!tableExists) {
        console.log('❌ Users 表不存在，请先运行基础迁移');
        throw new Error('Users table does not exist');
      }

      // 获取当前表结构
      const tableInfo = await queryInterface.describeTable('Users');
      console.log('📋 当前表字段:', Object.keys(tableInfo));

      // 1. 添加 usedTraffic 字段 (已使用流量，字节单位)
      if (!tableInfo.usedTraffic) {
        console.log('➕ 添加 usedTraffic 字段...');
        await queryInterface.addColumn('Users', 'usedTraffic', {
          type: Sequelize.BIGINT,
          defaultValue: 0,
          allowNull: false,
          comment: '已使用流量 (字节)'
        }, { transaction });
        console.log('✅ usedTraffic 字段添加成功');
      } else {
        console.log('⏭️ usedTraffic 字段已存在，跳过');
      }

      // 2. 添加 lastTrafficReset 字段 (流量重置时间)
      if (!tableInfo.lastTrafficReset) {
        console.log('➕ 添加 lastTrafficReset 字段...');
        await queryInterface.addColumn('Users', 'lastTrafficReset', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '流量重置时间'
        }, { transaction });
        console.log('✅ lastTrafficReset 字段添加成功');
      } else {
        console.log('⏭️ lastTrafficReset 字段已存在，跳过');
      }

      // 3. 添加 userStatus 字段 (用户状态枚举)
      if (!tableInfo.userStatus) {
        console.log('➕ 添加 userStatus 字段...');
        await queryInterface.addColumn('Users', 'userStatus', {
          type: Sequelize.ENUM('active', 'expired', 'disabled', 'quota_exceeded'),
          defaultValue: 'active',
          allowNull: false,
          comment: '用户状态: active-正常, expired-过期, disabled-禁用, quota_exceeded-流量超限'
        }, { transaction });
        console.log('✅ userStatus 字段添加成功');
      } else {
        console.log('⏭️ userStatus 字段已存在，跳过');
      }

      // 4. 检查并确保 trafficQuota 字段存在 (应该已经存在)
      if (!tableInfo.trafficQuota) {
        console.log('⚠️ trafficQuota 字段不存在，添加中...');
        await queryInterface.addColumn('Users', 'trafficQuota', {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: '流量配额 (GB) - null表示无限制'
        }, { transaction });
        console.log('✅ trafficQuota 字段添加成功');
      } else {
        console.log('✅ trafficQuota 字段已存在');
      }

      // 5. 创建索引以提高查询性能
      console.log('📊 创建索引...');
      
      const indexesToCreate = [
        {
          name: 'idx_users_used_traffic',
          fields: ['usedTraffic'],
          options: { name: 'idx_users_used_traffic', transaction }
        },
        {
          name: 'idx_users_traffic_quota',
          fields: ['trafficQuota'],
          options: { name: 'idx_users_traffic_quota', transaction }
        },
        {
          name: 'idx_users_status',
          fields: ['userStatus'],
          options: { name: 'idx_users_status', transaction }
        },
        {
          name: 'idx_users_active_status',
          fields: ['isActive', 'userStatus'],
          options: { name: 'idx_users_active_status', transaction }
        }
        // 🔧 移除对不存在的 expiryDate 字段的索引
      ];

      for (const index of indexesToCreate) {
        try {
          await queryInterface.addIndex('Users', index.fields, index.options);
          console.log(`✅ 索引 ${index.name} 创建成功`);
        } catch (error) {
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.log(`⏭️ 索引 ${index.name} 已存在，跳过`);
          } else {
            console.warn(`⚠️ 创建索引 ${index.name} 失败:`, error.message);
          }
        }
      }

      // 6. 更新现有用户的状态
      console.log('🔄 更新现有用户状态...');
      
      // 🔧 修复：使用 SQL 更新用户状态（移除不存在的 expiryDate 字段）
      await queryInterface.sequelize.query(`
        UPDATE Users SET userStatus =
          CASE
            WHEN isActive = 0 THEN 'disabled'
            WHEN trafficQuota IS NOT NULL AND usedTraffic >= (trafficQuota * 1073741824) THEN 'quota_exceeded'
            ELSE 'active'
          END
      `, { transaction });

      console.log('✅ 用户状态更新完成');

      // 7. 验证迁移结果
      console.log('🔍 验证迁移结果...');
      
      const [results] = await queryInterface.sequelize.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN userStatus = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN userStatus = 'disabled' THEN 1 ELSE 0 END) as disabled,
          SUM(CASE WHEN userStatus = 'expired' THEN 1 ELSE 0 END) as expired,
          SUM(CASE WHEN userStatus = 'quota_exceeded' THEN 1 ELSE 0 END) as quota_exceeded
        FROM Users
      `, { transaction });

      const stats = results[0];
      console.log('📊 用户状态统计:');
      console.log(`   总用户数: ${stats.total}`);
      console.log(`   正常用户: ${stats.active}`);
      console.log(`   禁用用户: ${stats.disabled}`);
      console.log(`   过期用户: ${stats.expired}`);
      console.log(`   超限用户: ${stats.quota_exceeded}`);

      await transaction.commit();
      console.log('🎉 流量管理字段迁移完成！');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ 迁移失败:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 开始回滚流量管理字段迁移...');

      // 删除索引
      const indexesToRemove = [
        'idx_users_used_traffic',
        'idx_users_traffic_quota', 
        'idx_users_status',
        'idx_users_active_status',
        'idx_users_expiry_date'
      ];

      for (const indexName of indexesToRemove) {
        try {
          await queryInterface.removeIndex('Users', indexName, { transaction });
          console.log(`✅ 索引 ${indexName} 删除成功`);
        } catch (error) {
          console.warn(`⚠️ 删除索引 ${indexName} 失败:`, error.message);
        }
      }

      // 删除字段 (保留 trafficQuota，因为它可能是原有字段)
      const fieldsToRemove = ['usedTraffic', 'lastTrafficReset', 'userStatus'];
      
      for (const fieldName of fieldsToRemove) {
        try {
          await queryInterface.removeColumn('Users', fieldName, { transaction });
          console.log(`✅ 字段 ${fieldName} 删除成功`);
        } catch (error) {
          console.warn(`⚠️ 删除字段 ${fieldName} 失败:`, error.message);
        }
      }

      await transaction.commit();
      console.log('✅ 迁移回滚完成');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ 迁移回滚失败:', error);
      throw error;
    }
  }
};
