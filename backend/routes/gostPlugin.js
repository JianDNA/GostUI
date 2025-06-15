/**
 * GOST 插件路由
 *
 * 功能说明:
 * 1. 提供 GOST 认证器插件接口
 * 2. 提供 GOST 观测器插件接口
 * 3. 提供 GOST 限制器插件接口
 * 4. 处理 GOST 的认证、流量监控和限速请求
 *
 * 路由端点:
 * POST /api/gost/auth - 认证器插件
 * POST /api/gost/observer - 观测器插件
 * POST /api/gost/limiter - 限制器插件
 * GET /api/gost/status - 插件状态查询
 */

const express = require('express');
const router = express.Router();
const gostPluginService = require('../services/gostPluginService');

/**
 * GOST 认证器插件端点
 *
 * 请求格式:
 * {
 *   "username": "user1",
 *   "password": "pass1",
 *   "client": "127.0.0.1:12345"
 * }
 *
 * 响应格式:
 * {
 *   "ok": true,
 *   "id": "123"  // 用户ID，用于后续标识
 * }
 */
router.post('/auth', async (req, res) => {
  try {
    console.log('🔐 收到 GOST 认证请求:', {
      username: req.body.username,
      service: req.body.service,
      client: req.body.client,
      timestamp: new Date().toISOString()
    });

    // 使用新的认证器服务
    const gostAuthService = require('../services/gostAuthService');
    const response = await gostAuthService.handleAuthRequest(req.body);

    res.json(response);
  } catch (error) {
    console.error('❌ GOST 认证处理失败:', error);
    res.json({ ok: false, id: '', secret: '' });
  }
});

/**
 * GOST 观测器插件端点
 *
 * 请求格式:
 * {
 *   "events": [
 *     {
 *       "kind": "handler",
 *       "service": "forward-tcp-10004",
 *       "client": "123",
 *       "type": "stats",
 *       "stats": {
 *         "totalConns": 1,
 *         "currentConns": 0,
 *         "inputBytes": 1024,
 *         "outputBytes": 2048,
 *         "totalErrs": 0
 *       }
 *     }
 *   ]
 * }
 *
 * 响应格式:
 * {
 *   "ok": true
 * }
 */
// 添加一个简单的 GET 端点来测试观察器是否可达
router.get('/observer', (req, res) => {
  console.log('🔍 观察器 GET 端点被调用 - GOST 可能在测试连接');
  res.json({
    status: 'ok',
    message: '观察器端点正常工作',
    timestamp: new Date().toISOString()
  });
});

// 添加测试端点
router.get('/test', (req, res) => {
  console.log('🧪 GOST 插件测试端点被调用');
  res.json({
    status: 'ok',
    message: 'GOST 插件服务正常',
    endpoints: {
      auth: '/api/gost-plugin/auth',
      observer: '/api/gost-plugin/observer',
      limiter: '/api/gost-plugin/limiter'
    },
    timestamp: new Date().toISOString()
  });
});

router.post('/observer', async (req, res) => {
  try {
    // 🔧 强制启用详细日志来调试问题
    console.log('🔍🔍🔍 [FORCE DEBUG] 观察器收到数据:', new Date().toISOString());
    console.log('🔍🔍🔍 [FORCE DEBUG] 事件数量:', req.body?.events?.length || 0);
    if (req.body?.events?.length > 0) {
      console.log('🔍🔍🔍 [FORCE DEBUG] 第一个事件:', JSON.stringify(req.body.events[0], null, 2));
    }

    const eventsCount = req.body.events ? req.body.events.length : 0;
    // 简化事件日志
    if (process.env.NODE_ENV === 'development') {
      console.log(`📊 收到 ${eventsCount} 个观测事件`);
    }

    await gostPluginService.handleObserver(req, res);

    if (process.env.NODE_ENV === 'development') {
      console.log('✅ 观察器处理完成');
    }
  } catch (error) {
    console.error('❌ GOST 观测器处理失败:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GOST 限制器插件端点
 *
 * 请求格式:
 * {
 *   "client": "123",
 *   "scope": "client"
 * }
 *
 * 响应格式:
 * {
 *   "in": 10485760,   // 输入限制 (bytes/second)
 *   "out": 10485760   // 输出限制 (bytes/second)
 * }
 */
router.post('/limiter', async (req, res) => {
  try {
    console.log('🚦 收到 GOST 限制器请求:', {
      client: req.body.client,
      scope: req.body.scope,
      service: req.body.service,
      timestamp: new Date().toISOString()
    });

    // 🔧 修复：使用统一的限制器实现，优先使用缓存数据
    const { client, scope, service } = req.body;
    const multiInstanceCacheService = require('../services/multiInstanceCacheService');

    // 无限制的网速 (根据GOST文档，0或负值表示无限制)
    const unlimitedSpeed = 0; // 0 = 无限制

    if (!client) {
      // 没有用户标识，尝试从服务名解析
      if (service) {
        const portMatch = service.match(/forward-\w+-(\d+)/);
        if (portMatch) {
          const port = parseInt(portMatch[1]);
          const userMapping = multiInstanceCacheService.getPortUserMapping();

          // 首先检查激活的端口映射
          if (userMapping[port]) {
            const { userId } = userMapping[port];
            const userCache = multiInstanceCacheService.getUserCache(userId);

            if (userCache) {
              console.log(`🔍 通过端口 ${port} 找到用户: ${userCache.username}`);

              // 检查流量限制
              if (userCache.role === 'admin') {
                console.log(`👑 管理员用户 ${userCache.username} 不受流量限制`);
                return res.json({ in: unlimitedSpeed, out: unlimitedSpeed });
              }

              if (userCache.status !== 'active') {
                console.log(`🚫 用户 ${userCache.username} 状态异常: ${userCache.status}，返回极低限速`);
                return res.json({ in: 1, out: 1 }); // 极低限速
              }

              const trafficLimitBytes = userCache.trafficLimitBytes || 0;
              const usedTraffic = userCache.usedTraffic || 0;

              if (trafficLimitBytes > 0 && usedTraffic >= trafficLimitBytes) {
                console.log(`🚫 用户 ${userCache.username} 流量超限: ${usedTraffic}/${trafficLimitBytes} 字节，返回极低限速`);
                return res.json({ in: 1, out: 1 }); // 极低限速
              }

              console.log(`✅ 用户 ${userCache.username} 可正常访问，流量使用: ${trafficLimitBytes > 0 ? (usedTraffic / trafficLimitBytes * 100).toFixed(1) : 0}%`);
              return res.json({ in: unlimitedSpeed, out: unlimitedSpeed });
            }
          } else {
            // 🔧 新增：如果激活映射中没有找到，查询数据库中的历史规则
            console.log(`🔍 端口 ${port} 不在激活映射中，查询数据库历史规则...`);
            try {
              const { UserForwardRule } = require('../models');
              const rule = await UserForwardRule.findOne({
                where: { sourcePort: port },
                include: [{
                  model: require('../models').User,
                  as: 'user',
                  attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'trafficQuota', 'usedTraffic']
                }]
              });

              if (rule && rule.user) {
                console.log(`🔍 通过数据库找到端口 ${port} 的用户: ${rule.user.username}`);

                // 检查流量限制
                if (rule.user.role === 'admin') {
                  console.log(`👑 管理员用户 ${rule.user.username} 不受流量限制`);
                  return res.json({ in: unlimitedSpeed, out: unlimitedSpeed });
                }

                if (!rule.user.isActive || rule.user.userStatus !== 'active') {
                  console.log(`🚫 用户 ${rule.user.username} 状态异常，返回极低限速`);
                  return res.json({ in: 1, out: 1 }); // 极低限速
                }

                // 检查流量是否超限
                const trafficQuota = rule.user.trafficQuota || 0; // GB
                const usedTraffic = rule.user.usedTraffic || 0;   // bytes

                if (trafficQuota > 0) {
                  const quotaBytes = trafficQuota * 1024 * 1024 * 1024; // 转换为字节
                  if (usedTraffic >= quotaBytes) {
                    console.log(`🚫 用户 ${rule.user.username} 流量超限: ${(usedTraffic / 1024 / 1024 / 1024).toFixed(2)}GB/${trafficQuota}GB，返回极低限速`);
                    return res.json({ in: 1, out: 1 }); // 极低限速
                  }
                }

                console.log(`✅ 用户 ${rule.user.username} 可正常访问，流量使用: ${trafficQuota > 0 ? ((usedTraffic / (trafficQuota * 1024 * 1024 * 1024)) * 100).toFixed(1) : 0}%`);
                return res.json({ in: unlimitedSpeed, out: unlimitedSpeed });
              }
            } catch (error) {
              console.error(`❌ 查询端口 ${port} 历史规则失败:`, error);
            }
          }
        }
      }

      console.log(`ℹ️ 未知用户，返回无限制`);
      return res.json({ in: unlimitedSpeed, out: unlimitedSpeed });
    }

    // 有客户端标识，直接检查
    let userId = null;
    if (client.startsWith('user_')) {
      userId = parseInt(client.replace('user_', ''));
    } else {
      userId = parseInt(client);
    }

    if (!userId) {
      console.log(`⚠️ 无效的客户端标识: ${client}`);
      return res.json({ in: unlimitedSpeed, out: unlimitedSpeed });
    }

    const userCache = multiInstanceCacheService.getUserCache(userId);
    if (!userCache) {
      console.log(`🚫 用户 ${userId} 不存在，返回极低限速`);
      // 🔧 修复：返回极低限速（认证器应该已经拒绝了，这里是双重保险）
      return res.json({ in: 1, out: 1 }); // 极低限速
    }

    // Admin 用户不受任何限制
    if (userCache.role === 'admin') {
      console.log(`👑 管理员用户 ${userCache.username} 不受流量限制`);
      return res.json({ in: unlimitedSpeed, out: unlimitedSpeed });
    }

    // 检查用户状态
    if (userCache.status !== 'active') {
      console.log(`🚫 用户 ${userCache.username} 状态异常: ${userCache.status}，返回极低限速`);
      // 🔧 修复：返回极低限速（认证器应该已经拒绝了，这里是双重保险）
      return res.json({ in: 1, out: 1 }); // 极低限速
    }

    // 检查流量是否超限
    const trafficLimitBytes = userCache.trafficLimitBytes || 0;
    const usedTraffic = userCache.usedTraffic || 0;

    if (trafficLimitBytes > 0 && usedTraffic >= trafficLimitBytes) {
      console.log(`🚫 用户 ${userCache.username} 流量超限: ${usedTraffic}/${trafficLimitBytes} 字节，返回极低限速`);
      // 🔧 修复：返回极低限速（认证器应该已经拒绝了，这里是双重保险）
      return res.json({ in: 1, out: 1 }); // 极低限速
    }

    // 用户状态正常且未超限，返回无限制网速
    const usagePercent = trafficLimitBytes > 0
      ? (usedTraffic / trafficLimitBytes * 100).toFixed(1)
      : 0;

    console.log(`✅ 用户 ${userCache.username} 可正常访问，流量使用: ${usagePercent}%`);
    res.json({ in: unlimitedSpeed, out: unlimitedSpeed });

  } catch (error) {
    console.error('❌ GOST 限制器处理失败:', error);
    // 出错时返回无限制，避免影响服务
    res.json({ in: 0, out: 0 });
  }
});

/**
 * 获取插件状态
 *
 * 响应格式:
 * {
 *   "status": "active",
 *   "bufferStatus": {
 *     "trafficBuffer": { "size": 5 },
 *     "speedBuffer": { "size": 3 }
 *   },
 *   "timestamp": "2024-01-15T10:30:00Z"
 * }
 */
router.get('/status', (req, res) => {
  try {
    const bufferStatus = gostPluginService.getBufferStatus();

    res.json({
      status: 'active',
      bufferStatus: {
        trafficBuffer: { size: bufferStatus.trafficBuffer.size },
        speedBuffer: { size: bufferStatus.speedBuffer.size }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取插件状态失败:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 获取详细的缓冲区状态 (调试用)
 */
router.get('/buffer-status', (req, res) => {
  try {
    const bufferStatus = gostPluginService.getBufferStatus();
    res.json(bufferStatus);
  } catch (error) {
    console.error('❌ 获取缓冲区状态失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 手动刷新缓冲区 (调试用)
 */
router.post('/flush-buffers', async (req, res) => {
  try {
    console.log('🔄 手动刷新缓冲区...');

    // 手动触发缓冲区刷新
    await gostPluginService.flushTrafficBuffer();
    await gostPluginService.flushSpeedBuffer();

    res.json({
      success: true,
      message: '缓冲区已刷新',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 手动刷新缓冲区失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取节流同步状态 (调试用)
 */
router.get('/throttle-sync-status', (req, res) => {
  try {
    const multiInstanceCacheService = require('../services/multiInstanceCacheService');
    const status = multiInstanceCacheService.getStats();

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取节流同步状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 手动触发节流同步 (调试用)
 */
router.post('/force-sync', async (req, res) => {
  try {
    console.log('🔄 手动触发节流同步...');

    const multiInstanceCacheService = require('../services/multiInstanceCacheService');
    await multiInstanceCacheService.syncCache();

    res.json({
      success: true,
      message: '节流同步已触发',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 手动触发节流同步失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 清理观察器累积统计 (测试用)
 */
router.post('/clear-stats', async (req, res) => {
  try {
    console.log('🧹 清理观察器累积统计...');

    // 清理所有累积统计
    gostPluginService.clearAllCumulativeStats();

    // 清理用户更新锁
    if (gostPluginService.userUpdateLocks) {
      gostPluginService.userUpdateLocks.clear();
      console.log('🔓 用户更新锁已清理');
    }

    res.json({
      success: true,
      message: '观察器累积统计已清理',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 清理观察器统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 测试流量限制功能 (调试用)
 */
router.post('/test-traffic-limit', async (req, res) => {
  try {
    const { userId, testTraffic } = req.body;

    if (!userId || !testTraffic) {
      return res.status(400).json({
        success: false,
        error: '需要提供 userId 和 testTraffic 参数'
      });
    }

    console.log(`🧪 测试用户 ${userId} 的流量限制，模拟流量: ${testTraffic} 字节`);

    const multiInstanceCacheService = require('../services/multiInstanceCacheService');

    // 获取用户当前状态
    const userCache = multiInstanceCacheService.getUserCache(userId);
    if (!userCache) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 模拟添加流量
    const newUsedTraffic = await multiInstanceCacheService.updateUserTraffic(userId, testTraffic);

    // 重新获取用户状态
    const updatedCache = multiInstanceCacheService.getUserCache(userId);

    res.json({
      success: true,
      data: {
        userId,
        role: updatedCache.role,
        trafficLimitBytes: updatedCache.trafficLimitBytes,
        usedTraffic: newUsedTraffic,
        status: updatedCache.status,
        usagePercent: updatedCache.trafficLimitBytes > 0
          ? ((newUsedTraffic / updatedCache.trafficLimitBytes) * 100).toFixed(2) + '%'
          : '无限制'
      },
      message: `用户 ${userId} 流量测试完成`
    });
  } catch (error) {
    console.error('❌ 测试流量限制失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 健康检查端点
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'gost-plugin',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * 错误处理中间件
 */
router.use((error, req, res, next) => {
  console.error('❌ GOST 插件路由错误:', error);

  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

/**
 * 清理限制器缓存
 */
router.post('/clear-limiter-cache', async (req, res) => {
  try {
    const { userId } = req.body;
    const gostLimiterService = require('../services/gostLimiterService');

    if (userId) {
      gostLimiterService.clearUserQuotaCache(userId);
      res.json({
        ok: true,
        message: `用户 ${userId} 限制器缓存已清理`
      });
    } else {
      gostLimiterService.clearAllQuotaCache();
      res.json({
        ok: true,
        message: '所有限制器缓存已清理'
      });
    }
  } catch (error) {
    console.error('❌ 清理限制器缓存失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 清理认证器缓存
 */
router.post('/clear-auth-cache', async (req, res) => {
  try {
    const { port } = req.body;
    const gostAuthService = require('../services/gostAuthService');

    if (port) {
      gostAuthService.clearPortCache(port);
      res.json({
        ok: true,
        message: `端口 ${port} 认证器缓存已清理`
      });
    } else {
      gostAuthService.clearAllCache();
      res.json({
        ok: true,
        message: '所有认证器缓存已清理'
      });
    }
  } catch (error) {
    console.error('❌ 清理认证器缓存失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取插件状态信息
 */
router.get('/status', async (req, res) => {
  try {
    const gostLimiterService = require('../services/gostLimiterService');
    const gostAuthService = require('../services/gostAuthService');

    const status = {
      observer: {
        status: 'active'
      },
      limiter: {
        status: 'active'
      },
      auth: {
        status: 'active'
      },
      timestamp: new Date().toISOString()
    };

    // 安全地获取观察器状态
    try {
      const observerStats = gostPluginService.getBufferStatus();
      status.observer = { ...status.observer, ...observerStats };
    } catch (error) {
      console.warn('⚠️ 获取观察器状态失败:', error.message);
      status.observer.error = error.message;
    }

    // 安全地获取限制器状态
    try {
      const limiterStats = gostLimiterService.getQuotaStats();
      status.limiter = { ...status.limiter, ...limiterStats };
    } catch (error) {
      console.warn('⚠️ 获取限制器状态失败:', error.message);
      status.limiter.error = error.message;
    }

    // 安全地获取认证器状态
    try {
      const authStats = gostAuthService.getAuthStats();
      status.auth = { ...status.auth, ...authStats };
    } catch (error) {
      console.warn('⚠️ 获取认证器状态失败:', error.message);
      status.auth.error = error.message;
    }

    res.json(status);
  } catch (error) {
    console.error('❌ 获取插件状态失败:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 测试限制器功能
 */
router.post('/test-limiter', async (req, res) => {
  try {
    const { userId, service } = req.body;
    const gostLimiterService = require('../services/gostLimiterService');

    if (!userId && !service) {
      return res.status(400).json({
        error: 'Missing required parameter: userId or service'
      });
    }

    // 构造测试请求
    const testRequest = {
      scope: 'client',
      service: service || `forward-tcp-6443`,
      network: 'tcp',
      addr: 'test.com:443',
      client: userId ? `user_${userId}` : undefined,
      src: '127.0.0.1:12345'
    };

    const response = await gostLimiterService.handleLimiterRequest(testRequest);

    res.json({
      ok: true,
      request: testRequest,
      response
    });
  } catch (error) {
    console.error('❌ 测试限制器失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 测试认证器功能
 */
router.post('/test-auth', async (req, res) => {
  try {
    const { service } = req.body;
    const gostAuthService = require('../services/gostAuthService');

    if (!service) {
      return res.status(400).json({
        error: 'Missing required parameter: service'
      });
    }

    // 构造测试请求
    const testRequest = {
      service,
      network: 'tcp',
      addr: 'test.com:443',
      src: '127.0.0.1:12345'
    };

    const response = await gostAuthService.handleAuthRequest(testRequest);

    res.json({
      ok: true,
      request: testRequest,
      response
    });
  } catch (error) {
    console.error('❌ 测试认证器失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
