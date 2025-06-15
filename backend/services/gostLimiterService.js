/**
 * GOST限制器插件服务
 * 实现基于用户流量配额的动态限制
 */

const { User, UserForwardRule } = require('../models');
const multiInstanceCacheService = require('./multiInstanceCacheService');

class GostLimiterService {
  constructor() {
    this.cache = new Map(); // 缓存用户配额状态
    this.cacheExpiry = 30 * 1000; // 30秒缓存过期
  }

  /**
   * 处理GOST限制器查询请求
   * @param {Object} request - GOST限制器请求
   * @returns {Object} 限制策略响应
   */
  async handleLimiterRequest(request) {
    try {
      const { scope, service, network, addr, client, src } = request;

      console.log(`🔍 [限制器] 收到查询请求:`, {
        scope,
        service,
        client,
        src: src?.substring(0, 20) + '...'
      });

      // 解析用户信息
      const userInfo = await this.parseUserFromRequest(request);
      if (!userInfo) {
        console.log(`⚠️ [限制器] 无法解析用户信息，允许通过`);
        return { in: 0, out: 0 }; // 无限制
      }

      // 检查用户配额
      const quotaCheck = await this.checkUserQuota(userInfo.userId);

      console.log(`📊 [限制器] 用户 ${userInfo.username} 配额检查:`, {
        allowed: quotaCheck.allowed,
        usedTraffic: this.formatBytes(quotaCheck.usedTraffic || 0),
        quotaBytes: quotaCheck.quotaBytes ? this.formatBytes(quotaCheck.quotaBytes) : '无限制',
        remainingTraffic: quotaCheck.remainingTraffic ? this.formatBytes(quotaCheck.remainingTraffic) : '无限制'
      });

      // 返回限制策略
      if (quotaCheck.allowed) {
        return { in: 0, out: 0 }; // 无限制 (根据GOST文档，0或负值表示无限制)
      } else {
        console.log(`🚫 [限制器] 用户 ${userInfo.username} 流量超限，返回极低限速`);
        // 🔧 修复：返回极低限速（认证器应该已经拒绝了，这里是双重保险）
        return {
          in: 1,    // 1 字节/秒 - 极低限速
          out: 1    // 1 字节/秒 - 极低限速
        };
      }

    } catch (error) {
      console.error(`❌ [限制器] 处理请求失败:`, error);
      // 出错时允许通过，避免影响正常服务
      return { in: 0, out: 0 };
    }
  }

  /**
   * 从请求中解析用户信息
   * @param {Object} request - GOST请求
   * @returns {Object|null} 用户信息
   */
  async parseUserFromRequest(request) {
    const { service, client } = request;

    try {
      // 方法1：通过client字段获取用户ID（认证器提供）
      if (client && client.startsWith('user_')) {
        const userId = parseInt(client.replace('user_', ''));
        if (userId) {
          const user = await this.getUserById(userId);
          if (user) {
            return { userId, username: user.username, role: user.role };
          }
        }
      }

      // 方法2：通过服务名解析端口，再查找用户
      if (service) {
        const portMatch = service.match(/forward-\w+-(\d+)/);
        if (portMatch) {
          const port = parseInt(portMatch[1]);
          const userMapping = await multiInstanceCacheService.getPortUserMapping();

          if (userMapping[port]) {
            const { userId, username } = userMapping[port];
            const user = await this.getUserById(userId);
            if (user) {
              return { userId, username: user.username, role: user.role };
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ [限制器] 解析用户信息失败:`, error);
      return null;
    }
  }

  /**
   * 检查用户流量配额
   * @param {number} userId - 用户ID
   * @returns {Object} 配额检查结果
   */
  async checkUserQuota(userId) {
    try {
      // 检查缓存
      const cacheKey = `quota_${userId}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }

      // 使用统一配额协调器
      const quotaCoordinatorService = require('./quotaCoordinatorService');
      const result = await quotaCoordinatorService.checkUserQuota(userId, 'gost_limiter');

      // 转换为限制器期望的格式
      const limiterResult = {
        allowed: result.allowed,
        reason: result.reason,
        unlimited: result.allowed && (result.reason.includes('admin') || result.reason.includes('no_quota')),
        usedTraffic: result.usedTraffic,
        quotaBytes: result.quotaBytes,
        remainingTraffic: result.quotaBytes ? Math.max(0, result.quotaBytes - (result.usedTraffic || 0)) : 0,
        usagePercentage: result.usagePercentage ? result.usagePercentage.toFixed(2) : '0.00',
        error: result.error
      };

      // 缓存结果
      this.cache.set(cacheKey, { data: limiterResult, timestamp: Date.now() });
      return limiterResult;

    } catch (error) {
      console.error(`❌ [限制器] 检查用户配额失败:`, error);
      return { allowed: true, error: error.message }; // 出错时允许通过
    }
  }

  /**
   * 获取用户信息
   * @param {number} userId - 用户ID
   * @returns {Object|null} 用户信息
   */
  async getUserById(userId) {
    try {
      const user = await User.findByPk(userId, {
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'trafficQuota', 'usedTraffic', 'additionalPorts', 'portRangeStart', 'portRangeEnd']
      });
      return user;
    } catch (error) {
      console.error(`❌ [限制器] 获取用户信息失败:`, error);
      return null;
    }
  }

  /**
   * 清除用户配额缓存
   * @param {number} userId - 用户ID
   */
  clearUserQuotaCache(userId) {
    const cacheKey = `quota_${userId}`;
    this.cache.delete(cacheKey);
    console.log(`🧹 [限制器] 清除用户 ${userId} 配额缓存`);
  }

  /**
   * 清除所有配额缓存
   */
  clearAllQuotaCache() {
    this.cache.clear();
    console.log(`🧹 [限制器] 清除所有配额缓存`);
  }

  /**
   * 格式化字节数
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的字符串
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 2)}${units[unitIndex]}`;
  }

  /**
   * 获取配额统计信息
   * @returns {Object} 统计信息
   */
  getQuotaStats() {
    return {
      cacheSize: this.cache.size,
      cacheExpiry: this.cacheExpiry,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new GostLimiterService();
