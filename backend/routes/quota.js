/**
 * 流量配额管理API路由
 */

const express = require('express');
const router = express.Router();
const quotaManagementService = require('../services/quotaManagementService');
const { quotaEnforcementService } = require('../services/quotaEnforcementService');
const { auth: authenticateToken, adminAuth: requireAdmin } = require('../middleware/auth');
const { User } = require('../models');

/**
 * 获取所有用户的配额状态
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const quotaStatuses = await quotaManagementService.checkAllUsersQuotaStatus();

    res.json({
      ok: true,
      data: quotaStatuses,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取配额状态失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取指定用户的配额状态
 */
router.get('/status/:userId', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid user ID'
      });
    }

    const quotaStatus = await quotaManagementService.checkUserQuotaStatus(userId);

    res.json({
      ok: true,
      data: quotaStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取用户配额状态失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 手动触发配额检查
 */
router.post('/check', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (userId) {
      const quotaStatus = await quotaManagementService.triggerQuotaCheck(parseInt(userId));
      res.json({
        ok: true,
        message: `用户 ${userId} 配额检查完成`,
        data: quotaStatus
      });
    } else {
      await quotaManagementService.triggerQuotaCheck();
      res.json({
        ok: true,
        message: '所有用户配额检查完成'
      });
    }
  } catch (error) {
    console.error('❌ 手动配额检查失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 重置用户流量配额
 */
router.post('/reset/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { reason } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid user ID'
      });
    }

    await quotaManagementService.resetUserQuota(userId, reason || 'Admin reset');

    res.json({
      ok: true,
      message: `用户 ${userId} 流量配额已重置`
    });
  } catch (error) {
    console.error('❌ 重置用户流量配额失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 启动配额监控
 */
router.post('/monitoring/start', authenticateToken, requireAdmin, async (req, res) => {
  try {
    quotaManagementService.startQuotaMonitoring();

    res.json({
      ok: true,
      message: '配额监控已启动'
    });
  } catch (error) {
    console.error('❌ 启动配额监控失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 停止配额监控
 */
router.post('/monitoring/stop', authenticateToken, requireAdmin, async (req, res) => {
  try {
    quotaManagementService.stopQuotaMonitoring();

    res.json({
      ok: true,
      message: '配额监控已停止'
    });
  } catch (error) {
    console.error('❌ 停止配额监控失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取配额管理统计信息
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = quotaManagementService.getQuotaStats();

    res.json({
      ok: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ 获取配额管理统计失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取所有用户的配额状态概览（管理员权限）
 */
router.get('/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const overview = await quotaManagementService.getAllUsersQuotaStatus();

    res.json({
      ok: true,
      data: overview
    });
  } catch (error) {
    console.error('❌ [配额API] 获取配额概览失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取配额统计信息（管理员权限）
 */
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const statistics = await quotaManagementService.getQuotaStatistics();

    if (!statistics) {
      return res.status(500).json({
        ok: false,
        error: '获取统计信息失败'
      });
    }

    res.json({
      ok: true,
      data: statistics
    });
  } catch (error) {
    console.error('❌ [配额API] 获取配额统计失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取配额强制执行服务状态（管理员权限）
 */
router.get('/enforcement/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const status = quotaEnforcementService.getStatus();

    res.json({
      ok: true,
      data: status
    });
  } catch (error) {
    console.error('❌ [配额API] 获取强制执行状态失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 手动执行配额强制检查（管理员权限）
 */
router.post('/enforcement/check', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await quotaEnforcementService.manualCheck();

    res.json({
      ok: true,
      message: '配额强制检查已执行'
    });
  } catch (error) {
    console.error('❌ [配额API] 手动强制检查失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取配额管理服务统计信息（管理员权限）
 */
router.get('/service/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const quotaStats = quotaManagementService.getQuotaStats();
    const enforcementStatus = quotaEnforcementService.getStatus();

    res.json({
      ok: true,
      data: {
        quotaManagement: quotaStats,
        quotaEnforcement: enforcementStatus
      }
    });
  } catch (error) {
    console.error('❌ [配额API] 获取服务统计失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
