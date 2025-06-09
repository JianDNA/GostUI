/**
 * 数据库迁移: 创建时序数据表
 * 
 * 说明:
 * 1. 创建 traffic_hourly 表存储小时流量统计
 * 2. 创建 speed_minutely 表存储分钟网速记录
 * 3. 创建必要的索引优化查询性能
 * 4. 替代 InfluxDB，使用 SQLite 存储时序数据
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 开始创建时序数据表...');

      // 1. 创建小时流量统计表
      await queryInterface.createTable('traffic_hourly', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        port: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '端口号'
        },
        inputBytes: {
          type: Sequelize.BIGINT,
          defaultValue: 0,
          allowNull: false,
          comment: '输入字节数'
        },
        outputBytes: {
          type: Sequelize.BIGINT,
          defaultValue: 0,
          allowNull: false,
          comment: '输出字节数'
        },
        totalBytes: {
          type: Sequelize.BIGINT,
          defaultValue: 0,
          allowNull: false,
          comment: '总字节数'
        },
        recordHour: {
          type: Sequelize.STRING(13),
          allowNull: false,
          comment: '记录小时 (YYYY-MM-DD-HH)'
        },
        recordTime: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '记录时间'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        }
      }, { transaction });

      console.log('✅ traffic_hourly 表创建成功');

      // 2. 创建分钟网速记录表
      await queryInterface.createTable('speed_minutely', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        port: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '端口号'
        },
        inputRate: {
          type: Sequelize.FLOAT,
          defaultValue: 0,
          allowNull: false,
          comment: '输入速率 (bytes/second)'
        },
        outputRate: {
          type: Sequelize.FLOAT,
          defaultValue: 0,
          allowNull: false,
          comment: '输出速率 (bytes/second)'
        },
        totalRate: {
          type: Sequelize.FLOAT,
          defaultValue: 0,
          allowNull: false,
          comment: '总速率 (bytes/second)'
        },
        recordMinute: {
          type: Sequelize.STRING(16),
          allowNull: false,
          comment: '记录分钟 (YYYY-MM-DD-HH:MM)'
        },
        recordTime: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '记录时间'
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        }
      }, { transaction });

      console.log('✅ speed_minutely 表创建成功');

      // 3. 创建索引优化查询性能
      console.log('📊 创建索引...');

      // traffic_hourly 表索引
      const trafficIndexes = [
        {
          name: 'idx_traffic_hourly_user_time',
          table: 'traffic_hourly',
          fields: ['userId', 'recordTime']
        },
        {
          name: 'idx_traffic_hourly_user_hour',
          table: 'traffic_hourly',
          fields: ['userId', 'recordHour']
        },
        {
          name: 'idx_traffic_hourly_port',
          table: 'traffic_hourly',
          fields: ['port']
        },
        {
          name: 'idx_traffic_hourly_time',
          table: 'traffic_hourly',
          fields: ['recordTime']
        },
        {
          name: 'unique_user_port_hour',
          table: 'traffic_hourly',
          fields: ['userId', 'port', 'recordHour'],
          unique: true
        }
      ];

      // speed_minutely 表索引
      const speedIndexes = [
        {
          name: 'idx_speed_minutely_user_time',
          table: 'speed_minutely',
          fields: ['userId', 'recordTime']
        },
        {
          name: 'idx_speed_minutely_user_minute',
          table: 'speed_minutely',
          fields: ['userId', 'recordMinute']
        },
        {
          name: 'idx_speed_minutely_port',
          table: 'speed_minutely',
          fields: ['port']
        },
        {
          name: 'idx_speed_minutely_time',
          table: 'speed_minutely',
          fields: ['recordTime']
        },
        {
          name: 'unique_user_port_minute',
          table: 'speed_minutely',
          fields: ['userId', 'port', 'recordMinute'],
          unique: true
        }
      ];

      // 创建所有索引
      const allIndexes = [...trafficIndexes, ...speedIndexes];
      for (const index of allIndexes) {
        try {
          await queryInterface.addIndex(index.table, index.fields, {
            name: index.name,
            unique: index.unique || false,
            transaction
          });
          console.log(`✅ 索引 ${index.name} 创建成功`);
        } catch (error) {
          console.warn(`⚠️ 创建索引 ${index.name} 失败:`, error.message);
        }
      }

      await transaction.commit();
      console.log('🎉 时序数据表创建完成！');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ 创建时序数据表失败:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 开始删除时序数据表...');

      // 删除表 (索引会自动删除)
      await queryInterface.dropTable('speed_minutely', { transaction });
      console.log('✅ speed_minutely 表删除成功');

      await queryInterface.dropTable('traffic_hourly', { transaction });
      console.log('✅ traffic_hourly 表删除成功');

      await transaction.commit();
      console.log('✅ 时序数据表删除完成');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ 删除时序数据表失败:', error);
      throw error;
    }
  }
};
