/**
 * 流量统计 API 路由
 *
 * 功能说明:
 * 1. 提供用户流量统计查询接口
 * 2. 提供网速历史查询接口
 * 3. 提供流量管理功能 (重置、设置限额等)
 * 4. 提供管理员流量监控功能
 *
 * 路由端点:
 * GET /api/traffic/stats - 获取用户流量统计
 * GET /api/traffic/speed-history - 获取网速历史
 * GET /api/traffic/trend - 获取流量趋势
 * POST /api/traffic/reset/:userId - 重置用户流量
 * PUT /api/traffic/limit/:userId - 设置用户流量限额
 * GET /api/traffic/ranking - 获取流量排行榜
 */

const express = require('express');
const router = express.Router();
const multiInstanceCacheService = require('../services/multiInstanceCacheService');
const timeSeriesService = require('../services/timeSeriesService'); // 替换 InfluxDB
const { models } = require('../services/dbService');
const { User, ForwardRule } = models;
const { auth } = require('../middleware/auth');

/**
 * 获取当前用户的流量统计
 *
 * 查询参数:
 * - days: 统计天数 (默认7天)
 * - groupBy: 分组方式 hour/day (默认hour)
 *
 * 响应格式:
 * {
 *   "userStats": {
 *     "usedTraffic": 5368709120,
 *     "trafficLimit": 10737418240,
 *     "status": "active",
 *     "usagePercent": 50.0
 *   },
 *   "portStats": [
 *     {
 *       "port": 10004,
 *       "inputBytes": 1048576,
 *       "outputBytes": 2097152,
 *       "totalBytes": 3145728
 *     }
 *   ]
 * }
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 7;
    const groupBy = req.query.groupBy || 'hour';

    console.log(`📊 获取用户 ${userId} 流量统计: ${days}天, 分组=${groupBy}`);

    // 从缓存获取用户基本信息
    const userCache = multiInstanceCacheService.getUserCache(userId);

    if (!userCache) {
      // 缓存中没有，从数据库获取
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: '用户不存在' });
      }
    }

    // 从 InfluxDB 获取详细统计
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const portStats = await timeSeriesService.getUserTrafficStats(userId, startTime, endTime, groupBy);

    // 计算使用百分比
    const usagePercent = userCache.trafficLimit > 0
      ? (userCache.usedTraffic / userCache.trafficLimit) * 100
      : 0;

    res.json({
      userStats: {
        usedTraffic: userCache.usedTraffic,
        trafficLimit: userCache.trafficLimit,
        status: userCache.status,
        usagePercent: Math.round(usagePercent * 100) / 100,
        remainingTraffic: Math.max(userCache.trafficLimit - userCache.usedTraffic, 0),
        lastUpdate: userCache.lastUpdate
      },
      portStats: formatPortStats(portStats),
      period: {
        startTime,
        endTime,
        days,
        groupBy
      }
    });
  } catch (error) {
    console.error('❌ 获取流量统计失败:', error);
    res.status(500).json({ error: '获取流量统计失败' });
  }
});

/**
 * 获取用户网速历史
 *
 * 查询参数:
 * - hours: 查询小时数 (默认24小时)
 *
 * 响应格式:
 * [
 *   {
 *     "time": "2024-01-15T10:30:00Z",
 *     "port": 10004,
 *     "inputRate": 1024.5,
 *     "outputRate": 2048.3,
 *     "totalRate": 3072.8
 *   }
 * ]
 */
router.get('/speed-history', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const hours = parseInt(req.query.hours) || 24;

    console.log(`🚀 获取用户 ${userId} 网速历史: ${hours}小时`);

    // 暂时屏蔽网速历史功能
    const speedHistory = []; // await timeSeriesService.getUserSpeedHistory(userId, hours);

    res.json({
      data: speedHistory,
      period: {
        hours,
        startTime: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
        endTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ 获取网速历史失败:', error);
    res.status(500).json({ error: '获取网速历史失败' });
  }
});

/**
 * 获取流量使用趋势
 *
 * 查询参数:
 * - days: 统计天数 (默认30天)
 *
 * 响应格式:
 * [
 *   {
 *     "date": "2024-01-15",
 *     "totalBytes": 1073741824,
 *     "inputBytes": 536870912,
 *     "outputBytes": 536870912
 *   }
 * ]
 */
router.get('/trend', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;

    console.log(`📈 获取用户 ${userId} 流量趋势: ${days}天`);

    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const trendData = await timeSeriesService.getUserTrafficStats(userId, startTime, endTime, 'day');

    res.json({
      data: formatTrendData(trendData, days),
      period: {
        days,
        startTime,
        endTime
      }
    });
  } catch (error) {
    console.error('❌ 获取流量趋势失败:', error);
    res.status(500).json({ error: '获取流量趋势失败' });
  }
});

/**
 * 重置用户流量 (管理员功能)
 *
 * 请求体:
 * {
 *   "reason": "月度重置"
 * }
 */
router.post('/reset/:userId', auth, async (req, res) => {
  try {
    // 检查权限 (只有管理员或用户本人可以重置)
    const targetUserId = parseInt(req.params.userId);
    if (req.user.role !== 'admin' && req.user.id !== targetUserId) {
      return res.status(403).json({ error: '权限不足' });
    }

    const reason = req.body.reason || '手动重置';

    console.log(`🔄 重置用户 ${targetUserId} 流量, 原因: ${reason}`);

    // 更新缓存
    try {
      multiInstanceCacheService.clearUserCache(targetUserId);
      await multiInstanceCacheService.resetUserTrafficCache(targetUserId);
      console.log(`✅ 用户 ${targetUserId} 缓存已更新`);
    } catch (cacheError) {
      console.warn('⚠️ 更新缓存失败:', cacheError.message);
    }

    // 更新数据库
    await User.update(
      {
        usedTraffic: 0,
        lastTrafficReset: new Date(),
        userStatus: 'active'
      },
      { where: { id: targetUserId } }
    );

    res.json({
      success: true,
      message: '流量已重置',
      userId: targetUserId,
      reason,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 重置流量失败:', error);
    res.status(500).json({ error: '重置流量失败' });
  }
});

/**
 * 设置用户流量限额 (管理员功能)
 *
 * 请求体:
 * {
 *   "trafficLimit": 10737418240  // 字节数
 * }
 */
router.put('/limit/:userId', auth, async (req, res) => {
  try {
    // 检查管理员权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }

    const targetUserId = parseInt(req.params.userId);
    const trafficLimit = parseInt(req.body.trafficLimit);

    if (!trafficLimit || trafficLimit < 0) {
      return res.status(400).json({ error: '流量限额必须为正数' });
    }

    console.log(`⚖️ 设置用户 ${targetUserId} 流量限额: ${trafficLimit} 字节`);

    // 更新缓存
    try {
      // 多实例缓存会在下次同步时自动更新
      console.log(`✅ 用户 ${targetUserId} 流量限额将在下次缓存同步时更新`);
    } catch (cacheError) {
      console.warn('⚠️ 更新缓存失败:', cacheError.message);
    }

    // 更新数据库
    await User.update(
      { trafficLimit },
      { where: { id: targetUserId } }
    );

    res.json({
      success: true,
      message: '流量限额已设置',
      userId: targetUserId,
      trafficLimit,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 设置流量限额失败:', error);
    res.status(500).json({ error: '设置流量限额失败' });
  }
});

/**
 * 获取流量日志 (用于流量统计页面)
 *
 * 查询参数:
 * - page: 页码 (默认1)
 * - pageSize: 每页条数 (默认20)
 * - startDate: 开始日期 (ISO字符串)
 * - endDate: 结束日期 (ISO字符串)
 * - userId: 用户ID (可选，管理员可查看所有用户)
 *
 * 响应格式:
 * {
 *   "logs": [...],
 *   "total": 100,
 *   "stats": {
 *     "total": 1073741824,
 *     "upload": 536870912,
 *     "download": 536870912
 *   },
 *   "chartData": {
 *     "timestamps": [...],
 *     "upload": [...],
 *     "download": [...]
 *   }
 * }
 */
router.get('/logs', auth, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      startDate,
      endDate,
      userId: targetUserId
    } = req.query;

    console.log(`📋 获取流量日志: 页码=${page}, 大小=${pageSize}, 用户=${targetUserId || '当前用户'}`);

    // 权限检查
    let queryUserId = req.user.id;
    if (targetUserId) {
      if (req.user.role !== 'admin' && parseInt(targetUserId) !== req.user.id) {
        return res.status(403).json({ error: '权限不足' });
      }
      queryUserId = parseInt(targetUserId);
    }

    // 设置时间范围
    const endTime = endDate ? new Date(endDate) : new Date();
    const startTime = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 默认7天

    console.log(`📅 查询时间范围: ${startTime.toISOString()} - ${endTime.toISOString()}`);

    // 从时序数据库获取流量记录
    const trafficData = await timeSeriesService.getTrafficLogs(
      queryUserId,
      startTime.toISOString(),
      endTime.toISOString(),
      parseInt(page),
      parseInt(pageSize)
    );

    // 获取统计数据
    const stats = await timeSeriesService.getTrafficStats(
      queryUserId,
      startTime.toISOString(),
      endTime.toISOString()
    );

    // 获取图表数据 (按小时聚合)
    const chartData = await timeSeriesService.getTrafficChartData(
      queryUserId,
      startTime.toISOString(),
      endTime.toISOString(),
      'hour'
    );

    res.json({
      data: {
        logs: trafficData.logs || [],
        total: trafficData.total || 0,
        stats: {
          total: stats.totalBytes || 0,
          upload: stats.inputBytes || 0,
          download: stats.outputBytes || 0
        },
        chartData: {
          timestamps: chartData.timestamps || [],
          upload: chartData.inputBytes || [],
          download: chartData.outputBytes || []
        }
      },
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: trafficData.total || 0
      },
      period: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    });
  } catch (error) {
    console.error('❌ 获取流量日志失败:', error);
    res.status(500).json({ error: '获取流量日志失败' });
  }
});

/**
 * 获取流量排行榜 (管理员功能)
 *
 * 查询参数:
 * - limit: 返回数量 (默认10)
 * - days: 统计天数 (默认7天)
 */
router.get('/ranking', auth, async (req, res) => {
  try {
    // 检查管理员权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }

    const limit = parseInt(req.query.limit) || 10;
    const days = parseInt(req.query.days) || 7;

    console.log(`🏆 获取流量排行榜: 前${limit}名, ${days}天`);

    const ranking = await timeSeriesService.getTrafficRanking(limit, days);

    // 获取用户信息
    const userIds = ranking.map(item => item.userId);
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ['id', 'username', 'email']
    });

    const userMap = new Map(users.map(user => [user.id, user]));

    const enrichedRanking = ranking.map((item, index) => {
      const user = userMap.get(parseInt(item.userId));
      return {
        rank: index + 1,
        userId: item.userId,
        username: user?.username || 'Unknown',
        email: user?.email || '',
        totalBytes: item.totalBytes,
        formattedTraffic: formatBytes(item.totalBytes)
      };
    });

    res.json({
      data: enrichedRanking,
      period: {
        days,
        limit
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取流量排行榜失败:', error);
    res.status(500).json({ error: '获取流量排行榜失败' });
  }
});

/**
 * 格式化端口统计数据
 */
function formatPortStats(rawStats) {
  const portMap = new Map();

  rawStats.forEach(stat => {
    const port = stat.port;
    if (!portMap.has(port)) {
      portMap.set(port, {
        port,
        inputBytes: 0,
        outputBytes: 0,
        totalBytes: 0
      });
    }

    const portStat = portMap.get(port);
    portStat.inputBytes += stat.inputBytes || 0;
    portStat.outputBytes += stat.outputBytes || 0;
    portStat.totalBytes += stat.totalBytes || 0;
  });

  return Array.from(portMap.values()).map(stat => ({
    ...stat,
    formattedTotal: formatBytes(stat.totalBytes),
    formattedInput: formatBytes(stat.inputBytes),
    formattedOutput: formatBytes(stat.outputBytes)
  }));
}

/**
 * 格式化趋势数据
 */
function formatTrendData(rawData, days) {
  const dailyStats = new Map();

  rawData.forEach(item => {
    const date = new Date(item.time).toDateString();
    if (!dailyStats.has(date)) {
      dailyStats.set(date, {
        date,
        totalBytes: 0,
        inputBytes: 0,
        outputBytes: 0
      });
    }

    const dayStat = dailyStats.get(date);
    dayStat.totalBytes += item.totalBytes || 0;
    dayStat.inputBytes += item.inputBytes || 0;
    dayStat.outputBytes += item.outputBytes || 0;
  });

  return Array.from(dailyStats.values())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(stat => ({
      ...stat,
      formattedTotal: formatBytes(stat.totalBytes)
    }));
}

/**
 * 格式化字节数显示
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;