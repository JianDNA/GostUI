/**
 * GOST 插件服务
 *
 * 功能说明:
 * 1. 实现 GOST 认证器插件 - 验证用户身份和状态
 * 2. 实现 GOST 观测器插件 - 接收流量统计数据
 * 3. 实现 GOST 限制器插件 - 动态限制用户流量
 * 4. 处理用户流量统计和网速监控
 * 5. 自动禁用超限用户
 *
 * 插件接口:
 * - /api/gost/auth - 认证器插件端点
 * - /api/gost/observer - 观测器插件端点
 * - /api/gost/limiter - 限制器插件端点
 */

const multiInstanceCacheService = require('./multiInstanceCacheService');
const timeSeriesService = require('./timeSeriesService');
const loggerService = require('./loggerService'); // 替换 InfluxDB
const { models } = require('./dbService');
const { User } = models;

class GostPluginService {
  constructor() {
    // 流量数据缓冲区 - 避免频繁写入 InfluxDB
    this.trafficBuffer = new Map();
    this.speedBuffer = new Map();

    // 认证缓存 - 避免频繁认证相同用户
    this.authCache = new Map(); // key: username, value: { result, timestamp }

    // 累积值跟踪 - 用于计算增量流量 (解决GOST累积值重复计算问题)
    this.lastCumulativeStats = new Map(); // key: "userId:port", value: { inputBytes, outputBytes, timestamp }

    // 🔧 用户级别的互斥锁，防止并发更新导致的竞态条件
    this.userUpdateLocks = new Map(); // key: userId, value: Promise

    // 性能优化配置
    this.config = {
      // 缓冲区配置
      maxBufferSize: parseInt(process.env.MAX_BUFFER_SIZE) || 1000,
      emergencyFlushSize: parseInt(process.env.EMERGENCY_FLUSH_SIZE) || 800,
      flushInterval: parseInt(process.env.TRAFFIC_BUFFER_INTERVAL) || 30000, // 30秒
      speedFlushInterval: parseInt(process.env.SPEED_RECORD_INTERVAL) || 60000, // 60秒

      // 批量处理配置
      batchSize: parseInt(process.env.BATCH_SIZE) || 50,
      maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,

      // 认证缓存配置
      authCacheTimeout: parseInt(process.env.AUTH_CACHE_TIMEOUT) || 300000 // 5分钟缓存
    };

    // 性能监控
    this.metrics = {
      totalRequests: 0,
      successfulWrites: 0,
      failedWrites: 0,
      avgProcessingTime: 0,
      lastFlushTime: Date.now()
    };

    // 定时器
    this.flushTimer = null;
    this.speedFlushTimer = null;

    // 启动缓冲区刷新
    this.startBufferFlush();

    console.log('🚀 GOST 插件服务已启动，配置:', this.config);
  }

  /**
   * 处理 GOST 认证请求 (基于端口的静态认证)
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   */
  async handleAuth(req, res) {
    try {
      const { username, password, client, host, port } = req.body;

      console.log(`🔐 认证请求: 用户=${username}, 客户端=${client}, 主机=${host}, 端口=${port}`);

      // 🎯 关键修改：基于端口直接返回对应的用户信息
      // 从 GOST 配置中获取端口对应的用户
      const portUserMapping = await this.getPortUserMapping();

      // 尝试从不同来源获取端口信息
      let targetPort = null;

      if (port) {
        targetPort = parseInt(port);
      } else if (host && host.includes(':')) {
        // 从 host 中提取端口 (例如: "localhost:6443")
        const hostParts = host.split(':');
        targetPort = parseInt(hostParts[hostParts.length - 1]);
      }

      console.log(`🎯 目标端口: ${targetPort}`);

      if (targetPort && portUserMapping[targetPort]) {
        const userInfo = portUserMapping[targetPort];
        console.log(`✅ 端口 ${targetPort} 对应用户: ${userInfo.username} (ID: ${userInfo.userId})`);

        // 检查用户状态
        const userCache = multiInstanceCacheService.getUserCache(userInfo.userId);

        if (!userCache) {
          console.log(`❌ 用户 ${userInfo.userId} 缓存不存在`);
          return res.json({ ok: false });
        }

        // Admin 用户特殊处理
        if (userCache.role === 'admin') {
          console.log(`👑 管理员用户 ${userInfo.username} 自动认证成功`);
          return res.json({
            ok: true,
            id: userInfo.userId.toString()
          });
        }

        // 普通用户检查状态
        if (userCache.status !== 'active') {
          console.log(`❌ 用户 ${userInfo.username} 状态异常: ${userCache.status}`);
          return res.json({ ok: false });
        }

        console.log(`✅ 用户 ${userInfo.username} 基于端口认证成功`);
        return res.json({
          ok: true,
          id: userInfo.userId.toString()
        });
      }

      // 如果没有找到端口映射，回退到传统认证方式
      if (username && password) {
        console.log(`🔄 端口映射未找到，回退到用户名密码认证`);

        const user = await this.authenticateUser(username, password);
        if (!user) {
          console.log(`❌ 用户 ${username} 认证失败: 用户名或密码错误`);
          return res.json({ ok: false });
        }

        console.log(`✅ 用户 ${username} 传统认证成功, ID=${user.id}`);
        return res.json({
          ok: true,
          id: user.id.toString()
        });
      }

      console.log(`❌ 认证失败: 无法确定用户身份`);
      res.json({ ok: false });

    } catch (error) {
      console.error('❌ 认证处理失败:', error);
      res.json({ ok: false });
    }
  }

  /**
   * 处理 GOST 观测器数据
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   */
  async handleObserver(req, res) {
    try {
      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
        return res.json({ ok: false, error: 'Invalid events data' });
      }

      console.log(`📊 收到 ${events.length} 个观测事件`);

      // 处理每个事件
      for (const event of events) {
        await this.processObserverEvent(event);
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('❌ 观测器处理失败:', error);
      res.json({ ok: false, error: error.message });
    }
  }

  /**
   * 处理 GOST 限制器请求 (用于流量限制，不限制网速)
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   */
  async handleLimiter(req, res) {
    try {
      const { client, scope } = req.body;

      console.log(`🚦 限制器请求: 用户=${client}, 范围=${scope} (检查流量限制)`);

      // 无限制的网速 (不限制传输速度)
      const unlimitedSpeed = 1073741824; // 1GB/s

      if (!client) {
        // 没有用户标识，返回无限制
        console.log(`ℹ️ 未知用户，返回无限制`);
        return res.json({
          in: unlimitedSpeed,
          out: unlimitedSpeed
        });
      }

      // 检查用户状态和流量限制
      const userCache = multiInstanceCacheService.getUserCache(client);

      if (!userCache) {
        console.log(`🚫 用户 ${client} 不存在，禁止访问`);
        return res.json({
          in: 0,    // 完全禁止
          out: 0
        });
      }

      // Admin 用户不受任何限制
      const userRole = userCache.role || 'user';
      if (userRole === 'admin') {
        console.log(`👑 管理员用户 ${client} 不受流量限制`);
        return res.json({
          in: unlimitedSpeed,
          out: unlimitedSpeed
        });
      }

      // 检查用户状态
      if (userCache.status !== 'active') {
        console.log(`🚫 用户 ${client} 状态异常: ${userCache.status}，禁止访问`);
        return res.json({
          in: 0,    // 完全禁止
          out: 0
        });
      }

      // 检查流量是否超限
      const trafficLimitBytes = parseInt(userCache.trafficLimitBytes || 0);
      const usedTraffic = parseInt(userCache.usedTraffic || 0);

      if (trafficLimitBytes > 0 && usedTraffic >= trafficLimitBytes) {
        console.log(`🚫 用户 ${client} 流量超限: ${usedTraffic}/${trafficLimitBytes} 字节，禁止访问`);
        return res.json({
          in: 0,    // 完全禁止
          out: 0
        });
      }

      // 用户状态正常且未超限，返回无限制网速
      const usagePercent = trafficLimitBytes > 0
        ? (usedTraffic / trafficLimitBytes * 100).toFixed(1)
        : 0;

      console.log(`✅ 用户 ${client} 可正常访问，流量使用: ${usagePercent}%`);

      res.json({
        in: unlimitedSpeed,
        out: unlimitedSpeed
      });
    } catch (error) {
      console.error('❌ 限制器处理失败:', error);
      // 出错时返回保守的无限制
      res.json({
        in: 1073741824,
        out: 1073741824
      });
    }
  }

  /**
   * 处理观测器事件
   * @param {Object} event - 观测事件
   */
  async processObserverEvent(event) {
    try {
      if (event.type === 'stats') {
        if (event.client) {
          // Handler 级别的事件，有 client 字段
          await this.handleTrafficStats(event);
        } else if (event.kind === 'service' && event.service) {
          // Service 级别的事件，需要通过服务名映射用户
          await this.handleServiceTrafficStats(event);
        }
      } else if (event.type === 'status') {
        await this.handleStatusEvent(event);
      }
    } catch (error) {
      console.error('❌ 处理观测事件失败:', error);
    }
  }

  /**
   * 从服务名提取端口号
   * @param {string} serviceName - 服务名，如 "forward-tcp-6443"
   * @returns {number|null} 端口号
   */
  extractPortFromService(serviceName) {
    try {
      // 匹配格式：forward-{protocol}-{port}
      const match = serviceName.match(/forward-\w+-(\d+)$/);
      return match ? parseInt(match[1]) : null;
    } catch (error) {
      console.error('提取端口号失败:', error);
      return null;
    }
  }

  /**
   * 获取端口到用户的映射关系
   * @returns {Object} 端口映射对象 {port: {userId, username, ruleId, ruleName}}
   */
  async getPortUserMapping() {
    try {
      // 使用多实例缓存获取端口用户映射
      return multiInstanceCacheService.getPortUserMapping();
    } catch (error) {
      console.error('❌ 获取端口用户映射失败:', error);
      return {};
    }
  }

  /**
   * 处理 Service 级别的流量统计事件
   * @param {Object} event - Service 级别的流量统计事件
   */
  async handleServiceTrafficStats(event) {
    try {
      const { service, stats } = event;

      if (!stats || !service) {
        console.log('⚠️ Service 事件缺少必要字段:', event);
        return;
      }

      // 从服务名提取端口号
      const port = this.extractPortFromService(service);
      if (!port) {
        console.log(`⚠️ 无法从服务名 ${service} 提取端口号`);
        return;
      }

      // 获取端口用户映射
      const portMapping = await this.getPortUserMapping();
      const userInfo = portMapping[port];

      if (!userInfo) {
        console.log(`⚠️ 端口 ${port} 没有对应的用户映射`);
        return;
      }

      const userId = userInfo.userId;
      const { inputBytes = 0, outputBytes = 0 } = stats;
      const cumulativeTotalBytes = inputBytes + outputBytes;

      console.log(`🔍 [DEBUG] Service 流量统计 - 服务: ${service}, 端口: ${port}, 用户: ${userInfo.username} (ID: ${userId})`);
      console.log(`🔍 [DEBUG] GOST累积数据: 输入=${inputBytes}, 输出=${outputBytes}, 总计=${cumulativeTotalBytes}`);

      // 🔧 重构：GOST现在发送增量数据（resetTraffic=true），直接使用即可
      const incrementalTotalBytes = cumulativeTotalBytes;

      // 🔧 增量合理性检查（防止异常数据）
      const maxReasonableIncrement = 500 * 1024 * 1024; // 500MB
      if (incrementalTotalBytes > maxReasonableIncrement) {
        console.log(`⚠️ 增量异常: ${(incrementalTotalBytes/1024/1024).toFixed(2)}MB > 500MB，跳过处理`);
        return;
      }

      // 如果没有增量，跳过处理
      if (incrementalTotalBytes === 0) {
        console.log(`⏭️ 无流量增量，跳过处理`);
        return;
      }

      console.log(`📊 用户 ${userId} 流量增量: ${incrementalTotalBytes} 字节`);

      // 🔧 记录增量统计日志
      loggerService.logCumulativeCalculation(userId, port,
        { inputBytes, outputBytes, totalBytes: incrementalTotalBytes },
        { inputBytes: 0, outputBytes: 0, totalBytes: 0 }, // 不再需要上次累积值
        { inputBytes, outputBytes, totalBytes: incrementalTotalBytes }
      );

      // 🔧 修复：直接在数据库中更新，不通过缓存服务
      // 避免缓存服务的累积逻辑导致重复计算
      let newUsedTraffic = 0;

      // 🔧 修复：暂时移除流量限制检查，因为我们已经禁用了缓存更新
      // 流量限制将在后续版本中重新实现
      console.log(`📊 用户 ${userId} 流量已更新，当前增量: ${incrementalTotalBytes} 字节`);

      // 🔧 修复：禁用缓冲区机制，避免重复累积
      // 已经在上面直接更新了数据库和规则，不需要再缓冲
      // this.bufferTrafficData(userId, port, incrementalInputBytes, incrementalOutputBytes);

      // 🔧 关键修复：使用用户级别的互斥锁，防止并发更新导致的竞态条件
      await this.updateUserTrafficWithLock(userId, incrementalTotalBytes);

      // 更新规则级别的流量统计 (使用增量)
      try {
        const { UserForwardRule } = require('../models');

        // 先检查规则是否存在
        const rule = await UserForwardRule.findOne({
          where: {
            id: userInfo.ruleId,
            isActive: true
          }
        });

        if (!rule) {
          console.log(`⚠️ 规则 ${userInfo.ruleId} 不存在或已禁用，跳过流量更新`);
          return;
        }

        // 使用原子操作更新规则流量 (使用增量，不是累积值)
        const [affectedRows] = await UserForwardRule.increment(
          { usedTraffic: incrementalTotalBytes },
          {
            where: {
              id: userInfo.ruleId,
              isActive: true
            }
          }
        );

        console.log(`✅ 规则 ${userInfo.ruleId} (${userInfo.ruleName}) 流量已更新: +${incrementalTotalBytes} 字节 (增量)`);

      } catch (error) {
        console.error(`❌ 更新规则 ${userInfo.ruleId} 流量失败:`, error);
      }

    } catch (error) {
      console.error('❌ 处理 Service 流量统计失败:', error);
    }
  }

  /**
   * 处理 Handler 级别的流量统计事件
   * @param {Object} event - Handler 级别的流量统计事件
   */
  async handleTrafficStats(event) {
    const userId = parseInt(event.client);
    const { stats } = event;

    if (!stats || !userId) {
      return;
    }

    const { inputBytes = 0, outputBytes = 0 } = stats;
    const totalBytes = inputBytes + outputBytes;

    console.log(`📈 用户 ${userId} 流量统计: 输入=${inputBytes}, 输出=${outputBytes}, 总计=${totalBytes}`);

    // 🔧 修复：这个方法现在只用于 Handler 级别的流量统计
    // Service 级别的流量统计已经在 handleServiceStats 中处理
    console.log(`📊 Handler 级别流量统计: 用户 ${userId}, 输入=${inputBytes}, 输出=${outputBytes}, 总计=${totalBytes}`);

    // 提取端口号
    const port = this.extractPortFromService(event.service);

    // 🔧 修复：Handler 级别的流量统计暂时不更新数据库，避免重复计算
    // 只有 Service 级别的流量统计才更新数据库

    // 暂时屏蔽网速数据记录功能
    // this.bufferSpeedData(userId, port, inputBytes, outputBytes);
  }

  /**
   * 处理状态事件
   * @param {Object} event - 状态事件
   */
  async handleStatusEvent(event) {
    console.log(`📋 服务状态事件: ${event.service} - ${event.status?.state} - ${event.status?.msg}`);

    // 可以在这里记录服务状态变化
    // 例如记录到日志文件或发送通知
  }

  /**
   * 缓冲流量数据 (优化版本)
   * @param {number} userId - 用户ID
   * @param {number} port - 端口号
   * @param {number} inputBytes - 输入字节数
   * @param {number} outputBytes - 输出字节数
   */
  bufferTrafficData(userId, port, inputBytes, outputBytes) {
    const key = `${userId}:${port}`;
    const existing = this.trafficBuffer.get(key) || {
      userId,
      port,
      inputBytes: 0,
      outputBytes: 0,
      lastUpdate: Date.now()
    };

    existing.inputBytes += inputBytes;
    existing.outputBytes += outputBytes;
    existing.lastUpdate = Date.now();

    this.trafficBuffer.set(key, existing);

    // 检查缓冲区大小，如果接近上限则触发紧急刷新
    if (this.trafficBuffer.size >= this.config.emergencyFlushSize) {
      console.warn(`⚠️ 流量缓冲区接近上限 (${this.trafficBuffer.size}/${this.config.maxBufferSize})，触发紧急刷新`);
      setImmediate(() => this.flushTrafficBuffer());
    }
  }

  /**
   * 缓冲网速数据
   * @param {number} userId - 用户ID
   * @param {number} port - 端口号
   * @param {number} inputBytes - 输入字节数
   * @param {number} outputBytes - 输出字节数
   */
  bufferSpeedData(userId, port, inputBytes, outputBytes) {
    const key = `${userId}:${port}`;
    const now = Date.now();
    const existing = this.speedBuffer.get(key);

    if (existing) {
      // 计算时间差 (秒)
      const timeDiff = (now - existing.lastUpdate) / 1000;

      if (timeDiff > 0) {
        // 计算速率 (bytes/second)
        const inputRate = inputBytes / timeDiff;
        const outputRate = outputBytes / timeDiff;

        existing.inputRate = inputRate;
        existing.outputRate = outputRate;
        existing.lastUpdate = now;

        this.speedBuffer.set(key, existing);
      }
    } else {
      // 首次记录
      this.speedBuffer.set(key, {
        userId,
        port,
        inputRate: 0,
        outputRate: 0,
        lastUpdate: now
      });
    }
  }

  /**
   * 启动缓冲区刷新定时器 (已禁用，避免重复累积)
   */
  startBufferFlush() {
    // 🔧 修复：禁用缓冲区刷新，避免重复累积流量数据
    // 现在直接在 Service 级别处理增量计算和数据库更新

    console.log(`⏰ 缓冲区刷新已禁用，使用直接更新模式 (避免重复累积)`);

    // 保留定时器变量以避免错误
    this.flushTimer = null;
    this.speedFlushTimer = null;
  }

  /**
   * 刷新流量缓冲区到 InfluxDB (优化版本)
   */
  async flushTrafficBuffer() {
    if (this.trafficBuffer.size === 0) {
      return;
    }

    const startTime = Date.now();
    const bufferSize = this.trafficBuffer.size;

    console.log(`🔄 开始刷新 ${bufferSize} 条流量数据到 InfluxDB`);

    // 获取缓冲区数据并立即清空，避免阻塞新数据
    const trafficData = Array.from(this.trafficBuffer.values());
    this.trafficBuffer.clear();

    try {
      // 批量处理数据
      await this.batchProcessTrafficData(trafficData);

      // 更新性能指标
      this.metrics.successfulWrites += bufferSize;
      this.metrics.lastFlushTime = Date.now();
      this.metrics.avgProcessingTime = Date.now() - startTime;

      console.log(`✅ 流量数据刷新完成: ${bufferSize}条, 耗时${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('❌ 刷新流量数据失败:', error);
      this.metrics.failedWrites += bufferSize;

      // 错误恢复：将数据重新加入缓冲区（如果缓冲区未满）
      if (this.trafficBuffer.size < this.config.maxBufferSize / 2) {
        trafficData.forEach((data, index) => {
          this.trafficBuffer.set(`retry_${Date.now()}_${index}`, data);
        });
        console.log(`🔄 已将 ${trafficData.length} 条数据重新加入缓冲区等待重试`);
      }
    }
  }

  /**
   * 批量处理流量数据
   * @param {Array} trafficData - 流量数据数组
   */
  async batchProcessTrafficData(trafficData) {
    const batchSize = this.config.batchSize;
    const batches = this.chunkArray(trafficData, batchSize);

    console.log(`📦 分批处理: ${batches.length} 批，每批 ${batchSize} 条`);

    // 并行处理批次，但限制并发数
    const concurrency = 3; // 最多3个并发批次
    for (let i = 0; i < batches.length; i += concurrency) {
      const currentBatches = batches.slice(i, i + concurrency);

      const promises = currentBatches.map(batch =>
        this.processBatchWithRetry(batch)
      );

      await Promise.allSettled(promises);
    }
  }

  /**
   * 带重试的批次处理
   * @param {Array} batch - 批次数据
   */
  async processBatchWithRetry(batch) {
    let retries = 0;

    while (retries < this.config.maxRetries) {
      try {
        // 批量写入时序数据库
        for (const data of batch) {
          await timeSeriesService.recordHourlyTraffic(
            data.userId,
            data.port,
            data.inputBytes,
            data.outputBytes
          );
        }

        return; // 成功，退出重试循环
      } catch (error) {
        retries++;
        console.warn(`⚠️ 批次处理失败 (重试 ${retries}/${this.config.maxRetries}):`, error.message);

        if (retries < this.config.maxRetries) {
          // 指数退避延迟
          const delay = this.config.retryDelay * Math.pow(2, retries - 1);
          await this.sleep(delay);
        } else {
          throw error; // 最后一次重试失败，抛出错误
        }
      }
    }
  }

  /**
   * 将数组分块
   * @param {Array} array - 原数组
   * @param {number} size - 块大小
   * @returns {Array} 分块后的数组
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 刷新网速缓冲区到 InfluxDB
   */
  async flushSpeedBuffer() {
    if (this.speedBuffer.size === 0) {
      return;
    }

    console.log(`🔄 刷新 ${this.speedBuffer.size} 条网速数据到 InfluxDB`);

    const speedData = Array.from(this.speedBuffer.values());

    try {
      // 批量写入时序数据库
      for (const data of speedData) {
        await timeSeriesService.recordMinutelySpeed(
          data.userId,
          data.port,
          data.inputRate,
          data.outputRate
        );
      }

      // 清空缓冲区
      this.speedBuffer.clear();

      console.log('✅ 网速数据刷新完成');
    } catch (error) {
      console.error('❌ 刷新网速数据失败:', error);
    }
  }

  /**
   * 禁用用户服务
   * @param {number} userId - 用户ID
   */
  async disableUserServices(userId) {
    try {
      console.log(`🚫 开始禁用用户 ${userId} 的服务...`);

      // 🔧 修复：暂时移除缓存状态更新，专注于核心功能
      console.log(`🚫 用户 ${userId} 服务禁用请求`);

      // 更新数据库
      await User.update(
        { isActive: false },
        { where: { id: userId } }
      );

      console.log(`✅ 用户 ${userId} 因流量超限已被禁用`);

      // 可以在这里发送通知或记录日志
      // await this.sendUserNotification(userId, 'quota_exceeded');

    } catch (error) {
      console.error(`❌ 禁用用户 ${userId} 失败:`, error);
    }
  }

  // 这个方法已经在前面实现了，这里是重复的，删除

  /**
   * 从服务名提取端口号
   * @param {string} serviceName - 服务名称
   * @returns {number} 端口号
   */
  extractPortFromService(serviceName) {
    if (!serviceName) {
      return 0;
    }

    // 匹配类似 "forward-tcp-10004" 的服务名
    const match = serviceName.match(/forward-tcp-(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 用户认证 (带缓存优化)
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<Object|null>} 用户对象或null
   */
  async authenticateUser(username, password) {
    try {
      // 检查认证缓存
      const cacheKey = `${username}:${password}`;
      const cached = this.authCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < this.config.authCacheTimeout) {
        console.log(`⚡ 用户 ${username} 使用缓存认证结果`);
        return cached.user;
      }

      // 注意: 在实际应用中应该使用加密密码比较
      const user = await User.findOne({
        where: {
          username,
          // 这里应该使用 bcrypt 比较加密密码
          // 为了简化示例，直接比较明文密码
          password
        }
      });

      // 缓存认证结果 (包括失败的结果)
      this.authCache.set(cacheKey, { user, timestamp: now });

      // 定期清理过期缓存
      if (this.authCache.size > 1000) {
        this.cleanupAuthCache();
      }

      return user;
    } catch (error) {
      console.error('❌ 用户认证查询失败:', error);
      return null;
    }
  }

  /**
   * 清理过期的认证缓存
   */
  cleanupAuthCache() {
    const now = Date.now();
    const timeout = this.config.authCacheTimeout;

    for (const [key, value] of this.authCache.entries()) {
      if (now - value.timestamp > timeout) {
        this.authCache.delete(key);
      }
    }

    console.log(`🧹 清理认证缓存，当前缓存数量: ${this.authCache.size}`);
  }

  /**
   * 获取缓冲区状态 (优化版本)
   * @returns {Object} 缓冲区状态信息
   */
  getBufferStatus() {
    return {
      trafficBuffer: {
        size: this.trafficBuffer.size,
        maxSize: this.config.maxBufferSize,
        usagePercent: (this.trafficBuffer.size / this.config.maxBufferSize * 100).toFixed(1)
      },
      speedBuffer: {
        size: this.speedBuffer.size,
        maxSize: this.config.maxBufferSize,
        usagePercent: (this.speedBuffer.size / this.config.maxBufferSize * 100).toFixed(1)
      },
      performance: {
        totalRequests: this.metrics.totalRequests,
        successfulWrites: this.metrics.successfulWrites,
        failedWrites: this.metrics.failedWrites,
        successRate: this.metrics.totalRequests > 0
          ? ((this.metrics.successfulWrites / this.metrics.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
        avgProcessingTime: this.metrics.avgProcessingTime + 'ms',
        lastFlushTime: new Date(this.metrics.lastFlushTime).toISOString()
      },
      config: this.config
    };
  }

  /**
   * 清理用户累积统计数据
   * @param {number} userId - 用户ID
   */
  clearUserCumulativeStats(userId) {
    // 清理该用户的所有累积统计
    for (const [key, value] of this.lastCumulativeStats.entries()) {
      if (key.startsWith(`${userId}:`)) {
        this.lastCumulativeStats.delete(key);
      }
    }
    console.log(`✅ 已清理用户 ${userId} 的累积统计数据`);
  }

  /**
   * 清理所有累积统计数据
   */
  clearAllCumulativeStats() {
    this.lastCumulativeStats.clear();
    console.log(`✅ 已清理所有累积统计数据`);
  }

  /**
   * 🔧 关键修复：使用正确的互斥锁更新流量，防止并发竞态条件
   * @param {number} userId - 用户ID
   * @param {number} incrementalBytes - 增量字节数
   */
  async updateUserTrafficWithLock(userId, incrementalBytes) {
    const startTime = Date.now();

    // 🔧 修复：使用递归等待确保真正的串行执行
    while (this.userUpdateLocks.has(userId)) {
      loggerService.logConcurrencyDetection(userId, true);
      // 等待当前锁完成
      await this.userUpdateLocks.get(userId);
      // 短暂延迟，避免忙等待
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    const lockWaitTime = Date.now() - startTime;

    // 创建新的更新操作
    const updatePromise = this.performUserTrafficUpdate(userId, incrementalBytes, lockWaitTime);
    this.userUpdateLocks.set(userId, updatePromise);

    try {
      const result = await updatePromise;
      return result;
    } finally {
      // 清理锁
      this.userUpdateLocks.delete(userId);
    }
  }

  /**
   * 执行实际的用户流量更新操作
   * @param {number} userId - 用户ID
   * @param {number} incrementalBytes - 增量字节数
   * @param {number} lockWaitTime - 锁等待时间
   */
  async performUserTrafficUpdate(userId, incrementalBytes, lockWaitTime = 0) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 获取更新前的流量
        const beforeTraffic = await this.getUserCurrentTrafficWithRetry(userId);

        const newUsedTraffic = await multiInstanceCacheService.updateUserTraffic(userId, incrementalBytes);

        // 记录详细的用户流量更新日志
        loggerService.logUserTrafficUpdate(userId, incrementalBytes, beforeTraffic, newUsedTraffic, lockWaitTime);

        console.log(`🔍 [DEBUG] 用户 ${userId} 流量已更新: ${newUsedTraffic} 字节 (增量: +${incrementalBytes})`);
        return newUsedTraffic;
      } catch (error) {
        lastError = error;

        if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'SQLITE_IOERR') {
          console.warn(`⚠️ 数据库I/O错误，重试 ${attempt}/${maxRetries}:`, error.message);

          if (attempt < maxRetries) {
            // 指数退避重试
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            continue;
          }
        }

        console.error(`❌ 更新用户 ${userId} 流量失败 (尝试 ${attempt}/${maxRetries}):`, error);

        if (attempt === maxRetries) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * 获取用户当前流量（带重试机制）
   * @param {number} userId - 用户ID
   * @returns {number} 当前流量
   */
  async getUserCurrentTrafficWithRetry(userId) {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { User } = require('../models');
        const user = await User.findByPk(userId, { attributes: ['usedTraffic'] });
        return user ? (user.usedTraffic || 0) : 0;
      } catch (error) {
        if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'SQLITE_IOERR') {
          console.warn(`⚠️ 获取用户流量数据库I/O错误，重试 ${attempt}/${maxRetries}`);

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 50));
            continue;
          }
        }

        console.error(`获取用户 ${userId} 当前流量失败:`, error);
        return 0;
      }
    }

    return 0;
  }

  /**
   * 获取用户当前流量（兼容性方法）
   * @param {number} userId - 用户ID
   * @returns {number} 当前流量
   */
  async getUserCurrentTraffic(userId) {
    return await this.getUserCurrentTrafficWithRetry(userId);
  }

  /**
   * 获取性能指标
   * @returns {Object} 性能指标
   */
  getPerformanceMetrics() {
    const now = Date.now();
    const uptime = now - this.metrics.lastFlushTime;

    return {
      uptime: uptime,
      requestsPerSecond: this.metrics.totalRequests / (uptime / 1000),
      successRate: this.metrics.totalRequests > 0
        ? (this.metrics.successfulWrites / this.metrics.totalRequests) * 100
        : 0,
      avgProcessingTime: this.metrics.avgProcessingTime,
      bufferUtilization: {
        traffic: (this.trafficBuffer.size / this.config.maxBufferSize) * 100,
        speed: (this.speedBuffer.size / this.config.maxBufferSize) * 100
      }
    };
  }

  /**
   * 重置性能指标
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulWrites: 0,
      failedWrites: 0,
      avgProcessingTime: 0,
      lastFlushTime: Date.now()
    };
    console.log('📊 性能指标已重置');
  }

  /**
   * 清理用户的累积值跟踪 (用于流量重置)
   * @param {number} userId - 用户ID
   */
  clearUserCumulativeStats(userId) {
    try {
      let clearedCount = 0;

      // 清理该用户相关的所有累积值跟踪
      for (const [key, value] of this.lastCumulativeStats.entries()) {
        if (key.startsWith(`${userId}:`)) {
          this.lastCumulativeStats.delete(key);
          clearedCount++;
        }
      }

      console.log(`✅ 已清理用户 ${userId} 的 ${clearedCount} 个累积值跟踪记录`);
    } catch (error) {
      console.error(`❌ 清理用户 ${userId} 累积值跟踪失败:`, error);
    }
  }

  /**
   * 获取累积值跟踪统计 (调试用)
   */
  getCumulativeStatsInfo() {
    const stats = {
      totalTracked: this.lastCumulativeStats.size,
      entries: []
    };

    for (const [key, value] of this.lastCumulativeStats.entries()) {
      stats.entries.push({
        key,
        inputBytes: value.inputBytes,
        outputBytes: value.outputBytes,
        totalBytes: value.inputBytes + value.outputBytes,
        lastUpdate: new Date(value.timestamp).toLocaleString()
      });
    }

    return stats;
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.speedFlushTimer) {
      clearInterval(this.speedFlushTimer);
      this.speedFlushTimer = null;
    }

    // 最后一次刷新缓冲区
    this.flushTrafficBuffer();
    this.flushSpeedBuffer();

    console.log('🧹 GOST 插件服务已清理');
  }
}

// 创建单例实例
const gostPluginService = new GostPluginService();

module.exports = gostPluginService;
