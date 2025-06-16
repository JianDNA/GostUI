'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 修改 trafficQuota 字段类型为 DECIMAL，支持小数配额
    await queryInterface.changeColumn('Users', 'trafficQuota', {
      type: Sequelize.DECIMAL(10, 3),
      allowNull: true,
      comment: '流量配额 (GB，支持小数如0.1GB=100MB)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // 回滚：改回 INTEGER 类型
    await queryInterface.changeColumn('Users', 'trafficQuota', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '流量配额 (GB)'
    });
  }
};
