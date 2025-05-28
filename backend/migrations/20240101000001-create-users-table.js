'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 检查表是否已存在
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.includes('Users')
    );

    if (!tableExists) {
      await queryInterface.createTable('Users', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        username: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
          validate: {
            len: [3, 30]
          }
        },
        password: {
          type: Sequelize.STRING,
          allowNull: false
        },
        email: {
          type: Sequelize.STRING,
          allowNull: true,
          unique: true,
          validate: {
            isEmail: true
          }
        },
        role: {
          type: Sequelize.ENUM('admin', 'user'),
          defaultValue: 'user',
          allowNull: false
        },
        portRange: {
          type: Sequelize.STRING,
          allowNull: true,
          validate: {
            isValidPortRange(value) {
              if (!value) return; // 允许为空

              // 检查格式是否为 "number-number"
              if (!/^\d+-\d+$/.test(value)) {
                throw new Error('端口范围格式必须为 "起始端口-结束端口"');
              }

              const [start, end] = value.split('-').map(Number);

              // 检查端口范围
              if (start < 10001 || start > 65535 || end < 10001 || end > 65535) {
                throw new Error('端口必须在 10001-65535 之间');
              }

              // 检查起始端口是否小于结束端口
              if (start >= end) {
                throw new Error('起始端口必须小于结束端口');
              }
            }
          }
        },
        token: {
          type: Sequelize.STRING,
          allowNull: true
        },
        isActive: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          allowNull: false
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });

      console.log('Users table created successfully');

      // 创建默认管理员用户
      const bcrypt = require('bcryptjs');
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync('admin123', salt);

      await queryInterface.bulkInsert('Users', [{
        username: 'admin',
        password: hashedPassword,
        email: 'admin@example.com',
        role: 'admin',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }]);

      console.log('Default admin user created: admin/admin123');
    } else {
      console.log('Users table already exists, skipping creation...');
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Users');
  }
};
