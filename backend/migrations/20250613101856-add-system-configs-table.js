'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SystemConfigs', {
      key: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
        comment: '配置键名'
      },
      value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '配置值（JSON格式）'
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: '配置描述'
      },
      category: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'general',
        comment: '配置分类'
      },
      updatedBy: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: '最后更新者'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // 创建默认配置
    await queryInterface.bulkInsert('SystemConfigs', [
      {
        key: 'disabledProtocols',
        value: JSON.stringify([]),
        description: '被禁用的转发协议列表',
        category: 'security',
        updatedBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('SystemConfigs');
  }
};
