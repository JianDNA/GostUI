/**
 * 系统状态相关API路由
 */

const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const { handleApiError } = require('../utils/errorHandler');
const { defaultLogger, LOG_LEVELS } = require('../utils/logger');
const { models } = require('../services/dbService');
const { User, UserForwardRule } = models;

// 获取系统状态 (仅管理员)
router.get('/status', auth, adminAuth, async (req, res) => {
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
    handleApiError('获取系统状态', error, res);
  }
});

// 获取GOST状态 (仅管理员)
router.get('/gost-status', auth, adminAuth, async (req, res) => {
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
    handleApiError('获取GOST状态', error, res);
  }
});

// 重启GOST服务 (仅管理员)
router.post('/restart-gost', auth, adminAuth, async (req, res) => {
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
    handleApiError('重启GOST服务', error, res);
  }
});

// 获取系统日志 (仅管理员)
router.get('/logs', auth, adminAuth, async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');

    const { lines = 100, level = 'all', file = 'application' } = req.query;
    
    let logFilePath;
    if (file === 'error') {
      logFilePath = path.join(__dirname, '../logs/error.log');
    } else {
      logFilePath = path.join(__dirname, '../logs/application.log');
    }
    
    // 检查文件是否存在
    try {
      await fs.access(logFilePath);
    } catch (error) {
      return res.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          lines: parseInt(lines),
          level: level,
          file: file,
          logs: [],
          message: '日志文件不存在'
        }
      });
    }
    
    // 读取日志文件
    const logContent = await fs.readFile(logFilePath, 'utf8');
    const logLines = logContent.split('\n').filter(line => line.trim());
    
    // 根据级别过滤
    let filteredLogs = logLines;
    if (level !== 'all') {
      filteredLogs = logLines.filter(line => line.includes(`[${level.toUpperCase()}]`));
    }
    
    // 获取最新的行
    const logs = filteredLogs.slice(-parseInt(lines)).map(line => {
      try {
        // 尝试解析JSON格式的日志
        if (line.startsWith('{') && line.endsWith('}')) {
          return JSON.parse(line);
        }
        // 处理普通文本格式
        return { raw: line };
      } catch (e) {
        return { raw: line };
      }
    });

    const logData = {
      timestamp: new Date().toISOString(),
      lines: parseInt(lines),
      level: level,
      file: file,
      totalLines: logLines.length,
      filteredLines: filteredLogs.length,
      logs: logs
    };

    res.json({
      success: true,
      data: logData
    });

  } catch (error) {
    handleApiError('获取系统日志', error, res);
  }
});

// 获取日志级别 (仅管理员)
router.get('/log-level', auth, adminAuth, (req, res) => {
  try {
    const currentLevel = defaultLogger.getLevel();
    const availableLevels = Object.keys(LOG_LEVELS);
    
    res.json({
      success: true,
      data: {
        currentLevel,
        availableLevels,
        config: defaultLogger.getConfig()
      }
    });
  } catch (error) {
    handleApiError('获取日志级别', error, res);
  }
});

// 设置日志级别 (仅管理员)
router.post('/log-level', auth, adminAuth, (req, res) => {
  try {
    const { level } = req.body;
    
    if (!level || !LOG_LEVELS.hasOwnProperty(level)) {
      return res.status(400).json({
        success: false,
        message: '无效的日志级别',
        availableLevels: Object.keys(LOG_LEVELS)
      });
    }
    
    defaultLogger.setLevel(level);
    
    res.json({
      success: true,
      message: `日志级别已设置为 ${level}`,
      data: {
        currentLevel: defaultLogger.getLevel(),
        availableLevels: Object.keys(LOG_LEVELS)
      }
    });
  } catch (error) {
    handleApiError('设置日志级别', error, res);
  }
});

// 获取系统统计
router.get('/stats', auth, async (req, res) => {
  try {
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
        totalQuota: trafficStats[0]?.totalQuota || 0
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    handleApiError('获取系统统计', error, res);
  }
});

// 获取监控状态 (仅管理员)
router.get('/monitor-status', auth, adminAuth, async (req, res) => {
  try {
    const realTimeTrafficMonitor = require('../services/realTimeTrafficMonitor');

    const status = realTimeTrafficMonitor.getMonitoringStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    handleApiError('获取监控状态', error, res);
  }
});

// 获取配额状态 (仅管理员)
router.get('/quota-status', auth, adminAuth, async (req, res) => {
  try {
    const quotaManagementService = require('../services/quotaManagementService');
    
    // 检查服务是否有getStatus方法
    if (!quotaManagementService.getStatus) {
      // 如果没有getStatus方法，返回基本状态信息
      const basicStatus = {
        isRunning: false,
        message: '配额管理服务未完全初始化',
        timestamp: new Date().toISOString()
      };
      
      return res.json({
        success: true,
        data: basicStatus
      });
    }
    
    const status = await quotaManagementService.getStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    handleApiError('获取配额状态', error, res);
  }
});

// 获取同步状态 (仅管理员)
router.get('/sync-status', auth, adminAuth, async (req, res) => {
  try {
    const gostSyncCoordinator = require('../services/gostSyncCoordinator');
    const status = gostSyncCoordinator.getStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    handleApiError('获取同步状态', error, res);
  }
});

// 强制同步 (仅管理员)
router.post('/force-sync', auth, adminAuth, async (req, res) => {
  try {
    const gostSyncCoordinator = require('../services/gostSyncCoordinator');
    const result = await gostSyncCoordinator.requestSync('manual_admin', true);

    res.json({
      success: true,
      data: result,
      message: '强制同步请求已发送'
    });

  } catch (error) {
    handleApiError('强制同步', error, res);
  }
});

// 获取观察器状态 (仅管理员)
router.get('/observer-status', auth, adminAuth, async (req, res) => {
  try {
    const gostPluginService = require('../services/gostPluginService');
    const status = {
      isRunning: true, // 观察器总是运行的
      port: 18081,
      bufferSize: gostPluginService.trafficBuffer ? gostPluginService.trafficBuffer.size : 0,
      speedBufferSize: gostPluginService.speedBuffer ? gostPluginService.speedBuffer.size : 0,
      lastFlushTime: gostPluginService.lastFlushTime,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    handleApiError('获取观察器状态', error, res);
  }
});

// 获取当前系统模式
router.get('/mode', auth, adminAuth, async (req, res) => {
  try {
    const systemModeManager = require('../services/systemModeManager');
    const isSimpleMode = systemModeManager.isSimpleMode();
    
    res.json({
      success: true,
      data: {
        mode: isSimpleMode ? 'simple' : 'auto',
        description: isSimpleMode ? '单机模式' : '自动模式'
      },
      message: '获取系统模式成功'
    });
  } catch (error) {
    handleApiError('获取系统模式', error, res);
  }
});

// 切换到单机模式
router.post('/mode/simple', auth, adminAuth, async (req, res) => {
  try {
    const systemModeManager = require('../services/systemModeManager');
    await systemModeManager.switchMode(true);
    
    res.json({
      success: true,
      data: {
        mode: 'simple',
        description: '单机模式'
      },
      message: '已切换到单机模式'
    });
  } catch (error) {
    handleApiError('切换到单机模式', error, res);
  }
});

// 切换到自动模式
router.post('/mode/auto', auth, adminAuth, async (req, res) => {
  try {
    const systemModeManager = require('../services/systemModeManager');
    await systemModeManager.switchMode(false);
    
    res.json({
      success: true,
      data: {
        mode: 'auto',
        description: '自动模式'
      },
      message: '已切换到自动模式'
    });
  } catch (error) {
    handleApiError('切换到自动模式', error, res);
  }
});

module.exports = router;
