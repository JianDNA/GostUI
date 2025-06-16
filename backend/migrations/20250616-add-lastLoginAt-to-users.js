'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 添加 lastLoginAt 字段
    await queryInterface.addColumn('Users', 'lastLoginAt', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '最后登录时间'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // 删除 lastLoginAt 字段
    await queryInterface.removeColumn('Users', 'lastLoginAt');
  }
};
