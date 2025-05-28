const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { User, ForwardRule } = require('../models');
const { Op } = require('sequelize');

// 获取流量统计数据
router.get('/stats', auth, async (req, res) => {
  try {
    const { userId, period } = req.query;
    
    // 查询活跃用户数量（isActive为true的用户）
    const activeUsersCount = await User.count({
      where: {
        isActive: true
      }
    });
    
    // 查询活跃规则数量（isActive为true的规则）
    const activeRulesCount = await ForwardRule.count({
      where: {
        isActive: true
      }
    });
    
    // 合并统计数据
    const statsData = {
      totalBytesIn: 1024 * 1024 * 100, // 100MB (模拟数据)
      totalBytesOut: 1024 * 1024 * 150, // 150MB (模拟数据)
      hourlyStats: Array(6).fill(0).map((_, i) => ({
        bytesIn: Math.floor(Math.random() * 1024 * 1024 * 50),
        bytesOut: Math.floor(Math.random() * 1024 * 1024 * 50),
        timestamp: new Date(Date.now() - i * 3600 * 1000)
      })),
      activeUsers: activeUsersCount,
      activeRules: activeRulesCount
    };

    res.json(statsData);
  } catch (error) {
    console.error('Get traffic stats error:', error);
    res.status(500).json({ message: '获取流量统计失败' });
  }
});

module.exports = router; 