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
          where: {
            isActive: true
          },
          required: false // LEFT JOIN，允许用户没有转发规则
        }]
      });

      // 收集所有有效的转发规则
      const allRules = [];
      validUsers.forEach(user => {
        if (user.forwardRules && user.forwardRules.length > 0) {
          user.forwardRules.forEach(rule => {
            // 验证端口是否在用户允许范围内
            if (user.role === 'admin' || user.isPortInRange(rule.sourcePort)) {
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

      // 生成 Gost 配置
      const gostConfig = {
        services: [],
        chains: []
      };

      // 为每个转发规则创建服务和链
      allRules.forEach((rule, index) => {
        const serviceName = `forward-${rule.protocol}-${rule.sourcePort}`;
        const chainName = `chain-${rule.protocol}-${rule.sourcePort}`;

        // 创建服务
        const service = {
          name: serviceName,
          addr: `:${rule.sourcePort}`,
          handler: {
            type: rule.protocol,
            chain: chainName
          },
          listener: {
            type: rule.protocol
          },
          metadata: {
            userId: rule.userId,
            username: rule.username,
            ruleId: rule.ruleId,
            ruleName: rule.name,
            description: rule.description
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
  async updateGostService(config) {
    try {
      // 保存新配置
      await this.saveConfigToFile(config);

      // 尝试更新 Gost 服务
      try {
        const gostService = require('./gostService');

        // 使用原有的 updateConfig 方法，保持兼容性
        await gostService.updateConfig(config);
        console.log('Gost 服务配置更新成功');
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
   * 启动定时同步
   */
  startAutoSync() {
    if (this.syncTimer) {
      console.log('定时同步已在运行');
      return;
    }

    console.log(`启动 Gost 配置自动同步，间隔: ${this.syncInterval / 1000}秒`);

    // 延迟执行初始同步，确保系统完全启动
    setTimeout(() => {
      this.syncConfig().catch(error => {
        console.error('初始同步失败:', error);
      });
    }, 5000); // 延迟5秒

    // 设置定时器
    this.syncTimer = setInterval(async () => {
      try {
        await this.syncConfig();
      } catch (error) {
        console.error('定时同步失败:', error);
        // 记录错误但不停止定时器
      }
    }, this.syncInterval);
  }

  /**
   * 停止定时同步
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('Gost 配置自动同步已停止');
    }
  }

  /**
   * 手动触发同步（用于用户编辑后立即同步）
   */
  async triggerSync() {
    console.log('手动触发 Gost 配置同步...');
    return await this.syncConfig();
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
