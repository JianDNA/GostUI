const { Model, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  class User extends Model {
    static associate(models) {
      // 定义关联 - 用户拥有多个规则
      User.hasMany(models.Rule, {
        foreignKey: 'userId',
        as: 'rules',
        onDelete: 'CASCADE'  // ✅ 正确：删除用户时级联删除其规则
      });

      // 用户转发规则关联
      User.hasMany(models.UserForwardRule, {
        foreignKey: 'userId',
        as: 'forwardRules',
        onDelete: 'CASCADE'  // ✅ 正确：删除用户时级联删除其转发规则
      });


    }

    // 比较密码
    async comparePassword(candidatePassword) {
      try {
        console.log('Comparing passwords...');
        console.log('Stored hash:', this.password);
        console.log('Candidate password:', candidatePassword);

        const isMatch = await bcrypt.compare(candidatePassword, this.password);
        console.log('Password comparison result:', isMatch);
        return isMatch;
      } catch (error) {
        console.error('Password comparison error:', error);
        console.error('Error details:', {
          storedHash: this.password,
          candidatePassword,
          error: error.message
        });
        return false;
      }
    }

    async hashPassword(plainPassword) {
      try {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(plainPassword, salt);
      } catch (error) {
        console.error('Password hashing error:', error);
        throw error;
      }
    }

    // 检查用户是否过期
    isExpired() {
      if (!this.expiryDate) return false;
      return new Date() > new Date(this.expiryDate);
    }

    // 检查端口是否在用户允许的范围内
    isPortInRange(port) {
      // Admin 用户可以使用任意端口
      if (this.role === 'admin') {
        return true;
      }

      // 检查端口范围
      if (this.portRangeStart && this.portRangeEnd) {
        if (port >= this.portRangeStart && port <= this.portRangeEnd) {
          return true;
        }
      }

      // 检查额外端口列表
      const additionalPorts = this.getAdditionalPorts();
      return additionalPorts.includes(port);
    }

    // 获取额外端口列表
    getAdditionalPorts() {
      console.log(`[getAdditionalPorts] 用户 ${this.id} 的原始额外端口数据:`, this.additionalPorts);
      
      if (!this.additionalPorts) {
        console.log(`[getAdditionalPorts] 用户 ${this.id} 没有额外端口数据`);
        return [];
      }
      
      try {
        const parsed = JSON.parse(this.additionalPorts);
        console.log(`[getAdditionalPorts] 用户 ${this.id} 解析后的额外端口:`, parsed);
        
        if (Array.isArray(parsed)) {
          return parsed;
        } else {
          console.warn(`[getAdditionalPorts] 用户 ${this.id} 的额外端口不是数组格式:`, parsed);
          return [];
        }
      } catch (error) {
        console.warn(`[getAdditionalPorts] 用户 ${this.id} 的额外端口数据格式错误:`, error);
        return [];
      }
    }

    // 设置额外端口列表
    setAdditionalPorts(ports) {
      if (!Array.isArray(ports)) {
        throw new Error('额外端口必须是数组格式');
      }

      // 验证端口格式
      for (const port of ports) {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error(`无效的端口号: ${port}`);
        }
      }

      // 去重并排序
      const uniquePorts = [...new Set(ports)].sort((a, b) => a - b);
      this.additionalPorts = JSON.stringify(uniquePorts);
    }

    // 获取用户可用的端口列表
    getAvailablePorts() {
      const ports = [];

      // 添加端口范围内的端口
      if (this.portRangeStart && this.portRangeEnd) {
        for (let i = this.portRangeStart; i <= this.portRangeEnd; i++) {
          ports.push(i);
        }
      }

      // 添加额外端口
      const additionalPorts = this.getAdditionalPorts();
      ports.push(...additionalPorts);

      // 去重并排序
      return [...new Set(ports)].sort((a, b) => a - b);
    }

    // 获取端口配置摘要（用于显示）
    getPortSummary() {
      const summary = {
        range: null,
        additional: [],
        total: 0
      };

      if (this.portRangeStart && this.portRangeEnd) {
        summary.range = `${this.portRangeStart}-${this.portRangeEnd}`;
        summary.total += (this.portRangeEnd - this.portRangeStart + 1);
      }

      const additionalPorts = this.getAdditionalPorts();
      if (additionalPorts.length > 0) {
        summary.additional = additionalPorts;
        summary.total += additionalPorts.length;
      }

      return summary;
    }

    // 获取流量限额 (字节单位)
    getTrafficLimitBytes() {
      if (!this.trafficQuota || this.trafficQuota === 0) return 0;
      return this.trafficQuota * 1024 * 1024 * 1024; // GB 转换为字节
    }

    // 检查流量是否超限
    isTrafficExceeded() {
      const limitBytes = this.getTrafficLimitBytes();
      if (limitBytes === 0) return false; // 无限制
      return (this.usedTraffic || 0) >= limitBytes;
    }

    // 获取流量使用百分比
    getTrafficUsagePercent() {
      const limitBytes = this.getTrafficLimitBytes();
      if (limitBytes === 0) return 0; // 无限制
      return Math.min(((this.usedTraffic || 0) / limitBytes) * 100, 100);
    }

    // 获取剩余流量 (字节)
    getRemainingTrafficBytes() {
      const limitBytes = this.getTrafficLimitBytes();
      if (limitBytes === 0) return Infinity; // 无限制
      return Math.max(limitBytes - (this.usedTraffic || 0), 0);
    }

    // 检查用户是否可以使用服务
    canUseService() {
      // 检查是否激活
      if (!this.isActive) return false;

      // 检查是否过期
      if (this.isExpired()) return false;

      // 检查流量是否超限
      if (this.isTrafficExceeded()) return false;

      return true;
    }

    // 格式化流量显示
    static formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 重置流量使用量
    async resetTraffic() {
      this.usedTraffic = 0;
      this.lastTrafficReset = new Date();
      this.userStatus = 'active';
      await this.save();
    }


  }

  User.init({
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 30]
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value) {
        if (value) {
          console.log('Hashing password...');
          const salt = bcrypt.genSaltSync(10);
          const hash = bcrypt.hashSync(value, salt);
          console.log('Password hashed successfully');
          this.setDataValue('password', hash);
        }
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: {
        args: true,
        msg: '该邮箱已被使用',
        // 允许null值不触发唯一性检查
        ignoreDuplicates: true
      },
      validate: {
        isEmailOrEmpty(value) {
          if (!value) return; // 允许为空
          if (!/\S+@\S+\.\S+/.test(value)) {
            throw new Error('请输入有效的邮箱地址');
          }
        }
      }
    },
    role: {
      type: DataTypes.ENUM('admin', 'user'),
      defaultValue: 'user'
    },
    portRange: {
      type: DataTypes.STRING,
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
      type: DataTypes.STRING,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    trafficQuota: {
      type: DataTypes.DECIMAL(10, 3), // 改为DECIMAL支持小数，如0.1GB
      allowNull: true,
      validate: {
        min: 0.001, // 最小1MB = 0.001GB
        max: 10240,
        isValidQuota(value) {
          if (value !== null && (value < 0.001 || value > 10240)) {
            throw new Error('流量限额必须在0.001-10240GB之间');
          }
        }
      }
    },
    portRangeStart: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 65535
      },
      comment: '用户端口范围起始端口'
    },
    portRangeEnd: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 65535
      },
      comment: '用户端口范围结束端口'
    },
    additionalPorts: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '用户额外可用端口列表 (JSON格式)',
      validate: {
        isValidPortList(value) {
          if (!value) return; // 允许为空

          try {
            const ports = JSON.parse(value);
            if (!Array.isArray(ports)) {
              throw new Error('额外端口必须是数组格式');
            }

            for (const port of ports) {
              if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error(`无效的端口号: ${port}`);
              }
            }
          } catch (error) {
            if (error instanceof SyntaxError) {
              throw new Error('额外端口数据格式错误，必须是有效的JSON数组');
            }
            throw error;
          }
        }
      }
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '用户转发服务过期时间'
    },
    usedTraffic: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
      comment: '已使用流量 (字节)'
    },
    lastTrafficReset: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '流量重置时间'
    },
    userStatus: {
      type: DataTypes.ENUM('active', 'expired', 'disabled', 'quota_exceeded', 'suspended'),
      defaultValue: 'active',
      allowNull: false,
      comment: '用户状态: active-正常, expired-过期, disabled-禁用, quota_exceeded-流量超限, suspended-暂停'
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'Users',
    timestamps: true,
    hooks: {
      beforeValidate: (user) => {
        // 验证端口范围
        if (user.portRangeStart && user.portRangeEnd) {
          if (user.portRangeStart >= user.portRangeEnd) {
            throw new Error('起始端口必须小于结束端口');
          }
        }
      },
      beforeSave: (user) => {
        // 如果设置了新用户且没有过期时间，默认给一个月
        if (user.isNewRecord && !user.expiryDate && user.role === 'user') {
          const oneMonthLater = new Date();
          oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
          user.expiryDate = oneMonthLater;
        }
      }
    }
  });

  return User;
};
