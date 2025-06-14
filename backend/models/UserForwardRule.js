const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class UserForwardRule extends Model {
    static associate(models) {
      // 定义关联 - 规则属于用户
      // 注意：belongsTo 关联不应该设置 onDelete，这由数据库外键约束处理
      UserForwardRule.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
        // 移除 onDelete: 'CASCADE' - 这在 belongsTo 中是危险的
        // 级联删除应该由数据库外键约束处理，而不是 Sequelize 关联
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

      try {
      // IPv4:port 格式
      if (this.targetAddress.includes('.') && !this.targetAddress.includes('[')) {
          // 处理可能包含多个点的情况（如127.0.0.1:8080）
          const lastColonIndex = this.targetAddress.lastIndexOf(':');
          if (lastColonIndex === -1) return null;
          
          const ip = this.targetAddress.substring(0, lastColonIndex);
          const port = parseInt(this.targetAddress.substring(lastColonIndex + 1), 10);
          
          return { ip, port };
      }

      // [IPv6]:port 格式
      if (this.targetAddress.includes('[')) {
        const match = this.targetAddress.match(/^\[([0-9a-fA-F:]+)\]:(\d+)$/);
        if (match) {
          return { ip: match[1], port: parseInt(match[2], 10) };
        }
        }
        
        // 域名:端口格式
        if (this.targetAddress.includes(':')) {
          const lastColonIndex = this.targetAddress.lastIndexOf(':');
          const host = this.targetAddress.substring(0, lastColonIndex);
          const port = parseInt(this.targetAddress.substring(lastColonIndex + 1), 10);
          
          return { ip: host, port };
        }
      } catch (error) {
        console.error(`解析目标地址失败: ${this.targetAddress}`, error);
      }

      return null;
    }

    // 获取完整的监听地址（包含端口）
    getFullListenAddress() {
      const address = this.listenAddress || '127.0.0.1';
      const port = this.sourcePort;

      if (this.listenAddressType === 'ipv6') {
        // IPv6地址需要用方括号包围
        return `[${address}]:${port}`;
      } else {
        // IPv4地址直接拼接
        return `${address}:${port}`;
      }
    }

    // 获取GOST配置格式的监听地址
    getGostListenAddress() {
      const address = this.listenAddress || '127.0.0.1';
      const port = this.sourcePort;

      // 特殊处理：admin用户可以绑定到所有接口
      if (this.user && this.user.role === 'admin') {
        // 对admin用户使用0.0.0.0绑定所有接口，不做端口限制
        return `0.0.0.0:${port}`;
      }

      // GOST配置格式：对于本地地址可以省略IP部分
      if (address === '127.0.0.1' || address === '::1') {
        return `:${port}`;
      } else {
        if (this.listenAddressType === 'ipv6') {
          return `[${address}]:${port}`;
        } else {
          return `${address}:${port}`;
        }
      }
    }

    // 验证监听地址和类型的一致性
    validateListenAddressConsistency() {
      if (!this.listenAddress) return true;

      const net = require('net');
      const isIPv4 = net.isIPv4(this.listenAddress);
      const isIPv6 = net.isIPv6(this.listenAddress);

      if (this.listenAddressType === 'ipv4' && !isIPv4) {
        throw new Error('监听地址类型设置为IPv4，但地址不是有效的IPv4格式');
      }

      if (this.listenAddressType === 'ipv6' && !isIPv6) {
        throw new Error('监听地址类型设置为IPv6，但地址不是有效的IPv6格式');
      }

      return true;
    }

    /**
     * 计算规则是否应该激活（计算属性）
     * 这是唯一的 isActive 判断逻辑，替代了数据库字段
     * 包含所有检查：基本状态、过期时间、端口范围、流量配额
     * @returns {boolean} 规则是否应该激活
     */
    get isActive() {
      return this.getComputedIsActive();
    }

    /**
     * 计算规则是否应该激活（计算属性）
     * 这是一个同步方法，包含所有必要的检查
     * @returns {boolean} 规则是否应该激活
     */
    getComputedIsActive() {
      // 如果没有关联用户信息，无法进行状态检查，返回 false
      if (!this.user) {
        console.warn(`⚠️ 规则 ${this.name || this.id} 缺少用户关联信息，无法计算 isActive 状态`);
        return false;
      }

      const user = this.user;

      // 1. 检查用户基本状态
      if (!user.isActive || user.userStatus !== 'active') {
        return false;
      }

      // 2. 检查用户是否过期（Admin用户不受限制）
      if (user.role !== 'admin' && user.isExpired && user.isExpired()) {
        return false;
      }

      // 3. 检查端口是否在用户允许范围内（Admin用户不受限制）
      if (user.role !== 'admin' && user.isPortInRange && !user.isPortInRange(this.sourcePort)) {
        return false;
      }

      // 4. 检查流量配额（Admin用户不受限制）
      if (user.role !== 'admin' && user.isTrafficExceeded && user.isTrafficExceeded()) {
        return false;
      }

      return true;
    }

    /**
     * 异步检查规则是否应该激活（包含配额检查）
     * @returns {Promise<boolean>} 规则是否应该激活
     */
    async getComputedIsActiveAsync() {
      // 先进行同步检查
      if (!this.getComputedIsActive()) {
        return false;
      }

      // 如果没有用户信息，需要加载
      if (!this.user) {
        await this.reload({ include: [{ model: sequelize.models.User, as: 'user' }] });
      }

      // 检查配额状态
      try {
        const quotaManagementService = require('../services/quotaManagementService');
        const quotaCheck = await quotaManagementService.checkUserQuotaStatus(this.userId);
        return quotaCheck.allowed;
      } catch (error) {
        console.error('检查配额状态失败:', error);
        return true; // 配额检查失败时默认允许，避免误禁用
      }
    }

    /**
     * 重写 toJSON 方法，确保包含计算属性
     * @returns {Object} JSON 对象
     */
    toJSON() {
      const values = Object.assign({}, this.get());
      values.isActive = this.isActive;
      return values;
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
    ruleUUID: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: true,
      validate: {
        isUUID: 4,
        notEmpty: true
      },
      comment: '规则唯一标识符'
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
      unique: true, // 关键: 端口全局唯一
      validate: {
        min: 1,
        max: 65535,
        isInt: true
      },
      comment: '转发源端口 (全局唯一)'
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
    // isActive 字段已删除，改为计算属性
    // 这样可以避免数据库状态不一致的问题
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: [0, 500]
      },
      comment: '规则描述'
    },
    usedTraffic: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
      comment: '规则已使用流量 (字节)'
    },
    listenAddress: {
      type: DataTypes.STRING(45), // 足够容纳IPv6地址
      allowNull: true,
      defaultValue: '127.0.0.1',
      validate: {
        isValidListenAddress(value) {
          if (!value) return; // 允许为空，使用默认值

          const net = require('net');
          if (!net.isIP(value)) {
            throw new Error('监听地址必须是有效的IPv4或IPv6地址');
          }
        }
      },
      comment: '监听地址 (IPv4或IPv6)'
    },
    listenAddressType: {
      type: DataTypes.ENUM('ipv4', 'ipv6'),
      allowNull: false,
      defaultValue: 'ipv4',
      validate: {
        isValidType(value) {
          if (!['ipv4', 'ipv6'].includes(value)) {
            throw new Error('监听地址类型必须是 ipv4 或 ipv6');
          }
        }
      },
      comment: '监听地址类型'
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
      }
      // 注意: sourcePort 的唯一约束通过字段定义中的 unique: true 实现
      // 不需要复合唯一约束，因为端口是全局唯一的
    ],
    hooks: {
      beforeValidate: async (rule, options) => {
        // 验证监听地址和类型的一致性
        rule.validateListenAddressConsistency();

        // 如果没有设置监听地址，根据类型设置默认值
        if (!rule.listenAddress) {
          if (rule.listenAddressType === 'ipv6') {
            rule.listenAddress = '::1';
          } else {
            rule.listenAddress = '127.0.0.1';
          }
        }

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

          // 获取当前操作用户的角色（如果存在）
          const currentUserRole = global.currentRequestUser?.role;

          // 检查端口是否在用户允许的范围内（Admin 用户不受限制，或者当前操作用户是admin）
          if (!user.isPortInRange(rule.sourcePort) && user.role !== 'admin' && currentUserRole !== 'admin') {
              throw new Error(`端口 ${rule.sourcePort} 不在用户允许的端口范围内 (${user.portRangeStart}-${user.portRangeEnd})`);
          }
        }
      },
      beforeCreate: async (rule, options) => {
        // 检查端口是否已被任何用户使用 (全局唯一)
        const existingRule = await UserForwardRule.findOne({
          where: {
            sourcePort: rule.sourcePort
          }
        });

        if (existingRule) {
          throw new Error(`端口 ${rule.sourcePort} 已被用户 ${existingRule.userId} 使用`);
        }
      },
      beforeUpdate: async (rule, options) => {
        // 如果更新了端口，检查是否冲突 (全局唯一)
        if (rule.changed('sourcePort')) {
          const existingRule = await UserForwardRule.findOne({
            where: {
              sourcePort: rule.sourcePort,
              id: { [sequelize.Sequelize.Op.ne]: rule.id }
            }
          });

          if (existingRule) {
            throw new Error(`端口 ${rule.sourcePort} 已被用户 ${existingRule.userId} 使用`);
          }
        }
      }
    }
  });

  return UserForwardRule;
};
