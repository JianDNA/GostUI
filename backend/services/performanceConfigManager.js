/**
 * 🚀 性能配置管理器
 * 
 * 功能:
 * 1. 从JSON文件加载配置到内存
 * 2. 提供高速内存读取接口
 * 3. 异步持久化配置变更
 * 4. 配置变更通知机制
 * 5. 预设配置管理
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class PerformanceConfigManager extends EventEmitter {
  constructor() {
    super();
    
    // 配置文件路径
    this.configPath = path.join(__dirname, '../config/system-performance.json');
    this.backupPath = path.join(__dirname, '../config/system-performance.backup.json');
    
    // 内存中的配置 (高速访问)
    this.config = null;
    
    // 异步写入队列
    this.writeQueue = [];
    this.isWriting = false;
    
    // 配置版本 (用于检测变更)
    this.configVersion = 0;
    
    console.log('🎯 [性能配置] 管理器初始化');
  }

  /**
   * 初始化配置管理器
   */
  async initialize() {
    try {
      console.log('📖 [性能配置] 加载配置文件...');
      
      // 从文件加载配置
      await this.loadConfig();
      
      console.log('✅ [性能配置] 配置加载完成');
      console.log(`🔧 [性能配置] 当前模式: ${this.config.systemMode.isSimpleMode ? '单机模式' : '自动模式'}`);

      return true;
    } catch (error) {
      console.error('❌ [性能配置] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 从文件加载配置到内存
   */
  async loadConfig() {
    try {
      // 检查配置文件是否存在
      const configExists = await this.fileExists(this.configPath);
      
      if (!configExists) {
        console.log('📝 [性能配置] 配置文件不存在，创建默认配置');
        await this.createDefaultConfig();
      }
      
      // 读取配置文件
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      // 验证配置完整性
      this.validateConfig();
      
      // 更新版本号
      this.configVersion++;
      
      console.log(`📊 [性能配置] 配置加载成功 (版本: ${this.configVersion})`);
      
    } catch (error) {
      console.error('❌ [性能配置] 加载配置失败:', error);
      
      // 尝试从备份恢复
      await this.restoreFromBackup();
    }
  }

  /**
   * 创建默认配置文件
   */
  async createDefaultConfig() {
    const defaultConfig = {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: "system",
      description: "系统默认配置",
      
      systemMode: {
        isSimpleMode: false,
        description: "单机模式 - 禁用所有自动化功能"
      },
      
      gostPlugins: {
        authTimeout: 5,
        observerTimeout: 10,
        limiterTimeout: 5,
        observerPeriod: 30,
        observerAsyncProcessing: true,
        disableQuotaEnforcement: false,
        disableConfigSync: false,
        batchDatabaseOperations: false,
        description: "GOST插件配置 (超时单位: 秒, 周期单位: 秒)"
      },
      
      cacheConfig: {
        authCacheTimeout: 600000,      // 10分钟
        limiterCacheTimeout: 300000,   // 5分钟
        multiInstanceCacheTTL: 120000, // 2分钟
        description: "缓存超时配置 (毫秒)"
      },
      
      syncConfig: {
        autoSyncInterval: 300000,              // 5分钟
        minSyncInterval: 10000,                // 10秒
        cacheCoordinatorSyncInterval: 30000,   // 30秒
        healthCheckInterval: 120000,           // 2分钟
        multiInstanceSyncInterval: 30000,      // 30秒
        description: "同步频率配置 (毫秒)"
      }
    };
    
    await fs.writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log('✅ [性能配置] 默认配置文件已创建');
  }

  /**
   * 验证配置完整性
   */
  validateConfig() {
    const requiredSections = ['systemMode', 'gostPlugins', 'cacheConfig', 'syncConfig'];
    
    for (const section of requiredSections) {
      if (!this.config[section]) {
        throw new Error(`配置缺少必需的部分: ${section}`);
      }
    }
    
    // 验证数值范围
    const { gostPlugins, cacheConfig, syncConfig } = this.config;
    
    if (gostPlugins.authTimeout < 1 || gostPlugins.authTimeout > 60) {
      throw new Error('认证器超时时间必须在1-60秒之间');
    }
    
    if (cacheConfig.authCacheTimeout < 60000 || cacheConfig.authCacheTimeout > 3600000) {
      throw new Error('认证器缓存时间必须在1-60分钟之间');
    }
    
    if (syncConfig.autoSyncInterval < 60000 || syncConfig.autoSyncInterval > 3600000) {
      throw new Error('自动同步间隔必须在1-60分钟之间');
    }
  }

  /**
   * 🚀 高速读取接口 - 直接从内存获取
   */
  
  // 获取系统模式
  isSimpleMode() {
    return this.config?.systemMode?.isSimpleMode || false;
  }
  
  // 获取GOST插件配置
  getGostPluginConfig() {
    const plugins = this.config?.gostPlugins || {};
    return {
      authTimeout: `${plugins.authTimeout || 5}s`,
      observerTimeout: `${plugins.observerTimeout || 10}s`,
      limiterTimeout: `${plugins.limiterTimeout || 5}s`,
      observerPeriod: `${plugins.observerPeriod || 30}s`,
      observerAsyncProcessing: plugins.observerAsyncProcessing !== false,
      disableQuotaEnforcement: plugins.disableQuotaEnforcement === true,
      disableConfigSync: plugins.disableConfigSync === true,
      batchDatabaseOperations: plugins.batchDatabaseOperations === true
    };
  }
  
  // 获取缓存配置
  getCacheConfig() {
    return this.config?.cacheConfig || {
      authCacheTimeout: 600000,
      limiterCacheTimeout: 300000,
      multiInstanceCacheTTL: 120000
    };
  }
  
  // 获取同步配置
  getSyncConfig() {
    return this.config?.syncConfig || {
      autoSyncInterval: 300000,
      minSyncInterval: 10000,
      cacheCoordinatorSyncInterval: 30000,
      healthCheckInterval: 120000,
      multiInstanceSyncInterval: 30000
    };
  }
  
  // 获取完整配置
  getFullConfig() {
    return { ...this.config };
  }

  /**
   * 🚀 配置更新接口 - 内存更新 + 异步持久化
   */
  async updateConfig(updates, updatedBy = 'admin', description = '') {
    try {
      console.log('🔄 [性能配置] 开始更新配置...');

      // 备份当前配置
      const oldConfig = { ...this.config };

      // 🔧 深度合并配置，支持部分更新
      this.config = this.deepMerge(this.config, {
        ...updates,
        lastUpdated: new Date().toISOString(),
        lastUpdatedBy: updatedBy,
        description: description || '配置更新'
      });

      // 🔧 自动更新相关配置（如果切换了系统模式）
      if (updates.systemMode?.isSimpleMode !== undefined) {
        this.autoUpdatePluginConfig(updates.systemMode.isSimpleMode);
      }

      // 验证新配置
      this.validateConfig();

      // 更新版本号
      this.configVersion++;

      console.log(`✅ [性能配置] 内存配置更新完成 (版本: ${this.configVersion})`);

      // 异步持久化到文件
      this.queueAsyncWrite();

      // 发出配置变更事件
      this.emit('configChanged', {
        oldConfig,
        newConfig: this.config,
        updates,
        version: this.configVersion
      });

      // 🚀 新增: 通知所有服务更新配置
      await this.notifyServicesConfigChanged(updates);

      return this.config;

    } catch (error) {
      console.error('❌ [性能配置] 更新配置失败:', error);
      throw error;
    }
  }

  /**
   * 🔧 深度合并对象
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * 🔧 自动更新插件配置（根据系统模式）
   */
  autoUpdatePluginConfig(isSimpleMode) {
    if (!this.config.gostPlugins) {
      this.config.gostPlugins = {};
    }

    if (isSimpleMode) {
      // 单机模式：启用性能优化
      this.config.gostPlugins.disableQuotaEnforcement = true;
      this.config.gostPlugins.disableConfigSync = true;
      this.config.gostPlugins.batchDatabaseOperations = true;
      console.log('🔧 [性能配置] 自动启用单机模式优化配置');
    } else {
      // 自动模式：禁用性能优化
      this.config.gostPlugins.disableQuotaEnforcement = false;
      this.config.gostPlugins.disableConfigSync = false;
      this.config.gostPlugins.batchDatabaseOperations = false;
      console.log('🔧 [性能配置] 自动恢复自动模式标准配置');
    }
  }

  /**
   * 异步写入队列管理
   */
  queueAsyncWrite() {
    this.writeQueue.push({
      config: { ...this.config },
      timestamp: Date.now()
    });
    
    // 如果没有正在写入，立即开始写入
    if (!this.isWriting) {
      this.processWriteQueue();
    }
  }

  /**
   * 处理写入队列
   */
  async processWriteQueue() {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }
    
    this.isWriting = true;
    
    try {
      // 获取最新的配置 (合并队列中的所有更新)
      const latestWrite = this.writeQueue[this.writeQueue.length - 1];
      this.writeQueue = []; // 清空队列
      
      // 创建备份
      await this.createBackup();
      
      // 写入配置文件
      await fs.writeFile(
        this.configPath, 
        JSON.stringify(latestWrite.config, null, 2), 
        'utf8'
      );
      
      console.log('💾 [性能配置] 配置已异步持久化到文件');
      
    } catch (error) {
      console.error('❌ [性能配置] 异步写入失败:', error);
    } finally {
      this.isWriting = false;
      
      // 如果队列中还有待写入的配置，继续处理
      if (this.writeQueue.length > 0) {
        setTimeout(() => this.processWriteQueue(), 1000);
      }
    }
  }

  /**
   * 创建配置备份
   */
  async createBackup() {
    try {
      const configExists = await this.fileExists(this.configPath);
      if (configExists) {
        await fs.copyFile(this.configPath, this.backupPath);
      }
    } catch (error) {
      console.warn('⚠️ [性能配置] 创建备份失败:', error.message);
    }
  }

  /**
   * 从备份恢复配置
   */
  async restoreFromBackup() {
    try {
      const backupExists = await this.fileExists(this.backupPath);
      
      if (backupExists) {
        console.log('🔄 [性能配置] 从备份恢复配置...');
        await fs.copyFile(this.backupPath, this.configPath);
        
        // 重新加载配置
        const configData = await fs.readFile(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
        
        console.log('✅ [性能配置] 从备份恢复成功');
      } else {
        console.log('📝 [性能配置] 备份不存在，创建默认配置');
        await this.createDefaultConfig();
        await this.loadConfig();
      }
    } catch (error) {
      console.error('❌ [性能配置] 从备份恢复失败:', error);
      throw error;
    }
  }

  /**
   * 应用预设配置
   */
  async applyPreset(presetName, updatedBy = 'admin', description = '') {
    try {
      // 重新读取配置文件以获取最新的预设
      const configData = await fs.readFile(this.configPath, 'utf8');
      const fullConfig = JSON.parse(configData);

      const preset = fullConfig.presets?.[presetName];
      if (!preset) {
        throw new Error(`预设配置不存在: ${presetName}`);
      }

      console.log(`🎯 [性能配置] 应用预设: ${preset.name}`);

      await this.updateConfig(
        preset.config,
        updatedBy,
        description || `应用预设配置: ${preset.name} - ${preset.description}`
      );

      return preset;
    } catch (error) {
      console.error('❌ [性能配置] 应用预设失败:', error);
      throw error;
    }
  }

  /**
   * 辅助方法
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 🚀 新增: 通知所有服务配置已变更
   */
  async notifyServicesConfigChanged(updates) {
    try {
      console.log('📢 [性能配置] 通知服务配置变更...');

      // 通知认证器服务
      if (updates.cacheConfig) {
        try {
          const gostAuthService = require('./gostAuthService');
          if (gostAuthService.updateCacheConfig) {
            gostAuthService.updateCacheConfig();
          }
        } catch (error) {
          console.warn('⚠️ 通知认证器服务失败:', error.message);
        }
      }

      // 通知同步协调器
      if (updates.syncConfig) {
        try {
          const gostSyncCoordinator = require('./gostSyncCoordinator');
          if (gostSyncCoordinator.updateSyncConfig) {
            gostSyncCoordinator.updateSyncConfig();
          }
        } catch (error) {
          console.warn('⚠️ 通知同步协调器失败:', error.message);
        }
      }

      // 通知缓存协调器
      if (updates.syncConfig) {
        try {
          const cacheCoordinator = require('./cacheCoordinator');
          if (cacheCoordinator.updateConfig) {
            cacheCoordinator.updateConfig();
          }
        } catch (error) {
          console.warn('⚠️ 通知缓存协调器失败:', error.message);
        }
      }

      // 通知健康检查服务
      if (updates.syncConfig) {
        try {
          const gostHealthService = require('./gostHealthService');
          if (gostHealthService.updateConfig) {
            gostHealthService.updateConfig();
          }
        } catch (error) {
          console.warn('⚠️ 通知健康检查服务失败:', error.message);
        }
      }

      // 通知多实例缓存服务
      if (updates.cacheConfig || updates.syncConfig) {
        try {
          const multiInstanceCacheService = require('./multiInstanceCacheService');
          if (multiInstanceCacheService.updateConfig) {
            multiInstanceCacheService.updateConfig();
          }
        } catch (error) {
          console.warn('⚠️ 通知多实例缓存服务失败:', error.message);
        }
      }

      // 🚀 新增: 触发GOST配置重新生成（如果GOST插件配置发生变化）
      if (updates.gostPlugins) {
        try {
          const gostSyncCoordinator = require('./gostSyncCoordinator');
          if (gostSyncCoordinator.requestSync) {
            await gostSyncCoordinator.requestSync({
              trigger: 'performance_config_update',
              force: true,
              priority: 2,
              description: `GOST插件配置更新，重新生成配置 (观察器周期: ${updates.gostPlugins.observerPeriod || '未指定'}秒)`
            });
            console.log(`🔄 [性能配置] 已触发GOST配置重新生成 (观察器周期: ${updates.gostPlugins.observerPeriod || '未指定'}秒)`);
          }
        } catch (error) {
          console.warn('⚠️ 触发GOST配置重新生成失败:', error.message);
        }
      }

      console.log('✅ [性能配置] 服务配置变更通知完成');
    } catch (error) {
      console.error('❌ [性能配置] 通知服务配置变更失败:', error);
    }
  }

  /**
   * 获取配置统计信息
   */
  getStats() {
    return {
      configVersion: this.configVersion,
      lastUpdated: this.config?.lastUpdated,
      lastUpdatedBy: this.config?.lastUpdatedBy,
      isSimpleMode: this.isSimpleMode(),
      writeQueueLength: this.writeQueue.length,
      isWriting: this.isWriting
    };
  }
}

// 创建单例实例
const performanceConfigManager = new PerformanceConfigManager();

module.exports = performanceConfigManager;
