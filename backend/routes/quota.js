/**
 * 流量配额管理API路由
 */

const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const { handleApiError } = require('../utils/errorHandler');
const { defaultLogger: logger } = require('../utils/logger');
const quotaManagementService = require('../services/quotaManagementService');
const { quotaEnforcementService } = require('../services/quotaEnforcementService');
const { User } = require('../models');

/**
 * 获取所有用户的配额状态
 */
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await quotaManagementService.getUserQuotaStatus(userId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    handleApiError('获取用户配额状态', error, res);
  }
});

/**
 * 获取指定用户的配额状态
 */
router.get('/status/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 非管理员只能查看自己的配额
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: '没有权限查看其他用户的配额状态'
      });
    }
    
    const status = await quotaManagementService.getUserQuotaStatus(userId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    handleApiError('获取指定用户配额状态', error, res);
  }
});

/**
 * 手动触发配额检查
 */
router.post('/check', auth, adminAuth, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少用户ID'
      });
    }
    
    const status = await quotaManagementService.checkUserQuotaStatus(userId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    handleApiError('检查用户配额状态', error, res);
  }
});

/**
 * 重置用户流量配额
 */
router.post('/reset/:userId', auth, adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少用户ID'
      });
    }
    
    const result = await quotaManagementService.resetUserTraffic(userId);
    
    res.json({
      success: true,
      data: result,
      message: `用户 ${userId} 的流量已重置`
    });
  } catch (error) {
    handleApiError('重置用户流量', error, res);
  }
});

/**
 * 启动配额监控
 */
router.post('/monitoring/start', auth, adminAuth, async (req, res) => {
  try {
    quotaManagementService.startQuotaMonitoring();
    
    res.json({
      success: true,
      message: '配额监控已启动'
    });
  } catch (error) {
    handleApiError('启动配额监控', error, res);
  }
});

/**
 * 停止配额监控
 */
router.post('/monitoring/stop', auth, adminAuth, async (req, res) => {
  try {
    quotaManagementService.stopQuotaMonitoring();
    
    res.json({
      success: true,
      message: '配额监控已停止'
    });
  } catch (error) {
    handleApiError('停止配额监控', error, res);
  }
});

/**
 * 获取配额管理统计信息
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await quotaManagementService.getUserQuotaStats(userId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    handleApiError('获取配额统计', error, res);
  }
});

/**
 * 获取所有用户的配额状态概览（管理员权限）
 */
router.get('/overview', auth, adminAuth, async (req, res) => {
  try {
    const overview = await quotaManagementService.getQuotaOverview();
    
    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    handleApiError('获取配额概览', error, res);
  }
});

/**
 * 获取配额统计信息（管理员权限）
 */
router.get('/statistics', auth, adminAuth, async (req, res) => {
  try {
    const statistics = await quotaManagementService.getQuotaStatistics();
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    handleApiError('获取配额统计', error, res);
  }
});

/**
 * 获取超额用户列表（管理员专用）
 */
router.get('/exceeded-users', auth, adminAuth, async (req, res) => {
  try {
    const exceededUsers = await quotaManagementService.getExceededUsers();
    
    res.json({
      success: true,
      data: exceededUsers
    });
  } catch (error) {
    handleApiError('获取超额用户列表', error, res);
  }
});

/**
 * 获取配额强制执行服务状态（管理员权限）
 */
router.get('/enforcement/status', auth, adminAuth, async (req, res) => {
  try {
    const status = quotaEnforcementService.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    handleApiError('获取配额强制执行状态', error, res);
  }
});

/**
 * 手动执行配额强制检查（管理员权限）
 */
router.post('/enforcement/check', auth, adminAuth, async (req, res) => {
  try {
    const result = await quotaEnforcementService.checkAndEnforce();
    
    res.json({
      success: true,
      data: result,
      message: '配额检查和强制执行已完成'
    });
  } catch (error) {
    handleApiError('检查并执行配额限制', error, res);
  }
});

/**
 * 获取配额管理服务统计信息（管理员权限）
 */
router.get('/service/stats', auth, adminAuth, async (req, res) => {
  try {
    const stats = quotaManagementService.getServiceStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    handleApiError('获取配额服务状态', error, res);
  }
});

module.exports = router;
