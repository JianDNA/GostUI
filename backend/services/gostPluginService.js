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
const loggerService = require('./loggerService');
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

    // 🔧 修复：累积流量跟踪 (修复resetTraffic=false模式下的流量计算)
    this.lastReportedTraffic = new Map(); // key: serviceName, value: totalBytes

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

    // 🔧 新增：批量数据库操作缓冲区
    this.batchTrafficBuffer = new Map(); // key: userId, value: { totalBytes, lastUpdate }
    this.batchFlushTimer = null;
    this.batchFlushInterval = 15000; // 🔧 修复：15秒批量刷新一次（更频繁）
    this.maxBatchSize = 10; // 🔧 修复：降低批量大小到10个用户
    this.maxUserTrafficAccumulation = 50 * 1024 * 1024; // 🔧 新增：单用户最大累积50MB就强制刷新

    // 启动缓冲区刷新
    this.startBufferFlush();

    // 🔧 延迟启动批量刷新定时器，确保方法已定义
    setImmediate(() => {
      this.startBatchFlushTimer();
    });

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

      // 无限制的网速 (根据GOST文档，0或负值表示无限制)
      const unlimitedSpeed = 0; // 0 = 无限制

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
        in: 0,
        out: 0
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
   * 🔧 修复：过滤错误连接的流量
   * @param {Object} event - 观察器事件
   * @returns {boolean} 是否应该统计流量
   */
  shouldCountTraffic(event) {
    const { stats } = event;

    // 如果有错误且没有实际数据传输，不统计流量
    if (stats.totalErrs > 0 && stats.inputBytes === 0 && stats.outputBytes === 0) {
      console.log(`⚠️ 服务 ${event.service} 有错误且无数据传输，跳过流量统计`);
      return false;
    }

    // 如果连接数为0但有流量，可能是异常情况
    if (stats.totalConns === 0 && (stats.inputBytes > 0 || stats.outputBytes > 0)) {
      console.log(`⚠️ 服务 ${event.service} 无连接但有流量，可能是异常情况`);
      return false;
    }

    return true;
  }

  /**
   * 🔧 修复：计算真实的增量流量 (处理resetTraffic=false模式)
   * @param {string} serviceName - 服务名
   * @param {Object} currentStats - 当前统计数据
   * @returns {Object} 真实的增量流量
   */
  calculateRealIncrement(serviceName, currentStats) {
    const { inputBytes = 0, outputBytes = 0 } = currentStats;
    const currentTotal = inputBytes + outputBytes;

    // 获取上次报告的流量
    const lastReported = this.lastReportedTraffic.get(serviceName) || 0;

    // 计算增量
    let increment = currentTotal - lastReported;

    // 处理重置情况：如果当前值小于上次值，说明发生了重置
    if (currentTotal < lastReported) {
      console.log(`🔄 检测到服务 ${serviceName} 流量重置，使用当前值作为增量`);
      increment = currentTotal;
    }

    // 更新记录
    this.lastReportedTraffic.set(serviceName, currentTotal);

    return {
      inputBytes: Math.max(0, inputBytes),
      outputBytes: Math.max(0, outputBytes),
      totalIncrement: Math.max(0, increment)
    };
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

      // 🔧 修复：过滤错误连接的流量
      if (!this.shouldCountTraffic(event)) {
        return;
      }

      // 从服务名提取端口号
      const port = this.extractPortFromService(service);
      if (!port) {
        console.log(`⚠️ 无法从服务名 ${service} 提取端口号`);
        return;
      }

      // 获取端口用户映射（确保缓存已准备好）
      let portMapping = await this.getPortUserMapping();

      // 如果缓存为空，尝试刷新一次
      if (Object.keys(portMapping).length === 0) {
        console.log(`🔄 端口映射缓存为空，尝试刷新...`);
        await multiInstanceCacheService.refreshPortUserMapping();
        portMapping = await this.getPortUserMapping();
      }

      let userInfo = portMapping[port];

      if (!userInfo) {
        console.log(`⚠️ 端口 ${port} 没有对应的用户映射，可用端口:`, Object.keys(portMapping));

        // 尝试重新构建端口映射
        console.log('🔄 尝试重新构建端口映射...');
        await multiInstanceCacheService.refreshPortUserMapping();
        const newPortMapping = await this.getPortUserMapping();
        const newUserInfo = newPortMapping[port];

        if (!newUserInfo) {
          console.log(`⚠️ 重建后端口 ${port} 仍无用户映射，跳过流量统计`);
          return;
        }

        console.log(`✅ 重建映射成功，端口 ${port} 映射到用户 ${newUserInfo.username} (ID: ${newUserInfo.userId})`);
        // 使用新映射继续处理
        userInfo = newUserInfo;
      }

      const userId = userInfo.userId;
      const { inputBytes = 0, outputBytes = 0 } = stats;
      const cumulativeTotalBytes = inputBytes + outputBytes;

      console.log(`🔍 [DEBUG] Service 流量统计 - 服务: ${service}, 端口: ${port}, 用户: ${userInfo.username} (ID: ${userId})`);
      console.log(`🔍 [DEBUG] GOST累积数据: 输入=${inputBytes}, 输出=${outputBytes}, 总计=${cumulativeTotalBytes}`);

      // 🔧 修复：使用真实增量计算，处理resetTraffic=false模式
      const realIncrement = this.calculateRealIncrement(service, stats);
      const incrementalTotalBytes = realIncrement.totalIncrement;

      console.log(`🔧 [修复] 真实增量计算: ${incrementalTotalBytes} 字节 (原始: ${cumulativeTotalBytes})`);

      // 🔧 修复：如果增量为0或负数，跳过处理
      if (incrementalTotalBytes <= 0) {
        console.log(`⏭️ 无有效流量增量 (${incrementalTotalBytes})，跳过处理`);
        return;
      }

      // 🔧 增量合理性检查（防止异常数据）- Phase 3 修复：提高限制到50GB
      const maxReasonableIncrement = 50 * 1024 * 1024 * 1024; // 50GB
      if (incrementalTotalBytes > maxReasonableIncrement) {
        console.log(`⚠️ 增量异常: ${(incrementalTotalBytes/1024/1024/1024).toFixed(2)}GB > 50GB，跳过处理`);
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

      // 🔧 重新启用流量缓冲机制，确保流量数据被记录到TrafficLog表
      this.bufferTrafficData(userId, port, inputBytes, outputBytes);

      // 🔧 检查是否启用配额强制执行
      const performanceConfig = require('./performanceConfigManager');
      const pluginConfig = performanceConfig.getGostPluginConfig();

      // ✅ 只有在单机模式下才禁用配额强制执行，自动模式下正常执行
      if (pluginConfig.disableQuotaEnforcement) {
        // 🔧 单机模式：仅统计流量，不执行配额强制
        console.log(`📊 [单机模式] 仅统计流量，跳过配额强制执行 (用户${userId}, 增量: ${(incrementalTotalBytes / 1024 / 1024).toFixed(1)}MB)`);

        if (pluginConfig.batchDatabaseOperations) {
          // 🔧 批量数据库操作优化
          this.batchUpdateUserTraffic(userId, incrementalTotalBytes);
        } else {
          // 🔧 异步更新流量统计，不阻塞转发
          setImmediate(async () => {
            try {
              await this.updateUserTrafficWithLock(userId, incrementalTotalBytes);
            } catch (error) {
              console.error(`❌ 流量统计更新失败 (用户${userId}):`, error);
            }
          });
        }
      } else {
        // ✅ 自动模式：完整的配额管理（保持原有逻辑不变）
        setImmediate(async () => {
          try {
            // 🔧 关键修复：使用用户级别的互斥锁，防止并发更新导致的竞态条件
            await this.updateUserTrafficWithLock(userId, incrementalTotalBytes);

            // 🔧 Phase 2: 流量更新后的配额管理
            this.clearLimiterCacheForUser(userId);

            // 🔧 关键修复：强制刷新用户缓存，确保限制器能立即获取最新数据
            await this.forceRefreshUserCache(userId);

            // 🔧 Phase 2: 使用统一配额协调器检查，避免并发冲突
            this.triggerUnifiedQuotaCheck(userId);

            // 🔧 新增：立即检查配额状态，不等待异步处理
            await this.immediateQuotaCheck(userId, incrementalTotalBytes);
          } catch (error) {
            console.error(`❌ 异步流量处理失败 (用户${userId}):`, error);
          }
        });
      }

      // 更新规则级别的流量统计 (使用增量)
      try {
        const { UserForwardRule } = require('../models');

        // 先检查规则是否存在，并加载完整的用户信息用于计算属性
        const rule = await UserForwardRule.findOne({
          where: {
            id: userInfo.ruleId
          },
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'isActive', 'userStatus', 'role', 'expiryDate', 'portRangeStart', 'portRangeEnd', 'trafficQuota', 'usedTraffic']
          }]
        });

        if (!rule) {
          console.log(`⚠️ 规则 ${userInfo.ruleId} 不存在，跳过流量更新`);
          return;
        }

        // 🔧 修复：检查规则是否通过计算属性激活，但先确保用户信息完整
        if (!rule.user) {
          console.log(`⚠️ 规则 ${userInfo.ruleId} 缺少用户关联信息，跳过流量更新`);
          return;
        }

        // 🔧 修复：转发规则流量统计应该记录实际产生的流量，不受配额限制影响
        // 检查规则基本状态（用户状态、过期等），但不检查流量配额
        const user = rule.user;

        // 🔧 关键修复：即使用户状态是 suspended（因为超过配额），也要记录实际产生的流量
        // 只有在用户被完全禁用（isActive=false）或过期时才跳过流量统计
        const isBasicActive = user.isActive &&
                             (user.role === 'admin' || !user.isExpired());

        console.log(`🔍 [DEBUG] 规则 ${userInfo.ruleId} 基本状态检查: ${isBasicActive} (用户: ${user.username}, 状态: ${user.userStatus}, isActive: ${user.isActive})`);

        // 🔧 关键修复：即使用户超过配额（suspended状态），也要记录实际产生的流量
        // 只有在用户基本状态异常时才跳过（如用户被禁用、过期等）
        if (!isBasicActive) {
          console.log(`⚠️ 规则 ${userInfo.ruleId} 用户基本状态异常，跳过流量更新`);
          return;
        }

        // 使用原子操作更新规则流量 (使用增量，不是累积值)
        const [affectedRows] = await UserForwardRule.increment(
          { usedTraffic: incrementalTotalBytes },
          {
            where: {
              id: userInfo.ruleId
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
   * 启动缓冲区刷新定时器
   */
  startBufferFlush() {
    console.log(`⏰ 启动缓冲区刷新定时器，间隔: ${this.config.flushInterval}ms`);

    // 流量数据刷新定时器
    this.flushTimer = setInterval(() => {
      this.flushTrafficBuffer();
    }, this.config.flushInterval);

    // 网速数据刷新定时器
    this.speedFlushTimer = setInterval(() => {
      this.flushSpeedBuffer();
    }, this.config.speedFlushInterval);
  }

  /**
   * 🔧 新增：启动批量数据库操作定时器
   */
  startBatchFlushTimer() {
    this.batchFlushTimer = setInterval(() => {
      this.flushBatchTrafficBuffer();
    }, this.batchFlushInterval);

    console.log(`⏰ 启动批量数据库刷新定时器，间隔: ${this.batchFlushInterval}ms`);
  }

  /**
   * 🔧 新增：批量更新用户流量（单击模式优化）
   * @param {number} userId - 用户ID
   * @param {number} incrementalBytes - 增量流量字节数
   */
  batchUpdateUserTraffic(userId, incrementalBytes) {
    try {
      // 累积到批量缓冲区
      if (this.batchTrafficBuffer.has(userId)) {
        const existing = this.batchTrafficBuffer.get(userId);
        existing.totalBytes += incrementalBytes;
        existing.lastUpdate = Date.now();
      } else {
        this.batchTrafficBuffer.set(userId, {
          totalBytes: incrementalBytes,
          lastUpdate: Date.now()
        });
      }

      const currentUserTotal = this.batchTrafficBuffer.get(userId).totalBytes;
      console.log(`📊 [批量模式] 用户 ${userId} 流量累积: +${(incrementalBytes / 1024 / 1024).toFixed(1)}MB, 总累积: ${(currentUserTotal / 1024 / 1024).toFixed(1)}MB`);

      // 🔧 修复：检查多个刷新条件
      let shouldFlush = false;
      let flushReason = '';

      // 条件1：缓冲区用户数达到最大大小
      if (this.batchTrafficBuffer.size >= this.maxBatchSize) {
        shouldFlush = true;
        flushReason = `缓冲区用户数已满(${this.batchTrafficBuffer.size}/${this.maxBatchSize})`;
      }

      // 条件2：单用户流量累积过多
      if (currentUserTotal >= this.maxUserTrafficAccumulation) {
        shouldFlush = true;
        flushReason = `用户${userId}流量累积过多(${(currentUserTotal / 1024 / 1024).toFixed(1)}MB)`;
      }

      // 条件3：数据过期（超过30秒未刷新）
      const oldestData = Math.min(...Array.from(this.batchTrafficBuffer.values()).map(data => data.lastUpdate));
      if (Date.now() - oldestData > 30000) {
        shouldFlush = true;
        flushReason = '数据过期(超过30秒)';
      }

      if (shouldFlush) {
        console.log(`🔄 [批量模式] 立即刷新: ${flushReason}`);
        this.flushBatchTrafficBuffer();
      }
    } catch (error) {
      console.error(`❌ 批量流量缓冲失败 (用户${userId}):`, error);
    }
  }

  /**
   * 🔧 新增：刷新批量流量缓冲区
   */
  async flushBatchTrafficBuffer() {
    if (this.batchTrafficBuffer.size === 0) {
      return;
    }

    const startTime = Date.now();
    const bufferSize = this.batchTrafficBuffer.size;

    console.log(`🔄 [批量模式] 开始批量刷新 ${bufferSize} 个用户的流量数据`);

    // 获取缓冲区数据并立即清空
    const batchData = Array.from(this.batchTrafficBuffer.entries());
    this.batchTrafficBuffer.clear();

    try {
      // 批量更新数据库
      await this.processBatchTrafficUpdates(batchData);

      console.log(`✅ [批量模式] 流量数据批量刷新完成: ${bufferSize}个用户, 耗时${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('❌ [批量模式] 批量刷新流量数据失败:', error);

      // 错误恢复：将数据重新加入缓冲区
      batchData.forEach(([userId, data]) => {
        if (this.batchTrafficBuffer.has(userId)) {
          this.batchTrafficBuffer.get(userId).totalBytes += data.totalBytes;
        } else {
          this.batchTrafficBuffer.set(userId, data);
        }
      });
    }
  }

  /**
   * 🔧 新增：处理批量流量更新
   * @param {Array} batchData - 批量数据 [[userId, {totalBytes, lastUpdate}], ...]
   */
  async processBatchTrafficUpdates(batchData) {
    const { User } = require('../models');

    // 构建批量更新的SQL
    const updates = batchData.map(([userId, data]) => ({
      id: userId,
      increment: data.totalBytes
    }));

    // 使用事务进行批量更新
    const { sequelize } = require('./dbService');
    const transaction = await sequelize.transaction();

    try {
      // 批量更新用户流量
      for (const update of updates) {
        await User.increment(
          { usedTraffic: update.increment },
          {
            where: { id: update.id },
            transaction
          }
        );

        console.log(`📊 [批量更新] 用户 ${update.id} 流量增加: ${(update.increment / 1024 / 1024).toFixed(1)}MB`);
      }

      await transaction.commit();
      console.log(`✅ [批量更新] 成功更新 ${updates.length} 个用户的流量数据`);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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
        // 批量写入TrafficLog表
        for (const data of batch) {

          // 2. 写入TrafficLog表（详细日志）
          await this.recordTrafficLog(data);
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
   * 记录流量日志到TrafficLog表
   * @param {Object} data - 流量数据
   */
  async recordTrafficLog(data) {
    try {
      const { TrafficLog, UserForwardRule } = require('../models');

      // 查找对应的转发规则
      const rule = await UserForwardRule.findOne({
        where: {
          userId: data.userId,
          sourcePort: data.port
        }
      });

      if (rule) {
        await TrafficLog.create({
          userId: data.userId,
          ruleId: rule.id,
          bytesIn: data.inputBytes,
          bytesOut: data.outputBytes,
          timestamp: new Date(),
          sourceIP: null,
          targetIP: null
        });

        console.log(`📝 记录流量日志: 用户${data.userId}, 端口${data.port}, 输入${data.inputBytes}字节, 输出${data.outputBytes}字节`);
      }
    } catch (error) {
      console.error('❌ 记录流量日志失败:', error);
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
      // 网速数据不再记录到时序数据库
      console.log(`📊 跳过网速数据记录: ${speedData.length} 条记录`);

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
        },
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'trafficQuota', 'usedTraffic', 'additionalPorts', 'portRangeStart', 'portRangeEnd']
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
   * 清除用户的限制器缓存
   * @param {number} userId - 用户ID
   */
  clearLimiterCacheForUser(userId) {
    try {
      const gostLimiterService = require('./gostLimiterService');
      gostLimiterService.clearUserQuotaCache(userId);
    } catch (error) {
      console.error(`❌ 清除用户 ${userId} 限制器缓存失败:`, error);
    }
  }

  /**
   * 触发用户配额检查
   * @param {number} userId - 用户ID
   */
  triggerQuotaCheckForUser(userId) {
    try {
      // 异步触发配额检查，不阻塞流量统计处理
      setImmediate(async () => {
        try {
          const quotaManagementService = require('./quotaManagementService');
          await quotaManagementService.triggerQuotaCheck(userId);
        } catch (error) {
          console.error(`❌ 触发用户 ${userId} 配额检查失败:`, error);
        }
      });
    } catch (error) {
      console.error(`❌ 触发用户 ${userId} 配额检查失败:`, error);
    }
  }

  /**
   * 触发统一配额检查（避免并发冲突）
   * @param {number} userId - 用户ID
   */
  triggerUnifiedQuotaCheck(userId) {
    try {
      // 异步触发统一配额检查，不阻塞流量统计处理
      setImmediate(async () => {
        try {
          const quotaCoordinatorService = require('./quotaCoordinatorService');
          const result = await quotaCoordinatorService.checkUserQuota(userId, 'traffic_update');

          // 如果需要更新规则状态
          if (result.needsRuleUpdate) {
            console.log(`🔄 [流量统计] 用户 ${userId} 需要更新规则状态: ${result.reason}`);
            await this.updateUserRulesStatus(userId, result.allowed, result.reason);
          }
        } catch (error) {
          console.error(`❌ 触发用户 ${userId} 统一配额检查失败:`, error);
        }
      });
    } catch (error) {
      console.error(`❌ 触发用户 ${userId} 统一配额检查失败:`, error);
    }
  }

  /**
   * 🔧 新增：立即配额检查，用于快速响应
   * @param {number} userId - 用户ID
   * @param {number} incrementalBytes - 本次增量流量
   */
  async immediateQuotaCheck(userId, incrementalBytes) {
    try {
      // 获取用户当前状态
      const { User } = require('../models');
      const user = await User.findByPk(userId, {
        attributes: ['trafficQuota', 'usedTraffic']
      });

      if (!user || !user.trafficQuota) {
        return; // 无配额限制
      }

      const quotaBytes = user.trafficQuota * 1024 * 1024 * 1024;
      const currentUsed = user.usedTraffic || 0;
      const usagePercentage = (currentUsed / quotaBytes) * 100;

      // 🔧 立即检查：如果超过配额，立即禁用规则
      if (currentUsed >= quotaBytes) {
        console.log(`🚨 [立即检查] 用户 ${userId} 超过配额 ${usagePercentage.toFixed(1)}%，立即禁用规则`);

        // 立即进行配额控制
        await this.emergencyQuotaControl(userId, `超配额: ${usagePercentage.toFixed(1)}%`);

        // 触发GOST配置同步 - 强制更新
        const gostSyncCoordinator = require('./gostSyncCoordinator');

        // 设置强制更新环境变量
        process.env.FORCE_GOST_UPDATE = 'true';

        try {
          await gostSyncCoordinator.requestSync('emergency_quota_disable', true, 10);
          console.log('✅ 紧急配额禁用配置同步成功');
        } catch (error) {
          console.error('❌ 紧急配额禁用同步失败:', error);
        } finally {
          // 清除强制更新标志
          delete process.env.FORCE_GOST_UPDATE;
        }
      }
      // 🔧 预警：接近配额时增加检查频率
      else if (usagePercentage > 90) {
        console.log(`⚠️ [立即检查] 用户 ${userId} 接近配额限制 ${usagePercentage.toFixed(1)}%`);
      }

    } catch (error) {
      console.error(`❌ 立即配额检查失败:`, error);
    }
  }

  /**
   * 🔧 新增：紧急配额控制（通过用户状态控制）
   * @param {number} userId - 用户ID
   * @param {string} reason - 控制原因
   */
  async emergencyQuotaControl(userId, reason) {
    try {
      const { User } = require('../models');

      // 通过设置用户状态来控制规则激活
      // 这样所有规则的 isActive 计算属性都会返回 false
      const user = await User.findByPk(userId);
      if (!user) {
        console.error(`❌ 用户 ${userId} 不存在`);
        return;
      }

      // 记录原始状态，以便后续恢复
      const originalStatus = user.userStatus;

      // 临时设置用户状态为 suspended（暂停）
      await user.update({
        userStatus: 'suspended',
        // 在用户备注中记录原始状态和暂停原因
        notes: `${user.notes || ''} [紧急暂停: ${reason}, 原状态: ${originalStatus}]`.trim()
      });

      console.log(`🚫 [紧急配额控制] 已暂停用户 ${userId} - ${reason}`);
      console.log(`💡 所有转发规则将通过计算属性自动禁用`);

    } catch (error) {
      console.error(`❌ 紧急配额控制失败:`, error);
    }
  }

  /**
   * 更新用户规则状态
   * @param {number} userId - 用户ID
   * @param {boolean} allowed - 是否允许
   * @param {string} reason - 原因
   */
  async updateUserRulesStatus(userId, allowed, reason) {
    try {
      const UserForwardRule = require('../models').UserForwardRule;
      const rules = await UserForwardRule.findAll({ where: { userId } });

      let updatedCount = 0;
      for (const rule of rules) {
        if (allowed) {
          // 恢复规则（只恢复被配额限制禁用的规则）
          if (!rule.isActive && rule.description && rule.description.includes('[配额超限自动禁用]')) {
            await rule.update({
              isActive: true,
              description: rule.description.replace(' [配额超限自动禁用]', '').trim()
            });
            updatedCount++;
            console.log(`✅ [流量统计] 恢复规则 ${rule.id} (${rule.name})`);
          }
        } else {
          // 禁用规则
          if (rule.isActive) {
            await rule.update({
              isActive: false,
              description: `${rule.description || ''} [配额超限自动禁用]`.trim()
            });
            updatedCount++;
            console.log(`🚫 [流量统计] 禁用规则 ${rule.id} (${rule.name}) - ${reason}`);
          }
        }
      }

      if (updatedCount > 0) {
        console.log(`📊 [流量统计] 用户 ${userId} 更新了 ${updatedCount} 个规则状态`);

        // 触发GOST配置更新（使用统一协调器）
        const gostSyncCoordinator = require('./gostSyncCoordinator');
        gostSyncCoordinator.requestSync('quota_change', false, 6).catch(error => {
          console.error('触发GOST配置同步失败:', error);
        });
      }

    } catch (error) {
      console.error(`❌ 更新用户 ${userId} 规则状态失败:`, error);
    }
  }

  /**
   * 强制刷新用户缓存
   * @param {number} userId - 用户ID
   */
  async forceRefreshUserCache(userId) {
    try {
      const multiInstanceCacheService = require('./multiInstanceCacheService');

      // 清除用户缓存
      multiInstanceCacheService.clearUserCache(userId);

      // 从数据库重新加载用户数据
      const { User } = require('../models');
      const user = await User.findByPk(userId, {
        attributes: ['id', 'username', 'role', 'expiryDate', 'trafficQuota', 'usedTraffic', 'portRangeStart', 'portRangeEnd', 'additionalPorts', 'userStatus', 'isActive']
      });

      if (user) {
        // 构建新的缓存数据
        const portRanges = [];
        if (user.portRangeStart && user.portRangeEnd) {
          portRanges.push({
            start: user.portRangeStart,
            end: user.portRangeEnd
          });
        }

        const trafficLimitBytes = user.trafficQuota ? user.trafficQuota * 1024 * 1024 * 1024 : 0;

        const userData = {
          id: user.id,
          username: user.username,
          role: user.role || 'user',
          expiryDate: user.expiryDate,
          trafficQuota: user.trafficQuota,
          trafficLimitBytes: trafficLimitBytes,
          usedTraffic: user.usedTraffic || 0,
          status: (!user.expiryDate || new Date(user.expiryDate) > new Date()) ? 'active' : 'inactive',
          portRanges: portRanges,
          isActive: !user.expiryDate || new Date(user.expiryDate) > new Date(),
          lastUpdate: Date.now()
        };

        // 更新缓存
        multiInstanceCacheService.setUserCache(userId, userData);

        console.log(`🔄 强制刷新用户 ${userId} 缓存完成，流量: ${userData.usedTraffic}/${userData.trafficLimitBytes} 字节`);
      }
    } catch (error) {
      console.error(`❌ 强制刷新用户 ${userId} 缓存失败:`, error);
    }
  }

  /**
   * 🔧 优化：简化的流量更新机制，减少锁竞争
   * @param {number} userId - 用户ID
   * @param {number} incrementalBytes - 增量字节数
   */
  async updateUserTrafficWithLock(userId, incrementalBytes) {
    const startTime = Date.now();

    // 🔧 优化：使用更简单的锁机制，减少等待时间
    const lockKey = `traffic_${userId}`;

    // 如果已有锁，直接返回（避免阻塞）
    if (this.userUpdateLocks.has(lockKey)) {
      console.log(`⚡ [性能优化] 用户 ${userId} 流量更新已在进行，跳过重复更新`);
      return null;
    }

    // 设置锁
    this.userUpdateLocks.set(lockKey, true);
    const lockWaitTime = Date.now() - startTime;

    try {
      const result = await this.performUserTrafficUpdate(userId, incrementalBytes, lockWaitTime);
      return result;
    } finally {
      // 清理锁
      this.userUpdateLocks.delete(lockKey);
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
   * 重建端口映射 (修复端口映射丢失问题)
   */
  async rebuildPortMapping() {
    try {
      console.log('🔄 开始重建端口映射...');

      const multiInstanceCacheService = require('./multiInstanceCacheService');

      // 强制刷新端口用户映射
      await multiInstanceCacheService.refreshPortUserMapping();

      // 重新获取映射
      const newMapping = await this.getPortUserMapping();

      console.log(`✅ 端口映射重建完成，当前映射端口数: ${Object.keys(newMapping).length}`);

      return newMapping;
    } catch (error) {
      console.error('❌ 重建端口映射失败:', error);
      return {};
    }
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
