const { models } = require('./dbService');
const { User, UserForwardRule } = models;
const { Op } = require('sequelize');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class GostConfigService {
  constructor() {
    this.configPath = path.join(__dirname, '../config/gost-config.json');
    this.lastConfigHash = null;
    this.lastSyncTime = null;
    this.syncTimer = null;
    this.syncInterval = 25000; // 25秒

    // 确保配置目录存在
    this.ensureConfigDirectory();
  }

  /**
   * 确保配置目录存在
   */
  ensureConfigDirectory() {
    try {
      const configDir = path.dirname(this.configPath);
      if (!require('fs').existsSync(configDir)) {
        require('fs').mkdirSync(configDir, { recursive: true });
        console.log('创建配置目录:', configDir);
      }
    } catch (error) {
      console.error('创建配置目录失败:', error);
    }
  }

  /**
   * 生成标准化的 Gost 配置
   * 根据数据库中有效用户的转发规则生成配置
   */
  async generateGostConfig() {
    try {
      // 获取所有有效用户（未过期且启用的用户）
      const validUsers = await User.findAll({
        where: {
          isActive: true,
          [Op.or]: [
            { expiryDate: null }, // 永不过期
            { expiryDate: { [Op.gt]: new Date() } } // 未过期
          ]
        },
        include: [{
          model: UserForwardRule,
          as: 'forwardRules',
          // 移除 isActive 查询条件，改为在后续处理中使用计算属性
          required: false // LEFT JOIN，允许用户没有转发规则
        }]
      });

      // 收集所有有效的转发规则
      const allRules = [];
      validUsers.forEach(user => {
        if (user.forwardRules && user.forwardRules.length > 0) {
          user.forwardRules.forEach(rule => {
            // 设置用户关联，以便计算属性能正常工作
            rule.user = user;

            // 使用计算属性检查规则是否应该激活
            const shouldBeActive = rule.isActive; // 现在 isActive 就是计算属性

            // 只有计算属性为true的规则才被包含
            if (shouldBeActive) {
              allRules.push({
                userId: user.id,
                username: user.username,
                ruleId: rule.id,
                name: rule.name,
                sourcePort: rule.sourcePort,
                targetAddress: rule.targetAddress,
                protocol: rule.protocol,
                description: rule.description
              });
            } else {
              console.log(`🚫 跳过规则 ${rule.name} (端口${rule.sourcePort}): 计算属性=${shouldBeActive}`);
            }
          });
        }
      });

      // 按协议和端口排序，确保配置的一致性
      allRules.sort((a, b) => {
        if (a.protocol !== b.protocol) {
          return a.protocol.localeCompare(b.protocol);
        }
        return a.sourcePort - b.sourcePort;
      });

      // 输出详细的规则统计信息
      console.log(`📊 配置生成统计:`);
      console.log(`   - 有效用户数: ${validUsers.length}`);
      console.log(`   - 有效规则数: ${allRules.length}`);

      // 按用户分组统计
      const userStats = {};
      allRules.forEach(rule => {
        if (!userStats[rule.username]) {
          userStats[rule.username] = { count: 0, ports: [] };
        }
        userStats[rule.username].count++;
        userStats[rule.username].ports.push(rule.sourcePort);
      });

      Object.entries(userStats).forEach(([username, stats]) => {
        console.log(`   - 用户 ${username}: ${stats.count} 个规则, 端口: ${stats.ports.sort((a,b) => a-b).join(', ')}`);
      });

      // 检测端口冲突
      const portMap = new Map();
      const conflicts = [];

      allRules.forEach(rule => {
        const key = `${rule.protocol}-${rule.sourcePort}`;
        if (portMap.has(key)) {
          const existing = portMap.get(key);
          conflicts.push({
            port: rule.sourcePort,
            protocol: rule.protocol,
            users: [existing.username, rule.username],
            rules: [existing.name, rule.name]
          });
        } else {
          portMap.set(key, rule);
        }
      });

      if (conflicts.length > 0) {
        console.warn(`⚠️ 检测到 ${conflicts.length} 个端口冲突:`);
        conflicts.forEach(conflict => {
          console.warn(`   - 端口 ${conflict.port} (${conflict.protocol}): 用户 ${conflict.users.join(' vs ')}`);
        });
      }

      // 🚀 从性能配置管理器获取插件配置
      const performanceConfigManager = require('./performanceConfigManager');
      const systemModeManager = require('./systemModeManager');
      const pluginConfig = performanceConfigManager.getGostPluginConfig();
      const isSimpleMode = systemModeManager.isSimpleMode();

      // 生成 Gost 配置
      const gostConfig = {
        services: [],
        chains: []
      };

      // 🔧 修复: 始终添加观察器插件以支持流量统计
      gostConfig.observers = [
        {
          name: "observer-0",
          plugin: {
            type: "http",
            addr: "http://localhost:3000/api/gost-plugin/observer",
            timeout: pluginConfig.observerTimeout || "10s"
          }
        }
      ];

      // 🔧 添加API配置以支持热加载
      gostConfig.api = {
        addr: ":18080",
        pathPrefix: "/api",
        accesslog: false
      };

      // 🎛️ 只有在自动模式下才添加其他插件
      if (!isSimpleMode) {
        // 🔧 端口转发模式暂不支持认证器和限制器插件
        // 但保留配置结构以备将来使用
      }

      // 为每个转发规则创建服务和链
      allRules.forEach((rule, index) => {
        const serviceName = `forward-${rule.protocol}-${rule.sourcePort}`;
        const chainName = `chain-${rule.protocol}-${rule.sourcePort}`;

        console.log(`🔧 创建服务: ${serviceName} (用户: ${rule.username}, 端口: ${rule.sourcePort} -> ${rule.targetAddress})`);

        // 🔧 Phase 2: 创建服务，包含完整的插件支持和IPv6监听地址支持
        const service = {
          name: serviceName,
          addr: rule.getGostListenAddress ? rule.getGostListenAddress() : `:${rule.sourcePort}`, // 🔧 支持IPv6监听地址
          observer: "observer-0",  // 🔧 尝试服务级别的观察器
          handler: {
            type: rule.protocol,  // 🔧 恢复为端口转发模式（TCP/UDP）
            chain: chainName,
            metadata: {
              // Handler 级别的观察器配置 - 使用动态配置
              "observer.period": pluginConfig.observerPeriod || "30s",  // 🔧 性能优化：使用配置文件中的周期
              "observer.resetTraffic": true,  // 🔧 关键：启用增量流量模式
            }
          },
          listener: {
            type: rule.protocol
          },
          metadata: {
            // 启用统计功能
            enableStats: true,
            // 观测器配置 - 使用动态配置
            "observer.period": pluginConfig.observerPeriod || "30s",  // 🔧 性能优化：使用配置文件中的周期
            "observer.resetTraffic": true,  // 🔧 关键修复：启用增量流量模式
            // 用户和规则信息
            userId: rule.userId,
            username: rule.username,
            ruleId: rule.ruleId,
            ruleName: rule.name,
            description: rule.description,
            // 🔧 新增：监听地址信息
            listenAddress: rule.listenAddress,
            listenAddressType: rule.listenAddressType
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
      });

      return gostConfig;
    } catch (error) {
      console.error('生成 Gost 配置失败:', error);
      throw new Error(`生成 Gost 配置失败: ${error.message}`);
    }
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
  async getCurrentPersistedConfig() {
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
  }

  /**
   * 保存配置到文件
   */
  async saveConfigToFile(config) {
    try {
      const configString = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, configString, 'utf8');
      console.log('Gost 配置已保存到文件:', this.configPath);
    } catch (error) {
      console.error('保存 Gost 配置失败:', error);
      throw error;
    }
  }

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
  async updateGostService(config, options = {}) {
    try {
      // 保存新配置
      await this.saveConfigToFile(config);

      // 尝试更新 Gost 服务
      try {
        const gostService = require('./gostService');

        // 🔧 检查是否需要强制重启（用于紧急配额禁用）
        if (options.forceRestart) {
          console.log('🚨 紧急配额禁用：强制重启GOST服务以断开所有连接');
          await gostService.forceRestart(true);
          console.log('✅ GOST服务强制重启完成，所有连接已断开');
        } else {
          // 🔧 传递触发信息给热加载方法
          const hotReloadOptions = {
            trigger: options.trigger || 'config_update',
            force: options.force || false
          };

          await gostService.updateConfig(config, hotReloadOptions);
          console.log('Gost 服务配置更新成功');
        }
      } catch (gostError) {
        console.warn('Gost 服务操作失败，但配置已保存:', gostError.message);
        // 不抛出错误，因为配置已经保存成功
      }

      return true;
    } catch (error) {
      console.error('更新 Gost 服务失败:', error);
      throw error;
    }
  }

  /**
   * 同步配置 - 检查数据库配置与当前配置是否一致
   */
  async syncConfig() {
    try {
      console.log('开始同步 Gost 配置...');

      // 🔧 检查是否在单击模式下禁用配置同步
      const performanceConfigManager = require('./performanceConfigManager');
      const pluginConfig = performanceConfigManager.getGostPluginConfig();

      // ✅ 只有在单击模式下才禁用配置同步，自动模式下正常执行
      if (pluginConfig.disableConfigSync) {
        console.log('📊 [单击模式] 配置同步已禁用，跳过GOST配置同步');
        return { updated: false, config: null, reason: 'sync_disabled_single_click_mode' };
      }

      // 生成新配置
      const newConfig = await this.generateGostConfig();

      // 获取当前配置
      const currentConfig = await this.getCurrentPersistedConfig();

      // 比较配置
      if (this.isConfigChanged(newConfig, currentConfig)) {
        console.log('检测到配置变化，更新 Gost 服务...');
        console.log('新配置服务数量:', newConfig.services.length);
        console.log('当前配置服务数量:', currentConfig.services.length);

        // 更新服务
        await this.updateGostService(newConfig);

        // 更新哈希值和同步时间
        this.lastConfigHash = this.calculateConfigHash(newConfig);
        this.lastSyncTime = new Date();

        console.log('Gost 配置同步完成');
        return { updated: true, config: newConfig };
      } else {
        console.log('配置无变化，跳过更新');
        this.lastSyncTime = new Date();
        return { updated: false, config: currentConfig };
      }
    } catch (error) {
      console.error('同步 Gost 配置失败:', error);
      throw error;
    }
  }

  /**
   * 启动定时同步（已迁移到统一协调器）
   */
  startAutoSync() {
    console.log('⚠️ [GOST配置] 定时同步已迁移到统一协调器');
    const gostSyncCoordinator = require('./gostSyncCoordinator');
    gostSyncCoordinator.startAutoSync();
  }

  /**
   * 停止定时同步（已迁移到统一协调器）
   */
  stopAutoSync() {
    console.log('⚠️ [GOST配置] 定时同步已迁移到统一协调器');
    const gostSyncCoordinator = require('./gostSyncCoordinator');
    gostSyncCoordinator.stopAutoSync();
  }

  /**
   * 手动触发同步（使用统一协调器）
   */
  async triggerSync(trigger = 'manual', force = false, priority = 7) {
    console.log(`手动触发 Gost 配置同步... (触发源: ${trigger})`);
    const gostSyncCoordinator = require('./gostSyncCoordinator');
    return await gostSyncCoordinator.requestSync(trigger, force, priority);
  }

  /**
   * 获取配置统计信息
   */
  async getConfigStats() {
    try {
      const config = await this.generateGostConfig();
      const currentConfig = await this.getCurrentPersistedConfig();

      return {
        generatedServices: config.services.length,
        currentServices: currentConfig.services.length,
        isUpToDate: !this.isConfigChanged(config, currentConfig),
        lastSyncTime: this.lastSyncTime,
        autoSyncEnabled: !!this.syncTimer
      };
    } catch (error) {
      console.error('获取配置统计失败:', error);
      throw error;
    }
  }
}

module.exports = new GostConfigService();
