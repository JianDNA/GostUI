'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 为用户表添加端口范围字段
    try {
      await queryInterface.addColumn('Users', 'portRangeStart', {
        type: Sequelize.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 65535
        },
        comment: '用户端口范围起始端口'
      });
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('Column portRangeStart already exists, skipping...');
      } else {
        throw error;
      }
    }

    try {
      await queryInterface.addColumn('Users', 'portRangeEnd', {
        type: Sequelize.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 65535
        },
        comment: '用户端口范围结束端口'
      });
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('Column portRangeEnd already exists, skipping...');
      } else {
        throw error;
      }
    }

    // 添加额外端口字段
    try {
      await queryInterface.addColumn('Users', 'additionalPorts', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '用户额外可用端口列表 (JSON格式)'
      });
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('Column additionalPorts already exists, skipping...');
      } else {
        throw error;
      }
    }

    // 为用户表添加过期时间字段
    try {
      await queryInterface.addColumn('Users', 'expiryDate', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '用户转发服务过期时间'
      });
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('Column expiryDate already exists, skipping...');
      } else {
        throw error;
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Users', 'portRangeStart');
    await queryInterface.removeColumn('Users', 'portRangeEnd');
    await queryInterface.removeColumn('Users', 'expiryDate');
  }
};
