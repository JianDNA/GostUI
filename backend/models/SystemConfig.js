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
    console.log(`🔧 [SystemConfig] 获取配置 ${key}...`);

    const config = await this.findByPk(key);
    if (!config) {
      console.log(`⚠️ [SystemConfig] 配置 ${key} 不存在，返回默认值:`, defaultValue);
      return defaultValue;
    }

    console.log(`🔧 [SystemConfig] 找到配置 ${key}:`, {
      rawValue: config.value,
      type: typeof config.value
    });

    try {
      const parsedValue = JSON.parse(config.value);
      console.log(`✅ [SystemConfig] 配置 ${key} 解析成功:`, {
        rawValue: config.value,
        parsedValue,
        parsedType: typeof parsedValue
      });
      return parsedValue;
    } catch (error) {
      console.log(`⚠️ [SystemConfig] 配置 ${key} JSON解析失败，返回原始值:`, {
        rawValue: config.value,
        error: error.message
      });
      return config.value;
    }
  };

  // 设置配置值（自动转换为JSON）
  SystemConfig.setValue = async function(key, value, options = {}) {
    const { description, category, updatedBy } = options;

    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    console.log(`🔧 [SystemConfig] 设置配置 ${key}:`, {
      originalValue: value,
      originalType: typeof value,
      stringValue,
      options
    });

    const [config, created] = await this.findOrCreate({
      where: { key },
      defaults: {
        value: stringValue,
        description,
        category,
        updatedBy
      }
    });

    console.log(`🔧 [SystemConfig] ${created ? '创建' : '找到'}配置记录:`, {
      key,
      currentValue: config.value,
      newValue: stringValue,
      needsUpdate: config.value !== stringValue
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

      console.log(`✅ [SystemConfig] 配置 ${key} 更新完成:`, {
        oldValue: config.value,
        newValue: stringValue
      });
    } else {
      console.log(`ℹ️ [SystemConfig] 配置 ${key} 无需更新`);
    }

    return config;
  };

  return SystemConfig;
};
