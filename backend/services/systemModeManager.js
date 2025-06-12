/**
 * 🎛️ 系统模式管理器
 * 
 * 功能:
 * 1. 管理自动模式和单机模式的切换
 * 2. 在单机模式下禁用所有自动化功能
 * 3. 控制各种服务的启动和停止
 * 4. 提供手动同步接口
 */

const EventEmitter = require('events');

class SystemModeManager extends EventEmitter {
  constructor() {
    super();
    
    this.currentMode = 'auto'; // 'auto' | 'simple'
    this.services = new Map(); // 存储各种服务的引用
    this.isInitialized = false;
    
    console.log('🎛️ [系统模式] 管理器初始化');
  }

  /**
   * 初始化系统模式管理器
   */
  async initialize() {
    try {
      const performanceConfigManager = require('./performanceConfigManager');
      
      // 根据配置设置初始模式
      const isSimpleMode = performanceConfigManager.isSimpleMode();
      this.currentMode = isSimpleMode ? 'simple' : 'auto';
      
      console.log(`🎛️ [系统模式] 初始化完成，当前模式: ${this.currentMode === 'simple' ? '单机模式' : '自动模式'}`);

      // 根据模式启动或停止服务
      await this.applyMode(this.currentMode);

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('❌ [系统模式] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 切换系统模式
   */
  async switchMode(isSimpleMode) {
    const newMode = isSimpleMode ? 'simple' : 'auto';

    if (this.currentMode === newMode) {
      console.log(`🎛️ [系统模式] 已处于${newMode === 'simple' ? '单机模式' : '自动模式'}`);
      return;
    }

    console.log(`🔄 [系统模式] 切换模式: ${this.currentMode} → ${newMode}`);

    const oldMode = this.currentMode;
    this.currentMode = newMode;

    try {
      // 应用新模式
      await this.applyMode(newMode);

      // 发出模式切换事件
      this.emit('modeChanged', {
        oldMode,
        newMode,
        timestamp: new Date()
      });

      console.log(`✅ [系统模式] 成功切换到${newMode === 'simple' ? '单机模式' : '自动模式'}`);

    } catch (error) {
      console.error('❌ [系统模式] 切换模式失败:', error);
      // 回滚模式
      this.currentMode = oldMode;
      throw error;
    }
  }

  /**
   * 应用指定模式
   */
  async applyMode(mode) {
    if (mode === 'simple') {
      await this.enableSimpleMode();
    } else {
      await this.enableAutoMode();
    }
  }

  /**
   * 启用单机模式
   */
  async enableSimpleMode() {
    console.log('🔧 [系统模式] 启用单机模式，禁用所有自动化功能...');

    try {
      // 1. 停止GOST同步协调器
      await this.stopService('gostSyncCoordinator');

      // 2. 停止缓存协调器
      await this.stopService('cacheCoordinator');

      // 3. 停止健康检查服务
      await this.stopService('gostHealthService');

      // 4. 停止实时流量监控服务
      await this.stopService('realTimeTrafficMonitor');

      // 5. 🔧 修复：保留多实例缓存服务 (观察器需要端口用户映射)
      // 注意：不停止 multiInstanceCacheService，因为观察器需要它来获取端口用户映射
      console.log('🔧 [系统模式] 保留多实例缓存服务以支持观察器功能');
      // 不调用 await this.stopService('multiInstanceCacheService');

      // 5. 🔧 修复：保留流量统计相关服务，只禁用认证器和限制器
      await this.disableGostPluginsButKeepObserver();

      console.log('✅ [系统模式] 单机模式已启用');
      console.log('📝 [系统模式] 提示: 现在需要手动重启GOST服务来同步配置');
      console.log('📊 [系统模式] 流量统计功能已保留');

    } catch (error) {
      console.error('❌ [系统模式] 启用单机模式失败:', error);
      throw error;
    }
  }

  /**
   * 启用自动模式
   */
  async enableAutoMode() {
    console.log('🔧 [系统模式] 启用自动模式，恢复所有自动化功能...');
    
    try {
      // 1. 启用GOST插件
      await this.enableGostPlugins();
      
      // 2. 启动多实例缓存同步
      await this.startService('multiInstanceCacheService');
      
      // 3. 启动缓存协调器
      await this.startService('cacheCoordinator');
      
      // 4. 启动GOST同步协调器
      await this.startService('gostSyncCoordinator');
      
      // 5. 启动健康检查服务
      await this.startService('gostHealthService');

      // 6. 启动实时流量监控服务
      await this.startService('realTimeTrafficMonitor');

      console.log('✅ [系统模式] 自动模式已启用');
      
    } catch (error) {
      console.error('❌ [系统模式] 启用自动模式失败:', error);
      throw error;
    }
  }

  /**
   * 禁用GOST插件但保留观察器
   */
  async disableGostPluginsButKeepObserver() {
    try {
      console.log('🔧 [系统模式] 禁用认证器和限制器，保留观察器...');

      // 生成完整的GOST配置
      const gostConfigService = require('./gostConfigService');
      const config = await gostConfigService.generateGostConfig();

      // 🔧 修复: 单机模式下只禁用认证器和限制器，保留观察器
      if (config.services) {
        config.services.forEach(service => {
          delete service.auther;   // 禁用认证器
          delete service.limiter;  // 禁用限制器
          // 保留 service.observer 以支持流量统计
        });
      }

      // 🔧 关键修复: 确保全局观察器配置被保留
      if (!config.observers) {
        config.observers = [
          {
            name: "observer-0",
            plugin: {
              type: "http",
              addr: "http://localhost:3000/api/gost-plugin/observer",
              timeout: "10s"
            }
          }
        ];
      }

      // 🔧 保留API配置以支持热重载
      if (!config.api) {
        config.api = {
          addr: ":18080",
          pathPrefix: "/api",
          accesslog: false
        };
      }

      // 应用配置
      const gostService = require('./gostService');
      await gostService.updateConfig(config, { forceRestart: true });

      console.log('✅ [系统模式] 认证器和限制器已禁用，观察器已保留');

    } catch (error) {
      console.error('❌ [系统模式] 禁用GOST插件失败:', error);
      throw error;
    }
  }

  /**
   * 禁用GOST插件 (完全禁用，用于兼容性)
   */
  async disableGostPlugins() {
    try {
      console.log('🚫 [系统模式] 禁用所有GOST插件...');

      // 生成无插件的GOST配置
      const gostConfigService = require('./gostConfigService');
      const config = await gostConfigService.generateGostConfig();

      // 完全禁用所有插件
      if (config.services) {
        config.services.forEach(service => {
          delete service.auther;   // 禁用认证器
          delete service.limiter;  // 禁用限制器
          delete service.observer; // 禁用观察器
        });
      }

      // 移除全局观察器配置
      delete config.observers;

      // 移除API服务
      delete config.api;

      // 应用配置
      const gostService = require('./gostService');
      await gostService.updateConfig(config, { forceRestart: true });

      console.log('✅ [系统模式] 所有GOST插件已禁用');

    } catch (error) {
      console.error('❌ [系统模式] 禁用GOST插件失败:', error);
      throw error;
    }
  }

  /**
   * 启用GOST插件
   */
  async enableGostPlugins() {
    try {
      console.log('🔌 [系统模式] 启用GOST插件...');
      
      // 生成完整的GOST配置 (包含插件)
      const gostConfigService = require('./gostConfigService');
      const config = await gostConfigService.generateGostConfig();
      
      // 应用配置
      const gostService = require('./gostService');
      await gostService.updateConfig(config, { forceRestart: true });
      
      console.log('✅ [系统模式] GOST插件已启用');
      
    } catch (error) {
      console.error('❌ [系统模式] 启用GOST插件失败:', error);
      throw error;
    }
  }

  /**
   * 停止服务
   */
  async stopService(serviceName) {
    try {
      // 🔧 关键修复：在单机模式下不停止 multiInstanceCacheService
      if (serviceName === 'multiInstanceCacheService' && this.currentMode === 'simple') {
        console.log('🔧 [系统模式] 单机模式下保留多实例缓存服务以支持观察器');
        return;
      }

      let service;

      switch (serviceName) {
        case 'gostSyncCoordinator':
          service = require('./gostSyncCoordinator');
          if (service.stopAutoSync) {
            service.stopAutoSync();
          }
          break;

        case 'cacheCoordinator':
          service = require('./cacheCoordinator');
          if (service.stop) {
            service.stop();
          }
          break;

        case 'gostHealthService':
          service = require('./gostHealthService');
          if (service.stop) {
            service.stop();
          }
          break;

        case 'multiInstanceCacheService':
          service = require('./multiInstanceCacheService');
          if (service.stopSync) {
            service.stopSync();
          }
          break;

        case 'realTimeTrafficMonitor':
          service = require('./realTimeTrafficMonitor');
          if (service.stop) {
            service.stop();
          }
          break;
      }

      console.log(`🛑 [系统模式] 服务已停止: ${serviceName}`);

    } catch (error) {
      console.warn(`⚠️ [系统模式] 停止服务失败: ${serviceName}`, error.message);
    }
  }

  /**
   * 启动服务
   */
  async startService(serviceName) {
    try {
      let service;
      
      switch (serviceName) {
        case 'gostSyncCoordinator':
          service = require('./gostSyncCoordinator');
          if (service.startAutoSync) {
            service.startAutoSync();
          }
          break;
          
        case 'cacheCoordinator':
          service = require('./cacheCoordinator');
          if (service.initialize) {
            await service.initialize();
          }
          break;
          
        case 'gostHealthService':
          service = require('./gostHealthService');
          if (service.start) {
            service.start();
          }
          break;
          
        case 'multiInstanceCacheService':
          service = require('./multiInstanceCacheService');
          if (service.startSync) {
            service.startSync();
          }
          break;

        case 'realTimeTrafficMonitor':
          service = require('./realTimeTrafficMonitor');
          if (service.start) {
            service.start();
          }
          break;
      }
      
      console.log(`🚀 [系统模式] 服务已启动: ${serviceName}`);
      
    } catch (error) {
      console.warn(`⚠️ [系统模式] 启动服务失败: ${serviceName}`, error.message);
    }
  }

  /**
   * 手动同步GOST配置 (单机模式专用)
   */
  async manualSyncGost() {
    console.log('🔍 [DEBUG] manualSyncGost 被调用，当前模式:', this.currentMode);

    if (this.currentMode !== 'simple') {
      console.log('❌ [DEBUG] 不在单机模式下，抛出异常');
      throw new Error('手动同步仅在单机模式下可用');
    }

    try {
      console.log('🔄 [系统模式] 手动同步GOST配置...');
      
      // 生成新配置
      const gostConfigService = require('./gostConfigService');
      console.log('🔍 [DEBUG] 开始生成配置...');
      const config = await gostConfigService.generateGostConfig();
      console.log('🔍 [DEBUG] 配置生成完成');
      console.log('🔍 [DEBUG] 配置对象:', JSON.stringify(config, null, 2));

      console.log('🔍 [DEBUG] 生成的配置包含观察器:', !!config.observers);
      console.log('🔍 [DEBUG] 观察器配置:', config.observers);
      console.log('🔍 [DEBUG] 配置对象类型:', typeof config);
      console.log('🔍 [DEBUG] 配置对象键:', Object.keys(config));

      // 🔧 修复: 单机模式下保留观察器插件以支持流量统计
      if (config.services) {
        config.services.forEach(service => {
          delete service.auther;   // 禁用认证器
          delete service.limiter;  // 禁用限制器
          // 保留 service.observer 以支持流量统计
        });
      }

      // 🔧 关键修复: 确保全局观察器配置被保留
      if (!config.observers) {
        console.log('⚠️ [DEBUG] 配置中缺少观察器，手动添加...');
        config.observers = [
          {
            name: "observer-0",
            plugin: {
              type: "http",
              addr: "http://localhost:3000/api/gost-plugin/observer",
              timeout: "10s"
            }
          }
        ];
      } else {
        console.log('✅ [DEBUG] 配置中已包含观察器');
      }

      // 🔧 不删除API配置，保留完整配置结构
      
      // 🔧 修复: 先保存配置文件，然后重启GOST服务
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../config/gost-config.json');

      // 🔧 关键修复: 确保观察器配置被保留
      if (!config.observers) {
        console.log('⚠️ [DEBUG] 配置中缺少观察器，手动添加...');
        config.observers = [
          {
            name: "observer-0",
            plugin: {
              type: "http",
              addr: "http://localhost:3000/api/gost-plugin/observer",
              timeout: "10s"
            }
          }
        ];
      } else {
        console.log('✅ [DEBUG] 配置中已包含观察器');
      }

      // 添加API配置以支持热重载
      const configWithAPI = {
        ...config,
        api: {
          addr: ':18080',
          pathPrefix: '/api',
          accesslog: false
        }
      };

      // 保存配置文件
      fs.writeFileSync(configPath, JSON.stringify(configWithAPI, null, 2));
      console.log('✅ [系统模式] 配置文件已保存');

      // 硬重启GOST服务
      const gostService = require('./gostService');
      await gostService.forceRestart(true); // 使用配置文件重启
      
      console.log('✅ [系统模式] 手动同步完成');
      
      return {
        success: true,
        message: '手动同步完成',
        timestamp: new Date(),
        configServices: config.services?.length || 0
      };
      
    } catch (error) {
      console.error('❌ [系统模式] 手动同步失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前模式状态
   */
  getStatus() {
    return {
      currentMode: this.currentMode,
      isSimpleMode: this.currentMode === 'simple',
      isInitialized: this.isInitialized,
      services: {
        gostSyncCoordinator: this.currentMode === 'auto',
        cacheCoordinator: this.currentMode === 'auto',
        gostHealthService: this.currentMode === 'auto',
        multiInstanceCacheService: true, // 🔧 修复：单机模式下也保持运行以支持观察器
        gostPlugins: this.currentMode === 'auto'
      }
    };
  }

  /**
   * 检查是否为单机模式
   */
  isSimpleMode() {
    return this.currentMode === 'simple';
  }
}

// 创建单例实例
const systemModeManager = new SystemModeManager();

module.exports = systemModeManager;
