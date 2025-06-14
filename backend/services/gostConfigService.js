/**
 * GOST配置服务
 * 
 * 负责生成、管理和同步GOST配置
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { models } = require('./dbService');
const { defaultLogger } = require('../utils/logger');
const { inspectObject } = require('../utils/debugHelper');
const { safeAsync, ConfigError, formatError } = require('../utils/errorHandler');

class GostConfigService {
  constructor() {
    this.configPath = path.join(__dirname, '../config/gost-config.json');
    this.syncLock = false;
    this.autoSyncInterval = null;
    
    // 确保配置目录存在
    this.ensureConfigDirectory();
  }

  /**
   * 确保配置目录存在
   */
  async ensureConfigDirectory() {
    const configDir = path.dirname(this.configPath);
    try {
      await fs.mkdir(configDir, { recursive: true });
      return true;
    } catch (error) {
      defaultLogger.error(`创建配置目录失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 生成 GOST 配置
   * 使用 safeAsync 包装以简化错误处理
   */
  generateGostConfig = safeAsync(async () => {
    defaultLogger.info('开始生成GOST配置...');
      
      // 查询规则
      let allRules = [];
      try {
      const { User, UserForwardRule } = models;
        allRules = await UserForwardRule.findAll({
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'role']
          }]
        });
        
      defaultLogger.info(`查询到 ${allRules.length} 条转发规则`);
      } catch (queryError) {
      defaultLogger.error(`查询转发规则失败: ${queryError ? queryError.message : '未知错误'}`);
      defaultLogger.error(`错误详情: ${inspectObject(queryError || {})}`);
      
      // 返回最小配置而不是抛出异常
      return this._createMinimalConfig();
      }
      
      // 转换规则格式并添加用户信息
      let formattedRules = [];
      try {
      // 确保allRules是数组
      if (!Array.isArray(allRules)) {
        defaultLogger.warn('查询结果不是数组，使用空数组');
        allRules = [];
      }
      
      formattedRules = allRules
        .map(rule => this._formatRule(rule))
        .filter(Boolean); // 过滤掉null值
      
      defaultLogger.info(`格式化了 ${formattedRules.length} 条有效规则`);
    } catch (formatError) {
      defaultLogger.error(`格式化规则失败: ${formatError ? formatError.message : '未知错误'}`);
      defaultLogger.error(`错误详情: ${inspectObject(formatError || {})}`);
      
      // 返回最小配置而不是抛出异常
      return this._createMinimalConfig();
    }

    try {
      // 生成统计信息
      this._generateRuleStats(formattedRules);

      // 从性能配置管理器获取插件配置
      const { pluginConfig, isSimpleMode } = this._getPluginConfig();
      
      // 获取禁用协议列表
      const disabledProtocols = await this._getDisabledProtocols();

      // 生成 Gost 配置
      const gostConfig = {
        services: [],
        chains: []
      };

      // 添加观察器插件以支持流量统计
      this._addObserverPlugin(gostConfig, pluginConfig);

      // 为每个转发规则创建服务和链
      this._createServicesAndChains(gostConfig, formattedRules, disabledProtocols, pluginConfig, isSimpleMode);

      defaultLogger.info(`🔧 配置生成完成，共 ${gostConfig.services.length} 个服务, ${gostConfig.chains.length} 个链`);
      return gostConfig;
    } catch (gostError) {
      defaultLogger.error(`生成GOST配置时发生错误: ${gostError ? gostError.message : '未知错误'}`);
      defaultLogger.error(`错误详情: ${inspectObject(gostError || {})}`);
      
      // 返回最小配置
      return this._createMinimalConfig();
    }
  }, {
    throwError: false,
    defaultValue: () => {
      return {
        services: [],
        chains: [],
        observers: [
          {
            name: "observer-0",
            plugin: {
              type: "http",
              addr: "http://localhost:3000/api/gost-plugin/observer",
              timeout: "10s"
            }
          }
        ],
        api: {
          addr: ":18080",
          pathPrefix: "/api",
          accesslog: false
        }
      };
    },
    logError: true
  });

  /**
   * 创建最小配置
   * @private
   */
  _createMinimalConfig() {
    return {
      services: [],
      chains: [],
      observers: [
        {
          name: "observer-0",
          plugin: {
            type: "http",
            addr: "http://localhost:3000/api/gost-plugin/observer",
            timeout: "10s"
          }
        }
      ],
      api: {
        addr: ":18080",
        pathPrefix: "/api",
        accesslog: false
      }
    };
  }

  /**
   * 格式化单个规则
   * @private
   */
  _formatRule(rule) {
    try {
      // 确保rule对象存在
      if (!rule) {
        defaultLogger.warn(`尝试格式化空规则，跳过`);
        return null;
      }
      
            const user = rule.user;
            if (!user) {
        defaultLogger.warn(`规则 ${rule.id || 'unknown'} 没有关联用户，跳过`);
              return null;
            }
            
            return {
              ruleId: rule.id,
              userId: user.id,
              username: user.username,
              isAdmin: user.role === 'admin',
              name: rule.name,
              description: rule.description || '',
              protocol: rule.protocol,
              sourcePort: rule.sourcePort,
              targetAddress: rule.targetAddress,
              listenAddress: rule.listenAddress || '0.0.0.0',
              listenAddressType: rule.listenAddressType || 'ipv4',
              getGostListenAddress: function() {
                if (this.listenAddressType === 'ipv6') {
                  return `[${this.listenAddress || '::'}]:${this.sourcePort}`;
                } else {
                  return `${this.listenAddress || '0.0.0.0'}:${this.sourcePort}`;
                }
              }
            };
    } catch (error) {
      // 安全获取rule.id，避免undefined错误
      const ruleId = rule ? (rule.id || 'unknown') : 'unknown';
      defaultLogger.error(`处理规则失败: ${ruleId}: ${error ? error.message : '未知错误'}`);
            return null;
          }
  }

  /**
   * 生成规则统计信息
   * @private
   */
  _generateRuleStats(formattedRules) {
    try {
      // 确保formattedRules是数组
      if (!Array.isArray(formattedRules)) {
        defaultLogger.warn('格式化规则不是数组，跳过统计生成');
        return;
      }

      const userRules = {};
        formattedRules.forEach(rule => {
        // 确保rule和rule.username存在
        if (!rule || !rule.username) {
          return; // 跳过无效规则
        }
        
          if (!userRules[rule.username]) {
            userRules[rule.username] = {
              count: 0,
              ports: []
            };
          }
          
          userRules[rule.username].count++;
        
        // 确保sourcePort存在
        if (rule.sourcePort) {
          userRules[rule.username].ports.push(rule.sourcePort);
        }
        });
        
        // 输出统计信息
      defaultLogger.info('📊 配置生成统计:');
      defaultLogger.info(`   - 有效用户数: ${Object.keys(userRules).length}`);
      defaultLogger.info(`   - 有效规则数: ${formattedRules.length}`);
        
        Object.entries(userRules).forEach(([username, data]) => {
        defaultLogger.info(`   - 用户 ${username}: ${data.count} 个规则, 端口: ${data.ports.join(', ')}`);
        });
    } catch (error) {
      defaultLogger.error(`生成统计信息失败: ${error ? error.message : '未知错误'}`);
      // 错误不会中断流程，继续执行
    }
      }

  /**
   * 获取插件配置
   * @private
   */
  _getPluginConfig() {
    try {
      // 获取性能配置管理器
      const performanceConfigManager = require('./performanceConfigManager');
      const systemModeManager = require('./systemModeManager');
      
      // 安全调用获取插件配置
      let pluginConfig;
      try {
        pluginConfig = performanceConfigManager.getGostPluginConfig();
      } catch (configError) {
        defaultLogger.warn(`获取插件配置失败: ${configError ? configError.message : '未知错误'}`);
        pluginConfig = {
          observerTimeout: "10s",
          observerPeriod: "30s"
        };
      }
      
      // 安全调用获取系统模式
      let isSimpleMode;
      try {
        isSimpleMode = systemModeManager.isSimpleMode();
      } catch (modeError) {
        defaultLogger.warn(`获取系统模式失败: ${modeError ? modeError.message : '未知错误'}`);
        isSimpleMode = false;
      }
      
      defaultLogger.info(`系统模式: ${isSimpleMode ? '单机模式' : '自动模式'}`);
      return { pluginConfig, isSimpleMode };
    } catch (error) {
      defaultLogger.error(`获取插件配置失败: ${error ? error.message : '未知错误'}`);
      defaultLogger.error(`错误详情: ${inspectObject(error || {})}`);
      
      // 使用默认配置
      return {
        pluginConfig: {
          observerTimeout: "10s",
          observerPeriod: "30s"
        },
        isSimpleMode: false
      };
    }
  }

  /**
   * 获取禁用协议列表
   * @private
   */
  async _getDisabledProtocols() {
      try {
        const { SystemConfig } = models;
      const disabledProtocols = await SystemConfig.getValue('disabledProtocols', []);
        
        if (disabledProtocols && disabledProtocols.length > 0) {
        defaultLogger.info(`已禁用协议: ${disabledProtocols.join(', ')}`);
        }
      
      return disabledProtocols;
    } catch (error) {
      defaultLogger.warn(`获取禁用协议列表失败，使用空列表: ${error ? error.message : '未知错误'}`);
      return [];
    }
  }

  /**
   * 添加观察器插件
   * @private
   */
  _addObserverPlugin(gostConfig, pluginConfig) {
    try {
      // 确保参数有效
      if (!gostConfig) {
        defaultLogger.warn('添加观察器失败: 无效的配置对象');
        return;
      }

      // 确保pluginConfig存在
      const timeout = pluginConfig && pluginConfig.observerTimeout ? pluginConfig.observerTimeout : "10s";
      
        gostConfig.observers = [
          {
            name: "observer-0",
            plugin: {
              type: "http",
              addr: "http://localhost:3000/api/gost-plugin/observer",
            timeout: timeout
            }
          }
        ];

        // 添加API配置以支持热加载
        gostConfig.api = {
          addr: ":18080",
          pathPrefix: "/api",
          accesslog: false
        };
    } catch (error) {
      defaultLogger.error(`配置观察器失败: ${error ? error.message : '未知错误'}`);
      
        // 使用默认观察器配置
      if (gostConfig) {
        gostConfig.observers = [
          {
            name: "observer-0",
            plugin: {
              type: "http",
              addr: "http://localhost:3000/api/gost-plugin/observer",
              timeout: "10s"
            }
          }
        ];
        gostConfig.api = {
          addr: ":18080",
          pathPrefix: "/api",
          accesslog: false
        };
      }
    }
  }

  /**
   * 创建服务和链
   * @private
   */
  _createServicesAndChains(gostConfig, formattedRules, disabledProtocols, pluginConfig, isSimpleMode) {
    // 确保参数有效
    if (!gostConfig || !Array.isArray(formattedRules)) {
      defaultLogger.warn('创建服务和链失败: 无效的参数');
      return;
      }

    // 确保gostConfig有services和chains数组
    if (!Array.isArray(gostConfig.services)) {
      gostConfig.services = [];
    }
    
    if (!Array.isArray(gostConfig.chains)) {
      gostConfig.chains = [];
    }
    
    // 确保pluginConfig存在
    if (!pluginConfig) {
      pluginConfig = {
        observerPeriod: "30s"
      };
    }
    
    formattedRules.forEach((rule, index) => {
          try {
        // 确保规则对象有效
        if (!rule) {
          defaultLogger.warn('跳过无效规则');
          return;
        }
        
            // 检查协议是否被禁用
            if (disabledProtocols && disabledProtocols.includes(rule.protocol)) {
          defaultLogger.warn(`🚫 跳过被禁用的协议 ${rule.protocol} 的规则: ${rule.name || 'unknown'} (用户: ${rule.username || 'unknown'}, 端口: ${rule.sourcePort || 'unknown'})`);
          return; // 跳过此规则
        }
        
        // 确保必要的属性存在
        if (!rule.protocol || !rule.sourcePort || !rule.targetAddress) {
          defaultLogger.warn(`🚫 跳过缺少必要属性的规则: ${rule.name || 'unknown'} (用户: ${rule.username || 'unknown'})`);
              return; // 跳过此规则
            }
            
            const serviceName = `forward-${rule.protocol}-${rule.sourcePort}`;
            const chainName = `chain-${rule.protocol}-${rule.sourcePort}`;

        defaultLogger.info(`🔧 创建服务: ${serviceName} (用户: ${rule.username || 'unknown'}, 端口: ${rule.sourcePort} -> ${rule.targetAddress})`);

            // 创建服务，包含完整的插件支持和IPv6监听地址支持
            const service = {
              name: serviceName,
          addr: rule.getGostListenAddress ? rule.getGostListenAddress() : 
                (rule.user && rule.user.role === 'admin') ? `0.0.0.0:${rule.sourcePort}` : `:${rule.sourcePort}`, // 支持IPv6监听地址和admin用户绑定所有接口
              observer: "observer-0",  // 服务级别的观察器
              handler: {
                type: rule.protocol,  // 端口转发模式（TCP/UDP）
                chain: chainName,
                metadata: {
                  // Handler 级别的观察器配置 - 使用动态配置
                  "observer.period": pluginConfig.observerPeriod || "30s",
                  "observer.resetTraffic": true,  // 启用增量流量模式
                }
              },
              listener: {
                type: rule.protocol
              },
              metadata: {
                // 启用统计功能
                enableStats: true,
                // 观测器配置 - 使用动态配置
                "observer.period": pluginConfig.observerPeriod || "30s",
                "observer.resetTraffic": true,  // 启用增量流量模式
                // 用户和规则信息
            userId: rule.userId || 0,
            username: rule.username || 'unknown',
            ruleId: rule.ruleId || rule.id || 0,
            ruleName: rule.name || 'unknown',
            description: rule.description || '',
                // 监听地址信息
            listenAddress: rule.user && rule.user.role === 'admin' ? '0.0.0.0' : (rule.listenAddress || '127.0.0.1'),
            listenAddressType: rule.listenAddressType || 'ipv4'
              }
            };

            // 创建链
            const chain = {
              name: chainName,
              hops: [
                {
                  name: `hop-${index}`,
                  nodes: [
                    {
                      addr: rule.targetAddress,
                      connector: {
                        type: rule.protocol
                      }
                    }
                  ]
                }
              ]
            };

            gostConfig.services.push(service);
            gostConfig.chains.push(chain);
      } catch (error) {
        // 安全获取规则信息
        const ruleName = rule ? (rule.name || 'unknown') : 'unknown';
        const ruleId = rule ? (rule.ruleId || rule.id || 'unknown') : 'unknown';
        defaultLogger.error(`❌ 处理规则失败: ${ruleName} (ID: ${ruleId}): ${error ? error.message : '未知错误'}`);
            }
    });
  }

  /**
   * 计算配置的哈希值，用于比较配置是否发生变化
   */
  calculateConfigHash(config) {
    const configString = JSON.stringify(config, null, 0); // 不格式化，确保一致性
    return crypto.createHash('sha256').update(configString).digest('hex');
  }

  /**
   * 读取当前持久化的配置
   */
  getCurrentPersistedConfig = safeAsync(async () => {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回空配置
        return { services: [], chains: [] };
      }
      throw error;
    }
  }, {
    defaultValue: { services: [], chains: [] }
  });

  /**
   * 保存配置到文件
   */
  saveConfigToFile = safeAsync(async (config) => {
      const configString = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, configString, 'utf8');
    defaultLogger.info('Gost 配置已保存到文件:', this.configPath);
    return true;
  });

  /**
   * 比较两个配置是否相同
   */
  isConfigChanged(newConfig, currentConfig) {
    const newHash = this.calculateConfigHash(newConfig);
    const currentHash = this.calculateConfigHash(currentConfig);
    return newHash !== currentHash;
  }

  /**
   * 更新 Gost 服务配置
   */
  updateGostService = safeAsync(async (config, options = {}) => {
      // 保存新配置
      await this.saveConfigToFile(config);

      // 尝试更新 Gost 服务
      try {
        const gostService = require('./gostService');

        // 检查是否需要强制重启（用于紧急配额禁用）
      if (options && options.forceRestart) {
        defaultLogger.warn('🚨 紧急配额禁用：强制重启GOST服务以断开所有连接');
          await gostService.forceRestart(true);
        defaultLogger.info('✅ GOST服务强制重启完成，所有连接已断开');
        } else {
          // 传递触发信息给热加载方法
          const hotReloadOptions = {
          trigger: options && options.trigger ? options.trigger : 'config_update',
          force: options && options.force ? options.force : false
          };

          await gostService.updateConfig(config, hotReloadOptions);
        defaultLogger.info('Gost 服务配置更新成功');
        }
    } catch (error) {
      // 记录错误但不抛出，因为配置已经保存成功
      defaultLogger.warn(`Gost 服务操作失败，但配置已保存: ${error ? error.message : '未知错误'}`);
      defaultLogger.warn(`错误详情: ${inspectObject(error || {})}`);
    }

    return true;
  });

  /**
   * 同步配置
   */
  syncConfig = safeAsync(async () => {
    if (this.syncLock) {
      defaultLogger.info('配置同步已在进行中，跳过本次同步');
      return false;
    }

    this.syncLock = true;
    try {
      // 生成新配置
      const newConfig = await this.generateGostConfig();
      
      // 读取当前配置
      const currentConfig = await this.getCurrentPersistedConfig();
      
      // 比较配置是否有变化
      if (this.isConfigChanged(newConfig, currentConfig)) {
        defaultLogger.info('🔄 开始更新GOST配置...');
        await this.updateGostService(newConfig);
        defaultLogger.info('Gost 服务配置更新成功');
        return true;
      } else {
        defaultLogger.info('📋 配置无变化，跳过更新');
        return false;
      }
    } finally {
      this.syncLock = false;
    }
  }, {
    throwError: false,
    defaultValue: false
  });

  /**
   * 启动自动同步
   */
  startAutoSync(interval = 60000) {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }
    this.autoSyncInterval = setInterval(() => this.syncConfig(), interval);
    defaultLogger.info(`自动同步已启动，间隔: ${interval}ms`);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
      defaultLogger.info('自动同步已停止');
    }
  }

  /**
   * 触发同步
   */
  triggerSync = safeAsync(async (trigger = 'manual', force = false, priority = 7) => {
    defaultLogger.info(`手动触发同步，触发源: ${trigger}, 强制: ${force}, 优先级: ${priority}`);
    return this.syncConfig();
  }, {
    throwError: false,
    defaultValue: false
  });

  /**
   * 获取配置统计信息
   */
  getConfigStats = safeAsync(async () => {
      const config = await this.getCurrentPersistedConfig();
      
      // 统计服务和链
      const serviceCount = config.services ? config.services.length : 0;
      const chainCount = config.chains ? config.chains.length : 0;
      
      // 统计用户和端口
      const users = new Set();
      const ports = new Set();
      const protocols = new Set();
      
      if (config.services) {
        config.services.forEach(service => {
          if (service.metadata && service.metadata.username) {
            users.add(service.metadata.username);
          }
          
          // 从地址中提取端口
          const portMatch = service.addr ? service.addr.match(/:(\d+)$/) : null;
          if (portMatch && portMatch[1]) {
            ports.add(parseInt(portMatch[1]));
          }
          
          // 收集协议
          if (service.handler && service.handler.type) {
            protocols.add(service.handler.type);
          }
        });
      }
      
      return {
        serviceCount,
        chainCount,
        userCount: users.size,
        portCount: ports.size,
        protocols: Array.from(protocols),
        lastUpdated: new Date().toISOString()
      };
  }, {
    defaultValue: {
      serviceCount: 0,
      chainCount: 0,
      userCount: 0,
      portCount: 0,
      protocols: [],
        lastUpdated: new Date().toISOString()
    }
  });
}

module.exports = new GostConfigService();