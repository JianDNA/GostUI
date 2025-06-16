/**
 * 简化的GOST观察器处理器
 *
 * 设计理念：
 * 1. 直接处理GOST观察器数据，无复杂缓存
 * 2. 实时流量统计和配额检查
 * 3. 最小化内存占用和处理延迟
 * 4. 减少日志输出，优化性能
 */

const express = require('express');
const simplifiedCacheService = require('./simplifiedCacheService');
const simplifiedQuotaService = require('./simplifiedQuotaService');

class SimplifiedObserver {
  constructor() {
    this.app = express();
    this.port = 18081;
    this.server = null;

    console.log('🚀 简化观察器初始化');
    this.setupRoutes();
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    // 解析JSON数据
    this.app.use(express.json());

    // GOST观察器数据接收端点
    this.app.post('/observer', async (req, res) => {
      try {
        await this.handleObserverData(req.body);
        res.status(200).send('OK');
      } catch (error) {
        console.error('❌ 处理观察器数据失败:', error);
        res.status(500).send('Error');
      }
    });

    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'simplified-observer'
      });
    });

    // 统计信息端点
    this.app.get('/stats', (req, res) => {
      res.status(200).json({
        portMappings: Object.keys(simplifiedCacheService.getPortUserMapping()).length,
        cacheStats: simplifiedCacheService.getStats(),
        quotaStats: simplifiedQuotaService.getStatus(),
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * 处理GOST观察器数据
   */
  async handleObserverData(data) {
    try {
      // 支持单个事件或事件数组
      const events = Array.isArray(data) ? data : [data];

      for (const event of events) {
        if (event.type === 'stats' && event.stats) {
          await this.processStatsEvent(event);
        }
      }

    } catch (error) {
      console.error('❌ 处理观察器数据失败:', error);
    }
  }

  /**
   * 处理流量统计事件
   */
  async processStatsEvent(event) {
    try {
      const { service, stats } = event;

      if (!service || !stats) {
        return;
      }

      // 提取流量数据
      const inputBytes = stats.inputBytes || 0;
      const outputBytes = stats.outputBytes || 0;
      const totalBytes = inputBytes + outputBytes;

      // 只处理有实际流量的事件
      if (totalBytes <= 0) {
        return;
      }

      // 从服务名提取端口号
      const portMatch = service.match(/forward-tcp-(\d+)/);
      if (!portMatch) {
        return;
      }

      const port = parseInt(portMatch[1]);

      // 获取端口映射
      const portMapping = simplifiedCacheService.getPortUserMapping();
      const userInfo = portMapping[port];

      if (!userInfo) {
        // 只在大流量时输出警告
        if (totalBytes > 10 * 1024 * 1024) { // 10MB以上
          console.log(`⚠️ 端口 ${port} 没有对应的用户映射`);
        }
        return;
      }

      // 只在大流量时输出日志
      if (totalBytes > 5 * 1024 * 1024) { // 5MB以上
        console.log(`📊 用户 ${userInfo.username} (端口${port}): ${(totalBytes/1024/1024).toFixed(2)}MB`);
      }

      // 更新用户流量
      await this.updateUserTraffic(userInfo.userId, totalBytes);

    } catch (error) {
      console.error('❌ 处理统计事件失败:', error);
    }
  }

  /**
   * 更新用户流量
   */
  async updateUserTraffic(userId, additionalBytes) {
    try {
      // 更新流量
      const newUsedTraffic = await simplifiedCacheService.updateUserTraffic(userId, additionalBytes);

      // 检查配额（减少检查频率）
      if (additionalBytes > 10 * 1024 * 1024) { // 只在大流量时检查
        const quotaResult = await simplifiedQuotaService.checkUserQuota(userId, 'traffic_update');

        if (!quotaResult.allowed) {
          console.log(`🚫 用户 ${userId} 超过配额: ${quotaResult.reason}`);

          // 触发规则禁用
          await this.disableUserRules(userId, quotaResult.reason);
        }
      }

    } catch (error) {
      console.error(`❌ 更新用户 ${userId} 流量失败:`, error);
    }
  }

  /**
   * 禁用用户规则
   */
  async disableUserRules(userId, reason) {
    try {
      const { UserForwardRule } = require('../models');

      const activeRules = await UserForwardRule.findAll({
        where: {
          userId: userId,
          isActive: true
        }
      });

      if (activeRules.length === 0) {
        return;
      }

      let disabledCount = 0;
      for (const rule of activeRules) {
        await rule.update({
          isActive: false,
          description: `[自动禁用: ${reason}] ${rule.description || ''}`.trim()
        });
        disabledCount++;
      }

      console.log(`🚫 已禁用用户 ${userId} 的 ${disabledCount} 个规则`);

      // 触发配置同步
      const simplifiedSyncService = require('./simplifiedSyncService');
      simplifiedSyncService.requestSync('quota_exceeded', false, 8).catch(error => {
        console.error('同步失败:', error);
      });

    } catch (error) {
      console.error(`❌ 禁用用户 ${userId} 规则失败:`, error);
    }
  }

  /**
   * 启动观察器服务
   */
  async start() {
    try {
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(this.port, 'localhost', (error) => {
          if (error) {
            console.error(`❌ 简化观察器启动失败:`, error);
            reject(error);
          } else {
            console.log(`✅ 简化观察器已启动: http://localhost:${this.port}`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('❌ 启动简化观察器失败:', error);
      throw error;
    }
  }

  /**
   * 停止观察器服务
   */
  async stop() {
    try {
      if (this.server) {
        return new Promise((resolve) => {
          this.server.close(() => {
            console.log('✅ 简化观察器已停止');
            resolve();
          });
        });
      }
    } catch (error) {
      console.error('❌ 停止简化观察器失败:', error);
      throw error;
    }
  }

  /**
   * 重启观察器服务
   */
  async restart() {
    try {
      console.log('🔄 重启简化观察器...');
      await this.stop();
      await this.start();
      console.log('✅ 简化观察器重启完成');
    } catch (error) {
      console.error('❌ 重启简化观察器失败:', error);
      throw error;
    }
  }
}

module.exports = new SimplifiedObserver();
