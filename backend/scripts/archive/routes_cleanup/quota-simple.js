/**
 * 简化的流量配额管理API路由（用于测试）
 */

const express = require('express');
const router = express.Router();
const quotaManagementService = require('../services/quotaManagementService');
const quotaEventService = require('../services/quotaEventService'); // Phase 3: 事件服务

/**
 * 获取所有用户的配额状态
 */
router.get('/status', async (req, res) => {
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
router.get('/status/:userId', async (req, res) => {
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
router.post('/check', async (req, res) => {
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
router.post('/reset/:userId', async (req, res) => {
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
 * 获取配额管理统计信息
 */
router.get('/stats', async (req, res) => {
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
 * 获取配额事件
 */
router.get('/events', async (req, res) => {
  try {
    const { userId, type, limit = 50 } = req.query;

    let events;
    if (userId) {
      events = quotaEventService.getUserEvents(parseInt(userId), parseInt(limit));
    } else {
      events = quotaEventService.getAllEvents(parseInt(limit), type);
    }

    res.json({
      ok: true,
      data: events,
      count: events.length
    });
  } catch (error) {
    console.error('❌ 获取配额事件失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取配额告警事件
 */
router.get('/alerts', async (req, res) => {
  try {
    const { alertLevel, limit = 50 } = req.query;

    const alerts = quotaEventService.getAlertEvents(alertLevel, parseInt(limit));

    res.json({
      ok: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    console.error('❌ 获取配额告警失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * 获取事件统计信息
 */
router.get('/events/stats', async (req, res) => {
  try {
    const stats = quotaEventService.getEventStats();

    res.json({
      ok: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ 获取事件统计失败:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
