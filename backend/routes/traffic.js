/**
 * 流量统计 API 路由
 *
 * 功能说明:
 * 1. 提供用户流量统计查询接口
 * 2. 提供流量管理功能 (重置、设置限额等)
 * 3. 提供管理员流量监控功能
 *
 * 路由端点:
 * GET /api/traffic/stats - 获取用户流量统计
 * POST /api/traffic/reset/:userId - 重置用户流量
 * PUT /api/traffic/limit/:userId - 设置用户流量限额
 * GET /api/traffic/ranking - 获取流量排行榜
 */

const express = require('express');
const router = express.Router();
const multiInstanceCacheService = require('../services/multiInstanceCacheService');
const { models } = require('../services/dbService');
const { User } = models;
const { auth } = require('../middleware/auth');

/**
 * 获取当前用户的流量统计
 *
 * 响应格式:
 * {
 *   "userStats": {
 *     "usedTraffic": 5368709120,
 *     "trafficQuota": 10737418240,
 *     "status": "active",
 *     "usagePercent": 50.0
 *   }
 * }
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📊 获取用户 ${userId} 流量统计`);

    // 从数据库获取用户信息
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 计算使用百分比
    const trafficQuotaBytes = user.trafficQuota ? user.trafficQuota * 1024 * 1024 * 1024 : 0; // GB转字节
    const usagePercent = trafficQuotaBytes > 0
      ? (user.usedTraffic / trafficQuotaBytes) * 100
      : 0;

    res.json({
      userStats: {
        usedTraffic: user.usedTraffic,
        trafficQuota: user.trafficQuota,
        trafficQuotaBytes,
        status: user.userStatus,
        usagePercent: Math.round(usagePercent * 100) / 100,
        remainingTraffic: Math.max(trafficQuotaBytes - user.usedTraffic, 0),
        formattedUsedTraffic: formatBytes(user.usedTraffic),
        formattedQuota: user.trafficQuota ? `${user.trafficQuota}GB` : '无限制',
        lastUpdate: user.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ 获取流量统计失败:', error);
    res.status(500).json({ error: '获取流量统计失败' });
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

    // 更新数据库
    await User.update(
      {
        usedTraffic: 0,
        lastTrafficReset: new Date(),
        userStatus: 'active'
      },
      { where: { id: targetUserId } }
    );

    // 🚀 优化: 使用缓存协调器统一清理缓存
    try {
      const cacheCoordinator = require('../services/cacheCoordinator');
      await cacheCoordinator.clearUserRelatedCache(targetUserId, 'traffic_reset_simple');
      console.log(`✅ 用户 ${targetUserId} 所有相关缓存已清理`);
    } catch (cacheError) {
      console.warn('⚠️ 清理缓存失败:', cacheError.message);
    }

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
 *   "trafficQuota": 10  // GB数
 * }
 */
router.put('/limit/:userId', auth, async (req, res) => {
  try {
    // 检查管理员权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }

    const targetUserId = parseInt(req.params.userId);
    const trafficQuota = parseFloat(req.body.trafficQuota);

    if (trafficQuota !== null && (trafficQuota < 0 || trafficQuota > 10240)) {
      return res.status(400).json({ error: '流量限额必须在0-10240GB之间' });
    }

    console.log(`⚖️ 设置用户 ${targetUserId} 流量限额: ${trafficQuota}GB`);

    // 更新数据库
    await User.update(
      { trafficQuota },
      { where: { id: targetUserId } }
    );

    // 🚀 优化: 使用缓存协调器统一清理缓存
    try {
      const cacheCoordinator = require('../services/cacheCoordinator');
      await cacheCoordinator.clearUserRelatedCache(targetUserId, 'traffic_quota_update');
      console.log(`✅ 用户 ${targetUserId} 所有相关缓存已清理`);
    } catch (cacheError) {
      console.warn('⚠️ 清理缓存失败:', cacheError.message);
    }

    res.json({
      success: true,
      message: '流量限额已设置',
      userId: targetUserId,
      trafficQuota,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 设置流量限额失败:', error);
    res.status(500).json({ error: '设置流量限额失败' });
  }
});

/**
 * 获取流量排行榜 (管理员功能)
 */
router.get('/ranking', auth, async (req, res) => {
  try {
    // 检查管理员权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }

    const limit = parseInt(req.query.limit) || 10;

    console.log(`🏆 获取流量排行榜: 前${limit}名`);

    // 从数据库获取用户流量排行
    const users = await User.findAll({
      where: { role: 'user' },
      attributes: ['id', 'username', 'email', 'usedTraffic', 'trafficQuota'],
      order: [['usedTraffic', 'DESC']],
      limit
    });

    const ranking = users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      username: user.username,
      email: user.email,
      usedTraffic: user.usedTraffic,
      trafficQuota: user.trafficQuota,
      formattedTraffic: formatBytes(user.usedTraffic),
      formattedQuota: user.trafficQuota ? `${user.trafficQuota}GB` : '无限制'
    }));

    res.json({
      data: ranking,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取流量排行榜失败:', error);
    res.status(500).json({ error: '获取流量排行榜失败' });
  }
});

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