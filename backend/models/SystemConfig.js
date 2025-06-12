/**
 * 系统配置模型
 * 存储GOST性能参数和系统模式配置
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SystemConfig = sequelize.define('SystemConfig', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    
    // 系统模式
    isSimpleMode: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: '是否启用单击模式 (禁用所有自动化功能)'
    },
    
    // GOST插件超时配置 (秒)
    authTimeout: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      comment: '认证器超时时间 (秒)'
    },
    
    observerTimeout: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
      comment: '观察器超时时间 (秒)'
    },
    
    limiterTimeout: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      comment: '限制器超时时间 (秒)'
    },
    
    // 缓存配置 (毫秒)
    authCacheTimeout: {
      type: DataTypes.INTEGER,
      defaultValue: 600000, // 10分钟
      comment: '认证器缓存超时时间 (毫秒)'
    },
    
    limiterCacheTimeout: {
      type: DataTypes.INTEGER,
      defaultValue: 300000, // 5分钟
      comment: '限制器缓存超时时间 (毫秒)'
    },
    
    multiInstanceCacheTTL: {
      type: DataTypes.INTEGER,
      defaultValue: 120000, // 2分钟
      comment: '多实例缓存TTL (毫秒)'
    },
    
    // 同步频率配置 (毫秒)
    autoSyncInterval: {
      type: DataTypes.INTEGER,
      defaultValue: 300000, // 5分钟
      comment: '自动同步间隔 (毫秒)'
    },
    
    minSyncInterval: {
      type: DataTypes.INTEGER,
      defaultValue: 10000, // 10秒
      comment: '最小同步间隔 (毫秒)'
    },
    
    cacheCoordinatorSyncInterval: {
      type: DataTypes.INTEGER,
      defaultValue: 30000, // 30秒
      comment: '缓存协调器同步间隔 (毫秒)'
    },
    
    healthCheckInterval: {
      type: DataTypes.INTEGER,
      defaultValue: 120000, // 2分钟
      comment: '健康检查间隔 (毫秒)'
    },
    
    multiInstanceSyncInterval: {
      type: DataTypes.INTEGER,
      defaultValue: 30000, // 30秒
      comment: '多实例同步间隔 (毫秒)'
    },
    
    // 配置版本 (用于检测配置变更)
    configVersion: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: '配置版本号'
    },
    
    // 最后更新信息
    lastUpdatedBy: {
      type: DataTypes.INTEGER,
      comment: '最后更新的管理员ID'
    },
    
    lastUpdatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: '最后更新时间'
    },
    
    // 配置说明
    description: {
      type: DataTypes.TEXT,
      comment: '配置变更说明'
    }
    
  }, {
    tableName: 'system_configs',
    timestamps: true,
    comment: '系统配置表 - 存储GOST性能参数和系统模式'
  });

  // 获取当前系统配置
  SystemConfig.getCurrentConfig = async function() {
    let config = await this.findOne({
      order: [['id', 'DESC']]
    });
    
    if (!config) {
      // 创建默认配置
      config = await this.create({
        description: '系统默认配置'
      });
    }
    
    return config;
  };
  
  // 更新系统配置
  SystemConfig.updateConfig = async function(newConfig, adminId, description = '') {
    const currentConfig = await this.getCurrentConfig();
    
    // 更新配置
    await currentConfig.update({
      ...newConfig,
      configVersion: currentConfig.configVersion + 1,
      lastUpdatedBy: adminId,
      lastUpdatedAt: new Date(),
      description: description || '配置更新'
    });
    
    return currentConfig;
  };
  
  // 检查是否为单击模式
  SystemConfig.isSimpleMode = async function() {
    const config = await this.getCurrentConfig();
    return config.isSimpleMode;
  };
  
  // 获取GOST插件配置
  SystemConfig.getGostPluginConfig = async function() {
    const config = await this.getCurrentConfig();
    
    return {
      authTimeout: `${config.authTimeout}s`,
      observerTimeout: `${config.observerTimeout}s`,
      limiterTimeout: `${config.limiterTimeout}s`
    };
  };
  
  // 获取缓存配置
  SystemConfig.getCacheConfig = async function() {
    const config = await this.getCurrentConfig();
    
    return {
      authCacheTimeout: config.authCacheTimeout,
      limiterCacheTimeout: config.limiterCacheTimeout,
      multiInstanceCacheTTL: config.multiInstanceCacheTTL
    };
  };
  
  // 获取同步配置
  SystemConfig.getSyncConfig = async function() {
    const config = await this.getCurrentConfig();
    
    return {
      autoSyncInterval: config.autoSyncInterval,
      minSyncInterval: config.minSyncInterval,
      cacheCoordinatorSyncInterval: config.cacheCoordinatorSyncInterval,
      healthCheckInterval: config.healthCheckInterval,
      multiInstanceSyncInterval: config.multiInstanceSyncInterval
    };
  };

  return SystemConfig;
};
