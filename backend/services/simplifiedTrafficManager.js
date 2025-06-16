/**
 * 简化的流量管理器
 *
 * 设计理念：
 * 1. 保留流量统计功能，但简化监控机制
 * 2. 直接处理GOST观察器数据，无复杂缓存
 * 3. 基于流量阈值的即时限制
 * 4. 最小化数据库查询和内存占用
 */

const fs = require('fs').promises;
const path = require('path');
const { User, UserForwardRule } = require('../models');
const gostService = require('./gostService');

class SimplifiedTrafficManager {
  constructor() {
    this.configPath = path.join(__dirname, '../config/gost-config.json');
    this.isUpdating = false;
    this.updateQueue = [];

    // 简化的端口到用户映射（内存中维护）
    this.portUserMap = new Map();

    // 流量统计缓冲区（避免频繁数据库写入）
    this.trafficBuffer = new Map();
    this.bufferFlushInterval = 5000; // 5秒刷新一次

    console.log('🚀 简化流量管理器初始化');

    // 启动流量缓冲区刷新定时器
    this.startBufferFlush();
  }

  /**
   * 初始化管理器
   */
  async initialize() {
    try {
      console.log('🔧 初始化简化流量管理器...');

      // 构建端口映射
      await this.buildPortMapping();

      // 生成初始配置
      await this.generateConfiguration();

      console.log('✅ 简化流量管理器初始化完成');
      return true;
    } catch (error) {
      console.error('❌ 简化流量管理器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 构建端口到用户的映射
   */
  async buildPortMapping() {
    try {
      console.log('🔄 构建端口映射...');

      const rules = await UserForwardRule.findAll({
        where: { isActive: true },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'trafficQuota', 'usedTraffic']
        }]
      });

      this.portUserMap.clear();

      for (const rule of rules) {
        if (rule.user) {
          this.portUserMap.set(rule.sourcePort.toString(), {
            userId: rule.user.id,
            username: rule.user.username,
            ruleId: rule.id,
            ruleName: rule.name
          });
        }
      }

      console.log(`✅ 端口映射构建完成: ${this.portUserMap.size}个端口`);

    } catch (error) {
      console.error('❌ 构建端口映射失败:', error);
      throw error;
    }
  }

  /**
   * 处理GOST观察器流量数据
   */
  async handleTrafficData(data) {
    try {
      const { service, inputBytes = 0, outputBytes = 0 } = data;

      if (!service) {
        return;
      }

      // 从服务名提取端口号
      const portMatch = service.match(/forward-tcp-(\d+)/);
      if (!portMatch) {
        return;
      }

      const port = portMatch[1];
      const userInfo = this.portUserMap.get(port);

      if (!userInfo) {
        console.log(`⚠️ 端口 ${port} 没有对应的用户映射`);
        return;
      }

      const totalBytes = inputBytes + outputBytes;
      if (totalBytes <= 0) {
        return;
      }

      console.log(`📊 [流量统计] 用户 ${userInfo.username} (端口${port}): ${(totalBytes/1024/1024).toFixed(2)}MB`);

      // 添加到缓冲区
      const userId = userInfo.userId;
      const currentBuffer = this.trafficBuffer.get(userId) || 0;
      this.trafficBuffer.set(userId, currentBuffer + totalBytes);

      // 检查是否需要立即处理（大流量或接近配额）
      if (totalBytes > 50 * 1024 * 1024) { // 超过50MB立即处理
        await this.flushUserTraffic(userId);
      }

    } catch (error) {
      console.error('❌ 处理流量数据失败:', error);
    }
  }

  /**
   * 刷新单个用户的流量统计
   */
  async flushUserTraffic(userId) {
    try {
      const bufferedBytes = this.trafficBuffer.get(userId);
      if (!bufferedBytes || bufferedBytes <= 0) {
        return;
      }

      // 清除缓冲区
      this.trafficBuffer.delete(userId);

      // 更新数据库
      const user = await User.findByPk(userId);
      if (!user) {
        console.error(`❌ 用户 ${userId} 不存在`);
        return;
      }

      const newUsedTraffic = (user.usedTraffic || 0) + bufferedBytes;
      await user.update({ usedTraffic: newUsedTraffic });

      const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
      const usagePercentage = (newUsedTraffic / quotaBytes) * 100;

      console.log(`💾 [流量更新] 用户 ${user.username}: ${(newUsedTraffic/1024/1024).toFixed(1)}MB / ${(quotaBytes/1024/1024).toFixed(1)}MB (${usagePercentage.toFixed(1)}%)`);

      // 检查是否超过配额
      if (usagePercentage >= 100) {
        console.log(`🚫 [配额超限] 用户 ${user.username} 已超过配额，禁用规则`);
        await this.disableUserRules(userId, '流量配额已用完');
        await this.triggerConfigUpdate('quota_exceeded');
      }

    } catch (error) {
      console.error(`❌ 刷新用户 ${userId} 流量失败:`, error);
    }
  }

  /**
   * 启动流量缓冲区刷新定时器
   */
  startBufferFlush() {
    setInterval(async () => {
      if (this.trafficBuffer.size > 0) {
        console.log(`🔄 [定时刷新] 处理 ${this.trafficBuffer.size} 个用户的流量缓冲`);

        const userIds = Array.from(this.trafficBuffer.keys());
        for (const userId of userIds) {
          await this.flushUserTraffic(userId);
        }
      }
    }, this.bufferFlushInterval);
  }

  /**
   * 禁用用户规则
   */
  async disableUserRules(userId, reason) {
    try {
      await UserForwardRule.update(
        {
          isActive: false,
          description: `[自动禁用: ${reason}] ${new Date().toISOString()}`
        },
        { where: { userId: userId, isActive: true } }
      );

      console.log(`🚫 用户 ${userId} 的规则已禁用: ${reason}`);

    } catch (error) {
      console.error(`❌ 禁用用户规则失败:`, error);
    }
  }

  /**
   * 生成GOST配置
   */
  async generateConfiguration() {
    try {
      console.log('🔄 生成简化GOST配置...');

      // 获取所有活跃用户和规则
      const users = await User.findAll({
        where: {
          expiryDate: {
            [require('sequelize').Op.gt]: new Date()
          }
        },
        include: [{
          model: UserForwardRule,
          as: 'forwardRules',
          required: false
        }]
      });

      const config = {
        services: [],
        observers: [
          {
            name: "observer-0",
            type: "http",
            addr: "localhost:18081"
          }
        ]
      };

      let totalRules = 0;

      for (const user of users) {
        if (!user.forwardRules || user.forwardRules.length === 0) {
          continue;
        }

        // 计算用户当前使用率
        const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
        const usedBytes = user.usedTraffic || 0;
        const usagePercentage = (usedBytes / quotaBytes) * 100;

        // 如果用户超过配额，跳过其规则
        if (usagePercentage >= 100) {
          console.log(`⚠️ 用户 ${user.username} 已超过配额 (${usagePercentage.toFixed(1)}%)，跳过规则`);
          continue;
        }

        // 🔧 修复: 使用计算属性过滤活跃规则
        const activeRules = user.forwardRules.filter(rule => {
          rule.user = user; // 设置用户关联
          return rule.isActive; // 计算属性
        });

        for (const rule of activeRules) {
          const serviceName = `forward-tcp-${rule.sourcePort}`;

          const service = {
            name: serviceName,
            addr: `:${rule.sourcePort}`,
            handler: {
              type: "tcp"
            },
            listener: {
              type: "tcp"
            },
            forwarder: {
              nodes: [
                {
                  name: `node-${rule.sourcePort}`,
                  addr: rule.targetAddress
                }
              ]
            },
            observer: "observer-0"
          };

          config.services.push(service);
          totalRules++;
        }
      }

      // 保存配置
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));

      console.log(`✅ 配置生成完成: ${users.length}个用户, ${totalRules}个规则`);

      // 重新构建端口映射
      await this.buildPortMapping();

      return {
        userCount: users.length,
        ruleCount: totalRules,
        config
      };

    } catch (error) {
      console.error('❌ 配置生成失败:', error);
      throw error;
    }
  }

  /**
   * 更新用户配额
   */
  async updateUserQuota(userId, newQuotaGB) {
    try {
      console.log(`🔄 更新用户 ${userId} 配额: ${newQuotaGB}GB`);

      // 更新数据库
      await User.update(
        { trafficQuota: newQuotaGB },
        { where: { id: userId } }
      );

      // 触发配置重新生成
      await this.triggerConfigUpdate('quota_update');

      console.log(`✅ 用户 ${userId} 配额更新完成`);
      return true;

    } catch (error) {
      console.error(`❌ 更新用户配额失败:`, error);
      throw error;
    }
  }

  /**
   * 重置用户流量
   */
  async resetUserTraffic(userId, newQuotaGB = null) {
    try {
      console.log(`🔄 重置用户 ${userId} 流量`);

      const updateData = { usedTraffic: 0 };
      if (newQuotaGB !== null) {
        updateData.trafficQuota = newQuotaGB;
      }

      // 清除缓冲区中的数据
      this.trafficBuffer.delete(userId);

      // 更新数据库
      await User.update(updateData, { where: { id: userId } });

      // 恢复被禁用的规则
      await UserForwardRule.update(
        {
          isActive: true,
          description: null
        },
        {
          where: {
            userId: userId,
            isActive: false
          }
        }
      );

      // 触发配置重新生成
      await this.triggerConfigUpdate('traffic_reset');

      console.log(`✅ 用户 ${userId} 流量重置完成`);
      return true;

    } catch (error) {
      console.error(`❌ 重置用户流量失败:`, error);
      throw error;
    }
  }

  /**
   * 触发配置更新
   */
  async triggerConfigUpdate(reason = 'manual') {
    if (this.isUpdating) {
      console.log(`⏳ 配置更新中，加入队列 (原因: ${reason})`);
      this.updateQueue.push(reason);
      return;
    }

    try {
      this.isUpdating = true;
      console.log(`🔄 触发配置更新 (原因: ${reason})`);

      // 重新生成配置
      const result = await this.generateConfiguration();

      // 热重载GOST配置
      await this.reloadGostConfig();

      console.log(`✅ 配置更新完成: ${result.userCount}用户, ${result.ruleCount}规则`);

      // 处理队列中的更新请求
      if (this.updateQueue.length > 0) {
        const nextReason = this.updateQueue.shift();
        setTimeout(() => this.triggerConfigUpdate(nextReason), 1000);
      }

    } catch (error) {
      console.error('❌ 配置更新失败:', error);
      throw error;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * 热重载GOST配置
   */
  async reloadGostConfig() {
    try {
      console.log('🔥 热重载GOST配置...');

      // 使用GOST API进行热重载
      const response = await fetch('http://localhost:18080/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: await fs.readFile(this.configPath, 'utf8')
      });

      if (response.ok) {
        console.log('✅ GOST配置热重载成功');
      } else {
        console.log('⚠️ GOST热重载失败，尝试重启服务...');
        await gostService.restart();
      }

    } catch (error) {
      console.log('⚠️ GOST热重载异常，尝试重启服务:', error.message);
      await gostService.restart();
    }
  }

  /**
   * 获取用户状态
   */
  async getUserStatus(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [{
          model: UserForwardRule,
          as: 'forwardRules'
        }]
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
      const usedBytes = user.usedTraffic || 0;
      const usagePercentage = (usedBytes / quotaBytes) * 100;

      const activeRules = user.forwardRules.filter(r => r.isActive);
      const inactiveRules = user.forwardRules.filter(r => !r.isActive);

      return {
        userId: user.id,
        username: user.username,
        quota: user.trafficQuota,
        quotaMB: user.trafficQuota * 1024,
        used: usedBytes,
        usedMB: usedBytes / (1024 * 1024),
        usagePercentage,
        remaining: quotaBytes - usedBytes,
        remainingMB: (quotaBytes - usedBytes) / (1024 * 1024),
        rules: {
          total: user.forwardRules.length,
          active: activeRules.length,
          inactive: inactiveRules.length
        }
      };

    } catch (error) {
      console.error('❌ 获取用户状态失败:', error);
      throw error;
    }
  }
}

module.exports = new SimplifiedTrafficManager();
