/**
 * 系统配置模型
 * 存储GOST性能参数和系统模式配置
 */

const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class SystemConfig extends Model {
    static associate(models) {
      // 无关联关系
    }
  }

  SystemConfig.init({
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      comment: '配置键名'
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '配置值（JSON格式）'
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '配置描述'
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'general',
      comment: '配置分类'
    },
    updatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: '最后更新者'
    }
  }, {
    sequelize,
    modelName: 'SystemConfig',
    tableName: 'SystemConfigs',
    timestamps: true,
    hooks: {
      beforeValidate: (config) => {
        // 如果值是对象或数组，转换为JSON字符串
        if (config.value && typeof config.value === 'object') {
          config.value = JSON.stringify(config.value);
        }
      }
    }
  });

  // 获取配置值（自动解析JSON）
  SystemConfig.getValue = async function(key, defaultValue = null) {
    const config = await this.findByPk(key);
    if (!config) return defaultValue;
    
    try {
      return JSON.parse(config.value);
    } catch (error) {
      return config.value;
    }
  };

  // 设置配置值（自动转换为JSON）
  SystemConfig.setValue = async function(key, value, options = {}) {
    const { description, category, updatedBy } = options;
    
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    const [config] = await this.findOrCreate({
      where: { key },
      defaults: {
        value: stringValue,
        description,
        category,
        updatedBy
      }
    });
    
    if (config.value !== stringValue || 
        (description && config.description !== description) || 
        (category && config.category !== category) ||
        (updatedBy && config.updatedBy !== updatedBy)) {
      
      await config.update({
        value: stringValue,
        ...(description ? { description } : {}),
        ...(category ? { category } : {}),
        ...(updatedBy ? { updatedBy } : {})
      });
    }
    
    return config;
  };

  return SystemConfig;
};
