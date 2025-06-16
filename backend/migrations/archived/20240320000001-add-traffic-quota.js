'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.addColumn('Users', 'trafficQuota', {
        type: Sequelize.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 10240
        }
      });
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('Column trafficQuota already exists, skipping...');
      } else {
        throw error;
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Users', 'trafficQuota');
  }
};
