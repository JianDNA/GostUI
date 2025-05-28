'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 检查表是否已存在
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.includes('UserForwardRules')
    );

    if (!tableExists) {
      await queryInterface.createTable('UserForwardRules', {
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
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: '用户ID'
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '转发规则名称'
        },
        sourcePort: {
          type: Sequelize.INTEGER,
          allowNull: false,
          validate: {
            min: 1,
            max: 65535
          },
          comment: '转发源端口'
        },
        targetAddress: {
          type: Sequelize.STRING(255),
          allowNull: false,
          validate: {
            isValidAddress(value) {
              // IPv4:port 或 [IPv6]:port 格式验证
              const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/;
              const ipv6Pattern = /^\[([0-9a-fA-F:]+)\]:\d{1,5}$/;
              
              if (!ipv4Pattern.test(value) && !ipv6Pattern.test(value)) {
                throw new Error('目标地址格式必须为 IPv4:port 或 [IPv6]:port');
              }
            }
          },
          comment: '目标地址 (IP:端口)'
        },
        protocol: {
          type: Sequelize.ENUM('tcp', 'udp', 'tls'),
          defaultValue: 'tcp',
          allowNull: false,
          comment: '转发协议'
        },
        isActive: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          allowNull: false,
          comment: '是否启用'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '规则描述'
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

      console.log('UserForwardRules table created successfully');
    } else {
      console.log('UserForwardRules table already exists, skipping creation...');
    }

    // 创建索引（如果不存在）
    try {
      await queryInterface.addIndex('UserForwardRules', ['userId'], {
        name: 'idx_user_forward_rules_user_id'
      });
      console.log('Index idx_user_forward_rules_user_id created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('Index idx_user_forward_rules_user_id already exists, skipping...');
      } else {
        throw error;
      }
    }

    try {
      await queryInterface.addIndex('UserForwardRules', ['sourcePort'], {
        name: 'idx_user_forward_rules_source_port'
      });
      console.log('Index idx_user_forward_rules_source_port created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('Index idx_user_forward_rules_source_port already exists, skipping...');
      } else {
        throw error;
      }
    }

    // 创建唯一约束：同一用户的源端口不能重复
    try {
      await queryInterface.addIndex('UserForwardRules', ['userId', 'sourcePort'], {
        unique: true,
        name: 'uk_user_forward_rules_user_port'
      });
      console.log('Unique index uk_user_forward_rules_user_port created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('Unique index uk_user_forward_rules_user_port already exists, skipping...');
      } else {
        throw error;
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('UserForwardRules');
  }
};
