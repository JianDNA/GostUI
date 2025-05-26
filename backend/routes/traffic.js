const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

// 获取流量统计数据
router.get('/stats', auth, async (req, res) => {
  try {
    const { userId, period } = req.query;
    
    // 这里添加模拟数据，后续可以替换为真实的数据库查询
    const mockStats = {
      totalBytesIn: 1024 * 1024 * 100, // 100MB
      totalBytesOut: 1024 * 1024 * 150, // 150MB
      hourlyStats: Array(6).fill(0).map((_, i) => ({
        bytesIn: Math.floor(Math.random() * 1024 * 1024 * 50),
        bytesOut: Math.floor(Math.random() * 1024 * 1024 * 50),
        timestamp: new Date(Date.now() - i * 3600 * 1000)
      }))
    };

    res.json(mockStats);
  } catch (error) {
    console.error('Get traffic stats error:', error);
    res.status(500).json({ message: '获取流量统计失败' });
  }
});

module.exports = router; 