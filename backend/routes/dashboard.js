/**
 * 仪表盘数据 API
 * 
 * 功能说明:
 * 1. 系统概述统计
 * 2. 流量统计数据
 * 3. 用户状态分布
 * 4. 实时监控数据
 */

const express = require('express');
const router = express.Router();
const { models } = require('../services/dbService');
const { User, UserForwardRule, TrafficHourly, SpeedMinutely } = models;
const timeSeriesService = require('../services/timeSeriesService');
const multiInstanceCacheService = require('../services/multiInstanceCacheService');
const { Op } = require('sequelize');

/**
 * 获取仪表盘概览数据
 */
router.get('/overview', async (req, res) => {
  try {
    console.log('📊 获取仪表盘概览数据...');

    // 1. 用户统计 - 使用简单查询避免复杂聚合
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { isActive: true } });
    const adminUsers = await User.count({ where: { role: 'admin' } });
    const quotaExceededUsers = await User.count({ where: { userStatus: 'quota_exceeded' } });

    // 2. 转发规则统计 - 使用简单查询
    const totalRules = await UserForwardRule.count();
    const activePorts = await UserForwardRule.count({
      distinct: true,
      col: 'sourcePort'
    });

    // 3. 流量统计 - 简化查询
    let totalTraffic24h = 0;
    let activeUsers24h = 0;
    let totalUsedTraffic = 0;
    let totalQuota = 0;

    try {
      // 获取用户总流量
      const users = await User.findAll({
        attributes: ['usedTraffic', 'trafficQuota']
      });

      totalUsedTraffic = users.reduce((sum, user) => sum + (user.usedTraffic || 0), 0);
      totalQuota = users.reduce((sum, user) => sum + (user.trafficQuota || 0), 0);

      // 尝试获取24小时流量统计
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (TrafficHourly) {
        const recentTraffic = await TrafficHourly.findAll({
          where: {
            recordTime: {
              [Op.gte]: last24Hours
            }
          },
          attributes: ['totalBytes', 'userId']
        });

        totalTraffic24h = recentTraffic.reduce((sum, record) => sum + (record.totalBytes || 0), 0);
        activeUsers24h = new Set(recentTraffic.map(r => r.userId)).size;
      }
    } catch (error) {
      console.warn('⚠️ 获取流量统计时出错:', error.message);
    }

    // 4. 系统状态
    const systemStatus = {
      gostStatus: 'running', // 这里可以检查 GOST 进程状态
      cacheStatus: 'multi-instance', // 多实例缓存
      databaseStatus: 'connected'
    };

    // 5. 格式化数据
    const overview = {
      users: {
        total: totalUsers || 0,
        active: activeUsers || 0,
        admin: adminUsers || 0,
        quotaExceeded: quotaExceededUsers || 0
      },
      rules: {
        total: totalRules || 0,
        activePorts: activePorts || 0
      },
      traffic: {
        total24h: totalTraffic24h || 0,
        totalUsed: totalUsedTraffic || 0,
        totalQuota: totalQuota || 0,
        activeUsers24h: activeUsers24h || 0
      },
      system: systemStatus
    };

    console.log('✅ 仪表盘概览数据获取成功');
    res.json({
      success: true,
      data: overview
    });

  } catch (error) {
    console.error('❌ 获取仪表盘概览数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取流量趋势数据 (最近7天)
 */
router.get('/traffic-trend', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    console.log(`📈 获取最近 ${days} 天的流量趋势数据...`);

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const trendData = await TrafficHourly.findAll({
      where: {
        recordTime: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        [models.sequelize.fn('DATE', models.sequelize.col('recordTime')), 'date'],
        [models.sequelize.fn('SUM', models.sequelize.col('totalBytes')), 'totalBytes'],
        [models.sequelize.fn('COUNT', models.sequelize.literal('DISTINCT userId')), 'activeUsers']
      ],
      group: [models.sequelize.fn('DATE', models.sequelize.col('recordTime'))],
      order: [[models.sequelize.fn('DATE', models.sequelize.col('recordTime')), 'ASC']]
    });

    const formattedData = trendData.map(item => ({
      date: item.dataValues.date,
      traffic: parseInt(item.dataValues.totalBytes) || 0,
      activeUsers: parseInt(item.dataValues.activeUsers) || 0,
      trafficGB: ((parseInt(item.dataValues.totalBytes) || 0) / (1024 * 1024 * 1024)).toFixed(2)
    }));

    res.json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error('❌ 获取流量趋势数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取用户流量排行 (Top 10)
 */
router.get('/traffic-ranking', async (req, res) => {
  try {
    const { limit = 10, days = 7 } = req.query;
    console.log(`🏆 获取用户流量排行 Top ${limit}...`);

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const ranking = await TrafficHourly.findAll({
      where: {
        recordTime: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        'userId',
        [models.sequelize.fn('SUM', models.sequelize.col('totalBytes')), 'totalBytes']
      ],
      include: [{
        model: User,
        attributes: ['username', 'role', 'trafficQuota', 'usedTraffic'],
        required: true
      }],
      group: ['userId'],
      order: [[models.sequelize.fn('SUM', models.sequelize.col('totalBytes')), 'DESC']],
      limit: parseInt(limit)
    });

    const formattedRanking = ranking.map((item, index) => ({
      rank: index + 1,
      userId: item.userId,
      username: item.User.username,
      role: item.User.role,
      trafficQuota: item.User.trafficQuota,
      usedTraffic: item.User.usedTraffic,
      periodTraffic: parseInt(item.dataValues.totalBytes) || 0,
      trafficGB: ((parseInt(item.dataValues.totalBytes) || 0) / (1024 * 1024 * 1024)).toFixed(2),
      usagePercent: item.User.trafficQuota > 0 
        ? ((item.User.usedTraffic / (item.User.trafficQuota * 1024 * 1024 * 1024)) * 100).toFixed(1)
        : 0
    }));

    res.json({
      success: true,
      data: formattedRanking
    });

  } catch (error) {
    console.error('❌ 获取用户流量排行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取实时系统状态
 */
router.get('/system-status', async (req, res) => {
  try {
    console.log('🔍 获取实时系统状态...');

    // 1. 检查各服务状态
    const gostPluginService = require('../services/gostPluginService');
    const bufferStatus = gostPluginService.getBufferStatus();
    
    // 2. 获取缓存状态
    const cacheStatus = multiInstanceCacheService.getStats();

    // 3. 获取最近的流量活动
    const recentActivity = await TrafficHourly.findAll({
      where: {
        recordTime: {
          [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) // 最近1小时
        }
      },
      include: [{
        model: User,
        attributes: ['username'],
        required: true
      }],
      order: [['recordTime', 'DESC']],
      limit: 10
    });

    const systemStatus = {
      services: {
        gost: 'running',
        cache: 'multi-instance',
        database: 'connected',
        timeSeriesDB: timeSeriesService.isConnected ? 'connected' : 'disconnected'
      },
      performance: {
        bufferStatus,
        cacheStatus
      },
      recentActivity: recentActivity.map(activity => ({
        userId: activity.userId,
        username: activity.User.username,
        port: activity.port,
        traffic: activity.totalBytes,
        time: activity.recordTime
      }))
    };

    res.json({
      success: true,
      data: systemStatus
    });

  } catch (error) {
    console.error('❌ 获取系统状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
