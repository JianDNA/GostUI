/**
 * 系统状态相关API路由
 */

const express = require('express');
const router = express.Router();
const { auth: authenticateToken, adminAuth: requireAdmin } = require('../middleware/auth');

// 获取系统状态 (仅管理员)
router.get('/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const realTimeTrafficMonitor = require('../services/realTimeTrafficMonitor');
    const quotaCoordinatorService = require('../services/quotaCoordinatorService');
    const gostSyncCoordinator = require('../services/gostSyncCoordinator');
    const gostPluginService = require('../services/gostPluginService');

    const systemStatus = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),

      // 监控服务状态
      monitor: {
        isRunning: realTimeTrafficMonitor.isMonitoring,
        stats: realTimeTrafficMonitor.getStats ? realTimeTrafficMonitor.getStats() : null
      },

      // 配额服务状态
      quota: quotaCoordinatorService.getStatus ? quotaCoordinatorService.getStatus() : null,

      // 同步服务状态
      sync: gostSyncCoordinator.getStatus ? gostSyncCoordinator.getStatus() : null,

      // 观察器状态
      observer: {
        isRunning: true, // GOST插件服务总是运行的
        port: 18081
      }
    };

    res.json({
      success: true,
      data: systemStatus
    });

  } catch (error) {
    console.error('获取系统状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统状态失败',
      error: error.message
    });
  }
});

// 获取GOST状态 (仅管理员)
router.get('/gost-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const gostHealthService = require('../services/gostHealthService');
    const gostService = require('../services/gostService');

    // 获取真正的GOST进程状态
    const gostStatus = await gostService.getStatus();

    // 获取健康检查状态
    const healthStatus = gostHealthService.getHealthStatus();

    const status = {
      isRunning: gostStatus.isRunning || false,  // 使用真正的GOST进程状态
      healthyPorts: healthStatus.healthyPorts || [],
      apiPort: '18080',
      observerPort: '18081',
      healthStatus,
      gostStatus,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('获取GOST状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取GOST状态失败',
      error: error.message
    });
  }
});

// 重启GOST服务 (仅管理员)
router.post('/restart-gost', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const gostConfigService = require('../services/gostConfigService');

    // 重新生成配置并重启服务
    const config = await gostConfigService.generateGostConfig();
    await gostConfigService.updateGostService(config);

    res.json({
      success: true,
      message: 'GOST服务重启成功'
    });

  } catch (error) {
    console.error('重启GOST服务失败:', error);
    res.status(500).json({
      success: false,
      message: '重启GOST服务失败',
      error: error.message
    });
  }
});

// 获取系统日志 (仅管理员)
router.get('/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');

    const { lines = 100, level = 'all' } = req.query;

    // 这里可以根据需要读取不同的日志文件
    const logData = {
      timestamp: new Date().toISOString(),
      lines: parseInt(lines),
      level: level,
      logs: [
        // 示例日志数据，实际应该从日志文件读取
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: '系统运行正常',
          service: 'system'
        }
      ]
    };

    res.json({
      success: true,
      data: logData
    });

  } catch (error) {
    console.error('获取系统日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统日志失败',
      error: error.message
    });
  }
});

// 获取系统统计
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { User, UserForwardRule } = require('../models');

    // 获取基本统计信息
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { role: 'user' } });
    const totalRules = await UserForwardRule.count();
    // 🔧 修复: 使用计算属性统计活跃规则
    const allRules = await UserForwardRule.findAll({
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'role', 'isActive', 'userStatus', 'expiryDate', 'portRangeStart', 'portRangeEnd', 'trafficQuota', 'usedTraffic']
      }]
    });
    const activeRules = allRules.filter(rule => {
      if (!rule.user) return false;
      return rule.isActive; // 计算属性
    }).length;

    // 获取流量统计
    const trafficStats = await User.findAll({
      attributes: [
        [User.sequelize.fn('SUM', User.sequelize.col('usedTraffic')), 'totalTraffic'],
        [User.sequelize.fn('SUM', User.sequelize.col('trafficQuota')), 'totalQuota']
      ],
      where: { role: 'user' },
      raw: true
    });

    const stats = {
      users: {
        total: totalUsers,
        active: activeUsers
      },
      rules: {
        total: totalRules,
        active: activeRules
      },
      traffic: {
        totalUsed: trafficStats[0]?.totalTraffic || 0,
        totalQuota: (trafficStats[0]?.totalQuota || 0) * 1024 * 1024 * 1024 // 转换为字节
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('获取系统统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统统计失败',
      error: error.message
    });
  }
});

// 获取实时监控状态 (仅管理员)
router.get('/monitor-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const realTimeTrafficMonitor = require('../services/realTimeTrafficMonitor');

    const status = {
      isRunning: realTimeTrafficMonitor.isMonitoring,
      stats: realTimeTrafficMonitor.getStats ? realTimeTrafficMonitor.getStats() : null,
      config: {
        monitoringInterval: realTimeTrafficMonitor.monitoringInterval,
        forceCheckInterval: realTimeTrafficMonitor.forceCheckInterval
      }
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('获取监控状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取监控状态失败',
      error: error.message
    });
  }
});

// 获取配额协调器状态 (仅管理员)
router.get('/quota-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const quotaCoordinatorService = require('../services/quotaCoordinatorService');

    const status = quotaCoordinatorService.getStatus ? quotaCoordinatorService.getStatus() : {
      message: '配额协调器状态不可用'
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('获取配额状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配额状态失败',
      error: error.message
    });
  }
});

// 获取同步协调器状态 (仅管理员)
router.get('/sync-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const gostSyncCoordinator = require('../services/gostSyncCoordinator');

    const status = gostSyncCoordinator.getStatus ? gostSyncCoordinator.getStatus() : {
      message: '同步协调器状态不可用'
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('获取同步状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取同步状态失败',
      error: error.message
    });
  }
});

// 强制同步配置 (仅管理员)
router.post('/force-sync', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const gostSyncCoordinator = require('../services/gostSyncCoordinator');

    const result = await gostSyncCoordinator.requestSync('manual_force', true, 10);

    res.json({
      success: true,
      message: '强制同步已触发',
      data: result
    });

  } catch (error) {
    console.error('强制同步失败:', error);
    res.status(500).json({
      success: false,
      message: '强制同步失败',
      error: error.message
    });
  }
});

// 获取观察器状态 (仅管理员)
router.get('/observer-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const gostPluginService = require('../services/gostPluginService');

    const status = {
      isRunning: true, // GOST插件服务总是运行的
      port: 18081,
      stats: gostPluginService.getStats ? gostPluginService.getStats() : null
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('获取观察器状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取观察器状态失败',
      error: error.message
    });
  }
});

module.exports = router;
