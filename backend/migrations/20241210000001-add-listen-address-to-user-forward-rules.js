'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // 添加监听地址字段
      await queryInterface.addColumn('UserForwardRules', 'listenAddress', {
        type: Sequelize.STRING(45), // 足够容纳IPv6地址
        allowNull: true,
        defaultValue: '127.0.0.1',
        comment: '监听地址 (IPv4或IPv6)'
      });

      // 添加监听地址类型字段
      await queryInterface.addColumn('UserForwardRules', 'listenAddressType', {
        type: Sequelize.ENUM('ipv4', 'ipv6'),
        allowNull: false,
        defaultValue: 'ipv4',
        comment: '监听地址类型'
      });

      console.log('✅ 成功添加监听地址相关字段到 UserForwardRules 表');

    } catch (error) {
      console.error('❌ 添加监听地址字段失败:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // 删除监听地址类型字段
      await queryInterface.removeColumn('UserForwardRules', 'listenAddressType');
      
      // 删除监听地址字段
      await queryInterface.removeColumn('UserForwardRules', 'listenAddress');

      console.log('✅ 成功移除监听地址相关字段');

    } catch (error) {
      console.error('❌ 移除监听地址字段失败:', error);
      throw error;
    }
  }
};
