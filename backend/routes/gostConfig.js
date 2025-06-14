const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const gostConfigService = require('../services/gostConfigService');
const productionSafetyMiddleware = require('../middleware/productionSafety');
const { defaultLogger: logger } = require('../utils/logger');

/**
 * 生成当前的 Gost 配置（基于数据库中的有效规则）- 仅管理员
 */
router.get('/generate', auth, adminAuth, async (req, res) => {
  try {
    const config = await gostConfigService.generateGostConfig();
    res.json({
      success: true,
      data: config,
      message: '配置生成成功'
    });
  } catch (error) {
    logger.error('生成配置失败:', error);
    res.status(500).json({
      success: false,
      message: '生成配置失败',
      error: error.message
    });
  }
});

/**
 * 获取当前持久化的配置 - 仅管理员
 */
router.get('/current', auth, adminAuth, async (req, res) => {
  try {
    const config = await gostConfigService.getCurrentPersistedConfig();
    res.json({
      success: true,
      data: config,
      message: '获取当前配置成功'
    });
  } catch (error) {
    logger.error('获取当前配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取当前配置失败',
      error: error.message
    });
  }
});

/**
 * 手动同步配置 - 仅管理员
 */
router.post('/sync', auth, adminAuth, productionSafetyMiddleware, async (req, res) => {
  try {
    const gostSyncCoordinator = require('../services/gostSyncCoordinator');
    const result = await gostSyncCoordinator.requestSync('manual_admin', true, 10);
    res.json({
      success: true,
      data: result,
      message: result.updated ? '配置已更新并同步' :
               result.skipped ? '同步已跳过' :
               result.queued ? '同步已加入队列' : '配置无变化'
    });
  } catch (error) {
    logger.error('手动同步失败:', error);
    res.status(500).json({
      success: false,
      message: '同步配置失败',
      error: error.message
    });
  }
});

/**
 * 启动自动同步 - 仅管理员
 */
router.post('/auto-sync/start', auth, adminAuth, async (req, res) => {
  try {
    gostConfigService.startAutoSync();
    res.json({
      success: true,
      message: '自动同步已启动'
    });
  } catch (error) {
    logger.error('启动自动同步失败:', error);
    res.status(500).json({
      success: false,
      message: '启动自动同步失败',
      error: error.message
    });
  }
});

/**
 * 停止自动同步 - 仅管理员
 */
router.post('/auto-sync/stop', auth, adminAuth, async (req, res) => {
  try {
    gostConfigService.stopAutoSync();
    res.json({
      success: true,
      message: '自动同步已停止'
    });
  } catch (error) {
    logger.error('停止自动同步失败:', error);
    res.status(500).json({
      success: false,
      message: '停止自动同步失败',
      error: error.message
    });
  }
});

/**
 * 获取配置统计信息 - 仅管理员
 */
router.get('/stats', auth, adminAuth, async (req, res) => {
  try {
    const stats = await gostConfigService.getConfigStats();
    res.json({
      success: true,
      data: stats,
      message: '获取统计信息成功'
    });
  } catch (error) {
    logger.error('获取统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计信息失败',
      error: error.message
    });
  }
});

/**
 * 比较当前配置与生成的配置 - 仅管理员
 */
router.get('/compare', auth, adminAuth, productionSafetyMiddleware, async (req, res) => {
  try {
    // 生成配置
    let generatedConfig;
    try {
      generatedConfig = await gostConfigService.generateGostConfig();
    } catch (error) {
      logger.error('生成配置失败:', error);
      return res.status(500).json({
        success: false,
        message: '生成配置失败',
        error: error.message || '未知错误'
      });
    }
    
    // 获取当前配置
    let currentConfig;
    try {
      currentConfig = await gostConfigService.getCurrentPersistedConfig();
    } catch (error) {
      logger.error('获取当前配置失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取当前配置失败',
        error: error.message || '未知错误'
      });
    }
    
    // 比较配置
    const isChanged = gostConfigService.isConfigChanged(generatedConfig, currentConfig);

    res.json({
      success: true,
      data: {
        generated: generatedConfig,
        current: currentConfig,
        isChanged: isChanged,
        generatedHash: gostConfigService.calculateConfigHash(generatedConfig),
        currentHash: gostConfigService.calculateConfigHash(currentConfig)
      },
      message: '配置比较完成'
    });
  } catch (error) {
    logger.error('配置比较失败:', error);
    res.status(500).json({
      success: false,
      message: '配置比较失败',
      error: error.message || '未知错误'
    });
  }
});

/**
 * 获取同步协调器状态 - 仅管理员
 */
router.get('/sync-status', auth, adminAuth, async (req, res) => {
  try {
    const gostSyncCoordinator = require('../services/gostSyncCoordinator');
    const status = gostSyncCoordinator.getStatus();

    res.json({
      success: true,
      data: status,
      message: '同步协调器状态获取成功'
    });
  } catch (error) {
    logger.error('获取同步协调器状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取同步协调器状态失败',
      error: error.message
    });
  }
});

/**
 * 获取实时流量监控状态 - 仅管理员
 */
router.get('/realtime-monitor-status', auth, adminAuth, async (req, res) => {
  try {
    const realTimeTrafficMonitor = require('../services/realTimeTrafficMonitor');
    const status = realTimeTrafficMonitor.getMonitoringStatus();

    res.json({
      success: true,
      data: status,
      message: '实时流量监控状态获取成功'
    });
  } catch (error) {
    logger.error('获取实时流量监控状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取实时流量监控状态失败',
      error: error.message
    });
  }
});

/**
 * 调试版本的配置比较接口 - 仅管理员
 */
router.get('/compare-debug', auth, adminAuth, async (req, res) => {
  try {
    logger.info('开始调试配置比较...');
    
    // 获取模型
    const { models } = require('../services/dbService');
    const { User, UserForwardRule } = models;
    
    // 查询规则
    let allRules = [];
    let formattedRules = [];
    
    try {
      logger.info('查询所有转发规则...');
      allRules = await UserForwardRule.findAll({
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'role']
        }]
      });
      
      logger.info(`查询到 ${allRules.length} 条规则`);
      
      // 转换规则
      formattedRules = allRules.map(rule => {
        const user = rule.user;
        if (!user) {
          logger.warn(`规则 ${rule.id} 没有关联用户，跳过`);
          return null;
        }
        
        return {
          id: rule.id,
          name: rule.name,
          protocol: rule.protocol,
          sourcePort: rule.sourcePort,
          targetAddress: rule.targetAddress,
          userId: user ? user.id : null,
          username: user ? user.username : null,
          userRole: user ? user.role : null
        };
      }).filter(Boolean); // 过滤掉null值
      
      logger.info(`格式化了 ${formattedRules.length} 条有效规则`);
      
    } catch (queryError) {
      logger.error('查询规则失败:', queryError);
      return res.status(500).json({
        success: false,
        message: '查询规则失败',
        error: queryError.message || '未知错误',
        stack: queryError.stack
      });
    }
    
    // 获取当前配置
    let currentConfig = { services: [], chains: [] };
    try {
      currentConfig = await gostConfigService.getCurrentPersistedConfig();
    } catch (configError) {
      logger.error('获取当前配置失败:', configError);
      // 继续执行，使用默认的空配置
    }
    
    res.json({
      success: true,
      data: {
        rules: formattedRules,
        current: {
          services: currentConfig.services ? currentConfig.services.length : 0,
          chains: currentConfig.chains ? currentConfig.chains.length : 0
        }
      },
      message: '调试配置比较完成'
    });
  } catch (error) {
    logger.error('调试配置比较失败:', error);
    res.status(500).json({
      success: false,
      message: '调试配置比较失败',
      error: error.message || '未知错误',
      stack: error.stack
    });
  }
});

module.exports = router;
