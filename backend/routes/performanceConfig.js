/**
 * 🎛️ 性能配置管理API路由
 * 提供GOST性能参数配置和单击模式管理
 */

const express = require('express');
const router = express.Router();
const { auth: requireAuth, adminAuth: requireAdmin } = require('../middleware/auth');
const performanceConfigManager = require('../services/performanceConfigManager');
const systemModeManager = require('../services/systemModeManager');

/**
 * 获取当前性能配置
 * GET /api/performance-config
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = performanceConfigManager.getFullConfig();
    const stats = performanceConfigManager.getStats();
    const modeStatus = systemModeManager.getStatus();
    
    res.json({
      success: true,
      data: {
        config,
        stats,
        modeStatus
      },
      message: '获取性能配置成功'
    });
  } catch (error) {
    console.error('获取性能配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取性能配置失败',
      error: error.message
    });
  }
});

/**
 * 更新性能配置
 * PUT /api/performance-config
 */
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      systemMode,
      gostPlugins,
      cacheConfig,
      syncConfig,
      description
    } = req.body;

    // 构建更新对象
    const updates = {};
    
    if (systemMode) updates.systemMode = systemMode;
    if (gostPlugins) updates.gostPlugins = gostPlugins;
    if (cacheConfig) updates.cacheConfig = cacheConfig;
    if (syncConfig) updates.syncConfig = syncConfig;

    // 验证参数
    const errors = validateConfigUpdates(updates);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors
      });
    }

    // 检查是否需要切换模式
    const oldIsSimpleMode = systemModeManager.isSimpleMode();
    const newIsSimpleMode = updates.systemMode?.isSimpleMode;
    
    // 更新配置
    const updatedConfig = await performanceConfigManager.updateConfig(
      updates,
      req.user.username || req.user.id,
      description || '管理员更新配置'
    );

    // 如果模式发生变化，切换系统模式
    if (newIsSimpleMode !== undefined && newIsSimpleMode !== oldIsSimpleMode) {
      await systemModeManager.switchMode(newIsSimpleMode);
    }

    res.json({
      success: true,
      data: {
        config: updatedConfig,
        modeChanged: newIsSimpleMode !== undefined && newIsSimpleMode !== oldIsSimpleMode,
        oldMode: oldIsSimpleMode ? 'simple' : 'auto',
        newMode: newIsSimpleMode !== undefined ? (newIsSimpleMode ? 'simple' : 'auto') : (oldIsSimpleMode ? 'simple' : 'auto')
      },
      message: '性能配置更新成功'
    });

  } catch (error) {
    console.error('更新性能配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新性能配置失败',
      error: error.message
    });
  }
});

/**
 * 切换系统模式
 * POST /api/performance-config/switch-mode
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

    const oldMode = systemModeManager.isSimpleMode();
    
    if (oldMode === isSimpleMode) {
      return res.json({
        success: true,
        message: `系统已处于${isSimpleMode ? '单机模式' : '自动模式'}`,
        data: { mode: isSimpleMode ? 'simple' : 'auto' }
      });
    }

    // 更新配置中的模式
    await performanceConfigManager.updateConfig({
      systemMode: { isSimpleMode }
    }, req.user.username || req.user.id, description || `切换到${isSimpleMode ? '单机模式' : '自动模式'}`);

    // 切换系统模式
    await systemModeManager.switchMode(isSimpleMode);

    res.json({
      success: true,
      message: `成功切换到${isSimpleMode ? '单击模式' : '自动模式'}`,
      data: {
        oldMode: oldMode ? 'simple' : 'auto',
        newMode: isSimpleMode ? 'simple' : 'auto',
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
 * 手动同步GOST配置 (单击模式专用)
 * POST /api/performance-config/manual-sync
 */
router.post('/manual-sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!systemModeManager.isSimpleMode()) {
      return res.status(400).json({
        success: false,
        message: '手动同步仅在单击模式下可用'
      });
    }

    const result = await systemModeManager.manualSyncGost();

    res.json({
      success: true,
      data: result,
      message: 'GOST配置手动同步成功'
    });

  } catch (error) {
    console.error('手动同步GOST配置失败:', error);
    res.status(500).json({
      success: false,
      message: '手动同步GOST配置失败',
      error: error.message
    });
  }
});

/**
 * 应用预设配置
 * POST /api/performance-config/apply-preset
 */
router.post('/apply-preset', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { presetName, description } = req.body;

    if (!presetName) {
      return res.status(400).json({
        success: false,
        message: '请指定预设配置名称'
      });
    }

    const preset = await performanceConfigManager.applyPreset(
      presetName,
      req.user.username || req.user.id
    );

    // 如果预设包含模式切换，需要切换系统模式
    if (preset.config.systemMode?.isSimpleMode !== undefined) {
      await systemModeManager.switchMode(preset.config.systemMode.isSimpleMode);
    }

    res.json({
      success: true,
      data: {
        preset,
        appliedAt: new Date()
      },
      message: `预设配置"${preset.name}"应用成功`
    });

  } catch (error) {
    console.error('应用预设配置失败:', error);
    res.status(500).json({
      success: false,
      message: '应用预设配置失败',
      error: error.message
    });
  }
});

/**
 * 获取配置帮助信息
 * GET /api/performance-config/help
 */
router.get('/help', requireAuth, requireAdmin, async (req, res) => {
  try {
    // 从配置文件读取帮助信息
    const fullConfig = performanceConfigManager.getFullConfig();
    
    res.json({
      success: true,
      data: {
        title: 'GOST性能参数配置说明',
        parameterHelp: fullConfig.parameterHelp || {},
        presets: fullConfig.presets || {},
        currentMode: systemModeManager.isSimpleMode() ? 'simple' : 'auto'
      }
    });
  } catch (error) {
    console.error('获取配置帮助失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置帮助失败',
      error: error.message
    });
  }
});

/**
 * 获取系统状态
 * GET /api/performance-config/status
 */
router.get('/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const modeStatus = systemModeManager.getStatus();
    const configStats = performanceConfigManager.getStats();
    
    // 获取各服务的实际状态
    const serviceStatus = await getServiceStatus();
    
    res.json({
      success: true,
      data: {
        mode: modeStatus,
        config: configStats,
        services: serviceStatus,
        timestamp: new Date()
      }
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

/**
 * 验证配置更新参数
 */
function validateConfigUpdates(updates) {
  const errors = [];
  
  // 验证GOST插件配置
  if (updates.gostPlugins) {
    const { authTimeout, observerTimeout, limiterTimeout } = updates.gostPlugins;
    
    if (authTimeout !== undefined && (authTimeout < 1 || authTimeout > 60)) {
      errors.push('认证器超时时间必须在1-60秒之间');
    }
    
    if (observerTimeout !== undefined && (observerTimeout < 1 || observerTimeout > 60)) {
      errors.push('观察器超时时间必须在1-60秒之间');
    }
    
    if (limiterTimeout !== undefined && (limiterTimeout < 1 || limiterTimeout > 60)) {
      errors.push('限制器超时时间必须在1-60秒之间');
    }
  }
  
  // 验证缓存配置
  if (updates.cacheConfig) {
    const { authCacheTimeout, limiterCacheTimeout, multiInstanceCacheTTL } = updates.cacheConfig;
    
    if (authCacheTimeout !== undefined && (authCacheTimeout < 60000 || authCacheTimeout > 3600000)) {
      errors.push('认证器缓存超时时间必须在1-60分钟之间');
    }
    
    if (limiterCacheTimeout !== undefined && (limiterCacheTimeout < 30000 || limiterCacheTimeout > 1800000)) {
      errors.push('限制器缓存超时时间必须在30秒-30分钟之间');
    }
    
    if (multiInstanceCacheTTL !== undefined && (multiInstanceCacheTTL < 30000 || multiInstanceCacheTTL > 600000)) {
      errors.push('多实例缓存TTL必须在30秒-10分钟之间');
    }
  }
  
  // 验证同步配置
  if (updates.syncConfig) {
    const { autoSyncInterval, minSyncInterval, healthCheckInterval } = updates.syncConfig;
    
    if (autoSyncInterval !== undefined && (autoSyncInterval < 60000 || autoSyncInterval > 3600000)) {
      errors.push('自动同步间隔必须在1-60分钟之间');
    }
    
    if (minSyncInterval !== undefined && (minSyncInterval < 5000 || minSyncInterval > 300000)) {
      errors.push('最小同步间隔必须在5秒-5分钟之间');
    }
    
    if (healthCheckInterval !== undefined && (healthCheckInterval < 30000 || healthCheckInterval > 600000)) {
      errors.push('健康检查间隔必须在30秒-10分钟之间');
    }
  }
  
  return errors;
}

/**
 * 获取各服务的实际状态
 */
async function getServiceStatus() {
  const status = {};
  
  try {
    // GOST服务状态
    const gostService = require('../services/gostService');
    status.gost = {
      isRunning: gostService.isRunning,
      hasPlugins: !systemModeManager.isSimpleMode()
    };
  } catch (error) {
    status.gost = { error: error.message };
  }
  
  try {
    // 同步协调器状态
    const gostSyncCoordinator = require('../services/gostSyncCoordinator');
    status.syncCoordinator = {
      isActive: !systemModeManager.isSimpleMode(),
      stats: gostSyncCoordinator.getStats ? gostSyncCoordinator.getStats() : null
    };
  } catch (error) {
    status.syncCoordinator = { error: error.message };
  }
  
  try {
    // 缓存协调器状态
    const cacheCoordinator = require('../services/cacheCoordinator');
    status.cacheCoordinator = {
      isActive: !systemModeManager.isSimpleMode(),
      stats: cacheCoordinator.getStats ? cacheCoordinator.getStats() : null
    };
  } catch (error) {
    status.cacheCoordinator = { error: error.message };
  }
  
  return status;
}

module.exports = router;
