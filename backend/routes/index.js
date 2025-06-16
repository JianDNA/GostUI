const express = require('express');
const router = express.Router();

// 健康检查路由
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '服务正常运行' });
});

// gost 状态路由
router.get('/gost-status', (req, res) => {
  const gostService = require('../services/gostService');
  const status = gostService.getStatus();
  res.json({
    status: 'ok',
    isRunning: status.isRunning,
    pid: status.pid,
    message: status.isRunning ? 'Go-Gost 服务正在运行' : 'Go-Gost 服务未运行'
  });
});

// 测试端口转发 6443->8080
router.get('/test-forward', (req, res) => {
  res.json({
    status: 'ok',
    message: '如果你能看到这条消息，说明通过 6443 端口成功访问了本服务',
    info: '这条消息由 Node.js 服务通过 6443->8080 端口转发提供'
  });
});

module.exports = router; 