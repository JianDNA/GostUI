/**
 * GOST认证器插件服务
 * 为GOST提供用户身份标识，配合限制器使用
 */

const { User, UserForwardRule } = require('../models');
const multiInstanceCacheService = require('./multiInstanceCacheService');

class GostAuthService {
  constructor() {
    this.cache = new Map(); // 缓存端口用户映射
    this.cacheExpiry = 60 * 1000; // 60秒缓存过期
  }

  /**
   * 处理GOST认证请求
   * @param {Object} request - GOST认证请求
   * @returns {Object} 认证响应
   */
  async handleAuthRequest(request) {
    try {
      const { service, network, addr, src } = request;
      
      console.log(`🔐 [认证器] 收到认证请求:`, {
        service,
        network,
        addr,
        src: src?.substring(0, 20) + '...'
      });

      // 解析用户信息
      const userInfo = await this.parseUserFromService(service);
      
      if (!userInfo) {
        console.log(`⚠️ [认证器] 无法解析用户信息，拒绝认证`);
        return { ok: false, id: '', secret: '' };
      }

      // 检查用户状态
      const user = await this.getUserById(userInfo.userId);
      if (!user) {
        console.log(`❌ [认证器] 用户 ${userInfo.userId} 不存在`);
        return { ok: false, id: '', secret: '' };
      }

      if (!user.isActive || user.userStatus !== 'active') {
        console.log(`❌ [认证器] 用户 ${user.username} 状态异常: ${user.userStatus}, active: ${user.isActive}`);
        return { ok: false, id: '', secret: '' };
      }

      // 认证成功，返回用户标识
      const clientId = `user_${user.id}`;
      console.log(`✅ [认证器] 用户 ${user.username} 认证成功，客户端ID: ${clientId}`);
      
      return {
        ok: true,
        id: clientId,           // 用户标识，传递给限制器
        secret: 'authenticated' // 认证令牌
      };

    } catch (error) {
      console.error(`❌ [认证器] 处理认证请求失败:`, error);
      return { ok: false, id: '', secret: '' };
    }
  }

  /**
   * 从服务名解析用户信息
   * @param {string} service - 服务名
   * @returns {Object|null} 用户信息
   */
  async parseUserFromService(service) {
    try {
      if (!service) {
        return null;
      }

      // 从服务名中提取端口号
      const portMatch = service.match(/forward-\w+-(\d+)/);
      if (!portMatch) {
        console.log(`⚠️ [认证器] 无法从服务名 ${service} 中提取端口号`);
        return null;
      }

      const port = parseInt(portMatch[1]);
      
      // 检查缓存
      const cacheKey = `port_${port}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }

      // 获取端口用户映射
      const userMapping = await multiInstanceCacheService.getPortUserMapping();
      
      if (!userMapping[port]) {
        console.log(`⚠️ [认证器] 端口 ${port} 没有对应的用户映射`);
        return null;
      }

      const userInfo = userMapping[port];
      
      // 缓存结果
      this.cache.set(cacheKey, { data: userInfo, timestamp: Date.now() });
      
      console.log(`🔍 [认证器] 端口 ${port} 映射到用户: ${userInfo.username} (ID: ${userInfo.userId})`);
      return userInfo;

    } catch (error) {
      console.error(`❌ [认证器] 解析用户信息失败:`, error);
      return null;
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
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'trafficQuota', 'usedTraffic']
      });
      return user;
    } catch (error) {
      console.error(`❌ [认证器] 获取用户信息失败:`, error);
      return null;
    }
  }

  /**
   * 清除端口映射缓存
   * @param {number} port - 端口号
   */
  clearPortCache(port) {
    const cacheKey = `port_${port}`;
    this.cache.delete(cacheKey);
    console.log(`🧹 [认证器] 清除端口 ${port} 缓存`);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    this.cache.clear();
    console.log(`🧹 [认证器] 清除所有缓存`);
  }

  /**
   * 验证用户凭据（用于基本认证）
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Object} 验证结果
   */
  async validateCredentials(username, password) {
    try {
      // 这里可以实现真正的用户名密码验证
      // 目前简化处理，主要依赖端口映射
      const user = await User.findOne({
        where: { username },
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus']
      });

      if (!user) {
        return { valid: false, reason: 'User not found' };
      }

      if (!user.isActive || user.userStatus !== 'active') {
        return { valid: false, reason: 'User inactive' };
      }

      // 简化的密码验证（实际应该使用加密密码）
      // 这里主要用于演示，实际部署时应该实现真正的密码验证
      return {
        valid: true,
        userId: user.id,
        username: user.username,
        role: user.role
      };

    } catch (error) {
      console.error(`❌ [认证器] 验证用户凭据失败:`, error);
      return { valid: false, reason: 'Validation error' };
    }
  }

  /**
   * 获取认证统计信息
   * @returns {Object} 统计信息
   */
  getAuthStats() {
    return {
      cacheSize: this.cache.size,
      cacheExpiry: this.cacheExpiry,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new GostAuthService();
