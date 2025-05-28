const express = require('express');
const router = express.Router();
const gostConfigService = require('../services/gostConfigService');
const { auth } = require('../middleware/auth');

// 🔒 生产环境安全中间件
const productionSafetyMiddleware = (req, res, next) => {
  const env = process.env.NODE_ENV || 'development';

  // 在生产环境中，某些危险操作需要额外验证
  if (env === 'production') {
    const dangerousEndpoints = ['/compare', '/sync'];
    const isDangerous = dangerousEndpoints.some(endpoint => req.path.includes(endpoint));

    if (isDangerous) {
      // 检查是否有特殊的生产环境授权
      const productionAuth = req.headers['x-production-auth'];
      if (!productionAuth || productionAuth !== process.env.PRODUCTION_AUTH_TOKEN) {
        return res.status(403).json({
          success: false,
          message: '生产环境中此操作需要特殊授权',
          error: 'PRODUCTION_SAFETY_BLOCK'
        });
      }
    }
  }

  next();
};

/**
 * 生成当前的 Gost 配置（基于数据库中的有效规则）
 */
router.get('/generate', auth, async (req, res) => {
  try {
    const config = await gostConfigService.generateGostConfig();
    res.json({
      success: true,
      data: config,
      message: '配置生成成功'
    });
  } catch (error) {
    console.error('生成配置失败:', error);
    res.status(500).json({
      success: false,
      message: '生成配置失败',
      error: error.message
    });
  }
});

/**
 * 获取当前持久化的配置
 */
router.get('/current', auth, async (req, res) => {
  try {
    const config = await gostConfigService.getCurrentPersistedConfig();
    res.json({
      success: true,
      data: config,
      message: '获取当前配置成功'
    });
  } catch (error) {
    console.error('获取当前配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取当前配置失败',
      error: error.message
    });
  }
});

/**
 * 手动同步配置
 */
router.post('/sync', auth, productionSafetyMiddleware, async (req, res) => {
  try {
    // 检查权限 - 只有管理员可以手动同步
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '权限不足，只有管理员可以执行此操作'
      });
    }

    const result = await gostConfigService.triggerSync();
    res.json({
      success: true,
      data: result,
      message: result.updated ? '配置已更新并同步' : '配置无变化'
    });
  } catch (error) {
    console.error('手动同步失败:', error);
    res.status(500).json({
      success: false,
      message: '同步配置失败',
      error: error.message
    });
  }
});

/**
 * 启动自动同步
 */
router.post('/auto-sync/start', auth, async (req, res) => {
  try {
    // 检查权限 - 只有管理员可以控制自动同步
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '权限不足，只有管理员可以执行此操作'
      });
    }

    gostConfigService.startAutoSync();
    res.json({
      success: true,
      message: '自动同步已启动'
    });
  } catch (error) {
    console.error('启动自动同步失败:', error);
    res.status(500).json({
      success: false,
      message: '启动自动同步失败',
      error: error.message
    });
  }
});

/**
 * 停止自动同步
 */
router.post('/auto-sync/stop', auth, async (req, res) => {
  try {
    // 检查权限 - 只有管理员可以控制自动同步
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '权限不足，只有管理员可以执行此操作'
      });
    }

    gostConfigService.stopAutoSync();
    res.json({
      success: true,
      message: '自动同步已停止'
    });
  } catch (error) {
    console.error('停止自动同步失败:', error);
    res.status(500).json({
      success: false,
      message: '停止自动同步失败',
      error: error.message
    });
  }
});

/**
 * 获取配置统计信息
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await gostConfigService.getConfigStats();
    res.json({
      success: true,
      data: stats,
      message: '获取统计信息成功'
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计信息失败',
      error: error.message
    });
  }
});

/**
 * 比较当前配置与生成的配置
 */
router.get('/compare', auth, productionSafetyMiddleware, async (req, res) => {
  try {
    const generatedConfig = await gostConfigService.generateGostConfig();
    const currentConfig = await gostConfigService.getCurrentPersistedConfig();
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
    console.error('配置比较失败:', error);
    res.status(500).json({
      success: false,
      message: '配置比较失败',
      error: error.message
    });
  }
});

module.exports = router;
