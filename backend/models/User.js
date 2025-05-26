const { Model, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  class User extends Model {
    static associate(models) {
      // 定义关联
      User.hasMany(models.Rule, {
        foreignKey: 'userId',
        as: 'rules',
        onDelete: 'CASCADE'
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
      unique: true,
      validate: {
        isEmail: true
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
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 10240,
        isValidQuota(value) {
          if (value !== null && (value < 1 || value > 10240)) {
            throw new Error('流量限额必须在1-10240GB之间');
          }
        }
      }
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'Users',
    timestamps: true
  });

  return User;
}; 