/**
 * 系统配置管理路由
 * 提供GOST性能参数配置和单机模式管理
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { SystemConfig } = require('../models');

/**
 * 获取当前系统配置
 * GET /api/system-config
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = await SystemConfig.getCurrentConfig();
    
    res.json({
      success: true,
      data: config,
      message: '获取系统配置成功'
    });
  } catch (error) {
    console.error('获取系统配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统配置失败',
      error: error.message
    });
  }
});

/**
 * 更新系统配置
 * PUT /api/system-config
 */
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      isSimpleMode,
      authTimeout,
      observerTimeout,
      limiterTimeout,
      authCacheTimeout,
      limiterCacheTimeout,
      multiInstanceCacheTTL,
      autoSyncInterval,
      minSyncInterval,
      cacheCoordinatorSyncInterval,
      healthCheckInterval,
      multiInstanceSyncInterval,
      description
    } = req.body;

    // 验证参数
    const errors = [];
    
    if (authTimeout !== undefined && (authTimeout < 1 || authTimeout > 60)) {
      errors.push('认证器超时时间必须在1-60秒之间');
    }
    
    if (observerTimeout !== undefined && (observerTimeout < 1 || observerTimeout > 60)) {
      errors.push('观察器超时时间必须在1-60秒之间');
    }
    
    if (limiterTimeout !== undefined && (limiterTimeout < 1 || limiterTimeout > 60)) {
      errors.push('限制器超时时间必须在1-60秒之间');
    }
    
    if (authCacheTimeout !== undefined && (authCacheTimeout < 60000 || authCacheTimeout > 3600000)) {
      errors.push('认证器缓存超时时间必须在1-60分钟之间');
    }
    
    if (limiterCacheTimeout !== undefined && (limiterCacheTimeout < 30000 || limiterCacheTimeout > 1800000)) {
      errors.push('限制器缓存超时时间必须在30秒-30分钟之间');
    }
    
    if (autoSyncInterval !== undefined && (autoSyncInterval < 60000 || autoSyncInterval > 3600000)) {
      errors.push('自动同步间隔必须在1-60分钟之间');
    }
    
    if (minSyncInterval !== undefined && (minSyncInterval < 5000 || minSyncInterval > 300000)) {
      errors.push('最小同步间隔必须在5秒-5分钟之间');
    }
    
    if (healthCheckInterval !== undefined && (healthCheckInterval < 30000 || healthCheckInterval > 600000)) {
      errors.push('健康检查间隔必须在30秒-10分钟之间');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors
      });
    }

    // 获取当前配置
    const currentConfig = await SystemConfig.getCurrentConfig();
    const oldIsSimpleMode = currentConfig.isSimpleMode;

    // 更新配置
    const updatedConfig = await SystemConfig.updateConfig({
      isSimpleMode,
      authTimeout,
      observerTimeout,
      limiterTimeout,
      authCacheTimeout,
      limiterCacheTimeout,
      multiInstanceCacheTTL,
      autoSyncInterval,
      minSyncInterval,
      cacheCoordinatorSyncInterval,
      healthCheckInterval,
      multiInstanceSyncInterval
    }, req.user.id, description);

    // 如果模式发生变化，需要重新初始化相关服务
    if (oldIsSimpleMode !== isSimpleMode) {
      console.log(`🔄 系统模式变更: ${oldIsSimpleMode ? '单机模式' : '自动模式'} → ${isSimpleMode ? '单机模式' : '自动模式'}`);

      // 通知系统模式管理器
      const systemModeManager = require('../services/systemModeManager');
      await systemModeManager.switchMode(isSimpleMode);
    }

    // 如果不是单机模式且其他配置发生变化，需要重新加载配置
    if (!isSimpleMode) {
      const configManager = require('../services/configManager');
      await configManager.reloadConfig();
    }

    res.json({
      success: true,
      data: updatedConfig,
      message: '系统配置更新成功'
    });

  } catch (error) {
    console.error('更新系统配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新系统配置失败',
      error: error.message
    });
  }
});

/**
 * 切换系统模式
 * POST /api/system-config/switch-mode
 */
router.post('/switch-mode', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { isSimpleMode, description } = req.body;

    if (typeof isSimpleMode !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: '模式参数必须为布尔值'
      });
    }

    const currentConfig = await SystemConfig.getCurrentConfig();
    
    if (currentConfig.isSimpleMode === isSimpleMode) {
      return res.json({
        success: true,
        message: `系统已处于${isSimpleMode ? '单击模式' : '自动模式'}`
      });
    }

    // 更新模式
    await SystemConfig.updateConfig({
      isSimpleMode
    }, req.user.id, description || `切换到${isSimpleMode ? '单击模式' : '自动模式'}`);

    // 切换系统模式
    const systemModeManager = require('../services/systemModeManager');
    await systemModeManager.switchMode(isSimpleMode);

    res.json({
      success: true,
      message: `成功切换到${isSimpleMode ? '单击模式' : '自动模式'}`,
      data: {
        isSimpleMode,
        switchedAt: new Date()
      }
    });

  } catch (error) {
    console.error('切换系统模式失败:', error);
    res.status(500).json({
      success: false,
      message: '切换系统模式失败',
      error: error.message
    });
  }
});

/**
 * 获取配置参数说明
 * GET /api/system-config/help
 */
router.get('/help', requireAuth, requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'GOST性能参数配置说明',
      sections: [
        {
          name: '系统模式',
          description: '控制系统的运行模式',
          parameters: [
            {
              key: 'isSimpleMode',
              name: '单击模式',
              description: '启用后禁用所有自动化功能，需要管理员手动同步配置',
              type: 'boolean',
              default: false,
              impact: '高 - 完全改变系统行为'
            }
          ]
        },
        {
          name: 'GOST插件超时配置',
          description: '控制GOST插件的响应超时时间，影响连接建立速度',
          parameters: [
            {
              key: 'authTimeout',
              name: '认证器超时',
              description: '用户认证的最大等待时间，过短可能导致认证失败',
              type: 'integer',
              unit: '秒',
              range: '1-60',
              default: 5,
              impact: '中 - 影响连接建立速度'
            },
            {
              key: 'observerTimeout',
              name: '观察器超时',
              description: '流量统计的最大等待时间，不影响转发性能',
              type: 'integer',
              unit: '秒',
              range: '1-60',
              default: 10,
              impact: '低 - 仅影响统计准确性'
            },
            {
              key: 'limiterTimeout',
              name: '限制器超时',
              description: '流量限制检查的最大等待时间，影响转发延迟',
              type: 'integer',
              unit: '秒',
              range: '1-60',
              default: 5,
              impact: '高 - 直接影响转发性能'
            }
          ]
        },
        {
          name: '缓存配置',
          description: '控制各种缓存的生存时间，影响查询性能',
          parameters: [
            {
              key: 'authCacheTimeout',
              name: '认证器缓存时间',
              description: '用户认证结果的缓存时间，越长性能越好但实时性越差',
              type: 'integer',
              unit: '毫秒',
              range: '60000-3600000 (1-60分钟)',
              default: 600000,
              impact: '中 - 影响认证性能'
            },
            {
              key: 'limiterCacheTimeout',
              name: '限制器缓存时间',
              description: '用户配额检查结果的缓存时间',
              type: 'integer',
              unit: '毫秒',
              range: '30000-1800000 (30秒-30分钟)',
              default: 300000,
              impact: '高 - 影响限制器性能'
            }
          ]
        },
        {
          name: '同步频率配置',
          description: '控制各种自动同步的频率，影响系统响应速度',
          parameters: [
            {
              key: 'autoSyncInterval',
              name: '自动同步间隔',
              description: '配置自动同步的时间间隔，越短响应越快但资源消耗越大',
              type: 'integer',
              unit: '毫秒',
              range: '60000-3600000 (1-60分钟)',
              default: 300000,
              impact: '中 - 影响配置更新速度'
            },
            {
              key: 'healthCheckInterval',
              name: '健康检查间隔',
              description: 'GOST服务健康检查的时间间隔',
              type: 'integer',
              unit: '毫秒',
              range: '30000-600000 (30秒-10分钟)',
              default: 120000,
              impact: '低 - 影响故障检测速度'
            }
          ]
        }
      ],
      recommendations: [
        {
          scenario: '高性能场景',
          description: '追求最佳转发性能',
          settings: {
            isSimpleMode: true,
            limiterTimeout: 3,
            authCacheTimeout: 600000,
            limiterCacheTimeout: 600000
          }
        },
        {
          scenario: '平衡场景',
          description: '性能和功能的平衡',
          settings: {
            isSimpleMode: false,
            authTimeout: 5,
            limiterTimeout: 5,
            autoSyncInterval: 300000,
            healthCheckInterval: 120000
          }
        },
        {
          scenario: '高可用场景',
          description: '追求最佳稳定性和实时性',
          settings: {
            isSimpleMode: false,
            authTimeout: 10,
            limiterTimeout: 10,
            autoSyncInterval: 120000,
            healthCheckInterval: 60000
          }
        }
      ]
    }
  });
});

module.exports = router;
