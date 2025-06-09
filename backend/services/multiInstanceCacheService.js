/**
 * 多实例缓存服务 - 支持 PM2 多进程部署
 * 使用 SQLite + 内存缓存 + 文件锁机制
 */

const fs = require('fs').promises;
const path = require('path');
const { models } = require('./dbService');
const { User, UserForwardRule } = models;

class MultiInstanceCacheService {
  constructor() {
    // 内存缓存（进程级别）
    this.memoryCache = new Map();
    this.portUserMapping = new Map();
    
    // 缓存配置
    this.config = {
      cacheTTL: 2 * 60 * 1000, // 2分钟（多实例环境下缩短TTL）
      syncInterval: 30 * 1000, // 30秒同步一次
      lockTimeout: 5000, // 文件锁超时
      maxRetries: 3
    };
    
    // 缓存文件路径（放在临时目录，避免触发 nodemon 重启）
    this.cacheDir = path.join(__dirname, '../cache');
    this.lockFile = path.join(this.cacheDir, '.cache.lock');
    this.cacheFile = path.join(this.cacheDir, '.shared-cache.json');
    
    // 定时器
    this.syncTimer = null;
    this.cleanupTimer = null;
    
    // 进程标识
    this.processId = process.pid;
    this.instanceId = process.env.PM2_INSTANCE_ID || process.env.NODE_APP_INSTANCE || '0';
    
    console.log(`💾 多实例缓存服务初始化 (PID: ${this.processId}, Instance: ${this.instanceId})`);
  }

  /**
   * 初始化缓存服务
   */
  async initialize() {
    try {
      // 创建缓存目录
      await this.ensureCacheDirectory();
      
      // 启动同步定时器
      this.startSyncTimer();
      
      // 启动清理定时器
      this.startCleanupTimer();
      
      // 初始化端口用户映射
      await this.refreshPortUserMapping();
      
      console.log(`✅ 多实例缓存服务启动成功 (Instance: ${this.instanceId})`);
    } catch (error) {
      console.error('❌ 多实例缓存服务启动失败:', error);
    }
  }

  /**
   * 确保缓存目录存在
   */
  async ensureCacheDirectory() {
    try {
      await fs.access(this.cacheDir);
    } catch (error) {
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`📁 已创建缓存目录: ${this.cacheDir}`);
    }
  }

  /**
   * 获取文件锁
   */
  async acquireLock() {
    const maxAttempts = this.config.maxRetries;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const lockData = {
          processId: this.processId,
          instanceId: this.instanceId,
          timestamp: Date.now()
        };
        
        await fs.writeFile(this.lockFile, JSON.stringify(lockData), { flag: 'wx' });
        return true;
      } catch (error) {
        if (error.code === 'EEXIST') {
          // 锁文件存在，检查是否过期
          try {
            const lockContent = await fs.readFile(this.lockFile, 'utf8');
            const lockData = JSON.parse(lockContent);
            
            if (Date.now() - lockData.timestamp > this.config.lockTimeout) {
              // 锁已过期，删除并重试
              await fs.unlink(this.lockFile);
              console.log(`🔓 清理过期锁文件 (PID: ${lockData.processId})`);
              continue;
            }
          } catch (readError) {
            // 锁文件损坏，删除并重试
            await fs.unlink(this.lockFile).catch(() => {});
            continue;
          }
          
          // 等待后重试
          await this.sleep(100 * attempt);
        } else {
          throw error;
        }
      }
    }
    
    return false;
  }

  /**
   * 释放文件锁
   */
  async releaseLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (error) {
      // 忽略锁文件不存在的错误
    }
  }

  /**
   * 从共享缓存文件读取数据
   */
  async readSharedCache() {
    try {
      const cacheContent = await fs.readFile(this.cacheFile, 'utf8');
      return JSON.parse(cacheContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { users: {}, portMapping: {}, lastUpdate: 0 };
      }
      throw error;
    }
  }

  /**
   * 写入共享缓存文件
   */
  async writeSharedCache(data) {
    const cacheData = {
      ...data,
      lastUpdate: Date.now(),
      updatedBy: this.instanceId
    };
    
    await fs.writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
  }

  /**
   * 同步缓存数据
   */
  async syncCache() {
    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      console.log(`⚠️ 实例 ${this.instanceId} 无法获取锁，跳过同步`);
      return;
    }

    try {
      // 读取共享缓存
      const sharedCache = await this.readSharedCache();

      // 🔧 从数据库获取最新数据（带重试机制）
      const users = await this.queryUsersWithRetry();

      const rules = await UserForwardRule.findAll({
        where: { isActive: true },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'expiryDate']
        }]
      });

      // 构建新的缓存数据
      const newCacheData = {
        users: {},
        portMapping: {}
      };

      // 用户数据
      for (const user of users) {
        // 构建端口范围数组
        const portRanges = [];
        if (user.portRangeStart && user.portRangeEnd) {
          portRanges.push({
            start: user.portRangeStart,
            end: user.portRangeEnd
          });
        }

        newCacheData.users[user.id] = {
          id: user.id,
          username: user.username,
          expiryDate: user.expiryDate,
          trafficQuota: user.trafficQuota,
          usedTraffic: user.usedTraffic || 0,
          portRanges: portRanges,
          isActive: !user.expiryDate || new Date(user.expiryDate) > new Date(), // 简化活跃状态判断
          lastUpdate: Date.now()
        };
      }

      // 端口映射
      for (const rule of rules) {
        if (rule.user) {
          const isUserActive = !rule.user.expiryDate || new Date(rule.user.expiryDate) > new Date();
          
          if (isUserActive) {
            newCacheData.portMapping[rule.sourcePort] = {
              userId: rule.user.id,
              username: rule.user.username,
              ruleId: rule.id,
              ruleName: rule.name
            };
          }
        }
      }

      // 写入共享缓存
      await this.writeSharedCache(newCacheData);
      
      // 更新内存缓存
      this.memoryCache.clear();
      this.portUserMapping.clear();
      
      for (const [userId, userData] of Object.entries(newCacheData.users)) {
        this.memoryCache.set(`user:${userId}`, {
          value: userData,
          expireTime: Date.now() + this.config.cacheTTL
        });
      }
      
      for (const [port, mapping] of Object.entries(newCacheData.portMapping)) {
        this.portUserMapping.set(parseInt(port), mapping);
      }

      console.log(`🔄 实例 ${this.instanceId} 缓存同步完成: ${users.length} 用户, ${Object.keys(newCacheData.portMapping).length} 端口`);

    } finally {
      await this.releaseLock();
    }
  }

  /**
   * 获取用户缓存数据
   */
  getUserCache(userId) {
    const cached = this.memoryCache.get(`user:${userId}`);
    
    if (!cached) {
      return null;
    }
    
    // 检查是否过期
    if (Date.now() > cached.expireTime) {
      this.memoryCache.delete(`user:${userId}`);
      return null;
    }
    
    return cached.value;
  }

  /**
   * 更新用户缓存
   */
  setUserCache(userId, userData) {
    this.memoryCache.set(`user:${userId}`, {
      value: userData,
      expireTime: Date.now() + this.config.cacheTTL
    });
  }

  /**
   * 获取端口用户映射
   */
  getPortUserMapping() {
    const result = {};
    for (const [port, mapping] of this.portUserMapping.entries()) {
      result[port] = mapping;
    }
    return result;
  }

  /**
   * 刷新端口用户映射
   */
  async refreshPortUserMapping() {
    try {
      // 触发缓存同步
      await this.syncCache();
    } catch (error) {
      console.error('❌ 刷新端口用户映射失败:', error);
    }
  }

  /**
   * 检查用户是否可以使用指定端口
   */
  async canUserUsePort(userId, port) {
    try {
      // 先检查内存缓存
      const cachedUser = this.getUserCache(userId);
      if (cachedUser) {
        return this.checkPortInRanges(port, cachedUser.portRanges) && cachedUser.isActive;
      }

      // 缓存未命中，查询数据库
      const user = await User.findByPk(userId, {
        attributes: ['id', 'expiryDate', 'portRangeStart', 'portRangeEnd']
      });

      if (!user) {
        return false;
      }

      const isActive = !user.expiryDate || new Date(user.expiryDate) > new Date();
      
      // 构建端口范围数组
      const portRanges = [];
      if (user.portRangeStart && user.portRangeEnd) {
        portRanges.push({
          start: user.portRangeStart,
          end: user.portRangeEnd
        });
      }

      return this.checkPortInRanges(port, portRanges) && isActive;
    } catch (error) {
      console.error(`❌ 检查用户 ${userId} 端口 ${port} 权限失败:`, error);
      return false;
    }
  }

  /**
   * 检查端口是否在范围内
   */
  checkPortInRanges(port, portRanges) {
    if (!Array.isArray(portRanges) || portRanges.length === 0) {
      return false;
    }

    for (const range of portRanges) {
      if (typeof range === 'object' && range.start && range.end) {
        if (port >= range.start && port <= range.end) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 更新用户流量（直接操作数据库）
   */
  async updateUserTraffic(userId, additionalBytes) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error(`用户 ${userId} 不存在`);
      }

      const newUsedTraffic = (user.usedTraffic || 0) + additionalBytes;
      await user.update({ usedTraffic: newUsedTraffic });

      // 更新内存缓存
      const cachedUser = this.getUserCache(userId);
      if (cachedUser) {
        cachedUser.usedTraffic = newUsedTraffic;
        cachedUser.lastUpdate = Date.now();
        this.setUserCache(userId, cachedUser);
      }

      return newUsedTraffic;
    } catch (error) {
      console.error(`❌ 更新用户 ${userId} 流量失败:`, error);
      throw error;
    }
  }

  /**
   * 重置用户流量缓存
   */
  async resetUserTrafficCache(userId) {
    const cachedUser = this.getUserCache(userId);
    if (cachedUser) {
      cachedUser.usedTraffic = 0;
      cachedUser.lastUpdate = Date.now();
      this.setUserCache(userId, cachedUser);
      console.log(`✅ 用户 ${userId} 的流量缓存已重置为 0`);
    }
  }

  /**
   * 清理用户缓存
   */
  clearUserCache(userId) {
    this.memoryCache.delete(`user:${userId}`);
    console.log(`✅ 已清理用户 ${userId} 的缓存`);
  }

  /**
   * 启动同步定时器
   */
  startSyncTimer() {
    this.syncTimer = setInterval(async () => {
      await this.syncCache();
    }, this.config.syncInterval);
    
    console.log(`⏰ 缓存同步定时器已启动，间隔: ${this.config.syncInterval / 1000} 秒`);
  }

  /**
   * 启动清理定时器
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredCache();
    }, 60 * 1000); // 每分钟清理一次
    
    console.log('⏰ 缓存清理定时器已启动');
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, cached] of this.memoryCache.entries()) {
      if (now > cached.expireTime) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 实例 ${this.instanceId} 已清理 ${cleanedCount} 个过期缓存条目`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      processId: this.processId,
      instanceId: this.instanceId,
      memoryCacheSize: this.memoryCache.size,
      portMappingSize: this.portUserMapping.size,
      cacheType: 'multi-instance',
      syncInterval: this.config.syncInterval,
      cacheTTL: this.config.cacheTTL
    };
  }

  /**
   * 🔧 带重试机制的用户查询
   */
  async queryUsersWithRetry() {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await User.findAll({
          attributes: ['id', 'username', 'expiryDate', 'trafficQuota', 'usedTraffic', 'portRangeStart', 'portRangeEnd']
        });
      } catch (error) {
        if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'SQLITE_IOERR') {
          console.warn(`⚠️ 数据库I/O错误，重试查询用户 ${attempt}/${maxRetries}`);

          if (attempt < maxRetries) {
            await this.sleep(Math.pow(2, attempt) * 1000); // 指数退避
            continue;
          }
        }

        console.error(`❌ 查询用户失败 (尝试 ${attempt}/${maxRetries}):`, error);
        throw error;
      }
    }
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清理资源
   */
  async cleanup() {
    console.log(`🧹 开始清理多实例缓存服务 (Instance: ${this.instanceId})...`);

    // 停止定时器
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 释放锁
    await this.releaseLock();

    // 清空内存缓存
    this.memoryCache.clear();
    this.portUserMapping.clear();

    console.log(`✅ 多实例缓存服务清理完成 (Instance: ${this.instanceId})`);
  }
}

// 创建单例实例
const multiInstanceCacheService = new MultiInstanceCacheService();

module.exports = multiInstanceCacheService;
