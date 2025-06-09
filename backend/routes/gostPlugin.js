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
      client: req.body.client,
      timestamp: new Date().toISOString()
    });

    await gostPluginService.handleAuth(req, res);
  } catch (error) {
    console.error('❌ GOST 认证处理失败:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error'
    });
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
      timestamp: new Date().toISOString()
    });

    await gostPluginService.handleLimiter(req, res);
  } catch (error) {
    console.error('❌ GOST 限制器处理失败:', error);
    res.status(500).json({
      in: 1048576,  // 默认 1MB/s
      out: 1048576
    });
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

module.exports = router;
