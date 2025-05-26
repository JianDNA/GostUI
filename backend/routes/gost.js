const express = require('express');
const router = express.Router();
const gostService = require('../services/gostService');
const fs = require('fs');
const path = require('path');

/**
 * 获取 Go-Gost 运行状态，包含详细信息
 */
router.get('/status', (req, res) => {
  try {
    const status = gostService.getStatus();
    const configPath = path.join(__dirname, '../config/gost-config.json');
    let configExists = false;
    let config = null;

    if (fs.existsSync(configPath)) {
      configExists = true;
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    const executablePath = path.join(__dirname, '../bin/gost' + (process.platform === 'win32' ? '.exe' : ''));
    const executableExists = fs.existsSync(executablePath);

    res.json({
      success: true,
      data: {
        ...status,
        executablePath,
        executableExists,
        configPath,
        configExists,
        config
      }
    });
  } catch (error) {
    console.error('获取状态详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取状态失败',
      error: error.message
    });
  }
});

/**
 * 获取当前配置
 */
router.get('/config', (req, res) => {
  try {
    const configPath = path.join(__dirname, '../config/gost-config.json');
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: true,
        data: gostService.defaultConfig
      });
    }

    // 读取配置
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取配置失败',
      error: error.message
    });
  }
});

/**
 * 更新配置
 */
router.post('/config', async (req, res) => {
  try {
    const newConfig = req.body;
    await gostService.updateConfig(newConfig);
    res.json({
      success: true,
      message: '配置已更新并重启服务'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '更新配置失败',
      error: error.message
    });
  }
});

/**
 * 启动服务 - 增强版
 */
router.post('/start', async (req, res) => {
  try {
    console.log('收到启动 Go-Gost 服务请求');

    // 先检查可执行文件
    await gostService.ensureExecutable();
    console.log('Go-Gost 可执行文件已确认');

    // 关闭现有进程
    await gostService.killExistingProcess();
    console.log('已清理现有 Go-Gost 进程');

    // 读取配置获取转发端口
    let forwardPort = 6443; // 默认端口
    try {
      const configPath = path.join(__dirname, '../config/gost-config.json');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        if (config.services && config.services.length > 0) {
          const addrStr = config.services[0].addr;
          const port = parseInt(addrStr.replace(':', ''), 10);
          if (!isNaN(port)) {
            forwardPort = port;
          }
        }
      }
    } catch (err) {
      console.warn('读取配置文件失败，将使用默认端口:', err);
    }

    // 确保端口可用
    console.log(`检查并确保端口 ${forwardPort} 可用`);
    try {
      await gostService.preparePort(forwardPort);
      console.log(`端口 ${forwardPort} 已准备就绪`);
    } catch (err) {
      console.warn(`无法准备端口 ${forwardPort}，将自动寻找其他可用端口:`, err.message);
    }

    // 启动服务
    const result = await gostService.startWithConfig();

    if (result) {
      const status = gostService.getStatus();
      console.log('Go-Gost 服务启动成功', status);

      // 重新读取当前使用的端口
      let currentPort = null;
      try {
        const configContent = fs.readFileSync(path.join(__dirname, '../config/gost-config.json'), 'utf8');
        const config = JSON.parse(configContent);
        if (config.services && config.services.length > 0) {
          const addrStr = config.services[0].addr;
          currentPort = parseInt(addrStr.replace(':', ''), 10);
        }
      } catch (err) {
        console.warn('读取当前配置端口失败:', err);
      }

      res.json({
        success: true,
        message: 'Go-Gost 服务已启动',
        data: {
          ...status,
          port: currentPort || forwardPort
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: '启动服务失败，无法获取进程ID'
      });
    }
  } catch (error) {
    console.error('启动服务失败:', error);
    res.status(500).json({
      success: false,
      message: '启动服务失败',
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * 停止服务
 */
router.post('/stop', (req, res) => {
  try {
    gostService.stop();
    res.json({
      success: true,
      message: 'Go-Gost 服务已停止'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '停止服务失败',
      error: error.message
    });
  }
});

/**
 * 重启服务 - 增强版
 */
router.post('/restart', async (req, res) => {
  try {
    console.log('收到重启 Go-Gost 服务请求');

    // 停止服务
    gostService.stop();
    console.log('Go-Gost 服务已停止');

    // 关闭现有进程
    await gostService.killExistingProcess();
    console.log('已清理现有 Go-Gost 进程');

    // 重新启动服务
    await gostService.startWithConfig();

    const status = gostService.getStatus();
    console.log('Go-Gost 服务已重启', status);

    res.json({
      success: true,
      message: 'Go-Gost 服务已重启',
      data: status
    });
  } catch (error) {
    console.error('重启服务失败:', error);
    res.status(500).json({
      success: false,
      message: '重启服务失败',
      error: error.message
    });
  }
});

module.exports = router;
