const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class UserForwardRule extends Model {
    static associate(models) {
      // 定义关联
      UserForwardRule.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
        onDelete: 'CASCADE'
      });
    }

    // 验证IPv4地址格式
    static isValidIPv4(ip) {
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4Regex.test(ip)) return false;
      
      const parts = ip.split('.');
      return parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
    }

    // 验证IPv6地址格式
    static isValidIPv6(ip) {
      const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
      return ipv6Regex.test(ip);
    }

    // 验证目标地址格式
    static isValidTargetAddress(address) {
      // IPv4:port 格式
      const ipv4PortRegex = /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/;
      if (ipv4PortRegex.test(address)) {
        const [ip, port] = address.split(':');
        const portNum = parseInt(port, 10);
        return this.isValidIPv4(ip) && portNum >= 1 && portNum <= 65535;
      }

      // [IPv6]:port 格式
      const ipv6PortRegex = /^\[([0-9a-fA-F:]+)\]:\d{1,5}$/;
      if (ipv6PortRegex.test(address)) {
        const match = address.match(ipv6PortRegex);
        const ip = match[1];
        const port = address.split(']:')[1];
        const portNum = parseInt(port, 10);
        return this.isValidIPv6(ip) && portNum >= 1 && portNum <= 65535;
      }

      return false;
    }

    // 获取目标IP和端口
    getTargetIPAndPort() {
      if (!this.targetAddress) return null;

      // IPv4:port 格式
      if (this.targetAddress.includes('.') && !this.targetAddress.includes('[')) {
        const [ip, port] = this.targetAddress.split(':');
        return { ip, port: parseInt(port, 10) };
      }

      // [IPv6]:port 格式
      if (this.targetAddress.includes('[')) {
        const match = this.targetAddress.match(/^\[([0-9a-fA-F:]+)\]:(\d+)$/);
        if (match) {
          return { ip: match[1], port: parseInt(match[2], 10) };
        }
      }

      return null;
    }
  }

  UserForwardRule.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      comment: '用户ID'
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        len: [1, 100],
        notEmpty: true
      },
      comment: '转发规则名称'
    },
    sourcePort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 65535,
        isInt: true
      },
      comment: '转发源端口'
    },
    targetAddress: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        isValidAddress(value) {
          if (!UserForwardRule.isValidTargetAddress(value)) {
            throw new Error('目标地址格式必须为 IPv4:port 或 [IPv6]:port，例如：192.168.1.1:8080 或 [::1]:8080');
          }
        }
      },
      comment: '目标地址 (IP:端口)'
    },
    protocol: {
      type: DataTypes.ENUM('tcp', 'udp', 'tls'),
      defaultValue: 'tcp',
      allowNull: false,
      comment: '转发协议'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: '是否启用'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: [0, 500]
      },
      comment: '规则描述'
    }
  }, {
    sequelize,
    modelName: 'UserForwardRule',
    tableName: 'UserForwardRules',
    timestamps: true,
    indexes: [
      {
        fields: ['userId'],
        name: 'idx_user_forward_rules_user_id'
      },
      {
        fields: ['sourcePort'],
        name: 'idx_user_forward_rules_source_port'
      },
      {
        unique: true,
        fields: ['userId', 'sourcePort'],
        name: 'uk_user_forward_rules_user_port'
      }
    ],
    hooks: {
      beforeValidate: async (rule, options) => {
        // 验证用户是否存在
        if (rule.userId) {
          const { User } = sequelize.models;
          const user = await User.findByPk(rule.userId);
          if (!user) {
            throw new Error('用户不存在');
          }

          // 检查用户是否过期（非管理员）
          if (user.role !== 'admin' && user.isExpired()) {
            throw new Error('用户已过期，无法创建或修改转发规则');
          }

          // 检查端口是否在用户允许的范围内（非管理员）
          if (user.role !== 'admin' && !user.isPortInRange(rule.sourcePort)) {
            throw new Error(`端口 ${rule.sourcePort} 不在用户允许的端口范围内 (${user.portRangeStart}-${user.portRangeEnd})`);
          }
        }
      },
      beforeCreate: async (rule, options) => {
        // 检查端口是否已被同一用户使用
        const existingRule = await UserForwardRule.findOne({
          where: {
            userId: rule.userId,
            sourcePort: rule.sourcePort
          }
        });

        if (existingRule) {
          throw new Error(`端口 ${rule.sourcePort} 已被使用`);
        }
      },
      beforeUpdate: async (rule, options) => {
        // 如果更新了端口，检查是否冲突
        if (rule.changed('sourcePort')) {
          const existingRule = await UserForwardRule.findOne({
            where: {
              userId: rule.userId,
              sourcePort: rule.sourcePort,
              id: { [sequelize.Sequelize.Op.ne]: rule.id }
            }
          });

          if (existingRule) {
            throw new Error(`端口 ${rule.sourcePort} 已被使用`);
          }
        }
      }
    }
  });

  return UserForwardRule;
};
